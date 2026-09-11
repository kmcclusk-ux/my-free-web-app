import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, test, vi } from "vitest";

const source = readFileSync(new URL("../google-sheet/appscript.js", import.meta.url), "utf8");

function exporter(revision = 7) {
  const requests: Record<string, unknown>[] = [];
  const toast = vi.fn();
  const spreadsheet = { getSheetByName: () => null, getSheets: () => [], toast };
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    requests,
    currentRevision: revision,
  };
  runInNewContext(source + `
    callWorkbookApi = function(payload) {
      requests.push(payload);
      return payload.calc === 'WORKBOOK_GET' ? { revision: currentRevision } : { revision: currentRevision + 1 };
    };
    EXPORT_WORKBOOK_TO_DATASTORE();
  `, context);
  return { requests, toast };
}

describe("I03 read-only export and R05 revision propagation", () => {
  test("collects without formula repair or other sheet writes, then saves the revision read", () => {
    const { requests, toast } = exporter();
    expect(requests.map((request) => request.calc)).toEqual(["WORKBOOK_GET", "WORKBOOK_SAVE"]);
    expect(requests[1].expectedRevision).toBe(7);
    expect(toast).toHaveBeenCalledOnce();
  });

  test("propagates the legacy revision zero", () => {
    expect(exporter(0).requests[1].expectedRevision).toBe(0);
  });

  test("does not retry or toast success after a revision conflict", () => {
    const fetch = vi.fn(() => ({ getResponseCode: () => 409, getContentText: () => "conflict" }));
    const sleep = vi.fn();
    expect(() => runInNewContext(source + `WORKBOOK_SAVE('synthetic', {}, {}, 7);`, {
      UrlFetchApp: { fetch }, Utilities: { sleep },
      PropertiesService: { getScriptProperties: () => ({ getProperty: () => "" }) },
    })).toThrow(/HTTP 409/);
    expect(fetch).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  test("write wrappers require an explicitly read nonnegative integer revision", () => {
    for (const value of ["undefined", "-1", "1.5", "'7'"]) {
      expect(() => runInNewContext(source + `WORKBOOK_SAVE('synthetic', {}, {}, ${value});`)).toThrow(/revision/i);
    }
  });
});

describe("spreadsheet preferential-tax API migration", () => {
  test.each([
    ['FED_PREF_TAX_2025_API(100000, 20000, "mfj")', false],
    ['FED_PREF_TAX_2024_API(100000, 20000, "mfj")', true],
    ['FED_TAX_API("FED_PREF_TAX_2025", 100000, 20000, "mfj")', false],
    ['FED_TAX_API("FED_PREF_TAX_2024", 100000, 20000, "mfj")', true],
  ])("routes %s to the supported 2025 endpoint", (expression, deprecated) => {
    const requests: Record<string, unknown>[] = [];
    const log = vi.fn();
    const result = runInNewContext(source + `
      callTaxApi = function(payload) { requests.push(payload); return { tax: 3000 }; };
      ${expression};
    `, { requests, Logger: { log } });
    expect(result).toBe(3000);
    expect(requests).toEqual([{
      calc: 'FED_PREF_TAX_2025', ordinaryTaxable: 100000, prefTaxable: 20000, filingStatus: 'mfj',
    }]);
    expect(log).toHaveBeenCalledTimes(deprecated ? 1 : 0);
  });
});
