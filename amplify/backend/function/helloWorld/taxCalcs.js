"use strict";
// C:\myapp\amplify\backend\function\helloWorld\src\taxCalcs.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.stateTaxProfiles = void 0;
exports.getStateTaxProfile = getStateTaxProfile;
exports.stateTax2025 = stateTax2025;
exports.fedTax2025Mfj = fedTax2025Mfj;
exports.fedTax2025Single = fedTax2025Single;
exports.fedTax2025Mfs = fedTax2025Mfs;
exports.fedTax2025Hoh = fedTax2025Hoh;
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
const none = [];
const same = (brackets) => ({ single: brackets, mfj: brackets });
exports.stateTaxProfiles = [
    { code: "AL", name: "Alabama", single: [{ threshold: 0, rate: 0.02 }, { threshold: 500, rate: 0.04 }, { threshold: 3000, rate: 0.05 }], mfj: [{ threshold: 0, rate: 0.02 }, { threshold: 1000, rate: 0.04 }, { threshold: 6000, rate: 0.05 }] },
    { code: "AK", name: "Alaska", single: none, mfj: none, note: "No broad-based individual income tax." },
    { code: "AZ", name: "Arizona", ...same([{ threshold: 0, rate: 0.025 }]) },
    { code: "AR", name: "Arkansas", ...same([{ threshold: 0, rate: 0.02 }, { threshold: 4500, rate: 0.039 }]) },
    { code: "CA", name: "California", single: [{ threshold: 0, rate: 0.01 }, { threshold: 10756, rate: 0.02 }, { threshold: 25499, rate: 0.04 }, { threshold: 40245, rate: 0.06 }, { threshold: 55866, rate: 0.08 }, { threshold: 70606, rate: 0.093 }, { threshold: 360659, rate: 0.103 }, { threshold: 432787, rate: 0.113 }, { threshold: 721314, rate: 0.123 }, { threshold: 1000000, rate: 0.133 }], mfj: [{ threshold: 0, rate: 0.01 }, { threshold: 21512, rate: 0.02 }, { threshold: 50998, rate: 0.04 }, { threshold: 80490, rate: 0.06 }, { threshold: 111732, rate: 0.08 }, { threshold: 141732, rate: 0.093 }, { threshold: 721318, rate: 0.103 }, { threshold: 865574, rate: 0.113 }, { threshold: 1000000, rate: 0.123 }, { threshold: 1442628, rate: 0.133 }] },
    { code: "CO", name: "Colorado", ...same([{ threshold: 0, rate: 0.044 }]) },
    { code: "CT", name: "Connecticut", single: [{ threshold: 0, rate: 0.02 }, { threshold: 10000, rate: 0.045 }, { threshold: 50000, rate: 0.055 }, { threshold: 100000, rate: 0.06 }, { threshold: 200000, rate: 0.065 }, { threshold: 250000, rate: 0.069 }, { threshold: 500000, rate: 0.0699 }], mfj: [{ threshold: 0, rate: 0.02 }, { threshold: 20000, rate: 0.045 }, { threshold: 100000, rate: 0.055 }, { threshold: 200000, rate: 0.06 }, { threshold: 400000, rate: 0.065 }, { threshold: 500000, rate: 0.069 }, { threshold: 1000000, rate: 0.0699 }] },
    { code: "DE", name: "Delaware", ...same([{ threshold: 2000, rate: 0.022 }, { threshold: 5000, rate: 0.039 }, { threshold: 10000, rate: 0.048 }, { threshold: 20000, rate: 0.052 }, { threshold: 25000, rate: 0.0555 }, { threshold: 60000, rate: 0.066 }]) },
    { code: "FL", name: "Florida", single: none, mfj: none, note: "No broad-based individual income tax." },
    { code: "GA", name: "Georgia", ...same([{ threshold: 0, rate: 0.0539 }]) },
    { code: "HI", name: "Hawaii", single: [{ threshold: 0, rate: 0.014 }, { threshold: 9600, rate: 0.032 }, { threshold: 14400, rate: 0.055 }, { threshold: 19200, rate: 0.064 }, { threshold: 24000, rate: 0.068 }, { threshold: 36000, rate: 0.072 }, { threshold: 48000, rate: 0.076 }, { threshold: 125000, rate: 0.079 }, { threshold: 175000, rate: 0.0825 }, { threshold: 225000, rate: 0.09 }, { threshold: 275000, rate: 0.10 }, { threshold: 325000, rate: 0.11 }], mfj: [{ threshold: 0, rate: 0.014 }, { threshold: 19200, rate: 0.032 }, { threshold: 28800, rate: 0.055 }, { threshold: 38400, rate: 0.064 }, { threshold: 48000, rate: 0.068 }, { threshold: 72000, rate: 0.072 }, { threshold: 96000, rate: 0.076 }, { threshold: 250000, rate: 0.079 }, { threshold: 350000, rate: 0.0825 }, { threshold: 450000, rate: 0.09 }, { threshold: 550000, rate: 0.10 }, { threshold: 650000, rate: 0.11 }] },
    { code: "ID", name: "Idaho", single: [{ threshold: 4673, rate: 0.05695 }], mfj: [{ threshold: 9346, rate: 0.05695 }] },
    { code: "IL", name: "Illinois", ...same([{ threshold: 0, rate: 0.0495 }]) },
    { code: "IN", name: "Indiana", ...same([{ threshold: 0, rate: 0.03 }]) },
    { code: "IA", name: "Iowa", ...same([{ threshold: 0, rate: 0.038 }]) },
    { code: "KS", name: "Kansas", single: [{ threshold: 0, rate: 0.052 }, { threshold: 23000, rate: 0.0558 }], mfj: [{ threshold: 0, rate: 0.052 }, { threshold: 46000, rate: 0.0558 }] },
    { code: "KY", name: "Kentucky", ...same([{ threshold: 0, rate: 0.04 }]) },
    { code: "LA", name: "Louisiana", ...same([{ threshold: 0, rate: 0.03 }]) },
    { code: "ME", name: "Maine", single: [{ threshold: 0, rate: 0.058 }, { threshold: 26800, rate: 0.0675 }, { threshold: 63450, rate: 0.0715 }], mfj: [{ threshold: 0, rate: 0.058 }, { threshold: 53600, rate: 0.0675 }, { threshold: 126900, rate: 0.0715 }] },
    { code: "MD", name: "Maryland", single: [{ threshold: 0, rate: 0.02 }, { threshold: 1000, rate: 0.03 }, { threshold: 2000, rate: 0.04 }, { threshold: 3000, rate: 0.0475 }, { threshold: 100000, rate: 0.05 }, { threshold: 125000, rate: 0.0525 }, { threshold: 150000, rate: 0.055 }, { threshold: 250000, rate: 0.0575 }], mfj: [{ threshold: 0, rate: 0.02 }, { threshold: 1000, rate: 0.03 }, { threshold: 2000, rate: 0.04 }, { threshold: 3000, rate: 0.0475 }, { threshold: 150000, rate: 0.05 }, { threshold: 175000, rate: 0.0525 }, { threshold: 225000, rate: 0.055 }, { threshold: 300000, rate: 0.0575 }], note: "Local Maryland income taxes are not included." },
    { code: "MA", name: "Massachusetts", ...same([{ threshold: 0, rate: 0.05 }, { threshold: 1083150, rate: 0.09 }]) },
    { code: "MI", name: "Michigan", ...same([{ threshold: 0, rate: 0.0425 }]) },
    { code: "MN", name: "Minnesota", single: [{ threshold: 0, rate: 0.0535 }, { threshold: 32570, rate: 0.068 }, { threshold: 106990, rate: 0.0785 }, { threshold: 198630, rate: 0.0985 }], mfj: [{ threshold: 0, rate: 0.0535 }, { threshold: 47620, rate: 0.068 }, { threshold: 189180, rate: 0.0785 }, { threshold: 330410, rate: 0.0985 }] },
    { code: "MS", name: "Mississippi", ...same([{ threshold: 10000, rate: 0.044 }]) },
    { code: "MO", name: "Missouri", single: [{ threshold: 1313, rate: 0.02 }, { threshold: 2626, rate: 0.025 }, { threshold: 3939, rate: 0.03 }, { threshold: 5252, rate: 0.035 }, { threshold: 6565, rate: 0.04 }, { threshold: 7878, rate: 0.045 }, { threshold: 9191, rate: 0.047 }], mfj: [{ threshold: 1313, rate: 0.015 }, { threshold: 2626, rate: 0.025 }, { threshold: 3939, rate: 0.03 }, { threshold: 5252, rate: 0.035 }, { threshold: 6565, rate: 0.04 }, { threshold: 7878, rate: 0.045 }, { threshold: 9191, rate: 0.047 }] },
    { code: "MT", name: "Montana", single: [{ threshold: 0, rate: 0.047 }, { threshold: 21100, rate: 0.059 }], mfj: [{ threshold: 0, rate: 0.047 }, { threshold: 42200, rate: 0.059 }] },
    { code: "NE", name: "Nebraska", single: [{ threshold: 0, rate: 0.0246 }, { threshold: 4030, rate: 0.0351 }, { threshold: 24120, rate: 0.0501 }, { threshold: 38870, rate: 0.052 }], mfj: [{ threshold: 0, rate: 0.0246 }, { threshold: 8040, rate: 0.0351 }, { threshold: 48250, rate: 0.0501 }, { threshold: 77730, rate: 0.052 }] },
    { code: "NV", name: "Nevada", single: none, mfj: none, note: "No broad-based individual income tax." },
    { code: "NH", name: "New Hampshire", single: none, mfj: none, note: "No broad-based individual income tax." },
    { code: "NJ", name: "New Jersey", single: [{ threshold: 0, rate: 0.014 }, { threshold: 20000, rate: 0.0175 }, { threshold: 50000, rate: 0.0245 }, { threshold: 35000, rate: 0.035 }, { threshold: 40000, rate: 0.05525 }, { threshold: 75000, rate: 0.0637 }, { threshold: 500000, rate: 0.0897 }, { threshold: 1000000, rate: 0.1075 }].sort((a, b) => a.threshold - b.threshold), mfj: [{ threshold: 0, rate: 0.014 }, { threshold: 20000, rate: 0.0175 }, { threshold: 50000, rate: 0.0245 }, { threshold: 70000, rate: 0.035 }, { threshold: 80000, rate: 0.05525 }, { threshold: 150000, rate: 0.0637 }, { threshold: 500000, rate: 0.0897 }, { threshold: 1000000, rate: 0.1075 }] },
    { code: "NM", name: "New Mexico", single: [{ threshold: 0, rate: 0.015 }, { threshold: 5500, rate: 0.032 }, { threshold: 16500, rate: 0.043 }, { threshold: 33500, rate: 0.047 }, { threshold: 66500, rate: 0.049 }, { threshold: 210000, rate: 0.059 }], mfj: [{ threshold: 0, rate: 0.015 }, { threshold: 8000, rate: 0.032 }, { threshold: 25000, rate: 0.043 }, { threshold: 50000, rate: 0.047 }, { threshold: 100000, rate: 0.049 }, { threshold: 315500, rate: 0.059 }] },
    { code: "NY", name: "New York", single: [{ threshold: 0, rate: 0.04 }, { threshold: 8500, rate: 0.045 }, { threshold: 11700, rate: 0.0525 }, { threshold: 13900, rate: 0.055 }, { threshold: 80650, rate: 0.06 }, { threshold: 215400, rate: 0.0685 }, { threshold: 1077550, rate: 0.0965 }, { threshold: 5000000, rate: 0.103 }, { threshold: 25000000, rate: 0.109 }], mfj: [{ threshold: 0, rate: 0.04 }, { threshold: 17150, rate: 0.045 }, { threshold: 23600, rate: 0.0525 }, { threshold: 27900, rate: 0.055 }, { threshold: 161550, rate: 0.06 }, { threshold: 323200, rate: 0.0685 }, { threshold: 2155350, rate: 0.0965 }, { threshold: 5000000, rate: 0.103 }, { threshold: 25000000, rate: 0.109 }], note: "New York City/Yonkers local income taxes are not included." },
    { code: "NC", name: "North Carolina", ...same([{ threshold: 0, rate: 0.0425 }]) },
    { code: "ND", name: "North Dakota", single: [{ threshold: 48475, rate: 0.0195 }, { threshold: 244825, rate: 0.025 }], mfj: [{ threshold: 80975, rate: 0.0195 }, { threshold: 298075, rate: 0.025 }] },
    { code: "OH", name: "Ohio", ...same([{ threshold: 26050, rate: 0.0275 }]), note: "Ohio local income taxes are not included." },
    { code: "OK", name: "Oklahoma", single: [{ threshold: 0, rate: 0.0025 }, { threshold: 1000, rate: 0.0075 }, { threshold: 2500, rate: 0.0175 }, { threshold: 3750, rate: 0.0275 }, { threshold: 4900, rate: 0.0375 }, { threshold: 7200, rate: 0.0475 }], mfj: [{ threshold: 0, rate: 0.0025 }, { threshold: 2000, rate: 0.0075 }, { threshold: 5000, rate: 0.0175 }, { threshold: 7500, rate: 0.0275 }, { threshold: 9800, rate: 0.0375 }, { threshold: 14400, rate: 0.0475 }] },
    { code: "OR", name: "Oregon", single: [{ threshold: 0, rate: 0.0475 }, { threshold: 4400, rate: 0.0675 }, { threshold: 11050, rate: 0.0875 }, { threshold: 125000, rate: 0.099 }], mfj: [{ threshold: 0, rate: 0.0475 }, { threshold: 8800, rate: 0.0675 }, { threshold: 22100, rate: 0.0875 }, { threshold: 250000, rate: 0.099 }] },
    { code: "PA", name: "Pennsylvania", ...same([{ threshold: 0, rate: 0.0307 }]), note: "Local earned-income taxes are not included." },
    { code: "RI", name: "Rhode Island", ...same([{ threshold: 0, rate: 0.0375 }, { threshold: 79900, rate: 0.0475 }, { threshold: 181650, rate: 0.0599 }]) },
    { code: "SC", name: "South Carolina", ...same([{ threshold: 0, rate: 0 }, { threshold: 3560, rate: 0.03 }, { threshold: 17830, rate: 0.062 }]) },
    { code: "SD", name: "South Dakota", single: none, mfj: none, note: "No broad-based individual income tax." },
    { code: "TN", name: "Tennessee", single: none, mfj: none, note: "No broad-based individual income tax." },
    { code: "TX", name: "Texas", single: none, mfj: none, note: "No broad-based individual income tax." },
    { code: "UT", name: "Utah", ...same([{ threshold: 0, rate: 0.0455 }]) },
    { code: "VT", name: "Vermont", single: [{ threshold: 0, rate: 0.0335 }, { threshold: 47900, rate: 0.066 }, { threshold: 116000, rate: 0.076 }, { threshold: 242000, rate: 0.0875 }], mfj: [{ threshold: 0, rate: 0.0335 }, { threshold: 79950, rate: 0.066 }, { threshold: 193300, rate: 0.076 }, { threshold: 294600, rate: 0.0875 }] },
    { code: "VA", name: "Virginia", ...same([{ threshold: 0, rate: 0.02 }, { threshold: 3000, rate: 0.03 }, { threshold: 5000, rate: 0.05 }, { threshold: 17000, rate: 0.0575 }]) },
    { code: "WA", name: "Washington", single: none, mfj: none, note: "No broad-based individual income tax; Washington capital-gains excise tax is not modeled." },
    { code: "WV", name: "West Virginia", ...same([{ threshold: 0, rate: 0.0222 }, { threshold: 10000, rate: 0.0296 }, { threshold: 25000, rate: 0.0333 }, { threshold: 40000, rate: 0.0444 }, { threshold: 60000, rate: 0.0482 }]) },
    { code: "WI", name: "Wisconsin", single: [{ threshold: 0, rate: 0.035 }, { threshold: 14680, rate: 0.044 }, { threshold: 29370, rate: 0.053 }, { threshold: 323290, rate: 0.0765 }], mfj: [{ threshold: 0, rate: 0.035 }, { threshold: 19580, rate: 0.044 }, { threshold: 39150, rate: 0.053 }, { threshold: 431060, rate: 0.0765 }] },
    { code: "WY", name: "Wyoming", single: none, mfj: none, note: "No broad-based individual income tax." },
    { code: "DC", name: "Washington, D.C.", ...same([{ threshold: 0, rate: 0.04 }, { threshold: 10000, rate: 0.06 }, { threshold: 40000, rate: 0.065 }, { threshold: 60000, rate: 0.085 }, { threshold: 250000, rate: 0.0925 }, { threshold: 500000, rate: 0.0975 }, { threshold: 1000000, rate: 0.1075 }]) },
];
function getStateTaxProfile(stateCode) {
    const normalized = String(stateCode || "CA").trim().toUpperCase();
    return exports.stateTaxProfiles.find((profile) => profile.code === normalized) ?? exports.stateTaxProfiles.find((profile) => profile.code === "CA");
}
function computeThresholdTax(taxableIncome, brackets) {
    const ti = Number(taxableIncome);
    if (!Number.isFinite(ti) || ti <= 0 || brackets.length === 0)
        return 0;
    const sorted = [...brackets].sort((a, b) => a.threshold - b.threshold);
    let tax = 0;
    for (let index = 0; index < sorted.length; index += 1) {
        const bracket = sorted[index];
        const nextThreshold = sorted[index + 1]?.threshold ?? Number.POSITIVE_INFINITY;
        if (ti <= bracket.threshold)
            continue;
        const amount = Math.min(ti, nextThreshold) - bracket.threshold;
        if (amount > 0)
            tax += amount * bracket.rate;
        if (ti <= nextThreshold)
            break;
    }
    return tax;
}
function stateTax2025(taxableIncome, stateCode, filingStatus = "single") {
    const profile = getStateTaxProfile(stateCode);
    const brackets = filingStatus === "mfj" ? profile.mfj :
        filingStatus === "mfs" ? profile.mfs ?? profile.single :
            filingStatus === "hoh" ? profile.hoh ?? profile.single :
                profile.single;
    return {
        state: profile.code,
        stateName: profile.name,
        taxableIncome: Number.isFinite(Number(taxableIncome)) ? Math.max(Number(taxableIncome), 0) : 0,
        filingStatus,
        tax: computeThresholdTax(taxableIncome, brackets),
        note: profile.note,
    };
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
/**
 * 2025 Married Filing Separately ordinary income tax on taxable income (after deductions).
 */
function fedTax2025Mfs(taxableIncome) {
    const brackets = [
        { max: 11925, rate: 0.10 },
        { max: 48475, rate: 0.12 },
        { max: 103350, rate: 0.22 },
        { max: 197300, rate: 0.24 },
        { max: 250525, rate: 0.32 },
        { max: 375800, rate: 0.35 },
        { max: Number.POSITIVE_INFINITY, rate: 0.37 },
    ];
    return computeBracketedTax(taxableIncome, brackets);
}
/**
 * 2025 Head of Household ordinary income tax on taxable income (after deductions).
 */
function fedTax2025Hoh(taxableIncome) {
    const brackets = [
        { max: 17000, rate: 0.10 },
        { max: 64850, rate: 0.12 },
        { max: 103350, rate: 0.22 },
        { max: 197300, rate: 0.24 },
        { max: 250500, rate: 0.32 },
        { max: 626350, rate: 0.35 },
        { max: Number.POSITIVE_INFINITY, rate: 0.37 },
    ];
    return computeBracketedTax(taxableIncome, brackets);
}
function fedTax2025Ordinary(taxableIncome, filingStatus) {
    switch (filingStatus) {
        case "mfj":
            return fedTax2025Mfj(taxableIncome);
        case "mfs":
            return fedTax2025Mfs(taxableIncome);
        case "hoh":
            return fedTax2025Hoh(taxableIncome);
        case "single":
        default:
            return fedTax2025Single(taxableIncome);
    }
}
/**
 * Preferential tax (LTCG + qualified dividends) on the preferential portion ONLY.
 * Uses 2025 thresholds. Function name is retained for API compatibility.
 */
function fedPrefTax2024(ordinaryTaxable, prefTaxable, filingStatus) {
    const ord = Number(ordinaryTaxable) || 0;
    const pref = Number(prefTaxable) || 0;
    if (!Number.isFinite(pref) || pref <= 0)
        return 0;
    const fs = (filingStatus || "single").toLowerCase();
    const thresholds = {
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
