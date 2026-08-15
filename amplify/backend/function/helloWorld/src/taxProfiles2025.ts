// 2025 state marginal-rate schedules on state taxable income.
// Source: Tax Foundation 2025 state rate and bracket compilation, based on state statutes, forms, and instructions.

export type StateTaxFilingStatus = "single" | "mfj" | "mfs" | "hoh";
export type StateTaxBracket = { threshold: number; rate: number };
export type StateTaxProfile = {
  code: string;
  name: string;
  single: StateTaxBracket[];
  mfj: StateTaxBracket[];
  mfs?: StateTaxBracket[];
  hoh?: StateTaxBracket[];
  note?: string;
};

const none: StateTaxBracket[] = [];
const same = (brackets: StateTaxBracket[]) => ({ single: brackets, mfj: brackets });

export const stateTaxProfiles: StateTaxProfile[] = [
  { code: "AL", name: "Alabama", single: [{ threshold: 0, rate: 0.02 }, { threshold: 500, rate: 0.04 }, { threshold: 3000, rate: 0.05 }], mfj: [{ threshold: 0, rate: 0.02 }, { threshold: 1000, rate: 0.04 }, { threshold: 6000, rate: 0.05 }] },
  { code: "AK", name: "Alaska", single: none, mfj: none, note: "No broad-based individual income tax." },
  { code: "AZ", name: "Arizona", ...same([{ threshold: 0, rate: 0.025 }]) },
  { code: "AR", name: "Arkansas", ...same([{ threshold: 0, rate: 0.02 }, { threshold: 4500, rate: 0.039 }]) },
  { code: "CA", name: "California", single: [{ threshold: 0, rate: 0.01 }, { threshold: 11079, rate: 0.02 }, { threshold: 26264, rate: 0.04 }, { threshold: 41452, rate: 0.06 }, { threshold: 57542, rate: 0.08 }, { threshold: 72724, rate: 0.093 }, { threshold: 371479, rate: 0.103 }, { threshold: 445771, rate: 0.113 }, { threshold: 742953, rate: 0.123 }, { threshold: 1000000, rate: 0.133 }], mfj: [{ threshold: 0, rate: 0.01 }, { threshold: 22158, rate: 0.02 }, { threshold: 52528, rate: 0.04 }, { threshold: 82904, rate: 0.06 }, { threshold: 115084, rate: 0.08 }, { threshold: 145448, rate: 0.093 }, { threshold: 742958, rate: 0.103 }, { threshold: 891542, rate: 0.113 }, { threshold: 1000000, rate: 0.123 }, { threshold: 1485906, rate: 0.133 }], hoh: [{ threshold: 0, rate: 0.01 }, { threshold: 22173, rate: 0.02 }, { threshold: 52530, rate: 0.04 }, { threshold: 67716, rate: 0.06 }, { threshold: 83805, rate: 0.08 }, { threshold: 98990, rate: 0.093 }, { threshold: 505208, rate: 0.103 }, { threshold: 606251, rate: 0.113 }, { threshold: 1000000, rate: 0.123 }, { threshold: 1010417, rate: 0.133 }] },
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
  { code: "NJ", name: "New Jersey", single: [{ threshold: 0, rate: 0.014 }, { threshold: 20000, rate: 0.0175 }, { threshold: 35000, rate: 0.035 }, { threshold: 40000, rate: 0.05525 }, { threshold: 75000, rate: 0.0637 }, { threshold: 500000, rate: 0.0897 }, { threshold: 1000000, rate: 0.1075 }], mfj: [{ threshold: 0, rate: 0.014 }, { threshold: 20000, rate: 0.0175 }, { threshold: 50000, rate: 0.0245 }, { threshold: 70000, rate: 0.035 }, { threshold: 80000, rate: 0.05525 }, { threshold: 150000, rate: 0.0637 }, { threshold: 500000, rate: 0.0897 }, { threshold: 1000000, rate: 0.1075 }], hoh: [{ threshold: 0, rate: 0.014 }, { threshold: 20000, rate: 0.0175 }, { threshold: 50000, rate: 0.0245 }, { threshold: 70000, rate: 0.035 }, { threshold: 80000, rate: 0.05525 }, { threshold: 150000, rate: 0.0637 }, { threshold: 500000, rate: 0.0897 }, { threshold: 1000000, rate: 0.1075 }] },
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

export function getStateTaxProfile(stateCode: string): StateTaxProfile {
  const normalized = String(stateCode || "CA").trim().toUpperCase();
  return stateTaxProfiles.find((profile) => profile.code === normalized) ?? stateTaxProfiles.find((profile) => profile.code === "CA")!;
}

function computeThresholdTax(taxableIncome: number, brackets: ReadonlyArray<StateTaxBracket>): number {
  const ti = Number(taxableIncome);
  if (!Number.isFinite(ti) || ti <= 0 || brackets.length === 0) return 0;

  const sorted = [...brackets].sort((a, b) => a.threshold - b.threshold);
  let tax = 0;

  for (let index = 0; index < sorted.length; index += 1) {
    const bracket = sorted[index];
    const nextThreshold = sorted[index + 1]?.threshold ?? Number.POSITIVE_INFINITY;
    if (ti <= bracket.threshold) continue;
    const amount = Math.min(ti, nextThreshold) - bracket.threshold;
    if (amount > 0) tax += amount * bracket.rate;
    if (ti <= nextThreshold) break;
  }

  return tax;
}

export function stateTax2025(taxableIncome: number, stateCode: string, filingStatus: StateTaxFilingStatus = "single") {
  const profile = getStateTaxProfile(stateCode);
  const brackets =
    filingStatus === "mfj" ? profile.mfj :
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
