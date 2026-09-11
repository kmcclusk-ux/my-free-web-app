import { describe, expect, test } from "vitest";
import { investmentResult, federalStandardDeduction2025 } from "../snapshot-calculator/src/calculation";

describe("snapshot calculator shares tax schedules", () => {
  test("unused federal deductions do not silently shelter state income", () => {
    const result = investmentResult({ amount: 100_000, yieldPercent: 5, taxType: "ordinary" }, 0, "single", "CA", federalStandardDeduction2025("single"));
    expect(result.federalTax).toBe(0);
    expect(result.stateTax).toBe(50);
    const withStateDeduction = investmentResult({ amount: 100_000, yieldPercent: 5, taxType: "ordinary" }, 0, "single", "CA", federalStandardDeduction2025("single"), 5000);
    expect(withStateDeduction.taxCost).toBe(0);
  });
  test("California state marginal tax crosses the real 2025 bracket", () => {
    const result = investmentResult({ amount: 100_000, yieldPercent: 2, taxType: "ordinary" }, 21_158, "mfj", "CA");
    expect(result.stateTax).toBeCloseTo(30, 8);
  });
  test("investment income above the NIIT threshold includes 3.8%", () => {
    const result = investmentResult({ amount: 100_000, yieldPercent: 5, taxType: "treasury" }, 300_000, "mfj", "CA");
    expect(result.niit).toBe(190);
    expect(result.stateTax).toBe(0);
    expect(result.federalTax).toBeCloseTo(1_390, 8);
  });
  test("in-state municipal income is not subjected to ordinary tax or NIIT", () => {
    const result = investmentResult({ amount: 100_000, yieldPercent: 5, taxType: "muni" }, 300_000, "mfj", "CA");
    expect(result.taxCost).toBe(0);
  });
});
