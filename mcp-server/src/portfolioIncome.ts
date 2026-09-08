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
  if (!Array.isArray(items) || items.length === 0) return Math.max(legacyAmount, 0);
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

export function localIncomeCategory(row: { account: string; effectiveSymbol: string; investmentType: string; localTaxCategory: string; nonInvestmentIncome: number; taxStatus: string; taxTreatment: string; w2Income: number; incomeItem?: boolean }): LocalIncomeCategory {
  const treatment = compactIncomeKey(row.taxTreatment);
  const type = String(row.investmentType || "").toLowerCase();
  const status = String(row.taxStatus || "").toLowerCase();
  const account = String(row.account || "").toLowerCase();
  const symbol = String(row.effectiveSymbol || "").toLowerCase();
  if (row.w2Income > 0 || /w2|wage/.test(treatment)) return "wages";
  if (/socialsecurity|ss85fed/.test(treatment) || /social.security/.test(type) || symbol === "ss" || symbol.includes("aux-ss")) return "socialSecurity";
  if (row.nonInvestmentIncome > 0 || isNonInvestmentIncomeType(type)) return "businessIncome";
  if (localIncomeCategories.includes(row.localTaxCategory as LocalIncomeCategory) && (row.incomeItem || (!status.includes("deferred") && !/ira|401k|pension|deferred/.test(account)))) {
    return row.localTaxCategory as LocalIncomeCategory;
  }
  if (status.includes("deferred") || /ira|401k|pension|deferred/.test(account)) return "retirementIncome";
  if (/real estate|rental/.test(type) || treatment === "realestate") return "rentalIncome";
  if (/div/.test(treatment) || type.includes("dividend")) return "dividends";
  if (/gain|section1256|index6040/.test(treatment)) return "capitalGains";
  if (type.includes("business")) return "businessIncome";
  return "interest";
}
