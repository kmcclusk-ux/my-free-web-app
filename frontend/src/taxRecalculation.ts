export type TaxPlanRequest = {
  calc: "TAX_PLAN_2025";
  filingStatus: string;
  state: string;
  ordinaryIncomeExcludingSocialSecurity: number;
  preferredIncome: number;
  socialSecurityBenefits: number;
  taxExemptInterest: number;
  netInvestmentIncome: number;
  w2Income: number;
  totalIncome: number;
  displayIncome: number;
  federalDeductionMode: string;
  federalAboveLineDeductions: readonly unknown[];
  federalItemizedDeductions: readonly unknown[];
  stateGrossIncome: number;
  stateDeductionMode: string;
  stateStandardDeduction: number;
  stateItemizedDeductions: readonly unknown[];
  local: {
    enabled: boolean;
    localityId: string;
    residency: string;
    customRate: number;
    customNonresidentRate: number;
    taxableBaseAmounts: Record<string, number>;
    customTaxableBase: Record<string, boolean>;
  };
};

export function taxCalculationRequestKey(request: TaxPlanRequest) {
  return JSON.stringify(request);
}

export function isCurrentTaxCalculation(requestId: number, latestRequestId: number, aborted = false) {
  return !aborted && requestId === latestRequestId;
}

export function isTaxCalculationAbort(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}
