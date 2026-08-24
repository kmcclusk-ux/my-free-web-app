import { describe, expect, it } from "vitest";
import {
  buildInvestmentRowHash,
  buildSelectedInvestmentHashes,
  resolveSelectedInvestmentIds,
} from "../frontend/src/investmentRowIdentity";

const row = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  spreadsheetRowNumber: id + 7,
  description: "Vanguard S&P 500 ETF",
  account: "Brokerage",
  category: "Stocks",
  totalInvestment: 125000,
  yearlyIncome: 2100,
  symbol: "VOO",
  ...overrides,
});

describe("investment row selection identity", () => {
  it("does not use application ids or spreadsheet row numbers in the hash", () => {
    expect(buildInvestmentRowHash(row(1))).toBe(buildInvestmentRowHash(row(91, { spreadsheetRowNumber: 208 })));
  });

  it("restores selected rows after insertion, deletion, reordering, and id changes", () => {
    const originalRows = [row(1), row(2, { description: "Municipal bond", symbol: "MUB" })];
    const hashes = buildSelectedInvestmentHashes(originalRows, [2]);
    const reimportedRows = [
      row(40, { description: "New holding", symbol: "NEW" }),
      row(88, { description: "Municipal bond", symbol: "MUB", spreadsheetRowNumber: 54 }),
      row(41),
    ];
    expect(resolveSelectedInvestmentIds(reimportedRows, hashes)).toEqual([88]);
  });

  it("preserves the selected count for otherwise identical duplicate rows", () => {
    const hashes = buildSelectedInvestmentHashes([row(1), row(2)], [1, 2]);
    expect(resolveSelectedInvestmentIds([row(40), row(41), row(42)], hashes)).toEqual([40, 41]);
  });
});
