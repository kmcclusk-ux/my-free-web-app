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
