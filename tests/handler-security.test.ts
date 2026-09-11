import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = key.publicKey.export({ format: 'jwk' });
const issuer = 'https://cognito-idp.us-west-2.amazonaws.com/us-west-2_test';
const defaults = { sub: 'alice', iss: issuer, aud: 'test-client', token_use: 'id', exp: 4_000_000_000 };
function jwt(claims: Record<string, unknown> = {}, kid = 'first-key') {
  const prefix = `${Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url')}.${Buffer.from(JSON.stringify({ ...defaults, ...claims })).toString('base64url')}`;
  return `${prefix}.${sign('RSA-SHA256', Buffer.from(prefix), key.privateKey).toString('base64url')}`;
}
function event(body: unknown = { calc: 'WORKBOOK_GET' }, token?: string): APIGatewayProxyEvent {
  return { httpMethod: 'POST', path: '/hello', headers: token ? { authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body), isBase64Encoded: false, requestContext: { identity: {} } } as APIGatewayProxyEvent;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('WORKBOOK_TABLE_NAME', 'test-only');
  vi.stubEnv('COGNITO_USER_POOL_ID', 'us-west-2_test');
  vi.stubEnv('COGNITO_APP_CLIENT_ID', 'test-client');
  vi.stubEnv('COGNITO_REGION', 'us-west-2');
  vi.stubEnv('AWS_REGION', 'us-west-2');
  vi.stubEnv('ALLOW_PUBLIC_PORTFOLIO_ACCESS', 'false');
  vi.stubEnv('PORTFOLIO_SYNC_TOKEN', '');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ keys: [{ ...publicKey, kid: 'first-key' }] })));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function setup() {
  const { WorkbookStore } = await import('../amplify/backend/function/helloWorld/src/workbookStore');
  const get = vi.spyOn(WorkbookStore.prototype, 'getWorkspace').mockImplementation(async workspaceId => ({ workspaceId, revision: 3, updatedAt: null, tabs: {}, settings: {} }));
  const save = vi.spyOn(WorkbookStore.prototype, 'saveWorkspace').mockImplementation(async workspaceId => ({ workspaceId, revision: 4, updatedAt: '2026-09-09T00:00:00Z', savedKeys: [] }));
  const { handler } = await import('../amplify/backend/function/helloWorld/src/index');
  return { handler, get, save, WorkbookStore };
}

describe('Lambda authentication and tenant boundaries', () => {
  it('requires authentication before reading or writing private workbooks', async () => {
    const { handler, get, save } = await setup();
    expect((await handler(event())).statusCode).toBe(401);
    expect((await handler(event({ calc: 'WORKBOOK_SAVE', tabs: {} }))).statusCode).toBe(401);
    expect(get).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });

  it.each([
    [{ token_use: 'refresh', client_id: 'test-client' }, 'Token use'],
    [{ token_use: null, client_id: 'test-client' }, 'Token use'],
    [{ exp: 1 }, 'expired'],
    [{ exp: '4000000000' }, 'expired'],
    [{ nbf: 4_000_000_000 }, 'not yet valid'],
    [{ aud: 'other-client' }, 'audience'],
    [{ iss: 'https://evil.example' }, 'issuer'],
    [{ sub: '' }, 'subject'],
  ])('rejects invalid signed claims %j', async (claims, expected) => {
    const { handler, get } = await setup();
    const response = await handler(event(undefined, jwt(claims)));
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toContain(expected);
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects altered signatures', async () => {
    const { handler, get } = await setup();
    const parts = jwt().split('.'); parts[2] = Buffer.alloc(256).toString('base64url');
    expect((await handler(event(undefined, parts.join('.')))).statusCode).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it('keeps different users in separate partitions even when they change workspace names', async () => {
    const { handler, get, save } = await setup();
    expect((await handler(event(undefined, jwt()))).statusCode).toBe(200);
    expect((await handler(event(undefined, jwt({ sub: 'bob' })))).statusCode).toBe(200);
    expect(get.mock.calls.map(call => call[0])).toEqual(['user#alice#workspace#default', 'user#bob#workspace#default']);
    await handler(event({ calc: 'WORKBOOK_SAVE', workspaceId: 'user#bob#workspace#default', expectedRevision: 3, tabs: {} }, jwt()));
    expect(save.mock.calls[0][0]).toMatch(/^user#alice#workspace#/);
    const rest = event(undefined, jwt({ sub: 'bob' }));
    rest.httpMethod = 'GET'; rest.body = null; rest.path = '/workbook/default';
    expect((await handler(rest)).statusCode).toBe(200);
    expect(get.mock.calls.at(-1)?.[0]).toBe('user#bob#workspace#default');
  });

  it('refreshes a rotated signing key without retaining a stale kid forever', async () => {
    const { handler } = await setup();
    expect((await handler(event(undefined, jwt()))).statusCode).toBe(200);
    vi.mocked(fetch).mockResolvedValue(Response.json({ keys: [{ ...publicKey, kid: 'second-key' }] }));
    expect((await handler(event(undefined, jwt({}, 'second-key')))).statusCode).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('binds MCP credentials to their issued owner/workspace and rejects revocation', async () => {
    const { handler, get, WorkbookStore } = await setup();
    const credential = 'synthetic-mcp-secret';
    const lookup = vi.spyOn(WorkbookStore.prototype, 'getMcpToken').mockResolvedValue({ ownerSub: 'alice', workspaceId: 'issued-workspace' } as never);
    const request = event({ calc: 'WORKBOOK_GET', workspaceId: 'bob' }); request.headers['x-portfolio-mcp-token'] = credential;
    expect((await handler(request)).statusCode).toBe(200);
    expect(lookup).toHaveBeenCalledWith(createHash('sha256').update(credential).digest('hex'));
    expect(get).toHaveBeenCalledWith('user#alice#workspace#issued-workspace');
    lookup.mockResolvedValue({ ownerSub: 'alice', revokedAt: '2026-09-09' } as never);
    expect((await handler(request)).statusCode).toBe(401);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized requests before storage and returns a validation error for unknown states/years', async () => {
    const { handler, get, save } = await setup();
    const oversized = event(); oversized.body = 'x'.repeat(1024 * 1024 + 1);
    expect((await handler(oversized)).statusCode).toBe(413);
    expect((await handler(event({ calc: 'STATE_TAX_2025', state: 'ZZ', taxableIncome: 100000 }))).statusCode).toBe(400);
    expect((await handler(event({ calc: 'FED_PREF_TAX_2024', ordinaryTaxable: 0, prefTaxable: 100000 }))).statusCode).toBe(400);
    expect(get).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });

  it('includes explicit capital-only NIIT through the HTTP tax-plan boundary', async () => {
    const { handler, get, save } = await setup();
    const response = await handler(event({
      calc: 'TAX_PLAN_2025', filingStatus: 'single', state: 'TX',
      ordinaryIncomeExcludingSocialSecurity: 300000, preferredIncome: 0,
      capitalGains: { longTermGains: 50000 },
      stateGrossIncome: 350000,
    }));
    expect(response.statusCode).toBe(200);
    const result = JSON.parse(response.body);
    expect(result.federal.niit).toBe(1900);
    expect(result.federal.niitDetails.source).toBe('capital-only');
    expect(get).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });

  it('preserves final NIIT aggregates and rejects ambiguous modes through HTTP', async () => {
    const { handler } = await setup();
    const input = {
      calc: 'TAX_PLAN_2025', filingStatus: 'single', state: 'TX',
      ordinaryIncomeExcludingSocialSecurity: 300000, preferredIncome: 0,
      capitalGains: { longTermGains: 30000, shortTermLosses: 10000 },
      stateGrossIncome: 320000,
      netInvestmentIncome: 23000, netInvestmentIncomeMode: 'final',
    };
    const response = await handler(event(input));
    expect(response.statusCode).toBe(200);
    const result = JSON.parse(response.body);
    expect(result.federal.niit).toBe(874);
    expect(result.federal.netInvestmentIncome).toBe(23000);
    expect((await handler(event({ ...input, investmentIncome: {} }))).statusCode).toBe(400);
  });
});
