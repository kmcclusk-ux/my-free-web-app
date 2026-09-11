import { accountAllowsCurrentIncome } from "../../mcp-server/src/portfolioIncome";
import { toNumber } from "./numericInput";

export type TaxTreatmentRow = { id: number; label: string; ordinaryShare: number; preferredShare: number; stateRule: string; niitIncluded: boolean; localCategory: string; description: string; includeInAllocation: boolean };

export function normalizeTaxTreatmentKey(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isReturnOfCapitalTaxTreatment(value: unknown) {
  return ["returnofcapital", "hold"].includes(normalizeTaxTreatmentKey(value));
}

export function isTaxFreeTaxTreatment(value: unknown) {
  return ["taxfree", "taxexempt"].includes(normalizeTaxTreatmentKey(value)) || isReturnOfCapitalTaxTreatment(value);
}

export function isSocialSecurityTaxTreatment(value: unknown) {
  return ["socialsecurity", "ss85fed"].includes(normalizeTaxTreatmentKey(value));
}

export function isSection1256TaxTreatment(value: unknown) {
  return ["section1256", "index6040"].includes(normalizeTaxTreatmentKey(value));
}

export function isW2TaxTreatment(value: unknown) {
  return ["w2income", "wages", "w2wages"].includes(normalizeTaxTreatmentKey(value));
}

export function isKnownDefaultTaxTreatment(value: unknown) {
  return [
    "cash",
    "fedtaxfree",
    "income",
    "longtermgain",
    "nonqualifieddiv",
    "qualifieddiv",
    "realestate",
    "shorttermgain",
    "statetaxfree",
    "taxfree",
  ].includes(normalizeTaxTreatmentKey(value)) ||
    isReturnOfCapitalTaxTreatment(value) ||
    isSocialSecurityTaxTreatment(value) ||
    isSection1256TaxTreatment(value) ||
    isW2TaxTreatment(value);
}

export function taxTreatmentAliases(value: unknown) {
  const label = String(value || "").trim();
  const aliases = [label];
  if (isReturnOfCapitalTaxTreatment(label)) aliases.push("hold", "return of capital");
  if (isSocialSecurityTaxTreatment(label)) aliases.push("ss-85-fed", "social security");
  if (isSection1256TaxTreatment(label)) aliases.push("index-60-40", "section 1256");
  return aliases;
}

export function canonicalStateRuleForTaxTreatment(value: unknown) {
  if (isTaxFreeTaxTreatment(value) || isSocialSecurityTaxTreatment(value)) return "exempt";
  const key = normalizeTaxTreatmentKey(value);
  if (["statetaxfree", "treasuryinterest", "ustreasuryinterest"].includes(key)) return "treasury-exempt";
  return "";
}

export function defaultTaxTreatmentRule(label: string): Omit<TaxTreatmentRow, "id" | "label" | "includeInAllocation"> {
  const key = normalizeTaxTreatmentKey(label);
  const base = { ordinaryShare: 1, preferredShare: 0, stateRule: "taxable", niitIncluded: true, localCategory: "interest", description: "Ordinary taxable investment income" };
  if (isTaxFreeTaxTreatment(label)) return { ...base, ordinaryShare: 0, stateRule: "exempt", niitIncluded: false, localCategory: "", description: isReturnOfCapitalTaxTreatment(label) ? "Return of capital excluded from current federal, state, local, and NIIT taxable income" : "Excluded from current federal, state, local, and NIIT taxable income" };
  if (key === "fedtaxfree") return { ...base, ordinaryShare: 0, stateRule: "taxable", niitIncluded: false, description: "Federally exempt but state taxable" };
  if (key === "statetaxfree") return { ...base, stateRule: "treasury-exempt", description: "Federally taxable U.S. Treasury interest; exempt from state and local income tax" };
  if (isSection1256TaxTreatment(label)) return { ...base, ordinaryShare: 0.4, preferredShare: 0.6, localCategory: "capitalGains", description: "Section 1256-style 40% short-term / 60% long-term gain" };
  if (["qualifieddiv", "longtermgain"].includes(key)) return { ...base, ordinaryShare: 0, preferredShare: 1, localCategory: key === "qualifieddiv" ? "dividends" : "capitalGains", description: key === "qualifieddiv" ? "Qualified dividend income" : "Long-term capital gain" };
  if (isSocialSecurityTaxTreatment(label)) return { ...base, ordinaryShare: 0.85, stateRule: "exempt", niitIncluded: false, localCategory: "socialSecurity", description: "Social Security estimate; federal taxable share is capped at 85%" };
  if (isW2TaxTreatment(label)) return { ...base, niitIncluded: false, localCategory: "wages", description: "W-2 wage income taxed as ordinary income and excluded from NIIT" };
  if (key === "realestate") return { ...base, localCategory: "rentalIncome", description: "Ordinary real-estate income before property-specific deductions" };
  if (key === "nonqualifieddiv") return { ...base, localCategory: "dividends", description: "Nonqualified dividend taxed as ordinary income" };
  if (["shorttermgain"].includes(key)) return { ...base, localCategory: "capitalGains", description: "Short-term capital gain taxed as ordinary income" };
  return base;
}

export const defaultTaxTreatmentLabels = ["state tax free", "fed tax free", "section 1256", "W2 income", "income", "social security", "qualified-div", "non-qualified-div", "short term gain", "long term gain", "return of capital"] as const;

export function accountStatusAllowsCurrentTaxableIncome(value: unknown, incomeItem: boolean, forceTaxable = false) {
  return accountAllowsCurrentIncome(value, incomeItem, forceTaxable);
}

export function fedTaxAdjust(amount: number, taxTreatment: string, pref: boolean, rule?: TaxTreatmentRow) {
  if (rule) {
    const ordinary = Math.max(0, Math.min(1, toNumber(rule.ordinaryShare)));
    const preferred = Math.max(0, Math.min(1, toNumber(rule.preferredShare)));
    const scale = ordinary + preferred > 1 ? 1 / (ordinary + preferred) : 1;
    return amount * (pref ? preferred : ordinary) * scale;
  }
  const fallback = defaultTaxTreatmentRule(taxTreatment);
  return amount * (pref ? fallback.preferredShare : fallback.ordinaryShare);
}

export function stateTaxAdjust(amount: number, taxTreatment: string, stateCode = "CA", rule?: TaxTreatmentRow) {
  void stateCode;
  const canonicalStateRule = canonicalStateRuleForTaxTreatment(taxTreatment);
  const stateRule = normalizeTaxTreatmentKey(canonicalStateRule || rule?.stateRule || defaultTaxTreatmentRule(taxTreatment).stateRule);
  return ["exempt", "treasuryexempt"].includes(stateRule) ? 0 : amount;
}
