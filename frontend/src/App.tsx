import { Fragment, cloneElement, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode, type SetStateAction } from "react";
import { createPortal, flushSync } from "react-dom";
import { isW2IncomeType } from "./taxMath";
import { namespacedPublicReportSlug, normalizePublicReportSlug, resolvePublicUsername } from "./publicReportUrls";
import "./App.css";

type TabKey =
  | "investments"
  | "federal"
  | "state"
  | "local"
  | "tickers"
  | "categories"
  | "taxTreatment"
  | "accounts"
  | "accountTaxType"
  | "accountType";

type FilingStatus = "single" | "mfj" | "mfs" | "hoh";
type TaxResult = { calc: string; tax: number; taxableIncome?: number; filingStatus?: FilingStatus; ordinaryTax?: number; prefTax?: number; niit?: number; state?: string; stateName?: string; note?: string; effectiveRate?: number; marginalRate?: number };
type TaxPlanResult = {
  calc: "TAX_PLAN_2025";
  filingStatus: FilingStatus;
  stateCode: string;
  stateName: string;
  totalTax: number;
  marginalPayrollRate: number;
  totalIncome: number;
  displayIncome: number;
  excludedIncome: number;
  afterTaxIncome: number;
  federal: TaxResult & {
    incomeTax: number;
    total: number;
    payrollTax: number;
    ordinaryIncome: number;
    preferredIncome: number;
    adjustedGrossIncome: number;
    taxableSocialSecurity: number;
    taxableIncome: number;
    ordinaryTaxable: number;
    prefTaxable: number;
    deductions: Record<string, number>;
  };
  state: TaxResult & {
    incomeTax: number;
    total: number;
    payrollTax: number;
    grossIncome: number;
    deduction: number;
    standardDeduction: number;
    itemizedDeduction: number;
    taxableIncome: number;
    profile: LocalStateTaxProfile & { brackets: LocalStateTaxBracket[] };
  };
  local: TaxResult & { profile: LocalTaxProfile; taxableIncome: number };
  payroll: {
    federal: { socialSecurity: number; medicare: number; additionalMedicare: number; total: number };
    state: { stateCode: string; components: Array<{ label: string; tax: number; rate: number }>; total: number };
    total: number;
  };
};
type TaxConfigResult = { calc: "TAX_CONFIG_2025"; taxYear: number; states: LocalStateTaxProfile[]; localities: LocalTaxProfile[] };
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

type IncomeEntryInput = {
  sourceName: string;
  annualAmount: number;
};

type InvestmentEntryInput = {
  name: string;
  account: string;
  symbol: string;
  amount: number;
  dividendRate: number;
  assetType: string;
  assetClass: string;
  taxTreatment: string;
  extraData: number;
  assetDescription: string;
  exDividend: string;
  divPayout: string;
};

type QuickAssetInput = {
  symbol: string;
  dividendPercent: string;
  assetClass: string;
  taxTreatment: string;
  description: string;
  exDividend: string;
  divPayout: string;
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
  investmentIncome: number;
  displayInvestmentIncome: number;
  investmentOrdinaryMonthly: number;
  investmentPreferredMonthly: number;
  investmentStateMonthly: number;
  niitIncome: number;
  displayYearlyIncome: number;
  displayMonthlyIncome: number;
  displayFilteredIncome: number;
  includedTotal: number;
  taxStatus: string;
  taxTreatment: string;
  stateTaxRule: string;
  localTaxCategory: string;
  currentAssetTaxTone: AssetTaxTone;
  proposedAssetTaxTone: AssetTaxTone;
  investmentType: string;
  ordinaryMonthly: number;
  preferredMonthly: number;
  stateMonthly: number;
  displayOrdinaryMonthly: number;
  displayPreferredMonthly: number;
  displayStateMonthly: number;
  displayNonInvestmentIncome: number;
  w2Income: number;
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

type TickerRow = { id: number; symbol: string; percentReturn: number; assetType: string; category: string; taxTreatment: string; incomeItem: boolean; extraData: number; description: string; exDividend: string; divPayout: string };
type CategoryRow = { id: number; name: string; includeInAllocation: boolean };
type TaxTreatmentRow = { id: number; label: string; ordinaryShare: number; preferredShare: number; stateRule: string; niitIncluded: boolean; localCategory: string; description: string; includeInAllocation: boolean };
type AccountRow = { id: number; account: string; accountType: string; taxStatus: string; dividendAccrued: string; includeInFreeCashflow: string };
type AccountTaxTypeRow = { id: number; taxStatus: string; includeInAllocation: boolean };
type AccountTypeRow = { id: number; name: string; taxStatus: string; includeInAllocation: boolean };

type TaxWhatIfItem = { id: number; amount: number; incomeType: string };
type DeductionItem = { id: number; amount: number; deductionType: string };
type AboveLineDeductionItem = { id: number; amount: number; deductionType: string };
type FederalDeductionMode = "standard" | "itemized";
type FederalSettings = { filingStatus: FilingStatus; deductionMode: FederalDeductionMode; extraOrdinaryIncome: number; extraPreferredIncome: number; extraOrdinaryItems: TaxWhatIfItem[]; extraPreferredItems: TaxWhatIfItem[]; aboveLineDeductionItems: AboveLineDeductionItem[]; deductionItems: DeductionItem[]; mortgageInterest: number; propertyTax: number };
type StateSettings = { stateCode: string; extraStateIncome: number; deductionMode: FederalDeductionMode; deductionItems: DeductionItem[]; mortgageInterest: number; propertyTax: number; standardDeduction: number };
type LocalTaxBaseKey = "wages" | "selfEmployment" | "interest" | "dividends" | "capitalGains" | "rentalIncome" | "businessIncome" | "retirementIncome" | "socialSecurity";
type LocalTaxBaseSelection = Record<LocalTaxBaseKey, boolean>;
type LocalTaxBracket = { threshold: number; rate: number };
type LocalTaxProfile = { id: string; locality: string; state: string; kind: "none" | "flat" | "progressive" | "state-surcharge"; residentRate: number; nonresidentRate?: number; brackets?: LocalTaxBracket[]; base: LocalTaxBaseSelection; nonresidentBase?: LocalTaxBaseSelection; note: string };
type LocalTaxSettings = { enabled: boolean; localityId: string; localityName: string; residency: "resident" | "nonresident"; rate: number; nonresidentRate: number; taxableBase: LocalTaxBaseSelection };
type PlannerSettings = { federalWithholding: number; stateWithholding: number };
type InvestmentFavorite = { name: string; investmentKeys: string[]; createdAt: string };
type ModelUiSnapshot = { investmentFavorites: InvestmentFavorite[]; selectedAssetIds: number[] };
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
  localTaxSettings: LocalTaxSettings;
  plannerSettings: PlannerSettings;
  uiSettings: ModelUiSnapshot;
  isWhatIfActive: boolean;
};
type ModelVersion = { id: string; name: string; createdAt: string; updatedAt: string; snapshot: ModelDataSnapshot };
type ScenarioLandingPage = { id: string; name: string; slug?: string; createdAt: string; updatedAt: string; payload: string };
type IncomePrimaryPeriod = "monthly" | "annual";
type UiSettings = ModelUiSnapshot & { publicUsername?: string; savedScenarios: SummaryReportScenario[]; scenarioLibraryMigrated?: boolean; modelVersions: ModelVersion[]; incomePrimaryPeriod: IncomePrimaryPeriod; darkMode: boolean; investmentWhatIfOpen?: boolean; mcpRefresh?: { requestedAt?: string; source?: string; serverVersion?: string } };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; actions?: AssistantAction[]; createdAt: string; error?: boolean };
type AuthTokens = { idToken: string; accessToken: string; refreshToken?: string; expiresAt: number };
type AuthUser = { sub: string; email?: string; name?: string; username?: string };
type AuthEntryMode = "signIn" | "create";
type AuthState =
  | { status: "loading"; user: null; tokens: null; error?: string }
  | { status: "signedOut"; user: null; tokens: null; error?: string }
  | { status: "signedIn"; user: AuthUser; tokens: AuthTokens; requestedPublicUsername?: string; error?: string };
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
    portfolioBeforeTaxYield: number;
    portfolioAfterTaxYield: number;
    investmentIncome: number;
    investmentAfterTaxIncome: number;
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
  | { type: "updateSettings"; payload: { section: "federal" | "state" | "local" | "planner" | "ui"; values: Record<string, unknown> }; requiresConfirmation?: boolean }
  | { type: "setWhatIf"; payload: { scope?: "investments" | "federal" | "state"; enabled: boolean }; requiresConfirmation?: boolean }
  | { type: "addRow"; payload: { tableId: WorkbookTableId; row?: Record<string, unknown>; values?: Record<string, unknown> }; requiresConfirmation?: boolean }
  | { type: "updateRow"; payload: { tableId: WorkbookTableId; id?: number | string; selector?: string; all?: boolean; values: Record<string, unknown> }; requiresConfirmation?: boolean }
  | { type: "upsertRows"; payload: { tableId: WorkbookTableId; rows?: Array<Record<string, unknown>>; row?: Record<string, unknown>; values?: Array<Record<string, unknown>>; matchField?: string }; requiresConfirmation?: boolean }
  | { type: "replaceRows"; payload: { tableId: WorkbookTableId; rows?: Array<Record<string, unknown>>; values?: Array<Record<string, unknown>> }; requiresConfirmation?: boolean }
  | { type: "deleteRows"; payload: { tableId: WorkbookTableId; id?: number | string; ids?: Array<number | string>; selector?: string; all?: boolean }; requiresConfirmation?: boolean };
type ChatResponse = { message: string; actions?: AssistantAction[]; model?: string; usage?: unknown; error?: string };
type InvestmentFilters = { account: string; category: string; asset: string };
type InvestmentSortColumn = "description" | "account" | "category" | "totalInvestment" | "yearlyIncome" | "symbol" | "includedTotal" | "filteredIncome";
type InvestmentSort = { tableId: "investments"; column: InvestmentSortColumn | ""; direction: "asc" | "desc" };
type SymbolFinderScope = "current" | "all";
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
type FederalNumericField = Exclude<keyof FederalSettings, "filingStatus" | "deductionMode" | "extraOrdinaryItems" | "extraPreferredItems" | "aboveLineDeductionItems" | "deductionItems">;

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
  settings?: Partial<{ federal: FederalSettings; state: StateSettings; local: LocalTaxSettings; planner: PlannerSettings; ui: UiSettings }>;
  updatedAt?: string | null;
};

type PortfolioHistorySnapshot = ModelDataSnapshot;
type SummaryReportScenario = {
  id: string;
  name: string;
  source: "current" | "reference";
  income: number;
  investments?: number;
  wages: number;
  ordinaryIncome: number;
  preferredIncome: number;
  investmentIncome: number;
  federalTax: number;
  stateTax: number;
  localTax: number;
  totalTax: number;
  afterTaxIncome: number;
  effectiveTaxRate: number;
  marginalTaxRateLabel: string;
  description: string;
  stateCode?: string;
  stateName?: string;
  localityName?: string;
  filingStatus?: FilingStatus;
};
type SummaryScenarioDraft = Pick<SummaryReportScenario, "name" | "description">;
type SummaryReportPayload = {
  reportName: string;
  generatedAt: string;
  income: number;
  investments: number;
  afterTaxIncome: number;
  marginalTaxRate: number;
  marginalTaxRateLabel: string;
  effectiveTaxRate: number;
  federalTax: number;
  stateTax: number;
  localTax: number;
  totalTax: number;
  stateCode: string;
  stateName: string;
  localityName: string;
  federalTaxable: number;
  stateTaxable: number;
  localTaxable: number;
  filingStatus: FilingStatus;
  localEffectiveRate: number;
  localMarginalRate: number;
  localBrackets: LocalTaxBracket[];
  allocationRows: Array<{ label: string; amount: number }>;
  accountTaxAllocationRows: Array<{ label: string; amount: number }>;
  accountTypeAllocationRows: Array<{ label: string; amount: number }>;
  taxTreatmentAllocationRows: Array<{ label: string; amount: number }>;
  scenarios: SummaryReportScenario[];
};
type PublicSummaryReportRecord = {
  id: string;
  slug: string;
  name: string;
  payload: SummaryReportPayload;
  createdAt: string;
  updatedAt: string;
};

const CONFIGURED_API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;
const API_BASE_URL = typeof window !== "undefined" &&
  CONFIGURED_API_BASE_URL?.includes(".execute-api.") &&
  !["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "/api"
  : CONFIGURED_API_BASE_URL || "/api";
const WORKSPACE_ID = "default";
const WORKBOOK_SHEET_URL = "https://docs.google.com/spreadsheets/d/1mdio6n9O8qlon0SeIt8GOA65XkZ-Xwva7a30DOURLDU/edit?gid=0#gid=0";
const CHATGPT_URL = "https://chatgpt.com/";
const PUBLIC_SITE_ORIGIN = "https://aftertaxus.com";
const RESERVED_PUBLIC_REPORT_SLUGS = new Set(["api", "assets", "auth", "hello", "login", "logout", "mcp-v5", "reports", "signin", "signup"]);
const CURRENT_MCP_CONNECTOR_PATH = "/mcp-v5";
const WORKBOOK_REMOTE_REFRESH_INTERVAL_MS = 5000;

function normalizeMcpConnectorBaseUrl(rawBaseUrl?: string) {
  const fallbackUrl = `https://www.aftertaxus.com${CURRENT_MCP_CONNECTOR_PATH}`;
  const trimmedBaseUrl = rawBaseUrl?.trim();
  if (!trimmedBaseUrl) return fallbackUrl;

  try {
    const url = new URL(trimmedBaseUrl);
    if (url.hostname === "www.aftertaxus.com" || url.hostname.endsWith(".aftertaxus.com")) {
      url.pathname = CURRENT_MCP_CONNECTOR_PATH;
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    return trimmedBaseUrl.replace(/\/+$/, "") || fallbackUrl;
  }

  return trimmedBaseUrl.replace(/\/+$/, "");
}

const MCP_CONNECTOR_BASE_URL = normalizeMcpConnectorBaseUrl(import.meta.env.VITE_MCP_CONNECTOR_BASE_URL as string | undefined);
const US_FLAG_ICON_URL = "https://commons.wikimedia.org/wiki/Special:FilePath/Flag%20of%20the%20United%20States.svg?width=32";
const COGNITO_DOMAIN = (import.meta.env.VITE_COGNITO_DOMAIN as string | undefined)?.replace(/\/+$/, "") || "";
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
const BROWSER_ROOT_URI = typeof window !== "undefined"
  ? window.location.hostname === "127.0.0.1"
    ? new URL("/", `${window.location.protocol}//localhost${window.location.port ? `:${window.location.port}` : ""}`).toString()
    : new URL(
        "/",
        window.location.hostname === "localhost"
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
const SAVED_SCENARIO_LIMIT = 50;
const SCENARIO_LANDING_PAGE_LIMIT = 20;
const PUBLISHED_SCENARIO_LIMIT = 4;
const ASSISTANT_PROMPT_HISTORY_KEY = "portfolio-assistant-prompt-history";
const ASSISTANT_PROMPT_HISTORY_LIMIT = 50;
const AUTH_STORAGE_KEY = "portfolio-auth-session";
const AUTH_PKCE_STORAGE_KEY = "portfolio-auth-pkce";
const PUBLIC_USERNAME_STORAGE_KEY = "aftertaxus-public-username";
const INVESTMENT_COLUMN_WIDTH_STORAGE_KEY = "aftertaxus-investment-column-widths-compact-v2";
const INVESTMENT_COLUMN_DEFS = [
  { id: "row", label: "Row", className: "sheet-row-heading", defaultWidth: 30, minWidth: 28 },
  { id: "move", label: "", ariaLabel: "Row actions", className: "drag-handle-heading", defaultWidth: 42, minWidth: 42 },
  { id: "included", label: "Inc", ariaLabel: "Included", title: "Included", className: "included-heading", defaultWidth: 28, minWidth: 26 },
  { id: "account", label: "Account", defaultWidth: 116, minWidth: 82 },
  { id: "symbol", label: "Asset", defaultWidth: 86, minWidth: 70 },
  { id: "normalPercent", label: "Dividend", defaultWidth: 48, minWidth: 38 },
  { id: "amount", label: "Investment", defaultWidth: 82, minWidth: 70 },
  { id: "year", label: "Year", defaultWidth: 68, minWidth: 52 },
  { id: "month", label: "Month", defaultWidth: 58, minWidth: 44 },
  { id: "filtered", label: "Filtered", defaultWidth: 58, minWidth: 46, group: "debug" },
  { id: "total", label: "Total", defaultWidth: 58, minWidth: 44, group: "debug" },
  { id: "taxStatus", label: "Tax Status", defaultWidth: 62, minWidth: 48, group: "tax" },
  { id: "ordinary", label: "Ordinary", defaultWidth: 56, minWidth: 44, group: "tax" },
  { id: "preferred", label: "Preferred", defaultWidth: 58, minWidth: 44, group: "tax" },
  { id: "state", label: "State", defaultWidth: 48, minWidth: 40, group: "tax" },
  { id: "nonTaxable", label: "Non taxable", defaultWidth: 62, minWidth: 46, group: "tax" },
  { id: "investmentType", label: "Inv. type", defaultWidth: 60, minWidth: 46, group: "tax" },
  { id: "nonInvestmentIncome", label: "Non-invest income", defaultWidth: 68, minWidth: 50, group: "tax" },
  { id: "cash", label: "Cash", defaultWidth: 48, minWidth: 40, group: "tax" },
  { id: "stocks", label: "Stocks", defaultWidth: 50, minWidth: 40, group: "tax" },
  { id: "preferredStock", label: "Preferred stock", defaultWidth: 64, minWidth: 46, group: "tax" },
  { id: "bonds", label: "Bonds", defaultWidth: 50, minWidth: 40, group: "tax" },
  { id: "muniBond", label: "Muni-bond", defaultWidth: 56, minWidth: 42, group: "tax" },
  { id: "muniInterest", label: "Muni-int", defaultWidth: 54, minWidth: 42, group: "tax" },
  { id: "businessDevelopment", label: "Bus dev", defaultWidth: 54, minWidth: 42, group: "tax" },
  { id: "coveredCall", label: "Covered call", defaultWidth: 64, minWidth: 46, group: "tax" },
  { id: "realEstate", label: "Real estate", defaultWidth: 62, minWidth: 46, group: "tax" },
  { id: "bitcoin", label: "Bitcoin", defaultWidth: 50, minWidth: 40, group: "tax" },
  { id: "override", label: "WhatIf", defaultWidth: 30, minWidth: 26, group: "override" },
  { id: "overrideSymbol", label: "New", defaultWidth: 104, minWidth: 84, group: "override" },
  { id: "overridePercent", label: "New %", defaultWidth: 48, minWidth: 38, group: "override" },
  { id: "usePercent", label: "Use %", defaultWidth: 44, minWidth: 36, group: "debug" },
  { id: "useSymbol", label: "Use asset", defaultWidth: 62, minWidth: 48, group: "debug" },
  { id: "extraData", label: "$", defaultWidth: 48, minWidth: 38, group: "debug" },
] as const;
type TaxSummaryKind = "federal" | "state" | "local";
type InvestmentColumnId = typeof INVESTMENT_COLUMN_DEFS[number]["id"];
type InvestmentColumnWidths = Record<InvestmentColumnId, number>;
function investmentColumnLabelWidth(label: string) {
  return label ? Math.ceil(label.length * 4.9) + 16 : 22;
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

function encodeUtf8Base64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeUtf8Base64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = window.atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeSummaryReportPayload(payload: SummaryReportPayload) {
  return encodeUtf8Base64Url(JSON.stringify(payload));
}

function decodeSummaryReportScenario(value: unknown, index: number): SummaryReportScenario | null {
  if (!value || typeof value !== "object") return null;
  const scenario = value as Partial<SummaryReportScenario>;
  if (
    typeof scenario.income !== "number" ||
    typeof scenario.federalTax !== "number" ||
    typeof scenario.stateTax !== "number" ||
    typeof scenario.localTax !== "number" ||
    typeof scenario.totalTax !== "number" ||
    typeof scenario.afterTaxIncome !== "number"
  ) return null;
  return {
    id: typeof scenario.id === "string" && scenario.id ? scenario.id : `scenario-${index + 1}`,
    name: typeof scenario.name === "string" && scenario.name.trim() ? scenario.name.trim() : `Scenario ${index + 1}`,
    source: scenario.source === "current" ? "current" : "reference",
    income: scenario.income,
    investments: typeof scenario.investments === "number" ? scenario.investments : undefined,
    wages: typeof scenario.wages === "number" ? scenario.wages : 0,
    ordinaryIncome: typeof scenario.ordinaryIncome === "number" ? scenario.ordinaryIncome : 0,
    preferredIncome: typeof scenario.preferredIncome === "number" ? scenario.preferredIncome : 0,
    investmentIncome: typeof scenario.investmentIncome === "number" ? scenario.investmentIncome : 0,
    federalTax: scenario.federalTax,
    stateTax: scenario.stateTax,
    localTax: scenario.localTax,
    totalTax: scenario.totalTax,
    afterTaxIncome: scenario.afterTaxIncome,
    effectiveTaxRate: typeof scenario.effectiveTaxRate === "number" ? scenario.effectiveTaxRate : scenario.income > 0 ? scenario.totalTax / scenario.income : 0,
    marginalTaxRateLabel: typeof scenario.marginalTaxRateLabel === "string" ? scenario.marginalTaxRateLabel : "—",
    description: typeof scenario.description === "string" ? scenario.description : "",
    stateCode: typeof scenario.stateCode === "string" ? scenario.stateCode : undefined,
    stateName: typeof scenario.stateName === "string" ? scenario.stateName : undefined,
    localityName: typeof scenario.localityName === "string" ? scenario.localityName : undefined,
    filingStatus: scenario.filingStatus === "single" || scenario.filingStatus === "mfj" || scenario.filingStatus === "mfs" || scenario.filingStatus === "hoh" ? scenario.filingStatus : undefined,
  };
}

function decodeSummaryReportPayload(value: string): SummaryReportPayload | null {
  try {
    const parsed = JSON.parse(decodeUtf8Base64Url(value)) as Partial<SummaryReportPayload>;
    if (
      typeof parsed.income !== "number" ||
      typeof parsed.investments !== "number" ||
      typeof parsed.afterTaxIncome !== "number" ||
      typeof parsed.marginalTaxRate !== "number" ||
      typeof parsed.effectiveTaxRate !== "number" ||
      typeof parsed.federalTax !== "number" ||
      typeof parsed.stateTax !== "number" ||
      typeof parsed.localTax !== "number" ||
      typeof parsed.totalTax !== "number"
    ) {
      return null;
    }
    const decodedScenarios = Array.isArray(parsed.scenarios)
      ? parsed.scenarios.map(decodeSummaryReportScenario).filter((scenario): scenario is SummaryReportScenario => Boolean(scenario))
      : [];
    const scenarios = decodedScenarios.length ? decodedScenarios : [{
      id: "current-model",
      name: "Current modeled scenario",
      source: "current" as const,
      income: parsed.income,
      investments: parsed.investments,
      wages: 0,
      ordinaryIncome: 0,
      preferredIncome: 0,
      investmentIncome: 0,
      federalTax: parsed.federalTax,
      stateTax: parsed.stateTax,
      localTax: parsed.localTax,
      totalTax: parsed.totalTax,
      afterTaxIncome: parsed.afterTaxIncome,
      effectiveTaxRate: parsed.effectiveTaxRate,
      marginalTaxRateLabel: typeof parsed.marginalTaxRateLabel === "string" ? parsed.marginalTaxRateLabel : formatPercent(parsed.marginalTaxRate),
      description: "Current values from the shared summary.",
    }];
    return {
      reportName: typeof parsed.reportName === "string" && parsed.reportName.trim() ? parsed.reportName.trim() : "Tax scenario summary",
      generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : new Date().toISOString(),
      income: parsed.income,
      investments: parsed.investments,
      afterTaxIncome: parsed.afterTaxIncome,
      marginalTaxRate: parsed.marginalTaxRate,
      marginalTaxRateLabel: typeof parsed.marginalTaxRateLabel === "string" ? parsed.marginalTaxRateLabel : formatPercent(parsed.marginalTaxRate),
      effectiveTaxRate: parsed.effectiveTaxRate,
      federalTax: parsed.federalTax,
      stateTax: parsed.stateTax,
      localTax: parsed.localTax,
      totalTax: parsed.totalTax,
      stateCode: typeof parsed.stateCode === "string" ? parsed.stateCode : "US",
      stateName: typeof parsed.stateName === "string" ? parsed.stateName : "State",
      localityName: typeof parsed.localityName === "string" ? parsed.localityName : "Local tax",
      federalTaxable: typeof parsed.federalTaxable === "number" ? parsed.federalTaxable : 0,
      stateTaxable: typeof parsed.stateTaxable === "number" ? parsed.stateTaxable : 0,
      localTaxable: typeof parsed.localTaxable === "number" ? parsed.localTaxable : 0,
      filingStatus: parsed.filingStatus === "single" || parsed.filingStatus === "mfj" || parsed.filingStatus === "mfs" || parsed.filingStatus === "hoh" ? parsed.filingStatus : "mfj",
      localEffectiveRate: typeof parsed.localEffectiveRate === "number" ? parsed.localEffectiveRate : 0,
      localMarginalRate: typeof parsed.localMarginalRate === "number" ? parsed.localMarginalRate : 0,
      localBrackets: Array.isArray(parsed.localBrackets) ? parsed.localBrackets.filter((row): row is LocalTaxBracket => row && typeof row.threshold === "number" && typeof row.rate === "number") : [],
      allocationRows: Array.isArray(parsed.allocationRows) ? parsed.allocationRows.filter((row): row is { label: string; amount: number } => row && typeof row.label === "string" && typeof row.amount === "number") : [],
      accountTaxAllocationRows: Array.isArray(parsed.accountTaxAllocationRows) ? parsed.accountTaxAllocationRows.filter((row): row is { label: string; amount: number } => row && typeof row.label === "string" && typeof row.amount === "number") : [],
      accountTypeAllocationRows: Array.isArray(parsed.accountTypeAllocationRows) ? parsed.accountTypeAllocationRows.filter((row): row is { label: string; amount: number } => row && typeof row.label === "string" && typeof row.amount === "number") : [],
      taxTreatmentAllocationRows: Array.isArray(parsed.taxTreatmentAllocationRows) ? parsed.taxTreatmentAllocationRows.filter((row): row is { label: string; amount: number } => row && typeof row.label === "string" && typeof row.amount === "number") : [],
      scenarios,
    };
  } catch {
    return null;
  }
}

function readSummaryReportFromUrl() {
  if (typeof window === "undefined") return null;
  const summaryReport = new URLSearchParams(window.location.search).get("summaryReport");
  return summaryReport ? decodeSummaryReportPayload(summaryReport) : null;
}

function readPublicReportSlugFromUrl() {
  if (typeof window === "undefined") return "";
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments.length === 2) {
    const username = normalizePublicReportSlug(decodeURIComponent(segments[0]));
    const scenario = normalizePublicReportSlug(decodeURIComponent(segments[1]));
    if (!username || !scenario || RESERVED_PUBLIC_REPORT_SLUGS.has(username)) return "";
    return namespacedPublicReportSlug(username, scenario);
  }
  if (segments.length !== 1) return "";
  const decoded = decodeURIComponent(segments[0]).toLowerCase();
  const slug = normalizePublicReportSlug(decoded);
  return slug === decoded && !RESERVED_PUBLIC_REPORT_SLUGS.has(slug) ? slug : "";
}

function readLegacyPublicReportSlugFromUrl() {
  if (typeof window === "undefined") return "";
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return "";
  return normalizePublicReportSlug(decodeURIComponent(segments[1]));
}

function readPublicReportUsernameFromUrl() {
  if (typeof window === "undefined") return "";
  const segments = window.location.pathname.split("/").filter(Boolean);
  return segments.length === 2 ? normalizePublicReportSlug(decodeURIComponent(segments[0])).slice(0, 32) : "";
}

function buildPublicSummaryReportUrl(slug: string, username: string) {
  const cleanUsername = normalizePublicReportSlug(username).slice(0, 32);
  const namespacePrefix = `${cleanUsername}-`;
  const scenarioSlug = slug.startsWith(namespacePrefix) ? slug.slice(namespacePrefix.length) : slug;
  return `${PUBLIC_SITE_ORIGIN}/${encodeURIComponent(cleanUsername)}/${encodeURIComponent(scenarioSlug)}`;
}

function authUserFromIdToken(idToken: string): AuthUser {
  const payload = decodeJwtPayload<Record<string, unknown>>(idToken);
  return {
    sub: String(payload.sub || ""),
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    username: typeof payload.preferred_username === "string"
      ? payload.preferred_username
      : typeof payload["cognito:username"] === "string" ? payload["cognito:username"] : undefined,
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

function readStoredPublicUsername() {
  if (typeof window === "undefined") return "";
  return normalizePublicReportSlug(window.localStorage.getItem(PUBLIC_USERNAME_STORAGE_KEY)).slice(0, 32);
}

function writeStoredPublicUsername(username: string) {
  if (typeof window === "undefined") return;
  const normalized = normalizePublicReportSlug(username).slice(0, 32);
  if (normalized) window.localStorage.setItem(PUBLIC_USERNAME_STORAGE_KEY, normalized);
}

function clearStoredAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_PKCE_STORAGE_KEY);
}

async function startCognitoSignIn(publicUsername = "", entryMode: AuthEntryMode = "signIn") {
  if (!isCognitoEnabled() || !COGNITO_CLIENT_ID) return;
  const verifier = randomAuthString();
  const state = randomAuthString();
  const challenge = await sha256Base64Url(verifier);
  window.sessionStorage.setItem(AUTH_PKCE_STORAGE_KEY, JSON.stringify({
    verifier,
    state,
    publicUsername: normalizePublicReportSlug(publicUsername).slice(0, 32),
  }));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: COGNITO_CLIENT_ID,
    redirect_uri: COGNITO_REDIRECT_URI,
    scope: COGNITO_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const entryPath = entryMode === "create" ? "/signup" : "/oauth2/authorize";
  window.location.assign(`${COGNITO_DOMAIN}${entryPath}?${params.toString()}`);
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

  const pkce = JSON.parse(window.sessionStorage.getItem(AUTH_PKCE_STORAGE_KEY) || "null") as { verifier?: string; state?: string; publicUsername?: string } | null;
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
  const user = authUserFromIdToken(tokens.idToken);
  const requestedPublicUsername = typeof pkce.publicUsername === "string" ? pkce.publicUsername : undefined;
  writeStoredPublicUsername(resolvePublicUsername(user, undefined, requestedPublicUsername));
  return {
    status: "signedIn",
    user,
    tokens,
    requestedPublicUsername,
  };
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
  { key: "investments", label: "Investments / Income", meta: "workbook grid" },
  { key: "accounts", label: "Accounts", meta: "tax status" },
  { key: "tickers", label: "Assets", meta: "asset lookups" },
  { key: "federal", label: "Federal Tax", meta: "live backend" },
  { key: "state", label: "State Tax", meta: "state worksheet" },
  { key: "local", label: "Local Tax", meta: "city / county" },
  { key: "taxTreatment", label: "Tax Treatments", meta: "income rules" },
  { key: "accountTaxType", label: "Account Tax Category", meta: "status list" },
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

const fallbackStateTaxProfile: LocalStateTaxProfile = {
  code: "CA",
  name: "California",
  single: [],
  mfj: [],
};

function stateTaxBracketsForProfile(profile: LocalStateTaxProfile, filingStatus: LocalStateTaxFilingStatus) {
  return filingStatus === "mfj" ? profile.mfj :
    filingStatus === "mfs" ? profile.mfs ?? profile.single :
    filingStatus === "hoh" ? profile.hoh ?? profile.single :
    profile.single;
}



const initialInvestments: InvestmentRow[] = [
  { id: 1, description: "Example stock fund", account: "Example Brokerage", category: "core", totalInvestment: 10000, yearlyIncome: 120, includeIncome: true, overrideProposal: false, symbol: "VOO", newSymbol: "VOO", newPercent: 0 },
  { id: 2, description: "Example treasury fund", account: "Example Brokerage", category: "core", totalInvestment: 5000, yearlyIncome: 200, includeIncome: true, overrideProposal: false, symbol: "SGOV", newSymbol: "SGOV", newPercent: 0 },
  { id: 3, description: "Example IRA bond fund", account: "Example IRA", category: "core", totalInvestment: 8000, yearlyIncome: 320, includeIncome: true, overrideProposal: false, symbol: "BND", newSymbol: "BND", newPercent: 0 },
];

function isDefaultIncomeTicker(row: Pick<TickerRow, "category" | "taxTreatment">) {
  const category = normalizeLookupKey(row.category);
  const taxTreatment = normalizeTaxTreatmentKey(row.taxTreatment);
  return (
    ["socialsecurity", "noninvestmentincome"].includes(category) ||
    ["ss85fed"].includes(taxTreatment)
  );
}
function isIncomeAssetType(value: unknown) {
  return normalizeLookupKey(value) === "income";
}

const initialTickers: TickerRow[] = ([
  { id: 1, symbol: "VOO", percentReturn: 0.012, assetType: "ETF", category: "stock", taxTreatment: "qualified-div", extraData: 0, description: "Example S&P 500 ETF", exDividend: "", divPayout: "" },
  { id: 2, symbol: "SGOV", percentReturn: 0.04, assetType: "ETF", category: "treasury bond", taxTreatment: "state tax free", extraData: 0, description: "Example short-term treasury ETF", exDividend: "", divPayout: "" },
  { id: 3, symbol: "BND", percentReturn: 0.04, assetType: "ETF", category: "bond", taxTreatment: "non-qualified-div", extraData: 0, description: "Example bond market ETF", exDividend: "", divPayout: "" },
  { id: 4, symbol: "CASH", percentReturn: 0.01, assetType: "ETF", category: "cash", taxTreatment: "income", extraData: 0, description: "Example cash sweep", exDividend: "", divPayout: "" },
  { id: 5, symbol: "non investment income", percentReturn: 0, assetType: "Income", category: "non investment income", taxTreatment: "income", extraData: 0, description: "Example ordinary non-investment income", exDividend: "", divPayout: "" },
] as Array<Omit<TickerRow, "incomeItem">>).map((row) => ({ ...row, incomeItem: isIncomeAssetType(row.assetType) || isDefaultIncomeTicker(row) }));

const initialCategories: CategoryRow[] = categoryLabels.map((name, index) => ({ id: index + 1, name, includeInAllocation: true }));
export function defaultTaxTreatmentRule(label: string): Omit<TaxTreatmentRow, "id" | "label" | "includeInAllocation"> {
  const key = normalizeTaxTreatmentKey(label);
  const base = { ordinaryShare: 1, preferredShare: 0, stateRule: "taxable", niitIncluded: true, localCategory: "interest", description: "Ordinary taxable investment income" };
  if (["taxfree", "hold"].includes(key)) return { ...base, ordinaryShare: 0, stateRule: "exempt", niitIncluded: false, localCategory: "", description: "Excluded from current federal, state, local, and NIIT taxable income" };
  if (key === "fedtaxfree") return { ...base, ordinaryShare: 0, stateRule: "taxable", description: "Federally exempt but state taxable" };
  if (key === "statetaxfree") return { ...base, stateRule: "treasury-exempt", description: "Federally taxable U.S. Treasury interest; exempt from state and local income tax" };
  if (key === "index6040") return { ...base, ordinaryShare: 0.4, preferredShare: 0.6, localCategory: "capitalGains", description: "Section 1256-style 40% short-term / 60% long-term gain" };
  if (["qualifieddiv", "longtermgain"].includes(key)) return { ...base, ordinaryShare: 0, preferredShare: 1, localCategory: key === "qualifieddiv" ? "dividends" : "capitalGains", description: key === "qualifieddiv" ? "Qualified dividend income" : "Long-term capital gain" };
  if (key === "ss85fed") return { ...base, ordinaryShare: 0.85, stateRule: "exempt", niitIncluded: false, localCategory: "socialSecurity", description: "Legacy Social Security estimate; federal taxable share is capped at 85%" };
  if (key === "realestate") return { ...base, localCategory: "rentalIncome", description: "Ordinary real-estate income before property-specific deductions" };
  if (key === "nonqualifieddiv") return { ...base, localCategory: "dividends", description: "Nonqualified dividend taxed as ordinary income" };
  if (["shorttermgain"].includes(key)) return { ...base, localCategory: "capitalGains", description: "Short-term capital gain taxed as ordinary income" };
  return base;
}
export const defaultTaxTreatmentLabels = ["tax-free", "state tax free", "fed tax free", "index-60-40", "income", "ss-85-fed", "qualified-div", "non-qualified-div", "short term gain", "long term gain", "real estate", "hold"] as const;
const initialTaxTreatments: TaxTreatmentRow[] = defaultTaxTreatmentLabels.map((label, index) => ({ id: index + 1, label, ...defaultTaxTreatmentRule(label), includeInAllocation: true }));
const initialAccountTaxTypes: AccountTaxTypeRow[] = ["tax-free", "taxable", "deferred", "tax-deduction"].map((taxStatus, index) => ({ id: index + 1, taxStatus, includeInAllocation: true }));
const initialAccountTypes: AccountTypeRow[] = [
  { id: 1, name: "IRA", taxStatus: "deferred", includeInAllocation: true },
  { id: 2, name: "401k", taxStatus: "deferred", includeInAllocation: true },
  { id: 3, name: "inherited Brokerage", taxStatus: "taxable", includeInAllocation: true },
  { id: 4, name: "Brokerage Account", taxStatus: "taxable", includeInAllocation: true },
  { id: 5, name: "W2 income", taxStatus: "taxable", includeInAllocation: true },
];
function mergeDefaultAccountTypes(rows: AccountTypeRow[]) {
  const seen = new Set(rows.map((row) => normalizeLookupKey(row.name)).filter(Boolean));
  const nextRows = [...rows];
  let nextId = Math.max(0, ...rows.map((row) => Number(row.id) || 0)) + 1;
  for (const defaultRow of initialAccountTypes) {
    const key = normalizeLookupKey(defaultRow.name);
    if (!key || seen.has(key)) continue;
    nextRows.push({ ...defaultRow, id: nextId++ });
    seen.add(key);
  }
  return nextRows;
}
const initialAccounts: AccountRow[] = [
  { id: 1, account: "Example Brokerage", accountType: "Brokerage Account", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" },
  { id: 2, account: "Example IRA", accountType: "IRA", taxStatus: "deferred", dividendAccrued: "no", includeInFreeCashflow: "yes" },
];
const ordinaryWhatIfTypes = ["W2 wages", "Ordinary dividends", "Interest income", "Business income", "Rental income", "Other ordinary income"];
const preferredWhatIfTypes = ["Long-term capital gains", "Qualified dividends", "Section 1250 gain", "Collectibles gain", "Other preferred income"];
const federalDeductionTypes = ["Mortgage interest", "Property tax", "Investment loss (Long Term)", "Investment loss (Short Term)", "Charitable contributions", "Medical expenses", "Other itemized deduction"];
const stateDeductionTypes = ["Mortgage interest", "Property tax", "Investment loss (Long Term)", "Investment loss (Short Term)", "Charitable contributions", "Medical expenses", "State-specific deduction", "Other itemized deduction"];
const blankDeductionType = "";
const federalDeductionLimitNotes: Record<string, string> = {
  "Mortgage interest": "The entered amount is used; qualified-residence, acquisition-debt, loan-date, and tracing limits are not automatically calculated.",
  "Property tax": "Included with state income tax in the modeled SALT cap rather than deducted a second time.",
  "Investment loss (Long Term)": "Capital losses are generally limited to a $3,000 annual net capital loss deduction; unused losses carry forward.",
  "Investment loss (Short Term)": "Capital losses are generally limited to a $3,000 annual net capital loss deduction; unused losses carry forward.",
  "Charitable contributions": "The entered amount is used; AGI percentage limits, qualified-organization rules, and carryforwards are not automatically calculated.",
  "Medical expenses": "The entered amount is used; enter only the eligible amount above the applicable AGI floor.",
  "Other itemized deduction": "Eligibility, substantiation, and category-specific limits are not automatically validated.",
};
const federalAboveLineDeductionTypes = ["Capital loss deduction", "IRA contribution", "HSA contribution", "Student loan interest", "Self-employed health insurance", "Educator expenses", "Other adjustment"];
const federalAboveLineDeductionLimitNotes: Record<string, string> = {
  "Capital loss deduction": "Net capital losses can reduce ordinary income by up to $3,000 per year; excess losses carry forward.",
  "IRA contribution": "Traditional IRA deductions can be limited by income, filing status, workplace plan coverage, and contribution limits.",
  "HSA contribution": "HSA deductions require HSA eligibility and are limited by coverage type and age.",
  "Student loan interest": "Student loan interest deductions are capped and phase out at higher income levels.",
  "Self-employed health insurance": "Self-employed health insurance deductions are limited by business profit and eligibility for other coverage.",
  "Educator expenses": "Educator expense deductions are capped annually and require qualifying educator expenses.",
  "Other adjustment": "Eligibility, phaseouts, and category-specific limits are not automatically validated.",
};
const localTaxBaseLabels: Record<LocalTaxBaseKey, string> = {
  wages: "Wages / salary",
  selfEmployment: "Self-employment",
  interest: "Interest / ordinary investment income",
  dividends: "Dividends",
  capitalGains: "Capital gains",
  rentalIncome: "Rental income",
  businessIncome: "Business income",
  retirementIncome: "Retirement income",
  socialSecurity: "Social Security",
};
const localTaxBaseKeys = Object.keys(localTaxBaseLabels) as LocalTaxBaseKey[];
const filingStatusLabels: Record<FilingStatus, string> = {
  single: "Single",
  mfj: "Married filing jointly",
  mfs: "Married filing separately",
  hoh: "Head of household",
};
const createEmptyLocalTaxBaseAmounts = () => localTaxBaseKeys.reduce((base, key) => ({ ...base, [key]: 0 }), {} as Record<LocalTaxBaseKey, number>);
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
function addLocalTaxBaseAmount(base: Record<LocalTaxBaseKey, number>, key: LocalTaxBaseKey, amount: number) {
  base[key] += Math.max(toNumber(amount), 0);
}
function classifyLocalInvestmentIncome(row: Pick<DerivedInvestmentRow, "account" | "effectiveSymbol" | "filteredIncome" | "investmentType" | "localTaxCategory" | "nonInvestmentIncome" | "taxStatus" | "taxTreatment" | "w2Income">): LocalTaxBaseKey {
  const treatment = normalizeLookupKey(row.taxTreatment);
  const type = normalizeLookupKey(row.investmentType);
  const status = normalizeLookupKey(row.taxStatus);
  const accountName = normalizeLookupKey(row.account);
  const symbol = normalizeLookupKey(row.effectiveSymbol);
  if (row.w2Income > 0) return "wages";
  if (type.includes("social-security") || type.includes("social security") || symbol === "ss" || symbol.includes("aux-ss")) return "socialSecurity";
  if (status.includes("deferred") || accountName.includes("ira") || accountName.includes("401k") || accountName.includes("pension") || accountName.includes("deferred")) return "retirementIncome";
  if (localTaxBaseKeys.includes(row.localTaxCategory as LocalTaxBaseKey)) return row.localTaxCategory as LocalTaxBaseKey;
  if (type.includes("real estate") || type.includes("rental") || treatment.includes("real estate")) return "rentalIncome";
  if (treatment.includes("qualified-div") || treatment.includes("non-qualified-div") || type.includes("dividend")) return "dividends";
  if (treatment.includes("gain") || treatment.includes("index-60-40")) return "capitalGains";
  if (row.nonInvestmentIncome > 0 || type.includes("business")) return "businessIncome";
  return "interest";
}
function classifyLocalWhatIfIncomeType(incomeType: string, preferred: boolean): LocalTaxBaseKey {
  const key = normalizeLookupKey(incomeType);
  if (isW2IncomeType(incomeType) || key.includes("wage") || key.includes("salary")) return "wages";
  if (key.includes("self")) return "selfEmployment";
  if (key.includes("rental")) return "rentalIncome";
  if (key.includes("business")) return "businessIncome";
  if (key.includes("qualified dividend") || key.includes("ordinary dividend") || key.includes("dividend")) return "dividends";
  if (key.includes("capital gain") || key.includes("gain") || key.includes("collectible") || key.includes("section 1250")) return "capitalGains";
  if (key.includes("interest")) return "interest";
  return preferred ? "capitalGains" : "businessIncome";
}
function addLocalTaxWhatIfItems(base: Record<LocalTaxBaseKey, number>, items: TaxWhatIfItem[] | undefined, preferred: boolean, legacyAmount = 0) {
  const activeItems = (Array.isArray(items) ? items : []).filter((item) => toNumber(item.amount) > 0);
  if (activeItems.length === 0) {
    const amount = toNumber(legacyAmount);
    if (amount > 0) addLocalTaxBaseAmount(base, preferred ? "capitalGains" : "businessIncome", amount);
    return;
  }
  activeItems.forEach((item) => addLocalTaxBaseAmount(base, classifyLocalWhatIfIncomeType(item.incomeType, preferred), item.amount));
}
const earningsLocalTaxBase = (): LocalTaxBaseSelection => ({
  ...noLocalTaxBase(),
  wages: true,
  selfEmployment: true,
});
const fallbackLocalTaxProfiles: LocalTaxProfile[] = [
  { id: "none", locality: "No local income tax", state: "", kind: "none", residentRate: 0, nonresidentRate: 0, base: noLocalTaxBase(), note: "No city, county, or district income tax is applied." },
  { id: "custom", locality: "Custom / manual local tax", state: "", kind: "flat", residentRate: 0, nonresidentRate: 0, base: earningsLocalTaxBase(), note: "Enter a local rate and choose which income categories are taxed." },
];
const newTaxWhatIfItem = (incomeType: string): TaxWhatIfItem => ({ id: Date.now() + Math.floor(Math.random() * 100000), amount: 0, incomeType });
const newAboveLineDeductionItem = (deductionType: string, amount = 0): AboveLineDeductionItem => ({ id: Date.now() + Math.floor(Math.random() * 100000), amount, deductionType });
const newDeductionItem = (deductionType: string, amount = 0): DeductionItem => ({ id: Date.now() + Math.floor(Math.random() * 100000), amount, deductionType });
const blankOrdinaryWhatIfItem = (): TaxWhatIfItem => newTaxWhatIfItem(ordinaryWhatIfTypes[0]);
const blankPreferredWhatIfItem = (): TaxWhatIfItem => newTaxWhatIfItem(preferredWhatIfTypes[0]);
const initialFederalSettings: FederalSettings = { filingStatus: "mfj", deductionMode: "standard", extraOrdinaryIncome: 0, extraPreferredIncome: 0, extraOrdinaryItems: [blankOrdinaryWhatIfItem()], extraPreferredItems: [blankPreferredWhatIfItem()], aboveLineDeductionItems: [newAboveLineDeductionItem(blankDeductionType)], deductionItems: [newDeductionItem(blankDeductionType)], mortgageInterest: 0, propertyTax: 0 };
const initialStateSettings: StateSettings = { stateCode: "CA", extraStateIncome: 0, deductionMode: "itemized", deductionItems: [newDeductionItem("Mortgage interest", 26500), newDeductionItem("Property tax", 19000)], mortgageInterest: 26500, propertyTax: 19000, standardDeduction: 11000 };
const initialLocalTaxSettings: LocalTaxSettings = { enabled: false, localityId: "none", localityName: "", residency: "resident", rate: 0, nonresidentRate: 0, taxableBase: noLocalTaxBase() };
const initialPlannerSettings: PlannerSettings = { federalWithholding: 0, stateWithholding: 0 };
const initialUiSettings: UiSettings = { publicUsername: "", investmentFavorites: [], selectedAssetIds: [], savedScenarios: [], scenarioLibraryMigrated: false, modelVersions: [], incomePrimaryPeriod: "annual", darkMode: false, investmentWhatIfOpen: false };
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

function formatDollarInputValue(value: number | string | boolean | null | undefined) {
  const rawValue = String(value ?? "").replace(/[\$,%\s,]/g, "");
  if (rawValue === "" || rawValue === "-" || rawValue === "." || rawValue === "-.") return rawValue;
  const isNegative = rawValue.startsWith("-");
  const unsignedValue = isNegative ? rawValue.slice(1) : rawValue;
  const [integerPart = "", decimalPart] = unsignedValue.split(".");
  const formattedInteger = integerPart.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") || "0";
  return `${isNegative ? "-" : ""}${formattedInteger}${decimalPart !== undefined ? `.${decimalPart}` : ""}`;
}

function isPlaceholderAssetSymbol(value: string) {
  const normalized = normalizeLookupKey(value).replace(/[^a-z0-9]/g, "");
  return ["na", "none", "notapplicable"].includes(normalized);
}

function getStateTaxRateMarkers(profile: LocalStateTaxProfile, filingStatus: LocalStateTaxFilingStatus): ThermometerMarker[] {
  const brackets = stateTaxBracketsForProfile(profile, filingStatus);

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

function getStateTaxBaseRateLabel(profile: LocalStateTaxProfile, filingStatus: LocalStateTaxFilingStatus) {
  const brackets = stateTaxBracketsForProfile(profile, filingStatus);
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
export function normalizeTaxTreatmentKey(value: unknown) {
  return normalizeLookupKey(value).replace(/[^a-z0-9]/g, "");
}
export function canonicalStateRuleForTaxTreatment(value: unknown) {
  const key = normalizeTaxTreatmentKey(value);
  if (["taxfree", "hold"].includes(key)) return "exempt";
  if (["statetaxfree", "treasuryinterest", "ustreasuryinterest"].includes(key)) return "treasury-exempt";
  return "";
}
function stockAnalysisDividendUrl(symbol: unknown, assetType: unknown = "ETF") {
  const normalizedSymbol = String(symbol || "").trim().toLowerCase();
  const section = normalizeLookupKey(assetType) === "stock" ? "stocks" : "etf";
  return normalizedSymbol
    ? `https://stockanalysis.com/${section}/${encodeURIComponent(normalizedSymbol)}/dividend/`
    : `https://stockanalysis.com/${section}/`;
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
  if (key.includes("w2") || key.includes("w-2") || key.includes("wage")) return "W2 income";
  if (key.includes("401k") || key.includes("401")) return "401k";
  if (key.includes("inherited") && key.includes("brokerage")) return "inherited Brokerage";
  if (key.includes("ira")) return "IRA";
  if (key.includes("brokerage")) return "Brokerage Account";
  return "";
}
function inferAccountTypeTaxStatus(typeName: string) {
  const key = normalizeLookupKey(typeName);
  if (!key) return "";
  if (key.includes("w2") || key.includes("wage")) return "taxable";
  if (key.includes("401") || key.includes("ira")) return "deferred";
  if (key.includes("brokerage")) return "taxable";
  return "";
}
function isW2AccountType(value: unknown) {
  const key = normalizeLookupKey(value);
  return key.includes("w2") || key.includes("wage");
}
function isTaxableAccountStatus(value: unknown, forceTaxable = false) {
  if (forceTaxable) return true;
  const key = normalizeLookupKey(value);
  const compactKey = key.replace(/[^a-z0-9]/g, "");
  return compactKey === "taxable" || compactKey === "partiallytaxable";
}
export function accountStatusAllowsCurrentTaxableIncome(value: unknown, incomeItem: boolean, forceTaxable = false) {
  return incomeItem || isTaxableAccountStatus(value, forceTaxable);
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

function floatingPickerMenuStyle(trigger: HTMLElement | null, minimumWidth: number, preferredMaxHeight: number): CSSProperties {
  const rect = trigger?.getBoundingClientRect();
  if (!rect) return {};
  const viewportPadding = 8;
  const gap = 4;
  const width = Math.max(rect.width, minimumWidth);
  const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const opensUp = spaceBelow < preferredMaxHeight && spaceAbove > spaceBelow;
  const maxHeight = Math.max(120, Math.min(preferredMaxHeight, (opensUp ? spaceAbove : spaceBelow) - gap));
  const left = Math.min(Math.max(viewportPadding, rect.left), Math.max(viewportPadding, window.innerWidth - width - viewportPadding));
  return {
    left,
    top: opensUp ? Math.max(viewportPadding, rect.top - maxHeight - gap) : rect.bottom + gap,
    width,
    maxHeight,
  };
}

function AccountSelect({ value, options, excludedFromAfterTaxIncome = false, onChange, onAddIncome, onAddNew, onJumpToAccount, ariaLabel }: { value: string; options: string[]; excludedFromAfterTaxIncome?: boolean; onChange: (value: string) => void; onAddIncome?: () => void; onAddNew?: () => void; onJumpToAccount?: (accountName: string) => void; ariaLabel: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const updateMenuPosition = () => {
    setMenuStyle(floatingPickerMenuStyle(triggerRef.current, 240, 260));
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
      if (event.key === "Escape") {
        setIsOpen(false);
      }
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
        className={`account-picker__trigger ${excludedFromAfterTaxIncome ? "account-picker__trigger--excluded-income" : ""}`.trim()}
        type="button"
        ref={triggerRef}
        style={excludedFromAfterTaxIncome ? { paddingTop: 10 } : undefined}
        title={onJumpToAccount ? "Open dropdown to jump to this account on the Accounts tab" : undefined}
        onDoubleClick={() => {
          setIsOpen(false);
        }}
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
        {excludedFromAfterTaxIncome && (
          <span
            className="account-picker__excluded-badge"
            style={{
              position: "absolute",
              top: 4,
              right: 30,
              maxWidth: "none",
              padding: "1px 4px",
              border: "1px solid #fde047",
              borderRadius: 999,
              background: "#facc15",
              color: "#3a2500",
              fontSize: 7,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: ".03em",
              textTransform: "uppercase",
              overflow: "visible",
              textOverflow: "clip",
              whiteSpace: "nowrap",
              transform: "rotate(-30deg)",
              transformOrigin: "right center",
              pointerEvents: "none",
              boxShadow: "0 0 0 1px rgba(120, 77, 0, .24), 0 2px 8px rgba(250, 204, 21, .48)",
              zIndex: 2,
            }}
            title="This account is excluded from after-tax income totals. Change this on the Accounts tab."
          >
            Excluded
          </span>
        )}
      </button>
      {isOpen && createPortal(
        <div className="account-picker__menu account-picker__menu--portal" ref={menuRef} style={menuStyle} role="listbox" aria-label={ariaLabel}>
          <button className="account-picker__option account-picker__option--action" type="button" role="option" aria-selected="false" onClick={() => {
            setIsOpen(false);
            if (onAddNew) onAddNew();
            else window.dispatchEvent(new CustomEvent("aftertax:quick-add", { detail: { kind: "account", select: onChange } }));
          }}>
              <span className="account-favicon account-favicon--fallback" aria-hidden="true">+</span>
              <span>Add new account…</span>
          </button>
          {onAddIncome && (
            <button
              className="account-picker__option account-picker__option--action"
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => {
                onAddIncome();
                setIsOpen(false);
              }}
            >
              <span className="account-favicon account-favicon--fallback" aria-hidden="true">+</span>
              <span>Add Income</span>
            </button>
          )}
          {value && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 7, marginBottom: 4, borderBottom: "1px solid rgba(15, 23, 42, .1)" }}>
              <AccountFavicon accountName={value} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 750 }}>{value}</span>
              {onJumpToAccount && (
                <button
                  className="ghost-button ghost-button--compact"
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onJumpToAccount(value);
                  }}
                >
                  Jump
                </button>
              )}
            </div>
          )}
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

function AssetSelect({ value, options, accountTaxStatus, tickerMap, taxTreatmentMap = {}, stateCode, disabled = false, resetToValue, onChange, onAddNew, onJumpToAsset, ariaLabel }: { value: string; options: string[]; accountTaxStatus: string; tickerMap: Record<string, TickerRow>; taxTreatmentMap?: Record<string, TaxTreatmentRow>; stateCode: string; disabled?: boolean; resetToValue?: string; onChange: (value: string) => void; onAddNew?: () => void; onJumpToAsset?: (assetSymbol: string) => void; ariaLabel: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const taxToneForOption = (option: string) => {
    const treatment = tickerMap[normalizeLookupKey(option)]?.taxTreatment || "income";
    return getAssetTaxTone(accountTaxStatus, treatment, stateCode, taxTreatmentMap[normalizeLookupKey(treatment)]);
  };
  const selectedTone = taxToneForOption(value);
  const selectedAssetName = value.trim();
  const displayedValue = selectedAssetName || "No asset selected";
  const resetAssetName = String(resetToValue || "").trim();
  const showResetOption = resetAssetName !== "" && normalizeLookupKey(resetAssetName) !== normalizeLookupKey(value);
  const updateMenuPosition = () => {
    setMenuStyle(floatingPickerMenuStyle(triggerRef.current, 230, 320));
  };

  useEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
    const handlePointerDown = (event: PointerEvent) => {
      if (pickerRef.current?.contains(event.target as Node) || menuRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
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
    <div className="account-picker asset-picker" ref={pickerRef}>
      <button
        className={`account-picker__trigger asset-picker__trigger asset-tax-select asset-tax-select--${selectedTone}`}
        type="button"
        ref={triggerRef}
        disabled={disabled}
        title={onJumpToAsset ? "Open dropdown to jump to this asset on the Assets tab" : undefined}
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
          <button className="account-picker__option account-picker__option--action" type="button" role="option" aria-selected="false" onClick={() => {
            setIsOpen(false);
            if (onAddNew) onAddNew();
            else window.dispatchEvent(new CustomEvent("aftertax:quick-add", { detail: { kind: "asset", select: onChange } }));
          }}>
              <span>Add new asset…</span>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 7, marginBottom: 4, borderBottom: "1px solid rgba(15, 23, 42, .1)", borderRadius: 8, background: "rgba(248, 250, 252, .98)", color: "#172033" }}>
            <span title={displayedValue} style={{ flex: "1 1 auto", minWidth: 0, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#172033", fontSize: 13, fontWeight: 850, lineHeight: 1.2 }}>
              {displayedValue}
            </span>
            {selectedAssetName && (
              <span className={`asset-tax-indicator asset-tax-indicator--${selectedTone}`} title={assetTaxToneLabel(selectedTone)} aria-label={assetTaxToneLabel(selectedTone)} />
            )}
            {onJumpToAsset && selectedAssetName && (
                <button
                  className="ghost-button ghost-button--compact"
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onJumpToAsset(selectedAssetName);
                  }}
                >
                  Jump
                </button>
            )}
          </div>
          {showResetOption && (
            <button
              className="account-picker__option asset-picker__option"
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => { onChange(resetAssetName); setIsOpen(false); }}
            >
              <span>Reset to {resetAssetName}</span>
              <span className={`asset-tax-indicator asset-tax-indicator--${taxToneForOption(resetAssetName)}`} title={assetTaxToneLabel(taxToneForOption(resetAssetName))} aria-label={assetTaxToneLabel(taxToneForOption(resetAssetName))} />
            </button>
          )}
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
  const [draftValue, setDraftValue] = useState(formatDollarInputValue(value));

  useEffect(() => {
    if (toNumber(draftValue) === toNumber(value)) return;
    setDraftValue(formatDollarInputValue(value));
  }, [draftValue, value]);

  function handleChange(rawValue: string) {
    setDraftValue(formatDollarInputValue(rawValue));
    onChange(String(toNumber(rawValue)));
  }

  return (
    <input
      className="money-input"
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draftValue}
      onFocus={(event) => {
        event.currentTarget.select();
      }}
      onChange={(event) => handleChange(event.target.value)}
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

function normalizeSelectedAssetIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))];
}

function normalizeSavedScenarios(raw: unknown): SummaryReportScenario[] {
  if (!Array.isArray(raw)) return [];
  const scenarios: SummaryReportScenario[] = [];
  const seenIds = new Set<string>();
  raw.forEach((entry, index) => {
    const scenario = decodeSummaryReportScenario(entry, index);
    if (!scenario || seenIds.has(scenario.id)) return;
    seenIds.add(scenario.id);
    scenarios.push(scenario);
  });
  return scenarios.slice(0, SAVED_SCENARIO_LIMIT);
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
        accountTypes: mergeDefaultAccountTypes(Array.isArray(snapshot.accountTypes) ? snapshot.accountTypes as AccountTypeRow[] : initialAccountTypes),
        federalSettings: normalizeFederalSettings(snapshot.federalSettings),
        stateSettings: normalizeStateSettings(snapshot.stateSettings),
        localTaxSettings: normalizeLocalTaxSettings(snapshot.localTaxSettings),
        plannerSettings: mergeSettings(initialPlannerSettings, snapshot.plannerSettings),
        uiSettings: {
          investmentFavorites: normalizeInvestmentFavorites((snapshot.uiSettings as Record<string, unknown> | undefined)?.investmentFavorites),
          selectedAssetIds: normalizeSelectedAssetIds((snapshot.uiSettings as Record<string, unknown> | undefined)?.selectedAssetIds),
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
function normalizeFederalDeductionMode(value: unknown): FederalDeductionMode {
  return String(value || "").trim().toLowerCase() === "itemized" ? "itemized" : "standard";
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

function normalizeDeductionItems(raw: unknown, mortgageInterest = 0, propertyTax = 0): DeductionItem[] {
  const sourceRows = Array.isArray(raw) ? raw : [];
  const rows = sourceRows
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const obj = entry as Record<string, unknown>;
      const deductionType = String(obj.deductionType ?? blankDeductionType).trim();
      return {
        id: Number(obj.id) || Date.now() + index,
        amount: toNumber(obj.amount as number | string | boolean | null | undefined),
        deductionType,
      };
    })
    .filter((row): row is DeductionItem => Boolean(row));
  if (rows.length > 0) return rows;
  if (mortgageInterest > 0 || propertyTax > 0) {
    return [
      ...(mortgageInterest > 0 ? [newDeductionItem("Mortgage interest", mortgageInterest)] : []),
      ...(propertyTax > 0 ? [newDeductionItem("Property tax", propertyTax)] : []),
    ];
  }
  return [newDeductionItem(blankDeductionType)];
}

function normalizeAboveLineDeductionItems(raw: unknown): AboveLineDeductionItem[] {
  const sourceRows = Array.isArray(raw) ? raw : [];
  const rows = sourceRows
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const obj = entry as Record<string, unknown>;
      const deductionType = String(obj.deductionType ?? blankDeductionType).trim();
      return {
        id: Number(obj.id) || Date.now() + index,
        amount: toNumber(obj.amount as number | string | boolean | null | undefined),
        deductionType,
      };
    })
    .filter((row): row is AboveLineDeductionItem => Boolean(row));
  return rows.length ? rows : [newAboveLineDeductionItem(blankDeductionType)];
}

function deductionTotalByType(items: DeductionItem[], deductionType: string) {
  return items.reduce((total, item) => item.deductionType === deductionType ? total + toNumber(item.amount) : total, 0);
}

type FederalAboveLineDeductionSummary = { capitalLossRaw: number; capitalLossDeduction: number; total: number };
type FederalDeductionSummary = {
  mortgageInterest: number;
  propertyTax: number;
  capitalLossRaw: number;
  capitalLossDeduction: number;
  otherItemized: number;
  saltDeduction: number;
  itemizedDeduction: number;
};

function getLocalTaxProfile(profiles: LocalTaxProfile[], localityId: string) {
  return profiles.find((profile) => profile.id === localityId) || profiles[0] || fallbackLocalTaxProfiles[0];
}

function normalizeLocalTaxBaseSelection(raw: unknown, fallback = noLocalTaxBase()): LocalTaxBaseSelection {
  const rawObj = raw && typeof raw === "object" ? raw as Partial<Record<LocalTaxBaseKey, unknown>> : {};
  return localTaxBaseKeys.reduce((base, key) => {
    base[key] = rawObj[key] === undefined ? fallback[key] : normalizeBoolean(rawObj[key]);
    return base;
  }, {} as LocalTaxBaseSelection);
}

function normalizeLocalTaxSettings(raw: unknown): LocalTaxSettings {
  const merged = mergeSettings(initialLocalTaxSettings, raw) as LocalTaxSettings;
  return {
    enabled: merged.enabled === true && merged.localityId !== "none",
    localityId: String(merged.localityId || "none"),
    localityName: String(merged.localityName || ""),
    residency: merged.residency === "nonresident" ? "nonresident" : "resident",
    rate: normalizeRate(merged.rate),
    nonresidentRate: normalizeRate(merged.nonresidentRate),
    taxableBase: normalizeLocalTaxBaseSelection(merged.taxableBase, initialLocalTaxSettings.taxableBase),
  };
}

function normalizeFederalSettings(raw: unknown): FederalSettings {
  const merged = mergeSettings(initialFederalSettings, raw) as FederalSettings;
  const extraOrdinaryItems = normalizeTaxWhatIfItems(merged.extraOrdinaryItems, ordinaryWhatIfTypes[0], merged.extraOrdinaryIncome);
  const extraPreferredItems = normalizeTaxWhatIfItems(merged.extraPreferredItems, preferredWhatIfTypes[0], merged.extraPreferredIncome);
  const aboveLineDeductionItems = normalizeAboveLineDeductionItems(merged.aboveLineDeductionItems);
  const deductionItems = normalizeDeductionItems(merged.deductionItems, merged.mortgageInterest, merged.propertyTax);
  return {
    ...merged,
    deductionMode: normalizeFederalDeductionMode(merged.deductionMode),
    extraOrdinaryItems,
    extraPreferredItems,
    aboveLineDeductionItems,
    deductionItems,
    extraOrdinaryIncome: extraOrdinaryItems.reduce((total, row) => total + toNumber(row.amount), 0),
    extraPreferredIncome: extraPreferredItems.reduce((total, row) => total + toNumber(row.amount), 0),
    mortgageInterest: deductionTotalByType(deductionItems, "Mortgage interest"),
    propertyTax: deductionTotalByType(deductionItems, "Property tax"),
  };
}

function normalizeStateSettings(raw: unknown): StateSettings {
  const merged = mergeSettings(initialStateSettings, raw) as StateSettings;
  const rawSettings = raw && typeof raw === "object" ? raw as Partial<StateSettings> : {};
  const deductionItems = normalizeDeductionItems(rawSettings.deductionItems, merged.mortgageInterest, merged.propertyTax);
  const itemizedTotal = deductionItems.reduce((total, row) => row.deductionType ? total + Math.max(toNumber(row.amount), 0) : total, 0);
  const deductionMode = rawSettings.deductionMode
    ? normalizeFederalDeductionMode(rawSettings.deductionMode)
    : itemizedTotal > merged.standardDeduction ? "itemized" : "standard";
  return {
    ...merged,
    deductionMode,
    deductionItems,
    mortgageInterest: deductionTotalByType(deductionItems, "Mortgage interest"),
    propertyTax: deductionTotalByType(deductionItems, "Property tax"),
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
  const extraOrdinaryIncome = parseNumberFromSection(sectionObj, rows, "extraOrdinaryIncome", "Extra ordinary income");
  const extraPreferredIncome = parseNumberFromSection(sectionObj, rows, "extraPreferredIncome", "Extra preferred income");
  if (extraOrdinaryIncome !== undefined) result.extraOrdinaryIncome = extraOrdinaryIncome;
  if (extraPreferredIncome !== undefined) result.extraPreferredIncome = extraPreferredIncome;
  result.extraOrdinaryItems = normalizeTaxWhatIfItems(sectionObj?.extraOrdinaryItems, ordinaryWhatIfTypes[0], result.extraOrdinaryIncome || 0);
  result.extraPreferredItems = normalizeTaxWhatIfItems(sectionObj?.extraPreferredItems, preferredWhatIfTypes[0], result.extraPreferredIncome || 0);
  result.aboveLineDeductionItems = normalizeAboveLineDeductionItems(sectionObj?.aboveLineDeductionItems);
  result.deductionItems = normalizeDeductionItems(sectionObj?.deductionItems, result.mortgageInterest || 0, result.propertyTax || 0);

  const filingValue = parseStringFromSection(sectionObj, rows, "filingStatus", "Filing status");
  if (filingValue) {
    result.filingStatus = normalizeFilingStatus(filingValue);
  }
  const deductionModeValue = parseStringFromSection(sectionObj, rows, "deductionMode", "Deduction mode");
  if (deductionModeValue) {
    result.deductionMode = normalizeFederalDeductionMode(deductionModeValue);
  }

  return result;
}

function parseStateSettingsSection(section: unknown): Partial<StateSettings> {
  const sectionObj = section && typeof section === "object" ? (section as SettingsSection) : undefined;
  const rows = sectionObj ? normalizeSheetRows(sectionObj.rows) : undefined;
  const result: Partial<StateSettings> = {};

  const setNumberField = (field: Exclude<keyof StateSettings, "stateCode" | "deductionMode" | "deductionItems">, label: string) => {
    const value = parseNumberFromSection(sectionObj, rows, field, label);
    if (value !== undefined) {
      result[field] = value as StateSettings[typeof field];
    }
  };

  setNumberField("mortgageInterest", "mortgage interest");
  setNumberField("propertyTax", "property tax");
  setNumberField("standardDeduction", "Standard deduction");
  result.deductionItems = normalizeDeductionItems(sectionObj?.deductionItems, result.mortgageInterest || 0, result.propertyTax || 0);
  const deductionModeValue = parseStringFromSection(sectionObj, rows, "deductionMode", "Deduction mode");
  if (deductionModeValue) result.deductionMode = normalizeFederalDeductionMode(deductionModeValue);

  const extraStateIncome = parseNumberFromSection(sectionObj, rows, "extraStateIncome", "Extra state income");
  if (extraStateIncome !== undefined) {
    result.extraStateIncome = extraStateIncome;
  }

  return result;
}

function parseLocalTaxSettingsSection(section: unknown): Partial<LocalTaxSettings> {
  if (!section || typeof section !== "object") return {};
  const sectionObj = section as SettingsSection;
  return normalizeLocalTaxSettings(sectionObj);
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
  const mcpRefresh = sectionObj.mcpRefresh && typeof sectionObj.mcpRefresh === "object"
    ? sectionObj.mcpRefresh as UiSettings["mcpRefresh"]
    : undefined;
  return {
    publicUsername: normalizePublicReportSlug(sectionObj.publicUsername).slice(0, 32),
    investmentFavorites: normalizeInvestmentFavorites(sectionObj.investmentFavorites),
    selectedAssetIds: normalizeSelectedAssetIds(sectionObj.selectedAssetIds),
    savedScenarios: normalizeSavedScenarios(sectionObj.savedScenarios),
    scenarioLibraryMigrated: sectionObj.scenarioLibraryMigrated === true,
    modelVersions: normalizeModelVersions(sectionObj.modelVersions),
    incomePrimaryPeriod: sectionObj.incomePrimaryPeriod === "monthly" ? "monthly" : "annual",
    darkMode: sectionObj.darkMode === true,
    investmentWhatIfOpen: sectionObj.investmentWhatIfOpen === true,
    mcpRefresh,
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
    local: parseLocalTaxSettingsSection(settingsObj.local),
    planner,
    ui: {
      publicUsername: ui.publicUsername || "",
      investmentFavorites: ui.investmentFavorites && ui.investmentFavorites.length > 0
        ? ui.investmentFavorites
        : legacyFavorites,
      selectedAssetIds: ui.selectedAssetIds || [],
      savedScenarios: ui.savedScenarios || [],
      scenarioLibraryMigrated: ui.scenarioLibraryMigrated === true,
      modelVersions: ui.modelVersions || [],
      incomePrimaryPeriod: ui.incomePrimaryPeriod || "annual",
      darkMode: ui.darkMode === true,
      investmentWhatIfOpen: ui.investmentWhatIfOpen === true,
      mcpRefresh: ui.mcpRefresh,
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
function formatCurrencyInput(value: number) { return formatDollarInputValue(value); }
function parseCurrencyInput(value: string) { return toNumber(value); }
function formatSignedCurrency(value: number) {
  if (Math.abs(value) < 0.5) return "$0";
  return `${value > 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;
}
export function fedTaxAdjust(amount: number, taxTreatment: string, pref: boolean, rule?: TaxTreatmentRow) {
  if (rule) {
    const ordinary = Math.max(0, Math.min(1, toNumber(rule.ordinaryShare)));
    const preferred = Math.max(0, Math.min(1, toNumber(rule.preferredShare)));
    const scale = ordinary + preferred > 1 ? 1 / (ordinary + preferred) : 1;
    return amount * (pref ? preferred : ordinary) * scale;
  }
  const fallback = defaultTaxTreatmentRule(taxTreatment);
  return amount * (pref ? fallback.preferredShare : fallback.ordinaryShare);
}
export function stateTaxAdjust(amount: number, taxTreatment: string, _stateCode = "CA", rule?: TaxTreatmentRow) {
  const canonicalStateRule = canonicalStateRuleForTaxTreatment(taxTreatment);
  const stateRule = normalizeTaxTreatmentKey(canonicalStateRule || rule?.stateRule || defaultTaxTreatmentRule(taxTreatment).stateRule);
  return ["exempt", "treasuryexempt"].includes(stateRule) ? 0 : amount;
}
function getAssetTaxTone(taxStatus: string, taxTreatment: string, stateCode: string, rule?: TaxTreatmentRow): AssetTaxTone {
  const normalizedStatus = String(taxStatus || "").trim().toLowerCase();
  const isTaxableAccount = ["taxable", "partially taxable"].includes(normalizedStatus);
  if (!isTaxableAccount) return "tax-free";
  const federalTaxable = fedTaxAdjust(1, taxTreatment, false, rule) + fedTaxAdjust(1, taxTreatment, true, rule) > 0;
  const stateTaxable = stateTaxAdjust(1, taxTreatment, stateCode, rule) > 0;
  if (federalTaxable && stateTaxable) return "fully-taxable";
  if (federalTaxable) return "federal-taxable-state-free";
  if (stateTaxable) return "federal-free-state-taxable";
  return "tax-free";
}
async function postTaxCalculation<T = TaxResult>(payload: Record<string, unknown>) {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const response = await fetch(`${API_BASE_URL}/hello`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const json = (await response.json()) as T | ApiError;
  if (!response.ok) throw new Error((json as ApiError).error || "API request failed");
  return json as T;
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

async function getPublicSummaryReport(slug: string) {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const response = await fetch(`${API_BASE_URL}/hello`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ calc: "PUBLIC_REPORT_GET", slug }),
  });
  const json = (await response.json()) as { report?: PublicSummaryReportRecord; error?: string };
  if (!response.ok || !json.report) throw new Error(json.error || "Public report could not be loaded.");
  return json.report;
}

async function upsertPublicSummaryReport(report: { id: string; name: string; slug: string; previousSlug?: string; payload: SummaryReportPayload }, idToken: string | undefined, publicUsername: string) {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const requestBody = JSON.stringify({ calc: "PUBLIC_REPORT_UPSERT", reportId: report.id, name: report.name, slug: report.slug, publicUsername, previousSlug: report.previousSlug, payload: report.payload });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${API_BASE_URL}/hello`, {
      method: "POST",
      headers: authHeaders(idToken),
      body: requestBody,
    });
    const responseText = await response.text();
    let json: { report?: PublicSummaryReportRecord; publicUrl?: string; error?: string; message?: string } = {};
    try {
      json = JSON.parse(responseText) as typeof json;
    } catch {
      // API Gateway may occasionally return a non-JSON proxy error.
    }
    if (response.ok && json.report) {
      return { report: json.report, publicUrl: buildPublicSummaryReportUrl(json.report.slug, publicUsername) };
    }
    if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue;

    const detail = json.error || json.message || (responseText.trim().length < 240 ? responseText.trim() : "");
    const status = response.status ? ` (${response.status})` : "";
    throw new Error(detail || `Public report could not be saved${status}.`);
  }

  throw new Error("Public report could not be saved.");
}

async function checkPublicUsernameAvailability(username: string) {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const response = await fetch(`${API_BASE_URL}/hello`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ calc: "PUBLIC_USERNAME_CHECK", username }),
  });
  const json = (await response.json()) as { username?: string; available?: boolean; error?: string };
  if (!response.ok) throw new Error(json.error || "Username availability could not be checked.");
  return json.available === true;
}

async function claimPublicUsername(username: string, idToken: string) {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const response = await fetch(`${API_BASE_URL}/hello`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ calc: "PUBLIC_USERNAME_CLAIM", username }),
  });
  const json = (await response.json()) as { username?: string; error?: string };
  if (!response.ok) throw new Error(json.error || "Username could not be saved.");
  return String(json.username || username);
}

async function listPublicSummaryReports(idToken?: string) {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const response = await fetch(`${API_BASE_URL}/hello`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ calc: "PUBLIC_REPORT_LIST" }),
  });
  const json = (await response.json()) as { reports?: PublicSummaryReportRecord[]; error?: string };
  if (!response.ok) throw new Error(json.error || "Public reports could not be loaded.");
  return Array.isArray(json.reports) ? json.reports : [];
}

async function deletePublicSummaryReport(reportId: string, idToken?: string) {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const response = await fetch(`${API_BASE_URL}/hello`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ calc: "PUBLIC_REPORT_DELETE", reportId }),
  });
  const json = (await response.json()) as { deleted?: boolean; error?: string };
  if (!response.ok || !json.deleted) throw new Error(json.error || "Published report could not be deleted.");
}

function workbookRefreshMarker(response: WorkbookResponse) {
  const ui = response.settings?.ui;
  const mcpRefresh = ui && typeof ui === "object" ? (ui as UiSettings).mcpRefresh : undefined;
  return mcpRefresh?.requestedAt || response.updatedAt || null;
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
  const base: TickerRow = { id: index + 1, symbol: "", percentReturn: 0, assetType: "ETF", category: "", taxTreatment: "income", incomeItem: false, extraData: 0, description: "", exDividend: "", divPayout: "" };
  const percentValue = workbookField(row, "dividend", "percent_return", "percentReturn", "percent_return_rate", "percent");
  const extraDataValue = workbookField(row, "extra_data", "extraData");
  const symbol = workbookField(row, "symbol", "ticker") ?? base.symbol;
  const category = workbookField(row, "category") ?? base.category;
  const importedTaxTreatment = workbookField(row, "tax_treatment", "taxTreatment", "tax_status") ?? base.taxTreatment;
  const taxTreatment = normalizeTaxTreatmentKey(importedTaxTreatment) === "taxfree" ? "tax-free" : importedTaxTreatment;
  const incomeItemValue = workbookField(row, "incomeItem", "income_item", "is_income_item", "income_ticker", "income");
  const inferredIncomeItem = isDefaultIncomeTicker({ category, taxTreatment }) || normalizeLookupKey(symbol) === "noninvestmentincome";
  const legacyIncomeItem = inferredIncomeItem || (incomeItemValue !== undefined ? normalizeBoolean(incomeItemValue) : false);
  const assetType = workbookField(row, "asset_type", "assetType", "type", "security_type") ?? (legacyIncomeItem ? "Income" : base.assetType);
  const incomeItem = isIncomeAssetType(assetType) || legacyIncomeItem;
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    symbol,
    percentReturn: percentValue !== undefined ? normalizeRate(percentValue) : normalizeRate(base.percentReturn),
    assetType,
    category,
    taxTreatment,
    incomeItem,
    extraData: extraDataValue !== undefined ? toNumber(extraDataValue) : base.extraData,
    description: workbookField(row, "description", "desc") ?? base.description,
    exDividend: workbookField(row, "ex_dividend", "exDividend") ?? base.exDividend,
    divPayout: workbookField(row, "div_payout", "divPayout") ?? base.divPayout,
  };
}
function workbookToCategoryRow(row: Record<string, unknown>, index: number): CategoryRow {
  const base: CategoryRow = { id: index + 1, name: "", includeInAllocation: true };
  const allocationValue = workbookField(row, "includeInAllocation", "include_in_allocation", "allocation", "selected");
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    name: workbookField(row, "name", "category", "label") ?? base.name,
    includeInAllocation: allocationValue === undefined ? true : normalizeYesNo(allocationValue) === "yes",
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
  const importedLabel = workbookField(row, "label", "tax_treatment", "taxTreatment") ?? "";
  const label = normalizeTaxTreatmentKey(importedLabel) === "taxfree" ? "tax-free" : importedLabel;
  const defaults = defaultTaxTreatmentRule(label);
  const ordinaryShare = workbookField(row, "ordinaryShare", "ordinary_share", "ordinary_percent", "federal_ordinary_share");
  const preferredShare = workbookField(row, "preferredShare", "preferred_share", "preferred_percent", "federal_preferred_share");
  const niitIncluded = workbookField(row, "niitIncluded", "niit_included", "include_in_niit");
  const allocationValue = workbookField(row, "includeInAllocation", "include_in_allocation", "allocation", "selected");
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    label,
    ordinaryShare: ordinaryShare !== undefined ? normalizeRate(ordinaryShare) : defaults.ordinaryShare,
    preferredShare: preferredShare !== undefined ? normalizeRate(preferredShare) : defaults.preferredShare,
    stateRule: canonicalStateRuleForTaxTreatment(label) || workbookField(row, "stateRule", "state_rule", "state_treatment") || defaults.stateRule,
    niitIncluded: niitIncluded !== undefined ? normalizeBoolean(niitIncluded) : defaults.niitIncluded,
    localCategory: workbookField(row, "localCategory", "local_category", "local_income_category") ?? defaults.localCategory,
    description: workbookField(row, "description", "desc", "explanation") ?? defaults.description,
    includeInAllocation: allocationValue === undefined ? true : normalizeYesNo(allocationValue) === "yes",
  };
}
function workbookToAccountTaxTypeRow(row: Record<string, unknown>, index: number): AccountTaxTypeRow {
  const base: AccountTaxTypeRow = { id: index + 1, taxStatus: "", includeInAllocation: true };
  const allocationValue = workbookField(row, "includeInAllocation", "include_in_allocation", "allocation", "selected");
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    taxStatus: workbookField(row, "tax_status", "taxStatus", "tax_status") ?? base.taxStatus,
    includeInAllocation: allocationValue === undefined ? true : normalizeYesNo(allocationValue) === "yes",
  };
}
function workbookToAccountTypeRow(row: Record<string, unknown>, index: number): AccountTypeRow {
  const base: AccountTypeRow = { id: index + 1, name: "", taxStatus: "", includeInAllocation: true };
  const name = workbookField(row, "name", "accountType", "account_type", "type", "label") ?? base.name;
  const allocationValue = workbookField(row, "includeInAllocation", "include_in_allocation", "allocation", "selected");
  return {
    id: Number(workbookField(row, "id")) || index + 1,
    name,
    taxStatus: workbookField(row, "tax_status", "taxStatus", "tax_treatment", "status") ?? inferAccountTypeTaxStatus(name),
    includeInAllocation: allocationValue === undefined ? true : normalizeYesNo(allocationValue) === "yes",
  };
}
function mergeSettings<T extends object>(fallback: T, incoming: unknown): T { return incoming && typeof incoming === "object" ? ({ ...fallback, ...(incoming as Partial<T>) } as T) : fallback; }
function sumTaxWhatIfItems(items: TaxWhatIfItem[] | undefined, legacyAmount = 0) {
  const itemTotal = Array.isArray(items) ? items.reduce((total, item) => total + toNumber(item.amount), 0) : 0;
  return itemTotal > 0 ? itemTotal : toNumber(legacyAmount);
}
function sumW2TaxWhatIfItems(items: TaxWhatIfItem[] | undefined) {
  return (Array.isArray(items) ? items : []).reduce((total, item) => total + (isW2IncomeType(item.incomeType) ? toNumber(item.amount) : 0), 0);
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
      tickerFields: ["symbol", "percentReturn", "assetType", "category", "taxTreatment", "extraData", "description", "exDividend", "divPayout"],
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

function NavigableStatusCard({ children, targetCount = 0, onPrevious, onNext }: { children: ReactNode; targetCount?: number; onPrevious?: () => void; onNext?: () => void }) {
  const hasNavigation = targetCount > 0 && onPrevious && onNext;
  return (
    <div className="status-card status-card--error status-card--navigable" role="alert">
      <div className="status-card__message">{children}</div>
      {hasNavigation && (
        <div className="status-card__nav" aria-label="Error row navigation">
          <span>{targetCount} {targetCount === 1 ? "row" : "rows"}</span>
          <button className="ghost-button icon-button action-icon-button finder-nav-button" type="button" onClick={onPrevious} aria-label="Previous error row" title="Previous error row">
            <RowActionIcon name="previous" />
          </button>
          <button className="ghost-button icon-button action-icon-button finder-nav-button" type="button" onClick={onNext} aria-label="Next error row" title="Next error row">
            <RowActionIcon name="next" />
          </button>
        </div>
      )}
    </div>
  );
}

function TaxSummaryRow({ label, value, note, emphasis = false, status }: { label: string; value: string; note?: string; emphasis?: boolean; status?: string }) {
  return (
    <div className={`tax-summary-row ${emphasis ? "tax-summary-row--emphasis" : ""}`.trim()}>
      <div className="tax-summary-row__label">
        <span>{label}</span>
        {status && <small>{status}</small>}
        {note && <p>{note}</p>}
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function TaxSummarySection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="tax-summary-section">
      <div className="tax-summary-section__heading">
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="tax-summary-section__rows">{children}</div>
    </section>
  );
}

function TaxSummaryModal({ eyebrow, title, subtitle, totalLabel, totalValue, totalDetail, onClose, children }: { eyebrow: string; title: string; subtitle: string; totalLabel: string; totalValue: string; totalDetail: string; onClose: () => void; children: React.ReactNode }) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div className="tax-summary-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="tax-summary-modal" role="dialog" aria-modal="true" aria-labelledby="tax-summary-title" aria-describedby="tax-summary-subtitle">
        <header className="tax-summary-modal__header">
          <div>
            <p className="tax-summary-modal__eyebrow">{eyebrow}</p>
            <h2 id="tax-summary-title">{title}</h2>
            <p id="tax-summary-subtitle">{subtitle}</p>
          </div>
          <button ref={closeButtonRef} className="tax-summary-modal__close" type="button" onClick={onClose} aria-label="Close tax summary">×</button>
        </header>
        <div className="tax-summary-modal__total">
          <div>
            <span>{totalLabel}</span>
            <strong>{totalValue}</strong>
          </div>
          <p>{totalDetail}</p>
        </div>
        <div className="tax-summary-modal__body">{children}</div>
        <footer className="tax-summary-modal__footer">
          <p>Planning estimate only. Review current law, eligibility, phaseouts, credits, carryforwards, and jurisdiction-specific rules before filing.</p>
          <button className="primary-button primary-button--compact" type="button" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>,
    document.body
  );
}

function CurrencyInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draftValue, setDraftValue] = useState(formatCurrencyInput(value));

  useEffect(() => {
    if (toNumber(draftValue) === toNumber(value)) return;
    setDraftValue(formatCurrencyInput(value));
  }, [draftValue, value]);

  function handleChange(rawValue: string) {
    setDraftValue(formatDollarInputValue(rawValue));
    onChange(parseCurrencyInput(rawValue));
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draftValue}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => handleChange(event.target.value)}
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

function FederalDeductionMiniTable({ rows, summary, onChange }: { rows: DeductionItem[]; summary: FederalDeductionSummary; onChange: (rows: DeductionItem[]) => void }) {
  const safeRows = rows.length ? rows : [newDeductionItem(blankDeductionType)];
  const updateRow = (id: number, values: Partial<DeductionItem>) => {
    onChange(safeRows.map((row) => row.id === id ? { ...row, ...values } : row));
  };
  const removeRow = (id: number) => {
    const nextRows = safeRows.filter((row) => row.id !== id);
    onChange(nextRows.length ? nextRows : [newDeductionItem(blankDeductionType)]);
  };

  return (
    <div className="tax-what-if-table tax-what-if-table--deductions">
      <div className="tax-what-if-table__heading">
        <strong>Federal deductions</strong>
        <span>{formatCurrencyDetailed(summary.itemizedDeduction)}</span>
      </div>
      <div className="tax-what-if-table__grid tax-what-if-table__grid--header">
        <span>Deduction</span>
        <span>Amount</span>
        <span aria-hidden="true" />
      </div>
      {safeRows.map((row) => {
        const limitationNote = federalDeductionLimitNotes[row.deductionType];
        return (
          <div className="tax-what-if-table__row" key={row.id}>
            <div className="tax-what-if-table__grid">
              <select value={row.deductionType} onChange={(event) => updateRow(row.id, { deductionType: event.target.value })}>
                <option value="">Select deduction...</option>
                {federalDeductionTypes.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <CurrencyInput value={row.amount} onChange={(amount) => updateRow(row.id, { amount })} />
              <button className="ghost-button ghost-button--compact icon-button" type="button" onClick={() => removeRow(row.id)} aria-label="Remove deduction row">×</button>
            </div>
            {limitationNote && <p className="tax-what-if-table__limitation">{limitationNote}</p>}
          </div>
        );
      })}
      <div className="tax-what-if-table__summary">
        <span>SALT used: <strong>{formatCurrencyDetailed(summary.saltDeduction)}</strong></span>
        <span>Capital-loss deduction used: <strong>{formatCurrencyDetailed(summary.capitalLossDeduction)}</strong></span>
      </div>
      <button className="ghost-button ghost-button--compact" type="button" onClick={() => onChange([...safeRows, newDeductionItem(blankDeductionType)])}>+ Add deduction</button>
    </div>
  );
}

function StateDeductionMiniTable({ stateCode, rows, federalRows, onChange }: { stateCode: string; rows: DeductionItem[]; federalRows: DeductionItem[]; onChange: (rows: DeductionItem[]) => void }) {
  const safeRows = rows.length ? rows : [newDeductionItem(blankDeductionType)];
  const total = safeRows.reduce((sum, row) => row.deductionType ? sum + Math.max(toNumber(row.amount), 0) : sum, 0);
  const updateRow = (id: number, values: Partial<DeductionItem>) => {
    onChange(safeRows.map((row) => row.id === id ? { ...row, ...values } : row));
  };
  const removeRow = (id: number) => {
    const nextRows = safeRows.filter((row) => row.id !== id);
    onChange(nextRows.length ? nextRows : [newDeductionItem(blankDeductionType)]);
  };
  return (
    <div className="tax-what-if-table tax-what-if-table--deductions">
      <div className="tax-what-if-table__heading">
        <strong>{stateCode} itemized deductions</strong>
        <span>{formatCurrencyDetailed(total)}</span>
      </div>
      <div className="tax-what-if-table__grid tax-what-if-table__grid--header">
        <span>Deduction</span>
        <span>Amount</span>
        <span aria-hidden="true" />
      </div>
      {safeRows.map((row) => {
        const hasFederalMatch = federalDeductionTypes.includes(row.deductionType);
        const federalAmount = hasFederalMatch ? deductionTotalByType(federalRows, row.deductionType) : 0;
        return (
          <div className="tax-what-if-table__grid" key={row.id}>
            <select value={row.deductionType} onChange={(event) => updateRow(row.id, { deductionType: event.target.value })}>
              <option value="">Select deduction...</option>
              {stateDeductionTypes.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <div className="state-deduction-amount">
              <CurrencyInput value={row.amount} onChange={(amount) => updateRow(row.id, { amount })} />
              {hasFederalMatch && (
                <select className="state-deduction-amount__source" value="" title={`Copy amount from Federal ${row.deductionType}`} aria-label={`Amount source for ${row.deductionType}`} onChange={(event) => {
                  if (event.target.value === "federal") updateRow(row.id, { amount: federalAmount });
                }}>
                  <option value="">Manual entry</option>
                  <option value="federal">Copy Federal ({formatCurrencyDetailed(federalAmount)})</option>
                </select>
              )}
            </div>
            <button className="ghost-button ghost-button--compact icon-button" type="button" onClick={() => removeRow(row.id)} aria-label="Remove state deduction row">×</button>
          </div>
        );
      })}
      <button className="ghost-button ghost-button--compact" type="button" onClick={() => onChange([...safeRows, newDeductionItem(blankDeductionType)])}>+ Add deduction</button>
    </div>
  );
}

function FederalAboveLineDeductionTable({ rows, summary, onChange }: { rows: AboveLineDeductionItem[]; summary: FederalAboveLineDeductionSummary; onChange: (rows: AboveLineDeductionItem[]) => void }) {
  const safeRows = rows.length ? rows : [newAboveLineDeductionItem(blankDeductionType)];
  const updateRow = (id: number, values: Partial<AboveLineDeductionItem>) => {
    onChange(safeRows.map((row) => row.id === id ? { ...row, ...values } : row));
  };
  const removeRow = (id: number) => {
    const nextRows = safeRows.filter((row) => row.id !== id);
    onChange(nextRows.length ? nextRows : [newAboveLineDeductionItem(blankDeductionType)]);
  };

  return (
    <div className="tax-what-if-table tax-what-if-table--always-deductions">
      <div className="tax-what-if-table__heading">
        <strong>Deductions that apply with standard deduction</strong>
        <span>{formatCurrencyDetailed(summary.total)}</span>
      </div>
      <div className="tax-what-if-table__grid tax-what-if-table__grid--header">
        <span>Deduction</span>
        <span>Amount</span>
        <span aria-hidden="true" />
      </div>
      {safeRows.map((row) => {
        const limitationNote = federalAboveLineDeductionLimitNotes[row.deductionType];
        return (
          <div className="tax-what-if-table__row" key={row.id}>
            <div className="tax-what-if-table__grid">
              <select value={row.deductionType} onChange={(event) => updateRow(row.id, { deductionType: event.target.value })}>
                <option value="">Select deduction...</option>
                {federalAboveLineDeductionTypes.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <CurrencyInput value={row.amount} onChange={(amount) => updateRow(row.id, { amount })} />
              <button className="ghost-button ghost-button--compact icon-button" type="button" onClick={() => removeRow(row.id)} aria-label="Remove standard-compatible deduction row">×</button>
            </div>
            {limitationNote && <p className="tax-what-if-table__limitation">{limitationNote}</p>}
          </div>
        );
      })}
      <div className="tax-what-if-table__summary">
        <span>Capital-loss deduction used: <strong>{formatCurrencyDetailed(summary.capitalLossDeduction)}</strong></span>
      </div>
      <button className="ghost-button ghost-button--compact" type="button" onClick={() => onChange([...safeRows, newAboveLineDeductionItem(blankDeductionType)])}>+ Add deduction</button>
    </div>
  );
}

type KpiMetricConfig = {
  label: string;
  value: string;
  valueLabel?: string;
  secondaryValue?: string;
  numericValue?: number;
  primary?: boolean;
  deltaKind?: "currency" | "percent";
  tone?: "default" | "accent" | "warning" | "sync";
  details?: React.ReactNode;
  badge?: React.ReactNode;
  alternateContent?: React.ReactNode;
  alternateAriaLabel?: string;
  inlineControl?: React.ReactNode;
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

function KpiPill({ label, value, valueLabel, secondaryValue, numericValue, primary, deltaKind = "currency", tone = "default", details, badge, alternateContent, alternateAriaLabel, inlineControl }: KpiMetricConfig) {
  const previousValue = useRef<number | null>(null);
  const previousDisplayValue = useRef(value);
  const [delta, setDelta] = useState<number | null>(null);
  const [odometerValue, setOdometerValue] = useState({ previous: value, current: value });
  const [isAnimatingValue, setIsAnimatingValue] = useState(false);
  const [isAlternateVisible, setIsAlternateVisible] = useState(false);
  const isPrimaryMetric = primary ?? label.toLowerCase() === "after-tax income";
  const isFlippable = Boolean(alternateContent);

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

  const toggleAlternateView = () => {
    if (!isFlippable) return;
    setIsAlternateVisible((current) => !current);
  };

  return (
    <div
      className={`kpi-pill kpi-pill--${tone} ${isPrimaryMetric ? "kpi-pill--primary" : ""} ${details ? "kpi-pill--has-details" : ""} ${isFlippable ? "kpi-pill--flippable" : ""} ${inlineControl ? "kpi-pill--has-inline-control" : ""} ${isAlternateVisible ? "kpi-pill--flipped" : ""} ${isAnimatingValue ? "kpi-pill--changed" : ""}`.trim()}
      tabIndex={!isFlippable && details ? 0 : undefined}
    >
      <div
        className="kpi-pill__flip-stage"
        tabIndex={isFlippable ? 0 : undefined}
        role={isFlippable ? "button" : undefined}
        aria-pressed={isFlippable ? isAlternateVisible : undefined}
        aria-label={isFlippable ? (isAlternateVisible ? `Show ${label}` : alternateAriaLabel) : undefined}
        onClick={toggleAlternateView}
        onKeyDown={(event) => {
          if (!isFlippable || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          toggleAlternateView();
        }}
      >
        <div className="kpi-pill__face kpi-pill__face--front" aria-hidden={isAlternateVisible}>
          <span className="kpi-pill__label-line">{label}{badge}</span>
          <span className="kpi-pill__main-line">
            <OdometerValue value={odometerValue.current} previousValue={odometerValue.previous} spinning={isAnimatingValue} />
            {valueLabel && <span className="kpi-pill__value-label">{valueLabel}</span>}
          </span>
          {secondaryValue && <small>{secondaryValue}</small>}
          {formattedDelta && deltaValue !== null && (
            <em className={`kpi-pill__delta ${deltaValue >= 0 ? "kpi-pill__delta--up" : "kpi-pill__delta--down"}`}>
              {deltaValue >= 0 ? "↑" : "↓"} {deltaValue >= 0 ? "+" : "-"}{formattedDelta}
            </em>
          )}
        </div>
        {alternateContent && (
          <div className="kpi-pill__face kpi-pill__face--back" aria-hidden={!isAlternateVisible}>
            {alternateContent}
          </div>
        )}
      </div>
      {inlineControl && <div className="kpi-pill__inline-control">{inlineControl}</div>}
      {details && <div className="kpi-pill__details" role="tooltip">{details}</div>}
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

function WhatIfStateIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      className={`what-if-state-icon ${isOpen ? "what-if-state-icon--open" : "what-if-state-icon--closed"}`}
      viewBox="0 0 44 26"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="what-if-state-icon__frame" x="1" y="1" width="42" height="24" rx="2.2" />
      <rect className="what-if-state-icon__panel" x="4.5" y="4" width="11" height="18" rx="1.1" />
      <rect className="what-if-state-icon__panel" x="28.5" y="4" width="11" height="18" rx="1.1" />
      <path className="what-if-state-icon__split" d="M22 4 L22 22" />
      {isOpen ? (
        <>
          <path className="what-if-state-icon__arrow" d="M20 13h-7.7v4.2L5 13l7.3-4.2V13H20z" />
          <path className="what-if-state-icon__arrow" d="M24 13h7.7V8.8L39 13l-7.3 4.2V13H24z" />
        </>
      ) : (
        <>
          <path className="what-if-state-icon__arrow" d="M5 13h7.7V8.8L20 13l-7.3 4.2V13H5z" />
          <path className="what-if-state-icon__arrow" d="M39 13h-7.7v4.2L24 13l7.3-4.2V13H39z" />
        </>
      )}
    </svg>
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
  onCapture: (origin: { x: number; y: number }) => void;
  className?: string;
}) {
  const [snapshotView, setSnapshotView] = useState<"monthly" | "yearly">("monthly");
  const [snapshotBasis, setSnapshotBasis] = useState<"afterTax" | "beforeTax">("afterTax");
  const [snapshotTooltip, setSnapshotTooltip] = useState("");
  const [areSnapshotControlsOpen, setAreSnapshotControlsOpen] = useState(false);
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
    <div
      className={`income-snapshot ${!snapshot ? "income-snapshot--empty" : ""} ${areSnapshotControlsOpen ? "income-snapshot--controls-open" : ""} ${className}`.trim()}
      aria-label="Income snapshot comparison"
      onMouseLeave={() => setAreSnapshotControlsOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAreSnapshotControlsOpen(false);
      }}
    >
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
      <div
        className="income-snapshot__body"
        aria-live="polite"
        aria-expanded={areSnapshotControlsOpen}
        aria-label="Show baseline comparison options"
        role="button"
        tabIndex={0}
        onMouseEnter={() => setAreSnapshotControlsOpen(true)}
        onClick={() => setAreSnapshotControlsOpen(true)}
        onFocus={() => setAreSnapshotControlsOpen(true)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          setAreSnapshotControlsOpen(true);
        }}
      >
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
      <div className="income-snapshot__rollout" aria-hidden={!areSnapshotControlsOpen}>
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
      </div>
      {snapshotTooltip && <div className="income-snapshot__tooltip" role="tooltip">{snapshotTooltip}</div>}
    </div>
  );
}

function CompactKpiHeader({ metrics }: { metrics: KpiMetricConfig[] }) {
  return (
    <div className="kpi-header">
      <div className="kpi-header__metrics">
        {metrics.map((metric) => <KpiPill key={metric.label} {...metric} />)}
      </div>
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
  const shouldIncludeNextInScale = Boolean(
    nextMarker &&
    (nearbyMarkers.length === 0 || nextMarker.amount <= Math.max(valueMax * 1.75, valueMax + 125000))
  );
  const scaleBase = Math.max(
    valueMax,
    ...nearbyMarkers.map((marker) => marker.amount),
    ...(shouldIncludeNextInScale && nextMarker ? [nextMarker.amount] : [])
  );
  const increment = scaleBase <= 100000 ? 10000 : scaleBase <= 500000 ? 25000 : 50000;
  const scaleMax = Math.ceil((scaleBase * 1.08) / increment) * increment;
  return {
    scaleMax,
    visibleMarkers: sortedMarkers.filter((marker) => marker.amount <= scaleMax || marker === nextMarker),
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

function RowActionIcon({ name }: { name: "add" | "select" | "delete" | "edit" | "find" | "lookup" | "previous" | "next" | "split" | "copy" | "paste" }) {
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

  if (name === "edit") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m5.5 15.5-1 4 4-1L18 9l-3-3-9.5 9.5Z" />
        <path d="m13.5 7.5 3 3" />
      </svg>
    );
  }

  if (name === "find") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="10.5" cy="10.5" r="5.25" />
        <path d="m14.25 14.25 5 5" />
      </svg>
    );
  }

  if (name === "copy") {
    return <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 9h9v9H9z" /><path d="M6 15H4V4h11v2" /></svg>;
  }

  if (name === "paste") {
    return <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 6h8v13H6V6h2" /><path d="M9 4h4a2 2 0 0 1 2 2v1H7V6a2 2 0 0 1 2-2Z" /></svg>;
  }

  if (name === "lookup") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="9.75" cy="9.75" r="4.75" />
        <path d="m13.25 13.25 4.25 4.25" />
        <path d="M15 6.5h3.5V10" />
        <path d="m18.5 6.5-5 5" />
      </svg>
    );
  }

  if (name === "previous") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m14.5 6.5-5.5 5.5 5.5 5.5" />
      </svg>
    );
  }

  if (name === "next") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />
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

function TopbarActionIcon({ name }: { name: "copy" | "delete" | "signIn" | "signOut" | "assistant" | "sheet" | "chat" | "menu" | "history" | "theme" | "report" | "settings" }) {
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

  if (name === "theme") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M15.5 3.5a7.5 7.5 0 1 0 5 9.4 6 6 0 0 1-7.4-7.4 7.6 7.6 0 0 1 2.4-2z" />
      </svg>
    );
  }

  if (name === "delete") {
    return <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 7h14M9 7V4h6v3M8 10v8m4-8v8m4-8v8M7 7l1 13h8l1-13" /></svg>;
  }

  if (name === "settings") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
        <circle cx="12" cy="12" r="6.5" />
      </svg>
    );
  }

  if (name === "report") {
    return (
      <svg className="icon-button__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 4.5h9l3 3v12H6z" />
        <path d="M15 4.5v4h4" />
        <path d="M9 12h6" />
        <path d="M9 16h6" />
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

function TaxThermometer({ title, titleLabel, titleValue, subtitle, taxableIncome, values, markers, stats, footerLabel, footerValue, baseRateLabel, currentRateLabel, noTaxStamp }: { title: React.ReactNode; titleLabel?: string; titleValue?: string; subtitle: string; taxableIncome: number; values: ThermometerValue[]; markers: ThermometerMarker[]; stats: ThermometerStat[]; footerLabel: string; footerValue: string; baseRateLabel: string; currentRateLabel?: string; noTaxStamp?: string }) {
  const labelText = titleLabel || (typeof title === "string" ? title : "Tax thermometer");
  const { scaleMax, visibleMarkers } = getThermometerScale(values, markers);
  const positionStyle = (amount: number) => ({ "--thermo-position": `${Math.max(0, Math.min(100, (amount / scaleMax) * 100))}%` } as React.CSSProperties);
  const sortedRateMarkers = [...markers].sort((first, second) => first.amount - second.amount);
  const lowerBracketBoundary = [...sortedRateMarkers].reverse().find((marker) => marker.amount <= taxableIncome);
  const upperBracketBoundary = sortedRateMarkers.find((marker) => marker.amount > taxableIncome);
  const rateBands = buildThermometerRateBands(markers, scaleMax, baseRateLabel);
  const trackStyle = { "--rate-gradient-stops": rateBandGradientStops(rateBands, scaleMax) } as React.CSSProperties;

  return (
    <div className="tax-thermometer" aria-label={`${labelText}. ${subtitle}`}>
      <>
          {titleValue && <div className="tax-thermometer__title-value">{titleValue}</div>}
          <div className="tax-thermometer__track" aria-label={`${labelText} tax threshold thermometer`} style={trackStyle}>
            {noTaxStamp && <div className="tax-thermometer__no-tax-stamp" aria-label={noTaxStamp}>{noTaxStamp}</div>}
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
                    aria-label={`${marker.detail}: ${formatCurrency(marker.amount)}. ${titleDistance}`}
                    tabIndex={0}
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
                      aria-label={titleDistance}
                      tabIndex={0}
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
                aria-label={`${value.label}: ${value.value}`}
                tabIndex={0}
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
    </div>
  );
}

function getReachedTaxRateLabel(markers: ThermometerMarker[], taxableIncome: number, fallback: string) {
  let reached = fallback;
  [...markers].sort((first, second) => first.amount - second.amount).forEach((marker) => {
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

function rateLabelKey(label: string) {
  return label.replace(/\s+/g, " ").trim();
}

function getReachedTaxRateValue(markers: ThermometerMarker[], taxableIncome: number, fallback: string) {
  return rateLabelToDecimal(getReachedTaxRateLabel(markers, taxableIncome, fallback));
}

function buildCombinedTaxRateMarkers(federalMarkers: ThermometerMarker[], stateMarkers: ThermometerMarker[], stateCode: string, stateName: string, stateBaseRateLabel: string, filingStatus: FilingStatus, localMarkers: ThermometerMarker[] = [], localName = "Local", localBaseRateLabel = "0%") {
  const niitThreshold = niitThresholdForStatus(filingStatus);
  const thresholdRowsByAmount = [
    ...federalMarkers.map((marker) => ({ amount: marker.amount, source: "Federal" })),
    ...stateMarkers.map((marker) => ({ amount: marker.amount, source: stateCode })),
    ...localMarkers.map((marker) => ({ amount: marker.amount, source: localName })),
    { amount: niitThreshold, source: "NIIT" },
  ]
    .filter((row) => row.amount > 0)
    .reduce<Record<number, string[]>>((groups, row) => {
      groups[row.amount] = [...(groups[row.amount] || []), row.source];
      return groups;
    }, {});
  const uniqueThresholds = Object.entries(thresholdRowsByAmount)
    .map(([amount, sources]) => ({ amount: Number(amount), sources }))
    .sort((left, right) => left.amount - right.amount);

  let highestCombinedRate = 0;
  const combinedMarkers = uniqueThresholds
    .map((row) => {
      const federalRate = getReachedTaxRateValue(federalMarkers, row.amount, "10%");
      const stateRate = getReachedTaxRateValue(stateMarkers, row.amount, stateBaseRateLabel);
      const localRate = getReachedTaxRateValue(localMarkers, row.amount, localBaseRateLabel);
      const niitRate = row.amount >= niitThreshold ? 0.038 : 0;
      const combinedRate = federalRate + stateRate + localRate + niitRate;
      highestCombinedRate = Math.max(highestCombinedRate, combinedRate);
      const sourceLabel = row.sources
        .map((source) => source === "NIIT" ? "NIIT investment-income threshold" : `${source} threshold`)
        .join(" + ");
      return {
        amount: row.amount,
        label: formatPercent(highestCombinedRate),
        detail: `Combined federal + ${stateName}${localRate > 0 ? ` + ${localName}` : ""} marginal rate starts (${sourceLabel})`,
        tone: "tax",
      };
    });
  return combinedMarkers.filter((marker, index, allMarkers) => {
    const previousMarker = allMarkers[index - 1];
    return !previousMarker || rateLabelKey(previousMarker.label) !== rateLabelKey(marker.label);
  });
}

type TaxThermometerMode = "combined" | "federal" | "state" | "local" | "allocation" | "accountTax" | "accountType" | "taxTreatment";
const TAX_THERMOMETER_MODE_STORAGE_KEY = "tax-thermometer-mode";
const taxThermometerModes: TaxThermometerMode[] = ["combined", "federal", "state", "local", "allocation", "accountTax", "accountType", "taxTreatment"];

function loadTaxThermometerMode(fallback: TaxThermometerMode) {
  try {
    const storedMode = window.localStorage.getItem(TAX_THERMOMETER_MODE_STORAGE_KEY) as TaxThermometerMode | null;
    return storedMode && taxThermometerModes.includes(storedMode) ? storedMode : fallback;
  } catch {
    return fallback;
  }
}

function TaxThermometerModeSelect({ mode, onChange, stateCode, stateName }: { mode: TaxThermometerMode; onChange: (mode: TaxThermometerMode) => void; stateCode: string; stateName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement | null>(null);
  const options: Array<{ mode: TaxThermometerMode; label: string; icons: React.ReactNode }> = [
    { mode: "combined", label: "All taxes", icons: <><img className="tax-thermometer__title-flag" src={US_FLAG_ICON_URL} alt="United States flag" width={18} height={12} loading="lazy" referrerPolicy="no-referrer" /><span>+</span><StateFlagImage stateCode={stateCode} stateName={stateName} /></> },
    { mode: "federal", label: "Federal Tax", icons: <img className="tax-thermometer__title-flag" src={US_FLAG_ICON_URL} alt="United States flag" width={18} height={12} loading="lazy" referrerPolicy="no-referrer" /> },
    { mode: "state", label: "State Tax", icons: <StateFlagImage stateCode={stateCode} stateName={stateName} /> },
    { mode: "local", label: "Local Tax", icons: null },
    { mode: "allocation", label: "Portfolio allocation", icons: null },
    { mode: "accountTax", label: "Account tax category", icons: null },
    { mode: "accountType", label: "Account type", icons: null },
    { mode: "taxTreatment", label: "Tax treatments", icons: null },
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
        {selected.icons && <span className="tax-thermometer-mode-select__icons">{selected.icons}</span>}
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
              {option.icons && <span className="tax-thermometer-mode-select__icons">{option.icons}</span>}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TaxThermometerPanel({ federalTaxable, stateTaxable, federalTax, federalIncomeTax, federalPayrollTax, stateTax, stateIncomeTax, statePayrollTax, statePayrollLabel, totalIncome, w2Income, marginalPayrollRate, localTaxable, localTax, localName, localEnabled, localEffectiveRate, localMarginalRate, localBrackets, stateBrackets, filingStatus, stateCode, stateName, allocationRows, accountTaxAllocationRows, accountTypeAllocationRows, taxTreatmentAllocationRows, thermometerMode }: { federalTaxable: number; stateTaxable: number; federalTax: number; federalIncomeTax: number; federalPayrollTax: number; stateTax: number; stateIncomeTax: number; statePayrollTax: number; statePayrollLabel: string; totalIncome: number; w2Income: number; marginalPayrollRate: number; localTaxable: number; localTax: number; localName: string; localEnabled: boolean; localEffectiveRate: number; localMarginalRate: number; localBrackets: LocalTaxBracket[]; stateBrackets: LocalStateTaxBracket[]; filingStatus: FilingStatus; stateCode: string; stateName: string; allocationRows: Array<{ label: string; amount: number }>; accountTaxAllocationRows: Array<{ label: string; amount: number }>; accountTypeAllocationRows: Array<{ label: string; amount: number }>; taxTreatmentAllocationRows: Array<{ label: string; amount: number }>; thermometerMode: TaxThermometerMode }) {
  const totalTax = federalTax + stateTax + (localEnabled ? localTax : 0);
  const federalMarkers = federalOrdinaryRateMarkers[filingStatus];
  const stateMarkers: ThermometerMarker[] = [...stateBrackets]
    .sort((first, second) => first.threshold - second.threshold)
    .filter((bracket) => bracket.threshold > 0)
    .map((bracket) => ({ amount: bracket.threshold, label: formatPercent(bracket.rate), detail: `${stateName} ${formatPercent(bracket.rate)} bracket starts`, tone: "state" }));
  const stateBaseRateLabel = formatPercent([...stateBrackets].sort((first, second) => first.threshold - second.threshold)[0]?.rate || 0);
  const localMarkers: ThermometerMarker[] = localEnabled ? localBrackets.filter((bracket) => bracket.threshold > 0).map((bracket) => ({ amount: bracket.threshold, label: formatPercent(bracket.rate), detail: `${localName} local tax bracket starts`, tone: "tax" })) : [];
  const localBaseRateValue = localEnabled ? (localBrackets[0]?.rate ?? localMarginalRate) : 0;
  const localBaseRateLabel = formatPercent(localBaseRateValue);
  const hasNoStateIncomeTax = stateMarkers.length === 0 && stateTax === 0;
  const allTaxRateBase = Math.max(totalIncome, federalTaxable, stateTaxable, localEnabled ? localTaxable : 0);
  const federalEffectiveRate = allTaxRateBase > 0 ? federalTax / allTaxRateBase : 0;
  const stateEffectiveRate = allTaxRateBase > 0 ? stateTax / allTaxRateBase : 0;
  const combinedTaxable = allTaxRateBase;
  const federalMarginalRate = getReachedTaxRateValue(federalMarkers, federalTaxable, "10%");
  const stateMarginalRate = getReachedTaxRateValue(stateMarkers, stateTaxable, stateBaseRateLabel);
  const niitMarginalRate = combinedTaxable >= niitThresholdForStatus(filingStatus) ? 0.038 : 0;
  const combinedMarginalRate = federalMarginalRate + stateMarginalRate + (localEnabled ? localMarginalRate : 0) + niitMarginalRate + (w2Income > 0 ? marginalPayrollRate : 0);
  const combinedBaseRateLabel = formatPercent(0.10 + rateLabelToDecimal(stateBaseRateLabel) + localBaseRateValue);
  const activeAllocationRows = thermometerMode === "accountTax" ? accountTaxAllocationRows : thermometerMode === "accountType" ? accountTypeAllocationRows : thermometerMode === "taxTreatment" ? taxTreatmentAllocationRows : allocationRows;
  const allocationTotal = activeAllocationRows.reduce((sum, row) => sum + row.amount, 0);
  const allocationColors = ["#0b63f6", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#22c55e", "#06b6d4", "#ec4899"];
  let allocationCursor = 0;
  const allocationSegments = activeAllocationRows.map((row, index) => {
    const start = allocationCursor;
    allocationCursor += allocationTotal > 0 ? row.amount / allocationTotal * 100 : 0;
    const angle = ((start + allocationCursor) / 2 / 100 * 360 - 90) * Math.PI / 180;
    return { ...row, index, start, end: allocationCursor, angle, percent: allocationTotal > 0 ? row.amount / allocationTotal : 0 };
  });
  const allocationGradient = allocationTotal > 0
    ? `conic-gradient(${allocationSegments.map((segment) => `${allocationColors[segment.index % allocationColors.length]} ${segment.start}% ${segment.end}%`).join(", ")})`
    : "conic-gradient(#e5e7eb 0 100%)";
  const allocationViewLabel = thermometerMode === "accountTax" ? "Account tax category" : thermometerMode === "accountType" ? "Account type" : thermometerMode === "taxTreatment" ? "Tax treatment" : "Portfolio";
  const allocationTabLabel = thermometerMode === "accountTax" ? "Account Tax Category" : thermometerMode === "accountType" ? "Account Type" : thermometerMode === "taxTreatment" ? "Tax Treatments" : "Asset Classes";
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
  const localValues: ThermometerValue[] = [
    { amount: localTaxable, label: "Local taxable income", value: formatCurrencyDetailed(localTaxable), tone: "tax" },
  ];
  const combinedValues: ThermometerValue[] = [
    {
      amount: combinedTaxable,
      label: "Taxable income",
      value: `Federal: ${formatCurrencyDetailed(federalTaxable)}\nState: ${formatCurrencyDetailed(stateTaxable)}${localEnabled ? `\n${localName}: ${formatCurrencyDetailed(localTaxable)}` : ""}`,
      tone: "tax",
      content: (
        <>
          <span className="tax-thermometer__value-line"><img className="tax-thermometer__value-flag" src={US_FLAG_ICON_URL} alt="United States flag" width={18} height={12} loading="lazy" referrerPolicy="no-referrer" />{formatCurrencyDetailed(federalTaxable)}</span>
          <span className="tax-thermometer__value-line"><StateFlagImage stateCode={stateCode} stateName={stateName} />{formatCurrencyDetailed(stateTaxable)}</span>
          {localEnabled && <span className="tax-thermometer__value-line"><span aria-hidden="true">L</span>{formatCurrencyDetailed(localTaxable)}</span>}
        </>
      ),
    },
  ];
  const combinedMarkers = buildCombinedTaxRateMarkers(federalMarkers, stateMarkers, stateCode, stateName, stateBaseRateLabel, filingStatus, localMarkers, localName, localBaseRateLabel);
  const federalStats: ThermometerStat[] = [
    { label: "Income tax", value: formatCurrencyDetailed(federalIncomeTax), tone: "tax" },
    { label: "FICA payroll", value: formatCurrencyDetailed(federalPayrollTax), tone: "tax" },
    { label: "Total federal", value: formatCurrencyDetailed(federalTax), tone: "tax" },
    { label: "All-in effective", value: formatPercent(federalEffectiveRate), tone: "taxable" },
  ];
  const stateStats: ThermometerStat[] = [
    { label: "Income tax", value: formatCurrencyDetailed(stateIncomeTax), tone: "tax" },
    { label: statePayrollLabel, value: formatCurrencyDetailed(statePayrollTax), tone: "tax" },
    { label: `Total ${stateCode}`, value: formatCurrencyDetailed(stateTax), tone: "tax" },
    { label: "All-in effective", value: formatPercent(stateEffectiveRate), tone: "taxable" },
  ];
  const localStats: ThermometerStat[] = [
    { label: "Local tax", value: formatCurrencyDetailed(localTax), tone: "tax" },
    { label: "Effective", value: formatPercent(localEffectiveRate), tone: "taxable" },
    { label: "Marginal", value: formatPercent(localMarginalRate), tone: "income" },
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
          noTaxStamp: undefined,
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
          noTaxStamp: hasNoStateIncomeTax ? "NO STATE INCOME TAX" : undefined,
        }
        : thermometerMode === "local"
          ? {
            titleLabel: `${localName} Local Tax`,
            subtitle: localMarkers.length ? "Local bracket thresholds" : "Local taxable-income scale",
            taxableIncome: localTaxable,
            values: localValues,
            markers: localMarkers,
            stats: localStats,
            footerLabel: "Local taxable income",
            footerValue: formatCurrencyDetailed(localTaxable),
            baseRateLabel: localBaseRateLabel,
            currentRateLabel: formatPercent(localMarginalRate),
            total: localTax,
            noTaxStamp: localTax === 0 && localMarginalRate === 0 ? "NO LOCAL INCOME TAX" : undefined,
          }
        : {
          titleLabel: "All Taxes",
          subtitle: localEnabled ? `Federal, ${stateName}, NIIT + ${localName} thresholds` : `Federal, ${stateName} + NIIT thresholds`,
          taxableIncome: combinedTaxable,
          values: combinedValues,
          markers: combinedMarkers,
          stats: [
            { label: "Federal + FICA", value: formatCurrencyDetailed(federalTax), tone: "tax" },
            { label: `${stateCode} + payroll`, value: formatCurrencyDetailed(stateTax), tone: "tax" },
            ...(localEnabled ? [{ label: "Local tax", value: formatCurrencyDetailed(localTax), tone: "tax" as const }] : []),
            { label: "All-in effective", value: formatPercent(allTaxRateBase > 0 ? totalTax / allTaxRateBase : 0), tone: "taxable" as const },
          ],
          footerLabel: "",
          footerValue: "",
          baseRateLabel: combinedBaseRateLabel,
          currentRateLabel: formatPercent(combinedMarginalRate),
          total: totalTax,
          noTaxStamp: undefined,
        };

  return (
    <div className="tax-thermometer-panel">
      {thermometerMode === "allocation" || thermometerMode === "accountTax" || thermometerMode === "accountType" || thermometerMode === "taxTreatment" ? (
        <div className="tax-thermometer portfolio-allocation" aria-label={`${allocationViewLabel} allocation`}>
          <><div className="tax-thermometer__title-value">{formatCurrencyDetailed(allocationTotal)}</div>{activeAllocationRows.length ? <><div className="portfolio-allocation__pie-stage" role="img" aria-label={`${allocationViewLabel} allocation: ${activeAllocationRows.map((row) => `${row.label} ${formatPercent(allocationTotal > 0 ? row.amount / allocationTotal : 0)}`).join(", ")}`}><div className="portfolio-allocation__pie" style={{ background: allocationGradient }}><span>Total<strong>{formatCurrency(allocationTotal)}</strong></span></div><svg viewBox="0 0 200 200" aria-hidden="true">{allocationSegments.filter((segment) => segment.percent >= 0.0005).map((segment) => <line key={segment.label} x1={100 + Math.cos(segment.angle) * 57} y1={100 + Math.sin(segment.angle) * 57} x2={100 + Math.cos(segment.angle) * 72} y2={100 + Math.sin(segment.angle) * 72} stroke={allocationColors[segment.index % allocationColors.length]} />)}</svg>{allocationSegments.filter((segment) => segment.percent >= 0.0005).map((segment) => <span key={segment.label} className="portfolio-allocation__pie-label" style={{ left: `${50 + Math.cos(segment.angle) * 42}%`, top: `${50 + Math.sin(segment.angle) * 42}%`, borderColor: allocationColors[segment.index % allocationColors.length] }} title={`${segment.label}: ${formatPercent(segment.percent)} (${formatCurrencyDetailed(segment.amount)})`}><strong>{segment.label}</strong>{formatPercent(segment.percent)}</span>)}</div><div className="portfolio-allocation__rows">{activeAllocationRows.map((row, index) => <div key={row.label}><span><i style={{ background: allocationColors[index % allocationColors.length] }} />{row.label}</span><strong>{formatCurrencyDetailed(row.amount)}</strong><em>{formatPercent(allocationTotal > 0 ? row.amount / allocationTotal : 0)}</em></div>)}</div></> : <div className="portfolio-allocation__empty">Select categories on the {allocationTabLabel} tab.</div>}</>
        </div>
      ) : <TaxThermometer title={selectedThermometer.titleLabel} titleLabel={selectedThermometer.titleLabel} titleValue={formatCurrencyDetailed(selectedThermometer.total)} subtitle={selectedThermometer.subtitle} taxableIncome={selectedThermometer.taxableIncome} values={selectedThermometer.values} markers={selectedThermometer.markers} stats={selectedThermometer.stats} footerLabel={selectedThermometer.footerLabel} footerValue={selectedThermometer.footerValue} baseRateLabel={selectedThermometer.baseRateLabel} currentRateLabel={selectedThermometer.currentRateLabel} noTaxStamp={selectedThermometer.noTaxStamp} />}
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
          action.type === "updateSettings" ||
          action.type === "setWhatIf" ||
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

function LookupTable<T extends { id: number }>({ title, subtitle, rows, columns, highlightedRowId = null, duplicateKey, onChange, onAdd, onRemove, onRemoveAll, onReorder, onSplitRow, onPasteRow, onLookupRow, showLookupRow = () => true, lookupRowLabel = "Look up row", showMoveHeaderLabel = true, rowDeleteNextToMove = false }: { title: string; subtitle: string; rows: T[]; columns: Array<LookupColumn<T>>; highlightedRowId?: number | null; duplicateKey?: keyof T; onChange: (id: number, field: keyof T, value: string | boolean) => void; onAdd: () => void; onRemove: (id: number) => void; onRemoveAll?: () => void; onReorder: (sourceId: number, targetId: number) => void; onSplitRow?: (id: number) => void; onPasteRow?: (id: number, values: Partial<T>) => void; onLookupRow?: (row: T) => void; showLookupRow?: (row: T) => boolean; lookupRowLabel?: string; showMoveHeaderLabel?: boolean; rowDeleteNextToMove?: boolean; }) {
  const [draggingRowId, setDraggingRowId] = useState<number | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<number | null>(null);
  const [isRemoveAllConfirmOpen, setIsRemoveAllConfirmOpen] = useState(false);
  const [editRowId, setEditRowId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<T> | null>(null);
  const [rowActionMenu, setRowActionMenu] = useState<{ row: T; left: number; top: number } | null>(null);
  const rowActionCloseTimer = useRef<number | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const dragPointerYRef = useRef<number | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const dropHandledRef = useRef(false);
  const copiedRowRef = useRef<Partial<T> | null>(null);
  const lookupColumnWidths = useMemo(() => columns.map((column) => lookupColumnDefaultWidth(column, rows)), [columns, rows]);
  const duplicateValues = useMemo(() => {
    if (!duplicateKey) return new Set<string>();
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      const value = normalizeLookupKey(row[duplicateKey]);
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    });
    return new Set([...counts].filter(([, count]) => count > 1).map(([value]) => value));
  }, [duplicateKey, rows]);
  const lookupActionColumnWidth = rowDeleteNextToMove ? 0 : LOOKUP_TABLE_ACTION_COLUMN_WIDTH * 2;
  const lookupMoveColumnWidth = LOOKUP_TABLE_DRAG_COLUMN_WIDTH;
  const lookupTableWidth = lookupMoveColumnWidth + lookupColumnWidths.reduce((sum, width) => sum + width, 0) + lookupActionColumnWidth;
  const lookupTableStyle = { width: lookupTableWidth, minWidth: lookupTableWidth } as CSSProperties;
  const lookupMoveHeadingStyle = rowDeleteNextToMove ? { width: lookupMoveColumnWidth, minWidth: lookupMoveColumnWidth, maxWidth: lookupMoveColumnWidth } as CSSProperties : undefined;
  const lookupMoveCellStyle = rowDeleteNextToMove ? { ...lookupMoveHeadingStyle, display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 4 } as CSSProperties : undefined;
  const cancelRowActionClose = () => {
    if (rowActionCloseTimer.current !== null) {
      window.clearTimeout(rowActionCloseTimer.current);
      rowActionCloseTimer.current = null;
    }
  };
  const openRowActionMenu = (row: T, anchor: HTMLElement) => {
    cancelRowActionClose();
    const rect = anchor.getBoundingClientRect();
    setRowActionMenu({ row, left: rect.right + 4, top: rect.top + rect.height / 2 });
  };
  const scheduleRowActionClose = () => {
    cancelRowActionClose();
    rowActionCloseTimer.current = window.setTimeout(() => setRowActionMenu(null), 180);
  };
  useEffect(() => {
    if (!rowActionMenu) return;
    const close = () => setRowActionMenu(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [rowActionMenu]);
  useEffect(() => () => {
    if (rowActionCloseTimer.current !== null) window.clearTimeout(rowActionCloseTimer.current);
  }, []);
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
  useEffect(() => {
    if (highlightedRowId === null) return;
    window.setTimeout(() => {
      const rowElement = tableScrollRef.current?.querySelector<HTMLElement>(`tr[data-lookup-row-id="${highlightedRowId}"]`);
      rowElement?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }, 0);
  }, [highlightedRowId]);
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
  const openRowEditor = (row: T) => {
    setEditRowId(row.id);
    setEditDraft({ ...row });
  };
  const closeRowEditor = () => {
    setEditRowId(null);
    setEditDraft(null);
  };
  const updateEditDraft = (column: LookupColumn<T>, value: string | boolean) => {
    setEditDraft((current) => current ? { ...current, [column.key]: value } : current);
  };
  const saveRowEditor = () => {
    if (editRowId === null || !editDraft) return;
    columns.forEach((column) => {
      const value = editDraft[column.key];
      onChange(editRowId, column.key, typeof value === "boolean" ? value : String(value ?? ""));
    });
    closeRowEditor();
  };
  const renderEditorField = (column: LookupColumn<T>) => {
    const rawValue = editDraft?.[column.key];
    if (column.type === "checkbox" || column.type === "yesNoCheckbox" || column.type === "invertedYesNoCheckbox") {
      const editableValue = rawValue as string | number | boolean | null | undefined;
      const normalizedYesNo = normalizeYesNo(editableValue);
      const checked = column.type === "yesNoCheckbox" ? normalizedYesNo === "yes" : column.type === "invertedYesNoCheckbox" ? normalizedYesNo === "no" : normalizeBoolean(editableValue);
      return <input type="checkbox" checked={checked} onChange={(event) => updateEditDraft(column, column.type === "yesNoCheckbox" ? (event.target.checked ? "yes" : "no") : column.type === "invertedYesNoCheckbox" ? (event.target.checked ? "no" : "yes") : event.target.checked)} />;
    }
    if (column.type === "select") return <select value={String(rawValue ?? "")} onChange={(event) => updateEditDraft(column, event.target.value)}>{(column.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select>;
    if (column.type === "percent") return <div className="percent-input"><input type="number" step="0.01" value={formatPercentInputValue(toNumber(String(rawValue ?? "")) * 100)} onChange={(event) => updateEditDraft(column, String(truncatePercentInputValue(toNumber(event.target.value)) / 100))} /><span>%</span></div>;
    return <input type={column.type === "number" ? "number" : "text"} value={String(rawValue ?? "")} onChange={(event) => updateEditDraft(column, event.target.value)} />;
  };
  const copyRow = async (row: T) => {
    const values = Object.fromEntries(columns.map((column) => [column.key, row[column.key]])) as Partial<T>;
    copiedRowRef.current = values;
    try {
      await navigator.clipboard.writeText(JSON.stringify({ source: "aftertaxum-row", table: title, values }));
    } catch {
      // Keep the in-app copy available if clipboard permission is unavailable.
    }
  };
  const pasteRow = async (rowId: number) => {
    let values = copiedRowRef.current;
    try {
      const parsed = JSON.parse(await navigator.clipboard.readText()) as { source?: string; table?: string; values?: Partial<T> };
      if (parsed.source === "aftertaxum-row" && parsed.table === title && parsed.values) values = parsed.values;
    } catch {
      // Fall back to the last row copied in this grid.
    }
    if (values) onPasteRow?.(rowId, values);
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
    const isDuplicate = duplicateKey === column.key && duplicateValues.has(normalizeLookupKey(value));
    const input = <input type={column.type === "number" ? "number" : "text"} value={value} onChange={(event) => onChange(row.id, column.key, event.target.value)} aria-invalid={isDuplicate || undefined} style={isDuplicate ? { paddingRight: 88, borderColor: "#dc6803", background: "#fffaeb" } : undefined} />;
    return isDuplicate ? (
      <div className="lookup-duplicate-field" title={`${value} appears more than once in ${title}`} style={{ position: "relative" }}>
        {input}
        <span className="lookup-duplicate-warning" role="status" aria-label={`Duplicate ${column.label}`} style={{ position: "absolute", top: "50%", right: 7, color: "#b54708", fontSize: ".62rem", fontWeight: 850, lineHeight: 1, pointerEvents: "none", transform: "translateY(-50%)" }}>⚠ Duplicate</span>
      </div>
    ) : input;
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
      {editDraft && createPortal(
        <div className="income-entry-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeRowEditor(); }}>
          <div className="add-entry-panel add-entry-panel--wide" role="dialog" aria-modal="true" aria-labelledby="lookup-row-editor-title">
            <div className="income-entry-panel__header">
              <div><p className="eyebrow">{title}</p><h3 id="lookup-row-editor-title">Edit row</h3></div>
              <button className="ghost-button ghost-button--compact" type="button" onClick={closeRowEditor}>Close</button>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); saveRowEditor(); }}>
              <div className="add-investment-form-grid">
                {columns.map((column) => (
                  <label className="income-entry-panel__field" key={String(column.key)}>
                    <span>{column.label}</span>
                    {renderEditorField(column)}
                  </label>
                ))}
              </div>
              <div className="income-entry-panel__actions add-entry-panel__actions">
                <button className="ghost-button" type="button" onClick={closeRowEditor}>Cancel</button>
                <button className="primary-button" type="submit">Save changes</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}
      {rowActionMenu && createPortal(
        <div
          className="row-action-popover lookup-row-action-popover"
          role="toolbar"
          aria-label={`${title} row actions`}
          style={{ left: rowActionMenu.left, top: rowActionMenu.top }}
          onMouseEnter={cancelRowActionClose}
          onMouseLeave={scheduleRowActionClose}
        >
          <button className="ghost-button ghost-button--compact icon-button action-icon-button" type="button" onClick={() => { const row = rowActionMenu.row; setRowActionMenu(null); openRowEditor(row); }} aria-label={`Edit ${title} row`} title="Edit row"><RowActionIcon name="edit" /></button>
          <button className="ghost-button ghost-button--compact icon-button action-icon-button action-icon-button--danger" type="button" onClick={() => { const row = rowActionMenu.row; setRowActionMenu(null); onRemove(row.id); }} aria-label="Delete row" title="Delete row"><RowActionIcon name="delete" /></button>
          {onSplitRow && <button className="ghost-button ghost-button--compact icon-button action-icon-button" type="button" onClick={() => { const row = rowActionMenu.row; setRowActionMenu(null); onSplitRow(row.id); }} aria-label={`Split ${title} row`} title="Split row"><RowActionIcon name="split" /></button>}
          {onPasteRow && <button className="ghost-button ghost-button--compact icon-button action-icon-button" type="button" onClick={() => { const row = rowActionMenu.row; void copyRow(row); }} aria-label={`Copy ${title} row`} title="Copy row"><RowActionIcon name="copy" /></button>}
          {onPasteRow && <button className="ghost-button ghost-button--compact icon-button action-icon-button" type="button" onClick={() => { const row = rowActionMenu.row; void pasteRow(row.id); }} aria-label={`Paste into ${title} row`} title="Paste row"><RowActionIcon name="paste" /></button>}
          {onLookupRow && showLookupRow(rowActionMenu.row) && <button className="ghost-button ghost-button--compact icon-button action-icon-button lookup-inline-lookup-button" type="button" onClick={() => { const row = rowActionMenu.row; setRowActionMenu(null); onLookupRow(row); }} aria-label={`${lookupRowLabel} ${String((rowActionMenu.row as Record<string, unknown>).symbol || "")}`.trim()} title={`${lookupRowLabel}${(rowActionMenu.row as Record<string, unknown>).symbol ? ` ${(rowActionMenu.row as Record<string, unknown>).symbol}` : ""}`}><RowActionIcon name="lookup" /></button>}
        </div>,
        document.body
      )}
      <div className="table-wrap table-wrap--tall lookup-table-wrap" ref={tableScrollRef} onDragOver={handleTableDragOver} onDragLeave={handleTableDragLeave}>
        <table className="sheet-table sheet-table--compact sheet-table--lookup" style={lookupTableStyle}>
          <colgroup>
            <col style={{ width: lookupMoveColumnWidth }} />
            {lookupColumnWidths.map((width, index) => <col key={String(columns[index].key)} style={{ width }} />)}
            {!rowDeleteNextToMove && <col style={{ width: lookupActionColumnWidth }} />}
          </colgroup>
          <thead>
            <tr><th className={`drag-handle-heading lookup-drag-heading ${rowDeleteNextToMove ? "lookup-drag-heading--with-delete" : ""}`.trim()} style={lookupMoveHeadingStyle} aria-label="Move row">{showMoveHeaderLabel ? "Move" : ""}</th>{columns.map((column) => <th key={String(column.key)}>{column.label}</th>)}{!rowDeleteNextToMove && <th />}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                data-lookup-row-id={row.id}
                className={`${draggingRowId === row.id ? "lookup-row--dragging" : ""} ${dragOverRowId === row.id && draggingRowId !== row.id ? "lookup-row--drag-over" : ""}`.trim()}
                style={highlightedRowId === row.id ? { outline: "3px solid rgba(37, 99, 235, .75)", outlineOffset: -3, background: "rgba(219, 234, 254, .88)" } : undefined}
                onDragOver={(event) => handleDragOver(event, row.id)}
                onDrop={(event) => handleDrop(event, row.id)}
              >
                <td className={`drag-handle-cell lookup-drag-cell ${rowDeleteNextToMove ? "lookup-drag-cell--with-delete" : ""}`.trim()} style={lookupMoveCellStyle}>
                  <div className="lookup-row-actions--anchor" onMouseEnter={(event) => openRowActionMenu(row, event.currentTarget)} onMouseLeave={scheduleRowActionClose}>
                    <button className="drag-handle lookup-drag-handle" type="button" draggable title="Drag row" aria-label={`Move ${title} row`} onDragStart={(event) => handleDragStart(event, row.id)} onDragEnd={handleDragEnd}>::</button>
                  </div>
                </td>
                {columns.map((column) => <td key={String(column.key)}>{renderCell(row, column)}</td>)}
                {!rowDeleteNextToMove && <td className="lookup-table__actions"><button className="ghost-button ghost-button--compact icon-button action-icon-button" type="button" onClick={() => openRowEditor(row)} aria-label={`Edit ${title} row`} title="Edit row"><RowActionIcon name="edit" /></button><button className="ghost-button ghost-button--compact icon-button action-icon-button action-icon-button--danger" type="button" onClick={() => onRemove(row.id)} aria-label="Delete row" title="Delete row"><RowActionIcon name="delete" /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function InvestmentsTable({ rows, accountOptions, symbolOptions, categoryOptions, taxTreatmentOptions, tickerMap, stateCode, accountTaxStatusByName, excludedAfterTaxAccountNames, derivedRows, favorites, filters, sort, selectedAssetIds, showRowNumbers, isWhatIfActive, onToggleWhatIf, onSaveFavorite, onApplyFavorite, onDeleteFavorite, onRenameFavorite, onChange, onCreateIncome, onCreateNewIncome, onEditIncome, onCreateInvestment, onEditInvestment, onCreateAccount, onCreateAsset, onCreateTaxTreatment, onRemove, onSplit, onReorder, onJumpToAccount, onJumpToAsset, onHighlightRows, onRemoveIncluded, onClearViewState, onSelectAllInc, onClearAllInc }: { rows: InvestmentRow[]; accountOptions: string[]; symbolOptions: string[]; categoryOptions: string[]; taxTreatmentOptions: string[]; tickerMap: Record<string, TickerRow>; stateCode: string; accountTaxStatusByName: Record<string, string>; excludedAfterTaxAccountNames: Set<string>; derivedRows: DerivedInvestmentRow[]; favorites: InvestmentFavorite[]; filters: InvestmentFilters; sort: InvestmentSort; selectedAssetIds: number[]; showRowNumbers: boolean; isWhatIfActive: boolean; onToggleWhatIf: () => void; onSaveFavorite: (name: string) => void; onApplyFavorite: (name: string) => void; onDeleteFavorite: (name: string) => void; onRenameFavorite: (oldName: string, newName: string) => void; onChange: (id: number, field: keyof InvestmentRow, value: string | boolean) => void; onCreateIncome: (investmentId: number, input: IncomeEntryInput) => void; onCreateNewIncome: (input: IncomeEntryInput) => void; onEditIncome: (investmentId: number, input: IncomeEntryInput) => void; onCreateInvestment: (input: InvestmentEntryInput) => void; onEditInvestment: (investmentId: number, originalSymbol: string, input: InvestmentEntryInput) => void; onCreateAccount: (name: string) => void; onCreateAsset: (symbol: string) => void; onCreateTaxTreatment: (label: string) => void; onRemove: (id: number) => void; onSplit: (id: number, allocations: number[]) => void; onReorder: (sourceId: number, targetId: number) => void; onJumpToAccount: (accountName: string) => void; onJumpToAsset: (assetSymbol: string) => void; onHighlightRows: (ids: number[]) => void; onRemoveIncluded: () => void; onClearViewState: () => void; onSelectAllInc: () => void; onClearAllInc: () => void; }) {
  const derivedMap = useMemo(() => Object.fromEntries(derivedRows.map((row) => [row.id, row])), [derivedRows]);
  const [showOnlyHighlightedRows, setShowOnlyHighlightedRows] = useState(false);
  const selectedIdSet = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const filteredAndSortedRows = useMemo(() => {
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
  const displayedRows = useMemo(() => (
    showOnlyHighlightedRows && selectedIdSet.size > 0
      ? filteredAndSortedRows.filter((row) => selectedIdSet.has(row.id))
      : filteredAndSortedRows
  ), [filteredAndSortedRows, selectedIdSet, showOnlyHighlightedRows]);
  const displayedDerivedRows = displayedRows
    .map((row) => derivedMap[row.id])
    .filter((row): row is DerivedInvestmentRow => Boolean(row));
  const selectedRows = selectedAssetIds.map((id) => rows.find((row) => row.id === id)).filter((row): row is InvestmentRow => Boolean(row));
  const hasHighlightedRows = selectedRows.length > 0;
  const hasViewState = Boolean(filters.account || filters.category || filters.asset || sort.column || hasHighlightedRows || showOnlyHighlightedRows);
  const includedRowCount = rows.filter((row) => row.includeIncome).length;
  const [isFavoritesPanelOpen, setIsFavoritesPanelOpen] = useState(false);
  const [newFavoriteName, setNewFavoriteName] = useState("");
  const [selectedFavoriteName, setSelectedFavoriteName] = useState("");
  const [renameTarget, setRenameTarget] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false);
  const [isSymbolFinderOpen, setIsSymbolFinderOpen] = useState(false);
  const [symbolFinderQuery, setSymbolFinderQuery] = useState("");
  const [symbolFinderScope, setSymbolFinderScope] = useState<SymbolFinderScope>("current");
  const [highlightedFinderRowId, setHighlightedFinderRowId] = useState<number | null>(null);
  const [splitTarget, setSplitTarget] = useState<InvestmentRow | null>(null);
  const [splitCount, setSplitCount] = useState(2);
  const [splitAllocations, setSplitAllocations] = useState<number[]>([]);
  const [rowActionMenu, setRowActionMenu] = useState<{ row: InvestmentRow; left: number; top: number } | null>(null);
  const rowActionCloseTimer = useRef<number | null>(null);
  const [incomeTarget, setIncomeTarget] = useState<InvestmentRow | null>(null);
  const [incomeSourceName, setIncomeSourceName] = useState("");
  const [incomeAmount, setIncomeAmount] = useState(0);
  const [incomePeriod, setIncomePeriod] = useState<"annual" | "monthly">("annual");
  const [isAddEntryOpen, setIsAddEntryOpen] = useState(false);
  const [addEntryKind, setAddEntryKind] = useState<"income" | "investment" | null>(null);
  const [editTarget, setEditTarget] = useState<InvestmentRow | null>(null);
  const [investmentDraft, setInvestmentDraft] = useState({
    name: "",
    account: accountOptions[1] || "",
    symbol: "",
    amount: 0,
    dividendPercent: 0 as number | string,
    assetType: categoryOptions[1] || "",
    assetClass: categoryOptions[1] || "",
    taxTreatment: taxTreatmentOptions.find(Boolean) || "income",
    extraData: 0,
    assetDescription: "",
    exDividend: "",
    divPayout: "",
  });
  const [quickAddKind, setQuickAddKind] = useState<"account" | "asset" | "assetType" | "taxTreatment" | null>(null);
  const [quickAddValue, setQuickAddValue] = useState("");
  const [quickAssetDraft, setQuickAssetDraft] = useState<QuickAssetInput>({ symbol: "", dividendPercent: "", assetClass: categoryOptions[1] || categoryOptions[0] || "", taxTreatment: taxTreatmentOptions.find(Boolean) || "income", description: "", exDividend: "", divPayout: "" });
  const [quickAddTargetRowId, setQuickAddTargetRowId] = useState<number | null>(null);
  const quickAddSelectRef = useRef<((value: string) => void) | null>(null);
  useEffect(() => {
    const handleQuickAdd = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: "account" | "asset"; select: (value: string) => void }>).detail;
      quickAddSelectRef.current = detail.select;
      openQuickAdd(detail.kind);
    };
    window.addEventListener("aftertax:quick-add", handleQuickAdd);
    return () => window.removeEventListener("aftertax:quick-add", handleQuickAdd);
  }, []);
  const openQuickAdd = (kind: "account" | "asset" | "assetType" | "taxTreatment", targetRowId: number | null = null) => {
    setQuickAddKind(kind);
    setQuickAddTargetRowId(targetRowId);
    setQuickAddValue("");
    if (kind === "asset") setQuickAssetDraft({ symbol: "", dividendPercent: "", assetClass: categoryOptions[1] || categoryOptions[0] || "", taxTreatment: taxTreatmentOptions.find(Boolean) || "income", description: "", exDividend: "", divPayout: "" });
  };
  const confirmQuickAdd = () => {
    const value = quickAddKind === "asset" ? quickAssetDraft.symbol.trim() : quickAddValue.trim();
    if (!value || !quickAddKind) return;
    if (quickAddKind === "account") {
      onCreateAccount(value);
      if (quickAddTargetRowId !== null) onChange(quickAddTargetRowId, "account", value);
      else updateInvestmentDraft("account", value);
    } else if (quickAddKind === "asset") {
      onCreateAsset(JSON.stringify({ ...quickAssetDraft, symbol: value }));
      if (quickAddTargetRowId !== null) onChange(quickAddTargetRowId, "symbol", value);
    } else if (quickAddKind === "assetType") {
      updateInvestmentDraft("assetType", value);
      updateInvestmentDraft("assetClass", value);
    } else {
      onCreateTaxTreatment(value);
      updateInvestmentDraft("taxTreatment", value);
    }
    quickAddSelectRef.current?.(value);
    quickAddSelectRef.current = null;
    setQuickAddKind(null);
  };
  const [columnWidths, setColumnWidths] = useState<InvestmentColumnWidths>(() => {
    if (typeof window === "undefined") return DEFAULT_INVESTMENT_COLUMN_WIDTHS;
    try {
      const stored = JSON.parse(window.localStorage.getItem(INVESTMENT_COLUMN_WIDTH_STORAGE_KEY) || "{}") as Partial<Record<InvestmentColumnId, number>>;
      return INVESTMENT_COLUMN_DEFS.reduce((acc, column) => {
        const storedWidth = Number(stored[column.id]);
        const migratedStoredWidth = column.id === "normalPercent" && storedWidth === 58
          ? DEFAULT_INVESTMENT_COLUMN_WIDTHS[column.id]
          : column.id === "move" && storedWidth >= 100
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
  const previousWhatIfActiveRef = useRef(isWhatIfActive);
  const [isWhatIfRevealAnimating, setIsWhatIfRevealAnimating] = useState(false);
  const dragPointerYRef = useRef<number | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const scrollInvestmentElementIntoTableView = (element: HTMLElement, options: { block?: "center" | "nearest"; inline?: "center" | "nearest" } = {}) => {
    const container = tableScrollRef.current;
    if (!container) return;
    const block = options.block || "center";
    const inline = options.inline || "nearest";
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    let nextTop = container.scrollTop;
    let nextLeft = container.scrollLeft;

    if (block === "center") {
      nextTop += elementRect.top - containerRect.top - (container.clientHeight - elementRect.height) / 2;
    } else if (elementRect.top < containerRect.top) {
      nextTop += elementRect.top - containerRect.top;
    } else if (elementRect.bottom > containerRect.bottom) {
      nextTop += elementRect.bottom - containerRect.bottom;
    }

    if (inline === "center") {
      nextLeft += elementRect.left - containerRect.left - (container.clientWidth - elementRect.width) / 2;
    } else if (elementRect.left < containerRect.left) {
      nextLeft += elementRect.left - containerRect.left;
    } else if (elementRect.right > containerRect.right) {
      nextLeft += elementRect.right - containerRect.right;
    }

    container.scrollTo({
      top: Math.max(0, nextTop),
      left: Math.max(0, nextLeft),
      behavior: "smooth",
    });
  };
  const selectedIdsSignature = selectedAssetIds.join("|");
  useEffect(() => {
    if (selectedAssetIds.length === 0) {
      setShowOnlyHighlightedRows(false);
      return;
    }
    setShowOnlyHighlightedRows(true);
  }, [selectedAssetIds.length, selectedIdsSignature]);
  useEffect(() => {
    window.localStorage.setItem(INVESTMENT_COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(columnWidths));
  }, [columnWidths]);
  useEffect(() => {
    if (selectedAssetIds.length === 0) return;
    const container = tableScrollRef.current;
    if (!container) return;
    const frame = window.requestAnimationFrame(() => {
      const firstSelectedRow = container.querySelector<HTMLElement>(`tr[data-investment-id="${selectedAssetIds[0]}"]`);
      if (firstSelectedRow) scrollInvestmentElementIntoTableView(firstSelectedRow, { block: "center", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  // Only reposition the grid when the highlighted-row selection itself changes.
  // Row edits (including Included and WhatIf checkboxes) rebuild displayedRows and
  // must leave the user's current scroll position untouched.
  }, [selectedIdsSignature]);
  const getRowClassName = (row: InvestmentRow) => {
    const classes = ["investment-row"];
    if (derivedMap[row.id]?.incomeItem) {
      classes.push("investment-row--income");
    }
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
  const symbolFinderOptions = useMemo(() => Array.from(new Set(rows
    .flatMap((row) => symbolFinderScope === "current" ? [row.symbol] : [row.symbol, row.newSymbol])
    .map((symbol) => symbol.trim())
    .filter(Boolean)))
    .sort((a, b) => a.localeCompare(b)), [rows, symbolFinderScope]);
  const normalizedSymbolFinderQuery = normalizeLookupKey(symbolFinderQuery);
  const rowMatchesSymbolFinder = (row: InvestmentRow, normalizedQuery: string, scope: SymbolFinderScope) => (
    normalizeLookupKey(row.symbol) === normalizedQuery ||
    (scope === "all" && normalizeLookupKey(row.newSymbol) === normalizedQuery)
  );
  const symbolFinderMatches = useMemo(() => {
    if (!normalizedSymbolFinderQuery) return [];
    return filteredAndSortedRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => rowMatchesSymbolFinder(row, normalizedSymbolFinderQuery, symbolFinderScope));
  }, [filteredAndSortedRows, normalizedSymbolFinderQuery, symbolFinderScope]);
  const highlightedInvestmentRows = useMemo(() => selectedAssetIds
    .map((id) => displayedRows.find((row) => row.id === id))
    .filter((row): row is InvestmentRow => Boolean(row)), [displayedRows, selectedAssetIds]);
  const hasHighlightedNavigation = highlightedInvestmentRows.length > 0;
  const canNavigateActiveRows = highlightedInvestmentRows.length > 1;
  const showRowNavigationControls = hasHighlightedNavigation;
  const rowNavigationLabel = `${highlightedInvestmentRows.length} highlighted row${highlightedInvestmentRows.length === 1 ? "" : "s"}`;
  const openBlankSymbolFinder = () => {
    lastSymbolFinderSelectSubmitRef.current = "";
    lastSymbolFinderTypedSubmitRef.current = "";
    setSymbolFinderQuery("");
    setSymbolFinderScope("current");
    setIsSymbolFinderOpen(true);
  };
  const highlightSymbolFinderMatches = (focusedRowId: number) => {
    const ids = symbolFinderMatches.map(({ row }) => row.id);
    onHighlightRows(ids);
    setHighlightedFinderRowId(focusedRowId);
    setShowOnlyHighlightedRows(true);
    setIsSymbolFinderOpen(false);
    window.requestAnimationFrame(() => {
      const rowElement = tableScrollRef.current?.querySelector<HTMLElement>(`tr[data-investment-id="${focusedRowId}"]`);
      if (rowElement) scrollInvestmentElementIntoTableView(rowElement, { block: "center", inline: "nearest" });
    });
  };
  const applySymbolFinderQuery = (query: string) => {
    const trimmedQuery = query.trim();
    const normalizedQuery = normalizeLookupKey(trimmedQuery);
    if (!normalizedQuery) return false;
    const matches = filteredAndSortedRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => rowMatchesSymbolFinder(row, normalizedQuery, symbolFinderScope));
    const focusedRow = matches[0]?.row;
    if (!focusedRow) return false;
    setSymbolFinderQuery(trimmedQuery);
    onHighlightRows(matches.map(({ row }) => row.id));
    setHighlightedFinderRowId(focusedRow.id);
    setShowOnlyHighlightedRows(true);
    setIsSymbolFinderOpen(false);
    window.requestAnimationFrame(() => {
      const rowElement = tableScrollRef.current?.querySelector<HTMLElement>(`tr[data-investment-id="${focusedRow.id}"]`);
      if (rowElement) scrollInvestmentElementIntoTableView(rowElement, { block: "center", inline: "nearest" });
    });
    return true;
  };
  const submitSymbolFinderQueryAfterEvent = (query: string) => {
    window.setTimeout(() => {
      applySymbolFinderQuery(query);
    }, 0);
  };
  const lastSymbolFinderSelectSubmitRef = useRef("");
  const lastSymbolFinderTypedSubmitRef = useRef("");
  const symbolFinderHasExactOption = (value: string) => symbolFinderOptions.some((symbol) => normalizeLookupKey(symbol) === normalizeLookupKey(value));
  const submitSymbolFinderTypedValue = (value: string) => {
    const typedSymbol = value.trim();
    setSymbolFinderQuery(typedSymbol);
    if (!typedSymbol) {
      lastSymbolFinderTypedSubmitRef.current = "";
      return;
    }
    if (!symbolFinderHasExactOption(typedSymbol)) return;
    const submitKey = `${typedSymbol}|${symbolFinderScope}`;
    if (lastSymbolFinderTypedSubmitRef.current === submitKey) return;
    lastSymbolFinderTypedSubmitRef.current = submitKey;
    submitSymbolFinderQueryAfterEvent(typedSymbol);
  };
  const submitSymbolFinderSelectValue = (value: string) => {
    const selectedSymbol = value.trim();
    setSymbolFinderQuery(selectedSymbol);
    if (!selectedSymbol) {
      lastSymbolFinderSelectSubmitRef.current = "";
      return;
    }
    const submitKey = `${selectedSymbol}|${symbolFinderScope}`;
    if (lastSymbolFinderSelectSubmitRef.current === submitKey) return;
    lastSymbolFinderSelectSubmitRef.current = submitKey;
    submitSymbolFinderQueryAfterEvent(selectedSymbol);
  };
  const focusInvestmentRow = (rowId: number) => {
    setHighlightedFinderRowId(rowId);
    window.requestAnimationFrame(() => {
      const rowElement = tableScrollRef.current?.querySelector<HTMLElement>(`tr[data-investment-id="${rowId}"]`);
      if (rowElement) scrollInvestmentElementIntoTableView(rowElement, { block: "center", inline: "nearest" });
    });
  };
  const cycleHighlightedRow = (direction: "previous" | "next") => {
    if (highlightedInvestmentRows.length === 0) return;
    const currentIndex = highlightedInvestmentRows.findIndex((row) => row.id === highlightedFinderRowId);
    const fallbackIndex = direction === "next" ? -1 : 0;
    const nextIndex = direction === "next"
      ? (currentIndex >= 0 ? currentIndex + 1 : fallbackIndex + 1) % highlightedInvestmentRows.length
      : (currentIndex >= 0 ? currentIndex - 1 + highlightedInvestmentRows.length : highlightedInvestmentRows.length - 1) % highlightedInvestmentRows.length;
    const nextRow = highlightedInvestmentRows[nextIndex];
    if (nextRow) focusInvestmentRow(nextRow.id);
  };
  const cycleActiveInvestmentRows = (direction: "previous" | "next") => {
    cycleHighlightedRow(direction);
  };
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
  const openIncomeDialog = (row: InvestmentRow) => {
    const existingName = row.description.trim();
    setIncomeTarget(row);
    setIncomeSourceName(existingName && existingName !== "New Investment" ? existingName : "");
    setIncomeAmount(Math.max(0, toNumber(derivedMap[row.id]?.yearlyIncome || row.yearlyIncome)));
    setIncomePeriod("annual");
  };
  const closeIncomeDialog = () => setIncomeTarget(null);
  const annualizedIncomeAmount = incomePeriod === "monthly" ? incomeAmount * 12 : incomeAmount;
  const canCreateIncome = incomeSourceName.trim().length > 0 && incomeAmount > 0;
  const confirmCreateIncome = () => {
    if (!incomeTarget || !canCreateIncome) return;
    onCreateIncome(incomeTarget.id, {
      sourceName: incomeSourceName.trim(),
      annualAmount: Math.round(annualizedIncomeAmount * 100) / 100,
    });
    closeIncomeDialog();
  };
  const openAddEntryDialog = () => {
    setEditTarget(null);
    setAddEntryKind(null);
    setIncomeSourceName("");
    setIncomeAmount(0);
    setIncomePeriod("annual");
    setInvestmentDraft({
      name: "",
      account: accountOptions[1] || "",
      symbol: "",
      amount: 0,
      dividendPercent: 0,
      assetType: categoryOptions[1] || "",
      assetClass: categoryOptions[1] || "",
      taxTreatment: taxTreatmentOptions.find((value) => normalizeLookupKey(value) === "income") || taxTreatmentOptions.find(Boolean) || "income",
      extraData: 0,
      assetDescription: "",
      exDividend: "",
      divPayout: "",
    });
    setIsAddEntryOpen(true);
  };
  const openEditEntryDialog = (row: InvestmentRow) => {
    const derived = derivedMap[row.id];
    const ticker = tickerMap[normalizeLookupKey(row.symbol)];
    setEditTarget(row);
    if (derived?.incomeItem || isIncomeAssetType(ticker?.assetType || "")) {
      setAddEntryKind("income");
      setIncomeSourceName(row.description.trim());
      setIncomeAmount(Math.max(0, toNumber(derived?.yearlyIncome || row.yearlyIncome)));
      setIncomePeriod("annual");
    } else {
      setAddEntryKind("investment");
      setInvestmentDraft({
        name: row.description,
        account: row.account,
        symbol: row.symbol,
        amount: Math.max(0, toNumber(row.totalInvestment)),
        dividendPercent: normalizeRate(ticker?.percentReturn ?? derived?.currentPercent ?? 0) * 100,
        assetType: ticker?.category || row.category || ticker?.assetType || "",
        assetClass: ticker?.category || row.category,
        taxTreatment: ticker?.taxTreatment || taxTreatmentOptions.find((value) => normalizeLookupKey(value) === "income") || taxTreatmentOptions.find(Boolean) || "income",
        extraData: toNumber(ticker?.extraData || 0),
        assetDescription: ticker?.description || row.description,
        exDividend: ticker?.exDividend || "",
        divPayout: ticker?.divPayout || "",
      });
    }
    setIsAddEntryOpen(true);
  };
  const closeAddEntryDialog = () => {
    setIsAddEntryOpen(false);
    setAddEntryKind(null);
    setEditTarget(null);
  };
  const updateInvestmentDraft = (field: keyof typeof investmentDraft, value: string | number) => {
    setInvestmentDraft((current) => ({ ...current, [field]: value }));
  };
  const normalizedDraftSymbol = normalizeLookupKey(investmentDraft.symbol);
  const originalEditSymbol = normalizeLookupKey(editTarget?.symbol || "");
  const matchedDraftAsset = normalizedDraftSymbol ? tickerMap[normalizedDraftSymbol] : undefined;
  const reusesDifferentExistingAsset = Boolean(matchedDraftAsset && normalizedDraftSymbol !== originalEditSymbol);
  const investmentRequiredFields = {
    name: investmentDraft.name.trim().length > 0,
    account: investmentDraft.account.trim().length > 0,
    symbol: investmentDraft.symbol.trim().length > 0,
    amount: Number.isFinite(investmentDraft.amount) && investmentDraft.amount > 0,
    dividendPercent: String(investmentDraft.dividendPercent).trim() !== "" && Number.isFinite(toNumber(investmentDraft.dividendPercent)) && toNumber(investmentDraft.dividendPercent) >= 0,
    assetType: investmentDraft.assetType.trim().length > 0,
    taxTreatment: investmentDraft.taxTreatment.trim().length > 0,
  };
  const canCreateInvestment = Object.values(investmentRequiredFields).every(Boolean);
  const confirmCreateNewIncome = () => {
    if (!canCreateIncome) return;
    const input = {
      sourceName: incomeSourceName.trim(),
      annualAmount: Math.round(annualizedIncomeAmount * 100) / 100,
    };
    if (editTarget) onEditIncome(editTarget.id, input);
    else onCreateNewIncome(input);
    closeAddEntryDialog();
  };
  const confirmCreateInvestment = () => {
    if (!canCreateInvestment) return;
    const usedAssetKeys = new Set(symbolOptions.map(normalizeLookupKey));
    const fallbackSymbolBase = investmentDraft.name.trim() || "New Asset";
    let resolvedSymbol = investmentDraft.symbol.trim() || editTarget?.symbol.trim() || fallbackSymbolBase;
    if (!investmentDraft.symbol.trim() && !editTarget?.symbol.trim()) {
      let suffix = 2;
      while (usedAssetKeys.has(normalizeLookupKey(resolvedSymbol))) {
        resolvedSymbol = `${fallbackSymbolBase} ${suffix}`;
        suffix += 1;
      }
    }
    const matchedAsset = tickerMap[normalizeLookupKey(resolvedSymbol)];
    const shouldReuseMatchedAsset = Boolean(matchedAsset && normalizeLookupKey(resolvedSymbol) !== originalEditSymbol);
    const name = investmentDraft.name.trim() || editTarget?.description.trim() || resolvedSymbol || "New investment";
    const input = {
      name,
      account: investmentDraft.account.trim() || editTarget?.account.trim() || accountOptions.find(Boolean) || "Unassigned",
      symbol: matchedAsset?.symbol && shouldReuseMatchedAsset ? matchedAsset.symbol : resolvedSymbol,
      amount: Math.round(investmentDraft.amount * 100) / 100,
      dividendRate: shouldReuseMatchedAsset ? normalizeRate(matchedAsset?.percentReturn || 0) : toNumber(investmentDraft.dividendPercent) / 100,
      assetType: shouldReuseMatchedAsset ? matchedAsset?.assetType || "ETF" : investmentDraft.assetType.trim() || matchedAsset?.assetType || "ETF",
      assetClass: shouldReuseMatchedAsset ? matchedAsset?.category || "Uncategorized" : investmentDraft.assetClass.trim() || matchedAsset?.category || categoryOptions.find(Boolean) || "Uncategorized",
      taxTreatment: shouldReuseMatchedAsset ? matchedAsset?.taxTreatment || "income" : investmentDraft.taxTreatment.trim() || matchedAsset?.taxTreatment || "income",
      extraData: shouldReuseMatchedAsset ? toNumber(matchedAsset?.extraData || 0) : investmentDraft.extraData,
      assetDescription: shouldReuseMatchedAsset ? matchedAsset?.description || name : investmentDraft.assetDescription.trim() || matchedAsset?.description || name,
      exDividend: shouldReuseMatchedAsset ? matchedAsset?.exDividend || "" : investmentDraft.exDividend || matchedAsset?.exDividend || "",
      divPayout: shouldReuseMatchedAsset ? matchedAsset?.divPayout || "" : investmentDraft.divPayout.trim() || matchedAsset?.divPayout || "",
    };
    if (editTarget) onEditInvestment(editTarget.id, editTarget.symbol, input);
    else onCreateInvestment(input);
    closeAddEntryDialog();
  };
  useEffect(() => {
    if (!splitTarget) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSplitTarget(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [splitTarget]);
  useEffect(() => {
    if (!incomeTarget) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeIncomeDialog();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [incomeTarget]);
  useEffect(() => {
    if (!isAddEntryOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAddEntryDialog();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAddEntryOpen]);
  useEffect(() => {
    if (!isSymbolFinderOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSymbolFinderOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSymbolFinderOpen]);
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
  const investmentColumnClassName = (columnId: InvestmentColumnId) => `investment-column investment-column--${columnId}`;
  const renderTotalCell = (key: InvestmentColumnId, value: number) => <td key={key} className={investmentColumnClassName(key)}><div className="readonly-cell readonly-cell--money readonly-cell--total">{formatGridCurrency(value)}</div></td>;
  const renderEmptyTotalCell = (key: InvestmentColumnId) => <td key={key} className={investmentColumnClassName(key)} />;
  const isColumnVisible = (column: typeof INVESTMENT_COLUMN_DEFS[number]) => {
    if (column.id === "row") return showRowNumbers;
    const group = "group" in column ? column.group : undefined;
    if (group === "override") return isWhatIfActive;
    if (group === "tax") return false;
    if (group === "debug") return false;
    return true;
  };
  const visibleInvestmentColumns = INVESTMENT_COLUMN_DEFS.filter(isColumnVisible);
  const visibleTableWidth = INVESTMENT_COLUMN_DEFS.reduce((sum, column) => sum + (isColumnVisible(column) ? columnWidths[column.id] : 0), 0);
  const visibleRowNumberWidth = showRowNumbers ? columnWidths.row : 0;
  const tableStyle = {
    width: visibleTableWidth,
    minWidth: visibleTableWidth,
    "--investment-col-2-left": `${visibleRowNumberWidth}px`,
    "--investment-col-3-left": `${visibleRowNumberWidth + columnWidths.move}px`,
    "--investment-col-4-left": `${visibleRowNumberWidth + columnWidths.move + columnWidths.included}px`,
    "--investment-col-5-left": `${visibleRowNumberWidth + columnWidths.move + columnWidths.included + columnWidths.account}px`,
    "--investment-col-6-left": `${visibleRowNumberWidth + columnWidths.move + columnWidths.included + columnWidths.account + columnWidths.symbol}px`,
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
  const withInvestmentColumnClass = (cell: ReactElement<{ className?: string }>, columnId: InvestmentColumnId) => cloneElement(cell, {
    className: [cell.props.className, investmentColumnClassName(columnId)].filter(Boolean).join(" "),
  });
  const renderInvestmentHeader = (column: typeof INVESTMENT_COLUMN_DEFS[number]) => (
    <th
      key={column.id}
      className={[
        investmentColumnClassName(column.id),
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
    isWhatIfRevealAnimating ? "sheet-table--what-if-reveal" : "",
  ].filter(Boolean).join(" ");

  useEffect(() => {
    const wasWhatIfActive = previousWhatIfActiveRef.current;
    previousWhatIfActiveRef.current = isWhatIfActive;
    if (!isWhatIfActive || wasWhatIfActive) return;

    const scrollContainer = tableScrollRef.current;
    if (!scrollContainer) return;

    setIsWhatIfRevealAnimating(true);
    window.setTimeout(() => setIsWhatIfRevealAnimating(false), 900);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const firstWhatIfColumn = scrollContainer.querySelector(".investment-column--override");
        if (!firstWhatIfColumn) return;
        scrollInvestmentElementIntoTableView(firstWhatIfColumn as HTMLElement, { block: "nearest", inline: "center" });
      });
    });
  }, [isWhatIfActive]);

  const cancelRowActionClose = () => {
    if (rowActionCloseTimer.current !== null) {
      window.clearTimeout(rowActionCloseTimer.current);
      rowActionCloseTimer.current = null;
    }
  };
  const openRowActionMenu = (row: InvestmentRow, anchor: HTMLElement) => {
    cancelRowActionClose();
    const rect = anchor.getBoundingClientRect();
    setRowActionMenu({ row, left: rect.right + 4, top: rect.top + rect.height / 2 });
  };
  const scheduleRowActionClose = () => {
    cancelRowActionClose();
    rowActionCloseTimer.current = window.setTimeout(() => setRowActionMenu(null), 180);
  };
  useEffect(() => {
    if (!rowActionMenu) return;
    const close = () => setRowActionMenu(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [rowActionMenu]);
  useEffect(() => () => cancelRowActionClose(), []);

  return (
    <Section title="Investments / Income" subtitle="Workbook-style grid with checkbox overrides. When WhatIf is checked, the new asset and return replace the current holding in the downstream tax logic." className="investments-workspace" hideHeading>
      <div className="actions-row">
        <button className="primary-button icon-button action-icon-button" type="button" onClick={openAddEntryDialog} aria-label="Add income or investment" title="Add income or investment"><RowActionIcon name="add" /></button>
        <button className="ghost-button icon-button action-icon-button" type="button" onClick={() => setIsFavoritesPanelOpen(true)} aria-label="Select rows" title="Select rows"><RowActionIcon name="select" /></button>
        <button className="ghost-button icon-button action-icon-button action-icon-button--danger" type="button" onClick={handleRemoveIncludedRows} aria-label={`Delete ${includedRowsLabel}`} title={includedRowCount === 0 ? "No included rows to delete" : `Delete ${includedRowsLabel}`} disabled={includedRowCount === 0}><RowActionIcon name="delete" /></button>
        <button className="ghost-button icon-button action-icon-button" type="button" onClick={openBlankSymbolFinder} aria-label="Find asset rows" title="Find asset rows"><RowActionIcon name="find" /></button>
        {showRowNavigationControls && (
          <div className="row-navigation-controls" role="group" aria-label="Cycle investment rows">
            <span className="row-navigation-controls__label">{rowNavigationLabel}</span>
            <button className="ghost-button icon-button action-icon-button finder-nav-button" type="button" onClick={() => cycleActiveInvestmentRows("previous")} aria-label="Previous highlighted row" title="Previous highlighted row" disabled={!canNavigateActiveRows}><RowActionIcon name="previous" /></button>
            <button className="ghost-button icon-button action-icon-button finder-nav-button" type="button" onClick={() => cycleActiveInvestmentRows("next")} aria-label="Next highlighted row" title="Next highlighted row" disabled={!canNavigateActiveRows}><RowActionIcon name="next" /></button>
          </div>
        )}
        <div className="column-toggle-group" role="group" aria-label="Investment display controls">
          <button className={`investment-what-if-toggle ${isWhatIfActive ? "investment-what-if-toggle--open" : ""}`} type="button" aria-pressed={isWhatIfActive} onClick={onToggleWhatIf}>
            <span className="investment-what-if-toggle__label">WhatIf</span>
            <span className="investment-what-if-toggle__state" aria-label={isWhatIfActive ? "Click to close WhatIf columns" : "Click to open WhatIf columns"} title={isWhatIfActive ? "Close WhatIf columns" : "Open WhatIf columns"}><WhatIfStateIcon isOpen={!isWhatIfActive} /></span>
          </button>
        </div>
      </div>
      {hasViewState && (
        <div className="view-state-strip" role="status">
          <strong>Showing {displayedRows.length} of {rows.length} rows</strong>
          {selectedRows.length > 0 && <span>Selected: {selectedRows.length} row{selectedRows.length === 1 ? "" : "s"}</span>}
          {hasHighlightedRows && <button className="ghost-button ghost-button--compact" type="button" onClick={() => setShowOnlyHighlightedRows((current) => !current)}>{showOnlyHighlightedRows ? "Show all rows" : "Show highlighted rows"}</button>}
          {filters.account && <span>Account: {filters.account}</span>}
          {filters.category && <span>Category: {filters.category}</span>}
          {filters.asset && <span>Asset: {filters.asset}</span>}
          {sort.column && <span>Sorted: {sort.column} {sort.direction}</span>}
          <button className="ghost-button ghost-button--compact" type="button" onClick={onClearViewState}>{hasHighlightedRows || showOnlyHighlightedRows ? "Clear highlights/filters" : "Show all rows"}</button>
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
      {isSymbolFinderOpen && createPortal(
        <div className="symbol-finder-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsSymbolFinderOpen(false); }}>
          <div className="symbol-finder-panel" role="dialog" aria-modal="true" aria-labelledby="symbol-finder-title">
            <div className="symbol-finder-panel__header">
              <div>
                <p className="eyebrow">Investment Rows</p>
                <h3 id="symbol-finder-title">Find Asset</h3>
              </div>
              <button className="ghost-button ghost-button--compact" type="button" onClick={() => setIsSymbolFinderOpen(false)}>Close</button>
            </div>
            <div className="symbol-finder-panel__controls">
              <label>
                <span>Type symbol</span>
                <input
                  type="text"
                  list="symbol-finder-options"
                  value={symbolFinderQuery}
                  onInput={(event) => submitSymbolFinderTypedValue(event.currentTarget.value)}
                  onChange={(event) => submitSymbolFinderTypedValue(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    const query = event.currentTarget.value;
                    lastSymbolFinderTypedSubmitRef.current = "";
                    submitSymbolFinderQueryAfterEvent(query);
                  }}
                  placeholder="Enter symbol"
                  autoFocus
                />
              </label>
              <datalist id="symbol-finder-options">
                {symbolFinderOptions.map((symbol) => <option key={symbol} value={symbol} />)}
              </datalist>
              <label>
                <span>Select symbol</span>
                <select
                  value={symbolFinderQuery}
                  onInput={(event) => submitSymbolFinderSelectValue(event.currentTarget.value)}
                  onChange={(event) => submitSymbolFinderSelectValue(event.currentTarget.value)}
                >
                  <option value="">Choose symbol</option>
                  {symbolFinderOptions.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
                </select>
              </label>
              <label>
                <span>Search in</span>
                <select value={symbolFinderScope} onChange={(event) => setSymbolFinderScope(event.target.value as SymbolFinderScope)}>
                  <option value="current">Current asset only</option>
                  <option value="all">Current + WhatIf asset</option>
                </select>
              </label>
            </div>
            <div className="symbol-finder-panel__results" role="list" aria-label="Matching investment rows">
              {!normalizedSymbolFinderQuery && <p className="symbol-finder-panel__empty">Type or select an asset symbol to find matching visible rows.</p>}
              {normalizedSymbolFinderQuery && symbolFinderMatches.length === 0 && <p className="symbol-finder-panel__empty">No visible rows match {symbolFinderQuery.trim()}.</p>}
              {symbolFinderMatches.map(({ row, index }) => (
                <button
                  key={row.id}
                  className="symbol-finder-result"
                  type="button"
                  role="listitem"
                  onClick={() => highlightSymbolFinderMatches(row.id)}
                >
                  <strong>Row {row.spreadsheetRowNumber ?? index + 1}</strong>
                  <span>{row.description || row.account || "Investment row"}</span>
                  <em>{row.newSymbol && normalizeLookupKey(row.newSymbol) === normalizedSymbolFinderQuery ? `${row.symbol || "Current"} → ${row.newSymbol}` : row.symbol}</em>
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
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
                          <MoneyInput
                            value={amount}
                            onChange={(value) => setSplitAllocations((current) => current.map((currentAmount, currentIndex) => currentIndex === index ? toNumber(value) : currentAmount))}
                            ariaLabel={`Investment amount for split row ${index + 1}`}
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
      {quickAddKind && createPortal(
        <div className="income-entry-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setQuickAddKind(null); }}>
          <div className={`add-entry-panel ${quickAddKind === "asset" ? "add-entry-panel--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="quick-add-title">
            <div className="income-entry-panel__header">
              <div><p className="eyebrow">New lookup item</p><h3 id="quick-add-title">Add {quickAddKind === "taxTreatment" ? "tax treatment" : quickAddKind === "assetType" ? "asset type" : quickAddKind}</h3></div>
              <button className="ghost-button ghost-button--compact" type="button" onClick={() => setQuickAddKind(null)}>Close</button>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); confirmQuickAdd(); }}>
              <p className="income-entry-panel__copy">Create this item here and select it immediately.</p>
              {quickAddKind === "asset" ? (
                <div className="add-investment-form-grid">
                  <label className="income-entry-panel__field"><span>Asset ID / ticker <em className="add-entry-required">Required</em></span><input type="text" required value={quickAssetDraft.symbol} onChange={(event) => setQuickAssetDraft((current) => ({ ...current, symbol: event.target.value }))} autoFocus /></label>
                  <label className="income-entry-panel__field"><span>Dividend / annual return % <em className="add-entry-required">Required</em></span><input type="number" required min="0" step="0.01" value={quickAssetDraft.dividendPercent} onChange={(event) => setQuickAssetDraft((current) => ({ ...current, dividendPercent: event.target.value }))} /></label>
                  <label className="income-entry-panel__field"><span>Asset type / class <em className="add-entry-required">Required</em></span><select required value={quickAssetDraft.assetClass} onChange={(event) => setQuickAssetDraft((current) => ({ ...current, assetClass: event.target.value }))}><option value="">Select asset class</option>{categoryOptions.filter(Boolean).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                  <label className="income-entry-panel__field"><span>Tax treatment <em className="add-entry-required">Required</em></span><select required value={quickAssetDraft.taxTreatment} onChange={(event) => setQuickAssetDraft((current) => ({ ...current, taxTreatment: event.target.value }))}><option value="">Select tax treatment</option>{taxTreatmentOptions.filter(Boolean).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                  <label className="income-entry-panel__field"><span>Ex-dividend date</span><input type="date" value={quickAssetDraft.exDividend} onChange={(event) => setQuickAssetDraft((current) => ({ ...current, exDividend: event.target.value }))} /></label>
                  <label className="income-entry-panel__field"><span>Dividend payout schedule</span><input type="text" value={quickAssetDraft.divPayout} onChange={(event) => setQuickAssetDraft((current) => ({ ...current, divPayout: event.target.value }))} placeholder="Monthly, quarterly, annually..." /></label>
                  <label className="income-entry-panel__field add-investment-form-grid__wide"><span>Asset description</span><input type="text" value={quickAssetDraft.description} onChange={(event) => setQuickAssetDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                </div>
              ) : (
                <label className="income-entry-panel__field">
                  <span>{quickAddKind === "taxTreatment" ? "Treatment ID" : quickAddKind === "account" ? "Account name" : "Asset type name"} <em className="add-entry-required">Required</em></span>
                  <input type="text" required value={quickAddValue} onChange={(event) => setQuickAddValue(event.target.value)} autoFocus />
                </label>
              )}
              <div className="income-entry-panel__actions">
                <button className="ghost-button" type="button" onClick={() => setQuickAddKind(null)}>Cancel</button>
                <button className="primary-button" type="submit" disabled={quickAddKind === "asset" ? !quickAssetDraft.symbol.trim() || quickAssetDraft.dividendPercent.trim() === "" || !quickAssetDraft.assetClass || !quickAssetDraft.taxTreatment : !quickAddValue.trim()}>Add and select</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {isAddEntryOpen && createPortal(
        <div className="income-entry-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAddEntryDialog(); }}>
          <div className={`add-entry-panel ${addEntryKind === "investment" ? "add-entry-panel--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="add-entry-title">
            <div className="income-entry-panel__header">
              <div>
                <p className="eyebrow">Investments / Income</p>
                <h3 id="add-entry-title">{editTarget ? `Edit ${addEntryKind}` : addEntryKind ? `Add ${addEntryKind}` : "What would you like to add?"}</h3>
              </div>
              <button className="ghost-button ghost-button--compact" type="button" onClick={closeAddEntryDialog}>Close</button>
            </div>
            {!addEntryKind && (
              <div className="add-entry-kind-grid">
                <button className="add-entry-kind-card add-entry-kind-card--income" type="button" onClick={() => setAddEntryKind("income")}>
                  <span className="add-entry-kind-card__icon" aria-hidden="true">$</span>
                  <strong>Income</strong>
                  <small>Add salary, pension, rental, or another recurring income source.</small>
                </button>
                <button className="add-entry-kind-card add-entry-kind-card--investment" type="button" onClick={() => setAddEntryKind("investment")}>
                  <span className="add-entry-kind-card__icon" aria-hidden="true">%</span>
                  <strong>Investment</strong>
                  <small>Define a holding and automatically add its complete Asset record.</small>
                </button>
              </div>
            )}
            {addEntryKind === "income" && (
              <form onSubmit={(event) => { event.preventDefault(); confirmCreateNewIncome(); }}>
                <p className="income-entry-panel__copy">{editTarget ? "Update this income source and its annual payment amount." : "Enter the source and payment amount. The matching Income asset and investment row will be created together."}</p>
                <label className="income-entry-panel__field">
                  <span>Name of income source</span>
                  <input type="text" value={incomeSourceName} onChange={(event) => setIncomeSourceName(event.target.value)} placeholder="Salary, pension, rental income..." autoFocus />
                </label>
                <div className="income-entry-panel__amount-row">
                  <label className="income-entry-panel__field">
                    <span>Income amount</span>
                    <div className="income-entry-panel__money-input">
                      <span aria-hidden="true">$</span>
                      <MoneyInput value={incomeAmount} onChange={(value) => setIncomeAmount(Math.max(0, toNumber(value)))} ariaLabel="Income amount" />
                    </div>
                  </label>
                  <label className="income-entry-panel__field">
                    <span>Paid</span>
                    <select value={incomePeriod} onChange={(event) => setIncomePeriod(event.target.value as "annual" | "monthly")}>
                      <option value="annual">Annually</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </label>
                </div>
                <div className="income-entry-panel__annualized" aria-live="polite">
                  <span>Annual income</span>
                  <strong>{formatCurrencyDetailed(annualizedIncomeAmount)}</strong>
                </div>
                <div className="income-entry-panel__actions">
                  <button className="ghost-button" type="button" onClick={editTarget ? closeAddEntryDialog : () => setAddEntryKind(null)}>{editTarget ? "Cancel" : "Back"}</button>
                  <button className="primary-button" type="submit" disabled={!canCreateIncome}>{editTarget ? "Save income changes" : "Add income source"}</button>
                </div>
              </form>
            )}
            {addEntryKind === "investment" && (
              <form onSubmit={(event) => { event.preventDefault(); confirmCreateInvestment(); }}>
                <p className="income-entry-panel__copy">{editTarget ? "Update the required investment and Asset fields. Optional dividend details can be expanded below." : "Complete the required fields to create the investment and its reusable Asset record. Optional dividend details can be added now or later."}</p>
                <div className="add-investment-form-grid">
                  <label className="income-entry-panel__field">
                    <span>Investment name <em className="add-entry-required">Required</em></span>
                    <input type="text" required value={investmentDraft.name} onChange={(event) => updateInvestmentDraft("name", event.target.value)} placeholder="Municipal bond fund" autoFocus />
                  </label>
                  <label className="income-entry-panel__field">
                    <span>Account <em className="add-entry-required">Required</em></span>
                    <select required value={investmentDraft.account} onChange={(event) => event.target.value === "__add_new__" ? openQuickAdd("account") : updateInvestmentDraft("account", event.target.value)}>
                      <option value="">Select account</option>
                      {accountOptions.filter(Boolean).map((account) => <option key={account} value={account}>{account}</option>)}
                      <option value="__add_new__">＋ Add new account…</option>
                    </select>
                  </label>
                  <label className="income-entry-panel__field">
                    <span>Asset ID / ticker <em className="add-entry-required">Required</em></span>
                    <input type="text" required value={investmentDraft.symbol} onChange={(event) => updateInvestmentDraft("symbol", event.target.value)} placeholder="MUB" />
                    {reusesDifferentExistingAsset && <small>This Asset ID already exists. The row will use its existing Asset record.</small>}
                  </label>
                  <label className="income-entry-panel__field">
                    <span>Investment amount <em className="add-entry-required">Required</em></span>
                    <div className="income-entry-panel__money-input">
                      <span aria-hidden="true">$</span>
                      <MoneyInput value={investmentDraft.amount} onChange={(value) => updateInvestmentDraft("amount", Math.max(0, toNumber(value)))} ariaLabel="Investment amount" />
                    </div>
                  </label>
                  <label className="income-entry-panel__field">
                    <span>Dividend / annual return % <em className="add-entry-required">Required</em></span>
                    <input type="number" required min="0" step="0.01" value={investmentDraft.dividendPercent} onChange={(event) => updateInvestmentDraft("dividendPercent", event.target.value)} />
                  </label>
                  <label className="income-entry-panel__field">
                    <span>Asset type / class <em className="add-entry-required">Required</em></span>
                    <select required value={investmentDraft.assetType} onChange={(event) => { if (event.target.value === "__add_new__") openQuickAdd("assetType"); else { updateInvestmentDraft("assetType", event.target.value); updateInvestmentDraft("assetClass", event.target.value); } }}>
                      {categoryOptions.filter((type) => !isIncomeAssetType(type)).map((type) => <option key={type} value={type}>{type}</option>)}
                      <option value="__add_new__">＋ Add new asset type…</option>
                    </select>
                  </label>
                  <label className="income-entry-panel__field">
                    <span>Tax treatment <em className="add-entry-required">Required</em></span>
                    <select required value={investmentDraft.taxTreatment} onChange={(event) => event.target.value === "__add_new__" ? openQuickAdd("taxTreatment") : updateInvestmentDraft("taxTreatment", event.target.value)}>
                      <option value="">Select tax treatment</option>
                      {taxTreatmentOptions.filter(Boolean).map((treatment) => <option key={treatment} value={treatment}>{treatment}</option>)}
                      <option value="__add_new__">＋ Add new tax treatment…</option>
                    </select>
                  </label>
                </div>
                <details className="add-investment-optional">
                  <summary><span>Optional details</span><small>Dividend details and description</small></summary>
                  <div className="add-investment-form-grid">
                    <label className="income-entry-panel__field">
                      <span>Ex-dividend date <em className="add-entry-optional">Optional</em></span>
                      <input type="date" value={investmentDraft.exDividend} onChange={(event) => updateInvestmentDraft("exDividend", event.target.value)} />
                    </label>
                    <label className="income-entry-panel__field">
                      <span>Dividend payout schedule <em className="add-entry-optional">Optional</em></span>
                      <input type="text" value={investmentDraft.divPayout} onChange={(event) => updateInvestmentDraft("divPayout", event.target.value)} placeholder="Monthly, quarterly, annually..." />
                    </label>
                    <label className="income-entry-panel__field add-investment-form-grid__wide">
                      <span>Asset description <em className="add-entry-optional">Optional</em></span>
                      <input type="text" value={investmentDraft.assetDescription} onChange={(event) => updateInvestmentDraft("assetDescription", event.target.value)} placeholder="Defaults to the investment name" />
                    </label>
                  </div>
                </details>
                {!canCreateInvestment && <p className="add-entry-field-error">Complete every required field and enter an investment amount greater than zero.</p>}
                <div className="income-entry-panel__actions add-entry-panel__actions">
                  <button className="ghost-button" type="button" onClick={editTarget ? closeAddEntryDialog : () => setAddEntryKind(null)}>{editTarget ? "Cancel" : "Back"}</button>
                  <button className="primary-button" type="submit" disabled={!canCreateInvestment}>{editTarget ? "Save investment and asset" : "Add investment and asset"}</button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}
      {incomeTarget && createPortal(
        <div className="income-entry-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeIncomeDialog(); }}>
          <form className="income-entry-panel" role="dialog" aria-modal="true" aria-labelledby="income-entry-title" onSubmit={(event) => { event.preventDefault(); confirmCreateIncome(); }}>
            <div className="income-entry-panel__header">
              <div>
                <p className="eyebrow">Income source</p>
                <h3 id="income-entry-title">Add income</h3>
              </div>
              <button className="ghost-button ghost-button--compact" type="button" onClick={closeIncomeDialog}>Close</button>
            </div>
            <p className="income-entry-panel__copy">Enter the source and payment amount. We will create the matching Income asset and configure this row automatically.</p>
            <label className="income-entry-panel__field">
              <span>Name of income source</span>
              <input type="text" value={incomeSourceName} onChange={(event) => setIncomeSourceName(event.target.value)} placeholder="Salary, pension, rental income..." autoFocus />
            </label>
            <div className="income-entry-panel__amount-row">
              <label className="income-entry-panel__field">
                <span>Income amount</span>
                <div className="income-entry-panel__money-input">
                  <span aria-hidden="true">$</span>
                  <MoneyInput value={incomeAmount} onChange={(value) => setIncomeAmount(Math.max(0, toNumber(value)))} ariaLabel="Income amount" />
                </div>
              </label>
              <label className="income-entry-panel__field">
                <span>Paid</span>
                <select value={incomePeriod} onChange={(event) => setIncomePeriod(event.target.value as "annual" | "monthly")}>
                  <option value="annual">Annually</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
            </div>
            <div className="income-entry-panel__annualized" aria-live="polite">
              <span>Annual income</span>
              <strong>{formatCurrencyDetailed(annualizedIncomeAmount)}</strong>
            </div>
            <div className="income-entry-panel__actions">
              <button className="ghost-button" type="button" onClick={closeIncomeDialog}>Cancel</button>
              <button className="primary-button" type="submit" disabled={!canCreateIncome}>Add income source</button>
            </div>
          </form>
        </div>,
        document.body
      )}
      {rowActionMenu && createPortal(
        <div
          className="row-action-popover investment-row-action-popover"
          role="toolbar"
          aria-label={`Actions for ${rowActionMenu.row.description || "investment row"}`}
          style={{ left: rowActionMenu.left, top: rowActionMenu.top }}
          onMouseEnter={cancelRowActionClose}
          onMouseLeave={scheduleRowActionClose}
        >
          <button className="row-delete-button" type="button" title="Delete row" aria-label={`Delete ${rowActionMenu.row.description || "investment row"}`} onClick={() => { const row = rowActionMenu.row; setRowActionMenu(null); onRemove(row.id); }}><RowActionIcon name="delete" /></button>
          <button className="row-edit-button" type="button" title="Edit row" aria-label={`Edit ${rowActionMenu.row.description || "investment row"}`} onClick={() => { const row = rowActionMenu.row; setRowActionMenu(null); openEditEntryDialog(row); }}><RowActionIcon name="edit" /></button>
          <button className="row-split-button" type="button" title="Split row" aria-label={`Split ${rowActionMenu.row.description || "investment row"}`} onClick={() => { const row = rowActionMenu.row; setRowActionMenu(null); openSplitDialog(row); }}><RowActionIcon name="split" /></button>
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
              const hasDifferentWhatIfAsset = normalizeLookupKey(row.newSymbol) !== "" && normalizeLookupKey(row.newSymbol) !== normalizeLookupKey(row.symbol);
              const investmentCells = {
                move: <td key="move" className="drag-handle-cell"><div className="investment-row-actions investment-row-actions--anchor" onMouseEnter={(event) => openRowActionMenu(row, event.currentTarget)} onMouseLeave={scheduleRowActionClose}><button className="drag-handle" type="button" draggable title="Drag row" aria-label={`Move ${row.description || "investment row"}`} onDragStart={(event) => handleDragStart(event, row.id)} onDragEnd={handleDragEnd}>::</button></div></td>,
                row: <td key="row" className="sheet-row-cell"><div className="readonly-cell readonly-cell--row-id">{row.spreadsheetRowNumber ?? ""}</div></td>,
                included: <td key="included" className="checkbox-cell checkbox-cell--included"><input type="checkbox" checked={row.includeIncome} onChange={(event) => onChange(row.id, "includeIncome", event.target.checked)} aria-label={`Included: ${row.description || "investment row"}`} /></td>,
                account: <td key="account"><AccountSelect value={row.account} options={accountOptions} excludedFromAfterTaxIncome={excludedAfterTaxAccountNames.has(normalizeLookupKey(row.account))} onChange={(value) => onChange(row.id, "account", value)} onAddIncome={() => openIncomeDialog(row)} onJumpToAccount={onJumpToAccount} ariaLabel={`Account for ${row.description || "investment row"}`} /></td>,
                symbol: <td key="symbol"><div className="investment-asset-cell"><AssetSelect value={row.symbol} options={symbolOptions} accountTaxStatus={rowTaxStatus} tickerMap={tickerMap} stateCode={stateCode} onChange={(value) => onChange(row.id, "symbol", value)} onJumpToAsset={onJumpToAsset} ariaLabel={`Asset for ${row.description || row.account || "investment row"}`} />{derived?.incomeItem && <span className="income-row-badge">Income</span>}</div></td>,
                normalPercent: <td key="normalPercent"><div className="readonly-cell">{derived?.incomeItem ? "N.A." : formatPercent(derived?.currentPercent || 0)}</div></td>,
                amount: <td key="amount">{derived?.incomeItem ? <div className="readonly-cell readonly-cell--text">N.A.</div> : <MoneyInput value={row.totalInvestment} onChange={(value) => onChange(row.id, "totalInvestment", value)} ariaLabel={`Total investment for ${row.description || row.account || "investment row"}`} />}</td>,
                year: <td key="year">{derived?.incomeItem ? <MoneyInput value={row.yearlyIncome} onChange={(value) => onChange(row.id, "yearlyIncome", value)} ariaLabel={`Yearly income for ${row.description || row.account || "investment row"}`} /> : <div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.yearlyIncome || 0)}</div>}</td>,
                month: <td key="month">{derived?.incomeItem ? <MoneyInput value={derived.monthlyIncome || 0} onChange={(value) => onChange(row.id, "yearlyIncome", String(toNumber(value) * 12))} ariaLabel={`Monthly income for ${row.description || row.account || "investment row"}`} /> : <div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.monthlyIncome || 0)}</div>}</td>,
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
                override: <td key="override" className="checkbox-cell investment-column--override">{derived?.incomeItem ? <div className="readonly-cell readonly-cell--text">N.A.</div> : <input type="checkbox" checked={row.overrideProposal} onChange={(event) => onChange(row.id, "overrideProposal", event.target.checked)} />}</td>,
                overrideSymbol: <td key="overrideSymbol" className={`investment-column--override ${hasDifferentWhatIfAsset ? "investment-column--what-if-different" : ""}`.trim()}>{derived?.incomeItem ? <div className="readonly-cell readonly-cell--text">N.A.</div> : <div className="what-if-symbol-cell"><AssetSelect value={row.newSymbol || row.symbol} options={symbolOptions} accountTaxStatus={rowTaxStatus} tickerMap={tickerMap} stateCode={stateCode} resetToValue={hasDifferentWhatIfAsset ? row.symbol : undefined} onChange={(value) => onChange(row.id, "newSymbol", value)} onJumpToAsset={onJumpToAsset} ariaLabel={`What-If asset for ${row.description || row.account || "investment row"}`} />{hasDifferentWhatIfAsset && row.overrideProposal && <span className="what-if-overridden-badge">Overridden</span>}</div>}</td>,
                overridePercent: <td key="overridePercent" className="investment-column--override"><div className="readonly-cell">{derived?.incomeItem ? "N.A." : formatPercent(derived?.newPercent || 0)}</div></td>,
                usePercent: <td key="usePercent"><div className="readonly-cell">{derived?.incomeItem ? "N.A." : formatPercent(derived?.effectivePercent || 0)}</div></td>,
                useSymbol: <td key="useSymbol"><div className="readonly-cell readonly-cell--text">{derived?.effectiveSymbol || ""}</div></td>,
                extraData: <td key="extraData"><div className="readonly-cell readonly-cell--money">{formatGridCurrency(derived?.extraData || 0)}</div></td>,
              } satisfies Record<InvestmentColumnId, ReactElement>;
              return (
                <tr
                  key={row.id}
                  data-investment-id={row.id}
                  className={`${getDragRowClassName(row)} ${selectedIdSet.has(row.id) ? "investment-row--selected" : ""} ${highlightedFinderRowId === row.id ? "investment-row--finder-target" : ""}`}
                  onDragOver={(event) => handleDragOver(event, row.id)}
                  onDrop={(event) => handleDrop(event, row.id)}
                >
                  {visibleInvestmentColumns.map((column) => withInvestmentColumnClass(investmentCells[column.id], column.id))}
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
                account: <th key="account" className={`${investmentColumnClassName("account")} investment-total-row__label`} scope="row" title="Included totals">Totals</th>,
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

function PublicReportStatus({ title, message }: { title: string; message: string }) {
  return (
    <main className="public-report-status">
      <div className="public-report-status__card">
        <AfterTaxUSLogo />
        <p className="summary-report-page__eyebrow">Public scenario report</p>
        <h1>{title}</h1>
        <p>{message}</p>
        <a href={PUBLIC_SITE_ORIGIN}>Open AfterTax US</a>
      </div>
    </main>
  );
}

function SummaryReportStandalone({ payload }: { payload: SummaryReportPayload }) {
  const [plainTextScenario, setPlainTextScenario] = useState<{ name: string; text: string } | null>(null);
  const [plainTextCopied, setPlainTextCopied] = useState(false);
  const buildScenarioPlainText = (scenario: SummaryReportScenario) => {
    const stateCode = scenario.stateCode || payload.stateCode;
    const filingStatus = scenario.filingStatus || payload.filingStatus;
    const localTaxText = scenario.localTax > 0 ? `, ${formatCurrencyDetailed(scenario.localTax)} local` : "";
    return `${scenario.name} (${filingStatusLabels[filingStatus]}, ${stateCode}): ${formatCurrencyDetailed(scenario.income)} annual income, including ${formatCurrencyDetailed(scenario.investmentIncome)} of investment income. Estimated tax is ${formatCurrencyDetailed(scenario.totalTax)} (${formatCurrencyDetailed(scenario.federalTax)} federal, ${formatCurrencyDetailed(scenario.stateTax)} state${localTaxText}), for a ${formatPercent(scenario.effectiveTaxRate)} effective rate and ${scenario.marginalTaxRateLabel} marginal rate. Estimated after-tax income: ${formatCurrencyDetailed(scenario.afterTaxIncome)}. Planning estimate; actual results depend on deductions, credits, and other tax details.`;
  };
  const openScenarioPlainText = (scenario: SummaryReportScenario) => {
    setPlainTextCopied(false);
    setPlainTextScenario({ name: scenario.name, text: buildScenarioPlainText(scenario) });
  };
  const copyScenarioPlainText = async () => {
    if (!plainTextScenario) return;
    try {
      await navigator.clipboard.writeText(plainTextScenario.text);
      setPlainTextCopied(true);
    } catch {
      setPlainTextCopied(false);
    }
  };
  return (
    <div className="summary-report-page summary-scenarios-page">
      <header className="summary-scenarios-page__header">
        <div className="summary-scenarios-page__brand">
          <AfterTaxUSMark idSuffix="summary-scenarios" />
          <div>
            <strong>AfterTax US</strong>
            <span>Scenario report</span>
          </div>
        </div>
        <div className="summary-scenarios-page__generated">
          <span>Updated</span>
          <strong>{new Date(payload.generatedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</strong>
        </div>
      </header>

      <main className="summary-scenarios-page__main">
        <section className="summary-scenarios-page__intro">
          <p className="summary-report-page__eyebrow">Tax scenario summary</p>
          <h1>{payload.reportName}</h1>
          <p>
            {payload.scenarios.length} saved {payload.scenarios.length === 1 ? "scenario" : "scenarios"}. Each scenario reflects the workbook values when it was added. Amounts are annual planning estimates from the 2025 model.
          </p>
        </section>

        <section className="summary-scenario-list" aria-label="Tax scenarios">
          {payload.scenarios.map((scenario, index) => {
            const otherOrdinaryIncome = Math.max(scenario.ordinaryIncome - scenario.wages, 0);
            const scenarioStateCode = scenario.stateCode || payload.stateCode;
            const scenarioLocalityName = scenario.localityName || payload.localityName || "Local tax";
            const scenarioFilingStatus = scenario.filingStatus || payload.filingStatus;
            return (
              <article className="summary-scenario-card" id={`scenario-${scenario.id}`} key={scenario.id}>
                <div className="summary-scenario-card__number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
                <div className="summary-scenario-card__content">
                  <div className="summary-scenario-card__heading">
                    <div>
                      <div className="summary-scenario-card__title-line">
                        <h2>{scenario.name}</h2>
                        <button className="summary-scenario-card__plain-text-button" type="button" onClick={() => openScenarioPlainText(scenario)}>Plain-text summary</button>
                        <span>{scenarioStateCode} · {filingStatusLabels[scenarioFilingStatus]}</span>
                      </div>
                      <p>{scenario.description}</p>
                    </div>
                    <div className="summary-scenario-card__headline">
                      <span>Total estimated tax</span>
                      <strong>{formatCurrencyDetailed(scenario.totalTax)}</strong>
                      <small>{formatPercent(scenario.effectiveTaxRate)} of annual income</small>
                    </div>
                  </div>

                  <div className="summary-scenario-card__facts" aria-label={`${scenario.name} income composition`}>
                    <div><span>Annual income</span><strong>{formatCurrencyDetailed(scenario.income)}</strong></div>
                    <div><span>W-2 wages</span><strong>{formatCurrencyDetailed(scenario.wages)}</strong></div>
                    <div><span>Other ordinary income</span><strong>{formatCurrencyDetailed(otherOrdinaryIncome)}</strong></div>
                    <div><span>Preferred income / dividends</span><strong>{formatCurrencyDetailed(scenario.preferredIncome)}</strong></div>
                    <div><span>Investment income</span><strong>{formatCurrencyDetailed(scenario.investmentIncome)}</strong></div>
                  </div>

                  <div className="summary-scenario-card__taxes" aria-label={`${scenario.name} tax breakdown`}>
                    <div><span>Federal tax and payroll</span><strong>{formatCurrencyDetailed(scenario.federalTax)}</strong></div>
                    <div><span>{scenarioStateCode} tax and payroll</span><strong>{formatCurrencyDetailed(scenario.stateTax)}</strong></div>
                    <div><span>{scenarioLocalityName}</span><strong>{formatCurrencyDetailed(scenario.localTax)}</strong></div>
                    <div className="summary-scenario-card__after-tax"><span>After-tax income</span><strong>{formatCurrencyDetailed(scenario.afterTaxIncome)}</strong></div>
                    <div><span>Marginal rate</span><strong>{scenario.marginalTaxRateLabel}</strong></div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <footer className="summary-scenarios-page__footer">
          <p>Figures are estimates and do not include every credit, phaseout, deduction limit, or jurisdiction-specific rule.</p>
          <a href="https://www.aftertaxus.com/">See your own scenario</a>
        </footer>
      </main>
      {plainTextScenario && createPortal(
        <div className="scenario-plain-text-popup__backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPlainTextScenario(null); }}>
          <section className="scenario-plain-text-popup" role="dialog" aria-modal="true" aria-labelledby="scenario-plain-text-title">
            <header>
              <div><span>Ready to paste</span><h2 id="scenario-plain-text-title">{plainTextScenario.name}</h2></div>
              <button type="button" onClick={() => setPlainTextScenario(null)} aria-label="Close plain-text summary">×</button>
            </header>
            <textarea readOnly value={plainTextScenario.text} rows={8} onFocus={(event) => event.currentTarget.select()} aria-label="Plain-text tax implications" />
            <div className="scenario-plain-text-popup__actions">
              <small>{plainTextCopied ? "Copied to clipboard." : "Plain text formatted for forums and message boards."}</small>
              <button className="primary-button" type="button" onClick={() => void copyScenarioPlainText()}>{plainTextCopied ? "Copied" : "Copy text"}</button>
            </div>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function App() {
  const authEnabled = isCognitoEnabled();
  const [authState, setAuthState] = useState<AuthState>(readStoredAuth);
  const [authEntryMode, setAuthEntryMode] = useState<AuthEntryMode>("signIn");
  const [isAuthEntryOpen, setIsAuthEntryOpen] = useState(false);
  const [signInPublicUsername, setSignInPublicUsername] = useState(readStoredPublicUsername);
  const [signInPublicUsernameError, setSignInPublicUsernameError] = useState("");
  const signInUsernameInputRef = useRef<HTMLInputElement>(null);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isClearAllDialogOpen, setIsClearAllDialogOpen] = useState(false);
  const [clearAllConfirmation, setClearAllConfirmation] = useState("");
  const [clearAllReferenceMode, setClearAllReferenceMode] = useState<"keep" | "clean">("keep");
  const [clearAllError, setClearAllError] = useState("");
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [settingsUsernameDraft, setSettingsUsernameDraft] = useState("");
  const [settingsUsernameError, setSettingsUsernameError] = useState("");
  const [isUsernameRequestPending, setIsUsernameRequestPending] = useState(false);
  const settingsUsernameInputRef = useRef<HTMLInputElement>(null);
  const usernameClaimAttemptRef = useRef("");
  const summaryReportRefreshRequestRef = useRef(0);
  const [activeTab, setActiveTab] = useState<TabKey>("investments");
  const [focusGrid, setFocusGrid] = useState(false);
  const [taxThermometerMode, setTaxThermometerMode] = useState<TaxThermometerMode>(() => loadTaxThermometerMode("allocation"));
  const [showThermometerPanel, setShowThermometerPanel] = useState(true);
  const [highlightedAccountRowId, setHighlightedAccountRowId] = useState<number | null>(null);
  const [highlightedAssetRowId, setHighlightedAssetRowId] = useState<number | null>(null);
  const [highlightedTaxTreatmentRowId, setHighlightedTaxTreatmentRowId] = useState<number | null>(null);
  const [investmentFilters, setInvestmentFilters] = useState<InvestmentFilters>({ account: "", category: "", asset: "" });
  const [investmentSort, setInvestmentSort] = useState<InvestmentSort>({ tableId: "investments", column: "", direction: "asc" });
  const [selectedInvestmentIds, setSelectedInvestmentIds] = useState<number[]>([]);
  const [showInvestmentRowNumbers, setShowInvestmentRowNumbers] = useState(false);
  const [isWhatIfActive, setIsWhatIfActive] = useState(false);
  const [isFederalTaxWhatIfOpen, setIsFederalTaxWhatIfOpen] = useState(false);
  const [isStateTaxWhatIfOpen, setIsStateTaxWhatIfOpen] = useState(false);
  const [isFederalTaxOutputsOpen, setIsFederalTaxOutputsOpen] = useState(false);
  const [isStateTaxOutputsOpen, setIsStateTaxOutputsOpen] = useState(false);
  const [taxSummaryKind, setTaxSummaryKind] = useState<TaxSummaryKind | null>(null);
  const [summaryReportDialogMode, setSummaryReportDialogMode] = useState<"create" | "manage" | "publish" | "published" | null>(null);
  const [summaryReportDestination, setSummaryReportDestination] = useState<"new" | "existing">("new");
  const [summaryReportName, setSummaryReportName] = useState("");
  const [summaryScenarioName, setSummaryScenarioName] = useState("Current workbook");
  const [summaryScenarioDescription, setSummaryScenarioDescription] = useState("");
  const [selectedSummaryLandingPageId, setSelectedSummaryLandingPageId] = useState("");
  const [summaryPublishScenarioIds, setSummaryPublishScenarioIds] = useState<string[]>([]);
  const [summaryPublishDescriptions, setSummaryPublishDescriptions] = useState<Record<string, string>>({});
  const [summaryReportDialogError, setSummaryReportDialogError] = useState("");
  const [summaryReportRenameDrafts, setSummaryReportRenameDrafts] = useState<Record<string, string>>({});
  const [summaryScenarioDrafts, setSummaryScenarioDrafts] = useState<Record<string, SummaryScenarioDraft>>({});
  const [summaryScenarioPendingDeleteKey, setSummaryScenarioPendingDeleteKey] = useState("");
  const [summaryReportBusyId, setSummaryReportBusyId] = useState("");
  const [summaryPublishedUrl, setSummaryPublishedUrl] = useState("");
  const [publishedReportPlainText, setPublishedReportPlainText] = useState<{ name: string; text: string } | null>(null);
  const [publishedReportPlainTextCopied, setPublishedReportPlainTextCopied] = useState(false);
  const [isSummaryReportListLoading, setIsSummaryReportListLoading] = useState(false);
  const [scenarioLandingPages, setScenarioLandingPages] = useState<ScenarioLandingPage[]>([]);
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
  const [localTaxSettings, setLocalTaxSettings] = useState(initialLocalTaxSettings);
  const [plannerSettings, setPlannerSettings] = useState(initialPlannerSettings);
  const [uiSettings, setUiSettings] = useState(initialUiSettings);
  const [taxConfig, setTaxConfig] = useState<TaxConfigResult | null>(null);
  const [taxPlanResult, setTaxPlanResult] = useState<TaxPlanResult | null>(null);
  const [taxPlanWithoutInvestmentsResult, setTaxPlanWithoutInvestmentsResult] = useState<TaxPlanResult | null>(null);
  const stateTaxProfiles = taxConfig?.states || [];
  const localTaxProfiles = taxConfig?.localities || fallbackLocalTaxProfiles;
  const selectedStateCode = normalizeStateCode(stateSettings.stateCode);
  const selectedStateName = stateNameByCode[selectedStateCode] || selectedStateCode;
  const selectedStateTaxProfile = stateTaxProfiles.find((profile) => profile.code === selectedStateCode) || { ...fallbackStateTaxProfile, code: selectedStateCode, name: selectedStateName };
  const selectedStateBrackets = stateTaxBracketsForProfile(selectedStateTaxProfile, federalSettings.filingStatus);
  const selectedStateHasIncomeTax = selectedStateTaxProfile.single.length > 0 || selectedStateTaxProfile.mfj.length > 0;
  const [isSheetPanelOpen, setIsSheetPanelOpen] = useState(false);
  const [federalResult, setFederalResult] = useState<TaxResult | null>(null);
  const [stateResult, setStateResult] = useState<TaxResult | null>(null);
  const [localResult, setLocalResult] = useState<TaxResult | null>(null);
  const [federalError, setFederalError] = useState<string | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [storageState, setStorageState] = useState<SaveState>("loading");
  const [mcpTokenMessage, setMcpTokenMessage] = useState("");
  const [isCreatingMcpToken, setIsCreatingMcpToken] = useState(false);
  const [isTopbarMenuOpen, setIsTopbarMenuOpen] = useState(false);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [summaryReportPayload, setSummaryReportPayload] = useState<SummaryReportPayload | null>(readSummaryReportFromUrl);
  const [publicReportLoadState, setPublicReportLoadState] = useState<"idle" | "loading" | "error">(() => !readSummaryReportFromUrl() && readPublicReportSlugFromUrl() ? "loading" : "idle");
  const [publicReportLoadError, setPublicReportLoadError] = useState("");
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
  const latestWorkbookUpdatedAt = useRef<string | null>(null);
  const latestWorkbookRefreshMarker = useRef<string | null>(null);
  const suppressNextAutosave = useRef(false);
  const historyRef = useRef<{ past: string[]; present: string; future: string[] }>({ past: [], present: "", future: [] });
  const historyInitialized = useRef(false);
  const isApplyingHistory = useRef(false);
  const skipNextHistoryRecord = useRef(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const authToken = authState.status === "signedIn" ? authState.tokens.idToken : undefined;
  const publicUsername = resolvePublicUsername(
    authState.status === "signedIn" ? authState.user : null,
    uiSettings.publicUsername
  );
  const requiresSignIn = authEnabled && authState.status !== "signedIn";
  const closeTaxSummary = useCallback(() => setTaxSummaryKind(null), []);
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
    localTaxSettings,
    plannerSettings,
    uiSettings: { investmentFavorites: uiSettings.investmentFavorites, selectedAssetIds: selectedInvestmentIds },
    isWhatIfActive,
  }), [investments, tickers, categories, taxTreatments, accounts, accountTaxTypes, accountTypes, federalSettings, stateSettings, localTaxSettings, plannerSettings, uiSettings.investmentFavorites, selectedInvestmentIds, isWhatIfActive]);
  const currentHistorySerialized = useMemo(() => JSON.stringify(currentHistorySnapshot), [currentHistorySnapshot]);
  const recordUndoCheckpoint = useCallback(() => {
    if (!hasLoadedStorage.current || isApplyingHistory.current) return;
    const history = historyRef.current;
    if (!historyInitialized.current) {
      history.present = currentHistorySerialized;
      historyInitialized.current = true;
      setHistoryVersion((version) => version + 1);
      return;
    }
    if (history.past.at(-1) !== currentHistorySerialized) {
      history.past.push(currentHistorySerialized);
      if (history.past.length > WORKBOOK_HISTORY_LIMIT) history.past.shift();
    }
    history.present = currentHistorySerialized;
    history.future = [];
    skipNextHistoryRecord.current = true;
    setHistoryVersion((version) => version + 1);
  }, [currentHistorySerialized]);
  const updateFederalSettingsUndoable = useCallback((updater: SetStateAction<FederalSettings>) => {
    recordUndoCheckpoint();
    setFederalSettings(updater);
  }, [recordUndoCheckpoint]);
  const updateStateSettingsUndoable = useCallback((updater: SetStateAction<StateSettings>) => {
    recordUndoCheckpoint();
    setStateSettings(updater);
  }, [recordUndoCheckpoint]);
  const updateLocalTaxSettingsUndoable = useCallback((updater: SetStateAction<LocalTaxSettings>) => {
    recordUndoCheckpoint();
    setLocalTaxSettings(updater);
  }, [recordUndoCheckpoint]);

  const resetHistoryTracking = useCallback(() => {
    historyRef.current = { past: [], present: "", future: [] };
    historyInitialized.current = false;
    isApplyingHistory.current = false;
    skipNextHistoryRecord.current = false;
    setHistoryVersion((version) => version + 1);
  }, []);

  const applyModelDataSnapshot = useCallback((snapshot: ModelDataSnapshot, suppressHistory = false) => {
    if (suppressHistory) isApplyingHistory.current = true;
    setInvestments(snapshot.investments);
    setTickers(snapshot.tickers);
    setCategories(snapshot.categories.map((category) => ({ ...category, includeInAllocation: category.includeInAllocation !== false })));
    setTaxTreatments(snapshot.taxTreatments.map((row, index) => workbookToTaxTreatmentRow(row as unknown as Record<string, unknown>, index)));
    setAccounts(snapshot.accounts);
    setAccountTaxTypes(snapshot.accountTaxTypes.map((row) => ({ ...row, includeInAllocation: row.includeInAllocation !== false })));
    setAccountTypes(mergeDefaultAccountTypes(snapshot.accountTypes.map((row) => ({ ...row, includeInAllocation: row.includeInAllocation !== false }))));
    setFederalSettings(normalizeFederalSettings(snapshot.federalSettings));
    setStateSettings(normalizeStateSettings(snapshot.stateSettings));
    setLocalTaxSettings(normalizeLocalTaxSettings(snapshot.localTaxSettings));
    setPlannerSettings(snapshot.plannerSettings);
    setUiSettings((current) => ({
      publicUsername: current.publicUsername,
      investmentFavorites: snapshot.uiSettings.investmentFavorites,
      selectedAssetIds: normalizeSelectedAssetIds(snapshot.uiSettings.selectedAssetIds),
      savedScenarios: current.savedScenarios,
      scenarioLibraryMigrated: current.scenarioLibraryMigrated,
      modelVersions: current.modelVersions,
      incomePrimaryPeriod: current.incomePrimaryPeriod,
      darkMode: current.darkMode,
      investmentWhatIfOpen: current.investmentWhatIfOpen,
      mcpRefresh: current.mcpRefresh,
    }));
    setSelectedInvestmentIds(normalizeSelectedAssetIds(snapshot.uiSettings.selectedAssetIds));
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
    if (!summaryReportPayload || !window.location.hash.startsWith("#scenario-")) return;
    let targetId = "";
    try {
      targetId = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [summaryReportPayload]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TAX_THERMOMETER_MODE_STORAGE_KEY, taxThermometerMode);
    } catch {
      // Continue without persistence when browser storage is unavailable.
    }
  }, [taxThermometerMode]);

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
    if (!isAuthEntryOpen && !isSettingsDialogOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAuthEntryOpen(false);
        setIsSettingsDialogOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isAuthEntryOpen, isSettingsDialogOpen]);

  useEffect(() => {
    let requestVersion = 0;
    const syncSummaryReport = () => {
      const currentRequest = ++requestVersion;
      const embeddedReport = readSummaryReportFromUrl();
      if (embeddedReport) {
        setSummaryReportPayload(embeddedReport);
        setPublicReportLoadState("idle");
        setPublicReportLoadError("");
        return;
      }
      const slug = readPublicReportSlugFromUrl();
      if (!slug) {
        setSummaryReportPayload(null);
        setPublicReportLoadState("idle");
        setPublicReportLoadError("");
        return;
      }
      setSummaryReportPayload(null);
      setPublicReportLoadState("loading");
      setPublicReportLoadError("");
      const legacySlug = readLegacyPublicReportSlugFromUrl();
      getPublicSummaryReport(slug)
        .catch((error) => legacySlug && legacySlug !== slug ? getPublicSummaryReport(legacySlug) : Promise.reject(error))
        .then((report) => {
          if (currentRequest !== requestVersion) return;
          const validatedPayload = decodeSummaryReportPayload(encodeSummaryReportPayload(report.payload));
          if (!validatedPayload) throw new Error("The public report data is invalid.");
          if (report.slug !== slug && report.slug !== legacySlug) {
            const routeUsername = readPublicReportUsernameFromUrl();
            window.history.replaceState({}, document.title, routeUsername ? new URL(buildPublicSummaryReportUrl(report.slug, routeUsername)).pathname : `/${report.slug}`);
          }
          setSummaryReportPayload(validatedPayload);
          setPublicReportLoadState("idle");
        })
        .catch((error: Error) => {
          if (currentRequest !== requestVersion) return;
          setPublicReportLoadState("error");
          setPublicReportLoadError(error.message || "This public scenario report is unavailable.");
        });
    };
    syncSummaryReport();
    window.addEventListener("popstate", syncSummaryReport);
    return () => {
      requestVersion += 1;
      window.removeEventListener("popstate", syncSummaryReport);
    };
  }, []);

  useEffect(() => {
    if (!summaryReportDialogMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !publishedReportPlainText) setSummaryReportDialogMode(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [publishedReportPlainText, summaryReportDialogMode]);

  useEffect(() => {
    if (!publishedReportPlainText) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPublishedReportPlainText(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [publishedReportPlainText]);

  useEffect(() => {
    if (!isTopbarMenuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (!topbarMenuRef.current?.contains(event.target as Node)) {
        setIsTopbarMenuOpen(false);
        setIsShareMenuOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsTopbarMenuOpen(false);
        setIsShareMenuOpen(false);
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
  const excludedAfterTaxAccountNames = useMemo(() => new Set(accounts
    .filter((row) => normalizeYesNo(row.includeInFreeCashflow) !== "yes")
    .map((row) => normalizeLookupKey(row.account))
    .filter(Boolean)), [accounts]);
  const jumpToAccountRow = useCallback((accountName: string) => {
    const accountKey = normalizeLookupKey(accountName);
    if (!accountKey) return;
    const account = accounts.find((row) => normalizeLookupKey(row.account) === accountKey);
    if (!account) return;
    setHighlightedAccountRowId(account.id);
    setActiveTab("accounts");
  }, [accounts]);
  const jumpToAssetRow = useCallback((assetSymbol: string) => {
    const assetKey = normalizeLookupKey(assetSymbol);
    if (!assetKey) return;
    const asset = tickers.find((row) => normalizeLookupKey(row.symbol) === assetKey);
    if (!asset) return;
    setHighlightedAssetRowId(asset.id);
    setActiveTab("tickers");
  }, [tickers]);
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
  const taxTreatmentMap = useMemo(() => Object.fromEntries(taxTreatments
    .map((row) => [normalizeLookupKey(row.label), row] as const)
    .filter(([label]) => Boolean(label))), [taxTreatments]);
  const taxTreatmentIssues = useMemo(() => taxTreatments.flatMap((row) => {
    const total = toNumber(row.ordinaryShare) + toNumber(row.preferredShare);
    const issues: Array<{ rowId: number; message: string }> = [];
    if (!String(row.label || "").trim()) issues.push({ rowId: row.id, message: `Row ${row.id}: treatment ID is required.` });
    if (total > 1.000001) issues.push({ rowId: row.id, message: `${row.label || `Row ${row.id}`}: federal ordinary and preferred shares exceed 100%.` });
    if (toNumber(row.ordinaryShare) < 0 || toNumber(row.preferredShare) < 0) issues.push({ rowId: row.id, message: `${row.label || `Row ${row.id}`}: federal shares cannot be negative.` });
    return issues;
  }), [taxTreatments]);
  const assetsWithUnmappedTaxTreatment = useMemo(() => tickers
    .filter((row) => String(row.symbol || "").trim() && !taxTreatmentMap[normalizeLookupKey(row.taxTreatment)]), [tickers, taxTreatmentMap]);
  const taxTreatmentIssueRowIds = useMemo(() => [...new Set(taxTreatmentIssues.map((issue) => issue.rowId))], [taxTreatmentIssues]);
  const cycleAssetErrorRow = useCallback((direction: "previous" | "next") => {
    if (assetsWithUnmappedTaxTreatment.length === 0) return;
    const currentIndex = assetsWithUnmappedTaxTreatment.findIndex((row) => row.id === highlightedAssetRowId);
    const nextIndex = direction === "next"
      ? (currentIndex >= 0 ? currentIndex + 1 : 0) % assetsWithUnmappedTaxTreatment.length
      : (currentIndex >= 0 ? currentIndex - 1 + assetsWithUnmappedTaxTreatment.length : assetsWithUnmappedTaxTreatment.length - 1) % assetsWithUnmappedTaxTreatment.length;
    setHighlightedAssetRowId(assetsWithUnmappedTaxTreatment[nextIndex].id);
    setActiveTab("tickers");
  }, [assetsWithUnmappedTaxTreatment, highlightedAssetRowId]);
  const cycleTaxTreatmentErrorRow = useCallback((direction: "previous" | "next") => {
    if (taxTreatmentIssueRowIds.length === 0) return;
    const currentIndex = taxTreatmentIssueRowIds.findIndex((id) => id === highlightedTaxTreatmentRowId);
    const nextIndex = direction === "next"
      ? (currentIndex >= 0 ? currentIndex + 1 : 0) % taxTreatmentIssueRowIds.length
      : (currentIndex >= 0 ? currentIndex - 1 + taxTreatmentIssueRowIds.length : taxTreatmentIssueRowIds.length - 1) % taxTreatmentIssueRowIds.length;
    setHighlightedTaxTreatmentRowId(taxTreatmentIssueRowIds[nextIndex]);
    setActiveTab("taxTreatment");
  }, [highlightedTaxTreatmentRowId, taxTreatmentIssueRowIds]);
  const categoryOptions = useMemo(() => {
    const values = categories
      .map((row) => String(row.name || "").trim())
      .filter(Boolean);
    const fromTickers = tickers
      .map((row) => String(row.category || "").trim())
      .filter(Boolean);
    return ["", ...new Set([...values, ...fromTickers])];
  }, [categories, tickers]);
  const assetTypeOptions = categoryOptions;
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
          const hasNewWhatIfAsset = normalizeLookupKey(nextSymbol) !== "" && normalizeLookupKey(nextSymbol) !== normalizeLookupKey(row.symbol);
          return {
            ...row,
            newSymbol: nextSymbol,
            overrideProposal: hasNewWhatIfAsset,
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

  const toggleInvestmentWhatIf = () => {
    if (!isWhatIfActive) {
      flushSync(() => {
        setInvestments((rows) =>
          rows.map((row) => {
            const nextSymbol = String(row.newSymbol || row.symbol || "").trim();
            if (!nextSymbol) return row;
            return {
              ...row,
              newSymbol: nextSymbol,
              newPercent: row.newPercent || overridePercentForSymbol(nextSymbol),
            };
          })
        );
      });
    }
    setIsWhatIfActive((current) => !current);
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
    const accountKey = normalizeLookupKey(row.account);
    const account = accountMap[accountKey];
    const isW2IncomeAccount = isW2AccountType(account?.accountType || inferAccountTypeFromAccountName(row.account));
    const assetType = String(effectiveTicker?.assetType || "");
    const incomeItem = isW2IncomeAccount || isIncomeAssetType(assetType) || (!assetType && Boolean(effectiveTicker?.incomeItem)) || (totalInvestment === 0 && importedYearlyIncome !== 0);
    const yearlyIncome = incomeItem ? importedYearlyIncome : totalInvestment * effectivePercent;
    const monthlyIncome = yearlyIncome / 12;
    const filteredIncome = row.includeIncome ? yearlyIncome : 0;
    const includedTotal = row.includeIncome && !incomeItem ? totalInvestment : 0;
    const includeInAfterTaxIncome = normalizeYesNo(account?.includeInFreeCashflow ?? "yes") === "yes";
    const displayYearlyIncome = includeInAfterTaxIncome ? yearlyIncome : 0;
    const displayMonthlyIncome = displayYearlyIncome / 12;
    const displayFilteredIncome = row.includeIncome ? displayYearlyIncome : 0;
    const accountTypeTaxStatus = inferAccountTypeTaxStatus(account?.accountType || inferAccountTypeFromAccountName(row.account));
    const taxStatus = String(isW2IncomeAccount ? "taxable" : accountTaxStatusByName[accountKey] || accountTypeTaxStatus || account?.taxStatus || "taxable").toLowerCase();
    const accountAllowsCurrentTaxableIncome = accountStatusAllowsCurrentTaxableIncome(taxStatus, incomeItem, isW2IncomeAccount);
    const currentTaxTreatment = String(currentTicker?.taxTreatment || "income").toLowerCase();
    const proposedTaxTreatment = String(proposedTicker?.taxTreatment || "income").toLowerCase();
    const taxTreatment = isW2IncomeAccount ? "income" : String(effectiveTicker?.taxTreatment || "income").toLowerCase();
    const taxTreatmentRule = taxTreatmentMap[normalizeLookupKey(taxTreatment)];
    const investmentType = String(effectiveTicker?.category || "").toLowerCase();
    const extraData = toNumber(effectiveTicker?.extraData || 0);
    const taxableMonthlyBase = accountAllowsCurrentTaxableIncome && row.includeIncome ? filteredIncome / 12 : 0;
    const displayTaxableMonthlyBase = accountAllowsCurrentTaxableIncome && row.includeIncome && includeInAfterTaxIncome ? displayFilteredIncome / 12 : 0;
    const ordinaryMonthly = fedTaxAdjust(taxableMonthlyBase, taxTreatment, false, taxTreatmentRule);
    const preferredMonthly = fedTaxAdjust(taxableMonthlyBase, taxTreatment, true, taxTreatmentRule);
    const stateMonthly = stateTaxAdjust(taxableMonthlyBase, taxTreatment, selectedStateCode, taxTreatmentRule);
    const investmentIncome = !incomeItem ? filteredIncome : 0;
    const displayInvestmentIncome = !incomeItem ? displayFilteredIncome : 0;
    const investmentOrdinaryMonthly = !incomeItem ? ordinaryMonthly : 0;
    const investmentPreferredMonthly = !incomeItem ? preferredMonthly : 0;
    const investmentStateMonthly = !incomeItem ? stateMonthly : 0;
    const displayOrdinaryMonthly = fedTaxAdjust(displayTaxableMonthlyBase, taxTreatment, false, taxTreatmentRule);
    const displayPreferredMonthly = fedTaxAdjust(displayTaxableMonthlyBase, taxTreatment, true, taxTreatmentRule);
    const displayStateMonthly = stateTaxAdjust(displayTaxableMonthlyBase, taxTreatment, selectedStateCode, taxTreatmentRule);
    const w2Income = isW2IncomeAccount ? filteredIncome : 0;
    const nonInvestmentIncome = isW2IncomeAccount || ["social-security", "non investment income"].includes(investmentType) ? filteredIncome : 0;
    const displayNonInvestmentIncome = includeInAfterTaxIncome ? nonInvestmentIncome : 0;
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
      investmentIncome,
      displayInvestmentIncome,
      investmentOrdinaryMonthly,
      investmentPreferredMonthly,
      investmentStateMonthly,
      niitIncome: taxTreatmentRule?.niitIncluded === false || incomeItem ? 0 : filteredIncome,
      displayYearlyIncome,
      displayMonthlyIncome,
      displayFilteredIncome,
      includedTotal,
      taxStatus,
      taxTreatment,
      stateTaxRule: taxTreatmentRule?.stateRule || defaultTaxTreatmentRule(taxTreatment).stateRule,
      localTaxCategory: taxTreatmentRule?.localCategory || "",
      currentAssetTaxTone: getAssetTaxTone(taxStatus, currentTaxTreatment, selectedStateCode),
      proposedAssetTaxTone: getAssetTaxTone(taxStatus, proposedTaxTreatment, selectedStateCode),
      investmentType,
      ordinaryMonthly,
      preferredMonthly,
      stateMonthly,
      displayOrdinaryMonthly,
      displayPreferredMonthly,
      displayStateMonthly,
      w2Income,
      nonTaxableMonthly: !accountAllowsCurrentTaxableIncome && row.includeIncome ? monthlyIncome : 0,
      nonInvestmentIncome,
      displayNonInvestmentIncome,
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
  }), [investments, tickerMap, accountMap, accountTaxStatusByName, taxTreatmentMap, isWhatIfActive, selectedStateCode]);

  const portfolioAllocationRows = useMemo(() => categories
    .filter((category) => category.includeInAllocation !== false && String(category.name || "").trim())
    .map((category) => {
      const categoryKey = normalizeLookupKey(category.name);
      return {
        label: category.name,
        amount: derivedRows.reduce((sum, row) => sum + (normalizeLookupKey(row.investmentType) === categoryKey ? Math.max(row.includedTotal, 0) : 0), 0),
      };
    }), [categories, derivedRows]);

  const accountTaxAllocationRows = useMemo(() => accountTaxTypes
    .filter((category) => category.includeInAllocation !== false && String(category.taxStatus || "").trim())
    .map((category) => {
      const categoryKey = normalizeLookupKey(category.taxStatus);
      return {
        label: category.taxStatus,
        amount: derivedRows.reduce((sum, row) => sum + (normalizeLookupKey(row.taxStatus) === categoryKey ? Math.max(row.includedTotal, 0) : 0), 0),
      };
    }), [accountTaxTypes, derivedRows]);

  const accountTypeAllocationRows = useMemo(() => accountTypes
    .filter((type) => type.includeInAllocation !== false && String(type.name || "").trim())
    .map((type) => {
      const typeKey = normalizeLookupKey(type.name);
      return {
        label: type.name,
        amount: derivedRows.reduce((sum, row) => {
          const assignedType = String(accountMap[normalizeLookupKey(row.account)]?.accountType || "").trim();
          const inferredType = inferAccountTypeFromAccountName(`${assignedType} ${row.account}`);
          const candidateKeys = [assignedType, inferredType].map(normalizeLookupKey).filter(Boolean);
          const matchesType = candidateKeys.some((candidateKey) => candidateKey === typeKey || candidateKey.includes(typeKey) || typeKey.includes(candidateKey));
          return sum + (matchesType ? Math.max(row.includedTotal, 0) : 0);
        }, 0),
      };
    }), [accountTypes, derivedRows, accountMap]);

  const taxTreatmentAllocationRows = useMemo(() => taxTreatments
    .filter((treatment) => treatment.includeInAllocation !== false && String(treatment.label || "").trim())
    .map((treatment) => {
      const treatmentKey = normalizeLookupKey(treatment.label);
      return {
        label: treatment.label,
        amount: derivedRows.reduce((sum, row) => sum + (normalizeLookupKey(row.taxTreatment) === treatmentKey ? Math.max(row.includedTotal, 0) : 0), 0),
      };
    }), [taxTreatments, derivedRows]);

  const flows = useMemo(() => derivedRows.reduce((acc, row) => {
    acc.totalInvestmentAmount += row.includedTotal;
    acc.totalIncome += row.filteredIncome;
    acc.investmentIncome += row.investmentIncome;
    acc.displayInvestmentIncome += row.displayInvestmentIncome;
    acc.investmentFederalOrdinary += row.investmentOrdinaryMonthly * 12;
    acc.investmentFederalPreferred += row.investmentPreferredMonthly * 12;
    acc.investmentStateTaxable += row.investmentStateMonthly * 12;
    acc.niitIncome += row.niitIncome;
    acc.displayIncome += row.displayFilteredIncome;
    acc.federalOrdinary += row.ordinaryMonthly * 12;
    acc.federalPreferred += row.preferredMonthly * 12;
    acc.stateTaxable += row.stateMonthly * 12;
    acc.displayFederalOrdinary += row.displayOrdinaryMonthly * 12;
    acc.displayFederalPreferred += row.displayPreferredMonthly * 12;
    acc.displayStateTaxable += row.displayStateMonthly * 12;
    acc.w2Income += row.w2Income;
    acc.nonTaxableIncome += row.nonTaxableMonthly * 12;
    acc.nonInvestmentIncome += row.nonInvestmentIncome;
    acc.displayNonInvestmentIncome += row.displayNonInvestmentIncome;
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
  }, { totalInvestmentAmount: 0, totalIncome: 0, investmentIncome: 0, displayInvestmentIncome: 0, investmentFederalOrdinary: 0, investmentFederalPreferred: 0, investmentStateTaxable: 0, niitIncome: 0, displayIncome: 0, federalOrdinary: 0, federalPreferred: 0, stateTaxable: 0, displayFederalOrdinary: 0, displayFederalPreferred: 0, displayStateTaxable: 0, w2Income: 0, nonTaxableIncome: 0, nonInvestmentIncome: 0, displayNonInvestmentIncome: 0, muniIncome: 0, cash: 0, stocks: 0, preferredStock: 0, bonds: 0, muniBond: 0, businessDevelopment: 0, coveredCall: 0, realEstate: 0, bitcoin: 0 }), [derivedRows]);
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
  const extraW2WhatIfTotal = sumW2TaxWhatIfItems(federalSettings.extraOrdinaryItems);
  const effectiveExtraOrdinaryIncome = isFederalTaxWhatIfOpen ? extraOrdinaryWhatIfTotal : 0;
  const effectiveExtraPreferredIncome = isFederalTaxWhatIfOpen ? extraPreferredWhatIfTotal : 0;
  const effectiveW2Income = flows.w2Income + (isFederalTaxWhatIfOpen ? extraW2WhatIfTotal : 0);
  const w2PayrollTax = taxPlanResult?.payroll || {
    federal: { socialSecurity: 0, medicare: 0, additionalMedicare: 0, total: 0 },
    state: { stateCode: selectedStateCode, components: [], total: 0 },
    total: 0,
  };

  const createIncomeForInvestment = (investmentId: number, input: IncomeEntryInput) => {
    const incomeAccountName = accounts.find((account) => normalizeLookupKey(account.account) === "income")?.account || "Income";
    const sourceName = input.sourceName.trim();
    const sourceKey = normalizeLookupKey(sourceName);
    const existingIncomeAsset = tickers.find((ticker) => normalizeLookupKey(ticker.symbol) === sourceKey && isIncomeAssetType(ticker.assetType));
    const usedAssetKeys = new Set(tickers.map((ticker) => normalizeLookupKey(ticker.symbol)));
    let assetSymbol = existingIncomeAsset?.symbol || sourceName;
    if (!existingIncomeAsset && usedAssetKeys.has(sourceKey)) {
      const baseSymbol = `${sourceName} income`;
      assetSymbol = baseSymbol;
      let suffix = 2;
      while (usedAssetKeys.has(normalizeLookupKey(assetSymbol))) {
        assetSymbol = `${baseSymbol} ${suffix}`;
        suffix += 1;
      }
    }
    recordUndoCheckpoint();
    setAccounts((current) => current.some((account) => normalizeLookupKey(account.account) === "income")
      ? current.map((account) => normalizeLookupKey(account.account) === "income"
          ? { ...account, accountType: "W2 income", taxStatus: "taxable", includeInFreeCashflow: "yes" }
          : account)
      : [...current, {
          id: Math.max(Date.now(), ...current.map((account) => account.id + 1)),
          account: incomeAccountName,
          accountType: "W2 income",
          taxStatus: "taxable",
          dividendAccrued: "no",
          includeInFreeCashflow: "yes",
        }]);
    setTickers((current) => current.some((ticker) => normalizeLookupKey(ticker.symbol) === normalizeLookupKey(assetSymbol) && isIncomeAssetType(ticker.assetType))
      ? current.map((ticker) => normalizeLookupKey(ticker.symbol) === normalizeLookupKey(assetSymbol) && isIncomeAssetType(ticker.assetType)
          ? { ...ticker, assetType: "Income", category: "non investment income", taxTreatment: "income", incomeItem: true, percentReturn: 0, description: sourceName }
          : ticker)
      : [...current, {
          id: Math.max(Date.now(), ...current.map((ticker) => ticker.id + 1)),
          symbol: assetSymbol,
          percentReturn: 0,
          assetType: "Income",
          category: "non investment income",
          taxTreatment: "income",
          incomeItem: true,
          extraData: 0,
          description: sourceName,
          exDividend: "",
          divPayout: "",
        }]);
    setInvestments((current) => {
      const incomeRow: InvestmentRow = {
        id: investmentId,
        description: sourceName,
        account: incomeAccountName,
        category: "non investment income",
        totalInvestment: 0,
        yearlyIncome: input.annualAmount,
        includeIncome: true,
        overrideProposal: false,
        symbol: assetSymbol,
        newSymbol: assetSymbol,
        newPercent: 0,
      };
      return current.some((row) => row.id === investmentId)
        ? current.map((row) => row.id === investmentId ? {
          ...row,
          ...incomeRow,
          id: row.id,
        } : row)
        : [...current, incomeRow];
    });
  };
  const editIncomeForInvestment = (investmentId: number, input: IncomeEntryInput) => {
    recordUndoCheckpoint();
    const targetRow = investments.find((row) => row.id === investmentId);
    const targetSymbolKey = normalizeLookupKey(targetRow?.symbol || "");
    const assetReferenceCount = investments.filter((row) => normalizeLookupKey(row.symbol) === targetSymbolKey).length;
    if (targetSymbolKey && assetReferenceCount <= 1) {
      setTickers((current) => current.map((ticker) => normalizeLookupKey(ticker.symbol) === targetSymbolKey
        ? { ...ticker, description: input.sourceName.trim() }
        : ticker));
    }
    setInvestments((current) => current.map((row) => row.id === investmentId
      ? { ...row, description: input.sourceName.trim(), yearlyIncome: input.annualAmount }
      : row));
  };
  const createInvestmentWithAsset = (input: InvestmentEntryInput) => {
    recordUndoCheckpoint();
    const unifiedAssetClass = input.assetClass || input.assetType;
    if (unifiedAssetClass) setCategories((current) => current.some((row) => normalizeLookupKey(row.name) === normalizeLookupKey(unifiedAssetClass)) ? current : [...current, { id: Math.max(Date.now(), ...current.map((row) => row.id + 1)), name: unifiedAssetClass, includeInAllocation: true }]);
    const assetId = Date.now();
    setTickers((current) => current.some((ticker) => normalizeLookupKey(ticker.symbol) === normalizeLookupKey(input.symbol))
      ? current
      : [...current, {
          id: Math.max(assetId, ...current.map((ticker) => ticker.id + 1)),
          symbol: input.symbol,
          percentReturn: normalizeRate(input.dividendRate),
          assetType: unifiedAssetClass,
          category: unifiedAssetClass,
          taxTreatment: input.taxTreatment,
          incomeItem: false,
          extraData: input.extraData,
          description: input.assetDescription,
          exDividend: input.exDividend,
          divPayout: input.divPayout,
        }]);
    setInvestments((current) => [...current, {
      id: Math.max(assetId, ...current.map((row) => row.id + 1)),
      description: input.name,
      account: input.account,
      category: unifiedAssetClass,
      totalInvestment: input.amount,
      yearlyIncome: input.amount * normalizeRate(input.dividendRate),
      includeIncome: true,
      overrideProposal: false,
      symbol: input.symbol,
      newSymbol: input.symbol,
      newPercent: normalizeRate(input.dividendRate),
    }]);
  };
  const createQuickAccount = (name: string) => {
    recordUndoCheckpoint();
    setAccounts((current) => current.some((row) => normalizeLookupKey(row.account) === normalizeLookupKey(name)) ? current : [...current, {
      id: Math.max(Date.now(), ...current.map((row) => row.id + 1)), account: name, accountType: "Brokerage Account", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes",
    }]);
  };
  const createQuickAsset = (serializedInput: string) => {
    let input: QuickAssetInput;
    try {
      input = JSON.parse(serializedInput) as QuickAssetInput;
    } catch {
      input = { symbol: serializedInput, dividendPercent: "0", assetClass: categoryOptions[1] || categoryOptions[0] || "", taxTreatment: "income", description: "", exDividend: "", divPayout: "" };
    }
    const symbol = input.symbol.trim();
    recordUndoCheckpoint();
    if (input.assetClass) setCategories((current) => current.some((row) => normalizeLookupKey(row.name) === normalizeLookupKey(input.assetClass)) ? current : [...current, { id: Math.max(Date.now(), ...current.map((row) => row.id + 1)), name: input.assetClass, includeInAllocation: true }]);
    setTickers((current) => current.some((row) => normalizeLookupKey(row.symbol) === normalizeLookupKey(symbol)) ? current : [...current, {
      id: Math.max(Date.now(), ...current.map((row) => row.id + 1)), symbol, percentReturn: toNumber(input.dividendPercent) / 100, assetType: input.assetClass, category: input.assetClass, taxTreatment: input.taxTreatment, incomeItem: false, extraData: 0, description: input.description, exDividend: input.exDividend, divPayout: input.divPayout,
    }]);
  };
  const createQuickTaxTreatment = (label: string) => {
    recordUndoCheckpoint();
    setTaxTreatments((current) => current.some((row) => normalizeLookupKey(row.label) === normalizeLookupKey(label)) ? current : [...current, {
      id: Math.max(Date.now(), ...current.map((row) => row.id + 1)), label, ...defaultTaxTreatmentRule("income"), includeInAllocation: true,
    }]);
  };
  const editInvestmentWithAsset = (investmentId: number, originalSymbol: string, input: InvestmentEntryInput) => {
    recordUndoCheckpoint();
    const unifiedAssetClass = input.assetClass || input.assetType;
    if (unifiedAssetClass) setCategories((current) => current.some((row) => normalizeLookupKey(row.name) === normalizeLookupKey(unifiedAssetClass)) ? current : [...current, { id: Math.max(Date.now(), ...current.map((row) => row.id + 1)), name: unifiedAssetClass, includeInAllocation: true }]);
    const originalSymbolKey = normalizeLookupKey(originalSymbol);
    const nextSymbolKey = normalizeLookupKey(input.symbol);
    const originalAssetReferenceCount = investments.filter((row) => normalizeLookupKey(row.symbol) === originalSymbolKey).length;
    const nextAsset = {
      symbol: input.symbol,
      percentReturn: normalizeRate(input.dividendRate),
      assetType: unifiedAssetClass,
      category: unifiedAssetClass,
      taxTreatment: input.taxTreatment,
      incomeItem: false,
      extraData: input.extraData,
      description: input.assetDescription,
      exDividend: input.exDividend,
      divPayout: input.divPayout,
    };
    setTickers((current) => {
      const originalAssetIndex = current.findIndex((ticker) => normalizeLookupKey(ticker.symbol) === originalSymbolKey);
      const nextAssetIndex = current.findIndex((ticker) => normalizeLookupKey(ticker.symbol) === nextSymbolKey);
      if (originalAssetIndex >= 0 && (originalSymbolKey === nextSymbolKey || originalAssetReferenceCount <= 1)) {
        return current.map((ticker, index) => index === originalAssetIndex ? { ...ticker, ...nextAsset } : ticker);
      }
      if (nextAssetIndex >= 0) return current;
      return [...current, {
        id: Math.max(Date.now(), ...current.map((ticker) => ticker.id + 1)),
        ...nextAsset,
      }];
    });
    setInvestments((current) => current.map((row) => {
      if (row.id !== investmentId) return row;
      const hasSeparateWhatIfAsset = Boolean(normalizeLookupKey(row.newSymbol)) && normalizeLookupKey(row.newSymbol) !== originalSymbolKey;
      return {
        ...row,
        description: input.name,
        account: input.account,
        category: unifiedAssetClass,
        totalInvestment: input.amount,
        yearlyIncome: input.amount * normalizeRate(input.dividendRate),
        symbol: input.symbol,
        newSymbol: hasSeparateWhatIfAsset ? row.newSymbol : input.symbol,
        newPercent: hasSeparateWhatIfAsset ? row.newPercent : normalizeRate(input.dividendRate),
      };
    }));
  };
  const effectiveExtraStateIncome = isStateTaxWhatIfOpen ? stateSettings.extraStateIncome : 0;
  const socialSecurityRows = derivedRows.filter((row) => normalizeTaxTreatmentKey(row.taxTreatment) === "ss85fed");
  const socialSecurityBenefits = socialSecurityRows.reduce((total, row) => total + row.filteredIncome, 0);
  const scheduledSocialSecurityOrdinary = socialSecurityRows.reduce((total, row) => total + row.ordinaryMonthly * 12, 0);
  const federalTaxExemptInterest = derivedRows.reduce((total, row) => {
    const treatment = normalizeTaxTreatmentKey(row.taxTreatment);
    return ["taxfree", "fedtaxfree"].includes(treatment) ? total + row.filteredIncome : total;
  }, 0);
  const ordinaryIncomeExcludingSocialSecurity = Math.max(flows.federalOrdinary - scheduledSocialSecurityOrdinary + effectiveExtraOrdinaryIncome, 0);
  const ordinaryBeforeDeductions = taxPlanResult?.federal.ordinaryIncome || ordinaryIncomeExcludingSocialSecurity;
  const preferredBeforeDeductions = flows.federalPreferred + effectiveExtraPreferredIncome;
  const grossFederalTaxable = taxPlanResult?.federal.adjustedGrossIncome || ordinaryBeforeDeductions + preferredBeforeDeductions;
  const federalTaxableInvestmentIncome = flows.federalOrdinary + flows.federalPreferred;
  const stateTaxFreeInvestmentBreakdown = useMemo(() => {
    const dividendsBySymbol = new Map<string, number>();
    derivedRows.forEach((row) => {
      if (row.incomeItem || !isTaxableAccountStatus(row.taxStatus)) return;
      const exemptDividends = Math.max(row.investmentIncome - row.investmentStateMonthly * 12, 0);
      if (exemptDividends <= 0) return;
      const symbol = String(row.effectiveSymbol || row.symbol || "Unnamed investment").trim().toUpperCase();
      dividendsBySymbol.set(symbol, (dividendsBySymbol.get(symbol) || 0) + exemptDividends);
    });
    return [...dividendsBySymbol.entries()]
      .map(([symbol, dividends]) => ({ symbol, dividends }))
      .sort((left, right) => right.dividends - left.dividends || left.symbol.localeCompare(right.symbol));
  }, [derivedRows]);
  const stateTaxFreeInvestmentDividends = stateTaxFreeInvestmentBreakdown.reduce((total, row) => total + row.dividends, 0);
  const stateTaxFreeInvestmentSummary = stateTaxFreeInvestmentBreakdown.length
    ? stateTaxFreeInvestmentBreakdown.map((row) => `${row.symbol} (${formatCurrencyDetailed(row.dividends)})`).join(", ")
    : "None";
  const stateInvestmentAdjustment = flows.stateTaxable - federalTaxableInvestmentIncome;
  const federalWhatIfIncome = effectiveExtraOrdinaryIncome + effectiveExtraPreferredIncome;
  const stateGross = federalTaxableInvestmentIncome + stateInvestmentAdjustment + federalWhatIfIncome + effectiveExtraStateIncome;
  const stateItemized = taxPlanResult?.state.itemizedDeduction || 0;
  const stateDeduction = taxPlanResult?.state.deduction || 0;
  const stateTaxableAfterDeductions = taxPlanResult?.state.taxableIncome || 0;
  const displayedStateResult: TaxResult = stateResult || {
    calc: "STATE_TAX_2025",
    state: selectedStateCode,
    stateName: selectedStateTaxProfile.name,
    taxableIncome: stateTaxableAfterDeductions,
    filingStatus: federalSettings.filingStatus,
    tax: 0,
    note: selectedStateTaxProfile.note,
  };
  const localTaxBaseAmounts = derivedRows.reduce((base, row) => {
    if (!row.includeIncome || row.filteredIncome <= 0) return base;
    if (["taxfree", "hold"].includes(normalizeTaxTreatmentKey(row.taxTreatment))) return base;
    if (["exempt", "treasuryexempt"].includes(normalizeTaxTreatmentKey(row.stateTaxRule))) return base;
    addLocalTaxBaseAmount(base, classifyLocalInvestmentIncome(row), row.filteredIncome);
    return base;
  }, createEmptyLocalTaxBaseAmounts());
  if (isFederalTaxWhatIfOpen) {
    addLocalTaxWhatIfItems(localTaxBaseAmounts, federalSettings.extraOrdinaryItems, false, federalSettings.extraOrdinaryIncome);
    addLocalTaxWhatIfItems(localTaxBaseAmounts, federalSettings.extraPreferredItems, true, federalSettings.extraPreferredIncome);
  }
  const localTaxableIncome = taxPlanResult?.local.taxableIncome || 0;
  const selectedLocalTaxProfile = taxPlanResult?.local.profile || getLocalTaxProfile(localTaxProfiles, localTaxSettings.localityId);
  const localTaxResult = {
    tax: localResult?.tax || 0,
    effectiveRate: localResult?.effectiveRate || 0,
    marginalRate: localResult?.marginalRate || 0,
    profile: selectedLocalTaxProfile,
  };
  const localTaxTotal = localTaxResult.tax;
  const backendFederalDeductions = taxPlanResult?.federal.deductions;
  const federalDeductionSummary = {
    mortgageInterest: backendFederalDeductions?.mortgageInterest || 0,
    propertyTax: backendFederalDeductions?.propertyTax || 0,
    capitalLossRaw: backendFederalDeductions?.capitalLossRaw || 0,
    capitalLossDeduction: backendFederalDeductions?.capitalLossDeduction || 0,
    otherItemized: backendFederalDeductions?.otherItemized || 0,
    saltDeduction: backendFederalDeductions?.saltDeduction || 0,
    itemizedDeduction: backendFederalDeductions?.itemizedDeduction || 0,
  };
  const federalAboveLineDeductionSummary = {
    capitalLossRaw: backendFederalDeductions?.capitalLossRaw || 0,
    capitalLossDeduction: backendFederalDeductions?.capitalLossDeduction || 0,
    total: backendFederalDeductions?.aboveLineDeduction || 0,
  };
  const itemizedFederalDeduction = federalDeductionSummary.itemizedDeduction;
  const federalStandardDeduction = backendFederalDeductions?.standardDeduction || 0;
  const federalDeduction = backendFederalDeductions?.standardOrItemizedDeduction || 0;
  const federalTaxableBeforeStandardOrItemized = taxPlanResult?.federal.adjustedGrossIncome || 0;
  const federalTaxableAfterDeductions = taxPlanResult?.federal.taxableIncome || 0;
  const prefTaxable = taxPlanResult?.federal.prefTaxable || 0;
  const ordinaryTaxable = taxPlanResult?.federal.ordinaryTaxable || 0;
  const magi = taxPlanResult?.federal.adjustedGrossIncome || 0;
  const netInvestmentIncome = Math.max(flows.niitIncome + effectiveExtraOrdinaryIncome + effectiveExtraPreferredIncome - extraW2WhatIfTotal, 0);
  const niitThreshold = toNumber((taxPlanResult?.federal as TaxPlanResult["federal"] & { niitThreshold?: number } | undefined)?.niitThreshold) || niitThresholdForStatus(federalSettings.filingStatus);
  const niitBase = toNumber((taxPlanResult?.federal as TaxPlanResult["federal"] & { niitBase?: number } | undefined)?.niitBase);
  const displayedFederalTaxableBeforeDeductions = flows.displayFederalOrdinary + flows.displayFederalPreferred;
  const marginalFederalMarkers = federalOrdinaryRateMarkers[federalSettings.filingStatus];
  const marginalStateMarkers = getStateTaxRateMarkers(selectedStateTaxProfile, federalSettings.filingStatus);
  const marginalStateBaseRateLabel = getStateTaxBaseRateLabel(selectedStateTaxProfile, federalSettings.filingStatus);
  const marginalCombinedTaxable = Math.max(federalTaxableAfterDeductions, stateTaxableAfterDeductions);
  const marginalFederalRateLabel = getReachedTaxRateLabel(marginalFederalMarkers, federalTaxableAfterDeductions, "10%");
  const marginalStateRateLabel = marginalStateMarkers.length ? getReachedTaxRateLabel(marginalStateMarkers, stateTaxableAfterDeductions, marginalStateBaseRateLabel) : "0%";
  const marginalNiitRate = marginalCombinedTaxable >= niitThreshold && netInvestmentIncome > 0 ? 0.038 : 0;
  const hasRealData = useMemo(
    () => investments.some((row) => row.totalInvestment > 0 || row.yearlyIncome > 0 || row.includeIncome),
    [investments]
  );
  const applyWorkbookResponse = useCallback((response: WorkbookResponse, options: { resetWhatIf: boolean; fromRemoteRefresh?: boolean }) => {
    const workbookSettings = parseWorkbookSettings(response.settings);
    const authenticatedWorkbook = authEnabled && authState.status === "signedIn";
    const loadedInvestments = mapWorkbookRows(
      authenticatedWorkbook ? [] : initialInvestments,
      response.tabs?.investments,
      workbookToInvestmentRow
    );
    const activeInvestments = authenticatedWorkbook && isStarterInvestmentSet(loadedInvestments) ? [] : loadedInvestments;
    if (options.fromRemoteRefresh) {
      suppressNextAutosave.current = true;
      resetHistoryTracking();
    }
    latestWorkbookUpdatedAt.current = response.updatedAt || latestWorkbookUpdatedAt.current;
    latestWorkbookRefreshMarker.current = workbookRefreshMarker(response) || latestWorkbookRefreshMarker.current;
    setInvestments(activeInvestments);
    if (options.resetWhatIf) {
      setIsWhatIfActive(workbookSettings.ui?.investmentWhatIfOpen === true);
    } else if (workbookSettings.ui?.investmentWhatIfOpen === true) {
      setIsWhatIfActive(true);
    }
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
      mergeDefaultAccountTypes(mapWorkbookRows(initialAccountTypes, response.tabs?.accountType, workbookToAccountTypeRow))
    );
    setFederalSettings(normalizeFederalSettings(workbookSettings.federal));
    setStateSettings(normalizeStateSettings(workbookSettings.state));
    setLocalTaxSettings(normalizeLocalTaxSettings(workbookSettings.local));
    setPlannerSettings(mergeSettings(initialPlannerSettings, workbookSettings.planner));
    setSelectedInvestmentIds(
      normalizeSelectedAssetIds(workbookSettings.ui?.selectedAssetIds).filter((id) =>
        activeInvestments.some((row) => row.id === id)
      )
    );
    const publicUsername = resolvePublicUsername(
      authState.status === "signedIn" ? authState.user : null,
      workbookSettings.ui?.publicUsername,
      authState.status === "signedIn" ? authState.requestedPublicUsername : undefined
    );
    writeStoredPublicUsername(publicUsername);
    setUiSettings({
      publicUsername,
      investmentFavorites: workbookSettings.ui?.investmentFavorites || [],
      selectedAssetIds: workbookSettings.ui?.selectedAssetIds || [],
      savedScenarios: workbookSettings.ui?.savedScenarios || [],
      scenarioLibraryMigrated: workbookSettings.ui?.scenarioLibraryMigrated === true,
      modelVersions: workbookSettings.ui?.modelVersions || [],
      incomePrimaryPeriod: workbookSettings.ui?.incomePrimaryPeriod || "annual",
      darkMode: workbookSettings.ui?.darkMode === true,
      investmentWhatIfOpen: workbookSettings.ui?.investmentWhatIfOpen === true,
      mcpRefresh: workbookSettings.ui?.mcpRefresh,
    });
  }, [authEnabled, authState, resetHistoryTracking]);

  useEffect(() => {
    if (authEnabled && authState.status !== "signedIn") {
      hasLoadedStorage.current = false;
      latestWorkbookUpdatedAt.current = null;
      latestWorkbookRefreshMarker.current = null;
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
      applyWorkbookResponse(response, { resetWhatIf: true });
      hasLoadedStorage.current = true;
      setStorageState("ready");
    }).catch((error: Error) => {
      console.error(error);
      setStorageState("error");
      hasLoadedStorage.current = true;
    });
    return () => { cancelled = true; };
  }, [authEnabled, authState.status, authToken, applyWorkbookResponse, resetHistoryTracking]);

  useEffect(() => {
    if (authEnabled && authState.status !== "signedIn") return;
    let cancelled = false;
    const pollForRemoteWorkbookChanges = () => {
      if (cancelled || !hasLoadedStorage.current || storageState === "saving") return;
      loadWorkbook(WORKSPACE_ID, authToken).then((response) => {
        if (cancelled) return;
        const remoteUpdatedAt = response.updatedAt || null;
        const remoteRefreshMarker = workbookRefreshMarker(response);
        const knownUpdatedAt = latestWorkbookUpdatedAt.current;
        const knownRefreshMarker = latestWorkbookRefreshMarker.current;
        if (!remoteUpdatedAt && !remoteRefreshMarker) return;
        if (!knownUpdatedAt && !knownRefreshMarker) {
          latestWorkbookUpdatedAt.current = remoteUpdatedAt;
          latestWorkbookRefreshMarker.current = remoteRefreshMarker;
          return;
        }
        const hasNewRefreshMarker = Boolean(remoteRefreshMarker && remoteRefreshMarker !== knownRefreshMarker);
        const hasNewUpdatedAt = Boolean(remoteUpdatedAt && knownUpdatedAt && remoteUpdatedAt > knownUpdatedAt);
        if (!hasNewRefreshMarker && !hasNewUpdatedAt) return;
        applyWorkbookResponse(response, { resetWhatIf: false, fromRemoteRefresh: true });
        hasLoadedStorage.current = true;
        setStorageState("ready");
      }).catch((error: Error) => {
        if (!cancelled) console.warn("Workbook refresh poll failed", error);
      });
    };
    const intervalId = window.setInterval(pollForRemoteWorkbookChanges, WORKBOOK_REMOTE_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [authEnabled, authState.status, authToken, applyWorkbookResponse, storageState]);

  useEffect(() => {
    if (authState.status !== "signedIn" || !authToken || !hasLoadedStorage.current || storageState === "loading") return;
    const claimKey = `${authState.user.sub}:${publicUsername}`;
    if (!publicUsername || usernameClaimAttemptRef.current === claimKey) return;
    usernameClaimAttemptRef.current = claimKey;
    let cancelled = false;
    claimPublicUsername(publicUsername, authToken).catch((error: Error) => {
      if (cancelled) return;
      if (/already used by another account/i.test(error.message)) {
        setSettingsUsernameDraft(publicUsername);
        setSettingsUsernameError(`@${publicUsername} is already used by another account. Choose a different username.`);
        setIsSettingsDialogOpen(true);
        return;
      }
      console.warn("Public username claim failed", error);
    });
    return () => { cancelled = true; };
  }, [authState, authToken, publicUsername, storageState]);

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
    if (skipNextHistoryRecord.current) {
      skipNextHistoryRecord.current = false;
      history.present = currentHistorySerialized;
      setHistoryVersion((version) => version + 1);
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
    document.documentElement.style.colorScheme = uiSettings.darkMode ? "dark" : "light";
    document.documentElement.classList.toggle("aftertaxus-dark-mode", uiSettings.darkMode);
    return () => {
      document.documentElement.style.colorScheme = "";
      document.documentElement.classList.remove("aftertaxus-dark-mode");
    };
  }, [uiSettings.darkMode]);

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
    postTaxCalculation<TaxConfigResult>({ calc: "TAX_CONFIG_2025" })
      .then((result) => { if (!cancelled) setTaxConfig(result); })
      .catch((error: Error) => { if (!cancelled) console.error("Tax configuration failed", error); });
    return () => { cancelled = true; };
  }, []);

  const localTaxBaseSignature = JSON.stringify(localTaxBaseAmounts);
  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      postTaxCalculation<TaxPlanResult>({
        calc: "TAX_PLAN_2025",
        filingStatus: federalSettings.filingStatus,
        state: selectedStateCode,
        ordinaryIncomeExcludingSocialSecurity,
        preferredIncome: preferredBeforeDeductions,
        socialSecurityBenefits,
        taxExemptInterest: federalTaxExemptInterest,
        netInvestmentIncome,
        w2Income: effectiveW2Income,
        totalIncome: flows.totalIncome,
        displayIncome: flows.displayIncome,
        federalDeductionMode: federalSettings.deductionMode,
        federalAboveLineDeductions: federalSettings.aboveLineDeductionItems,
        federalItemizedDeductions: federalSettings.deductionItems,
        stateGrossIncome: stateGross,
        stateDeductionMode: stateSettings.deductionMode,
        stateStandardDeduction: stateSettings.standardDeduction,
        stateItemizedDeductions: stateSettings.deductionItems,
        local: {
          enabled: localTaxSettings.enabled,
          localityId: localTaxSettings.localityId,
          residency: localTaxSettings.residency,
          customRate: localTaxSettings.rate,
          customNonresidentRate: localTaxSettings.nonresidentRate,
          taxableBaseAmounts: localTaxBaseAmounts,
          customTaxableBase: localTaxSettings.taxableBase,
        },
      }).then((result) => {
        if (cancelled) return;
        setTaxPlanResult(result);
        setFederalResult({ ...result.federal, calc: "TAX_PLAN_2025", tax: result.federal.incomeTax });
        setStateResult({ ...result.state, calc: "TAX_PLAN_2025", tax: result.state.incomeTax, state: result.stateCode, stateName: result.stateName });
        setLocalResult({ ...result.local, calc: "TAX_PLAN_2025" });
        setFederalError(null);
        setStateError(null);
      }).catch((error: Error) => {
        if (cancelled) return;
        setTaxPlanResult(null);
        setFederalResult(null);
        setStateResult(null);
        setLocalResult(null);
        setFederalError(error.message);
        setStateError(error.message);
      });
    }, 220);

    return () => { cancelled = true; window.clearTimeout(timeoutId); };
  }, [ordinaryIncomeExcludingSocialSecurity, preferredBeforeDeductions, socialSecurityBenefits, federalTaxExemptInterest, netInvestmentIncome, effectiveW2Income, flows.totalIncome, flows.displayIncome, federalSettings.deductionMode, federalSettings.filingStatus, federalSettings.aboveLineDeductionItems, federalSettings.deductionItems, stateGross, stateSettings.deductionMode, stateSettings.standardDeduction, stateSettings.deductionItems, selectedStateCode, localTaxSettings.enabled, localTaxSettings.localityId, localTaxSettings.residency, localTaxSettings.rate, localTaxSettings.nonresidentRate, localTaxSettings.taxableBase, localTaxBaseSignature]);



  useEffect(() => {
    if (authEnabled && authState.status !== "signedIn") return;
    if (!hasLoadedStorage.current) return;
    if (suppressNextAutosave.current) {
      suppressNextAutosave.current = false;
      setStorageState("ready");
      return;
    }
    if (!hasRealData && investments.length > 0) {
      return;
    }
    if (saveTimeout.current) window.clearTimeout(saveTimeout.current);
    setStorageState("saving");
    saveTimeout.current = window.setTimeout(() => {
      let cancelled = false;
      saveTimeout.current = null;
      saveWorkbook(WORKSPACE_ID, { workspaceId: WORKSPACE_ID, tabs: { investments: persistedInvestments, tickers, categories, taxTreatment: taxTreatments, accounts, accountTaxType: accountTaxTypes, accountType: accountTypes }, settings: { federal: federalSettings, state: stateSettings, local: localTaxSettings, planner: plannerSettings, ui: { ...uiSettings, selectedAssetIds: selectedInvestmentIds, investmentWhatIfOpen: isWhatIfActive } } }, authToken).then((result) => {
        if (!cancelled) {
          latestWorkbookUpdatedAt.current = result.updatedAt || latestWorkbookUpdatedAt.current;
          latestWorkbookRefreshMarker.current = result.updatedAt || latestWorkbookRefreshMarker.current;
          setStorageState("saved");
        }
      }).catch((error: Error) => {
        console.error(error);
        if (!cancelled) { setStorageState("error"); }
      });
      return () => { cancelled = true; };
    }, 700);
    return () => { if (saveTimeout.current) window.clearTimeout(saveTimeout.current); };
  }, [investments, persistedInvestments, tickers, categories, taxTreatments, accounts, accountTaxTypes, accountTypes, federalSettings, stateSettings, localTaxSettings, plannerSettings, uiSettings, selectedInvestmentIds, isWhatIfActive, hasRealData, authEnabled, authState.status, authToken]);

  const federalIncomeTaxTotal = taxPlanResult?.federal.incomeTax || 0;
  const federalTaxWithPayroll = taxPlanResult?.federal.total || 0;
  const stateTaxWithPayroll = taxPlanResult?.state.total || 0;
  const calculatedTotalTax = taxPlanResult?.totalTax || 0;
  const totalIncome = flows.totalIncome;
  const totalTax = calculatedTotalTax;
  const spendableTaxBurden = Math.max(totalTax, 0);
  const afterTaxIncome = taxPlanResult?.afterTaxIncome ?? flows.displayIncome;
  const monthlyIncome = totalIncome / 12;
  const afterTaxMonthlyIncome = afterTaxIncome / 12;
  const isMonthlyIncomePrimary = uiSettings.incomePrimaryPeriod === "monthly";
  const ordinaryBeforeDeductionsWithoutInvestments = Math.max(ordinaryIncomeExcludingSocialSecurity - flows.investmentFederalOrdinary, 0);
  const preferredBeforeDeductionsWithoutInvestments = Math.max(preferredBeforeDeductions - flows.investmentFederalPreferred, 0);
  const netInvestmentIncomeWithoutInvestments = Math.max(netInvestmentIncome - flows.niitIncome, 0);
  const stateGrossWithoutInvestments = Math.max(stateGross - flows.investmentStateTaxable, 0);
  const localTaxBaseAmountsWithoutInvestments = derivedRows.reduce((base, row) => {
    if (row.incomeItem || !row.includeIncome || row.filteredIncome <= 0) return base;
    if (["taxfree", "hold"].includes(normalizeTaxTreatmentKey(row.taxTreatment))) return base;
    if (["exempt", "treasuryexempt"].includes(normalizeTaxTreatmentKey(row.stateTaxRule))) return base;
    const key = classifyLocalInvestmentIncome(row);
    base[key] = Math.max(base[key] - row.filteredIncome, 0);
    return base;
  }, { ...localTaxBaseAmounts });
  const localTaxBaseWithoutInvestmentsSignature = JSON.stringify(localTaxBaseAmountsWithoutInvestments);
  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      postTaxCalculation<TaxPlanResult>({
        calc: "TAX_PLAN_2025",
        filingStatus: federalSettings.filingStatus,
        state: selectedStateCode,
        ordinaryIncomeExcludingSocialSecurity: ordinaryBeforeDeductionsWithoutInvestments,
        preferredIncome: preferredBeforeDeductionsWithoutInvestments,
        socialSecurityBenefits,
        taxExemptInterest: federalTaxExemptInterest,
        netInvestmentIncome: netInvestmentIncomeWithoutInvestments,
        w2Income: effectiveW2Income,
        totalIncome: Math.max(flows.totalIncome - flows.investmentIncome, 0),
        displayIncome: Math.max(flows.displayIncome - flows.displayInvestmentIncome, 0),
        federalDeductionMode: federalSettings.deductionMode,
        federalAboveLineDeductions: federalSettings.aboveLineDeductionItems,
        federalItemizedDeductions: federalSettings.deductionItems,
        stateGrossIncome: stateGrossWithoutInvestments,
        stateDeductionMode: stateSettings.deductionMode,
        stateStandardDeduction: stateSettings.standardDeduction,
        stateItemizedDeductions: stateSettings.deductionItems,
        local: {
          enabled: localTaxSettings.enabled,
          localityId: localTaxSettings.localityId,
          residency: localTaxSettings.residency,
          customRate: localTaxSettings.rate,
          customNonresidentRate: localTaxSettings.nonresidentRate,
          taxableBaseAmounts: localTaxBaseAmountsWithoutInvestments,
          customTaxableBase: localTaxSettings.taxableBase,
        },
      }).then((result) => {
        if (!cancelled) setTaxPlanWithoutInvestmentsResult(result);
      }).catch(() => {
        if (!cancelled) setTaxPlanWithoutInvestmentsResult(null);
      });
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timeoutId); };
  }, [ordinaryBeforeDeductionsWithoutInvestments, preferredBeforeDeductionsWithoutInvestments, socialSecurityBenefits, federalTaxExemptInterest, netInvestmentIncomeWithoutInvestments, effectiveW2Income, flows.totalIncome, flows.displayIncome, flows.investmentIncome, flows.displayInvestmentIncome, federalSettings.deductionMode, federalSettings.filingStatus, federalSettings.aboveLineDeductionItems, federalSettings.deductionItems, stateGrossWithoutInvestments, stateSettings.deductionMode, stateSettings.standardDeduction, stateSettings.deductionItems, selectedStateCode, localTaxSettings.enabled, localTaxSettings.localityId, localTaxSettings.residency, localTaxSettings.rate, localTaxSettings.nonresidentRate, localTaxSettings.taxableBase, localTaxBaseWithoutInvestmentsSignature]);
  const federalTaxWithoutInvestments = taxPlanWithoutInvestmentsResult?.federal.incomeTax || 0;
  const stateTaxWithoutInvestments = taxPlanWithoutInvestmentsResult?.state.incomeTax || 0;
  const localTaxWithoutInvestments = taxPlanWithoutInvestmentsResult?.local.tax || 0;
  const investmentTaxBurden = Math.max((federalIncomeTaxTotal - federalTaxWithoutInvestments) + (displayedStateResult.tax - stateTaxWithoutInvestments) + (localTaxTotal - localTaxWithoutInvestments), 0);
  const investmentAfterTaxIncome = flows.investmentIncome - investmentTaxBurden;
  const portfolioBeforeTaxYield = flows.totalInvestmentAmount > 0 ? flows.investmentIncome / flows.totalInvestmentAmount : 0;
  const portfolioAfterTaxYield = flows.totalInvestmentAmount > 0 ? investmentAfterTaxIncome / flows.totalInvestmentAmount : 0;
  const portfolioYield = portfolioAfterTaxYield;
  const hiddenFromAfterTaxIncome = flows.totalIncome - flows.displayIncome;
  const hasAnyExcludedAfterTaxIncome = Math.abs(hiddenFromAfterTaxIncome) > 0.005;
  const federalTaxTotal = federalTaxWithPayroll;
  const federalOrdinaryTax = federalResult?.ordinaryTax || 0;
  const federalPreferredTax = federalResult?.prefTax || 0;
  const federalNiit = federalResult?.niit || 0;
  const marginalFederalRate = rateLabelToDecimal(marginalFederalRateLabel);
  const marginalStateRate = rateLabelToDecimal(marginalStateRateLabel);
  const marginalLocalRate = localTaxSettings.enabled && selectedLocalTaxProfile.kind !== "none" ? localTaxResult.marginalRate : 0;
  const marginalW2PayrollRate = effectiveW2Income > 0 ? taxPlanResult?.marginalPayrollRate || 0 : 0;
  const allInMarginalTaxRate = marginalFederalRate + marginalStateRate + marginalLocalRate + marginalNiitRate + marginalW2PayrollRate;
  const allInMarginalTaxRateLabel = formatPercent(allInMarginalTaxRate);
  const allInEffectiveTaxRate = totalIncome > 0 ? totalTax / totalIncome : 0;
  const allInEffectiveTaxRateLabel = formatPercent(allInEffectiveTaxRate);
  const federalSummaryAboveLineItems = federalSettings.aboveLineDeductionItems.filter((item) => item.deductionType);
  const federalSummaryItemizedItems = federalSettings.deductionItems.filter((item) => item.deductionType);
  const stateSummaryDeductionItems = stateSettings.deductionItems.filter((item) => item.deductionType);
  const federalSaltEntered = federalDeductionSummary.propertyTax + displayedStateResult.tax;
  const federalSaltOverCap = Math.max(federalSaltEntered - (backendFederalDeductions?.saltCap || 0), 0);
  const localSummaryName = localTaxSettings.localityName || selectedLocalTaxProfile.locality || "Local tax";
  const showLocalTaxBasePanel = localTaxSettings.enabled && selectedLocalTaxProfile.kind !== "none";
  const updateLocalTaxProfile = (localityId: string) => {
    const profile = getLocalTaxProfile(localTaxProfiles, localityId);
    updateLocalTaxSettingsUndoable((current) => normalizeLocalTaxSettings({
      ...current,
      enabled: profile.kind !== "none",
      localityId: profile.id,
      localityName: profile.id === "custom" ? current.localityName : profile.locality,
      rate: profile.id === "custom" ? current.rate : current.residency === "nonresident" ? profile.nonresidentRate ?? profile.residentRate : profile.residentRate,
      nonresidentRate: profile.id === "custom" ? current.nonresidentRate : profile.nonresidentRate ?? profile.residentRate,
      taxableBase: profile.base,
    }));
  };
  const updateLocalTaxBase = (key: LocalTaxBaseKey, checked: boolean) => {
    updateLocalTaxSettingsUndoable((current) => ({
      ...current,
      taxableBase: {
        ...current.taxableBase,
        [key]: checked,
      },
    }));
  };
  const hasExcludedAfterTaxIncome = hiddenFromAfterTaxIncome > 0.005;
  const excludedIncomeBadge = hasExcludedAfterTaxIncome ? (
    <span className="kpi-pill__inline-badge">
      Excluded income
      <span className="kpi-pill__inline-note" role="tooltip">
        {formatCurrencyDetailed(hiddenFromAfterTaxIncome)} is still included when calculating tax liability, but is excluded from the after-tax income calculation. Change this on the Accounts tab by clearing “Exclude from aftertax income” for the account.
      </span>
    </span>
  ) : undefined;
  const afterTaxBreakdownDetails = (
    <div className="tax-breakdown-popover">
      <div className="tax-breakdown-popover__header">
        <strong>Detailed tax calculation</strong>
        <span>Income, deductions, taxable bases, and taxes used by the current tax-rate estimate.</span>
      </div>
      <div className="tax-breakdown-popover__section">
        <h4>Income math</h4>
        <div><span>Total included income for taxes</span><strong>{formatCurrencyDetailed(flows.totalIncome)}</strong></div>
        <div><span>Excluded from after-tax income display</span><strong>-{formatCurrencyDetailed(Math.max(hiddenFromAfterTaxIncome, 0))}</strong></div>
        <div><span>Income used for after-tax calculation</span><strong>{formatCurrencyDetailed(flows.displayIncome)}</strong></div>
        <div><span>Total tax burden applied to spendable income</span><strong>-{formatCurrencyDetailed(spendableTaxBurden)}</strong></div>
        <div className="tax-breakdown-popover__total"><span>After-tax income</span><strong>{formatCurrencyDetailed(afterTaxIncome)}</strong></div>
      </div>
      <div className="tax-breakdown-popover__section">
        <h4>Federal taxable income</h4>
        <div><span>Displayed federal-taxable before deductions</span><strong>{formatCurrencyDetailed(displayedFederalTaxableBeforeDeductions)}</strong></div>
        <div><span>Ordinary income before deductions</span><strong>{formatCurrencyDetailed(ordinaryBeforeDeductions)}</strong></div>
        <div><span>Preferred income before deductions</span><strong>{formatCurrencyDetailed(preferredBeforeDeductions)}</strong></div>
        <div><span>Gross federal taxable income</span><strong>{formatCurrencyDetailed(grossFederalTaxable)}</strong></div>
        <div><span>Above-line deductions</span><strong>-{formatCurrencyDetailed(federalAboveLineDeductionSummary.total)}</strong></div>
        {federalAboveLineDeductionSummary.capitalLossRaw > 0 && <div><span>Capital loss used above-line</span><strong>{formatCurrencyDetailed(federalAboveLineDeductionSummary.capitalLossDeduction)}</strong></div>}
        <div><span>After above-line deductions</span><strong>{formatCurrencyDetailed(federalTaxableBeforeStandardOrItemized)}</strong></div>
        <div><span>{federalSettings.deductionMode === "itemized" ? "Itemized deduction" : "Standard deduction"}</span><strong>-{formatCurrencyDetailed(federalDeduction)}</strong></div>
        {federalSettings.deductionMode === "itemized" && (
          <>
            <div><span>Mortgage interest</span><strong>{formatCurrencyDetailed(federalDeductionSummary.mortgageInterest)}</strong></div>
            <div><span>SALT deduction used</span><strong>{formatCurrencyDetailed(federalDeductionSummary.saltDeduction)}</strong></div>
            <div><span>Capital loss used itemized</span><strong>{formatCurrencyDetailed(federalDeductionSummary.capitalLossDeduction)}</strong></div>
            <div><span>Other itemized deductions</span><strong>{formatCurrencyDetailed(federalDeductionSummary.otherItemized)}</strong></div>
          </>
        )}
        <div className="tax-breakdown-popover__total"><span>Federal taxable after deductions</span><strong>{formatCurrencyDetailed(federalTaxableAfterDeductions)}</strong></div>
        <div><span>Ordinary taxable</span><strong>{formatCurrencyDetailed(ordinaryTaxable)}</strong></div>
        <div><span>Preferred taxable</span><strong>{formatCurrencyDetailed(prefTaxable)}</strong></div>
      </div>
      <div className="tax-breakdown-popover__section">
        <h4>State taxable income</h4>
        <div><span>Federal-taxable investments</span><strong>{formatCurrencyDetailed(federalTaxableInvestmentIncome)}</strong></div>
        <div><span>State taxability adjustment</span><strong>{formatSignedCurrency(stateInvestmentAdjustment)}</strong></div>
        <div><span>Federal What-If income</span><strong>{formatCurrencyDetailed(federalWhatIfIncome)}</strong></div>
        <div><span>{selectedStateCode} extra income</span><strong>{formatCurrencyDetailed(effectiveExtraStateIncome)}</strong></div>
        <div><span>{selectedStateCode} gross income</span><strong>{formatCurrencyDetailed(stateGross)}</strong></div>
        <div><span>{selectedStateCode} deduction used</span><strong>-{formatCurrencyDetailed(stateDeduction)}</strong></div>
        <div className="tax-breakdown-popover__total"><span>{selectedStateCode} taxable after deductions</span><strong>{formatCurrencyDetailed(stateTaxableAfterDeductions)}</strong></div>
      </div>
      <div className="tax-breakdown-popover__section">
        <h4>Local taxable income</h4>
        <div><span>Locality</span><strong>{localTaxSettings.enabled ? localTaxSettings.localityName || localTaxResult.profile.locality : "No local tax"}</strong></div>
        {localTaxBaseKeys.map((key) => (
          <div key={key}><span>{localTaxBaseLabels[key]} {localTaxSettings.taxableBase[key] ? "included" : "excluded"}</span><strong>{formatCurrencyDetailed(localTaxBaseAmounts[key])}</strong></div>
        ))}
        <div className="tax-breakdown-popover__total"><span>Local taxable base</span><strong>{formatCurrencyDetailed(localTaxableIncome)}</strong></div>
      </div>
      <div className="tax-breakdown-popover__section">
        <h4>Taxes removed</h4>
        <div><span>Federal ordinary tax</span><strong>{formatCurrencyDetailed(federalOrdinaryTax)}</strong></div>
        <div><span>Federal preferred tax</span><strong>{formatCurrencyDetailed(federalPreferredTax)}</strong></div>
        <div><span>NIIT</span><strong>{formatCurrencyDetailed(federalNiit)}</strong></div>
        <div><span>W2 Social Security</span><strong>{formatCurrencyDetailed(w2PayrollTax.federal.socialSecurity)}</strong></div>
        <div><span>W2 Medicare</span><strong>{formatCurrencyDetailed(w2PayrollTax.federal.medicare)}</strong></div>
        <div><span>W2 additional Medicare</span><strong>{formatCurrencyDetailed(w2PayrollTax.federal.additionalMedicare)}</strong></div>
        <div><span>Employee FICA total</span><strong>{formatCurrencyDetailed(w2PayrollTax.federal.total)}</strong></div>
        <div><span>Federal income tax + FICA</span><strong>{formatCurrencyDetailed(federalTaxTotal)}</strong></div>
        <div><span>{selectedStateCode} state income tax</span><strong>{formatCurrencyDetailed(displayedStateResult.tax)}</strong></div>
        {w2PayrollTax.state.components.map((component) => (
          <div key={component.label}><span>{component.label}</span><strong>{formatCurrencyDetailed(component.tax)}</strong></div>
        ))}
        <div><span>{selectedStateCode} employee payroll contributions</span><strong>{formatCurrencyDetailed(w2PayrollTax.state.total)}</strong></div>
        <div><span>{selectedStateCode} income tax + payroll</span><strong>{formatCurrencyDetailed(stateTaxWithPayroll)}</strong></div>
        <div><span>Local income tax</span><strong>{formatCurrencyDetailed(localTaxTotal)}</strong></div>
        <div className="tax-breakdown-popover__total"><span>Total tax removed</span><strong>{formatCurrencyDetailed(totalTax)}</strong></div>
      </div>
    </div>
  );
  const incomeBreakdownDetails = (
    <div className="tax-breakdown-popover">
      <div className="tax-breakdown-popover__header">
        <strong>Income and after-tax breakdown</strong>
        <span>Annual and monthly income before and after taxes from selected rows.</span>
      </div>
      <div className="tax-breakdown-popover__section">
        <h4>Annual income</h4>
        <div><span>Total included income</span><strong>{formatCurrencyDetailed(totalIncome)}</strong></div>
        {hasAnyExcludedAfterTaxIncome && <div><span>Total non-excluded income</span><strong>{formatCurrencyDetailed(flows.displayIncome)}</strong></div>}
        <div><span>Investment dividends and interest</span><strong>{formatCurrencyDetailed(flows.investmentIncome)}</strong></div>
        <div><span>Non-investment income</span><strong>{formatCurrencyDetailed(flows.nonInvestmentIncome)}</strong></div>
        <div><span>Tax-free income</span><strong>{formatCurrencyDetailed(flows.nonTaxableIncome)}</strong></div>
        <div><span>Excluded from after-tax calculation</span><strong>{formatCurrencyDetailed(Math.max(hiddenFromAfterTaxIncome, 0))}</strong></div>
        <div><span>Total annual income</span><strong>{formatCurrencyDetailed(totalIncome)}</strong></div>
        <div className="tax-breakdown-popover__total"><span>Annual after-tax income</span><strong>{formatCurrencyDetailed(afterTaxIncome)}</strong></div>
      </div>
      <div className="tax-breakdown-popover__section">
        <h4>Monthly income</h4>
        <div><span>Total monthly income</span><strong>{formatCurrencyDetailed(monthlyIncome)}</strong></div>
        {hasAnyExcludedAfterTaxIncome && <div><span>Non-excluded monthly income</span><strong>{formatCurrencyDetailed(flows.displayIncome / 12)}</strong></div>}
        <div><span>Monthly after-tax income</span><strong>{formatCurrencyDetailed(afterTaxMonthlyIncome)}</strong></div>
        <div className="tax-breakdown-popover__total"><span>Displayed period</span><strong>{isMonthlyIncomePrimary ? "Monthly" : "Annual"}</strong></div>
      </div>
    </div>
  );
  const marginalTaxBreakdownDetails = (
    <div className="tax-breakdown-popover">
      <div className="tax-breakdown-popover__header">
        <strong>Tax rate breakdown</strong>
        <span>All-in tax rates using federal, {selectedStateName}{localTaxSettings.enabled ? ", local" : ""}, payroll, and NIIT taxes that apply.</span>
      </div>
      <div className="tax-breakdown-popover__section">
        <h4>Marginal rate</h4>
        <div><span>Federal income marginal</span><strong>{formatPercent(marginalFederalRate)}</strong></div>
        <div><span>{selectedStateCode} income marginal</span><strong>{formatPercent(marginalStateRate)}</strong></div>
        {localTaxSettings.enabled && selectedLocalTaxProfile.kind !== "none" && <div><span>{localSummaryName} marginal</span><strong>{formatPercent(marginalLocalRate)}</strong></div>}
        {effectiveW2Income > 0 && <div><span>W2 payroll marginal</span><strong>{formatPercent(marginalW2PayrollRate)}</strong></div>}
        {marginalNiitRate > 0 && <div><span>NIIT marginal</span><strong>{formatPercent(marginalNiitRate)}</strong></div>}
        <div className="tax-breakdown-popover__total"><span>All-in marginal rate</span><strong>{allInMarginalTaxRateLabel}</strong></div>
      </div>
      <div className="tax-breakdown-popover__section">
        <h4>Effective rate</h4>
        <div><span>Federal income tax</span><strong>{formatCurrencyDetailed(federalIncomeTaxTotal)}</strong></div>
        <div><span>Employee FICA</span><strong>{formatCurrencyDetailed(w2PayrollTax.federal.total)}</strong></div>
        <div><span>Federal income tax + FICA</span><strong>{formatCurrencyDetailed(federalTaxWithPayroll)}</strong></div>
        <div><span>{selectedStateCode} income tax</span><strong>{formatCurrencyDetailed(displayedStateResult.tax)}</strong></div>
        <div><span>{selectedStateCode} employee payroll contributions</span><strong>{formatCurrencyDetailed(w2PayrollTax.state.total)}</strong></div>
        <div><span>{selectedStateCode} income tax + payroll</span><strong>{formatCurrencyDetailed(stateTaxWithPayroll)}</strong></div>
        {localTaxSettings.enabled && selectedLocalTaxProfile.kind !== "none" && <div><span>{localSummaryName} tax</span><strong>{formatCurrencyDetailed(localTaxTotal)}</strong></div>}
        <div><span>Total included income</span><strong>{formatCurrencyDetailed(totalIncome)}</strong></div>
        <div><span>Total tax</span><strong>{formatCurrencyDetailed(totalTax)}</strong></div>
        <div className="tax-breakdown-popover__total"><span>All-in effective rate</span><strong>{allInEffectiveTaxRateLabel}</strong></div>
      </div>
      <div className="tax-breakdown-popover__section">
        <h4>Taxable income used</h4>
        <div><span>Federal taxable income</span><strong>{formatCurrencyDetailed(federalTaxableAfterDeductions)}</strong></div>
        <div><span>{selectedStateCode} taxable income</span><strong>{formatCurrencyDetailed(stateTaxableAfterDeductions)}</strong></div>
        {localTaxSettings.enabled && selectedLocalTaxProfile.kind !== "none" && <div><span>Local taxable income</span><strong>{formatCurrencyDetailed(localTaxableIncome)}</strong></div>}
        <div><span>Thermometer base</span><strong>{formatCurrencyDetailed(marginalCombinedTaxable)}</strong></div>
      </div>
    </div>
  );
  const taxRateBreakdownDetails = (
    <div className="tax-breakdown-popover-stack">
      {marginalTaxBreakdownDetails}
      {afterTaxBreakdownDetails}
    </div>
  );
  const investmentYieldBreakdownDetails = (
    <div className="tax-breakdown-popover">
      <div className="tax-breakdown-popover__header">
        <strong>Investment and yield breakdown</strong>
        <span>Only selected non-income investment rows are included in these values.</span>
      </div>
      <div className="tax-breakdown-popover__section">
        <h4>Investment base</h4>
        <div><span>Selected investment principal</span><strong>{formatCurrencyDetailed(flows.totalInvestmentAmount)}</strong></div>
        <div><span>Gross investment income</span><strong>{formatCurrencyDetailed(flows.investmentIncome)}</strong></div>
        <div><span>Income items excluded from yield</span><strong>{formatCurrencyDetailed(Math.max(totalIncome - flows.investmentIncome, 0))}</strong></div>
        <div className="tax-breakdown-popover__total"><span>Before-tax yield</span><strong>{formatPercent(portfolioBeforeTaxYield)}</strong></div>
      </div>
      <div className="tax-breakdown-popover__section">
        <h4>After-tax yield</h4>
        <div><span>Federal tax from investments</span><strong>{formatCurrencyDetailed(Math.max(federalIncomeTaxTotal - federalTaxWithoutInvestments, 0))}</strong></div>
        <div><span>{selectedStateCode} tax from investments</span><strong>{formatCurrencyDetailed(Math.max(displayedStateResult.tax - stateTaxWithoutInvestments, 0))}</strong></div>
        <div><span>Total investment tax burden</span><strong>-{formatCurrencyDetailed(investmentTaxBurden)}</strong></div>
        <div><span>After-tax investment income</span><strong>{formatCurrencyDetailed(investmentAfterTaxIncome)}</strong></div>
        <div className="tax-breakdown-popover__total"><span>After-tax yield</span><strong>{formatPercent(portfolioAfterTaxYield)}</strong></div>
      </div>
    </div>
  );
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
  const toggleDarkMode = () => {
    setUiSettings((current) => ({ ...current, darkMode: !current.darkMode }));
    setIsTopbarMenuOpen(false);
  };
  const summaryLandingPageOptions = scenarioLandingPages
    .map((page) => ({ page, payload: decodeSummaryReportPayload(page.payload) }))
    .filter((entry): entry is { page: ScenarioLandingPage; payload: SummaryReportPayload } => Boolean(entry.payload));
  const currentScenarioDescription = `${formatCurrency(flows.displayIncome)} annual income, including ${formatCurrency(effectiveW2Income)} of W-2 wages, ${formatCurrency(preferredBeforeDeductions)} of preferred income, and ${formatCurrency(flows.investmentIncome)} of investment income.`;
  const currentSummaryReportPayload: SummaryReportPayload = {
    reportName: "Tax scenario summary",
    generatedAt: new Date().toISOString(),
    income: flows.displayIncome,
    investments: flows.totalInvestmentAmount,
    afterTaxIncome,
    marginalTaxRate: allInMarginalTaxRate,
    marginalTaxRateLabel: allInMarginalTaxRateLabel,
    effectiveTaxRate: allInEffectiveTaxRate,
    federalTax: federalTaxWithPayroll,
    stateTax: stateTaxWithPayroll,
    localTax: localTaxTotal,
    totalTax,
    stateCode: selectedStateCode,
    stateName: selectedStateName,
    localityName: localTaxSettings.enabled ? (localTaxSettings.localityName || localTaxResult.profile.locality || "Local tax") : "Local tax",
    federalTaxable: federalTaxableAfterDeductions,
    stateTaxable: stateTaxableAfterDeductions,
    localTaxable: localTaxableIncome,
    filingStatus: federalSettings.filingStatus,
    localEffectiveRate: localTaxResult.effectiveRate,
    localMarginalRate: localTaxResult.marginalRate,
    localBrackets: selectedLocalTaxProfile.brackets || [],
    allocationRows: portfolioAllocationRows,
    accountTaxAllocationRows,
    accountTypeAllocationRows,
    taxTreatmentAllocationRows,
    scenarios: [],
  };
  const buildCurrentScenario = (name: string, description: string): SummaryReportScenario => ({
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `scenario-${Date.now()}`,
    name,
    source: "current",
    income: currentSummaryReportPayload.income,
    investments: currentSummaryReportPayload.investments,
    wages: effectiveW2Income,
    ordinaryIncome: ordinaryBeforeDeductions,
    preferredIncome: preferredBeforeDeductions,
    investmentIncome: flows.investmentIncome,
    federalTax: currentSummaryReportPayload.federalTax,
    stateTax: currentSummaryReportPayload.stateTax,
    localTax: currentSummaryReportPayload.localTax,
    totalTax: currentSummaryReportPayload.totalTax,
    afterTaxIncome: currentSummaryReportPayload.afterTaxIncome,
    effectiveTaxRate: currentSummaryReportPayload.effectiveTaxRate,
    marginalTaxRateLabel: currentSummaryReportPayload.marginalTaxRateLabel,
    description,
    stateCode: selectedStateCode,
    stateName: selectedStateName,
    localityName: currentSummaryReportPayload.localityName,
    filingStatus: federalSettings.filingStatus,
  });
  const refreshPublicSummaryReports = useCallback(async (surfaceErrors = true) => {
    if (!authToken) return;
    const requestId = ++summaryReportRefreshRequestRef.current;
    setIsSummaryReportListLoading(true);
    if (surfaceErrors) setSummaryReportDialogError("");
    try {
      const reports = await listPublicSummaryReports(authToken);
      const canonicalReports: PublicSummaryReportRecord[] = [];
      let migrationError: Error | null = null;
      for (const report of reports) {
        const canonicalSlug = namespacedPublicReportSlug(publicUsername, report.name);
        if (!canonicalSlug || report.slug === canonicalSlug) {
          canonicalReports.push(report);
          continue;
        }
        try {
          const migrated = await upsertPublicSummaryReport({
            id: report.id,
            name: report.name,
            slug: canonicalSlug,
            previousSlug: report.slug,
            payload: report.payload,
          }, authToken, publicUsername);
          canonicalReports.push(migrated.report);
        } catch (error) {
          migrationError = error instanceof Error ? error : new Error("A public report URL could not be updated.");
          canonicalReports.push(report);
        }
      }
      if (requestId !== summaryReportRefreshRequestRef.current) return;
      const publishedPages: ScenarioLandingPage[] = canonicalReports.map((report) => ({
        id: report.id,
        name: report.name,
        slug: report.slug,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        payload: encodeSummaryReportPayload(report.payload),
      }));
      setScenarioLandingPages(publishedPages.slice(0, SCENARIO_LANDING_PAGE_LIMIT));
      setSelectedSummaryLandingPageId((current) => current || publishedPages[0]?.id || "");
      setSummaryReportRenameDrafts((current) => ({
        ...current,
        ...Object.fromEntries(publishedPages.map((page) => [page.id, page.name])),
      }));
      if (migrationError && surfaceErrors) {
        setSummaryReportDialogError(migrationError.message);
      }
    } catch (error) {
      if (requestId !== summaryReportRefreshRequestRef.current) return;
      if (surfaceErrors) setSummaryReportDialogError(error instanceof Error ? error.message : "Public reports could not be loaded.");
      else console.warn("Public reports could not be refreshed", error);
    } finally {
      if (requestId === summaryReportRefreshRequestRef.current) setIsSummaryReportListLoading(false);
    }
  }, [authToken, publicUsername]);
  useEffect(() => {
    if (authToken && hasLoadedStorage.current && storageState === "ready") void refreshPublicSummaryReports(false);
  }, [authToken, refreshPublicSummaryReports, storageState]);
  const openSummaryReportDialog = (mode: "create" | "manage" | "publish" | "published") => {
    setIsTopbarMenuOpen(false);
    setIsShareMenuOpen(false);
    setSummaryReportDestination("new");
    setSummaryReportName(`${selectedStateCode} tax scenarios`);
    setSummaryScenarioName(`Scenario ${uiSettings.savedScenarios.length + 1}`);
    setSummaryScenarioDescription(currentScenarioDescription);
    setSelectedSummaryLandingPageId(summaryLandingPageOptions[0]?.page.id || "");
    setSummaryReportRenameDrafts(Object.fromEntries(summaryLandingPageOptions.map(({ page }) => [page.id, page.name])));
    setSummaryScenarioDrafts(Object.fromEntries(uiSettings.savedScenarios.map((scenario) => [scenario.id, { name: scenario.name, description: scenario.description }])));
    setSummaryPublishScenarioIds([]);
    setSummaryPublishDescriptions(Object.fromEntries(uiSettings.savedScenarios.map((scenario) => [scenario.id, scenario.description])));
    setSummaryScenarioPendingDeleteKey("");
    setSummaryPublishedUrl("");
    setSummaryReportDialogError("");
    setSummaryReportDialogMode(mode);
    if (mode !== "create") void refreshPublicSummaryReports();
  };
  const renameSummaryReport = async (pageId: string) => {
    if (!authToken) {
      setSummaryReportDialogError("Sign in to rename and publish scenario reports.");
      return;
    }
    const entry = summaryLandingPageOptions.find(({ page }) => page.id === pageId);
    const name = String(summaryReportRenameDrafts[pageId] || "").trim();
    if (!entry || !name) {
      setSummaryReportDialogError("Enter a report name.");
      return;
    }
    if (name.length > 80) {
      setSummaryReportDialogError("Report names can contain up to 80 characters.");
      return;
    }
    if (summaryLandingPageOptions.some(({ page }) => page.id !== pageId && normalizeLookupKey(page.name) === normalizeLookupKey(name))) {
      setSummaryReportDialogError("A scenario report with this name already exists.");
      return;
    }
    const scenarioSlug = normalizePublicReportSlug(name);
    const slug = namespacedPublicReportSlug(publicUsername, scenarioSlug);
    if (!slug || RESERVED_PUBLIC_REPORT_SLUGS.has(scenarioSlug)) {
      setSummaryReportDialogError("Choose a report name that creates a valid public URL.");
      return;
    }
    const renamedPayload = { ...entry.payload, reportName: name, generatedAt: new Date().toISOString() };
    setSummaryReportBusyId(pageId);
    setSummaryReportDialogError("");
    try {
      const saved = await upsertPublicSummaryReport({ id: pageId, name, slug, previousSlug: entry.page.slug, payload: renamedPayload }, authToken, publicUsername);
      const encodedPayload = encodeSummaryReportPayload(saved.report.payload);
      setScenarioLandingPages((current) => current.map((page) => page.id === pageId
        ? { ...page, name: saved.report.name, slug: saved.report.slug, updatedAt: saved.report.updatedAt, payload: encodedPayload }
        : page));
      setSummaryReportRenameDrafts((current) => ({ ...current, [pageId]: saved.report.name }));
      setMcpTokenMessage(`Scenario report renamed. Public link: ${saved.publicUrl}`);
    } catch (error) {
      setSummaryReportDialogError(error instanceof Error ? error.message : "Scenario report could not be renamed.");
    } finally {
      setSummaryReportBusyId("");
    }
  };
  const deleteSummaryReport = async (pageId: string) => {
    if (!authToken) {
      setSummaryReportDialogError("Sign in to delete published reports.");
      return;
    }
    const entry = summaryLandingPageOptions.find(({ page }) => page.id === pageId);
    if (!entry) return;
    if (!window.confirm(`Delete the published report “${entry.page.name}”? Its public URL will stop working.`)) return;
    setSummaryReportBusyId(pageId);
    setSummaryReportDialogError("");
    try {
      await deletePublicSummaryReport(pageId, authToken);
      setScenarioLandingPages((current) => current.filter((page) => page.id !== pageId));
      setSummaryReportRenameDrafts((current) => {
        const next = { ...current };
        delete next[pageId];
        return next;
      });
      setSelectedSummaryLandingPageId((current) => current === pageId ? "" : current);
      setMcpTokenMessage("Published report deleted.");
    } catch (error) {
      setSummaryReportDialogError(error instanceof Error ? error.message : "Published report could not be deleted.");
    } finally {
      setSummaryReportBusyId("");
    }
  };
  const copySummaryPublishedUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setMcpTokenMessage("Public summary report URL copied.");
    } catch {
      setMcpTokenMessage("Could not copy the public summary report URL.");
    }
  };
  const openPublishedReportPlainText = (name: string, payload: SummaryReportPayload) => {
    const scenarioText = payload.scenarios.map((scenario) => {
      const taxRate = scenario.income > 0 ? Math.max(0, Math.min(scenario.totalTax / scenario.income, 1)) : 0;
      const centsKept = ((1 - taxRate) * 100).toFixed(1);
      const stateName = scenario.stateName || payload.stateName || scenario.stateCode || payload.stateCode;
      return `For a ${stateName} taxpayer with income of ${formatCurrency(scenario.income)}, the government takes ${formatPercent(taxRate)}. You get to keep ${centsKept} cents for every dollar earned.`;
    }).join("\n\n");
    setPublishedReportPlainTextCopied(false);
    setPublishedReportPlainText({ name, text: scenarioText });
  };
  const copyPublishedReportPlainText = async () => {
    if (!publishedReportPlainText) return;
    try {
      await navigator.clipboard.writeText(publishedReportPlainText.text);
      setPublishedReportPlainTextCopied(true);
    } catch {
      setPublishedReportPlainTextCopied(false);
    }
  };
  const saveCurrentScenario = () => {
    const name = summaryScenarioName.trim();
    const description = summaryScenarioDescription.trim();
    if (authEnabled && !authToken) {
      setSummaryReportDialogError("Sign in to save scenarios.");
      return;
    }
    if (!name) {
      setSummaryReportDialogError("Enter a scenario name.");
      return;
    }
    if (name.length > 60) {
      setSummaryReportDialogError("Scenario names can contain up to 60 characters.");
      return;
    }
    if (description.length > 300) {
      setSummaryReportDialogError("Scenario descriptions can contain up to 300 characters.");
      return;
    }
    if (uiSettings.savedScenarios.some((scenario) => normalizeLookupKey(scenario.name) === normalizeLookupKey(name))) {
      setSummaryReportDialogError("A scenario with this name already exists.");
      return;
    }
    if (uiSettings.savedScenarios.length >= SAVED_SCENARIO_LIMIT) {
      setSummaryReportDialogError(`You can save up to ${SAVED_SCENARIO_LIMIT} scenarios.`);
      return;
    }
    const scenario = buildCurrentScenario(name, description);
    setUiSettings((current) => ({ ...current, savedScenarios: [scenario, ...current.savedScenarios] }));
    setSummaryScenarioDrafts((current) => ({ ...current, [scenario.id]: { name: scenario.name, description: scenario.description } }));
    setSummaryReportDialogMode(null);
    setMcpTokenMessage("Scenario saved to your private scenario library.");
  };
  const saveManagedScenario = (scenarioId: string, remove = false) => {
    const scenario = uiSettings.savedScenarios.find((candidate) => candidate.id === scenarioId);
    if (!scenario) {
      setSummaryReportDialogError("This scenario could not be found.");
      return;
    }
    const draft = summaryScenarioDrafts[scenarioId] || { name: scenario.name, description: scenario.description };
    const scenarioName = draft.name.trim();
    const scenarioDescription = draft.description.trim();
    if (!remove && !scenarioName) {
      setSummaryReportDialogError("Enter a scenario name.");
      return;
    }
    if (!remove && scenarioName.length > 60) {
      setSummaryReportDialogError("Scenario names can contain up to 60 characters.");
      return;
    }
    if (!remove && scenarioDescription.length > 300) {
      setSummaryReportDialogError("Scenario descriptions can contain up to 300 characters.");
      return;
    }
    if (!remove && uiSettings.savedScenarios.some((candidate) => candidate.id !== scenarioId && normalizeLookupKey(candidate.name) === normalizeLookupKey(scenarioName))) {
      setSummaryReportDialogError("Use a scenario name that is not already in your library.");
      return;
    }
    setUiSettings((current) => ({
      ...current,
      savedScenarios: remove
        ? current.savedScenarios.filter((candidate) => candidate.id !== scenarioId)
        : current.savedScenarios.map((candidate) => candidate.id === scenarioId
          ? { ...candidate, name: scenarioName, description: scenarioDescription }
          : candidate),
    }));
    setSummaryScenarioDrafts((current) => {
      if (!remove) return { ...current, [scenarioId]: { name: scenarioName, description: scenarioDescription } };
      const next = { ...current };
      delete next[scenarioId];
      return next;
    });
    setSummaryPublishScenarioIds((current) => current.filter((id) => id !== scenarioId));
    setSummaryScenarioPendingDeleteKey("");
    setSummaryReportDialogError("");
    setMcpTokenMessage(remove ? "Scenario removed from your library." : "Scenario changes saved.");
  };
  const togglePublishedScenario = (scenarioId: string) => {
    if (summaryPublishScenarioIds.includes(scenarioId)) {
      setSummaryPublishScenarioIds((current) => current.filter((id) => id !== scenarioId));
      setSummaryReportDialogError("");
      return;
    }
    if (summaryPublishScenarioIds.length >= PUBLISHED_SCENARIO_LIMIT) {
      setSummaryReportDialogError(`Select up to ${PUBLISHED_SCENARIO_LIMIT} scenarios for one landing page.`);
      return;
    }
    const scenario = uiSettings.savedScenarios.find((candidate) => candidate.id === scenarioId);
    setSummaryPublishScenarioIds((current) => [...current, scenarioId]);
    if (scenario) {
      setSummaryPublishDescriptions((current) => ({ ...current, [scenarioId]: current[scenarioId] ?? scenario.description }));
    }
    setSummaryReportDialogError("");
  };
  const publishSelectedScenarios = async () => {
    if (!authToken) {
      setSummaryReportDialogError("Sign in to publish scenarios.");
      return;
    }
    const selectedScenarios = summaryPublishScenarioIds
      .map((scenarioId) => uiSettings.savedScenarios.find((scenario) => scenario.id === scenarioId))
      .filter((scenario): scenario is SummaryReportScenario => Boolean(scenario));
    if (selectedScenarios.length < 1 || selectedScenarios.length > PUBLISHED_SCENARIO_LIMIT) {
      setSummaryReportDialogError(`Select between 1 and ${PUBLISHED_SCENARIO_LIMIT} scenarios.`);
      return;
    }
    const scenarios = selectedScenarios.map((scenario) => ({
      ...scenario,
      description: String(summaryPublishDescriptions[scenario.id] ?? scenario.description).trim(),
    }));
    if (scenarios.some((scenario) => scenario.description.length > 300)) {
      setSummaryReportDialogError("Published scenario descriptions can contain up to 300 characters.");
      return;
    }
    let landingPageId = selectedSummaryLandingPageId;
    let previousSlug: string | undefined;
    let reportName = summaryReportName.trim();
    let reportSlug: string;
    if (summaryReportDestination === "existing") {
      const existingEntry = summaryLandingPageOptions.find((entry) => entry.page.id === selectedSummaryLandingPageId);
      if (!existingEntry) {
        setSummaryReportDialogError("Select an existing landing page.");
        return;
      }
      reportName = existingEntry.page.name;
      const existingScenarioSlug = normalizePublicReportSlug(existingEntry.page.name);
      reportSlug = namespacedPublicReportSlug(publicUsername, existingScenarioSlug);
      previousSlug = existingEntry.page.slug;
    } else {
      if (!reportName) {
        setSummaryReportDialogError("Enter a landing page name.");
        return;
      }
      if (scenarioLandingPages.some((page) => normalizeLookupKey(page.name) === normalizeLookupKey(reportName))) {
        setSummaryReportDialogError("A published landing page with this name already exists.");
        return;
      }
      if (scenarioLandingPages.length >= SCENARIO_LANDING_PAGE_LIMIT) {
        setSummaryReportDialogError(`You can publish up to ${SCENARIO_LANDING_PAGE_LIMIT} landing pages.`);
        return;
      }
      landingPageId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `scenario-page-${Date.now()}`;
      reportSlug = namespacedPublicReportSlug(publicUsername, reportName);
    }
    if (!reportSlug || RESERVED_PUBLIC_REPORT_SLUGS.has(normalizePublicReportSlug(reportName))) {
      setSummaryReportDialogError("Choose a landing page name that creates a valid public URL.");
      return;
    }
    const firstScenario = scenarios[0];
    const reportPayload: SummaryReportPayload = {
      ...currentSummaryReportPayload,
      reportName,
      generatedAt: new Date().toISOString(),
      income: firstScenario.income,
      afterTaxIncome: firstScenario.afterTaxIncome,
      marginalTaxRateLabel: firstScenario.marginalTaxRateLabel,
      effectiveTaxRate: firstScenario.effectiveTaxRate,
      federalTax: firstScenario.federalTax,
      stateTax: firstScenario.stateTax,
      localTax: firstScenario.localTax,
      totalTax: firstScenario.totalTax,
      stateCode: firstScenario.stateCode || currentSummaryReportPayload.stateCode,
      stateName: firstScenario.stateName || currentSummaryReportPayload.stateName,
      localityName: firstScenario.localityName || currentSummaryReportPayload.localityName,
      filingStatus: firstScenario.filingStatus || currentSummaryReportPayload.filingStatus,
      scenarios,
    };
    setSummaryReportBusyId("publish");
    setSummaryReportDialogError("");
    try {
      const saved = await upsertPublicSummaryReport({ id: landingPageId, name: reportName, slug: reportSlug, previousSlug, payload: reportPayload }, authToken, publicUsername);
      const encodedPayload = encodeSummaryReportPayload(saved.report.payload);
      setScenarioLandingPages((current) => {
        if (summaryReportDestination === "existing") {
          return current.map((page) => page.id === landingPageId
            ? { ...page, name: saved.report.name, slug: saved.report.slug, updatedAt: saved.report.updatedAt, payload: encodedPayload }
            : page);
        }
        return [{ id: landingPageId, name: saved.report.name, slug: saved.report.slug, createdAt: saved.report.createdAt, updatedAt: saved.report.updatedAt, payload: encodedPayload }, ...current];
      });
      setSummaryReportRenameDrafts((current) => ({ ...current, [landingPageId]: saved.report.name }));
      setSummaryPublishedUrl(saved.publicUrl);
      try {
        await navigator.clipboard.writeText(saved.publicUrl);
        setMcpTokenMessage("Summary report published and public link copied.");
      } catch {
        setMcpTokenMessage("Summary report published.");
      }
      window.location.assign(saved.publicUrl);
    } catch (error) {
      setSummaryReportDialogError(error instanceof Error ? error.message : "Scenarios could not be published.");
    } finally {
      setSummaryReportBusyId("");
    }
  };
  const signInUsernamePreview = normalizePublicReportSlug(signInPublicUsername).slice(0, 32);
  const beginCognitoSignIn = async (entryMode: AuthEntryMode = authEntryMode) => {
    if (entryMode === "create" && signInPublicUsername.trim() && (!signInUsernamePreview || RESERVED_PUBLIC_REPORT_SLUGS.has(signInUsernamePreview))) {
      setSignInPublicUsernameError("Choose a username containing letters or numbers that is not reserved by AfterTax US.");
      return;
    }
    setSignInPublicUsernameError("");
    if (entryMode === "create" && signInUsernamePreview) {
      setIsUsernameRequestPending(true);
      try {
        const available = await checkPublicUsernameAvailability(signInUsernamePreview);
        if (!available) {
          setSignInPublicUsernameError("That username is already used by another account. Choose a different username.");
          return;
        }
      } catch (error) {
        setSignInPublicUsernameError(error instanceof Error ? error.message : "Username availability could not be checked.");
        return;
      } finally {
        setIsUsernameRequestPending(false);
      }
    }
    await startCognitoSignIn(entryMode === "create" ? signInUsernamePreview : "", entryMode);
  };
  const openAuthEntry = (mode: AuthEntryMode) => {
    setIsTopbarMenuOpen(false);
    if (mode === "signIn") {
      setSignInPublicUsernameError("");
      void startCognitoSignIn("", "signIn");
      return;
    }
    setAuthEntryMode(mode);
    setSignInPublicUsernameError("");
    setIsAuthEntryOpen(true);
    if (mode === "create") window.requestAnimationFrame(() => signInUsernameInputRef.current?.focus());
  };
  const openSettingsDialog = () => {
    setIsTopbarMenuOpen(false);
    setSettingsUsernameDraft(publicUsername);
    setSettingsUsernameError("");
    setIsSettingsDialogOpen(true);
    window.requestAnimationFrame(() => {
      settingsUsernameInputRef.current?.focus();
      settingsUsernameInputRef.current?.select();
    });
  };
  const savePublicUsername = async () => {
    const normalized = normalizePublicReportSlug(settingsUsernameDraft).slice(0, 32);
    if (settingsUsernameDraft.trim() && (!normalized || RESERVED_PUBLIC_REPORT_SLUGS.has(normalized))) {
      setSettingsUsernameError("Choose a username containing letters or numbers that is not reserved by AfterTax US.");
      return;
    }
    const nextUsername = resolvePublicUsername(
      authState.status === "signedIn" ? authState.user : null,
      undefined,
      normalized
    );
    if (!nextUsername || RESERVED_PUBLIC_REPORT_SLUGS.has(nextUsername)) {
      setSettingsUsernameError("Enter a different public username.");
      return;
    }
    if (authState.status !== "signedIn") {
      setSettingsUsernameError("Sign in before changing your public username.");
      return;
    }
    setIsUsernameRequestPending(true);
    setSettingsUsernameError("");
    try {
      await claimPublicUsername(nextUsername, authState.tokens.idToken);
      usernameClaimAttemptRef.current = `${authState.user.sub}:${nextUsername}`;
      writeStoredPublicUsername(nextUsername);
      setSignInPublicUsername(nextUsername);
      setUiSettings((current) => ({ ...current, publicUsername: nextUsername }));
      setStorageState("ready");
      setIsSettingsDialogOpen(false);
    } catch (error) {
      setSettingsUsernameError(error instanceof Error ? error.message : "Username could not be saved.");
    } finally {
      setIsUsernameRequestPending(false);
    }
  };
  const authEntryDialog = isAuthEntryOpen ? createPortal(
    <div className="auth-entry-dialog__backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setIsAuthEntryOpen(false);
    }}>
      <section className="auth-entry-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-entry-dialog-title">
        <header className="auth-entry-dialog__header">
          <div>
            <p className="eyebrow">AfterTax US account</p>
            <h3 id="auth-entry-dialog-title">Sign in or create account</h3>
          </div>
          <button type="button" onClick={() => setIsAuthEntryOpen(false)} aria-label="Close account dialog">×</button>
        </header>
        <p className="auth-entry-dialog__copy">
          Sign in to your saved workbook, or create a new account. If you create an account, the optional public username is used in published scenario URLs.
        </p>
        <div className="auth-required-panel__form">
          <label className="auth-required-panel__username">
            <span>Public username <small>Optional for new accounts</small></span>
            <input
              ref={signInUsernameInputRef}
              value={signInPublicUsername}
              maxLength={32}
              autoComplete="username"
              placeholder="Example: kevin"
              onChange={(event) => {
                setSignInPublicUsername(event.target.value);
                setSignInPublicUsernameError("");
              }}
              onKeyDown={(event) => { if (event.key === "Enter") void beginCognitoSignIn("create"); }}
            />
            <small>Used only when creating an account. Leave blank to use the part of your email before @.</small>
          </label>
          <div className="auth-required-panel__preview">
            {PUBLIC_SITE_ORIGIN}/{signInUsernamePreview || "email-username"}/ca-tax-scenarios
          </div>
          {signInPublicUsernameError && <div className="auth-required-panel__error" role="alert">{signInPublicUsernameError}</div>}
          <div className="auth-required-panel__actions">
            <button className="primary-button" type="button" onClick={() => { void beginCognitoSignIn("signIn"); }} disabled={authState.status === "loading" || isUsernameRequestPending}>
              {authState.status === "loading" ? "Signing in..." : "Sign in"}
            </button>
            <button className="ghost-button" type="button" onClick={() => { void beginCognitoSignIn("create"); }} disabled={authState.status === "loading" || isUsernameRequestPending}>
              {isUsernameRequestPending ? "Checking username..." : "Create account"}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  ) : null;
  const isClearAllConfirmed = clearAllConfirmation.trim().toUpperCase() === "DELETE EVERYTHING";
  const clearEntireAccount = async () => {
    if (!isClearAllConfirmed || isClearingAll) return;
    setIsClearingAll(true);
    setClearAllError("");
    try {
      if (authToken) await Promise.all(scenarioLandingPages.map((page) => deletePublicSummaryReport(page.id, authToken)));
      setInvestments([]);
      setTickers([]);
      setCategories(clearAllReferenceMode === "keep" ? categories : []);
      setTaxTreatments(clearAllReferenceMode === "keep" ? taxTreatments : []);
      setAccounts([]);
      setAccountTaxTypes(clearAllReferenceMode === "keep" ? accountTaxTypes : []);
      setAccountTypes(clearAllReferenceMode === "keep" ? accountTypes : []);
      setFederalSettings(initialFederalSettings);
      setStateSettings(initialStateSettings);
      setLocalTaxSettings(initialLocalTaxSettings);
      setPlannerSettings(initialPlannerSettings);
      setUiSettings(initialUiSettings);
      setSelectedInvestmentIds([]);
      setIsWhatIfActive(false);
      setScenarioLandingPages([]);
      setSummaryPublishScenarioIds([]);
      setSummaryReportDialogMode(null);
      historyRef.current = { past: [], present: "", future: [] };
      historyInitialized.current = false;
      setHistoryVersion((version) => version + 1);
      setIsClearAllDialogOpen(false);
      setClearAllConfirmation("");
      setMcpTokenMessage("All account data was cleared.");
    } catch (error) {
      setClearAllError(error instanceof Error ? error.message : "The account could not be completely cleared.");
    } finally {
      setIsClearingAll(false);
    }
  };
  const clearAllDialog = isClearAllDialogOpen ? createPortal(
    <div className="auth-entry-dialog__backdrop" role="presentation" onMouseDown={(event) => { if (!isClearingAll && event.target === event.currentTarget) setIsClearAllDialogOpen(false); }}>
      <section className="auth-entry-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-all-dialog-title" aria-describedby="clear-all-dialog-warning">
        <header className="auth-entry-dialog__header">
          <div><p className="eyebrow">Danger zone</p><h3 id="clear-all-dialog-title">Clear the entire account?</h3></div>
          <button type="button" disabled={isClearingAll} onClick={() => setIsClearAllDialogOpen(false)} aria-label="Close clear account dialog">&times;</button>
        </header>
        <div className="status-card status-card--error" id="clear-all-dialog-warning"><strong>Permanent account wipe.</strong> This deletes all investments, assets, accounts, tax settings, saved versions, scenarios, and published scenario pages. {clearAllReferenceMode === "clean" ? "The reference lists below will also be deleted." : "The selected reference defaults below will be retained."} This cannot be undone.</div>
        <fieldset className="auth-required-panel__form">
          <legend><strong>Choose the starting point after the wipe</strong></legend>
          <label className="summary-report-dialog__publish-selector">
            <input type="radio" name="clear-reference-mode" value="keep" checked={clearAllReferenceMode === "keep"} onChange={() => setClearAllReferenceMode("keep")} />
            <span><strong>Keep current lookup defaults</strong><small>Retain {categories.length} asset classes, {taxTreatments.length} tax treatments, {accountTaxTypes.length} account tax categories, and {accountTypes.length} account types from the currently loaded sheet.</small></span>
          </label>
          <label className="summary-report-dialog__publish-selector">
            <input type="radio" name="clear-reference-mode" value="clean" checked={clearAllReferenceMode === "clean"} onChange={() => setClearAllReferenceMode("clean")} />
            <span><strong>Clean slate</strong><small>Delete all lookup lists too. You will need to define every class, treatment, tax category, and account type again.</small></span>
          </label>
        </fieldset>
        <label className="auth-required-panel__username">
          <span>Type <strong>DELETE EVERYTHING</strong> to confirm</span>
          <input value={clearAllConfirmation} autoComplete="off" onChange={(event) => { setClearAllConfirmation(event.target.value); setClearAllError(""); }} autoFocus />
        </label>
        {clearAllError && <div className="auth-required-panel__error" role="alert">{clearAllError}</div>}
        <div className="settings-dialog__actions">
          <button className="ghost-button" type="button" disabled={isClearingAll} onClick={() => setIsClearAllDialogOpen(false)}>Cancel</button>
          <button className={isClearAllConfirmed ? "primary-button" : "ghost-button"} type="button" disabled={!isClearAllConfirmed || isClearingAll} onClick={() => { void clearEntireAccount(); }}>{isClearingAll ? "Wiping everything…" : "Wipe everything"}</button>
        </div>
      </section>
    </div>, document.body
  ) : null;
  const settingsDialog = isSettingsDialogOpen ? createPortal(
    <div className="auth-entry-dialog__backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setIsSettingsDialogOpen(false);
    }}>
      <section className="auth-entry-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
        <header className="auth-entry-dialog__header">
          <div>
            <p className="eyebrow">Account settings</p>
            <h3 id="settings-dialog-title">Edit public username</h3>
          </div>
          <button type="button" onClick={() => setIsSettingsDialogOpen(false)} aria-label="Close settings dialog">&times;</button>
        </header>
        <p className="auth-entry-dialog__copy">Your username appears in published scenario URLs. Changing it updates the URLs used for your reports.</p>
        <div className="auth-required-panel__form">
          <label className="auth-required-panel__username">
            <span>Public username</span>
            <input
              ref={settingsUsernameInputRef}
              value={settingsUsernameDraft}
              maxLength={32}
              autoComplete="username"
              placeholder="Example: kevin"
              onChange={(event) => {
                setSettingsUsernameDraft(event.target.value);
                setSettingsUsernameError("");
              }}
              onKeyDown={(event) => { if (event.key === "Enter") void savePublicUsername(); }}
            />
            <small>Leave blank to use the part of your email before @.</small>
          </label>
          <div className="auth-required-panel__preview">
            {PUBLIC_SITE_ORIGIN}/{normalizePublicReportSlug(settingsUsernameDraft).slice(0, 32) || resolvePublicUsername(authState.status === "signedIn" ? authState.user : null)}/ca-tax-scenarios
          </div>
          {settingsUsernameError && <div className="auth-required-panel__error" role="alert">{settingsUsernameError}</div>}
          <div className="settings-dialog__actions">
            <button className="ghost-button" type="button" onClick={() => setIsSettingsDialogOpen(false)}>Cancel</button>
            <button className="primary-button" type="button" onClick={() => { void savePublicUsername(); }} disabled={isUsernameRequestPending}>
              {isUsernameRequestPending ? "Checking..." : "Save Username"}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  ) : null;
  const actionMenu = (
    <div className="topbar-menu app-action-menu" ref={topbarMenuRef}>
      <button className="ai-button topbar-menu__trigger app-action-menu__trigger" type="button" onClick={() => setIsTopbarMenuOpen((current) => { if (current) setIsShareMenuOpen(false); return !current; })} aria-haspopup="menu" aria-expanded={isTopbarMenuOpen} aria-label="Open actions menu" title="Menu">
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
                <button className="topbar-menu__item" type="button" role="menuitem" onClick={openSettingsDialog}>
                  <TopbarActionIcon name="settings" />
                  <span className="topbar-menu__label">
                    <span>Settings</span>
                    <small>@{publicUsername}</small>
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
              <button className="topbar-menu__item" type="button" role="menuitem" onClick={() => openAuthEntry("signIn")} disabled={authState.status === "loading"}>
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
          <button className="topbar-menu__item" type="button" role="menuitemcheckbox" aria-checked={showInvestmentRowNumbers} onClick={() => { setShowInvestmentRowNumbers((current) => !current); setIsTopbarMenuOpen(false); }}>
            <TopbarActionIcon name="sheet" />
            <span>{showInvestmentRowNumbers ? "Hide row numbers" : "Show row numbers"}</span>
          </button>
          <button className="topbar-menu__item" type="button" role="menuitemcheckbox" aria-checked={uiSettings.darkMode} onClick={toggleDarkMode}>
            <TopbarActionIcon name="theme" />
            <span>{uiSettings.darkMode ? "Light Mode" : "Dark Mode"}</span>
          </button>
          <div className="topbar-menu__submenu">
            <button className="topbar-menu__item topbar-menu__submenu-trigger" type="button" role="menuitem" aria-haspopup="menu" aria-expanded={isShareMenuOpen} onClick={() => setIsShareMenuOpen((current) => !current)}>
              <TopbarActionIcon name="report" />
              <span>Share</span>
              <span className="topbar-menu__submenu-chevron" aria-hidden="true">›</span>
            </button>
            {isShareMenuOpen && (
              <div className="topbar-menu__panel topbar-menu__submenu-panel" role="menu" aria-label="Share actions">
                <button className="topbar-menu__item" type="button" role="menuitem" onClick={() => openSummaryReportDialog("create")}>
                  <TopbarActionIcon name="report" />
                  <span>Create a Scenario</span>
                </button>
                <button className="topbar-menu__item" type="button" role="menuitem" onClick={() => openSummaryReportDialog("manage")}>
                  <TopbarActionIcon name="report" />
                  <span>Manage Scenarios</span>
                </button>
                <button className="topbar-menu__item" type="button" role="menuitem" onClick={() => openSummaryReportDialog("publish")}>
                  <TopbarActionIcon name="report" />
                  <span>Publish Summary Report</span>
                </button>
                <button className="topbar-menu__item" type="button" role="menuitem" onClick={() => openSummaryReportDialog("published")}>
                  <TopbarActionIcon name="report" />
                  <span>Manage Published Reports</span>
                </button>
              </div>
            )}
          </div>
          <button className="topbar-menu__item" type="button" role="menuitem" onClick={() => { setIsTopbarMenuOpen(false); setClearAllConfirmation(""); setClearAllReferenceMode("keep"); setClearAllError(""); setIsClearAllDialogOpen(true); }}>
            <TopbarActionIcon name="delete" />
            <span className="topbar-menu__label"><span>Clear all</span><small>Wipe account data</small></span>
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
  const kpiMetrics: KpiMetricConfig[] = [
    {
      label: `${isMonthlyIncomePrimary ? "Monthly" : "Annual"} after-tax income`,
      value: formatCurrency(isMonthlyIncomePrimary ? afterTaxMonthlyIncome : afterTaxIncome),
      valueLabel: isMonthlyIncomePrimary ? "monthly after tax" : "annual after tax",
      secondaryValue: `${formatCurrency(isMonthlyIncomePrimary ? afterTaxIncome : afterTaxMonthlyIncome)} ${isMonthlyIncomePrimary ? "annual" : "monthly"}`,
      numericValue: isMonthlyIncomePrimary ? afterTaxMonthlyIncome : afterTaxIncome,
      primary: true,
      tone: "warning",
      details: incomeBreakdownDetails,
      badge: excludedIncomeBadge,
      alternateAriaLabel: `Show ${isMonthlyIncomePrimary ? "monthly" : "annual"} pre-tax income`,
      alternateContent: (
        <>
          <span className="kpi-pill__alternate-label">{isMonthlyIncomePrimary ? "Monthly" : "Annual"} pre-tax income</span>
          <span className="kpi-pill__alternate-main-line">
            <strong>{formatCurrency(isMonthlyIncomePrimary ? monthlyIncome : totalIncome)}</strong>
            <span>{isMonthlyIncomePrimary ? "monthly before tax" : "annual before tax"}</span>
          </span>
          <small>{formatCurrency(isMonthlyIncomePrimary ? afterTaxMonthlyIncome : afterTaxIncome)} after tax</small>
        </>
      ),
      inlineControl: (
        <IncomePeriodToggle
          period={uiSettings.incomePrimaryPeriod}
          onChange={(incomePrimaryPeriod) => setUiSettings((current) => ({ ...current, incomePrimaryPeriod }))}
        />
      ),
    },
    {
      label: "Tax rate",
      value: allInMarginalTaxRateLabel,
      valueLabel: "marginal",
      secondaryValue: `${allInEffectiveTaxRateLabel} effective`,
      numericValue: allInMarginalTaxRate,
      deltaKind: "percent",
      details: taxRateBreakdownDetails,
      alternateAriaLabel: "Show federal, state, and local effective and marginal tax rates",
      alternateContent: (
        <>
          <span className="kpi-pill__alternate-label">Effective / marginal by jurisdiction</span>
          <span className="kpi-pill__alternate-rate-headings"><span>Effective</span><span>Marginal</span></span>
          <span className="kpi-pill__alternate-rates">
            <span><b>Federal</b><strong>{formatPercent(totalIncome > 0 ? federalTaxWithPayroll / totalIncome : 0)}</strong><strong>{formatPercent(marginalFederalRate + marginalW2PayrollRate + marginalNiitRate)}</strong></span>
            <span><b>{selectedStateCode}</b><strong>{formatPercent(totalIncome > 0 ? stateTaxWithPayroll / totalIncome : 0)}</strong><strong>{formatPercent(marginalStateRate)}</strong></span>
            <span><b>Local</b><strong>{formatPercent(totalIncome > 0 ? localTaxTotal / totalIncome : 0)}</strong><strong>{formatPercent(marginalLocalRate)}</strong></span>
          </span>
        </>
      ),
    },
    {
      label: "Total investment",
      value: formatCurrency(flows.totalInvestmentAmount),
      valueLabel: "invested",
      secondaryValue: `${formatPercent(portfolioAfterTaxYield)} after tax • ${formatPercent(portfolioBeforeTaxYield)} before tax yield`,
      numericValue: flows.totalInvestmentAmount,
      tone: "accent",
      details: investmentYieldBreakdownDetails,
      alternateAriaLabel: "Show before-tax yield and after-tax return",
      alternateContent: (
        <>
          <span className="kpi-pill__alternate-label">Portfolio return</span>
          <span className="kpi-pill__alternate-yields">
            <span><b>After-tax return</b><strong>{formatPercent(portfolioAfterTaxYield)}</strong></span>
            <span><b>Before-tax yield</b><strong>{formatPercent(portfolioBeforeTaxYield)}</strong></span>
          </span>
        </>
      ),
    },
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
      portfolioBeforeTaxYield,
      portfolioAfterTaxYield,
      investmentIncome: flows.investmentIncome,
      investmentAfterTaxIncome,
      afterTaxIncome,
      federalTax: federalTaxWithPayroll,
      stateTax: stateTaxWithPayroll,
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
    if (config.tableId === "tickers" && field === "assetType") {
      if (typeof value === "boolean") return value ? "Income" : "ETF";
      const normalized = normalizeLookupKey(value);
      const option = categoryOptions.find((candidate) => normalizeLookupKey(candidate) === normalized);
      return option || String(value ?? "");
    }
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
        assettype: "assetType",
        type: "assetType",
        securitytype: "assetType",
        category: "category",
        taxtreatment: "taxTreatment",
        taxstatus: "taxTreatment",
        incomeitem: "assetType",
        isincomeitem: "assetType",
        incometicker: "assetType",
        income: "assetType",
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
        allocation: "includeInAllocation",
        includeinallocation: "includeInAllocation",
        selected: "includeInAllocation",
      },
      taxTreatment: {
        taxtreatment: "label",
        taxstatus: "label",
        treatment: "label",
        label: "label",
        name: "label",
        allocation: "includeInAllocation",
        includeinallocation: "includeInAllocation",
        selected: "includeInAllocation",
      },
      accountTaxType: {
        taxstatus: "taxStatus",
        taxtreatment: "taxStatus",
        status: "taxStatus",
        label: "taxStatus",
        name: "taxStatus",
        allocation: "includeInAllocation",
        includeinallocation: "includeInAllocation",
        selected: "includeInAllocation",
      },
      accountType: {
        accounttype: "name",
        type: "name",
        label: "name",
        name: "name",
        taxstatus: "taxStatus",
        taxtreatment: "taxStatus",
        status: "taxStatus",
        allocation: "includeInAllocation",
        includeinallocation: "includeInAllocation",
        selected: "includeInAllocation",
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
          allowedFields: ["symbol", "percentReturn", "assetType", "category", "taxTreatment", "extraData", "description", "exDividend", "divPayout"],
          numericFields: ["percentReturn", "extraData"],
          booleanFields: [],
          defaultRow: (id) => ({ id, symbol: "", percentReturn: 0, assetType: categoryOptions[1] || "", category: categoryOptions[1] || "", taxTreatment: "income", incomeItem: false, extraData: 0, description: "", exDividend: "", divPayout: "" }),
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
          allowedFields: ["label", "ordinaryShare", "preferredShare", "stateRule", "niitIncluded", "localCategory", "description"],
          numericFields: ["ordinaryShare", "preferredShare"],
          booleanFields: ["niitIncluded"],
          defaultRow: (id) => ({ id, label: "", ...defaultTaxTreatmentRule("income") }),
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

    if (actionType === "updateSettings") {
      const payload = ((action as any).payload || {}) as Record<string, unknown>;
      const section = String(payload.section || "");
      const values = payload.values && typeof payload.values === "object" && !Array.isArray(payload.values)
        ? payload.values as Record<string, unknown>
        : {};
      const allowedFields: Record<string, string[]> = {
        federal: ["filingStatus", "deductionMode", "extraOrdinaryIncome", "extraPreferredIncome", "extraOrdinaryItems", "extraPreferredItems", "aboveLineDeductionItems", "deductionItems", "mortgageInterest", "propertyTax"],
        state: ["stateCode", "extraStateIncome", "deductionMode", "deductionItems", "mortgageInterest", "propertyTax", "standardDeduction"],
        local: ["enabled", "localityId", "localityName", "residency", "rate", "nonresidentRate", "taxableBase"],
        planner: ["federalWithholding", "stateWithholding"],
        ui: ["incomePrimaryPeriod", "darkMode", "investmentFavorites", "selectedAssetIds"],
      };
      if (!allowedFields[section]) return { ok: false, message: `Rejected updateSettings: ${section || "(blank)"} is not an editable settings section.` };
      const rejected = Object.keys(values).filter((field) => !allowedFields[section].includes(field));
      if (rejected.length) return { ok: false, message: `Rejected updateSettings: unsupported ${section} field(s) ${rejected.join(", ")}.` };
      if (Object.keys(values).length === 0) return { ok: false, message: "Rejected updateSettings: no settings were supplied." };

      if (section === "ui") {
        if (values.darkMode !== undefined && typeof values.darkMode !== "boolean") return { ok: false, message: "Rejected updateSettings: darkMode must be true or false." };
        if (values.incomePrimaryPeriod !== undefined && values.incomePrimaryPeriod !== "annual" && values.incomePrimaryPeriod !== "monthly") return { ok: false, message: "Rejected updateSettings: incomePrimaryPeriod must be annual or monthly." };
        if (values.investmentFavorites !== undefined && !Array.isArray(values.investmentFavorites)) return { ok: false, message: "Rejected updateSettings: investmentFavorites must be an array." };
        if (values.selectedAssetIds !== undefined && !Array.isArray(values.selectedAssetIds)) return { ok: false, message: "Rejected updateSettings: selectedAssetIds must be an array." };
      }

      recordUndoCheckpoint();
      if (section === "federal") setFederalSettings((current) => normalizeFederalSettings({ ...current, ...values }));
      if (section === "state") setStateSettings((current) => normalizeStateSettings({ ...current, ...values }));
      if (section === "local") setLocalTaxSettings((current) => normalizeLocalTaxSettings({ ...current, ...values }));
      if (section === "planner") {
        setPlannerSettings((current) => ({
          ...current,
          ...Object.fromEntries(Object.entries(values).map(([field, value]) => [field, Math.max(0, Number(value) || 0)])),
        }));
      }
      if (section === "ui") {
        if (Array.isArray(values.selectedAssetIds)) {
          const validIds = new Set(investments.map((row) => row.id));
          setSelectedInvestmentIds(values.selectedAssetIds.map(Number).filter((id) => validIds.has(id)));
        }
        const { selectedAssetIds: _selectedAssetIds, ...uiValues } = values;
        setUiSettings((current) => ({
          ...current,
          ...uiValues,
          investmentFavorites: Array.isArray(uiValues.investmentFavorites)
            ? uiValues.investmentFavorites.map(String).filter(Boolean)
            : current.investmentFavorites,
        } as UiSettings));
      }
      return { ok: true, message: `Updated ${Object.keys(values).join(", ")} in ${section} settings; recalculation and backend save are queued.` };
    }

    if (actionType === "setWhatIf") {
      const payload = ((action as any).payload || {}) as Record<string, unknown>;
      if (typeof payload.enabled !== "boolean") return { ok: false, message: "Rejected setWhatIf: enabled must be true or false." };
      const scope = String(payload.scope || "investments");
      if (scope === "investments") setIsWhatIfActive(payload.enabled);
      else if (scope === "federal") { setIsFederalTaxWhatIfOpen(payload.enabled); setActiveTab("federal"); }
      else if (scope === "state") { setIsStateTaxWhatIfOpen(payload.enabled); setActiveTab("state"); }
      else return { ok: false, message: `Rejected setWhatIf: ${scope} is not a supported scope.` };
      return { ok: true, message: `${payload.enabled ? "Opened" : "Closed"} ${scope} What-If controls.` };
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
  if (publicReportLoadState === "loading") {
    return <AppSplash message="Loading public scenario report..." />;
  }

  if (publicReportLoadState === "error") {
    return <PublicReportStatus title="Report unavailable" message={publicReportLoadError} />;
  }

  if (summaryReportPayload) {
    return <SummaryReportStandalone payload={summaryReportPayload} />;
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
    <div className={`app-shell ${uiSettings.darkMode ? "app-shell--dark" : ""}`}>
      {isCameraFlashing && (
        <div
          className="camera-flash"
          style={{ "--camera-flash-x": `${cameraFlashOrigin.x}px`, "--camera-flash-y": `${cameraFlashOrigin.y}px` } as CSSProperties}
          aria-hidden="true"
        >
          <span className="camera-flash__source" />
        </div>
      )}
      {summaryReportDialogMode && createPortal(
        <div className="summary-report-dialog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSummaryReportDialogMode(null); }}>
          <section className="summary-report-dialog" role="dialog" aria-modal="true" aria-labelledby="summary-report-dialog-title">
            <div className="summary-report-dialog__header">
              <div>
                <p className="eyebrow">{summaryReportDialogMode === "publish" || summaryReportDialogMode === "published" ? "Public Landing Pages" : "Scenario Library"}</p>
                <h3 id="summary-report-dialog-title">{summaryReportDialogMode === "create" ? "Create a scenario" : summaryReportDialogMode === "manage" ? "Manage scenarios" : summaryReportDialogMode === "published" ? "Manage published reports" : "Publish summary report"}</h3>
              </div>
              <button className="summary-report-dialog__close" type="button" onClick={() => setSummaryReportDialogMode(null)} aria-label="Close scenario dialog">×</button>
            </div>
            <p className="summary-report-dialog__copy">{summaryReportDialogMode === "create"
              ? "Save the current workbook values as a private scenario. Nothing is published from this step."
              : summaryReportDialogMode === "manage"
                ? "Add, rename, describe, or remove scenarios in your private scenario library."
                : summaryReportDialogMode === "published"
                  ? "View, open, rename, or permanently delete each report you have published."
                : `Select up to ${PUBLISHED_SCENARIO_LIMIT} saved scenarios, tailor their descriptions, and publish them on one landing page with a visible public URL.`}</p>

            {summaryReportDialogMode === "create" ? (
              <>
                <div className="summary-report-dialog__section-heading">
                  <span>Current workbook snapshot</span>
                  <small>Private until you choose Publish Scenarios.</small>
                </div>
                <div className="summary-report-dialog__current">
                  <div><span>Current summary</span><strong>{formatCurrencyDetailed(flows.displayIncome)} annual income</strong></div>
                  <dl>
                    <div><dt>W-2 wages</dt><dd>{formatCurrencyDetailed(effectiveW2Income)}</dd></div>
                    <div><dt>Investment income</dt><dd>{formatCurrencyDetailed(flows.investmentIncome)}</dd></div>
                    <div><dt>Total estimated tax</dt><dd>{formatCurrencyDetailed(totalTax)}</dd></div>
                    <div><dt>After-tax income</dt><dd>{formatCurrencyDetailed(afterTaxIncome)}</dd></div>
                  </dl>
                </div>
                <label className="summary-report-dialog__field">
                  <span>Scenario name</span>
                  <input value={summaryScenarioName} maxLength={60} onChange={(event) => { setSummaryScenarioName(event.target.value); setSummaryReportDialogError(""); }} placeholder="Example: Salary and dividend mix" autoFocus />
                </label>
                <label className="summary-report-dialog__field">
                  <span>Scenario description</span>
                  <textarea value={summaryScenarioDescription} maxLength={300} rows={3} onChange={(event) => { setSummaryScenarioDescription(event.target.value); setSummaryReportDialogError(""); }} placeholder="Matter-of-fact summary of the income and tax assumptions" />
                  <small>{summaryScenarioDescription.length} of 300 characters</small>
                </label>
                {summaryReportDialogError && <p className="summary-report-dialog__error" role="alert">{summaryReportDialogError}</p>}
                <div className="summary-report-dialog__actions">
                  <button className="ghost-button" type="button" onClick={() => setSummaryReportDialogMode(null)}>Cancel</button>
                  <button className="primary-button" type="button" onClick={saveCurrentScenario}>Save scenario</button>
                </div>
              </>
            ) : summaryReportDialogMode === "manage" ? (
              <>
                <section className="summary-report-dialog__scenarios" aria-labelledby="summary-scenario-management-title">
                  <div className="summary-report-dialog__management-heading">
                    <div>
                      <span>Scenario library</span>
                      <strong id="summary-scenario-management-title">{uiSettings.savedScenarios.length} of {SAVED_SCENARIO_LIMIT} saved scenarios</strong>
                    </div>
                    <button className="ghost-button" type="button" onClick={() => openSummaryReportDialog("create")}>Add scenario</button>
                  </div>
                  {uiSettings.savedScenarios.length === 0 ? (
                    <p className="summary-report-dialog__empty">No scenarios have been saved yet. Add the current workbook as your first scenario.</p>
                  ) : (
                    <div className="summary-report-dialog__scenario-list">
                      <div className="summary-report-dialog__scenario-rows">
                        {uiSettings.savedScenarios.map((scenario, index) => {
                          const draft = summaryScenarioDrafts[scenario.id] || { name: scenario.name, description: scenario.description };
                          const isPendingRemoval = summaryScenarioPendingDeleteKey === scenario.id;
                          const publishedUrls = [...new Set(summaryLandingPageOptions.flatMap(({ page, payload }) => {
                            const publishedScenario = payload.scenarios.find((candidate) => candidate.id === scenario.id)
                              || payload.scenarios.find((candidate) => normalizeLookupKey(candidate.name) === normalizeLookupKey(scenario.name));
                            if (!publishedScenario) return [];
                            const reportUrl = buildPublicSummaryReportUrl(page.slug || namespacedPublicReportSlug(publicUsername, page.name), publicUsername);
                            return [`${reportUrl}#scenario-${encodeURIComponent(publishedScenario.id)}`];
                          }))];
                          return (
                            <article className="summary-report-dialog__scenario-row" key={scenario.id}>
                              <div className="summary-report-dialog__scenario-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
                              <div className="summary-report-dialog__scenario-fields">
                                <input aria-label={`Scenario name for ${scenario.name}`} value={draft.name} maxLength={60} onChange={(event) => { const name = event.target.value; setSummaryScenarioDrafts((current) => ({ ...current, [scenario.id]: { ...draft, name } })); setSummaryScenarioPendingDeleteKey(""); setSummaryReportDialogError(""); }} />
                                <textarea aria-label={`Scenario description for ${scenario.name}`} value={draft.description} maxLength={300} rows={2} onChange={(event) => { const description = event.target.value; setSummaryScenarioDrafts((current) => ({ ...current, [scenario.id]: { ...draft, description } })); setSummaryScenarioPendingDeleteKey(""); setSummaryReportDialogError(""); }} />
                                <small>{scenario.stateCode || currentSummaryReportPayload.stateCode} · {filingStatusLabels[scenario.filingStatus || currentSummaryReportPayload.filingStatus]} · {formatCurrencyDetailed(scenario.income)} income · {formatCurrencyDetailed(scenario.totalTax)} tax</small>
                                <div className={`summary-report-dialog__scenario-public-links${publishedUrls.length === 0 ? " is-unpublished" : ""}`}>
                                  <span>{publishedUrls.length === 0 ? "Scenario URL" : `Public ${publishedUrls.length === 1 ? "URL" : "URLs"}`}</span>
                                  {publishedUrls.length > 0 ? (
                                    publishedUrls.map((url) => (
                                      <div className="summary-report-dialog__scenario-public-link" key={url}>
                                        <a className="summary-report-dialog__scenario-url" href={url} target="_blank" rel="noreferrer">{url}</a>
                                        <a className="ghost-button ghost-button--compact" href={url} target="_blank" rel="noreferrer">Launch</a>
                                        <button className="ghost-button ghost-button--compact" type="button" onClick={() => { void copySummaryPublishedUrl(url); }}>Copy</button>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="summary-report-dialog__scenario-public-link">
                                      <small>Not published yet. Publish this scenario to create its URL.</small>
                                      <button className="ghost-button ghost-button--compact" type="button" onClick={() => { openSummaryReportDialog("publish"); setSummaryPublishScenarioIds([scenario.id]); setSummaryPublishDescriptions((current) => ({ ...current, [scenario.id]: scenario.description })); }}>Publish</button>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="summary-report-dialog__scenario-actions">
                                <button className="ghost-button" type="button" onClick={() => saveManagedScenario(scenario.id)}>Save</button>
                                <button className={`ghost-button summary-report-dialog__remove${isPendingRemoval ? " is-confirming" : ""}`} type="button" onClick={() => { if (isPendingRemoval) { saveManagedScenario(scenario.id, true); } else { setSummaryScenarioPendingDeleteKey(scenario.id); setSummaryReportDialogError(""); } }}>{isPendingRemoval ? "Confirm remove" : "Remove"}</button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>
                {summaryReportDialogError && <p className="summary-report-dialog__error" role="alert">{summaryReportDialogError}</p>}
                <div className="summary-report-dialog__actions">
                  <button className="primary-button" type="button" onClick={() => setSummaryReportDialogMode(null)}>Done</button>
                </div>
              </>
            ) : summaryReportDialogMode === "published" ? (
              <>
                <section className="summary-report-dialog__management summary-report-dialog__published" aria-labelledby="manage-published-reports-title">
                  <div className="summary-report-dialog__management-heading">
                    <div>
                      <span>Published reports</span>
                      <strong id="manage-published-reports-title">{summaryLandingPageOptions.length} published {summaryLandingPageOptions.length === 1 ? "report" : "reports"}</strong>
                    </div>
                    {isSummaryReportListLoading && <small>Refreshing…</small>}
                  </div>
                  {summaryLandingPageOptions.length === 0 ? (
                    <p className="summary-report-dialog__empty">No reports have been published yet.</p>
                  ) : (
                    <div className="summary-report-dialog__report-list">
                      {summaryLandingPageOptions.map(({ page, payload }) => {
                        const draftName = summaryReportRenameDrafts[page.id] ?? page.name;
                        const publicUrl = page.slug ? buildPublicSummaryReportUrl(page.slug, publicUsername) : "";
                        const isBusy = summaryReportBusyId === page.id;
                        const editScenarioIds = payload.scenarios.flatMap((publishedScenario) => {
                          const savedScenario = uiSettings.savedScenarios.find((scenario) => scenario.id === publishedScenario.id)
                            || uiSettings.savedScenarios.find((scenario) => normalizeLookupKey(scenario.name) === normalizeLookupKey(publishedScenario.name));
                          return savedScenario ? [savedScenario.id] : [];
                        });
                        const editDescriptions = Object.fromEntries(payload.scenarios.flatMap((publishedScenario) => {
                          const savedScenario = uiSettings.savedScenarios.find((scenario) => scenario.id === publishedScenario.id)
                            || uiSettings.savedScenarios.find((scenario) => normalizeLookupKey(scenario.name) === normalizeLookupKey(publishedScenario.name));
                          return savedScenario ? [[savedScenario.id, publishedScenario.description]] : [];
                        }));
                        return (
                          <div className="summary-report-dialog__report-row" key={page.id}>
                            <div className="summary-report-dialog__report-name">
                              <input aria-label={`Published report name for ${page.name}`} value={draftName} maxLength={80} disabled={isBusy} onChange={(event) => { const value = event.target.value; setSummaryReportRenameDrafts((current) => ({ ...current, [page.id]: value })); setSummaryReportDialogError(""); }} />
                              <small>{publicUrl} · {payload.scenarios.length} {payload.scenarios.length === 1 ? "scenario" : "scenarios"} · Updated {new Date(page.updatedAt).toLocaleDateString()}</small>
                            </div>
                            <div className="summary-report-dialog__report-actions">
                              {publicUrl && <a className="ghost-button" href={publicUrl} target="_blank" rel="noreferrer">Open</a>}
                              {publicUrl && <button className="ghost-button" type="button" disabled={isBusy} onClick={() => { void copySummaryPublishedUrl(publicUrl); }}>Copy URL</button>}
                              <button className="ghost-button" type="button" disabled={isBusy} onClick={() => openPublishedReportPlainText(page.name, payload)}>Plain text</button>
                              <button className="ghost-button" type="button" disabled={Boolean(summaryReportBusyId)} onClick={() => {
                                openSummaryReportDialog("publish");
                                setSummaryReportDestination("existing");
                                setSelectedSummaryLandingPageId(page.id);
                                setSummaryPublishScenarioIds(editScenarioIds);
                                setSummaryPublishDescriptions(editDescriptions);
                              }}>Edit scenarios</button>
                              <button className="ghost-button" type="button" disabled={Boolean(summaryReportBusyId)} onClick={() => { void renameSummaryReport(page.id); }}>{isBusy ? "Saving…" : "Save changes"}</button>
                              <button className="ghost-button summary-report-dialog__remove" type="button" disabled={Boolean(summaryReportBusyId)} onClick={() => { void deleteSummaryReport(page.id); }}>Delete</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
                {summaryReportDialogError && <p className="summary-report-dialog__error" role="alert">{summaryReportDialogError}</p>}
                <div className="summary-report-dialog__actions">
                  <button className="primary-button" type="button" disabled={Boolean(summaryReportBusyId)} onClick={() => setSummaryReportDialogMode(null)}>Done</button>
                </div>
              </>
            ) : (
              <>
                <section className="summary-report-dialog__scenarios" aria-labelledby="summary-publish-scenarios-title">
                  <div className="summary-report-dialog__management-heading">
                    <div>
                      <span>Scenarios to publish</span>
                      <strong id="summary-publish-scenarios-title">{summaryPublishScenarioIds.length} of {PUBLISHED_SCENARIO_LIMIT} selected</strong>
                    </div>
                    <button className="ghost-button" type="button" onClick={() => openSummaryReportDialog("create")}>Create scenario</button>
                  </div>
                  {uiSettings.savedScenarios.length === 0 ? (
                    <p className="summary-report-dialog__empty">Create at least one scenario before publishing a landing page.</p>
                  ) : (
                    <div className="summary-report-dialog__publish-list">
                      {uiSettings.savedScenarios.map((scenario) => {
                        const isSelected = summaryPublishScenarioIds.includes(scenario.id);
                        return (
                          <div className={`summary-report-dialog__publish-row${isSelected ? " is-selected" : ""}`} key={scenario.id}>
                            <label className="summary-report-dialog__publish-selector">
                              <input type="checkbox" checked={isSelected} onChange={() => togglePublishedScenario(scenario.id)} />
                              <span>
                                <strong>{scenario.name}</strong>
                                <small>{scenario.stateCode || currentSummaryReportPayload.stateCode} · {formatCurrencyDetailed(scenario.income)} income · {formatCurrencyDetailed(scenario.totalTax)} tax</small>
                              </span>
                            </label>
                            {isSelected && (
                              <label className="summary-report-dialog__publish-description">
                                <span>Landing page description</span>
                                <textarea value={summaryPublishDescriptions[scenario.id] ?? scenario.description} maxLength={300} rows={2} onChange={(event) => { const description = event.target.value; setSummaryPublishDescriptions((current) => ({ ...current, [scenario.id]: description })); setSummaryReportDialogError(""); }} />
                                <small>{String(summaryPublishDescriptions[scenario.id] ?? scenario.description).length} of 300 characters</small>
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <div className="summary-report-dialog__section-heading">
                  <span>Landing page</span>
                  <small>Publish a new page or replace the scenarios on an existing page.</small>
                </div>
                <div className="summary-report-dialog__destinations" role="radiogroup" aria-label="Published landing page destination">
                  <label className={summaryReportDestination === "new" ? "is-selected" : ""}>
                    <input type="radio" name="summary-report-destination" value="new" checked={summaryReportDestination === "new"} onChange={() => { setSummaryReportDestination("new"); setSummaryReportDialogError(""); }} />
                    <span><strong>New landing page</strong><small>Create a public page with the selected scenarios.</small></span>
                  </label>
                  <label className={`${summaryReportDestination === "existing" ? "is-selected" : ""} ${summaryLandingPageOptions.length === 0 ? "is-disabled" : ""}`}>
                    <input type="radio" name="summary-report-destination" value="existing" checked={summaryReportDestination === "existing"} disabled={summaryLandingPageOptions.length === 0} onChange={() => { setSummaryReportDestination("existing"); setSelectedSummaryLandingPageId(summaryLandingPageOptions[0]?.page.id || ""); setSummaryReportDialogError(""); }} />
                    <span><strong>Existing landing page</strong><small>{summaryLandingPageOptions.length ? "Replace its published scenarios with this selection." : "No published landing pages yet."}</small></span>
                  </label>
                </div>
                {summaryReportDestination === "new" ? (
                  <label className="summary-report-dialog__field">
                    <span>Landing page name</span>
                    <input value={summaryReportName} maxLength={80} onChange={(event) => { setSummaryReportName(event.target.value); setSummaryReportDialogError(""); }} placeholder="Example: 2025 income scenarios" />
                    <small className="summary-report-dialog__url-preview">Public URL: {PUBLIC_SITE_ORIGIN}/{publicUsername}/{normalizePublicReportSlug(summaryReportName) || "scenario"}</small>
                  </label>
                ) : (
                  <label className="summary-report-dialog__field">
                    <span>Existing landing page</span>
                    <select value={selectedSummaryLandingPageId} onChange={(event) => { setSelectedSummaryLandingPageId(event.target.value); setSummaryReportDialogError(""); }}>
                      {summaryLandingPageOptions.map(({ page, payload }) => <option key={page.id} value={page.id}>{page.name} ({payload.scenarios.length} published)</option>)}
                    </select>
                  </label>
                )}

                {summaryPublishedUrl && (
                  <div className="summary-report-dialog__published-url" role="status" aria-live="polite">
                    <span>Published URL</span>
                    <a className="summary-report-dialog__published-url-link" href={summaryPublishedUrl} target="_blank" rel="noreferrer">{summaryPublishedUrl}</a>
                    <div className="summary-report-dialog__published-url-actions">
                      <a className="ghost-button" href={summaryPublishedUrl} target="_blank" rel="noreferrer">Open URL</a>
                      <button className="ghost-button" type="button" onClick={() => { void copySummaryPublishedUrl(summaryPublishedUrl); }}>Copy URL</button>
                    </div>
                  </div>
                )}

                <section className="summary-report-dialog__management summary-report-dialog__published" aria-labelledby="summary-published-pages-title">
                  <div className="summary-report-dialog__management-heading">
                    <div>
                      <span>Published landing pages</span>
                      <strong id="summary-published-pages-title">{summaryLandingPageOptions.length} saved {summaryLandingPageOptions.length === 1 ? "page" : "pages"}</strong>
                    </div>
                    {isSummaryReportListLoading && <small>Refreshing…</small>}
                  </div>
                  {summaryLandingPageOptions.length === 0 ? (
                    <p className="summary-report-dialog__empty">No landing pages have been published yet.</p>
                  ) : (
                    <div className="summary-report-dialog__report-list">
                      {summaryLandingPageOptions.map(({ page, payload }) => {
                        const draftName = summaryReportRenameDrafts[page.id] ?? page.name;
                        const draftSlug = normalizePublicReportSlug(draftName);
                        const publicUrl = page.slug ? buildPublicSummaryReportUrl(page.slug, publicUsername) : "";
                        return (
                          <div className="summary-report-dialog__report-row" key={page.id}>
                            <div className="summary-report-dialog__report-name">
                              <input aria-label={`Landing page name for ${page.name}`} value={draftName} maxLength={80} onChange={(event) => { const value = event.target.value; setSummaryReportRenameDrafts((current) => ({ ...current, [page.id]: value })); setSummaryReportDialogError(""); }} />
                              <small>{page.slug ? publicUrl : `${PUBLIC_SITE_ORIGIN}/${publicUsername}/${draftSlug || "scenario"}`} · {payload.scenarios.length} published {payload.scenarios.length === 1 ? "scenario" : "scenarios"}</small>
                            </div>
                            <div className="summary-report-dialog__report-actions">
                              {publicUrl && <a className="ghost-button" href={publicUrl} target="_blank" rel="noreferrer">Open</a>}
                              {publicUrl && <button className="ghost-button" type="button" onClick={() => { void copySummaryPublishedUrl(publicUrl); }}>Copy</button>}
                              <button className="ghost-button" type="button" onClick={() => openPublishedReportPlainText(page.name, payload)}>Plain text</button>
                              <button className="ghost-button" type="button" disabled={Boolean(summaryReportBusyId)} onClick={() => { void renameSummaryReport(page.id); }}>{summaryReportBusyId === page.id ? "Saving…" : "Save name"}</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {summaryReportDialogError && <p className="summary-report-dialog__error" role="alert">{summaryReportDialogError}</p>}
                <div className="summary-report-dialog__actions">
                  <button className="ghost-button" type="button" onClick={() => setSummaryReportDialogMode(null)}>Cancel</button>
                  <button className="primary-button" type="button" disabled={isSummaryReportListLoading || Boolean(summaryReportBusyId) || summaryPublishScenarioIds.length === 0} onClick={() => { void publishSelectedScenarios(); }}>{summaryReportBusyId === "publish" ? "Publishing…" : summaryReportDestination === "existing" ? "Update landing page" : "Publish landing page"}</button>
                </div>
              </>
            )}
          </section>
        </div>,
        document.body
      )}
      {publishedReportPlainText && createPortal(
        <div className="scenario-plain-text-popup__backdrop published-report-plain-text-popup__backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPublishedReportPlainText(null); }}>
          <section className="scenario-plain-text-popup" role="dialog" aria-modal="true" aria-labelledby="published-report-plain-text-title">
            <header>
              <div><span>Ready to paste</span><h2 id="published-report-plain-text-title">{publishedReportPlainText.name}</h2></div>
              <button type="button" onClick={() => setPublishedReportPlainText(null)} aria-label="Close plain-text report">&times;</button>
            </header>
            <textarea readOnly value={publishedReportPlainText.text} rows={Math.min(Math.max(publishedReportPlainText.text.split("\n").length + 1, 8), 18)} onFocus={(event) => event.currentTarget.select()} aria-label="Plain-text published report" />
            <div className="scenario-plain-text-popup__actions">
              <small>{publishedReportPlainTextCopied ? "Copied to clipboard." : "Plain text formatted for forums and message boards."}</small>
              <button className="primary-button" type="button" onClick={() => void copyPublishedReportPlainText()}>{publishedReportPlainTextCopied ? "Copied" : "Copy text"}</button>
            </div>
          </section>
        </div>,
        document.body
      )}
      {taxSummaryKind === "federal" && (
        <TaxSummaryModal
          eyebrow="2025 federal planning estimate"
          title="Federal tax summary"
          subtitle={`${filingStatusLabels[federalSettings.filingStatus]} · Current workbook income and enabled What-If items`}
          totalLabel="Estimated federal tax"
          totalValue={formatCurrencyDetailed(federalTaxWithPayroll)}
          totalDetail={`${formatCurrencyDetailed(federalIncomeTaxTotal)} income tax plus ${formatCurrencyDetailed(w2PayrollTax.federal.total)} employee payroll tax.`}
          onClose={closeTaxSummary}
        >
          <div className="tax-summary-modal__grid">
            <TaxSummarySection title="Taxable income" subtitle="How the current workbook reaches federal taxable income.">
              <TaxSummaryRow label="Ordinary income before deductions" value={formatCurrencyDetailed(ordinaryBeforeDeductions)} />
              <TaxSummaryRow label="Preferred income before deductions" value={formatCurrencyDetailed(preferredBeforeDeductions)} note="Qualified dividends and modeled long-term gain income." />
              <TaxSummaryRow label="Gross federal taxable income" value={formatCurrencyDetailed(grossFederalTaxable)} emphasis />
              <TaxSummaryRow label="Above-the-line adjustments" value={`−${formatCurrencyDetailed(federalAboveLineDeductionSummary.total)}`} />
              <TaxSummaryRow label="Income after above-the-line adjustments" value={formatCurrencyDetailed(federalTaxableBeforeStandardOrItemized)} />
              <TaxSummaryRow label={federalSettings.deductionMode === "itemized" ? "Itemized deduction selected" : "Standard deduction selected"} value={`−${formatCurrencyDetailed(federalDeduction)}`} status="Applied" />
              <TaxSummaryRow label="Federal taxable income" value={formatCurrencyDetailed(federalTaxableAfterDeductions)} emphasis />
              <TaxSummaryRow label="Ordinary taxable income" value={formatCurrencyDetailed(ordinaryTaxable)} />
              <TaxSummaryRow label="Preferred taxable income" value={formatCurrencyDetailed(prefTaxable)} />
            </TaxSummarySection>

            <TaxSummarySection title="Deduction election" subtitle="Comparison of the two modeled deduction paths.">
              <TaxSummaryRow label="Standard deduction" value={formatCurrencyDetailed(federalStandardDeduction)} status={federalSettings.deductionMode === "standard" ? "Selected" : "Not selected"} />
              <TaxSummaryRow label="Modeled itemized deduction" value={formatCurrencyDetailed(itemizedFederalDeduction)} status={federalSettings.deductionMode === "itemized" ? "Selected" : "Not selected"} />
              <TaxSummaryRow label="Deduction used in calculation" value={formatCurrencyDetailed(federalDeduction)} emphasis />
              <TaxSummaryRow label="2025 SALT cap" value={formatCurrencyDetailed(backendFederalDeductions?.saltCap || 0)} note="The backend applies the statutory filing-status cap and MAGI phaseout." status="Limit" />
            </TaxSummarySection>

            <TaxSummarySection title="Above-the-line adjustments" subtitle="Adjustments reduce income before the standard or itemized deduction.">
              {federalSummaryAboveLineItems.length === 0 && <TaxSummaryRow label="No adjustments entered" value={formatCurrencyDetailed(0)} />}
              {federalSummaryAboveLineItems.map((item) => (
                <TaxSummaryRow
                  key={item.id}
                  label={item.deductionType}
                  value={formatCurrencyDetailed(Math.max(toNumber(item.amount), 0))}
                  note={federalAboveLineDeductionLimitNotes[item.deductionType]}
                  status="Entered"
                />
              ))}
              {federalAboveLineDeductionSummary.capitalLossRaw > 0 && (
                <>
                  <TaxSummaryRow label="Capital loss entered" value={formatCurrencyDetailed(federalAboveLineDeductionSummary.capitalLossRaw)} />
                  <TaxSummaryRow label="Annual capital-loss limit" value={formatCurrencyDetailed(3000)} status="Limit" />
                  <TaxSummaryRow label="Capital loss applied above-line" value={formatCurrencyDetailed(federalAboveLineDeductionSummary.capitalLossDeduction)} emphasis />
                </>
              )}
              <TaxSummaryRow label="Total above-the-line adjustments applied" value={formatCurrencyDetailed(federalAboveLineDeductionSummary.total)} emphasis />
            </TaxSummarySection>

            <TaxSummarySection title="Itemized deductions and limits" subtitle="Every entered item is shown, including items not selected for the current deduction method.">
              {federalSummaryItemizedItems.length === 0 && <TaxSummaryRow label="No itemized deductions entered" value={formatCurrencyDetailed(0)} />}
              {federalSummaryItemizedItems.map((item) => (
                <TaxSummaryRow
                  key={item.id}
                  label={item.deductionType}
                  value={formatCurrencyDetailed(Math.max(toNumber(item.amount), 0))}
                  note={federalDeductionLimitNotes[item.deductionType]}
                  status="Entered"
                />
              ))}
              <TaxSummaryRow label="State income tax in SALT calculation" value={formatCurrencyDetailed(displayedStateResult.tax)} />
              <TaxSummaryRow label="Property tax in SALT calculation" value={formatCurrencyDetailed(federalDeductionSummary.propertyTax)} />
              <TaxSummaryRow label="Combined SALT entered" value={formatCurrencyDetailed(federalSaltEntered)} />
              <TaxSummaryRow label="SALT cap" value={formatCurrencyDetailed(backendFederalDeductions?.saltCap || 0)} status="Limit" />
              <TaxSummaryRow label="SALT deduction allowed" value={formatCurrencyDetailed(federalDeductionSummary.saltDeduction)} emphasis />
              {federalSaltOverCap > 0 && <TaxSummaryRow label="SALT not deductible due to cap" value={formatCurrencyDetailed(federalSaltOverCap)} status="Limited" />}
              {federalDeductionSummary.capitalLossRaw > 0 && <TaxSummaryRow label="Itemized capital losses entered" value={formatCurrencyDetailed(federalDeductionSummary.capitalLossRaw)} />}
              {federalDeductionSummary.capitalLossRaw > 0 && <TaxSummaryRow label="Itemized capital loss applied" value={formatCurrencyDetailed(federalDeductionSummary.capitalLossDeduction)} note="The current model limits combined long- and short-term losses to $3,000 here." status="Limited" />}
              <TaxSummaryRow label="Modeled itemized deduction total" value={formatCurrencyDetailed(itemizedFederalDeduction)} emphasis />
            </TaxSummarySection>

            <TaxSummarySection title="Federal tax components" subtitle="Income tax, investment surtax, and employee payroll taxes are separated.">
              <TaxSummaryRow label="Ordinary income tax" value={formatCurrencyDetailed(federalOrdinaryTax)} />
              <TaxSummaryRow label="Preferred income tax" value={formatCurrencyDetailed(federalPreferredTax)} />
              <TaxSummaryRow label="Net investment income tax (NIIT)" value={formatCurrencyDetailed(federalNiit)} note={`Modeled threshold for this filing status: ${formatCurrencyDetailed(niitThreshold)}.`} />
              <TaxSummaryRow label="Federal income tax" value={formatCurrencyDetailed(federalIncomeTaxTotal)} emphasis />
              <TaxSummaryRow label="Employee Social Security" value={formatCurrencyDetailed(w2PayrollTax.federal.socialSecurity)} />
              <TaxSummaryRow label="Employee Medicare" value={formatCurrencyDetailed(w2PayrollTax.federal.medicare)} />
              <TaxSummaryRow label="Additional Medicare" value={formatCurrencyDetailed(w2PayrollTax.federal.additionalMedicare)} />
              <TaxSummaryRow label="Employee FICA total" value={formatCurrencyDetailed(w2PayrollTax.federal.total)} note="Social Security, Medicare, and Additional Medicare included in the total below." emphasis />
              <TaxSummaryRow label="Total federal tax and payroll" value={formatCurrencyDetailed(federalTaxWithPayroll)} emphasis />
              <TaxSummaryRow label="Effective federal income-tax rate" value={formatPercent(grossFederalTaxable > 0 ? federalIncomeTaxTotal / grossFederalTaxable : 0)} note="Federal income tax divided by gross modeled federal taxable income, before deductions." />
              <TaxSummaryRow label="Effective federal tax plus FICA rate" value={formatPercent(flows.totalIncome > 0 ? federalTaxWithPayroll / flows.totalIncome : 0)} note="Federal income tax and employee FICA divided by total modeled income." emphasis />
              <TaxSummaryRow label="Current ordinary marginal bracket" value={marginalFederalRateLabel} />
            </TaxSummarySection>
          </div>
          <div className="tax-summary-callout tax-summary-callout--warning">
            <strong>Limitations to review</strong>
            <p>The model automatically applies its configured SALT cap and $3,000 capital-loss cap. Mortgage-interest qualification, charitable and medical limits, credit eligibility, AMT, QBI, basis, carryforwards, and most income phaseouts require separate review.</p>
          </div>
        </TaxSummaryModal>
      )}
      {taxSummaryKind === "state" && (
        <TaxSummaryModal
          eyebrow={`2025 ${selectedStateName} planning estimate`}
          title={`${selectedStateName} tax summary`}
          subtitle={`${filingStatusLabels[federalSettings.filingStatus]} · ${selectedStateCode} income-tax and employee payroll model`}
          totalLabel={`Estimated ${selectedStateCode} tax`}
          totalValue={formatCurrencyDetailed(stateTaxWithPayroll)}
          totalDetail={`${formatCurrencyDetailed(displayedStateResult.tax)} state income tax plus ${formatCurrencyDetailed(w2PayrollTax.state.total)} modeled state employee payroll contributions.`}
          onClose={closeTaxSummary}
        >
          <div className="tax-summary-modal__grid">
            <TaxSummarySection title="State taxable income" subtitle="Federal-taxable investment income is adjusted for state treatment before deductions.">
              <TaxSummaryRow label="Federal-taxable investments" value={formatCurrencyDetailed(federalTaxableInvestmentIncome)} />
              <TaxSummaryRow label="State-tax-free investments" value={stateTaxFreeInvestmentSummary} note="Each symbol includes its annual dividends excluded from state tax. Holdings of the same symbol are combined." />
              <TaxSummaryRow label="Total state-tax-free dividends" value={formatCurrencyDetailed(stateTaxFreeInvestmentDividends)} note="Full annual investment income excluded from the state taxable base, including state-exempt Treasury and tax-free treatments in taxable accounts." emphasis />
              <TaxSummaryRow label="State taxability adjustment" value={formatSignedCurrency(stateInvestmentAdjustment)} note="Captures state-exempt and state-only taxable investment treatment." />
              <TaxSummaryRow label="Federal What-If income" value={formatCurrencyDetailed(federalWhatIfIncome)} />
              <TaxSummaryRow label={`${selectedStateCode} extra income`} value={formatCurrencyDetailed(effectiveExtraStateIncome)} />
              <TaxSummaryRow label={`${selectedStateCode} gross modeled income`} value={formatCurrencyDetailed(stateGross)} emphasis />
              <TaxSummaryRow label={stateSettings.deductionMode === "itemized" ? "Itemized deduction selected" : "Standard deduction selected"} value={`−${formatCurrencyDetailed(stateDeduction)}`} status={selectedStateHasIncomeTax ? "Applied" : "Not applicable"} />
              <TaxSummaryRow label={`${selectedStateCode} taxable income`} value={formatCurrencyDetailed(stateTaxableAfterDeductions)} emphasis />
            </TaxSummarySection>

            <TaxSummarySection title="Deduction election" subtitle="State deductions are maintained separately from federal deductions.">
              <TaxSummaryRow label={`${selectedStateCode} standard deduction`} value={formatCurrencyDetailed(stateSettings.standardDeduction)} status={stateSettings.deductionMode === "standard" ? "Selected" : "Not selected"} />
              <TaxSummaryRow label={`${selectedStateCode} itemized deductions entered`} value={formatCurrencyDetailed(stateItemized)} status={stateSettings.deductionMode === "itemized" ? "Selected" : "Not selected"} />
              <TaxSummaryRow label="Deduction used in calculation" value={formatCurrencyDetailed(selectedStateHasIncomeTax ? stateDeduction : 0)} emphasis />
              {!selectedStateHasIncomeTax && <TaxSummaryRow label="Broad-based individual income tax" value="None modeled" note={selectedStateTaxProfile.note} status="No tax" />}
            </TaxSummarySection>

            <TaxSummarySection title="Entered state deductions" subtitle="All state deduction rows are listed, whether or not itemizing is selected.">
              {stateSummaryDeductionItems.length === 0 && <TaxSummaryRow label="No state deductions entered" value={formatCurrencyDetailed(0)} />}
              {stateSummaryDeductionItems.map((item) => {
                const federalMatch = federalDeductionTypes.includes(item.deductionType) ? deductionTotalByType(federalSettings.deductionItems, item.deductionType) : 0;
                return (
                  <TaxSummaryRow
                    key={item.id}
                    label={item.deductionType}
                    value={formatCurrencyDetailed(Math.max(toNumber(item.amount), 0))}
                    note={federalMatch > 0 ? `Federal worksheet amount for comparison: ${formatCurrencyDetailed(federalMatch)}.` : undefined}
                    status="Entered"
                  />
                );
              })}
              <TaxSummaryRow label="State itemized total" value={formatCurrencyDetailed(stateItemized)} emphasis />
            </TaxSummarySection>

            <TaxSummarySection title="State tax and rates" subtitle="The current state result and modeled marginal rate schedule.">
              <TaxSummaryRow label={`${selectedStateCode} income tax`} value={formatCurrencyDetailed(displayedStateResult.tax)} emphasis />
              {w2PayrollTax.state.components.map((component) => <TaxSummaryRow key={component.label} label={component.label} value={formatCurrencyDetailed(component.tax)} />)}
              {w2PayrollTax.state.components.length === 0 && <TaxSummaryRow label="State employee payroll contributions" value={formatCurrencyDetailed(0)} note="No state W-2 payroll component is modeled for this state." />}
              {w2PayrollTax.state.components.length > 0 && <TaxSummaryRow label={`Total ${selectedStateCode} employee payroll contributions`} value={formatCurrencyDetailed(w2PayrollTax.state.total)} note={`Modeled employee-paid state payroll items included in the ${selectedStateCode} total below.`} emphasis />}
              <TaxSummaryRow label={`Total ${selectedStateCode} tax and payroll`} value={formatCurrencyDetailed(stateTaxWithPayroll)} emphasis />
              <TaxSummaryRow label="Effective state income-tax rate" value={formatPercent(stateGross > 0 ? displayedStateResult.tax / stateGross : 0)} />
              <TaxSummaryRow label={`Effective ${selectedStateCode} tax plus payroll rate`} value={formatPercent(flows.totalIncome > 0 ? stateTaxWithPayroll / flows.totalIncome : 0)} note={`State income tax and modeled employee payroll contributions divided by total modeled income.`} emphasis />
              <TaxSummaryRow label="Current marginal state bracket" value={marginalStateRateLabel} />
              {selectedStateBrackets.map((bracket) => <TaxSummaryRow key={`${bracket.threshold}-${bracket.rate}`} label={bracket.threshold > 0 ? `Taxable income over ${formatCurrencyDetailed(bracket.threshold)}` : "First modeled bracket"} value={formatPercent(bracket.rate)} status="Marginal rate" />)}
            </TaxSummarySection>
          </div>
          <div className="tax-summary-callout tax-summary-callout--warning">
            <strong>State-specific limits require review</strong>
            <p>{selectedStateTaxProfile.note || `${selectedStateName} deductions, credits, exemptions, recapture rules, and phaseouts can differ from federal law.`} The calculator uses the amounts entered and does not automatically validate every state-specific deduction cap, credit, residency rule, or local surcharge.</p>
          </div>
        </TaxSummaryModal>
      )}
      {taxSummaryKind === "local" && (
        <TaxSummaryModal
          eyebrow="2025 local tax planning estimate"
          title={localTaxSettings.enabled && selectedLocalTaxProfile.kind !== "none" ? `${localSummaryName} tax summary` : "Local tax summary"}
          subtitle={`${localTaxSettings.residency === "resident" ? "Resident" : "Nonresident / worked there"} · ${localTaxSettings.enabled ? "Local tax enabled" : "Local tax disabled"}`}
          totalLabel="Estimated local tax"
          totalValue={formatCurrencyDetailed(localTaxTotal)}
          totalDetail={`${formatCurrencyDetailed(localTaxableIncome)} modeled local tax base at a ${formatPercent(localTaxResult.effectiveRate)} effective rate.`}
          onClose={closeTaxSummary}
        >
          <div className="tax-summary-modal__grid">
            <TaxSummarySection title="Local configuration" subtitle="The selected locality, taxpayer status, and current model rate.">
              <TaxSummaryRow label="Local tax status" value={localTaxSettings.enabled ? "Enabled" : "Disabled"} status={localTaxSettings.enabled ? "Active" : "Off"} />
              <TaxSummaryRow label="Locality" value={localSummaryName} />
              <TaxSummaryRow label="Residency" value={localTaxSettings.residency === "resident" ? "Resident" : "Nonresident / worked there"} />
              <TaxSummaryRow label="Rate structure" value={selectedLocalTaxProfile.kind === "progressive" ? "Progressive" : selectedLocalTaxProfile.kind === "flat" ? "Flat" : "No local income tax"} />
              <TaxSummaryRow label="Configured current rate" value={formatPercent(localTaxSettings.rate)} />
              <TaxSummaryRow label="Configured nonresident rate" value={formatPercent(localTaxSettings.nonresidentRate)} />
            </TaxSummarySection>

            <TaxSummarySection title="Local taxable base" subtitle="Each income category shows its current amount and whether the locality includes it.">
              {localTaxBaseKeys.map((key) => (
                <TaxSummaryRow
                  key={key}
                  label={localTaxBaseLabels[key]}
                  value={formatCurrencyDetailed(localTaxBaseAmounts[key])}
                  status={localTaxSettings.taxableBase[key] && localTaxSettings.enabled ? "Included" : "Excluded"}
                />
              ))}
              <TaxSummaryRow label="Total taxable local base" value={formatCurrencyDetailed(localTaxableIncome)} emphasis />
            </TaxSummarySection>

            <TaxSummarySection title="Local tax result" subtitle="Estimated tax and the rate reached by the current taxable base.">
              <TaxSummaryRow label="Local taxable base" value={formatCurrencyDetailed(localTaxableIncome)} />
              <TaxSummaryRow label="Effective local rate" value={formatPercent(localTaxResult.effectiveRate)} />
              <TaxSummaryRow label="Marginal local rate" value={formatPercent(localTaxResult.marginalRate)} />
              <TaxSummaryRow label="Estimated local tax" value={formatCurrencyDetailed(localTaxTotal)} emphasis />
              <TaxSummaryRow label="Local deductions and credits" value="Not modeled" note="The local estimate applies the selected rate schedule to the included income categories." status="Review" />
            </TaxSummarySection>

            <TaxSummarySection title="Modeled rate schedule" subtitle={selectedLocalTaxProfile.kind === "progressive" ? "Progressive thresholds used by the selected preset." : "Current flat-rate configuration."}>
              {selectedLocalTaxProfile.kind === "progressive" && selectedLocalTaxProfile.brackets?.map((bracket) => <TaxSummaryRow key={`${bracket.threshold}-${bracket.rate}`} label={bracket.threshold > 0 ? `Taxable base over ${formatCurrencyDetailed(bracket.threshold)}` : "First modeled bracket"} value={formatPercent(bracket.rate)} status="Marginal rate" />)}
              {selectedLocalTaxProfile.kind !== "progressive" && <TaxSummaryRow label={localTaxSettings.residency === "nonresident" ? "Nonresident rate used" : "Resident rate used"} value={formatPercent(localTaxSettings.enabled ? localTaxSettings.rate : 0)} />}
            </TaxSummarySection>
          </div>
          <div className="tax-summary-callout">
            <strong>Local rule note</strong>
            <p>{selectedLocalTaxProfile.note} Local rules change frequently; confirm the current rate, residency and work-location sourcing, exemptions, wage base, deductions, credits, and filing requirements.</p>
          </div>
        </TaxSummaryModal>
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
      {authEntryDialog}
      {settingsDialog}
      {clearAllDialog}
      <header className="app-top-nav" aria-label="Application menu">
        <div className="app-top-nav__inner">
          {actionMenu}
          <CompactKpiHeader metrics={kpiMetrics} />
        </div>
      </header>
      <div className={`workspace-shell ${focusGrid ? "workspace-shell--focus-grid" : !showThermometerPanel ? "workspace-shell--thermometer-collapsed" : ""}`}>
        <aside className="sidebar">
          <nav className="sidebar__nav">
            {navItems.map((item) => <button key={item.key} className={`nav-item ${activeTab === item.key ? "nav-item--active" : ""}`} type="button" onClick={() => setActiveTab(item.key)}><strong>{item.label}</strong><span>{item.meta}</span></button>)}
          </nav>
        </aside>
        <main className="content-panel">
        <div className="content-topbar">
          <div className="content-topbar__title-group">
            <div className="content-topbar__tax-heading">
              <h2 className={activeTab === "federal" ? "content-topbar__title content-topbar__title--federal" : activeTab === "state" ? "content-topbar__title content-topbar__title--state" : "content-topbar__title"}>
                {activeTab === "federal" && <i className="nav-item__icon-1040" aria-hidden="true">1040</i>}
                {activeTab === "state" && <i className="nav-item__icon-1040 nav-item__icon-state-tax" data-state={selectedStateCode} aria-hidden="true">{selectedStateCode === "CA" ? "540" : selectedStateCode}</i>}
                <span className="content-topbar__title-stack">
                  <span>{navItems.find((item) => item.key === activeTab)?.label}</span>
                  {activeTab === "federal" && <TumblingCurrency className="content-topbar__tax-total" value={federalTaxWithPayroll} />}
                  {activeTab === "state" && <TumblingCurrency className="content-topbar__tax-total" value={stateTaxWithPayroll} />}
                  {activeTab === "local" && <TumblingCurrency className="content-topbar__tax-total" value={localTaxTotal} />}
                </span>
              </h2>
              {activeTab === "state" && <label className="topbar-state-selector topbar-state-selector--tax-heading" aria-label="State"><StateFlagSelect value={selectedStateCode} onChange={(stateCode) => updateStateSettingsUndoable((current) => ({ ...current, stateCode: normalizeStateCode(stateCode) }))} className="state-flag-select--toolbar" /></label>}
              {(activeTab === "federal" || activeTab === "state" || activeTab === "local") && (
                <button className="tax-summary-trigger" type="button" onClick={() => setTaxSummaryKind(activeTab)} aria-haspopup="dialog">
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 2.75h6l3 3v11.5h-9z" /><path d="M11.5 2.75v3h3M7.8 9h4.4M7.8 11.8h4.4M7.8 14.6h3" /></svg>
                  Tax summary
                </button>
              )}
              {(activeTab === "federal" || activeTab === "state") && (
                <button
                  className="tax-summary-trigger tax-panel-header-trigger"
                  type="button"
                  aria-expanded={activeTab === "federal" ? isFederalTaxWhatIfOpen : isStateTaxWhatIfOpen}
                  aria-controls={`${activeTab}-tax-what-if-content`}
                  onClick={() => activeTab === "federal" ? setIsFederalTaxWhatIfOpen((current) => !current) : setIsStateTaxWhatIfOpen((current) => !current)}
                >
                  What-If
                </button>
              )}
              {(activeTab === "federal" || activeTab === "state") && (
                <button
                  className="tax-summary-trigger tax-panel-header-trigger"
                  type="button"
                  aria-expanded={activeTab === "federal" ? isFederalTaxOutputsOpen : isStateTaxOutputsOpen}
                  aria-controls={`${activeTab}-tax-outputs-content`}
                  onClick={() => activeTab === "federal" ? setIsFederalTaxOutputsOpen((current) => !current) : setIsStateTaxOutputsOpen((current) => !current)}
                >
                  Tax outputs
                </button>
              )}
            </div>
            {activeTab === "investments" && <label className="topbar-state-selector" aria-label="State"><StateFlagSelect value={selectedStateCode} onChange={(stateCode) => updateStateSettingsUndoable((current) => ({ ...current, stateCode: normalizeStateCode(stateCode) }))} className="state-flag-select--toolbar" /></label>}
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
        {activeTab === "tickers" && assetsWithUnmappedTaxTreatment.length > 0 && (
          <NavigableStatusCard
            targetCount={assetsWithUnmappedTaxTreatment.length}
            onPrevious={() => cycleAssetErrorRow("previous")}
            onNext={() => cycleAssetErrorRow("next")}
          >
            <strong>Unmapped tax treatment:</strong> {assetsWithUnmappedTaxTreatment.map((row) => row.symbol).join(", ")}. Add or correct the treatment before relying on tax results.
          </NavigableStatusCard>
        )}
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
                <p>Your holdings, saved scenarios, and publishing profile are scoped to your account.</p>
                {authState.error && <div className="status-card status-card--error">{authState.error}</div>}
              </div>
              <div className="auth-required-panel__actions">
                <button className="primary-button" type="button" onClick={() => openAuthEntry("signIn")} disabled={authState.status === "loading"}>
                  {authState.status === "loading" ? "Completing sign in..." : "Sign In"}
                </button>
                <button className="ghost-button" type="button" onClick={() => openAuthEntry("create")} disabled={authState.status === "loading"}>
                  Create Account
                </button>
              </div>
            </div>
          </Section>
        ) : (
          <>
        {activeTab === "investments" && storageState === "loading" && (
          <Section title="Investments / Income" subtitle="Loading workbook data from storage...">
            <div className="status-card status-card--note">Loading account and tax-status mappings...</div>
          </Section>
        )}
        {activeTab === "investments" && storageState !== "loading" && (
          <InvestmentsTable
            rows={investments}
            accountOptions={accountOptions}
            symbolOptions={symbolOptions}
            categoryOptions={categoryOptions}
            taxTreatmentOptions={taxTreatmentOptions}
            tickerMap={tickerMap}
            stateCode={selectedStateCode}
            accountTaxStatusByName={accountTaxStatusByName}
            excludedAfterTaxAccountNames={excludedAfterTaxAccountNames}
            derivedRows={derivedRows}
            favorites={uiSettings.investmentFavorites}
            filters={investmentFilters}
            sort={investmentSort}
            selectedAssetIds={selectedInvestmentIds}
            showRowNumbers={showInvestmentRowNumbers}
            isWhatIfActive={isWhatIfActive}
            onToggleWhatIf={toggleInvestmentWhatIf}
            onSaveFavorite={saveFavorite}
            onApplyFavorite={applyFavorite}
            onDeleteFavorite={deleteFavorite}
            onRenameFavorite={renameFavorite}
            onChange={updateInvestmentRow}
            onCreateIncome={createIncomeForInvestment}
            onCreateNewIncome={(input) => createIncomeForInvestment(Date.now(), input)}
            onEditIncome={editIncomeForInvestment}
            onCreateInvestment={createInvestmentWithAsset}
            onEditInvestment={editInvestmentWithAsset}
            onCreateAccount={createQuickAccount}
            onCreateAsset={createQuickAsset}
            onCreateTaxTreatment={createQuickTaxTreatment}
            onRemove={(id) => {
              setInvestments((current) => current.filter((row) => row.id !== id));
              setSelectedInvestmentIds((current) => current.filter((selectedId) => selectedId !== id));
            }}
            onSplit={splitInvestmentRow}
            onReorder={reorderInvestments}
            onJumpToAccount={jumpToAccountRow}
            onJumpToAsset={jumpToAssetRow}
            onHighlightRows={setSelectedInvestmentIds}
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
        {activeTab === "tickers" && <LookupTable title="Assets" subtitle="Workbook asset lookup. Dividend percentage, asset type, asset class, tax treatment, and extra tax data all flow into the investment sheet lookups." rows={tickers} duplicateKey="symbol" columns={[{ key: "symbol", label: "Asset ID" }, { key: "percentReturn", label: "Dividend", type: "percent" }, { key: "assetType", label: "Type", type: "select", options: assetTypeOptions }, { key: "category", label: "Asset Class", type: "select", options: categoryOptions }, { key: "taxTreatment", label: "Tax Treatment", type: "select", options: taxTreatmentOptions }, { key: "extraData", label: "Extra Data", type: "number" }, { key: "description", label: "Description" }, { key: "exDividend", label: "Ex-dividend" }, { key: "divPayout", label: "Div payout" }]} highlightedRowId={highlightedAssetRowId} onChange={updateCollection(setTickers, ["percentReturn", "extraData"])} onAdd={() => addRow(setTickers, { id: Date.now(), symbol: "", percentReturn: 0, assetType: "ETF", category: categoryOptions[1] || "", taxTreatment: "income", incomeItem: false, extraData: 0, description: "", exDividend: "", divPayout: "" })} onRemove={removeRow(setTickers)} onRemoveAll={() => setTickers([])} onReorder={reorderCollection(setTickers)} onSplitRow={(id) => setTickers((current) => { const index = current.findIndex((row) => row.id === id); if (index < 0) return current; const nextId = Math.max(Date.now(), ...current.map((row) => row.id + 1)); return [...current.slice(0, index + 1), { ...current[index], id: nextId }, ...current.slice(index + 1)]; })} onPasteRow={(id, values) => setTickers((current) => current.map((row) => row.id === id ? { ...row, ...values, id } : row))} onLookupRow={(row) => window.open(stockAnalysisDividendUrl(row.symbol, row.assetType), "_blank", "noopener,noreferrer")} showLookupRow={(row) => !isIncomeAssetType(row.assetType)} lookupRowLabel="Look up dividend for" showMoveHeaderLabel={false} rowDeleteNextToMove />}
        {activeTab === "categories" && <LookupTable title="Asset Classes" subtitle="Reference list used by the Assets tab asset-class dropdown and portfolio-allocation rollup." rows={categories} columns={[{ key: "includeInAllocation", label: "Allocation", type: "checkbox" }, { key: "name", label: "Asset class" }]} onChange={updateCollection(setCategories)} onAdd={() => addRow(setCategories, { id: Date.now(), name: "", includeInAllocation: true })} onRemove={removeRow(setCategories)} onReorder={reorderCollection(setCategories)} showMoveHeaderLabel={false} rowDeleteNextToMove />}
        {activeTab === "taxTreatment" && taxTreatmentIssues.length > 0 && (
          <NavigableStatusCard
            targetCount={taxTreatmentIssueRowIds.length}
            onPrevious={() => cycleTaxTreatmentErrorRow("previous")}
            onNext={() => cycleTaxTreatmentErrorRow("next")}
          >
            <strong>Tax treatment rules need attention.</strong> {taxTreatmentIssues.map((issue) => issue.message).join(" ")}
          </NavigableStatusCard>
        )}
        {activeTab === "taxTreatment" && <LookupTable title="Tax Treatments" subtitle="Structured rules used to divide investment income between federal ordinary and preferred income, determine state/local treatment, and drive the tax-treatment allocation rollup." rows={taxTreatments} duplicateKey="label" columns={[{ key: "includeInAllocation", label: "Allocation", type: "checkbox" }, { key: "label", label: "Treatment ID" }, { key: "ordinaryShare", label: "Federal ordinary", type: "percent" }, { key: "preferredShare", label: "Federal preferred", type: "percent" }, { key: "stateRule", label: "State rule", type: "select", options: ["taxable", "exempt", "treasury-exempt"] }, { key: "niitIncluded", label: "Include in NIIT", type: "checkbox" }, { key: "localCategory", label: "Local category", type: "select", options: localTaxBaseKeys }, { key: "description", label: "Explanation" }]} highlightedRowId={highlightedTaxTreatmentRowId} onChange={updateCollection(setTaxTreatments, ["ordinaryShare", "preferredShare"])} onAdd={() => addRow(setTaxTreatments, { id: Date.now(), label: "", ...defaultTaxTreatmentRule("income"), includeInAllocation: true })} onRemove={removeRow(setTaxTreatments)} onReorder={reorderCollection(setTaxTreatments)} showMoveHeaderLabel={false} rowDeleteNextToMove />}
        {activeTab === "accounts" && <LookupTable title="Accounts" subtitle="Workbook account lookup. Account type drives the investment tax status; cashflow inclusion comes directly from this sheet." rows={accounts} columns={[{ key: "account", label: "Account name" }, { key: "accountType", label: "Account type", type: "select", options: accountTypeOptions }, { key: "dividendAccrued", label: "Dividend accrued" }, { key: "includeInFreeCashflow", label: "Exclude from aftertax income", type: "invertedYesNoCheckbox" }]} highlightedRowId={highlightedAccountRowId} onChange={updateCollection(setAccounts)} onAdd={() => addRow(setAccounts, { id: Date.now(), account: "", accountType: "Brokerage Account", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" })} onRemove={removeRow(setAccounts)} onRemoveAll={() => setAccounts([])} onReorder={reorderCollection(setAccounts)} showMoveHeaderLabel={false} rowDeleteNextToMove />}
        {activeTab === "accountTaxType" && <LookupTable title="Account Tax Category" subtitle="Reference list for allowed account tax statuses and account-tax allocation rollup." rows={accountTaxTypes} columns={[{ key: "includeInAllocation", label: "Allocation", type: "checkbox" }, { key: "taxStatus", label: "Tax status" }]} onChange={updateCollection(setAccountTaxTypes)} onAdd={() => addRow(setAccountTaxTypes, { id: Date.now(), taxStatus: "", includeInAllocation: true })} onRemove={removeRow(setAccountTaxTypes)} onReorder={reorderCollection(setAccountTaxTypes)} showMoveHeaderLabel={false} rowDeleteNextToMove />}
        {activeTab === "accountType" && <LookupTable title="Account Type" subtitle="Reference list for account kinds, tax statuses, and account-type allocation rollup." rows={accountTypes} columns={[{ key: "includeInAllocation", label: "Allocation", type: "checkbox" }, { key: "name", label: "Account type" }, { key: "taxStatus", label: "Tax status", type: "select", options: accountTaxStatusOptions }]} onChange={updateCollection(setAccountTypes)} onAdd={() => addRow(setAccountTypes, { id: Date.now(), name: "", taxStatus: "", includeInAllocation: true })} onRemove={removeRow(setAccountTypes)} onReorder={reorderCollection(setAccountTypes)} showMoveHeaderLabel={false} rowDeleteNextToMove />}

        {activeTab === "federal" && (
          <Section title="Federal Tax" subtitle="Continuously recalculated from the workbook-style investment rows, the same row-level tax-adjustment logic used in the sheet, and the live Lambda backend." className="federal-tax-panel">
            {isFederalTaxOutputsOpen && <div id="federal-tax-outputs-content" className="tax-output-disclosure tax-output-disclosure__content">
              {federalResult && (
                <div className="api-grid federal-tax-panel__tiles federal-tax-panel__tiles--result">
                  <MetricCard label="Federal total" value={formatCurrencyDetailed(federalTaxWithPayroll)} />
                  <MetricCard label="Federal income tax" value={formatCurrencyDetailed(federalIncomeTaxTotal)} />
                  <MetricCard label="Ordinary tax" value={formatCurrencyDetailed(federalResult.ordinaryTax || 0)} />
                  <MetricCard label="Preferred tax" value={formatCurrencyDetailed(federalResult.prefTax || 0)} />
                  <MetricCard label="NIIT" value={formatCurrencyDetailed(federalResult.niit || 0)} />
                  <MetricCard label="W2 FICA" value={formatCurrencyDetailed(w2PayrollTax.federal.total)} />
                  <MetricCard label={`${selectedStateCode} W2 withholding`} value={formatCurrencyDetailed(w2PayrollTax.state.total)} />
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
                <MetricCard label="W2 wages" value={formatCurrency(effectiveW2Income)} />
              </div>
            </div>}
            {federalError && <div className="status-card status-card--error">{federalError}</div>}
            {isFederalTaxWhatIfOpen && <div id="federal-tax-what-if-content" className="tax-what-if-disclosure tax-what-if-disclosure__content">
              <div className="tax-what-if-disclosure__fields tax-what-if-disclosure__tables">
                <TaxWhatIfMiniTable
                  title="Extra ordinary income"
                  total={extraOrdinaryWhatIfTotal}
                  rows={federalSettings.extraOrdinaryItems}
                  typeOptions={ordinaryWhatIfTypes}
                  onChange={(rows) => updateFederalSettingsUndoable((current) => ({ ...current, extraOrdinaryItems: rows, extraOrdinaryIncome: rows.reduce((total, row) => total + toNumber(row.amount), 0) }))}
                />
                <TaxWhatIfMiniTable
                  title="Extra preferred income"
                  total={extraPreferredWhatIfTotal}
                  rows={federalSettings.extraPreferredItems}
                  typeOptions={preferredWhatIfTypes}
                  onChange={(rows) => updateFederalSettingsUndoable((current) => ({ ...current, extraPreferredItems: rows, extraPreferredIncome: rows.reduce((total, row) => total + toNumber(row.amount), 0) }))}
                />
              </div>
            </div>}
            <div className="form-grid">
              <label><span>Filing status</span><select value={federalSettings.filingStatus} onChange={(event) => updateFederalSettingsUndoable((current) => ({ ...current, filingStatus: normalizeFilingStatus(event.target.value) }))}><option value="mfj">Married filing jointly</option><option value="single">Single</option><option value="mfs">Married filing separately</option><option value="hoh">Head of household</option></select></label>
              <label><span>State</span><StateFlagSelect value={selectedStateCode} onChange={(stateCode) => updateStateSettingsUndoable((current) => ({ ...current, stateCode: normalizeStateCode(stateCode) }))} /></label>
            </div>
            <div className="form-grid form-grid--compact tax-deduction-mode">
              <label>
                <span>Deduction method</span>
                <select value={federalSettings.deductionMode} onChange={(event) => updateFederalSettingsUndoable((current) => ({ ...current, deductionMode: normalizeFederalDeductionMode(event.target.value) }))}>
                  <option value="standard">Standard deduction ({formatCurrencyDetailed(federalStandardDeduction)})</option>
                  <option value="itemized">Itemized deduction ({formatCurrencyDetailed(itemizedFederalDeduction)})</option>
                </select>
              </label>
            </div>
            {federalSettings.deductionMode === "standard" && (
              <FederalAboveLineDeductionTable
                rows={federalSettings.aboveLineDeductionItems}
                summary={federalAboveLineDeductionSummary}
                onChange={(rows) => updateFederalSettingsUndoable((current) => ({ ...current, aboveLineDeductionItems: rows }))}
              />
            )}
            {federalSettings.deductionMode === "itemized" && (
              <FederalDeductionMiniTable
                rows={federalSettings.deductionItems}
                summary={federalDeductionSummary}
                onChange={(rows) => updateFederalSettingsUndoable((current) => ({
                  ...current,
                  deductionItems: rows,
                  mortgageInterest: deductionTotalByType(rows, "Mortgage interest"),
                  propertyTax: deductionTotalByType(rows, "Property tax"),
                }))}
              />
            )}
          </Section>
        )}
        {activeTab === "state" && (
          <Section title="State Tax" subtitle="State worksheet fed from the investment-sheet state bucket column and the live backend." className="state-tax-panel">
            {isStateTaxOutputsOpen && <div id="state-tax-outputs-content" className="tax-output-disclosure tax-output-disclosure__content">
              <div className="api-grid state-tax-panel__tiles state-tax-panel__tiles--result">
                <MetricCard label={`${selectedStateCode} tax`} value={formatCurrencyDetailed(stateTaxWithPayroll)} />
                <MetricCard label={`${selectedStateCode} income tax`} value={formatCurrencyDetailed(displayedStateResult.tax)} />
                <MetricCard label={`${selectedStateCode} W2 withholding`} value={formatCurrencyDetailed(w2PayrollTax.state.total)} />
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
            </div>}
            {stateError && <div className="status-card status-card--error">{stateError}</div>}
            {isStateTaxWhatIfOpen && <div id="state-tax-what-if-content" className="tax-what-if-disclosure tax-what-if-disclosure__content">
              <div className="form-grid tax-what-if-disclosure__fields">
                <label><span>Extra {selectedStateCode} income</span><CurrencyInput value={stateSettings.extraStateIncome} onChange={(value) => updateStateSettingsUndoable((current) => ({ ...current, extraStateIncome: value }))} /></label>
              </div>
            </div>}
            <div className="form-grid form-grid--compact-wide">
              {selectedStateHasIncomeTax && (
                <label>
                  <span>Deduction method</span>
                  <select value={stateSettings.deductionMode} onChange={(event) => updateStateSettingsUndoable((current) => ({ ...current, deductionMode: normalizeFederalDeductionMode(event.target.value) }))}>
                    <option value="standard">Standard deduction ({formatCurrencyDetailed(stateSettings.standardDeduction)})</option>
                    <option value="itemized">Itemized deductions ({formatCurrencyDetailed(stateItemized)})</option>
                  </select>
                </label>
              )}
              {selectedStateHasIncomeTax && stateSettings.deductionMode === "standard" && <label><span>{selectedStateCode} standard deduction</span><CurrencyInput value={stateSettings.standardDeduction} onChange={(value) => updateStateSettingsUndoable((current) => ({ ...current, standardDeduction: value }))} /></label>}
            </div>
            {selectedStateHasIncomeTax && stateSettings.deductionMode === "itemized" ? (
              <StateDeductionMiniTable
                stateCode={selectedStateCode}
                rows={stateSettings.deductionItems}
                federalRows={federalSettings.deductionItems}
                onChange={(rows) => updateStateSettingsUndoable((current) => ({
                  ...current,
                  deductionItems: rows,
                  mortgageInterest: deductionTotalByType(rows, "Mortgage interest"),
                  propertyTax: deductionTotalByType(rows, "Property tax"),
                }))}
              />
            ) : !selectedStateHasIncomeTax ? (
              <div className="status-card">{selectedStateName} has no modeled broad-based individual income tax, so state deductions are not applied.</div>
            ) : null}
          </Section>
        )}
        {activeTab === "local" && (
          <Section title="Local Tax" subtitle="Optional city, county, school-district, or occupational income tax layered on top of federal and state taxes." className="state-tax-panel local-tax-panel">
            <details className="tax-output-disclosure" open>
              <summary>Tax outputs</summary>
              <div className="api-grid state-tax-panel__tiles state-tax-panel__tiles--result">
                <MetricCard label="Local tax" value={formatCurrencyDetailed(localTaxTotal)} />
                <MetricCard label="Taxable local base" value={formatCurrencyDetailed(localTaxableIncome)} />
                <MetricCard label="Effective rate" value={formatPercent(localTaxResult.effectiveRate)} />
                <MetricCard label="Marginal rate" value={formatPercent(localTaxResult.marginalRate)} />
              </div>
              <div className="metric-grid state-tax-panel__tiles">
                {localTaxBaseKeys.map((key) => (
                  <MetricCard key={key} label={localTaxBaseLabels[key]} value={formatCurrency(localTaxBaseAmounts[key])} tone={localTaxSettings.taxableBase[key] ? "accent" : "default"} />
                ))}
              </div>
            </details>
            <div className="form-grid form-grid--compact-wide">
              <label>
                <span>Local tax on/off</span>
                <select value={localTaxSettings.enabled ? "on" : "off"} onChange={(event) => updateLocalTaxSettingsUndoable((current) => {
                  const profile = getLocalTaxProfile(localTaxProfiles, current.localityId);
                  const enabled = event.target.value === "on" && profile.kind !== "none";
                  return {
                    ...current,
                    enabled,
                    taxableBase: enabled ? profile.base : current.taxableBase,
                  };
                })}>
                  <option value="off">Off</option>
                  <option value="on">On</option>
                </select>
              </label>
              <label>
                <span>City / locality preset</span>
                <select value={localTaxSettings.localityId} onChange={(event) => updateLocalTaxProfile(event.target.value)}>
                  {localTaxProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.state ? `${profile.state} - ${profile.locality}` : profile.locality}</option>)}
                </select>
              </label>
              <label>
                <span>Type city/locality</span>
                <input type="text" value={localTaxSettings.localityName} onChange={(event) => updateLocalTaxSettingsUndoable((current) => ({ ...current, localityId: current.localityId === "none" ? "custom" : current.localityId, localityName: event.target.value }))} placeholder="City, county, or district" />
              </label>
              <label>
                <span>Residency</span>
                <select value={localTaxSettings.residency} onChange={(event) => {
                  const residency = event.target.value === "nonresident" ? "nonresident" : "resident";
                  const profile = getLocalTaxProfile(localTaxProfiles, localTaxSettings.localityId);
                  updateLocalTaxSettingsUndoable((current) => ({ ...current, residency, rate: residency === "nonresident" ? current.nonresidentRate || profile.nonresidentRate || current.rate : profile.id === "custom" ? current.rate : profile.residentRate }));
                }}>
                  <option value="resident">Resident</option>
                  <option value="nonresident">Nonresident / worked there</option>
                </select>
              </label>
              <label>
                <span>Resident/current rate</span>
                <input type="number" step="0.001" value={formatPercentInputValue(localTaxSettings.rate * 100)} onChange={(event) => updateLocalTaxSettingsUndoable((current) => ({ ...current, localityId: current.localityId === "none" ? "custom" : current.localityId, rate: toNumber(event.target.value) / 100, enabled: toNumber(event.target.value) > 0 }))} />
              </label>
              <label>
                <span>Nonresident rate</span>
                <input type="number" step="0.001" value={formatPercentInputValue(localTaxSettings.nonresidentRate * 100)} onChange={(event) => updateLocalTaxSettingsUndoable((current) => ({ ...current, nonresidentRate: toNumber(event.target.value) / 100 }))} />
              </label>
            </div>
            {showLocalTaxBasePanel && (
              <div className="lookup-card local-tax-base-card">
                <div className="lookup-card__header">
                  <div>
                    <p className="eyebrow">Tax Base</p>
                    <h3>Income categories taxed locally</h3>
                  </div>
                  <strong>{formatCurrencyDetailed(localTaxableIncome)}</strong>
                </div>
                <div className="form-grid form-grid--compact-wide">
                  {localTaxBaseKeys.map((key) => (
                    <label key={key} className="checkbox-row">
                      <input type="checkbox" checked={localTaxSettings.taxableBase[key]} onChange={(event) => updateLocalTaxBase(key, event.target.checked)} />
                      <span>{localTaxBaseLabels[key]} <small>{formatCurrencyDetailed(localTaxBaseAmounts[key])}</small></span>
                    </label>
                  ))}
                </div>
                <div className="status-card status-card--note">
                  {selectedLocalTaxProfile.note} Local rules change often; verify the current city/county rate and whether the tax applies to residents, nonresidents, or earned income only.
                </div>
                {selectedLocalTaxProfile.kind === "progressive" && selectedLocalTaxProfile.brackets && (
                  <div className="metric-grid state-tax-panel__tiles">
                    {selectedLocalTaxProfile.brackets.map((bracket) => <MetricCard key={bracket.threshold} label={`Over ${formatCurrency(bracket.threshold)}`} value={formatPercent(bracket.rate)} />)}
                  </div>
                )}
              </div>
            )}
          </Section>
        )}
          </>
        )}
      </main>
      {!focusGrid && (
        <aside className={`thermometer-rail ${showThermometerPanel ? "" : "thermometer-rail--collapsed"}`} aria-label="Tax panel">
          <div className={`tax-thermometer-panel__mode-bar ${showThermometerPanel ? "" : "tax-thermometer-panel__mode-bar--collapsed"}`}>
            {showThermometerPanel && <TaxThermometerModeSelect mode={taxThermometerMode} onChange={setTaxThermometerMode} stateCode={selectedStateCode} stateName={selectedStateName} />}
            <button
              className="tax-thermometer-panel__visibility-toggle"
              type="button"
              aria-expanded={showThermometerPanel}
              aria-controls="tax-thermometer-panel-content"
              aria-label={showThermometerPanel ? "Hide thermometer panel" : "Show thermometer panel"}
              title={showThermometerPanel ? "Hide thermometer panel" : "Show thermometer panel"}
              onClick={() => setShowThermometerPanel((current) => !current)}
            >
              <svg className="tax-thermometer-panel__visibility-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                {showThermometerPanel ? (
                  <><path d="M6.5 6.5 17.5 17.5" /><path d="M17.5 6.5 6.5 17.5" /></>
                ) : (
                  <path d="m14.5 6.5-5.5 5.5 5.5 5.5" />
                )}
              </svg>
            </button>
          </div>
          {showThermometerPanel && <div id="tax-thermometer-panel-content">
            <TaxThermometerPanel
                federalTaxable={federalTaxableAfterDeductions}
                stateTaxable={stateTaxableAfterDeductions}
                federalTax={federalTaxWithPayroll}
                federalIncomeTax={federalIncomeTaxTotal}
                federalPayrollTax={w2PayrollTax.federal.total}
                stateTax={stateTaxWithPayroll}
                stateIncomeTax={displayedStateResult.tax}
                statePayrollTax={w2PayrollTax.state.total}
                statePayrollLabel={w2PayrollTax.state.components.map((component) => component.label).join(" + ") || "State payroll"}
                totalIncome={flows.totalIncome}
                w2Income={effectiveW2Income}
                marginalPayrollRate={marginalW2PayrollRate}
                localTaxable={localTaxableIncome}
                localTax={localTaxTotal}
                localName={localTaxSettings.localityName || selectedLocalTaxProfile.locality || "Local"}
                localEnabled={localTaxSettings.enabled}
                 localEffectiveRate={localTaxResult.effectiveRate}
                 localMarginalRate={localTaxResult.marginalRate}
                 localBrackets={selectedLocalTaxProfile.brackets || []}
                 stateBrackets={selectedStateBrackets}
                 filingStatus={federalSettings.filingStatus}
                stateCode={selectedStateCode}
                stateName={selectedStateName}
                allocationRows={portfolioAllocationRows}
                accountTaxAllocationRows={accountTaxAllocationRows}
                accountTypeAllocationRows={accountTypeAllocationRows}
            taxTreatmentAllocationRows={taxTreatmentAllocationRows}
            thermometerMode={taxThermometerMode}
            />
          </div>}
        </aside>
      )}
      </div>
    </div>
  );
}

