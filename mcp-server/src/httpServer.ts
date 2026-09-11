import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createPortfolioServer, type PortfolioServerConfig } from './portfolioServer.js';

type HttpOptions = {
  host?: string;
  path?: string;
  accessToken?: string;
  allowedHosts?: string[];
  allowedOrigins?: string[];
  maxSessions?: number;
  sessionTtlMs?: number;
};

function reply(response: ServerResponse, status: number, error: string) {
  if (response.headersSent) { response.end(); return; }
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify({ error }));
}

function bearerMatches(request: IncomingMessage, expected?: string) {
  if (!expected) return true;
  const supplied = Buffer.from(request.headers.authorization?.replace(/^Bearer /i, '') ?? '');
  const secret = Buffer.from(expected);
  return supplied.length === secret.length && timingSafeEqual(supplied, secret);
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1024 * 1024) throw Object.assign(new Error('Request exceeds 1 MiB.'), { status: 413 });
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON request.'), { status: 400 }); }
}

export function createPortfolioHttpServer(config: PortfolioServerConfig, options: HttpOptions = {}) {
  const host = options.host ?? '127.0.0.1';
  const loopback = ['127.0.0.1', '::1', 'localhost'].includes(host);
  if (!loopback && (!options.accessToken || options.accessToken.length < 32)) throw new Error('Network MCP exposure requires a dedicated MCP_ACCESS_TOKEN of at least 32 characters.');
  const allowedHosts = new Set(options.allowedHosts ?? (loopback ? ['127.0.0.1', '[::1]', 'localhost'] : []));
  if (!allowedHosts.size) throw new Error('Network MCP exposure requires MCP_ALLOWED_HOSTS.');
  const maxSessions = options.maxSessions ?? 64;
  const sessionTtlMs = options.sessionTtlMs ?? 10 * 60 * 1000;
  if (!Number.isSafeInteger(maxSessions) || maxSessions < 1 || !Number.isFinite(sessionTtlMs) || sessionTtlMs < 1) throw new Error('Invalid MCP session limits.');
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: ReturnType<typeof createPortfolioServer>; lastActive: number }>();
  const active = new Set<StreamableHTTPServerTransport>();
  const dispose = async (id: string) => {
    const session = sessions.get(id);
    if (!session) return;
    sessions.delete(id);
    active.delete(session.transport);
    await session.server.close();
  };
  const expire = async () => {
    await Promise.all([...sessions].filter(([, session]) => Date.now() - session.lastActive > sessionTtlMs).map(([id]) => dispose(id)));
  };
  const httpServer = createServer(async (request, response) => {
    try {
      const authority = request.headers.host;
      if (!authority || !allowedHosts.has(new URL(`http://${authority}`).hostname)) return reply(response, 403, 'Host is not permitted.');
      const origin = request.headers.origin;
      if (origin && !(options.allowedOrigins ?? [`http://${authority}`, `https://${authority}`]).includes(origin)) return reply(response, 403, 'Origin is not permitted.');
      if (!bearerMatches(request, options.accessToken)) return reply(response, 401, 'MCP authentication required.');
      const url = new URL(request.url ?? '/', `http://${authority}`);
      if (request.method === 'GET' && url.pathname === '/health') {
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ ok: true }));
        return;
      }
      if (url.pathname !== (options.path ?? '/mcp')) return reply(response, 404, 'Not found.');
      if (!['POST', 'GET', 'DELETE'].includes(request.method ?? '')) return reply(response, 405, 'Method not allowed.');
      await expire();
      const sessionId = request.headers['mcp-session-id'];
      if (sessionId && (typeof sessionId !== 'string' || !sessions.has(sessionId))) return reply(response, 404, 'Unknown or expired MCP session.');
      if (Number(request.headers['content-length'] ?? 0) > 1024 * 1024) return reply(response, 413, 'Request exceeds 1 MiB.');
      const body = request.method === 'POST' ? await readJson(request) : undefined;
      if (Array.isArray(body)) return reply(response, 400, 'JSON-RPC batch requests are not supported.');
      let transport: StreamableHTTPServerTransport;
      if (typeof sessionId === 'string') {
        const session = sessions.get(sessionId)!;
        session.lastActive = Date.now();
        transport = session.transport;
      } else {
        if (body?.method !== 'initialize') return reply(response, 400, 'Initialize an MCP session first.');
        if (active.size >= maxSessions) return reply(response, 429, 'MCP session limit reached.');
        const server = createPortfolioServer(config);
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: id => { sessions.set(id, { transport, server, lastActive: Date.now() }); },
        });
        active.add(transport);
        try { await server.connect(transport); }
        catch (error) { active.delete(transport); await transport.close(); throw error; }
        const onclose = transport.onclose;
        transport.onclose = () => { active.delete(transport); if (transport.sessionId) sessions.delete(transport.sessionId); onclose?.(); };
      }
      try { await transport.handleRequest(request, response, body); }
      finally { if (!transport.sessionId) { active.delete(transport); await transport.close(); } }
    } catch (error) {
      const status = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 500;
      reply(response, status, status === 500 ? 'MCP request failed.' : error instanceof Error ? error.message : 'Invalid request.');
    }
  });
  httpServer.requestTimeout = 30000;
  httpServer.headersTimeout = 10000;
  httpServer.maxRequestsPerSocket = 100;
  const timer = setInterval(() => { void expire().catch(() => {}); }, Math.min(sessionTtlMs, 30000));
  timer.unref();
  httpServer.on('close', () => { clearInterval(timer); void Promise.allSettled([...sessions.keys()].map(dispose)); });
  return { httpServer, host };
}
