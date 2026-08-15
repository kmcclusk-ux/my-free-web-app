// C:\myapp\amplify\backend\function\helloWorld\src\taxCalcs.ts

export type FilingStatus = "single" | "mfj" | "mfs" | "hoh";
export type LocalTaxBracket = { threshold: number; rate: number };

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
  const ti = Number(taxableIncome);
  if (!Number.isFinite(ti) || ti <= 0) return 0;

  const brackets = [
    { max: 21512, rate: 0.010 },
    { max: 50998, rate: 0.020 },
    { max: 80490, rate: 0.040 },
    { max: 111732, rate: 0.060 },
    { max: 141212, rate: 0.080 },
    { max: 721318, rate: 0.093 },
    { max: 865574, rate: 0.103 },
    { max: 1442628, rate: 0.113 },
    { max: Number.POSITIVE_INFINITY, rate: 0.123 },
  ] as const;

  let tax = 0;
  let prevMax = 0;

  for (const b of brackets) {
    if (ti <= prevMax) break;

    const incomeInBracket = Math.min(ti, b.max) - prevMax;
    if (incomeInBracket > 0) tax += incomeInBracket * b.rate;

    if (ti <= b.max) break;
    prevMax = b.max;
  }

  if (ti > 1_000_000) {
    tax += (ti - 1_000_000) * 0.01;
  }

  return tax;
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
    }))
    .sort((left, right) => left.threshold - right.threshold);
  const tax = sorted.reduce((total, bracket, index) => {
    const nextThreshold = sorted[index + 1]?.threshold ?? Number.POSITIVE_INFINITY;
    const taxableAtRate = Math.max(Math.min(income, nextThreshold) - bracket.threshold, 0);
    return total + taxableAtRate * bracket.rate;
  }, 0);
  const reachedBracket = sorted.filter((bracket) => income >= bracket.threshold).at(-1);
  return {
    tax,
    effectiveRate: tax / income,
    marginalRate: reachedBracket?.rate || 0,
  };
}
