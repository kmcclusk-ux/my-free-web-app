import { describe, expect, test } from "vitest";
import {
  calculateFederalTax2025,
  calculateTaxPlan2025,
  calculateTaxableSocialSecurity2025,
  federalCapitalLossLimit2025,
  federalSaltCap2025,
  federalStandardDeduction2025,
  fedPrefTax2025,
  fedTax2025Ordinary,
  niitTax,
  type FilingStatus,
} from "../amplify/backend/function/helloWorld/taxCalcs.js";

const ordinarySchedules: Record<FilingStatus, Array<[number, number]>> = {
  single: [[11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24], [250525, 0.32], [626350, 0.35], [Number.POSITIVE_INFINITY, 0.37]],
  mfj: [[23850, 0.10], [96950, 0.12], [206700, 0.22], [394600, 0.24], [501050, 0.32], [751600, 0.35], [Number.POSITIVE_INFINITY, 0.37]],
  mfs: [[11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24], [250525, 0.32], [375800, 0.35], [Number.POSITIVE_INFINITY, 0.37]],
  hoh: [[17000, 0.10], [64850, 0.12], [103350, 0.22], [197300, 0.24], [250500, 0.32], [626350, 0.35], [Number.POSITIVE_INFINITY, 0.37]],
};

const preferentialThresholds: Record<FilingStatus, [number, number]> = {
  single: [48350, 533400],
  mfj: [96700, 600050],
  mfs: [48350, 300000],
  hoh: [64750, 566700],
};

function expectedOrdinaryTax(income: number, schedule: Array<[number, number]>) {
  let tax = 0;
  let previous = 0;
  for (const [maximum, rate] of schedule) {
    tax += Math.max(Math.min(income, maximum) - previous, 0) * rate;
    if (income <= maximum) break;
    previous = maximum;
  }
  return tax;
}

describe("2025 federal backend engine", () => {
  test.each(Object.entries(ordinarySchedules) as Array<[FilingStatus, Array<[number, number]>]>)
  ("%s ordinary brackets match every boundary", (filingStatus, schedule) => {
    const finiteThresholds = schedule.map(([threshold]) => threshold).filter(Number.isFinite);
    for (const income of [0, 1, ...finiteThresholds.flatMap((threshold) => [threshold - 1, threshold, threshold + 1]), 1_000_000]) {
      expect(fedTax2025Ordinary(income, filingStatus)).toBeCloseTo(expectedOrdinaryTax(income, schedule), 8);
    }
  });

  test.each([
    ["single", 15750],
    ["mfj", 31500],
    ["mfs", 15750],
    ["hoh", 23625],
  ] as Array<[FilingStatus, number]>)("%s standard deduction is $%i", (filingStatus, expected) => {
    expect(federalStandardDeduction2025(filingStatus)).toBe(expected);
  });

  test.each(Object.entries(preferentialThresholds) as Array<[FilingStatus, [number, number]]>)
  ("%s preferential brackets honor 0, 15, and 20 percent thresholds", (filingStatus, [zeroMaximum, fifteenMaximum]) => {
    expect(fedPrefTax2025(0, zeroMaximum, filingStatus)).toBe(0);
    expect(fedPrefTax2025(zeroMaximum, 100, filingStatus)).toBeCloseTo(15, 8);
    expect(fedPrefTax2025(fifteenMaximum, 100, filingStatus)).toBeCloseTo(20, 8);
  });

  test.each([
    ["single", 200000],
    ["hoh", 200000],
    ["mfj", 250000],
    ["mfs", 125000],
  ] as Array<[FilingStatus, number]>)("%s NIIT starts above $%i MAGI", (filingStatus, threshold) => {
    expect(niitTax(threshold, 100000, filingStatus)).toBe(0);
    expect(niitTax(threshold + 10000, 100000, filingStatus)).toBe(380);
    expect(niitTax(threshold + 200000, 100000, filingStatus)).toBe(3800);
  });

  test("taxable Social Security follows both provisional-income tiers", () => {
    expect(calculateTaxableSocialSecurity2025(24000, 10000, 0, "single")).toBe(0);
    expect(calculateTaxableSocialSecurity2025(24000, 16000, 0, "single")).toBe(1500);
    expect(calculateTaxableSocialSecurity2025(24000, 10000, 10000, "single")).toBe(3500);
    expect(calculateTaxableSocialSecurity2025(24000, 100000, 0, "single")).toBe(20400);
    expect(calculateTaxableSocialSecurity2025(30000, 25000, 0, "mfj")).toBe(4000);
  });

  test("capital-loss limits differ for MFS", () => {
    expect(federalCapitalLossLimit2025("single")).toBe(3000);
    expect(federalCapitalLossLimit2025("mfj")).toBe(3000);
    expect(federalCapitalLossLimit2025("hoh")).toBe(3000);
    expect(federalCapitalLossLimit2025("mfs")).toBe(1500);
  });

  test("2025 SALT cap phases down and respects statutory floors", () => {
    expect(federalSaltCap2025("mfj", 500000)).toBe(40000);
    expect(federalSaltCap2025("single", 550000)).toBe(25000);
    expect(federalSaltCap2025("hoh", 700000)).toBe(10000);
    expect(federalSaltCap2025("mfs", 250000)).toBe(20000);
    expect(federalSaltCap2025("mfs", 300000)).toBe(5000);
  });

  test("455k of MFJ ordinary income produces federal income tax, not payroll tax alone", () => {
    const result = calculateFederalTax2025({
      filingStatus: "mfj",
      ordinaryIncomeExcludingSocialSecurity: 455000,
      preferredIncome: 0,
      deductionMode: "standard",
      netInvestmentIncome: 0,
    });
    expect(result.adjustedGrossIncome).toBe(455000);
    expect(result.taxableIncome).toBe(423500);
    expect(result.ordinaryTax).toBe(89646);
    expect(result.incomeTax).toBe(89646);
  });

  test("455k of MFJ preferred investment income includes preferential tax and NIIT", () => {
    const result = calculateFederalTax2025({
      filingStatus: "mfj",
      ordinaryIncomeExcludingSocialSecurity: 0,
      preferredIncome: 455000,
      deductionMode: "standard",
      netInvestmentIncome: 455000,
    });
    expect(result.taxableIncome).toBe(423500);
    expect(result.prefTax).toBe(49020);
    expect(result.niitBase).toBe(205000);
    expect(result.niit).toBe(7790);
    expect(result.incomeTax).toBe(56810);
  });

  test("capital loss is above-line and itemized SALT is capped by backend rules", () => {
    const result = calculateFederalTax2025({
      filingStatus: "single",
      ordinaryIncomeExcludingSocialSecurity: 600000,
      preferredIncome: 0,
      deductionMode: "itemized",
      aboveLineDeductions: [{ amount: 10000, deductionType: "Capital loss deduction" }],
      itemizedDeductions: [
        { amount: 20000, deductionType: "Mortgage interest" },
        { amount: 30000, deductionType: "Property tax" },
      ],
      stateIncomeTax: 25000,
    });
    expect(result.deductions.capitalLossDeduction).toBe(3000);
    expect(result.adjustedGrossIncome).toBe(597000);
    expect(result.deductions.saltCap).toBe(10900);
    expect(result.deductions.saltDeduction).toBe(10900);
    expect(result.deductions.itemizedDeduction).toBe(30900);
  });

  test("aggregate tax plan applies federal, state, local, payroll, and excluded-income rules once", () => {
    const result = calculateTaxPlan2025({
      filingStatus: "mfj",
      state: "CA",
      ordinaryIncomeExcludingSocialSecurity: 455000,
      preferredIncome: 0,
      netInvestmentIncome: 0,
      w2Income: 0,
      totalIncome: 455000,
      displayIncome: 400000,
      federalDeductionMode: "standard",
      stateGrossIncome: 455000,
      stateDeductionMode: "standard",
      stateStandardDeduction: 11080,
      local: { enabled: false },
    });
    expect(result.federal.incomeTax).toBe(89646);
    expect(result.federal.payrollTax).toBe(0);
    expect(result.state.incomeTax).toBeGreaterThan(0);
    expect(result.local.tax).toBe(0);
    expect(result.excludedIncome).toBe(55000);
    expect(result.afterTaxIncome).toBe(400000 - result.totalTax);
  });
});
