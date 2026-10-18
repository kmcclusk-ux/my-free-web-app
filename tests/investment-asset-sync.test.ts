import { describe, expect, test } from "vitest";
import { synchronizeDuplicateAssetDividends, synchronizeInvestmentWhatIfDividends } from "../frontend/src/investmentAssetSync";

describe("asset dividend synchronization", () => {
  test("updates every duplicate asset definition for the edited symbol", () => {
    const assets = [
      { id: 1, symbol: "FBTC", percentReturn: 0.01 },
      { id: 2, symbol: " fbtc ", percentReturn: 0.02 },
      { id: 3, symbol: "BIL", percentReturn: 0.04 },
    ];

    expect(synchronizeDuplicateAssetDividends(assets, 1, 0.035)).toEqual([
      { id: 1, symbol: "FBTC", percentReturn: 0.035 },
      { id: 2, symbol: " fbtc ", percentReturn: 0.035 },
      { id: 3, symbol: "BIL", percentReturn: 0.04 },
    ]);
  });

  test("updates every WhatIf row linked to the edited asset", () => {
    const investments = [
      { id: 10, newSymbol: "BIL", newPercent: 0.04 },
      { id: 11, newSymbol: " bil ", newPercent: 0.045 },
      { id: 12, newSymbol: "FLOT", newPercent: 0.05 },
    ];

    expect(synchronizeInvestmentWhatIfDividends(investments, "BIL", 0.036)).toEqual([
      { id: 10, newSymbol: "BIL", newPercent: 0.036 },
      { id: 11, newSymbol: " bil ", newPercent: 0.036 },
      { id: 12, newSymbol: "FLOT", newPercent: 0.05 },
    ]);
  });

  test("does not change unrelated investments or unknown asset rows", () => {
    const assets = [{ id: 1, symbol: "BIL", percentReturn: 0.04 }];
    const investments = [{ id: 10, newSymbol: "FLOT", newPercent: 0.05 }];

    expect(synchronizeDuplicateAssetDividends(assets, 99, 0.03)).toBe(assets);
    expect(synchronizeInvestmentWhatIfDividends(investments, "", 0.03)).toBe(investments);
    expect(synchronizeInvestmentWhatIfDividends(investments, "BIL", 0.03)).toEqual(investments);
  });
});
