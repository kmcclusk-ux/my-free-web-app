export type PayrollFilingStatus = "single" | "mfj" | "mfs" | "hoh";

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

function additionalMedicareThreshold(filingStatus: PayrollFilingStatus) {
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

export function calculateW2PayrollTax(wagesInput: number, filingStatus: PayrollFilingStatus, stateCodeInput: string): W2PayrollTaxBreakdown {
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
