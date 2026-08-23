type McpToolResult = {
  structuredContent?: { status?: unknown; body?: unknown };
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
};

type OpenAiBridge = {
  callTool?: (name: string, args: Record<string, unknown>) => Promise<McpToolResult>;
};

let installed = false;
let nextRequestId = 1;
const pendingRequests = new Map<number, { resolve: (value: McpToolResult) => void; reject: (reason: unknown) => void }>();

function standardMcpRequest(name: string, args: Record<string, unknown>) {
  const id = nextRequestId++;
  window.parent.postMessage({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, "*");
  return new Promise<McpToolResult>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    window.setTimeout(() => {
      const pending = pendingRequests.get(id);
      if (!pending) return;
      pendingRequests.delete(id);
      pending.reject(new Error("The ChatGPT model editor connection timed out."));
    }, 20000);
  });
}

function receiveStandardMcpResponse(event: MessageEvent) {
  if (event.source !== window.parent) return;
  const message = event.data as { jsonrpc?: string; id?: number; result?: McpToolResult; error?: unknown } | null;
  if (!message || message.jsonrpc !== "2.0" || message.id === undefined) return;
  const pending = pendingRequests.get(message.id);
  if (!pending) return;
  pendingRequests.delete(message.id);
  if (message.error) pending.reject(message.error);
  else pending.resolve(message.result || {});
}

async function callFocusedUiApi(body: Record<string, unknown>) {
  const openai = (window as Window & { openai?: OpenAiBridge }).openai;
  const result = openai?.callTool
    ? await openai.callTool("run_model_surface_api", { body })
    : await standardMcpRequest("run_model_surface_api", { body });
  if (result.isError) throw new Error(result.content?.find((item) => item.type === "text")?.text || "Focused model request failed.");
  return result.structuredContent;
}

export function isMcpUiHost() {
  if (typeof window === "undefined") return false;
  const openai = (window as Window & { openai?: OpenAiBridge }).openai;
  return window.parent !== window || Boolean(openai?.callTool);
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return new URL(input, window.location.href);
  if (input instanceof URL) return input;
  return new URL(input.url, window.location.href);
}

async function requestBody(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof init?.body === "string") return JSON.parse(init.body) as Record<string, unknown>;
  if (typeof Request !== "undefined" && input instanceof Request) return JSON.parse(await input.clone().text()) as Record<string, unknown>;
  return null;
}

export function installMcpApiFetchBridge() {
  if (installed || typeof window === "undefined") return installed;
  if (!isMcpUiHost()) return false;

  installed = true;
  const originalFetch = window.fetch.bind(window);
  window.addEventListener("message", receiveStandardMcpResponse);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const method = String(init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "POST" || !url.pathname.endsWith("/api/hello")) return originalFetch(input, init);

    const body = await requestBody(input, init);
    if (!body || typeof body.calc !== "string") return originalFetch(input, init);
    const response = await callFocusedUiApi(body);
    const status = Number(response?.status);
    return new Response(JSON.stringify(response?.body ?? {}), {
      status: Number.isFinite(status) ? status : 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  };
  return true;
}
