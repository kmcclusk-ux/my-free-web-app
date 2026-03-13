"use strict";
// C:\myapp\amplify\backend\function\helloWorld\src\taxCalcs.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.fedTax2025Mfj = fedTax2025Mfj;
exports.fedTax2025Single = fedTax2025Single;
exports.fedTax2025Ordinary = fedTax2025Ordinary;
exports.fedPrefTax2024 = fedPrefTax2024;
exports.caTax2025Mfj = caTax2025Mfj;
exports.niitTax = niitTax;
function computeBracketedTax(taxableIncome, brackets) {
    const ti = Number(taxableIncome);
    if (!Number.isFinite(ti) || ti <= 0)
        return 0;
    let tax = 0;
    let prevMax = 0;
    for (const b of brackets) {
        if (ti <= prevMax)
            break;
        const amt = Math.min(ti, b.max) - prevMax;
        if (amt > 0)
            tax += amt * b.rate;
        if (ti <= b.max)
            break;
        prevMax = b.max;
    }
    return tax;
}
/**
 * 2025 MFJ ordinary income tax on taxable income (after deductions).
 */
function fedTax2025Mfj(taxableIncome) {
    const brackets = [
        { max: 23850, rate: 0.10 },
        { max: 96950, rate: 0.12 },
        { max: 206700, rate: 0.22 },
        { max: 394600, rate: 0.24 },
        { max: 501050, rate: 0.32 },
        { max: 751600, rate: 0.35 },
        { max: Number.POSITIVE_INFINITY, rate: 0.37 },
    ];
    return computeBracketedTax(taxableIncome, brackets);
}
/**
 * 2025 Single ordinary income tax on taxable income (after deductions).
 */
function fedTax2025Single(taxableIncome) {
    const brackets = [
        { max: 11925, rate: 0.10 },
        { max: 48475, rate: 0.12 },
        { max: 103350, rate: 0.22 },
        { max: 197300, rate: 0.24 },
        { max: 250525, rate: 0.32 },
        { max: 626350, rate: 0.35 },
        { max: Number.POSITIVE_INFINITY, rate: 0.37 },
    ];
    return computeBracketedTax(taxableIncome, brackets);
}
function fedTax2025Ordinary(taxableIncome, filingStatus) {
    return filingStatus === "mfj" ? fedTax2025Mfj(taxableIncome) : fedTax2025Single(taxableIncome);
}
/**
 * Preferential tax (LTCG + qualified dividends) on the preferential portion ONLY.
 * Uses 2024 thresholds.
 */
function fedPrefTax2024(ordinaryTaxable, prefTaxable, filingStatus) {
    const ord = Number(ordinaryTaxable) || 0;
    const pref = Number(prefTaxable) || 0;
    if (!Number.isFinite(pref) || pref <= 0)
        return 0;
    const fs = (filingStatus || "single").toLowerCase();
    const thresholds = {
        single: { z0: 47025, z15: 518900 },
        mfj: { z0: 94050, z15: 583750 },
        mfs: { z0: 47025, z15: 291850 },
        hoh: { z0: 63000, z15: 551350 },
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
/**
 * Calculates 2025 California income tax for Married Filing Jointly (MFJ)
 * given CA taxable income (Form 540, line 19).
 */
function caTax2025Mfj(taxableIncome) {
    const ti = Number(taxableIncome);
    if (!Number.isFinite(ti) || ti <= 0)
        return 0;
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
    ];
    let tax = 0;
    let prevMax = 0;
    for (const b of brackets) {
        if (ti <= prevMax)
            break;
        const incomeInBracket = Math.min(ti, b.max) - prevMax;
        if (incomeInBracket > 0)
            tax += incomeInBracket * b.rate;
        if (ti <= b.max)
            break;
        prevMax = b.max;
    }
    if (ti > 1000000) {
        tax += (ti - 1000000) * 0.01;
    }
    return tax;
}
/**
 * Net Investment Income Tax (NIIT) - 3.8% surtax.
 */
function niitTax(magi, netInvestmentIncome, filingStatus) {
    const m = Number(magi);
    const nii = Number(netInvestmentIncome);
    if (!Number.isFinite(m) || m <= 0)
        return 0;
    if (!Number.isFinite(nii) || nii <= 0)
        return 0;
    const fs = (filingStatus || "single").toLowerCase();
    const threshold = fs === "mfj" ? 250000 : fs === "mfs" ? 125000 : 200000;
    const excessMagi = Math.max(0, m - threshold);
    const base = Math.min(nii, excessMagi);
    return base * 0.038;
}
