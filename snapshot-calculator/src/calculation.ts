import { calculateFederalTax2025, federalStandardDeduction2025, stateTax2025 } from "../../amplify/backend/function/helloWorld/src/taxCalcs";
import type { FilingStatus } from "../../amplify/backend/function/helloWorld/src/taxCalcs";

export { federalStandardDeduction2025 };

export function investmentResult(input: { amount: number; yieldPercent: number; taxType: string }, incomeBeforeDeductions: number, filingStatus: FilingStatus, stateCode: string, deduction = 0) {
  const beforeTaxIncome = Math.max(input.amount, 0) * Math.max(input.yieldPercent, 0) / 100;
  const ordinary = ["ordinary", "treasury"].includes(input.taxType) ? beforeTaxIncome : 0;
  const preferred = input.taxType === "qualified" ? beforeTaxIncome : 0;
  const baseIncome = Math.max(incomeBeforeDeductions, 0);
  const deductionItems = deduction > 0 ? [{ amount: deduction, deductionType: "Other itemized deduction" }] : [];
  const baseline = calculateFederalTax2025({
    filingStatus,
    ordinaryIncomeExcludingSocialSecurity: baseIncome,
    preferredIncome: 0,
    deductionMode: "itemized",
    itemizedDeductions: deductionItems,
    netInvestmentIncome: 0,
  });
  const scenario = calculateFederalTax2025({
    filingStatus,
    ordinaryIncomeExcludingSocialSecurity: baseIncome + ordinary,
    preferredIncome: preferred,
    deductionMode: "itemized",
    itemizedDeductions: deductionItems,
    netInvestmentIncome: ordinary + preferred,
  });
  const federalTax = scenario.incomeTax - baseline.incomeTax;
  const niit = scenario.niit - baseline.niit;
  const stateIncome = ["ordinary", "qualified"].includes(input.taxType) ? beforeTaxIncome : 0;
  const stateBase = Math.max(baseIncome - deduction, 0);
  const stateTax = stateTax2025(Math.max(baseIncome + stateIncome - deduction, 0), stateCode, filingStatus).tax - stateTax2025(stateBase, stateCode, filingStatus).tax;
  const taxCost = federalTax + stateTax;
  return { beforeTaxIncome, federalTax, stateTax, niit, taxCost, afterTaxIncome: beforeTaxIncome - taxCost, effectiveTaxRate: beforeTaxIncome > 0 ? taxCost / beforeTaxIncome : 0 };
}
