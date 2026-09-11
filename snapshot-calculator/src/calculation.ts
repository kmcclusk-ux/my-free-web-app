import { calculateTaxPlan2025, federalStandardDeduction2025 } from "../../amplify/backend/function/helloWorld/src/taxCalcs";
import type { FilingStatus } from "../../amplify/backend/function/helloWorld/src/taxCalcs";

export { federalStandardDeduction2025 };

export function investmentResult(input: { amount: number; yieldPercent: number; taxType: string }, incomeBeforeDeductions: number, filingStatus: FilingStatus, stateCode: string, deduction = 0, stateDeduction = 0) {
  if (![input.amount, input.yieldPercent, incomeBeforeDeductions, deduction, stateDeduction].every(value => Number.isFinite(value) && value >= 0)) throw new RangeError("Snapshot amounts and rates must be finite and nonnegative.");
  if (!["ordinary", "qualified", "treasury", "muni", "taxFree"].includes(input.taxType)) throw new RangeError("Select a supported investment tax treatment.");
  const beforeTaxIncome = Math.max(input.amount, 0) * Math.max(input.yieldPercent, 0) / 100;
  const ordinary = ["ordinary", "treasury"].includes(input.taxType) ? beforeTaxIncome : 0;
  const preferred = input.taxType === "qualified" ? beforeTaxIncome : 0;
  const baseIncome = Math.max(incomeBeforeDeductions, 0);
  const deductionItems = deduction > 0 ? [{ amount: deduction, deductionType: "Other itemized deduction" }] : [];
  const stateIncome = ["ordinary", "qualified"].includes(input.taxType) ? beforeTaxIncome : 0;
  const taxPlan = (includeInvestment: boolean) => calculateTaxPlan2025({
    filingStatus, state: stateCode,
    ordinaryIncomeExcludingSocialSecurity: baseIncome + (includeInvestment ? ordinary : 0),
    preferredIncome: includeInvestment ? preferred : 0,
    netInvestmentIncome: includeInvestment ? ordinary + preferred : 0,
    totalIncome: baseIncome + (includeInvestment ? beforeTaxIncome : 0),
    displayIncome: baseIncome + (includeInvestment ? beforeTaxIncome : 0),
    federalDeductionMode: "itemized", federalItemizedDeductions: deductionItems,
    stateGrossIncome: baseIncome + (includeInvestment ? stateIncome : 0),
    stateStandardDeduction: stateDeduction,
    salt: { mode: "taxes-paid", stateIncomeTaxPaid: 0, localIncomeTaxPaid: 0, realEstateTaxPaid: 0, personalPropertyTaxPaid: 0 },
  });
  const baseline = taxPlan(false);
  const scenario = taxPlan(true);
  const federalTax = scenario.federal.incomeTax - baseline.federal.incomeTax;
  const niit = scenario.federal.niit - baseline.federal.niit;
  const stateTax = scenario.state.incomeTax - baseline.state.incomeTax;
  const taxCost = scenario.totalTax - baseline.totalTax;
  return { beforeTaxIncome, federalTax, stateTax, niit, taxCost, afterTaxIncome: beforeTaxIncome - taxCost, effectiveTaxRate: beforeTaxIncome > 0 ? taxCost / beforeTaxIncome : 0 };
}
