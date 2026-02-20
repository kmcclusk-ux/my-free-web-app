"use strict";

/**
 * 2025 MFJ ordinary income tax on *taxable income*.
 * Brackets per IRS inflation-adjusted 2025 rates.
 */
export function fedTax2025Mfj(taxableIncome: number): number {
  const ti = Number(taxableIncome);
  if (!Number.isFinite(ti) || ti <= 0) return 0;

  const brackets = [
    { max: 23850, rate: 0.10 },
    { max: 96950, rate: 0.12 },
    { max: 206700, rate: 0.22 },
    { max: 394600, rate: 0.24 },
    { max: 501050, rate: 0.32 },
    { max: 751600, rate: 0.35 },
    { max: Number.POSITIVE_INFINITY, rate: 0.37 },
  ] as const;

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
 * Preferential tax (LTCG + qualified dividends) on the preferential portion ONLY.
 * Uses 2024 thresholds.
 */
export function fedPrefTax2024(
  ordinaryTaxable: number,
  prefTaxable: number,
  filingStatus: "single" | "mfj" | "mfs" | "hoh"
): number {
  const ord = Number(ordinaryTaxable) || 0;
  const pref = Number(prefTaxable) || 0;
  if (!Number.isFinite(pref) || pref <= 0) return 0;

  const fs = (filingStatus || "single").toLowerCase() as
    | "single"
    | "mfj"
    | "mfs"
    | "hoh";

  const thresholds = {
    single: { z0: 47025, z15: 518900 },
    mfj: { z0: 94050, z15: 583750 },
    mfs: { z0: 47025, z15: 291850 },
    hoh: { z0: 63000, z15: 551350 },
  } as const;

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