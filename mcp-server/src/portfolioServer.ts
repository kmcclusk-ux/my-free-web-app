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
};

type ResolvedPortfolioServerConfig = {
  apiBaseUrl: string;
  defaultWorkspaceId: string;
  portfolioSyncToken: string;
};

type WorkbookResponse = {
  workspaceId: string;
  tabs: Record<string, unknown>;
  settings: Record<string, unknown>;
  updatedAt: string | null;
};

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
  if (config.portfolioSyncToken) {
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

function toInvestmentRows(value: unknown): InvestmentRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is InvestmentRow => typeof row === "object" && row !== null);
}

function summarizeInvestments(investments: InvestmentRow[]) {
  const totalInvestment = investments.reduce(
    (sum, row) => sum + Number(row.totalInvestment ?? 0),
    0
  );
  const totalIncome = investments.reduce(
    (sum, row) => sum + Number(row.yearlyIncome ?? 0),
    0
  );

  const byAccount = Object.entries(
    investments.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.account ?? "Unassigned");
      acc[key] = (acc[key] ?? 0) + Number(row.totalInvestment ?? 0);
      return acc;
    }, {})
  )
    .map(([account, marketValue]) => ({ account, marketValue }))
    .sort((a, b) => b.marketValue - a.marketValue);

  const bySymbol = Object.entries(
    investments.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.symbol ?? row.description ?? "Unknown");
      acc[key] = (acc[key] ?? 0) + Number(row.totalInvestment ?? 0);
      return acc;
    }, {})
  )
    .map(([symbol, marketValue]) => ({ symbol, marketValue }))
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 10);

  return {
    positions: investments.length,
    totalInvestment,
    totalIncome,
    yield: totalInvestment > 0 ? totalIncome / totalInvestment : 0,
    byAccount,
    topHoldings: bySymbol,
  };
}

function matchQuery(row: InvestmentRow, query: string) {
  const haystack = [
    row.description,
    row.symbol,
    row.account,
    row.category,
    row.taxTreatment,
    row.investmentType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
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
          account ? String(row.account ?? "").toLowerCase() === account.toLowerCase() : true
        )
        .filter((row) =>
          category ? String(row.category ?? "").toLowerCase() === category.toLowerCase() : true
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
