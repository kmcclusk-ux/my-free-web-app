import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import { createPortal } from "react-dom";
import "./App.css";

type TabKey =
  | "investments"
  | "federal"
  | "state"
  | "calculator"
  | "tickers"
  | "categories"
  | "taxTreatment"
  | "accounts"
  | "accountTaxType"
  | "investmentType";

type FilingStatus = "single" | "mfj";
type TaxResult = { calc: string; tax: number; ordinaryTax?: number; prefTax?: number; niit?: number; state?: string; stateName?: string; note?: string };
type ApiError = { error: string };
type SaveState = "loading" | "ready" | "saving" | "saved" | "error";
type ThermometerMarker = { amount: number; label: string; detail: string; tone?: string };
type ThermometerValue = { amount: number; label: string; value: string; tone: string };
type ThermometerStat = { label: string; value: string; tone?: string };

type InvestmentRow = {
  id: number;
  spreadsheetRowNumber?: number;
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
  incomeItem: boolean;
  extraData: number;
  filteredIncome: number;
  displayYearlyIncome: number;
  displayMonthlyIncome: number;
  displayFilteredIncome: number;
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

type TickerRow = { id: number; symbol: string; percentReturn: number; category: string; taxTreatment: string; incomeItem: boolean; extraData: number; description: string; exDividend: string; divPayout: string };
type CategoryRow = { id: number; name: string };
type TaxTreatmentRow = { id: number; label: string };
type AccountRow = { id: number; account: string; taxStatus: string; dividendAccrued: string; includeInFreeCashflow: string };
type AccountTaxTypeRow = { id: number; taxStatus: string };
type InvestmentTypeRow = { id: number; name: string };

type FederalSettings = { filingStatus: FilingStatus; extraOrdinaryIncome: number; extraPreferredIncome: number; mortgageInterest: number; propertyTax: number; stateIncomeTax: number; standardDeduction: number; saltCap: number };
type StateSettings = { stateCode: string; extraStateIncome: number; mortgageInterest: number; propertyTax: number; stateIncomeTax: number; standardDeduction: number };
type PlannerSettings = { federalWithholding: number; stateWithholding: number };
type InvestmentFavorite = { name: string; investmentKeys: string[]; createdAt: string };
type UiSettings = { investmentFavorites: InvestmentFavorite[] };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; actions?: AssistantAction[]; createdAt: string; error?: boolean };
type AuthTokens = { idToken: string; accessToken: string; refreshToken?: string; expiresAt: number };
type AuthUser = { sub: string; email?: string; name?: string };
type AuthState =
  | { status: "loading"; user: null; tokens: null; error?: string }
  | { status: "signedOut"; user: null; tokens: null; error?: string }
  | { status: "signedIn"; user: AuthUser; tokens: AuthTokens; error?: string };
type WorkbookTableId = "investments" | "tickers" | "accounts" | "categories" | "taxTreatment" | "accountTaxType" | "investmentType";
type PortfolioSnapshot = {
  generatedAt: string;
  view: { activeTab: TabKey; focusGrid: boolean; filters: InvestmentFilters; sort: InvestmentSort; selectedAssetIds: number[] };
  holdings: Array<{
    id: number;
    spreadsheetRowNumber?: number;
    description: string;
    account: string;
    category: string;
    symbol: string;
    newSymbol: string;
    effectiveSymbol: string;
    totalInvestment: number;
    yearlyIncome: number;
    monthlyIncome: number;
    includedTotal: number;
    filteredIncome: number;
    includeIncome: boolean;
    overrideProposal: boolean;
    taxStatus: string;
    taxTreatment: string;
    investmentType: string;
    currentPercent: number;
    effectivePercent: number;
    newPercent: number;
    allocationPercent: number;
  }>;
  accounts: Array<{ id: number; account: string; taxStatus: string; dividendAccrued: string; includeInFreeCashflow: string }>;
  referenceTables: {
    tickers: TickerRow[];
    categories: CategoryRow[];
    taxTreatment: TaxTreatmentRow[];
    accountTaxType: AccountTaxTypeRow[];
    investmentType: InvestmentTypeRow[];
  };
  editableTables: {
    tableIds: WorkbookTableId[];
    investmentFields: Array<keyof InvestmentRow>;
    tickerFields: Array<keyof TickerRow>;
    accountFields: Array<keyof AccountRow>;
  };
  assetClasses: Record<string, number>;
  metrics: {
    totalInvestmentAmount: number;
    totalIncome: number;
    portfolioYield: number;
    afterTaxIncome: number;
    federalTax: number;
    stateTax: number;
    totalTax: number;
    federalTaxable: number;
    stateTaxable: number;
    magi: number;
    netInvestmentIncome: number;
  };
  concentration: {
    topHolding?: { id: number; description: string; allocationPercent: number };
    topAccount?: { account: string; allocationPercent: number };
    topAssetClass?: { assetClass: string; allocationPercent: number };
  };
};
type AssistantAction =
  | { type: "setCheckbox"; payload: { id: number; checked: boolean; field?: "includeIncome" | "overrideProposal" }; requiresConfirmation?: boolean }
  | { type: "setAllCheckboxes"; payload: { checked: boolean; field?: "includeIncome" | "overrideProposal" }; requiresConfirmation?: boolean }
  | { type: "selectAsset"; payload: { assetId: number | string; matchMode?: "row" | "symbol"; field?: string; column?: string; symbol?: string }; requiresConfirmation?: boolean }
  | { type: "selectAssets"; payload: { assetIds?: Array<number | string>; ids?: Array<number | string>; rowIds?: Array<number | string>; investmentIds?: Array<number | string>; selectors?: Array<number | string>; symbol?: string; selector?: string; assetId?: number | string; description?: string; query?: string; matchMode?: "row" | "symbol"; field?: string; column?: string }; requiresConfirmation?: boolean }
  | { type: "highlightRows"; payload: { assetIds?: Array<number | string>; ids?: Array<number | string>; rowIds?: Array<number | string>; investmentIds?: Array<number | string>; selectors?: Array<number | string>; symbol?: string; selector?: string; assetId?: number | string; description?: string; query?: string; matchMode?: "row" | "symbol"; field?: string; column?: string }; requiresConfirmation?: boolean }
  | { type: "selectRows"; payload: { assetIds?: Array<number | string>; ids?: Array<number | string>; rowIds?: Array<number | string>; investmentIds?: Array<number | string>; selectors?: Array<number | string>; symbol?: string; selector?: string; assetId?: number | string; description?: string; query?: string; matchMode?: "row" | "symbol"; field?: string; column?: string }; requiresConfirmation?: boolean }
  | { type: "selectAccount"; payload: { accountId: number | string }; requiresConfirmation?: boolean }
  | { type: "setFilter"; payload: { filterName: keyof InvestmentFilters; value: string }; requiresConfirmation?: boolean }
  | { type: "clearFilters"; payload?: Record<string, never>; requiresConfirmation?: boolean }
  | { type: "sortTable"; payload: { tableId: "investments"; column: InvestmentSortColumn; direction: "asc" | "desc" }; requiresConfirmation?: boolean }
  | { type: "setView"; payload: { viewName: string }; requiresConfirmation?: boolean }
  | { type: "addRow"; payload: { tableId: WorkbookTableId; row?: Record<string, unknown>; values?: Record<string, unknown> }; requiresConfirmation?: boolean }
  | { type: "updateRow"; payload: { tableId: WorkbookTableId; id?: number | string; selector?: string; all?: boolean; values: Record<string, unknown> }; requiresConfirmation?: boolean }
  | { type: "upsertRows"; payload: { tableId: WorkbookTableId; rows?: Array<Record<string, unknown>>; row?: Record<string, unknown>; values?: Array<Record<string, unknown>>; matchField?: string }; requiresConfirmation?: boolean }
  | { type: "replaceRows"; payload: { tableId: WorkbookTableId; rows?: Array<Record<string, unknown>>; values?: Array<Record<string, unknown>> }; requiresConfirmation?: boolean }
  | { type: "deleteRows"; payload: { tableId: WorkbookTableId; id?: number | string; ids?: Array<number | string>; selector?: string; all?: boolean }; requiresConfirmation?: boolean };
type ChatResponse = { message: string; actions?: AssistantAction[]; model?: string; usage?: unknown; error?: string };
type InvestmentFilters = { account: string; category: string; asset: string };
type InvestmentSortColumn = "description" | "account" | "category" | "totalInvestment" | "yearlyIncome" | "symbol" | "includedTotal" | "filteredIncome";
type InvestmentSort = { tableId: "investments"; column: InvestmentSortColumn | ""; direction: "asc" | "desc" };
type AssistantActionResult = { ok: boolean; message: string; requiresConfirmation?: boolean };
type AssistantEditableRow = Record<string, unknown> & { id: number };
type AssistantTableConfig = {
  tableId: WorkbookTableId;
  label: string;
  tab: TabKey;
  rows: AssistantEditableRow[];
  setRows: (updater: (current: AssistantEditableRow[]) => AssistantEditableRow[]) => void;
  allowedFields: string[];
  numericFields: string[];
  booleanFields: string[];
  defaultRow: (id: number) => AssistantEditableRow;
};
type TaxCalculatorInputs = {
  filingStatus: FilingStatus;
  federalStandardDeduction: number;
  federalSaltCap: number;
  caStandardDeduction: number;
  stateCode: string;
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
  stateCode: "CA",
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
    categories: CategoryRow[];
    category: CategoryRow[];
    taxTreatment: TaxTreatmentRow[];
    accounts: AccountRow[];
    accountTaxType: AccountTaxTypeRow[];
    investmentType: InvestmentTypeRow[];
  }>;
  settings?: Partial<{ federal: FederalSettings; state: StateSettings; planner: PlannerSettings; ui: UiSettings }>;
  updatedAt?: string | null;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;
const WORKSPACE_ID = "default";
const WORKBOOK_SHEET_URL = "https://docs.google.com/spreadsheets/d/1mdio6n9O8qlon0SeIt8GOA65XkZ-Xwva7a30DOURLDU/edit?gid=0#gid=0";
const CHATGPT_URL = "https://chatgpt.com/";
const MCP_CONNECTOR_BASE_URL = (import.meta.env.VITE_MCP_CONNECTOR_BASE_URL as string | undefined)?.replace(/\/+$/, "") || "https://www.aftertaxus.com/mcp";
const US_FLAG_ICON_URL = "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20the%20United%20States.svg?width=32";
const COGNITO_DOMAIN = (import.meta.env.VITE_COGNITO_DOMAIN as string | undefined)?.replace(/\/+$/, "") || "";
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
const BROWSER_ROOT_URI = typeof window !== "undefined"
  ? new URL(
      "/",
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? window.location.origin
        : `https://${window.location.host}`
    ).toString()
  : "";
const COGNITO_REDIRECT_URI = import.meta.env.VITE_COGNITO_REDIRECT_URI || BROWSER_ROOT_URI;
const COGNITO_LOGOUT_URI = import.meta.env.VITE_COGNITO_LOGOUT_URI || COGNITO_REDIRECT_URI;
const COGNITO_SCOPES = import.meta.env.VITE_COGNITO_SCOPES || "openid email profile";
const ASSISTANT_MESSAGE_HISTORY_KEY = "portfolio-assistant-message-history";
const ASSISTANT_MESSAGE_HISTORY_LIMIT = 100;
const ASSISTANT_PROMPT_HISTORY_KEY = "portfolio-assistant-prompt-history";
const ASSISTANT_PROMPT_HISTORY_LIMIT = 50;
const AUTH_STORAGE_KEY = "portfolio-auth-session";
const AUTH_PKCE_STORAGE_KEY = "portfolio-auth-pkce";
const INVESTMENT_COLUMN_WIDTH_STORAGE_KEY = "aftertaxus-investment-column-widths";
const INVESTMENT_COLUMN_DEFS = [
  { id: "move", label: "", ariaLabel: "Move row", className: "drag-handle-heading", defaultWidth: 30, minWidth: 26 },
  { id: "row", label: "Row", className: "sheet-row-heading", defaultWidth: 36, minWidth: 32 },
  { id: "included", label: "Inc", ariaLabel: "Included", title: "Included", className: "included-heading", defaultWidth: 30, minWidth: 28 },
  { id: "account", label: "Account", defaultWidth: 150, minWidth: 96 },
  { id: "symbol", label: "Symbol", defaultWidth: 82, minWidth: 78 },
  { id: "normalPercent", label: "Dividend", defaultWidth: 58, minWidth: 48 },
  { id: "amount", label: "Investment", defaultWidth: 104, minWidth: 100 },
  { id: "year", label: "Year", defaultWidth: 82, minWidth: 62 },
  { id: "month", label: "Month", defaultWidth: 54, minWidth: 46 },
  { id: "filtered", label: "Filtered", defaultWidth: 72, minWidth: 58, group: "debug" },
  { id: "total", label: "Total", defaultWidth: 72, minWidth: 58, group: "debug" },
  { id: "taxStatus", label: "Tax Status", defaultWidth: 78, minWidth: 62, group: "tax" },
  { id: "ordinary", label: "Ordinary", defaultWidth: 66, minWidth: 54, group: "tax" },
  { id: "preferred", label: "Preferred", defaultWidth: 70, minWidth: 54, group: "tax" },
  { id: "state", label: "State", defaultWidth: 58, minWidth: 48, group: "tax" },
  { id: "nonTaxable", label: "Non taxable", defaultWidth: 78, minWidth: 58, group: "tax" },
  { id: "investmentType", label: "Inv. type", defaultWidth: 78, minWidth: 60, group: "tax" },
  { id: "nonInvestmentIncome", label: "Non-invest income", defaultWidth: 82, minWidth: 62, group: "tax" },
  { id: "cash", label: "Cash", defaultWidth: 58, minWidth: 48, group: "tax" },
  { id: "stocks", label: "Stocks", defaultWidth: 62, minWidth: 48, group: "tax" },
  { id: "preferredStock", label: "Preferred stock", defaultWidth: 78, minWidth: 58, group: "tax" },
  { id: "bonds", label: "Bonds", defaultWidth: 62, minWidth: 48, group: "tax" },
  { id: "muniBond", label: "Muni-bond", defaultWidth: 70, minWidth: 52, group: "tax" },
  { id: "muniInterest", label: "Muni-int", defaultWidth: 66, minWidth: 52, group: "tax" },
  { id: "businessDevelopment", label: "Bus dev", defaultWidth: 66, minWidth: 52, group: "tax" },
  { id: "coveredCall", label: "Covered call", defaultWidth: 78, minWidth: 58, group: "tax" },
  { id: "realEstate", label: "Real estate", defaultWidth: 76, minWidth: 56, group: "tax" },
  { id: "bitcoin", label: "Bitcoin", defaultWidth: 62, minWidth: 48, group: "tax" },
  { id: "override", label: "WhatIf", defaultWidth: 34, minWidth: 30, group: "override" },
  { id: "overrideSymbol", label: "New", defaultWidth: 110, minWidth: 76, group: "override" },
  { id: "overridePercent", label: "New %", defaultWidth: 58, minWidth: 48, group: "override" },
  { id: "usePercent", label: "Use %", defaultWidth: 52, minWidth: 44, group: "debug" },
  { id: "useSymbol", label: "Use symbol", defaultWidth: 72, minWidth: 58, group: "debug" },
  { id: "extraData", label: "$", defaultWidth: 62, minWidth: 48, group: "debug" },
] as const;
type InvestmentColumnId = typeof INVESTMENT_COLUMN_DEFS[number]["id"];
type InvestmentColumnWidths = Record<InvestmentColumnId, number>;
function investmentColumnLabelWidth(label: string) {
  return label ? Math.ceil(label.length * 6.8) + 24 : 26;
}

function investmentColumnMinWidth(column: typeof INVESTMENT_COLUMN_DEFS[number]) {
  return Math.max(column.minWidth, investmentColumnLabelWidth(column.label));
}

function investmentColumnDefaultWidth(column: typeof INVESTMENT_COLUMN_DEFS[number]) {
  return Math.max(column.defaultWidth, investmentColumnMinWidth(column));
}

const DEFAULT_INVESTMENT_COLUMN_WIDTHS = INVESTMENT_COLUMN_DEFS.reduce((acc, column) => {
  acc[column.id] = investmentColumnDefaultWidth(column);
  return acc;
}, {} as InvestmentColumnWidths);
const INVESTMENT_COLUMN_MIN_WIDTHS = INVESTMENT_COLUMN_DEFS.reduce((acc, column) => {
  acc[column.id] = investmentColumnMinWidth(column);
  return acc;
}, {} as InvestmentColumnWidths);
const INVESTMENT_COLUMN_MAX_WIDTH = 360;

function isCognitoEnabled() {
  return Boolean(COGNITO_DOMAIN && COGNITO_CLIENT_ID && COGNITO_REDIRECT_URI);
}

function hasCognitoRedirectCode() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("code");
}

function base64UrlEncode(bytes: ArrayBuffer) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomAuthString() {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes.buffer);
}

async function sha256Base64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  return base64UrlEncode(await window.crypto.subtle.digest("SHA-256", bytes));
}

function decodeJwtPayload<T extends Record<string, unknown>>(token: string): T {
  const payload = token.split(".")[1] || "";
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(window.atob(padded)) as T;
}

function authUserFromIdToken(idToken: string): AuthUser {
  const payload = decodeJwtPayload<Record<string, unknown>>(idToken);
  return {
    sub: String(payload.sub || ""),
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
  };
}

function readStoredAuth(): AuthState {
  if (typeof window === "undefined" || !isCognitoEnabled()) return { status: "signedOut", user: null, tokens: null };
  if (hasCognitoRedirectCode()) return { status: "loading", user: null, tokens: null };

  try {
    const tokens = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || "null") as AuthTokens | null;
    if (!tokens?.idToken || tokens.expiresAt <= Date.now() + 30000) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      return { status: "signedOut", user: null, tokens: null };
    }
    return { status: "signedIn", user: authUserFromIdToken(tokens.idToken), tokens };
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return { status: "signedOut", user: null, tokens: null };
  }
}

function writeStoredAuth(tokens: AuthTokens) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(tokens));
}

function clearStoredAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_PKCE_STORAGE_KEY);
}

async function startCognitoSignIn() {
  if (!isCognitoEnabled() || !COGNITO_CLIENT_ID) return;
  const verifier = randomAuthString();
  const state = randomAuthString();
  const challenge = await sha256Base64Url(verifier);
  window.sessionStorage.setItem(AUTH_PKCE_STORAGE_KEY, JSON.stringify({ verifier, state }));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: COGNITO_CLIENT_ID,
    redirect_uri: COGNITO_REDIRECT_URI,
    scope: COGNITO_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  window.location.assign(`${COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`);
}

async function completeCognitoSignInFromUrl(): Promise<AuthState | null> {
  if (!isCognitoEnabled() || !COGNITO_CLIENT_ID || typeof window === "undefined") return null;

  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return null;

  const error = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (error) {
    return { status: "signedOut", user: null, tokens: null, error };
  }

  const pkce = JSON.parse(window.sessionStorage.getItem(AUTH_PKCE_STORAGE_KEY) || "null") as { verifier?: string; state?: string } | null;
  if (!pkce?.verifier || pkce.state !== url.searchParams.get("state")) {
    return { status: "signedOut", user: null, tokens: null, error: "Sign-in state did not match. Please try again." };
  }

  const response = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: COGNITO_CLIENT_ID,
      code,
      redirect_uri: COGNITO_REDIRECT_URI,
      code_verifier: pkce.verifier,
    }),
  });
  const json = await response.json() as { id_token?: string; access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!response.ok || !json.id_token || !json.access_token) {
    return { status: "signedOut", user: null, tokens: null, error: json.error_description || json.error || "Cognito sign-in failed." };
  }

  const tokens: AuthTokens = {
    idToken: json.id_token,
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + Math.max(60, Number(json.expires_in || 3600)) * 1000,
  };
  writeStoredAuth(tokens);
  window.sessionStorage.removeItem(AUTH_PKCE_STORAGE_KEY);
  window.history.replaceState({}, document.title, `${url.origin}${url.pathname}${url.hash}`);
  return { status: "signedIn", user: authUserFromIdToken(tokens.idToken), tokens };
}

function signOutCognito() {
  clearStoredAuth();
  if (!isCognitoEnabled() || !COGNITO_CLIENT_ID) {
    window.location.reload();
    return;
  }
  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    logout_uri: COGNITO_LOGOUT_URI,
  });
  window.location.assign(`${COGNITO_DOMAIN}/logout?${params.toString()}`);
}

function authHeaders(idToken?: string): HeadersInit {
  return idToken ? { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` } : { "Content-Type": "application/json" };
}

const navItems: Array<{ key: TabKey; label: string; meta: string }> = [
  { key: "investments", label: "Investments", meta: "workbook grid" },
  { key: "accounts", label: "Accounts", meta: "tax status" },
  { key: "accountTaxType", label: "Account Tax Type", meta: "status list" },
  { key: "tickers", label: "Tickers", meta: "symbol lookups" },
  { key: "categories", label: "Categories", meta: "ticker categories" },
  { key: "federal", label: "Federal Tax", meta: "live backend" },
  { key: "state", label: "State Tax", meta: "state worksheet" },
  { key: "calculator", label: "Tax Calculator", meta: "summary" },
  { key: "taxTreatment", label: "Tax Treatment", meta: "sheet labels" },
  { key: "investmentType", label: "Investment Type", meta: "asset classes" },
];

const federalOrdinaryRateMarkers: Record<FilingStatus, ThermometerMarker[]> = {
  mfj: [
    { amount: 23850, label: "12%", detail: "Federal ordinary 12% bracket starts", tone: "federal" },
    { amount: 96950, label: "22%", detail: "Federal ordinary 22% bracket starts", tone: "federal" },
    { amount: 206700, label: "24%", detail: "Federal ordinary 24% bracket starts", tone: "federal" },
    { amount: 394600, label: "32%", detail: "Federal ordinary 32% bracket starts", tone: "federal" },
    { amount: 501050, label: "35%", detail: "Federal ordinary 35% bracket starts", tone: "federal" },
    { amount: 751600, label: "37%", detail: "Federal ordinary 37% bracket starts", tone: "federal" },
  ],
  single: [
    { amount: 11925, label: "12%", detail: "Federal ordinary 12% bracket starts", tone: "federal" },
    { amount: 48475, label: "22%", detail: "Federal ordinary 22% bracket starts", tone: "federal" },
    { amount: 103350, label: "24%", detail: "Federal ordinary 24% bracket starts", tone: "federal" },
    { amount: 197300, label: "32%", detail: "Federal ordinary 32% bracket starts", tone: "federal" },
    { amount: 250525, label: "35%", detail: "Federal ordinary 35% bracket starts", tone: "federal" },
    { amount: 626350, label: "37%", detail: "Federal ordinary 37% bracket starts", tone: "federal" },
  ],
};
const caTaxRateMarkers: ThermometerMarker[] = [
  { amount: 21512, label: "2%", detail: "California 2% bracket starts", tone: "state" },
  { amount: 50998, label: "4%", detail: "California 4% bracket starts", tone: "state" },
  { amount: 80490, label: "6%", detail: "California 6% bracket starts", tone: "state" },
  { amount: 111732, label: "8%", detail: "California 8% bracket starts", tone: "state" },
  { amount: 141212, label: "9.3%", detail: "California 9.3% bracket starts", tone: "state" },
  { amount: 721318, label: "10.3%", detail: "California 10.3% bracket starts", tone: "state" },
  { amount: 865574, label: "11.3%", detail: "California 11.3% bracket starts", tone: "state" },
  { amount: 1000000, label: "+1%", detail: "California mental health surtax starts", tone: "surtax" },
  { amount: 1442628, label: "12.3%", detail: "California 12.3% bracket starts", tone: "state" },
];

const categoryLabels = ["social-security", "real estate", "treasury bond", "bond", "munibond", "stock", "preferred stock", "business development", "covered call", "IBOND", "Bitcoin", "cash", "non investment income"];
const stateOptions: Array<[string, string]> = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];
const stateNameByCode = Object.fromEntries(stateOptions);
function normalizeStateCode(value: string) {
  const code = String(value || "CA").trim().toUpperCase();
  return stateNameByCode[code] ? code : "CA";
}

const stateFlagFileNameByCode: Record<string, string> = {
  DC: "Flag of Washington, D.C.svg",
  GA: "Flag of Georgia (U.S. state).svg",
};

function stateFlagUrl(code: string) {
  const normalized = normalizeStateCode(code);
  const stateName = stateNameByCode[normalized] || normalized;
  const fileName = stateFlagFileNameByCode[normalized] || `Flag of ${stateName}.svg`;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=32`;
}

function StateFlagImage({ stateCode, stateName }: { stateCode: string; stateName?: string }) {
  const normalized = normalizeStateCode(stateCode);
  const label = stateName || stateNameByCode[normalized] || normalized;
  return <img className="state-flag-image" src={stateFlagUrl(normalized)} alt={`${label} flag`} width={18} height={18} loading="lazy" referrerPolicy="no-referrer" />;
}

function StateFlagSelect({ value, onChange, className = "" }: { value: string; onChange: (stateCode: string) => void; className?: string }) {
  const selectedCode = normalizeStateCode(value);
  const selectedName = stateNameByCode[selectedCode] || selectedCode;
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!selectRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={`state-flag-select ${className}`.trim()} ref={selectRef}>
      <button className="state-flag-select__button" type="button" aria-haspopup="listbox" aria-expanded={isOpen} onClick={() => setIsOpen((current) => !current)}>
        <StateFlagImage stateCode={selectedCode} stateName={selectedName} />
        <span>{selectedCode} - {selectedName}</span>
        <span className="state-flag-select__chevron" aria-hidden="true">v</span>
      </button>
      {isOpen && (
        <div className="state-flag-select__menu" role="listbox" aria-label="Select state">
          {stateOptions.map(([code, name]) => {
            const isSelected = normalizeStateCode(code) === selectedCode;
            return <button key={code} className={`state-flag-select__option ${isSelected ? "state-flag-select__option--selected" : ""}`} type="button" role="option" aria-selected={isSelected} onClick={() => { onChange(code); setIsOpen(false); }}><StateFlagImage stateCode={code} stateName={name} /><span>{code} - {name}</span></button>;
          })}
        </div>
      )}
    </div>
  );
}

type LocalStateTaxFilingStatus = "single" | "mfj" | "mfs" | "hoh";
type LocalStateTaxBracket = { threshold: number; rate: number };
type LocalStateTaxProfile = {
  code: string;
  name: string;
  single: LocalStateTaxBracket[];
  mfj: LocalStateTaxBracket[];
  note?: string;
};

const none: LocalStateTaxBracket[] = [];
const same = (brackets: LocalStateTaxBracket[]) => ({ single: brackets, mfj: brackets });

const localStateTaxProfiles: LocalStateTaxProfile[] = [
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

export function getLocalStateTaxProfile(stateCode: string): LocalStateTaxProfile {
  const normalized = String(stateCode || "CA").trim().toUpperCase();
  return localStateTaxProfiles.find((profile) => profile.code === normalized) ?? localStateTaxProfiles.find((profile) => profile.code === "CA")!;
}

function computeThresholdTax(taxableIncome: number, brackets: ReadonlyArray<LocalStateTaxBracket>): number {
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

function localStateTax2025(taxableIncome: number, stateCode: string, filingStatus: LocalStateTaxFilingStatus = "single") {
  const profile = getLocalStateTaxProfile(stateCode);
  const brackets = filingStatus === "mfj" ? profile.mfj : profile.single;
  return {
    state: profile.code,
    stateName: profile.name,
    taxableIncome: Number.isFinite(Number(taxableIncome)) ? Math.max(Number(taxableIncome), 0) : 0,
    tax: computeThresholdTax(taxableIncome, brackets),
    note: profile.note,
  };
}



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

function isDefaultIncomeTicker(row: Pick<TickerRow, "category" | "taxTreatment">) {
  const category = normalizeLookupKey(row.category);
  const taxTreatment = normalizeLookupKey(row.taxTreatment);
  return (
    ["socialsecurity", "noninvestmentincome"].includes(category) ||
    ["ss85fed"].includes(taxTreatment)
  );
}

const initialTickers: TickerRow[] = ([
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
  { id: 14, symbol: "DEFERRED-CASH", percentReturn: 0.035, category: "cash", taxTreatment: "income", extraData: 0, description: "deferred cash", exDividend: "", divPayout: "" },
  { id: 15, symbol: "RENTAL", percentReturn: 0, category: "real estate", taxTreatment: "real estate", extraData: 0, description: "rental property income", exDividend: "", divPayout: "" },
  { id: 16, symbol: "SPY", percentReturn: 0.012, category: "stock", taxTreatment: "qualified-div", extraData: 0, description: "S&P 500 ETF", exDividend: "", divPayout: "" },
  { id: 17, symbol: "VOO", percentReturn: 0.012, category: "stock", taxTreatment: "qualified-div", extraData: 0, description: "S&P 500 ETF", exDividend: "", divPayout: "" },
  { id: 18, symbol: "VTI", percentReturn: 0.013, category: "stock", taxTreatment: "qualified-div", extraData: 0, description: "total stock market ETF", exDividend: "", divPayout: "" },
  { id: 19, symbol: "QQQ", percentReturn: 0.007, category: "stock", taxTreatment: "qualified-div", extraData: 0, description: "Nasdaq 100 ETF", exDividend: "", divPayout: "" },
  { id: 20, symbol: "IWM", percentReturn: 0.012, category: "stock", taxTreatment: "qualified-div", extraData: 0, description: "small-cap ETF", exDividend: "", divPayout: "" },
  { id: 21, symbol: "SCHD", percentReturn: 0.035, category: "stock", taxTreatment: "qualified-div", extraData: 0, description: "dividend equity ETF", exDividend: "", divPayout: "" },
  { id: 22, symbol: "BND", percentReturn: 0.04, category: "bond", taxTreatment: "non-qualified-div", extraData: 0, description: "total bond market ETF", exDividend: "", divPayout: "" },
  { id: 23, symbol: "SGOV", percentReturn: 0.04, category: "treasury bond", taxTreatment: "state tax free", extraData: 0, description: "short-term treasury ETF", exDividend: "", divPayout: "" },
  { id: 24, symbol: "VNQ", percentReturn: 0.035, category: "real estate", taxTreatment: "non-qualified-div", extraData: 0, description: "real estate ETF", exDividend: "", divPayout: "" },
] as Array<Omit<TickerRow, "incomeItem">>).map((row) => ({ ...row, incomeItem: isDefaultIncomeTicker(row) }));

const initialCategories: CategoryRow[] = categoryLabels.map((name, index) => ({ id: index + 1, name }));
const initialTaxTreatments: TaxTreatmentRow[] = ["tax free", "state tax free", "fed tax free", "index-60-40", "income", "ss-85-fed", "qualified-div", "non-qualified-div", "short term gain", "long term gain", "real estate", "hold"].map((label, index) => ({ id: index + 1, label }));
const initialAccounts: AccountRow[] = [
  { id: 1, account: "Social Security", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 2, account: "Vanguard Brokerage", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 3, account: "Vanguard IRA", taxStatus: "deferred", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 4, account: "Schwab Brokerage", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 5, account: "Interactive Brokers", taxStatus: "taxable", dividendAccrued: "yes", includeInFreeCashflow: "yes" },
  { id: 6, account: "Merrill Edge", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 7, account: "Fidelity Brokerage", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 8, account: "Fidelity IRA", taxStatus: "deferred", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 9, account: "E*TRADE Brokerage", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 10, account: "E*TRADE IRA", taxStatus: "deferred", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 11, account: "Schwab IRA", taxStatus: "deferred", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 12, account: "Robinhood Brokerage", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 13, account: "TD Ameritrade Brokerage", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 14, account: "TreasuryDirect", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 15, account: "Employer 401(k)", taxStatus: "deferred", dividendAccrued: "no", includeInFreeCashflow: "no" },
  { id: 16, account: "Roth IRA", taxStatus: "tax-free", dividendAccrued: "no", includeInFreeCashflow: "no" },
  { id: 17, account: "Deferred Compensation", taxStatus: "deferred", dividendAccrued: "no", includeInFreeCashflow: "no" },
  { id: 18, account: "Rental Property", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
];
const initialAccountTaxTypes: AccountTaxTypeRow[] = ["tax-free", "taxable", "deferred", "tax-deduction"].map((taxStatus, index) => ({ id: index + 1, taxStatus }));
const initialInvestmentTypes: InvestmentTypeRow[] = categoryLabels.map((name, index) => ({ id: index + 1, name }));
const initialFederalSettings: FederalSettings = { filingStatus: "mfj", extraOrdinaryIncome: 0, extraPreferredIncome: 0, mortgageInterest: 19500, propertyTax: 19000, stateIncomeTax: 5153, standardDeduction: 31500, saltCap: 40400 };
const initialStateSettings: StateSettings = { stateCode: "CA", extraStateIncome: 0, mortgageInterest: 26500, propertyTax: 19000, stateIncomeTax: 5153, standardDeduction: 11000 };
const initialPlannerSettings: PlannerSettings = { federalWithholding: 0, stateWithholding: 0 };
const initialUiSettings: UiSettings = { investmentFavorites: [] };
const GOOGLE_SHEET_INVESTMENT_START_ROW = 8;

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
function normalizeRate(value: number | string | boolean | null | undefined) {
  const numeric = toNumber(value);
  return Math.abs(numeric) > 1 ? numeric / 100 : numeric;
}
function normalizeBoolean(value: unknown) { if (typeof value === "boolean") return value; if (typeof value === "number") return value !== 0; const text = String(value || "").trim().toLowerCase(); return text === "1" || text === "true" || text === "yes" || text === "y"; }
function normalizeYesNo(value: unknown) { return normalizeBoolean(value) ? "yes" : "no"; }
function normalizeLookupKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function lookupKeyTokens(value: unknown) {
  const normalized = normalizeAssetMatchKey(value);
  if (!normalized) return [];
  return [
    normalized,
    ...normalized.split(/[^a-z0-9]+/).filter(Boolean),
  ];
}
function normalizeAssetMatchKey(value: unknown) {
  return String(value || "")
    .replace(/[';]s\b/gi, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function valueMatchesAssetSelector(value: unknown, selectorKey: string) {
  const normalized = normalizeAssetMatchKey(value);
  if (!normalized || !selectorKey) return false;
  if (normalized === selectorKey) return true;
  if (lookupKeyTokens(value).includes(selectorKey)) return true;
  if (selectorKey === "ss" && normalized.includes("social security")) return true;
  return selectorKey.length >= 3 && normalized.includes(selectorKey);
}
function assetSelectorTokens(selectorKey: string) {
  return selectorKey
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token && !["all", "line", "lines", "row", "rows", "holding", "holdings", "investment", "investments", "desc", "description", "symbol", "symbols", "ticker", "tickers"].includes(token));
}
function splitAssetSelectors(selector: unknown) {
  const rawSelector = String(selector || "");
  const cleaned = normalizeAssetMatchKey(rawSelector)
    .split(/\s+/)
    .filter((token) => !["all", "line", "lines", "row", "rows", "holding", "holdings", "investment", "investments", "desc", "description", "symbol", "symbols", "ticker", "tickers"].includes(token))
    .join(" ");
  if (!cleaned) return [];

  const hasExplicitList = /,|\bor\b/i.test(rawSelector);
  const tickerLikeTokens = cleaned.split(/\s+/).filter((token) => /^[a-z][a-z0-9.-]{1,9}$/i.test(token));
  const shouldSplitWhitespaceList =
    !hasExplicitList &&
    /\b(?:symbol|symbols|ticker|tickers)\b/i.test(rawSelector) &&
    tickerLikeTokens.length > 1;

  const parts = hasExplicitList
    ? rawSelector.split(/\s*,\s*|\s+\bor\s+/i)
    : shouldSplitWhitespaceList
      ? tickerLikeTokens
      : [cleaned];

  return [...new Set(parts.map((part) => normalizeAssetMatchKey(part))
    .map((part) => part.split(/\s+/).filter((token) => !["all", "line", "lines", "row", "rows", "holding", "holdings", "investment", "investments", "desc", "description", "symbol", "symbols", "ticker", "tickers"].includes(token)).join(" "))
    .filter(Boolean))];
}
function investmentMatchesAssetSelector(row: DerivedInvestmentRow, selector: unknown): boolean {
  const selectorKey = normalizeAssetMatchKey(selector);
  if (!selectorKey) return false;
  if (normalizeLookupKey(String(row.id)) === selectorKey) return true;
  const selectorParts = splitAssetSelectors(selector);
  if (selectorParts.length > 1) {
    return selectorParts.some((selectorPart) => investmentMatchesAssetSelector(row, selectorPart));
  }
  const values = [row.symbol, row.effectiveSymbol, row.newSymbol, row.description, row.account];
  if (values.some((value) => valueMatchesAssetSelector(value, selectorKey))) return true;

  const combined = values.filter(Boolean).join(" ");
  const tokens = assetSelectorTokens(selectorKey);
  return tokens.length > 1 && tokens.every((token) => valueMatchesAssetSelector(combined, token));
}
function investmentMatchesExactSymbolSelector(row: DerivedInvestmentRow, selector: unknown): boolean {
  const selectorKey = normalizeAssetMatchKey(selector);
  if (!selectorKey) return false;
  const activeSymbols = [
    row.symbol,
    row.effectiveSymbol,
    row.overrideProposal ? row.newSymbol : undefined,
  ];
  return activeSymbols.some((value) => normalizeAssetMatchKey(value) === selectorKey);
}
function selectionPayloadUsesExactSymbol(payload: Record<string, unknown>) {
  const matchMode = normalizeLookupKey(payload.matchMode);
  const field = normalizeLookupKey(payload.field ?? payload.column ?? "");
  const selectorText = String(payload.selector ?? payload.query ?? "");
  return matchMode === "symbol" ||
    ["symbol", "symbols", "ticker", "tickers"].includes(field) ||
    Boolean(payload.symbol) ||
    /\b(?:symbol|symbols|ticker|tickers)\b/i.test(selectorText);
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

const ACCOUNT_FAVICON_RULES: Array<{ terms: string[]; domain: string }> = [
  { terms: ["interactive brokers", "ibkr", "interactivebrokers"], domain: "interactivebrokers.com" },
  { terms: ["merrill edge", "merill edge", "merrill", "merill"], domain: "merrilledge.com" },
  { terms: ["vanguard"], domain: "vanguard.com" },
  { terms: ["schwab"], domain: "schwab.com" },
  { terms: ["fidelity"], domain: "fidelity.com" },
  { terms: ["etrade", "e trade", "e*trade"], domain: "etrade.com" },
  { terms: ["robinhood"], domain: "robinhood.com" },
  { terms: ["td ameritrade", "ameritrade"], domain: "tdameritrade.com" },
  { terms: ["treasury direct", "treasurydirect"], domain: "treasurydirect.gov" },
  { terms: ["social security"], domain: "ssa.gov" },
  { terms: ["intuit"], domain: "intuit.com" },
];

function accountFaviconDomain(accountName: unknown) {
  const key = normalizeLookupKey(String(accountName || ""));
  if (!key) return "";
  const match = ACCOUNT_FAVICON_RULES.find((rule) => rule.terms.some((term) => key.includes(normalizeLookupKey(term))));
  return match?.domain || "";
}

function accountInitials(accountName: unknown) {
  const parts = String(accountName || "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "-";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
}

function AccountFavicon({ accountName }: { accountName: string }) {
  const [hasImageError, setHasImageError] = useState(false);
  const domain = accountFaviconDomain(accountName);
  const src = domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32` : "";

  useEffect(() => setHasImageError(false), [src]);

  if (!src || hasImageError) {
    return <span className="account-favicon account-favicon--fallback" aria-hidden="true">{accountInitials(accountName)}</span>;
  }

  return <img className="account-favicon" src={src} alt="" aria-hidden="true" loading="lazy" onError={() => setHasImageError(true)} />;
}

function AccountSelect({ value, options, onChange, ariaLabel }: { value: string; options: string[]; onChange: (value: string) => void; ariaLabel: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const updateMenuPosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuStyle({
      left: rect.left,
      top: rect.bottom + 4,
      width: Math.max(rect.width, 240),
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
    const handlePointerDown = (event: PointerEvent) => {
      if (pickerRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen]);

  return (
    <div className="account-picker" ref={pickerRef}>
      <button
        className="account-picker__trigger"
        type="button"
        ref={triggerRef}
        onClick={() => {
          if (!isOpen) updateMenuPosition();
          setIsOpen((current) => !current);
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
      >
        <AccountFavicon accountName={value} />
        <span>{value || "Select account"}</span>
      </button>
      {isOpen && createPortal(
        <div className="account-picker__menu account-picker__menu--portal" ref={menuRef} style={menuStyle} role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              className={`account-picker__option ${option === value ? "account-picker__option--selected" : ""}`.trim()}
              key={option || "(blank)"}
              type="button"
              role="option"
              aria-selected={option === value}
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
            >
              <AccountFavicon accountName={option} />
              <span>{option || "Blank"}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function AccountInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="account-input">
      <AccountFavicon accountName={value} />
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function MoneyInput({ value, onChange, ariaLabel }: { value: number; onChange: (value: string) => void; ariaLabel: string }) {
  const [isEditing, setIsEditing] = useState(false);
  return (
    <input
      className="money-input"
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={isEditing ? String(value || "") : formatGridCurrency(value)}
      onFocus={(event) => {
        setIsEditing(true);
        event.currentTarget.select();
      }}
      onBlur={() => setIsEditing(false)}
      onChange={(event) => onChange(String(toNumber(event.target.value)))}
    />
  );
}

function normalizeFavoriteName(value: unknown) {
  return String(value || "").trim();
}
function buildInvestmentFavoriteKey(row: InvestmentRow) {
  const description = normalizeLookupKey(row.description);
  const account = normalizeLookupKey(row.account);
  const symbol = normalizeLookupKey(row.symbol);
  const newSymbol = normalizeLookupKey(row.newSymbol);
  const category = normalizeLookupKey(row.category);
  const newPercent = toNumber(row.newPercent);

  return [
    "row",
    `id:${row.id}`,
    `desc:${description}`,
    `acct:${account}`,
    `cat:${category}`,
    `sym:${symbol}`,
    `new:${newSymbol}`,
    `override:${row.overrideProposal ? "1" : "0"}`,
    `newpct:${newPercent}`,
  ].join("|");
}

function buildInvestmentFavoriteKeys(row: InvestmentRow) {
  return [buildInvestmentFavoriteKey(row)];
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
      if (normalized.startsWith("row|")) keySet.add(normalized);
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

  const setNumberField = (field: Exclude<keyof StateSettings, "stateCode">, label: string) => {
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
function formatGridCurrency(value: number) { return formatCurrency(toNumber(value)); }
function formatSignedCurrency(value: number) {
  if (Math.abs(value) < 0.5) return "$0";
  return `${value > 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;
}
function fedTaxAdjust(amount: number, taxTreatment: string, extraData: number, pref: boolean) { switch (String(taxTreatment || "").toLowerCase().trim()) { case "hold": case "tax free": case "fed tax free": return 0; case "state tax free": return pref ? 0 : amount; case "index-60-40": return pref ? amount * 0.6 : amount * 0.4; case "income": case "non-qualified-div": case "short term gain": return pref ? 0 : amount; case "ss-85-fed": return pref ? 0 : amount * 0.85; case "qualified-div": case "long term gain": return pref ? amount : 0; case "real estate": return pref ? 0 : Math.max(amount - extraData, 0); default: return pref ? 0 : amount; } }
function stateTaxAdjust(amount: number, taxTreatment: string, extraData: number, stateCode = "CA") { const treatment = String(taxTreatment || "").toLowerCase().trim(); if (treatment === "hold" || treatment === "tax free" || treatment === "ss-85-fed") return 0; if (treatment === "state tax free" && normalizeStateCode(stateCode) === "CA") return 0; if (treatment === "real estate") return Math.max(amount - extraData, 0); return amount; }
async function postTaxCalculation(payload: Record<string, number | string>) {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const response = await fetch(`${API_BASE_URL}/hello`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const json = (await response.json()) as TaxResult | ApiError;
  if (!response.ok) throw new Error((json as ApiError).error || "API request failed");
  return json as TaxResult;
}

async function loadWorkbook(workspaceId: string, idToken?: string) {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const response = await fetch(`${API_BASE_URL}/hello`, { method: "POST", headers: authHeaders(idToken), body: JSON.stringify({ calc: "WORKBOOK_GET", workspaceId }) });
  const json = (await response.json()) as WorkbookResponse | ApiError;
  if (!response.ok) throw new Error((json as ApiError).error || "Workbook load failed");
  return json as WorkbookResponse;
}

async function saveWorkbook(workspaceId: string, payload: WorkbookResponse, idToken?: string) {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const response = await fetch(`${API_BASE_URL}/hello`, { method: "POST", headers: authHeaders(idToken), body: JSON.stringify({ calc: "WORKBOOK_SAVE", workspaceId, tabs: payload.tabs, settings: payload.settings }) });
  const json = (await response.json()) as { updatedAt?: string; error?: string };
  if (!response.ok) throw new Error(json.error || "Workbook save failed");
  return json;
}

async function postPortfolioChat(messages: Array<Pick<ChatMessage, "role" | "content">>, portfolioSnapshot: PortfolioSnapshot, idToken?: string) {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const response = await fetch(`${API_BASE_URL}/hello`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ calc: "PORTFOLIO_CHAT", messages, portfolioSnapshot }),
  });
  const json = (await response.json()) as ChatResponse | ApiError;
  if (!response.ok) throw new Error((json as ApiError).error || "Portfolio chat failed");
  return json as ChatResponse;
}

async function createMcpConnectorToken(workspaceId: string, idToken?: string) {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const response = await fetch(`${API_BASE_URL}/hello`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ calc: "MCP_TOKEN_CREATE", workspaceId, label: "ChatGPT connector" }),
  });
  const json = (await response.json()) as { token?: string; tokenId?: string; error?: string };
  if (!response.ok || !json.token) throw new Error(json.error || "MCP token creation failed");
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
function normalizedText(value: unknown) {
  return String(value || "").trim().toLowerCase();
}
function isSameStarterInvestment(row: InvestmentRow, starter: InvestmentRow) {
  return (
    normalizedText(row.description) === normalizedText(starter.description) &&
    normalizedText(row.account) === normalizedText(starter.account) &&
    normalizedText(row.category) === normalizedText(starter.category) &&
    normalizedText(row.symbol) === normalizedText(starter.symbol) &&
    normalizedText(row.newSymbol) === normalizedText(starter.newSymbol) &&
    Math.abs(row.totalInvestment - starter.totalInvestment) < 0.01 &&
    Math.abs(row.yearlyIncome - starter.yearlyIncome) < 0.01 &&
    Math.abs(row.newPercent - starter.newPercent) < 0.000001 &&
    row.includeIncome === starter.includeIncome &&
    row.overrideProposal === starter.overrideProposal
  );
}
function isStarterInvestmentSet(rows: InvestmentRow[]) {
  return rows.length === initialInvestments.length && rows.every((row, index) => isSameStarterInvestment(row, initialInvestments[index]));
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
    spreadsheetRowNumber: undefined,
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
  const spreadsheetRowNumberValue = workbookField(row, "spreadsheetRowNumber", "spreadsheet_row_number", "sheet_row_number", "source_row_number", "row_number");
  const spreadsheetRowNumber = spreadsheetRowNumberValue !== undefined
    ? toNumber(spreadsheetRowNumberValue) || undefined
    : base.spreadsheetRowNumber ?? index + GOOGLE_SHEET_INVESTMENT_START_ROW;
  const totalInvestmentValue = workbookField(row, "totalInvestment", "total_inv", "total_investment", "totalinvestment", "total_inv_amount");
  const yearlyIncomeValue = workbookField(row, "yearlyIncome", "yr_inc", "yearly_income", "yearinc", "yearly_income_amount");
  const includeIncomeValue = workbookField(row, "includeIncome", "inc", "include_income", "income", "include_investment_income");
  const overrideValue = workbookField(row, "overrideProposal", "override", "override_proposal");
  const newPercentValue = workbookField(row, "newPercent", "new_percent", "new_pct", "newpercent");
  return {
    id: Number(id) || index + 1,
    spreadsheetRowNumber,
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
  const category = workbookField(row, "category") ?? base.category;
  const taxTreatment = workbookField(row, "tax_treatment", "taxTreatment", "tax_status") ?? base.taxTreatment;
  const incomeItemValue = workbookField(row, "incomeItem", "income_item", "is_income_item", "income_ticker", "income");
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    symbol: workbookField(row, "symbol", "ticker") ?? base.symbol,
    percentReturn: percentValue !== undefined ? normalizeRate(percentValue) : normalizeRate(base.percentReturn),
    category,
    taxTreatment,
    incomeItem: incomeItemValue !== undefined ? normalizeBoolean(incomeItemValue) : isDefaultIncomeTicker({ category, taxTreatment }),
    extraData: extraDataValue !== undefined ? toNumber(extraDataValue) : base.extraData,
    description: workbookField(row, "description", "desc") ?? base.description,
    exDividend: workbookField(row, "ex_dividend", "exDividend") ?? base.exDividend,
    divPayout: workbookField(row, "div_payout", "divPayout") ?? base.divPayout,
  };
}
function workbookToCategoryRow(row: Record<string, unknown>, index: number, fallback?: CategoryRow): CategoryRow {
  const base = fallback || initialCategories[index] || initialCategories[0];
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    name: workbookField(row, "name", "category", "label") ?? base.name,
  };
}
function workbookToAccountRow(row: Record<string, unknown>, index: number, fallback?: AccountRow): AccountRow {
  const base = fallback || initialAccounts[index] || initialAccounts[0];
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    account: workbookField(row, "account", "account_name", "account_names") ?? base.account,
    taxStatus: workbookField(row, "tax_status", "taxStatus", "tax_treatment") ?? base.taxStatus,
    dividendAccrued: workbookField(row, "dividend_accrued", "dividendAccrued") ?? base.dividendAccrued,
    includeInFreeCashflow: normalizeYesNo(workbookField(row, "include_in_free_cashflow", "includeInFreeCashflow", "include_in_free_cash_flow", "include")),
  };
}
function workbookToTaxTreatmentRow(row: Record<string, unknown>, index: number, fallback?: TaxTreatmentRow): TaxTreatmentRow {
  const base = fallback || initialTaxTreatments[index] || initialTaxTreatments[0];
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    label: workbookField(row, "label", "tax_treatment") ?? base.label,
  };
}
function workbookToAccountTaxTypeRow(row: Record<string, unknown>, index: number, fallback?: AccountTaxTypeRow): AccountTaxTypeRow {
  const base = fallback || initialAccountTaxTypes[index] || initialAccountTaxTypes[0];
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    taxStatus: workbookField(row, "tax_status", "taxStatus", "tax_status") ?? base.taxStatus,
  };
}
function workbookToInvestmentTypeRow(row: Record<string, unknown>, index: number, fallback?: InvestmentTypeRow): InvestmentTypeRow {
  const base = fallback || initialInvestmentTypes[index] || initialInvestmentTypes[0];
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    name: workbookField(row, "name", "investment_type", "inv_type") ?? base.name,
  };
}
function mergeSettings<T extends object>(fallback: T, incoming: unknown): T { return incoming && typeof incoming === "object" ? ({ ...fallback, ...(incoming as Partial<T>) } as T) : fallback; }
function buildPortfolioSnapshot({
  activeTab,
  focusGrid,
  filters,
  sort,
  selectedAssetIds,
  derivedRows,
  accounts,
  tickers,
  categories,
  taxTreatments,
  accountTaxTypes,
  investmentTypes,
  flows,
  metrics,
}: {
  activeTab: TabKey;
  focusGrid: boolean;
  filters: InvestmentFilters;
  sort: InvestmentSort;
  selectedAssetIds: number[];
  derivedRows: DerivedInvestmentRow[];
  accounts: AccountRow[];
  tickers: TickerRow[];
  categories: CategoryRow[];
  taxTreatments: TaxTreatmentRow[];
  accountTaxTypes: AccountTaxTypeRow[];
  investmentTypes: InvestmentTypeRow[];
  flows: { totalInvestmentAmount: number; totalIncome: number; cash: number; stocks: number; preferredStock: number; bonds: number; muniBond: number; businessDevelopment: number; coveredCall: number; realEstate: number; bitcoin: number };
  metrics: PortfolioSnapshot["metrics"];
}): PortfolioSnapshot {
  const total = Math.max(flows.totalInvestmentAmount, 1);
  const holdings = derivedRows.map((row) => ({
    id: row.id,
    spreadsheetRowNumber: row.spreadsheetRowNumber,
    description: row.description,
    account: row.account,
    category: row.category,
    symbol: row.symbol,
    newSymbol: row.newSymbol,
    effectiveSymbol: row.effectiveSymbol,
    totalInvestment: row.totalInvestment,
    yearlyIncome: row.yearlyIncome,
    monthlyIncome: row.monthlyIncome,
    includedTotal: row.includedTotal,
    filteredIncome: row.filteredIncome,
    includeIncome: row.includeIncome,
    overrideProposal: row.overrideProposal,
    incomeItem: row.incomeItem,
    taxStatus: row.taxStatus,
    taxTreatment: row.taxTreatment,
    investmentType: row.investmentType,
    currentPercent: row.currentPercent,
    effectivePercent: row.effectivePercent,
    newPercent: row.newPercent,
    allocationPercent: row.includedTotal / total,
  }));
  const assetClasses = {
    cash: flows.cash,
    stocks: flows.stocks,
    preferredStock: flows.preferredStock,
    bonds: flows.bonds,
    muniBond: flows.muniBond,
    businessDevelopment: flows.businessDevelopment,
    coveredCall: flows.coveredCall,
    realEstate: flows.realEstate,
    bitcoin: flows.bitcoin,
  };
  const accountTotals = holdings.reduce<Record<string, number>>((acc, row) => {
    acc[row.account || "(blank)"] = (acc[row.account || "(blank)"] || 0) + row.includedTotal;
    return acc;
  }, {});
  const topHolding = [...holdings].sort((a, b) => b.includedTotal - a.includedTotal)[0];
  const topAccountEntry = Object.entries(accountTotals).sort((a, b) => b[1] - a[1])[0];
  const topAssetClassEntry = Object.entries(assetClasses).sort((a, b) => b[1] - a[1])[0];

  return {
    generatedAt: new Date().toISOString(),
    view: { activeTab, focusGrid, filters, sort, selectedAssetIds },
    holdings,
    accounts: accounts.map((row) => ({ id: row.id, account: row.account, taxStatus: row.taxStatus, dividendAccrued: row.dividendAccrued, includeInFreeCashflow: row.includeInFreeCashflow })),
    referenceTables: {
      tickers,
      categories,
      taxTreatment: taxTreatments,
      accountTaxType: accountTaxTypes,
      investmentType: investmentTypes,
    },
    editableTables: {
      tableIds: ["investments", "tickers", "accounts", "categories", "taxTreatment", "accountTaxType", "investmentType"],
      investmentFields: ["description", "account", "category", "totalInvestment", "yearlyIncome", "includeIncome", "overrideProposal", "symbol", "newSymbol", "newPercent"],
      tickerFields: ["symbol", "percentReturn", "category", "taxTreatment", "incomeItem", "extraData", "description", "exDividend", "divPayout"],
      accountFields: ["account", "taxStatus", "dividendAccrued", "includeInFreeCashflow"],
    },
    assetClasses,
    metrics,
    concentration: {
      topHolding: topHolding ? { id: topHolding.id, description: topHolding.description, allocationPercent: topHolding.allocationPercent } : undefined,
      topAccount: topAccountEntry ? { account: topAccountEntry[0], allocationPercent: topAccountEntry[1] / total } : undefined,
      topAssetClass: topAssetClassEntry ? { assetClass: topAssetClassEntry[0], allocationPercent: topAssetClassEntry[1] / total } : undefined,
      // Plug in realized/unrealized gain/loss, volatility, fee, or risk metrics here when those fields exist in workbook data.
    },
  };
}
function MetricCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "accent" | "warning" }) {
  return <div className={`metric-card metric-card--${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

type KpiMetricConfig = {
  label: string;
  value: string;
  secondaryValue?: string;
  numericValue?: number;
  deltaKind?: "currency" | "percent";
  tone?: "default" | "accent" | "warning" | "sync";
};

type IncomeSnapshotValues = {
  beforeTaxAnnual: number;
  beforeTaxMonthly: number;
  afterTaxAnnual: number;
  afterTaxMonthly: number;
};

type IncomeSnapshot = IncomeSnapshotValues & {
  capturedAt: string;
};

const ODOMETER_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function getValueDigits(value: string) {
  return value.match(/\d/g) ?? [];
}

function OdometerValue({ value, previousValue, spinning }: { value: string; previousValue: string; spinning: boolean }) {
  const previousDigits = getValueDigits(previousValue);
  let digitIndex = 0;

  return (
    <strong className="kpi-pill__value" aria-label={value}>
      {value.split("").map((character, index) => {
        if (!/\d/.test(character)) {
          return <span className="kpi-odometer-char" key={`${character}-${index}`}>{character}</span>;
        }

        const fromDigit = previousDigits[digitIndex] ?? character;
        const toDigit = character;
        digitIndex += 1;
        const fromNumber = Number(fromDigit);
        const toNumber = Number(toDigit);
        const style = {
          "--odometer-from-y": `${fromNumber * -1.08}em`,
          "--odometer-to-y": `${toNumber * -1.08}em`,
          "--odometer-spin-y": `${(toNumber + 10) * -1.08}em`,
          "--odometer-settle-y": `${(toNumber - 0.22) * -1.08}em`,
        } as CSSProperties;

        return (
          <span className={`kpi-odometer ${spinning ? "kpi-odometer--spinning" : ""}`} style={style} key={`${index}-${fromDigit}-${toDigit}`}>
            <span className="kpi-odometer__strip" aria-hidden="true">
              {ODOMETER_DIGITS.map((digit) => <span key={digit}>{digit}</span>)}
            </span>
            <span className="kpi-odometer__fallback">{toDigit}</span>
          </span>
        );
      })}
    </strong>
  );
}

function KpiPill({ label, value, secondaryValue, numericValue, deltaKind = "currency", tone = "default" }: KpiMetricConfig) {
  const previousValue = useRef<number | null>(null);
  const previousDisplayValue = useRef(value);
  const [delta, setDelta] = useState<number | null>(null);
  const [odometerValue, setOdometerValue] = useState({ previous: value, current: value });
  const [isAnimatingValue, setIsAnimatingValue] = useState(false);
  const isPrimaryMetric = label.toLowerCase() === "after-tax income";

  useEffect(() => {
    if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) return;
    const previous = previousValue.current;
    if (previous !== null && Math.abs(numericValue - previous) > 0.005) {
      setDelta(numericValue - previous);
      setOdometerValue({ previous: previousDisplayValue.current, current: value });
      setIsAnimatingValue(false);
      window.requestAnimationFrame(() => setIsAnimatingValue(true));
    } else if (previous === null) {
      setOdometerValue({ previous: value, current: value });
    }
    previousValue.current = numericValue;
    previousDisplayValue.current = value;
  }, [numericValue, value]);

  useEffect(() => {
    if (!isAnimatingValue) return;
    const timeoutId = window.setTimeout(() => setIsAnimatingValue(false), 820);
    return () => window.clearTimeout(timeoutId);
  }, [isAnimatingValue]);

  const deltaValue = delta;
  const formattedDelta =
    deltaValue === null
      ? null
      : deltaKind === "percent"
        ? formatPercent(Math.abs(deltaValue))
        : formatCurrency(Math.abs(deltaValue));

  return (
    <div className={`kpi-pill kpi-pill--${tone} ${isPrimaryMetric ? "kpi-pill--primary" : ""} ${isAnimatingValue ? "kpi-pill--changed" : ""}`.trim()}>
      <span>{label}</span>
      <OdometerValue value={odometerValue.current} previousValue={odometerValue.previous} spinning={isAnimatingValue} />
      {secondaryValue && <small>{secondaryValue}</small>}
      {formattedDelta && deltaValue !== null && (
        <em className={`kpi-pill__delta ${deltaValue >= 0 ? "kpi-pill__delta--up" : "kpi-pill__delta--down"}`}>
          {deltaValue >= 0 ? "↑" : "↓"} {deltaValue >= 0 ? "+" : "-"}{formattedDelta}
        </em>
      )}
    </div>
  );
}

function SnapshotValue({ label, delta, suffix }: { label: string; delta: number; suffix: string }) {
  const roundedDelta = Math.round(delta);
  const previousDelta = useRef<number | null>(null);
  const [isTumbling, setIsTumbling] = useState(false);
  const deltaClassName = roundedDelta >= 0 ? "income-snapshot__value--up" : "income-snapshot__value--down";
  const displayLabel = label.toLowerCase();

  useEffect(() => {
    if (previousDelta.current === null) {
      previousDelta.current = roundedDelta;
      return;
    }
    if (previousDelta.current === roundedDelta) return;

    previousDelta.current = roundedDelta;
    setIsTumbling(false);
    const animationFrame = window.requestAnimationFrame(() => setIsTumbling(true));
    const timeoutId = window.setTimeout(() => setIsTumbling(false), 620);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeoutId);
    };
  }, [roundedDelta]);

  return (
    <strong className={`income-snapshot__value ${deltaClassName} ${isTumbling ? "income-snapshot__value--tumble" : ""}`.trim()}>
      <em>
        <span className="income-snapshot__delta-marker" aria-hidden="true">{"\u0394"}</span>
        {formatSignedCurrency(roundedDelta)} <small>{suffix} {displayLabel}</small>
      </em>
    </strong>
  );
}

function IncomeSnapshotControl({
  snapshot,
  deltas,
  onCapture,
  className = "",
}: {
  snapshot: IncomeSnapshot | null;
  deltas: IncomeSnapshotValues | null;
  onCapture: () => void;
  className?: string;
}) {
  const [snapshotView, setSnapshotView] = useState<"monthly" | "yearly">("monthly");
  const [snapshotBasis, setSnapshotBasis] = useState<"afterTax" | "beforeTax">("afterTax");
  const capturedLabel = snapshot
    ? new Date(snapshot.capturedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "No baseline";
  const viewDeltas = snapshotView === "monthly"
    ? {
        afterTax: deltas?.afterTaxMonthly ?? 0,
        beforeTax: deltas?.beforeTaxMonthly ?? 0,
      }
    : {
        afterTax: deltas?.afterTaxAnnual ?? 0,
        beforeTax: deltas?.beforeTaxAnnual ?? 0,
      };
  const selectedDelta = snapshotBasis === "afterTax" ? viewDeltas.afterTax : viewDeltas.beforeTax;
  const selectedLabel = snapshotBasis === "afterTax" ? "After tax" : "Before tax";
  const selectedSuffix = snapshotView === "monthly" ? "/ month" : "/ year";

  return (
    <div className={`income-snapshot ${className}`.trim()} aria-label="Income snapshot comparison">
      <button className="income-snapshot__button" type="button" onClick={onCapture} aria-label="Snapshot income baseline" title="Snapshot">
        <svg className="income-snapshot__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6.5 7.5 8.25 5h7.5l1.75 2.5H20a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 4 7.5h2.5Z" />
          <path d="M12 10a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5Z" />
        </svg>
        <span>Snapshot</span>
      </button>
      <div className="income-snapshot__body" aria-live="polite">
        {snapshot ? (
          <div className="income-snapshot__single-line">
            <SnapshotValue label={selectedLabel} delta={selectedDelta} suffix={selectedSuffix} />
          </div>
        ) : (
          <div className="income-snapshot__single-line income-snapshot__single-line--empty">
            <strong className="income-snapshot__empty">Set baseline</strong>
            <span className="income-snapshot__captured">{capturedLabel}</span>
          </div>
        )}
      </div>
      <div className="income-snapshot__toggle income-snapshot__toggle--basis" role="group" aria-label="Snapshot tax basis">
        <button
          className={`income-snapshot__toggle-button ${snapshotBasis === "afterTax" ? "income-snapshot__toggle-button--active" : ""}`.trim()}
          type="button"
          onClick={() => setSnapshotBasis("afterTax")}
        >
          After Tax
        </button>
        <button
          className={`income-snapshot__toggle-button ${snapshotBasis === "beforeTax" ? "income-snapshot__toggle-button--active" : ""}`.trim()}
          type="button"
          onClick={() => setSnapshotBasis("beforeTax")}
        >
          Before Tax
        </button>
      </div>
      <div className="income-snapshot__toggle" role="group" aria-label="Snapshot period">
        <button
          className={`income-snapshot__toggle-button ${snapshotView === "monthly" ? "income-snapshot__toggle-button--active" : ""}`.trim()}
          type="button"
          onClick={() => setSnapshotView("monthly")}
        >
          Monthly
        </button>
        <button
          className={`income-snapshot__toggle-button ${snapshotView === "yearly" ? "income-snapshot__toggle-button--active" : ""}`.trim()}
          type="button"
          onClick={() => setSnapshotView("yearly")}
        >
          Yearly
        </button>
      </div>
    </div>
  );
}

function CompactKpiHeader({
  metrics,
  children,
}: {
  metrics: KpiMetricConfig[];
  children?: React.ReactNode;
}) {
  return (
    <div className="kpi-header">
      <div className="kpi-header__metrics">
        {metrics.map((metric) => <KpiPill key={metric.label} {...metric} />)}
      </div>
      {children && <div className="kpi-header__actions">{children}</div>}
    </div>
  );
}

function Section({ title, subtitle, children, className = "", hideHeading = false }: { title: string; subtitle: string; children: React.ReactNode; className?: string; hideHeading?: boolean }) {
  const shouldHideHeading = hideHeading || navItems.some((item) => item.label === title);
  return <section className={`sheet-section ${className}`.trim()}>{!shouldHideHeading && <div className="section-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>}{children}</section>;
}

function getThermometerScale(values: ThermometerValue[], markers: ThermometerMarker[]) {
  const valueMax = Math.max(1000, ...values.map((value) => value.amount));
  const sortedMarkers = [...markers].sort((a, b) => a.amount - b.amount);
  const nearbyCeiling = Math.max(valueMax * 1.35, valueMax + 75000);
  const nextMarker = sortedMarkers.find((marker) => marker.amount > valueMax);
  const nearbyMarkers = sortedMarkers.filter((marker) => marker.amount <= nearbyCeiling);
  const shouldIncludeNext =
    nextMarker &&
    (nearbyMarkers.length === 0 || nextMarker.amount <= Math.max(valueMax * 1.75, valueMax + 125000));
  const scaleBase = Math.max(
    valueMax,
    ...nearbyMarkers.map((marker) => marker.amount),
    ...(shouldIncludeNext ? [nextMarker.amount] : [])
  );
  const increment = scaleBase <= 100000 ? 10000 : scaleBase <= 500000 ? 25000 : 50000;
  const scaleMax = Math.ceil((scaleBase * 1.08) / increment) * increment;
  return {
    scaleMax,
    visibleMarkers: sortedMarkers.filter((marker) => marker.amount <= scaleMax),
  };
}

function VisibilityToggleIcon({ variant }: { variant: "show" | "hide" }) {
  return (
    <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {variant === "show" ? (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      ) : (
        <>
          <path d="M6.5 6.5 17.5 17.5" />
          <path d="M17.5 6.5 6.5 17.5" />
        </>
      )}
    </svg>
  );
}

function RowActionIcon({ name }: { name: "add" | "select" | "delete" }) {
  if (name === "add") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    );
  }

  if (name === "select") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.5 6.5h15v11h-15z" />
        <path d="m8 12 2.25 2.25L16 8.75" />
      </svg>
    );
  }

  return (
    <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5.25h5V7" />
      <path d="M7 7.5 8 19h8l1-11.5" />
      <path d="M10.25 10.5v5.75" />
      <path d="M13.75 10.5v5.75" />
    </svg>
  );
}

function TopbarActionIcon({ name }: { name: "copy" | "signIn" | "signOut" | "assistant" | "sheet" | "chat" | "menu" }) {
  if (name === "menu") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 7h14" />
        <path d="M5 12h14" />
        <path d="M5 17h14" />
      </svg>
    );
  }

  if (name === "copy") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 9h8v8H9z" />
        <path d="M7 15H5V5h10v2" />
      </svg>
    );
  }

  if (name === "signIn") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M10 7V5h8v14h-8v-2" />
        <path d="M4 12h9" />
        <path d="m10 9 3 3-3 3" />
      </svg>
    );
  }

  if (name === "signOut") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M14 7V5H6v14h8v-2" />
        <path d="M10 12h9" />
        <path d="m16 9 3 3-3 3" />
      </svg>
    );
  }

  if (name === "assistant") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 8.5h14v8H8.5L5 19.5z" />
        <path d="M9 12h.01" />
        <path d="M12 12h.01" />
        <path d="M15 12h.01" />
        <path d="M12 5v3" />
      </svg>
    );
  }

  if (name === "sheet") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5.5 4.5h13v15h-13z" />
        <path d="M5.5 9.5h13" />
        <path d="M10 4.5v15" />
        <path d="M14.5 4.5v15" />
      </svg>
    );
  }

  return (
    <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z" />
      <path d="M4.5 12h15" />
      <path d="M12 4.5c2 2.1 3 4.6 3 7.5s-1 5.4-3 7.5" />
      <path d="M12 4.5c-2 2.1-3 4.6-3 7.5s1 5.4 3 7.5" />
    </svg>
  );
}

function TaxThermometer({ title, titleLabel, subtitle, taxableIncome, values, markers, stats, footerLabel, footerValue, bandThresholds, collapsed, onToggle }: { title: React.ReactNode; titleLabel?: string; subtitle: string; taxableIncome: number; values: ThermometerValue[]; markers: ThermometerMarker[]; stats: ThermometerStat[]; footerLabel: string; footerValue: string; bandThresholds: { greenEnd: number; yellowEnd: number }; collapsed: boolean; onToggle: () => void }) {
  const labelText = titleLabel || (typeof title === "string" ? title : "Tax thermometer");
  const { scaleMax, visibleMarkers } = getThermometerScale(values, markers);
  const positionStyle = (amount: number) => ({ "--thermo-position": `${Math.max(0, Math.min(100, (amount / scaleMax) * 100))}%` } as React.CSSProperties);
  const bandStyle = {
    "--thermo-green-end": `${Math.max(0, Math.min(100, (bandThresholds.greenEnd / scaleMax) * 100))}%`,
    "--thermo-yellow-end": `${Math.max(0, Math.min(100, (bandThresholds.yellowEnd / scaleMax) * 100))}%`,
  } as React.CSSProperties;

  return (
    <div className={`tax-thermometer ${collapsed ? "tax-thermometer--collapsed" : ""}`}>
      <div className="tax-thermometer__heading">
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <div className="tax-thermometer__heading-actions">
          <button className="ghost-button ghost-button--compact tax-thermometer__toggle icon-button" type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={collapsed ? `Show ${labelText}` : `Hide ${labelText}`} title={collapsed ? `Show ${labelText}` : `Hide ${labelText}`}>
            <VisibilityToggleIcon variant={collapsed ? "show" : "hide"} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <>
          <div className="tax-thermometer__track" aria-label={`${labelText} tax threshold thermometer`} style={bandStyle}>
            <div className="tax-thermometer__heat" />
            {visibleMarkers.map((marker) => (
              <div
                key={`${marker.label}-${marker.amount}`}
                className={`tax-thermometer__tick tax-thermometer__tick--${marker.tone || "default"}`}
                style={positionStyle(marker.amount)}
                title={`${marker.detail}: ${formatCurrency(marker.amount)} (${formatSignedCurrency(taxableIncome - marker.amount)} vs current taxable income)`}
              >
                <span className="tax-thermometer__tick-label">
                  <strong>{marker.label}</strong>
                  <em>{formatCurrency(marker.amount)}</em>
                  <small className={taxableIncome >= marker.amount ? "tax-thermometer__distance tax-thermometer__distance--past" : "tax-thermometer__distance tax-thermometer__distance--away"}>{formatSignedCurrency(taxableIncome - marker.amount)}</small>
                </span>
              </div>
            ))}
            {values.map((value) => (
              <div
                key={`${value.label}-${value.tone}`}
                className={`tax-thermometer__value tax-thermometer__value--${value.tone}`}
                style={positionStyle(value.amount)}
                title={`${value.label}: ${value.value}`}
              >
                <span>{value.label}</span>
              </div>
            ))}
          </div>
          <div className="tax-thermometer__stats">
            {stats.map((stat) => (
              <div key={`${stat.label}-${stat.value}`}>
                {stat.tone && <span className={`tax-thermometer__dot tax-thermometer__dot--${stat.tone}`} />}
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
          <div className="tax-thermometer__footer">
            <span>{footerLabel}</span>
            <strong>{footerValue}</strong>
          </div>
        </>
      )}
    </div>
  );
}

function getReachedTaxRateLabel(markers: ThermometerMarker[], taxableIncome: number, fallback: string) {
  let reached = fallback;
  markers.forEach((marker) => {
    if (marker.amount <= taxableIncome && marker.label.includes("%") && !marker.label.startsWith("+")) {
      reached = marker.label;
    }
  });
  return reached;
}

function TaxThermometerPanel({ federalTaxable, stateTaxable, federalTax, stateTax, filingStatus, stateCode, stateName }: { federalTaxable: number; stateTaxable: number; federalTax: number; stateTax: number; filingStatus: FilingStatus; stateCode: string; stateName: string }) {
  const [collapsedSections, setCollapsedSections] = useState({ summary: false, federal: false, state: false });
  const totalTax = federalTax + stateTax;
  const federalMarkers = federalOrdinaryRateMarkers[filingStatus];
  const federal12Threshold = federalMarkers.find((marker) => marker.label === "12%")?.amount || 0;
  const federal22Threshold = federalMarkers.find((marker) => marker.label === "22%")?.amount || federal12Threshold;
  const stateMarkers = stateCode === "CA" ? caTaxRateMarkers : [];
  const ca4Threshold = caTaxRateMarkers.find((marker) => marker.label === "4%")?.amount || 0;
  const ca6Threshold = caTaxRateMarkers.find((marker) => marker.label === "6%")?.amount || ca4Threshold;
  const federalEffectiveRate = federalTaxable > 0 ? federalTax / federalTaxable : 0;
  const stateEffectiveRate = stateTaxable > 0 ? stateTax / stateTaxable : 0;
  const federalValues: ThermometerValue[] = [
    { amount: federalTaxable, label: "Fed taxable", value: formatCurrencyDetailed(federalTaxable), tone: "taxable" },
  ];
  const stateValues: ThermometerValue[] = [
    { amount: stateTaxable, label: `${stateCode} taxable`, value: formatCurrencyDetailed(stateTaxable), tone: "taxable" },
  ];
  const federalStats: ThermometerStat[] = [
    { label: "Federal tax", value: formatCurrencyDetailed(federalTax), tone: "tax" },
    { label: "Effective", value: formatPercent(federalEffectiveRate), tone: "taxable" },
    { label: "Top bracket", value: getReachedTaxRateLabel(federalOrdinaryRateMarkers[filingStatus], federalTaxable, "10%"), tone: "income" },
  ];
  const stateStats: ThermometerStat[] = [
    { label: `${stateCode} tax`, value: formatCurrencyDetailed(stateTax), tone: "tax" },
    { label: "Effective", value: formatPercent(stateEffectiveRate), tone: "taxable" },
    { label: "Top bracket", value: stateMarkers.length ? getReachedTaxRateLabel(stateMarkers, stateTaxable, "1%") : "state schedule", tone: "income" },
  ];
  const federalTopBracket = federalStats.find((stat) => stat.label === "Top bracket")?.value || "10%";
  const stateTopBracket = stateStats.find((stat) => stat.label === "Top bracket")?.value || "state schedule";

  return (
    <div className="tax-thermometer-panel">
      <TaxThermometer title={<span className="tax-thermometer__title-with-flag"><img className="tax-thermometer__title-flag" src={US_FLAG_ICON_URL} alt="United States flag" width={18} height={12} loading="lazy" referrerPolicy="no-referrer" />Federal Tax</span>} titleLabel="Federal Tax" subtitle={`Green <12%, yellow <22%, red above 22% (${filingStatus.toUpperCase()})`} taxableIncome={federalTaxable} values={federalValues} markers={federalMarkers} stats={federalStats} footerLabel="Federal taxable income" footerValue={formatCurrencyDetailed(federalTaxable)} bandThresholds={{ greenEnd: federal12Threshold, yellowEnd: federal22Threshold }} collapsed={collapsedSections.federal} onToggle={() => setCollapsedSections((current) => ({ ...current, federal: !current.federal }))} />
      <TaxThermometer title={<span className="tax-thermometer__title-with-flag"><StateFlagImage stateCode={stateCode} stateName={stateName} />{stateName} Tax</span>} titleLabel={`${stateName} Tax`} subtitle={stateCode === "CA" ? "Green <4%, yellow <6%, red above 6%" : "State schedule; no visual brackets configured"} taxableIncome={stateTaxable} values={stateValues} markers={stateMarkers} stats={stateStats} footerLabel={`${stateCode} taxable income`} footerValue={formatCurrencyDetailed(stateTaxable)} bandThresholds={stateCode === "CA" ? { greenEnd: ca4Threshold, yellowEnd: ca6Threshold } : { greenEnd: stateTaxable + 1, yellowEnd: stateTaxable + 1 }} collapsed={collapsedSections.state} onToggle={() => setCollapsedSections((current) => ({ ...current, state: !current.state }))} />
      <div className={`tax-thermometer-panel__summary ${collapsedSections.summary ? "tax-thermometer-panel__summary--collapsed" : ""}`}>
        <div className="tax-thermometer-panel__summary-heading">
          <div>
            <strong>Tax Output Summary</strong>
            <span>Live taxable income and tax totals</span>
          </div>
          <button className="ghost-button ghost-button--compact icon-button" type="button" onClick={() => setCollapsedSections((current) => ({ ...current, summary: !current.summary }))} aria-expanded={!collapsedSections.summary} aria-label={collapsedSections.summary ? "Show Tax Output Summary" : "Hide Tax Output Summary"} title={collapsedSections.summary ? "Show Tax Output Summary" : "Hide Tax Output Summary"}>
            <VisibilityToggleIcon variant={collapsedSections.summary ? "show" : "hide"} />
          </button>
        </div>
        {!collapsedSections.summary && (
          <div className="tax-thermometer-panel__summary-grid">
            <div><span>Federal tax</span><strong>{formatCurrencyDetailed(federalTax)}</strong></div>
            <div><span>Federal effective</span><strong>{formatPercent(federalEffectiveRate)}</strong></div>
            <div><span>{stateCode} tax</span><strong>{formatCurrencyDetailed(stateTax)}</strong></div>
            <div><span>{stateCode} effective</span><strong>{formatPercent(stateEffectiveRate)}</strong></div>
            <div><span>Total tax</span><strong>{formatCurrencyDetailed(totalTax)}</strong></div>
          </div>
        )}
        {!collapsedSections.summary && (
          <div className="tax-insight-card">
            <span>Live tax readout</span>
            <strong>Federal bracket {federalTopBracket}; {stateCode} bracket {stateTopBracket}</strong>
            <p>Updates as included holdings, overrides, and tax inputs change.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function readAssistantPromptHistory() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ASSISTANT_PROMPT_HISTORY_KEY) || "[]");
    const history = Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).slice(0, ASSISTANT_PROMPT_HISTORY_LIMIT)
      : [];
    return [...new Set(history)];
  } catch {
    return [];
  }
}

function writeAssistantPromptHistory(history: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ASSISTANT_PROMPT_HISTORY_KEY, JSON.stringify([...new Set(history)].slice(0, ASSISTANT_PROMPT_HISTORY_LIMIT)));
}

function readAssistantMessageHistory() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ASSISTANT_MESSAGE_HISTORY_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((message): message is ChatMessage =>
        message &&
        typeof message === "object" &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        typeof message.createdAt === "string"
      )
      .slice(-ASSISTANT_MESSAGE_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeAssistantMessageHistory(messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ASSISTANT_MESSAGE_HISTORY_KEY, JSON.stringify(messages.slice(-ASSISTANT_MESSAGE_HISTORY_LIMIT)));
}

function clearAssistantMessageHistory() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ASSISTANT_MESSAGE_HISTORY_KEY, "[]");
}

function AssistantPanel({
  portfolioSnapshot,
  authToken,
  onExecuteAction,
  onClose,
}: {
  portfolioSnapshot: PortfolioSnapshot;
  authToken?: string;
  onExecuteAction: (action: AssistantAction) => AssistantActionResult;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(readAssistantMessageHistory);
  const [draft, setDraft] = useState("");
  const [promptHistory, setPromptHistory] = useState<string[]>(readAssistantPromptHistory);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [historyDraft, setHistoryDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const askInputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);

  const visibleMetrics = portfolioSnapshot.metrics;
  useEffect(() => {
    setMessages(readAssistantMessageHistory());
    setPromptHistory(readAssistantPromptHistory());
    const focusTimer = window.setTimeout(() => askInputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, []);

  useEffect(() => {
    writeAssistantMessageHistory(messages);
  }, [messages]);

  const scrollAssistantMessagesToBottom = (behavior: ScrollBehavior = "smooth") => {
    const container = messagesScrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => scrollAssistantMessagesToBottom());
    return () => window.cancelAnimationFrame(frame);
  }, [messages, isLoading, error]);

  useEffect(() => {
    if (!isLoading) return;
    const interval = window.setInterval(() => scrollAssistantMessagesToBottom("auto"), 120);
    return () => window.clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    const refreshStoredAssistantState = () => {
      setMessages(readAssistantMessageHistory());
      setPromptHistory(readAssistantPromptHistory());
    };
    window.addEventListener("focus", refreshStoredAssistantState);
    window.addEventListener("storage", refreshStoredAssistantState);
    return () => {
      window.removeEventListener("focus", refreshStoredAssistantState);
      window.removeEventListener("storage", refreshStoredAssistantState);
    };
  }, []);

  const rememberPrompt = (content: string) => {
    const current = readAssistantPromptHistory();
    const next = [content, ...current.filter((entry) => entry !== content)].slice(0, ASSISTANT_PROMPT_HISTORY_LIMIT);
    writeAssistantPromptHistory(next);
    setPromptHistory(next);
    setHistoryCursor(null);
    setHistoryDraft("");
  };

  const recallPromptFromHistory = (direction: "older" | "newer", textarea: HTMLTextAreaElement) => {
    const latestHistory = promptHistory.length ? promptHistory : readAssistantPromptHistory();
    if (latestHistory.length === 0) return;
    if (latestHistory !== promptHistory) setPromptHistory(latestHistory);

    if (direction === "older") {
      const nextCursor = historyCursor === null ? 0 : Math.min(historyCursor + 1, latestHistory.length - 1);
      if (historyCursor === null) setHistoryDraft(draft);
      setHistoryCursor(nextCursor);
      setDraft(latestHistory[nextCursor]);
      window.setTimeout(() => {
        textarea.selectionStart = textarea.value.length;
        textarea.selectionEnd = textarea.value.length;
      }, 0);
      return;
    }

    if (historyCursor === null) return;
    const nextCursor = historyCursor - 1;
    if (nextCursor < 0) {
      setHistoryCursor(null);
      setDraft(historyDraft);
      setHistoryDraft("");
    } else {
      setHistoryCursor(nextCursor);
      setDraft(latestHistory[nextCursor]);
    }
    window.setTimeout(() => {
      textarea.selectionStart = textarea.value.length;
      textarea.selectionEnd = textarea.value.length;
    }, 0);
  };

  const submitPrompt = async () => {
    const content = draft.trim();
    if (!content || isLoading) return;

    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      createdAt: now,
    };
    const nextMessages = [...messages, userMessage];
    rememberPrompt(content);
    writeAssistantMessageHistory(nextMessages);
    setMessages(nextMessages);
    setDraft("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await postPortfolioChat(
        nextMessages.map((message) => ({ role: message.role, content: message.content })),
        portfolioSnapshot,
        authToken
      );
      const actionResults = (response.actions || []).map((action) => {
        const needsConfirmation =
          action.requiresConfirmation ||
          action.type === "setFilter" ||
          action.type === "setAllCheckboxes" ||
          action.type === "selectAccount" ||
          action.type === "setView" ||
          action.type === "addRow" ||
          action.type === "updateRow" ||
          action.type === "upsertRows" ||
          action.type === "replaceRows" ||
          action.type === "deleteRows";
        if (needsConfirmation && !window.confirm("Apply this assistant-requested workbook/UI change?")) {
          return { ok: false, message: `Skipped ${action.type}: user cancelled confirmation.` };
        }
        return onExecuteAction(action);
      });
      const actionSummary = actionResults.length
        ? `\n\nActions:\n${actionResults.map((result) => `${result.ok ? "Applied" : "Rejected"}: ${result.message}`).join("\n")}`
        : "";
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: `${response.message || "Done."}${actionSummary}`,
        actions: response.actions || [],
        createdAt: new Date().toISOString(),
      };
      const finalMessages = [...nextMessages, assistantMessage];
      writeAssistantMessageHistory(finalMessages);
      setMessages(finalMessages);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Portfolio assistant failed.";
      const errorMessages = [
        ...nextMessages,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant" as const,
          content: message,
          createdAt: new Date().toISOString(),
          error: true,
        },
      ];
      setError(message);
      writeAssistantMessageHistory(errorMessages);
      setMessages(errorMessages);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="assistant-panel" aria-label="Portfolio assistant">
      <div className="assistant-panel__header">
        <div>
          <p className="eyebrow">Portfolio Assistant</p>
          <h3>Ask about holdings, filters, and live metrics</h3>
        </div>
        <div className="assistant-panel__actions">
          <button className="ghost-button ghost-button--compact" type="button" onClick={() => { clearAssistantMessageHistory(); setMessages([]); setError(null); }}>
            Reset
          </button>
          <button className="ghost-button ghost-button--compact" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="assistant-panel__context" aria-label="Assistant context summary">
        <span>{portfolioSnapshot.holdings.length} holdings</span>
        <span>{formatCurrency(visibleMetrics.totalInvestmentAmount)} invested</span>
        <span>{formatCurrency(visibleMetrics.totalIncome)} income</span>
        <span>{formatCurrency(visibleMetrics.afterTaxIncome)} after tax</span>
      </div>
      <div className="assistant-panel__messages" aria-live="polite" ref={messagesScrollRef}>
        {messages.length === 0 && (
          <div className="assistant-panel__empty">
            Try “show only taxable accounts”, “sort investments by income”, or “what is my largest concentration?”
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={`assistant-message assistant-message--${message.role} ${message.error ? "assistant-message--error" : ""}`}>
            {message.content}
          </div>
        ))}
        {isLoading && <div className="assistant-message assistant-message--assistant assistant-message--loading">Thinking with the current portfolio snapshot...</div>}
      </div>
      {error && <div className="assistant-panel__error">{error}</div>}
      <form
        className="assistant-panel__composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submitPrompt();
        }}
      >
        <textarea
          ref={askInputRef}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setHistoryCursor(null);
            setHistoryDraft("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submitPrompt();
              return;
            }

            if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
              const textarea = event.currentTarget;
              const cursor = textarea.selectionStart ?? 0;
              const firstLineEnd = textarea.value.indexOf("\n");
              const isOnFirstLine = firstLineEnd === -1 || cursor <= firstLineEnd;
              const isOnLastLine = textarea.value.indexOf("\n", cursor) === -1;

              if (event.key === "ArrowUp" && isOnFirstLine) {
                event.preventDefault();
                recallPromptFromHistory("older", textarea);
              } else if (event.key === "ArrowDown" && historyCursor !== null && isOnLastLine) {
                event.preventDefault();
                recallPromptFromHistory("newer", textarea);
              }
            }
          }}
          placeholder="Ask the assistant to analyze or change the current view..."
          rows={2}
        />
        <button className="primary-button" type="submit" disabled={isLoading || !draft.trim()}>
          {isLoading ? "Sending" : "Ask"}
        </button>
      </form>
    </section>
  );
}

type LookupColumn<T> = { key: keyof T; label: string; type?: "text" | "number" | "percent" | "select" | "checkbox" | "yesNoCheckbox" | "invertedYesNoCheckbox"; options?: string[] };

function LookupTable<T extends { id: number }>({ title, subtitle, rows, columns, onChange, onAdd, onRemove, onReorder, showMoveHeaderLabel = true }: { title: string; subtitle: string; rows: T[]; columns: Array<LookupColumn<T>>; onChange: (id: number, field: keyof T, value: string | boolean) => void; onAdd: () => void; onRemove: (id: number) => void; onReorder: (sourceId: number, targetId: number) => void; showMoveHeaderLabel?: boolean; }) {
  const [draggingRowId, setDraggingRowId] = useState<number | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<number | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const dragPointerYRef = useRef<number | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const dropHandledRef = useRef(false);
  const stopAutoScroll = () => {
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
    dragPointerYRef.current = null;
  };
  const runAutoScroll = () => {
    const container = tableScrollRef.current;
    const pointerY = dragPointerYRef.current;
    if (!container || pointerY === null) {
      autoScrollFrameRef.current = null;
      return;
    }

    const rect = container.getBoundingClientRect();
    const threshold = Math.min(88, rect.height / 3);
    const maxStep = 20;
    let delta = 0;

    if (pointerY < rect.top + threshold) {
      delta = -Math.ceil(((rect.top + threshold - pointerY) / threshold) * maxStep);
    } else if (pointerY > rect.bottom - threshold) {
      delta = Math.ceil(((pointerY - (rect.bottom - threshold)) / threshold) * maxStep);
    }

    if (delta !== 0) {
      container.scrollTop += delta;
      autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
      return;
    }

    autoScrollFrameRef.current = null;
  };
  const queueAutoScroll = (clientY: number) => {
    dragPointerYRef.current = clientY;
    if (autoScrollFrameRef.current === null) {
      autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
    }
  };
  useEffect(() => () => stopAutoScroll(), []);
  const handleDragStart = (event: DragEvent<HTMLButtonElement>, rowId: number) => {
    setDraggingRowId(rowId);
    dropHandledRef.current = false;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(rowId));
  };
  const handleDragOver = (event: DragEvent<HTMLTableRowElement>, rowId: number) => {
    if (draggingRowId === null || draggingRowId === rowId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    queueAutoScroll(event.clientY);
    setDragOverRowId(rowId);
  };
  const handleTableDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (draggingRowId === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    queueAutoScroll(event.clientY);
  };
  const handleTableDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    stopAutoScroll();
  };
  const handleDrop = (event: DragEvent<HTMLTableRowElement>, targetId: number) => {
    event.preventDefault();
    const sourceId = Number(event.dataTransfer.getData("text/plain")) || draggingRowId;
    if (sourceId && sourceId !== targetId) {
      dropHandledRef.current = true;
      onReorder(sourceId, targetId);
    }
    stopAutoScroll();
    setDraggingRowId(null);
    setDragOverRowId(null);
  };
  const handleDragEnd = () => {
    if (!dropHandledRef.current && draggingRowId !== null && dragOverRowId !== null && draggingRowId !== dragOverRowId) {
      onReorder(draggingRowId, dragOverRowId);
    }
    dropHandledRef.current = false;
    stopAutoScroll();
    setDraggingRowId(null);
    setDragOverRowId(null);
  };
  const renderCell = (row: T, column: LookupColumn<T>) => {
    if (column.type === "checkbox" || column.type === "yesNoCheckbox" || column.type === "invertedYesNoCheckbox") {
      const normalizedYesNo = normalizeYesNo(row[column.key]);
      const checked = column.type === "yesNoCheckbox"
        ? normalizedYesNo === "yes"
        : column.type === "invertedYesNoCheckbox"
          ? normalizedYesNo === "no"
          : normalizeBoolean(row[column.key]);
      return (
        <div className="checkbox-cell">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onChange(row.id, column.key, column.type === "yesNoCheckbox" ? (event.target.checked ? "yes" : "no") : column.type === "invertedYesNoCheckbox" ? (event.target.checked ? "no" : "yes") : event.target.checked)}
            aria-label={`${column.label} for ${title} row`}
          />
        </div>
      );
    }
    const value = String(row[column.key] ?? "");
    if (String(column.key) === "account") {
      return <AccountInput value={value} onChange={(nextValue) => onChange(row.id, column.key, nextValue)} />;
    }
    if (column.type === "select") {
      return <select value={value} onChange={(event) => onChange(row.id, column.key, event.target.value)}>{(column.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select>;
    }
    if (column.type === "percent") {
      const rawNumberValue = Number(row[column.key]);
      const percentValue = Number.isFinite(rawNumberValue) ? String(toNumber(rawNumberValue) * 100) : "";
      return (
        <div className="percent-input">
          <input type="number" value={percentValue} step="0.01" onChange={(event) => onChange(row.id, column.key, String(toNumber(event.target.value) / 100))} />
          <span>%</span>
        </div>
      );
    }
    return <input type={column.type === "number" ? "number" : "text"} value={value} onChange={(event) => onChange(row.id, column.key, event.target.value)} />;
  };

  return (
    <Section title={title} subtitle={subtitle} hideHeading>
      <div className="actions-row">
        <button className="primary-button icon-button action-icon-button" type="button" onClick={onAdd} aria-label="Add row" title="Add row"><RowActionIcon name="add" /></button>
      </div>
      <div className="table-wrap table-wrap--tall lookup-table-wrap" ref={tableScrollRef} onDragOver={handleTableDragOver} onDragLeave={handleTableDragLeave}>
        <table className="sheet-table sheet-table--compact sheet-table--lookup">
          <thead>
            <tr><th className="drag-handle-heading lookup-drag-heading" aria-label="Move row">{showMoveHeaderLabel ? "Move" : ""}</th>{columns.map((column) => <th key={String(column.key)}>{column.label}</th>)}<th /></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`${draggingRowId === row.id ? "lookup-row--dragging" : ""} ${dragOverRowId === row.id && draggingRowId !== row.id ? "lookup-row--drag-over" : ""}`.trim()}
                onDragOver={(event) => handleDragOver(event, row.id)}
                onDrop={(event) => handleDrop(event, row.id)}
              >
                <td className="drag-handle-cell lookup-drag-cell"><button className="drag-handle lookup-drag-handle" type="button" draggable title="Drag row" aria-label={`Move ${title} row`} onDragStart={(event) => handleDragStart(event, row.id)} onDragEnd={handleDragEnd}>::</button></td>
                {columns.map((column) => <td key={String(column.key)}>{renderCell(row, column)}</td>)}
                <td className="lookup-table__actions"><button className="ghost-button ghost-button--compact icon-button action-icon-button action-icon-button--danger" type="button" onClick={() => onRemove(row.id)} aria-label="Delete row" title="Delete row"><RowActionIcon name="delete" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function InvestmentsTable({ rows, accountOptions, symbolOptions, accountTaxStatusByName, derivedRows, favorites, filters, sort, selectedAssetIds, selectedStateCode, isWhatIfActive, onStateChange, onToggleWhatIf, onSaveFavorite, onApplyFavorite, onDeleteFavorite, onRenameFavorite, onChange, onAdd, onReorder, onRemoveIncluded, onClearViewState, onSelectAllInc, onClearAllInc }: { rows: InvestmentRow[]; accountOptions: string[]; symbolOptions: string[]; accountTaxStatusByName: Record<string, string>; derivedRows: DerivedInvestmentRow[]; favorites: InvestmentFavorite[]; filters: InvestmentFilters; sort: InvestmentSort; selectedAssetIds: number[]; selectedStateCode: string; isWhatIfActive: boolean; onStateChange: (stateCode: string) => void; onToggleWhatIf: () => void; onSaveFavorite: (name: string) => void; onApplyFavorite: (name: string) => void; onDeleteFavorite: (name: string) => void; onRenameFavorite: (oldName: string, newName: string) => void; onChange: (id: number, field: keyof InvestmentRow, value: string | boolean) => void; onAdd: () => void; onReorder: (sourceId: number, targetId: number) => void; onRemoveIncluded: () => void; onClearViewState: () => void; onSelectAllInc: () => void; onClearAllInc: () => void; }) {
  const derivedMap = useMemo(() => Object.fromEntries(derivedRows.map((row) => [row.id, row])), [derivedRows]);
  const displayedRows = useMemo(() => {
    const accountFilter = normalizeLookupKey(filters.account);
    const categoryFilter = normalizeLookupKey(filters.category);
    const assetFilter = normalizeLookupKey(filters.asset);
    const filtered = rows.filter((row) => {
      const derived = derivedMap[row.id];
      if (accountFilter && normalizeLookupKey(row.account) !== accountFilter) return false;
      if (categoryFilter && normalizeLookupKey(row.category) !== categoryFilter) return false;
      if (assetFilter && normalizeLookupKey(row.symbol) !== assetFilter && normalizeLookupKey(derived?.effectiveSymbol) !== assetFilter && normalizeLookupKey(String(row.id)) !== assetFilter) return false;
      return true;
    });

    if (sort.tableId !== "investments" || !sort.column) return filtered;
    const sortColumn = sort.column;
    const direction = sort.direction === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const aDerived = derivedMap[a.id];
      const bDerived = derivedMap[b.id];
      const readValue = (row: InvestmentRow, derived?: DerivedInvestmentRow): string | number => {
        switch (sortColumn) {
          case "includedTotal": return derived?.includedTotal || 0;
          case "filteredIncome": return derived?.filteredIncome || 0;
          case "yearlyIncome": return derived?.yearlyIncome || 0;
          case "totalInvestment": return derived?.incomeItem ? 0 : row.totalInvestment;
          case "symbol": return row.symbol;
          default: return row[sortColumn] as string | number;
        }
      };
      const aValue = readValue(a, aDerived);
      const bValue = readValue(b, bDerived);
      if (typeof aValue === "number" && typeof bValue === "number") return (aValue - bValue) * direction;
      return String(aValue).localeCompare(String(bValue)) * direction;
    });
  }, [rows, derivedMap, filters, sort]);
  const displayedDerivedRows = displayedRows
    .map((row) => derivedMap[row.id])
    .filter((row): row is DerivedInvestmentRow => Boolean(row));
  const selectedIdSet = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const selectedRows = selectedAssetIds.map((id) => rows.find((row) => row.id === id)).filter((row): row is InvestmentRow => Boolean(row));
  const hasViewState = Boolean(filters.account || filters.category || filters.asset || sort.column || selectedRows.length > 0);
  const includedRowCount = rows.filter((row) => row.includeIncome).length;
  const [isFavoritesPanelOpen, setIsFavoritesPanelOpen] = useState(false);
  const [newFavoriteName, setNewFavoriteName] = useState("");
  const [selectedFavoriteName, setSelectedFavoriteName] = useState("");
  const [renameTarget, setRenameTarget] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false);
  const [showTaxColumns, setShowTaxColumns] = useState(false);
  const [showDebugColumns, setShowDebugColumns] = useState(false);
  const [columnWidths, setColumnWidths] = useState<InvestmentColumnWidths>(() => {
    if (typeof window === "undefined") return DEFAULT_INVESTMENT_COLUMN_WIDTHS;
    try {
      const stored = JSON.parse(window.localStorage.getItem(INVESTMENT_COLUMN_WIDTH_STORAGE_KEY) || "{}") as Partial<Record<InvestmentColumnId, number>>;
      return INVESTMENT_COLUMN_DEFS.reduce((acc, column) => {
        const storedWidth = stored[column.id];
        acc[column.id] = Number.isFinite(storedWidth)
          ? Math.min(INVESTMENT_COLUMN_MAX_WIDTH, Math.max(INVESTMENT_COLUMN_MIN_WIDTHS[column.id], Number(storedWidth)))
          : DEFAULT_INVESTMENT_COLUMN_WIDTHS[column.id];
        return acc;
      }, {} as InvestmentColumnWidths);
    } catch {
      return DEFAULT_INVESTMENT_COLUMN_WIDTHS;
    }
  });
  const [draggingRowId, setDraggingRowId] = useState<number | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<number | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const dragPointerYRef = useRef<number | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  useEffect(() => {
    window.localStorage.setItem(INVESTMENT_COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(columnWidths));
  }, [columnWidths]);
  useEffect(() => {
    if (selectedAssetIds.length === 0) return;
    const container = tableScrollRef.current;
    if (!container) return;
    const frame = window.requestAnimationFrame(() => {
      const firstSelectedRow = container.querySelector<HTMLElement>(`tr[data-investment-id="${selectedAssetIds[0]}"]`);
      firstSelectedRow?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedAssetIds, displayedRows]);
  const getRowClassName = (row: InvestmentRow) => {
    const classes = ["investment-row"];
    if (!row.includeIncome) {
      classes.push("investment-row--excluded");
    }
    const accountKey = normalizeLookupKey(row.account);
    const taxStatus = String(accountTaxStatusByName[accountKey] || "").toLowerCase();
    const isDeferredStatus = taxStatus.includes("deferred");
    const isTaxFreeStatus = taxStatus.includes("tax-free") || taxStatus.includes("tax free");
    const isNonTaxableStatus = taxStatus.includes("non-taxable") || taxStatus.includes("non taxable") || taxStatus.includes("nontaxable");
    const isDeductionStatus = taxStatus.includes("tax_deduction") || taxStatus.includes("tax-deduction");
    const isPartiallyTaxableStatus = taxStatus.includes("partially taxable");
    const isTaxableStatus = taxStatus === "taxable" || (taxStatus.includes("taxable") && !isPartiallyTaxableStatus);

    if (isDeferredStatus) {
      classes.push("investment-row--deferred");
      return classes.join(" ");
    }
    if (isTaxFreeStatus || isNonTaxableStatus || isDeductionStatus) {
      classes.push("investment-row--non-taxable");
      return classes.join(" ");
    }
    if (isPartiallyTaxableStatus) {
      classes.push("investment-row--partial");
      return classes.join(" ");
    }
    if (isTaxableStatus) {
      classes.push("investment-row--taxable");
      return classes.join(" ");
    }

    return classes.join(" ");
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
    setIsFavoritesPanelOpen(false);
  };
  const handleSelectAllPreset = () => {
    setSelectedFavoriteName("__select_all_inc__");
    onSelectAllInc();
    setIsFavoritesPanelOpen(false);
  };
  const handleClearAllPreset = () => {
    setSelectedFavoriteName("__clear_all_inc__");
    onClearAllInc();
    setIsFavoritesPanelOpen(false);
  };
  const includedRowsLabel = `${includedRowCount} included row${includedRowCount === 1 ? "" : "s"}`;
  const handleRemoveIncludedRows = () => {
    if (includedRowCount === 0) return;
    setIsRemoveConfirmOpen(true);
  };
  const confirmRemoveIncludedRows = () => {
    onRemoveIncluded();
    setIsRemoveConfirmOpen(false);
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
  const stopAutoScroll = () => {
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
    dragPointerYRef.current = null;
  };
  const runAutoScroll = () => {
    const container = tableScrollRef.current;
    const pointerY = dragPointerYRef.current;
    if (!container || pointerY === null) {
      autoScrollFrameRef.current = null;
      return;
    }

    const rect = container.getBoundingClientRect();
    const threshold = Math.min(96, rect.height / 3);
    const maxStep = 22;
    let delta = 0;

    if (pointerY < rect.top + threshold) {
      delta = -Math.ceil(((rect.top + threshold - pointerY) / threshold) * maxStep);
    } else if (pointerY > rect.bottom - threshold) {
      delta = Math.ceil(((pointerY - (rect.bottom - threshold)) / threshold) * maxStep);
    }

    if (delta !== 0) {
      container.scrollTop += delta;
      autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
      return;
    }

    autoScrollFrameRef.current = null;
  };
  const queueAutoScroll = (clientY: number) => {
    dragPointerYRef.current = clientY;
    if (autoScrollFrameRef.current === null) {
      autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
    }
  };
  useEffect(() => () => stopAutoScroll(), []);
  const handleDragStart = (event: DragEvent<HTMLButtonElement>, rowId: number) => {
    setDraggingRowId(rowId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(rowId));
  };
  const handleDragOver = (event: DragEvent<HTMLTableRowElement>, rowId: number) => {
    if (draggingRowId === null || draggingRowId === rowId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    queueAutoScroll(event.clientY);
    setDragOverRowId(rowId);
  };
  const handleTableDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (draggingRowId === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    queueAutoScroll(event.clientY);
  };
  const handleTableDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    stopAutoScroll();
  };
  const handleDrop = (event: DragEvent<HTMLTableRowElement>, targetId: number) => {
    event.preventDefault();
    const sourceId = Number(event.dataTransfer.getData("text/plain")) || draggingRowId;
    if (sourceId && sourceId !== targetId) {
      onReorder(sourceId, targetId);
    }
    stopAutoScroll();
    setDraggingRowId(null);
    setDragOverRowId(null);
  };
  const handleDragEnd = () => {
    stopAutoScroll();
    setDraggingRowId(null);
    setDragOverRowId(null);
  };
  const getDragRowClassName = (row: InvestmentRow) => {
    const classes = [getRowClassName(row)];
    if (draggingRowId === row.id) classes.push("investment-row--dragging");
    if (dragOverRowId === row.id && draggingRowId !== row.id) classes.push("investment-row--drag-over");
    return classes.join(" ");
  };
  const totals = displayedDerivedRows.reduce((acc, row) => {
    if (!row.includeIncome) return acc;

    acc.totalInvestment += row.includedTotal;
    acc.yearlyIncome += row.displayYearlyIncome;
    acc.monthlyIncome += row.displayMonthlyIncome;
    acc.extraData += row.extraData;
    acc.filteredIncome += row.displayFilteredIncome;
    acc.includedTotal += row.includedTotal;
    acc.ordinary += row.ordinaryMonthly * 12;
    acc.preferred += row.preferredMonthly * 12;
    acc.state += row.stateMonthly * 12;
    acc.nonTaxable += row.nonTaxableMonthly * 12;
    acc.nonInvestmentIncome += row.nonInvestmentIncome;
    acc.cash += row.cash;
    acc.stocks += row.stocks;
    acc.preferredStock += row.preferredStock;
    acc.bonds += row.bonds;
    acc.muniBond += row.muniBond;
    acc.muniInterest += row.muniInterest;
    acc.businessDevelopment += row.businessDevelopment;
    acc.coveredCall += row.coveredCall;
    acc.realEstate += row.realEstate;
    acc.bitcoin += row.bitcoin;
    return acc;
  }, { totalInvestment: 0, yearlyIncome: 0, monthlyIncome: 0, extraData: 0, filteredIncome: 0, includedTotal: 0, ordinary: 0, preferred: 0, state: 0, nonTaxable: 0, nonInvestmentIncome: 0, cash: 0, stocks: 0, preferredStock: 0, bonds: 0, muniBond: 0, muniInterest: 0, businessDevelopment: 0, coveredCall: 0, realEstate: 0, bitcoin: 0 });
  const renderTotalCell = (key: InvestmentColumnId, value: number) => <td key={key}><div className="readonly-cell readonly-cell--money readonly-cell--total">{formatGridCurrency(value)}</div></td>;
  const renderEmptyTotalCell = (key: InvestmentColumnId) => <td key={key} />;
  const isColumnVisible = (column: typeof INVESTMENT_COLUMN_DEFS[number]) => {
    const group = "group" in column ? column.group : undefined;
    if (group === "override") return isWhatIfActive;
    if (group === "tax") return showTaxColumns;
    if (group === "debug") return showDebugColumns;
    return true;
  };
  const visibleInvestmentColumns = INVESTMENT_COLUMN_DEFS.filter(isColumnVisible);
  const visibleTableWidth = INVESTMENT_COLUMN_DEFS.reduce((sum, column) => sum + (isColumnVisible(column) ? columnWidths[column.id] : 0), 0);
  const tableStyle = {
    width: visibleTableWidth,
    minWidth: visibleTableWidth,
    "--investment-col-2-left": `${columnWidths.move}px`,
    "--investment-col-3-left": `${columnWidths.move + columnWidths.row}px`,
    "--investment-col-4-left": `${columnWidths.move + columnWidths.row + columnWidths.included}px`,
  } as CSSProperties;
  const handleColumnResizeStart = (event: ReactPointerEvent<HTMLButtonElement>, columnId: InvestmentColumnId) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[columnId];
    const minWidth = INVESTMENT_COLUMN_MIN_WIDTHS[columnId];

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(INVESTMENT_COLUMN_MAX_WIDTH, Math.max(minWidth, startWidth + moveEvent.clientX - startX));
      setColumnWidths((current) => ({ ...current, [columnId]: nextWidth }));
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  };
  const renderInvestmentHeader = (column: typeof INVESTMENT_COLUMN_DEFS[number]) => (
    <th
      key={column.id}
      className={[
        "className" in column ? column.className : "",
        "group" in column ? `investment-column--${column.group}` : "",
      ].filter(Boolean).join(" ") || undefined}
      title={"title" in column ? column.title : undefined}
      aria-label={"ariaLabel" in column ? column.ariaLabel : undefined}
    >
      <span className="resizable-header__label">{column.label}</span>
      <button
        type="button"
        className="column-resizer"
        aria-label={`Resize ${("ariaLabel" in column ? column.ariaLabel : undefined) || column.label || "column"} column`}
        onPointerDown={(event) => handleColumnResizeStart(event, column.id)}
      />
    </th>
  );
  const tableClassName = [
    "sheet-table",
    "sheet-table--compact",
    "sheet-table--workbook",
  ].filter(Boolean).join(" ");

  return (
    <Section title="Investments" subtitle="Workbook-style grid with checkbox overrides. When override is checked, the proposed symbol and return replace the current holding in the downstream tax logic." className="investments-workspace" hideHeading>
      <div className="actions-row">
        <button className="primary-button icon-button action-icon-button" type="button" onClick={onAdd} aria-label="Add row" title="Add row"><RowActionIcon name="add" /></button>
        <button className="ghost-button icon-button action-icon-button" type="button" onClick={() => setIsFavoritesPanelOpen(true)} aria-label="Select rows" title="Select rows"><RowActionIcon name="select" /></button>
        <button className="ghost-button icon-button action-icon-button action-icon-button--danger" type="button" onClick={handleRemoveIncludedRows} aria-label={`Delete ${includedRowsLabel}`} title={includedRowCount === 0 ? "No included rows to delete" : `Delete ${includedRowsLabel}`} disabled={includedRowCount === 0}><RowActionIcon name="delete" /></button>
        <label className="column-toggle-group column-toggle-group--state"><span>State</span><StateFlagSelect value={selectedStateCode} onChange={onStateChange} className="state-flag-select--toolbar" /></label>
        <div className="column-toggle-group" role="group" aria-label="Investment column visibility">
          <button className={`ghost-button ghost-button--compact column-toggle ${isWhatIfActive ? "column-toggle--open" : ""}`} type="button" aria-pressed={isWhatIfActive} onClick={onToggleWhatIf}>
            {isWhatIfActive ? "- WhatIf" : "+ WhatIf"}
          </button>
          <button className={`ghost-button ghost-button--compact column-toggle ${showTaxColumns ? "column-toggle--open" : ""}`} type="button" aria-pressed={showTaxColumns} onClick={() => setShowTaxColumns((current) => !current)}>
            {showTaxColumns ? "- Tax categories" : "+ Tax categories"}
          </button>
          <button className={`ghost-button ghost-button--compact column-toggle ${showDebugColumns ? "column-toggle--open" : ""}`} type="button" aria-pressed={showDebugColumns} onClick={() => setShowDebugColumns((current) => !current)}>
            {showDebugColumns ? "- Debug" : "+ Debug"}
          </button>
        </div>
      </div>
      {hasViewState && (
        <div className="view-state-strip" role="status">
          <strong>Showing {displayedRows.length} of {rows.length} rows</strong>
          {selectedRows.length > 0 && <span>Selected: {selectedRows.length} row{selectedRows.length === 1 ? "" : "s"}</span>}
          {filters.account && <span>Account: {filters.account}</span>}
          {filters.category && <span>Category: {filters.category}</span>}
          {filters.asset && <span>Asset: {filters.asset}</span>}
          {sort.column && <span>Sorted: {sort.column} {sort.direction}</span>}
          <button className="ghost-button ghost-button--compact" type="button" onClick={onClearViewState}>Show all rows</button>
        </div>
      )}
      {isRemoveConfirmOpen && (
        <div className="confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="remove-all-confirm-title">
          <div>
            <h3 id="remove-all-confirm-title">Confirm</h3>
            <p>This can't be undone.</p>
          </div>
          <div className="confirm-panel__actions">
            <button className="ghost-button ghost-button--compact" type="button" onClick={() => setIsRemoveConfirmOpen(false)}>Cancel</button>
            <button className="primary-button ghost-button--compact" type="button" onClick={confirmRemoveIncludedRows}>Remove {includedRowsLabel}</button>
          </div>
        </div>
      )}
      {isFavoritesPanelOpen && (
        <div className="favorites-overlay">
          <div className="favorites-panel">
            <div className="favorites-panel__header">
              <h3>Select Rows</h3>
              <button className="ghost-button ghost-button--compact" type="button" onClick={() => setIsFavoritesPanelOpen(false)}>Close</button>
            </div>
            <div className="favorites-panel__new">
              <input
                type="text"
                value={newFavoriteName}
                onChange={(event) => setNewFavoriteName(event.target.value)}
                placeholder="New row selection name"
              />
              <button className="primary-button ghost-button--compact" type="button" onClick={handleSaveFavorite}>Save</button>
            </div>
            <div className="favorites-panel__list">
              <button
                type="button"
                className={`favorites-item favorites-item--system ${selectedFavoriteName === "__select_all_inc__" ? "favorites-item--active" : ""}`}
                onClick={handleSelectAllPreset}
              >
                <span>Select all Inc</span>
                <small>Built-in</small>
              </button>
              <button
                type="button"
                className={`favorites-item favorites-item--system ${selectedFavoriteName === "__clear_all_inc__" ? "favorites-item--active" : ""}`}
                onClick={handleClearAllPreset}
              >
                <span>Clear all Inc</span>
                <small>Built-in</small>
              </button>
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
              {filteredFavorites.length === 0 && <div className="favorites-empty">No saved row selections.</div>}
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
                  placeholder="Rename row selection"
                />
                <button className="ghost-button ghost-button--compact" type="button" onClick={handleRenameFavorite}>Save name</button>
                <button className="ghost-button ghost-button--compact" type="button" onClick={() => { setRenameTarget(""); setRenameValue(""); }}>Cancel</button>
              </div>
            )}
            <p className="favorites-panel__note">Saved row selections use exact row matching; removed rows are ignored.</p>
          </div>
        </div>
      )}
      <div className="table-wrap table-wrap--tall" ref={tableScrollRef} onDragOver={handleTableDragOver} onDragLeave={handleTableDragLeave}>
        <table className={tableClassName} style={tableStyle}>
          <colgroup>
            {visibleInvestmentColumns.map((column) => (
              <col key={column.id} style={{ width: columnWidths[column.id] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {visibleInvestmentColumns.map(renderInvestmentHeader)}
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((row) => {
              const derived = derivedMap[row.id];
              const investmentCells = {
                move: <td key="move" className="drag-handle-cell"><button className="drag-handle" type="button" draggable title="Drag row" aria-label={`Move ${row.description || "investment row"}`} onDragStart={(event) => handleDragStart(event, row.id)} onDragEnd={handleDragEnd}>::</button></td>,
                row: <td key="row" className="sheet-row-cell"><div className="readonly-cell readonly-cell--row-id">{row.spreadsheetRowNumber ?? ""}</div></td>,
                included: <td key="included" className="checkbox-cell checkbox-cell--included"><input type="checkbox" checked={row.includeIncome} onChange={(event) => onChange(row.id, "includeIncome", event.target.checked)} aria-label={`Included: ${row.description || "investment row"}`} /></td>,
                account: <td key="account"><AccountSelect value={row.account} options={accountOptions} onChange={(value) => onChange(row.id, "account", value)} ariaLabel={`Account for ${row.description || "investment row"}`} /></td>,
                symbol: <td key="symbol"><select value={row.symbol} onChange={(event) => onChange(row.id, "symbol", event.target.value)}>{symbolOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></td>,
                normalPercent: <td key="normalPercent"><div className="readonly-cell">{formatPercent(derived?.currentPercent || 0)}</div></td>,
                amount: <td key="amount">{derived?.incomeItem ? <div className="readonly-cell readonly-cell--text">N.A.</div> : <MoneyInput value={row.totalInvestment} onChange={(value) => onChange(row.id, "totalInvestment", value)} ariaLabel={`Total investment for ${row.description || row.account || "investment row"}`} />}</td>,
                year: <td key="year">{derived?.incomeItem ? <MoneyInput value={row.yearlyIncome} onChange={(value) => onChange(row.id, "yearlyIncome", value)} ariaLabel={`Yearly income for ${row.description || row.account || "investment row"}`} /> : <div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.yearlyIncome || 0)}</div>}</td>,
                month: <td key="month"><div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.monthlyIncome || 0)}</div></td>,
                filtered: <td key="filtered"><div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.filteredIncome || 0)}</div></td>,
                total: <td key="total"><div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.includedTotal || 0)}</div></td>,
                taxStatus: <td key="taxStatus"><div className="readonly-cell readonly-cell--text">{derived?.taxStatus || ""}</div></td>,
                ordinary: <td key="ordinary"><div className="readonly-cell readonly-cell--money">{formatGridCurrency((derived?.ordinaryMonthly || 0) * 12)}</div></td>,
                preferred: <td key="preferred"><div className="readonly-cell readonly-cell--money">{formatGridCurrency((derived?.preferredMonthly || 0) * 12)}</div></td>,
                state: <td key="state"><div className="readonly-cell readonly-cell--money">{formatGridCurrency((derived?.stateMonthly || 0) * 12)}</div></td>,
                nonTaxable: <td key="nonTaxable"><div className="readonly-cell readonly-cell--money">{formatGridCurrency((derived?.nonTaxableMonthly || 0) * 12)}</div></td>,
                investmentType: <td key="investmentType"><div className="readonly-cell readonly-cell--text">{derived?.investmentType || ""}</div></td>,
                nonInvestmentIncome: <td key="nonInvestmentIncome"><div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.nonInvestmentIncome || 0)}</div></td>,
                cash: <td key="cash"><div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.cash || 0)}</div></td>,
                stocks: <td key="stocks"><div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.stocks || 0)}</div></td>,
                preferredStock: <td key="preferredStock"><div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.preferredStock || 0)}</div></td>,
                bonds: <td key="bonds"><div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.bonds || 0)}</div></td>,
                muniBond: <td key="muniBond"><div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.muniBond || 0)}</div></td>,
                muniInterest: <td key="muniInterest"><div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.muniInterest || 0)}</div></td>,
                businessDevelopment: <td key="businessDevelopment"><div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.businessDevelopment || 0)}</div></td>,
                coveredCall: <td key="coveredCall"><div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.coveredCall || 0)}</div></td>,
                realEstate: <td key="realEstate"><div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.realEstate || 0)}</div></td>,
                bitcoin: <td key="bitcoin"><div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.bitcoin || 0)}</div></td>,
                override: <td key="override" className="checkbox-cell investment-column--override"><input type="checkbox" checked={row.overrideProposal} onChange={(event) => onChange(row.id, "overrideProposal", event.target.checked)} /></td>,
                overrideSymbol: <td key="overrideSymbol" className="investment-column--override"><select value={row.newSymbol} disabled={!row.overrideProposal} onChange={(event) => onChange(row.id, "newSymbol", event.target.value)}>{symbolOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></td>,
                overridePercent: <td key="overridePercent" className="investment-column--override"><div className="readonly-cell">{formatPercent(derived?.newPercent || 0)}</div></td>,
                usePercent: <td key="usePercent"><div className="readonly-cell">{formatPercent(derived?.effectivePercent || 0)}</div></td>,
                useSymbol: <td key="useSymbol"><div className="readonly-cell readonly-cell--text">{derived?.effectiveSymbol || ""}</div></td>,
                extraData: <td key="extraData"><div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.extraData || 0)}</div></td>,
              } satisfies Record<InvestmentColumnId, ReactElement>;
              return (
                <tr
                  key={row.id}
                  data-investment-id={row.id}
                  className={`${getDragRowClassName(row)} ${selectedIdSet.has(row.id) ? "investment-row--selected" : ""}`}
                  onDragOver={(event) => handleDragOver(event, row.id)}
                  onDrop={(event) => handleDrop(event, row.id)}
                >
                  {visibleInvestmentColumns.map((column) => investmentCells[column.id])}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="investment-total-row">
              {visibleInvestmentColumns.map((column) => ({
                move: renderEmptyTotalCell("move"),
                row: renderEmptyTotalCell("row"),
                included: renderEmptyTotalCell("included"),
                account: <th key="account" className="investment-total-row__label" scope="row" title="Included totals">Totals</th>,
                symbol: renderEmptyTotalCell("symbol"),
                normalPercent: renderEmptyTotalCell("normalPercent"),
                amount: renderTotalCell("amount", totals.totalInvestment),
                year: renderTotalCell("year", totals.yearlyIncome),
                month: renderTotalCell("month", totals.monthlyIncome),
                filtered: renderTotalCell("filtered", totals.filteredIncome),
                total: renderTotalCell("total", totals.includedTotal),
                taxStatus: renderEmptyTotalCell("taxStatus"),
                ordinary: renderTotalCell("ordinary", totals.ordinary),
                preferred: renderTotalCell("preferred", totals.preferred),
                state: renderTotalCell("state", totals.state),
                nonTaxable: renderTotalCell("nonTaxable", totals.nonTaxable),
                investmentType: renderEmptyTotalCell("investmentType"),
                nonInvestmentIncome: renderTotalCell("nonInvestmentIncome", totals.nonInvestmentIncome),
                cash: renderTotalCell("cash", totals.cash),
                stocks: renderTotalCell("stocks", totals.stocks),
                preferredStock: renderTotalCell("preferredStock", totals.preferredStock),
                bonds: renderTotalCell("bonds", totals.bonds),
                muniBond: renderTotalCell("muniBond", totals.muniBond),
                muniInterest: renderTotalCell("muniInterest", totals.muniInterest),
                businessDevelopment: renderTotalCell("businessDevelopment", totals.businessDevelopment),
                coveredCall: renderTotalCell("coveredCall", totals.coveredCall),
                realEstate: renderTotalCell("realEstate", totals.realEstate),
                bitcoin: renderTotalCell("bitcoin", totals.bitcoin),
                override: renderEmptyTotalCell("override"),
                overrideSymbol: renderEmptyTotalCell("overrideSymbol"),
                overridePercent: renderEmptyTotalCell("overridePercent"),
                usePercent: renderEmptyTotalCell("usePercent"),
                useSymbol: renderEmptyTotalCell("useSymbol"),
                extraData: renderTotalCell("extraData", totals.extraData),
              } satisfies Record<InvestmentColumnId, ReactElement>)[column.id])}
            </tr>
          </tfoot>
        </table>
      </div>
    </Section>
  );
}
function AfterTaxUSMark({ className = "aftertaxum-logo__mark", idSuffix = "logo" }: { className?: string; idSuffix?: string }) {
  const ringId = `aftertaxusRing-${idSuffix}`;
  const innerId = `aftertaxusInner-${idSuffix}`;
  return (
    <svg className={className} viewBox="0 0 96 96" role="img" aria-hidden="true">
      <defs>
        <linearGradient id={ringId} x1="12" y1="20" x2="78" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#061B38" />
          <stop offset="0.48" stopColor="#1F5FA8" />
          <stop offset="1" stopColor="#29C7A3" />
        </linearGradient>
        <linearGradient id={innerId} x1="22" y1="28" x2="76" y2="72" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2A64B8" stopOpacity="0.88" />
          <stop offset="1" stopColor="#2DD4A2" stopOpacity="0.88" />
        </linearGradient>
      </defs>
      <path d="M48 10a38 38 0 1 0 27.7 64.1l-12-10.4A22.1 22.1 0 1 1 63.4 32l12.4-10A37.8 37.8 0 0 0 48 10Z" fill={`url(#${ringId})`} />
      <path d="M48 22a26 26 0 1 0 18.7 44.1l-9.1-7.9A14 14 0 1 1 57.7 38l9.4-7.5A25.8 25.8 0 0 0 48 22Z" fill={`url(#${innerId})`} />
      <g fill="#32C8A6">
        <circle cx="72" cy="25" r="3.8" />
        <circle cx="83" cy="30" r="2.4" />
        <circle cx="70" cy="38" r="2.6" />
        <circle cx="81" cy="45" r="3" />
        <circle cx="69" cy="56" r="3.3" />
        <circle cx="84" cy="64" r="2.2" />
        <circle cx="75" cy="73" r="2.8" />
      </g>
      <g fill="#2361C9">
        <circle cx="70" cy="15" r="2.2" />
        <circle cx="80" cy="19" r="3" />
        <circle cx="88" cy="36" r="2.6" />
        <circle cx="74" cy="46" r="1.8" />
      </g>
    </svg>
  );
}

function AfterTaxUSLogo() {
  return (
    <div className="aftertaxum-logo" aria-label="AfterTax US">
      <AfterTaxUSMark idSuffix="full" />
      <div className="aftertaxum-logo__copy">
        <strong className="aftertaxum-logo__title">AfterTax US<img className="aftertaxum-logo__us-flag" src={US_FLAG_ICON_URL} alt="United States flag" width={18} height={12} loading="lazy" referrerPolicy="no-referrer" /></strong>
        <span>AI-powered after-tax portfolio intelligence</span>
        <small>See the after-tax impact before every decision.</small>
      </div>
    </div>
  );
}

function AppSplash({ message }: { message: string }) {
  return (
    <div className="app-splash" role="status" aria-live="polite">
      <div className="app-splash__card">
        <AfterTaxUSLogo />
        <div className="app-splash__status">
          <span className="app-splash__spinner" aria-hidden="true" />
          <strong>{message}</strong>
        </div>
      </div>
    </div>
  );
}
export default function App() {
  const authEnabled = isCognitoEnabled();
  const [authState, setAuthState] = useState<AuthState>(readStoredAuth);
  const [activeTab, setActiveTab] = useState<TabKey>("investments");
  const [focusGrid, setFocusGrid] = useState(false);
  const [showThermometerRail, setShowThermometerRail] = useState(true);
  const [investmentFilters, setInvestmentFilters] = useState<InvestmentFilters>({ account: "", category: "", asset: "" });
  const [investmentSort, setInvestmentSort] = useState<InvestmentSort>({ tableId: "investments", column: "", direction: "asc" });
  const [selectedInvestmentIds, setSelectedInvestmentIds] = useState<number[]>([]);
  const [isWhatIfActive, setIsWhatIfActive] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [investments, setInvestments] = useState<InvestmentRow[]>(() => authEnabled ? [] : initialInvestments);
  const [tickers, setTickers] = useState(initialTickers);
  const [categories, setCategories] = useState(initialCategories);
  const [taxTreatments, setTaxTreatments] = useState(initialTaxTreatments);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [accountTaxTypes, setAccountTaxTypes] = useState(initialAccountTaxTypes);
  const [investmentTypes, setInvestmentTypes] = useState(initialInvestmentTypes);
  const [federalSettings, setFederalSettings] = useState(initialFederalSettings);
  const [stateSettings, setStateSettings] = useState(initialStateSettings);
  const [plannerSettings, setPlannerSettings] = useState(initialPlannerSettings);
  const [uiSettings, setUiSettings] = useState(initialUiSettings);
  const [taxCalcInputs, setTaxCalcInputs] = useState(initialTaxCalculatorInputs);
  const selectedStateCode = normalizeStateCode(stateSettings.stateCode);
  const selectedStateName = stateNameByCode[selectedStateCode] || selectedStateCode;
  const [taxCalcResult, setTaxCalcResult] = useState<TaxResult | null>(null);
  const [taxCalcError, setTaxCalcError] = useState<string | null>(null);
  const [taxCalcStateResult, setTaxCalcStateResult] = useState<TaxResult | null>(null);
  const [taxCalcStateError, setTaxCalcStateError] = useState<string | null>(null);
  const [isSheetPanelOpen, setIsSheetPanelOpen] = useState(false);
  const [federalResult, setFederalResult] = useState<TaxResult | null>(null);
  const [stateResult, setStateResult] = useState<TaxResult | null>(null);
  const [federalError, setFederalError] = useState<string | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [storageState, setStorageState] = useState<SaveState>("loading");
  const [mcpTokenMessage, setMcpTokenMessage] = useState("");
  const [isCreatingMcpToken, setIsCreatingMcpToken] = useState(false);
  const [isTopbarMenuOpen, setIsTopbarMenuOpen] = useState(false);
  const [incomeSnapshot, setIncomeSnapshot] = useState<IncomeSnapshot | null>(null);
  const saveTimeout = useRef<number | null>(null);
  const topbarMenuRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedStorage = useRef(false);
  const authToken = authState.status === "signedIn" ? authState.tokens.idToken : undefined;
  const requiresSignIn = authEnabled && authState.status !== "signedIn";

  useEffect(() => {
    if (!authEnabled) return;
    let cancelled = false;
    completeCognitoSignInFromUrl()
      .then((nextAuthState) => {
        if (!cancelled && nextAuthState) setAuthState(nextAuthState);
      })
      .catch((error: Error) => {
        if (!cancelled) setAuthState({ status: "signedOut", user: null, tokens: null, error: error.message });
      });
    return () => { cancelled = true; };
  }, [authEnabled]);

  useEffect(() => {
    if (!isTopbarMenuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (!topbarMenuRef.current?.contains(event.target as Node)) {
        setIsTopbarMenuOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsTopbarMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("touchstart", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("touchstart", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isTopbarMenuOpen]);

  const copyChatGptConnectorUrl = async () => {
    if (!authToken) {
      setMcpTokenMessage("Sign in first.");
      return;
    }

    setIsCreatingMcpToken(true);
    setMcpTokenMessage("Creating ChatGPT token...");
    try {
      const result = await createMcpConnectorToken(WORKSPACE_ID, authToken);
      const mcpUrl = `${MCP_CONNECTOR_BASE_URL}?mcp_token=${encodeURIComponent(result.token || "")}`;
      await navigator.clipboard.writeText(mcpUrl);
      setMcpTokenMessage("ChatGPT connector URL copied.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create ChatGPT token.";
      setMcpTokenMessage(message);
    } finally {
      setIsCreatingMcpToken(false);
    }
  };

  const tickerMap = useMemo(
    () => Object.fromEntries(
      tickers
        .map((row) => [normalizeLookupKey(row.symbol), row] as const)
        .filter(([symbol]) => Boolean(symbol))
    ),
    [tickers]
  );
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
  const taxTreatmentOptions = useMemo(() => {
    const values = taxTreatments
      .map((row) => String(row.label || "").trim())
      .filter(Boolean);
    const fromTickers = tickers
      .map((row) => String(row.taxTreatment || "").trim())
      .filter(Boolean);
    return ["", ...new Set([...values, ...fromTickers])];
  }, [taxTreatments, tickers]);
  const categoryOptions = useMemo(() => {
    const values = categories
      .map((row) => String(row.name || "").trim())
      .filter(Boolean);
    const fromTickers = tickers
      .map((row) => String(row.category || "").trim())
      .filter(Boolean);
    return ["", ...new Set([...values, ...fromTickers])];
  }, [categories, tickers]);
  const accountOptions = useMemo(() => ["", ...accounts.map((row) => row.account).filter(Boolean).filter((value, index, array) => array.indexOf(value) === index)], [accounts]);
  const symbolOptions = useMemo(
    () => [
      "",
      ...tickers
        .map((row) => String(row.symbol || "").trim())
        .filter(Boolean)
        .filter((value, index, array) => array.indexOf(value) === index),
    ],
    [tickers]
  );

  const overridePercentForSymbol = (symbol: string) => {
    const ticker = tickerMap[normalizeLookupKey(symbol)];
    return normalizeRate(ticker?.percentReturn || 0);
  };

  const updateInvestmentRow = (id: number, field: keyof InvestmentRow, value: string | boolean) => {
    setInvestments((current) =>
      current.map((row) => {
        if (row.id !== id) return row;

        if (field === "includeIncome" || field === "overrideProposal") {
          const checked = Boolean(value);
          const nextRow = { ...row, [field]: checked };
          if (field === "overrideProposal") {
            const nextSymbol = nextRow.newSymbol || nextRow.symbol;
            return {
              ...nextRow,
              newSymbol: nextSymbol,
              newPercent: overridePercentForSymbol(nextSymbol),
            };
          }
          return nextRow;
        }

        if (field === "totalInvestment" || field === "yearlyIncome") {
          return { ...row, [field]: toNumber(value) };
        }

        if (field === "newSymbol") {
          const nextSymbol = String(value || "").trim();
          return {
            ...row,
            newSymbol: nextSymbol,
            newPercent: overridePercentForSymbol(nextSymbol),
          };
        }

        if (field === "symbol") {
          const nextSymbol = String(value || "").trim();
          const nextRow = { ...row, symbol: nextSymbol };
          if (!nextRow.overrideProposal) {
            return {
              ...nextRow,
              newSymbol: nextSymbol,
              newPercent: overridePercentForSymbol(nextSymbol),
            };
          }
          return nextRow;
        }

        return { ...row, [field]: value };
      })
    );
  };

  const derivedRows = useMemo<DerivedInvestmentRow[]>(() => investments.map((row) => {
    const currentTicker = tickerMap[normalizeLookupKey(row.symbol)];
    const isRowWhatIfActive = isWhatIfActive && row.overrideProposal;
    const effectiveSymbol = isRowWhatIfActive && row.newSymbol ? row.newSymbol : row.symbol;
    const proposedTicker = row.newSymbol ? tickerMap[normalizeLookupKey(row.newSymbol)] : undefined;
    const effectiveTicker = tickerMap[normalizeLookupKey(effectiveSymbol)] || currentTicker;
    const totalInvestment = toNumber(row.totalInvestment);
    const currentPercent = normalizeRate(currentTicker?.percentReturn || 0);
    const proposedPercent = normalizeRate(proposedTicker?.percentReturn ?? row.newPercent);
    const effectivePercent = isRowWhatIfActive ? proposedPercent || currentPercent : currentPercent;
    const incomeItem = Boolean(effectiveTicker?.incomeItem);
    const yearlyIncome = incomeItem ? toNumber(row.yearlyIncome) : totalInvestment * effectivePercent;
    const monthlyIncome = yearlyIncome / 12;
    const filteredIncome = row.includeIncome ? yearlyIncome : 0;
    const includedTotal = row.includeIncome && !incomeItem ? totalInvestment : 0;
    const account = accountMap[normalizeLookupKey(row.account)];
    const includeInAfterTaxIncome = normalizeYesNo(account?.includeInFreeCashflow ?? "yes") === "yes";
    const displayYearlyIncome = includeInAfterTaxIncome ? yearlyIncome : 0;
    const displayMonthlyIncome = displayYearlyIncome / 12;
    const displayFilteredIncome = row.includeIncome ? displayYearlyIncome : 0;
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
      yearlyIncome,
      monthlyIncome,
      currentPercent,
      newPercent: proposedPercent,
      effectiveSymbol,
      effectivePercent,
      incomeItem,
      extraData,
      filteredIncome,
      displayYearlyIncome,
      displayMonthlyIncome,
      displayFilteredIncome,
      includedTotal,
      taxStatus,
      taxTreatment,
      investmentType,
      ordinaryMonthly: fedTaxAdjust(taxableMonthlyBase, taxTreatment, extraData, false),
      preferredMonthly: fedTaxAdjust(taxableMonthlyBase, taxTreatment, extraData, true),
      stateMonthly: stateTaxAdjust(taxableMonthlyBase, taxTreatment, extraData, selectedStateCode),
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
  }), [investments, tickerMap, accountMap, isWhatIfActive, selectedStateCode]);

  const flows = useMemo(() => derivedRows.reduce((acc, row) => {
    acc.totalInvestmentAmount += row.includedTotal;
    acc.totalIncome += row.displayFilteredIncome;
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
  const persistedInvestments = useMemo<InvestmentRow[]>(
    () => investments.map((row) => {
      const derived = derivedRows.find((derivedRow) => derivedRow.id === row.id);
      const proposedTicker = row.newSymbol ? tickerMap[normalizeLookupKey(row.newSymbol)] : undefined;
      return derived
        ? {
            ...row,
            totalInvestment: derived.incomeItem ? 0 : row.totalInvestment,
            yearlyIncome: derived.yearlyIncome,
            newPercent: normalizeRate(proposedTicker?.percentReturn ?? row.newPercent),
          }
        : row;
    }),
    [investments, derivedRows, tickerMap]
  );

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
  const localTaxCalcStateResult = localStateTax2025(stateTaxableForCalc, normalizeStateCode(taxCalcInputs.stateCode), taxCalcInputs.filingStatus);
  const displayedTaxCalcStateResult = taxCalcStateResult?.state === normalizeStateCode(taxCalcInputs.stateCode) ? taxCalcStateResult : localTaxCalcStateResult;
  const totalTaxCalc = (taxCalcResult?.tax || 0) + displayedTaxCalcStateResult.tax;
  const netAfterWithholdingsCalc =
    totalTaxCalc - (taxCalcInputs.federalWithholding + taxCalcInputs.stateWithholding);
  const afterTaxIncomeCalc =
    magiStandalone - totalTaxCalc + taxCalcInputs.federalWithholding + taxCalcInputs.stateWithholding;

  useEffect(() => {
    if (authEnabled && authState.status !== "signedIn") {
      hasLoadedStorage.current = false;
      setStorageState(authState.status === "loading" ? "loading" : "ready");
      return;
    }

    let cancelled = false;
    setStorageState("loading");
    loadWorkbook(WORKSPACE_ID, authToken).then((response) => {
      if (cancelled) return;
      const workbookSettings = parseWorkbookSettings(response.settings);
      const authenticatedWorkbook = authEnabled && authState.status === "signedIn";
      const loadedInvestments = mapWorkbookRows(
        authenticatedWorkbook ? [] : initialInvestments,
        response.tabs?.investments,
        workbookToInvestmentRow
      );
      setInvestments(authenticatedWorkbook && isStarterInvestmentSet(loadedInvestments) ? [] : loadedInvestments);
      setTickers(
        mapWorkbookRows(initialTickers, response.tabs?.tickers, workbookToTickerRow)
      );
      setCategories(
        mapWorkbookRows(initialCategories, response.tabs?.categories || response.tabs?.category, workbookToCategoryRow)
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
    }).catch((error: Error) => {
      console.error(error);
      setStorageState("error");
      hasLoadedStorage.current = true;
    });
    return () => { cancelled = true; };
  }, [authEnabled, authState.status, authToken]);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      postTaxCalculation({ calc: "FED_TAX_2025_COMBINED", ordinaryTaxable, prefTaxable, filingStatus: federalSettings.filingStatus, magi, netInvestmentIncome }).then((result) => {
        if (!cancelled) { setFederalResult(result); setFederalError(null); }
      }).catch((error: Error) => {
        if (!cancelled) { setFederalResult(null); setFederalError(error.message); }
      });

      postTaxCalculation({ calc: "STATE_TAX_2025", state: selectedStateCode, filingStatus: federalSettings.filingStatus, taxableIncome: stateTaxableAfterDeductions }).then((result) => {
        if (!cancelled) { setStateResult(result); setStateError(null); }
      }).catch((error: Error) => {
        if (!cancelled) { setStateResult(null); setStateError(error.message); }
      });
    }, 220);

    return () => { cancelled = true; window.clearTimeout(timeoutId); };
    }, [ordinaryTaxable, prefTaxable, federalSettings.filingStatus, magi, netInvestmentIncome, stateTaxableAfterDeductions, selectedStateCode]);

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
      calc: "STATE_TAX_2025",
      state: normalizeStateCode(taxCalcInputs.stateCode),
      filingStatus: taxCalcInputs.filingStatus,
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
  }, [stateTaxableForCalc, taxCalcInputs.filingStatus, taxCalcInputs.stateCode]);

  useEffect(() => {
    if (authEnabled && authState.status !== "signedIn") return;
    if (!hasLoadedStorage.current) return;
    if (!hasRealData && investments.length > 0) {
      return;
    }
    if (saveTimeout.current) window.clearTimeout(saveTimeout.current);
    setStorageState("saving");
    saveTimeout.current = window.setTimeout(() => {
      let cancelled = false;
      saveWorkbook(WORKSPACE_ID, { workspaceId: WORKSPACE_ID, tabs: { investments: persistedInvestments, tickers, categories, taxTreatment: taxTreatments, accounts, accountTaxType: accountTaxTypes, investmentType: investmentTypes }, settings: { federal: federalSettings, state: stateSettings, planner: plannerSettings, ui: uiSettings } }, authToken).then(() => {
        if (!cancelled) { setStorageState("saved"); }
      }).catch((error: Error) => {
        console.error(error);
        if (!cancelled) { setStorageState("error"); }
      });
      return () => { cancelled = true; };
    }, 700);
    return () => { if (saveTimeout.current) window.clearTimeout(saveTimeout.current); };
  }, [investments, persistedInvestments, tickers, categories, taxTreatments, accounts, accountTaxTypes, investmentTypes, federalSettings, stateSettings, plannerSettings, uiSettings, hasRealData, authEnabled, authState.status, authToken]);

  const localStateResult = localStateTax2025(stateTaxableAfterDeductions, selectedStateCode, federalSettings.filingStatus);
  const displayedStateResult = stateResult?.state === selectedStateCode ? stateResult : localStateResult;
  const totalTax = (federalResult?.tax || 0) + displayedStateResult.tax;
  const afterTaxIncome = flows.totalIncome - totalTax;
  const monthlyIncome = flows.totalIncome / 12;
  const afterTaxMonthlyIncome = afterTaxIncome / 12;
  const portfolioYield = flows.totalInvestmentAmount > 0 ? flows.totalIncome / flows.totalInvestmentAmount : 0;
  const currentIncomeSnapshot: IncomeSnapshotValues = {
    beforeTaxAnnual: flows.totalIncome,
    beforeTaxMonthly: monthlyIncome,
    afterTaxAnnual: afterTaxIncome,
    afterTaxMonthly: afterTaxMonthlyIncome,
  };
  const incomeSnapshotDeltas: IncomeSnapshotValues | null = incomeSnapshot
    ? {
      beforeTaxAnnual: currentIncomeSnapshot.beforeTaxAnnual - incomeSnapshot.beforeTaxAnnual,
      beforeTaxMonthly: currentIncomeSnapshot.beforeTaxMonthly - incomeSnapshot.beforeTaxMonthly,
      afterTaxAnnual: currentIncomeSnapshot.afterTaxAnnual - incomeSnapshot.afterTaxAnnual,
      afterTaxMonthly: currentIncomeSnapshot.afterTaxMonthly - incomeSnapshot.afterTaxMonthly,
    }
    : null;
  const captureIncomeSnapshot = () => {
    setIncomeSnapshot({ ...currentIncomeSnapshot, capturedAt: new Date().toISOString() });
  };
  const actionMenu = (
    <div className="topbar-menu app-action-menu" ref={topbarMenuRef}>
      <button className="ai-button topbar-menu__trigger app-action-menu__trigger" type="button" onClick={() => setIsTopbarMenuOpen((current) => !current)} aria-haspopup="menu" aria-expanded={isTopbarMenuOpen} aria-label="Open actions menu" title="Menu">
        <TopbarActionIcon name="menu" />
        <AfterTaxUSMark className="app-action-menu__mark" idSuffix="menu" />
        <span className="app-action-menu__brand">AfterTax US</span>
      </button>
      {isTopbarMenuOpen && (
        <div className="topbar-menu__panel" role="menu" aria-label="Application actions">
          {authEnabled ? (
            authState.status === "signedIn" ? (
              <>
                <button className="topbar-menu__item" type="button" role="menuitem" onClick={() => { setIsTopbarMenuOpen(false); signOutCognito(); }}>
                  <TopbarActionIcon name="signOut" />
                  <span className="topbar-menu__label">
                    <span>Sign out</span>
                    <small>{authState.user.email || authState.user.sub.slice(0, 8)}</small>
                  </span>
                </button>
                <button className="topbar-menu__item" type="button" role="menuitem" onClick={() => { setIsTopbarMenuOpen(false); void copyChatGptConnectorUrl(); }} disabled={isCreatingMcpToken}>
                  <TopbarActionIcon name="copy" />
                  <span>{isCreatingMcpToken ? "Creating token..." : "Copy ChatGPT URL"}</span>
                </button>
              </>
            ) : (
              <button className="topbar-menu__item" type="button" role="menuitem" onClick={() => { setIsTopbarMenuOpen(false); void startCognitoSignIn(); }} disabled={authState.status === "loading"}>
                <TopbarActionIcon name="signIn" />
                <span>{authState.status === "loading" ? "Signing in..." : "Sign in"}</span>
              </button>
            )
          ) : null}
          <button className="topbar-menu__item" type="button" role="menuitem" onClick={() => { setIsTopbarMenuOpen(false); setIsAssistantOpen((current) => !current); }}>
            <TopbarActionIcon name="assistant" />
            <span>{isAssistantOpen ? "Close AI Assistant" : "AI Assistant"}</span>
          </button>
          <button className="topbar-menu__item" type="button" role="menuitem" onClick={() => { setIsTopbarMenuOpen(false); setIsSheetPanelOpen((current) => !current); }}>
            <TopbarActionIcon name="sheet" />
            <span>{isSheetPanelOpen ? "Close Spreadsheet" : "Spreadsheet"}</span>
          </button>
          <a className="topbar-menu__item" href={CHATGPT_URL} target="_blank" rel="noreferrer" role="menuitem" onClick={() => setIsTopbarMenuOpen(false)}>
            <TopbarActionIcon name="chat" />
            <span>ChatGPT</span>
          </a>
        </div>
      )}
    </div>
  );
  const kpiMetrics: KpiMetricConfig[] = [
    { label: "After-tax income", value: formatCurrency(afterTaxIncome), numericValue: afterTaxIncome, tone: "warning" },
    { label: "Annual income", value: formatCurrency(flows.totalIncome), secondaryValue: `${formatCurrency(monthlyIncome)} monthly`, numericValue: flows.totalIncome },
    { label: "Portfolio yield", value: formatPercent(portfolioYield), numericValue: portfolioYield, deltaKind: "percent" },
    { label: "Total investment", value: formatCurrency(flows.totalInvestmentAmount), numericValue: flows.totalInvestmentAmount, tone: "accent" },
  ];
  const portfolioSnapshot = buildPortfolioSnapshot({
    activeTab,
    focusGrid,
    filters: investmentFilters,
    sort: investmentSort,
    selectedAssetIds: selectedInvestmentIds,
    derivedRows,
    accounts,
    tickers,
    categories,
    taxTreatments,
    accountTaxTypes,
    investmentTypes,
    flows,
    metrics: {
      totalInvestmentAmount: flows.totalInvestmentAmount,
      totalIncome: flows.totalIncome,
      portfolioYield,
      afterTaxIncome,
      federalTax: federalResult?.tax || 0,
      stateTax: displayedStateResult.tax,
      totalTax,
      federalTaxable: federalTaxableAfterDeductions,
      stateTaxable: stateTaxableAfterDeductions,
      magi,
      netInvestmentIncome,
    },
  });

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
      return;
    }
    const keySet = new Set<string>();
    investments.filter((row) => row.includeIncome).forEach((row) => {
      buildInvestmentFavoriteKeys(row).forEach((key) => keySet.add(key));
    });
    if (keySet.size === 0) {
      setStorageState("error");
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
  };

  const applyFavorite = (favoriteName: string) => {
    const selectedKey = normalizeLookupKey(favoriteName);
    const favorite = uiSettings.investmentFavorites.find(
      (entry) => normalizeLookupKey(entry.name) === selectedKey
    );
    if (!favorite) {
      setStorageState("error");
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
  };

  const deleteFavorite = (favoriteName: string) => {
    const selectedKey = normalizeLookupKey(favoriteName);
    if (!selectedKey) {
      setStorageState("error");
      return;
    }
    const favorite = uiSettings.investmentFavorites.find(
      (entry) => normalizeLookupKey(entry.name) === selectedKey
    );
    if (!favorite) {
      setStorageState("error");
      return;
    }
    setUiSettings((current) => ({
      ...current,
      investmentFavorites: current.investmentFavorites.filter(
        (entry) => normalizeLookupKey(entry.name) !== selectedKey
      ),
    }));
    setStorageState("ready");
  };

  const renameFavorite = (oldFavoriteName: string, newFavoriteName: string) => {
    const oldKey = normalizeLookupKey(oldFavoriteName);
    const nextName = normalizeFavoriteName(newFavoriteName);
    const newKey = normalizeLookupKey(nextName);
    if (!oldKey || !newKey) {
      setStorageState("error");
      return;
    }
    const existing = uiSettings.investmentFavorites.find((entry) => normalizeLookupKey(entry.name) === oldKey);
    if (!existing) {
      setStorageState("error");
      return;
    }
    const conflict = uiSettings.investmentFavorites.some(
      (entry) => normalizeLookupKey(entry.name) === newKey && normalizeLookupKey(entry.name) !== oldKey
    );
    if (conflict) {
      setStorageState("error");
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
  };

  const reorderInvestments = (sourceId: number, targetId: number) => {
    setInvestments((current) => {
      const sourceIndex = current.findIndex((row) => row.id === sourceId);
      const targetIndex = current.findIndex((row) => row.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return current;
      }

      const next = [...current];
      const [movedRow] = next.splice(sourceIndex, 1);
      const insertionIndex = sourceIndex < targetIndex ? targetIndex : targetIndex;
      next.splice(insertionIndex, 0, movedRow);
      return next;
    });
    setStorageState("ready");
  };

  function updateCollection<T extends { id: number }>(setter: React.Dispatch<React.SetStateAction<T[]>>, numericFields: Array<keyof T> = [], booleanFields: Array<keyof T> = []) {
    return (id: number, field: keyof T, value: string | boolean) => {
      setter((current) => current.map((row) => row.id !== id ? row : booleanFields.includes(field) ? { ...row, [field]: Boolean(value) } : numericFields.includes(field) ? { ...row, [field]: toNumber(value) } : { ...row, [field]: value }));
    };
  }
  function addRow<T extends { id: number }>(setter: React.Dispatch<React.SetStateAction<T[]>>, row: T) { setter((current) => [...current, row]); }
  function removeRow<T extends { id: number }>(setter: React.Dispatch<React.SetStateAction<T[]>>) { return (id: number) => setter((current) => current.filter((row) => row.id !== id)); }
  function reorderCollection<T extends { id: number }>(setter: React.Dispatch<React.SetStateAction<T[]>>) {
    return (sourceId: number, targetId: number) => {
      setter((current) => {
        const sourceIndex = current.findIndex((row) => row.id === sourceId);
        const targetIndex = current.findIndex((row) => row.id === targetId);
        if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
          return current;
        }

        const next = [...current];
        const [movedRow] = next.splice(sourceIndex, 1);
        const adjustedTargetIndex = next.findIndex((row) => row.id === targetId);
        next.splice(adjustedTargetIndex < 0 ? next.length : adjustedTargetIndex, 0, movedRow);
        return next;
      });
      setStorageState("ready");
    };
  }
  function nextAssistantRowId(rows: AssistantEditableRow[]) {
    return Math.max(0, ...rows.map((row) => Number(row.id) || 0)) + 1;
  }
  function coerceAssistantFieldValue(config: AssistantTableConfig, field: string, value: unknown) {
    if (config.booleanFields.includes(field)) return normalizeBoolean(value);
    if (config.numericFields.includes(field)) return toNumber(value as string | number | boolean | null | undefined);
    return String(value ?? "");
  }
  function normalizeAssistantFieldName(field: string) {
    return normalizeLookupKey(field).replace(/[^a-z0-9]/g, "");
  }
  function assistantFieldAlias(config: AssistantTableConfig, field: string) {
    const normalized = normalizeAssistantFieldName(field);
    const direct = config.allowedFields.find((allowedField) => normalizeAssistantFieldName(allowedField) === normalized);
    if (direct) return direct;

    const commonAliases: Record<string, Record<string, string>> = {
      investments: {
        desc: "description",
        description: "description",
        accnt: "account",
        account: "account",
        accountname: "account",
        category: "category",
        totalinv: "totalInvestment",
        totalinvestment: "totalInvestment",
        totalinvestmentamount: "totalInvestment",
        yrinc: "yearlyIncome",
        yearinc: "yearlyIncome",
        yearlyincome: "yearlyIncome",
        annualincome: "yearlyIncome",
        inc: "includeIncome",
        include: "includeIncome",
        includeincome: "includeIncome",
        use: "includeIncome",
        override: "overrideProposal",
        overrideproposal: "overrideProposal",
        symbol: "symbol",
        currentsymbol: "symbol",
        ticker: "symbol",
        newsymbol: "newSymbol",
        proposedsymbol: "newSymbol",
        newpercent: "newPercent",
        newpct: "newPercent",
        new: "newPercent",
      },
      tickers: {
        ticker: "symbol",
        symbol: "symbol",
        percentreturn: "percentReturn",
        return: "percentReturn",
        pctreturn: "percentReturn",
        category: "category",
        taxtreatment: "taxTreatment",
        taxstatus: "taxTreatment",
        incomeitem: "incomeItem",
        isincomeitem: "incomeItem",
        incometicker: "incomeItem",
        income: "incomeItem",
        extradata: "extraData",
        description: "description",
        exdividend: "exDividend",
        divpayout: "divPayout",
      },
      accounts: {
        account: "account",
        accountname: "account",
        accountnames: "account",
        taxstatus: "taxStatus",
        taxtreatment: "taxStatus",
        dividendaccrued: "dividendAccrued",
        dividendacrued: "dividendAccrued",
        includeinfreecashflow: "includeInFreeCashflow",
      },
      categories: {
        category: "name",
        label: "name",
        name: "name",
      },
      taxTreatment: {
        taxtreatment: "label",
        taxstatus: "label",
        treatment: "label",
        label: "label",
        name: "label",
      },
      accountTaxType: {
        taxstatus: "taxStatus",
        taxtreatment: "taxStatus",
        status: "taxStatus",
        label: "taxStatus",
        name: "taxStatus",
      },
      investmentType: {
        investmenttype: "name",
        type: "name",
        assetclass: "name",
        category: "name",
        label: "name",
        name: "name",
      },
    };
    const alias = commonAliases[config.tableId]?.[normalized] || null;
    return alias && config.allowedFields.includes(alias) ? alias : null;
  }
  function assistantRawValues(payload: Record<string, unknown>) {
    const nested = payload.row || payload.values;
    if (nested && typeof nested === "object") return nested as Record<string, unknown>;
    const { tableId: _tableId, requiresConfirmation: _requiresConfirmation, ...flatValues } = payload;
    return flatValues;
  }
  function sanitizeAssistantValues(config: AssistantTableConfig, rawValues: unknown) {
    const source = rawValues && typeof rawValues === "object" ? rawValues as Record<string, unknown> : {};
    const values: Record<string, unknown> = {};
    const rejected: string[] = [];
    Object.entries(source).forEach(([field, value]) => {
      if (["id", "selector", "tableId", "matchField", "requiresConfirmation", "all"].includes(field)) return;
      const allowedField = assistantFieldAlias(config, field);
      if (!allowedField) {
        rejected.push(field);
        return;
      }
      values[allowedField] = coerceAssistantFieldValue(config, allowedField, value);
    });
    return { values, rejected };
  }
  function rowMatchesAssistantSelector(row: AssistantEditableRow, selector: unknown) {
    const selectorKey = normalizeAssetMatchKey(selector);
    if (!selectorKey) return false;
    if (normalizeLookupKey(String(row.id)) === selectorKey) return true;
    return Object.entries(row).some(([field, value]) => field !== "id" && valueMatchesAssetSelector(value, selectorKey));
  }
  function normalizeAssistantTableId(tableId: unknown): WorkbookTableId | null {
    const normalized = normalizeAssistantFieldName(String(tableId || ""));
    const tableAliases: Record<string, WorkbookTableId> = {
      investment: "investments",
      investments: "investments",
      holding: "investments",
      holdings: "investments",
      ticker: "tickers",
      tickers: "tickers",
      symbol: "tickers",
      symbols: "tickers",
      account: "accounts",
      accounts: "accounts",
      category: "categories",
      categories: "categories",
      taxtreatment: "taxTreatment",
      taxtreatments: "taxTreatment",
      taxstatus: "taxTreatment",
      accounttaxtype: "accountTaxType",
      accounttaxtypes: "accountTaxType",
      investmenttype: "investmentType",
      investmenttypes: "investmentType",
      assetclass: "investmentType",
      assetclasses: "investmentType",
    };
    return tableAliases[normalized] || null;
  }
  function getAssistantTableConfig(tableId: unknown): AssistantTableConfig | null {
    const id = normalizeAssistantTableId(tableId);
    if (!id) return null;
    const asEditable = <T extends { id: number }>(rows: T[]) => rows as unknown as AssistantEditableRow[];
    const wrapSetter = <T extends { id: number }>(setter: React.Dispatch<React.SetStateAction<T[]>>) =>
      (updater: (current: AssistantEditableRow[]) => AssistantEditableRow[]) => setter((current) => updater(asEditable(current)) as unknown as T[]);

    switch (id) {
      case "investments":
        return {
          tableId: id,
          label: "investments",
          tab: "investments",
          rows: asEditable(investments),
          setRows: wrapSetter(setInvestments),
          allowedFields: ["description", "account", "category", "totalInvestment", "yearlyIncome", "includeIncome", "overrideProposal", "symbol", "newSymbol"],
          numericFields: ["totalInvestment", "yearlyIncome"],
          booleanFields: ["includeIncome", "overrideProposal"],
          defaultRow: (id) => ({ id, description: "New Investment", account: accountOptions[1] || "", category: "core", totalInvestment: 0, yearlyIncome: 0, includeIncome: true, overrideProposal: false, symbol: symbolOptions[1] || "", newSymbol: symbolOptions[1] || "", newPercent: 0 }),
        };
      case "tickers":
        return {
          tableId: id,
          label: "tickers",
          tab: "tickers",
          rows: asEditable(tickers),
          setRows: wrapSetter(setTickers),
          allowedFields: ["symbol", "percentReturn", "category", "taxTreatment", "incomeItem", "extraData", "description", "exDividend", "divPayout"],
          numericFields: ["percentReturn", "extraData"],
          booleanFields: ["incomeItem"],
          defaultRow: (id) => ({ id, symbol: "", percentReturn: 0, category: categoryOptions[1] || "", taxTreatment: "income", incomeItem: false, extraData: 0, description: "", exDividend: "", divPayout: "" }),
        };
      case "accounts":
        return {
          tableId: id,
          label: "accounts",
          tab: "accounts",
          rows: asEditable(accounts),
          setRows: wrapSetter(setAccounts),
          allowedFields: ["account", "taxStatus", "dividendAccrued", "includeInFreeCashflow"],
          numericFields: [],
          booleanFields: [],
          defaultRow: (id) => ({ id, account: "", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" }),
        };
      case "categories":
        return {
          tableId: id,
          label: "categories",
          tab: "categories",
          rows: asEditable(categories),
          setRows: wrapSetter(setCategories),
          allowedFields: ["name"],
          numericFields: [],
          booleanFields: [],
          defaultRow: (id) => ({ id, name: "" }),
        };
      case "taxTreatment":
        return {
          tableId: id,
          label: "tax treatment",
          tab: "taxTreatment",
          rows: asEditable(taxTreatments),
          setRows: wrapSetter(setTaxTreatments),
          allowedFields: ["label"],
          numericFields: [],
          booleanFields: [],
          defaultRow: (id) => ({ id, label: "" }),
        };
      case "accountTaxType":
        return {
          tableId: id,
          label: "account tax type",
          tab: "accountTaxType",
          rows: asEditable(accountTaxTypes),
          setRows: wrapSetter(setAccountTaxTypes),
          allowedFields: ["taxStatus"],
          numericFields: [],
          booleanFields: [],
          defaultRow: (id) => ({ id, taxStatus: "" }),
        };
      case "investmentType":
        return {
          tableId: id,
          label: "investment type",
          tab: "investmentType",
          rows: asEditable(investmentTypes),
          setRows: wrapSetter(setInvestmentTypes),
          allowedFields: ["name"],
          numericFields: [],
          booleanFields: [],
          defaultRow: (id) => ({ id, name: "" }),
        };
      default:
        return null;
    }
  }
  function resolveAssistantRows(config: AssistantTableConfig, payload: Record<string, unknown>) {
    if (
      payload.all === true ||
      normalizeLookupKey(payload.all) === "true" ||
      normalizeLookupKey(payload.id) === "all" ||
      normalizeLookupKey(payload.selector) === "all"
    ) {
      return config.rows;
    }

    const ids = new Set<string>();
    if (payload.id !== undefined) ids.add(normalizeLookupKey(String(payload.id)));
    if (Array.isArray(payload.ids)) {
      payload.ids.forEach((id) => ids.add(normalizeLookupKey(String(id))));
    }
    const selector = payload.selector;
    return config.rows.filter((row) => ids.has(normalizeLookupKey(String(row.id))) || (selector !== undefined && rowMatchesAssistantSelector(row, selector)));
  }
  function assistantRowsPayload(payload: Record<string, unknown>) {
    const candidate = payload.rows ?? payload.values ?? payload.row;
    if (Array.isArray(candidate)) {
      return candidate.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row));
    }
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return [candidate as Record<string, unknown>];
    }
    return [];
  }
  function assistantPrimaryField(config: AssistantTableConfig) {
    const primaryByTable: Partial<Record<WorkbookTableId, string>> = {
      investments: "id",
      tickers: "symbol",
      accounts: "account",
      categories: "name",
      taxTreatment: "label",
      accountTaxType: "taxStatus",
      investmentType: "name",
    };
    return primaryByTable[config.tableId] || "id";
  }
  function assistantMatchField(config: AssistantTableConfig, payload: Record<string, unknown>) {
    if (payload.matchField !== undefined) {
      const field = assistantFieldAlias(config, String(payload.matchField));
      return field || null;
    }
    const primary = assistantPrimaryField(config);
    return primary === "id" ? null : primary;
  }
  function nextUnusedAssistantRowId(usedIds: Set<number>, preferredId?: unknown) {
    const preferred = Number(preferredId);
    if (Number.isFinite(preferred) && preferred > 0 && !usedIds.has(preferred)) {
      usedIds.add(preferred);
      return preferred;
    }

    let nextId = 1;
    while (usedIds.has(nextId)) nextId += 1;
    usedIds.add(nextId);
    return nextId;
  }
  function matchAssistantRowIndex(rows: AssistantEditableRow[], raw: Record<string, unknown>, values: Record<string, unknown>, matchField: string | null) {
    const rawId = raw.id;
    if (rawId !== undefined) {
      const idKey = normalizeLookupKey(String(rawId));
      const idIndex = rows.findIndex((row) => normalizeLookupKey(String(row.id)) === idKey);
      if (idIndex >= 0) return idIndex;
    }

    if (raw.selector !== undefined) {
      const selectorIndex = rows.findIndex((row) => rowMatchesAssistantSelector(row, raw.selector));
      if (selectorIndex >= 0) return selectorIndex;
    }

    if (matchField && values[matchField] !== undefined) {
      const matchKey = normalizeLookupKey(values[matchField]);
      if (matchKey) {
        return rows.findIndex((row) => normalizeLookupKey(row[matchField]) === matchKey);
      }
    }

    return -1;
  }
  function highlightInvestmentMatches(matches: DerivedInvestmentRow[], label: string) {
    const ids = [...new Set(matches.map((row) => row.id))];
    setSelectedInvestmentIds(ids);
    setInvestmentFilters({ account: "", category: "", asset: "" });
    setActiveTab("investments");
    return { ok: true, message: `Highlighted ${ids.length} matching investment row${ids.length === 1 ? "" : "s"}${label ? ` for ${label}` : ""}; filters were cleared so the rows are visible.` };
  }
  function executeAssistantAction(action: AssistantAction): AssistantActionResult {
    const actionType = String((action as any)?.type || "");

    if (actionType === "setCheckbox") {
      const id = Number((action as any).payload?.id);
      const checked = (action as any).payload?.checked;
      const field = ((action as any).payload?.field || "includeIncome") as "includeIncome" | "overrideProposal";
      if (!Number.isFinite(id) || typeof checked !== "boolean" || (field !== "includeIncome" && field !== "overrideProposal")) {
        return { ok: false, message: "Rejected setCheckbox: invalid id, checked value, or checkbox field." };
      }
      if (!investments.some((row) => row.id === id)) return { ok: false, message: `Rejected setCheckbox: investment ${id} was not found.` };
      setInvestments((current) => current.map((row) => row.id === id ? { ...row, [field]: checked } : row));
      return { ok: true, message: `Updated ${field} for investment ${id}.` };
    }

    if (actionType === "setAllCheckboxes") {
      const payload = (action as any).payload || {};
      const field = (payload.field || "includeIncome") as "includeIncome" | "overrideProposal";
      const checked = typeof payload.checked === "boolean"
        ? payload.checked
        : typeof payload[field] === "boolean"
          ? payload[field]
          : typeof payload.value === "boolean"
            ? payload.value
            : undefined;
      if (typeof checked !== "boolean" || (field !== "includeIncome" && field !== "overrideProposal")) {
        return { ok: false, message: "Rejected setAllCheckboxes: invalid checked value or checkbox field." };
      }
      setInvestments((current) => current.map((row) => ({ ...row, [field]: checked })));
      return { ok: true, message: `Updated ${field} for all ${investments.length} investment rows.` };
    }

    if (actionType === "selectAsset") {
      const payload = (action as any).payload || {};
      const assetId = String(payload.assetId ?? payload.id ?? payload.symbol ?? payload.selector ?? payload.description ?? payload.query ?? "");
      const exactSymbolOnly = selectionPayloadUsesExactSymbol(payload);
      const matches = derivedRows.filter((item) =>
        exactSymbolOnly ? investmentMatchesExactSymbolSelector(item, assetId) : investmentMatchesAssetSelector(item, assetId)
      );
      if (matches.length === 0) return { ok: false, message: `Rejected selectAsset: asset ${assetId || "(blank)"} was not found.` };
      return highlightInvestmentMatches(matches, assetId);
    }

    if (actionType === "selectAssets" || actionType === "highlightRows" || actionType === "selectRows") {
      const payload = (action as any).payload || {};
      const idSources = [payload.assetIds, payload.ids, payload.rowIds, payload.investmentIds];
      const requestedIds = idSources
        .flatMap((source) => Array.isArray(source) ? source : [])
        .map((id: unknown) => normalizeLookupKey(String(id)));
      const exactSymbolOnly = selectionPayloadUsesExactSymbol(payload);
      const selectorSources = [payload.symbol, payload.selector, payload.assetId, payload.description, payload.query];
      if (Array.isArray(payload.selectors)) selectorSources.push(...payload.selectors);
      const selectors = selectorSources
        .map((selector) => String(selector || "").trim())
        .filter(Boolean);
      const matches = derivedRows.filter((item) =>
        selectors.some((selector) =>
          exactSymbolOnly
            ? investmentMatchesExactSymbolSelector(item, selector)
            : investmentMatchesAssetSelector(item, selector)
        ) ||
        requestedIds.includes(normalizeLookupKey(String(item.id)))
      );
      if (matches.length === 0) return { ok: false, message: `Rejected ${actionType}: no matching investments were found.` };
      return highlightInvestmentMatches(matches, selectors[0] || `${requestedIds.length} requested id${requestedIds.length === 1 ? "" : "s"}`);
    }

    if (actionType === "selectAccount") {
      const accountId = String((action as any).payload?.accountId || "");
      const account = accounts.find((row) => normalizeLookupKey(String(row.id)) === normalizeLookupKey(accountId) || normalizeLookupKey(row.account) === normalizeLookupKey(accountId));
      if (!account) return { ok: false, message: `Rejected selectAccount: account ${accountId || "(blank)"} was not found.` };
      setInvestmentFilters((current) => ({ ...current, account: account.account }));
      setActiveTab("investments");
      return { ok: true, message: `Filtered investments to account ${account.account}.` };
    }

    if (actionType === "setFilter") {
      const rawFilterName = String((action as any).payload?.filterName || "");
      const filterName = rawFilterName as keyof InvestmentFilters;
      const value = String((action as any).payload?.value || "");
      const checkboxFilterKey = normalizeLookupKey(rawFilterName).replace(/\s+/g, "");
      if (["inc", "include", "includeincome", "inccheckbox"].includes(checkboxFilterKey)) {
        const valueKey = normalizeLookupKey(value);
        const checked = ["true", "1", "yes", "on", "select", "selected", "checked", "check"].includes(valueKey);
        setInvestments((current) => current.map((row) => ({ ...row, includeIncome: checked })));
        return { ok: true, message: `Interpreted Inc as checkboxes and ${checked ? "selected" : "cleared"} all Inc rows.` };
      }
      if (!["account", "category", "asset"].includes(filterName)) return { ok: false, message: `Rejected setFilter: ${filterName || "(blank)"} is not an allowed filter.` };
      if (filterName === "account" && value && !accounts.some((row) => normalizeLookupKey(row.account) === normalizeLookupKey(value))) return { ok: false, message: `Rejected setFilter: account ${value} was not found.` };
      if (filterName === "category" && value && !categories.some((row) => normalizeLookupKey(row.name) === normalizeLookupKey(value)) && !derivedRows.some((row) => normalizeLookupKey(row.category) === normalizeLookupKey(value))) return { ok: false, message: `Rejected setFilter: category ${value} was not found.` };
      if (filterName === "asset" && value && !derivedRows.some((row) => normalizeLookupKey(String(row.id)) === normalizeLookupKey(value) || normalizeLookupKey(row.symbol) === normalizeLookupKey(value) || normalizeLookupKey(row.effectiveSymbol) === normalizeLookupKey(value))) return { ok: false, message: `Rejected setFilter: asset ${value} was not found.` };
      setInvestmentFilters((current) => ({ ...current, [filterName]: value }));
      setActiveTab("investments");
      return { ok: true, message: `Set ${filterName} filter to ${value || "(blank)"}.` };
    }

    if (actionType === "clearFilters") {
      setInvestmentFilters({ account: "", category: "", asset: "" });
      setInvestmentSort({ tableId: "investments", column: "", direction: "asc" });
      setSelectedInvestmentIds([]);
      return { ok: true, message: "Cleared investment filters and sorting." };
    }

    if (actionType === "sortTable") {
      const tableId = (action as any).payload?.tableId;
      const column = (action as any).payload?.column as InvestmentSortColumn;
      const direction = (action as any).payload?.direction;
      const allowedColumns: InvestmentSortColumn[] = ["description", "account", "category", "totalInvestment", "yearlyIncome", "symbol", "includedTotal", "filteredIncome"];
      if (tableId !== "investments" || !allowedColumns.includes(column) || (direction !== "asc" && direction !== "desc")) {
        return { ok: false, message: "Rejected sortTable: only investments table with approved columns and asc/desc direction is allowed." };
      }
      setInvestmentSort({ tableId, column, direction });
      setActiveTab("investments");
      return { ok: true, message: `Sorted investments by ${column} ${direction}.` };
    }

    if (actionType === "setView") {
      const viewName = normalizeLookupKey((action as any).payload?.viewName);
      const navItem = navItems.find((item) => normalizeLookupKey(item.key) === viewName || normalizeLookupKey(item.label) === viewName);
      if (viewName === "focus_grid" || viewName === "focusgrid") {
        setFocusGrid(true);
        setActiveTab("investments");
        return { ok: true, message: "Enabled Focus Grid view." };
      }
      if (viewName === "analytics" || viewName === "show_analytics") {
        setFocusGrid(false);
        return { ok: true, message: "Showing analytics." };
      }
      if (!navItem) return { ok: false, message: `Rejected setView: ${viewName || "(blank)"} is not a known app view.` };
      setActiveTab(navItem.key);
      return { ok: true, message: `Switched to ${navItem.label}.` };
    }

    if (actionType === "addRow") {
      const payload = ((action as any).payload || {}) as Record<string, unknown>;
      const config = getAssistantTableConfig(payload.tableId);
      if (!config) return { ok: false, message: `Rejected addRow: ${String(payload.tableId || "(blank)")} is not an editable table.` };
      const rawValues = assistantRawValues(payload);
      const { values, rejected } = sanitizeAssistantValues(config, rawValues);
      if (rejected.length) return { ok: false, message: `Rejected addRow: unsupported field(s) ${rejected.join(", ")} for ${config.tableId}.` };
      if (Object.keys(values).length === 0) return { ok: false, message: "Rejected addRow: no valid row fields were supplied." };
      const id = nextAssistantRowId(config.rows);
      config.setRows((current) => [...current, { ...config.defaultRow(id), ...values, id }]);
      if (config.tableId === "investments") {
        setInvestmentFilters({ account: "", category: "", asset: "" });
        setSelectedInvestmentIds([id]);
      }
      setActiveTab(config.tab);
      return { ok: true, message: `Added row ${id} to ${config.label}.` };
    }

    if (actionType === "updateRow") {
      const payload = ((action as any).payload || {}) as Record<string, unknown>;
      const config = getAssistantTableConfig(payload.tableId);
      if (!config) return { ok: false, message: `Rejected updateRow: ${String(payload.tableId || "(blank)")} is not an editable table.` };
      const { values, rejected } = sanitizeAssistantValues(config, payload.values);
      if (rejected.length) return { ok: false, message: `Rejected updateRow: unsupported field(s) ${rejected.join(", ")} for ${config.tableId}.` };
      if (Object.keys(values).length === 0) return { ok: false, message: "Rejected updateRow: no valid fields were supplied." };
      const matches = resolveAssistantRows(config, payload);
      if (matches.length === 0) return { ok: false, message: "Rejected updateRow: no matching rows were found." };
      const matchIds = new Set(matches.map((row) => row.id));
      config.setRows((current) => current.map((row) => matchIds.has(row.id) ? { ...row, ...values } : row));
      setActiveTab(config.tab);
      return { ok: true, message: `Updated ${matches.length} row${matches.length === 1 ? "" : "s"} in ${config.label}.` };
    }

    if (actionType === "upsertRows") {
      const payload = ((action as any).payload || {}) as Record<string, unknown>;
      const config = getAssistantTableConfig(payload.tableId);
      if (!config) return { ok: false, message: `Rejected upsertRows: ${String(payload.tableId || "(blank)")} is not an editable table.` };
      const rowInputs = assistantRowsPayload(payload);
      if (rowInputs.length === 0) return { ok: false, message: "Rejected upsertRows: no rows were supplied." };
      const matchField = assistantMatchField(config, payload);
      if (payload.matchField !== undefined && !matchField) return { ok: false, message: `Rejected upsertRows: ${String(payload.matchField)} is not a valid match field for ${config.tableId}.` };

      const sanitizedRows = rowInputs.map((row) => ({ raw: row, ...sanitizeAssistantValues(config, row) }));
      const rejected = sanitizedRows.flatMap((row) => row.rejected);
      if (rejected.length) return { ok: false, message: `Rejected upsertRows: unsupported field(s) ${[...new Set(rejected)].join(", ")} for ${config.tableId}.` };
      if (sanitizedRows.some((row) => Object.keys(row.values).length === 0)) return { ok: false, message: "Rejected upsertRows: each row must include at least one valid field." };

      let updatedCount = 0;
      let addedCount = 0;
      const nextRows = [...config.rows];
      const usedIds = new Set(nextRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0));
      sanitizedRows.forEach(({ raw, values }) => {
        const matchIndex = matchAssistantRowIndex(nextRows, raw, values, matchField);
        if (matchIndex >= 0) {
          nextRows[matchIndex] = { ...nextRows[matchIndex], ...values };
          updatedCount += 1;
          return;
        }

        const id = nextUnusedAssistantRowId(usedIds, raw.id);
        nextRows.push({ ...config.defaultRow(id), ...values, id });
        addedCount += 1;
      });
      config.setRows(() => nextRows);
      setActiveTab(config.tab);
      return { ok: true, message: `Upserted ${rowInputs.length} row${rowInputs.length === 1 ? "" : "s"} in ${config.label}: ${updatedCount} updated, ${addedCount} added.` };
    }

    if (actionType === "replaceRows") {
      const payload = ((action as any).payload || {}) as Record<string, unknown>;
      const config = getAssistantTableConfig(payload.tableId);
      if (!config) return { ok: false, message: `Rejected replaceRows: ${String(payload.tableId || "(blank)")} is not an editable table.` };
      const rowInputs = assistantRowsPayload(payload);
      if (rowInputs.length === 0) return { ok: false, message: "Rejected replaceRows: no replacement rows were supplied." };

      const sanitizedRows = rowInputs.map((row) => ({ raw: row, ...sanitizeAssistantValues(config, row) }));
      const rejected = sanitizedRows.flatMap((row) => row.rejected);
      if (rejected.length) return { ok: false, message: `Rejected replaceRows: unsupported field(s) ${[...new Set(rejected)].join(", ")} for ${config.tableId}.` };
      if (sanitizedRows.some((row) => Object.keys(row.values).length === 0)) return { ok: false, message: "Rejected replaceRows: each replacement row must include at least one valid field." };

      const usedIds = new Set<number>();
      const replacementRows = sanitizedRows.map(({ raw, values }) => {
        const id = nextUnusedAssistantRowId(usedIds, raw.id);
        return { ...config.defaultRow(id), ...values, id };
      });
      config.setRows(() => replacementRows);
      setActiveTab(config.tab);
      return { ok: true, message: `Replaced ${config.label} with ${replacementRows.length} row${replacementRows.length === 1 ? "" : "s"}.` };
    }

    if (actionType === "deleteRows") {
      const payload = ((action as any).payload || {}) as Record<string, unknown>;
      const config = getAssistantTableConfig(payload.tableId);
      if (!config) return { ok: false, message: `Rejected deleteRows: ${String(payload.tableId || "(blank)")} is not an editable table.` };
      const matches = resolveAssistantRows(config, payload);
      if (matches.length === 0) return { ok: false, message: "Rejected deleteRows: no matching rows were found." };
      const matchIds = new Set(matches.map((row) => row.id));
      config.setRows((current) => current.filter((row) => !matchIds.has(row.id)));
      if (config.tableId === "investments") {
        setSelectedInvestmentIds((current) => current.filter((id) => !matchIds.has(id)));
      }
      setActiveTab(config.tab);
      return { ok: true, message: `Deleted ${matches.length} row${matches.length === 1 ? "" : "s"} from ${config.label}.` };
    }

    return { ok: false, message: `Rejected action: ${actionType || "(missing)"} is not allowed.` };
  }
  const splashMessage =
    authEnabled && authState.status === "loading"
      ? "Opening your private AfterTax US workspace..."
      : !requiresSignIn && storageState === "loading"
        ? "Loading investments and tax mappings..."
        : "";

  if (splashMessage) {
    return <AppSplash message={splashMessage} />;
  }

  return (
    <div className="app-shell">
      <header className="app-top-nav" aria-label="Application menu">
        <div className="app-top-nav__inner">
          {actionMenu}
          <CompactKpiHeader
            metrics={kpiMetrics}
          />
        </div>
      </header>
      <div className={`workspace-shell ${focusGrid ? "workspace-shell--focus-grid" : !showThermometerRail ? "workspace-shell--tax-collapsed" : ""}`}>
        <aside className="sidebar">
          <nav className="sidebar__nav">{navItems.map((item) => <button key={item.key} className={`nav-item ${activeTab === item.key ? "nav-item--active" : ""}`} type="button" onClick={() => setActiveTab(item.key)}><strong>{item.label}</strong><span>{item.meta}</span></button>)}</nav>
        </aside>
        <main className="content-panel">
        <div className="content-topbar">
          <div>
            <p className="eyebrow">Live Model</p>
            <h2>{navItems.find((item) => item.key === activeTab)?.label}</h2>
          </div>
          <div className="topbar-stack">
            {authEnabled ? (
              authState.status === "signedIn" ? (
                mcpTokenMessage ? <div className="topbar-chip">{mcpTokenMessage}</div> : null
              ) : (
                <div className="topbar-chip">{authState.status === "loading" ? "Auth: loading" : "Signed out"}</div>
              )
            ) : (
              <div className="topbar-chip">Auth: legacy</div>
            )}
            <IncomeSnapshotControl
              snapshot={incomeSnapshot}
              deltas={incomeSnapshotDeltas}
              onCapture={captureIncomeSnapshot}
              className="income-snapshot--inline"
            />
          </div>
        </div>
        {isAssistantOpen && (
          <AssistantPanel
            portfolioSnapshot={portfolioSnapshot}
            authToken={authToken}
            onExecuteAction={executeAssistantAction}
            onClose={() => setIsAssistantOpen(false)}
          />
        )}
        {isSheetPanelOpen && (
          <section className="ai-panel" aria-label="Google spreadsheet panel">
            <div className="ai-panel__header">
              <div>
                <p className="eyebrow">Workbook Source</p>
                <h3>Google Spreadsheet</h3>
              </div>
              <div className="ai-panel__actions">
                <a className="ghost-button ghost-button--compact" href={WORKBOOK_SHEET_URL} target="_blank" rel="noreferrer">Open Sheet</a>
                <button className="ghost-button ghost-button--compact" type="button" onClick={() => setIsSheetPanelOpen(false)}>Close</button>
              </div>
            </div>
            <iframe
              className="ai-panel__frame"
              src={WORKBOOK_SHEET_URL}
              title="Google Spreadsheet"
              allow="clipboard-read; clipboard-write; microphone; camera"
            />
          </section>
        )}

        {requiresSignIn ? (
          <Section title="Sign In Required" subtitle="Each login gets its own private workbook storage scope.">
            <div className="auth-required-panel">
              <div>
                <p className="eyebrow">Private Portfolio Workspace</p>
                <h3>Sign in or create an account</h3>
                <p>Your holdings, reference tabs, saved row selections, and assistant context are scoped to your account after login.</p>
                {authState.error && <div className="status-card status-card--error">{authState.error}</div>}
              </div>
              <button className="primary-button" type="button" onClick={() => void startCognitoSignIn()} disabled={authState.status === "loading"}>
                {authState.status === "loading" ? "Completing sign in..." : "Sign In"}
              </button>
            </div>
          </Section>
        ) : (
          <>
        {activeTab === "investments" && storageState === "loading" && (
          <Section title="Investments" subtitle="Loading workbook data from storage...">
            <div className="status-card status-card--note">Loading account and tax-status mappings...</div>
          </Section>
        )}
        {activeTab === "investments" && storageState !== "loading" && (
          <InvestmentsTable
            rows={investments}
            accountOptions={accountOptions}
            symbolOptions={symbolOptions}
            accountTaxStatusByName={accountTaxStatusByName}
            derivedRows={derivedRows}
            favorites={uiSettings.investmentFavorites}
            filters={investmentFilters}
            sort={investmentSort}
            selectedAssetIds={selectedInvestmentIds}
            selectedStateCode={selectedStateCode}
            isWhatIfActive={isWhatIfActive}
            onStateChange={(stateCode) => setStateSettings((current) => ({ ...current, stateCode: normalizeStateCode(stateCode) }))}
            onToggleWhatIf={() => setIsWhatIfActive((current) => !current)}
            onSaveFavorite={saveFavorite}
            onApplyFavorite={applyFavorite}
            onDeleteFavorite={deleteFavorite}
            onRenameFavorite={renameFavorite}
            onChange={updateInvestmentRow}
            onAdd={() => addRow(setInvestments, { id: Date.now(), description: "New Investment", account: accountOptions[1] || "", category: "core", totalInvestment: 0, yearlyIncome: 0, includeIncome: true, overrideProposal: false, symbol: symbolOptions[1] || "", newSymbol: symbolOptions[1] || "", newPercent: overridePercentForSymbol(symbolOptions[1] || "") })}
            onReorder={reorderInvestments}
            onRemoveIncluded={() => {
              const removedIds = new Set(investments.filter((row) => row.includeIncome).map((row) => row.id));
              setInvestments((current) => current.filter((row) => !row.includeIncome));
              setSelectedInvestmentIds((current) => current.filter((id) => !removedIds.has(id)));
            }}
            onClearViewState={() => {
              setInvestmentFilters({ account: "", category: "", asset: "" });
              setInvestmentSort({ tableId: "investments", column: "", direction: "asc" });
              setSelectedInvestmentIds([]);
            }}
            onSelectAllInc={() => setInvestments((current) => current.map((row) => ({ ...row, includeIncome: true })))}
            onClearAllInc={() => setInvestments((current) => current.map((row) => ({ ...row, includeIncome: false })))}
          />
        )}
        {activeTab === "tickers" && <LookupTable title="Tickers" subtitle="Workbook symbol table. Percent return, category, tax treatment, income-item flag, and extra tax data all flow into the investment sheet lookups." rows={tickers} columns={[{ key: "symbol", label: "Symbol" }, { key: "percentReturn", label: "% Return", type: "percent" }, { key: "incomeItem", label: "Income item", type: "checkbox" }, { key: "category", label: "Category", type: "select", options: categoryOptions }, { key: "taxTreatment", label: "Tax Treatment", type: "select", options: taxTreatmentOptions }, { key: "extraData", label: "Extra Data", type: "number" }, { key: "description", label: "Description" }, { key: "exDividend", label: "Ex-dividend" }, { key: "divPayout", label: "Div payout" }]} onChange={updateCollection(setTickers, ["percentReturn", "extraData"], ["incomeItem"])} onAdd={() => addRow(setTickers, { id: Date.now(), symbol: "", percentReturn: 0, category: categoryOptions[1] || "", taxTreatment: "income", incomeItem: false, extraData: 0, description: "", exDividend: "", divPayout: "" })} onRemove={removeRow(setTickers)} onReorder={reorderCollection(setTickers)} showMoveHeaderLabel={false} />}
        {activeTab === "categories" && <LookupTable title="Categories" subtitle="Reference list used by the Tickers tab category dropdown and downstream investment rollups." rows={categories} columns={[{ key: "name", label: "Category" }]} onChange={updateCollection(setCategories)} onAdd={() => addRow(setCategories, { id: Date.now(), name: "" })} onRemove={removeRow(setCategories)} onReorder={reorderCollection(setCategories)} showMoveHeaderLabel={false} />}
        {activeTab === "accounts" && <LookupTable title="Accounts" subtitle="Workbook account lookup. Tax status and cashflow inclusion come directly from this sheet." rows={accounts} columns={[{ key: "account", label: "Account name" }, { key: "taxStatus", label: "Tax status", type: "select", options: accountTaxStatusOptions }, { key: "dividendAccrued", label: "Dividend accrued" }, { key: "includeInFreeCashflow", label: "Exclude from aftertax income", type: "invertedYesNoCheckbox" }]} onChange={updateCollection(setAccounts)} onAdd={() => addRow(setAccounts, { id: Date.now(), account: "", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" })} onRemove={removeRow(setAccounts)} onReorder={reorderCollection(setAccounts)} showMoveHeaderLabel={false} />}
        {activeTab === "taxTreatment" && <LookupTable title="Tax Treatment" subtitle="Sheet treatment labels used by ticker rows and row-level tax adjustment logic." rows={taxTreatments} columns={[{ key: "label", label: "Label" }]} onChange={updateCollection(setTaxTreatments)} onAdd={() => addRow(setTaxTreatments, { id: Date.now(), label: "" })} onRemove={removeRow(setTaxTreatments)} onReorder={reorderCollection(setTaxTreatments)} showMoveHeaderLabel={false} />}
        {activeTab === "accountTaxType" && <LookupTable title="Account Tax Type" subtitle="Reference list for allowed account tax statuses." rows={accountTaxTypes} columns={[{ key: "taxStatus", label: "Tax status" }]} onChange={updateCollection(setAccountTaxTypes)} onAdd={() => addRow(setAccountTaxTypes, { id: Date.now(), taxStatus: "" })} onRemove={removeRow(setAccountTaxTypes)} onReorder={reorderCollection(setAccountTaxTypes)} showMoveHeaderLabel={false} />}
        {activeTab === "investmentType" && <LookupTable title="Investment Type" subtitle="Reference list for the asset classes used by the workbook rollups." rows={investmentTypes} columns={[{ key: "name", label: "Investment type" }]} onChange={updateCollection(setInvestmentTypes)} onAdd={() => addRow(setInvestmentTypes, { id: Date.now(), name: "" })} onRemove={removeRow(setInvestmentTypes)} onReorder={reorderCollection(setInvestmentTypes)} showMoveHeaderLabel={false} />}

        {activeTab === "federal" && <Section title="Federal Tax" subtitle="Continuously recalculated from the workbook-style investment rows, the same row-level tax-adjustment logic used in the sheet, and the live Lambda backend."><div className="form-grid"><label><span>Filing status</span><select value={federalSettings.filingStatus} onChange={(event) => setFederalSettings((current) => ({ ...current, filingStatus: normalizeFilingStatus(event.target.value) }))}><option value="mfj">Married filing jointly</option><option value="single">Single</option></select></label><label><span>Extra ordinary income</span><input type="number" value={federalSettings.extraOrdinaryIncome} onChange={(event) => setFederalSettings((current) => ({ ...current, extraOrdinaryIncome: toNumber(event.target.value) }))} /></label><label><span>Extra preferred income</span><input type="number" value={federalSettings.extraPreferredIncome} onChange={(event) => setFederalSettings((current) => ({ ...current, extraPreferredIncome: toNumber(event.target.value) }))} /></label><label><span>Mortgage interest</span><input type="number" value={federalSettings.mortgageInterest} onChange={(event) => setFederalSettings((current) => ({ ...current, mortgageInterest: toNumber(event.target.value) }))} /></label><label><span>Property tax</span><input type="number" value={federalSettings.propertyTax} onChange={(event) => setFederalSettings((current) => ({ ...current, propertyTax: toNumber(event.target.value) }))} /></label><label><span>State income tax</span><input type="number" value={federalSettings.stateIncomeTax} onChange={(event) => setFederalSettings((current) => ({ ...current, stateIncomeTax: toNumber(event.target.value) }))} /></label><label><span>Standard deduction</span><input type="number" value={federalSettings.standardDeduction} onChange={(event) => setFederalSettings((current) => ({ ...current, standardDeduction: toNumber(event.target.value) }))} /></label><label><span>SALT cap</span><input type="number" value={federalSettings.saltCap} onChange={(event) => setFederalSettings((current) => ({ ...current, saltCap: toNumber(event.target.value) }))} /></label></div><div className="metric-grid"><MetricCard label="Ordinary from sheet logic" value={formatCurrency(flows.federalOrdinary)} /><MetricCard label="Preferred from sheet logic" value={formatCurrency(flows.federalPreferred)} /><MetricCard label="Non-invest income" value={formatCurrency(flows.nonInvestmentIncome)} /><MetricCard label="Muni interest" value={formatCurrency(flows.muniIncome)} /><MetricCard label="Ordinary taxable" value={formatCurrency(ordinaryTaxable)} tone="accent" /><MetricCard label="Preferred taxable" value={formatCurrency(prefTaxable)} /><MetricCard label="MAGI" value={formatCurrency(magi)} /><MetricCard label="Net investment income" value={formatCurrency(netInvestmentIncome)} /><MetricCard label="NIIT base" value={formatCurrency(niitBase)} /></div>{federalError && <div className="status-card status-card--error">{federalError}</div>}{federalResult && <div className="api-grid"><MetricCard label="Federal total" value={formatCurrencyDetailed(federalResult.tax)} tone="accent" /><MetricCard label="Ordinary tax" value={formatCurrencyDetailed(federalResult.ordinaryTax || 0)} /><MetricCard label="Preferred tax" value={formatCurrencyDetailed(federalResult.prefTax || 0)} /><MetricCard label="NIIT" value={formatCurrencyDetailed(federalResult.niit || 0)} /></div>}</Section>}
        {activeTab === "state" && <Section title="State Tax" subtitle="State worksheet fed from the investment-sheet state bucket column and the live backend."><div className="status-card status-card--note">State calculations use 2025 resident state income-tax brackets. Local taxes, state credits, and state-specific income modifications are not modeled.</div><div className="form-grid form-grid--compact-wide"><label><span>State</span><StateFlagSelect value={selectedStateCode} onChange={(stateCode) => setStateSettings((current) => ({ ...current, stateCode: normalizeStateCode(stateCode) }))} /></label><label><span>Extra {selectedStateCode} income</span><input type="number" value={stateSettings.extraStateIncome} onChange={(event) => setStateSettings((current) => ({ ...current, extraStateIncome: toNumber(event.target.value) }))} /></label><label><span>Mortgage interest</span><input type="number" value={stateSettings.mortgageInterest} onChange={(event) => setStateSettings((current) => ({ ...current, mortgageInterest: toNumber(event.target.value) }))} /></label><label><span>Property tax</span><input type="number" value={stateSettings.propertyTax} onChange={(event) => setStateSettings((current) => ({ ...current, propertyTax: toNumber(event.target.value) }))} /></label><label><span>State income tax</span><input type="number" value={stateSettings.stateIncomeTax} onChange={(event) => setStateSettings((current) => ({ ...current, stateIncomeTax: toNumber(event.target.value) }))} /></label><label><span>{selectedStateCode} standard deduction</span><input type="number" value={stateSettings.standardDeduction} onChange={(event) => setStateSettings((current) => ({ ...current, standardDeduction: toNumber(event.target.value) }))} /></label></div><div className="metric-grid"><MetricCard label="State-taxable from sheet logic" value={formatCurrency(flows.stateTaxable)} /><MetricCard label={`${selectedStateCode} gross`} value={formatCurrency(stateGross)} /><MetricCard label={`${selectedStateCode} deduction used`} value={formatCurrency(stateDeduction)} /><MetricCard label={`${selectedStateCode} taxable after deductions`} value={formatCurrency(stateTaxableAfterDeductions)} tone="accent" /></div>{stateError && <div className="status-card status-card--error">{stateError}</div>}{displayedStateResult.note && <div className="status-card status-card--note">{displayedStateResult.note}</div>}<div className="api-grid"><MetricCard label={`${selectedStateCode} tax`} value={formatCurrencyDetailed(displayedStateResult.tax)} tone="accent" /></div></Section>}
                {activeTab === "calculator" && (
          <Section title="Tax Calculator" subtitle="Standalone inputs that mirror the spreadsheet layout and call the shared federal + state Lambdas.">
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
                    <span>State</span>
                    <StateFlagSelect value={taxCalcInputs.stateCode} onChange={(stateCode) => setTaxCalcInputs((current) => ({ ...current, stateCode: normalizeStateCode(stateCode) }))} />
                    <small className="field-note">Used for the standalone state calculation.</small>
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
                    <span>State standard deduction</span>
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
                    <small className="field-note">Federal and state itemized deduction input.</small>
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
                <h3>{normalizeStateCode(taxCalcInputs.stateCode)} derived</h3>
                <div className="derived-row"><span>State itemized deduction</span><strong>{formatCurrency(caItemizedDeduction)}</strong></div>
                <div className="derived-row"><span>State deduction used</span><strong>{formatCurrency(caDeductionUsed)}</strong></div>
                <div className="derived-row"><span>State taxable income</span><strong>{formatCurrency(caTaxableIncome)}</strong></div>
                <div className="derived-row"><span>State tax</span><strong>{formatCurrencyDetailed(displayedTaxCalcStateResult.tax)}</strong></div>
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
                <div className="derived-row"><span>State formula used</span><strong>STATE_TAX_2025</strong></div>
                <div className="derived-row"><span>Notes</span><strong>Combined federal route currently supports `mfj`.</strong></div>
              </div>
            </div>
            {taxCalcError && <div className="status-card status-card--error">{taxCalcError}</div>}
            {taxCalcStateError && <div className="status-card status-card--error">{taxCalcStateError}</div>}
            <div className="metric-grid calculator-results__grid">
              <MetricCard label="Federal tax (calc)" value={formatCurrencyDetailed(taxCalcResult?.tax || 0)} tone="accent" />
              <MetricCard label="State tax (calc)" value={formatCurrencyDetailed(displayedTaxCalcStateResult.tax)} />
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
              <MetricCard label="State taxable" value={formatCurrency(caTaxableIncome)} />
            </div>
          </Section>
        )}
          </>
        )}
      </main>
      {!focusGrid && (
        <aside className={`thermometer-rail ${showThermometerRail ? "" : "thermometer-rail--collapsed"}`} aria-label="Tax panel">
          {showThermometerRail ? (
            <>
              <div className="tax-panel-control">
                <button className="ghost-button ghost-button--compact icon-button" type="button" onClick={() => setShowThermometerRail(false)} aria-label="Hide tax panel" title="Hide tax panel">
                  <VisibilityToggleIcon variant="hide" />
                </button>
              </div>
              <TaxThermometerPanel
                federalTaxable={federalTaxableAfterDeductions}
                stateTaxable={stateTaxableAfterDeductions}
                federalTax={federalResult?.tax || 0}
                stateTax={displayedStateResult.tax}
                filingStatus={federalSettings.filingStatus}
                stateCode={selectedStateCode}
                stateName={selectedStateName}
              />
            </>
          ) : (
            <button className="tax-panel-show-tab" type="button" onClick={() => setShowThermometerRail(true)} aria-label="Show tax panel" title="Show tax panel">
              <VisibilityToggleIcon variant="show" />
            </button>
          )}
        </aside>
      )}
      </div>
    </div>
  );
}
