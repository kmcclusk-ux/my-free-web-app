export type FilingStatus = "single" | "mfj" | "mfs" | "hoh";

function bracketedTax(taxableIncome: number, brackets: ReadonlyArray<{ max: number; rate: number }>) {
  const income = Number(taxableIncome);
  if (!Number.isFinite(income) || income <= 0) return 0;
  let tax = 0;
  let previousMax = 0;
  for (const bracket of brackets) {
    if (income <= previousMax) break;
    const amount = Math.min(income, bracket.max) - previousMax;
    if (amount > 0) tax += amount * bracket.rate;
    if (income <= bracket.max) break;
    previousMax = bracket.max;
  }
  return tax;
}

export function federalOrdinaryTax2025(taxableIncome: number, filingStatus: FilingStatus) {
  const schedules: Record<FilingStatus, ReadonlyArray<{ max: number; rate: number }>> = {
    mfj: [
      { max: 23850, rate: 0.10 },
      { max: 96950, rate: 0.12 },
      { max: 206700, rate: 0.22 },
      { max: 394600, rate: 0.24 },
      { max: 501050, rate: 0.32 },
      { max: 751600, rate: 0.35 },
      { max: Number.POSITIVE_INFINITY, rate: 0.37 },
    ],
    single: [
      { max: 11925, rate: 0.10 },
      { max: 48475, rate: 0.12 },
      { max: 103350, rate: 0.22 },
      { max: 197300, rate: 0.24 },
      { max: 250525, rate: 0.32 },
      { max: 626350, rate: 0.35 },
      { max: Number.POSITIVE_INFINITY, rate: 0.37 },
    ],
    mfs: [
      { max: 11925, rate: 0.10 },
      { max: 48475, rate: 0.12 },
      { max: 103350, rate: 0.22 },
      { max: 197300, rate: 0.24 },
      { max: 250525, rate: 0.32 },
      { max: 375800, rate: 0.35 },
      { max: Number.POSITIVE_INFINITY, rate: 0.37 },
    ],
    hoh: [
      { max: 17000, rate: 0.10 },
      { max: 64850, rate: 0.12 },
      { max: 103350, rate: 0.22 },
      { max: 197300, rate: 0.24 },
      { max: 250500, rate: 0.32 },
      { max: 626350, rate: 0.35 },
      { max: Number.POSITIVE_INFINITY, rate: 0.37 },
    ],
  };
  return bracketedTax(taxableIncome, schedules[filingStatus] ?? schedules.single);
}

export function federalPreferredTax2025(ordinaryTaxable: number, preferredTaxable: number, filingStatus: FilingStatus) {
  const ordinary = Number(ordinaryTaxable) || 0;
  const preferred = Number(preferredTaxable) || 0;
  if (!Number.isFinite(preferred) || preferred <= 0) return 0;
  const thresholds: Record<FilingStatus, { zero: number; fifteen: number }> = {
    single: { zero: 48350, fifteen: 533400 },
    mfj: { zero: 96700, fifteen: 600050 },
    mfs: { zero: 48350, fifteen: 300000 },
    hoh: { zero: 64750, fifteen: 566700 },
  };
  const bracket = thresholds[filingStatus] ?? thresholds.single;
  const zeroTaxAmount = Math.max(0, Math.min(preferred, bracket.zero - ordinary));
  const fifteenTaxBase = Math.max(ordinary, bracket.zero);
  const fifteenTaxAmount = Math.max(0, Math.min(preferred - zeroTaxAmount, bracket.fifteen - fifteenTaxBase));
  const twentyTaxAmount = Math.max(0, preferred - zeroTaxAmount - fifteenTaxAmount);
  return fifteenTaxAmount * 0.15 + twentyTaxAmount * 0.2;
}

export function niitThresholdForFilingStatus(filingStatus: FilingStatus) {
  return filingStatus === "mfj" ? 250000 : filingStatus === "mfs" ? 125000 : 200000;
}

export function federalCombinedTax2025({
  ordinaryTaxable,
  preferredTaxable,
  filingStatus,
  magi,
  netInvestmentIncome,
}: {
  ordinaryTaxable: number;
  preferredTaxable: number;
  filingStatus: FilingStatus;
  magi: number;
  netInvestmentIncome: number;
}) {
  const ordinaryTax = federalOrdinaryTax2025(ordinaryTaxable, filingStatus);
  const preferredTax = federalPreferredTax2025(ordinaryTaxable, preferredTaxable, filingStatus);
  const niitBase = Math.max(Math.min(netInvestmentIncome, Math.max(magi - niitThresholdForFilingStatus(filingStatus), 0)), 0);
  const niit = niitBase * 0.038;
  return { ordinaryTax, preferredTax, niit, tax: ordinaryTax + preferredTax + niit };
}

export function calculateDisplayedAfterTaxIncome(displayIncome: number, totalTax: number, excludedOnlyTax = 0) {
  return displayIncome - Math.max(totalTax - excludedOnlyTax, 0);
}

export type W2PayrollTaxComponent = {
  label: string;
  tax: number;
  rate: number;
  wageBase?: number;
  maxTax?: number;
};

type W2PayrollTaxComponentDefinition = Omit<W2PayrollTaxComponent, "tax">;

export type W2PayrollTaxBreakdown = {
  wages: number;
  federal: {
    socialSecurity: number;
    medicare: number;
    additionalMedicare: number;
    total: number;
  };
  state: {
    stateCode: string;
    components: W2PayrollTaxComponent[];
    total: number;
  };
  total: number;
};

const SOCIAL_SECURITY_WAGE_BASE_2025 = 176100;
const SOCIAL_SECURITY_EMPLOYEE_RATE = 0.062;
const MEDICARE_EMPLOYEE_RATE = 0.0145;
const ADDITIONAL_MEDICARE_RATE = 0.009;
const ALL_STATE_AND_DC_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
] as const;

function additionalMedicareThreshold(filingStatus: FilingStatus) {
  if (filingStatus === "mfj") return 250000;
  if (filingStatus === "mfs") return 125000;
  return 200000;
}

function cappedPayrollTax(wages: number, component: W2PayrollTaxComponentDefinition) {
  const taxableWages = Math.min(Math.max(wages, 0), component.wageBase ?? Number.POSITIVE_INFINITY);
  const rawTax = taxableWages * component.rate;
  return Math.min(rawTax, component.maxTax ?? Number.POSITIVE_INFINITY);
}

const STATE_W2_PAYROLL_COMPONENTS_2025: Record<string, W2PayrollTaxComponentDefinition[]> = {
  AL: [],
  AK: [{ label: "AK employee unemployment insurance", rate: 0.005, wageBase: 51800 }],
  AZ: [],
  AR: [],
  CA: [{ label: "CA SDI", rate: 0.012 }],
  CO: [{ label: "CO FAMLI employee share", rate: 0.0045, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 }],
  CT: [{ label: "CT paid leave", rate: 0.005, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 }],
  DE: [],
  FL: [],
  GA: [],
  HI: [{ label: "HI temporary disability insurance employee share", rate: 0.005 }],
  ID: [],
  IL: [],
  IN: [],
  IA: [],
  KS: [],
  KY: [],
  LA: [],
  ME: [],
  MD: [],
  MA: [{ label: "MA PFML employee share", rate: 0.0046, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 }],
  MI: [],
  MN: [],
  MS: [],
  MO: [],
  MT: [],
  NE: [],
  NV: [],
  NH: [],
  NJ: [
    { label: "NJ UI/WF/SWF employee share", rate: 0.003825, wageBase: 43200 },
    { label: "NJ temporary disability", rate: 0.0023, wageBase: 165400 },
    { label: "NJ family leave insurance", rate: 0.0033, wageBase: 165400 },
  ],
  NM: [],
  NY: [
    { label: "NY state disability insurance", rate: 0.005, maxTax: 31.2 },
    { label: "NY paid family leave", rate: 0.00388, maxTax: 354.53 },
  ],
  NC: [],
  ND: [],
  OH: [],
  OK: [],
  OR: [{ label: "OR paid leave employee share", rate: 0.006, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 }],
  PA: [{ label: "PA employee unemployment withholding", rate: 0.0007 }],
  RI: [{ label: "RI temporary disability insurance", rate: 0.013, wageBase: 89700 }],
  SC: [],
  SD: [],
  TN: [],
  TX: [],
  UT: [],
  VT: [],
  VA: [],
  WA: [
    { label: "WA paid family and medical leave employee share", rate: 0.003882, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 },
    { label: "WA Cares Fund", rate: 0.0058 },
  ],
  WV: [],
  WI: [],
  WY: [],
  DC: [],
};

export function isW2IncomeType(incomeType: string) {
  return String(incomeType || "").trim().toLowerCase() === "w2 wages";
}

export function calculateW2PayrollTax(wagesInput: number, filingStatus: FilingStatus, stateCodeInput: string): W2PayrollTaxBreakdown {
  const wages = Math.max(Number(wagesInput) || 0, 0);
  const socialSecurity = Math.min(wages, SOCIAL_SECURITY_WAGE_BASE_2025) * SOCIAL_SECURITY_EMPLOYEE_RATE;
  const medicare = wages * MEDICARE_EMPLOYEE_RATE;
  const additionalMedicare = Math.max(wages - additionalMedicareThreshold(filingStatus), 0) * ADDITIONAL_MEDICARE_RATE;
  const federalTotal = socialSecurity + medicare + additionalMedicare;
  const stateCode = String(stateCodeInput || "").trim().toUpperCase();
  const stateComponents = STATE_W2_PAYROLL_COMPONENTS_2025[stateCode] || [];
  const stateComponentsWithTax = stateComponents.map((component) => ({ ...component, tax: cappedPayrollTax(wages, component) }));
  const stateTotal = stateComponentsWithTax.reduce((total, component) => total + component.tax, 0);

  return {
    wages,
    federal: {
      socialSecurity,
      medicare,
      additionalMedicare,
      total: federalTotal,
    },
    state: {
      stateCode,
      components: stateComponentsWithTax,
      total: stateTotal,
    },
    total: federalTotal + stateTotal,
  };
}

export function getSupportedW2PayrollTaxStateCodes() {
  return [...ALL_STATE_AND_DC_CODES];
}
