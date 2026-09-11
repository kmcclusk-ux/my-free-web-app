import { request, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createPortfolioHttpServer } from '../mcp-server/src/httpServer';

const servers: Server[] = [];
const config = { apiBaseUrl: 'https://portfolio.test/hello', portfolioMcpToken: 'synthetic-only' };
const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
const initBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });

async function start(options: Parameters<typeof createPortfolioHttpServer>[1] = {}) {
  const { httpServer, host } = createPortfolioHttpServer(config, options);
  servers.push(httpServer);
  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('No test listener.');
  return { url: `http://127.0.0.1:${address.port}`, host };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); })));
});

describe('standalone MCP HTTP access boundary', () => {
  it('defaults to loopback and rejects unauthenticated network configuration', async () => {
    expect((await start()).host).toBe('127.0.0.1');
    expect(() => createPortfolioHttpServer(config, { host: '0.0.0.0' })).toThrow('MCP_ACCESS_TOKEN');
    expect(() => createPortfolioHttpServer(config, { host: '0.0.0.0', accessToken: 'x'.repeat(32) })).toThrow('MCP_ALLOWED_HOSTS');
  });

  it('rejects hostile Host/Origin and missing configured credentials before MCP processing', async () => {
    const token = 'test-access-token-with-more-than-32-characters';
    const { url } = await start({ accessToken: token });
    expect((await fetch(`${url}/health`)).status).toBe(401);
    expect((await fetch(`${url}/health`, { headers: { authorization: `Bearer ${token}`, origin: 'https://evil.example' } })).status).toBe(403);
    const rejectedHost = await new Promise<number | undefined>((resolve, reject) => {
      const call = request(`${url}/health`, { headers: { authorization: `Bearer ${token}`, host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
      call.on('error', reject); call.end();
    });
    expect(rejectedHost).toBe(403);
    expect((await fetch(`${url}/health`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);
  });

  it('does not allocate sessions for unknown IDs or non-initialization requests', async () => {
    const { url } = await start({ maxSessions: 1 });
    expect((await fetch(`${url}/mcp`, { method: 'POST', headers: { ...headers, 'mcp-session-id': 'unknown' }, body: initBody })).status).toBe(404);
    expect((await fetch(`${url}/mcp`, { method: 'POST', headers, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' })).status).toBe(400);
    expect((await fetch(`${url}/mcp`, { method: 'POST', headers, body: initBody })).status).toBe(200);
    expect((await fetch(`${url}/mcp`, { method: 'POST', headers, body: initBody })).status).toBe(429);
  });

  it('expires sessions and rejects the old session ID', async () => {
    const { url } = await start({ maxSessions: 1, sessionTtlMs: 30 });
    const initialized = await fetch(`${url}/mcp`, { method: 'POST', headers, body: initBody });
    const session = initialized.headers.get('mcp-session-id')!;
    await initialized.text();
    await new Promise(resolve => setTimeout(resolve, 80));
    expect((await fetch(`${url}/mcp`, { headers: { ...headers, 'mcp-session-id': session } })).status).toBe(404);
    expect((await fetch(`${url}/mcp`, { method: 'POST', headers, body: initBody })).status).toBe(200);
  });

  it('rejects oversized and malformed requests', async () => {
    const { url } = await start();
    expect((await fetch(`${url}/mcp`, { method: 'POST', headers, body: 'x'.repeat(1024 * 1024 + 1) })).status).toBe(413);
    expect((await fetch(`${url}/mcp`, { method: 'POST', headers, body: '[' })).status).toBe(400);
    expect((await fetch(`${url}/mcp`, { method: 'POST', headers, body: '[]' })).status).toBe(400);
  });
});
