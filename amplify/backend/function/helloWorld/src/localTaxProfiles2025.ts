export type LocalTaxBaseKey = "wages" | "selfEmployment" | "interest" | "dividends" | "capitalGains" | "rentalIncome" | "businessIncome" | "retirementIncome" | "socialSecurity";
export type LocalTaxBaseSelection = Record<LocalTaxBaseKey, boolean>;
export type LocalTaxBracket = { threshold: number; rate: number; baseTax?: number };
export type LocalTaxFilingStatus = "single" | "mfj" | "mfs" | "hoh";
export type LocalTaxProfile = {
  id: string;
  locality: string;
  state: string;
  kind: "none" | "flat" | "progressive" | "state-surcharge";
  residentRate: number;
  nonresidentRate?: number;
  brackets?: LocalTaxBracket[];
  bracketsByStatus?: Partial<Record<LocalTaxFilingStatus, LocalTaxBracket[]>>;
  base: LocalTaxBaseSelection;
  nonresidentBase?: LocalTaxBaseSelection;
  note: string;
};

export const localTaxBaseKeys: LocalTaxBaseKey[] = [
  "wages",
  "selfEmployment",
  "interest",
  "dividends",
  "capitalGains",
  "rentalIncome",
  "businessIncome",
  "retirementIncome",
  "socialSecurity",
];

const noLocalTaxBase = (): LocalTaxBaseSelection => ({
  wages: false,
  selfEmployment: false,
  interest: false,
  dividends: false,
  capitalGains: false,
  rentalIncome: false,
  businessIncome: false,
  retirementIncome: false,
  socialSecurity: false,
});

const earningsLocalTaxBase = (): LocalTaxBaseSelection => ({
  ...noLocalTaxBase(),
  wages: true,
  selfEmployment: true,
  businessIncome: true,
});
const broadLocalTaxBase = (): LocalTaxBaseSelection => ({
  wages: true,
  selfEmployment: true,
  interest: true,
  dividends: true,
  capitalGains: true,
  rentalIncome: true,
  businessIncome: true,
  retirementIncome: false,
  socialSecurity: false,
});
export const localTaxProfiles2025: LocalTaxProfile[] = [
  { id: "none", locality: "No local income tax", state: "", kind: "none", residentRate: 0, nonresidentRate: 0, base: noLocalTaxBase(), note: "No city, county, or district income tax is applied." },
  { id: "custom", locality: "Custom / manual local tax", state: "", kind: "flat", residentRate: 0, nonresidentRate: 0, base: earningsLocalTaxBase(), note: "Enter a local rate and choose which income categories are taxed." },
  { id: "ny-nyc", locality: "New York City", state: "NY", kind: "progressive", residentRate: 0.03876, nonresidentRate: 0, base: broadLocalTaxBase(), nonresidentBase: noLocalTaxBase(), brackets: [{ threshold: 0, rate: 0.03078, baseTax: 0 }, { threshold: 12000, rate: 0.03762, baseTax: 369 }, { threshold: 25000, rate: 0.03819, baseTax: 858 }, { threshold: 50000, rate: 0.03876, baseTax: 1813 }], bracketsByStatus: {
    single: [{ threshold: 0, rate: 0.03078, baseTax: 0 }, { threshold: 12000, rate: 0.03762, baseTax: 369 }, { threshold: 25000, rate: 0.03819, baseTax: 858 }, { threshold: 50000, rate: 0.03876, baseTax: 1813 }],
    mfs: [{ threshold: 0, rate: 0.03078, baseTax: 0 }, { threshold: 12000, rate: 0.03762, baseTax: 369 }, { threshold: 25000, rate: 0.03819, baseTax: 858 }, { threshold: 50000, rate: 0.03876, baseTax: 1813 }],
    mfj: [{ threshold: 0, rate: 0.03078, baseTax: 0 }, { threshold: 21600, rate: 0.03762, baseTax: 665 }, { threshold: 45000, rate: 0.03819, baseTax: 1545 }, { threshold: 90000, rate: 0.03876, baseTax: 3264 }],
    hoh: [{ threshold: 0, rate: 0.03078, baseTax: 0 }, { threshold: 14400, rate: 0.03762, baseTax: 443 }, { threshold: 30000, rate: 0.03819, baseTax: 1030 }, { threshold: 60000, rate: 0.03876, baseTax: 2176 }],
  }, note: "Broad personal income tax; generally follows New York taxable income categories and excludes Social Security." },
  { id: "ny-yonkers", locality: "Yonkers", state: "NY", kind: "state-surcharge", residentRate: 0.1675, nonresidentRate: 0.005, base: broadLocalTaxBase(), nonresidentBase: earningsLocalTaxBase(), note: "Residents pay 16.75% of New York State income tax; nonresidents pay 0.5% of Yonkers earnings after applicable exclusions." },
  { id: "oh-columbus", locality: "Columbus", state: "OH", kind: "flat", residentRate: 0.025, base: earningsLocalTaxBase(), note: "Ohio municipal income tax generally applies to wages and self-employment, not investment income." },
  { id: "oh-cleveland", locality: "Cleveland", state: "OH", kind: "flat", residentRate: 0.025, base: earningsLocalTaxBase(), note: "Ohio municipal income tax generally applies to earned income." },
  { id: "oh-cincinnati", locality: "Cincinnati", state: "OH", kind: "flat", residentRate: 0.018, base: earningsLocalTaxBase(), note: "Ohio municipal income tax generally applies to earned income." },
  { id: "oh-toledo", locality: "Toledo", state: "OH", kind: "flat", residentRate: 0.0225, base: earningsLocalTaxBase(), note: "Ohio municipal income tax generally applies to earned income." },
  { id: "oh-akron", locality: "Akron", state: "OH", kind: "flat", residentRate: 0.025, base: earningsLocalTaxBase(), note: "Ohio municipal income tax generally applies to earned income." },
  { id: "oh-dayton", locality: "Dayton", state: "OH", kind: "flat", residentRate: 0.025, base: earningsLocalTaxBase(), note: "Ohio municipal income tax generally applies to earned income." },
  { id: "pa-philadelphia", locality: "Philadelphia", state: "PA", kind: "flat", residentRate: 0.0374, nonresidentRate: 0.0343, base: earningsLocalTaxBase(), note: "Wage/earnings tax rate effective July 1, 2025; investment income, retirement income, and Social Security are outside this wage-tax base." },
  { id: "pa-pittsburgh", locality: "Pittsburgh", state: "PA", kind: "flat", residentRate: 0.03, base: earningsLocalTaxBase(), note: "Local earned-income tax; investment income is generally not taxed by this local tax." },
  { id: "mi-detroit", locality: "Detroit", state: "MI", kind: "flat", residentRate: 0.024, nonresidentRate: 0.012, base: broadLocalTaxBase(), nonresidentBase: { ...earningsLocalTaxBase(), rentalIncome: true }, note: "Residents include taxable interest, dividends, gains and rental profits. Nonresidents include city-sourced earnings, business and rental profits. Exemptions and source allocation must be entered separately." },
  { id: "mi-grand-rapids", locality: "Grand Rapids", state: "MI", kind: "flat", residentRate: 0.015, nonresidentRate: 0.0075, base: broadLocalTaxBase(), nonresidentBase: { ...earningsLocalTaxBase(), rentalIncome: true }, note: "Residents include investment income; nonresidents include city-sourced earnings and net business/rental profits, not personal intangible income." },
  { id: "mi-lansing", locality: "Lansing", state: "MI", kind: "flat", residentRate: 0.01, nonresidentRate: 0.005, base: broadLocalTaxBase(), nonresidentBase: { ...earningsLocalTaxBase(), rentalIncome: true }, note: "Residents include investment income; nonresidents include city-sourced earnings and net business/rental profits, not personal intangible income." },
  { id: "mi-flint", locality: "Flint", state: "MI", kind: "flat", residentRate: 0.01, nonresidentRate: 0.005, base: broadLocalTaxBase(), nonresidentBase: { ...earningsLocalTaxBase(), rentalIncome: true }, note: "Residents include investment income; nonresidents include city-sourced earnings and net business/rental profits, not personal intangible income." },
  { id: "md-county", locality: "Maryland county / Baltimore City", state: "MD", kind: "flat", residentRate: 0.032, base: broadLocalTaxBase(), note: "Maryland local income tax generally follows the Maryland income-tax base; choose the county-specific rate." },
  { id: "in-county", locality: "Indiana county", state: "IN", kind: "flat", residentRate: 0.02, base: broadLocalTaxBase(), note: "Indiana county income-tax rates vary by county; enter your county rate." },
  { id: "ky-louisville", locality: "Louisville / Jefferson County", state: "KY", kind: "flat", residentRate: 0.022, base: earningsLocalTaxBase(), note: "Occupational/license tax usually applies to wages and net profits, not investment income." },
  { id: "ky-lexington", locality: "Lexington-Fayette", state: "KY", kind: "flat", residentRate: 0.0225, base: earningsLocalTaxBase(), note: "Occupational license tax usually applies to wages and net profits." },
  { id: "mo-kansas-city", locality: "Kansas City", state: "MO", kind: "flat", residentRate: 0.01, base: earningsLocalTaxBase(), note: "Earnings tax on wages and self-employment earnings." },
  { id: "mo-st-louis", locality: "St. Louis", state: "MO", kind: "flat", residentRate: 0.01, base: earningsLocalTaxBase(), note: "Earnings tax on wages and self-employment earnings." },
  { id: "de-wilmington", locality: "Wilmington", state: "DE", kind: "flat", residentRate: 0.0125, base: earningsLocalTaxBase(), note: "City wage tax generally applies to wages and net profits." },
  { id: "al-birmingham", locality: "Birmingham", state: "AL", kind: "flat", residentRate: 0.01, base: earningsLocalTaxBase(), note: "Occupational tax on compensation earned from work." },
  { id: "al-gadsden", locality: "Gadsden", state: "AL", kind: "flat", residentRate: 0.02, base: earningsLocalTaxBase(), note: "Occupational tax rules vary; verify the current local rate." },
];

export function getLocalTaxProfile2025(localityId: string) {
  const profile = localTaxProfiles2025.find((candidate) => candidate.id === localityId);
  if (!profile) throw new RangeError("Unknown local tax jurisdiction. Select a listed locality or the custom profile.");
  return profile;
}

export type LocalTaxProfileResolutionInput = {
  localityId?: string;
  residency?: "resident" | "nonresident";
  overrideMode?: "preset" | "override";
  customRate?: number;
  customNonresidentRate?: number;
  customTaxableBase?: Partial<LocalTaxBaseSelection>;
};

export function resolveLocalTaxProfile2025(input: LocalTaxProfileResolutionInput = {}) {
  const preset = getLocalTaxProfile2025(input.localityId ?? "none");
  const residency = input.residency === "nonresident" ? "nonresident" : "resident";
  const hasOverrides = input.customRate !== undefined || input.customNonresidentRate !== undefined || input.customTaxableBase !== undefined;
  const mode = input.overrideMode ?? (preset.id !== "none" && (preset.id === "custom" || hasOverrides) ? "override" : "preset");
  if (mode !== "preset" && mode !== "override") throw new RangeError("Invalid local tax override mode.");
  const override = mode === "override";
  const presetBase = residency === "nonresident" ? preset.nonresidentBase ?? preset.base : preset.base;
  const baseSelection = { ...presetBase };
  const baseProvenance = {} as Record<LocalTaxBaseKey, "preset" | "override">;
  for (const key of localTaxBaseKeys) {
    const value = override ? input.customTaxableBase?.[key] : undefined;
    if (value !== undefined && typeof value !== "boolean") throw new TypeError(`Local tax base ${key} must be boolean.`);
    baseSelection[key] = value ?? presetBase[key];
    baseProvenance[key] = value === undefined ? "preset" : "override";
  }
  const residentRate = override ? input.customRate ?? preset.residentRate : preset.residentRate;
  const nonresidentRate = override ? input.customNonresidentRate ?? preset.nonresidentRate ?? residentRate : preset.nonresidentRate ?? preset.residentRate;
  for (const rate of [residentRate, nonresidentRate]) {
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new RangeError("Local tax rates must be finite fractions between 0 and 1.");
  }
  const rateOverridden = override && (residency === "nonresident"
    ? input.customNonresidentRate !== undefined || (preset.nonresidentRate === undefined && input.customRate !== undefined)
    : input.customRate !== undefined);
  if (preset.kind === "progressive" && override && ((input.customRate !== undefined && input.customRate !== preset.residentRate) || (input.customNonresidentRate !== undefined && input.customNonresidentRate !== (preset.nonresidentRate ?? 0)))) {
    throw new RangeError("Use the custom flat profile to replace a progressive local tax schedule with a rate.");
  }
  if (preset.kind === "none" && override) throw new RangeError("Select a locality or the custom profile before applying overrides.");
  const profile: LocalTaxProfile = {
    ...preset,
    residentRate,
    nonresidentRate,
    base: residency === "resident" ? { ...baseSelection } : { ...preset.base },
    nonresidentBase: residency === "nonresident" ? { ...baseSelection } : preset.nonresidentBase ? { ...preset.nonresidentBase } : undefined,
    brackets: preset.brackets?.map((bracket) => ({ ...bracket })),
    bracketsByStatus: preset.bracketsByStatus ? Object.fromEntries(Object.entries(preset.bracketsByStatus).map(([status, brackets]) => [status, brackets?.map((bracket) => ({ ...bracket }))])) : undefined,
  };
  return {
    profile,
    residency,
    rate: residency === "nonresident" ? nonresidentRate : residentRate,
    baseSelection,
    provenance: { mode, presetId: preset.id, rate: rateOverridden ? "override" as const : "preset" as const, base: baseProvenance },
  };
}
