import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  isCurrentTaxCalculation,
  isTaxCalculationAbort,
  taxCalculationRequestKey,
  type TaxPlanRequest,
} from "../frontend/src/taxRecalculation";

const baseRequest = (): TaxPlanRequest => ({
  calc: "TAX_PLAN_2025",
  filingStatus: "mfj",
  state: "CA",
  ordinaryIncomeExcludingSocialSecurity: 180000,
  preferredIncome: 24000,
  socialSecurityBenefits: 32000,
  taxExemptInterest: 4000,
  netInvestmentIncome: 28000,
  w2Income: 120000,
  totalIncome: 240000,
  displayIncome: 220000,
  federalDeductionMode: "standard",
  federalAboveLineDeductions: [{ id: 1, amount: 3000, deductionType: "Investment loss (Long Term)" }],
  federalItemizedDeductions: [{ id: 2, amount: 18000, deductionType: "Mortgage interest" }],
  stateGrossIncome: 196000,
  stateDeductionMode: "itemized",
  stateStandardDeduction: 11000,
  stateItemizedDeductions: [{ id: 3, amount: 18000, deductionType: "Mortgage interest" }],
  local: {
    enabled: true,
    localityId: "custom",
    residency: "resident",
    customRate: 0.01,
    customNonresidentRate: 0.008,
    taxableBaseAmounts: { wages: 120000, dividends: 24000 },
    customTaxableBase: { wages: true, dividends: true },
  },
});

describe("tax recalculation coordination", () => {
  test("the frontend runs both tax views through one abortable latest-request cycle", () => {
    const appSource = readFileSync("frontend/src/App.tsx", "utf8");

    expect(appSource).toContain("const currentTaxPlanRequestKey = taxCalculationRequestKey(taxPlanRequest)");
    expect(appSource).toContain("const currentTaxPlanWithoutInvestmentsRequestKey = taxCalculationRequestKey(taxPlanWithoutInvestmentsRequest)");
    expect(appSource).toContain("const controller = new AbortController()");
    expect(appSource).toContain("await Promise.allSettled([");
    expect(appSource).toContain("isCurrentTaxCalculation(requestId, taxCalculationRequestRef.current, controller.signal.aborted)");
    expect(appSource).toContain("controller.abort()");
  });

  test("every backend tax input changes the calculation request key", () => {
    const mutations: Array<[string, (request: TaxPlanRequest) => void]> = [
      ["filing status", (request) => { request.filingStatus = "single"; }],
      ["state", (request) => { request.state = "NY"; }],
      ["ordinary income", (request) => { request.ordinaryIncomeExcludingSocialSecurity += 1; }],
      ["preferred income", (request) => { request.preferredIncome += 1; }],
      ["Social Security", (request) => { request.socialSecurityBenefits += 1; }],
      ["tax-exempt interest", (request) => { request.taxExemptInterest += 1; }],
      ["NIIT income", (request) => { request.netInvestmentIncome += 1; }],
      ["W-2 income", (request) => { request.w2Income += 1; }],
      ["total income", (request) => { request.totalIncome += 1; }],
      ["after-tax display income", (request) => { request.displayIncome += 1; }],
      ["federal deduction method", (request) => { request.federalDeductionMode = "itemized"; }],
      ["above-line deductions", (request) => { request.federalAboveLineDeductions = [{ id: 1, amount: 3001 }]; }],
      ["federal itemized deductions", (request) => { request.federalItemizedDeductions = [{ id: 2, amount: 18001 }]; }],
      ["state gross income", (request) => { request.stateGrossIncome += 1; }],
      ["state deduction method", (request) => { request.stateDeductionMode = "standard"; }],
      ["state standard deduction", (request) => { request.stateStandardDeduction += 1; }],
      ["state itemized deductions", (request) => { request.stateItemizedDeductions = [{ id: 3, amount: 18001 }]; }],
      ["local enabled", (request) => { request.local.enabled = false; }],
      ["locality", (request) => { request.local.localityId = "none"; }],
      ["local residency", (request) => { request.local.residency = "nonresident"; }],
      ["local resident rate", (request) => { request.local.customRate += 0.001; }],
      ["local nonresident rate", (request) => { request.local.customNonresidentRate += 0.001; }],
      ["local income amounts", (request) => { request.local.taxableBaseAmounts.wages += 1; }],
      ["local included income types", (request) => { request.local.customTaxableBase.dividends = false; }],
    ];
    const originalKey = taxCalculationRequestKey(baseRequest());

    for (const [label, mutate] of mutations) {
      const request = structuredClone(baseRequest());
      mutate(request);
      expect(taxCalculationRequestKey(request), label).not.toBe(originalKey);
    }
  });

  test("only the latest non-aborted calculation may update the UI", () => {
    expect(isCurrentTaxCalculation(4, 5)).toBe(false);
    expect(isCurrentTaxCalculation(5, 5)).toBe(true);
    expect(isCurrentTaxCalculation(5, 5, true)).toBe(false);
  });

  test("recognizes aborted requests without surfacing a tax error", () => {
    expect(isTaxCalculationAbort(new DOMException("Superseded", "AbortError"))).toBe(true);
    expect(isTaxCalculationAbort(new Error("Backend failed"))).toBe(false);
  });
});
