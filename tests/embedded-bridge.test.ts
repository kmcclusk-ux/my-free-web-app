import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMcpApiFetchBridge, isMcpUiHost, isTrustedMcpNotification, uninstallMcpApiFetchBridge } from '../frontend/src/mcpApiBridge';

function fakeWindow(callTool?: ReturnType<typeof vi.fn>) {
  const fetch = vi.fn().mockResolvedValue(new Response('{}'));
  const parent = { postMessage: vi.fn() };
  const window = { fetch, parent, location: { href: 'https://aftertaxus.com/app/' }, openai: callTool ? { callTool } : undefined };
  vi.stubGlobal('window', window);
  return { window, fetch, parent };
}

afterEach(() => { uninstallMcpApiFetchBridge(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('embedded model editor trust boundary', () => {
  it('does not trust an arbitrary iframe parent or transmit private payloads to it', () => {
    const { parent, fetch, window } = fakeWindow();
    expect(isMcpUiHost()).toBe(false);
    expect(installMcpApiFetchBridge()).toBe(false);
    expect(isTrustedMcpNotification({ source: parent } as unknown as MessageEvent)).toBe(false);
    expect(window.fetch).toBe(fetch);
    expect(parent.postMessage).not.toHaveBeenCalled();
  });

  it('uses the injected host capability for the exact configured API only', async () => {
    const callTool = vi.fn().mockResolvedValue({ structuredContent: { status: 409, body: { error: 'Conflict' } } });
    const { window, parent, fetch } = fakeWindow(callTool);
    expect(installMcpApiFetchBridge()).toBe(true);
    const response = await window.fetch('/api/hello', { method: 'POST', body: JSON.stringify({ calc: 'WORKBOOK_SAVE', expectedRevision: 2 }) });
    expect(response.status).toBe(409);
    expect(callTool).toHaveBeenCalledWith('run_model_surface_api', { body: { calc: 'WORKBOOK_SAVE', expectedRevision: 2 } });
    expect(parent.postMessage).not.toHaveBeenCalled();
    await window.fetch('https://unrelated.example/api/hello', { method: 'POST', body: '{}' });
    await window.fetch('/other/api/hello', { method: 'POST', body: '{}' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(callTool).toHaveBeenCalledTimes(1);
    uninstallMcpApiFetchBridge();
    expect(window.fetch).toBe(fetch);
  });

  it('rejects malformed responses instead of treating them as HTTP 200', async () => {
    const callTool = vi.fn().mockResolvedValue({ structuredContent: { body: {} } });
    const { window } = fakeWindow(callTool);
    installMcpApiFetchBridge();
    await expect(window.fetch('/api/hello', { method: 'POST', body: '{"calc":"WORKBOOK_GET"}' })).rejects.toThrow('invalid response');
  });

  it('bounds pending calls and times out without retrying mutations', async () => {
    vi.useFakeTimers();
    const callTool = vi.fn(() => new Promise(() => {}));
    const { window } = fakeWindow(callTool);
    installMcpApiFetchBridge();
    const pending = Array.from({ length: 8 }, () => window.fetch('/api/hello', { method: 'POST', body: '{"calc":"WORKBOOK_SAVE"}' }).catch(error => error));
    await Promise.resolve(); await Promise.resolve();
    await expect(window.fetch('/api/hello', { method: 'POST', body: '{"calc":"WORKBOOK_SAVE"}' })).rejects.toThrow('Too many');
    await vi.advanceTimersByTimeAsync(20001);
    expect((await Promise.all(pending)).every(result => result.message.includes('timed out'))).toBe(true);
    expect(callTool).toHaveBeenCalledTimes(8);
  });

  it('does not dispatch an already aborted request', async () => {
    const callTool = vi.fn();
    const { window } = fakeWindow(callTool);
    installMcpApiFetchBridge();
    const controller = new AbortController(); controller.abort();
    await expect(window.fetch('/api/hello', { method: 'POST', body: '{"calc":"WORKBOOK_SAVE"}', signal: controller.signal })).rejects.toThrow('aborted');
    expect(callTool).not.toHaveBeenCalled();
  });
});
