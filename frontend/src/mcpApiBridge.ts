type McpToolResult = { structuredContent?: { status?: unknown; body?: unknown }; isError?: boolean };
type OpenAiBridge = { callTool?: (name: string, args: Record<string, unknown>) => Promise<McpToolResult> };
let teardown: (() => void) | undefined;

function hostBridge(): OpenAiBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { openai?: OpenAiBridge }).openai;
}

export function isMcpUiHost() {
  return typeof hostBridge()?.callTool === 'function';
}

export function isTrustedMcpNotification(event: MessageEvent) {
  return isMcpUiHost() && event.source === window.parent;
}

function requestUrl(input: RequestInfo | URL) {
  return new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
}

async function requestBody(input: RequestInfo | URL, init?: RequestInit) {
  const raw = typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : null;
  if (raw === null) throw new Error('The model editor requires a JSON request body.');
  if (new TextEncoder().encode(raw).length > 1024 * 1024) throw new Error('The model editor request exceeds 1 MiB.');
  const body: unknown = JSON.parse(raw);
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('calc' in body) || typeof body.calc !== 'string') {
    throw new Error('The model editor requires a calculation or workbook operation.');
  }
  return body as Record<string, unknown>;
}

export function uninstallMcpApiFetchBridge() {
  teardown?.();
  teardown = undefined;
}

export function installMcpApiFetchBridge(endpoint = '/api/hello') {
  if (teardown) return true;
  if (!isMcpUiHost()) return false;
  const expectedUrl = new URL(endpoint, window.location.href);
  const originalFetch = window.fetch;
  const pending = new Set<(reason: Error) => void>();
  const callTool = (body: Record<string, unknown>, signal?: AbortSignal | null) => {
    if (signal?.aborted) return Promise.reject(new DOMException('Request aborted.', 'AbortError'));
    if (pending.size >= 8) return Promise.reject(new Error('Too many pending model editor requests.'));
    const bridge = hostBridge();
    if (!bridge?.callTool) return Promise.reject(new Error('The authenticated model editor bridge is unavailable.'));
    return new Promise<McpToolResult>((resolve, reject) => {
      const finish = () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        pending.delete(fail);
      };
      const fail = (error: Error) => { finish(); reject(error); };
      const abort = () => fail(new DOMException('Request aborted; a dispatched write may still finish. Reload before retrying.', 'AbortError'));
      const timeout = setTimeout(() => fail(new Error('The model editor request timed out. A write may still finish; reload before retrying.')), 20000);
      pending.add(fail);
      signal?.addEventListener('abort', abort, { once: true });
      Promise.resolve().then(() => bridge.callTool!('run_model_surface_api', { body })).then(
        result => { finish(); resolve(result); },
        () => fail(new Error('The model editor request failed. Reload to verify whether changes were saved.')),
      );
    });
  };
  const bridgeFetch: typeof fetch = async (input, init) => {
    const url = requestUrl(input);
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'POST' || url.origin !== expectedUrl.origin || url.pathname !== expectedUrl.pathname || url.search !== expectedUrl.search) {
      return originalFetch.call(window, input, init);
    }
    const result = await callTool(await requestBody(input, init), init?.signal ?? (input instanceof Request ? input.signal : undefined));
    if (!result || result.isError) throw new Error('The model editor rejected the request.');
    const response = result.structuredContent;
    const status = response?.status;
    if (typeof status !== 'number' || !Number.isInteger(status) || status < 200 || status > 599 || !response || !('body' in response)) {
      throw new Error('The model editor returned an invalid response.');
    }
    const serialized = JSON.stringify(response.body);
    if (serialized === undefined || new TextEncoder().encode(serialized).length > 4 * 1024 * 1024) throw new Error('The model editor response exceeds application limits.');
    return new Response([204, 205, 304].includes(status) ? null : serialized, {
      status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  };
  window.fetch = bridgeFetch;
  teardown = () => {
    if (window.fetch === bridgeFetch) window.fetch = originalFetch;
    for (const reject of [...pending]) reject(new Error('The model editor connection was closed.'));
  };
  return true;
}
