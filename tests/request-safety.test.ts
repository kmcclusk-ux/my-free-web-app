import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { analyticsReferrer, analyticsRoute, validateRequestSize, validateRequestStructure } from '../amplify/backend/function/helloWorld/src/requestSafety';

describe('analytics minimization', () => {
  it.each([
    ['/?mcp_token=SECRET&income=500000#code=SECRET', '/'],
    ['https://aftertaxus.com/app/?code=SECRET', '/app/'],
    ['/mcp/v5?mcp_token=SECRET', '/mcp'],
    ['/report/a-private-report?income=500000', '/report'],
    ['/SECRET', '/other'],
    ['javascript:SECRET', '/other'],
    ['/%3Fmcp_token%3DSECRET', '/other'],
  ])('records an allowlisted route for %s', (input, expected) => {
    expect(analyticsRoute(input)).toBe(expected);
  });

  it('retains only the referrer origin and rejects malformed referrers', () => {
    expect(analyticsReferrer('https://user:SECRET@example.com/path?code=SECRET#income=500000')).toBe('https://example.com');
    expect(analyticsReferrer('mcp_token=SECRET')).toBeUndefined();
    expect(analyticsReferrer('data:text/plain,SECRET')).toBeUndefined();
  });

  it('removes sensitive URLs before the browser transmits the event', () => {
    const fetch = vi.fn().mockResolvedValue({});
    const script = readFileSync(new URL('../aftertaxus-aws-static/analytics.js', import.meta.url), 'utf8');
    vm.runInNewContext(script, {
      window: {},
      localStorage: { getItem: () => 'test-visitor' },
      location: { pathname: '/app/', search: '?mcp_token=SECRET&income=500000' },
      document: { title: 'SECRET financial title', referrer: 'https://search.example/query?portfolio=SECRET' },
      navigator: {}, URL, Intl, fetch,
    });
    const sent = fetch.mock.calls[0][1].body;
    expect(sent).not.toContain('SECRET');
    expect(sent).not.toContain('500000');
    expect(JSON.parse(sent)).toMatchObject({ path: '/app/', referrer: 'https://search.example' });
  });
});

describe('request resource bounds', () => {
  it('bounds decoded bytes for UTF8 and base64 bodies', () => {
    validateRequestSize('a'.repeat(1024 * 1024));
    expect(() => validateRequestSize('a'.repeat(1024 * 1024 + 1))).toThrow('1 MiB');
    expect(() => validateRequestSize('é'.repeat(600000))).toThrow('1 MiB');
    expect(() => validateRequestSize(Buffer.alloc(1024 * 1024 + 1).toString('base64'), true)).toThrow('1 MiB');
  });

  it('accepts a typical workbook and rejects excessively deep or broad inputs', () => {
    validateRequestStructure({ tabs: { investments: Array.from({ length: 1000 }, (_, id) => ({ id, amount: 1 })) } });
    let nested: unknown = 0;
    for (let level = 0; level < 18; level++) nested = { nested };
    expect(() => validateRequestStructure(nested)).toThrow('structure');
    expect(() => validateRequestStructure(Array(5001).fill(0))).toThrow('5000');
  });
});
