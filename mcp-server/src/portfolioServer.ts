import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const DEFAULT_API_BASE_URL =
  "https://j4evba8fpj.execute-api.us-west-2.amazonaws.com/portfolio/hello";
export const DEFAULT_WORKSPACE_ID = "default";
export const SERVER_NAME = "portfolio-workbook";
export const SERVER_VERSION = "1.0.10";

export type PortfolioServerConfig = {
  apiBaseUrl?: string;
  defaultWorkspaceId?: string;
  portfolioSyncToken?: string;
  portfolioMcpToken?: string;
};

type ResolvedPortfolioServerConfig = {
  apiBaseUrl: string;
  defaultWorkspaceId: string;
  portfolioSyncToken: string;
  portfolioMcpToken: string;
};

type WorkbookResponse = {
  workspaceId: string;
  tabs: Record<string, unknown>;
  settings: Record<string, unknown>;
  updatedAt: string | null;
};

type WorkbookRow = Record<string, unknown>;
type ReferenceTableName =
  | "tickers"
  | "accounts"
  | "categories"
  | "taxTreatment"
  | "accountTaxType"
  | "investmentType";

const referenceTableNameSchema = z.enum([
  "tickers",
  "accounts",
  "categories",
  "taxTreatment",
  "accountTaxType",
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

  const response = await fetch(config.apiBaseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as T | ApiFailure;
  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data
        ? String(data.error)
        : `Portfolio API request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data as ApiSuccess<T>;
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
  return postPortfolioApi<WorkbookSaveResponse>(config, {
    calc: "WORKBOOK_SAVE",
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
    allowedFields: ["symbol", "percentReturn", "category", "taxTreatment", "incomeItem", "extraData", "description", "exDividend", "divPayout"],
    numericFields: ["percentReturn", "extraData"],
    booleanFields: ["incomeItem"],
    defaultRow: (id) => ({ id, symbol: "", percentReturn: 0, category: "", taxTreatment: "income", incomeItem: false, extraData: 0, description: "", exDividend: "", divPayout: "" }),
    aliases: {
      ticker: "symbol",
      percentreturn: "percentReturn",
      pctreturn: "percentReturn",
      return: "percentReturn",
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
    allowedFields: ["account", "taxStatus", "dividendAccrued", "includeInFreeCashflow"],
    defaultRow: (id) => ({ id, account: "", taxStatus: "taxable", dividendAccrued: "no", includeInFreeCashflow: "yes" }),
    aliases: {
      accountname: "account",
      accountnames: "account",
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
    allowedFields: ["name"],
    defaultRow: (id) => ({ id, name: "" }),
    aliases: { category: "name", label: "name" },
  },
  taxTreatment: {
    label: "tax treatment",
    primaryField: "label",
    allowedFields: ["label"],
    defaultRow: (id) => ({ id, label: "" }),
    aliases: { taxtreatment: "label", taxstatus: "label", treatment: "label", name: "label" },
  },
  accountTaxType: {
    label: "account tax type",
    primaryField: "taxStatus",
    allowedFields: ["taxStatus"],
    defaultRow: (id) => ({ id, taxStatus: "" }),
    aliases: { taxstatus: "taxStatus", taxtreatment: "taxStatus", status: "taxStatus", label: "taxStatus", name: "taxStatus" },
  },
  investmentType: {
    label: "investment type",
    primaryField: "name",
    allowedFields: ["name"],
    defaultRow: (id) => ({ id, name: "" }),
    aliases: { investmenttype: "name", type: "name", assetclass: "name", category: "name", label: "name" },
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

function referenceRows(workbook: WorkbookResponse, tabName: ReferenceTableName) {
  return toWorkbookRows(workbook.tabs[tabName]);
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
    return investments.find((row) => Number(row.id) === id) ?? null;
  }
  if (!query) return null;
  const matches = investments.filter((row) => matchQuery(row, query));
  return matches.length === 1 ? matches[0] : null;
}

function findInvestmentByVisibleRowOrId(investments: InvestmentRow[], rowNumber?: number, id?: number, query?: string) {
  const visibleRowNumber = Number(rowNumber ?? id);
  if (Number.isFinite(visibleRowNumber)) {
    const visibleRowMatch = investments.find((row) => Number(row.spreadsheetRowNumber) === visibleRowNumber);
    if (visibleRowMatch) return visibleRowMatch;
  }
  return findInvestmentByIdOrQuery(investments, id, query);
}

function normalizeRowId(value: unknown) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function uniqueNumericIds(values: unknown[]) {
  return [...new Set(values.map(normalizeRowId).filter((id): id is number => id !== null))];
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

function investmentMatchesSelector(row: InvestmentRow, selector: string, exactSymbolOnly = false) {
  const normalizedSelector = selector.trim().toLowerCase();
  if (!normalizedSelector) return false;
  if (exactSymbolOnly) {
    return [getInvestmentSymbol(row), rowText(row, "newSymbol", "new_symbol", "overrideSymbol")]
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
  ]);

  return Object.fromEntries(
    Object.entries(values).filter(([key, value]) => allowedKeys.has(key) && value !== undefined)
  ) as Partial<InvestmentRow>;
}

function investmentUpdateWithSelectAlias(values: Partial<InvestmentRow> & { select?: boolean; highlight?: boolean }) {
  const update = safeInvestmentUpdate(values);
  if (typeof values.select === "boolean" && update.includeIncome === undefined) {
    update.includeIncome = values.select;
  }
  return update;
}

function normalizeLookupKey(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
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

function fedTaxAdjust(amount: number, taxTreatment: unknown, pref: boolean) {
  switch (normalizeLookupKey(taxTreatment)) {
    case "hold":
    case "tax free":
    case "fed tax free":
      return 0;
    case "state tax free":
      return pref ? 0 : amount;
    case "index-60-40":
      return pref ? amount * 0.6 : amount * 0.4;
    case "income":
    case "non-qualified-div":
    case "short term gain":
    case "real estate":
      return pref ? 0 : amount;
    case "ss-85-fed":
      return pref ? 0 : amount * 0.85;
    case "qualified-div":
    case "long term gain":
      return pref ? amount : 0;
    default:
      return pref ? 0 : amount;
  }
}

function stateTaxAdjust(amount: number, taxTreatment: unknown, stateCode = "CA") {
  const treatment = normalizeLookupKey(taxTreatment);
  if (treatment === "hold" || treatment === "tax free" || treatment === "ss-85-fed") return 0;
  if (treatment === "state tax free" && normalizeStateCode(stateCode) === "CA") return 0;
  return amount;
}

function isW2IncomeType(incomeType: unknown) {
  return normalizeLookupKey(incomeType) === "w2 wages";
}

function sumTaxWhatIfItems(items: unknown, legacyAmount = 0) {
  const itemTotal = Array.isArray(items)
    ? items.reduce((total, item) => total + normalizeNumberValue((item as TaxWhatIfItem).amount), 0)
    : 0;
  return itemTotal > 0 ? itemTotal : normalizeNumberValue(legacyAmount);
}

function sumW2TaxWhatIfItems(items: unknown) {
  return (Array.isArray(items) ? items : []).reduce(
    (total, item) => total + (isW2IncomeType((item as TaxWhatIfItem).incomeType) ? normalizeNumberValue((item as TaxWhatIfItem).amount) : 0),
    0
  );
}

function deductionTotalByType(items: unknown, deductionType: string) {
  return (Array.isArray(items) ? items : []).reduce(
    (total, item) => normalizeLookupKey((item as DeductionItem).deductionType) === normalizeLookupKey(deductionType)
      ? total + Math.max(normalizeNumberValue((item as DeductionItem).amount), 0)
      : total,
    0
  );
}

function summarizeAboveLineDeductions(items: unknown) {
  let capitalLossRaw = 0;
  let uncappedTotal = 0;
  (Array.isArray(items) ? items : []).forEach((item) => {
    const amount = Math.max(normalizeNumberValue((item as DeductionItem).amount), 0);
    const type = String((item as DeductionItem).deductionType || "");
    if (!type) return;
    if (type === "Capital loss deduction") capitalLossRaw += amount;
    else uncappedTotal += amount;
  });
  const capitalLossDeduction = Math.min(capitalLossRaw, 3000);
  return { capitalLossRaw, capitalLossDeduction, total: capitalLossDeduction + uncappedTotal };
}

function summarizeFederalDeductions(items: unknown, stateTax: number, saltCap: number) {
  const rows = Array.isArray(items) ? items : [];
  const mortgageInterest = deductionTotalByType(rows, "Mortgage interest");
  const propertyTax = deductionTotalByType(rows, "Property tax");
  const longTermLoss = deductionTotalByType(rows, "Investment loss (Long Term)");
  const shortTermLoss = deductionTotalByType(rows, "Investment loss (Short Term)");
  const capitalLossRaw = longTermLoss + shortTermLoss;
  const capitalLossDeduction = Math.min(Math.max(capitalLossRaw, 0), 3000);
  const otherItemized = rows.reduce((total, item) => {
    const type = String((item as DeductionItem).deductionType || "");
    return type && !["Mortgage interest", "Property tax", "Investment loss (Long Term)", "Investment loss (Short Term)"].includes(type)
      ? total + Math.max(normalizeNumberValue((item as DeductionItem).amount), 0)
      : total;
  }, 0);
  const saltDeduction = Math.min(Math.max(propertyTax + stateTax, 0), saltCap);
  return { mortgageInterest, propertyTax, capitalLossRaw, capitalLossDeduction, otherItemized, saltDeduction, itemizedDeduction: mortgageInterest + saltDeduction + capitalLossDeduction + otherItemized };
}

const SOCIAL_SECURITY_WAGE_BASE_2025 = 176100;
const STATE_W2_PAYROLL_COMPONENTS_2025: Record<string, Array<{ label: string; rate: number; wageBase?: number; maxTax?: number }>> = {
  AK: [{ label: "AK employee unemployment insurance", rate: 0.005, wageBase: 51800 }],
  CA: [{ label: "CA SDI", rate: 0.012 }],
  CO: [{ label: "CO FAMLI employee share", rate: 0.0045, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 }],
  CT: [{ label: "CT paid leave", rate: 0.005, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 }],
  HI: [{ label: "HI temporary disability insurance employee share", rate: 0.005 }],
  MA: [{ label: "MA PFML employee share", rate: 0.0046, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 }],
  NJ: [
    { label: "NJ UI/WF/SWF employee share", rate: 0.003825, wageBase: 43200 },
    { label: "NJ temporary disability", rate: 0.0023, wageBase: 165400 },
    { label: "NJ family leave insurance", rate: 0.0033, wageBase: 165400 },
  ],
  NY: [
    { label: "NY state disability insurance", rate: 0.005, maxTax: 31.2 },
    { label: "NY paid family leave", rate: 0.00388, maxTax: 354.53 },
  ],
  OR: [{ label: "OR paid leave employee share", rate: 0.006, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 }],
  PA: [{ label: "PA employee unemployment withholding", rate: 0.0007 }],
  RI: [{ label: "RI temporary disability insurance", rate: 0.013, wageBase: 89700 }],
  WA: [
    { label: "WA paid family and medical leave employee share", rate: 0.003882, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 },
    { label: "WA Cares Fund", rate: 0.0058 },
  ],
};

function additionalMedicareThreshold(filingStatus: FilingStatus) {
  if (filingStatus === "mfj") return 250000;
  if (filingStatus === "mfs") return 125000;
  return 200000;
}

function calculateW2PayrollTax(wagesInput: number, filingStatus: FilingStatus, stateCodeInput: string) {
  const wages = Math.max(Number(wagesInput) || 0, 0);
  const socialSecurity = Math.min(wages, SOCIAL_SECURITY_WAGE_BASE_2025) * 0.062;
  const medicare = wages * 0.0145;
  const additionalMedicare = Math.max(wages - additionalMedicareThreshold(filingStatus), 0) * 0.009;
  const stateCode = normalizeStateCode(stateCodeInput);
  const components = (STATE_W2_PAYROLL_COMPONENTS_2025[stateCode] || []).map((component) => {
    const taxableWages = Math.min(wages, component.wageBase ?? Number.POSITIVE_INFINITY);
    const tax = Math.min(taxableWages * component.rate, component.maxTax ?? Number.POSITIVE_INFINITY);
    return { ...component, tax };
  });
  const stateTotal = components.reduce((total, component) => total + component.tax, 0);
  const federalTotal = socialSecurity + medicare + additionalMedicare;
  return {
    wages,
    federal: { socialSecurity, medicare, additionalMedicare, total: federalTotal },
    state: { stateCode, components, total: stateTotal },
    total: federalTotal + stateTotal,
  };
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
    const typeName = rowText(row, "accountType", "account_type", "type") || inferAccountTypeFromAccountName(accountName);
    accountTaxStatusByName[accountKey] =
      accountTypes[normalizeLookupKey(typeName)] ||
      rowText(row, "taxStatus", "tax_status", "tax_treatment") ||
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

async function calculatePortfolio(workbook: WorkbookResponse, config: ResolvedPortfolioServerConfig, options: PortfolioCalculationOptions = {}) {
  const federalSettings = settingsSection(workbook.settings, "federal");
  const stateSettings = settingsSection(workbook.settings, "state");
  const filingStatus = options.filingStatus || normalizeFilingStatus(federalSettings.filingStatus || "mfj");
  const selectedStateCode = normalizeStateCode(options.stateCode || stateSettings.stateCode || "CA");
  const deductionMode = options.deductionMode || normalizeDeductionMode(federalSettings.deductionMode || "standard");
  const whatIfActive = Boolean(options.whatIfActive);
  const federalWhatIfOpen = Boolean(options.federalWhatIfOpen);
  const stateWhatIfOpen = Boolean(options.stateWhatIfOpen);
  const tickerMap = buildTickerMap(workbook);
  const { accountMap, accountTaxStatusByName } = buildAccountMaps(workbook);

  const flowSeed = {
    totalInvestmentAmount: 0, totalIncome: 0, investmentIncome: 0,
    investmentFederalOrdinary: 0, investmentFederalPreferred: 0, investmentStateTaxable: 0,
    displayIncome: 0, federalOrdinary: 0, federalPreferred: 0, stateTaxable: 0,
    displayFederalOrdinary: 0, displayFederalPreferred: 0, displayStateTaxable: 0,
    w2Income: 0, nonTaxableIncome: 0, nonInvestmentIncome: 0, displayNonInvestmentIncome: 0,
  };
  const derivedRows = toInvestmentRows(workbook.tabs.investments).map((row) => {
    const currentTicker = isPlaceholderAssetSymbol(row.symbol) ? undefined : tickerMap[normalizeLookupKey(row.symbol)];
    const rowWhatIfActive = whatIfActive && normalizeBooleanValue(row.overrideProposal);
    const effectiveSymbol = rowWhatIfActive && row.newSymbol ? String(row.newSymbol) : getInvestmentSymbol(row);
    const proposedTicker = row.newSymbol ? tickerMap[normalizeLookupKey(row.newSymbol)] : undefined;
    const effectiveTicker = isPlaceholderAssetSymbol(effectiveSymbol) ? undefined : tickerMap[normalizeLookupKey(effectiveSymbol)] || currentTicker;
    const totalInvestment = getInvestmentTotal(row);
    const currentPercent = normalizeRate(rowValue(currentTicker || {}, "percentReturn", "percent_return"));
    const proposedPercent = normalizeRate(rowValue(proposedTicker || {}, "percentReturn", "percent_return") ?? row.newPercent);
    const effectivePercent = rowWhatIfActive ? proposedPercent || currentPercent : currentPercent;
    const importedYearlyIncome = getInvestmentIncome(row);
    const accountKey = normalizeLookupKey(getInvestmentAccount(row));
    const account = accountMap[accountKey];
    const accountType = rowText(account || {}, "accountType", "account_type", "type") || inferAccountTypeFromAccountName(getInvestmentAccount(row));
    const isW2IncomeAccount = isW2AccountType(accountType);
    const assetType = rowText(effectiveTicker || {}, "assetType", "asset_type");
    const incomeItem = isW2IncomeAccount || isIncomeAssetType(assetType) || (!assetType && normalizeBooleanValue(rowValue(effectiveTicker || {}, "incomeItem", "income_item"))) || (totalInvestment === 0 && importedYearlyIncome !== 0);
    const yearlyIncome = incomeItem ? importedYearlyIncome : totalInvestment * effectivePercent;
    const included = getInvestmentIncluded(row);
    const filteredIncome = included ? yearlyIncome : 0;
    const includeInAfterTaxValue = rowValue(account || {}, "includeInFreeCashflow", "include_in_free_cashflow");
    const includeInAfterTaxIncome = includeInAfterTaxValue === undefined ? true : normalizeYesNo(includeInAfterTaxValue) === "yes";
    const displayFilteredIncome = included && includeInAfterTaxIncome ? yearlyIncome : 0;
    const taxStatus = String(accountTaxStatusByName[accountKey] || "taxable").toLowerCase();
    const isTaxableAccount = taxStatus === "taxable" || taxStatus.includes("taxable");
    const taxTreatment = isW2IncomeAccount ? "income" : rowText(effectiveTicker || {}, "taxTreatment", "tax_treatment") || "income";
    const investmentType = normalizeLookupKey(rowText(effectiveTicker || {}, "category"));
    const taxableMonthlyBase = isTaxableAccount && included ? filteredIncome / 12 : 0;
    const displayTaxableMonthlyBase = isTaxableAccount && included && includeInAfterTaxIncome ? displayFilteredIncome / 12 : 0;
    const ordinaryMonthly = fedTaxAdjust(taxableMonthlyBase, taxTreatment, false);
    const preferredMonthly = fedTaxAdjust(taxableMonthlyBase, taxTreatment, true);
    const stateMonthly = stateTaxAdjust(taxableMonthlyBase, taxTreatment, selectedStateCode);
    const displayOrdinaryMonthly = fedTaxAdjust(displayTaxableMonthlyBase, taxTreatment, false);
    const displayPreferredMonthly = fedTaxAdjust(displayTaxableMonthlyBase, taxTreatment, true);
    const displayStateMonthly = stateTaxAdjust(displayTaxableMonthlyBase, taxTreatment, selectedStateCode);
    return {
      id: row.id,
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
      w2Income: isW2IncomeAccount ? filteredIncome : 0,
      nonInvestmentIncome: isW2IncomeAccount || ["social-security", "non investment income"].includes(investmentType) ? filteredIncome : 0,
      nonTaxableIncome: !isTaxableAccount && included ? yearlyIncome : 0,
    };
  });
  const flows = derivedRows.reduce((acc, row) => {
    acc.totalInvestmentAmount += row.includedTotal;
    acc.totalIncome += row.filteredIncome;
    acc.investmentIncome += row.investmentIncome;
    acc.investmentFederalOrdinary += row.investmentFederalOrdinary;
    acc.investmentFederalPreferred += row.investmentFederalPreferred;
    acc.investmentStateTaxable += row.investmentStateTaxable;
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
    acc.displayNonInvestmentIncome += row.nonInvestmentIncome;
    return acc;
  }, { ...flowSeed });

  const extraOrdinary = options.extraOrdinaryIncome ?? sumTaxWhatIfItems(federalSettings.extraOrdinaryItems, normalizeNumberValue(federalSettings.extraOrdinaryIncome));
  const extraPreferred = options.extraPreferredIncome ?? sumTaxWhatIfItems(federalSettings.extraPreferredItems, normalizeNumberValue(federalSettings.extraPreferredIncome));
  const extraW2 = sumW2TaxWhatIfItems(federalSettings.extraOrdinaryItems);
  const effectiveExtraOrdinaryIncome = federalWhatIfOpen ? extraOrdinary : 0;
  const effectiveExtraPreferredIncome = federalWhatIfOpen ? extraPreferred : 0;
  const effectiveW2Income = flows.w2Income + (federalWhatIfOpen ? extraW2 : 0);
  const w2PayrollTax = calculateW2PayrollTax(effectiveW2Income, filingStatus, selectedStateCode);
  const effectiveExtraStateIncome = stateWhatIfOpen ? (options.extraStateIncome ?? normalizeNumberValue(stateSettings.extraStateIncome)) : 0;
  const ordinaryBeforeDeductions = flows.federalOrdinary + effectiveExtraOrdinaryIncome;
  const preferredBeforeDeductions = flows.federalPreferred + effectiveExtraPreferredIncome;
  const grossFederalTaxable = ordinaryBeforeDeductions + preferredBeforeDeductions;
  const federalTaxableInvestmentIncome = flows.federalOrdinary + flows.federalPreferred;
  const stateInvestmentAdjustment = flows.stateTaxable - federalTaxableInvestmentIncome;
  const federalWhatIfIncome = effectiveExtraOrdinaryIncome + effectiveExtraPreferredIncome;
  const stateGross = federalTaxableInvestmentIncome + stateInvestmentAdjustment + federalWhatIfIncome + effectiveExtraStateIncome;
  const stateItemized = normalizeNumberValue(stateSettings.mortgageInterest) + normalizeNumberValue(stateSettings.propertyTax);
  const stateDeduction = Math.max(normalizeNumberValue(stateSettings.standardDeduction) || 11000, stateItemized);
  const stateTaxableAfterDeductions = Math.max(stateGross - stateDeduction, 0);
  const stateResult = await postPortfolioApi<Record<string, unknown>>(config, {
    calc: "STATE_TAX_2025",
    state: selectedStateCode,
    filingStatus,
    taxableIncome: stateTaxableAfterDeductions,
  });
  const federalDeductionSummary = summarizeFederalDeductions(federalSettings.deductionItems, normalizeNumberValue(stateResult.tax), normalizeNumberValue(federalSettings.saltCap) || 40400);
  const federalAboveLineDeductionSummary = summarizeAboveLineDeductions(federalSettings.aboveLineDeductionItems);
  const federalDeduction = deductionMode === "itemized"
    ? federalDeductionSummary.itemizedDeduction
    : normalizeNumberValue(federalSettings.standardDeduction) || 31500;
  const federalTaxableBeforeStandardOrItemized = Math.max(grossFederalTaxable - federalAboveLineDeductionSummary.total, 0);
  const federalTaxableAfterDeductions = Math.max(federalTaxableBeforeStandardOrItemized - federalDeduction, 0);
  const prefTaxable = Math.min(preferredBeforeDeductions, federalTaxableAfterDeductions);
  const ordinaryTaxable = Math.max(federalTaxableAfterDeductions - prefTaxable, 0);
  const magi = grossFederalTaxable;
  const netInvestmentIncome = Math.max(ordinaryBeforeDeductions + preferredBeforeDeductions - flows.nonInvestmentIncome - effectiveW2Income, 0);
  const federalResult = await postPortfolioApi<Record<string, unknown>>(config, {
    calc: "FED_TAX_2025_COMBINED",
    ordinaryTaxable,
    prefTaxable,
    filingStatus,
    magi,
    netInvestmentIncome,
  });
  const federalIncomeTax = normalizeNumberValue(federalResult.tax);
  const stateIncomeTax = normalizeNumberValue(stateResult.tax);
  const federalTaxWithPayroll = federalIncomeTax + w2PayrollTax.federal.total;
  const stateTaxWithPayroll = stateIncomeTax + w2PayrollTax.state.total;
  const totalTax = federalTaxWithPayroll + stateTaxWithPayroll;
  const afterTaxIncome = flows.displayIncome - Math.max(totalTax, 0);
  const investmentTax = Math.max(totalTax - Math.max(0, totalTax - flows.investmentIncome), 0);
  return {
    workspaceId: workbook.workspaceId,
    updatedAt: workbook.updatedAt,
    options: { whatIfActive, federalWhatIfOpen, stateWhatIfOpen, stateCode: selectedStateCode, filingStatus, deductionMode },
    income: {
      annualBeforeTax: flows.totalIncome,
      monthlyBeforeTax: flows.totalIncome / 12,
      annualAfterTax: afterTaxIncome,
      monthlyAfterTax: afterTaxIncome / 12,
      spendableBeforeTax: flows.displayIncome,
      excludedFromAfterTaxIncome: flows.totalIncome - flows.displayIncome,
    },
    taxes: {
      totalTax,
      federalIncomeTax,
      stateIncomeTax,
      federalPayrollTax: w2PayrollTax.federal.total,
      statePayrollTax: w2PayrollTax.state.total,
      w2PayrollTax,
      federalResult,
      stateResult,
    },
    taxableIncome: {
      federalGross: grossFederalTaxable,
      federalBeforeStandardOrItemized: federalTaxableBeforeStandardOrItemized,
      federal: federalTaxableAfterDeductions,
      ordinary: ordinaryTaxable,
      preferred: prefTaxable,
      stateGross,
      state: stateTaxableAfterDeductions,
      magi,
      netInvestmentIncome,
    },
    deductions: {
      federalDeduction,
      federalDeductionMode: deductionMode,
      federalAboveLineDeductionSummary,
      federalDeductionSummary,
      stateDeduction,
    },
    portfolio: {
      totalInvestment: flows.totalInvestmentAmount,
      investmentIncome: flows.investmentIncome,
      beforeTaxYield: flows.totalInvestmentAmount > 0 ? flows.investmentIncome / flows.totalInvestmentAmount : 0,
      afterTaxYield: flows.totalInvestmentAmount > 0 ? Math.max(flows.investmentIncome - investmentTax, 0) / flows.totalInvestmentAmount : 0,
    },
    flows,
    rows: options.includeRows ? derivedRows : undefined,
  };
}

export function createPortfolioServer(config: PortfolioServerConfig = {}) {
  const resolvedConfig = resolvePortfolioConfig(config);
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

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
    whatIfActive: z.boolean().default(false),
    federalWhatIfOpen: z.boolean().default(false),
    stateWhatIfOpen: z.boolean().default(false),
    stateCode: z.string().optional(),
    filingStatus: earlyFilingStatusSchema.optional(),
    deductionMode: z.enum(["standard", "itemized"]).optional(),
    extraOrdinaryIncome: z.number().optional(),
    extraPreferredIncome: z.number().optional(),
    extraStateIncome: z.number().optional(),
    includeRows: z.boolean().default(false),
  };
  const earlyWhatIfProposalSchema = z.object({
    id: z.number().optional(),
    query: z.string().optional(),
    newSymbol: z.string().min(1),
    newPercent: z.number().nonnegative().optional(),
    active: z.boolean().default(true),
  });
  const investmentUpdateValuesSchema = z.object({
    description: z.string().optional(),
    account: z.string().optional(),
    category: z.string().optional(),
    totalInvestment: z.number().nonnegative().optional(),
    yearlyIncome: z.number().optional(),
    includeIncome: z.boolean().optional(),
    overrideProposal: z.boolean().optional(),
    symbol: z.string().optional(),
    newSymbol: z.string().optional(),
    newPercent: z.number().nonnegative().optional(),
    select: z.boolean().optional().describe("Set the investment row's checkmark/select checkbox. This maps to includeIncome in the frontend."),
    highlight: z.boolean().optional().describe("Visually highlight/select this row in the AfterTaxUS frontend without changing row fields."),
  });
  const investmentReplacementRowSchema = z.object({
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
    newPercent: z.number().nonnegative().default(0),
  });

  server.tool(
    "calculate_portfolio",
    "Latest AfterTaxUS full portfolio calculator. Calculates annual/monthly after-tax income, total tax, federal/state taxes, W2 payroll taxes, taxable income, deductions, and portfolio yields from the saved workbook.",
    earlyCalculationOptionsSchema,
    async (options) => {
      const workbook = await getWorkbook(resolvedConfig, options.workspaceId);
      return jsonToolResult(await calculatePortfolio(workbook, resolvedConfig, options));
    }
  );

  server.tool(
    "update_investment_row",
    "Latest AfterTaxUS row updater. Updates one investment row by exact row id or by a query that matches exactly one row. Use this for direct ChatGPT edits to investment data.",
    {
      workspaceId: z.string().optional(),
      id: z.number().optional().describe("Visible investment row number from the app's Row column; falls back to internal id if no visible row matches."),
      rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
      query: z.string().optional(),
      values: investmentUpdateValuesSchema,
      returnCalculation: z.boolean().default(false),
    },
    async ({ workspaceId, id, rowNumber, query, values, returnCalculation }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      const target = findInvestmentByVisibleRowOrId(investments, rowNumber, id, query);
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
      const highlightValue = values.highlight;
      if (Object.keys(update).length === 0 && typeof highlightValue !== "boolean") {
        throw new Error("update_investment_row received no valid row fields to update.");
      }
      workbook.tabs.investments = Object.keys(update).length > 0
        ? investments.map((row) => Number(row.id) === targetId ? { ...row, ...update } : row)
        : investments;
      if (typeof highlightValue === "boolean") {
        const existingSelection = selectedInvestmentIdsFromSettings(workbook.settings);
        workbook.settings = setSelectedInvestmentIdsInSettings(
          workbook.settings,
          highlightValue
            ? [...new Set([...existingSelection, targetId])]
            : existingSelection.filter((selectedId) => selectedId !== targetId)
        );
      }
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const updatedRow = toInvestmentRows(workbook.tabs.investments).find((row) => Number(row.id) === targetId);
      const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId, whatIfActive: true }) : undefined;
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        investment: updatedRow,
        selected: typeof values.select === "boolean" ? values.select : undefined,
        highlighted: typeof highlightValue === "boolean" ? highlightValue : undefined,
        calculation,
      });
    }
  );

  server.tool(
    "set_investment_selection_checkbox",
    "Set the visible checkmark/select checkbox in the Investments table for exactly one row. This changes includeIncome and affects calculations; it is not a visual highlight.",
    {
      workspaceId: z.string().optional(),
      id: z.number().optional().describe("Visible investment row number from the app's Row column. Prefer rowNumber; this is kept for ChatGPT compatibility."),
      rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
      checked: z.boolean().describe("true checks/selects the row; false unchecks/deselects it."),
      returnCalculation: z.boolean().default(false),
    },
    async ({ workspaceId, id, rowNumber, checked, returnCalculation }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      const target = findInvestmentByVisibleRowOrId(investments, rowNumber, id);
      if (!target) throw new Error(`Investment row ${rowNumber ?? id} was not found.`);
      const targetId = Number(target.id);
      workbook.tabs.investments = investments.map((row) =>
        Number(row.id) === targetId ? { ...row, includeIncome: checked } : row
      );
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const updatedRow = toInvestmentRows(workbook.tabs.investments).find((row) => Number(row.id) === targetId);
      const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId, whatIfActive: true }) : undefined;
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        id: targetId,
        rowNumber: Number(target.spreadsheetRowNumber) || rowNumber || id,
        selected: checked,
        includeIncome: checked,
        investment: updatedRow,
        calculation,
      });
    }
  );

  server.tool(
    "set_whatif_checkbox",
    "Set the WhatIf checkbox for one visible investment row. Use this exact tool when the user asks to check/uncheck WhatIf. This changes overrideProposal only; it does not visually highlight rows and does not change the main row selection checkbox.",
    {
      workspaceId: z.string().optional(),
      id: z.number().optional().describe("Visible investment row number from the app's Row column. Prefer rowNumber; this is kept for ChatGPT compatibility."),
      rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
      checked: z.boolean().describe("true checks the row's WhatIf checkbox; false unchecks it."),
      returnCalculation: z.boolean().default(false),
    },
    async ({ workspaceId, id, rowNumber, checked, returnCalculation }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      const target = findInvestmentByVisibleRowOrId(investments, rowNumber, id);
      if (!target) throw new Error(`Investment row ${rowNumber ?? id} was not found.`);
      const targetId = Number(target.id);
      workbook.tabs.investments = investments.map((row) =>
        Number(row.id) === targetId ? { ...row, overrideProposal: checked } : row
      );
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const updatedRow = toInvestmentRows(workbook.tabs.investments).find((row) => Number(row.id) === targetId);
      const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId, whatIfActive: true }) : undefined;
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        id: targetId,
        rowNumber: Number(target.spreadsheetRowNumber) || rowNumber || id,
        whatIfActive: checked,
        overrideProposal: checked,
        investment: updatedRow,
        calculation,
        note: "Only the WhatIf checkbox/overrideProposal was changed. Visual row highlight and main selection were not changed.",
      });
    }
  );

  server.tool(
    "set_investment_whatif_checkbox",
    "Set the WhatIf active checkbox for exactly one investment row. Use this for WhatIf checkbox changes. This changes overrideProposal only; it is not the visible row selection/checkmark and not visual highlighting.",
    {
      workspaceId: z.string().optional(),
      id: z.number().optional().describe("Visible investment row number from the app's Row column. Prefer rowNumber; this is kept for ChatGPT compatibility."),
      rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
      checked: z.boolean().describe("true activates the row's WhatIf; false deactivates it."),
      returnCalculation: z.boolean().default(false),
    },
    async ({ workspaceId, id, rowNumber, checked, returnCalculation }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      const target = findInvestmentByVisibleRowOrId(investments, rowNumber, id);
      if (!target) throw new Error(`Investment row ${rowNumber ?? id} was not found.`);
      const targetId = Number(target.id);
      workbook.tabs.investments = investments.map((row) =>
        Number(row.id) === targetId ? { ...row, overrideProposal: checked } : row
      );
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const updatedRow = toInvestmentRows(workbook.tabs.investments).find((row) => Number(row.id) === targetId);
      const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId, whatIfActive: true }) : undefined;
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        id: targetId,
        rowNumber: Number(target.spreadsheetRowNumber) || rowNumber || id,
        whatIfActive: checked,
        overrideProposal: checked,
        investment: updatedRow,
        calculation,
      });
    }
  );

  server.tool(
    "set_investment_selection_and_whatif",
    "Set both the visible row selection/checkmark and the WhatIf active checkbox for one investment row in a single save. Use this when the user asks to deselect/select a row and also disable/enable WhatIf.",
    {
      workspaceId: z.string().optional(),
      id: z.number().optional().describe("Visible investment row number from the app's Row column. Prefer rowNumber; this is kept for ChatGPT compatibility."),
      rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
      selected: z.boolean().describe("Visible row checkmark/select checkbox; maps to includeIncome."),
      whatIfActive: z.boolean().describe("WhatIf active checkbox; maps to overrideProposal."),
      returnCalculation: z.boolean().default(false),
    },
    async ({ workspaceId, id, rowNumber, selected, whatIfActive, returnCalculation }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      const target = findInvestmentByVisibleRowOrId(investments, rowNumber, id);
      if (!target) throw new Error(`Investment row ${rowNumber ?? id} was not found.`);
      const targetId = Number(target.id);
      workbook.tabs.investments = investments.map((row) =>
        Number(row.id) === targetId ? { ...row, includeIncome: selected, overrideProposal: whatIfActive } : row
      );
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const updatedRow = toInvestmentRows(workbook.tabs.investments).find((row) => Number(row.id) === targetId);
      const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId, whatIfActive: true }) : undefined;
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        id: targetId,
        rowNumber: Number(target.spreadsheetRowNumber) || rowNumber || id,
        selected,
        includeIncome: selected,
        whatIfActive,
        overrideProposal: whatIfActive,
        investment: updatedRow,
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
        id: z.number().optional().describe("Visible investment row number from the app's Row column; falls back to internal id if no visible row matches."),
        rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
        query: z.string().optional(),
        values: investmentUpdateValuesSchema,
        addIfMissing: z.boolean().default(false).describe("When true and no row matches, add a new investment row using values plus defaults."),
      })).min(1),
      returnCalculation: z.boolean().default(false),
    },
    async ({ workspaceId, updates, returnCalculation }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      let investments = toInvestmentRows(workbook.tabs.investments);
      const changedRows: InvestmentRow[] = [];
      const highlightedIds = new Set(selectedInvestmentIdsFromSettings(workbook.settings));
      let nextId = nextInvestmentId(investments);

      for (const request of updates) {
        const target = findInvestmentByVisibleRowOrId(investments, request.rowNumber, request.id, request.query);
        const update = investmentUpdateWithSelectAlias(request.values);
        const highlightValue = request.values.highlight;
        if (Object.keys(update).length === 0 && typeof highlightValue !== "boolean") {
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
            newPercent: normalizeNumberValue(update.newPercent),
          };
          investments = [...investments, newRow];
          if (typeof highlightValue === "boolean") {
            if (highlightValue) highlightedIds.add(Number(newRow.id));
            else highlightedIds.delete(Number(newRow.id));
          }
          changedRows.push(newRow);
          continue;
        }

        const targetId = Number(target.id);
        investments = investments.map((row) => Number(row.id) === targetId ? { ...row, ...update } : row);
        if (typeof highlightValue === "boolean") {
          if (highlightValue) highlightedIds.add(targetId);
          else highlightedIds.delete(targetId);
        }
        const changedRow = investments.find((row) => Number(row.id) === targetId);
        if (changedRow) changedRows.push(changedRow);
      }

      workbook.tabs.investments = investments;
      workbook.settings = setSelectedInvestmentIdsInSettings(workbook.settings, [...highlightedIds].sort((a, b) => a - b));
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId, whatIfActive: true }) : undefined;
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        changedCount: changedRows.length,
        changedRows,
        selectedAssetIds: [...highlightedIds].sort((a, b) => a - b),
        calculation,
      });
    }
  );

  server.tool(
    "replace_investments_table",
    "Latest AfterTaxUS table replacement. Replaces the entire Investments table in one operation for ChatGPT-driven scratch population or complete portfolio imports.",
    {
      workspaceId: z.string().optional(),
      rows: z.array(investmentReplacementRowSchema).min(1),
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
      const calculation = returnCalculation ? await calculatePortfolio(workbook, resolvedConfig, { workspaceId, whatIfActive: true }) : undefined;
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
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
      proposals: z.array(earlyWhatIfProposalSchema).min(1),
      clearOtherWhatIfs: z.boolean().default(false),
      includeRows: z.boolean().default(false),
    },
    async ({ workspaceId, proposals, clearOtherWhatIfs, includeRows }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      let investments = toInvestmentRows(workbook.tabs.investments);
      const tickerMap = buildTickerMap(workbook);
      const updates: Array<{ id: number; previousSymbol: string; newSymbol: string; active: boolean }> = [];
      if (clearOtherWhatIfs) {
        investments = investments.map((row) => ({ ...row, overrideProposal: false, newSymbol: getInvestmentSymbol(row), newPercent: 0 }));
      }
      for (const proposal of proposals) {
        const target = findInvestmentByIdOrQuery(investments, proposal.id, proposal.query);
        if (!target) throw new Error(`apply_whatif_choices could not find a unique investment row for ${proposal.id ?? proposal.query ?? ""}.`);
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
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      const calculation = await calculatePortfolio(workbook, resolvedConfig, { workspaceId, whatIfActive: true, includeRows });
      return jsonToolResult({ ok: true, workspaceId: workbook.workspaceId, savedAt: saveResult.updatedAt, updates, calculation });
    }
  );

  server.tool(
    "compare_whatif_choices",
    "Latest AfterTaxUS WhatIf comparison. Compares the saved portfolio against temporary investment WhatIf choices and returns baseline, scenario, and after-tax deltas.",
    {
      workspaceId: z.string().optional(),
      proposals: z.array(earlyWhatIfProposalSchema).min(1),
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
        investments = investments.map((row) => ({ ...row, overrideProposal: false, newSymbol: getInvestmentSymbol(row), newPercent: 0 }));
      }
      for (const proposal of proposals) {
        const target = findInvestmentByIdOrQuery(investments, proposal.id, proposal.query);
        if (!target) throw new Error(`compare_whatif_choices could not find a unique investment row for ${proposal.id ?? proposal.query ?? ""}.`);
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
    "List investments from the workbook, optionally filtering by query text, account, or category.",
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
        investments,
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

      return jsonToolResult(tablePayload(workbook, "investments", sourceRows, rows, limit));
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
      description: z.string().min(1),
      account: z.string().min(1),
      category: z.string().default("core"),
      totalInvestment: z.number().nonnegative().default(0),
      yearlyIncome: z.number().nonnegative().default(0),
      includeIncome: z.boolean().default(true),
      overrideProposal: z.boolean().default(false),
      symbol: z.string().default(""),
      newSymbol: z.string().default(""),
      newPercent: z.number().nonnegative().default(0),
    },
    async ({
      workspaceId,
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
        description: z.string().optional(),
        account: z.string().optional(),
        category: z.string().optional(),
        totalInvestment: z.number().nonnegative().optional(),
        yearlyIncome: z.number().nonnegative().optional(),
        includeIncome: z.boolean().optional(),
        overrideProposal: z.boolean().optional(),
        select: z.boolean().optional().describe("Set the investment row's checkmark/select checkbox. This maps to includeIncome in the frontend."),
        highlight: z.boolean().optional().describe("Visually highlight/select this investment row in the AfterTaxUS frontend without changing workbook row data."),
        symbol: z.string().optional(),
        newSymbol: z.string().optional(),
        newPercent: z.number().nonnegative().optional(),
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
      const highlightValue = values.highlight;
      if (Object.keys(update).length === 0 && typeof highlightValue !== "boolean") {
        throw new Error("update_investment received no valid fields to update.");
      }

      const targetId = Number(target.id);
      const updatedInvestments = Object.keys(update).length > 0
        ? investments.map((row) => Number(row.id) === targetId ? { ...row, ...update } : row)
        : investments;
      const updatedRow = updatedInvestments.find((row) => Number(row.id) === targetId);
      workbook.tabs.investments = updatedInvestments;
      if (typeof highlightValue === "boolean") {
        const existingSelection = selectedInvestmentIdsFromSettings(workbook.settings);
        workbook.settings = setSelectedInvestmentIdsInSettings(
          workbook.settings,
          highlightValue
            ? [...new Set([...existingSelection, targetId])]
            : existingSelection.filter((selectedId) => selectedId !== targetId)
        );
      }
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        investment: updatedRow,
        selected: typeof values.select === "boolean" ? values.select : undefined,
        highlighted: typeof highlightValue === "boolean" ? highlightValue : undefined,
      });
    }
  );

  server.tool(
    "set_investment_checkbox",
    "Set one investment checkbox field by visible row number. Use overrideProposal for the WhatIf checkbox, select/includeIncome for the main row checkmark, and highlight only for visual row highlighting.",
    {
      workspaceId: z.string().optional(),
      id: z.number().optional().describe("Visible investment row number from the app's Row column; falls back to internal id if no visible row matches."),
      rowNumber: z.number().optional().describe("Visible investment row number from the app's Row column."),
      field: z.enum(["includeIncome", "overrideProposal", "select", "highlight"]),
      checked: z.boolean(),
    },
    async ({ workspaceId, id, rowNumber, field, checked }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      const target = findInvestmentByVisibleRowOrId(investments, rowNumber, id);
      if (!target) throw new Error(`Investment row ${rowNumber ?? id} was not found.`);
      const targetId = Number(target.id);

      if (field === "highlight") {
        const existingSelection = selectedInvestmentIdsFromSettings(workbook.settings);
        workbook.settings = setSelectedInvestmentIdsInSettings(
          workbook.settings,
          checked
            ? [...new Set([...existingSelection, targetId])]
            : existingSelection.filter((selectedId) => selectedId !== targetId)
        );
      } else {
        const dataField = field === "select" ? "includeIncome" : field;
        workbook.tabs.investments = investments.map((row) =>
          Number(row.id) === targetId ? { ...row, [dataField]: checked } : row
        );
      }
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        id: targetId,
        rowNumber: Number(target.spreadsheetRowNumber) || rowNumber || id,
        field,
        checked,
        selected: field === "select" || field === "includeIncome" ? checked : undefined,
        highlighted: field === "highlight" ? checked : undefined,
      });
    }
  );

  const investmentRowHighlightSchema = {
    workspaceId: z.string().optional(),
    ids: z.array(z.union([z.number(), z.string()])).optional().describe("Investment row ids to visually highlight only. This does not set WhatIf or row selection checkboxes."),
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

      const requestedIds = uniqueNumericIds(ids || []);
      const symbolSelectors = (symbols || []).map((symbol) => symbol.trim()).filter(Boolean);
      const querySelectors = (queries || []).map((query) => query.trim()).filter(Boolean);

      const matchedRows = clear
        ? []
        : investments.filter((row) => {
          const rowId = normalizeRowId(row.id);
          return (
            (rowId !== null && requestedIds.includes(rowId)) ||
            symbolSelectors.some((symbol) => investmentMatchesSelector(row, symbol, true)) ||
            querySelectors.some((query) => investmentMatchesSelector(row, query, false))
          );
        });
      const matchedIds = uniqueNumericIds(matchedRows.map((row) => row.id));

      if (!clear && requestedIds.length + symbolSelectors.length + querySelectors.length === 0) {
        throw new Error("select_investment_rows requires ids, symbols, queries, or clear=true.");
      }
      if (!clear && matchedIds.length === 0) {
        throw new Error("select_investment_rows found no matching investment rows.");
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
    "select_investment_rows",
    "VISUAL HIGHLIGHT ONLY: highlight investment rows in the AfterTaxUS frontend by row ids, symbols, or free-text queries. Do not use this for the WhatIf checkbox or the main selection checkbox.",
    investmentRowHighlightSchema,
    highlightInvestmentRows
  );

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
      workbook.tabs[tableName] = updatedRows;
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
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
          updated += 1;
        } else {
          nextRows.push({
            ...referenceTableConfigs[tableName].defaultRow(nextWorkbookRowId(nextRows, rawId)),
            ...row.sanitized,
          });
          added += 1;
        }
      }

      workbook.tabs[tableName] = nextRows;
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        tableName,
        updated,
        added,
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

      workbook.tabs[tableName] = nextRows;
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
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
        investmentType: workbook.tabs.investmentType ?? [],
      });
    }
  );

  const filingStatusSchema = z.enum(["single", "mfj", "mfs", "hoh"]);
  const portfolioCalculationOptionsSchema = {
    workspaceId: z.string().optional(),
    whatIfActive: z.boolean().default(false).describe("When true, investment-row WhatIf choices with overrideProposal=true are used."),
    federalWhatIfOpen: z.boolean().default(false).describe("When true, the Federal Tax tab extra income WhatIf rows are included."),
    stateWhatIfOpen: z.boolean().default(false).describe("When true, the State Tax tab extra state income WhatIf value is included."),
    stateCode: z.string().optional().describe("Two-letter state code. Defaults to workbook state settings."),
    filingStatus: filingStatusSchema.optional().describe("Federal/state filing status. Defaults to workbook federal settings."),
    deductionMode: z.enum(["standard", "itemized"]).optional().describe("Deduction mode. Defaults to workbook federal settings."),
    extraOrdinaryIncome: z.number().optional().describe("Temporary extra ordinary income for this calculation when federalWhatIfOpen=true."),
    extraPreferredIncome: z.number().optional().describe("Temporary extra preferred income for this calculation when federalWhatIfOpen=true."),
    extraStateIncome: z.number().optional().describe("Temporary extra state income for this calculation when stateWhatIfOpen=true."),
    includeRows: z.boolean().default(false).describe("When true, include row-level derived calculation details."),
  };
  const whatIfProposalSchema = z.object({
    id: z.number().optional().describe("Investment row id to update."),
    query: z.string().optional().describe("Free text query that must match exactly one investment row if id is not supplied."),
    newSymbol: z.string().min(1).describe("WhatIf replacement asset/symbol for the row."),
    newPercent: z.number().nonnegative().optional().describe("Optional WhatIf dividend/yield. Defaults from the assets table when possible."),
    active: z.boolean().default(true).describe("Whether this row's WhatIf checkbox/overrideProposal should be active."),
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
      proposals: z.array(whatIfProposalSchema).min(1),
      clearOtherWhatIfs: z.boolean().default(false).describe("When true, clears all existing row WhatIf overrides before applying these proposals."),
      returnCalculation: z.boolean().default(true).describe("When true, return a full portfolio calculation after saving."),
      calculationOptions: z.object({
        federalWhatIfOpen: z.boolean().default(false),
        stateWhatIfOpen: z.boolean().default(false),
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
        investments = investments.map((row) => ({ ...row, overrideProposal: false, newSymbol: getInvestmentSymbol(row), newPercent: 0 }));
      }

      for (const proposal of proposals) {
        const target = findInvestmentByIdOrQuery(investments, proposal.id, proposal.query);
        if (!target) {
          const matchingCount = proposal.query ? investments.filter((row) => matchQuery(row, proposal.query || "")).length : 0;
          throw new Error(
            proposal.query && matchingCount !== 1
              ? `set_investment_whatifs requires exactly one match for query '${proposal.query}'. Query matched ${matchingCount} rows.`
              : `set_investment_whatifs could not find investment row ${proposal.id ?? ""}.`
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
        federalWhatIfOpen: z.boolean().default(false),
        stateWhatIfOpen: z.boolean().default(false),
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
        investments = investments.map((row) => ({ ...row, overrideProposal: false, newSymbol: getInvestmentSymbol(row), newPercent: 0 }));
      }
      for (const proposal of proposals || []) {
        const target = findInvestmentByIdOrQuery(investments, proposal.id, proposal.query);
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
