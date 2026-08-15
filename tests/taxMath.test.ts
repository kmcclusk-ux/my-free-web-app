import { describe, expect, test } from "vitest";
import {
  calculateTaxPlan2025,
  calculateW2PayrollTax,
  getSupportedW2PayrollTaxStateCodes,
} from "../amplify/backend/function/helloWorld/taxCalcs.js";
import { isW2IncomeType } from "../frontend/src/taxMath";

describe("backend payroll and after-tax calculations", () => {
  test("W2 payroll tax applies FICA caps and additional Medicare threshold", () => {
    const result = calculateW2PayrollTax(300000, "mfj", "CA");
    expect(result.federal.socialSecurity).toBeCloseTo(10918.2, 2);
    expect(result.federal.medicare).toBeCloseTo(4350, 2);
    expect(result.federal.additionalMedicare).toBeCloseTo(450, 2);
    expect(result.state.total).toBeCloseTo(3600, 2);
    expect(result.total).toBeCloseTo(19318.2, 2);
  });

  test("430k of California W2 income includes all FICA and SDI in jurisdiction and plan totals", () => {
    const payroll = calculateW2PayrollTax(430000, "mfj", "CA");
    expect(payroll.federal.socialSecurity).toBeCloseTo(10918.2, 2);
    expect(payroll.federal.medicare).toBeCloseTo(6235, 2);
    expect(payroll.federal.additionalMedicare).toBeCloseTo(1620, 2);
    expect(payroll.federal.total).toBeCloseTo(18773.2, 2);
    expect(payroll.state.total).toBeCloseTo(5160, 2);
    expect(payroll.total).toBeCloseTo(23933.2, 2);

    const plan = calculateTaxPlan2025({
      filingStatus: "mfj",
      state: "CA",
      ordinaryIncomeExcludingSocialSecurity: 430000,
      preferredIncome: 0,
      stateGrossIncome: 430000,
      totalIncome: 430000,
      displayIncome: 430000,
      federalDeductionMode: "standard",
      stateDeductionMode: "standard",
      stateStandardDeduction: 11000,
      w2Income: 430000,
    });

    expect(plan.federal.payrollTax).toBeCloseTo(18773.2, 2);
    expect(plan.federal.total).toBeCloseTo(plan.federal.incomeTax + 18773.2, 2);
    expect(plan.state.payrollTax).toBeCloseTo(5160, 2);
    expect(plan.state.total).toBeCloseTo(plan.state.incomeTax + 5160, 2);
    expect(plan.totalTax).toBeCloseTo(plan.federal.total + plan.state.total + plan.local.tax, 2);
    expect(plan.afterTaxIncome).toBeCloseTo(430000 - plan.totalTax, 2);
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

  test("W2 payroll tax includes state-specific employee components only where modeled", () => {
    expect(calculateW2PayrollTax(100000, "single", "TX").state.components).toHaveLength(0);
    expect(calculateW2PayrollTax(100000, "single", "NY").state.components.map((component) => component.label)).toEqual([
      "NY state disability insurance",
      "NY paid family leave",
    ]);
    expect(calculateW2PayrollTax(100000, "single", "HI").state.components[0]?.label).toBe("HI temporary disability insurance employee share");
  });

  test("excluded income remains taxable but is removed only from spendable after-tax income", () => {
    const included = calculateTaxPlan2025({
      filingStatus: "single",
      state: "TX",
      ordinaryIncomeExcludingSocialSecurity: 100000,
      preferredIncome: 0,
      stateGrossIncome: 100000,
      totalIncome: 100000,
      displayIncome: 100000,
      federalDeductionMode: "standard",
      stateDeductionMode: "standard",
      stateStandardDeduction: 0,
      w2Income: 0,
    });
    const excluded = calculateTaxPlan2025({
      filingStatus: "single",
      state: "TX",
      ordinaryIncomeExcludingSocialSecurity: 100000,
      preferredIncome: 0,
      stateGrossIncome: 100000,
      totalIncome: 100000,
      displayIncome: 40000,
      federalDeductionMode: "standard",
      stateDeductionMode: "standard",
      stateStandardDeduction: 0,
      w2Income: 0,
    });

    expect(excluded.totalTax).toBe(included.totalTax);
    expect(excluded.afterTaxIncome).toBe(40000 - excluded.totalTax);
    expect(excluded.excludedIncome).toBe(60000);
  });

  test("W2 labels remain a frontend classification concern, not a tax formula", () => {
    expect(isW2IncomeType("W2 wages")).toBe(true);
    expect(isW2IncomeType("Ordinary dividends")).toBe(false);
  });
});
