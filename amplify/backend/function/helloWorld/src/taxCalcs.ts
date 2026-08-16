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
  localTaxBaseKeys,
  localTaxProfiles2025,
  type LocalTaxBaseKey,
  type LocalTaxBaseSelection,
  type LocalTaxProfile,
} from "./localTaxProfiles2025";
import {
  calculateW2PayrollTax,
  getSupportedW2PayrollTaxStateCodes,
  type W2PayrollTaxBreakdown,
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
export type DeductionInput = { amount: number; deductionType: string };
export type TaxDeductionMode = "standard" | "itemized";
export type LocalTaxResidency = "resident" | "nonresident";

export type TaxPlan2025Input = {
  filingStatus: FilingStatus;
  state: string;
  ordinaryIncomeExcludingSocialSecurity: number;
  preferredIncome: number;
  socialSecurityBenefits?: number;
  taxExemptInterest?: number;
  netInvestmentIncome?: number;
  w2Income?: number;
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
    residency?: LocalTaxResidency;
    customRate?: number;
    customNonresidentRate?: number;
    taxableBaseAmounts?: Partial<Record<LocalTaxBaseKey, number>>;
    customTaxableBase?: Partial<LocalTaxBaseSelection>;
  };
};

function computeBracketedTax(
  taxableIncome: number,
  brackets: ReadonlyArray<{ max: number; rate: number }>
): number {
  const ti = Number(taxableIncome);
  if (!Number.isFinite(ti) || ti <= 0) return 0;

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
  return computeBracketedTax(taxableIncome, schedules[filingStatus] ?? schedules.single);
}

export function federalStandardDeduction2025(filingStatus: FilingStatus): number {
  const deductions: Record<FilingStatus, number> = {
    single: 15_750,
    mfj: 31_500,
    mfs: 15_750,
    hoh: 23_625,
  };
  return deductions[filingStatus] ?? deductions.single;
}

/**
 * Preferential tax (LTCG + qualified dividends) on the preferential portion ONLY.
 */
export function fedPrefTax2025(
  ordinaryTaxable: number,
  prefTaxable: number,
  filingStatus: FilingStatus
): number {
  const ord = Number(ordinaryTaxable) || 0;
  const pref = Number(prefTaxable) || 0;
  if (!Number.isFinite(pref) || pref <= 0) return 0;

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
  const ordinary = Math.max(Number(ordinaryIncome) || 0, 0);
  const preferred = Math.max(Number(preferredIncome) || 0, 0);
  const allowedDeduction = Math.max(Number(deduction) || 0, 0);
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

export const fedPrefTax2024 = fedPrefTax2025;

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
  const income = Math.max(Number(taxableIncome) || 0, 0);
  const normalizedRate = Math.max(Number(rate) || 0, 0);
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
  return filingStatus === "mfs" ? 1_500 : 3_000;
}

export function federalSaltCap2025(filingStatus: FilingStatus, modifiedAdjustedGrossIncome: number) {
  const marriedFilingSeparately = filingStatus === "mfs";
  const initialCap = marriedFilingSeparately ? 20_000 : 40_000;
  const phaseoutThreshold = marriedFilingSeparately ? 250_000 : 500_000;
  const minimumCap = marriedFilingSeparately ? 5_000 : 10_000;
  const reduction = Math.max(nonNegative(modifiedAdjustedGrossIncome) - phaseoutThreshold, 0) * 0.30;
  return Math.max(initialCap - reduction, minimumCap);
}

export function calculateTaxableSocialSecurity2025(
  benefits: number,
  otherIncome: number,
  taxExemptInterest: number,
  filingStatus: FilingStatus,
  marriedFilingSeparatelyLivedApart = false
) {
  const annualBenefits = nonNegative(benefits);
  if (annualBenefits === 0) return 0;

  const isMfsLivingTogether = filingStatus === "mfs" && !marriedFilingSeparatelyLivedApart;
  const baseAmount = filingStatus === "mfj" ? 32_000 : isMfsLivingTogether ? 0 : 25_000;
  const upperAmount = filingStatus === "mfj" ? 44_000 : isMfsLivingTogether ? 0 : 34_000;
  const provisionalIncome = nonNegative(otherIncome) + nonNegative(taxExemptInterest) + annualBenefits * 0.5;

  if (isMfsLivingTogether) return Math.min(annualBenefits * 0.85, provisionalIncome * 0.85);
  if (provisionalIncome <= baseAmount) return 0;
  if (provisionalIncome <= upperAmount) {
    return Math.min(annualBenefits * 0.5, (provisionalIncome - baseAmount) * 0.5);
  }

  const lowerTierTaxable = Math.min(annualBenefits * 0.5, (upperAmount - baseAmount) * 0.5);
  return Math.min(annualBenefits * 0.85, (provisionalIncome - upperAmount) * 0.85 + lowerTierTaxable);
}

export function calculateFederalTax2025(input: {
  filingStatus: FilingStatus;
  ordinaryIncomeExcludingSocialSecurity: number;
  preferredIncome: number;
  socialSecurityBenefits?: number;
  taxExemptInterest?: number;
  netInvestmentIncome?: number;
  deductionMode?: TaxDeductionMode;
  aboveLineDeductions?: DeductionInput[];
  itemizedDeductions?: DeductionInput[];
  stateIncomeTax?: number;
}) {
  const filingStatus = input.filingStatus;
  const ordinaryIncomeExcludingSocialSecurity = nonNegative(input.ordinaryIncomeExcludingSocialSecurity);
  const preferredIncome = nonNegative(input.preferredIncome);
  const socialSecurityBenefits = nonNegative(input.socialSecurityBenefits);
  const taxableSocialSecurity = calculateTaxableSocialSecurity2025(
    socialSecurityBenefits,
    ordinaryIncomeExcludingSocialSecurity + preferredIncome,
    nonNegative(input.taxExemptInterest),
    filingStatus
  );
  const ordinaryIncome = ordinaryIncomeExcludingSocialSecurity + taxableSocialSecurity;
  const capitalLossRaw = deductionAmount(input.aboveLineDeductions, isCapitalLossDeduction)
    + deductionAmount(input.itemizedDeductions, isCapitalLossDeduction);
  const capitalLossDeduction = Math.min(capitalLossRaw, federalCapitalLossLimit2025(filingStatus));
  const otherAboveLineDeductions = deductionAmount(input.aboveLineDeductions, (type) => !isCapitalLossDeduction(type));
  const aboveLineDeduction = otherAboveLineDeductions + capitalLossDeduction;
  const adjustedGrossIncome = Math.max(ordinaryIncome + preferredIncome - aboveLineDeduction, 0);
  const propertyTax = deductionAmount(input.itemizedDeductions, (type) => type.trim().toLowerCase() === "property tax");
  const mortgageInterest = deductionAmount(input.itemizedDeductions, (type) => type.trim().toLowerCase() === "mortgage interest");
  const otherItemized = deductionAmount(input.itemizedDeductions, (type) => {
    const normalized = type.trim().toLowerCase();
    return !isCapitalLossDeduction(type) && normalized !== "property tax" && normalized !== "mortgage interest";
  });
  const saltCap = federalSaltCap2025(filingStatus, adjustedGrossIncome);
  const saltEntered = propertyTax + nonNegative(input.stateIncomeTax);
  const saltDeduction = Math.min(saltEntered, saltCap);
  const itemizedDeduction = mortgageInterest + saltDeduction + otherItemized;
  const standardDeduction = federalStandardDeduction2025(filingStatus);
  const deductionMode = input.deductionMode === "itemized" ? "itemized" : "standard";
  const standardOrItemizedDeduction = deductionMode === "itemized" ? itemizedDeduction : standardDeduction;
  const taxableSplit = splitFederalTaxableIncome2025(ordinaryIncome, preferredIncome, aboveLineDeduction + standardOrItemizedDeduction);
  const ordinaryTax = fedTax2025Ordinary(taxableSplit.ordinaryTaxable, filingStatus);
  const prefTax = fedPrefTax2025(taxableSplit.ordinaryTaxable, taxableSplit.prefTaxable, filingStatus);
  const regularTaxCeiling = fedTax2025Ordinary(taxableSplit.taxableIncome, filingStatus);
  const incomeTaxBeforeNiit = Math.min(ordinaryTax + prefTax, regularTaxCeiling);
  const netInvestmentIncome = nonNegative(input.netInvestmentIncome);
  const niitThreshold = filingStatus === "mfj" ? 250_000 : filingStatus === "mfs" ? 125_000 : 200_000;
  const niitBase = Math.min(netInvestmentIncome, Math.max(adjustedGrossIncome - niitThreshold, 0));
  const niit = niitBase * 0.038;
  const incomeTax = incomeTaxBeforeNiit + niit;

  return {
    filingStatus,
    ordinaryIncomeExcludingSocialSecurity,
    socialSecurityBenefits,
    taxableSocialSecurity,
    adjustedGrossIncome,
    deductionMode,
    deductions: {
      aboveLineDeduction,
      otherAboveLineDeductions,
      capitalLossRaw,
      capitalLossDeduction,
      standardDeduction,
      itemizedDeduction,
      mortgageInterest,
      propertyTax,
      stateIncomeTax: nonNegative(input.stateIncomeTax),
      saltEntered,
      saltCap,
      saltDeduction,
      otherItemized,
      standardOrItemizedDeduction,
      total: aboveLineDeduction + standardOrItemizedDeduction,
    },
    ...taxableSplit,
    ordinaryTax,
    prefTax,
    regularTaxCeiling,
    niitThreshold,
    niitBase,
    niit,
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
  const profile = getLocalTaxProfile2025(String(input.localityId || "none"));
  const residency = input.residency === "nonresident" ? "nonresident" : "resident";
  const customProfile = profile.id === "custom";
  const filingStatus = input.filingStatus || "single";
  const brackets = profile.bracketsByStatus?.[filingStatus] || profile.brackets || [];
  const selectedProfile = { ...profile, brackets };
  const presetBase = residency === "nonresident" ? profile.nonresidentBase ?? profile.base : profile.base;
  const baseSelection = localTaxBaseKeys.reduce((selection, key) => {
    selection[key] = customProfile ? input.customTaxableBase?.[key] === true : presetBase[key];
    return selection;
  }, {} as LocalTaxBaseSelection);
  const baseAmounts = localTaxBaseKeys.reduce((amounts, key) => {
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

  const residentRate = customProfile ? nonNegative(input.customRate) : profile.residentRate;
  const nonresidentRate = customProfile ? nonNegative(input.customNonresidentRate) : profile.nonresidentRate ?? profile.residentRate;
  const rate = residency === "nonresident" ? nonresidentRate : residentRate;
  return { enabled, residency, taxableIncome, ...localFlatTax(taxableIncome, rate), baseSelection, baseAmounts, profile: selectedProfile };
}

export function calculateTaxPlan2025(input: TaxPlan2025Input) {
  const filingStatus = input.filingStatus;
  const state = calculateStateTax2025({
    state: input.state,
    filingStatus,
    grossIncome: input.stateGrossIncome,
    deductionMode: input.stateDeductionMode,
    standardDeduction: input.stateStandardDeduction,
    itemizedDeductions: input.stateItemizedDeductions,
  });
  const federal = calculateFederalTax2025({
    filingStatus,
    ordinaryIncomeExcludingSocialSecurity: input.ordinaryIncomeExcludingSocialSecurity,
    preferredIncome: input.preferredIncome,
    socialSecurityBenefits: input.socialSecurityBenefits,
    taxExemptInterest: input.taxExemptInterest,
    netInvestmentIncome: input.netInvestmentIncome,
    deductionMode: input.federalDeductionMode,
    aboveLineDeductions: input.federalAboveLineDeductions,
    itemizedDeductions: input.federalItemizedDeductions,
    stateIncomeTax: state.incomeTax,
  });
  const payroll = calculateW2PayrollTax(nonNegative(input.w2Income), filingStatus, state.state);
  const nextDollarPayroll = calculateW2PayrollTax(nonNegative(input.w2Income) + 1, filingStatus, state.state);
  const marginalPayrollRate = Math.max(nextDollarPayroll.total - payroll.total, 0);
  const local = calculateLocalTax2025({ ...input.local, filingStatus, stateIncomeTax: state.incomeTax, stateMarginalRate: state.marginalRate });
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
