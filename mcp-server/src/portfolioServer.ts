import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { accountAllowsCurrentIncome, effectiveInvestmentRate, incomeCalculationModes, resolveIncomeCalculationMode, investmentNetIncome, isFederalTaxExemptInterestTreatment, isNonInvestmentIncomeType, localIncomeCategory, localIncomeCategories, whatIfInvestmentIncome } from "./portfolioIncome.js";

export const DEFAULT_API_BASE_URL =
  "https://j4evba8fpj.execute-api.us-west-2.amazonaws.com/portfolio/hello";
export const DEFAULT_WORKSPACE_ID = "default";
export const SERVER_NAME = "portfolio-workbook";
export const SERVER_VERSION = "1.2.0";
export const MODEL_SURFACE_RESOURCE_URI = "ui://aftertaxus/model-surface-v1.html";
export const DEFAULT_UI_APP_ORIGIN = "https://www.aftertaxus.com";

export type PortfolioServerConfig = {
  apiBaseUrl?: string;
  defaultWorkspaceId?: string;
  portfolioSyncToken?: string;
  portfolioMcpToken?: string;
  uiAppOrigin?: string;
  loadUiHtml?: () => Promise<string>;
  apiRequestTimeoutMs?: number;
  apiMaxReadRetries?: number;
  signal?: AbortSignal;
};

type ResolvedPortfolioServerConfig = {
  apiBaseUrl: string;
  defaultWorkspaceId: string;
  portfolioSyncToken: string;
  portfolioMcpToken: string;
  uiAppOrigin: string;
  loadUiHtml?: () => Promise<string>;
  apiRequestTimeoutMs: number;
  apiMaxReadRetries: number;
  signal?: AbortSignal;
};

type WorkbookResponse = {
  workspaceId: string;
  tabs: Record<string, unknown>;
  settings: Record<string, unknown>;
  updatedAt: string | null;
  revision?: number;
};

type WorkbookRow = Record<string, unknown>;
type TaxTreatmentRule = {
  ordinaryShare: number;
  preferredShare: number;
  stateRule: string;
  niitIncluded: boolean;
  localCategory: string;
};
type ReferenceTableName =
  | "tickers"
  | "accounts"
  | "categories"
  | "taxTreatment"
  | "accountTaxType"
  | "accountType"
  | "investmentType";

const modelSurfaceSchema = z.enum([
  "investmentsIncome",
  "assets",
  "assetClasses",
  "taxTreatments",
  "accounts",
  "accountTaxCategories",
  "accountTypes",
  "federalTax",
  "stateTax",
  "localTax",
]);
type ModelSurfaceName = z.infer<typeof modelSurfaceSchema>;
type ModelSurfaceAction = "view" | "add" | "edit";
type ModelSurfaceConfig = { title: string; tab: string; workbookTab?: string };
const modelSurfaceConfigs: Record<ModelSurfaceName, ModelSurfaceConfig> = {
  investmentsIncome: { title: "Investments / Income", tab: "investments", workbookTab: "investments" },
  assets: { title: "Assets", tab: "tickers", workbookTab: "tickers" },
  assetClasses: { title: "Asset Classes", tab: "categories", workbookTab: "categories" },
  taxTreatments: { title: "Tax Treatments", tab: "taxTreatment", workbookTab: "taxTreatment" },
  accounts: { title: "Accounts", tab: "accounts", workbookTab: "accounts" },
  accountTaxCategories: { title: "Account Tax Category", tab: "accountTaxType", workbookTab: "accountTaxType" },
  accountTypes: { title: "Account Type", tab: "accountType", workbookTab: "accountType" },
  federalTax: { title: "Federal Tax", tab: "federal" },
  stateTax: { title: "State Tax", tab: "state" },
  localTax: { title: "Local Tax", tab: "local" },
};

const referenceTableNameSchema = z.enum([
  "tickers",
  "accounts",
  "categories",
  "taxTreatment",
  "accountTaxType",
  "accountType",
  "investmentType",
]);
const referenceValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const referenceRowSchema = z.record(referenceValueSchema);

type InvestmentRow = {
  id?: string | number;
  description?: string;
  symbol?: string;
  account?: string;
  category?: string;
  totalInvestment?: number;
  yearlyIncome?: number;
  taxTreatment?: string;
  investmentType?: string;
  [key: string]: unknown;
};

type FilingStatus = "single" | "mfj" | "mfs" | "hoh";
type TaxWhatIfItem = { amount?: unknown; incomeType?: unknown };
type DeductionItem = { amount?: unknown; deductionType?: unknown };
type PortfolioCalculationOptions = {
  workspaceId?: string;
  whatIfActive?: boolean;
  federalWhatIfOpen?: boolean;
  stateWhatIfOpen?: boolean;
  stateCode?: string;
  filingStatus?: FilingStatus;
  deductionMode?: "standard" | "itemized";
  extraOrdinaryIncome?: number;
  extraPreferredIncome?: number;
  extraStateIncome?: number;
  includeRows?: boolean;
};

type WorkbookSaveResponse = {
  workspaceId: string;
  updatedAt: string;
  savedKeys: string[];
  revision?: number;
};

type ApiSuccess<T> = T & { error?: never };
type ApiFailure = { error: string };

export function resolvePortfolioConfig(
  config: PortfolioServerConfig = {}
): ResolvedPortfolioServerConfig {
  return {
    apiBaseUrl: config.apiBaseUrl || DEFAULT_API_BASE_URL,
    defaultWorkspaceId: config.defaultWorkspaceId || DEFAULT_WORKSPACE_ID,
    portfolioSyncToken: config.portfolioSyncToken || "",
    portfolioMcpToken: config.portfolioMcpToken || "",
    uiAppOrigin: (config.uiAppOrigin || DEFAULT_UI_APP_ORIGIN).replace(/\/+$/, ""),
    loadUiHtml: config.loadUiHtml,
    apiRequestTimeoutMs: Math.max(1, Math.min(config.apiRequestTimeoutMs ?? 15_000, 60_000)),
    apiMaxReadRetries: Math.max(0, Math.min(config.apiMaxReadRetries ?? 2, 2)),
    signal: config.signal,
  };
}

export function createHealthPayload(config: PortfolioServerConfig, mcpPath: string) {
  const resolved = resolvePortfolioConfig(config);
  return {
    ok: true,
    name: SERVER_NAME,
    version: SERVER_VERSION,
    mcpPath,
    apiBaseUrl: resolved.apiBaseUrl,
    hasPortfolioSyncToken: Boolean(resolved.portfolioSyncToken),
    hasPortfolioMcpToken: Boolean(resolved.portfolioMcpToken),
  };
}

function jsonToolResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export class PortfolioApiError extends Error {
  constructor(message: string, readonly code: string, readonly status?: number) {
    super(message);
    this.name = "PortfolioApiError";
  }
}

const inFlightApiReads = new WeakMap<ResolvedPortfolioServerConfig, Map<string, Promise<unknown>>>();

async function postPortfolioApi<T>(
  config: ResolvedPortfolioServerConfig,
  body: Record<string, unknown>
): Promise<ApiSuccess<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.portfolioMcpToken) {
    headers["X-Portfolio-MCP-Token"] = config.portfolioMcpToken;
  } else if (config.portfolioSyncToken) {
    headers["X-Portfolio-Sync-Token"] = config.portfolioSyncToken;
  }

  const serializedBody = JSON.stringify(body);
  const retryable = ["WORKBOOK_GET", "TAX_PLAN_2025"].includes(String(body.calc));
  const pending = inFlightApiReads.get(config) ?? new Map<string, Promise<unknown>>();
  inFlightApiReads.set(config, pending);
  const existing = retryable ? pending.get(serializedBody) : undefined;
  if (existing) return structuredClone(await existing) as ApiSuccess<T>;
  const request = async () => {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      config.signal?.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(abort, config.apiRequestTimeoutMs);
      let retryDelay = 100 * 2 ** attempt;
      try {
        if (config.signal?.aborted) controller.abort();
        const response = await fetch(config.apiBaseUrl, { method: "POST", headers, body: serializedBody, signal: controller.signal });
        const responseText = await response.text();
        let data: unknown;
        try { data = JSON.parse(responseText); } catch { data = undefined; }
        if (!response.ok) {
          const retryAfter = response.headers.get("retry-after");
          if (retryAfter) retryDelay = /^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Math.max(Date.parse(retryAfter) - Date.now(), 0);
          const message = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : `Portfolio API returned HTTP ${response.status}`;
          throw new PortfolioApiError(message, "HTTP_ERROR", response.status);
        }
        if (!data || typeof data !== "object") throw new PortfolioApiError("Portfolio API returned an invalid JSON response", "INVALID_RESPONSE");
        if ("error" in data) throw new PortfolioApiError(String(data.error), "API_ERROR");
        return data as ApiSuccess<T>;
      } catch (error) {
        if (controller.signal.aborted) throw new PortfolioApiError(config.signal?.aborted ? "Portfolio API request was aborted" : "Portfolio API request timed out", config.signal?.aborted ? "ABORTED" : "TIMEOUT");
        const transient = error instanceof PortfolioApiError && [429, 502, 503, 504].includes(error.status ?? 0);
        if (!retryable || !transient || attempt >= config.apiMaxReadRetries || !Number.isFinite(retryDelay) || retryDelay > 2_000) throw error;
      } finally {
        clearTimeout(timeout);
        config.signal?.removeEventListener("abort", abort);
      }
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => { clearTimeout(timer); reject(new PortfolioApiError("Portfolio API request was aborted", "ABORTED")); };
        const timer = setTimeout(() => { config.signal?.removeEventListener("abort", onAbort); resolve(); }, retryDelay);
        config.signal?.addEventListener("abort", onAbort, { once: true });
        if (config.signal?.aborted) onAbort();
      });
    }
  };
  const promise = request();
  if (retryable) pending.set(serializedBody, promise);
  try { return structuredClone(await promise); }
  finally { if (retryable) pending.delete(serializedBody); }
}

async function getWorkbook(config: ResolvedPortfolioServerConfig, workspaceId?: string) {
  return postPortfolioApi<WorkbookResponse>(config, {
    calc: "WORKBOOK_GET",
    workspaceId: workspaceId || config.defaultWorkspaceId,
  });
}

async function saveWorkbook(config: ResolvedPortfolioServerConfig, workbook: WorkbookResponse) {
  const settings = workbook.settings && typeof workbook.settings === "object" ? workbook.settings : {};
  const ui = settings.ui && typeof settings.ui === "object" ? settings.ui as Record<string, unknown> : {};
  const mcpRefresh = {
    requestedAt: new Date().toISOString(),
    source: "aftertaxus-mcp",
    serverVersion: SERVER_VERSION,
  };
  const result = await postPortfolioApi<WorkbookSaveResponse>(config, {
    calc: "WORKBOOK_SAVE",
    expectedRevision: workbook.revision ?? 0,
    workspaceId: workbook.workspaceId || config.defaultWorkspaceId,
    tabs: workbook.tabs,
    settings: {
      ...settings,
      ui: {
        ...ui,
        mcpRefresh,
      },
    },
  });
  workbook.revision = result.revision ?? workbook.revision ?? 0;
  workbook.updatedAt = result.updatedAt;
  return result;
}

function toWorkbookRows(value: unknown): WorkbookRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is WorkbookRow => typeof row === "object" && row !== null);
}

function toInvestmentRows(value: unknown): InvestmentRow[] {
  return toWorkbookRows(value) as InvestmentRow[];
}

function rowValue(row: WorkbookRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function rowText(row: WorkbookRow, ...keys: string[]) {
  return String(rowValue(row, ...keys) ?? "");
}

function rowNumber(row: WorkbookRow, ...keys: string[]) {
  const value = rowValue(row, ...keys);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/[\$,]/g, "").replace(/%/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowMatchesQuery(row: WorkbookRow, query?: string) {
  if (!query) return true;
  return JSON.stringify(row).toLowerCase().includes(query.toLowerCase());
}

function normalizeReferenceKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const referenceTableConfigs: Record<
  ReferenceTableName,
  {
    label: string;
    primaryField: string;
    allowedFields: string[];
    numericFields?: string[];
    booleanFields?: string[];
    defaultRow: (id: number) => WorkbookRow;
    aliases?: Record<string, string>;
  }
> = {
  tickers: {
    label: "tickers",
    primaryField: "symbol",
    allowedFields: ["symbol", "percentReturn", "assetType", "category", "taxTreatment", "incomeItem", "extraData", "description", "exDividend", "divPayout"],
    numericFields: ["percentReturn", "extraData"],
    booleanFields: ["incomeItem"],
    defaultRow: (id) => ({ id, symbol: "", percentReturn: 0, assetType: "", category: "", taxTreatment: "income", incomeItem: false, extraData: 0, description: "", exDividend: "", divPayout: "" }),
    aliases: {
      ticker: "symbol",
      percentreturn: "percentReturn",
      pctreturn: "percentReturn",
      return: "percentReturn",
      type: "assetType",
      assettype: "assetType",
      taxtreatment: "taxTreatment",
      taxstatus: "taxTreatment",
      incomeitem: "incomeItem",
      isincomeitem: "incomeItem",
      incometicker: "incomeItem",
      income: "incomeItem",
      extradata: "extraData",
      desc: "description",
      exdividend: "exDividend",
      divpayout: "divPayout",
    },
  },
  accounts: {
    label: "accounts",
    primaryField: "account",
    allowedFields: ["account", "accountType", "taxStatus", "dividendAccrued", "includeInFreeCashflow"],
    defaultRow: (id) => ({ id, account: "", accountType: "Brokerage Account", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" }),
    aliases: {
      accountname: "account",
      accountnames: "account",
      accounttype: "accountType",
      taxstatus: "taxStatus",
      taxtreatment: "taxStatus",
      dividendaccrued: "dividendAccrued",
      dividendacrued: "dividendAccrued",
      includeinfreecashflow: "includeInFreeCashflow",
    },
  },
  categories: {
    label: "categories",
    primaryField: "name",
    allowedFields: ["name", "includeInAllocation"],
    booleanFields: ["includeInAllocation"],
    defaultRow: (id) => ({ id, name: "", includeInAllocation: true }),
    aliases: { category: "name", label: "name" },
  },
  taxTreatment: {
    label: "tax treatment",
    primaryField: "label",
    allowedFields: ["label", "ordinaryShare", "preferredShare", "stateRule", "niitIncluded", "localCategory", "description", "includeInAllocation"],
    numericFields: ["ordinaryShare", "preferredShare"],
    booleanFields: ["niitIncluded", "includeInAllocation"],
    defaultRow: (id) => ({ id, label: "", ordinaryShare: 1, preferredShare: 0, stateRule: "taxable", niitIncluded: true, localCategory: "interest", description: "", includeInAllocation: true }),
    aliases: { taxtreatment: "label", taxstatus: "label", treatment: "label", name: "label", ordinaryshare: "ordinaryShare", preferredshare: "preferredShare", staterule: "stateRule", niitincluded: "niitIncluded", localcategory: "localCategory", desc: "description", allocation: "includeInAllocation" },
  },
  accountTaxType: {
    label: "account tax type",
    primaryField: "taxStatus",
    allowedFields: ["taxStatus", "includeInAllocation"],
    booleanFields: ["includeInAllocation"],
    defaultRow: (id) => ({ id, taxStatus: "", includeInAllocation: true }),
    aliases: { taxstatus: "taxStatus", taxtreatment: "taxStatus", status: "taxStatus", label: "taxStatus", name: "taxStatus" },
  },
  accountType: {
    label: "account type",
    primaryField: "name",
    allowedFields: ["name", "taxStatus", "includeInAllocation"],
    booleanFields: ["includeInAllocation"],
    defaultRow: (id) => ({ id, name: "", taxStatus: "", includeInAllocation: true }),
    aliases: { accounttype: "name", investmenttype: "name", type: "name", label: "name", taxstatus: "taxStatus", allocation: "includeInAllocation" },
  },
  investmentType: {
    label: "account type",
    primaryField: "name",
    allowedFields: ["name", "taxStatus", "includeInAllocation"],
    booleanFields: ["includeInAllocation"],
    defaultRow: (id) => ({ id, name: "", taxStatus: "", includeInAllocation: true }),
    aliases: { accounttype: "name", investmenttype: "name", type: "name", assetclass: "name", category: "name", label: "name", taxstatus: "taxStatus", allocation: "includeInAllocation" },
  },
};

function normalizeBooleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on", "checked"].includes(text);
}

function normalizeNumberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/[\$,]/g, "").replace(/%/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function referenceFieldAlias(tabName: ReferenceTableName, field: string) {
  const config = referenceTableConfigs[tabName];
  const normalized = normalizeReferenceKey(field);
  const direct = config.allowedFields.find((allowedField) => normalizeReferenceKey(allowedField) === normalized);
  if (direct) return direct;
  const alias = config.aliases?.[normalized];
  return alias && config.allowedFields.includes(alias) ? alias : null;
}

function coerceReferenceValue(tabName: ReferenceTableName, field: string, value: unknown) {
  const config = referenceTableConfigs[tabName];
  if (config.booleanFields?.includes(field)) return normalizeBooleanValue(value);
  if (config.numericFields?.includes(field)) return normalizeNumberValue(value);
  return String(value ?? "");
}

function sanitizeReferenceValues(tabName: ReferenceTableName, values: WorkbookRow) {
  const sanitized: WorkbookRow = {};
  const rejected: string[] = [];
  for (const [field, value] of Object.entries(values)) {
    if (["id", "query", "selector", "matchField", "tableName", "tabName", "workspaceId"].includes(field)) continue;
    const allowedField = referenceFieldAlias(tabName, field);
    if (!allowedField) {
      rejected.push(field);
      continue;
    }
    sanitized[allowedField] = coerceReferenceValue(tabName, allowedField, value);
  }
  return { sanitized, rejected };
}

function nextWorkbookRowId(rows: WorkbookRow[], preferredId?: unknown) {
  const usedIds = new Set(rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0));
  const preferred = Number(preferredId);
  if (Number.isFinite(preferred) && preferred > 0 && !usedIds.has(preferred)) return preferred;
  let id = 1;
  while (usedIds.has(id)) id += 1;
  return id;
}

function referenceWorkbookTabName(tabName: ReferenceTableName) {
  return tabName === "investmentType" ? "accountType" : tabName;
}

function referenceRows(workbook: WorkbookResponse, tabName: ReferenceTableName) {
  return toWorkbookRows(workbook.tabs[referenceWorkbookTabName(tabName)]);
}

function findReferenceRowIndex(rows: WorkbookRow[], tabName: ReferenceTableName, values: WorkbookRow, id?: number, query?: string, matchField?: string) {
  if (id !== undefined) {
    const index = rows.findIndex((row) => Number(row.id) === id);
    if (index >= 0) return index;
  }
  if (query) {
    const matches = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => rowMatchesQuery(row, query));
    if (matches.length === 1) return matches[0].index;
    if (matches.length > 1) return -2;
  }

  const config = referenceTableConfigs[tabName];
  const field = matchField ? referenceFieldAlias(tabName, matchField) : config.primaryField;
  if (!field || values[field] === undefined) return -1;
  const matchKey = normalizeReferenceKey(values[field]);
  if (!matchKey) return -1;
  return rows.findIndex((row) => normalizeReferenceKey(row[field]) === matchKey);
}

function collectColumns(rows: WorkbookRow[]) {
  const seen = new Set<string>();
  const columns: string[] = [];
  for (const row of rows) {
    for (const column of Object.keys(row)) {
      if (seen.has(column)) continue;
      seen.add(column);
      columns.push(column);
    }
  }
  return columns;
}

function limitRows(rows: WorkbookRow[], limit?: number) {
  return rows.slice(0, limit ?? 250);
}

function tablePayload(
  workbook: WorkbookResponse,
  tabName: "investments" | "tickers" | "taxTreatment" | "accounts",
  sourceRows: WorkbookRow[],
  rows: WorkbookRow[],
  limit?: number
) {
  const limitedRows = limitRows(rows, limit);
  return {
    workspaceId: workbook.workspaceId,
    updatedAt: workbook.updatedAt,
    tabName,
    totalRows: sourceRows.length,
    matchedRows: rows.length,
    returnedRows: limitedRows.length,
    columns: collectColumns(sourceRows),
    rows: limitedRows,
  };
}

function getInvestmentAccount(row: WorkbookRow) {
  return rowText(row, "account", "accnt", "account_name", "account_names");
}

function getInvestmentCategory(row: WorkbookRow) {
  return rowText(row, "category");
}

function getInvestmentSymbol(row: WorkbookRow) {
  return rowText(row, "symbol", "current_symbol", "ticker", "use_symbol");
}

function getInvestmentTotal(row: WorkbookRow) {
  return rowNumber(row, "totalInvestment", "total_inv", "total_investment", "totalinvestment", "total_inv_amount", "inv");
}

function getInvestmentIncome(row: WorkbookRow) {
  return rowNumber(row, "yearlyIncome", "yr_inc", "yearly_income", "yearinc", "yearly_income_amount", "yr");
}

function getInvestmentIncluded(row: WorkbookRow) {
  const value = rowValue(row, "includeIncome", "inc", "include_income", "income", "include_investment_income", "use");
  if (value === undefined) return true;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "y";
}

function summarizeInvestments(investments: InvestmentRow[]) {
  const totalInvestmentAllRows = investments.reduce(
    (sum, row) => sum + getInvestmentTotal(row),
    0
  );
  const totalIncomeAllRows = investments.reduce(
    (sum, row) => sum + getInvestmentIncome(row),
    0
  );
  const includedInvestments = investments.filter(getInvestmentIncluded);
  const includedInvestment = includedInvestments.reduce(
    (sum, row) => sum + getInvestmentTotal(row),
    0
  );
  const includedIncome = includedInvestments.reduce(
    (sum, row) => sum + getInvestmentIncome(row),
    0
  );

  const byAccount = Object.entries(
    includedInvestments.reduce<Record<string, number>>((acc, row) => {
      const key = getInvestmentAccount(row) || "Unassigned";
      acc[key] = (acc[key] ?? 0) + getInvestmentTotal(row);
      return acc;
    }, {})
  )
    .map(([account, marketValue]) => ({ account, marketValue }))
    .sort((a, b) => b.marketValue - a.marketValue);

  const bySymbol = Object.entries(
    includedInvestments.reduce<Record<string, number>>((acc, row) => {
      const key = getInvestmentSymbol(row) || rowText(row, "description", "desc") || "Unknown";
      acc[key] = (acc[key] ?? 0) + getInvestmentTotal(row);
      return acc;
    }, {})
  )
    .map(([symbol, marketValue]) => ({ symbol, marketValue }))
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 10);

  return {
    positions: investments.length,
    includedPositions: includedInvestments.length,
    totalInvestment: includedInvestment,
    totalIncome: includedIncome,
    yield: includedInvestment > 0 ? includedIncome / includedInvestment : 0,
    includedInvestment,
    includedIncome,
    totalInvestmentAllRows,
    totalIncomeAllRows,
    allRowsYield: totalInvestmentAllRows > 0 ? totalIncomeAllRows / totalInvestmentAllRows : 0,
    byAccount,
    topHoldings: bySymbol,
  };
}

function matchQuery(row: InvestmentRow, query: string) {
  return rowMatchesQuery(row, query);
}

function nextInvestmentId(investments: InvestmentRow[]) {
  return Math.max(0, ...investments.map((row) => Number(row.id) || 0)) + 1;
}

function findInvestmentByIdOrQuery(investments: InvestmentRow[], id?: number, query?: string) {
  if (id !== undefined) {
    const matches = investments.filter((row) => Number(row.id) === id);
    if (matches.length > 1) throw new Error(`Duplicate row ID ${id}; repair row identities before editing.`);
    return matches[0] ?? null;
  }
  if (!query) return null;
  const matches = investments.filter((row) => matchQuery(row, query));
  if (matches.length > 1) throw new Error(`Query is ambiguous: matched ${matches.length} rows.`);
  return matches.length === 1 ? matches[0] : null;
}

function visibleInvestmentRowNumber(row: InvestmentRow, index: number) {
  return normalizeRowId(row.spreadsheetRowNumber) ?? (index >= 0 ? index + 1 : null);
}

function findInvestmentByVisibleRowOrId(investments: InvestmentRow[], rowNumber?: number, id?: number, query?: string, rowId?: number, visibleRowNumber?: number) {
  const selectors = [rowNumber, id, query, rowId, visibleRowNumber].filter((value) => value !== undefined);
  if (selectors.length > 1) throw new Error("Use exactly one of rowId, visibleRowNumber, legacy id/rowNumber, or query.");
  if (rowId !== undefined) return findInvestmentByIdOrQuery(investments, rowId);
  if (query !== undefined) return findInvestmentByIdOrQuery(investments, undefined, query);
  const requestedNumber = visibleRowNumber ?? rowNumber ?? id;
  if (requestedNumber === undefined) return null;
  const matches = investments.filter((row, index) => visibleInvestmentRowNumber(row, index) === requestedNumber || (id !== undefined && Number(row.id) === id));
  if (matches.length > 1) throw new Error(`Ambiguous legacy or duplicate visible row selector ${requestedNumber}; use rowId or a unique visibleRowNumber.`);
  const target = matches[0] ?? null;
  if (target) findInvestmentByIdOrQuery(investments, Number(target.id));
  return target;
}

function normalizeRowId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function uniqueNumericIds(values: unknown[]) {
  return [...new Set(values.map(normalizeRowId).filter((id): id is number => id !== null))];
}

function investmentRowsMatchingSelectors(
  investments: InvestmentRow[],
  selectors: {
    rowNumbers?: Array<number | string>;
    ids?: Array<number | string>;
    rowIds?: Array<number | string>;
    visibleRowNumbers?: Array<number | string>;
    symbols?: string[];
    queries?: string[];
    allRows?: boolean;
  }
) {
  if (selectors.allRows) return investments;
  const requestedRowNumbers = uniqueNumericIds([...(selectors.rowNumbers || []), ...(selectors.visibleRowNumbers || [])]);
  const requestedIds = uniqueNumericIds(selectors.rowIds || []);
  const legacyRows = uniqueNumericIds(selectors.ids || []).map((id) => findInvestmentByVisibleRowOrId(investments, undefined, id));
  for (const id of requestedIds) findInvestmentByIdOrQuery(investments, id);
  for (const number of requestedRowNumbers) findInvestmentByVisibleRowOrId(investments, number);
  const symbolSelectors = (selectors.symbols || []).map((symbol) => symbol.trim()).filter(Boolean);
  const querySelectors = (selectors.queries || []).map((query) => query.trim()).filter(Boolean);

  return investments.filter((row, index) => {
    const internalId = normalizeRowId(row.id);
    const visibleRowNumber = visibleInvestmentRowNumber(row, index);
    return (
      (internalId !== null && requestedIds.includes(internalId)) ||
      legacyRows.includes(row) ||
      (visibleRowNumber !== null && requestedRowNumbers.includes(visibleRowNumber)) ||
      symbolSelectors.some((symbol) => investmentMatchesSelector(row, symbol, true)) ||
      querySelectors.some((query) => investmentMatchesSelector(row, query, false))
    );
  });
}

function selectedInvestmentIdsFromSettings(settings: Record<string, unknown>) {
  const ui = settings.ui && typeof settings.ui === "object" ? settings.ui as Record<string, unknown> : {};
  return Array.isArray(ui.selectedAssetIds) ? uniqueNumericIds(ui.selectedAssetIds) : [];
}

function setSelectedInvestmentIdsInSettings(settings: Record<string, unknown>, selectedAssetIds: number[]) {
  const ui = settings.ui && typeof settings.ui === "object" ? settings.ui as Record<string, unknown> : {};
  return {
    ...settings,
    ui: {
      ...ui,
      selectedAssetIds,
    },
  };
}

function setInvestmentWhatIfOpenInSettings(settings: Record<string, unknown>, investmentWhatIfOpen = true) {
  const ui = settings.ui && typeof settings.ui === "object" ? settings.ui as Record<string, unknown> : {};
  return {
    ...settings,
    ui: {
      ...ui,
      investmentWhatIfOpen,
    },
  };
}

function investmentMatchesSelector(row: InvestmentRow, selector: string, exactSymbolOnly = false) {
  const normalizedSelector = selector.trim().toLowerCase();
  if (!normalizedSelector) return false;
  if (exactSymbolOnly) {
    return [getInvestmentSymbol(row)]
      .some((value) => value.trim().toLowerCase() === normalizedSelector);
  }
  return matchQuery(row, selector);
}

function safeInvestmentUpdate(values: Partial<InvestmentRow>) {
  const allowedKeys = new Set([
    "description",
    "account",
    "category",
    "totalInvestment",
    "yearlyIncome",
    "includeIncome",
    "overrideProposal",
    "symbol",
    "newSymbol",
    "newPercent",
    "incomeCalculationMode",
    "incomeMode",
    "incomeKind",
  ]);

  return Object.fromEntries(
    Object.entries(values).filter(([key, value]) => allowedKeys.has(key) && value !== undefined)
  ) as Partial<InvestmentRow>;
}

function investmentUpdateWithSelectAlias(values: Partial<InvestmentRow> & { select?: boolean }) {
  const update = safeInvestmentUpdate(values);
  if (values.incomeCalculationMode !== undefined || values.incomeMode !== undefined) {
    const legacyMode = values.incomeCalculationMode === "annualIncome" ? "annual-income" : "principal-yield";
    if (values.incomeMode !== undefined && values.incomeCalculationMode !== undefined && values.incomeMode !== legacyMode) throw new Error("Conflicting income modes were supplied.");
    update.incomeMode = values.incomeMode ?? legacyMode;
    update.incomeCalculationMode = update.incomeMode === "annual-income" ? "annualIncome" : "principalYield";
  }
  if (Object.hasOwn(update, "newSymbol") && !Object.hasOwn(update, "newPercent")) update.newPercent = null;
  if (typeof values.select === "boolean" && update.includeIncome === undefined) {
    update.includeIncome = values.select;
  }
  return update;
}

export const investmentFieldManifest = {
  version: 1,
  selectors: { rowId: "Immutable positive integer ID", visibleRowNumber: "Current unfiltered Row column number", id: "Deprecated: rejects ID/visible-row collisions", rowNumber: "Deprecated alias for visibleRowNumber" },
  fields: {
    "✓": { field: "includeIncome", unit: "boolean", effect: "calculation inclusion only" },
    WhatIf: { field: "overrideProposal", unit: "boolean", effect: "proposal only while global WhatIf is open" },
    Highlight: { field: "settings.ui.selectedAssetIds", unit: "row IDs", effect: "visual only" },
    Dividend: { field: "effectivePercent", unit: "decimal rate; 0.09 = 9%", source: "derived active scenario" },
    Investment: { field: "totalInvestment", unit: "USD" },
    Year: { field: "yearlyIncome", unit: "USD/year", source: "derived active scenario; editable only in annualIncome mode" },
    Month: { field: "yearlyIncome / 12", unit: "USD/month", source: "derived active scenario; editable only in annualIncome mode" },
    "New %": { field: "newPercent", unit: "decimal rate; null clears the override; 0 is explicit zero" },
  },
} as const;

const singleInvestmentSelectorSchema = {
  rowId: z.number().int().positive().optional().describe(investmentFieldManifest.selectors.rowId),
  visibleRowNumber: z.number().int().positive().optional().describe(investmentFieldManifest.selectors.visibleRowNumber),
};
const bulkInvestmentSelectorSchema = {
  rowIds: z.array(z.number().int().positive()).max(500).optional().describe("Immutable row IDs only; never visible row numbers."),
  visibleRowNumbers: z.array(z.number().int().positive()).max(500).optional().describe("Current unfiltered Row column numbers only; never IDs."),
};

function investmentUiColumns(row: InvestmentRow, tickerMap: Record<string, WorkbookRow> = {}) {
  const ticker = tickerMap[normalizeLookupKey(getInvestmentSymbol(row))];
  return {
    "Row": Number(row.spreadsheetRowNumber) || Number(row.id) || null,
    "✓": normalizeBooleanValue(row.includeIncome),
    "Account": getInvestmentAccount(row),
    "Asset": getInvestmentSymbol(row),
    "Dividend": normalizeRate(rowValue(ticker || row, "dividend", "percentReturn", "percent_return", "yield")),
    "Investment": getInvestmentTotal(row),
    "Year": getInvestmentIncome(row),
    "Month": getInvestmentIncome(row) / 12,
    "WhatIf": normalizeBooleanValue(row.overrideProposal),
    "New": rowText(row, "newSymbol", "new_symbol", "overrideSymbol"),
    "New %": normalizeRate(rowValue(row, "newPercent", "new_percent", "overridePercent")),
  };
}

function normalizeLookupKey(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeTaxTreatmentKey(value: unknown) {
  return normalizeLookupKey(value).replace(/[^a-z0-9]/g, "");
}

function isReturnOfCapitalTaxTreatment(value: unknown) {
  return ["returnofcapital", "hold"].includes(normalizeTaxTreatmentKey(value));
}

function isTaxFreeTaxTreatment(value: unknown) {
  return ["taxfree", "taxexempt"].includes(normalizeTaxTreatmentKey(value)) || isReturnOfCapitalTaxTreatment(value);
}

function isSocialSecurityTaxTreatment(value: unknown) {
  return ["socialsecurity", "ss85fed"].includes(normalizeTaxTreatmentKey(value));
}

function isSection1256TaxTreatment(value: unknown) {
  return ["section1256", "index6040"].includes(normalizeTaxTreatmentKey(value));
}

function isW2TaxTreatment(value: unknown) {
  return ["w2income", "wages", "w2wages"].includes(normalizeTaxTreatmentKey(value));
}

function canonicalStateRuleForTaxTreatment(value: unknown) {
  if (isTaxFreeTaxTreatment(value) || isSocialSecurityTaxTreatment(value)) return "exempt";
  const key = normalizeTaxTreatmentKey(value);
  if (["statetaxfree", "treasuryinterest", "ustreasuryinterest"].includes(key)) return "treasury-exempt";
  return "";
}

function normalizeStateCode(value: unknown) {
  return String(value || "CA").trim().toUpperCase() || "CA";
}

function normalizeRate(value: unknown) {
  const numeric = normalizeNumberValue(value);
  return Math.abs(numeric) > 1 ? numeric / 100 : numeric;
}

function normalizeYesNo(value: unknown) {
  return normalizeBooleanValue(value) ? "yes" : "no";
}

function isPlaceholderAssetSymbol(value: unknown) {
  const key = normalizeLookupKey(value);
  return !key || key === "n.a." || key === "na" || key === "n/a";
}

function isIncomeAssetType(value: unknown) {
  return normalizeLookupKey(value) === "income";
}

function inferAccountTypeFromAccountName(accountName: unknown) {
  const key = normalizeLookupKey(accountName);
  if (!key) return "";
  if (key.includes("w2") || key.includes("w-2") || key.includes("wage")) return "W2 income";
  if (key.includes("401k") || key.includes("401")) return "401k";
  if (key.includes("inherited") && key.includes("brokerage")) return "inherited Brokerage";
  if (key.includes("ira")) return "IRA";
  if (key.includes("brokerage")) return "Brokerage Account";
  return "";
}

function inferAccountTypeTaxStatus(typeName: unknown) {
  const key = normalizeTaxTreatmentKey(typeName);
  if (["w2", "w2income", "wages", "brokerage", "brokerageaccount", "inheritedbrokerage"].includes(key)) return "taxable";
  if (["ira", "traditionalira", "inheritedira", "401k", "403b", "457b", "taxdeferred"].includes(key)) return "deferred";
  if (["rothira", "roth401k"].includes(key)) return "taxfree";
  return "";
}

function isW2AccountType(value: unknown) {
  return ["w2", "w2income", "wages", "w2wages"].includes(normalizeTaxTreatmentKey(value));
}

function isTaxableAccountStatus(value: unknown, forceTaxable = false) {
  if (forceTaxable) return true;
  const key = normalizeLookupKey(value);
  const compactKey = key.replace(/[^a-z0-9]/g, "");
  return compactKey === "taxable" || compactKey === "partiallytaxable";
}

function defaultTaxTreatmentRule(label: unknown): TaxTreatmentRule {
  const key = normalizeTaxTreatmentKey(label);
  const base = { ordinaryShare: 1, preferredShare: 0, stateRule: "taxable", niitIncluded: true, localCategory: "interest" };
  if (isTaxFreeTaxTreatment(label)) return { ...base, ordinaryShare: 0, stateRule: "exempt", niitIncluded: false, localCategory: "" };
  if (key === "fedtaxfree") return { ...base, ordinaryShare: 0, stateRule: "taxable", niitIncluded: false };
  if (key === "statetaxfree") return { ...base, stateRule: "treasury-exempt" };
  if (isSection1256TaxTreatment(label)) return { ...base, ordinaryShare: 0.4, preferredShare: 0.6, localCategory: "capitalGains" };
  if (["qualifieddiv", "longtermgain"].includes(key)) return { ...base, ordinaryShare: 0, preferredShare: 1, localCategory: key === "qualifieddiv" ? "dividends" : "capitalGains" };
  if (isSocialSecurityTaxTreatment(label)) return { ...base, ordinaryShare: 0.85, stateRule: "exempt", niitIncluded: false, localCategory: "socialSecurity" };
  if (isW2TaxTreatment(label)) return { ...base, niitIncluded: false, localCategory: "wages" };
  if (["retirementincome", "pension", "distribution", "deferredcompensation"].includes(key)) return { ...base, niitIncluded: false, localCategory: "retirementIncome" };
  if (key === "realestate") return { ...base, localCategory: "rentalIncome" };
  if (key === "nonqualifieddiv") return { ...base, localCategory: "dividends" };
  if (key === "shorttermgain") return { ...base, localCategory: "capitalGains" };
  return base;
}

function buildTaxTreatmentRuleMap(workbook: WorkbookResponse) {
  return toWorkbookRows(workbook.tabs.taxTreatment).reduce<Record<string, TaxTreatmentRule>>((map, row) => {
    const label = rowText(row, "label", "taxTreatment", "tax_treatment", "name");
    const key = normalizeLookupKey(label);
    if (!key) return map;
    const defaults = defaultTaxTreatmentRule(label);
    const rule = {
      ordinaryShare: rowValue(row, "ordinaryShare", "ordinary_share") === undefined ? defaults.ordinaryShare : normalizeRate(rowValue(row, "ordinaryShare", "ordinary_share")),
      preferredShare: rowValue(row, "preferredShare", "preferred_share") === undefined ? defaults.preferredShare : normalizeRate(rowValue(row, "preferredShare", "preferred_share")),
      stateRule: canonicalStateRuleForTaxTreatment(label) || rowText(row, "stateRule", "state_rule") || defaults.stateRule,
      niitIncluded: rowValue(row, "niitIncluded", "niit_included") === undefined ? defaults.niitIncluded : normalizeBooleanValue(rowValue(row, "niitIncluded", "niit_included")),
      localCategory: rowText(row, "localCategory", "local_category") || defaults.localCategory,
    };
    const aliases = [label];
    if (isReturnOfCapitalTaxTreatment(label)) aliases.push("hold", "return of capital");
    if (isSocialSecurityTaxTreatment(label)) aliases.push("ss-85-fed", "social security");
    if (isSection1256TaxTreatment(label)) aliases.push("index-60-40", "section 1256");
    for (const alias of aliases) map[normalizeLookupKey(alias)] = rule;
    return map;
  }, {});
}

function fedTaxAdjust(amount: number, taxTreatment: unknown, pref: boolean, rule?: TaxTreatmentRule) {
  const activeRule = rule ?? defaultTaxTreatmentRule(taxTreatment);
  const ordinary = Math.max(0, Math.min(1, normalizeNumberValue(activeRule.ordinaryShare)));
  const preferred = Math.max(0, Math.min(1, normalizeNumberValue(activeRule.preferredShare)));
  const scale = ordinary + preferred > 1 ? 1 / (ordinary + preferred) : 1;
  return amount * (pref ? preferred : ordinary) * scale;
}

function stateTaxAdjust(amount: number, taxTreatment: unknown, _stateCode = "CA", rule?: TaxTreatmentRule) {
  const stateRule = normalizeTaxTreatmentKey(canonicalStateRuleForTaxTreatment(taxTreatment) || rule?.stateRule || defaultTaxTreatmentRule(taxTreatment).stateRule);
  return ["exempt", "treasuryexempt"].includes(stateRule) ? 0 : amount;
}

function isW2IncomeType(incomeType: unknown) {
  return normalizeLookupKey(incomeType) === "w2 wages";
}

function sumTaxWhatIfItems(items: unknown, legacyAmount = 0) {
  return Array.isArray(items)
    ? items.reduce((total, item) => total + (String(item?.incomeType || "").trim() ? normalizeNumberValue(item?.amount) : 0), 0)
    : normalizeNumberValue(legacyAmount);
}

function sumW2TaxWhatIfItems(items: unknown) {
  return (Array.isArray(items) ? items : []).reduce(
    (total, item) => total + (isW2IncomeType((item as TaxWhatIfItem).incomeType) ? normalizeNumberValue((item as TaxWhatIfItem).amount) : 0),
    0
  );
}
function sumLongTermCapitalGainWhatIfItems(items: unknown) {
  return (Array.isArray(items) ? items : []).reduce((total, item) => {
    const type = normalizeLookupKey((item as TaxWhatIfItem).incomeType);
    return /long[- ]term capital gain|section 1250|collectibles gain/.test(type)
      ? total + normalizeNumberValue((item as TaxWhatIfItem).amount)
      : total;
  }, 0);
}



function settingsSection(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeFilingStatus(value: unknown): FilingStatus {
  const key = normalizeLookupKey(value).replace(/[^a-z0-9]/g, "");
  if (["mfj", "marriedfilingjointly", "joint"].includes(key)) return "mfj";
  if (["mfs", "marriedfilingseparately"].includes(key)) return "mfs";
  if (["hoh", "headofhousehold"].includes(key)) return "hoh";
  return "single";
}

function normalizeDeductionMode(value: unknown): "standard" | "itemized" {
  return normalizeLookupKey(value).includes("item") ? "itemized" : "standard";
}

function accountTypeTaxStatusMap(workbook: WorkbookResponse) {
  const rows = toWorkbookRows(workbook.tabs.accountType);
  const map: Record<string, string> = {};
  for (const row of rows) {
    const name = rowText(row, "name", "accountType", "account_type", "type", "label");
    const key = normalizeLookupKey(name);
    if (!key) continue;
    map[key] = rowText(row, "taxStatus", "tax_status", "tax_treatment", "status") || inferAccountTypeTaxStatus(name);
  }
  return map;
}

function buildAccountMaps(workbook: WorkbookResponse) {
  const accountTypes = accountTypeTaxStatusMap(workbook);
  const accounts = toWorkbookRows(workbook.tabs.accounts);
  const accountMap: Record<string, WorkbookRow> = {};
  const accountTaxStatusByName: Record<string, string> = {};
  for (const row of accounts) {
    const accountName = rowText(row, "account", "account_name", "account_names");
    const accountKey = normalizeLookupKey(accountName);
    if (!accountKey) continue;
    accountMap[accountKey] = row;
    const typeName = rowText(row, "accountType", "account_type", "type");
    accountTaxStatusByName[accountKey] =
      rowText(row, "taxStatus", "tax_status", "tax_treatment") ||
      accountTypes[normalizeLookupKey(typeName)] ||
      inferAccountTypeTaxStatus(typeName) ||
      "taxable";
  }
  return { accountMap, accountTaxStatusByName };
}

function buildTickerMap(workbook: WorkbookResponse) {
  const map: Record<string, WorkbookRow> = {};
  for (const row of toWorkbookRows(workbook.tabs.tickers)) {
    const symbol = rowText(row, "symbol", "ticker");
    const key = normalizeLookupKey(symbol);
    if (key) map[key] = row;
  }
  return map;
}

function investmentUiColumnsForWorkbook(workbook: WorkbookResponse, row: InvestmentRow) {
  const resolved = derivePortfolioRows({ ...workbook, tabs: { ...workbook.tabs, investments: [row] } }, normalizeBooleanValue(settingsSection(workbook.settings, "ui").investmentWhatIfOpen))[0];
  return {
    ...investmentUiColumns(row, buildTickerMap(workbook)),
    Row: visibleInvestmentRowNumber(row, toInvestmentRows(workbook.tabs.investments).indexOf(row)),
    "✓": resolved.includeIncome,
    Dividend: resolved.effectivePercent,
    Year: resolved.yearlyIncome,
    Month: resolved.yearlyIncome / 12,
    "New %": resolved.proposedPercent,
  };
}

function derivePortfolioRows(workbook: WorkbookResponse, whatIfActive: boolean, selectedStateCode = "CA") {
  const tickerMap = buildTickerMap(workbook);
  const { accountMap, accountTaxStatusByName } = buildAccountMaps(workbook);
  const taxTreatmentRuleMap = buildTaxTreatmentRuleMap(workbook);

  return toInvestmentRows(workbook.tabs.investments).map((row, index) => {
    const currentTicker = isPlaceholderAssetSymbol(getInvestmentSymbol(row)) ? undefined : tickerMap[normalizeLookupKey(getInvestmentSymbol(row))];
    const rowWhatIfActive = whatIfActive && normalizeBooleanValue(row.overrideProposal);
    const effectiveSymbol = rowWhatIfActive && row.newSymbol ? String(row.newSymbol) : getInvestmentSymbol(row);
    const proposedTicker = row.newSymbol ? tickerMap[normalizeLookupKey(row.newSymbol)] : undefined;
    const effectiveTicker = isPlaceholderAssetSymbol(effectiveSymbol) ? undefined : tickerMap[normalizeLookupKey(effectiveSymbol)] || currentTicker;
    const totalInvestment = getInvestmentTotal(row);
    const currentPercent = normalizeRate(rowValue(currentTicker || {}, "percentReturn", "percent_return"));
    const proposedPercent = normalizeRate(rowValue(row, "newPercent", "new_percent", "overridePercent") ?? rowValue(proposedTicker || {}, "percentReturn", "percent_return") ?? currentPercent);
    const effectivePercent = effectiveInvestmentRate(currentPercent, proposedPercent, rowWhatIfActive);
    const importedYearlyIncome = getInvestmentIncome(row);
    const accountKey = normalizeLookupKey(getInvestmentAccount(row));
    const account = accountMap[accountKey];
    const accountType = rowText(account || {}, "accountType", "account_type", "type");
    const isW2IncomeAccount = isW2AccountType(accountType);
    const incomeCalculationMode = resolveIncomeCalculationMode({
      incomeMode: row.incomeMode,
      incomeCalculationMode: row.incomeCalculationMode,
      incomeItem: rowValue(row, "incomeItem", "income_item") ?? rowValue(currentTicker || {}, "incomeItem", "income_item"),
      assetType: rowValue(currentTicker || {}, "assetType", "asset_type"),
      wageAccount: isW2IncomeAccount,
    });
    const incomeItem = incomeCalculationMode === "annualIncome";
    const yearlyIncome = incomeItem ? importedYearlyIncome : totalInvestment * effectivePercent;
    const included = getInvestmentIncluded(row);
    const includeInAfterTaxValue = rowValue(account || {}, "includeInFreeCashflow", "include_in_free_cashflow");
    const includeInAfterTaxIncome = includeInAfterTaxValue === undefined ? true : normalizeYesNo(includeInAfterTaxValue) === "yes";
    const accountTypeTaxStatus = inferAccountTypeTaxStatus(accountType);
    const taxStatus = String(isW2IncomeAccount ? "taxable" : accountTaxStatusByName[accountKey] || accountTypeTaxStatus || "taxable").toLowerCase();
    const shelteredAccrual = !incomeItem && ["deferred", "taxdeferred", "taxfree", "roth"].includes(normalizeTaxTreatmentKey(taxStatus));
    const filteredIncome = included && !shelteredAccrual ? yearlyIncome : 0;
    const displayFilteredIncome = includeInAfterTaxIncome ? filteredIncome : 0;
    const retirementDistribution = incomeItem && ["deferred", "taxdeferred"].includes(normalizeTaxTreatmentKey(taxStatus));
    const isTaxableAccount = accountAllowsCurrentIncome(taxStatus, incomeItem, isW2IncomeAccount);
    const taxTreatment = retirementDistribution ? "retirement income" : isW2IncomeAccount ? "W2 income" : rowText(effectiveTicker || {}, "taxTreatment", "tax_treatment") || rowText(row, "taxTreatment", "tax_treatment") || "income";
    const taxTreatmentRule = retirementDistribution ? defaultTaxTreatmentRule("retirement income") : taxTreatmentRuleMap[normalizeLookupKey(taxTreatment)] || defaultTaxTreatmentRule(taxTreatment);
    const investmentType = normalizeLookupKey(rowText(effectiveTicker || {}, "category"));
    const isNonInvestmentIncome = retirementDistribution || isW2IncomeAccount || isW2TaxTreatment(taxTreatment) || isSocialSecurityTaxTreatment(taxTreatment) || isNonInvestmentIncomeType(investmentType);
    const taxableMonthlyBase = isTaxableAccount && included ? filteredIncome / 12 : 0;
    const displayTaxableMonthlyBase = isTaxableAccount && included && includeInAfterTaxIncome ? displayFilteredIncome / 12 : 0;
    const ordinaryMonthly = fedTaxAdjust(taxableMonthlyBase, taxTreatment, false, taxTreatmentRule);
    const preferredMonthly = fedTaxAdjust(taxableMonthlyBase, taxTreatment, true, taxTreatmentRule);
    const stateMonthly = stateTaxAdjust(taxableMonthlyBase, taxTreatment, selectedStateCode, taxTreatmentRule);
    const displayOrdinaryMonthly = fedTaxAdjust(displayTaxableMonthlyBase, taxTreatment, false, taxTreatmentRule);
    const displayPreferredMonthly = fedTaxAdjust(displayTaxableMonthlyBase, taxTreatment, true, taxTreatmentRule);
    const displayStateMonthly = stateTaxAdjust(displayTaxableMonthlyBase, taxTreatment, selectedStateCode, taxTreatmentRule);
    const w2Income = isW2IncomeAccount || isW2TaxTreatment(taxTreatment) ? filteredIncome : 0;
    const localCategory = localIncomeCategory({ account: getInvestmentAccount(row), effectiveSymbol, investmentType, localTaxCategory: rowText(effectiveTicker || {}, "localTaxCategory") || taxTreatmentRule.localCategory, incomeKind: rowText(row, "incomeKind") || rowText(effectiveTicker || {}, "incomeKind"), nonInvestmentIncome: isNonInvestmentIncome ? filteredIncome : 0, taxStatus, taxTreatment, w2Income, incomeItem });
    const federalExempt = isTaxFreeTaxTreatment(taxTreatment) || normalizeTaxTreatmentKey(taxTreatment) === "fedtaxfree";
    return {
      id: row.id,
      rowId: row.id,
      visibleRowNumber: visibleInvestmentRowNumber(row, index),
      incomeCalculationMode,
      currentPercent,
      proposedPercent,
      effectivePercent,
      sourceValues: { currentSymbol: getInvestmentSymbol(row), currentPercent, proposedSymbol: row.newSymbol ?? null, proposedPercentOverride: row.newPercent ?? null, storedYearlyIncome: importedYearlyIncome },
      accruedIncome: shelteredAccrual ? yearlyIncome : 0,
      distributionIncome: retirementDistribution ? filteredIncome : 0,
      warnings: retirementDistribution ? ["Traditional distributions are modeled as fully taxable ordinary retirement income; basis, QCDs and early-withdrawal penalties are not modeled."] : [],
      description: rowText(row, "description", "desc"),
      account: getInvestmentAccount(row),
      symbol: getInvestmentSymbol(row),
      newSymbol: rowText(row, "newSymbol", "new_symbol", "overrideSymbol"),
      effectiveSymbol,
      overrideProposal: normalizeBooleanValue(row.overrideProposal),
      includeIncome: included,
      totalInvestment,
      yearlyIncome,
      filteredIncome,
      displayFilteredIncome,
      includedTotal: included && !incomeItem ? totalInvestment : 0,
      incomeItem,
      localCategory,
      localIncome: isTaxableAccount && !isTaxFreeTaxTreatment(taxTreatment) && !["exempt", "treasuryexempt"].includes(normalizeTaxTreatmentKey(taxTreatmentRule.stateRule)) ? filteredIncome : 0,
      taxExemptInterest: isTaxableAccount && isFederalTaxExemptInterestTreatment(taxTreatment) ? filteredIncome : 0,
      niitIncome: investmentNetIncome({ amount: filteredIncome, currentlyTaxable: isTaxableAccount, federalExempt, niitIncluded: taxTreatmentRule.niitIncluded, category: localCategory, taxDeferredAccount: taxStatus.includes("deferred") }),
      longTermCapitalGainIncome: localCategory === "capitalGains" ? preferredMonthly * 12 : 0,
      taxStatus,
      taxTreatment,
      investmentType,
      investmentIncome: !incomeItem ? filteredIncome : 0,
      investmentFederalOrdinary: !incomeItem ? ordinaryMonthly * 12 : 0,
      investmentFederalPreferred: !incomeItem ? preferredMonthly * 12 : 0,
      investmentStateTaxable: !incomeItem ? stateMonthly * 12 : 0,
      federalOrdinary: ordinaryMonthly * 12,
      federalPreferred: preferredMonthly * 12,
      stateTaxable: stateMonthly * 12,
      displayFederalOrdinary: displayOrdinaryMonthly * 12,
      displayFederalPreferred: displayPreferredMonthly * 12,
      displayStateTaxable: displayStateMonthly * 12,
      w2Income,
      nonInvestmentIncome: isNonInvestmentIncome ? filteredIncome : 0,
      displayNonInvestmentIncome: isNonInvestmentIncome && includeInAfterTaxIncome ? filteredIncome : 0,
      nonTaxableIncome: !isTaxableAccount ? filteredIncome : 0,
    };
  });
}

async function calculatePortfolio(workbook: WorkbookResponse, config: ResolvedPortfolioServerConfig, options: PortfolioCalculationOptions = {}) {
  const federalSettings = settingsSection(workbook.settings, "federal");
  const stateSettings = settingsSection(workbook.settings, "state");
  const uiSettings = settingsSection(workbook.settings, "ui");
  const filingStatus = options.filingStatus || normalizeFilingStatus(federalSettings.filingStatus || "mfj");
  const selectedStateCode = normalizeStateCode(options.stateCode || stateSettings.stateCode || "CA");
  const deductionMode = options.deductionMode || normalizeDeductionMode(federalSettings.deductionMode || "standard");
  const whatIfActive = options.whatIfActive ?? normalizeBooleanValue(uiSettings.investmentWhatIfOpen);
  const federalWhatIfOpen = options.federalWhatIfOpen ?? normalizeBooleanValue(uiSettings.federalWhatIfOpen);
  const stateWhatIfOpen = options.stateWhatIfOpen ?? normalizeBooleanValue(uiSettings.stateWhatIfOpen);
  const derivedRows = derivePortfolioRows(workbook, whatIfActive, selectedStateCode);
  const flowSeed = {
    totalInvestmentAmount: 0, totalIncome: 0, investmentIncome: 0,
    investmentFederalOrdinary: 0, investmentFederalPreferred: 0, investmentStateTaxable: 0, longTermCapitalGainIncome: 0,
    displayIncome: 0, federalOrdinary: 0, federalPreferred: 0, stateTaxable: 0,
    displayFederalOrdinary: 0, displayFederalPreferred: 0, displayStateTaxable: 0,
    w2Income: 0, nonTaxableIncome: 0, nonInvestmentIncome: 0, displayNonInvestmentIncome: 0,
  };
  const flows = derivedRows.reduce((acc, row) => {
    acc.totalInvestmentAmount += row.includedTotal;
    acc.totalIncome += row.filteredIncome;
    acc.investmentIncome += row.investmentIncome;
    acc.investmentFederalOrdinary += row.investmentFederalOrdinary;
    acc.investmentFederalPreferred += row.investmentFederalPreferred;
    acc.investmentStateTaxable += row.investmentStateTaxable;
    acc.longTermCapitalGainIncome += row.longTermCapitalGainIncome;
    acc.displayIncome += row.displayFilteredIncome;
    acc.federalOrdinary += row.federalOrdinary;
    acc.federalPreferred += row.federalPreferred;
    acc.stateTaxable += row.stateTaxable;
    acc.displayFederalOrdinary += row.displayFederalOrdinary;
    acc.displayFederalPreferred += row.displayFederalPreferred;
    acc.displayStateTaxable += row.displayStateTaxable;
    acc.w2Income += row.w2Income;
    acc.nonTaxableIncome += row.nonTaxableIncome;
    acc.nonInvestmentIncome += row.nonInvestmentIncome;
    acc.displayNonInvestmentIncome += row.displayNonInvestmentIncome;
    return acc;
  }, { ...flowSeed });

  const normalizeItems = (value: unknown) => (Array.isArray(value) ? value : []).map((item) => ({
    amount: normalizeNumberValue(item?.amount),
    incomeType: String(item?.incomeType || ""),
    deductionType: String(item?.deductionType || ""),
  }));
  const ordinaryItems = Array.isArray(federalSettings.extraOrdinaryItems) ? normalizeItems(federalSettings.extraOrdinaryItems) : undefined;
  const preferredItems = Array.isArray(federalSettings.extraPreferredItems) ? normalizeItems(federalSettings.extraPreferredItems) : undefined;
  const extraOrdinary = federalWhatIfOpen ? options.extraOrdinaryIncome ?? sumTaxWhatIfItems(ordinaryItems, normalizeNumberValue(federalSettings.extraOrdinaryIncome)) : 0;
  const extraPreferred = federalWhatIfOpen ? options.extraPreferredIncome ?? sumTaxWhatIfItems(preferredItems, normalizeNumberValue(federalSettings.extraPreferredIncome)) : 0;
  const extraW2 = federalWhatIfOpen && options.extraOrdinaryIncome === undefined ? sumW2TaxWhatIfItems(ordinaryItems) : 0;
  const extraLongTermGains = federalWhatIfOpen && options.extraPreferredIncome === undefined ? sumLongTermCapitalGainWhatIfItems(preferredItems) : 0;
  const extraState = stateWhatIfOpen ? options.extraStateIncome ?? normalizeNumberValue(stateSettings.extraStateIncome) : 0;
  const extraNiit = federalWhatIfOpen
    ? whatIfInvestmentIncome(options.extraOrdinaryIncome === undefined ? ordinaryItems : undefined, extraOrdinary)
      + whatIfInvestmentIncome(options.extraPreferredIncome === undefined ? preferredItems : undefined, extraPreferred)
    : 0;
  const localSettings = settingsSection(workbook.settings, "local");
  const localExtraAmounts = Object.fromEntries(localIncomeCategories.map((key) => [key, 0]));
  const addExtraLocal = (items: typeof ordinaryItems, fallback: number, preferred: boolean) => {
    const activeItems = items ?? [{ amount: fallback, incomeType: preferred ? "Capital gains" : "Other business income", deductionType: "" }];
    for (const item of activeItems) {
      if (!item.incomeType.trim()) continue;
      const kind = item.incomeType.toLowerCase();
      const category = /w2|wage|salary/.test(kind) ? "wages" : /self/.test(kind) ? "selfEmployment"
        : /rental/.test(kind) ? "rentalIncome" : /dividend/.test(kind) ? "dividends"
        : /gain|collectible|section 1250/.test(kind) ? "capitalGains" : /interest/.test(kind) ? "interest" : "businessIncome";
      localExtraAmounts[category] += Math.max(item.amount, 0);
    }
  };
  if (federalWhatIfOpen) {
    addExtraLocal(options.extraOrdinaryIncome === undefined ? ordinaryItems : undefined, extraOrdinary, false);
    addExtraLocal(options.extraPreferredIncome === undefined ? preferredItems : undefined, extraPreferred, true);
  }
  const buildRequest = (rows: typeof derivedRows) => {
    const sum = (read: (row: typeof derivedRows[number]) => number) => rows.reduce((total, row) => total + read(row), 0);
    const socialSecurityRows = rows.filter((row) => isSocialSecurityTaxTreatment(row.taxTreatment));
    const socialSecurityBenefits = socialSecurityRows.reduce((total, row) => total + row.filteredIncome, 0);
    const scheduledSocialSecurity = socialSecurityRows.reduce((total, row) => total + row.federalOrdinary, 0);
    const localAmounts = { ...localExtraAmounts };
    for (const row of rows) localAmounts[row.localCategory] += row.localIncome;
    return {
      calc: "TAX_PLAN_2025",
      filingStatus,
      state: selectedStateCode,
      ordinaryIncomeExcludingSocialSecurity: Math.max(sum((row) => row.federalOrdinary) - scheduledSocialSecurity + extraOrdinary, 0),
      preferredIncome: sum((row) => row.federalPreferred) + extraPreferred,
      longTermCapitalGainIncome: sum((row) => row.longTermCapitalGainIncome) + extraLongTermGains,
      socialSecurityBenefits,
      taxExemptInterest: sum((row) => row.taxExemptInterest),
      netInvestmentIncome: sum((row) => row.niitIncome) + extraNiit,
      w2Income: sum((row) => row.w2Income) + extraW2,
      totalIncome: sum((row) => row.filteredIncome),
      displayIncome: sum((row) => row.displayFilteredIncome),
      federalDeductionMode: deductionMode,
      federalAboveLineDeductions: normalizeItems(federalSettings.aboveLineDeductionItems),
      federalItemizedDeductions: normalizeItems(federalSettings.deductionItems),
      stateGrossIncome: sum((row) => row.stateTaxable) + extraOrdinary + extraPreferred + extraState,
      stateDeductionMode: normalizeDeductionMode(stateSettings.deductionMode),
      stateStandardDeduction: normalizeNumberValue(stateSettings.standardDeduction),
      stateItemizedDeductions: normalizeItems(stateSettings.deductionItems),
      local: {
        enabled: normalizeBooleanValue(localSettings.enabled),
        localityId: String(localSettings.localityId || "none"),
        residency: localSettings.residency === "nonresident" ? "nonresident" : "resident",
        customRate: normalizeRate(localSettings.rate),
        customNonresidentRate: normalizeRate(localSettings.nonresidentRate),
        taxableBaseAmounts: localAmounts,
        customTaxableBase: localSettings.taxableBase || {},
      },
    };
  };
  const resultSchema = z.object({
    federal: z.object({
      incomeTax: z.number().finite(), total: z.number().finite(), adjustedGrossIncome: z.number().finite(),
      ordinaryTaxable: z.number().finite(), prefTaxable: z.number().finite(), taxableIncome: z.number().finite(),
      deductions: z.object({
        standardOrItemizedDeduction: z.number().finite(),
        capitalLossRaw: z.number().finite(),
        capitalLossDeduction: z.number().finite(),
        aboveLineDeduction: z.number().finite(),
      }).passthrough(),
    }).passthrough(),
    state: z.object({ incomeTax: z.number().finite(), taxableIncome: z.number().finite(), deduction: z.number().finite() }).passthrough(),
    local: z.object({ tax: z.number().finite() }).passthrough(),
    payroll: z.object({
      total: z.number().finite(),
      federal: z.object({ total: z.number().finite() }).passthrough(),
      state: z.object({ total: z.number().finite() }).passthrough(),
    }).passthrough(),
    totalTax: z.number().finite(), afterTaxIncome: z.number().finite(),
  });
  const request = buildRequest(derivedRows);
  const result = resultSchema.parse(await postPortfolioApi(config, request));
  const baselineRows = derivedRows.filter((row) => row.incomeItem);
  const baseline = baselineRows.length === derivedRows.length ? result
    : resultSchema.parse(await postPortfolioApi(config, buildRequest(baselineRows)));
  const investmentTax = result.totalTax - baseline.totalTax;
  const federalDeductions = result.federal.deductions;
  return {
    workspaceId: workbook.workspaceId,
    updatedAt: workbook.updatedAt,
    revision: workbook.revision ?? 0,
    persisted: true,
    activationSource: { investments: options.whatIfActive === undefined ? "saved" : "temporary", federal: options.federalWhatIfOpen === undefined ? "saved" : "temporary", state: options.stateWhatIfOpen === undefined ? "saved" : "temporary" },
    options: { whatIfActive, federalWhatIfOpen, stateWhatIfOpen, stateCode: selectedStateCode, filingStatus, deductionMode },
    income: {
      annualBeforeTax: flows.totalIncome, monthlyBeforeTax: flows.totalIncome / 12,
      annualAfterTax: result.afterTaxIncome, monthlyAfterTax: result.afterTaxIncome / 12,
      spendableBeforeTax: flows.displayIncome, excludedFromAfterTaxIncome: flows.totalIncome - flows.displayIncome,
    },
    taxes: {
      totalTax: result.totalTax, federalIncomeTax: result.federal.incomeTax, stateIncomeTax: result.state.incomeTax,
      localIncomeTax: result.local.tax,
      federalPayrollTax: result.payroll.federal.total, statePayrollTax: result.payroll.state.total,
      w2PayrollTax: result.payroll, federalResult: { ...result.federal, tax: result.federal.incomeTax },
      stateResult: { ...result.state, tax: result.state.incomeTax }, localResult: result.local,
    },
    taxableIncome: {
      federalGross: request.ordinaryIncomeExcludingSocialSecurity + request.preferredIncome + normalizeNumberValue(result.federal.taxableSocialSecurity),
      federalBeforeStandardOrItemized: result.federal.adjustedGrossIncome,
      federal: result.federal.taxableIncome, ordinary: result.federal.ordinaryTaxable, preferred: result.federal.prefTaxable,
      stateGross: request.stateGrossIncome, state: result.state.taxableIncome, magi: result.federal.adjustedGrossIncome,
      netInvestmentIncome: request.netInvestmentIncome,
    },
    deductions: {
      federalDeduction: federalDeductions.standardOrItemizedDeduction, federalDeductionMode: deductionMode,
      federalAboveLineDeductionSummary: { capitalLossRaw: federalDeductions.capitalLossRaw, capitalLossDeduction: federalDeductions.capitalLossDeduction, total: federalDeductions.aboveLineDeduction },
      federalDeductionSummary: federalDeductions, stateDeduction: result.state.deduction,
    },
    portfolio: {
      totalInvestment: flows.totalInvestmentAmount, investmentIncome: flows.investmentIncome, investmentTax,
      beforeTaxYield: flows.totalInvestmentAmount > 0 ? flows.investmentIncome / flows.totalInvestmentAmount : 0,
      afterTaxYield: flows.totalInvestmentAmount > 0 ? (flows.investmentIncome - investmentTax) / flows.totalInvestmentAmount : 0,
    },
    flows,
    rows: options.includeRows ? derivedRows : undefined,
  };
}

function makeUiAssetUrlsAbsolute(html: string, origin: string) {
  return html.replace(/\b(src|href)=(['"])\/(?!\/)/gi, (_match, attribute: string, quote: string) => `${attribute}=${quote}${origin}/`);
}

async function loadModelSurfaceHtml(config: ResolvedPortfolioServerConfig) {
  if (config.loadUiHtml) return makeUiAssetUrlsAbsolute(await config.loadUiHtml(), config.uiAppOrigin);
  const response = await fetch(`${config.uiAppOrigin}/`, { headers: { accept: "text/html" } });
  if (!response.ok) throw new Error(`Unable to load the AfterTaxUS UI shell (${response.status}).`);
  return makeUiAssetUrlsAbsolute(await response.text(), config.uiAppOrigin);
}

function modelSurfaceAppUrl(config: ResolvedPortfolioServerConfig, surface: ModelSurfaceName, action: ModelSurfaceAction, recordId: number | null, editorKind?: "investment" | "income") {
  const url = new URL(config.uiAppOrigin);
  url.searchParams.set("mcp_ui", "1");
  url.searchParams.set("surface", surface);
  url.searchParams.set("action", action);
  if (recordId !== null) url.searchParams.set("recordId", String(recordId));
  if (editorKind) url.searchParams.set("editorKind", editorKind);
  return url.toString();
}

function resolveModelSurfaceRecord(workbook: WorkbookResponse, surface: ModelSurfaceName, recordId?: string | number, query?: string) {
  const config = modelSurfaceConfigs[surface];
  if (!config.workbookTab) return null;
  const rows = toWorkbookRows(workbook.tabs[config.workbookTab]);
  const numericId = Number(recordId);
  if (recordId !== undefined && Number.isFinite(numericId)) {
    const idMatch = rows.find((row) => Number(row.id) === numericId || Number(row.spreadsheetRowNumber) === numericId);
    if (!idMatch) throw new Error(`${config.title} row ${recordId} was not found.`);
    return idMatch;
  }
  if (query) {
    const matches = rows.filter((row) => rowMatchesQuery(row, query));
    if (matches.length !== 1) throw new Error(`${config.title} query must match exactly one row; it matched ${matches.length}.`);
    return matches[0];
  }
  return null;
}

export function createPortfolioServer(config: PortfolioServerConfig = {}) {
  const resolvedConfig = resolvePortfolioConfig(config);
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  }, {
    instructions: "Use data tools to read or change the authoritative AfterTaxUS workbook. When the user wants to inspect, enter, or edit a specific part of the model inside ChatGPT, call show_model_surface after the relevant data tool so only that existing AfterTaxUS tab or editor is rendered.",
  });

  server.registerResource(
    "aftertaxus-model-surface",
    MODEL_SURFACE_RESOURCE_URI,
    {
      title: "AfterTaxUS focused model editor",
      description: "A focused existing AfterTaxUS tab or editor without the surrounding dashboard navigation.",
      mimeType: "text/html;profile=mcp-app",
    },
    async () => ({
      contents: [{
        uri: MODEL_SURFACE_RESOURCE_URI,
        mimeType: "text/html;profile=mcp-app",
        text: await loadModelSurfaceHtml(resolvedConfig),
        _meta: {
          ui: {
            prefersBorder: true,
            domain: resolvedConfig.uiAppOrigin,
            csp: {
              connectDomains: [resolvedConfig.uiAppOrigin, "https://j4evba8fpj.execute-api.us-west-2.amazonaws.com", "https://us-west-2muh8agids.auth.us-west-2.amazoncognito.com"],
              resourceDomains: [resolvedConfig.uiAppOrigin, "https://commons.wikimedia.org", "https://upload.wikimedia.org"],
            },
          },
          "openai/widgetDescription": "Focused AfterTaxUS model view using the product's existing tab and edit dialog.",
          "openai/widgetPrefersBorder": true,
          "openai/widgetDomain": resolvedConfig.uiAppOrigin,
          "openai/widgetCSP": {
            connect_domains: [resolvedConfig.uiAppOrigin, "https://j4evba8fpj.execute-api.us-west-2.amazonaws.com", "https://us-west-2muh8agids.auth.us-west-2.amazoncognito.com"],
            resource_domains: [resolvedConfig.uiAppOrigin, "https://commons.wikimedia.org", "https://upload.wikimedia.org"],
          },
        },
      }],
    })
  );

  server.registerTool(
    "show_model_surface",
    {
      title: "Show focused AfterTaxUS editor",
      description: "Render only one existing AfterTaxUS model tab or editor in ChatGPT. Call this after a data mutation when the user wants to view or edit the result. For a newly created lookup row, pass action='edit' plus its id or a unique query. Use action='add' on investmentsIncome to open the existing add investment/income popup.",
      inputSchema: {
        workspaceId: z.string().optional(),
        surface: modelSurfaceSchema.describe("The exact model area to display."),
        action: z.enum(["view", "add", "edit"]).default("view"),
        recordId: z.union([z.number(), z.string()]).optional().describe("Row id to open in the existing editor."),
        query: z.string().optional().describe("Unique row query to resolve when a record id is not known."),
        editorKind: z.enum(["investment", "income"]).optional().describe("For investmentsIncome action='add', skip the chooser and open this existing form."),
      },
      outputSchema: {
        surface: modelSurfaceSchema,
        tab: z.string(),
        action: z.enum(["view", "add", "edit"]),
        recordId: z.number().nullable(),
        editorKind: z.enum(["investment", "income"]).nullable(),
        workspaceId: z.string(),
        title: z.string(),
        appUrl: z.string(),
        updatedAt: z.string().nullable(),
        workbook: z.object({
          workspaceId: z.string(),
          tabs: z.record(z.unknown()),
          settings: z.record(z.unknown()),
          updatedAt: z.string().nullable(),
        }),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      _meta: {
        ui: { resourceUri: MODEL_SURFACE_RESOURCE_URI },
        "openai/outputTemplate": MODEL_SURFACE_RESOURCE_URI,
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Opening focused editor…",
        "openai/toolInvocation/invoked": "Focused editor opened.",
      },
    },
    async ({ workspaceId, surface, action, recordId, query, editorKind }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const surfaceConfig = modelSurfaceConfigs[surface];
      const matchedRow = action === "edit" ? resolveModelSurfaceRecord(workbook, surface, recordId, query) : null;
      if (action === "edit" && surfaceConfig.workbookTab && !matchedRow) {
        throw new Error(`action='edit' for ${surfaceConfig.title} requires a valid recordId or unique query.`);
      }
      const numericRecordId = matchedRow ? Number(matchedRow.id) : Number(recordId);
      const resolvedRecordId = Number.isFinite(numericRecordId) ? numericRecordId : null;
      const resolvedEditorKind = surface === "investmentsIncome" ? editorKind ?? null : null;
      const structuredContent = {
        surface,
        tab: surfaceConfig.tab,
        action,
        recordId: resolvedRecordId,
        editorKind: resolvedEditorKind,
        workspaceId: workbook.workspaceId,
        title: surfaceConfig.title,
        appUrl: modelSurfaceAppUrl(resolvedConfig, surface, action, resolvedRecordId, resolvedEditorKind ?? undefined),
        updatedAt: workbook.updatedAt,
        workbook,
      };
      return {
        structuredContent,
        content: [{ type: "text" as const, text: `Showing only the ${surfaceConfig.title} ${action === "edit" ? "editor" : "view"}.` }],
      };
    }
  );

  server.registerTool(
    "run_model_surface_api",
    {
      title: "Run focused UI data request",
      description: "UI-only bridge used by the focused AfterTaxUS component to calculate and save the authorized workbook. Initial render data is supplied directly by show_model_surface.",
      inputSchema: {
        body: z.record(z.unknown()),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
      _meta: {
        ui: { visibility: ["app"] },
        "openai/visibility": "private",
      },
    },
    async ({ body }) => {
      const calc = String(body.calc || "");
      const allowedCalculations = new Set([
        "WORKBOOK_GET",
        "WORKBOOK_REVISION",
        "WORKBOOK_SAVE",
        "TAX_CONFIG_2025",
        "TAX_PLAN_2025",
        "STATE_TAX_2025",
      ]);
      if (!allowedCalculations.has(calc)) throw new Error(`${calc || "Missing calc"} is not available to the focused model UI.`);
      try {
        const response = await postPortfolioApi<Record<string, unknown>>(resolvedConfig, body);
        return {
          structuredContent: { status: 200, body: response },
          content: [{ type: "text" as const, text: `${calc} completed for the focused model UI.` }],
        };
      } catch (error) {
        if (!(error instanceof PortfolioApiError) || !error.status) throw error;
        return {
          structuredContent: { status: error.status, body: { error: error.message } },
          content: [{ type: "text" as const, text: `${calc} did not complete (HTTP ${error.status}).` }],
        };
      }
    }
  );

  server.tool(
    "get_workbook_overview",
    "Return a high-level snapshot of the workbook data, including total positions, investment totals, income totals, and available tabs.",
    {
      workspaceId: z.string().optional().describe("Workbook workspace ID. Defaults to 'default'."),
    },
    async ({ workspaceId }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      return jsonToolResult({
        workspaceId: workbook.workspaceId,
        updatedAt: workbook.updatedAt,
        tabs: Object.keys(workbook.tabs),
        settings: Object.keys(workbook.settings),
        summary: summarizeInvestments(investments),
      });
    }
  );

  const earlyFilingStatusSchema = z.enum(["single", "mfj", "mfs", "hoh"]);
  const earlyCalculationOptionsSchema = {
    workspaceId: z.string().optional(),
    whatIfActive: z.boolean().optional().describe("Omit to use the saved Investments WhatIf switch; false explicitly calculates the current portfolio."),
    federalWhatIfOpen: z.boolean().optional(),
    stateWhatIfOpen: z.boolean().optional(),
    stateCode: z.string().optional(),
    filingStatus: earlyFilingStatusSchema.optional(),
    deductionMode: z.enum(["standard", "itemized"]).optional(),
    extraOrdinaryIncome: z.number().optional(),
    extraPreferredIncome: z.number().optional(),
    extraStateIncome: z.number().optional(),
    includeRows: z.boolean().default(false),
  };
  const earlyWhatIfProposalSchema = z.object({
    id: z.number().optional().describe("Deprecated legacy selector: rejects collisions between row IDs and visible rows; prefer rowId or visibleRowNumber."),
    ...singleInvestmentSelectorSchema,
    rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
    query: z.string().optional(),
    newSymbol: z.string().min(1).describe("UI column New."),
    newPercent: z.number().nonnegative().nullable().optional().describe("UI column New %."),
    active: z.boolean().default(true).describe("UI column WhatIf checkbox state."),
  });
  const investmentIncomeFieldsSchema = {
    incomeMode: z.enum(["principal-yield", "annual-income"]).optional().describe("Principal × Dividend or directly entered Year/Month income."),
    incomeCalculationMode: z.enum(incomeCalculationModes).optional().describe("Compatibility alias for incomeMode."),
    incomeKind: z.enum(localIncomeCategories).optional().describe("Explicit income category, independent of incomeMode and row checkboxes."),
  };
  const investmentUpdateValuesSchema = z.object({
    ...investmentIncomeFieldsSchema,
    description: z.string().optional(),
    account: z.string().optional().describe("UI column Account."),
    category: z.string().optional().describe("Asset class/category lookup value."),
    totalInvestment: z.number().nonnegative().optional().describe("UI column Investment."),
    yearlyIncome: z.number().optional().describe("UI column Year."),
    includeIncome: z.boolean().optional().describe("UI column ✓, the main selected/included checkbox."),
    overrideProposal: z.boolean().optional().describe("UI column WhatIf, the row WhatIf checkbox."),
    symbol: z.string().optional().describe("UI column Asset."),
    newSymbol: z.string().optional().describe("UI column New."),
    newPercent: z.number().nonnegative().nullable().optional().describe("UI column New %."),
    select: z.boolean().optional().describe("Alias for UI column ✓, the main selected/included checkbox."),
  });
  const investmentReplacementRowSchema = z.object({
    ...investmentIncomeFieldsSchema,
    id: z.union([z.number(), z.string()]).optional(),
    description: z.string().default(""),
    account: z.string().default(""),
    category: z.string().default("core"),
    totalInvestment: z.number().nonnegative().default(0),
    yearlyIncome: z.number().default(0),
    includeIncome: z.boolean().default(true),
    overrideProposal: z.boolean().default(false),
    symbol: z.string().default(""),
    newSymbol: z.string().default(""),
    newPercent: z.number().nonnegative().nullable().optional(),
  });
  const earlyInvestmentSelectionSchema = {
    workspaceId: z.string().optional(),
    rowNumbers: z.array(z.union([z.number(), z.string()])).optional().describe("Visible Row column numbers to check/uncheck in UI column ✓."),
    ...bulkInvestmentSelectorSchema,
    ids: z.array(z.union([z.number(), z.string()])).optional().describe("Visible Row column numbers or internal row ids to check/uncheck in UI column ✓."),
    symbols: z.array(z.string()).optional().describe("Asset symbols to match against the current Asset column only, then check/uncheck UI column ✓."),
    queries: z.array(z.string()).optional().describe("Free-text row queries to match, then check/uncheck UI column ✓."),
    allRows: z.boolean().default(false).describe("When true, check/uncheck UI column ✓ for every investment row."),
    checked: z.boolean().default(true).describe("true selects/includes rows by checking UI column ✓; false deselects/excludes rows by unchecking UI column ✓."),
    returnCalculation: z.boolean().default(false),
  };
  const selectRowsForCalculations = async ({ workspaceId, rowNumbers, ids, rowIds, visibleRowNumbers, symbols, queries, allRows, checked, returnCalculation }: {
    workspaceId?: string;
    rowIds?: number[];
    visibleRowNumbers?: number[];
    rowNumbers?: Array<number | string>;
    ids?: Array<number | string>;
    symbols?: string[];
    queries?: string[];
    allRows: boolean;
    checked: boolean;
    returnCalculation: boolean;
  }) => {
    const workbook = await getWorkbook(resolvedConfig, workspaceId);
    const investments = toInvestmentRows(workbook.tabs.investments);
    const matchedRows = investmentRowsMatchingSelectors(investments, { rowNumbers, ids, rowIds, visibleRowNumbers, symbols, queries, allRows });
    const hasSelector = allRows || (rowNumbers?.length || 0) + (ids?.length || 0) + (rowIds?.length || 0) + (visibleRowNumbers?.length || 0) + (symbols?.length || 0) + (queries?.length || 0) > 0;
    if (!hasSelector) throw new Error("select_rows requires allRows=true, rowNumbers, ids, symbols, or queries.");
    if (matchedRows.length === 0) throw new Error("select_rows found no matching investment rows for UI column ✓.");

    const matchedIds = new Set(uniqueNumericIds(matchedRows.map((row) => row.id)));
    workbook.tabs.investments = investments.map((row) =>
      matchedIds.has(Number(row.id)) ? { ...row, includeIncome: checked } : row
    );
    const saveResult = await saveWorkbook(resolvedConfig, workbook);
    const updatedRows = toInvestmentRows(workbook.tabs.investments).filter((row) => matchedIds.has(Number(row.id)));
    const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId }) : undefined;
    return jsonToolResult({
      ok: true,
      workspaceId: workbook.workspaceId,
      savedAt: saveResult.updatedAt,
      revision: saveResult.revision ?? 0,
      persisted: true,
      checked,
      selected: checked,
      changedCount: updatedRows.length,
      rows: updatedRows.map((row) => ({
        id: normalizeRowId(row.id),
        rowNumber: normalizeRowId(row.spreadsheetRowNumber),
        uiColumns: investmentUiColumnsForWorkbook(workbook, row),
      })),
      calculation,
      note: "Only UI column ✓ was changed. Visual highlights and UI column WhatIf were not changed.",
    });
  };

  server.tool(
    "calculate_portfolio",
    "Calculate the saved workbook with the same 2025 backend engine as the app: annual/monthly after-tax income, federal/state/local tax, employee W2 payroll, Social Security, deductions, and incremental portfolio yields. Uses the saved Investments WhatIf switch unless explicitly overridden. Results are planning estimates, not a complete tax return.",
    earlyCalculationOptionsSchema,
    async (options) => {
      const workbook = await getWorkbook(resolvedConfig, options.workspaceId);
      return jsonToolResult(await calculatePortfolio(workbook, resolvedConfig, options));
    }
  );

  server.tool(
    "select_rows",
    "Select/deselect investment rows for calculations by setting UI column ✓. This is NOT visual highlighting. Use this whenever the user says select rows, include rows, deselect rows, or exclude rows.",
    earlyInvestmentSelectionSchema,
    selectRowsForCalculations
  );

  server.tool(
    "select_all_rows",
    "Select all investment rows for calculations by checking UI column ✓ on every row. This is NOT visual highlighting.",
    {
      workspaceId: z.string().optional(),
      checked: z.boolean().default(true).describe("true selects/includes all rows; false deselects/excludes all rows."),
      returnCalculation: z.boolean().default(false),
    },
    async ({ workspaceId, checked, returnCalculation }) => selectRowsForCalculations({
      workspaceId,
      allRows: true,
      checked,
      returnCalculation,
    })
  );

  server.tool(
    "select_all_investment_rows",
    "Select all investment rows for calculations by checking UI column ✓ on every row. This is NOT visual highlighting.",
    {
      workspaceId: z.string().optional(),
      checked: z.boolean().default(true).describe("true selects/includes all rows; false deselects/excludes all rows."),
      returnCalculation: z.boolean().default(false),
    },
    async ({ workspaceId, checked, returnCalculation }) => selectRowsForCalculations({
      workspaceId,
      allRows: true,
      checked,
      returnCalculation,
    })
  );

  server.tool(
    "select_all_investments",
    "Select all Investments table rows for calculations by checking UI column ✓ on every row. This does not highlight rows and does not change WhatIf.",
    {
      workspaceId: z.string().optional(),
      checked: z.boolean().default(true).describe("true selects/includes all investments; false deselects/excludes all investments."),
      returnCalculation: z.boolean().default(false),
    },
    async ({ workspaceId, checked, returnCalculation }) => selectRowsForCalculations({
      workspaceId,
      allRows: true,
      checked,
      returnCalculation,
    })
  );

  server.tool(
    "select_investment_rows",
    "Bulk select/deselect investment rows for calculations by setting UI column ✓. This is NOT visual highlighting and does not change WhatIf.",
    earlyInvestmentSelectionSchema,
    selectRowsForCalculations
  );

  server.tool(
    "update_investment_row",
    "Latest AfterTaxUS row updater. Updates one investment row by exact row id or by a query that matches exactly one row. Use this for direct ChatGPT edits to investment data.",
    {
      workspaceId: z.string().optional(),
      id: z.number().optional().describe("Deprecated legacy selector: rejects collisions between row IDs and visible rows; prefer rowId or visibleRowNumber."),
      ...singleInvestmentSelectorSchema,
      rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
      query: z.string().optional(),
      values: investmentUpdateValuesSchema,
      returnCalculation: z.boolean().default(false),
    },
    async ({ workspaceId, id, rowNumber, rowId, visibleRowNumber, query, values, returnCalculation }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      const target = findInvestmentByVisibleRowOrId(investments, rowNumber, id, query, rowId, visibleRowNumber);
      if (!target) {
        const matchingCount = query ? investments.filter((row) => matchQuery(row, query)).length : 0;
        throw new Error(
          query && matchingCount !== 1
            ? `update_investment_row requires exactly one match. Query matched ${matchingCount} rows.`
            : "update_investment_row requires a valid investment id or exactly matching query."
        );
      }
      const targetId = Number(target.id);
      const update = investmentUpdateWithSelectAlias(values);
      if (Object.keys(update).length === 0) {
        throw new Error("update_investment_row received no valid row fields to update.");
      }
      workbook.tabs.investments = Object.keys(update).length > 0
        ? investments.map((row) => Number(row.id) === targetId ? { ...row, ...update } : row)
        : investments;
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const updatedRow = toInvestmentRows(workbook.tabs.investments).find((row) => Number(row.id) === targetId);
      const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId }) : undefined;
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        revision: saveResult.revision ?? 0,
        persisted: true,
        investment: updatedRow,
        uiColumns: updatedRow ? investmentUiColumnsForWorkbook(workbook, updatedRow) : undefined,
        selected: typeof values.select === "boolean" ? values.select : undefined,
        calculation,
      });
    }
  );

  server.tool(
    "set_investment_selection_checkbox",
    "Set UI column ✓ in the Investments table for exactly one row. This changes the main included/selected checkbox and affects calculations; it is not WhatIf and not visual highlighting.",
    {
      workspaceId: z.string().optional(),
      id: z.number().optional().describe("Deprecated legacy selector: rejects collisions between row IDs and visible rows; prefer rowId or visibleRowNumber."),
      ...singleInvestmentSelectorSchema,
      rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
      checked: z.boolean().describe("true checks/selects the row; false unchecks/deselects it."),
      returnCalculation: z.boolean().default(false),
    },
    async ({ workspaceId, id, rowNumber, rowId, visibleRowNumber, checked, returnCalculation }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      const target = findInvestmentByVisibleRowOrId(investments, rowNumber, id, undefined, rowId, visibleRowNumber);
      if (!target) throw new Error(`Investment row ${rowNumber ?? id} was not found.`);
      const targetId = Number(target.id);
      workbook.tabs.investments = investments.map((row) =>
        Number(row.id) === targetId ? { ...row, includeIncome: checked } : row
      );
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const updatedRow = toInvestmentRows(workbook.tabs.investments).find((row) => Number(row.id) === targetId);
      const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId }) : undefined;
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        revision: saveResult.revision ?? 0,
        persisted: true,
        id: targetId,
        rowNumber: Number(target.spreadsheetRowNumber) || rowNumber || id,
        selected: checked,
        includeIncome: checked,
        investment: updatedRow,
        uiColumns: updatedRow ? investmentUiColumnsForWorkbook(workbook, updatedRow) : undefined,
        calculation,
      });
    }
  );

  server.tool(
    "set_whatif_checkbox",
    "Set UI column WhatIf in the Investments table for one visible row. Use this exact tool when the user asks to check/uncheck WhatIf. This changes only the WhatIf checkbox and opens the WhatIf columns; it does not visually highlight rows and does not change UI column ✓.",
    {
      workspaceId: z.string().optional(),
      id: z.number().optional().describe("Deprecated legacy selector: rejects collisions between row IDs and visible rows; prefer rowId or visibleRowNumber."),
      ...singleInvestmentSelectorSchema,
      rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
      checked: z.boolean().describe("true checks the row's WhatIf checkbox; false unchecks it."),
      returnCalculation: z.boolean().default(false),
    },
    async ({ workspaceId, id, rowNumber, rowId, visibleRowNumber, checked, returnCalculation }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      const target = findInvestmentByVisibleRowOrId(investments, rowNumber, id, undefined, rowId, visibleRowNumber);
      if (!target) throw new Error(`Investment row ${rowNumber ?? id} was not found.`);
      const targetId = Number(target.id);
      workbook.tabs.investments = investments.map((row) =>
        Number(row.id) === targetId ? { ...row, overrideProposal: checked } : row
      );
      workbook.settings = setInvestmentWhatIfOpenInSettings(workbook.settings, true);
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const updatedRow = toInvestmentRows(workbook.tabs.investments).find((row) => Number(row.id) === targetId);
      const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId }) : undefined;
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        revision: saveResult.revision ?? 0,
        persisted: true,
        id: targetId,
        rowNumber: Number(target.spreadsheetRowNumber) || rowNumber || id,
        whatIfActive: checked,
        overrideProposal: checked,
        investment: updatedRow,
        uiColumns: updatedRow ? investmentUiColumnsForWorkbook(workbook, updatedRow) : undefined,
        calculation,
        note: "Only UI column WhatIf was changed. Visual row highlight and UI column ✓ were not changed. The WhatIf columns were marked open so the frontend can show the checkbox.",
      });
    }
  );

  server.tool(
    "set_investment_whatif_checkbox",
    "Set UI column WhatIf for exactly one investment row. Use this for WhatIf checkbox changes. This changes only the WhatIf checkbox; it is not UI column ✓ and not visual highlighting.",
    {
      workspaceId: z.string().optional(),
      id: z.number().optional().describe("Deprecated legacy selector: rejects collisions between row IDs and visible rows; prefer rowId or visibleRowNumber."),
      ...singleInvestmentSelectorSchema,
      rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
      checked: z.boolean().describe("true activates the row's WhatIf; false deactivates it."),
      returnCalculation: z.boolean().default(false),
    },
    async ({ workspaceId, id, rowNumber, rowId, visibleRowNumber, checked, returnCalculation }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      const target = findInvestmentByVisibleRowOrId(investments, rowNumber, id, undefined, rowId, visibleRowNumber);
      if (!target) throw new Error(`Investment row ${rowNumber ?? id} was not found.`);
      const targetId = Number(target.id);
      workbook.tabs.investments = investments.map((row) =>
        Number(row.id) === targetId ? { ...row, overrideProposal: checked } : row
      );
      workbook.settings = setInvestmentWhatIfOpenInSettings(workbook.settings, true);
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const updatedRow = toInvestmentRows(workbook.tabs.investments).find((row) => Number(row.id) === targetId);
      const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId }) : undefined;
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        revision: saveResult.revision ?? 0,
        persisted: true,
        id: targetId,
        rowNumber: Number(target.spreadsheetRowNumber) || rowNumber || id,
        whatIfActive: checked,
        overrideProposal: checked,
        investment: updatedRow,
        uiColumns: updatedRow ? investmentUiColumnsForWorkbook(workbook, updatedRow) : undefined,
        calculation,
      });
    }
  );

  server.tool(
    "set_investment_cell",
    "Update one Investments-table cell by the exact visible column label. Preferred for ChatGPT: use column='WhatIf' for the WhatIf checkbox, column='✓' for the main selected checkbox, column='Asset' for current asset, column='New' for WhatIf asset, column='New %' for WhatIf percent, column='Investment' for investment amount, column='Year' or 'Month' for income.",
    {
      workspaceId: z.string().optional(),
      id: z.number().optional().describe("Deprecated legacy selector: rejects collisions between row IDs and visible rows; prefer rowId or visibleRowNumber."),
      ...singleInvestmentSelectorSchema,
      rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
      column: z.enum(["✓", "WhatIf", "Account", "Asset", "New", "New %", "Investment", "Year", "Month"]),
      value: z.union([z.string(), z.number(), z.boolean()]),
      returnCalculation: z.boolean().default(false),
    },
    async ({ workspaceId, id, rowNumber, rowId, visibleRowNumber, column, value, returnCalculation }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      const target = findInvestmentByVisibleRowOrId(investments, rowNumber, id, undefined, rowId, visibleRowNumber);
      if (!target) throw new Error(`Investment row ${rowNumber ?? id} was not found.`);
      const targetId = Number(target.id);
      const update: Partial<InvestmentRow> = {};
      if (column === "✓") update.includeIncome = normalizeBooleanValue(value);
      else if (column === "WhatIf") update.overrideProposal = normalizeBooleanValue(value);
      else if (column === "Account") update.account = String(value);
      else if (column === "Asset") update.symbol = String(value);
      else if (column === "New") update.newSymbol = String(value);
      else if (column === "New %") update.newPercent = normalizeRate(value);
      else if (column === "Investment") update.totalInvestment = normalizeNumberValue(value);
      else if (column === "Year") update.yearlyIncome = normalizeNumberValue(value);
      else if (column === "Month") update.yearlyIncome = normalizeNumberValue(value) * 12;

      workbook.tabs.investments = investments.map((row) =>
        Number(row.id) === targetId ? { ...row, ...update } : row
      );
      if (column === "WhatIf" || column === "New" || column === "New %") {
        workbook.settings = setInvestmentWhatIfOpenInSettings(workbook.settings, true);
      }
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const updatedRow = toInvestmentRows(workbook.tabs.investments).find((row) => Number(row.id) === targetId);
      const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId }) : undefined;
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        revision: saveResult.revision ?? 0,
        persisted: true,
        id: targetId,
        rowNumber: Number(target.spreadsheetRowNumber) || rowNumber || id,
        column,
        value,
        investment: updatedRow,
        uiColumns: updatedRow ? investmentUiColumnsForWorkbook(workbook, updatedRow) : undefined,
        calculation,
      });
    }
  );

  server.tool(
    "set_investment_selection_and_whatif",
    "Set both the visible row selection/checkmark and the WhatIf active checkbox for one investment row in a single save. Use this when the user asks to deselect/select a row and also disable/enable WhatIf.",
    {
      workspaceId: z.string().optional(),
      id: z.number().optional().describe("Deprecated legacy selector: rejects collisions between row IDs and visible rows; prefer rowId or visibleRowNumber."),
      ...singleInvestmentSelectorSchema,
      rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
      selected: z.boolean().describe("UI column ✓, the main included/selected checkbox."),
      whatIfActive: z.boolean().describe("UI column WhatIf, the row WhatIf checkbox."),
      returnCalculation: z.boolean().default(false),
    },
    async ({ workspaceId, id, rowNumber, rowId, visibleRowNumber, selected, whatIfActive, returnCalculation }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      const target = findInvestmentByVisibleRowOrId(investments, rowNumber, id, undefined, rowId, visibleRowNumber);
      if (!target) throw new Error(`Investment row ${rowNumber ?? id} was not found.`);
      const targetId = Number(target.id);
      workbook.tabs.investments = investments.map((row) =>
        Number(row.id) === targetId ? { ...row, includeIncome: selected, overrideProposal: whatIfActive } : row
      );
      if (whatIfActive) workbook.settings = setInvestmentWhatIfOpenInSettings(workbook.settings, true);
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const updatedRow = toInvestmentRows(workbook.tabs.investments).find((row) => Number(row.id) === targetId);
      const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId }) : undefined;
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        revision: saveResult.revision ?? 0,
        persisted: true,
        id: targetId,
        rowNumber: Number(target.spreadsheetRowNumber) || rowNumber || id,
        selected,
        includeIncome: selected,
        whatIfActive,
        overrideProposal: whatIfActive,
        investment: updatedRow,
        uiColumns: updatedRow ? investmentUiColumnsForWorkbook(workbook, updatedRow) : undefined,
        calculation,
      });
    }
  );

  server.tool(
    "bulk_update_investments",
    "Latest AfterTaxUS bulk row updater. Updates many investment rows in one save operation by id or exactly matching query, and can optionally add rows when no target is found.",
    {
      workspaceId: z.string().optional(),
      updates: z.array(z.object({
        id: z.number().optional().describe("Deprecated legacy selector: rejects collisions between row IDs and visible rows; prefer rowId or visibleRowNumber."),
        ...singleInvestmentSelectorSchema,
        rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
        query: z.string().optional(),
        values: investmentUpdateValuesSchema,
        addIfMissing: z.boolean().default(false).describe("When true and no row matches, add a new investment row using values plus defaults."),
      })).min(1).max(500),
      returnCalculation: z.boolean().default(false),
    },
    async ({ workspaceId, updates, returnCalculation }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      let investments = toInvestmentRows(workbook.tabs.investments);
      const changedRows: InvestmentRow[] = [];
      let nextId = nextInvestmentId(investments);

      for (const request of updates) {
        const target = findInvestmentByVisibleRowOrId(investments, request.rowNumber, request.id, request.query, request.rowId, request.visibleRowNumber);
        const update = investmentUpdateWithSelectAlias(request.values);
        if (Object.keys(update).length === 0) {
          throw new Error("bulk_update_investments received an update with no valid row fields.");
        }

        if (!target) {
          const matchingCount = request.query ? investments.filter((row) => matchQuery(row, request.query || "")).length : 0;
          if (!request.addIfMissing) {
            throw new Error(
              request.query && matchingCount !== 1
                ? `bulk_update_investments requires exactly one match for query '${request.query}'. Query matched ${matchingCount} rows.`
                : `bulk_update_investments could not find investment row ${request.id ?? ""}.`
            );
          }
          const newRow: InvestmentRow = {
            ...update,
            id: nextId++,
            description: String(update.description || "New Investment"),
            account: String(update.account || ""),
            category: String(update.category || "core"),
            totalInvestment: normalizeNumberValue(update.totalInvestment),
            yearlyIncome: normalizeNumberValue(update.yearlyIncome),
            includeIncome: update.includeIncome ?? true,
            overrideProposal: update.overrideProposal ?? false,
            symbol: String(update.symbol || ""),
            newSymbol: String(update.newSymbol || update.symbol || ""),
            newPercent: update.newPercent ?? null,
          };
          investments = [...investments, newRow];
          changedRows.push(newRow);
          continue;
        }

        const targetId = Number(target.id);
        investments = investments.map((row) => Number(row.id) === targetId ? { ...row, ...update } : row);
        const changedRow = investments.find((row) => Number(row.id) === targetId);
        if (changedRow) changedRows.push(changedRow);
      }

      workbook.tabs.investments = investments;
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId }) : undefined;
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        revision: saveResult.revision ?? 0,
        persisted: true,
        changedCount: changedRows.length,
        changedRows,
        calculation,
      });
    }
  );

  server.tool(
    "replace_investments_table",
    "Latest AfterTaxUS table replacement. Replaces the entire Investments table in one operation for ChatGPT-driven scratch population or complete portfolio imports.",
    {
      workspaceId: z.string().optional(),
      rows: z.array(investmentReplacementRowSchema).min(1).max(500),
      clearHighlights: z.boolean().default(true),
      returnCalculation: z.boolean().default(true),
    },
    async ({ workspaceId, rows, clearHighlights, returnCalculation }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      let nextId = 1;
      const replacedRows = rows.map((row) => {
        const id = normalizeRowId(row.id) ?? nextId;
        nextId = Math.max(nextId, id + 1);
        const symbol = row.symbol || "";
        return {
          ...investmentUpdateWithSelectAlias(row),
          id,
          description: row.description,
          account: row.account,
          category: row.category,
          totalInvestment: row.totalInvestment,
          yearlyIncome: row.yearlyIncome,
          includeIncome: row.includeIncome,
          overrideProposal: row.overrideProposal,
          symbol,
          newSymbol: row.newSymbol || symbol,
          newPercent: row.newPercent,
        };
      });
      workbook.tabs.investments = replacedRows;
      if (clearHighlights) {
        workbook.settings = setSelectedInvestmentIdsInSettings(workbook.settings, []);
      }
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId }) : undefined;
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        revision: saveResult.revision ?? 0,
        persisted: true,
        rowCount: replacedRows.length,
        rows: replacedRows,
        calculation,
      });
    }
  );

  server.tool(
    "apply_whatif_choices",
    "Latest AfterTaxUS bulk WhatIf setter. Sets investment-row WhatIf symbols/choices, saves them, and returns the recalculated portfolio result with investment WhatIf mode active.",
    {
      workspaceId: z.string().optional(),
      proposals: z.array(earlyWhatIfProposalSchema).min(1).max(500),
      clearOtherWhatIfs: z.boolean().default(false),
      includeRows: z.boolean().default(false),
    },
    async ({ workspaceId, proposals, clearOtherWhatIfs, includeRows }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      let investments = toInvestmentRows(workbook.tabs.investments);
      const tickerMap = buildTickerMap(workbook);
      const updates: Array<{ id: number; previousSymbol: string; newSymbol: string; active: boolean }> = [];
      if (clearOtherWhatIfs) {
        investments = investments.map((row) => ({ ...row, overrideProposal: false, newSymbol: getInvestmentSymbol(row), newPercent: null }));
      }
      for (const proposal of proposals) {
        const target = findInvestmentByVisibleRowOrId(investments, proposal.rowNumber, proposal.id, proposal.query, proposal.rowId, proposal.visibleRowNumber);
        if (!target) throw new Error(`apply_whatif_choices could not find a unique investment row for ${proposal.rowNumber ?? proposal.id ?? proposal.query ?? ""}.`);
        const targetId = Number(target.id);
        const newSymbol = proposal.newSymbol.trim();
        const ticker = tickerMap[normalizeLookupKey(newSymbol)];
        const newPercent = proposal.newPercent ?? normalizeRate(rowValue(ticker || {}, "percentReturn", "percent_return"));
        investments = investments.map((row) => Number(row.id) === targetId
          ? { ...row, newSymbol, newPercent, overrideProposal: proposal.active }
          : row
        );
        updates.push({ id: targetId, previousSymbol: getInvestmentSymbol(target), newSymbol, active: proposal.active });
      }
      workbook.tabs.investments = investments;
      workbook.settings = setInvestmentWhatIfOpenInSettings(workbook.settings, true);
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const calculation = await calculatePortfolio(workbook, resolvedConfig, { workspaceId, whatIfActive: true, includeRows });
      return jsonToolResult({ ok: true, workspaceId: workbook.workspaceId, savedAt: saveResult.updatedAt, revision: saveResult.revision ?? 0, persisted: true, updates, calculation });
    }
  );

  server.tool(
    "compare_whatif_choices",
    "Latest AfterTaxUS WhatIf comparison. Compares the saved portfolio against temporary investment WhatIf choices and returns baseline, scenario, and after-tax deltas.",
    {
      workspaceId: z.string().optional(),
      proposals: z.array(earlyWhatIfProposalSchema).min(1).max(500),
      clearOtherWhatIfs: z.boolean().default(false),
      saveScenario: z.boolean().default(false),
      includeRows: z.boolean().default(false),
    },
    async ({ workspaceId, proposals, clearOtherWhatIfs, saveScenario, includeRows }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const baseline = await calculatePortfolio(workbook, resolvedConfig, { workspaceId, whatIfActive: false, includeRows });
      const scenarioWorkbook: WorkbookResponse = {
        ...workbook,
        tabs: { ...workbook.tabs, investments: [...toInvestmentRows(workbook.tabs.investments)] },
        settings: { ...workbook.settings },
      };
      let investments = toInvestmentRows(scenarioWorkbook.tabs.investments);
      const tickerMap = buildTickerMap(scenarioWorkbook);
      const updates: Array<{ id: number; previousSymbol: string; newSymbol: string; active: boolean }> = [];
      if (clearOtherWhatIfs) {
        investments = investments.map((row) => ({ ...row, overrideProposal: false, newSymbol: getInvestmentSymbol(row), newPercent: null }));
      }
      for (const proposal of proposals) {
        const target = findInvestmentByVisibleRowOrId(investments, proposal.rowNumber, proposal.id, proposal.query, proposal.rowId, proposal.visibleRowNumber);
        if (!target) throw new Error(`compare_whatif_choices could not find a unique investment row for ${proposal.rowNumber ?? proposal.id ?? proposal.query ?? ""}.`);
        const targetId = Number(target.id);
        const newSymbol = proposal.newSymbol.trim();
        const ticker = tickerMap[normalizeLookupKey(newSymbol)];
        const newPercent = proposal.newPercent ?? normalizeRate(rowValue(ticker || {}, "percentReturn", "percent_return"));
        investments = investments.map((row) => Number(row.id) === targetId
          ? { ...row, newSymbol, newPercent, overrideProposal: proposal.active }
          : row
        );
        updates.push({ id: targetId, previousSymbol: getInvestmentSymbol(target), newSymbol, active: proposal.active });
      }
      scenarioWorkbook.tabs.investments = investments;
      if (saveScenario) scenarioWorkbook.settings = setInvestmentWhatIfOpenInSettings(scenarioWorkbook.settings, true);
      const saveResult = saveScenario ? await saveWorkbook(resolvedConfig, scenarioWorkbook) : undefined;
      const scenario = await calculatePortfolio(scenarioWorkbook, resolvedConfig, { workspaceId, whatIfActive: true, includeRows });
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        saved: saveScenario,
        savedAt: saveResult?.updatedAt,
        updates,
        baseline,
        scenario,
        delta: {
          annualBeforeTax: scenario.income.annualBeforeTax - baseline.income.annualBeforeTax,
          annualAfterTax: scenario.income.annualAfterTax - baseline.income.annualAfterTax,
          totalTax: scenario.taxes.totalTax - baseline.taxes.totalTax,
          beforeTaxYield: scenario.portfolio.beforeTaxYield - baseline.portfolio.beforeTaxYield,
          afterTaxYield: scenario.portfolio.afterTaxYield - baseline.portfolio.afterTaxYield,
        },
      });
    }
  );

  server.tool(
    "list_investments",
    "List Investments table rows using both raw fields and exact visible UI column labels. Use uiColumns.Row, uiColumns.✓, uiColumns.Asset, uiColumns.WhatIf, uiColumns.New, and uiColumns.New % to reason about the frontend.",
    {
      workspaceId: z.string().optional(),
      query: z
        .string()
        .optional()
        .describe(
          "Free-text match against description, symbol, account, category, tax treatment, or investment type."
        ),
      account: z.string().optional(),
      category: z.string().optional(),
      limit: z.number().int().positive().max(100).optional(),
    },
    async ({ workspaceId, query, account, category, limit }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments)
        .filter((row) => (query ? matchQuery(row, query) : true))
        .filter((row) =>
          account ? getInvestmentAccount(row).toLowerCase() === account.toLowerCase() : true
        )
        .filter((row) =>
          category ? getInvestmentCategory(row).toLowerCase() === category.toLowerCase() : true
        )
        .slice(0, limit ?? 25);

      return jsonToolResult({
        workspaceId: workbook.workspaceId,
        count: investments.length,
        investments: investments.map((row) => ({
          ...row,
          uiColumns: investmentUiColumnsForWorkbook(workbook, row),
        })),
      });
    }
  );

  server.tool(
    "get_investments_table",
    "Return exported investment rows with every available column, including numbered col_N fields from the spreadsheet export.",
    {
      workspaceId: z.string().optional(),
      query: z.string().optional().describe("Free-text match against all exported investment fields."),
      account: z.string().optional().describe("Exact account/accnt match."),
      category: z.string().optional().describe("Exact category match."),
      symbol: z.string().optional().describe("Exact current/effective symbol match."),
      limit: z.number().int().positive().max(1000).optional(),
    },
    async ({ workspaceId, query, account, category, symbol, limit }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const sourceRows = toWorkbookRows(workbook.tabs.investments);
      const rows = sourceRows
        .filter((row) => rowMatchesQuery(row, query))
        .filter((row) =>
          account ? getInvestmentAccount(row).toLowerCase() === account.toLowerCase() : true
        )
        .filter((row) =>
          category ? getInvestmentCategory(row).toLowerCase() === category.toLowerCase() : true
        )
        .filter((row) =>
          symbol ? getInvestmentSymbol(row).toLowerCase() === symbol.toLowerCase() : true
        );

      const payload = tablePayload(workbook, "investments", sourceRows, rows, limit);
      return jsonToolResult({
        ...payload,
        uiColumnLabels: ["Row", "✓", "Account", "Asset", "Dividend", "Investment", "Year", "Month", "WhatIf", "New", "New %"],
        rows: payload.rows.map((row) => ({
          ...row,
          uiColumns: investmentUiColumnsForWorkbook(workbook, row as InvestmentRow),
        })),
      });
    }
  );

  server.tool(
    "get_tickers_table",
    "Return exported ticker rows with every available column, including numbered col_N fields from the spreadsheet export.",
    {
      workspaceId: z.string().optional(),
      query: z.string().optional().describe("Free-text match against all exported ticker fields."),
      symbol: z.string().optional().describe("Exact symbol/ticker match."),
      category: z.string().optional().describe("Exact category match."),
      taxTreatment: z.string().optional().describe("Exact tax treatment/status match."),
      limit: z.number().int().positive().max(1000).optional(),
    },
    async ({ workspaceId, query, symbol, category, taxTreatment, limit }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const sourceRows = toWorkbookRows(workbook.tabs.tickers);
      const rows = sourceRows
        .filter((row) => rowMatchesQuery(row, query))
        .filter((row) =>
          symbol
            ? rowText(row, "symbol", "ticker").toLowerCase() === symbol.toLowerCase()
            : true
        )
        .filter((row) =>
          category ? rowText(row, "category").toLowerCase() === category.toLowerCase() : true
        )
        .filter((row) =>
          taxTreatment
            ? rowText(row, "taxTreatment", "tax_treatment", "tax_status").toLowerCase() ===
              taxTreatment.toLowerCase()
            : true
        );

      return jsonToolResult(tablePayload(workbook, "tickers", sourceRows, rows, limit));
    }
  );

  server.tool(
    "get_tax_treatment_table",
    "Return exported tax-treatment rows with every available column from the spreadsheet export.",
    {
      workspaceId: z.string().optional(),
      query: z.string().optional().describe("Free-text match against all exported tax-treatment fields."),
      label: z.string().optional().describe("Exact label/tax_treatment match."),
      limit: z.number().int().positive().max(1000).optional(),
    },
    async ({ workspaceId, query, label, limit }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const sourceRows = toWorkbookRows(workbook.tabs.taxTreatment);
      const rows = sourceRows
        .filter((row) => rowMatchesQuery(row, query))
        .filter((row) =>
          label
            ? rowText(row, "label", "taxTreatment", "tax_treatment").toLowerCase() ===
              label.toLowerCase()
            : true
        );

      return jsonToolResult(tablePayload(workbook, "taxTreatment", sourceRows, rows, limit));
    }
  );

  server.tool(
    "get_accounts_table",
    "Return exported account rows with every available column, including numbered col_N fields from the spreadsheet export.",
    {
      workspaceId: z.string().optional(),
      query: z.string().optional().describe("Free-text match against all exported account fields."),
      account: z.string().optional().describe("Exact account/account_name/account_names match."),
      taxStatus: z.string().optional().describe("Exact tax status/tax treatment match."),
      limit: z.number().int().positive().max(1000).optional(),
    },
    async ({ workspaceId, query, account, taxStatus, limit }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const sourceRows = toWorkbookRows(workbook.tabs.accounts);
      const rows = sourceRows
        .filter((row) => rowMatchesQuery(row, query))
        .filter((row) =>
          account
            ? rowText(row, "account", "account_name", "account_names").toLowerCase() ===
              account.toLowerCase()
            : true
        )
        .filter((row) =>
          taxStatus
            ? rowText(row, "taxStatus", "tax_status", "tax_treatment").toLowerCase() ===
              taxStatus.toLowerCase()
            : true
        );

      return jsonToolResult(tablePayload(workbook, "accounts", sourceRows, rows, limit));
    }
  );

  server.tool(
    "add_investment",
    "Add one investment row to the current workbook. Use this only when the user explicitly asks to add a holding.",
    {
      workspaceId: z.string().optional(),
      ...investmentIncomeFieldsSchema,
      description: z.string().min(1),
      account: z.string().min(1),
      category: z.string().default("core"),
      totalInvestment: z.number().nonnegative().default(0),
      yearlyIncome: z.number().nonnegative().default(0),
      includeIncome: z.boolean().default(true),
      overrideProposal: z.boolean().default(false),
      symbol: z.string().default(""),
      newSymbol: z.string().default(""),
      newPercent: z.number().nonnegative().nullable().optional(),
    },
    async ({
      workspaceId,
      incomeMode,
      incomeCalculationMode,
      incomeKind,
      description,
      account,
      category,
      totalInvestment,
      yearlyIncome,
      includeIncome,
      overrideProposal,
      symbol,
      newSymbol,
      newPercent,
    }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      const id = nextInvestmentId(investments);
      const row: InvestmentRow = {
        ...investmentUpdateWithSelectAlias({ incomeMode, incomeCalculationMode, incomeKind }),
        id,
        description,
        account,
        category,
        totalInvestment,
        yearlyIncome,
        includeIncome,
        overrideProposal,
        symbol,
        newSymbol: newSymbol || symbol,
        newPercent,
      };

      workbook.tabs.investments = [...investments, row];
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        revision: saveResult.revision ?? 0,
        persisted: true,
        investment: row,
      });
    }
  );

  server.tool(
    "update_investment",
    "Update fields on exactly one investment row by id or by a query that matches exactly one row.",
    {
      workspaceId: z.string().optional(),
      id: z.number().optional(),
      query: z.string().optional(),
      values: z.object({
        ...investmentIncomeFieldsSchema,
        description: z.string().optional(),
        account: z.string().optional(),
        category: z.string().optional(),
        totalInvestment: z.number().nonnegative().optional(),
        yearlyIncome: z.number().nonnegative().optional(),
        includeIncome: z.boolean().optional(),
        overrideProposal: z.boolean().optional(),
        select: z.boolean().optional().describe("Set the investment row's checkmark/select checkbox. This maps to includeIncome in the frontend."),
        symbol: z.string().optional(),
        newSymbol: z.string().optional(),
        newPercent: z.number().nonnegative().nullable().optional(),
      }),
    },
    async ({ workspaceId, id, query, values }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      const target = findInvestmentByIdOrQuery(investments, id, query);
      if (!target) {
        const matchingCount = query ? investments.filter((row) => matchQuery(row, query)).length : 0;
        throw new Error(
          query && matchingCount !== 1
            ? `update_investment requires exactly one match. Query matched ${matchingCount} rows.`
            : "update_investment requires a valid investment id or exactly matching query."
        );
      }

      const update = investmentUpdateWithSelectAlias(values);
      if (Object.keys(update).length === 0) {
        throw new Error("update_investment received no valid fields to update.");
      }

      const targetId = Number(target.id);
      const updatedInvestments = Object.keys(update).length > 0
        ? investments.map((row) => Number(row.id) === targetId ? { ...row, ...update } : row)
        : investments;
      const updatedRow = updatedInvestments.find((row) => Number(row.id) === targetId);
      workbook.tabs.investments = updatedInvestments;
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        revision: saveResult.revision ?? 0,
        persisted: true,
        investment: updatedRow,
        selected: typeof values.select === "boolean" ? values.select : undefined,
      });
    }
  );

  server.tool(
    "set_investment_checkbox",
    "Set one investment checkbox field by visible row number. Use field='select' or field='includeIncome' for UI column ✓, field='overrideProposal' for UI column WhatIf. Use highlight tools only for visual row highlighting.",
    {
      workspaceId: z.string().optional(),
      id: z.number().optional().describe("Deprecated legacy selector: rejects collisions between row IDs and visible rows; prefer rowId or visibleRowNumber."),
      ...singleInvestmentSelectorSchema,
      rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
      field: z.enum(["includeIncome", "overrideProposal", "select"]),
      checked: z.boolean(),
    },
    async ({ workspaceId, id, rowNumber, rowId, visibleRowNumber, field, checked }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      const target = findInvestmentByVisibleRowOrId(investments, rowNumber, id, undefined, rowId, visibleRowNumber);
      if (!target) throw new Error(`Investment row ${rowNumber ?? id} was not found.`);
      const targetId = Number(target.id);

      const dataField = field === "select" ? "includeIncome" : field;
      workbook.tabs.investments = investments.map((row) =>
        Number(row.id) === targetId ? { ...row, [dataField]: checked } : row
      );
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        revision: saveResult.revision ?? 0,
        persisted: true,
        id: targetId,
        rowNumber: Number(target.spreadsheetRowNumber) || rowNumber || id,
        field,
        checked,
        selected: field === "select" || field === "includeIncome" ? checked : undefined,
      });
    }
  );

  const investmentSelectionSchema = {
    workspaceId: z.string().optional(),
    rowNumbers: z.array(z.union([z.number(), z.string()])).optional().describe("Visible Row column numbers to check/uncheck in UI column ✓."),
    ...bulkInvestmentSelectorSchema,
    ids: z.array(z.union([z.number(), z.string()])).optional().describe("Visible Row column numbers or internal row ids to check/uncheck in UI column ✓."),
    symbols: z.array(z.string()).optional().describe("Asset symbols to match against the current Asset column only, then check/uncheck UI column ✓."),
    queries: z.array(z.string()).optional().describe("Free-text row queries to match, then check/uncheck UI column ✓."),
    allRows: z.boolean().default(false).describe("When true, check/uncheck UI column ✓ for every investment row."),
    checked: z.boolean().default(true).describe("true selects/includes rows by checking UI column ✓; false deselects/excludes rows by unchecking UI column ✓."),
    returnCalculation: z.boolean().default(false),
  };
  const selectInvestmentRows = async ({ workspaceId, rowNumbers, ids, rowIds, visibleRowNumbers, symbols, queries, allRows, checked, returnCalculation }: {
    workspaceId?: string;
    rowIds?: number[];
    visibleRowNumbers?: number[];
    rowNumbers?: Array<number | string>;
    ids?: Array<number | string>;
    symbols?: string[];
    queries?: string[];
    allRows: boolean;
    checked: boolean;
    returnCalculation: boolean;
  }) => {
    const workbook = await getWorkbook(resolvedConfig, workspaceId);
    const investments = toInvestmentRows(workbook.tabs.investments);
    const matchedRows = investmentRowsMatchingSelectors(investments, { rowNumbers, ids, rowIds, visibleRowNumbers, symbols, queries, allRows });
    const hasSelector = allRows || (rowNumbers?.length || 0) + (ids?.length || 0) + (rowIds?.length || 0) + (visibleRowNumbers?.length || 0) + (symbols?.length || 0) + (queries?.length || 0) > 0;
    if (!hasSelector) {
      throw new Error("select_investment_rows requires allRows=true, rowNumbers, ids, symbols, or queries.");
    }
    if (matchedRows.length === 0) {
      throw new Error("select_investment_rows found no matching investment rows for UI column ✓.");
    }

    const matchedIds = new Set(uniqueNumericIds(matchedRows.map((row) => row.id)));
    workbook.tabs.investments = investments.map((row) =>
      matchedIds.has(Number(row.id)) ? { ...row, includeIncome: checked } : row
    );
    const saveResult = await saveWorkbook(resolvedConfig, workbook);
    const updatedRows = toInvestmentRows(workbook.tabs.investments).filter((row) => matchedIds.has(Number(row.id)));
    const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId }) : undefined;
    return jsonToolResult({
      ok: true,
      workspaceId: workbook.workspaceId,
      savedAt: saveResult.updatedAt,
      revision: saveResult.revision ?? 0,
      persisted: true,
      checked,
      selected: checked,
      changedCount: updatedRows.length,
      rows: updatedRows.map((row) => ({
        id: normalizeRowId(row.id),
        rowNumber: normalizeRowId(row.spreadsheetRowNumber),
        uiColumns: investmentUiColumnsForWorkbook(workbook, row),
      })),
      calculation,
      note: "Only UI column ✓ was changed. Visual highlights and UI column WhatIf were not changed.",
    });
  };

  server.tool(
    "set_investment_selection_checkboxes",
    "Bulk set UI column ✓ for investment rows. Use this when the user asks to select/deselect/include/exclude multiple rows or all rows. This does not visually highlight rows and does not change WhatIf.",
    investmentSelectionSchema,
    selectInvestmentRows
  );

  const investmentRowHighlightSchema = {
    workspaceId: z.string().optional(),
    ids: z.array(z.union([z.number(), z.string()])).optional().describe("Investment row ids to visually highlight only. This does not set WhatIf or row selection checkboxes."),
    ...bulkInvestmentSelectorSchema,
    symbols: z.array(z.string()).optional().describe("Symbols/tickers to highlight by exact current or WhatIf symbol match."),
    queries: z.array(z.string()).optional().describe("Free-text queries to match against exported investment row fields."),
    mode: z.enum(["replace", "add", "remove"]).default("replace").describe("replace overwrites current highlights; add appends; remove clears matching row highlights."),
    clear: z.boolean().optional().describe("When true, clears all highlighted rows. Overrides ids/symbols/queries."),
  };
  const highlightInvestmentRows = async ({ workspaceId, ids, symbols, queries, mode, clear }: {
    workspaceId?: string;
    ids?: Array<number | string>;
    symbols?: string[];
    queries?: string[];
    mode: "replace" | "add" | "remove";
    clear?: boolean;
  }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      const existingSelection = selectedInvestmentIdsFromSettings(workbook.settings);

      const symbolSelectors = (symbols || []).map((symbol) => symbol.trim()).filter(Boolean);
      const querySelectors = (queries || []).map((query) => query.trim()).filter(Boolean);

      const matchedRows = clear
        ? []
        : investmentRowsMatchingSelectors(investments, { ids, symbols: symbolSelectors, queries: querySelectors });
      const matchedIds = uniqueNumericIds(matchedRows.map((row) => row.id));

      if (!clear && (ids?.length || 0) + symbolSelectors.length + querySelectors.length === 0) {
        throw new Error("highlight_investment_rows requires ids, symbols, queries, or clear=true.");
      }
      if (!clear && matchedIds.length === 0) {
        throw new Error("highlight_investment_rows found no matching investment rows.");
      }

      let selectedAssetIds: number[];
      if (clear) {
        selectedAssetIds = [];
      } else if (mode === "add") {
        selectedAssetIds = [...new Set([...existingSelection, ...matchedIds])];
      } else if (mode === "remove") {
        const removeIds = new Set(matchedIds);
        selectedAssetIds = existingSelection.filter((id) => !removeIds.has(id));
      } else {
        selectedAssetIds = matchedIds;
      }

      workbook.settings = setSelectedInvestmentIdsInSettings(workbook.settings, selectedAssetIds);
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        revision: saveResult.revision ?? 0,
        persisted: true,
        mode: clear ? "clear" : mode,
        selectedAssetIds,
        matchedRows: matchedRows.map((row) => ({
          id: normalizeRowId(row.id),
          description: rowText(row, "description", "desc"),
          account: getInvestmentAccount(row),
          symbol: getInvestmentSymbol(row),
          newSymbol: rowText(row, "newSymbol", "new_symbol", "overrideSymbol"),
        })),
        note: "Open or refresh AfterTaxUS to see persisted row highlights if the app is already running.",
      });
  };

  server.tool(
    "highlight_investment_rows",
    "VISUAL HIGHLIGHT ONLY: highlight specific investment rows in the AfterTaxUS frontend by row ids, symbols, or free-text queries. This does not set WhatIf/overrideProposal.",
    investmentRowHighlightSchema,
    highlightInvestmentRows
  );

  server.tool(
    "set_row_highlight",
    "VISUAL HIGHLIGHT ONLY: set row highlights in the AfterTaxUS React frontend for investment rows. Do not use this for WhatIf checkboxes, overrideProposal, includeIncome, or row selection checkmarks.",
    investmentRowHighlightSchema,
    highlightInvestmentRows
  );

  server.tool(
    "update_reference_row",
    "Update one row in a reference table such as tickers, accounts, categories, tax treatment, account tax type, or investment type.",
    {
      workspaceId: z.string().optional(),
      tableName: referenceTableNameSchema,
      id: z.number().optional().describe("Exact row id to update."),
      query: z.string().optional().describe("Free-text query that must match exactly one row if id is not supplied."),
      values: referenceRowSchema.describe("Allowed fields depend on the table. Unknown fields are rejected."),
    },
    async ({ workspaceId, tableName, id, query, values }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const rows = referenceRows(workbook, tableName);
      const { sanitized, rejected } = sanitizeReferenceValues(tableName, values);
      if (rejected.length) {
        throw new Error(`Unsupported field(s) for ${tableName}: ${rejected.join(", ")}.`);
      }
      if (Object.keys(sanitized).length === 0) {
        throw new Error(`update_reference_row received no valid fields for ${tableName}.`);
      }

      const index = findReferenceRowIndex(rows, tableName, sanitized, id, query);
      if (index === -2) {
        throw new Error("update_reference_row query matched more than one row. Use id or a more specific query.");
      }
      if (index < 0) {
        throw new Error("update_reference_row requires a valid id, exact query match, or primary-field match.");
      }

      const updatedRows = rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...sanitized } : row
      );
      workbook.tabs[referenceWorkbookTabName(tableName)] = updatedRows;
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        revision: saveResult.revision ?? 0,
        persisted: true,
        tableName,
        row: updatedRows[index],
      });
    }
  );

  server.tool(
    "upsert_reference_rows",
    "Update existing reference-table rows by id/query/primary field and add rows that do not already exist.",
    {
      workspaceId: z.string().optional(),
      tableName: referenceTableNameSchema,
      rows: z.array(referenceRowSchema).min(1),
      matchField: z
        .string()
        .optional()
        .describe("Optional allowed field to match on. Defaults to symbol, account, label, taxStatus, or name depending on the table."),
    },
    async ({ workspaceId, tableName, rows: inputRows, matchField }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const existingRows = referenceRows(workbook, tableName);
      const matchFieldName = matchField ? referenceFieldAlias(tableName, matchField) ?? undefined : undefined;
      if (matchField !== undefined && !matchFieldName) {
        throw new Error(`${matchField} is not a valid match field for ${tableName}.`);
      }

      const sanitizedRows = inputRows.map((row) => ({
        raw: row,
        ...sanitizeReferenceValues(tableName, row),
      }));
      const rejected = sanitizedRows.flatMap((row) => row.rejected);
      if (rejected.length) {
        throw new Error(`Unsupported field(s) for ${tableName}: ${[...new Set(rejected)].join(", ")}.`);
      }
      if (sanitizedRows.some((row) => Object.keys(row.sanitized).length === 0)) {
        throw new Error(`Every ${tableName} row must include at least one valid field.`);
      }

      const nextRows = [...existingRows];
      const changedRows: WorkbookRow[] = [];
      let updated = 0;
      let added = 0;
      for (const row of sanitizedRows) {
        const rawId = row.raw.id === null ? undefined : row.raw.id;
        const id = rawId === undefined ? undefined : Number(rawId);
        const query: string | undefined =
          row.raw.query === null || row.raw.query === undefined ? undefined : String(row.raw.query);
        const index = findReferenceRowIndex(
          nextRows,
          tableName,
          row.sanitized,
          Number.isFinite(id) ? id : undefined,
          query,
          matchFieldName
        );
        if (index === -2) {
          throw new Error(`A ${tableName} row query matched more than one row. Use id or a more specific query.`);
        }
        if (index >= 0) {
          nextRows[index] = { ...nextRows[index], ...row.sanitized };
          changedRows.push(nextRows[index]);
          updated += 1;
        } else {
          const addedRow = {
            ...referenceTableConfigs[tableName].defaultRow(nextWorkbookRowId(nextRows, rawId)),
            ...row.sanitized,
          };
          nextRows.push(addedRow);
          changedRows.push(addedRow);
          added += 1;
        }
      }

      workbook.tabs[referenceWorkbookTabName(tableName)] = nextRows;
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        revision: saveResult.revision ?? 0,
        persisted: true,
        tableName,
        updated,
        added,
        rows: changedRows,
        totalRows: nextRows.length,
      });
    }
  );

  server.tool(
    "replace_reference_table",
    "Replace an entire reference table. Use only when the user explicitly wants the full tickers/accounts/categories/tax-treatment/account-tax-type/investment-type table replaced.",
    {
      workspaceId: z.string().optional(),
      tableName: referenceTableNameSchema,
      rows: z.array(referenceRowSchema).min(1),
    },
    async ({ workspaceId, tableName, rows: inputRows }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const nextRows: WorkbookRow[] = [];
      const sanitizedRows = inputRows.map((row) => ({
        raw: row,
        ...sanitizeReferenceValues(tableName, row),
      }));
      const rejected = sanitizedRows.flatMap((row) => row.rejected);
      if (rejected.length) {
        throw new Error(`Unsupported field(s) for ${tableName}: ${[...new Set(rejected)].join(", ")}.`);
      }
      if (sanitizedRows.some((row) => Object.keys(row.sanitized).length === 0)) {
        throw new Error(`Every replacement ${tableName} row must include at least one valid field.`);
      }

      for (const row of sanitizedRows) {
        nextRows.push({
          ...referenceTableConfigs[tableName].defaultRow(nextWorkbookRowId(nextRows, row.raw.id)),
          ...row.sanitized,
        });
      }

      workbook.tabs[referenceWorkbookTabName(tableName)] = nextRows;
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        revision: saveResult.revision ?? 0,
        persisted: true,
        tableName,
        totalRows: nextRows.length,
      });
    }
  );

  server.tool(
    "get_reference_tables",
    "Return workbook reference tables like tickers, accounts, tax treatment, account tax type, and investment type.",
    {
      workspaceId: z.string().optional(),
    },
    async ({ workspaceId }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      return jsonToolResult({
        workspaceId: workbook.workspaceId,
        tickers: workbook.tabs.tickers ?? [],
        accounts: workbook.tabs.accounts ?? [],
        categories: workbook.tabs.categories ?? [],
        taxTreatment: workbook.tabs.taxTreatment ?? [],
        accountTaxType: workbook.tabs.accountTaxType ?? [],
        accountType: workbook.tabs.accountType ?? [],
        investmentType: workbook.tabs.accountType ?? workbook.tabs.investmentType ?? [],
      });
    }
  );

  const filingStatusSchema = z.enum(["single", "mfj", "mfs", "hoh"]);
  const portfolioCalculationOptionsSchema = {
    workspaceId: z.string().optional(),
    whatIfActive: z.boolean().optional().describe("Omit to use the saved Investments WhatIf switch; false explicitly calculates the current portfolio."),
    federalWhatIfOpen: z.boolean().optional().describe("When true, the Federal Tax tab extra income WhatIf rows are included."),
    stateWhatIfOpen: z.boolean().optional().describe("When true, the State Tax tab extra state income WhatIf value is included."),
    stateCode: z.string().optional().describe("Two-letter state code. Defaults to workbook state settings."),
    filingStatus: filingStatusSchema.optional().describe("Federal/state filing status. Defaults to workbook federal settings."),
    deductionMode: z.enum(["standard", "itemized"]).optional().describe("Deduction mode. Defaults to workbook federal settings."),
    extraOrdinaryIncome: z.number().optional().describe("Temporary extra ordinary income for this calculation when federalWhatIfOpen=true."),
    extraPreferredIncome: z.number().optional().describe("Temporary extra preferred income for this calculation when federalWhatIfOpen=true."),
    extraStateIncome: z.number().optional().describe("Temporary extra state income for this calculation when stateWhatIfOpen=true."),
    includeRows: z.boolean().default(false).describe("When true, include row-level derived calculation details."),
  };
  const whatIfProposalSchema = z.object({
    id: z.number().optional().describe("Deprecated legacy selector: rejects collisions between row IDs and visible rows; prefer rowId or visibleRowNumber."),
    ...singleInvestmentSelectorSchema,
    rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
    query: z.string().optional().describe("Free text query that must match exactly one investment row if id is not supplied."),
    newSymbol: z.string().min(1).describe("UI column New, the WhatIf replacement asset/symbol for the row."),
    newPercent: z.number().nonnegative().nullable().optional().describe("UI column New %, optional WhatIf dividend/yield. Defaults from the Assets table when possible."),
    active: z.boolean().default(true).describe("UI column WhatIf checkbox state."),
  });

  server.tool(
    "run_portfolio_calculation",
    "Calculate the full AfterTaxUS portfolio result from the saved workbook, using the same row derivation and backend federal/state tax engines as the frontend. Use this to answer after-tax income, tax, yield, and taxable-income questions.",
    portfolioCalculationOptionsSchema,
    async (options) => {
      const workbook = await getWorkbook(resolvedConfig, options.workspaceId);
      const result = await calculatePortfolio(workbook, resolvedConfig, options);
      return jsonToolResult(result);
    }
  );

  server.tool(
    "set_investment_whatifs",
    "Set one or more investment-row WhatIf asset choices in bulk, optionally clear other WhatIfs, save the workbook, and return the recalculated after-tax portfolio result.",
    {
      workspaceId: z.string().optional(),
      proposals: z.array(whatIfProposalSchema).min(1).max(500),
      clearOtherWhatIfs: z.boolean().default(false).describe("When true, clears all existing row WhatIf overrides before applying these proposals."),
      returnCalculation: z.boolean().default(true).describe("When true, return a full portfolio calculation after saving."),
      calculationOptions: z.object({
        federalWhatIfOpen: z.boolean().optional(),
        stateWhatIfOpen: z.boolean().optional(),
        stateCode: z.string().optional(),
        filingStatus: filingStatusSchema.optional(),
        deductionMode: z.enum(["standard", "itemized"]).optional(),
        includeRows: z.boolean().default(false),
      }).optional(),
    },
    async ({ workspaceId, proposals, clearOtherWhatIfs, returnCalculation, calculationOptions }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      let investments = toInvestmentRows(workbook.tabs.investments);
      const tickerMap = buildTickerMap(workbook);
      const updatedIds: number[] = [];
      const updates: Array<{ id: number; previousSymbol: string; newSymbol: string; active: boolean }> = [];

      if (clearOtherWhatIfs) {
        investments = investments.map((row) => ({ ...row, overrideProposal: false, newSymbol: getInvestmentSymbol(row), newPercent: null }));
      }

      for (const proposal of proposals) {
        const target = findInvestmentByVisibleRowOrId(investments, proposal.rowNumber, proposal.id, proposal.query, proposal.rowId, proposal.visibleRowNumber);
        if (!target) {
          const matchingCount = proposal.query ? investments.filter((row) => matchQuery(row, proposal.query || "")).length : 0;
          throw new Error(
            proposal.query && matchingCount !== 1
              ? `set_investment_whatifs requires exactly one match for query '${proposal.query}'. Query matched ${matchingCount} rows.`
              : `set_investment_whatifs could not find investment row ${proposal.rowNumber ?? proposal.id ?? ""}.`
          );
        }
        const targetId = Number(target.id);
        const symbol = proposal.newSymbol.trim();
        const ticker = tickerMap[normalizeLookupKey(symbol)];
        const newPercent = proposal.newPercent ?? normalizeRate(rowValue(ticker || {}, "percentReturn", "percent_return"));
        investments = investments.map((row) => Number(row.id) === targetId
          ? { ...row, newSymbol: symbol, newPercent, overrideProposal: proposal.active }
          : row
        );
        updatedIds.push(targetId);
        updates.push({ id: targetId, previousSymbol: getInvestmentSymbol(target), newSymbol: symbol, active: proposal.active });
      }

      workbook.tabs.investments = investments;
      workbook.settings = setInvestmentWhatIfOpenInSettings(workbook.settings, true);
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const calculation = returnCalculation
        ? await calculatePortfolio(workbook, resolvedConfig, {
            ...(calculationOptions || {}),
            whatIfActive: true,
            workspaceId,
          })
        : undefined;

      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        revision: saveResult.revision ?? 0,
        persisted: true,
        updatedIds,
        updates,
        calculation,
        note: "Rows were saved with WhatIf overrideProposal values. The returned calculation treats investment WhatIf mode as active.",
      });
    }
  );

  server.tool(
    "compare_portfolio_whatif",
    "Compare the current saved portfolio against a temporary or saved WhatIf scenario and return before/after after-tax income, tax, yield, and deltas.",
    {
      workspaceId: z.string().optional(),
      proposals: z.array(whatIfProposalSchema).optional().describe("Temporary WhatIf proposals to evaluate. They are not saved unless saveScenario=true."),
      saveScenario: z.boolean().default(false).describe("When true, save the proposal rows to the workbook before returning the comparison."),
      clearOtherWhatIfs: z.boolean().default(false),
      calculationOptions: z.object({
        federalWhatIfOpen: z.boolean().optional(),
        stateWhatIfOpen: z.boolean().optional(),
        stateCode: z.string().optional(),
        filingStatus: filingStatusSchema.optional(),
        deductionMode: z.enum(["standard", "itemized"]).optional(),
        includeRows: z.boolean().default(false),
      }).optional(),
    },
    async ({ workspaceId, proposals, saveScenario, clearOtherWhatIfs, calculationOptions }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const baseline = await calculatePortfolio(workbook, resolvedConfig, {
        ...(calculationOptions || {}),
        whatIfActive: false,
        workspaceId,
      });
      const scenarioWorkbook: WorkbookResponse = {
        ...workbook,
        tabs: { ...workbook.tabs, investments: [...toInvestmentRows(workbook.tabs.investments)] },
        settings: { ...workbook.settings },
      };
      let investments = toInvestmentRows(scenarioWorkbook.tabs.investments);
      const tickerMap = buildTickerMap(scenarioWorkbook);
      const updates: Array<{ id: number; previousSymbol: string; newSymbol: string; active: boolean }> = [];
      if (clearOtherWhatIfs) {
        investments = investments.map((row) => ({ ...row, overrideProposal: false, newSymbol: getInvestmentSymbol(row), newPercent: null }));
      }
      for (const proposal of proposals || []) {
        const target = findInvestmentByVisibleRowOrId(investments, proposal.rowNumber, proposal.id, proposal.query, proposal.rowId, proposal.visibleRowNumber);
        if (!target) throw new Error(`compare_portfolio_whatif could not find a unique row for proposal ${proposal.id ?? proposal.query ?? ""}.`);
        const targetId = Number(target.id);
        const symbol = proposal.newSymbol.trim();
        const ticker = tickerMap[normalizeLookupKey(symbol)];
        const newPercent = proposal.newPercent ?? normalizeRate(rowValue(ticker || {}, "percentReturn", "percent_return"));
        investments = investments.map((row) => Number(row.id) === targetId
          ? { ...row, newSymbol: symbol, newPercent, overrideProposal: proposal.active }
          : row
        );
        updates.push({ id: targetId, previousSymbol: getInvestmentSymbol(target), newSymbol: symbol, active: proposal.active });
      }
      scenarioWorkbook.tabs.investments = investments;
      if (saveScenario) scenarioWorkbook.settings = setInvestmentWhatIfOpenInSettings(scenarioWorkbook.settings, true);
      const saveResult = saveScenario ? await saveWorkbook(resolvedConfig, scenarioWorkbook) : undefined;
      const scenario = await calculatePortfolio(scenarioWorkbook, resolvedConfig, {
        ...(calculationOptions || {}),
        whatIfActive: true,
        workspaceId,
      });
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult?.updatedAt,
        saved: saveScenario,
        updates,
        baseline,
        scenario,
        delta: {
          annualBeforeTax: scenario.income.annualBeforeTax - baseline.income.annualBeforeTax,
          annualAfterTax: scenario.income.annualAfterTax - baseline.income.annualAfterTax,
          totalTax: scenario.taxes.totalTax - baseline.taxes.totalTax,
          totalInvestment: scenario.portfolio.totalInvestment - baseline.portfolio.totalInvestment,
          beforeTaxYield: scenario.portfolio.beforeTaxYield - baseline.portfolio.beforeTaxYield,
          afterTaxYield: scenario.portfolio.afterTaxYield - baseline.portfolio.afterTaxYield,
        },
      });
    }
  );

  server.tool(
    "run_federal_tax_calculation",
    "Run the same combined federal tax calculation used by the spreadsheet and React app.",
    {
      ordinaryTaxable: z.number().nonnegative(),
      prefTaxable: z.number().nonnegative(),
      filingStatus: filingStatusSchema,
      magi: z.number().nonnegative(),
      netInvestmentIncome: z.number().nonnegative(),
    },
    async ({ ordinaryTaxable, prefTaxable, filingStatus, magi, netInvestmentIncome }) => {
      const result = await postPortfolioApi<Record<string, unknown>>(resolvedConfig, {
        calc: "FED_TAX_2025_COMBINED",
        ordinaryTaxable,
        prefTaxable,
        filingStatus,
        magi,
        netInvestmentIncome,
      });

      return jsonToolResult(result);
    }
  );

  server.tool(
    "run_california_tax_calculation",
    "Run the same California MFJ state tax calculation used by the spreadsheet and React app.",
    {
      taxableIncome: z.number().nonnegative(),
    },
    async ({ taxableIncome }) => {
      const result = await postPortfolioApi<Record<string, unknown>>(resolvedConfig, {
        calc: "STATE_TAX_2025_CA_MFJ",
        taxableIncome,
      });

      return jsonToolResult(result);
    }
  );

  server.tool(
    "search_portfolio_notes",
    "Search across free-text workbook content for a phrase and return matching records and tabs.",
    {
      workspaceId: z.string().optional(),
      query: z.string().min(1),
    },
    async ({ workspaceId, query }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const matches: Array<{ tab: string; index: number; record: unknown }> = [];

      for (const [tab, value] of Object.entries(workbook.tabs)) {
        if (!Array.isArray(value)) continue;
        value.forEach((record, index) => {
          const text = JSON.stringify(record).toLowerCase();
          if (text.includes(query.toLowerCase())) {
            matches.push({ tab, index, record });
          }
        });
      }

      return jsonToolResult({
        workspaceId: workbook.workspaceId,
        query,
        count: matches.length,
        matches: matches.slice(0, 50),
      });
    }
  );

  return server;
}
