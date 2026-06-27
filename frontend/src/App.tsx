import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import { createPortal } from "react-dom";
import "./App.css";

type TabKey =
  | "investments"
  | "federal"
  | "state"
  | "tickers"
  | "categories"
  | "taxTreatment"
  | "accounts"
  | "accountTaxType"
  | "accountType";

type FilingStatus = "single" | "mfj" | "mfs" | "hoh";
type TaxResult = { calc: string; tax: number; taxableIncome?: number; filingStatus?: FilingStatus; ordinaryTax?: number; prefTax?: number; niit?: number; state?: string; stateName?: string; note?: string };
type ApiError = { error: string };
type SaveState = "loading" | "ready" | "saving" | "saved" | "error";
type ThermometerMarker = { amount: number; label: string; detail: string; tone?: string };
type ThermometerValue = { amount: number; label: string; value: string; tone: string; content?: React.ReactNode };
type ThermometerStat = { label: string; value: string; tone?: string };
type ThermometerRateBand = { start: number; end: number; label: string; index: number; total: number; colorIndex: number; colorTotal: number };

type InvestmentRow = {
  id: number;
  spreadsheetRowNumber?: number;
  description: string;
  account: string;
  category: string;
  totalInvestment: number;
  yearlyIncome: number;
  includeIncome: boolean;
  select?: boolean;
  overrideProposal: boolean;
  symbol: string;
  newSymbol: string;
  newPercent: number;
};

type AssetTaxTone = "fully-taxable" | "tax-free" | "federal-taxable-state-free" | "federal-free-state-taxable";

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
  currentAssetTaxTone: AssetTaxTone;
  proposedAssetTaxTone: AssetTaxTone;
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
type AccountRow = { id: number; account: string; accountType: string; taxStatus: string; dividendAccrued: string; includeInFreeCashflow: string };
type AccountTaxTypeRow = { id: number; taxStatus: string };
type AccountTypeRow = { id: number; name: string; taxStatus: string };

type TaxWhatIfItem = { id: number; amount: number; incomeType: string };
type FederalSettings = { filingStatus: FilingStatus; extraOrdinaryIncome: number; extraPreferredIncome: number; extraOrdinaryItems: TaxWhatIfItem[]; extraPreferredItems: TaxWhatIfItem[]; mortgageInterest: number; propertyTax: number; standardDeduction: number; saltCap: number };
type StateSettings = { stateCode: string; extraStateIncome: number; mortgageInterest: number; propertyTax: number; standardDeduction: number };
type PlannerSettings = { federalWithholding: number; stateWithholding: number };
type InvestmentFavorite = { name: string; investmentKeys: string[]; createdAt: string };
type ModelUiSnapshot = { investmentFavorites: InvestmentFavorite[] };
type ModelDataSnapshot = {
  investments: InvestmentRow[];
  tickers: TickerRow[];
  categories: CategoryRow[];
  taxTreatments: TaxTreatmentRow[];
  accounts: AccountRow[];
  accountTaxTypes: AccountTaxTypeRow[];
  accountTypes: AccountTypeRow[];
  federalSettings: FederalSettings;
  stateSettings: StateSettings;
  plannerSettings: PlannerSettings;
  uiSettings: ModelUiSnapshot;
  isWhatIfActive: boolean;
};
type ModelVersion = { id: string; name: string; createdAt: string; updatedAt: string; snapshot: ModelDataSnapshot };
type IncomePrimaryPeriod = "monthly" | "annual";
type UiSettings = ModelUiSnapshot & { modelVersions: ModelVersion[]; incomePrimaryPeriod: IncomePrimaryPeriod };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; actions?: AssistantAction[]; createdAt: string; error?: boolean };
type AuthTokens = { idToken: string; accessToken: string; refreshToken?: string; expiresAt: number };
type AuthUser = { sub: string; email?: string; name?: string };
type AuthState =
  | { status: "loading"; user: null; tokens: null; error?: string }
  | { status: "signedOut"; user: null; tokens: null; error?: string }
  | { status: "signedIn"; user: AuthUser; tokens: AuthTokens; error?: string };
type WorkbookTableId = "investments" | "tickers" | "accounts" | "categories" | "taxTreatment" | "accountTaxType" | "accountType";
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
    select: boolean;
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
  accounts: Array<{ id: number; account: string; accountType: string; taxStatus: string; dividendAccrued: string; includeInFreeCashflow: string }>;
  referenceTables: {
    tickers: TickerRow[];
    categories: CategoryRow[];
    taxTreatment: TaxTreatmentRow[];
    accountTaxType: AccountTaxTypeRow[];
    accountType: AccountTypeRow[];
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
  | { type: "setCheckbox"; payload: { id: number; checked: boolean; field?: "select" | "includeIncome" | "overrideProposal" }; requiresConfirmation?: boolean }
  | { type: "setAllCheckboxes"; payload: { checked: boolean; field?: "select" | "includeIncome" | "overrideProposal" }; requiresConfirmation?: boolean }
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
type FederalNumericField = Exclude<keyof FederalSettings, "filingStatus" | "extraOrdinaryItems" | "extraPreferredItems">;

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
    accountType: AccountTypeRow[];
  }>;
  settings?: Partial<{ federal: FederalSettings; state: StateSettings; planner: PlannerSettings; ui: UiSettings }>;
  updatedAt?: string | null;
};

type PortfolioHistorySnapshot = ModelDataSnapshot;

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
const WORKBOOK_HISTORY_LIMIT = 100;
const MODEL_VERSION_LIMIT = 10;
const ASSISTANT_PROMPT_HISTORY_KEY = "portfolio-assistant-prompt-history";
const ASSISTANT_PROMPT_HISTORY_LIMIT = 50;
const AUTH_STORAGE_KEY = "portfolio-auth-session";
const AUTH_PKCE_STORAGE_KEY = "portfolio-auth-pkce";
const INVESTMENT_COLUMN_WIDTH_STORAGE_KEY = "aftertaxus-investment-column-widths";
const INVESTMENT_COLUMN_DEFS = [
  { id: "move", label: "", ariaLabel: "Row actions", className: "drag-handle-heading", defaultWidth: 84, minWidth: 82 },
  { id: "row", label: "Row", className: "sheet-row-heading", defaultWidth: 36, minWidth: 32 },
  { id: "included", label: "Inc", ariaLabel: "Included", title: "Included", className: "included-heading", defaultWidth: 30, minWidth: 28 },
  { id: "account", label: "Account", defaultWidth: 150, minWidth: 96 },
  { id: "symbol", label: "Asset", defaultWidth: 124, minWidth: 116 },
  { id: "normalPercent", label: "Dividend", defaultWidth: 50, minWidth: 46 },
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
  { id: "useSymbol", label: "Use asset", defaultWidth: 78, minWidth: 62, group: "debug" },
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
  { key: "tickers", label: "Assets", meta: "asset lookups" },
  { key: "federal", label: "Federal Tax", meta: "live backend" },
  { key: "state", label: "State Tax", meta: "state worksheet" },
  { key: "accountTaxType", label: "Tax Category", meta: "status list" },
  { key: "accountType", label: "Account Type", meta: "account kinds" },
  { key: "categories", label: "Asset Classes", meta: "asset classes" },
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
  mfs: [
    { amount: 11925, label: "12%", detail: "Federal ordinary 12% bracket starts", tone: "federal" },
    { amount: 48475, label: "22%", detail: "Federal ordinary 22% bracket starts", tone: "federal" },
    { amount: 103350, label: "24%", detail: "Federal ordinary 24% bracket starts", tone: "federal" },
    { amount: 197300, label: "32%", detail: "Federal ordinary 32% bracket starts", tone: "federal" },
    { amount: 250525, label: "35%", detail: "Federal ordinary 35% bracket starts", tone: "federal" },
    { amount: 375800, label: "37%", detail: "Federal ordinary 37% bracket starts", tone: "federal" },
  ],
  hoh: [
    { amount: 17000, label: "12%", detail: "Federal ordinary 12% bracket starts", tone: "federal" },
    { amount: 64850, label: "22%", detail: "Federal ordinary 22% bracket starts", tone: "federal" },
    { amount: 103350, label: "24%", detail: "Federal ordinary 24% bracket starts", tone: "federal" },
    { amount: 197300, label: "32%", detail: "Federal ordinary 32% bracket starts", tone: "federal" },
    { amount: 250500, label: "35%", detail: "Federal ordinary 35% bracket starts", tone: "federal" },
    { amount: 626350, label: "37%", detail: "Federal ordinary 37% bracket starts", tone: "federal" },
  ],
};
const categoryLabels = ["stock", "bond", "treasury bond", "cash", "non investment income"];
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
  mfs?: LocalStateTaxBracket[];
  hoh?: LocalStateTaxBracket[];
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



const initialInvestments: InvestmentRow[] = [
  { id: 1, description: "Example stock fund", account: "Example Brokerage", category: "core", totalInvestment: 10000, yearlyIncome: 120, includeIncome: true, overrideProposal: false, symbol: "VOO", newSymbol: "VOO", newPercent: 0 },
  { id: 2, description: "Example treasury fund", account: "Example Brokerage", category: "core", totalInvestment: 5000, yearlyIncome: 200, includeIncome: true, overrideProposal: false, symbol: "SGOV", newSymbol: "SGOV", newPercent: 0 },
  { id: 3, description: "Example IRA bond fund", account: "Example IRA", category: "core", totalInvestment: 8000, yearlyIncome: 320, includeIncome: true, overrideProposal: false, symbol: "BND", newSymbol: "BND", newPercent: 0 },
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
  { id: 1, symbol: "VOO", percentReturn: 0.012, category: "stock", taxTreatment: "qualified-div", extraData: 0, description: "Example S&P 500 ETF", exDividend: "", divPayout: "" },
  { id: 2, symbol: "SGOV", percentReturn: 0.04, category: "treasury bond", taxTreatment: "state tax free", extraData: 0, description: "Example short-term treasury ETF", exDividend: "", divPayout: "" },
  { id: 3, symbol: "BND", percentReturn: 0.04, category: "bond", taxTreatment: "non-qualified-div", extraData: 0, description: "Example bond market ETF", exDividend: "", divPayout: "" },
  { id: 4, symbol: "CASH", percentReturn: 0.01, category: "cash", taxTreatment: "income", extraData: 0, description: "Example cash sweep", exDividend: "", divPayout: "" },
  { id: 5, symbol: "non investment income", percentReturn: 0, category: "non investment income", taxTreatment: "income", extraData: 0, description: "Example ordinary non-investment income", exDividend: "", divPayout: "" },
] as Array<Omit<TickerRow, "incomeItem">>).map((row) => ({ ...row, incomeItem: isDefaultIncomeTicker(row) }));

const initialCategories: CategoryRow[] = categoryLabels.map((name, index) => ({ id: index + 1, name }));
const initialTaxTreatments: TaxTreatmentRow[] = ["tax free", "state tax free", "fed tax free", "index-60-40", "income", "ss-85-fed", "qualified-div", "non-qualified-div", "short term gain", "long term gain", "real estate", "hold"].map((label, index) => ({ id: index + 1, label }));
const initialAccountTaxTypes: AccountTaxTypeRow[] = ["tax-free", "taxable", "deferred", "tax-deduction"].map((taxStatus, index) => ({ id: index + 1, taxStatus }));
const initialAccountTypes: AccountTypeRow[] = [
  { id: 1, name: "IRA", taxStatus: "deferred" },
  { id: 2, name: "401k", taxStatus: "deferred" },
  { id: 3, name: "inherited Brokerage", taxStatus: "taxable" },
  { id: 4, name: "Brokerage Account", taxStatus: "taxable" },
];
const initialAccounts: AccountRow[] = [
  { id: 1, account: "Example Brokerage", accountType: "Brokerage Account", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 2, account: "Example IRA", accountType: "IRA", taxStatus: "deferred", dividendAccrued: "no", includeInFreeCashflow: "yes" },
];
const ordinaryWhatIfTypes = ["W2 wages", "Ordinary dividends", "Interest income", "Business income", "Rental income", "Other ordinary income"];
const preferredWhatIfTypes = ["Long-term capital gains", "Qualified dividends", "Section 1250 gain", "Collectibles gain", "Other preferred income"];
const newTaxWhatIfItem = (incomeType: string): TaxWhatIfItem => ({ id: Date.now() + Math.floor(Math.random() * 100000), amount: 0, incomeType });
const blankOrdinaryWhatIfItem = (): TaxWhatIfItem => newTaxWhatIfItem(ordinaryWhatIfTypes[0]);
const blankPreferredWhatIfItem = (): TaxWhatIfItem => newTaxWhatIfItem(preferredWhatIfTypes[0]);
const initialFederalSettings: FederalSettings = { filingStatus: "mfj", extraOrdinaryIncome: 0, extraPreferredIncome: 0, extraOrdinaryItems: [blankOrdinaryWhatIfItem()], extraPreferredItems: [blankPreferredWhatIfItem()], mortgageInterest: 19500, propertyTax: 19000, standardDeduction: 31500, saltCap: 40400 };
const initialStateSettings: StateSettings = { stateCode: "CA", extraStateIncome: 0, mortgageInterest: 26500, propertyTax: 19000, standardDeduction: 11000 };
const initialPlannerSettings: PlannerSettings = { federalWithholding: 0, stateWithholding: 0 };
const initialUiSettings: UiSettings = { investmentFavorites: [], modelVersions: [], incomePrimaryPeriod: "annual" };
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

function isPlaceholderAssetSymbol(value: string) {
  const normalized = normalizeLookupKey(value).replace(/[^a-z0-9]/g, "");
  return ["na", "none", "notapplicable"].includes(normalized);
}

function getStateTaxRateMarkers(stateCode: string, filingStatus: LocalStateTaxFilingStatus): ThermometerMarker[] {
  const profile = getLocalStateTaxProfile(stateCode);
  const brackets =
    filingStatus === "mfj" ? profile.mfj :
    filingStatus === "mfs" ? profile.mfs ?? profile.single :
    filingStatus === "hoh" ? profile.hoh ?? profile.single :
    profile.single;

  return [...brackets]
    .sort((first, second) => first.threshold - second.threshold)
    .filter((bracket) => bracket.threshold > 0)
    .map((bracket) => ({
      amount: bracket.threshold,
      label: `${Number((bracket.rate * 100).toFixed(2))}%`,
      detail: `${profile.name} ${Number((bracket.rate * 100).toFixed(2))}% bracket starts`,
      tone: "state",
    }));
}

function getStateTaxBaseRateLabel(stateCode: string, filingStatus: LocalStateTaxFilingStatus) {
  const profile = getLocalStateTaxProfile(stateCode);
  const brackets =
    filingStatus === "mfj" ? profile.mfj :
    filingStatus === "mfs" ? profile.mfs ?? profile.single :
    filingStatus === "hoh" ? profile.hoh ?? profile.single :
    profile.single;
  const firstBracket = [...brackets].sort((first, second) => first.threshold - second.threshold)[0];
  return firstBracket ? `${Number((firstBracket.rate * 100).toFixed(2))}%` : "0%";
}

function distributeAmountEvenly(total: number, count: number) {
  const safeCount = Math.max(2, Math.trunc(count) || 2);
  const totalCents = Math.round(toNumber(total) * 100);
  const baseCents = Math.trunc(totalCents / safeCount);
  const remainderCents = totalCents - baseCents * safeCount;
  const remainderSign = Math.sign(remainderCents);
  return Array.from({ length: safeCount }, (_, index) => (
    baseCents + (index < Math.abs(remainderCents) ? remainderSign : 0)
  ) / 100);
}

function distributeAmountProportionally(total: number, weights: number[]) {
  if (weights.length === 0) return [];
  const weightTotal = weights.reduce((sum, weight) => sum + toNumber(weight), 0);
  if (Math.abs(weightTotal) < 0.005) return distributeAmountEvenly(total, weights.length);
  const totalCents = Math.round(toNumber(total) * 100);
  let allocatedCents = 0;
  return weights.map((weight, index) => {
    const cents = index === weights.length - 1
      ? totalCents - allocatedCents
      : Math.round(totalCents * toNumber(weight) / weightTotal);
    allocatedCents += cents;
    return cents / 100;
  });
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
function inferAccountTypeFromAccountName(accountName: string) {
  const key = normalizeLookupKey(accountName);
  if (!key) return "";
  if (key.includes("401k") || key.includes("401")) return "401k";
  if (key.includes("inherited") && key.includes("brokerage")) return "inherited Brokerage";
  if (key.includes("ira")) return "IRA";
  if (key.includes("brokerage")) return "Brokerage Account";
  return "";
}
function inferAccountTypeTaxStatus(typeName: string) {
  const key = normalizeLookupKey(typeName);
  if (!key) return "";
  if (key.includes("401") || key.includes("ira")) return "deferred";
  if (key.includes("brokerage")) return "taxable";
  return "";
}
function buildAccountTypeTaxStatusMap(rows: AccountTypeRow[]) {
  const map: Record<string, string> = {};
  for (const row of rows) {
    const key = normalizeLookupKey(row.name);
    if (!key) continue;
    if (!map[key]) {
      map[key] = String(row.taxStatus || inferAccountTypeTaxStatus(row.name) || "");
    }
  }
  return map;
}
function buildAccountTaxStatusMap(rows: AccountRow[], accountTypes: AccountTypeRow[]) {
  const map: Record<string, string> = {};
  const accountTypeTaxStatusByName = buildAccountTypeTaxStatusMap(accountTypes);
  for (const row of rows) {
    const key = normalizeLookupKey(row.account);
    if (!key) continue;
    if (!map[key]) {
      const accountType = row.accountType || inferAccountTypeFromAccountName(row.account);
      map[key] = accountTypeTaxStatusByName[normalizeLookupKey(accountType)] || String(row.taxStatus || "");
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

function assetTaxToneLabel(tone: AssetTaxTone) {
  if (tone === "tax-free") return "Federal and state tax-free";
  if (tone === "federal-taxable-state-free") return "Federal taxable, state tax-free";
  if (tone === "federal-free-state-taxable") return "Federal tax-free, state taxable";
  return "Federal and state taxable";
}

function AssetSelect({ value, options, accountTaxStatus, tickerMap, stateCode, disabled = false, onChange, ariaLabel }: { value: string; options: string[]; accountTaxStatus: string; tickerMap: Record<string, TickerRow>; stateCode: string; disabled?: boolean; onChange: (value: string) => void; ariaLabel: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const taxToneForOption = (option: string) => getAssetTaxTone(accountTaxStatus, tickerMap[normalizeLookupKey(option)]?.taxTreatment || "income", stateCode);
  const selectedTone = taxToneForOption(value);
  const updateMenuPosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuStyle({ left: rect.left, top: rect.bottom + 4, width: Math.max(rect.width, 230) });
  };

  useEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
    const handlePointerDown = (event: PointerEvent) => {
      if (pickerRef.current?.contains(event.target as Node) || menuRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setIsOpen(false); };
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
    <div className="account-picker asset-picker" ref={pickerRef}>
      <button
        className={`account-picker__trigger asset-picker__trigger asset-tax-select asset-tax-select--${selectedTone}`}
        type="button"
        ref={triggerRef}
        disabled={disabled}
        onClick={() => {
          if (!isOpen) updateMenuPosition();
          setIsOpen((current) => !current);
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
      >
        <span>{value || "Select asset"}</span>
      </button>
      {isOpen && !disabled && createPortal(
        <div className="account-picker__menu account-picker__menu--portal asset-picker__menu" ref={menuRef} style={menuStyle} role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const tone = taxToneForOption(option);
            return (
              <button
                className={`account-picker__option asset-picker__option ${option === value ? "account-picker__option--selected" : ""}`.trim()}
                key={option || "(blank)"}
                type="button"
                role="option"
                aria-selected={option === value}
                onClick={() => { onChange(option); setIsOpen(false); }}
              >
                <span>{option || "Blank"}</span>
                {option && <span className={`asset-tax-indicator asset-tax-indicator--${tone}`} title={assetTaxToneLabel(tone)} aria-label={assetTaxToneLabel(tone)} />}
              </button>
            );
          })}
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

function normalizeModelVersions(raw: unknown): ModelVersion[] {
  if (!Array.isArray(raw)) return [];
  const versions: ModelVersion[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const snapshot = obj.snapshot && typeof obj.snapshot === "object" ? obj.snapshot as Record<string, unknown> : null;
    const name = normalizeFavoriteName(obj.name);
    if (!snapshot || !name) continue;
    if (![snapshot.investments, snapshot.tickers, snapshot.categories, snapshot.taxTreatments, snapshot.accounts, snapshot.accountTaxTypes].every(Array.isArray)) continue;
    const createdAt = String(obj.createdAt || new Date().toISOString());
    versions.push({
      id: String(obj.id || `version-${createdAt}-${versions.length}`),
      name,
      createdAt,
      updatedAt: String(obj.updatedAt || createdAt),
      snapshot: {
        investments: snapshot.investments as InvestmentRow[],
        tickers: snapshot.tickers as TickerRow[],
        categories: snapshot.categories as CategoryRow[],
        taxTreatments: snapshot.taxTreatments as TaxTreatmentRow[],
        accounts: snapshot.accounts as AccountRow[],
        accountTaxTypes: snapshot.accountTaxTypes as AccountTaxTypeRow[],
        accountTypes: Array.isArray(snapshot.accountTypes) ? snapshot.accountTypes as AccountTypeRow[] : initialAccountTypes,
        federalSettings: normalizeFederalSettings(snapshot.federalSettings),
        stateSettings: mergeSettings(initialStateSettings, snapshot.stateSettings),
        plannerSettings: mergeSettings(initialPlannerSettings, snapshot.plannerSettings),
        uiSettings: {
          investmentFavorites: normalizeInvestmentFavorites((snapshot.uiSettings as Record<string, unknown> | undefined)?.investmentFavorites),
        },
        isWhatIfActive: Boolean(snapshot.isWhatIfActive),
      },
    });
  }
  return versions.slice(0, MODEL_VERSION_LIMIT);
}
function normalizeFilingStatus(value: unknown): FilingStatus {
  const status = String(value || "single").trim().toLowerCase();
  return status === "mfj" || status === "mfs" || status === "hoh" ? status : "single";
}

function niitThresholdForStatus(filingStatus: FilingStatus) {
  return filingStatus === "mfj" ? 250000 : filingStatus === "mfs" ? 125000 : 200000;
}

type SettingsSection = Record<string, unknown>;

function parseNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const text = String(value).trim();
  const isNegative = /^\(.*\)$/.test(text);
  const normalized = text.replace(/[,$%\s]/g, "").replace(/^\((.*)\)$/, "$1");
  const num = Number(normalized);
  return Number.isFinite(num) ? (isNegative ? -num : num) : undefined;
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
    const num = parseNumber(candidate);
    if (num !== undefined) return num;
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

function normalizeTaxWhatIfItems(raw: unknown, defaultType: string, legacyAmount = 0): TaxWhatIfItem[] {
  const sourceRows = Array.isArray(raw) ? raw : [];
  const rows = sourceRows
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const obj = entry as Record<string, unknown>;
      const amount = toNumber(obj.amount as number | string | boolean | null | undefined);
      const incomeType = String(obj.incomeType || defaultType).trim() || defaultType;
      return {
        id: Number(obj.id) || Date.now() + index,
        amount,
        incomeType,
      };
    })
    .filter((row): row is TaxWhatIfItem => Boolean(row));
  if (rows.length > 0) return rows;
  return [{ id: Date.now(), amount: toNumber(legacyAmount), incomeType: defaultType }];
}

function normalizeFederalSettings(raw: unknown): FederalSettings {
  const merged = mergeSettings(initialFederalSettings, raw) as FederalSettings;
  const extraOrdinaryItems = normalizeTaxWhatIfItems(merged.extraOrdinaryItems, ordinaryWhatIfTypes[0], merged.extraOrdinaryIncome);
  const extraPreferredItems = normalizeTaxWhatIfItems(merged.extraPreferredItems, preferredWhatIfTypes[0], merged.extraPreferredIncome);
  return {
    ...merged,
    extraOrdinaryItems,
    extraPreferredItems,
    extraOrdinaryIncome: extraOrdinaryItems.reduce((total, row) => total + toNumber(row.amount), 0),
    extraPreferredIncome: extraPreferredItems.reduce((total, row) => total + toNumber(row.amount), 0),
  };
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
  setNumberField("standardDeduction", "Standard deduction");
  setNumberField("saltCap", "SALT cap");
  const extraOrdinaryIncome = parseNumberFromSection(sectionObj, rows, "extraOrdinaryIncome", "Extra ordinary income");
  const extraPreferredIncome = parseNumberFromSection(sectionObj, rows, "extraPreferredIncome", "Extra preferred income");
  if (extraOrdinaryIncome !== undefined) result.extraOrdinaryIncome = extraOrdinaryIncome;
  if (extraPreferredIncome !== undefined) result.extraPreferredIncome = extraPreferredIncome;
  result.extraOrdinaryItems = normalizeTaxWhatIfItems(sectionObj?.extraOrdinaryItems, ordinaryWhatIfTypes[0], result.extraOrdinaryIncome || 0);
  result.extraPreferredItems = normalizeTaxWhatIfItems(sectionObj?.extraPreferredItems, preferredWhatIfTypes[0], result.extraPreferredIncome || 0);

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
    modelVersions: normalizeModelVersions(sectionObj.modelVersions),
    incomePrimaryPeriod: sectionObj.incomePrimaryPeriod === "monthly" ? "monthly" : "annual",
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
      modelVersions: ui.modelVersions || [],
      incomePrimaryPeriod: ui.incomePrimaryPeriod || "annual",
    },
  };
}
function formatCurrency(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function formatCurrencyDetailed(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value); }
function formatPercent(value: number) { return `${(value * 100).toFixed(1)}%`; }
function truncatePercentInputValue(value: number) { return Math.trunc(value * 100) / 100; }
function formatPercentInputValue(value: number) {
  const truncated = truncatePercentInputValue(value);
  return Number.isFinite(truncated) ? String(truncated) : "";
}
function formatGridCurrency(value: number) { return formatCurrency(toNumber(value)); }
function formatCurrencyInput(value: number) { return formatCurrency(toNumber(value)); }
function parseCurrencyInput(value: string) { return toNumber(value); }
function formatSignedCurrency(value: number) {
  if (Math.abs(value) < 0.5) return "$0";
  return `${value > 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;
}
function fedTaxAdjust(amount: number, taxTreatment: string, pref: boolean) { switch (String(taxTreatment || "").toLowerCase().trim()) { case "hold": case "tax free": case "fed tax free": return 0; case "state tax free": return pref ? 0 : amount; case "index-60-40": return pref ? amount * 0.6 : amount * 0.4; case "income": case "non-qualified-div": case "short term gain": case "real estate": return pref ? 0 : amount; case "ss-85-fed": return pref ? 0 : amount * 0.85; case "qualified-div": case "long term gain": return pref ? amount : 0; default: return pref ? 0 : amount; } }
function stateTaxAdjust(amount: number, taxTreatment: string, stateCode = "CA") { const treatment = String(taxTreatment || "").toLowerCase().trim(); if (treatment === "hold" || treatment === "tax free" || treatment === "ss-85-fed") return 0; if (treatment === "state tax free" && normalizeStateCode(stateCode) === "CA") return 0; return amount; }
function getAssetTaxTone(taxStatus: string, taxTreatment: string, stateCode: string): AssetTaxTone {
  const normalizedStatus = String(taxStatus || "").trim().toLowerCase();
  const isTaxableAccount = normalizedStatus === "taxable" || normalizedStatus.includes("taxable");
  if (!isTaxableAccount) return "tax-free";
  const federalTaxable = fedTaxAdjust(1, taxTreatment, false) + fedTaxAdjust(1, taxTreatment, true) > 0;
  const stateTaxable = stateTaxAdjust(1, taxTreatment, stateCode) > 0;
  if (federalTaxable && stateTaxable) return "fully-taxable";
  if (federalTaxable) return "federal-taxable-state-free";
  if (stateTaxable) return "federal-free-state-taxable";
  return "tax-free";
}
function isUnknownCalcError(error: Error) { return /unknown calc/i.test(error.message || ""); }
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

async function createMcpConnectorToken(workspaceId: string, idToken?: string, label = "ChatGPT connector") {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const response = await fetch(`${API_BASE_URL}/hello`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ calc: "MCP_TOKEN_CREATE", workspaceId, label }),
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
function workbookToInvestmentRow(row: Record<string, unknown>, index: number): InvestmentRow | null {
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

  const base: InvestmentRow = {
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
function workbookToTickerRow(row: Record<string, unknown>, index: number): TickerRow {
  const base: TickerRow = { id: index + 1, symbol: "", percentReturn: 0, category: "", taxTreatment: "income", incomeItem: false, extraData: 0, description: "", exDividend: "", divPayout: "" };
  const percentValue = workbookField(row, "dividend", "percent_return", "percentReturn", "percent_return_rate", "percent");
  const extraDataValue = workbookField(row, "extra_data", "extraData");
  const symbol = workbookField(row, "symbol", "ticker") ?? base.symbol;
  const category = workbookField(row, "category") ?? base.category;
  const taxTreatment = workbookField(row, "tax_treatment", "taxTreatment", "tax_status") ?? base.taxTreatment;
  const incomeItemValue = workbookField(row, "incomeItem", "income_item", "is_income_item", "income_ticker", "income");
  const inferredIncomeItem = isDefaultIncomeTicker({ category, taxTreatment }) || normalizeLookupKey(symbol) === "noninvestmentincome";
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    symbol,
    percentReturn: percentValue !== undefined ? normalizeRate(percentValue) : normalizeRate(base.percentReturn),
    category,
    taxTreatment,
    incomeItem: inferredIncomeItem || (incomeItemValue !== undefined ? normalizeBoolean(incomeItemValue) : false),
    extraData: extraDataValue !== undefined ? toNumber(extraDataValue) : base.extraData,
    description: workbookField(row, "description", "desc") ?? base.description,
    exDividend: workbookField(row, "ex_dividend", "exDividend") ?? base.exDividend,
    divPayout: workbookField(row, "div_payout", "divPayout") ?? base.divPayout,
  };
}
function workbookToCategoryRow(row: Record<string, unknown>, index: number): CategoryRow {
  const base: CategoryRow = { id: index + 1, name: "" };
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    name: workbookField(row, "name", "category", "label") ?? base.name,
  };
}
function workbookToAccountRow(row: Record<string, unknown>, index: number): AccountRow {
  const base: AccountRow = { id: index + 1, account: "", accountType: "", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" };
  const account = workbookField(row, "account", "account_name", "account_names") ?? base.account;
  const accountType = workbookField(row, "account_type", "accountType", "type") ?? inferAccountTypeFromAccountName(account);
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    account,
    accountType,
    taxStatus: workbookField(row, "tax_status", "taxStatus", "tax_treatment") ?? base.taxStatus,
    dividendAccrued: workbookField(row, "dividend_accrued", "dividendAccrued") ?? base.dividendAccrued,
    includeInFreeCashflow: normalizeYesNo(workbookField(row, "include_in_free_cashflow", "includeInFreeCashflow", "include_in_free_cash_flow", "include")),
  };
}
function workbookToTaxTreatmentRow(row: Record<string, unknown>, index: number): TaxTreatmentRow {
  const base: TaxTreatmentRow = { id: index + 1, label: "" };
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    label: workbookField(row, "label", "tax_treatment") ?? base.label,
  };
}
function workbookToAccountTaxTypeRow(row: Record<string, unknown>, index: number): AccountTaxTypeRow {
  const base: AccountTaxTypeRow = { id: index + 1, taxStatus: "" };
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    taxStatus: workbookField(row, "tax_status", "taxStatus", "tax_status") ?? base.taxStatus,
  };
}
function workbookToAccountTypeRow(row: Record<string, unknown>, index: number): AccountTypeRow {
  const base: AccountTypeRow = { id: index + 1, name: "", taxStatus: "" };
  const name = workbookField(row, "name", "accountType", "account_type", "type", "label") ?? base.name;
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    name,
    taxStatus: workbookField(row, "tax_status", "taxStatus", "tax_treatment", "status") ?? inferAccountTypeTaxStatus(name),
  };
}
function mergeSettings<T extends object>(fallback: T, incoming: unknown): T { return incoming && typeof incoming === "object" ? ({ ...fallback, ...(incoming as Partial<T>) } as T) : fallback; }
function sumTaxWhatIfItems(items: TaxWhatIfItem[] | undefined, legacyAmount = 0) {
  const itemTotal = Array.isArray(items) ? items.reduce((total, item) => total + toNumber(item.amount), 0) : 0;
  return itemTotal > 0 ? itemTotal : toNumber(legacyAmount);
}
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
  accountTypes,
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
  accountTypes: AccountTypeRow[];
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
    select: row.includeIncome,
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
    accounts: accounts.map((row) => ({ id: row.id, account: row.account, accountType: row.accountType || inferAccountTypeFromAccountName(row.account), taxStatus: row.taxStatus, dividendAccrued: row.dividendAccrued, includeInFreeCashflow: row.includeInFreeCashflow })),
    referenceTables: {
      tickers,
      categories,
      taxTreatment: taxTreatments,
      accountTaxType: accountTaxTypes,
      accountType: accountTypes,
    },
    editableTables: {
      tableIds: ["investments", "tickers", "accounts", "categories", "taxTreatment", "accountTaxType", "accountType"],
      investmentFields: ["description", "account", "category", "totalInvestment", "yearlyIncome", "select", "includeIncome", "overrideProposal", "symbol", "newSymbol", "newPercent"],
      tickerFields: ["symbol", "percentReturn", "category", "taxTreatment", "incomeItem", "extraData", "description", "exDividend", "divPayout"],
      accountFields: ["account", "accountType", "taxStatus", "dividendAccrued", "includeInFreeCashflow"],
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

function CurrencyInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [isFocused, setIsFocused] = useState(false);
  const displayValue = isFocused ? String(toNumber(value) || "") : formatCurrencyInput(value);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onChange={(event) => onChange(parseCurrencyInput(event.target.value))}
    />
  );
}

function TaxWhatIfMiniTable({ title, total, rows, typeOptions, onChange }: { title: string; total: number; rows: TaxWhatIfItem[]; typeOptions: string[]; onChange: (rows: TaxWhatIfItem[]) => void }) {
  const safeRows = rows.length ? rows : [newTaxWhatIfItem(typeOptions[0] || "Other")];
  const updateRow = (id: number, values: Partial<TaxWhatIfItem>) => {
    onChange(safeRows.map((row) => row.id === id ? { ...row, ...values } : row));
  };
  const removeRow = (id: number) => {
    const nextRows = safeRows.filter((row) => row.id !== id);
    onChange(nextRows.length ? nextRows : [newTaxWhatIfItem(typeOptions[0] || "Other")]);
  };

  return (
    <div className="tax-what-if-table">
      <div className="tax-what-if-table__heading">
        <strong>{title}</strong>
        <span>{formatCurrencyDetailed(total)}</span>
      </div>
      <div className="tax-what-if-table__grid tax-what-if-table__grid--header">
        <span>Amount</span>
        <span>Type</span>
        <span aria-hidden="true" />
      </div>
      {safeRows.map((row) => (
        <div className="tax-what-if-table__grid" key={row.id}>
          <CurrencyInput value={row.amount} onChange={(amount) => updateRow(row.id, { amount })} />
          <select value={row.incomeType} onChange={(event) => updateRow(row.id, { incomeType: event.target.value })}>
            {typeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <button className="ghost-button ghost-button--compact icon-button" type="button" onClick={() => removeRow(row.id)} aria-label={`Remove ${title} row`}>×</button>
        </div>
      ))}
      <button className="ghost-button ghost-button--compact" type="button" onClick={() => onChange([...safeRows, newTaxWhatIfItem(typeOptions[0] || "Other")])}>+ Add row</button>
    </div>
  );
}

type KpiMetricConfig = {
  label: string;
  value: string;
  secondaryValue?: string;
  numericValue?: number;
  primary?: boolean;
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

function TumblingCurrency({ value, className = "" }: { value: number; className?: string }) {
  const formattedValue = formatCurrencyDetailed(value);
  const previousNumericValue = useRef(value);
  const previousDisplayValue = useRef(formattedValue);
  const [odometerValue, setOdometerValue] = useState({ previous: formattedValue, current: formattedValue });
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (Math.abs(value - previousNumericValue.current) > 0.005) {
      setOdometerValue({ previous: previousDisplayValue.current, current: formattedValue });
      setIsAnimating(false);
      window.requestAnimationFrame(() => setIsAnimating(true));
    }
    previousNumericValue.current = value;
    previousDisplayValue.current = formattedValue;
  }, [formattedValue, value]);

  useEffect(() => {
    if (!isAnimating) return;
    const timeoutId = window.setTimeout(() => setIsAnimating(false), 820);
    return () => window.clearTimeout(timeoutId);
  }, [isAnimating]);

  return (
    <span className={`${className} ${isAnimating ? `${className}--changed` : ""}`.trim()}>
      <OdometerValue value={odometerValue.current} previousValue={odometerValue.previous} spinning={isAnimating} />
    </span>
  );
}

function KpiPill({ label, value, secondaryValue, numericValue, primary, deltaKind = "currency", tone = "default" }: KpiMetricConfig) {
  const previousValue = useRef<number | null>(null);
  const previousDisplayValue = useRef(value);
  const [delta, setDelta] = useState<number | null>(null);
  const [odometerValue, setOdometerValue] = useState({ previous: value, current: value });
  const [isAnimatingValue, setIsAnimatingValue] = useState(false);
  const isPrimaryMetric = primary ?? label.toLowerCase() === "after-tax income";

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

function SnapshotToggleIcon({ type }: { type: "afterTax" | "beforeTax" | "monthly" | "yearly" }) {
  if (type === "afterTax") {
    return <svg className="snapshot-coin-stack" viewBox="0 0 20 20" aria-hidden="true">
      <ellipse className="snapshot-coin snapshot-coin--gold" cx="10" cy="14.5" rx="6" ry="1.55" />
      <ellipse className="snapshot-coin snapshot-coin--gold" cx="10" cy="11.2" rx="6" ry="1.55" />
    </svg>;
  }
  if (type === "beforeTax") {
    return <svg className="snapshot-coin-stack" viewBox="0 0 20 20" aria-hidden="true">
      <ellipse className="snapshot-coin snapshot-coin--gold" cx="10" cy="14.5" rx="6" ry="1.55" />
      <ellipse className="snapshot-coin snapshot-coin--gold" cx="10" cy="11.2" rx="6" ry="1.55" />
      <ellipse className="snapshot-coin snapshot-coin--gold" cx="10" cy="7.9" rx="6" ry="1.55" />
      <ellipse className="snapshot-coin snapshot-coin--gold" cx="10" cy="4.6" rx="6" ry="1.55" />
    </svg>;
  }
  if (type === "monthly") {
    return <svg className="snapshot-calendar-icon" viewBox="0 0 20 20" aria-hidden="true">
      <rect className="snapshot-calendar-front" x="3.5" y="4.5" width="13" height="12" rx="1.5" />
      <path d="M6.5 3v3M13.5 3v3M3.5 8h13" />
      <path d="M6.5 10.5h1M9.5 10.5h1M12.5 10.5h1M6.5 13.5h1M9.5 13.5h1M12.5 13.5h1" />
    </svg>;
  }
  return <svg className="snapshot-calendar-icon snapshot-calendar-icon--stacked" viewBox="0 0 20 20" aria-hidden="true">
    <rect className="snapshot-calendar-back snapshot-calendar-back--rear" x="1.8" y="1.8" width="12" height="11" rx="1.4" />
    <rect className="snapshot-calendar-back" x="3.3" y="3.3" width="12" height="11" rx="1.4" />
    <rect className="snapshot-calendar-front" x="4.8" y="4.8" width="12.5" height="11.5" rx="1.4" />
    <path d="M7.5 3.5v3M14.4 3.5v3M4.8 8.3h12.5" />
    <path d="M7.5 10.7h1M10.3 10.7h1M13.1 10.7h1M7.5 13.4h1M10.3 13.4h1M13.1 13.4h1" />
  </svg>;
}

function IncomeSnapshotControl({
  snapshot,
  deltas,
  onCapture,
  className = "",
}: {
  snapshot: IncomeSnapshot | null;
  deltas: IncomeSnapshotValues | null;
  onCapture: (origin: { x: number; y: number }) => void;
  className?: string;
}) {
  const [snapshotView, setSnapshotView] = useState<"monthly" | "yearly">("monthly");
  const [snapshotBasis, setSnapshotBasis] = useState<"afterTax" | "beforeTax">("afterTax");
  const [snapshotTooltip, setSnapshotTooltip] = useState("");
  const capturedLabel = snapshot
    ? new Date(snapshot.capturedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";
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
    <div className={`income-snapshot ${!snapshot ? "income-snapshot--empty" : ""} ${className}`.trim()} aria-label="Income snapshot comparison">
      <button
        className="income-snapshot__button"
        type="button"
        onClick={(event) => {
          const iconRect = event.currentTarget.querySelector("svg")?.getBoundingClientRect();
          const buttonRect = event.currentTarget.getBoundingClientRect();
          onCapture(iconRect
            ? { x: iconRect.left + iconRect.width * (17.5 / 24), y: iconRect.top + iconRect.height * (10.1 / 24) }
            : { x: buttonRect.left + buttonRect.width / 2, y: buttonRect.top + buttonRect.height / 2 });
        }}
        aria-label="Set income baseline"
        title="Set a baseline to compare how income changes as you adjust investments, accounts, and what-if options."
      >
        <svg className="income-snapshot__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6.5 7.5 8.25 5h7.5l1.75 2.5H20a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 4 7.5h2.5Z" />
          <rect className="income-snapshot__flash-window" x="16.4" y="9" width="2.2" height="2.2" rx=".45" />
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
          aria-label="Show after-tax change"
          title="Show after-tax income change"
          onMouseEnter={() => setSnapshotTooltip("Show after-tax income change")}
          onMouseLeave={() => setSnapshotTooltip("")}
          onFocus={() => setSnapshotTooltip("Show after-tax income change")}
          onBlur={() => setSnapshotTooltip("")}
        >
          <SnapshotToggleIcon type="afterTax" />
        </button>
        <button
          className={`income-snapshot__toggle-button ${snapshotBasis === "beforeTax" ? "income-snapshot__toggle-button--active" : ""}`.trim()}
          type="button"
          onClick={() => setSnapshotBasis("beforeTax")}
          aria-label="Show before-tax change"
          title="Show before-tax income change"
          onMouseEnter={() => setSnapshotTooltip("Show before-tax income change")}
          onMouseLeave={() => setSnapshotTooltip("")}
          onFocus={() => setSnapshotTooltip("Show before-tax income change")}
          onBlur={() => setSnapshotTooltip("")}
        >
          <SnapshotToggleIcon type="beforeTax" />
        </button>
      </div>
      <div className="income-snapshot__toggle" role="group" aria-label="Snapshot period">
        <button
          className={`income-snapshot__toggle-button ${snapshotView === "monthly" ? "income-snapshot__toggle-button--active" : ""}`.trim()}
          type="button"
          onClick={() => setSnapshotView("monthly")}
          aria-label="Show monthly change"
          title="Show monthly change"
          onMouseEnter={() => setSnapshotTooltip("Show monthly change")}
          onMouseLeave={() => setSnapshotTooltip("")}
          onFocus={() => setSnapshotTooltip("Show monthly change")}
          onBlur={() => setSnapshotTooltip("")}
        >
          <SnapshotToggleIcon type="monthly" />
        </button>
        <button
          className={`income-snapshot__toggle-button ${snapshotView === "yearly" ? "income-snapshot__toggle-button--active" : ""}`.trim()}
          type="button"
          onClick={() => setSnapshotView("yearly")}
          aria-label="Show yearly change"
          title="Show yearly change"
          onMouseEnter={() => setSnapshotTooltip("Show yearly change")}
          onMouseLeave={() => setSnapshotTooltip("")}
          onFocus={() => setSnapshotTooltip("Show yearly change")}
          onBlur={() => setSnapshotTooltip("")}
        >
          <SnapshotToggleIcon type="yearly" />
        </button>
      </div>
      {snapshotTooltip && <div className="income-snapshot__tooltip" role="tooltip">{snapshotTooltip}</div>}
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

function IncomePeriodToggle({ period, onChange }: { period: IncomePrimaryPeriod; onChange: (period: IncomePrimaryPeriod) => void }) {
  return (
    <div className="income-snapshot__toggle income-period-toggle" role="group" aria-label="Primary income period">
      <button
        className={`income-snapshot__toggle-button ${period === "monthly" ? "income-snapshot__toggle-button--active" : ""}`.trim()}
        type="button"
        onClick={() => onChange("monthly")}
        aria-label="Make monthly income the larger value"
        title="Make monthly income the larger value"
      >
        <SnapshotToggleIcon type="monthly" />
      </button>
      <button
        className={`income-snapshot__toggle-button ${period === "annual" ? "income-snapshot__toggle-button--active" : ""}`.trim()}
        type="button"
        onClick={() => onChange("annual")}
        aria-label="Make annual income the larger value"
        title="Make annual income the larger value"
      >
        <SnapshotToggleIcon type="yearly" />
      </button>
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

function buildThermometerRateBands(markers: ThermometerMarker[], scaleMax: number, baseRateLabel: string): ThermometerRateBand[] {
  const sortedMarkers = [...markers].sort((first, second) => first.amount - second.amount);
  const allBands = [
    { start: 0, end: sortedMarkers[0]?.amount ?? scaleMax, label: baseRateLabel },
    ...sortedMarkers.map((marker, index) => ({
      start: marker.amount,
      end: sortedMarkers[index + 1]?.amount ?? scaleMax,
      label: marker.label,
    })),
  ].filter((band) => band.end > band.start);
  const visibleBands = allBands
    .map((band, colorIndex) => ({ ...band, colorIndex, colorTotal: allBands.length }))
    .filter((band) => band.start < scaleMax)
    .map((band) => ({ ...band, end: Math.min(band.end, scaleMax) }));
  return visibleBands.map((band, index) => ({ ...band, index, total: visibleBands.length }));
}

function rateBandStyle(band: ThermometerRateBand, scaleMax: number) {
  const start = Math.max(0, Math.min(100, (band.start / scaleMax) * 100));
  const end = Math.max(start, Math.min(100, (band.end / scaleMax) * 100));
  const { background, border } = rateBandColors(band);
  return {
    "--rate-start": `${start}%`,
    "--rate-size": `${end - start}%`,
    "--rate-band-bg": background,
    "--rate-band-border": border,
  } as React.CSSProperties;
}

function rateBandColors(band: ThermometerRateBand) {
  const position = band.colorTotal <= 1 ? 0 : band.colorIndex / (band.colorTotal - 1);
  const hue = Math.round(145 - position * 145);
  const saturation = Math.round(58 + position * 14);
  const lightness = Math.round(85 - position * 14);
  return {
    background: `hsl(${hue} ${saturation}% ${lightness}% / .82)`,
    border: `hsl(${hue} ${saturation}% ${Math.max(34, lightness - 26)}% / .42)`,
  };
}

function rateBandGradientStops(bands: ThermometerRateBand[], scaleMax: number) {
  if (bands.length === 0) return "rgba(248, 250, 252, .82) 0% 100%";
  return bands.map((band) => {
    const start = Math.max(0, Math.min(100, (band.start / scaleMax) * 100));
    const end = Math.max(start, Math.min(100, (band.end / scaleMax) * 100));
    return `${rateBandColors(band).background} ${start}% ${end}%`;
  }).join(", ");
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

function RowActionIcon({ name }: { name: "add" | "select" | "delete" | "split" }) {
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

  if (name === "split") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 6.5h5v5H5z" />
        <path d="M14 12.5h5v5h-5z" />
        <path d="M10 9h2.5a4 4 0 0 1 4 4" />
        <path d="m14.5 10.75 2 2.25 2-2.25" />
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

function TopbarActionIcon({ name }: { name: "copy" | "signIn" | "signOut" | "assistant" | "sheet" | "chat" | "menu" | "history" }) {
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

  if (name === "history") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 8V4m0 0h4M5 4l3 3" />
        <path d="M6.5 17.5A8 8 0 1 0 5 8" />
        <path d="M12 8v4l3 2" />
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

function TaxThermometer({ title, titleLabel, titleValue, subtitle, taxableIncome, values, markers, stats, footerLabel, footerValue, baseRateLabel, currentRateLabel, collapsed, onToggle }: { title: React.ReactNode; titleLabel?: string; titleValue?: string; subtitle: string; taxableIncome: number; values: ThermometerValue[]; markers: ThermometerMarker[]; stats: ThermometerStat[]; footerLabel: string; footerValue: string; baseRateLabel: string; currentRateLabel?: string; collapsed: boolean; onToggle: () => void }) {
  const labelText = titleLabel || (typeof title === "string" ? title : "Tax thermometer");
  const { scaleMax, visibleMarkers } = getThermometerScale(values, markers);
  const positionStyle = (amount: number) => ({ "--thermo-position": `${Math.max(0, Math.min(100, (amount / scaleMax) * 100))}%` } as React.CSSProperties);
  const sortedRateMarkers = [...markers].sort((first, second) => first.amount - second.amount);
  const lowerBracketBoundary = [...sortedRateMarkers].reverse().find((marker) => marker.amount <= taxableIncome);
  const upperBracketBoundary = sortedRateMarkers.find((marker) => marker.amount > taxableIncome);
  const rateBands = buildThermometerRateBands(markers, scaleMax, baseRateLabel);
  const trackStyle = { "--rate-gradient-stops": rateBandGradientStops(rateBands, scaleMax) } as React.CSSProperties;

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
          {titleValue && <div className="tax-thermometer__title-value">{titleValue}</div>}
          <div className="tax-thermometer__track" aria-label={`${labelText} tax threshold thermometer`} style={trackStyle}>
            {rateBands.map((band) => (
              <div
                key={`${band.label}-${band.start}-${band.end}`}
                className={`tax-thermometer__rate-band ${band.index === 0 ? "tax-thermometer__rate-band--first" : ""} ${band.index === band.total - 1 ? "tax-thermometer__rate-band--last" : ""} ${band.end - band.start < scaleMax * 0.055 ? "tax-thermometer__rate-band--compact" : ""}`.trim()}
                style={rateBandStyle(band, scaleMax)}
                title={`${band.label} bracket: ${formatCurrency(band.start)} to ${band.end >= scaleMax ? `${formatCurrency(scaleMax)}+` : formatCurrency(band.end)}`}
              >
                <span>{currentRateLabel && taxableIncome >= band.start && taxableIncome <= band.end ? currentRateLabel : band.label}</span>
              </div>
            ))}
            {values.map((value) => (
              <div
                key={`${value.label}-${value.tone}-fill`}
                className={`tax-thermometer__value-fill tax-thermometer__value-fill--${value.tone}`}
                style={positionStyle(value.amount)}
                aria-hidden="true"
              />
            ))}
            <div className="tax-thermometer__heat" />
            {visibleMarkers.map((marker) => {
              const isLowerBoundary = lowerBracketBoundary?.amount === marker.amount;
              const isUpperBoundary = upperBracketBoundary?.amount === marker.amount;
              const distance = isLowerBoundary
                ? Math.max(taxableIncome - marker.amount, 0)
                : Math.max(marker.amount - taxableIncome, 0);
              const distanceLabel = isLowerBoundary
                ? `Subtract ${formatCurrencyDetailed(distance)}`
                : isUpperBoundary
                  ? `Add ${formatCurrencyDetailed(distance)}`
                  : "";
              const titleDistance = isLowerBoundary
                ? `${distanceLabel} of taxable income to reach the prior bracket boundary`
                : isUpperBoundary
                  ? `${distanceLabel} of taxable income to enter the ${marker.label} bracket`
                  : `${formatSignedCurrency(taxableIncome - marker.amount)} vs current taxable income`;
              const distanceBubbleAmount = (taxableIncome + marker.amount) / 2;

              return (
                <Fragment key={`${marker.label}-${marker.amount}`}>
                  <div
                    className={`tax-thermometer__tick tax-thermometer__tick--${marker.tone || "default"} ${isLowerBoundary || isUpperBoundary ? "tax-thermometer__tick--adjacent" : ""}`.trim()}
                    style={positionStyle(marker.amount)}
                    title={`${marker.detail}: ${formatCurrency(marker.amount)} (${titleDistance})`}
                  >
                    <span className="tax-thermometer__tick-label">
                      <strong>{formatCurrency(marker.amount)}</strong>
                    </span>
                  </div>
                  {distanceLabel && (
                    <div
                      className={`tax-thermometer__distance-bubble ${isLowerBoundary ? "tax-thermometer__distance-bubble--past" : "tax-thermometer__distance-bubble--away"}`}
                      style={positionStyle(distanceBubbleAmount)}
                      title={titleDistance}
                    >
                      <span className="tax-thermometer__distance-arrow">{isLowerBoundary ? "↓" : "↑"}</span>
                      <span>{distanceLabel}</span>
                    </div>
                  )}
                </Fragment>
              );
            })}
            {values.map((value) => (
              <div
                key={`${value.label}-${value.tone}`}
                className={`tax-thermometer__value tax-thermometer__value--${value.tone}`}
                style={positionStyle(value.amount)}
                title={`${value.label}: ${value.value}`}
              >
                <span className="tax-thermometer__value-label">
                  <em>{value.label}</em>
                  <strong>{value.content || value.value.split("\n").map((line) => <span key={line}>{line}</span>)}</strong>
                </span>
              </div>
            ))}
          </div>
          {stats.length > 0 && (
            <div className="tax-thermometer__stats">
              {stats.map((stat) => (
                <div key={`${stat.label}-${stat.value}`}>
                  {stat.tone && <span className={`tax-thermometer__dot tax-thermometer__dot--${stat.tone}`} />}
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
          )}
          {(footerLabel || footerValue) && (
            <div className="tax-thermometer__footer">
              <span>{footerLabel}</span>
              <strong>{footerValue}</strong>
            </div>
          )}
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

function rateLabelToDecimal(label: string) {
  const parsed = Number(label.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed / 100 : 0;
}

function getReachedTaxRateValue(markers: ThermometerMarker[], taxableIncome: number, fallback: string) {
  return rateLabelToDecimal(getReachedTaxRateLabel(markers, taxableIncome, fallback));
}

function buildCombinedTaxRateMarkers(federalMarkers: ThermometerMarker[], stateMarkers: ThermometerMarker[], stateCode: string, stateName: string, stateBaseRateLabel: string, filingStatus: FilingStatus) {
  const niitThreshold = niitThresholdForStatus(filingStatus);
  const thresholdRows = [
    ...federalMarkers.map((marker) => ({ amount: marker.amount, source: "Federal" })),
    ...stateMarkers.map((marker) => ({ amount: marker.amount, source: stateCode })),
    { amount: niitThreshold, source: "NIIT" },
  ]
    .filter((row) => row.amount > 0)
    .sort((left, right) => left.amount - right.amount);
  const uniqueThresholds = thresholdRows.filter((row, index, rows) => index === 0 || row.amount !== rows[index - 1].amount);

  return uniqueThresholds
    .map((row) => {
      const federalRate = getReachedTaxRateValue(federalMarkers, row.amount, "10%");
      const stateRate = getReachedTaxRateValue(stateMarkers, row.amount, stateBaseRateLabel);
      const niitRate = row.amount >= niitThreshold ? 0.038 : 0;
      const sourceLabel = row.source === "NIIT" ? "NIIT investment-income threshold" : `${row.source} threshold`;
      return {
        amount: row.amount,
        label: formatPercent(federalRate + stateRate + niitRate),
        detail: `Combined federal + ${stateName} marginal rate starts (${sourceLabel})`,
        tone: "tax",
      };
    });
}

type TaxThermometerMode = "combined" | "federal" | "state";

function TaxThermometerModeSelect({ mode, onChange, stateCode, stateName }: { mode: TaxThermometerMode; onChange: (mode: TaxThermometerMode) => void; stateCode: string; stateName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement | null>(null);
  const options: Array<{ mode: TaxThermometerMode; label: string; icons: React.ReactNode }> = [
    { mode: "combined", label: `Fed + ${stateName}`, icons: <><img className="tax-thermometer__title-flag" src={US_FLAG_ICON_URL} alt="United States flag" width={18} height={12} loading="lazy" referrerPolicy="no-referrer" /><span>+</span><StateFlagImage stateCode={stateCode} stateName={stateName} /></> },
    { mode: "federal", label: "Federal", icons: <img className="tax-thermometer__title-flag" src={US_FLAG_ICON_URL} alt="United States flag" width={18} height={12} loading="lazy" referrerPolicy="no-referrer" /> },
    { mode: "state", label: stateName, icons: <StateFlagImage stateCode={stateCode} stateName={stateName} /> },
  ];
  const selected = options.find((option) => option.mode === mode) || options[0];

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
    <div className="tax-thermometer-mode-select" ref={selectRef}>
      <button className="tax-thermometer-mode-select__button" type="button" aria-haspopup="listbox" aria-expanded={isOpen} onClick={() => setIsOpen((current) => !current)}>
        <span className="tax-thermometer-mode-select__icons">{selected.icons}</span>
        <span className="tax-thermometer-mode-select__label">{selected.label}</span>
        <span className="tax-thermometer-mode-select__chevron">▾</span>
      </button>
      {isOpen && (
        <div className="tax-thermometer-mode-select__menu" role="listbox">
          {options.map((option) => (
            <button
              key={option.mode}
              className={`tax-thermometer-mode-select__option ${option.mode === mode ? "tax-thermometer-mode-select__option--selected" : ""}`.trim()}
              type="button"
              role="option"
              aria-selected={option.mode === mode}
              onClick={() => {
                onChange(option.mode);
                setIsOpen(false);
              }}
            >
              <span className="tax-thermometer-mode-select__icons">{option.icons}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TaxThermometerPanel({ federalTaxable, stateTaxable, federalTax, stateTax, filingStatus, stateCode, stateName }: { federalTaxable: number; stateTaxable: number; federalTax: number; stateTax: number; filingStatus: FilingStatus; stateCode: string; stateName: string }) {
  const [thermometerMode, setThermometerMode] = useState<TaxThermometerMode>("combined");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const totalTax = federalTax + stateTax;
  const federalMarkers = federalOrdinaryRateMarkers[filingStatus];
  const stateMarkers = getStateTaxRateMarkers(stateCode, filingStatus);
  const stateBaseRateLabel = getStateTaxBaseRateLabel(stateCode, filingStatus);
  const federalEffectiveRate = federalTaxable > 0 ? federalTax / federalTaxable : 0;
  const stateEffectiveRate = stateTaxable > 0 ? stateTax / stateTaxable : 0;
  const combinedTaxable = Math.max(federalTaxable, stateTaxable);
  const combinedEffectiveRate = federalEffectiveRate + stateEffectiveRate;
  const combinedBaseRateLabel = formatPercent(0.10 + rateLabelToDecimal(stateBaseRateLabel));
  const federalValues: ThermometerValue[] = [
    {
      amount: federalTaxable,
      label: "Taxable income",
      value: formatCurrencyDetailed(federalTaxable),
      tone: "tax",
      content: <span className="tax-thermometer__value-line"><img className="tax-thermometer__value-flag" src={US_FLAG_ICON_URL} alt="United States flag" width={18} height={12} loading="lazy" referrerPolicy="no-referrer" />{formatCurrencyDetailed(federalTaxable)}</span>,
    },
  ];
  const stateValues: ThermometerValue[] = [
    {
      amount: stateTaxable,
      label: "Taxable income",
      value: formatCurrencyDetailed(stateTaxable),
      tone: "tax",
      content: <span className="tax-thermometer__value-line"><StateFlagImage stateCode={stateCode} stateName={stateName} />{formatCurrencyDetailed(stateTaxable)}</span>,
    },
  ];
  const combinedValues: ThermometerValue[] = [
    {
      amount: combinedTaxable,
      label: "Taxable income",
      value: `Federal: ${formatCurrencyDetailed(federalTaxable)}\nState: ${formatCurrencyDetailed(stateTaxable)}`,
      tone: "tax",
      content: (
        <>
          <span className="tax-thermometer__value-line"><img className="tax-thermometer__value-flag" src={US_FLAG_ICON_URL} alt="United States flag" width={18} height={12} loading="lazy" referrerPolicy="no-referrer" />{formatCurrencyDetailed(federalTaxable)}</span>
          <span className="tax-thermometer__value-line"><StateFlagImage stateCode={stateCode} stateName={stateName} />{formatCurrencyDetailed(stateTaxable)}</span>
        </>
      ),
    },
  ];
  const combinedMarkers = buildCombinedTaxRateMarkers(federalMarkers, stateMarkers, stateCode, stateName, stateBaseRateLabel, filingStatus);
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
  const selectedThermometer =
    thermometerMode === "federal"
      ? {
        titleLabel: "Federal Tax",
        subtitle: `Bracket thresholds (${filingStatus.toUpperCase()})`,
        taxableIncome: federalTaxable,
        values: federalValues,
        markers: federalMarkers,
        stats: federalStats,
        footerLabel: "Federal taxable income",
        footerValue: formatCurrencyDetailed(federalTaxable),
        baseRateLabel: "10%",
        currentRateLabel: undefined,
        total: federalTax,
      }
      : thermometerMode === "state"
        ? {
          titleLabel: `${stateName} Tax`,
          subtitle: stateMarkers.length ? `Bracket thresholds (${filingStatus.toUpperCase()})` : "No state income-tax bracket changes",
          taxableIncome: stateTaxable,
          values: stateValues,
          markers: stateMarkers,
          stats: stateStats,
          footerLabel: `${stateCode} taxable income`,
          footerValue: formatCurrencyDetailed(stateTaxable),
          baseRateLabel: stateBaseRateLabel,
          currentRateLabel: undefined,
          total: stateTax,
        }
        : {
          titleLabel: "Federal + State",
          subtitle: "Combined federal + state thresholds",
          taxableIncome: combinedTaxable,
          values: combinedValues,
          markers: combinedMarkers,
          stats: [],
          footerLabel: "",
          footerValue: "",
          baseRateLabel: combinedBaseRateLabel,
          currentRateLabel: formatPercent(combinedEffectiveRate),
          total: totalTax,
        };

  return (
    <div className="tax-thermometer-panel">
      <TaxThermometer title={<TaxThermometerModeSelect mode={thermometerMode} onChange={setThermometerMode} stateCode={stateCode} stateName={stateName} />} titleLabel={selectedThermometer.titleLabel} titleValue={formatCurrencyDetailed(selectedThermometer.total)} subtitle={selectedThermometer.subtitle} taxableIncome={selectedThermometer.taxableIncome} values={selectedThermometer.values} markers={selectedThermometer.markers} stats={selectedThermometer.stats} footerLabel={selectedThermometer.footerLabel} footerValue={selectedThermometer.footerValue} baseRateLabel={selectedThermometer.baseRateLabel} currentRateLabel={selectedThermometer.currentRateLabel} collapsed={isCollapsed} onToggle={() => setIsCollapsed((current) => !current)} />
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
const LOOKUP_TABLE_DRAG_COLUMN_WIDTH = 48;
const LOOKUP_TABLE_ACTION_COLUMN_WIDTH = 42;
const LOOKUP_TABLE_MIN_COLUMN_WIDTH = 82;
const LOOKUP_TABLE_MAX_COLUMN_WIDTH = 480;

function lookupColumnTextWidth(value: unknown, extraPadding = 40) {
  const text = String(value ?? "");
  return text ? Math.ceil(text.length * 7.4) + extraPadding : LOOKUP_TABLE_MIN_COLUMN_WIDTH;
}

function lookupColumnDefaultWidth<T>(column: LookupColumn<T>, rows: T[]) {
  const extraPadding = column.type === "select" ? 62 : column.type === "percent" ? 48 : 40;
  const minWidth = column.type === "checkbox" || column.type === "yesNoCheckbox" || column.type === "invertedYesNoCheckbox"
    ? Math.max(76, lookupColumnTextWidth(column.label, 30))
    : column.type === "percent"
      ? Math.max(92, lookupColumnTextWidth(column.label, extraPadding))
      : Math.max(LOOKUP_TABLE_MIN_COLUMN_WIDTH, lookupColumnTextWidth(column.label, extraPadding));
  const contentWidth = Math.max(
    minWidth,
    ...(column.options || []).map((option) => lookupColumnTextWidth(option, extraPadding)),
    ...rows.map((row) => lookupColumnTextWidth(row[column.key], extraPadding))
  );
  return Math.min(LOOKUP_TABLE_MAX_COLUMN_WIDTH, contentWidth);
}

function LookupTable<T extends { id: number }>({ title, subtitle, rows, columns, onChange, onAdd, onRemove, onRemoveAll, onReorder, showMoveHeaderLabel = true, rowDeleteNextToMove = false }: { title: string; subtitle: string; rows: T[]; columns: Array<LookupColumn<T>>; onChange: (id: number, field: keyof T, value: string | boolean) => void; onAdd: () => void; onRemove: (id: number) => void; onRemoveAll?: () => void; onReorder: (sourceId: number, targetId: number) => void; showMoveHeaderLabel?: boolean; rowDeleteNextToMove?: boolean; }) {
  const [draggingRowId, setDraggingRowId] = useState<number | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<number | null>(null);
  const [isRemoveAllConfirmOpen, setIsRemoveAllConfirmOpen] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const dragPointerYRef = useRef<number | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const dropHandledRef = useRef(false);
  const lookupColumnWidths = useMemo(() => columns.map((column) => lookupColumnDefaultWidth(column, rows)), [columns, rows]);
  const lookupActionColumnWidth = rowDeleteNextToMove ? 0 : LOOKUP_TABLE_ACTION_COLUMN_WIDTH;
  const lookupMoveColumnWidth = rowDeleteNextToMove ? LOOKUP_TABLE_DRAG_COLUMN_WIDTH + LOOKUP_TABLE_ACTION_COLUMN_WIDTH : LOOKUP_TABLE_DRAG_COLUMN_WIDTH;
  const lookupTableWidth = lookupMoveColumnWidth + lookupColumnWidths.reduce((sum, width) => sum + width, 0) + lookupActionColumnWidth;
  const lookupTableStyle = { width: lookupTableWidth, minWidth: lookupTableWidth } as CSSProperties;
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
  const allRowsLabel = `${rows.length} ${title.toLowerCase()} row${rows.length === 1 ? "" : "s"}`;
  const handleRemoveAllRows = () => {
    if (!onRemoveAll || rows.length === 0) return;
    setIsRemoveAllConfirmOpen(true);
  };
  const confirmRemoveAllRows = () => {
    onRemoveAll?.();
    setIsRemoveAllConfirmOpen(false);
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
      const percentValue = Number.isFinite(rawNumberValue) ? formatPercentInputValue(toNumber(rawNumberValue) * 100) : "";
      return (
        <div className="percent-input">
          <input type="number" value={percentValue} step="0.01" onChange={(event) => onChange(row.id, column.key, String(truncatePercentInputValue(toNumber(event.target.value)) / 100))} />
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
        {onRemoveAll && (
          <button className="ghost-button icon-button action-icon-button action-icon-button--danger" type="button" onClick={handleRemoveAllRows} aria-label={`Delete all ${title} rows`} title={rows.length === 0 ? `No ${title} rows to delete` : `Delete all ${title} rows`} disabled={rows.length === 0}><RowActionIcon name="delete" /></button>
        )}
      </div>
      {isRemoveAllConfirmOpen && (
        <div className="confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby={`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-delete-all-confirm-title`}>
          <div>
            <h3 id={`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-delete-all-confirm-title`}>Confirm</h3>
          </div>
          <div className="confirm-panel__actions">
            <button className="ghost-button ghost-button--compact" type="button" onClick={() => setIsRemoveAllConfirmOpen(false)}>Cancel</button>
            <button className="primary-button ghost-button--compact" type="button" onClick={confirmRemoveAllRows}>Remove {allRowsLabel}</button>
          </div>
        </div>
      )}
      <div className="table-wrap table-wrap--tall lookup-table-wrap" ref={tableScrollRef} onDragOver={handleTableDragOver} onDragLeave={handleTableDragLeave}>
        <table className="sheet-table sheet-table--compact sheet-table--lookup" style={lookupTableStyle}>
          <colgroup>
            <col style={{ width: lookupMoveColumnWidth }} />
            {lookupColumnWidths.map((width, index) => <col key={String(columns[index].key)} style={{ width }} />)}
            {!rowDeleteNextToMove && <col style={{ width: LOOKUP_TABLE_ACTION_COLUMN_WIDTH }} />}
          </colgroup>
          <thead>
            <tr><th className={`drag-handle-heading lookup-drag-heading ${rowDeleteNextToMove ? "lookup-drag-heading--with-delete" : ""}`.trim()} aria-label="Move row">{showMoveHeaderLabel ? "Move" : ""}</th>{columns.map((column) => <th key={String(column.key)}>{column.label}</th>)}{!rowDeleteNextToMove && <th />}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`${draggingRowId === row.id ? "lookup-row--dragging" : ""} ${dragOverRowId === row.id && draggingRowId !== row.id ? "lookup-row--drag-over" : ""}`.trim()}
                onDragOver={(event) => handleDragOver(event, row.id)}
                onDrop={(event) => handleDrop(event, row.id)}
              >
                <td className={`drag-handle-cell lookup-drag-cell ${rowDeleteNextToMove ? "lookup-drag-cell--with-delete" : ""}`.trim()}>
                  <button className="drag-handle lookup-drag-handle" type="button" draggable title="Drag row" aria-label={`Move ${title} row`} onDragStart={(event) => handleDragStart(event, row.id)} onDragEnd={handleDragEnd}>::</button>
                  {rowDeleteNextToMove && <button className="ghost-button ghost-button--compact icon-button action-icon-button action-icon-button--danger lookup-inline-delete-button" type="button" onClick={() => onRemove(row.id)} aria-label="Delete row" title="Delete row"><RowActionIcon name="delete" /></button>}
                </td>
                {columns.map((column) => <td key={String(column.key)}>{renderCell(row, column)}</td>)}
                {!rowDeleteNextToMove && <td className="lookup-table__actions"><button className="ghost-button ghost-button--compact icon-button action-icon-button action-icon-button--danger" type="button" onClick={() => onRemove(row.id)} aria-label="Delete row" title="Delete row"><RowActionIcon name="delete" /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function InvestmentsTable({ rows, accountOptions, symbolOptions, tickerMap, stateCode, accountTaxStatusByName, derivedRows, favorites, filters, sort, selectedAssetIds, isWhatIfActive, onToggleWhatIf, onSaveFavorite, onApplyFavorite, onDeleteFavorite, onRenameFavorite, onChange, onAdd, onRemove, onSplit, onReorder, onRemoveIncluded, onClearViewState, onSelectAllInc, onClearAllInc }: { rows: InvestmentRow[]; accountOptions: string[]; symbolOptions: string[]; tickerMap: Record<string, TickerRow>; stateCode: string; accountTaxStatusByName: Record<string, string>; derivedRows: DerivedInvestmentRow[]; favorites: InvestmentFavorite[]; filters: InvestmentFilters; sort: InvestmentSort; selectedAssetIds: number[]; isWhatIfActive: boolean; onToggleWhatIf: () => void; onSaveFavorite: (name: string) => void; onApplyFavorite: (name: string) => void; onDeleteFavorite: (name: string) => void; onRenameFavorite: (oldName: string, newName: string) => void; onChange: (id: number, field: keyof InvestmentRow, value: string | boolean) => void; onAdd: () => void; onRemove: (id: number) => void; onSplit: (id: number, allocations: number[]) => void; onReorder: (sourceId: number, targetId: number) => void; onRemoveIncluded: () => void; onClearViewState: () => void; onSelectAllInc: () => void; onClearAllInc: () => void; }) {
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
  const [splitTarget, setSplitTarget] = useState<InvestmentRow | null>(null);
  const [splitCount, setSplitCount] = useState(2);
  const [splitAllocations, setSplitAllocations] = useState<number[]>([]);
  const [columnWidths, setColumnWidths] = useState<InvestmentColumnWidths>(() => {
    if (typeof window === "undefined") return DEFAULT_INVESTMENT_COLUMN_WIDTHS;
    try {
      const stored = JSON.parse(window.localStorage.getItem(INVESTMENT_COLUMN_WIDTH_STORAGE_KEY) || "{}") as Partial<Record<InvestmentColumnId, number>>;
      return INVESTMENT_COLUMN_DEFS.reduce((acc, column) => {
        const storedWidth = Number(stored[column.id]);
        const migratedStoredWidth = column.id === "normalPercent" && storedWidth === 58
          ? DEFAULT_INVESTMENT_COLUMN_WIDTHS[column.id]
          : storedWidth;
        acc[column.id] = Number.isFinite(storedWidth)
          ? Math.min(INVESTMENT_COLUMN_MAX_WIDTH, Math.max(INVESTMENT_COLUMN_MIN_WIDTHS[column.id], migratedStoredWidth))
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
    if (Math.abs(toNumber(row.totalInvestment)) < 0.005) {
      classes.push("investment-row--zero-investment");
    }
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
  const openSplitDialog = (row: InvestmentRow) => {
    setSplitTarget(row);
    setSplitCount(2);
    setSplitAllocations(distributeAmountEvenly(row.totalInvestment, 2));
  };
  const closeSplitDialog = () => setSplitTarget(null);
  const distributedTotal = splitAllocations.reduce((sum, amount) => sum + toNumber(amount), 0);
  const allocationDifference = splitTarget ? Math.round((splitTarget.totalInvestment - distributedTotal) * 100) / 100 : 0;
  const isAllocationBalanced = Math.abs(allocationDifference) < 0.005;
  const resizeSplitAllocations = (count: number) => {
    const safeCount = Math.min(20, Math.max(2, Math.trunc(count) || 2));
    setSplitCount(safeCount);
    setSplitAllocations((current) => Array.from({ length: safeCount }, (_, index) => current[index] ?? 0));
  };
  const distributeSplitEvenly = () => {
    if (!splitTarget) return;
    setSplitAllocations(distributeAmountEvenly(splitTarget.totalInvestment, splitCount));
  };
  const applyAllocationDifferenceToRow = (targetIndex: number) => {
    if (isAllocationBalanced) return;
    setSplitAllocations((current) => current.map((amount, index) => index === targetIndex
      ? Math.max(0, Math.round((toNumber(amount) + allocationDifference) * 100) / 100)
      : amount));
  };
  const confirmSplitRow = () => {
    if (!splitTarget || !isAllocationBalanced) return;
    onSplit(splitTarget.id, splitAllocations.map((amount) => Math.round(toNumber(amount) * 100) / 100));
    closeSplitDialog();
  };
  useEffect(() => {
    if (!splitTarget) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSplitTarget(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [splitTarget]);
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
    if (group === "tax" || group === "debug") return false;
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
    <Section title="Investments" subtitle="Workbook-style grid with checkbox overrides. When WhatIf is checked, the new asset and return replace the current holding in the downstream tax logic." className="investments-workspace" hideHeading>
      <div className="actions-row">
        <button className="primary-button icon-button action-icon-button" type="button" onClick={onAdd} aria-label="Add row" title="Add row"><RowActionIcon name="add" /></button>
        <button className="ghost-button icon-button action-icon-button" type="button" onClick={() => setIsFavoritesPanelOpen(true)} aria-label="Select rows" title="Select rows"><RowActionIcon name="select" /></button>
        <button className="ghost-button icon-button action-icon-button action-icon-button--danger" type="button" onClick={handleRemoveIncludedRows} aria-label={`Delete ${includedRowsLabel}`} title={includedRowCount === 0 ? "No included rows to delete" : `Delete ${includedRowsLabel}`} disabled={includedRowCount === 0}><RowActionIcon name="delete" /></button>
        <div className="column-toggle-group" role="group" aria-label="Investment column visibility">
          <button className={`ghost-button ghost-button--compact column-toggle ${isWhatIfActive ? "column-toggle--open" : ""}`} type="button" aria-pressed={isWhatIfActive} onClick={onToggleWhatIf}>
            {isWhatIfActive ? "- WhatIf" : "+ WhatIf"}
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
      {splitTarget && createPortal(
        <div className="split-row-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSplitDialog(); }}>
          <div className="split-row-dialog" role="dialog" aria-modal="true" aria-labelledby="split-row-title">
            <div className="split-row-dialog__header">
              <div>
                <p className="eyebrow">Investment Row</p>
                <h3 id="split-row-title">Split {splitTarget.description || splitTarget.symbol || "investment"}</h3>
              </div>
              <button className="ghost-button ghost-button--compact" type="button" onClick={closeSplitDialog}>Close</button>
            </div>
            <p className="split-row-dialog__copy">Creates new rows using the same investment details and the amounts you assign. Stored yearly income is allocated proportionally so the combined totals remain unchanged.</p>
            <div className="split-row-dialog__controls">
              <label className="split-row-dialog__field">
                <span>Number of rows</span>
                <input type="number" min="2" max="20" step="1" value={splitCount} onChange={(event) => resizeSplitAllocations(toNumber(event.target.value))} autoFocus />
              </label>
              <button className="ghost-button" type="button" onClick={distributeSplitEvenly}>Distribute evenly</button>
            </div>
            <div className="split-row-dialog__allocations">
              <table className="split-row-dialog__allocation-table">
                <thead><tr><th>Row</th><th>Investment amount</th><th>Balance</th></tr></thead>
                <tbody>
                  {splitAllocations.map((amount, index) => (
                    <tr key={index}>
                      <td className="split-row-dialog__row-number">{index + 1}</td>
                      <td>
                        <div className="split-row-dialog__currency-input">
                          <span>$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={amount}
                            onChange={(event) => setSplitAllocations((current) => current.map((currentAmount, currentIndex) => currentIndex === index ? toNumber(event.target.value) : currentAmount))}
                            aria-label={`Investment amount for split row ${index + 1}`}
                          />
                        </div>
                      </td>
                      <td className="split-row-dialog__balance-cell">
                        <button
                          className={`split-row-dialog__balance-button ${allocationDifference < 0 ? "split-row-dialog__balance-button--subtract" : ""}`}
                          type="button"
                          disabled={isAllocationBalanced || amount + allocationDifference < -0.005}
                          onClick={() => applyAllocationDifferenceToRow(index)}
                          title={amount + allocationDifference < -0.005 ? "This row is too small to absorb the over-allocation" : "Apply the full allocation difference to this row"}
                        >
                          {isAllocationBalanced
                            ? "Balanced"
                            : `${allocationDifference > 0 ? "Add" : "Subtract"} ${formatCurrencyDetailed(Math.abs(allocationDifference))}`}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="split-row-dialog__summary">
              <div><span>Original investment</span><strong>{formatCurrencyDetailed(splitTarget.totalInvestment)}</strong></div>
              <div className={!isAllocationBalanced ? "split-row-dialog__summary--warning" : ""}><span>Distributed</span><strong>{formatCurrencyDetailed(distributedTotal)}</strong></div>
              <div className={!isAllocationBalanced ? "split-row-dialog__summary--warning" : ""}>
                <span>{allocationDifference < 0 ? "Overallocated" : "Remaining"}</span>
                <strong>{formatCurrencyDetailed(Math.abs(allocationDifference))}</strong>
              </div>
            </div>
            {!isAllocationBalanced && <p className="split-row-dialog__warning">Allocation must equal the original investment before the row can be split.</p>}
            <div className="split-row-dialog__actions">
              <button className="ghost-button" type="button" onClick={closeSplitDialog}>Cancel</button>
              <button className="primary-button" type="button" onClick={confirmSplitRow} disabled={!isAllocationBalanced}>Split into {splitCount} rows</button>
            </div>
          </div>
        </div>,
        document.body
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
              const rowTaxStatus = accountTaxStatusByName[normalizeLookupKey(row.account)] || "";
              const investmentCells = {
                move: <td key="move" className="drag-handle-cell"><div className="investment-row-actions"><button className="drag-handle" type="button" draggable title="Drag row" aria-label={`Move ${row.description || "investment row"}`} onDragStart={(event) => handleDragStart(event, row.id)} onDragEnd={handleDragEnd}>::</button><button className="row-delete-button" type="button" title="Delete row" aria-label={`Delete ${row.description || "investment row"}`} onClick={() => onRemove(row.id)}><RowActionIcon name="delete" /></button><button className="row-split-button" type="button" title="Split row" aria-label={`Split ${row.description || "investment row"}`} onClick={() => openSplitDialog(row)}><RowActionIcon name="split" /></button></div></td>,
                row: <td key="row" className="sheet-row-cell"><div className="readonly-cell readonly-cell--row-id">{row.spreadsheetRowNumber ?? ""}</div></td>,
                included: <td key="included" className="checkbox-cell checkbox-cell--included"><input type="checkbox" checked={row.includeIncome} onChange={(event) => onChange(row.id, "includeIncome", event.target.checked)} aria-label={`Included: ${row.description || "investment row"}`} /></td>,
                account: <td key="account"><AccountSelect value={row.account} options={accountOptions} onChange={(value) => onChange(row.id, "account", value)} ariaLabel={`Account for ${row.description || "investment row"}`} /></td>,
                symbol: <td key="symbol"><AssetSelect value={row.symbol} options={symbolOptions} accountTaxStatus={rowTaxStatus} tickerMap={tickerMap} stateCode={stateCode} onChange={(value) => onChange(row.id, "symbol", value)} ariaLabel={`Asset for ${row.description || row.account || "investment row"}`} /></td>,
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
                overrideSymbol: <td key="overrideSymbol" className="investment-column--override"><AssetSelect value={row.newSymbol} options={symbolOptions} accountTaxStatus={rowTaxStatus} tickerMap={tickerMap} stateCode={stateCode} disabled={!row.overrideProposal} onChange={(value) => onChange(row.id, "newSymbol", value)} ariaLabel={`What-If asset for ${row.description || row.account || "investment row"}`} /></td>,
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
  const [isFederalTaxWhatIfOpen, setIsFederalTaxWhatIfOpen] = useState(false);
  const [isStateTaxWhatIfOpen, setIsStateTaxWhatIfOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [investments, setInvestments] = useState<InvestmentRow[]>(() => authEnabled ? [] : initialInvestments);
  const [tickers, setTickers] = useState(initialTickers);
  const [categories, setCategories] = useState(initialCategories);
  const [taxTreatments, setTaxTreatments] = useState(initialTaxTreatments);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [accountTaxTypes, setAccountTaxTypes] = useState(initialAccountTaxTypes);
  const [accountTypes, setAccountTypes] = useState(initialAccountTypes);
  const [federalSettings, setFederalSettings] = useState(initialFederalSettings);
  const [stateSettings, setStateSettings] = useState(initialStateSettings);
  const [plannerSettings, setPlannerSettings] = useState(initialPlannerSettings);
  const [uiSettings, setUiSettings] = useState(initialUiSettings);
  const selectedStateCode = normalizeStateCode(stateSettings.stateCode);
  const selectedStateName = stateNameByCode[selectedStateCode] || selectedStateCode;
  const [isSheetPanelOpen, setIsSheetPanelOpen] = useState(false);
  const [federalResult, setFederalResult] = useState<TaxResult | null>(null);
  const [stateResult, setStateResult] = useState<TaxResult | null>(null);
  const [federalError, setFederalError] = useState<string | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [storageState, setStorageState] = useState<SaveState>("loading");
  const [mcpTokenMessage, setMcpTokenMessage] = useState("");
  const [isCreatingMcpToken, setIsCreatingMcpToken] = useState(false);
  const [isTopbarMenuOpen, setIsTopbarMenuOpen] = useState(false);
  const [versionDialogMode, setVersionDialogMode] = useState<"save" | "restore" | null>(null);
  const [versionName, setVersionName] = useState("");
  const [versionDialogError, setVersionDialogError] = useState("");
  const [renamingVersionId, setRenamingVersionId] = useState("");
  const [renameVersionValue, setRenameVersionValue] = useState("");
  const [isCameraFlashing, setIsCameraFlashing] = useState(false);
  const [cameraFlashOrigin, setCameraFlashOrigin] = useState({ x: window.innerWidth - 154, y: 108 });
  const [incomeSnapshot, setIncomeSnapshot] = useState<IncomeSnapshot | null>(null);
  const saveTimeout = useRef<number | null>(null);
  const topbarMenuRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedStorage = useRef(false);
  const historyRef = useRef<{ past: string[]; present: string; future: string[] }>({ past: [], present: "", future: [] });
  const historyInitialized = useRef(false);
  const isApplyingHistory = useRef(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const authToken = authState.status === "signedIn" ? authState.tokens.idToken : undefined;
  const requiresSignIn = authEnabled && authState.status !== "signedIn";
  const currentHistorySnapshot = useMemo<PortfolioHistorySnapshot>(() => ({
    investments,
    tickers,
    categories,
    taxTreatments,
    accounts,
    accountTaxTypes,
    accountTypes,
    federalSettings,
    stateSettings,
    plannerSettings,
    uiSettings: { investmentFavorites: uiSettings.investmentFavorites },
    isWhatIfActive,
  }), [investments, tickers, categories, taxTreatments, accounts, accountTaxTypes, accountTypes, federalSettings, stateSettings, plannerSettings, uiSettings.investmentFavorites, isWhatIfActive]);
  const currentHistorySerialized = useMemo(() => JSON.stringify(currentHistorySnapshot), [currentHistorySnapshot]);

  const resetHistoryTracking = useCallback(() => {
    historyRef.current = { past: [], present: "", future: [] };
    historyInitialized.current = false;
    isApplyingHistory.current = false;
    setHistoryVersion((version) => version + 1);
  }, []);

  const applyModelDataSnapshot = useCallback((snapshot: ModelDataSnapshot, suppressHistory = false) => {
    if (suppressHistory) isApplyingHistory.current = true;
    setInvestments(snapshot.investments);
    setTickers(snapshot.tickers);
    setCategories(snapshot.categories);
    setTaxTreatments(snapshot.taxTreatments);
    setAccounts(snapshot.accounts);
    setAccountTaxTypes(snapshot.accountTaxTypes);
    setAccountTypes(snapshot.accountTypes);
    setFederalSettings(normalizeFederalSettings(snapshot.federalSettings));
    setStateSettings(snapshot.stateSettings);
    setPlannerSettings(snapshot.plannerSettings);
    setUiSettings((current) => ({
      investmentFavorites: snapshot.uiSettings.investmentFavorites,
      modelVersions: current.modelVersions,
      incomePrimaryPeriod: current.incomePrimaryPeriod,
    }));
    setIsWhatIfActive(snapshot.isWhatIfActive);
    setStorageState("ready");
  }, []);

  const applyHistorySnapshot = useCallback((serialized: string) => {
    applyModelDataSnapshot(JSON.parse(serialized) as PortfolioHistorySnapshot, true);
  }, [applyModelDataSnapshot]);

  const undoWorkbookChange = useCallback(() => {
    const history = historyRef.current;
    const previous = history.past.pop();
    if (!previous) return;
    if (history.present) history.future.push(history.present);
    history.present = previous;
    applyHistorySnapshot(previous);
    setHistoryVersion((version) => version + 1);
  }, [applyHistorySnapshot]);

  const redoWorkbookChange = useCallback(() => {
    const history = historyRef.current;
    const next = history.future.pop();
    if (!next) return;
    if (history.present) history.past.push(history.present);
    history.present = next;
    applyHistorySnapshot(next);
    setHistoryVersion((version) => version + 1);
  }, [applyHistorySnapshot]);

  void historyVersion;
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

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

  useEffect(() => {
    if (!versionDialogMode) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeVersionDialog();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [versionDialogMode]);

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

  const copySpreadsheetSyncToken = async () => {
    if (!authToken) {
      setMcpTokenMessage("Sign in first.");
      return;
    }

    setIsCreatingMcpToken(true);
    setMcpTokenMessage("Creating spreadsheet sync token...");
    try {
      const result = await createMcpConnectorToken(WORKSPACE_ID, authToken, "Google Sheet sync");
      await navigator.clipboard.writeText(result.token || "");
      setMcpTokenMessage("Spreadsheet sync token copied.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create spreadsheet sync token.";
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
  const accountTaxStatusByName = useMemo(() => buildAccountTaxStatusMap(accounts, accountTypes), [accounts, accountTypes]);
  const accountTaxStatusOptions = useMemo(() => {
    const values = accountTaxTypes
      .map((row) => String(row.taxStatus || "").trim())
      .filter(Boolean);
    const fromAccountTypes = accountTypes
      .map((row) => String(row.taxStatus || "").trim())
      .filter(Boolean);
    return ["", ...new Set([...values, ...fromAccountTypes])];
  }, [accountTaxTypes, accountTypes]);
  const accountTypeOptions = useMemo(() => {
    const values = accountTypes
      .map((row) => String(row.name || "").trim())
      .filter(Boolean);
    const fromAccounts = accounts
      .map((row) => String(row.accountType || "").trim())
      .filter(Boolean);
    return ["", ...new Set([...values, ...fromAccounts])];
  }, [accountTypes, accounts]);
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
        .filter((value, index, array) => array.indexOf(value) === index)
        .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })),
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

  const splitInvestmentRow = (id: number, requestedAllocations: number[]) => {
    const investmentAmounts = requestedAllocations.slice(0, 20).map((amount) => Math.round(toNumber(amount) * 100) / 100);
    if (investmentAmounts.length < 2) return;
    setInvestments((current) => {
      const sourceIndex = current.findIndex((row) => row.id === id);
      if (sourceIndex < 0) return current;
      const sourceRow = current[sourceIndex];
      const allocatedTotal = investmentAmounts.reduce((sum, amount) => sum + amount, 0);
      if (Math.abs(allocatedTotal - sourceRow.totalInvestment) >= 0.005) return current;
      const yearlyIncomeAmounts = distributeAmountProportionally(sourceRow.yearlyIncome, investmentAmounts);
      let nextId = Math.max(Date.now(), ...current.map((row) => row.id + 1));
      const splitRows = investmentAmounts.map((totalInvestment, index) => ({
        ...sourceRow,
        id: index === 0 ? sourceRow.id : nextId++,
        spreadsheetRowNumber: index === 0 ? sourceRow.spreadsheetRowNumber : undefined,
        totalInvestment,
        yearlyIncome: yearlyIncomeAmounts[index],
      }));
      return [...current.slice(0, sourceIndex), ...splitRows, ...current.slice(sourceIndex + 1)];
    });
    setStorageState("ready");
  };

  const derivedRows = useMemo<DerivedInvestmentRow[]>(() => investments.map((row) => {
    const currentTicker = isPlaceholderAssetSymbol(row.symbol) ? undefined : tickerMap[normalizeLookupKey(row.symbol)];
    const isRowWhatIfActive = isWhatIfActive && row.overrideProposal;
    const effectiveSymbol = isRowWhatIfActive && row.newSymbol ? row.newSymbol : row.symbol;
    const proposedTicker = row.newSymbol ? tickerMap[normalizeLookupKey(row.newSymbol)] : undefined;
    const effectiveTicker = isPlaceholderAssetSymbol(effectiveSymbol) ? undefined : tickerMap[normalizeLookupKey(effectiveSymbol)] || currentTicker;
    const totalInvestment = toNumber(row.totalInvestment);
    const currentPercent = normalizeRate(currentTicker?.percentReturn || 0);
    const proposedPercent = normalizeRate(proposedTicker?.percentReturn ?? row.newPercent);
    const effectivePercent = isRowWhatIfActive ? proposedPercent || currentPercent : currentPercent;
    const importedYearlyIncome = toNumber(row.yearlyIncome);
    const incomeItem = Boolean(effectiveTicker?.incomeItem) || (totalInvestment === 0 && importedYearlyIncome !== 0);
    const yearlyIncome = incomeItem ? importedYearlyIncome : totalInvestment * effectivePercent;
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
    const currentTaxTreatment = String(currentTicker?.taxTreatment || "income").toLowerCase();
    const proposedTaxTreatment = String(proposedTicker?.taxTreatment || "income").toLowerCase();
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
      currentAssetTaxTone: getAssetTaxTone(taxStatus, currentTaxTreatment, selectedStateCode),
      proposedAssetTaxTone: getAssetTaxTone(taxStatus, proposedTaxTreatment, selectedStateCode),
      investmentType,
      ordinaryMonthly: fedTaxAdjust(taxableMonthlyBase, taxTreatment, false),
      preferredMonthly: fedTaxAdjust(taxableMonthlyBase, taxTreatment, true),
      stateMonthly: stateTaxAdjust(taxableMonthlyBase, taxTreatment, selectedStateCode),
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
    acc.totalIncome += row.filteredIncome;
    acc.displayIncome += row.displayFilteredIncome;
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
  }, { totalInvestmentAmount: 0, totalIncome: 0, displayIncome: 0, federalOrdinary: 0, federalPreferred: 0, stateTaxable: 0, nonTaxableIncome: 0, nonInvestmentIncome: 0, muniIncome: 0, cash: 0, stocks: 0, preferredStock: 0, bonds: 0, muniBond: 0, businessDevelopment: 0, coveredCall: 0, realEstate: 0, bitcoin: 0 }), [derivedRows]);
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

  const extraOrdinaryWhatIfTotal = sumTaxWhatIfItems(federalSettings.extraOrdinaryItems, federalSettings.extraOrdinaryIncome);
  const extraPreferredWhatIfTotal = sumTaxWhatIfItems(federalSettings.extraPreferredItems, federalSettings.extraPreferredIncome);
  const effectiveExtraOrdinaryIncome = isFederalTaxWhatIfOpen ? extraOrdinaryWhatIfTotal : 0;
  const effectiveExtraPreferredIncome = isFederalTaxWhatIfOpen ? extraPreferredWhatIfTotal : 0;
  const effectiveExtraStateIncome = isStateTaxWhatIfOpen ? stateSettings.extraStateIncome : 0;
  const ordinaryBeforeDeductions = flows.federalOrdinary + effectiveExtraOrdinaryIncome;
  const preferredBeforeDeductions = flows.federalPreferred + effectiveExtraPreferredIncome;
  const grossFederalTaxable = ordinaryBeforeDeductions + preferredBeforeDeductions;
  const federalTaxableInvestmentIncome = flows.federalOrdinary + flows.federalPreferred;
  const stateInvestmentAdjustment = flows.stateTaxable - federalTaxableInvestmentIncome;
  const federalWhatIfIncome = effectiveExtraOrdinaryIncome + effectiveExtraPreferredIncome;
  const stateGross = federalTaxableInvestmentIncome + stateInvestmentAdjustment + federalWhatIfIncome + effectiveExtraStateIncome;
  const stateItemized = stateSettings.mortgageInterest + stateSettings.propertyTax;
  const stateDeduction = Math.max(stateSettings.standardDeduction, stateItemized);
  const stateTaxableAfterDeductions = Math.max(stateGross - stateDeduction, 0);
  const localStateResult = localStateTax2025(stateTaxableAfterDeductions, selectedStateCode, federalSettings.filingStatus);
  const hasMatchingStateResult =
    stateResult?.state === selectedStateCode &&
    typeof stateResult.taxableIncome === "number" &&
    Math.abs(stateResult.taxableIncome - stateTaxableAfterDeductions) < 0.01 &&
    !(stateResult.tax === 0 && localStateResult.tax > 0);
  const displayedStateResult = hasMatchingStateResult ? stateResult : localStateResult;
  const itemizedFederalDeduction = Math.min(federalSettings.propertyTax + displayedStateResult.tax, federalSettings.saltCap) + federalSettings.mortgageInterest;
  const federalDeduction = Math.max(federalSettings.standardDeduction, itemizedFederalDeduction);
  const federalTaxableAfterDeductions = Math.max(grossFederalTaxable - federalDeduction, 0);
  const prefTaxable = Math.min(preferredBeforeDeductions, federalTaxableAfterDeductions);
  const ordinaryTaxable = Math.max(federalTaxableAfterDeductions - prefTaxable, 0);
  const magi = grossFederalTaxable;
  const netInvestmentIncome = Math.max(ordinaryBeforeDeductions + preferredBeforeDeductions - flows.nonInvestmentIncome, 0);
  const niitThreshold = niitThresholdForStatus(federalSettings.filingStatus);
  const niitBase = Math.max(Math.min(netInvestmentIncome, Math.max(magi - niitThreshold, 0)), 0);
  const hasRealData = useMemo(
    () => investments.some((row) => row.totalInvestment > 0 || row.yearlyIncome > 0 || row.includeIncome),
    [investments]
  );
  useEffect(() => {
    if (authEnabled && authState.status !== "signedIn") {
      hasLoadedStorage.current = false;
      resetHistoryTracking();
      setStorageState(authState.status === "loading" ? "loading" : "ready");
      return;
    }

    let cancelled = false;
    hasLoadedStorage.current = false;
    resetHistoryTracking();
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
      const activeInvestments = authenticatedWorkbook && isStarterInvestmentSet(loadedInvestments) ? [] : loadedInvestments;
      setInvestments(activeInvestments);
      setIsWhatIfActive(activeInvestments.some((row) => row.overrideProposal));
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
      setAccountTypes(
        mapWorkbookRows(initialAccountTypes, response.tabs?.accountType, workbookToAccountTypeRow)
      );
      setFederalSettings(normalizeFederalSettings(workbookSettings.federal));
      setStateSettings(mergeSettings(initialStateSettings, workbookSettings.state));
      setPlannerSettings(mergeSettings(initialPlannerSettings, workbookSettings.planner));
      setUiSettings({
        investmentFavorites: workbookSettings.ui?.investmentFavorites || [],
        modelVersions: workbookSettings.ui?.modelVersions || [],
        incomePrimaryPeriod: workbookSettings.ui?.incomePrimaryPeriod || "annual",
      });
      hasLoadedStorage.current = true;
      setStorageState("ready");
    }).catch((error: Error) => {
      console.error(error);
      setStorageState("error");
      hasLoadedStorage.current = true;
    });
    return () => { cancelled = true; };
  }, [authEnabled, authState.status, authToken, resetHistoryTracking]);

  useEffect(() => {
    if (!hasLoadedStorage.current) return;
    const history = historyRef.current;
    if (!historyInitialized.current) {
      history.present = currentHistorySerialized;
      historyInitialized.current = true;
      setHistoryVersion((version) => version + 1);
      return;
    }
    if (isApplyingHistory.current) {
      isApplyingHistory.current = false;
      history.present = currentHistorySerialized;
      return;
    }
    if (history.present === currentHistorySerialized) return;
    if (history.present) {
      history.past.push(history.present);
      if (history.past.length > WORKBOOK_HISTORY_LIMIT) history.past.shift();
    }
    history.present = currentHistorySerialized;
    history.future = [];
    setHistoryVersion((version) => version + 1);
  }, [currentHistorySerialized]);

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], .split-row-dialog")) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redoWorkbookChange();
        else undoWorkbookChange();
      } else if (key === "y") {
        event.preventDefault();
        redoWorkbookChange();
      }
    };
    document.addEventListener("keydown", handleHistoryShortcut);
    return () => document.removeEventListener("keydown", handleHistoryShortcut);
  }, [redoWorkbookChange, undoWorkbookChange]);

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
        if (!cancelled) { setStateResult(null); setStateError(isUnknownCalcError(error) ? null : error.message); }
      });
    }, 220);

    return () => { cancelled = true; window.clearTimeout(timeoutId); };
    }, [ordinaryTaxable, prefTaxable, federalSettings.filingStatus, magi, netInvestmentIncome, stateTaxableAfterDeductions, selectedStateCode]);



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
      saveWorkbook(WORKSPACE_ID, { workspaceId: WORKSPACE_ID, tabs: { investments: persistedInvestments, tickers, categories, taxTreatment: taxTreatments, accounts, accountTaxType: accountTaxTypes, accountType: accountTypes }, settings: { federal: federalSettings, state: stateSettings, planner: plannerSettings, ui: uiSettings } }, authToken).then(() => {
        if (!cancelled) { setStorageState("saved"); }
      }).catch((error: Error) => {
        console.error(error);
        if (!cancelled) { setStorageState("error"); }
      });
      return () => { cancelled = true; };
    }, 700);
    return () => { if (saveTimeout.current) window.clearTimeout(saveTimeout.current); };
  }, [investments, persistedInvestments, tickers, categories, taxTreatments, accounts, accountTaxTypes, accountTypes, federalSettings, stateSettings, plannerSettings, uiSettings, hasRealData, authEnabled, authState.status, authToken]);

  const calculatedTotalTax = (federalResult?.tax || 0) + displayedStateResult.tax;
  const totalIncome = flows.totalIncome;
  const totalTax = calculatedTotalTax;
  const afterTaxIncome = flows.displayIncome - totalTax;
  const monthlyIncome = totalIncome / 12;
  const afterTaxMonthlyIncome = afterTaxIncome / 12;
  const portfolioYield = flows.totalInvestmentAmount > 0 ? totalIncome / flows.totalInvestmentAmount : 0;
  const currentIncomeSnapshot: IncomeSnapshotValues = {
    beforeTaxAnnual: totalIncome,
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
  const playCameraShutter = () => {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const audioContext = new AudioContextCtor();
    const playTone = (startOffset: number, frequency: number, gain: number, duration: number, type: OscillatorType = "square") => {
      const oscillator = audioContext.createOscillator();
      const clickGain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + startOffset);
      clickGain.gain.setValueAtTime(0.0001, audioContext.currentTime + startOffset);
      clickGain.gain.exponentialRampToValueAtTime(gain, audioContext.currentTime + startOffset + 0.004);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + startOffset + duration);
      oscillator.connect(clickGain).connect(audioContext.destination);
      oscillator.start(audioContext.currentTime + startOffset);
      oscillator.stop(audioContext.currentTime + startOffset + duration);
    };
    const playNoise = (startOffset: number, gain: number, duration: number, highpass: number) => {
      const sampleCount = Math.max(1, Math.floor(audioContext.sampleRate * duration));
      const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let index = 0; index < sampleCount; index += 1) {
        samples[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount);
      }
      const source = audioContext.createBufferSource();
      const filter = audioContext.createBiquadFilter();
      const noiseGain = audioContext.createGain();
      source.buffer = buffer;
      filter.type = "highpass";
      filter.frequency.setValueAtTime(highpass, audioContext.currentTime + startOffset);
      noiseGain.gain.setValueAtTime(0.0001, audioContext.currentTime + startOffset);
      noiseGain.gain.exponentialRampToValueAtTime(gain, audioContext.currentTime + startOffset + 0.003);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + startOffset + duration);
      source.connect(filter).connect(noiseGain).connect(audioContext.destination);
      source.start(audioContext.currentTime + startOffset);
      source.stop(audioContext.currentTime + startOffset + duration);
    };
    playNoise(0, 0.16, 0.032, 1600);
    playTone(0.006, 190, 0.11, 0.058, "triangle");
    playTone(0.052, 520, 0.07, 0.035, "square");
    playNoise(0.078, 0.09, 0.045, 900);
    playTone(0.126, 145, 0.045, 0.08, "triangle");
    window.setTimeout(() => void audioContext.close(), 360);
  };
  const captureIncomeSnapshot = (origin: { x: number; y: number }) => {
    setIncomeSnapshot({ ...currentIncomeSnapshot, capturedAt: new Date().toISOString() });
    setCameraFlashOrigin(origin);
    playCameraShutter();
    setIsCameraFlashing(false);
    window.setTimeout(() => setIsCameraFlashing(true), 0);
    window.setTimeout(() => setIsCameraFlashing(false), 640);
  };
  const closeVersionDialog = () => {
    setVersionDialogMode(null);
    setVersionDialogError("");
    setRenamingVersionId("");
    setRenameVersionValue("");
  };
  const openSaveVersionDialog = () => {
    const defaultName = `Version ${new Date().toLocaleString([], { dateStyle: "short", timeStyle: "short" })}`;
    setIsTopbarMenuOpen(false);
    setVersionName(defaultName);
    setVersionDialogError("");
    setVersionDialogMode("save");
  };
  const openRestoreVersionDialog = () => {
    setIsTopbarMenuOpen(false);
    setVersionDialogError("");
    setRenamingVersionId("");
    setVersionDialogMode("restore");
  };
  const saveNamedModelVersion = () => {
    const name = normalizeFavoriteName(versionName);
    if (!name) {
      setVersionDialogError("Enter a version name.");
      return;
    }
    if (uiSettings.modelVersions.some((version) => normalizeLookupKey(version.name) === normalizeLookupKey(name))) {
      setVersionDialogError("A version with this name already exists.");
      return;
    }
    if (uiSettings.modelVersions.length >= MODEL_VERSION_LIMIT) {
      setVersionDialogError(`You can save up to ${MODEL_VERSION_LIMIT} versions. Delete one before saving another.`);
      return;
    }
    const now = new Date().toISOString();
    const nextVersion: ModelVersion = {
      id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `version-${Date.now()}`,
      name,
      createdAt: now,
      updatedAt: now,
      snapshot: JSON.parse(currentHistorySerialized) as ModelDataSnapshot,
    };
    setUiSettings((current) => ({ ...current, modelVersions: [nextVersion, ...current.modelVersions] }));
    setStorageState("ready");
    closeVersionDialog();
  };
  const restoreNamedModelVersion = (versionId: string) => {
    const version = uiSettings.modelVersions.find((entry) => entry.id === versionId);
    if (!version) {
      setVersionDialogError("That saved version is no longer available.");
      return;
    }
    applyModelDataSnapshot(JSON.parse(JSON.stringify(version.snapshot)) as ModelDataSnapshot);
    closeVersionDialog();
  };
  const beginRenameModelVersion = (version: ModelVersion) => {
    setRenamingVersionId(version.id);
    setRenameVersionValue(version.name);
    setVersionDialogError("");
  };
  const saveRenamedModelVersion = () => {
    const name = normalizeFavoriteName(renameVersionValue);
    if (!name) {
      setVersionDialogError("Enter a version name.");
      return;
    }
    const nameKey = normalizeLookupKey(name);
    if (uiSettings.modelVersions.some((version) => version.id !== renamingVersionId && normalizeLookupKey(version.name) === nameKey)) {
      setVersionDialogError("A version with this name already exists.");
      return;
    }
    setUiSettings((current) => ({
      ...current,
      modelVersions: current.modelVersions.map((version) => version.id === renamingVersionId
        ? { ...version, name, updatedAt: new Date().toISOString() }
        : version),
    }));
    setRenamingVersionId("");
    setRenameVersionValue("");
    setVersionDialogError("");
    setStorageState("ready");
  };
  const deleteNamedModelVersion = (versionId: string) => {
    setUiSettings((current) => ({ ...current, modelVersions: current.modelVersions.filter((version) => version.id !== versionId) }));
    if (renamingVersionId === versionId) {
      setRenamingVersionId("");
      setRenameVersionValue("");
    }
    setStorageState("ready");
  };
  const actionMenu = (
    <div className="topbar-menu app-action-menu" ref={topbarMenuRef}>
      <button className="ai-button topbar-menu__trigger app-action-menu__trigger" type="button" onClick={() => setIsTopbarMenuOpen((current) => !current)} aria-haspopup="menu" aria-expanded={isTopbarMenuOpen} aria-label="Open actions menu" title="Menu">
        <TopbarActionIcon name="menu" />
        <AfterTaxUSMark className="app-action-menu__mark" idSuffix="menu" />
        <span className="app-action-menu__brand">AfterTax US</span>
      </button>
      <div className="header-history-controls" role="group" aria-label="Change history">
        <button type="button" onClick={undoWorkbookChange} disabled={!canUndo} title="Undo last change (Ctrl+Z)" aria-label="Undo last change"><span aria-hidden="true">↶</span></button>
        <button type="button" onClick={redoWorkbookChange} disabled={!canRedo} title="Redo last change (Ctrl+Y or Ctrl+Shift+Z)" aria-label="Redo last change"><span aria-hidden="true">↷</span></button>
      </div>
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
                <button className="topbar-menu__item" type="button" role="menuitem" onClick={() => { setIsTopbarMenuOpen(false); void copySpreadsheetSyncToken(); }} disabled={isCreatingMcpToken}>
                  <TopbarActionIcon name="copy" />
                  <span>{isCreatingMcpToken ? "Creating token..." : "Copy Sheet Sync Token"}</span>
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
          <button className="topbar-menu__item" type="button" role="menuitem" onClick={openSaveVersionDialog}>
            <TopbarActionIcon name="copy" />
            <span>Save Version</span>
          </button>
          <button className="topbar-menu__item" type="button" role="menuitem" onClick={openRestoreVersionDialog}>
            <TopbarActionIcon name="history" />
            <span>Restore Version</span>
          </button>
          <a className="topbar-menu__item" href={CHATGPT_URL} target="_blank" rel="noreferrer" role="menuitem" onClick={() => setIsTopbarMenuOpen(false)}>
            <TopbarActionIcon name="chat" />
            <span>ChatGPT</span>
          </a>
        </div>
      )}
    </div>
  );
  const isMonthlyIncomePrimary = uiSettings.incomePrimaryPeriod === "monthly";
  const kpiMetrics: KpiMetricConfig[] = [
    {
      label: `${isMonthlyIncomePrimary ? "Monthly" : "Annual"} after-tax income`,
      value: formatCurrency(isMonthlyIncomePrimary ? afterTaxMonthlyIncome : afterTaxIncome),
      secondaryValue: `${formatCurrency(isMonthlyIncomePrimary ? afterTaxIncome : afterTaxMonthlyIncome)} ${isMonthlyIncomePrimary ? "annual" : "monthly"}`,
      numericValue: isMonthlyIncomePrimary ? afterTaxMonthlyIncome : afterTaxIncome,
      primary: true,
      tone: "warning",
    },
    {
      label: `${isMonthlyIncomePrimary ? "Monthly" : "Annual"} income`,
      value: formatCurrency(isMonthlyIncomePrimary ? monthlyIncome : totalIncome),
      secondaryValue: `${formatCurrency(isMonthlyIncomePrimary ? totalIncome : monthlyIncome)} ${isMonthlyIncomePrimary ? "annual" : "monthly"}`,
      numericValue: isMonthlyIncomePrimary ? monthlyIncome : totalIncome,
    },
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
    accountTypes,
    flows,
    metrics: {
      totalInvestmentAmount: flows.totalInvestmentAmount,
      totalIncome,
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
    if (config.tableId === "tickers" && field === "percentReturn") return normalizeRate(value as string | number | boolean | null | undefined);
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
        select: "includeIncome",
        selected: "includeIncome",
        checkmark: "includeIncome",
        checkbox: "includeIncome",
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
        dividend: "percentReturn",
        dividendpercent: "percentReturn",
        dividendpercentage: "percentReturn",
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
        accounttype: "accountType",
        type: "accountType",
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
      accountType: {
        accounttype: "name",
        type: "name",
        label: "name",
        name: "name",
        taxstatus: "taxStatus",
        taxtreatment: "taxStatus",
        status: "taxStatus",
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
      accounttype: "accountType",
      accounttypes: "accountType",
      accttype: "accountType",
      accttypes: "accountType",
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
          allowedFields: ["account", "accountType", "taxStatus", "dividendAccrued", "includeInFreeCashflow"],
          numericFields: [],
          booleanFields: [],
          defaultRow: (id) => ({ id, account: "", accountType: "Brokerage Account", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" }),
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
      case "accountType":
        return {
          tableId: id,
          label: "account type",
          tab: "accountType",
          rows: asEditable(accountTypes),
          setRows: wrapSetter(setAccountTypes),
          allowedFields: ["name", "taxStatus"],
          numericFields: [],
          booleanFields: [],
          defaultRow: (id) => ({ id, name: "", taxStatus: "" }),
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
      accountType: "name",
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
      const requestedField = (action as any).payload?.field || "includeIncome";
      const field = requestedField === "select" ? "includeIncome" : requestedField as "includeIncome" | "overrideProposal";
      if (!Number.isFinite(id) || typeof checked !== "boolean" || (field !== "includeIncome" && field !== "overrideProposal")) {
        return { ok: false, message: "Rejected setCheckbox: invalid id, checked value, or checkbox field." };
      }
      if (!investments.some((row) => row.id === id)) return { ok: false, message: `Rejected setCheckbox: investment ${id} was not found.` };
      setInvestments((current) => current.map((row) => row.id === id ? { ...row, [field]: checked } : row));
      return { ok: true, message: `Updated ${field} for investment ${id}.` };
    }

    if (actionType === "setAllCheckboxes") {
      const payload = (action as any).payload || {};
      const requestedField = payload.field || "includeIncome";
      const field = requestedField === "select" ? "includeIncome" : requestedField as "includeIncome" | "overrideProposal";
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
      {isCameraFlashing && (
        <div
          className="camera-flash"
          style={{ "--camera-flash-x": `${cameraFlashOrigin.x}px`, "--camera-flash-y": `${cameraFlashOrigin.y}px` } as CSSProperties}
          aria-hidden="true"
        >
          <span className="camera-flash__source" />
        </div>
      )}
      {versionDialogMode && createPortal(
        <div className="model-version-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeVersionDialog(); }}>
          <section className="model-version-dialog" role="dialog" aria-modal="true" aria-labelledby="model-version-title">
            <div className="model-version-dialog__header">
              <div>
                <p className="eyebrow">Entire Data Model</p>
                <h3 id="model-version-title">{versionDialogMode === "save" ? "Save Version" : "Restore Version"}</h3>
              </div>
              <button className="ghost-button ghost-button--compact" type="button" onClick={closeVersionDialog}>Close</button>
            </div>
            {versionDialogMode === "save" ? (
              <>
                <p className="model-version-dialog__copy">Save every investment, account, asset, lookup table, tax setting, planner setting, favorite, and WhatIf selection as one named version.</p>
                <label className="model-version-dialog__field">
                  <span>Version name</span>
                  <input value={versionName} onChange={(event) => { setVersionName(event.target.value); setVersionDialogError(""); }} onKeyDown={(event) => { if (event.key === "Enter") saveNamedModelVersion(); }} autoFocus />
                </label>
                <div className="model-version-dialog__capacity">{uiSettings.modelVersions.length} of {MODEL_VERSION_LIMIT} versions saved</div>
                {versionDialogError && <p className="model-version-dialog__error">{versionDialogError}</p>}
                <div className="model-version-dialog__actions">
                  <button className="ghost-button" type="button" onClick={closeVersionDialog}>Cancel</button>
                  <button className="primary-button" type="button" onClick={saveNamedModelVersion}>Save Version</button>
                </div>
              </>
            ) : (
              <>
                <p className="model-version-dialog__copy">Restoring replaces the current data model. You can immediately undo the restore from the header controls.</p>
                {versionDialogError && <p className="model-version-dialog__error">{versionDialogError}</p>}
                <div className="model-version-list">
                  {uiSettings.modelVersions.length === 0 && <div className="model-version-list__empty">No saved versions yet.</div>}
                  {uiSettings.modelVersions.map((version) => (
                    <div className="model-version-row" key={version.id}>
                      <div className="model-version-row__identity">
                        {renamingVersionId === version.id ? (
                          <input value={renameVersionValue} onChange={(event) => setRenameVersionValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveRenamedModelVersion(); }} aria-label={`Rename ${version.name}`} autoFocus />
                        ) : <strong>{version.name}</strong>}
                        <small>Saved {new Date(version.createdAt).toLocaleString()}</small>
                      </div>
                      <div className="model-version-row__actions">
                        {renamingVersionId === version.id ? (
                          <>
                            <button className="ghost-button ghost-button--compact" type="button" onClick={saveRenamedModelVersion}>Save name</button>
                            <button className="ghost-button ghost-button--compact" type="button" onClick={() => { setRenamingVersionId(""); setRenameVersionValue(""); setVersionDialogError(""); }}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="primary-button primary-button--compact" type="button" onClick={() => restoreNamedModelVersion(version.id)}>Restore</button>
                            <button className="ghost-button ghost-button--compact" type="button" onClick={() => beginRenameModelVersion(version)}>Rename</button>
                            <button className="ghost-button ghost-button--compact model-version-row__delete" type="button" onClick={() => deleteNamedModelVersion(version.id)}>Delete</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>,
        document.body
      )}
      <header className="app-top-nav" aria-label="Application menu">
        <div className="app-top-nav__inner">
          {actionMenu}
          <CompactKpiHeader
            metrics={kpiMetrics}
          >
            <IncomePeriodToggle
              period={uiSettings.incomePrimaryPeriod}
              onChange={(incomePrimaryPeriod) => setUiSettings((current) => ({ ...current, incomePrimaryPeriod }))}
            />
          </CompactKpiHeader>
        </div>
      </header>
      <div className={`workspace-shell ${focusGrid ? "workspace-shell--focus-grid" : !showThermometerRail ? "workspace-shell--tax-collapsed" : ""}`}>
        <aside className="sidebar">
          <nav className="sidebar__nav">
            {navItems.map((item) => <button key={item.key} className={`nav-item ${activeTab === item.key ? "nav-item--active" : ""}`} type="button" onClick={() => setActiveTab(item.key)}><strong>{item.label}</strong><span>{item.meta}</span></button>)}
          </nav>
        </aside>
        <main className="content-panel">
        <div className="content-topbar">
          <div className="content-topbar__title-group">
            <div>
              <h2 className={activeTab === "federal" ? "content-topbar__title content-topbar__title--federal" : activeTab === "state" ? "content-topbar__title content-topbar__title--state" : "content-topbar__title"}>
                {activeTab === "federal" && <i className="nav-item__icon-1040" aria-hidden="true">1040</i>}
                {activeTab === "state" && <i className="nav-item__icon-1040 nav-item__icon-state-tax" data-state={selectedStateCode} aria-hidden="true">{selectedStateCode === "CA" ? "540" : selectedStateCode}</i>}
                <span className="content-topbar__title-stack">
                  <span>{navItems.find((item) => item.key === activeTab)?.label}</span>
                  {activeTab === "federal" && <TumblingCurrency className="content-topbar__tax-total" value={federalResult?.tax || 0} />}
                  {activeTab === "state" && <TumblingCurrency className="content-topbar__tax-total" value={displayedStateResult.tax} />}
                </span>
              </h2>
            </div>
            {activeTab === "investments" && <label className="topbar-state-selector" aria-label="State"><StateFlagSelect value={selectedStateCode} onChange={(stateCode) => setStateSettings((current) => ({ ...current, stateCode: normalizeStateCode(stateCode) }))} className="state-flag-select--toolbar" /></label>}
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
            tickerMap={tickerMap}
            stateCode={selectedStateCode}
            accountTaxStatusByName={accountTaxStatusByName}
            derivedRows={derivedRows}
            favorites={uiSettings.investmentFavorites}
            filters={investmentFilters}
            sort={investmentSort}
            selectedAssetIds={selectedInvestmentIds}
            isWhatIfActive={isWhatIfActive}
            onToggleWhatIf={() => setIsWhatIfActive((current) => !current)}
            onSaveFavorite={saveFavorite}
            onApplyFavorite={applyFavorite}
            onDeleteFavorite={deleteFavorite}
            onRenameFavorite={renameFavorite}
            onChange={updateInvestmentRow}
            onAdd={() => addRow(setInvestments, { id: Date.now(), description: "New Investment", account: accountOptions[1] || "", category: "core", totalInvestment: 0, yearlyIncome: 0, includeIncome: true, overrideProposal: false, symbol: symbolOptions[1] || "", newSymbol: symbolOptions[1] || "", newPercent: overridePercentForSymbol(symbolOptions[1] || "") })}
            onRemove={(id) => {
              setInvestments((current) => current.filter((row) => row.id !== id));
              setSelectedInvestmentIds((current) => current.filter((selectedId) => selectedId !== id));
            }}
            onSplit={splitInvestmentRow}
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
        {activeTab === "tickers" && <LookupTable title="Assets" subtitle="Workbook asset lookup. Dividend percentage, asset class, tax treatment, income-item flag, and extra tax data all flow into the investment sheet lookups." rows={tickers} columns={[{ key: "symbol", label: "Asset ID" }, { key: "percentReturn", label: "Dividend", type: "percent" }, { key: "incomeItem", label: "Income item", type: "checkbox" }, { key: "category", label: "Asset Class", type: "select", options: categoryOptions }, { key: "taxTreatment", label: "Tax Treatment", type: "select", options: taxTreatmentOptions }, { key: "extraData", label: "Extra Data", type: "number" }, { key: "description", label: "Description" }, { key: "exDividend", label: "Ex-dividend" }, { key: "divPayout", label: "Div payout" }]} onChange={updateCollection(setTickers, ["percentReturn", "extraData"], ["incomeItem"])} onAdd={() => addRow(setTickers, { id: Date.now(), symbol: "", percentReturn: 0, category: categoryOptions[1] || "", taxTreatment: "income", incomeItem: false, extraData: 0, description: "", exDividend: "", divPayout: "" })} onRemove={removeRow(setTickers)} onRemoveAll={() => setTickers([])} onReorder={reorderCollection(setTickers)} showMoveHeaderLabel={false} rowDeleteNextToMove />}
        {activeTab === "categories" && <LookupTable title="Asset Classes" subtitle="Reference list used by the Assets tab asset-class dropdown and downstream investment rollups." rows={categories} columns={[{ key: "name", label: "Asset class" }]} onChange={updateCollection(setCategories)} onAdd={() => addRow(setCategories, { id: Date.now(), name: "" })} onRemove={removeRow(setCategories)} onReorder={reorderCollection(setCategories)} showMoveHeaderLabel={false} rowDeleteNextToMove />}
        {activeTab === "accounts" && <LookupTable title="Accounts" subtitle="Workbook account lookup. Account type drives the investment tax status; cashflow inclusion comes directly from this sheet." rows={accounts} columns={[{ key: "account", label: "Account name" }, { key: "accountType", label: "Account type", type: "select", options: accountTypeOptions }, { key: "dividendAccrued", label: "Dividend accrued" }, { key: "includeInFreeCashflow", label: "Exclude from aftertax income", type: "invertedYesNoCheckbox" }]} onChange={updateCollection(setAccounts)} onAdd={() => addRow(setAccounts, { id: Date.now(), account: "", accountType: "Brokerage Account", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" })} onRemove={removeRow(setAccounts)} onRemoveAll={() => setAccounts([])} onReorder={reorderCollection(setAccounts)} showMoveHeaderLabel={false} rowDeleteNextToMove />}
        {activeTab === "accountTaxType" && <LookupTable title="Tax Category" subtitle="Reference list for allowed account tax statuses." rows={accountTaxTypes} columns={[{ key: "taxStatus", label: "Tax status" }]} onChange={updateCollection(setAccountTaxTypes)} onAdd={() => addRow(setAccountTaxTypes, { id: Date.now(), taxStatus: "" })} onRemove={removeRow(setAccountTaxTypes)} onReorder={reorderCollection(setAccountTaxTypes)} showMoveHeaderLabel={false} rowDeleteNextToMove />}
        {activeTab === "accountType" && <LookupTable title="Account Type" subtitle="Reference list for account kinds and the tax status each account type contributes to investments." rows={accountTypes} columns={[{ key: "name", label: "Account type" }, { key: "taxStatus", label: "Tax status", type: "select", options: accountTaxStatusOptions }]} onChange={updateCollection(setAccountTypes)} onAdd={() => addRow(setAccountTypes, { id: Date.now(), name: "", taxStatus: "" })} onRemove={removeRow(setAccountTypes)} onReorder={reorderCollection(setAccountTypes)} showMoveHeaderLabel={false} rowDeleteNextToMove />}

        {activeTab === "federal" && (
          <Section title="Federal Tax" subtitle="Continuously recalculated from the workbook-style investment rows, the same row-level tax-adjustment logic used in the sheet, and the live Lambda backend." className="federal-tax-panel">
            <details className="tax-output-disclosure">
              <summary>Tax outputs</summary>
              {federalResult && (
                <div className="api-grid federal-tax-panel__tiles federal-tax-panel__tiles--result">
                  <MetricCard label="Federal total" value={formatCurrencyDetailed(federalResult.tax)} />
                  <MetricCard label="Ordinary tax" value={formatCurrencyDetailed(federalResult.ordinaryTax || 0)} />
                  <MetricCard label="Preferred tax" value={formatCurrencyDetailed(federalResult.prefTax || 0)} />
                  <MetricCard label="NIIT" value={formatCurrencyDetailed(federalResult.niit || 0)} />
                </div>
              )}
              <div className="metric-grid federal-tax-panel__tiles">
                <MetricCard label="Ordinary from sheet logic" value={formatCurrency(flows.federalOrdinary)} />
                <MetricCard label="Preferred from sheet logic" value={formatCurrency(flows.federalPreferred)} />
                <MetricCard label="Non-invest income" value={formatCurrency(flows.nonInvestmentIncome)} />
                <MetricCard label="Muni interest" value={formatCurrency(flows.muniIncome)} />
                <MetricCard label="Ordinary taxable" value={formatCurrency(ordinaryTaxable)} />
                <MetricCard label="Preferred taxable" value={formatCurrency(prefTaxable)} />
                <MetricCard label="MAGI" value={formatCurrency(magi)} />
                <MetricCard label="Net investment income" value={formatCurrency(netInvestmentIncome)} />
                <MetricCard label="NIIT base" value={formatCurrency(niitBase)} />
                <MetricCard label={`${selectedStateCode} income tax`} value={formatCurrencyDetailed(displayedStateResult.tax)} />
              </div>
            </details>
            {federalError && <div className="status-card status-card--error">{federalError}</div>}
            <details className="tax-what-if-disclosure" open={isFederalTaxWhatIfOpen} onToggle={(event) => setIsFederalTaxWhatIfOpen(event.currentTarget.open)}>
              <summary>What-If</summary>
              <div className="tax-what-if-disclosure__fields tax-what-if-disclosure__tables">
                <TaxWhatIfMiniTable
                  title="Extra ordinary income"
                  total={extraOrdinaryWhatIfTotal}
                  rows={federalSettings.extraOrdinaryItems}
                  typeOptions={ordinaryWhatIfTypes}
                  onChange={(rows) => setFederalSettings((current) => ({ ...current, extraOrdinaryItems: rows, extraOrdinaryIncome: rows.reduce((total, row) => total + toNumber(row.amount), 0) }))}
                />
                <TaxWhatIfMiniTable
                  title="Extra preferred income"
                  total={extraPreferredWhatIfTotal}
                  rows={federalSettings.extraPreferredItems}
                  typeOptions={preferredWhatIfTypes}
                  onChange={(rows) => setFederalSettings((current) => ({ ...current, extraPreferredItems: rows, extraPreferredIncome: rows.reduce((total, row) => total + toNumber(row.amount), 0) }))}
                />
              </div>
            </details>
            <div className="form-grid">
              <label><span>Filing status</span><select value={federalSettings.filingStatus} onChange={(event) => setFederalSettings((current) => ({ ...current, filingStatus: normalizeFilingStatus(event.target.value) }))}><option value="mfj">Married filing jointly</option><option value="single">Single</option><option value="mfs">Married filing separately</option><option value="hoh">Head of household</option></select></label>
              <label><span>State</span><StateFlagSelect value={selectedStateCode} onChange={(stateCode) => setStateSettings((current) => ({ ...current, stateCode: normalizeStateCode(stateCode) }))} /></label>
              <label><span>Mortgage interest</span><CurrencyInput value={federalSettings.mortgageInterest} onChange={(value) => setFederalSettings((current) => ({ ...current, mortgageInterest: value }))} /></label>
              <label><span>Property tax</span><CurrencyInput value={federalSettings.propertyTax} onChange={(value) => setFederalSettings((current) => ({ ...current, propertyTax: value }))} /></label>
              <label><span>Standard deduction</span><CurrencyInput value={federalSettings.standardDeduction} onChange={(value) => setFederalSettings((current) => ({ ...current, standardDeduction: value }))} /></label>
              <label><span>SALT cap</span><CurrencyInput value={federalSettings.saltCap} onChange={(value) => setFederalSettings((current) => ({ ...current, saltCap: value }))} /></label>
            </div>
          </Section>
        )}
        {activeTab === "state" && (
          <Section title="State Tax" subtitle="State worksheet fed from the investment-sheet state bucket column and the live backend." className="state-tax-panel">
            <details className="tax-output-disclosure">
              <summary>Tax outputs</summary>
              <div className="api-grid state-tax-panel__tiles state-tax-panel__tiles--result">
                <MetricCard label={`${selectedStateCode} tax`} value={formatCurrencyDetailed(displayedStateResult.tax)} />
              </div>
              <div className="metric-grid state-tax-panel__tiles">
                <MetricCard label="Total included income" value={formatCurrency(flows.totalIncome)} />
                <MetricCard label="Federal-taxable investments" value={formatCurrency(federalTaxableInvestmentIncome)} />
                <MetricCard label="State adjustment" value={formatCurrency(stateInvestmentAdjustment)} />
                <MetricCard label="State-taxable investments" value={formatCurrency(flows.stateTaxable)} />
                <MetricCard label="Federal What-If income" value={formatCurrency(federalWhatIfIncome)} />
                <MetricCard label="State-only extra income" value={formatCurrency(effectiveExtraStateIncome)} />
                <MetricCard label={`${selectedStateCode} gross`} value={formatCurrency(stateGross)} />
                <MetricCard label={`${selectedStateCode} deduction used`} value={formatCurrency(stateDeduction)} />
                <MetricCard label={`${selectedStateCode} taxable after deductions`} value={formatCurrency(stateTaxableAfterDeductions)} />
              </div>
            </details>
            {stateError && <div className="status-card status-card--error">{stateError}</div>}
            <details className="tax-what-if-disclosure" open={isStateTaxWhatIfOpen} onToggle={(event) => setIsStateTaxWhatIfOpen(event.currentTarget.open)}>
              <summary>What-If</summary>
              <div className="form-grid tax-what-if-disclosure__fields">
                <label><span>Extra {selectedStateCode} income</span><CurrencyInput value={stateSettings.extraStateIncome} onChange={(value) => setStateSettings((current) => ({ ...current, extraStateIncome: value }))} /></label>
              </div>
            </details>
            <div className="form-grid form-grid--compact-wide">
              <label><span>State</span><StateFlagSelect value={selectedStateCode} onChange={(stateCode) => setStateSettings((current) => ({ ...current, stateCode: normalizeStateCode(stateCode) }))} /></label>
              <label>
                <span className="tax-field-label">
                  <span>Mortgage interest</span>
                  <small>Federal {formatCurrencyDetailed(federalSettings.mortgageInterest)}</small>
                  <button type="button" onClick={() => setStateSettings((current) => ({ ...current, mortgageInterest: federalSettings.mortgageInterest }))}>Copy</button>
                </span>
                <CurrencyInput value={stateSettings.mortgageInterest} onChange={(value) => setStateSettings((current) => ({ ...current, mortgageInterest: value }))} />
              </label>
              <label>
                <span className="tax-field-label">
                  <span>Property tax</span>
                  <small>Federal {formatCurrencyDetailed(federalSettings.propertyTax)}</small>
                  <button type="button" onClick={() => setStateSettings((current) => ({ ...current, propertyTax: federalSettings.propertyTax }))}>Copy</button>
                </span>
                <CurrencyInput value={stateSettings.propertyTax} onChange={(value) => setStateSettings((current) => ({ ...current, propertyTax: value }))} />
              </label>
              <label><span>{selectedStateCode} standard deduction</span><CurrencyInput value={stateSettings.standardDeduction} onChange={(value) => setStateSettings((current) => ({ ...current, standardDeduction: value }))} /></label>
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
