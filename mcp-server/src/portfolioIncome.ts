export function accountAllowsCurrentIncome(status: unknown, incomeItem: boolean, forceTaxable = false) {
  const key = String(status || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return forceTaxable || key === "taxable" || key === "partiallytaxable" || (incomeItem && ["deferred", "taxdeferred"].includes(key));
}

function compactIncomeKey(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isFederalTaxExemptInterestTreatment(value: unknown) {
  return ["taxfree", "taxexempt", "fedtaxfree"].includes(compactIncomeKey(value));
}

export function isNonInvestmentIncomeType(value: unknown) {
  return compactIncomeKey(value) === "noninvestmentincome";
}

export function effectiveInvestmentRate(currentRate: number, proposedRate: number, active: boolean) {
  return active ? proposedRate : currentRate;
}

export function investmentNetIncome(input: { amount: number; currentlyTaxable: boolean; federalExempt: boolean; niitIncluded: boolean; category: string; taxDeferredAccount?: boolean }) {
  if (!input.currentlyTaxable || input.federalExempt || !input.niitIncluded) return 0;
  if (input.taxDeferredAccount) return 0;
  if (["wages", "socialSecurity", "retirementIncome", "selfEmployment"].includes(input.category)) return 0;
  return Math.max(input.amount, 0);
}

export function whatIfInvestmentIncome(items: readonly { amount: number; incomeType?: unknown }[] | undefined, legacyAmount = 0) {
  if (!Array.isArray(items)) return Math.max(legacyAmount, 0);
  return items.reduce((total, item) => {
    const type = compactIncomeKey(item?.incomeType);
    const amount = Number(item?.amount);
    return /dividend|interest|gain|rental|collectible|section1250/.test(type) && Number.isFinite(amount) ? total + Math.max(amount, 0) : total;
  }, 0);
}

export function persistInvestmentInputs<Row extends { totalInvestment: number; yearlyIncome: number }>(row: Row, proposedRate: number) {
  return { ...row, newPercent: proposedRate };
}

export const localIncomeCategories = ["wages", "selfEmployment", "interest", "dividends", "capitalGains", "rentalIncome", "businessIncome", "retirementIncome", "socialSecurity"] as const;
export type LocalIncomeCategory = typeof localIncomeCategories[number];

export const incomeCalculationModes = ["principalYield", "annualIncome"] as const;
export type IncomeCalculationMode = typeof incomeCalculationModes[number];

export function resolveIncomeCalculationMode(input: { incomeMode?: unknown; incomeCalculationMode?: unknown; incomeItem?: unknown; assetType?: unknown; wageAccount?: boolean }): IncomeCalculationMode {
  if (input.wageAccount) return "annualIncome";
  if (input.incomeMode === "annual-income") return "annualIncome";
  if (input.incomeMode === "principal-yield") return "principalYield";
  if (incomeCalculationModes.includes(input.incomeCalculationMode as IncomeCalculationMode)) return input.incomeCalculationMode as IncomeCalculationMode;
  if (input.incomeItem !== undefined && input.incomeItem !== null) {
    return ["true", "yes", "y", "1"].includes(String(input.incomeItem).toLowerCase()) ? "annualIncome" : "principalYield";
  }
  return compactIncomeKey(input.assetType) === "income" || input.wageAccount ? "annualIncome" : "principalYield";
}

export function localIncomeCategory(row: { account: string; effectiveSymbol: string; investmentType: string; localTaxCategory: string; nonInvestmentIncome: number; taxStatus: string; taxTreatment: string; w2Income: number; incomeItem?: boolean; incomeKind?: string }): LocalIncomeCategory {
  const treatment = compactIncomeKey(row.taxTreatment);
  const type = String(row.investmentType || "").toLowerCase();
  const status = compactIncomeKey(row.taxStatus);
  if (["deferred", "taxdeferred"].includes(status)) return "retirementIncome";
  if (localIncomeCategories.includes(row.incomeKind as LocalIncomeCategory)) return row.incomeKind as LocalIncomeCategory;
  if (localIncomeCategories.includes(row.localTaxCategory as LocalIncomeCategory)) return row.localTaxCategory as LocalIncomeCategory;
  if (row.w2Income > 0 || /w2|wage/.test(treatment)) return "wages";
  if (/socialsecurity|ss85fed/.test(treatment) || /social.security/.test(type)) return "socialSecurity";
  if (/retirement|pension|distribution|deferredcompensation/.test(treatment)) return "retirementIncome";
  if (/real estate|rental/.test(type) || treatment === "realestate") return "rentalIncome";
  if (/div/.test(treatment) || type.includes("dividend")) return "dividends";
  if (/gain|section1256|index6040/.test(treatment)) return "capitalGains";
  if (type.includes("business")) return "businessIncome";
  return "interest";
}
