import { describe, expect, test } from "vitest";
import {
  calculateDisplayedAfterTaxIncome,
  federalCombinedTax2025,
  federalOrdinaryTax2025,
  federalPreferredTax2025,
} from "../frontend/src/taxMath";

describe("frontend tax math helpers", () => {
  test("federal ordinary schedules match backend examples", () => {
    expect(federalOrdinaryTax2025(450000, "mfj")).toBe(98126);
    expect(federalOrdinaryTax2025(150000, "single")).toBe(28847);
    expect(federalOrdinaryTax2025(450000, "mfs")).toBe(128531.25);
    expect(federalOrdinaryTax2025(150000, "hoh")).toBe(27108);
  });

  test("preferred income honors 0%, 15%, and 20% thresholds", () => {
    expect(federalPreferredTax2025(50000, 25000, "mfj")).toBe(0);
    expect(federalPreferredTax2025(150000, 25000, "mfj")).toBe(3750);
    expect(federalPreferredTax2025(600050, 10000, "mfj")).toBe(2000);
  });

  test("combined federal helper includes NIIT only on excess MAGI and investment income", () => {
    const result = federalCombinedTax2025({
      ordinaryTaxable: 150000,
      preferredTaxable: 25000,
      filingStatus: "mfj",
      magi: 310000,
      netInvestmentIncome: 50000,
    });
    expect(result.ordinaryTax).toBe(22828);
    expect(result.preferredTax).toBe(3750);
    expect(result.niit).toBe(1900);
    expect(result.tax).toBe(28478);
  });

  test("displayed after-tax income subtracts only tax attributable to displayed income", () => {
    expect(calculateDisplayedAfterTaxIncome(100000, 90000, 70000)).toBe(80000);
  });

  test("displayed after-tax income does not go up when excluded-only tax exceeds total tax", () => {
    expect(calculateDisplayedAfterTaxIncome(100000, 50000, 60000)).toBe(100000);
  });
});
