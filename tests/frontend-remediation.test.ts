import { describe, expect, test } from "vitest";
import { formatDollarInputValue, toNumber } from "../frontend/src/numericInput";
import {
  accountCashflowInclusion,
  incrementalInvestmentTax,
  investmentAnnualIncome,
  investmentFavoritesError,
  normalizeInvestmentFavorites,
  normalizeTaxWhatIfItems,
  proposedInvestmentRate,
  resolveIncomeMode,
  sumTaxWhatIfItems,
  WorkbookSyncGuard,
} from "../frontend/src/workbookAdapters";
import {
  ASSISTANT_MESSAGE_HISTORY_KEY,
  ASSISTANT_PROMPT_HISTORY_KEY,
  assistantHistoryKey,
  clearAssistantHistoryStorage,
  readAssistantHistory,
  writeAssistantHistory,
} from "../frontend/src/assistantHistoryStorage";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("currency input draft formatting", () => {
  test.each(["", "-", ".", "-.", "0.", "0.00", "-0.00", "1.", "1.20"])("preserves intermediate input %j", (text) => {
    expect(formatDollarInputValue(text)).toBe(text);
  });

  test("adds grouping without rounding away entered decimals", () => {
    expect(formatDollarInputValue("$001234.5600")).toBe("1,234.5600");
    expect(formatDollarInputValue("-1234.50")).toBe("-1,234.50");
    expect(toNumber("-1,234.50")).toBe(-1234.5);
    expect(toNumber("-.")).toBe(0);
    expect(toNumber(Infinity)).toBe(0);
  });
});

describe("investment adapter contracts", () => {
  test("zero principal cannot promote an ETF with stale annual income", () => {
    const mode = resolveIncomeMode({ assetType: "ETF", incomeItem: false });
    expect(mode).toBe("principal-yield");
    expect(investmentAnnualIncome(mode, 0, 0.06, 999)).toBe(0);
    expect(investmentAnnualIncome(mode, 100000, 0.06, 999)).toBe(6000);
  });

  test("explicit annual-income mode and legacy income flags survive zero principal", () => {
    expect(resolveIncomeMode({ incomeItem: true, assetType: "ETF" })).toBe("annual-income");
    expect(resolveIncomeMode({ incomeMode: "principal-yield", incomeItem: true })).toBe("principal-yield");
    expect(resolveIncomeMode({ assetType: "Income" })).toBe("annual-income");
    expect(resolveIncomeMode({ wageAccount: true })).toBe("annual-income");
    expect(investmentAnnualIncome("annual-income", 0, 0, 24000)).toBe(24000);
  });

  test("explicit proposed rates own the override, including zero", () => {
    expect(proposedInvestmentRate(0.09, 0.06)).toBe(0.09);
    expect(proposedInvestmentRate(0, 0.06)).toBe(0);
    expect(proposedInvestmentRate(undefined, 0.06)).toBe(0.06);
    expect(proposedInvestmentRate(null, undefined, 0.03)).toBe(0.03);
    expect(investmentAnnualIncome("principal-yield", 100000, proposedInvestmentRate(0.09, 0.06), 0)).toBe(9000);
  });

  test("explicit empty and zero WhatIf arrays never resurrect legacy scalars", () => {
    expect(normalizeTaxWhatIfItems([], "W2 income", 100000)).toEqual([]);
    expect(sumTaxWhatIfItems([], 100000)).toBe(0);
    const zeroItems = normalizeTaxWhatIfItems([{ id: 7, amount: 0, incomeType: "W2 income" }], "Interest", 100000);
    expect(sumTaxWhatIfItems(zeroItems, 100000)).toBe(0);
    expect(sumTaxWhatIfItems(normalizeTaxWhatIfItems(undefined, "W2 income", 100000))).toBe(100000);
  });

  test("blank WhatIf types stay unclassified and signed amounts do not fall back", () => {
    const blank = normalizeTaxWhatIfItems([{ amount: 100000, incomeType: "" }], "W2 income", 999);
    expect(blank[0].incomeType).toBe("");
    expect(sumTaxWhatIfItems(blank, 999)).toBe(0);
    expect(sumTaxWhatIfItems([{ id: 1, amount: -3000, incomeType: "Long-term capital gain" }], 999)).toBe(-3000);
  });

  test.each([
    [{}, "yes"],
    [{ includeInFreeCashflow: undefined }, "yes"],
    [{ includeInFreeCashflow: false }, "no"],
    [{ include_in_free_cash_flow: "yes" }, "yes"],
    [{ "Exclude from aftertax income": true }, "no"],
    [{ "Exclude from aftertax income": "no" }, "yes"],
    [{ include: false, exclude: true }, "no"],
  ] as const)("normalizes account inclusion %j", (row, expected) => {
    expect(accountCashflowInclusion(row)).toBe(expected);
  });

  test("conflicting inclusion headers are diagnosed, not silently chosen", () => {
    expect(() => accountCashflowInclusion({ include: true, exclude: true })).toThrow("contradictory fields");
    expect(() => accountCashflowInclusion({ include: "maybe" })).toThrow("expected yes/no");
  });

  test("structured favorites and empty selections round-trip unchanged", () => {
    const favorites = [{ name: "Income", investmentKeys: ["rowhash:v1:holding-a"], createdAt: "2026-01-01T00:00:00.000Z" }];
    expect(investmentFavoritesError(favorites)).toBeNull();
    expect(normalizeInvestmentFavorites(JSON.parse(JSON.stringify(favorites)))).toEqual(favorites);
    const emptySelection = [{ ...favorites[0], investmentKeys: [] }];
    expect(normalizeInvestmentFavorites(emptySelection)).toEqual(emptySelection);
    expect(normalizeInvestmentFavorites([])).toEqual([]);
  });

  test("malformed assistant favorites yield field errors before any replacement", () => {
    expect(investmentFavoritesError(["Income"])).toContain("investmentFavorites[0]");
    expect(investmentFavoritesError([{ name: "Income", investmentKeys: [{}] }])).toContain("investmentKeys");
    expect(investmentFavoritesError([{ name: "Income", investmentKeys: [], createdAt: "bad" }])).toContain("createdAt");
  });

  test("incremental tax is signed and requires a successful baseline", () => {
    expect(incrementalInvestmentTax({ totalTax: 900 }, { totalTax: 1000 })).toBe(-100);
    expect(incrementalInvestmentTax({ totalTax: 0 }, { totalTax: 0 })).toBe(0);
    expect(incrementalInvestmentTax({ totalTax: 900 }, null)).toBeNull();
    expect(incrementalInvestmentTax(null, { totalTax: 1000 })).toBeNull();
  });
});

describe("workbook refresh and save generation guards", () => {
  test("a delayed poll cannot replace a local edit, even after it saves", () => {
    const guard = new WorkbookSyncGuard();
    guard.loaded(5);
    const pollGeneration = guard.generation;
    expect(guard.canApplyRemote(pollGeneration)).toBe(true);
    guard.edited();
    expect(guard.canApplyRemote(pollGeneration)).toBe(false);
    guard.saved(6, guard.generation);
    expect(guard.canApplyRemote(pollGeneration)).toBe(false);
    expect(guard.canApplyRemote(guard.generation)).toBe(true);
  });

  test("an earlier successful save advances revision but cannot clear newer edits", () => {
    const guard = new WorkbookSyncGuard();
    guard.loaded(5);
    guard.edited();
    const savedGeneration = guard.generation;
    guard.edited();
    guard.saved(6, savedGeneration);
    expect(guard.revision).toBe(6);
    expect(guard.dirty).toBe(true);
  });

  test("a conflict keeps local dirty state and rejects remote application", () => {
    const guard = new WorkbookSyncGuard();
    guard.loaded(5);
    guard.edited();
    guard.conflict = true;
    expect(guard.canApplyRemote(guard.generation)).toBe(false);
    expect(guard.revision).toBe(5);
    expect(guard.dirty).toBe(true);
  });
});

describe("assistant history privacy", () => {
  test("authenticated users have disjoint history keys", () => {
    const storage = memoryStorage();
    writeAssistantHistory(storage, ASSISTANT_MESSAGE_HISTORY_KEY, "user-a", ["A's private draft"]);
    writeAssistantHistory(storage, ASSISTANT_MESSAGE_HISTORY_KEY, "user-b", ["B's draft"]);
    expect(readAssistantHistory(storage, ASSISTANT_MESSAGE_HISTORY_KEY, "user-a")).toEqual(["A's private draft"]);
    expect(readAssistantHistory(storage, ASSISTANT_MESSAGE_HISTORY_KEY, "user-b")).toEqual(["B's draft"]);
    expect(assistantHistoryKey(ASSISTANT_MESSAGE_HISTORY_KEY, "a:b")).not.toBe(assistantHistoryKey(ASSISTANT_MESSAGE_HISTORY_KEY, "a%3Ab"));
  });

  test("legacy global messages are discarded, never migrated to a user", () => {
    const storage = memoryStorage();
    storage.setItem(ASSISTANT_MESSAGE_HISTORY_KEY, JSON.stringify(["old private message"]));
    storage.setItem(ASSISTANT_PROMPT_HISTORY_KEY, JSON.stringify(["old private prompt"]));
    expect(readAssistantHistory(storage, ASSISTANT_MESSAGE_HISTORY_KEY, "new-user")).toEqual([]);
    clearAssistantHistoryStorage(storage);
    expect(storage.getItem(ASSISTANT_MESSAGE_HISTORY_KEY)).toBeNull();
    expect(storage.getItem(ASSISTANT_PROMPT_HISTORY_KEY)).toBeNull();
  });

  test("anonymous sessions neither persist nor read history", () => {
    const storage = memoryStorage();
    writeAssistantHistory(storage, ASSISTANT_PROMPT_HISTORY_KEY, undefined, ["anonymous"]);
    expect(storage.getItem(ASSISTANT_PROMPT_HISTORY_KEY)).toBeNull();
    expect(readAssistantHistory(storage, ASSISTANT_PROMPT_HISTORY_KEY)).toEqual([]);
  });

  test("logout clears only the current user's scoped data plus legacy keys", () => {
    const storage = memoryStorage();
    for (const key of [ASSISTANT_MESSAGE_HISTORY_KEY, ASSISTANT_PROMPT_HISTORY_KEY]) {
      writeAssistantHistory(storage, key, "user-a", ["private"]);
      writeAssistantHistory(storage, key, "user-b", ["retained"]);
    }
    clearAssistantHistoryStorage(storage, "user-a");
    for (const key of [ASSISTANT_MESSAGE_HISTORY_KEY, ASSISTANT_PROMPT_HISTORY_KEY]) {
      expect(readAssistantHistory(storage, key, "user-a")).toEqual([]);
      expect(readAssistantHistory(storage, key, "user-b")).toEqual(["retained"]);
    }
  });
});
