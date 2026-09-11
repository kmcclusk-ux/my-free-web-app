// C:\myapp\amplify\backend\function\helloWorld\src\taxCalcs.ts

import {
  getStateTaxProfile,
  stateTax2025,
  stateTaxProfiles,
  type StateTaxFilingStatus,
  type StateTaxProfile,
} from "./taxProfiles2025";
import {
  getLocalTaxProfile2025,
  resolveLocalTaxProfile2025,
  localTaxBaseKeys,
  localTaxProfiles2025,
  type LocalTaxBaseKey,
  type LocalTaxBaseSelection,
  type LocalTaxProfile,
} from "./localTaxProfiles2025";
import {
  calculateW2PayrollTax,
  calculateW2PayrollTaxForWorkers,
  getSupportedW2PayrollTaxStateCodes,
  type W2PayrollTaxBreakdown,
  type W2PayrollWorkerInput,
  type W2PayrollWorkerPrograms,
} from "./payrollTax2025";

export {
  calculateW2PayrollTax,
  getLocalTaxProfile2025,
  getStateTaxProfile,
  getSupportedW2PayrollTaxStateCodes,
  localTaxBaseKeys,
  localTaxProfiles2025,
  stateTax2025,
  stateTaxProfiles,
};
export type { LocalTaxBaseKey, LocalTaxBaseSelection, LocalTaxProfile, StateTaxFilingStatus, StateTaxProfile, W2PayrollTaxBreakdown };

export type FilingStatus = "single" | "mfj" | "mfs" | "hoh";
export type LocalTaxBracket = { threshold: number; rate: number; baseTax?: number };
export type DeductionInput = { amount: number; deductionType: string; calculationMode?: "allowed-amount" | "automatic"; id?: number | string };
export type TaxDeductionMode = "standard" | "itemized";
export type LocalTaxResidency = "resident" | "nonresident";

export const federalTaxModel2025 = {
  taxYear: 2025,
  modelVersion: "2025.2",
  sourceRevision: "irs-2025-remediation-1",
  sources: {
    capital: "https://www.irs.gov/pub/irs-prior/p550--2025.pdf",
    scheduleD: "https://www.irs.gov/pub/irs-prior/i1040sd--2025.pdf",
    niit: "https://www.irs.gov/pub/irs-prior/i8960--2025.pdf",
    socialSecurity: "https://www.irs.gov/pub/irs-prior/p915--2025.pdf",
    deductions: "https://www.irs.gov/pub/irs-prior/i1040sca--2025.pdf",
    standardDeduction: "https://www.irs.gov/pub/irs-prior/p501--2025.pdf",
    schedule1A: "https://www.irs.gov/pub/irs-prior/f1040s1a--2025.pdf",
  },
  support: {
    capitalNetting: "ST/LT investment gains, eligible losses and carryovers; no basis/wash-sale determination",
    specialCapitalGains: "unsupported: section 1250, collectibles/28%-rate gains, section 1256 elections",
    netInvestmentIncome: "Form 8960 investment ledger, legacy pre-capital-loss aggregate, or explicit final aggregate; omitted NIIT inputs derive explicit capital only; eligibility/expense amounts supplied by caller",
    deductions: "allowed-amount overrides; automatic medical AGI floor; SALT cap; age/blind/dependent standard deduction; eligible Schedule 1-A senior deduction",
    excluded: ["AMT", "QBI", "credits", "self-employment tax", "Schedule 1-A tips/overtime/car interest", "Social Security lump-sum election"],
  },
} as const;

export type TaxDiagnostic = { code: string; severity: "warning" | "error"; field: string; message: string };

export class TaxInputValidationError extends Error {
  readonly diagnostics: TaxDiagnostic[];

  constructor(field: string, message: string, code = "INVALID_TAX_INPUT") {
    super(`${field}: ${message}`);
    this.name = "TaxInputValidationError";
    this.diagnostics = [{ code, severity: "error", field, message }];
  }
}

export type CapitalGains2025Input = {
  shortTermGains?: number;
  shortTermLosses?: number;
  longTermGains?: number;
  longTermLosses?: number;
  shortTermLossCarryover?: number;
  longTermLossCarryover?: number;
  unrecapturedSection1250Gain?: number;
  collectiblesGain?: number;
  section1256NetGain?: number;
};

export type FederalTax2025Options = {
  taxYear?: number;
  modelVersion?: string;
  sourceRevision?: string;
  capitalGains?: CapitalGains2025Input;
  marriedFilingSeparatelyLivedApart?: boolean;
  qualifyingSurvivingSpouse?: boolean;
  standardDeductionFacts?: {
    taxpayerAge65OrOlder?: boolean;
    taxpayerBlind?: boolean;
    spouseAge65OrOlder?: boolean;
    spouseBlind?: boolean;
    canBeClaimedAsDependent?: boolean;
    dependentEarnedIncome?: number;
    spouseItemizes?: boolean;
    mfsSpouseEligibleForAdditionalDeduction?: boolean;
  };
  investmentIncome?: {
    taxableInterest?: number;
    ordinaryDividends?: number;
    taxableAnnuities?: number;
    passiveRentalIncome?: number;
    passiveBusinessIncome?: number;
    otherInvestmentIncome?: number;
    allowedInvestmentExpenses?: number;
    capitalGainOrLossAdjustment?: number;
  };
  netInvestmentIncomeMode?: "pre-capital-loss" | "final";
  magiAdjustments?: { niit?: number; salt?: number; socialSecurity?: number; schedule1A?: number };
  salt?: {
    mode: "modeled-liability" | "taxes-paid";
    election?: "income" | "sales";
    stateIncomeTaxPaid?: number;
    localIncomeTaxPaid?: number;
    salesTaxPaid?: number;
    realEstateTaxPaid?: number;
    personalPropertyTaxPaid?: number;
  };
  schedule1A?: {
    claimSeniorDeduction?: boolean;
    taxpayerHasValidSsn?: boolean;
    spouseHasValidSsn?: boolean;
    qualifiedTips?: number;
    qualifiedOvertime?: number;
    carLoanInterest?: number;
  };
  unsupportedFeatures?: string[];
};

export type TaxPlan2025Input = FederalTax2025Options & {
  filingStatus: FilingStatus;
  state: string;
  ordinaryIncomeExcludingSocialSecurity: number;
  preferredIncome: number;
  longTermCapitalGainIncome?: number;
  socialSecurityBenefits?: number;
  taxExemptInterest?: number;
  netInvestmentIncome?: number;
  w2Income?: number;
  w2Workers?: W2PayrollWorkerInput[];
  w2WorkerPrograms?: Record<string, W2PayrollWorkerPrograms>;
  totalIncome?: number;
  displayIncome?: number;
  federalDeductionMode?: TaxDeductionMode;
  federalAboveLineDeductions?: DeductionInput[];
  federalItemizedDeductions?: DeductionInput[];
  stateGrossIncome: number;
  stateDeductionMode?: TaxDeductionMode;
  stateStandardDeduction?: number;
  stateItemizedDeductions?: DeductionInput[];
  local?: {
    enabled?: boolean;
    localityId?: string;
    overrideMode?: "preset" | "override";
    residency?: LocalTaxResidency;
    customRate?: number;
    customNonresidentRate?: number;
    taxableBaseAmounts?: Partial<Record<LocalTaxBaseKey, number>>;
    customTaxableBase?: Partial<LocalTaxBaseSelection>;
  };
};

function assertRecord(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TaxInputValidationError(field, "Expected an object.");
  }
}

function assertNumber(value: unknown, field: string, signed = false): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER || (!signed && value < 0)) {
    throw new TaxInputValidationError(field, `Expected a finite ${signed ? "" : "nonnegative "}number within the safe dollar range.`);
  }
}

function assertEnum(value: unknown, choices: readonly string[], field: string) {
  if (typeof value !== "string" || !choices.includes(value)) {
    throw new TaxInputValidationError(field, `Expected one of: ${choices.join(", ")}.`);
  }
}

function assertFilingStatus(value: unknown) {
  assertEnum(value, ["single", "mfj", "mfs", "hoh"], "filingStatus");
}

function assertKeys(value: Record<string, unknown>, keys: readonly string[], field: string) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new TaxInputValidationError(`${field}.${key}`, "Unrecognized field; migrate or explicitly classify this input.");
  }
}

function validateNumberFields(value: Record<string, unknown>, fields: readonly string[], path: string, signed: readonly string[] = []) {
  for (const field of fields) {
    if (value[field] !== undefined) assertNumber(value[field], path ? `${path}.${field}` : field, signed.includes(field));
  }
}

function validateBooleanFields(value: Record<string, unknown>, fields: readonly string[], path = "") {
  for (const field of fields) {
    if (value[field] !== undefined && typeof value[field] !== "boolean") {
      throw new TaxInputValidationError(path ? `${path}.${field}` : field, "Expected a boolean.");
    }
  }
}

function validateDeductions(items: unknown, field: string) {
  if (items === undefined) return;
  if (!Array.isArray(items)) throw new TaxInputValidationError(field, "Expected an array.");
  const seenIds = new Set<string | number>();
  items.forEach((item, index) => {
    const path = `${field}[${index}]`;
    assertRecord(item, path);
    assertNumber(item.amount, `${path}.amount`);
    if (typeof item.deductionType !== "string" || (!item.deductionType.trim() && item.amount !== 0)) {
      throw new TaxInputValidationError(`${path}.deductionType`, "A deduction category is required.");
    }
    if (item.calculationMode !== undefined) assertEnum(item.calculationMode, ["allowed-amount", "automatic"], `${path}.calculationMode`);
    if (item.id !== undefined) {
      if ((typeof item.id !== "number" && typeof item.id !== "string") || (typeof item.id === "number" && !Number.isSafeInteger(item.id))) {
        throw new TaxInputValidationError(`${path}.id`, "Expected a string or safe integer ID.");
      }
      if (seenIds.has(item.id)) throw new TaxInputValidationError(`${path}.id`, "Duplicate deduction ID.");
      seenIds.add(item.id);
    }
  });
}

const federalOptionKeys = ["taxYear", "modelVersion", "sourceRevision", "capitalGains", "marriedFilingSeparatelyLivedApart", "qualifyingSurvivingSpouse", "standardDeductionFacts", "investmentIncome", "netInvestmentIncomeMode", "magiAdjustments", "salt", "schedule1A", "unsupportedFeatures"];
const federalIncomeFields = ["ordinaryIncomeExcludingSocialSecurity", "preferredIncome", "longTermCapitalGainIncome", "socialSecurityBenefits", "taxExemptInterest", "netInvestmentIncome"];

function validateFederalOptions(input: FederalTax2025Options & { filingStatus: FilingStatus }) {
  if (input.taxYear !== undefined && input.taxYear !== 2025) throw new TaxInputValidationError("taxYear", "Only tax year 2025 is supported.", "UNSUPPORTED_TAX_YEAR");
  if (input.modelVersion !== undefined && input.modelVersion !== federalTaxModel2025.modelVersion) throw new TaxInputValidationError("modelVersion", "Unsupported engine version; migrate explicitly.", "UNSUPPORTED_MODEL_VERSION");
  if (input.sourceRevision !== undefined && input.sourceRevision !== federalTaxModel2025.sourceRevision) throw new TaxInputValidationError("sourceRevision", "Unsupported source revision.");
  validateBooleanFields(input, ["marriedFilingSeparatelyLivedApart", "qualifyingSurvivingSpouse"]);
  if (input.marriedFilingSeparatelyLivedApart && input.filingStatus !== "mfs") throw new TaxInputValidationError("marriedFilingSeparatelyLivedApart", "Applies only to MFS.");
  if (input.qualifyingSurvivingSpouse && input.filingStatus !== "single") throw new TaxInputValidationError("qualifyingSurvivingSpouse", "Use single plus this explicit eligibility fact; provisions are mapped individually.");
  if (input.capitalGains !== undefined) {
    assertRecord(input.capitalGains, "capitalGains");
    const fields = ["shortTermGains", "shortTermLosses", "longTermGains", "longTermLosses", "shortTermLossCarryover", "longTermLossCarryover", "unrecapturedSection1250Gain", "collectiblesGain", "section1256NetGain"];
    assertKeys(input.capitalGains, fields, "capitalGains");
    validateNumberFields(input.capitalGains, fields, "capitalGains", ["shortTermGains", "longTermGains", "section1256NetGain"]);
    for (const field of ["unrecapturedSection1250Gain", "collectiblesGain", "section1256NetGain"] as const) {
      if (input.capitalGains[field]) throw new TaxInputValidationError(`capitalGains.${field}`, "This special capital-gain worksheet/election is not supported; do not treat it as normal LTCG.", "UNSUPPORTED_CAPITAL_GAIN");
    }
  }
  if (input.standardDeductionFacts !== undefined) {
    const facts = input.standardDeductionFacts;
    assertRecord(facts, "standardDeductionFacts");
    const booleans = ["taxpayerAge65OrOlder", "taxpayerBlind", "spouseAge65OrOlder", "spouseBlind", "canBeClaimedAsDependent", "spouseItemizes", "mfsSpouseEligibleForAdditionalDeduction"];
    assertKeys(facts, [...booleans, "dependentEarnedIncome"], "standardDeductionFacts");
    validateBooleanFields(facts, booleans, "standardDeductionFacts");
    validateNumberFields(facts, ["dependentEarnedIncome"], "standardDeductionFacts");
    if (facts.canBeClaimedAsDependent) assertNumber(facts.dependentEarnedIncome, "standardDeductionFacts.dependentEarnedIncome");
    if ((facts.spouseItemizes || facts.mfsSpouseEligibleForAdditionalDeduction) && input.filingStatus !== "mfs") throw new TaxInputValidationError("standardDeductionFacts", "Separate-return spouse restrictions apply only to MFS.");
    if ((facts.spouseAge65OrOlder || facts.spouseBlind) && input.filingStatus !== "mfj" && !(input.filingStatus === "mfs" && facts.mfsSpouseEligibleForAdditionalDeduction)) {
      throw new TaxInputValidationError("standardDeductionFacts", "Spouse age/blind additions require MFJ or explicit eligible MFS-spouse facts.");
    }
  }
  if (input.investmentIncome !== undefined) {
    assertRecord(input.investmentIncome, "investmentIncome");
    const fields = ["taxableInterest", "ordinaryDividends", "taxableAnnuities", "passiveRentalIncome", "passiveBusinessIncome", "otherInvestmentIncome", "allowedInvestmentExpenses", "capitalGainOrLossAdjustment"];
    assertKeys(input.investmentIncome, fields, "investmentIncome");
    validateNumberFields(input.investmentIncome, fields, "investmentIncome", ["passiveRentalIncome", "passiveBusinessIncome", "otherInvestmentIncome", "capitalGainOrLossAdjustment"]);
  }
  if (input.netInvestmentIncomeMode !== undefined) {
    assertEnum(input.netInvestmentIncomeMode, ["pre-capital-loss", "final"], "netInvestmentIncomeMode");
    if (input.investmentIncome !== undefined) throw new TaxInputValidationError("netInvestmentIncomeMode", "An aggregate mode cannot be combined with investmentIncome; choose one NIIT representation.");
  }
  if (input.magiAdjustments !== undefined) {
    assertRecord(input.magiAdjustments, "magiAdjustments");
    const fields = ["niit", "salt", "socialSecurity", "schedule1A"];
    assertKeys(input.magiAdjustments, fields, "magiAdjustments");
    validateNumberFields(input.magiAdjustments, fields, "magiAdjustments", ["niit"]);
  }
  if (input.salt !== undefined) {
    assertRecord(input.salt, "salt");
    const fields = ["stateIncomeTaxPaid", "localIncomeTaxPaid", "salesTaxPaid", "realEstateTaxPaid", "personalPropertyTaxPaid"];
    assertKeys(input.salt, ["mode", "election", ...fields], "salt");
    assertEnum(input.salt.mode, ["modeled-liability", "taxes-paid"], "salt.mode");
    if (input.salt.election !== undefined) assertEnum(input.salt.election, ["income", "sales"], "salt.election");
    validateNumberFields(input.salt, fields, "salt");
    if (input.salt.mode === "modeled-liability" && (fields.some((field) => input.salt![field as keyof typeof input.salt] !== undefined) || input.salt.election === "sales")) {
      throw new TaxInputValidationError("salt", "Taxes-paid inputs require taxes-paid mode.");
    }
    if (input.salt.mode === "taxes-paid") {
      const required = input.salt.election === "sales" ? ["salesTaxPaid"] : ["stateIncomeTaxPaid", "localIncomeTaxPaid"];
      for (const field of [...required, "realEstateTaxPaid", "personalPropertyTaxPaid"]) assertNumber(input.salt[field as keyof typeof input.salt], `salt.${field}`);
      if (input.salt.election !== "sales" && input.salt.salesTaxPaid) throw new TaxInputValidationError("salt.salesTaxPaid", "Choose either income or sales taxes, not both.");
      if (input.salt.election === "sales" && (input.salt.stateIncomeTaxPaid || input.salt.localIncomeTaxPaid)) throw new TaxInputValidationError("salt", "Choose either income or sales taxes, not both.");
    }
  }
  if (input.schedule1A !== undefined) {
    assertRecord(input.schedule1A, "schedule1A");
    const booleans = ["claimSeniorDeduction", "taxpayerHasValidSsn", "spouseHasValidSsn"];
    const amounts = ["qualifiedTips", "qualifiedOvertime", "carLoanInterest"] as const;
    assertKeys(input.schedule1A, [...booleans, ...amounts], "schedule1A");
    validateBooleanFields(input.schedule1A, booleans, "schedule1A");
    validateNumberFields(input.schedule1A, amounts, "schedule1A");
    for (const field of amounts) {
      if (input.schedule1A[field]) throw new TaxInputValidationError(`schedule1A.${field}`, "Eligibility and phaseout worksheets are not implemented.", "UNSUPPORTED_SCHEDULE_1_A");
    }
  }
  if (input.unsupportedFeatures !== undefined && (!Array.isArray(input.unsupportedFeatures) || input.unsupportedFeatures.some((feature) => typeof feature !== "string" || !feature.trim()))) {
    throw new TaxInputValidationError("unsupportedFeatures", "Expected named unsupported tax features.");
  }
}

function computeBracketedTax(
  taxableIncome: number,
  brackets: ReadonlyArray<{ max: number; rate: number }>
): number {
  assertNumber(taxableIncome, "taxableIncome", true);
  const ti = taxableIncome;
  if (ti <= 0) return 0;

  let tax = 0;
  let prevMax = 0;

  for (const b of brackets) {
    if (ti <= prevMax) break;
    const amt = Math.min(ti, b.max) - prevMax;
    if (amt > 0) tax += amt * b.rate;
    if (ti <= b.max) break;
    prevMax = b.max;
  }

  return tax;
}

/**
 * 2025 MFJ ordinary income tax on taxable income (after deductions).
 */
export function fedTax2025Mfj(taxableIncome: number): number {
  const brackets = [
    { max: 23850, rate: 0.10 },
    { max: 96950, rate: 0.12 },
    { max: 206700, rate: 0.22 },
    { max: 394600, rate: 0.24 },
    { max: 501050, rate: 0.32 },
    { max: 751600, rate: 0.35 },
    { max: Number.POSITIVE_INFINITY, rate: 0.37 },
  ] as const;

  return computeBracketedTax(taxableIncome, brackets);
}

/**
 * 2025 Single ordinary income tax on taxable income (after deductions).
 */
export function fedTax2025Single(taxableIncome: number): number {
  const brackets = [
    { max: 11925, rate: 0.10 },
    { max: 48475, rate: 0.12 },
    { max: 103350, rate: 0.22 },
    { max: 197300, rate: 0.24 },
    { max: 250525, rate: 0.32 },
    { max: 626350, rate: 0.35 },
    { max: Number.POSITIVE_INFINITY, rate: 0.37 },
  ] as const;

  return computeBracketedTax(taxableIncome, brackets);
}

export function fedTax2025Ordinary(
  taxableIncome: number,
  filingStatus: FilingStatus
): number {
  assertFilingStatus(filingStatus);
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
  return computeBracketedTax(taxableIncome, schedules[filingStatus]);
}

export function federalStandardDeduction2025(
  filingStatus: FilingStatus,
  facts: NonNullable<FederalTax2025Options["standardDeductionFacts"]> = {},
  qualifyingSurvivingSpouse = false
): number {
  assertFilingStatus(filingStatus);
  validateFederalOptions({ filingStatus, standardDeductionFacts: facts, qualifyingSurvivingSpouse });
  const deductions: Record<FilingStatus, number> = {
    single: 15_750,
    mfj: 31_500,
    mfs: 15_750,
    hoh: 23_625,
  };
  if (filingStatus === "mfs" && facts.spouseItemizes) return 0;
  const regular = qualifyingSurvivingSpouse ? deductions.mfj : deductions[filingStatus];
  const base = facts.canBeClaimedAsDependent ? Math.min(regular, Math.max(1_350, facts.dependentEarnedIncome! + 450)) : regular;
  const additionalCount = Number(facts.taxpayerAge65OrOlder === true) + Number(facts.taxpayerBlind === true)
    + Number(facts.spouseAge65OrOlder === true) + Number(facts.spouseBlind === true);
  const additionalAmount = filingStatus === "mfj" || filingStatus === "mfs" || qualifyingSurvivingSpouse ? 1_600 : 2_000;
  return base + additionalCount * additionalAmount;
}

/**
 * Preferential tax (LTCG + qualified dividends) on the preferential portion ONLY.
 */
export function fedPrefTax2025(
  ordinaryTaxable: number,
  prefTaxable: number,
  filingStatus: FilingStatus
): number {
  assertFilingStatus(filingStatus);
  assertNumber(ordinaryTaxable, "ordinaryTaxable", true);
  assertNumber(prefTaxable, "prefTaxable", true);
  const ord = nonNegative(ordinaryTaxable);
  const pref = nonNegative(prefTaxable);
  if (pref <= 0) return 0;

  const fs = (filingStatus || "single").toLowerCase() as FilingStatus;

  const thresholds: Record<FilingStatus, { z0: number; z15: number }> = {
    single: { z0: 48350, z15: 533400 },
    mfj: { z0: 96700, z15: 600050 },
    mfs: { z0: 48350, z15: 300000 },
    hoh: { z0: 64750, z15: 566700 },
  };

  const b = thresholds[fs] ?? thresholds.single;

  const TI = ord + pref;
  const QDCG = pref;
  const taxableOrd = TI - QDCG;

  const amount0 = Math.max(0, Math.min(QDCG, b.z0 - taxableOrd));
  const baseFor15 = Math.max(taxableOrd, b.z0);
  const amount15 = Math.max(0, Math.min(QDCG - amount0, b.z15 - baseFor15));
  const amount20 = Math.max(0, QDCG - amount0 - amount15);

  return amount15 * 0.15 + amount20 * 0.2;
}

export function splitFederalTaxableIncome2025(
  ordinaryIncome: number,
  preferredIncome: number,
  deduction: number
) {
  assertNumber(ordinaryIncome, "ordinaryIncome");
  assertNumber(preferredIncome, "preferredIncome");
  assertNumber(deduction, "deduction");
  const ordinary = nonNegative(ordinaryIncome);
  const preferred = nonNegative(preferredIncome);
  const allowedDeduction = nonNegative(deduction);
  const taxableIncome = Math.max(ordinary + preferred - allowedDeduction, 0);
  const prefTaxable = Math.min(preferred, taxableIncome);
  const ordinaryTaxable = Math.max(taxableIncome - prefTaxable, 0);

  return {
    ordinaryIncome: ordinary,
    preferredIncome: preferred,
    deduction: allowedDeduction,
    taxableIncome,
    ordinaryTaxable,
    prefTaxable,
  };
}

export function fedPrefTax2024(_ordinaryTaxable: number, _prefTaxable: number, _filingStatus: FilingStatus): never {
  throw new TaxInputValidationError("taxYear", "The historical 2024 alias was removed; call fedPrefTax2025 explicitly for 2025 rules.", "UNSUPPORTED_TAX_YEAR");
}

/**
 * Calculates 2025 California income tax for Married Filing Jointly (MFJ)
 * given CA taxable income (Form 540, line 19).
 */
export function caTax2025Mfj(taxableIncome: number): number {
  return stateTax2025(taxableIncome, "CA", "mfj").tax;
}

/**
 * Net Investment Income Tax (NIIT) - 3.8% surtax.
 */
export function niitTax(
  magi: number,
  netInvestmentIncome: number,
  filingStatus: FilingStatus
): number {
  assertFilingStatus(filingStatus);
  assertNumber(magi, "magi", true);
  assertNumber(netInvestmentIncome, "netInvestmentIncome", true);
  const m = Number(magi);
  const nii = Number(netInvestmentIncome);

  if (!Number.isFinite(m) || m <= 0) return 0;
  if (!Number.isFinite(nii) || nii <= 0) return 0;

  const fs = (filingStatus || "single").toLowerCase() as FilingStatus;
  const threshold = fs === "mfj" ? 250_000 : fs === "mfs" ? 125_000 : 200_000;
  const excessMagi = Math.max(0, m - threshold);
  const base = Math.min(nii, excessMagi);

  return base * 0.038;
}

export function localFlatTax(taxableIncome: number, rate: number) {
  const income = nonNegative(taxableIncome);
  const normalizedRate = nonNegative(rate);
  const tax = income * normalizedRate;
  return {
    tax,
    effectiveRate: income > 0 ? tax / income : 0,
    marginalRate: income > 0 ? normalizedRate : 0,
  };
}

export function localProgressiveTax(taxableIncome: number, brackets: ReadonlyArray<LocalTaxBracket>) {
  const income = Math.max(Number(taxableIncome) || 0, 0);
  if (income <= 0) return { tax: 0, effectiveRate: 0, marginalRate: 0 };
  const sorted = [...brackets]
    .map((bracket) => ({
      threshold: Math.max(Number(bracket.threshold) || 0, 0),
      rate: Math.max(Number(bracket.rate) || 0, 0),
      baseTax: bracket.baseTax === undefined ? undefined : nonNegative(bracket.baseTax),
    }))
    .sort((left, right) => left.threshold - right.threshold);
  const reachedBracket = sorted.filter((bracket) => income >= bracket.threshold).at(-1);
  const tax = reachedBracket?.baseTax !== undefined
    ? reachedBracket.baseTax + (income - reachedBracket.threshold) * reachedBracket.rate
    : sorted.reduce((total, bracket, index) => {
        const nextThreshold = sorted[index + 1]?.threshold ?? Number.POSITIVE_INFINITY;
        const taxableAtRate = Math.max(Math.min(income, nextThreshold) - bracket.threshold, 0);
        return total + taxableAtRate * bracket.rate;
      }, 0);
  return {
    tax,
    effectiveRate: tax / income,
    marginalRate: reachedBracket?.rate || 0,
  };
}

function nonNegative(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(numeric, 0) : 0;
}

function deductionAmount(items: DeductionInput[] | undefined, predicate: (type: string) => boolean) {
  return (Array.isArray(items) ? items : []).reduce((total, item) => {
    const type = String(item?.deductionType || "").trim();
    return type && predicate(type) ? total + nonNegative(item?.amount) : total;
  }, 0);
}

function isCapitalLossDeduction(type: string) {
  const normalized = type.trim().toLowerCase();
  return normalized === "capital loss deduction" || normalized === "investment loss (long term)" || normalized === "investment loss (short term)";
}

export function federalCapitalLossLimit2025(filingStatus: FilingStatus) {
  assertFilingStatus(filingStatus);
  return filingStatus === "mfs" ? 1_500 : 3_000;
}

export function federalSaltCap2025(filingStatus: FilingStatus, modifiedAdjustedGrossIncome: number) {
  assertFilingStatus(filingStatus);
  assertNumber(modifiedAdjustedGrossIncome, "modifiedAdjustedGrossIncome", true);
  const marriedFilingSeparately = filingStatus === "mfs";
  const phaseoutThreshold = marriedFilingSeparately ? 250_000 : 500_000;
  const reduction = Math.max(nonNegative(modifiedAdjustedGrossIncome) - phaseoutThreshold, 0) * 0.30;
  return Math.max(40_000 - reduction, 10_000) / (marriedFilingSeparately ? 2 : 1);
}

export function calculateTaxableSocialSecurity2025(
  benefits: number,
  otherIncome: number,
  taxExemptInterest: number,
  filingStatus: FilingStatus,
  marriedFilingSeparatelyLivedApart = false
) {
  assertFilingStatus(filingStatus);
  assertNumber(benefits, "socialSecurityBenefits");
  assertNumber(otherIncome, "otherIncome", true);
  assertNumber(taxExemptInterest, "taxExemptInterest");
  validateBooleanFields({ marriedFilingSeparatelyLivedApart }, ["marriedFilingSeparatelyLivedApart"]);
  const annualBenefits = nonNegative(benefits);
  if (annualBenefits === 0) return 0;

  const isMfsLivingTogether = filingStatus === "mfs" && !marriedFilingSeparatelyLivedApart;
  const baseAmount = filingStatus === "mfj" ? 32_000 : isMfsLivingTogether ? 0 : 25_000;
  const upperAmount = filingStatus === "mfj" ? 44_000 : isMfsLivingTogether ? 0 : 34_000;
  const provisionalIncome = Math.max((Number.isFinite(otherIncome) ? otherIncome : 0) + nonNegative(taxExemptInterest) + annualBenefits * 0.5, 0);

  if (isMfsLivingTogether) return Math.min(annualBenefits * 0.85, provisionalIncome * 0.85);
  if (provisionalIncome <= baseAmount) return 0;
  if (provisionalIncome <= upperAmount) {
    return Math.min(annualBenefits * 0.5, (provisionalIncome - baseAmount) * 0.5);
  }

  const lowerTierTaxable = Math.min(annualBenefits * 0.5, (upperAmount - baseAmount) * 0.5);
  return Math.min(annualBenefits * 0.85, (provisionalIncome - upperAmount) * 0.85 + lowerTierTaxable);
}

export type FederalTax2025Input = FederalTax2025Options & {
  filingStatus: FilingStatus;
  ordinaryIncomeExcludingSocialSecurity: number;
  preferredIncome: number;
  longTermCapitalGainIncome?: number;
  socialSecurityBenefits?: number;
  taxExemptInterest?: number;
  netInvestmentIncome?: number;
  deductionMode?: TaxDeductionMode;
  aboveLineDeductions?: DeductionInput[];
  itemizedDeductions?: DeductionInput[];
  stateIncomeTax?: number;
  localIncomeTax?: number;
};

function netCapitalGains2025(capital: CapitalGains2025Input, filingStatus: FilingStatus) {
  const shortTermGains = capital.shortTermGains ?? 0;
  const longTermGains = capital.longTermGains ?? 0;
  const shortTermLosses = (capital.shortTermLosses ?? 0) + (capital.shortTermLossCarryover ?? 0);
  const longTermLosses = (capital.longTermLosses ?? 0) + (capital.longTermLossCarryover ?? 0);
  const netShortTerm = shortTermGains - shortTermLosses;
  const netLongTerm = longTermGains - longTermLosses;
  const netGainOrLoss = netShortTerm + netLongTerm;
  const ordinaryGain = Math.max(0, Math.min(netShortTerm, netGainOrLoss));
  const preferentialGain = Math.max(0, Math.min(netLongTerm, netGainOrLoss));
  const capitalLossDeduction = Math.min(Math.max(-netGainOrLoss, 0), federalCapitalLossLimit2025(filingStatus));
  const grossGains = Math.max(shortTermGains, 0) + Math.max(longTermGains, 0);
  const capitalLossRaw = shortTermLosses + longTermLosses + Math.max(-shortTermGains, 0) + Math.max(-longTermGains, 0);
  return { netShortTerm, netLongTerm, netGainOrLoss, ordinaryGain, preferentialGain, grossGains, capitalLossRaw, capitalLossOffset: grossGains - ordinaryGain - preferentialGain, capitalLossDeduction };
}

function calculateNetInvestmentIncome2025(input: FederalTax2025Input, capital: ReturnType<typeof netCapitalGains2025>, diagnostics: TaxDiagnostic[]) {
  const investmentLedger = input.investmentIncome;
  if (input.netInvestmentIncomeMode !== undefined && input.netInvestmentIncome === undefined) {
    throw new TaxInputValidationError("netInvestmentIncome", "An aggregate amount is required when netInvestmentIncomeMode is supplied.");
  }
  const source = investmentLedger ? "investment-ledger"
    : input.netInvestmentIncome !== undefined ? input.netInvestmentIncomeMode === "final" ? "final-aggregate" : "legacy-aggregate"
      : input.capitalGains !== undefined ? "capital-only" : "none";
  const netCapitalGain = capital.ordinaryGain + capital.preferentialGain;
  const grossNetInvestmentIncome = investmentLedger
    ? (investmentLedger.taxableInterest ?? 0) + (investmentLedger.ordinaryDividends ?? 0) + (investmentLedger.taxableAnnuities ?? 0)
      + (investmentLedger.passiveRentalIncome ?? 0) + (investmentLedger.passiveBusinessIncome ?? 0) + (investmentLedger.otherInvestmentIncome ?? 0) + netCapitalGain
    : source === "capital-only" ? netCapitalGain : nonNegative(input.netInvestmentIncome);
  const capitalLossOffsetApplied = source === "legacy-aggregate" ? capital.capitalLossOffset : 0;
  const capitalLossDeductionApplied = source === "final-aggregate" || source === "none" ? 0 : capital.capitalLossDeduction;
  const allowedInvestmentExpenses = investmentLedger?.allowedInvestmentExpenses ?? 0;
  const capitalGainOrLossAdjustment = investmentLedger?.capitalGainOrLossAdjustment ?? 0;
  if (investmentLedger && input.netInvestmentIncome !== undefined) {
    diagnostics.push({ code: "NIIT_AGGREGATE_IGNORED", severity: "warning", field: "netInvestmentIncome", message: "investmentIncome takes precedence; the aggregate is ignored, not added. Supply only one NIIT representation." });
  }
  if (source === "capital-only") {
    diagnostics.push({ code: "NIIT_CAPITAL_ONLY", severity: "warning", field: "capitalGains", message: "NIIT includes only the explicit capital ledger, assumed investment-related. Supply investmentIncome for other investment income or NIIT-specific adjustments; wages and preferred income are not inferred." });
  }
  if (source === "legacy-aggregate" && (capitalLossOffsetApplied || capitalLossDeductionApplied)) {
    diagnostics.push({ code: "NIIT_PRE_CAPITAL_LOSS_AGGREGATE", severity: "warning", field: "netInvestmentIncome", message: "Legacy aggregate must include gross capital gains before the modeled capital losses, but after allowed investment expenses. Use netInvestmentIncomeMode: 'final' for an already-netted total." });
  }
  if (allowedInvestmentExpenses > 0) {
    diagnostics.push({ code: "NIIT_ALLOWED_EXPENSE_OVERRIDE", severity: "warning", field: "investmentIncome.allowedInvestmentExpenses", message: "Caller must supply only NIIT-allowable, properly allocated expenses not already deducted in investmentIncome amounts. Regular-tax deduction rows are not subtracted again or used to verify eligibility." });
  }
  if (capitalGainOrLossAdjustment !== 0) {
    diagnostics.push({ code: "NIIT_CAPITAL_ADJUSTMENT_OVERRIDE", severity: "warning", field: "investmentIncome.capitalGainOrLossAdjustment", message: "Caller-supplied signed NIIT-only adjustment to the already-netted capital result; do not repeat modeled losses, carryovers or allowedInvestmentExpenses." });
  }
  const netInvestmentIncome = Math.max(grossNetInvestmentIncome - capitalLossOffsetApplied - capitalLossDeductionApplied - allowedInvestmentExpenses + capitalGainOrLossAdjustment, 0);
  return { source, grossNetInvestmentIncome, capitalLossOffsetApplied, capitalLossDeductionApplied, allowedInvestmentExpenses, capitalGainOrLossAdjustment, netInvestmentIncome };
}

function federalDeductionDetails(items: DeductionInput[] | undefined, field: string, adjustedGrossIncome: number, diagnostics: TaxDiagnostic[]) {
  const knownTypes = ["ira contribution", "hsa contribution", "self-employed health insurance", "educator expenses", "student loan interest", "mortgage interest", "property tax", "medical expenses", "medical expense", "medical", "charitable contributions", "charitable contribution", "charitable donations", "charity", "investment interest", "deductible part of self-employment tax", "alimony paid", "other"];
  return (items ?? []).filter((item) => !isCapitalLossDeduction(item.deductionType)).map((item, index) => {
    const type = item.deductionType.trim().toLowerCase();
    const medical = ["medical", "medical expense", "medical expenses"].includes(type);
    const mode = item.calculationMode ?? "allowed-amount";
    if (mode === "automatic" && (!medical || field !== "itemizedDeductions")) {
      throw new TaxInputValidationError(`${field}[${index}].calculationMode`, "Automatic eligibility is supported only for itemized medical expenses.", "UNSUPPORTED_DEDUCTION");
    }
    const allowed = mode === "automatic" ? Math.max(item.amount - Math.max(adjustedGrossIncome, 0) * 0.075, 0) : item.amount;
    const reason = mode === "automatic" ? "Eligible unreimbursed medical expenses less 7.5% of AGI." : "Caller-supplied already-allowed amount; eligibility and limits are not automatically verified.";
    if (!knownTypes.includes(type)) diagnostics.push({ code: "UNKNOWN_DEDUCTION", severity: "warning", field: `${field}[${index}].deductionType`, message: `Unknown category '${item.deductionType}'; retained only as a manual allowed-amount override.` });
    if (item.amount > 0 && mode === "allowed-amount" && type !== "property tax") diagnostics.push({ code: "ALLOWED_DEDUCTION_OVERRIDE", severity: "warning", field: `${field}[${index}]`, message: reason });
    return { deductionType: item.deductionType, calculationMode: mode, entered: item.amount, allowed, disallowed: item.amount - allowed, reason };
  });
}

export function calculateFederalTax2025(input: FederalTax2025Input) {
  assertRecord(input, "federal");
  assertFilingStatus(input.filingStatus);
  validateFederalOptions(input);
  validateNumberFields(input, [...federalIncomeFields, "stateIncomeTax", "localIncomeTax"], "");
  assertNumber(input.ordinaryIncomeExcludingSocialSecurity, "ordinaryIncomeExcludingSocialSecurity");
  assertNumber(input.preferredIncome, "preferredIncome");
  validateDeductions(input.aboveLineDeductions, "aboveLineDeductions");
  validateDeductions(input.itemizedDeductions, "itemizedDeductions");
  if (input.deductionMode !== undefined) assertEnum(input.deductionMode, ["standard", "itemized"], "deductionMode");
  const diagnostics: TaxDiagnostic[] = (input.unsupportedFeatures ?? []).map((feature) => ({ code: "UNSUPPORTED_FEATURE", severity: "warning", field: "unsupportedFeatures", message: `${feature} is not included in this estimate.` }));
  const filingStatus = input.filingStatus;
  const taxRateStatus = input.qualifyingSurvivingSpouse ? "mfj" : filingStatus;
  const preferredIncome = nonNegative(input.preferredIncome);
  const longTermCapitalGainIncome = nonNegative(input.longTermCapitalGainIncome);
  if (longTermCapitalGainIncome > preferredIncome) throw new TaxInputValidationError("longTermCapitalGainIncome", "Legacy capital gains must be part of preferred income, not greater than it.");
  const socialSecurityBenefits = nonNegative(input.socialSecurityBenefits);
  const lossItems = [...(input.aboveLineDeductions ?? []), ...(input.itemizedDeductions ?? [])];
  const legacyLongTermLosses = deductionAmount(lossItems, (type) => type.toLowerCase() === "investment loss (long term)");
  const legacyShortTermLosses = deductionAmount(lossItems, (type) => isCapitalLossDeduction(type) && type.toLowerCase() !== "investment loss (long term)");
  if (input.capitalGains && (legacyLongTermLosses || legacyShortTermLosses || longTermCapitalGainIncome)) {
    throw new TaxInputValidationError("capitalGains", "Use either the explicit capital ledger or legacy gain/loss fields, not both.");
  }
  const capital = netCapitalGains2025(input.capitalGains ?? {
    longTermGains: longTermCapitalGainIncome, shortTermLosses: legacyShortTermLosses, longTermLosses: legacyLongTermLosses,
  }, filingStatus);
  const { capitalLossRaw, capitalLossOffset, capitalLossDeduction } = capital;
  const ordinaryIncomeExcludingSocialSecurity = input.ordinaryIncomeExcludingSocialSecurity + capital.ordinaryGain;
  const preferredIncomeAfterCapitalLoss = preferredIncome - longTermCapitalGainIncome + capital.preferentialGain;
  const otherAboveLineDeductions = deductionAmount(input.aboveLineDeductions, (type) => !isCapitalLossDeduction(type));
  const aboveLineDeduction = otherAboveLineDeductions + capitalLossDeduction;
  const socialSecurityAdjustments = capitalLossDeduction + deductionAmount(input.aboveLineDeductions, (type) =>
    ["ira contribution", "hsa contribution", "self-employed health insurance", "educator expenses"].includes(type.toLowerCase())
  );
  const taxableSocialSecurity = calculateTaxableSocialSecurity2025(
    socialSecurityBenefits,
    ordinaryIncomeExcludingSocialSecurity + preferredIncomeAfterCapitalLoss - socialSecurityAdjustments + (input.magiAdjustments?.socialSecurity ?? 0),
    nonNegative(input.taxExemptInterest),
    filingStatus,
    input.marriedFilingSeparatelyLivedApart
  );
  const ordinaryIncome = ordinaryIncomeExcludingSocialSecurity + taxableSocialSecurity;
  const rawAdjustedGrossIncome = ordinaryIncome + preferredIncomeAfterCapitalLoss - aboveLineDeduction;
  const adjustedGrossIncome = Math.max(rawAdjustedGrossIncome, 0);
  const aboveLineDetails = federalDeductionDetails(input.aboveLineDeductions, "aboveLineDeductions", adjustedGrossIncome, diagnostics);
  const itemizedDetails = federalDeductionDetails(input.itemizedDeductions, "itemizedDeductions", adjustedGrossIncome, diagnostics);
  const amountByType = (type: string) => itemizedDetails.reduce((total, item) => total + (item.deductionType.trim().toLowerCase() === type ? item.allowed : 0), 0);
  const propertyTax = amountByType("property tax");
  const mortgageInterest = amountByType("mortgage interest");
  const otherItemized = itemizedDetails.reduce((total, item) => total + item.allowed, 0) - propertyTax - mortgageInterest;
  const saltMagi = adjustedGrossIncome + (input.magiAdjustments?.salt ?? 0);
  const saltCap = federalSaltCap2025(filingStatus, saltMagi);
  const taxesPaid = input.salt?.mode === "taxes-paid" ? input.salt : undefined;
  const saltEntered = taxesPaid
    ? (taxesPaid.election === "sales" ? taxesPaid.salesTaxPaid! : taxesPaid.stateIncomeTaxPaid! + taxesPaid.localIncomeTaxPaid!) + taxesPaid.realEstateTaxPaid! + taxesPaid.personalPropertyTaxPaid!
    : propertyTax + nonNegative(input.stateIncomeTax) + nonNegative(input.localIncomeTax);
  const saltDeduction = Math.min(saltEntered, saltCap);
  const itemizedDeduction = mortgageInterest + saltDeduction + otherItemized;
  const standardDeduction = federalStandardDeduction2025(filingStatus, input.standardDeductionFacts, input.qualifyingSurvivingSpouse);
  const deductionMode = input.deductionMode === "itemized" ? "itemized" : "standard";
  const standardOrItemizedDeduction = deductionMode === "itemized" ? itemizedDeduction : standardDeduction;
  let seniorDeduction = 0;
  if (input.schedule1A?.claimSeniorDeduction) {
    if (filingStatus === "mfs") throw new TaxInputValidationError("schedule1A", "The senior deduction is unavailable when married filing separately.");
    const eligibleTaxpayer = input.standardDeductionFacts?.taxpayerAge65OrOlder && input.schedule1A.taxpayerHasValidSsn;
    const eligibleSpouse = filingStatus === "mfj" && input.standardDeductionFacts?.spouseAge65OrOlder && input.schedule1A.spouseHasValidSsn;
    if (!eligibleTaxpayer && !eligibleSpouse) throw new TaxInputValidationError("schedule1A", "Age-65 and valid-SSN eligibility facts are required.");
    const reduction = Math.max(adjustedGrossIncome + (input.magiAdjustments?.schedule1A ?? 0) - (filingStatus === "mfj" ? 150_000 : 75_000), 0) * 0.06;
    seniorDeduction = Math.max(6_000 - reduction, 0) * (Number(Boolean(eligibleTaxpayer)) + Number(Boolean(eligibleSpouse)));
  }
  const taxableSplit = splitFederalTaxableIncome2025(ordinaryIncome, preferredIncomeAfterCapitalLoss, aboveLineDeduction + standardOrItemizedDeduction + seniorDeduction);
  const lossUsedForCarryover = Math.min(capitalLossDeduction, Math.max(rawAdjustedGrossIncome - standardOrItemizedDeduction - seniorDeduction + capitalLossDeduction, 0));
  const shortTermCarryover = Math.max(-capital.netShortTerm - Math.max(capital.netLongTerm, 0) - lossUsedForCarryover, 0);
  const longTermCarryover = Math.max(-capital.netLongTerm - Math.max(capital.netShortTerm, 0) - Math.max(lossUsedForCarryover - Math.max(-capital.netShortTerm, 0), 0), 0);
  const ordinaryTax = fedTax2025Ordinary(taxableSplit.ordinaryTaxable, taxRateStatus);
  const preferentialTaxBeforeCeiling = fedPrefTax2025(taxableSplit.ordinaryTaxable, taxableSplit.prefTaxable, taxRateStatus);
  const regularTaxCeiling = fedTax2025Ordinary(taxableSplit.taxableIncome, taxRateStatus);
  const prefTax = Math.min(preferentialTaxBeforeCeiling, Math.max(regularTaxCeiling - ordinaryTax, 0));
  const incomeTaxBeforeNiit = ordinaryTax + prefTax;
  const niitDetails = calculateNetInvestmentIncome2025(input, capital, diagnostics);
  const { grossNetInvestmentIncome, netInvestmentIncome } = niitDetails;
  const niitThreshold = taxRateStatus === "mfj" ? 250_000 : filingStatus === "mfs" ? 125_000 : 200_000;
  const niitMagi = adjustedGrossIncome + (input.magiAdjustments?.niit ?? 0);
  const niitBase = Math.min(netInvestmentIncome, Math.max(niitMagi - niitThreshold, 0));
  const niit = niitBase * 0.038;
  const incomeTax = incomeTaxBeforeNiit + niit;

  return {
    taxYear: federalTaxModel2025.taxYear,
    modelVersion: federalTaxModel2025.modelVersion,
    diagnostics,
    capital: { ...capital, lossUsedForCarryover, shortTermCarryover, longTermCarryover },
    filingStatus,
    ordinaryIncomeExcludingSocialSecurity,
    grossPreferredIncome: preferredIncome,
    longTermCapitalGainIncome,
    preferredIncomeAfterCapitalLoss,
    socialSecurityBenefits,
    taxableSocialSecurity,
    adjustedGrossIncome,
    niitMagi,
    saltMagi,
    deductionMode,
    deductions: {
      aboveLineDeduction,
      otherAboveLineDeductions,
      capitalLossRaw,
      capitalLossOffset,
      capitalLossDeduction,
      standardDeduction,
      itemizedDeduction,
      mortgageInterest,
      propertyTax,
      stateIncomeTax: nonNegative(input.stateIncomeTax),
      localIncomeTax: nonNegative(input.localIncomeTax),
      saltEntered,
      saltCap,
      saltDeduction,
      otherItemized,
      standardOrItemizedDeduction,
      seniorDeduction,
      aboveLineDetails,
      itemizedDetails,
      saltMode: input.salt?.mode ?? "modeled-liability",
      total: aboveLineDeduction + standardOrItemizedDeduction + seniorDeduction,
    },
    ...taxableSplit,
    ordinaryTax,
    prefTax,
    preferentialTaxBeforeCeiling,
    regularTaxCeiling,
    niitThreshold,
    niitBase,
    niit,
    niitDetails,
    grossNetInvestmentIncome,
    netInvestmentIncome,
    incomeTax,
  };
}

export function calculateStateTax2025(input: {
  state: string;
  filingStatus: FilingStatus;
  grossIncome: number;
  deductionMode?: TaxDeductionMode;
  standardDeduction?: number;
  itemizedDeductions?: DeductionInput[];
}) {
  assertRecord(input, "state");
  assertFilingStatus(input.filingStatus);
  assertNumber(input.grossIncome, "stateGrossIncome");
  if (input.standardDeduction !== undefined) assertNumber(input.standardDeduction, "stateStandardDeduction");
  if (input.deductionMode !== undefined) assertEnum(input.deductionMode, ["standard", "itemized"], "stateDeductionMode");
  validateDeductions(input.itemizedDeductions, "stateItemizedDeductions");
  const grossIncome = nonNegative(input.grossIncome);
  const standardDeduction = nonNegative(input.standardDeduction);
  const itemizedDeduction = deductionAmount(input.itemizedDeductions, () => true);
  const deductionMode = input.deductionMode === "itemized" ? "itemized" : "standard";
  const deduction = deductionMode === "itemized" ? itemizedDeduction : standardDeduction;
  const taxableIncome = Math.max(grossIncome - deduction, 0);
  const result = stateTax2025(taxableIncome, input.state, input.filingStatus);
  const profile = getStateTaxProfile(input.state);
  const brackets = input.filingStatus === "mfj" ? profile.mfj
    : input.filingStatus === "mfs" ? profile.mfs ?? profile.single
    : input.filingStatus === "hoh" ? profile.hoh ?? profile.single
    : profile.single;
  const reachedBracket = [...brackets].sort((left, right) => left.threshold - right.threshold).filter((bracket) => taxableIncome >= bracket.threshold).at(-1);
  return {
    ...result,
    grossIncome,
    deductionMode,
    standardDeduction,
    itemizedDeduction,
    deduction,
    taxableIncome,
    incomeTax: result.tax,
    effectiveRate: taxableIncome > 0 ? result.tax / taxableIncome : 0,
    marginalRate: reachedBracket?.rate || 0,
    profile: { ...profile, brackets },
  };
}

export function calculateLocalTax2025(input: (NonNullable<TaxPlan2025Input["local"]> & { filingStatus?: FilingStatus; stateIncomeTax?: number; stateMarginalRate?: number }) = {}) {
  const enabled = input.enabled === true;
  const resolution = resolveLocalTaxProfile2025(input);
  const { profile, residency, baseSelection } = resolution;
  const filingStatus = input.filingStatus || "single";
  const brackets = profile.bracketsByStatus?.[filingStatus] || profile.brackets || [];
  const selectedProfile = { ...profile, brackets };
  const baseAmounts = localTaxBaseKeys.reduce((amounts, key) => {
    if (input.taxableBaseAmounts?.[key] !== undefined) assertNumber(input.taxableBaseAmounts[key], `local.taxableBaseAmounts.${key}`);
    amounts[key] = nonNegative(input.taxableBaseAmounts?.[key]);
    return amounts;
  }, {} as Record<LocalTaxBaseKey, number>);
  const taxableIncome = localTaxBaseKeys.reduce((total, key) => total + (baseSelection[key] ? baseAmounts[key] : 0), 0);

  if (!enabled || profile.kind === "none") {
    return { enabled: false, residency, taxableIncome, tax: 0, effectiveRate: 0, marginalRate: 0, baseSelection, baseAmounts, profile: selectedProfile };
  }

  if (profile.kind === "progressive") {
    return { enabled, residency, taxableIncome, ...localProgressiveTax(taxableIncome, brackets), baseSelection, baseAmounts, profile: selectedProfile };
  }

  if (profile.kind === "state-surcharge") {
    const resident = residency === "resident";
    const calculationBase = resident ? nonNegative(input.stateIncomeTax) : taxableIncome;
    const rate = resident ? profile.residentRate : profile.nonresidentRate ?? 0;
    const tax = calculationBase * rate;
    const effectiveRate = taxableIncome > 0 ? tax / taxableIncome : 0;
    const marginalRate = resident ? nonNegative(input.stateMarginalRate) * rate : taxableIncome > 0 ? rate : 0;
    return { enabled, residency, taxableIncome, calculationBase, tax, effectiveRate, marginalRate, baseSelection, baseAmounts, profile: selectedProfile };
  }

  const rate = resolution.rate;
  return { enabled, residency, taxableIncome, ...localFlatTax(taxableIncome, rate), baseSelection, baseAmounts, profile: selectedProfile };
}

export function calculateTaxPlan2025(input: TaxPlan2025Input) {
  assertRecord(input, "taxPlan");
  assertKeys(input, ["calc", "filingStatus", "state", ...federalOptionKeys, ...federalIncomeFields, "w2Income", "w2Workers", "w2WorkerPrograms", "totalIncome", "displayIncome", "federalDeductionMode", "federalAboveLineDeductions", "federalItemizedDeductions", "stateGrossIncome", "stateDeductionMode", "stateStandardDeduction", "stateItemizedDeductions", "local"], "taxPlan");
  validateNumberFields(input, ["w2Income", "totalIncome", "displayIncome"], "");
  if (input.local?.enabled) {
    const profile = getLocalTaxProfile2025(input.local.localityId ?? "none");
    if (profile.state && profile.state !== "*" && profile.state !== input.state) throw new TaxInputValidationError("local.localityId", "Locality must belong to the selected state.");
  }
  const filingStatus = input.filingStatus;
  const state = calculateStateTax2025({
    state: input.state,
    filingStatus,
    grossIncome: input.stateGrossIncome,
    deductionMode: input.stateDeductionMode,
    standardDeduction: input.stateStandardDeduction,
    itemizedDeductions: input.stateItemizedDeductions,
  });
  const local = calculateLocalTax2025({ ...input.local, filingStatus, stateIncomeTax: state.incomeTax, stateMarginalRate: state.marginalRate });
  const federal = calculateFederalTax2025({
    ...Object.fromEntries(federalOptionKeys.filter((key) => input[key as keyof TaxPlan2025Input] !== undefined).map((key) => [key, input[key as keyof TaxPlan2025Input]])),
    filingStatus,
    ordinaryIncomeExcludingSocialSecurity: input.ordinaryIncomeExcludingSocialSecurity,
    preferredIncome: input.preferredIncome,
    longTermCapitalGainIncome: input.longTermCapitalGainIncome,
    socialSecurityBenefits: input.socialSecurityBenefits,
    taxExemptInterest: input.taxExemptInterest,
    netInvestmentIncome: input.netInvestmentIncome,
    deductionMode: input.federalDeductionMode,
    aboveLineDeductions: input.federalAboveLineDeductions,
    itemizedDeductions: input.federalItemizedDeductions,
    stateIncomeTax: state.incomeTax,
    localIncomeTax: local.tax,
  });
  const payroll = input.w2Workers
    ? calculateW2PayrollTaxForWorkers(input.w2Workers, filingStatus, state.state, input.w2WorkerPrograms)
    : calculateW2PayrollTax(nonNegative(input.w2Income), filingStatus, state.state);
  if (input.w2Workers && input.w2Income !== undefined && Math.abs(payroll.wages - input.w2Income) > 0.005) throw new TaxInputValidationError("w2Workers", "Worker wages must sum to w2Income.");
  const nextDollarPayroll = input.w2Workers?.length
    ? calculateW2PayrollTaxForWorkers(input.w2Workers.map((worker, index) => index === 0 ? { ...worker, wages: worker.wages + 1, socialSecurityWages: (worker.socialSecurityWages ?? worker.wages) + 1, medicareWages: (worker.medicareWages ?? worker.wages) + 1, stateWages: (worker.stateWages ?? worker.wages) + 1 } : worker), filingStatus, state.state, input.w2WorkerPrograms)
    : calculateW2PayrollTax(nonNegative(input.w2Income) + 1, filingStatus, state.state);
  const marginalPayrollRate = Math.max(nextDollarPayroll.total - payroll.total, 0);
  const federalTotal = federal.incomeTax + payroll.federal.total;
  const stateTotal = state.incomeTax + payroll.state.total;
  const totalTax = federalTotal + stateTotal + local.tax;
  const totalIncome = nonNegative(input.totalIncome);
  const displayIncome = nonNegative(input.displayIncome);

  return {
    calc: "TAX_PLAN_2025" as const,
    filingStatus,
    stateCode: state.state,
    stateName: state.stateName,
    federal: { ...federal, ficaTax: payroll.federal.total, payrollTax: payroll.federal.total, total: federalTotal },
    state: { ...state, employeePayrollTax: payroll.state.total, payrollTax: payroll.state.total, payrollComponents: payroll.state.components, total: stateTotal },
    local,
    payroll,
    marginalPayrollRate,
    totalTax,
    totalIncome,
    displayIncome,
    excludedIncome: Math.max(totalIncome - displayIncome, 0),
    afterTaxIncome: displayIncome - totalTax,
  };
}
