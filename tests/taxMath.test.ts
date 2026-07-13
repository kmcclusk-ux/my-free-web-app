import { describe, expect, test } from "vitest";
import {
  calculateW2PayrollTax,
  calculateDisplayedAfterTaxIncome,
  federalCombinedTax2025,
  federalOrdinaryTax2025,
  federalPreferredTax2025,
  getSupportedW2PayrollTaxStateCodes,
  isW2IncomeType,
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

  test("displayed after-tax income subtracts the full tax burden", () => {
    expect(calculateDisplayedAfterTaxIncome(100000, 90000, 70000)).toBe(10000);
  });

  test("excluded-only tax never shields spendable income from total tax", () => {
    expect(calculateDisplayedAfterTaxIncome(100000, 50000, 60000)).toBe(50000);
  });

  test("W2 payroll tax applies FICA caps and additional Medicare threshold", () => {
    const result = calculateW2PayrollTax(300000, "mfj", "CA");
    expect(result.federal.socialSecurity).toBeCloseTo(10918.2, 2);
    expect(result.federal.medicare).toBeCloseTo(4350, 2);
    expect(result.federal.additionalMedicare).toBeCloseTo(450, 2);
    expect(result.state.total).toBeCloseTo(3600, 2);
    expect(result.total).toBeCloseTo(19318.2, 2);
  });

  test("W2 payroll tax has explicit coverage for all states plus DC", () => {
    const supportedCodes = getSupportedW2PayrollTaxStateCodes();
    expect(supportedCodes).toHaveLength(51);
    expect(new Set(supportedCodes).size).toBe(51);
    for (const stateCode of supportedCodes) {
      const result = calculateW2PayrollTax(100000, "single", stateCode);
      expect(result.state.stateCode).toBe(stateCode);
      expect(result.state.total).toBeGreaterThanOrEqual(0);
    }
  });

  test("W2 payroll tax includes state-specific components only where employee withholding applies", () => {
    expect(calculateW2PayrollTax(100000, "single", "TX").state.components).toHaveLength(0);
    expect(calculateW2PayrollTax(100000, "single", "NY").state.components.map((component) => component.label)).toEqual([
      "NY state disability insurance",
      "NY paid family leave",
    ]);
    expect(calculateW2PayrollTax(100000, "single", "HI").state.components[0]?.label).toBe("HI temporary disability insurance employee share");
  });

  test("W2 payroll tax is only selected for W2 income type labels", () => {
    expect(isW2IncomeType("W2 wages")).toBe(true);
    expect(isW2IncomeType("Ordinary dividends")).toBe(false);
    expect(isW2IncomeType("Business income")).toBe(false);
  });
});
