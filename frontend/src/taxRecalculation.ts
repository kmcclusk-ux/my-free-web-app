export type TaxPlanRequest = {
  calc: "TAX_PLAN_2025";
  filingStatus: string;
  state: string;
  ordinaryIncomeExcludingSocialSecurity: number;
  preferredIncome: number;
  longTermCapitalGainIncome?: number;
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

export function isRetryableTaxCalculationError(error: unknown) {
  if (isTaxCalculationAbort(error)) return false;
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 0;
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}
