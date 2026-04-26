import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type TabKey =
  | "investments"
  | "federal"
  | "state"
  | "calculator"
  | "tickers"
  | "taxTreatment"
  | "accounts"
  | "accountTaxType"
  | "investmentType";

type FilingStatus = "single" | "mfj";
type TaxResult = { calc: string; tax: number; ordinaryTax?: number; prefTax?: number; niit?: number };
type ApiError = { error: string };
type SaveState = "loading" | "ready" | "saving" | "saved" | "error";

type InvestmentRow = {
  id: number;
  description: string;
  account: string;
  category: string;
  totalInvestment: number;
  yearlyIncome: number;
  includeIncome: boolean;
  overrideProposal: boolean;
  symbol: string;
  newSymbol: string;
  newPercent: number;
};

type DerivedInvestmentRow = InvestmentRow & {
  monthlyIncome: number;
  currentPercent: number;
  effectiveSymbol: string;
  effectivePercent: number;
  extraData: number;
  filteredIncome: number;
  includedTotal: number;
  taxStatus: string;
  taxTreatment: string;
  investmentType: string;
  ordinaryMonthly: number;
  preferredMonthly: number;
  stateMonthly: number;
  nonTaxableMonthly: number;
  nonInvestmentIncome: number;
  cash: number;
  stocks: number;
  preferredStock: number;
  bonds: number;
  muniBond: number;
  muniInterest: number;
  businessDevelopment: number;
  coveredCall: number;
  realEstate: number;
  bitcoin: number;
};

type TickerRow = { id: number; symbol: string; percentReturn: number; category: string; taxTreatment: string; extraData: number; description: string; exDividend: string; divPayout: string };
type TaxTreatmentRow = { id: number; label: string };
type AccountRow = { id: number; account: string; taxStatus: string; dividendAccrued: string; includeInFreeCashflow: string };
type AccountTaxTypeRow = { id: number; taxStatus: string };
type InvestmentTypeRow = { id: number; name: string };

type FederalSettings = { filingStatus: FilingStatus; extraOrdinaryIncome: number; extraPreferredIncome: number; mortgageInterest: number; propertyTax: number; stateIncomeTax: number; standardDeduction: number; saltCap: number };
type StateSettings = { extraStateIncome: number; mortgageInterest: number; propertyTax: number; stateIncomeTax: number; standardDeduction: number };
type PlannerSettings = { federalWithholding: number; stateWithholding: number };
type InvestmentFavorite = { name: string; investmentKeys: string[]; createdAt: string };
type UiSettings = { investmentFavorites: InvestmentFavorite[] };
type TaxCalculatorInputs = {
  filingStatus: FilingStatus;
  federalStandardDeduction: number;
  federalSaltCap: number;
  caStandardDeduction: number;
  nonInvestmentOrdinaryIncome: number;
  otherOrdinaryInvestmentIncome: number;
  ordinaryDividends: number;
  qualifiedDividends: number;
  longTermCapitalGains: number;
  grossSocialSecurity: number;
  muniBondInterest: number;
  mortgageInterest: number;
  propertyTax: number;
  stateIncomeTax: number;
  federalWithholding: number;
  stateWithholding: number;
};
const initialTaxCalculatorInputs: TaxCalculatorInputs = {
  filingStatus: "mfj",
  federalStandardDeduction: 31500,
  federalSaltCap: 40400,
  caStandardDeduction: 11000,
  nonInvestmentOrdinaryIncome: 300000,
  otherOrdinaryInvestmentIncome: 0,
  ordinaryDividends: 0,
  qualifiedDividends: 0,
  longTermCapitalGains: 0,
  grossSocialSecurity: 0,
  muniBondInterest: 0,
  mortgageInterest: 0,
  propertyTax: 0,
  stateIncomeTax: 0,
  federalWithholding: 0,
  stateWithholding: 0,
};
type FederalNumericField = Exclude<keyof FederalSettings, "filingStatus">;

type WorkbookResponse = {
  workspaceId: string;
  tabs?: Partial<{
    investments: InvestmentRow[];
    tickers: TickerRow[];
    taxTreatment: TaxTreatmentRow[];
    accounts: AccountRow[];
    accountTaxType: AccountTaxTypeRow[];
    investmentType: InvestmentTypeRow[];
  }>;
  settings?: Partial<{ federal: FederalSettings; state: StateSettings; planner: PlannerSettings; ui: UiSettings }>;
  updatedAt?: string | null;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "local-dev";
const WORKSPACE_ID = "default";

const navItems: Array<{ key: TabKey; label: string; meta: string }> = [
  { key: "investments", label: "Investments", meta: "workbook grid" },
  { key: "federal", label: "Federal Tax", meta: "live backend" },
  { key: "state", label: "State Tax", meta: "CA worksheet" },
  { key: "calculator", label: "Tax Calculator", meta: "summary" },
  { key: "tickers", label: "Tickers", meta: "symbol lookups" },
  { key: "taxTreatment", label: "Tax Treatment", meta: "sheet labels" },
  { key: "accounts", label: "Accounts", meta: "tax status" },
  { key: "accountTaxType", label: "Account Tax Type", meta: "status list" },
  { key: "investmentType", label: "Investment Type", meta: "asset classes" },
];

const initialInvestments: InvestmentRow[] = [
  { id: 1, description: "Social Security", account: "Social Security", category: "core", totalInvestment: 0, yearlyIncome: 10000, includeIncome: true, overrideProposal: false, symbol: "SS", newSymbol: "SS", newPercent: 0 },
  { id: 2, description: "AUX Social Security", account: "Social Security", category: "core", totalInvestment: 0, yearlyIncome: 24000, includeIncome: true, overrideProposal: false, symbol: "AUX-SS", newSymbol: "SS", newPercent: 0 },
  { id: 3, description: "Palmetto", account: "rental-Palmetto", category: "core", totalInvestment: 1000, yearlyIncome: 2000, includeIncome: true, overrideProposal: false, symbol: "2767 Palmetto", newSymbol: "2767 Palmetto", newPercent: 0 },
  { id: 4, description: "Sitio", account: "rental-Sitio", category: "core", totalInvestment: 1000, yearlyIncome: 2000, includeIncome: true, overrideProposal: false, symbol: "7068 Sitio", newSymbol: "7068 Sitio", newPercent: 0 },
  { id: 5, description: "vanguard - brokerage", account: "vanguard brokerage", category: "core", totalInvestment: 1000, yearlyIncome: 64.7, includeIncome: true, overrideProposal: false, symbol: "BSJS", newSymbol: "BSJS", newPercent: 0 },
  { id: 6, description: "vanguard - brokerage", account: "vanguard brokerage", category: "core", totalInvestment: 1000, yearlyIncome: 40.1, includeIncome: true, overrideProposal: true, symbol: "BIL", newSymbol: "PFFA", newPercent: 0.0961 },
  { id: 7, description: "IB", account: "Interactive Brokers", category: "core", totalInvestment: 1000, yearlyIncome: 115.5, includeIncome: true, overrideProposal: false, symbol: "SPYI", newSymbol: "SPYI", newPercent: 0 },
  { id: 8, description: "IB", account: "Interactive Brokers", category: "core", totalInvestment: 2000, yearlyIncome: 144.6, includeIncome: true, overrideProposal: false, symbol: "NAD", newSymbol: "NAD", newPercent: 0 },
  { id: 9, description: "deferred comp", account: "Deffered comp - Intuit", category: "core", totalInvestment: 2000, yearlyIncome: 38.8, includeIncome: false, overrideProposal: false, symbol: "ST Cash - Deferred", newSymbol: "ST Cash - Deferred", newPercent: 0 },
];

const initialTickers: TickerRow[] = [
  { id: 1, symbol: "SS", percentReturn: 0, category: "social-security", taxTreatment: "ss-85-fed", extraData: 0, description: "social security", exDividend: "", divPayout: "" },
  { id: 2, symbol: "AUX-SS", percentReturn: 0, category: "social-security", taxTreatment: "tax free", extraData: 0, description: "aux SS", exDividend: "", divPayout: "" },
  { id: 3, symbol: "BIL", percentReturn: 0.0401, category: "cash", taxTreatment: "state tax free", extraData: 0, description: "short term treasury ETF", exDividend: "", divPayout: "" },
  { id: 4, symbol: "FLOT", percentReturn: 0.0478, category: "cash", taxTreatment: "non-qualified-div", extraData: 0, description: "short term ETF", exDividend: "", divPayout: "" },
  { id: 5, symbol: "PFFA", percentReturn: 0.0961, category: "preferred stock", taxTreatment: "non-qualified-div", extraData: 0, description: "Preferred stock ETF", exDividend: "", divPayout: "" },
  { id: 6, symbol: "BSJS", percentReturn: 0.0647, category: "bond", taxTreatment: "non-qualified-div", extraData: 0, description: "fixed duration", exDividend: "", divPayout: "" },
  { id: 7, symbol: "BSJQ", percentReturn: 0.061, category: "bond", taxTreatment: "non-qualified-div", extraData: 0, description: "fixed duration", exDividend: "", divPayout: "" },
  { id: 8, symbol: "BSJT", percentReturn: 0.0673, category: "bond", taxTreatment: "non-qualified-div", extraData: 0, description: "fixed duration", exDividend: "", divPayout: "" },
  { id: 9, symbol: "SPYI", percentReturn: 0.1155, category: "covered call", taxTreatment: "hold", extraData: 0, description: "covered call ETF", exDividend: "", divPayout: "" },
  { id: 10, symbol: "NAD", percentReturn: 0.0723, category: "munibond", taxTreatment: "tax free", extraData: 0, description: "municipal bond fund", exDividend: "", divPayout: "" },
  { id: 11, symbol: "MO", percentReturn: 0.0737, category: "stock", taxTreatment: "qualified-div", extraData: 0, description: "equity dividend", exDividend: "", divPayout: "" },
  { id: 12, symbol: "CASH", percentReturn: 0.01, category: "cash", taxTreatment: "income", extraData: 0, description: "cash sweep", exDividend: "", divPayout: "" },
  { id: 13, symbol: "non investment income", percentReturn: 0, category: "non investment income", taxTreatment: "income", extraData: 0, description: "ordinary non-investment income", exDividend: "", divPayout: "" },
  { id: 14, symbol: "ST Cash - Deferred", percentReturn: 0.0388, category: "cash", taxTreatment: "income", extraData: 0, description: "deferred cash", exDividend: "", divPayout: "" },
  { id: 15, symbol: "2767 Palmetto", percentReturn: 0, category: "real estate", taxTreatment: "real estate", extraData: 0, description: "rental income", exDividend: "", divPayout: "" },
  { id: 16, symbol: "7068 Sitio", percentReturn: 0, category: "real estate", taxTreatment: "real estate", extraData: 0, description: "rental income", exDividend: "", divPayout: "" },
];

const initialTaxTreatments: TaxTreatmentRow[] = ["tax free", "state tax free", "fed tax free", "index-60-40", "income", "ss-85-fed", "qualified-div", "non-qualified-div", "short term gain", "long term gain", "real estate", "hold"].map((label, index) => ({ id: index + 1, label }));
const initialAccounts: AccountRow[] = [
  { id: 1, account: "Social Security", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 2, account: "vanguard brokerage", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 3, account: "vanguard IRA inherited", taxStatus: "deferred", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 4, account: "Schwab Rollover IRA", taxStatus: "deferred", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 5, account: "Interactive Brokers", taxStatus: "taxable", dividendAccrued: "yes", includeInFreeCashflow: "yes" },
  { id: 6, account: "Merill Edge", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 7, account: "Fidelity - brokerage", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 8, account: "Deffered comp - Intuit", taxStatus: "deferred", dividendAccrued: "no", includeInFreeCashflow: "no" },
  { id: 9, account: "rental-Palmetto", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 10, account: "rental-Sitio", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
];
const initialAccountTaxTypes: AccountTaxTypeRow[] = ["tax-free", "taxable", "deferred", "tax-deduction"].map((taxStatus, index) => ({ id: index + 1, taxStatus }));
const initialInvestmentTypes: InvestmentTypeRow[] = ["social-security", "real estate", "treasury bond", "bond", "munibond", "stock", "preferred stock", "business development", "covered call", "IBOND", "Bitcoin", "cash", "non investment income"].map((name, index) => ({ id: index + 1, name }));
const initialFederalSettings: FederalSettings = { filingStatus: "mfj", extraOrdinaryIncome: 0, extraPreferredIncome: 0, mortgageInterest: 19500, propertyTax: 19000, stateIncomeTax: 5153, standardDeduction: 31500, saltCap: 40400 };
const initialStateSettings: StateSettings = { extraStateIncome: 0, mortgageInterest: 26500, propertyTax: 19000, stateIncomeTax: 5153, standardDeduction: 11000 };
const initialPlannerSettings: PlannerSettings = { federalWithholding: 0, stateWithholding: 0 };
const initialUiSettings: UiSettings = { investmentFavorites: [] };

function toNumber(value: number | string | boolean | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  const str = String(value || "")
    .replace(/[\$,]/g, "")
    .replace(/%/g, "")
    .trim();
  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : 0;
}
function normalizeBoolean(value: unknown) { if (typeof value === "boolean") return value; if (typeof value === "number") return value !== 0; const text = String(value || "").trim().toLowerCase(); return text === "1" || text === "true" || text === "yes" || text === "y"; }
function normalizeYesNo(value: unknown) { return normalizeBoolean(value) ? "yes" : "no"; }
function normalizeLookupKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function buildAccountLookupMap(rows: AccountRow[]) {
  const map: Record<string, AccountRow> = {};
  for (const row of rows) {
    const key = normalizeLookupKey(row.account);
    if (!key) continue;
    if (!map[key]) {
      map[key] = row;
    }
  }
  return map;
}
function buildAccountTaxStatusMap(rows: AccountRow[]) {
  const map: Record<string, string> = {};
  for (const row of rows) {
    const key = normalizeLookupKey(row.account);
    if (!key) continue;
    if (!map[key]) {
      map[key] = String(row.taxStatus || "");
    }
  }
  return map;
}
function normalizeFavoriteName(value: unknown) {
  return String(value || "").trim();
}
function buildInvestmentFavoriteKeys(row: InvestmentRow) {
  const description = normalizeLookupKey(row.description);
  const account = normalizeLookupKey(row.account);
  const symbol = normalizeLookupKey(row.symbol);
  const newSymbol = normalizeLookupKey(row.newSymbol);
  const category = normalizeLookupKey(row.category);
  const keys = new Set<string>();
  keys.add(`desc|${description}|acct|${account}|sym|${symbol}|cat|${category}`);
  keys.add(`desc|${description}|acct|${account}|cat|${category}`);
  keys.add(`acct|${account}|sym|${symbol}`);
  if (newSymbol) {
    keys.add(`acct|${account}|newsym|${newSymbol}`);
  }
  return [...keys];
}
function normalizeInvestmentFavorites(raw: unknown): InvestmentFavorite[] {
  if (!Array.isArray(raw)) return [];
  const favorites: InvestmentFavorite[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const name = normalizeFavoriteName(obj.name);
    if (!name) continue;
    const keySet = new Set<string>();
    const keyCandidates = Array.isArray(obj.investmentKeys) ? obj.investmentKeys : [];
    for (const key of keyCandidates) {
      const normalized = String(key || "").trim();
      if (normalized) keySet.add(normalized);
    }
    if (keySet.size === 0) continue;
    favorites.push({
      name,
      investmentKeys: [...keySet],
      createdAt: String(obj.createdAt || new Date().toISOString()),
    });
  }
  return favorites;
}
function normalizeFilingStatus(value: unknown): FilingStatus {
  return String(value || "single").trim().toLowerCase() === "mfj" ? "mfj" : "single";
}

const SS_THRESHOLDS: Record<string, { base1: number; base2: number; bandCap: number }> = {
  mfj: { base1: 32000, base2: 44000, bandCap: 6000 },
  single: { base1: 25000, base2: 34000, bandCap: 4500 },
  hoh: { base1: 25000, base2: 34000, bandCap: 4500 },
  mfs: { base1: 0, base2: 0, bandCap: 0 },
};

function resolveSsThresholds(filingStatus: FilingStatus) {
  return SS_THRESHOLDS[filingStatus] || SS_THRESHOLDS.single;
}

function calculateTaxableSocialSecurity(
  grossBenefits: number,
  otherIncome: number,
  muniInterest: number,
  filingStatus: FilingStatus
) {
  const ssIncome = Math.max(0, grossBenefits);
  if (ssIncome <= 0) return 0;
  const thresholds = resolveSsThresholds(filingStatus);
  const provisionalIncome = Math.max(0, otherIncome) + Math.max(0, muniInterest) + 0.5 * ssIncome;

  if (provisionalIncome <= thresholds.base1) {
    return 0;
  }

  if (provisionalIncome <= thresholds.base2) {
    return Math.min(0.5 * ssIncome, 0.5 * (provisionalIncome - thresholds.base1));
  }

  const aboveSecondBand = 0.85 * (provisionalIncome - thresholds.base2);
  const carryFromFirstBand = Math.min(thresholds.bandCap, 0.5 * ssIncome);
  return Math.min(0.85 * ssIncome, aboveSecondBand + carryFromFirstBand);
}

type SettingsSection = Record<string, unknown>;

function parseNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = typeof value === "string" ? value.replace(/,/g, "") : value;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : undefined;
}

function normalizeSheetRows(raw: unknown): string[][] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rows: string[][] = [];
  for (const row of raw) {
    if (!Array.isArray(row)) continue;
    const normalizedRow = row.map((cell) => (cell === null || cell === undefined ? "" : String(cell)));
    if (normalizedRow.some((cell) => cell.trim() !== "")) {
      rows.push(normalizedRow);
    }
  }
  return rows.length > 0 ? rows : undefined;
}

function findRowByLabel(rows: string[][] | undefined, label: string): { row: string[]; labelIndex: number } | null {
  if (!rows) return null;
  const target = label.trim().toLowerCase();
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      if (row[index].trim().toLowerCase() === target) {
        return { row, labelIndex: index };
      }
    }
  }
  return null;
}

function extractNumberFromRow(row: string[], labelIndex: number): number | undefined {
  for (let idx = labelIndex + 1; idx < row.length; idx += 1) {
    const candidate = row[idx] ? row[idx].trim() : "";
    if (!candidate) continue;
    const num = Number(candidate.replace(/,/g, ""));
    if (Number.isFinite(num)) {
      return num;
    }
  }
  return undefined;
}

function extractStringFromRow(row: string[], labelIndex: number): string | undefined {
  for (let idx = labelIndex + 1; idx < row.length; idx += 1) {
    const candidate = row[idx] ? row[idx].trim() : "";
    if (candidate) return candidate;
  }
  return undefined;
}

function parseNumberFromSection(
  section: SettingsSection | undefined,
  rows: string[][] | undefined,
  field: string,
  label?: string
): number | undefined {
  if (section && field in section) {
    const value = parseNumber(section[field]);
    if (value !== undefined) return value;
  }
  if (label && rows) {
    const match = findRowByLabel(rows, label);
    if (match) {
      return extractNumberFromRow(match.row, match.labelIndex);
    }
  }
  return undefined;
}

function parseStringFromSection(
  section: SettingsSection | undefined,
  rows: string[][] | undefined,
  field: string,
  label?: string
): string | undefined {
  if (section && field in section) {
    const value = section[field];
    if (value !== null && value !== undefined) {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  if (label && rows) {
    const match = findRowByLabel(rows, label);
    if (match) {
      return extractStringFromRow(match.row, match.labelIndex);
    }
  }
  return undefined;
}

function parseFederalSettingsSection(section: unknown): Partial<FederalSettings> {
  const sectionObj = section && typeof section === "object" ? (section as SettingsSection) : undefined;
  const rows = sectionObj ? normalizeSheetRows(sectionObj.rows) : undefined;
  const result: Partial<FederalSettings> = {};

  const setNumberField = (field: FederalNumericField, label: string) => {
    const value = parseNumberFromSection(sectionObj, rows, field, label);
    if (value !== undefined) {
      result[field] = value as FederalSettings[typeof field];
    }
  };

  setNumberField("mortgageInterest", "Mortgage interest");
  setNumberField("propertyTax", "Property tax");
  setNumberField("stateIncomeTax", "State income tax");
  setNumberField("standardDeduction", "Standard deduction");
  setNumberField("saltCap", "SALT cap");

  const filingValue = parseStringFromSection(sectionObj, rows, "filingStatus", "Filing status");
  if (filingValue) {
    result.filingStatus = normalizeFilingStatus(filingValue);
  }

  return result;
}

function parseStateSettingsSection(section: unknown): Partial<StateSettings> {
  const sectionObj = section && typeof section === "object" ? (section as SettingsSection) : undefined;
  const rows = sectionObj ? normalizeSheetRows(sectionObj.rows) : undefined;
  const result: Partial<StateSettings> = {};

  const setNumberField = (field: keyof StateSettings, label: string) => {
    const value = parseNumberFromSection(sectionObj, rows, field, label);
    if (value !== undefined) {
      result[field] = value as StateSettings[typeof field];
    }
  };

  setNumberField("mortgageInterest", "mortgage interest");
  setNumberField("propertyTax", "property tax");
  setNumberField("stateIncomeTax", "state tax");
  setNumberField("standardDeduction", "Standard deduction");

  const extraStateIncome = parseNumberFromSection(sectionObj, rows, "extraStateIncome", "Extra state income");
  if (extraStateIncome !== undefined) {
    result.extraStateIncome = extraStateIncome;
  }

  return result;
}

function parsePlannerSettingsSection(section: unknown): Partial<PlannerSettings> {
  const sectionObj = section && typeof section === "object" ? (section as SettingsSection) : undefined;
  const rows = sectionObj ? normalizeSheetRows(sectionObj.rows) : undefined;
  const result: Partial<PlannerSettings> = {};

  const federalWithholding = parseNumberFromSection(sectionObj, rows, "federalWithholding", "Withhold amounts - fed");
  if (federalWithholding !== undefined) {
    result.federalWithholding = federalWithholding;
  }

  const stateWithholding = parseNumberFromSection(sectionObj, rows, "stateWithholding", "Withhold amounts - state");
  if (stateWithholding !== undefined) {
    result.stateWithholding = stateWithholding;
  }

  return result;
}

function parseUiSettingsSection(section: unknown): Partial<UiSettings> {
  if (!section || typeof section !== "object") return {};
  const sectionObj = section as Record<string, unknown>;
  return {
    investmentFavorites: normalizeInvestmentFavorites(sectionObj.investmentFavorites),
  };
}

function parseWorkbookSettings(settings: unknown) {
  const settingsObj = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  const ui = parseUiSettingsSection(settingsObj.ui);
  const planner = parsePlannerSettingsSection(settingsObj.planner);
  const legacyFavorites = settingsObj.planner && typeof settingsObj.planner === "object"
    ? normalizeInvestmentFavorites((settingsObj.planner as Record<string, unknown>).investmentFavorites)
    : [];
  return {
    federal: parseFederalSettingsSection(settingsObj.federal),
    state: parseStateSettingsSection(settingsObj.state),
    planner,
    ui: {
      investmentFavorites: ui.investmentFavorites && ui.investmentFavorites.length > 0
        ? ui.investmentFavorites
        : legacyFavorites,
    },
  };
}
function formatCurrency(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function formatCurrencyDetailed(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value); }
function formatPercent(value: number) { return `${(value * 100).toFixed(1)}%`; }
function fedTaxAdjust(amount: number, taxTreatment: string, extraData: number, pref: boolean) { switch (String(taxTreatment || "").toLowerCase().trim()) { case "hold": case "tax free": case "fed tax free": return 0; case "state tax free": return pref ? 0 : amount; case "index-60-40": return pref ? amount * 0.6 : amount * 0.4; case "income": case "non-qualified-div": case "short term gain": return pref ? 0 : amount; case "ss-85-fed": return pref ? 0 : amount * 0.85; case "qualified-div": case "long term gain": return pref ? amount : 0; case "real estate": return pref ? 0 : Math.max(amount - extraData, 0); default: return pref ? 0 : amount; } }
function stateTaxAdjust(amount: number, taxTreatment: string, extraData: number) { switch (String(taxTreatment || "").toLowerCase().trim()) { case "hold": case "tax free": case "state tax free": case "ss-85-fed": return 0; case "real estate": return Math.max(amount - extraData, 0); default: return amount; } }
async function postTaxCalculation(payload: Record<string, number | string>) {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const response = await fetch(`${API_BASE_URL}/hello`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const json = (await response.json()) as TaxResult | ApiError;
  if (!response.ok) throw new Error((json as ApiError).error || "API request failed");
  return json as TaxResult;
}

async function loadWorkbook(workspaceId: string) {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const response = await fetch(`${API_BASE_URL}/hello`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ calc: "WORKBOOK_GET", workspaceId }) });
  const json = (await response.json()) as WorkbookResponse | ApiError;
  if (!response.ok) throw new Error((json as ApiError).error || "Workbook load failed");
  return json as WorkbookResponse;
}

async function saveWorkbook(workspaceId: string, payload: WorkbookResponse) {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const response = await fetch(`${API_BASE_URL}/hello`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ calc: "WORKBOOK_SAVE", workspaceId, tabs: payload.tabs, settings: payload.settings }) });
  const json = (await response.json()) as { updatedAt?: string; error?: string };
  if (!response.ok) throw new Error(json.error || "Workbook save failed");
  return json;
}

function workbookField(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const value = row[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text === "") continue;
    return text;
  }
  return undefined;
}
function mapWorkbookRows<T>(
  fallback: T[],
  incoming: unknown,
  mapper: (row: Record<string, unknown>, index: number, fallbackRow?: T) => T | null,
  validator?: (row: T) => boolean
): T[] {
  if (!Array.isArray(incoming) || incoming.length === 0) return fallback;
  const mapped = incoming
    .map((row, index) => mapper(typeof row === "object" && row ? (row as Record<string, unknown>) : {}, index, fallback[index]))
    .filter((value): value is T => Boolean(value));
  if (mapped.length === 0) return fallback;
  if (validator && !mapped.some(validator)) return fallback;
  return mapped;
}
function workbookToInvestmentRow(row: Record<string, unknown>, index: number, fallback?: InvestmentRow): InvestmentRow | null {
  const hasAnyInvestmentField =
    workbookField(
      row,
      "id",
      "desc",
      "description",
      "accnt",
      "account",
      "account_name",
      "account_names",
      "symbol",
      "current_symbol",
      "ticker",
      "new_symbol",
      "proposed_symbol",
      "total_inv",
      "total_investment",
      "totalinvestment",
      "total_inv_amount",
      "yr_inc",
      "yearly_income",
      "yearinc",
      "yearly_income_amount"
    ) !== undefined;
  if (!hasAnyInvestmentField) return null;

  const base: InvestmentRow = fallback || {
    id: index + 1,
    description: "",
    account: "",
    category: "core",
    totalInvestment: 0,
    yearlyIncome: 0,
    includeIncome: true,
    overrideProposal: false,
    symbol: "",
    newSymbol: "",
    newPercent: 0,
  };
  const idValue = workbookField(row, "id");
  const id = idValue ? Number(idValue) || base.id : base.id;
  const totalInvestmentValue = workbookField(row, "totalInvestment", "total_inv", "total_investment", "totalinvestment", "total_inv_amount");
  const yearlyIncomeValue = workbookField(row, "yearlyIncome", "yr_inc", "yearly_income", "yearinc", "yearly_income_amount");
  const includeIncomeValue = workbookField(row, "includeIncome", "inc", "include_income", "income", "include_investment_income");
  const overrideValue = workbookField(row, "overrideProposal", "override", "override_proposal");
  const newPercentValue = workbookField(row, "newPercent", "new_percent", "new_pct", "newpercent");
  return {
    id: Number(id) || index + 1,
    description: workbookField(row, "desc", "description") ?? base.description,
    account: workbookField(row, "accnt", "account", "account_name", "account_names") ?? base.account,
    category: workbookField(row, "category") ?? base.category,
    totalInvestment: totalInvestmentValue !== undefined ? toNumber(totalInvestmentValue) : base.totalInvestment,
    yearlyIncome: yearlyIncomeValue !== undefined ? toNumber(yearlyIncomeValue) : base.yearlyIncome,
    includeIncome: includeIncomeValue !== undefined ? normalizeBoolean(includeIncomeValue) : base.includeIncome,
    overrideProposal: overrideValue !== undefined ? normalizeBoolean(overrideValue) : base.overrideProposal,
    symbol: workbookField(row, "symbol", "current_symbol", "ticker") ?? base.symbol,
    newSymbol: workbookField(row, "newSymbol", "new_symbol", "proposed_symbol") ?? base.newSymbol,
    newPercent: newPercentValue !== undefined ? toNumber(newPercentValue) : base.newPercent,
  };
}
function workbookToTickerRow(row: Record<string, unknown>, index: number, fallback?: TickerRow): TickerRow {
  const base = fallback || initialTickers[index] || initialTickers[0];
  const percentValue = workbookField(row, "percent_return", "percentReturn", "percent_return_rate", "percent");
  const extraDataValue = workbookField(row, "extra_data", "extraData");
  return {
    id: Number(workbookField(row, "id")) || base.id,
    symbol: workbookField(row, "symbol", "ticker") ?? base.symbol,
    percentReturn: percentValue !== undefined ? toNumber(percentValue) : base.percentReturn,
    category: workbookField(row, "category") ?? base.category,
    taxTreatment: workbookField(row, "tax_treatment", "taxTreatment", "tax_status") ?? base.taxTreatment,
    extraData: extraDataValue !== undefined ? toNumber(extraDataValue) : base.extraData,
    description: workbookField(row, "description", "desc") ?? base.description,
    exDividend: workbookField(row, "ex_dividend", "exDividend") ?? base.exDividend,
    divPayout: workbookField(row, "div_payout", "divPayout") ?? base.divPayout,
  };
}
function workbookToAccountRow(row: Record<string, unknown>, index: number, fallback?: AccountRow): AccountRow {
  const base = fallback || initialAccounts[index] || initialAccounts[0];
  return {
    id: Number(workbookField(row, "id")) || base.id,
    account: workbookField(row, "account", "account_name", "account_names") ?? base.account,
    taxStatus: workbookField(row, "tax_status", "taxStatus", "tax_treatment") ?? base.taxStatus,
    dividendAccrued: workbookField(row, "dividend_accrued", "dividendAccrued") ?? base.dividendAccrued,
    includeInFreeCashflow: normalizeYesNo(workbookField(row, "include_in_free_cashflow", "includeInFreeCashflow", "include_in_free_cash_flow", "include")),
  };
}
function workbookToTaxTreatmentRow(row: Record<string, unknown>, index: number, fallback?: TaxTreatmentRow): TaxTreatmentRow {
  const base = fallback || initialTaxTreatments[index] || initialTaxTreatments[0];
  return {
    id: Number(workbookField(row, "id")) || base.id,
    label: workbookField(row, "label", "tax_treatment") ?? base.label,
  };
}
function workbookToAccountTaxTypeRow(row: Record<string, unknown>, index: number, fallback?: AccountTaxTypeRow): AccountTaxTypeRow {
  const base = fallback || initialAccountTaxTypes[index] || initialAccountTaxTypes[0];
  return {
    id: Number(workbookField(row, "id")) || base.id,
    taxStatus: workbookField(row, "tax_status", "taxStatus", "tax_status") ?? base.taxStatus,
  };
}
function workbookToInvestmentTypeRow(row: Record<string, unknown>, index: number, fallback?: InvestmentTypeRow): InvestmentTypeRow {
  const base = fallback || initialInvestmentTypes[index] || initialInvestmentTypes[0];
  return {
    id: Number(workbookField(row, "id")) || base.id,
    name: workbookField(row, "name", "investment_type", "inv_type") ?? base.name,
  };
}
function mergeSettings<T extends object>(fallback: T, incoming: unknown): T { return incoming && typeof incoming === "object" ? ({ ...fallback, ...(incoming as Partial<T>) } as T) : fallback; }
function MetricCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "accent" | "warning" }) {
  return <div className={`metric-card metric-card--${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="sheet-section"><div className="section-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</section>;
}

function LookupTable<T extends { id: number }>({ title, subtitle, rows, columns, onChange, onAdd, onRemove }: { title: string; subtitle: string; rows: T[]; columns: Array<{ key: keyof T; label: string; type?: "text" | "number" | "select"; options?: string[] }>; onChange: (id: number, field: keyof T, value: string) => void; onAdd: () => void; onRemove: (id: number) => void; }) {
  return <Section title={title} subtitle={subtitle}><div className="actions-row"><button className="primary-button" type="button" onClick={onAdd}>Add row</button></div><div className="table-wrap table-wrap--tall"><table className="sheet-table sheet-table--compact"><thead><tr>{columns.map((column) => <th key={String(column.key)}>{column.label}</th>)}<th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={String(column.key)}>{column.type === "select" ? <select value={String(row[column.key] ?? "")} onChange={(event) => onChange(row.id, column.key, event.target.value)}>{(column.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input type={column.type === "number" ? "number" : "text"} value={String(row[column.key] ?? "")} onChange={(event) => onChange(row.id, column.key, event.target.value)} />}</td>)}<td><button className="ghost-button ghost-button--compact" type="button" onClick={() => onRemove(row.id)}>Remove</button></td></tr>)}</tbody></table></div></Section>;
}

function InvestmentsTable({ rows, accountOptions, symbolOptions, accountTaxStatusByName, derivedRows, favorites, onSaveFavorite, onApplyFavorite, onDeleteFavorite, onRenameFavorite, onChange, onAdd, onRemove, onClear, onSelectAllInc, onClearAllInc }: { rows: InvestmentRow[]; accountOptions: string[]; symbolOptions: string[]; accountTaxStatusByName: Record<string, string>; derivedRows: DerivedInvestmentRow[]; favorites: InvestmentFavorite[]; onSaveFavorite: (name: string) => void; onApplyFavorite: (name: string) => void; onDeleteFavorite: (name: string) => void; onRenameFavorite: (oldName: string, newName: string) => void; onChange: (id: number, field: keyof InvestmentRow, value: string | boolean) => void; onAdd: () => void; onRemove: (id: number) => void; onClear: () => void; onSelectAllInc: () => void; onClearAllInc: () => void; }) {
  const derivedMap = Object.fromEntries(derivedRows.map((row) => [row.id, row]));
  const [isFavoritesPanelOpen, setIsFavoritesPanelOpen] = useState(false);
  const [newFavoriteName, setNewFavoriteName] = useState("");
  const [selectedFavoriteName, setSelectedFavoriteName] = useState("");
  const [renameTarget, setRenameTarget] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const topDescriptions = Object.entries(
    rows.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.description || "(blank)").trim() || "(blank)";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const duplicateDescriptionCount = topDescriptions.filter((entry) => entry[1] > 1).length;

  const getRowClassName = (row: InvestmentRow) => {
    const accountKey = normalizeLookupKey(row.account);
    const taxStatus = String(accountTaxStatusByName[accountKey] || "").toLowerCase();
    const isNonTaxableStatus =
      taxStatus.includes("deferred") ||
      taxStatus.includes("tax-free") ||
      taxStatus.includes("tax free") ||
      taxStatus.includes("tax_deduction") ||
      taxStatus.includes("tax-deduction");
    const isTaxableStatus =
      taxStatus === "taxable" ||
      taxStatus.includes("taxable") ||
      taxStatus.includes("partially taxable");

    if (isNonTaxableStatus) {
      return "investment-row investment-row--non-taxable";
    }
    if (isTaxableStatus) {
      return "investment-row investment-row--taxable";
    }

    return "investment-row";
  };
  const filteredFavorites = useMemo(
    () => [...favorites].sort((a, b) => a.name.localeCompare(b.name)),
    [favorites]
  );
  useEffect(() => {
    if (filteredFavorites.length === 0) {
      setSelectedFavoriteName("");
      return;
    }
    setSelectedFavoriteName((current) =>
      filteredFavorites.some((favorite) => favorite.name === current)
        ? current
        : filteredFavorites[0].name
    );
  }, [filteredFavorites]);
  const favoriteMatchCount = (favorite: InvestmentFavorite) => {
    const keys = new Set(favorite.investmentKeys);
    return rows.reduce((count, row) => {
      const isMatch = buildInvestmentFavoriteKeys(row).some((key) => keys.has(key));
      return count + (isMatch ? 1 : 0);
    }, 0);
  };
  const selectedFavorite = filteredFavorites.find((favorite) => favorite.name === selectedFavoriteName) || null;
  const handleSelectFavorite = (name: string) => {
    setSelectedFavoriteName(name);
    onApplyFavorite(name);
  };
  const handleSaveFavorite = () => {
    const name = normalizeFavoriteName(newFavoriteName);
    if (!name) return;
    onSaveFavorite(name);
    setNewFavoriteName(name);
    setSelectedFavoriteName(name);
  };
  const handleApplyFavorite = () => {
    if (!selectedFavoriteName) return;
    onApplyFavorite(selectedFavoriteName);
  };
  const handleDeleteFavorite = () => {
    if (!selectedFavoriteName) return;
    onDeleteFavorite(selectedFavoriteName);
    setRenameTarget("");
    setRenameValue("");
  };
  const startRenameFavorite = () => {
    if (!selectedFavoriteName) return;
    setRenameTarget(selectedFavoriteName);
    setRenameValue(selectedFavoriteName);
  };
  const handleRenameFavorite = () => {
    const oldName = normalizeFavoriteName(renameTarget);
    const nextName = normalizeFavoriteName(renameValue);
    if (!oldName || !nextName) return;
    onRenameFavorite(oldName, nextName);
    setSelectedFavoriteName(nextName);
    setRenameTarget("");
    setRenameValue("");
  };

  return (
    <Section title="Investments" subtitle="Workbook-style grid with checkbox overrides. When override is checked, the proposed symbol and return replace the current holding in the downstream tax logic.">
      <div className="actions-row">
        <button className="primary-button" type="button" onClick={onAdd}>Add row</button>
        <button className="ghost-button" type="button" onClick={onSelectAllInc}>Select all Inc</button>
        <button className="ghost-button" type="button" onClick={onClearAllInc}>Clear all Inc</button>
        <button className="ghost-button" type="button" onClick={() => setIsFavoritesPanelOpen(true)}>Manage Favorites</button>
        <button className="ghost-button" type="button" onClick={onClear}>Remove all rows</button>
      </div>
      {isFavoritesPanelOpen && (
        <div className="favorites-overlay">
          <div className="favorites-panel">
            <div className="favorites-panel__header">
              <h3>Favorites</h3>
              <button className="ghost-button ghost-button--compact" type="button" onClick={() => setIsFavoritesPanelOpen(false)}>Close</button>
            </div>
            <div className="favorites-panel__new">
              <input
                type="text"
                value={newFavoriteName}
                onChange={(event) => setNewFavoriteName(event.target.value)}
                placeholder="New favorite name"
              />
              <button className="primary-button ghost-button--compact" type="button" onClick={handleSaveFavorite}>Save</button>
            </div>
            <div className="favorites-panel__list">
              {filteredFavorites.map((favorite) => (
                <button
                  key={favorite.name}
                  type="button"
                  className={`favorites-item ${selectedFavoriteName === favorite.name ? "favorites-item--active" : ""}`}
                  onClick={() => handleSelectFavorite(favorite.name)}
                >
                  <span>{favorite.name}</span>
                  <small>{favoriteMatchCount(favorite)} matched</small>
                </button>
              ))}
              {filteredFavorites.length === 0 && <div className="favorites-empty">No favorites found.</div>}
            </div>
            <div className="favorites-panel__actions">
              <button className="ghost-button ghost-button--compact" type="button" onClick={handleApplyFavorite} disabled={!selectedFavorite}>Apply</button>
              <button className="ghost-button ghost-button--compact" type="button" onClick={startRenameFavorite} disabled={!selectedFavorite}>Rename</button>
              <button className="ghost-button ghost-button--compact" type="button" onClick={handleDeleteFavorite} disabled={!selectedFavorite}>Delete</button>
            </div>
            {renameTarget && (
              <div className="favorites-panel__rename">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  placeholder="Rename favorite"
                />
                <button className="ghost-button ghost-button--compact" type="button" onClick={handleRenameFavorite}>Save name</button>
                <button className="ghost-button ghost-button--compact" type="button" onClick={() => { setRenameTarget(""); setRenameValue(""); }}>Cancel</button>
              </div>
            )}
            <p className="favorites-panel__note">Favorites use resilient matching and still apply when rows are reordered or removed.</p>
          </div>
        </div>
      )}
      <div className="status-card status-card--note debug-panel">
        <strong>Debug</strong>
        <div className="debug-panel__stats">
          <span>Loaded rows: {rows.length}</span>
          <span>Derived rows: {derivedRows.length}</span>
          <span>Unique descriptions: {topDescriptions.length}</span>
          <span>Descriptions with duplicates: {duplicateDescriptionCount}</span>
        </div>
        <div className="debug-panel__list">
          {topDescriptions.map((entry) => <span key={entry[0]}>{entry[0]} ({entry[1]})</span>)}
        </div>
      </div>
      <div className="table-wrap table-wrap--tall">
        <table className="sheet-table sheet-table--compact sheet-table--workbook">
          <thead>
            <tr>
              <th>Desc</th><th>Accnt</th><th>Category</th><th>Total inv.</th><th>Yr inc.</th><th>Mnth inc</th><th>Inc</th><th>Override</th><th>Symbol</th><th>%</th><th>New symbol</th><th>New %</th><th>Use %</th><th>Use symbol</th><th>$</th><th>Filtered</th><th>Total</th><th>Tax Status</th><th>Ordinary</th><th>Preferred</th><th>State</th><th>Non taxable</th><th>Inv. type</th><th>Non-invest income</th><th>Cash</th><th>Stocks</th><th>Preferred stock</th><th>Bonds</th><th>Muni-bond</th><th>Muni-int</th><th>Bus dev</th><th>Covered call</th><th>Real estate</th><th>Bitcoin</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const derived = derivedMap[row.id];
              return (
                <tr key={row.id} className={getRowClassName(row)}>
                  <td><input value={row.description} onChange={(event) => onChange(row.id, "description", event.target.value)} /></td>
                  <td><select value={row.account} onChange={(event) => onChange(row.id, "account", event.target.value)}>{accountOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></td>
                  <td><input value={row.category} onChange={(event) => onChange(row.id, "category", event.target.value)} /></td>
                  <td><input type="number" value={row.totalInvestment} onChange={(event) => onChange(row.id, "totalInvestment", event.target.value)} /></td>
                  <td><input type="number" value={row.yearlyIncome} onChange={(event) => onChange(row.id, "yearlyIncome", event.target.value)} /></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed(derived?.monthlyIncome || 0)}</div></td>
                  <td className="checkbox-cell"><input type="checkbox" checked={row.includeIncome} onChange={(event) => onChange(row.id, "includeIncome", event.target.checked)} /></td>
                  <td className="checkbox-cell"><input type="checkbox" checked={row.overrideProposal} onChange={(event) => onChange(row.id, "overrideProposal", event.target.checked)} /></td>
                  <td><select value={row.symbol} onChange={(event) => onChange(row.id, "symbol", event.target.value)}>{symbolOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></td>
                  <td><div className="readonly-cell">{formatPercent(derived?.currentPercent || 0)}</div></td>
                  <td><select value={row.newSymbol} onChange={(event) => onChange(row.id, "newSymbol", event.target.value)}>{symbolOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></td>
                  <td><input type="number" value={row.newPercent} onChange={(event) => onChange(row.id, "newPercent", event.target.value)} /></td>
                  <td><div className="readonly-cell">{formatPercent(derived?.effectivePercent || 0)}</div></td>
                  <td><div className="readonly-cell readonly-cell--text">{derived?.effectiveSymbol || ""}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed(derived?.extraData || 0)}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed(derived?.filteredIncome || 0)}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed(derived?.includedTotal || 0)}</div></td>
                  <td><div className="readonly-cell readonly-cell--text">{derived?.taxStatus || ""}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed((derived?.ordinaryMonthly || 0) * 12)}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed((derived?.preferredMonthly || 0) * 12)}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed((derived?.stateMonthly || 0) * 12)}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed((derived?.nonTaxableMonthly || 0) * 12)}</div></td>
                  <td><div className="readonly-cell readonly-cell--text">{derived?.investmentType || ""}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed(derived?.nonInvestmentIncome || 0)}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed(derived?.cash || 0)}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed(derived?.stocks || 0)}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed(derived?.preferredStock || 0)}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed(derived?.bonds || 0)}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed(derived?.muniBond || 0)}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed(derived?.muniInterest || 0)}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed(derived?.businessDevelopment || 0)}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed(derived?.coveredCall || 0)}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed(derived?.realEstate || 0)}</div></td>
                  <td><div className="readonly-cell">{formatCurrencyDetailed(derived?.bitcoin || 0)}</div></td>
                  <td><button className="ghost-button ghost-button--compact" type="button" onClick={() => onRemove(row.id)}>Remove</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("investments");
  const [investments, setInvestments] = useState(initialInvestments);
  const [tickers, setTickers] = useState(initialTickers);
  const [taxTreatments, setTaxTreatments] = useState(initialTaxTreatments);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [accountTaxTypes, setAccountTaxTypes] = useState(initialAccountTaxTypes);
  const [investmentTypes, setInvestmentTypes] = useState(initialInvestmentTypes);
  const [federalSettings, setFederalSettings] = useState(initialFederalSettings);
  const [stateSettings, setStateSettings] = useState(initialStateSettings);
  const [plannerSettings, setPlannerSettings] = useState(initialPlannerSettings);
  const [uiSettings, setUiSettings] = useState(initialUiSettings);
  const [taxCalcInputs, setTaxCalcInputs] = useState(initialTaxCalculatorInputs);
  const [taxCalcResult, setTaxCalcResult] = useState<TaxResult | null>(null);
  const [taxCalcError, setTaxCalcError] = useState<string | null>(null);
  const [taxCalcStateResult, setTaxCalcStateResult] = useState<TaxResult | null>(null);
  const [taxCalcStateError, setTaxCalcStateError] = useState<string | null>(null);
  const [federalResult, setFederalResult] = useState<TaxResult | null>(null);
  const [stateResult, setStateResult] = useState<TaxResult | null>(null);
  const [federalError, setFederalError] = useState<string | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [storageState, setStorageState] = useState<SaveState>("loading");
  const [storageMessage, setStorageMessage] = useState("Loading workbook...");
  const saveTimeout = useRef<number | null>(null);
  const hasLoadedStorage = useRef(false);

  const tickerMap = useMemo(() => Object.fromEntries(tickers.map((row) => [row.symbol, row])), [tickers]);
  const accountMap = useMemo(() => buildAccountLookupMap(accounts), [accounts]);
  const accountTaxStatusByName = useMemo(() => buildAccountTaxStatusMap(accounts), [accounts]);
  const accountTaxStatusOptions = useMemo(() => {
    const values = accountTaxTypes
      .map((row) => String(row.taxStatus || "").trim())
      .filter(Boolean);
    const fromAccounts = accounts
      .map((row) => String(row.taxStatus || "").trim())
      .filter(Boolean);
    return ["", ...new Set([...values, ...fromAccounts])];
  }, [accountTaxTypes, accounts]);
  const accountOptions = useMemo(() => ["", ...accounts.map((row) => row.account).filter(Boolean).filter((value, index, array) => array.indexOf(value) === index)], [accounts]);
  const symbolOptions = useMemo(() => ["", ...tickers.map((row) => row.symbol).filter(Boolean).filter((value, index, array) => array.indexOf(value) === index)], [tickers]);

  const derivedRows = useMemo<DerivedInvestmentRow[]>(() => investments.map((row) => {
    const currentTicker = tickerMap[row.symbol];
    const effectiveSymbol = row.overrideProposal && row.newSymbol ? row.newSymbol : row.symbol;
    const effectiveTicker = tickerMap[effectiveSymbol] || currentTicker;
    const currentPercent = currentTicker?.percentReturn || 0;
    const effectivePercent = row.overrideProposal ? toNumber(row.newPercent) || currentPercent : currentPercent;
    const monthlyIncome = toNumber(row.yearlyIncome) / 12;
    const filteredIncome = row.includeIncome ? toNumber(row.yearlyIncome) : 0;
    const includedTotal = row.includeIncome ? toNumber(row.totalInvestment) : 0;
    const account = accountMap[normalizeLookupKey(row.account)];
    const taxStatus = String(account?.taxStatus || "taxable").toLowerCase();
    const isPartiallyTaxableStatus = taxStatus.includes("partially taxable");
    const isTaxableStatus = taxStatus === "taxable" || taxStatus.includes("taxable");
    const isTaxableAccount = isTaxableStatus || isPartiallyTaxableStatus;
    const taxTreatment = String(effectiveTicker?.taxTreatment || "income").toLowerCase();
    const investmentType = String(effectiveTicker?.category || "").toLowerCase();
    const extraData = toNumber(effectiveTicker?.extraData || 0);
    const taxableMonthlyBase = isTaxableAccount && row.includeIncome ? filteredIncome / 12 : 0;
    return {
      ...row,
      monthlyIncome,
      currentPercent,
      effectiveSymbol,
      effectivePercent,
      extraData,
      filteredIncome,
      includedTotal,
      taxStatus,
      taxTreatment,
      investmentType,
      ordinaryMonthly: fedTaxAdjust(taxableMonthlyBase, taxTreatment, extraData, false),
      preferredMonthly: fedTaxAdjust(taxableMonthlyBase, taxTreatment, extraData, true),
      stateMonthly: stateTaxAdjust(taxableMonthlyBase, taxTreatment, extraData),
      nonTaxableMonthly: !isTaxableAccount && row.includeIncome ? monthlyIncome : 0,
      nonInvestmentIncome: ["social-security", "non investment income"].includes(investmentType) ? filteredIncome : 0,
      cash: investmentType === "cash" ? includedTotal : 0,
      stocks: investmentType === "stock" ? includedTotal : 0,
      preferredStock: investmentType === "preferred stock" ? includedTotal : 0,
      bonds: investmentType === "bond" || investmentType === "treasury bond" ? includedTotal : 0,
      muniBond: investmentType === "munibond" ? includedTotal : 0,
      muniInterest: investmentType === "munibond" ? filteredIncome : 0,
      businessDevelopment: investmentType === "business development" ? includedTotal : 0,
      coveredCall: investmentType === "covered call" ? includedTotal : 0,
      realEstate: investmentType === "real estate" ? includedTotal : 0,
      bitcoin: investmentType === "bitcoin" ? includedTotal : 0,
    };
  }), [investments, tickerMap, accountMap]);

  const flows = useMemo(() => derivedRows.reduce((acc, row) => {
    acc.totalInvestmentAmount += row.includedTotal;
    acc.totalIncome += row.filteredIncome;
    acc.federalOrdinary += row.ordinaryMonthly * 12;
    acc.federalPreferred += row.preferredMonthly * 12;
    acc.stateTaxable += row.stateMonthly * 12;
    acc.nonTaxableIncome += row.nonTaxableMonthly * 12;
    acc.nonInvestmentIncome += row.nonInvestmentIncome;
    acc.muniIncome += row.muniInterest;
    acc.cash += row.cash;
    acc.stocks += row.stocks;
    acc.preferredStock += row.preferredStock;
    acc.bonds += row.bonds;
    acc.muniBond += row.muniBond;
    acc.businessDevelopment += row.businessDevelopment;
    acc.coveredCall += row.coveredCall;
    acc.realEstate += row.realEstate;
    acc.bitcoin += row.bitcoin;
    return acc;
  }, { totalInvestmentAmount: 0, totalIncome: 0, federalOrdinary: 0, federalPreferred: 0, stateTaxable: 0, nonTaxableIncome: 0, nonInvestmentIncome: 0, muniIncome: 0, cash: 0, stocks: 0, preferredStock: 0, bonds: 0, muniBond: 0, businessDevelopment: 0, coveredCall: 0, realEstate: 0, bitcoin: 0 }), [derivedRows]);

  const ordinaryBeforeDeductions = flows.federalOrdinary + federalSettings.extraOrdinaryIncome;
  const preferredBeforeDeductions = flows.federalPreferred + federalSettings.extraPreferredIncome;
  const grossFederalTaxable = ordinaryBeforeDeductions + preferredBeforeDeductions;
  const itemizedFederalDeduction = Math.min(federalSettings.propertyTax + federalSettings.stateIncomeTax, federalSettings.saltCap) + federalSettings.mortgageInterest;
  const federalDeduction = Math.max(federalSettings.standardDeduction, itemizedFederalDeduction);
  const federalTaxableAfterDeductions = Math.max(grossFederalTaxable - federalDeduction, 0);
  const prefTaxable = Math.min(preferredBeforeDeductions, federalTaxableAfterDeductions);
  const ordinaryTaxable = Math.max(federalTaxableAfterDeductions - prefTaxable, 0);
  const magi = grossFederalTaxable;
  const netInvestmentIncome = Math.max(ordinaryBeforeDeductions + preferredBeforeDeductions - flows.nonInvestmentIncome, 0);
  const niitThreshold = federalSettings.filingStatus === "mfj" ? 250000 : 200000;
  const niitBase = Math.max(Math.min(netInvestmentIncome, Math.max(magi - niitThreshold, 0)), 0);
  const stateGross = flows.stateTaxable + stateSettings.extraStateIncome;
  const stateItemized = stateSettings.mortgageInterest + stateSettings.propertyTax + stateSettings.stateIncomeTax;
  const stateDeduction = Math.max(stateSettings.standardDeduction, stateItemized);
  const stateTaxableAfterDeductions = Math.max(stateGross - stateDeduction, 0);
  const hasRealData = useMemo(
    () => investments.some((row) => row.totalInvestment > 0 || row.yearlyIncome > 0 || row.includeIncome),
    [investments]
  );
  const otherIncomeForSs =
    taxCalcInputs.nonInvestmentOrdinaryIncome +
    taxCalcInputs.otherOrdinaryInvestmentIncome +
    taxCalcInputs.ordinaryDividends +
    taxCalcInputs.qualifiedDividends +
    taxCalcInputs.longTermCapitalGains;
  const taxableSocialSecurity = calculateTaxableSocialSecurity(
    taxCalcInputs.grossSocialSecurity,
    otherIncomeForSs,
    taxCalcInputs.muniBondInterest,
    taxCalcInputs.filingStatus
  );
  const ordinaryTaxableBeforeDeductions = taxCalcInputs.nonInvestmentOrdinaryIncome + taxableSocialSecurity;
  const preferredTaxableBeforeDeductions = taxCalcInputs.qualifiedDividends + taxCalcInputs.longTermCapitalGains;
  const federalGrossTaxable = ordinaryTaxableBeforeDeductions + preferredTaxableBeforeDeductions;
  const cappedSalt = Math.min(taxCalcInputs.propertyTax + taxCalcInputs.stateIncomeTax, taxCalcInputs.federalSaltCap);
  const federalItemizedDeduction = taxCalcInputs.mortgageInterest + cappedSalt;
  const federalDeductionUsed = Math.max(taxCalcInputs.federalStandardDeduction, federalItemizedDeduction);
  const federalTaxableAfterDeductionsStandalone = Math.max(federalGrossTaxable - federalDeductionUsed, 0);
  const ordinaryTaxableForApi = Math.max(federalTaxableAfterDeductionsStandalone - preferredTaxableBeforeDeductions, 0);
  const preferredTaxableForApi = Math.max(0, Math.min(preferredTaxableBeforeDeductions, federalTaxableAfterDeductionsStandalone));
  const magiStandalone =
    taxCalcInputs.nonInvestmentOrdinaryIncome +
    taxableSocialSecurity +
    taxCalcInputs.otherOrdinaryInvestmentIncome +
    taxCalcInputs.ordinaryDividends +
    taxCalcInputs.qualifiedDividends +
    taxCalcInputs.longTermCapitalGains;
  const netInvestmentIncomeStandalone =
    taxCalcInputs.otherOrdinaryInvestmentIncome +
    taxCalcInputs.ordinaryDividends +
    taxCalcInputs.qualifiedDividends +
    taxCalcInputs.longTermCapitalGains;
  const niitThresholdCalc = taxCalcInputs.filingStatus === "mfj" ? 250000 : 200000;
  const magiAboveThreshold = Math.max(magiStandalone - niitThresholdCalc, 0);
  const niitBaseCalc = Math.min(netInvestmentIncomeStandalone, magiAboveThreshold);
  const caItemizedDeduction = taxCalcInputs.mortgageInterest + taxCalcInputs.propertyTax + taxCalcInputs.stateIncomeTax;
  const caDeductionUsed = Math.max(taxCalcInputs.caStandardDeduction, caItemizedDeduction);
  const caTaxableIncome = Math.max(magi - caDeductionUsed, 0);
  const stateTaxableForCalc = caTaxableIncome;
  const totalTaxCalc = (taxCalcResult?.tax || 0) + (taxCalcStateResult?.tax || 0);
  const netAfterWithholdingsCalc =
    totalTaxCalc - (taxCalcInputs.federalWithholding + taxCalcInputs.stateWithholding);
  const afterTaxIncomeCalc =
    magiStandalone - totalTaxCalc + taxCalcInputs.federalWithholding + taxCalcInputs.stateWithholding;

  useEffect(() => {
    let cancelled = false;
    loadWorkbook(WORKSPACE_ID).then((response) => {
      if (cancelled) return;
      const workbookSettings = parseWorkbookSettings(response.settings);
      setInvestments(
        mapWorkbookRows(initialInvestments, response.tabs?.investments, workbookToInvestmentRow)
      );
      setTickers(
        mapWorkbookRows(initialTickers, response.tabs?.tickers, workbookToTickerRow)
      );
      setTaxTreatments(
        mapWorkbookRows(initialTaxTreatments, response.tabs?.taxTreatment, workbookToTaxTreatmentRow)
      );
      setAccounts(
        mapWorkbookRows(initialAccounts, response.tabs?.accounts, workbookToAccountRow)
      );
      setAccountTaxTypes(
        mapWorkbookRows(initialAccountTaxTypes, response.tabs?.accountTaxType, workbookToAccountTaxTypeRow)
      );
      setInvestmentTypes(
        mapWorkbookRows(initialInvestmentTypes, response.tabs?.investmentType, workbookToInvestmentTypeRow)
      );
      setFederalSettings(mergeSettings(initialFederalSettings, workbookSettings.federal));
      setStateSettings(mergeSettings(initialStateSettings, workbookSettings.state));
      setPlannerSettings(mergeSettings(initialPlannerSettings, workbookSettings.planner));
      setUiSettings({
        investmentFavorites: workbookSettings.ui?.investmentFavorites || [],
      });
      hasLoadedStorage.current = true;
      setStorageState("ready");
      setStorageMessage(response.updatedAt ? `Synced ${new Date(response.updatedAt).toLocaleString()}` : "Ready to save");
    }).catch((error: Error) => {
      setStorageState("error");
      setStorageMessage(error.message);
      hasLoadedStorage.current = true;
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    postTaxCalculation({ calc: "FED_TAX_2025_COMBINED", ordinaryTaxable, prefTaxable, filingStatus: federalSettings.filingStatus, magi, netInvestmentIncome }).then((result) => {
      if (!cancelled) { setFederalResult(result); setFederalError(null); }
    }).catch((error: Error) => {
      if (!cancelled) { setFederalResult(null); setFederalError(error.message); }
    });

    postTaxCalculation({ calc: "STATE_TAX_2025_CA_MFJ", taxableIncome: stateTaxableAfterDeductions }).then((result) => {
      if (!cancelled) { setStateResult(result); setStateError(null); }
    }).catch((error: Error) => {
      if (!cancelled) { setStateResult(null); setStateError(error.message); }
    });

    return () => { cancelled = true; };
    }, [ordinaryTaxable, prefTaxable, federalSettings.filingStatus, magi, netInvestmentIncome, stateTaxableAfterDeductions]);

  useEffect(() => {
    let cancelled = false;
    setTaxCalcError(null);
    postTaxCalculation({
      calc: "FED_TAX_2025_COMBINED",
      ordinaryTaxable: ordinaryTaxableForApi,
      prefTaxable: preferredTaxableForApi,
      filingStatus: taxCalcInputs.filingStatus,
      magi: magiStandalone,
      netInvestmentIncome: netInvestmentIncomeStandalone,
    })
      .then((result) => {
        if (!cancelled) {
          setTaxCalcResult(result);
          setTaxCalcError(null);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setTaxCalcResult(null);
          setTaxCalcError(error.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ordinaryTaxableForApi, preferredTaxableForApi, taxCalcInputs.filingStatus, magiStandalone, netInvestmentIncomeStandalone]);

  useEffect(() => {
    let cancelled = false;
    setTaxCalcStateError(null);
    postTaxCalculation({
      calc: "STATE_TAX_2025_CA_MFJ",
      taxableIncome: stateTaxableForCalc,
    })
      .then((result) => {
        if (!cancelled) {
          setTaxCalcStateResult(result);
          setTaxCalcStateError(null);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setTaxCalcStateResult(null);
          setTaxCalcStateError(error.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stateTaxableForCalc]);

  useEffect(() => {
    if (!hasLoadedStorage.current) return;
    if (!hasRealData && investments.length > 0) {
      return;
    }
    if (saveTimeout.current) window.clearTimeout(saveTimeout.current);
    setStorageState("saving");
    setStorageMessage("Saving workbook...");
    saveTimeout.current = window.setTimeout(() => {
      let cancelled = false;
      saveWorkbook(WORKSPACE_ID, { workspaceId: WORKSPACE_ID, tabs: { investments, tickers, taxTreatment: taxTreatments, accounts, accountTaxType: accountTaxTypes, investmentType: investmentTypes }, settings: { federal: federalSettings, state: stateSettings, planner: plannerSettings, ui: uiSettings } }).then((response) => {
        if (!cancelled) { setStorageState("saved"); setStorageMessage(response.updatedAt ? `Saved ${new Date(response.updatedAt).toLocaleTimeString()}` : "Saved"); }
      }).catch((error: Error) => {
        if (!cancelled) { setStorageState("error"); setStorageMessage(error.message); }
      });
      return () => { cancelled = true; };
    }, 700);
    return () => { if (saveTimeout.current) window.clearTimeout(saveTimeout.current); };
  }, [investments, tickers, taxTreatments, accounts, accountTaxTypes, investmentTypes, federalSettings, stateSettings, plannerSettings, uiSettings, hasRealData]);

  const totalTax = (federalResult?.tax || 0) + (stateResult?.tax || 0);
  const afterTaxIncome = flows.totalIncome - totalTax;

  const updateTaxCalculatorNumber = (field: Exclude<keyof TaxCalculatorInputs, "filingStatus">, value: string | number) => {
    const numeric = toNumber(value);
    setTaxCalcInputs((current) => ({ ...current, [field]: numeric }));
  };
  const handleWithholdingChange = (field: "federalWithholding" | "stateWithholding", value: string | number) => {
    updateTaxCalculatorNumber(field, value);
    setPlannerSettings((current) => ({ ...current, [field]: toNumber(value) }));
  };
  const updateTaxCalculatorStatus = (status: FilingStatus) => {
    setTaxCalcInputs((current) => ({ ...current, filingStatus: status }));
  };

  const saveFavorite = (favoriteName: string) => {
    const name = normalizeFavoriteName(favoriteName);
    if (!name) {
      setStorageState("error");
      setStorageMessage("Favorite name is required.");
      return;
    }
    const keySet = new Set<string>();
    investments.filter((row) => row.includeIncome).forEach((row) => {
      buildInvestmentFavoriteKeys(row).forEach((key) => keySet.add(key));
    });
    if (keySet.size === 0) {
      setStorageState("error");
      setStorageMessage("Select at least one included investment before saving a favorite.");
      return;
    }
    const nameKey = normalizeLookupKey(name);
    const nextFavorite: InvestmentFavorite = {
      name,
      investmentKeys: [...keySet],
      createdAt: new Date().toISOString(),
    };
    setUiSettings((current) => ({
      ...current,
      investmentFavorites: [
        ...current.investmentFavorites.filter((favorite) => normalizeLookupKey(favorite.name) !== nameKey),
        nextFavorite,
      ],
    }));
    setStorageState("ready");
    setStorageMessage(`Favorite "${name}" saved.`);
  };

  const applyFavorite = (favoriteName: string) => {
    const selectedKey = normalizeLookupKey(favoriteName);
    const favorite = uiSettings.investmentFavorites.find(
      (entry) => normalizeLookupKey(entry.name) === selectedKey
    );
    if (!favorite) {
      setStorageState("error");
      setStorageMessage("Select a favorite to apply.");
      return;
    }
    const favoriteKeys = new Set(favorite.investmentKeys);
    setInvestments((current) =>
      current.map((row) => {
        const includeIncome = buildInvestmentFavoriteKeys(row).some((key) => favoriteKeys.has(key));
        return { ...row, includeIncome };
      })
    );
    setStorageState("ready");
    setStorageMessage(`Favorite "${favorite.name}" applied.`);
  };

  const deleteFavorite = (favoriteName: string) => {
    const selectedKey = normalizeLookupKey(favoriteName);
    if (!selectedKey) {
      setStorageState("error");
      setStorageMessage("Select a favorite to delete.");
      return;
    }
    const favorite = uiSettings.investmentFavorites.find(
      (entry) => normalizeLookupKey(entry.name) === selectedKey
    );
    if (!favorite) {
      setStorageState("error");
      setStorageMessage("Favorite not found.");
      return;
    }
    setUiSettings((current) => ({
      ...current,
      investmentFavorites: current.investmentFavorites.filter(
        (entry) => normalizeLookupKey(entry.name) !== selectedKey
      ),
    }));
    setStorageState("ready");
    setStorageMessage(`Favorite "${favorite.name}" deleted.`);
  };

  const renameFavorite = (oldFavoriteName: string, newFavoriteName: string) => {
    const oldKey = normalizeLookupKey(oldFavoriteName);
    const nextName = normalizeFavoriteName(newFavoriteName);
    const newKey = normalizeLookupKey(nextName);
    if (!oldKey || !newKey) {
      setStorageState("error");
      setStorageMessage("Favorite rename requires old and new names.");
      return;
    }
    const existing = uiSettings.investmentFavorites.find((entry) => normalizeLookupKey(entry.name) === oldKey);
    if (!existing) {
      setStorageState("error");
      setStorageMessage("Favorite not found for rename.");
      return;
    }
    const conflict = uiSettings.investmentFavorites.some(
      (entry) => normalizeLookupKey(entry.name) === newKey && normalizeLookupKey(entry.name) !== oldKey
    );
    if (conflict) {
      setStorageState("error");
      setStorageMessage(`Favorite "${nextName}" already exists.`);
      return;
    }
    setUiSettings((current) => ({
      ...current,
      investmentFavorites: current.investmentFavorites.map((entry) =>
        normalizeLookupKey(entry.name) === oldKey
          ? { ...entry, name: nextName }
          : entry
      ),
    }));
    setStorageState("ready");
    setStorageMessage(`Favorite "${existing.name}" renamed to "${nextName}".`);
  };

  function updateCollection<T extends { id: number }>(setter: React.Dispatch<React.SetStateAction<T[]>>, numericFields: Array<keyof T> = [], booleanFields: Array<keyof T> = []) {
    return (id: number, field: keyof T, value: string | boolean) => {
      setter((current) => current.map((row) => row.id !== id ? row : booleanFields.includes(field) ? { ...row, [field]: Boolean(value) } : numericFields.includes(field) ? { ...row, [field]: toNumber(value) } : { ...row, [field]: value }));
    };
  }
  function addRow<T extends { id: number }>(setter: React.Dispatch<React.SetStateAction<T[]>>, row: T) { setter((current) => [...current, row]); }
  function removeRow<T extends { id: number }>(setter: React.Dispatch<React.SetStateAction<T[]>>) { return (id: number) => setter((current) => current.filter((row) => row.id !== id)); }
  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <div className="sidebar__brand"><p>Portfolio Planner</p><h1>Workbook Frontend</h1><span>Git-backed Amplify app using the same tax backend and workbook storage as the sheet.</span></div>
        <nav className="sidebar__nav">{navItems.map((item) => <button key={item.key} className={`nav-item ${activeTab === item.key ? "nav-item--active" : ""}`} type="button" onClick={() => setActiveTab(item.key)}><strong>{item.label}</strong><span>{item.meta}</span></button>)}</nav>
      </aside>
      <main className="content-panel">
        <div className="summary-ribbon">
          <MetricCard label="Total investment amount" value={formatCurrency(flows.totalInvestmentAmount)} tone="accent" />
          <MetricCard label="Annual income" value={formatCurrency(flows.totalIncome)} />
          <MetricCard label="Portfolio yield" value={formatPercent(flows.totalInvestmentAmount > 0 ? flows.totalIncome / flows.totalInvestmentAmount : 0)} />
          <MetricCard label="After-tax income" value={formatCurrency(afterTaxIncome)} tone="warning" />
          <MetricCard label="Federal tax" value={formatCurrencyDetailed(federalResult?.tax || 0)} />
          <MetricCard label="State tax" value={formatCurrencyDetailed(stateResult?.tax || 0)} />
          <MetricCard label="Workbook sync" value={storageMessage} tone={storageState === "error" ? "warning" : "default"} />
        </div>
        <div className="content-topbar"><div><p className="eyebrow">Live Model</p><h2>{navItems.find((item) => item.key === activeTab)?.label}</h2></div><div className="topbar-stack"><div className="topbar-chip">Workspace: {WORKSPACE_ID}</div><div className="topbar-chip">Storage: {storageState}</div><div className="topbar-chip">Version: {APP_VERSION}</div></div></div>

        {activeTab === "investments" && storageState === "loading" && (
          <Section title="Investments" subtitle="Loading workbook data from storage...">
            <div className="status-card status-card--note">Loading account and tax-status mappings...</div>
          </Section>
        )}
        {activeTab === "investments" && storageState !== "loading" && <InvestmentsTable rows={investments} accountOptions={accountOptions} symbolOptions={symbolOptions} accountTaxStatusByName={accountTaxStatusByName} derivedRows={derivedRows} favorites={uiSettings.investmentFavorites} onSaveFavorite={saveFavorite} onApplyFavorite={applyFavorite} onDeleteFavorite={deleteFavorite} onRenameFavorite={renameFavorite} onChange={updateCollection(setInvestments, ["totalInvestment", "yearlyIncome", "newPercent"], ["includeIncome", "overrideProposal"])} onAdd={() => addRow(setInvestments, { id: Date.now(), description: "New Investment", account: accountOptions[1] || "", category: "core", totalInvestment: 0, yearlyIncome: 0, includeIncome: true, overrideProposal: false, symbol: symbolOptions[1] || "", newSymbol: symbolOptions[1] || "", newPercent: 0 })} onRemove={removeRow(setInvestments)} onClear={() => setInvestments([])} onSelectAllInc={() => setInvestments((current) => current.map((row) => ({ ...row, includeIncome: true })))} onClearAllInc={() => setInvestments((current) => current.map((row) => ({ ...row, includeIncome: false })))} />}
        {activeTab === "tickers" && <LookupTable title="Tickers" subtitle="Workbook symbol table. Percent return, category, tax treatment, and extra tax data all flow into the investment sheet lookups." rows={tickers} columns={[{ key: "symbol", label: "Symbol" }, { key: "percentReturn", label: "% Return", type: "number" }, { key: "category", label: "Category" }, { key: "taxTreatment", label: "Tax Treatment" }, { key: "extraData", label: "Extra Data", type: "number" }, { key: "description", label: "Description" }, { key: "exDividend", label: "Ex-dividend" }, { key: "divPayout", label: "Div payout" }]} onChange={updateCollection(setTickers, ["percentReturn", "extraData"])} onAdd={() => addRow(setTickers, { id: Date.now(), symbol: "", percentReturn: 0, category: "", taxTreatment: "income", extraData: 0, description: "", exDividend: "", divPayout: "" })} onRemove={removeRow(setTickers)} />}
        {activeTab === "accounts" && <LookupTable title="Accounts" subtitle="Workbook account lookup. Tax status and cashflow inclusion come directly from this sheet." rows={accounts} columns={[{ key: "account", label: "Account name" }, { key: "taxStatus", label: "Tax status", type: "select", options: accountTaxStatusOptions }, { key: "dividendAccrued", label: "Dividend accrued" }, { key: "includeInFreeCashflow", label: "Include in free cashflow" }]} onChange={updateCollection(setAccounts)} onAdd={() => addRow(setAccounts, { id: Date.now(), account: "", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" })} onRemove={removeRow(setAccounts)} />}
        {activeTab === "taxTreatment" && <LookupTable title="Tax Treatment" subtitle="Sheet treatment labels used by ticker rows and row-level tax adjustment logic." rows={taxTreatments} columns={[{ key: "label", label: "Label" }]} onChange={updateCollection(setTaxTreatments)} onAdd={() => addRow(setTaxTreatments, { id: Date.now(), label: "" })} onRemove={removeRow(setTaxTreatments)} />}
        {activeTab === "accountTaxType" && <LookupTable title="Account Tax Type" subtitle="Reference list for allowed account tax statuses." rows={accountTaxTypes} columns={[{ key: "taxStatus", label: "Tax status" }]} onChange={updateCollection(setAccountTaxTypes)} onAdd={() => addRow(setAccountTaxTypes, { id: Date.now(), taxStatus: "" })} onRemove={removeRow(setAccountTaxTypes)} />}
        {activeTab === "investmentType" && <LookupTable title="Investment Type" subtitle="Reference list for the asset classes used by the workbook rollups." rows={investmentTypes} columns={[{ key: "name", label: "Investment type" }]} onChange={updateCollection(setInvestmentTypes)} onAdd={() => addRow(setInvestmentTypes, { id: Date.now(), name: "" })} onRemove={removeRow(setInvestmentTypes)} />}

        {activeTab === "federal" && <Section title="Federal Tax" subtitle="Continuously recalculated from the workbook-style investment rows, the same row-level tax-adjustment logic used in the sheet, and the live Lambda backend."><div className="form-grid"><label><span>Filing status</span><select value={federalSettings.filingStatus} onChange={(event) => setFederalSettings((current) => ({ ...current, filingStatus: normalizeFilingStatus(event.target.value) }))}><option value="mfj">Married filing jointly</option><option value="single">Single</option></select></label><label><span>Extra ordinary income</span><input type="number" value={federalSettings.extraOrdinaryIncome} onChange={(event) => setFederalSettings((current) => ({ ...current, extraOrdinaryIncome: toNumber(event.target.value) }))} /></label><label><span>Extra preferred income</span><input type="number" value={federalSettings.extraPreferredIncome} onChange={(event) => setFederalSettings((current) => ({ ...current, extraPreferredIncome: toNumber(event.target.value) }))} /></label><label><span>Mortgage interest</span><input type="number" value={federalSettings.mortgageInterest} onChange={(event) => setFederalSettings((current) => ({ ...current, mortgageInterest: toNumber(event.target.value) }))} /></label><label><span>Property tax</span><input type="number" value={federalSettings.propertyTax} onChange={(event) => setFederalSettings((current) => ({ ...current, propertyTax: toNumber(event.target.value) }))} /></label><label><span>State income tax</span><input type="number" value={federalSettings.stateIncomeTax} onChange={(event) => setFederalSettings((current) => ({ ...current, stateIncomeTax: toNumber(event.target.value) }))} /></label><label><span>Standard deduction</span><input type="number" value={federalSettings.standardDeduction} onChange={(event) => setFederalSettings((current) => ({ ...current, standardDeduction: toNumber(event.target.value) }))} /></label><label><span>SALT cap</span><input type="number" value={federalSettings.saltCap} onChange={(event) => setFederalSettings((current) => ({ ...current, saltCap: toNumber(event.target.value) }))} /></label></div><div className="metric-grid"><MetricCard label="Ordinary from sheet logic" value={formatCurrency(flows.federalOrdinary)} /><MetricCard label="Preferred from sheet logic" value={formatCurrency(flows.federalPreferred)} /><MetricCard label="Non-invest income" value={formatCurrency(flows.nonInvestmentIncome)} /><MetricCard label="Muni interest" value={formatCurrency(flows.muniIncome)} /><MetricCard label="Ordinary taxable" value={formatCurrency(ordinaryTaxable)} tone="accent" /><MetricCard label="Preferred taxable" value={formatCurrency(prefTaxable)} /><MetricCard label="MAGI" value={formatCurrency(magi)} /><MetricCard label="Net investment income" value={formatCurrency(netInvestmentIncome)} /><MetricCard label="NIIT base" value={formatCurrency(niitBase)} /></div>{federalError && <div className="status-card status-card--error">{federalError}</div>}{federalResult && <div className="api-grid"><MetricCard label="Federal total" value={formatCurrencyDetailed(federalResult.tax)} tone="accent" /><MetricCard label="Ordinary tax" value={formatCurrencyDetailed(federalResult.ordinaryTax || 0)} /><MetricCard label="Preferred tax" value={formatCurrencyDetailed(federalResult.prefTax || 0)} /><MetricCard label="NIIT" value={formatCurrencyDetailed(federalResult.niit || 0)} /></div>}</Section>}
        {activeTab === "state" && <Section title="State Tax" subtitle="California worksheet fed from the investment-sheet state bucket column and the live backend."><div className="status-card status-card--note">Current backend support is still modeled for the California MFJ route.</div><div className="form-grid form-grid--compact-wide"><label><span>Extra California income</span><input type="number" value={stateSettings.extraStateIncome} onChange={(event) => setStateSettings((current) => ({ ...current, extraStateIncome: toNumber(event.target.value) }))} /></label><label><span>Mortgage interest</span><input type="number" value={stateSettings.mortgageInterest} onChange={(event) => setStateSettings((current) => ({ ...current, mortgageInterest: toNumber(event.target.value) }))} /></label><label><span>Property tax</span><input type="number" value={stateSettings.propertyTax} onChange={(event) => setStateSettings((current) => ({ ...current, propertyTax: toNumber(event.target.value) }))} /></label><label><span>State income tax</span><input type="number" value={stateSettings.stateIncomeTax} onChange={(event) => setStateSettings((current) => ({ ...current, stateIncomeTax: toNumber(event.target.value) }))} /></label><label><span>CA standard deduction</span><input type="number" value={stateSettings.standardDeduction} onChange={(event) => setStateSettings((current) => ({ ...current, standardDeduction: toNumber(event.target.value) }))} /></label></div><div className="metric-grid"><MetricCard label="State-taxable from sheet logic" value={formatCurrency(flows.stateTaxable)} /><MetricCard label="CA gross" value={formatCurrency(stateGross)} /><MetricCard label="CA deduction used" value={formatCurrency(stateDeduction)} /><MetricCard label="CA taxable after deductions" value={formatCurrency(stateTaxableAfterDeductions)} tone="accent" /></div>{stateError && <div className="status-card status-card--error">{stateError}</div>}{stateResult && <div className="api-grid"><MetricCard label="California tax" value={formatCurrencyDetailed(stateResult.tax)} tone="accent" /></div>}</Section>}
        {activeTab === "calculator" && (
          <Section title="Tax Calculator" subtitle="Standalone inputs that mirror the spreadsheet layout and call the shared federal + CA Lambdas.">
            <div className="calculator-section-grid">
              <div className="calculator-section">
                <h3>Setup</h3>
                <div className="form-grid form-grid--compact">
                  <label>
                    <span>Filing status</span>
                    <select value={taxCalcInputs.filingStatus} onChange={(event) => updateTaxCalculatorStatus(normalizeFilingStatus(event.target.value))}>
                      <option value="mfj">mfj</option>
                      <option value="single">single</option>
                    </select>
                    <small className="field-note">Use `mfj` for the combined federal backend route.</small>
                  </label>
                  <label>
                    <span>Federal standard deduction</span>
                    <input type="number" value={taxCalcInputs.federalStandardDeduction} onChange={(event) => updateTaxCalculatorNumber("federalStandardDeduction", event.target.value)} />
                    <small className="field-note">Edit if your standard deduction changes.</small>
                  </label>
                  <label>
                    <span>Federal SALT cap</span>
                    <input type="number" value={taxCalcInputs.federalSaltCap} onChange={(event) => updateTaxCalculatorNumber("federalSaltCap", event.target.value)} />
                    <small className="field-note">Current value used in your other tabs.</small>
                  </label>
                  <label>
                    <span>CA standard deduction</span>
                    <input type="number" value={taxCalcInputs.caStandardDeduction} onChange={(event) => updateTaxCalculatorNumber("caStandardDeduction", event.target.value)} />
                    <small className="field-note">Edit if needed.</small>
                  </label>
                </div>
              </div>
              <div className="calculator-section">
                <h3>Income inputs</h3>
                <div className="form-grid">
                  <label>
                    <span>Non-investment ordinary income</span>
                    <input type="number" value={taxCalcInputs.nonInvestmentOrdinaryIncome} onChange={(event) => updateTaxCalculatorNumber("nonInvestmentOrdinaryIncome", event.target.value)} />
                    <small className="field-note">Wages, pension, RMDs, etc.</small>
                  </label>
                  <label>
                    <span>Other ordinary-taxable investment income</span>
                    <input type="number" value={taxCalcInputs.otherOrdinaryInvestmentIncome} onChange={(event) => updateTaxCalculatorNumber("otherOrdinaryInvestmentIncome", event.target.value)} />
                    <small className="field-note">Interest, non-qualified distributions, short-term gains.</small>
                  </label>
                  <label>
                    <span>Ordinary dividends</span>
                    <input type="number" value={taxCalcInputs.ordinaryDividends} onChange={(event) => updateTaxCalculatorNumber("ordinaryDividends", event.target.value)} />
                    <small className="field-note">Non-qualified dividends only.</small>
                  </label>
                  <label>
                    <span>Qualified dividends</span>
                    <input type="number" value={taxCalcInputs.qualifiedDividends} onChange={(event) => updateTaxCalculatorNumber("qualifiedDividends", event.target.value)} />
                    <small className="field-note">Preferred-rate dividends.</small>
                  </label>
                  <label>
                    <span>Long-term capital gains</span>
                    <input type="number" value={taxCalcInputs.longTermCapitalGains} onChange={(event) => updateTaxCalculatorNumber("longTermCapitalGains", event.target.value)} />
                    <small className="field-note">Preferred-rate capital gains.</small>
                  </label>
                  <label>
                    <span>Gross Social Security benefits</span>
                    <input type="number" value={taxCalcInputs.grossSocialSecurity} onChange={(event) => updateTaxCalculatorNumber("grossSocialSecurity", event.target.value)} />
                    <small className="field-note">Enter gross annual SS benefits.</small>
                  </label>
                  <label>
                    <span>Muni bond interest</span>
                    <input type="number" value={taxCalcInputs.muniBondInterest} onChange={(event) => updateTaxCalculatorNumber("muniBondInterest", event.target.value)} />
                    <small className="field-note">Excluded from federal income but affects the SS test.</small>
                  </label>
                </div>
              </div>
              <div className="calculator-section">
                <h3>Deduction inputs</h3>
                <div className="form-grid">
                  <label>
                    <span>Mortgage interest</span>
                    <input type="number" value={taxCalcInputs.mortgageInterest} onChange={(event) => updateTaxCalculatorNumber("mortgageInterest", event.target.value)} />
                    <small className="field-note">Federal and CA itemized deduction input.</small>
                  </label>
                  <label>
                    <span>Property tax</span>
                    <input type="number" value={taxCalcInputs.propertyTax} onChange={(event) => updateTaxCalculatorNumber("propertyTax", event.target.value)} />
                    <small className="field-note">Included in SALT.</small>
                  </label>
                  <label>
                    <span>State income tax</span>
                    <input type="number" value={taxCalcInputs.stateIncomeTax} onChange={(event) => updateTaxCalculatorNumber("stateIncomeTax", event.target.value)} />
                    <small className="field-note">Included in SALT.</small>
                  </label>
                </div>
              </div>
            </div>
            <div className="calculator-section-grid">
              <div className="calculator-section">
                <h3>Federal derived</h3>
                <div className="derived-row"><span>Taxable Social Security</span><strong>{formatCurrency(taxableSocialSecurity)}</strong></div>
                <div className="derived-row"><span>Federal preferred taxable before deductions</span><strong>{formatCurrency(preferredTaxableBeforeDeductions)}</strong></div>
                <div className="derived-row"><span>Federal ordinary taxable before deductions</span><strong>{formatCurrency(ordinaryTaxableBeforeDeductions)}</strong></div>
                <div className="derived-row"><span>Federal gross taxable income</span><strong>{formatCurrency(federalGrossTaxable)}</strong></div>
                <div className="derived-row"><span>Federal itemized deduction</span><strong>{formatCurrency(federalItemizedDeduction)}</strong></div>
                <div className="derived-row"><span>Federal deduction used</span><strong>{formatCurrency(federalDeductionUsed)}</strong></div>
                <div className="derived-row"><span>Federal taxable after deductions</span><strong>{formatCurrency(federalTaxableAfterDeductionsStandalone)}</strong></div>
                <div className="derived-row"><span>Ordinary taxable passed to API</span><strong>{formatCurrency(ordinaryTaxableForApi)}</strong></div>
                <div className="derived-row"><span>Preferred taxable passed to API</span><strong>{formatCurrency(preferredTaxableForApi)}</strong></div>
              </div>
              <div className="calculator-section">
                <h3>NIIT derived</h3>
                <div className="derived-row"><span>MAGI</span><strong>{formatCurrency(magiStandalone)}</strong></div>
                <div className="derived-row"><span>NIIT threshold ({taxCalcInputs.filingStatus})</span><strong>{formatCurrency(niitThresholdCalc)}</strong></div>
                <div className="derived-row"><span>MAGI above threshold</span><strong>{formatCurrency(magiAboveThreshold)}</strong></div>
                <div className="derived-row"><span>Net investment income</span><strong>{formatCurrency(netInvestmentIncomeStandalone)}</strong></div>
                <div className="derived-row"><span>NIIT base</span><strong>{formatCurrency(niitBaseCalc)}</strong></div>
                <div className="derived-row"><span>Estimated NIIT</span><strong>{formatCurrency(taxCalcResult?.niit ?? niitBaseCalc * 0.038)}</strong></div>
              </div>
              <div className="calculator-section">
                <h3>CA derived</h3>
                <div className="derived-row"><span>CA itemized deduction</span><strong>{formatCurrency(caItemizedDeduction)}</strong></div>
                <div className="derived-row"><span>CA deduction used</span><strong>{formatCurrency(caDeductionUsed)}</strong></div>
                <div className="derived-row"><span>CA taxable income</span><strong>{formatCurrency(caTaxableIncome)}</strong></div>
                <div className="derived-row"><span>CA state tax</span><strong>{formatCurrencyDetailed(taxCalcStateResult?.tax || 0)}</strong></div>
              </div>
            </div>
            <div className="calculator-section-grid">
              <div className="calculator-section">
                <h3>Totals</h3>
                <div className="form-grid">
                  <label>
                    <span>Federal withholding</span>
                    <input type="number" value={taxCalcInputs.federalWithholding} onChange={(event) => handleWithholdingChange("federalWithholding", event.target.value)} />
                    <small className="field-note">Optional input.</small>
                  </label>
                  <label>
                    <span>State withholding</span>
                    <input type="number" value={taxCalcInputs.stateWithholding} onChange={(event) => handleWithholdingChange("stateWithholding", event.target.value)} />
                    <small className="field-note">Optional input.</small>
                  </label>
                </div>
                <div className="derived-row"><span>Combined federal + state tax</span><strong>{formatCurrencyDetailed(totalTaxCalc)}</strong></div>
                <div className="derived-row"><span>Monthly tax impact</span><strong>{formatCurrencyDetailed(totalTaxCalc / 12)}</strong></div>
                <div className="derived-row"><span>Net owed / (refund)</span><strong>{formatCurrency(totalTaxCalc - (taxCalcInputs.federalWithholding + taxCalcInputs.stateWithholding))}</strong></div>
              </div>
              <div className="calculator-section">
                <h3>Audit</h3>
                <div className="derived-row"><span>Backend formula used</span><strong>FED_TAX_2025_COMBINED</strong></div>
                <div className="derived-row"><span>CA formula used</span><strong>STATE_TAX_2025_CA_MFJ</strong></div>
                <div className="derived-row"><span>Notes</span><strong>Combined federal route currently supports `mfj`.</strong></div>
              </div>
            </div>
            {taxCalcError && <div className="status-card status-card--error">{taxCalcError}</div>}
            {taxCalcStateError && <div className="status-card status-card--error">{taxCalcStateError}</div>}
            <div className="metric-grid calculator-results__grid">
              <MetricCard label="Federal tax (calc)" value={formatCurrencyDetailed(taxCalcResult?.tax || 0)} tone="accent" />
              <MetricCard label="State tax (calc)" value={formatCurrencyDetailed(taxCalcStateResult?.tax || 0)} />
              <MetricCard label="Federal NIIT" value={formatCurrencyDetailed(taxCalcResult?.niit || 0)} />
              <MetricCard label="Preferred tax" value={formatCurrencyDetailed(taxCalcResult?.prefTax || 0)} />
              <MetricCard label="Ordinary tax" value={formatCurrencyDetailed(taxCalcResult?.ordinaryTax || 0)} />
            </div>
            <div className="metric-grid calculator-summary-grid">
              <MetricCard label="Total tax" value={formatCurrencyDetailed(totalTaxCalc)} tone="accent" />
              <MetricCard label="After-tax income" value={formatCurrencyDetailed(afterTaxIncomeCalc)} tone="warning" />
              <MetricCard label="Net owed / refund" value={formatCurrencyDetailed(netAfterWithholdingsCalc)} tone={netAfterWithholdingsCalc > 0 ? "warning" : "accent"} />
              <MetricCard label="MAGI used by calc" value={formatCurrency(magiStandalone)} />
              <MetricCard label="Net investment income" value={formatCurrency(netInvestmentIncomeStandalone)} />
              <MetricCard label="CA taxable" value={formatCurrency(caTaxableIncome)} />
            </div>
          </Section>
        )}
      </main>
    </div>
  );
}
