import { describe, expect, test } from "vitest";
import { accountAllowsCurrentIncome, effectiveInvestmentRate, investmentNetIncome, isFederalTaxExemptInterestTreatment, isNonInvestmentIncomeType, localIncomeCategory, persistInvestmentInputs, whatIfInvestmentIncome } from "../mcp-server/src/portfolioIncome";

describe("portfolio input integrity and tax classification", () => {
  test("a zero-yield proposal remains zero and closing it restores the current yield", () => {
    expect(effectiveInvestmentRate(0.05, 0, true)).toBe(0);
    expect(effectiveInvestmentRate(0.05, 0, false)).toBe(0.05);
  });
  test("saving a proposal preserves original principal and stored income", () => {
    const source = { id: 10, totalInvestment: 100_000, yearlyIncome: 5_000 };
    const saved = persistInvestmentInputs(source, 0);
    expect(saved).toEqual({ ...source, newPercent: 0 });
    expect(source).not.toHaveProperty("newPercent");
  });
  test("deferred distributions are taxable but accruals and tax-free distributions are not", () => {
    expect(accountAllowsCurrentIncome("tax deferred", true)).toBe(true);
    expect(accountAllowsCurrentIncome("tax deferred", false)).toBe(false);
    expect(accountAllowsCurrentIncome("tax free", true)).toBe(false);
  });
  test("deferred accruals are retirement income, while taxable deferred distributions keep their source category", () => {
    const row = { account: "Example IRA", effectiveSymbol: "FUND", investmentType: "", localTaxCategory: "dividends", nonInvestmentIncome: 0, taxStatus: "deferred", taxTreatment: "qualified-div", w2Income: 0 };
    expect(localIncomeCategory({ ...row, incomeItem: false })).toBe("retirementIncome");
    expect(localIncomeCategory({ ...row, incomeItem: true })).toBe("dividends");
  });
  test("NIIT distinguishes investment income from income-item UI controls", () => {
    const rental = { amount: 20_000, currentlyTaxable: true, federalExempt: false, niitIncluded: true, category: "rentalIncome" };
    expect(investmentNetIncome(rental)).toBe(20_000);
    expect(investmentNetIncome({ ...rental, category: "retirementIncome" })).toBe(0);
    expect(investmentNetIncome({ ...rental, currentlyTaxable: false })).toBe(0);
    expect(investmentNetIncome({ ...rental, federalExempt: true })).toBe(0);
    expect(investmentNetIncome({ ...rental, taxDeferredAccount: true })).toBe(0);
  });
  test("extra W2 income does not subtract from existing portfolio NIIT income", () => {
    expect(whatIfInvestmentIncome([{ amount: 100_000, incomeType: "W2 wages" }, { amount: 5_000, incomeType: "Ordinary dividends" }])).toBe(5_000);
  });
  test("WhatIf income types are normalized and invalid amounts are ignored", () => {
    expect(whatIfInvestmentIncome([
      { amount: 2_000, incomeType: "Section 1250 gain" },
      { amount: Number.NaN, incomeType: "Interest" },
      { amount: 3_000, incomeType: undefined },
    ])).toBe(2_000);
  });
  test("tax-exempt interest labels are distinct from return of capital", () => {
    expect(isFederalTaxExemptInterestTreatment("Tax-Exempt")).toBe(true);
    expect(isFederalTaxExemptInterestTreatment("Fed Tax Free")).toBe(true);
    expect(isFederalTaxExemptInterestTreatment("Return of Capital")).toBe(false);
  });
  test("non-investment income is classified as business income for local tax bases", () => {
    expect(isNonInvestmentIncomeType("non investment income")).toBe(true);
    expect(localIncomeCategory({ account: "Brokerage", effectiveSymbol: "Income", investmentType: "non investment income", localTaxCategory: "interest", nonInvestmentIncome: 10_000, taxStatus: "taxable", taxTreatment: "income", w2Income: 0, incomeItem: true })).toBe("businessIncome");
  });
});
