import { describe, expect, test } from "vitest";
import { calculateFederalTax2025, calculateLocalTax2025, calculateTaxPlan2025, calculateW2PayrollTax, stateTax2025 } from "../amplify/backend/function/helloWorld/src/taxCalcs";

describe("independent 2025 tax audit regressions", () => {
  test("Ohio IT 1040 instructions: Mitchell's $68,050 scenario is $1,497", () => {
    expect(stateTax2025(68_050, "OH", "single").tax).toBeCloseTo(1_497, 2);
    expect(stateTax2025(26_050, "OH", "single").tax).toBe(0);
    expect(stateTax2025(100_001, "OH", "single").tax).toBeCloseTo(2_394.35125, 5);
  });

  test("Maryland 2025 legislation adds the 6.25% and 6.5% brackets", () => {
    expect(stateTax2025(500_100, "MD", "single").tax - stateTax2025(500_000, "MD", "single").tax).toBeCloseTo(6.25, 8);
    expect(stateTax2025(1_000_100, "MD", "single").tax - stateTax2025(1_000_000, "MD", "single").tax).toBeCloseTo(6.5, 8);
    expect(stateTax2025(600_100, "MD", "hoh").tax).toBe(stateTax2025(600_100, "MD", "mfj").tax);
  });

  test("2025 flat state schedules use the published rates", () => {
    expect(stateTax2025(100_000, "GA", "single").tax).toBe(5_190);
    expect(stateTax2025(100_000, "ID", "single").tax).toBe(5_300);
    expect(stateTax2025(100_000, "ID", "mfj").tax).toBe(5_300);
    expect(stateTax2025(100_000, "UT", "single").tax).toBe(4_500);
    expect(stateTax2025(100_000, "SC", "single").tax).toBe(5_358.3);
  });

  test.each([
    ["WA", 100_000, 1_237.984],
    ["ME", 100_000, 500],
    ["RI", 100_000, 1_159.6],
    ["OR", 100_000, 700],
  ])("%s employee payroll uses published 2025 rates", (state, wages, expected) => {
    expect(calculateW2PayrollTax(Number(wages), "single", String(state)).state.total).toBeCloseTo(Number(expected), 5);
  });

  test("Hawaii temporary-disability withholding respects the 2025 weekly maximum", () => {
    expect(calculateW2PayrollTax(100_000, "single", "HI").state.total).toBeCloseTo(374.92, 2);
  });

  test("non-finite wages cannot poison an entire calculation", () => {
    expect(calculateW2PayrollTax(Infinity, "single", "CA").total).toBe(0);
  });

  test("NYC nonresidents owe no city personal income tax", () => {
    const result = calculateLocalTax2025({ enabled: true, localityId: "ny-nyc", residency: "nonresident", taxableBaseAmounts: { wages: 200_000 } });
    expect(result.tax).toBe(0);
    expect(result.marginalRate).toBe(0);
    expect(result.baseSelection.wages).toBe(false);
  });

  test.each(["mi-detroit", "mi-grand-rapids", "mi-lansing", "mi-flint"])("%s residents include investment income but nonresidents exclude intangible income", (localityId) => {
    const input = { enabled: true, localityId, taxableBaseAmounts: { dividends: 10_000, interest: 5_000, capitalGains: 5_000 } };
    expect(calculateLocalTax2025(input).taxableIncome).toBe(20_000);
    expect(calculateLocalTax2025({ ...input, residency: "nonresident" }).tax).toBe(0);
  });

  test("local income tax participates in federal itemized SALT and the total reconciles", () => {
    const input = { filingStatus: "single" as const, state: "CA", ordinaryIncomeExcludingSocialSecurity: 150_000, preferredIncome: 0, stateGrossIncome: 150_000, totalIncome: 150_000, displayIncome: 150_000, federalDeductionMode: "itemized" as const, local: { enabled: true, localityId: "custom", customRate: 0.02, customTaxableBase: { wages: true }, taxableBaseAmounts: { wages: 150_000 } } };
    const result = calculateTaxPlan2025(input);
    expect(result.federal.deductions.saltEntered).toBeCloseTo(result.state.incomeTax + 3_000, 8);
    expect(result.totalTax).toBeCloseTo(result.federal.total + result.state.total + result.local.tax, 8);
    const excluded = calculateTaxPlan2025({ ...input, displayIncome: 0 });
    expect(excluded.totalTax).toBe(result.totalTax);
    expect(excluded.afterTaxIncome).toBe(-result.totalTax);
    expect(excluded.excludedIncome).toBe(150_000);
  });

  test("eligible above-line deductions reduce Social Security provisional income", () => {
    const result = calculateFederalTax2025({ filingStatus: "single", ordinaryIncomeExcludingSocialSecurity: 25_000, preferredIncome: 0, socialSecurityBenefits: 10_000, aboveLineDeductions: [{ amount: 1_000, deductionType: "HSA contribution" }] });
    expect(result.taxableSocialSecurity).toBe(2_000);
    expect(result.adjustedGrossIncome).toBe(26_000);
  });

  test("preferential worksheet ceiling reconciles with the displayed tax components", () => {
    const result = calculateFederalTax2025({ filingStatus: "single", ordinaryIncomeExcludingSocialSecurity: 64_100, preferredIncome: 125 });
    expect(result.ordinaryTax + result.prefTax + result.niit).toBeCloseTo(result.incomeTax, 8);
  });

  test("capital losses do not reduce ordinary income when long-term gains absorb them", () => {
    const result = calculateFederalTax2025({
      filingStatus: "mfj",
      ordinaryIncomeExcludingSocialSecurity: 200_000,
      preferredIncome: 50_000,
      longTermCapitalGainIncome: 50_000,
      aboveLineDeductions: [{ amount: 12_000, deductionType: "Investment loss (Long Term)" }],
    });
    expect(result.deductions.capitalLossOffset).toBe(12_000);
    expect(result.deductions.capitalLossDeduction).toBe(0);
    expect(result.adjustedGrossIncome).toBe(238_000);
  });
});
