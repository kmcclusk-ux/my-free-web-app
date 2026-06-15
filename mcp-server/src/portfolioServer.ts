import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const DEFAULT_API_BASE_URL =
  "https://j4evba8fpj.execute-api.us-west-2.amazonaws.com/portfolio/hello";
export const DEFAULT_WORKSPACE_ID = "default";
export const SERVER_NAME = "portfolio-workbook";
export const SERVER_VERSION = "1.0.0";

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
  return postPortfolioApi<WorkbookSaveResponse>(config, {
    calc: "WORKBOOK_SAVE",
    workspaceId: workbook.workspaceId || config.defaultWorkspaceId,
    tabs: workbook.tabs,
    settings: workbook.settings,
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
      dividend: "percentReturn",
      dividendpercent: "percentReturn",
      dividendpercentage: "percentReturn",
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

function normalizeRateValue(value: unknown) {
  const numeric = normalizeNumberValue(value);
  return Math.abs(numeric) > 1 ? numeric / 100 : numeric;
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
  if (tabName === "tickers" && field === "percentReturn") return normalizeRateValue(value);
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

      const update = safeInvestmentUpdate(values);
      if (Object.keys(update).length === 0) {
        throw new Error("update_investment received no valid fields to update.");
      }

      const targetId = Number(target.id);
      const updatedInvestments = investments.map((row) =>
        Number(row.id) === targetId ? { ...row, ...update } : row
      );
      const updatedRow = updatedInvestments.find((row) => Number(row.id) === targetId);
      workbook.tabs.investments = updatedInvestments;
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        investment: updatedRow,
      });
    }
  );

  server.tool(
    "set_investment_checkbox",
    "Set one investment checkbox field, such as includeIncome or overrideProposal, by investment row id.",
    {
      workspaceId: z.string().optional(),
      id: z.number(),
      field: z.enum(["includeIncome", "overrideProposal"]),
      checked: z.boolean(),
    },
    async ({ workspaceId, id, field, checked }) => {
      const workbook = await getWorkbook(resolvedConfig, workspaceId);
      const investments = toInvestmentRows(workbook.tabs.investments);
      if (!investments.some((row) => Number(row.id) === id)) {
        throw new Error(`Investment row ${id} was not found.`);
      }

      workbook.tabs.investments = investments.map((row) =>
        Number(row.id) === id ? { ...row, [field]: checked } : row
      );
      const saveResult = await saveWorkbook(resolvedConfig, workbook);
      return jsonToolResult({
        ok: true,
        workspaceId: workbook.workspaceId,
        savedAt: saveResult.updatedAt,
        id,
        field,
        checked,
      });
    }
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

  server.tool(
    "run_federal_tax_calculation",
    "Run the same combined federal tax calculation used by the spreadsheet and React app.",
    {
      ordinaryTaxable: z.number().nonnegative(),
      prefTaxable: z.number().nonnegative(),
      filingStatus: z.enum(["single", "mfj"]),
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
