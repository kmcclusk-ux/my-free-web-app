import { afterEach, describe, expect, test, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPortfolioServer } from "../mcp-server/src/portfolioServer";

type Row = Record<string, unknown>;
type ToolPayload = {
  investment?: Row;
  changedRows?: Row[];
  rows?: Row[];
  investments?: Row[];
};
type InputSchema = {
  properties?: Record<string, InputSchema>;
  items?: InputSchema;
  enum?: unknown[];
  required?: string[];
};

const connections: Array<{ client: Client; server: ReturnType<typeof createPortfolioServer> }> = [];

afterEach(async () => {
  try {
    for (const { client, server } of connections.splice(0)) {
      await client.close();
      await server.close();
    }
  } finally {
    vi.unstubAllGlobals();
  }
});

async function connectWorkbook() {
  const workbook = {
    workspaceId: "income-mode-tests",
    revision: 7,
    updatedAt: "2026-09-10T18:00:00.000Z",
    tabs: {
      investments: [
        { id: 101, spreadsheetRowNumber: 17, description: "Existing investment", account: "Brokerage", symbol: "BIL", totalInvestment: 10_000, yearlyIncome: 400, incomeMode: "principal-yield", incomeCalculationMode: "principalYield", incomeKind: "interest", includeIncome: true, overrideProposal: true, newSymbol: "ALT", newPercent: 0.08, importedNote: "keep me" },
        { id: 202, spreadsheetRowNumber: 23, description: "Existing income", account: "Brokerage", symbol: "PAY", totalInvestment: 0, yearlyIncome: 900, incomeMode: "annual-income", incomeCalculationMode: "annualIncome", includeIncome: false, overrideProposal: false, newPercent: 0 },
      ] as Row[],
      tickers: [{ symbol: "BIL", percentReturn: 0.04 }, { symbol: "PAY", assetType: "Income" }],
      accounts: [{ account: "Brokerage", accountType: "Brokerage Account" }],
      accountType: [{ name: "Brokerage Account", taxStatus: "taxable" }],
    },
    settings: { ui: { selectedAssetIds: [101], investmentWhatIfOpen: false }, federal: { filingStatus: "single" } },
  };
  const saves: Array<{ expectedRevision: number; tabs: typeof workbook.tabs; settings: typeof workbook.settings }> = [];
  const apiFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    expect(body.workspaceId).toBe(workbook.workspaceId);
    if (body.calc === "WORKBOOK_GET") return Response.json(workbook);
    if (body.calc !== "WORKBOOK_SAVE") throw new Error(`Unexpected API calculation: ${body.calc}`);
    if (body.expectedRevision !== workbook.revision) {
      return Response.json({ error: "Workbook changed" }, { status: 409 });
    }
    saves.push(structuredClone(body));
    workbook.tabs = structuredClone(body.tabs);
    workbook.settings = structuredClone(body.settings);
    workbook.revision += 1;
    workbook.updatedAt = "2026-09-10T18:00:01.000Z";
    return Response.json({ workspaceId: workbook.workspaceId, revision: workbook.revision, updatedAt: workbook.updatedAt, savedKeys: ["investments", "settings"] });
  });
  vi.stubGlobal("fetch", apiFetch);
  const server = createPortfolioServer({ apiBaseUrl: "https://portfolio.test/hello", defaultWorkspaceId: workbook.workspaceId, portfolioMcpToken: "test-only" });
  const client = new Client({ name: "income-mode-write-audit", version: "1.0.0" });
  connections.push({ client, server });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const call = async (name: string, args: Row = {}) => {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    return JSON.parse(content[0].text) as ToolPayload;
  };
  return { workbook, saves, apiFetch, client, call };
}

const createFields = { description: "New income row", account: "Brokerage", symbol: "BIL" };
const writeCases = [
  { label: "add", name: "add_investment", creates: true, arguments: (values: Row) => ({ ...createFields, ...values }) },
  { label: "legacy update", name: "update_investment", creates: false, arguments: (values: Row) => ({ id: 101, values }) },
  { label: "row update", name: "update_investment_row", creates: false, arguments: (values: Row) => ({ rowId: 101, values }) },
  { label: "replacement", name: "replace_investments_table", creates: true, arguments: (values: Row) => ({ rows: [{ id: 101, ...createFields, ...values }], clearHighlights: false, returnCalculation: false }) },
  { label: "bulk update", name: "bulk_update_investments", creates: false, arguments: (values: Row) => ({ updates: [{ rowId: 101, values }] }) },
  { label: "bulk add-if-missing", name: "bulk_update_investments", creates: true, arguments: (values: Row) => ({ updates: [{ query: "New income row", addIfMissing: true, values: { ...createFields, ...values } }] }) },
];
const modeCases = [
  { label: "canonical principal", values: { incomeMode: "principal-yield" }, expected: { incomeMode: "principal-yield", incomeCalculationMode: "principalYield" } },
  { label: "canonical annual", values: { incomeMode: "annual-income" }, expected: { incomeMode: "annual-income", incomeCalculationMode: "annualIncome" } },
  { label: "legacy principal", values: { incomeCalculationMode: "principalYield" }, expected: { incomeMode: "principal-yield", incomeCalculationMode: "principalYield" } },
  { label: "legacy annual", values: { incomeCalculationMode: "annualIncome" }, expected: { incomeMode: "annual-income", incomeCalculationMode: "annualIncome" } },
  { label: "matching principal aliases", values: { incomeMode: "principal-yield", incomeCalculationMode: "principalYield" }, expected: { incomeMode: "principal-yield", incomeCalculationMode: "principalYield" } },
  { label: "matching annual aliases", values: { incomeMode: "annual-income", incomeCalculationMode: "annualIncome" }, expected: { incomeMode: "annual-income", incomeCalculationMode: "annualIncome" } },
];

function writtenRow(payload: ToolPayload) {
  const row = payload.investment ?? payload.changedRows?.[0] ?? payload.rows?.[0];
  expect(row).toBeDefined();
  return row!;
}

describe("MCP investment write schemas", () => {
  test("advertises the same income fields without conflating checkbox or highlight controls", async () => {
    const { client, apiFetch } = await connectWorkbook();
    const listed = await client.listTools();
    for (const writeCase of writeCases) {
      const tool = listed.tools.find((entry) => entry.name === writeCase.name);
      expect(tool, writeCase.label).toBeDefined();
      const root = tool!.inputSchema as InputSchema;
      const schema = writeCase.name === "add_investment" ? root
        : writeCase.name === "replace_investments_table" ? root.properties?.rows?.items
        : writeCase.name === "bulk_update_investments" ? root.properties?.updates?.items?.properties?.values
        : root.properties?.values;
      expect(schema?.properties?.incomeMode?.enum, writeCase.label).toEqual(["principal-yield", "annual-income"]);
      expect(schema?.properties?.incomeCalculationMode?.enum, writeCase.label).toEqual(["principalYield", "annualIncome"]);
      expect(schema?.properties?.incomeKind?.enum, writeCase.label).toEqual(["wages", "selfEmployment", "interest", "dividends", "capitalGains", "rentalIncome", "businessIncome", "retirementIncome", "socialSecurity"]);
      expect(schema?.required ?? []).not.toContain("incomeMode");
      expect(schema?.required ?? []).not.toContain("incomeCalculationMode");
      expect(schema?.properties?.includeIncome).toBeDefined();
      expect(schema?.properties?.overrideProposal).toBeDefined();
      expect(schema?.properties?.highlight).toBeUndefined();
      expect(schema?.properties?.selectedAssetIds).toBeUndefined();
    }
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe.each(writeCases)("$label income writes", (writeCase) => {
  test.each(modeCases)("persists $label with explicit false and zero across save/reload", async (modeCase) => {
    const { workbook, saves, call } = await connectWorkbook();
    const before = structuredClone(workbook);
    const values = { ...modeCase.values, incomeKind: "rentalIncome", totalInvestment: 0, yearlyIncome: 0, includeIncome: false, overrideProposal: false, newSymbol: "BIL", newPercent: 0 };
    const expected = { ...values, ...modeCase.expected };
    const returned = writtenRow(await call(writeCase.name, writeCase.arguments(values)));
    expect(returned).toMatchObject(expected);
    expect(saves).toHaveLength(1);
    expect(saves[0].expectedRevision).toBe(7);
    expect(workbook.revision).toBe(8);
    expect(workbook.tabs.investments.find((row) => row.id === returned.id)).toMatchObject(expected);
    const reloaded = await call("list_investments");
    expect(reloaded.investments?.find((row) => row.id === returned.id)).toMatchObject(expected);
    expect(workbook.settings).toMatchObject(before.settings);
    expect(workbook.tabs.tickers).toEqual(before.tabs.tickers);
    expect(workbook.tabs.accounts).toEqual(before.tabs.accounts);
    expect(workbook.tabs.accountType).toEqual(before.tabs.accountType);
    if (writeCase.name !== "replace_investments_table") {
      expect(workbook.tabs.investments.filter((row) => row.id !== returned.id)).toEqual(before.tabs.investments.filter((row) => row.id !== returned.id));
    }
  });

  test("does not infer an explicit mode from an annual amount when mode fields are omitted", async () => {
    const { workbook, call } = await connectWorkbook();
    const returned = writtenRow(await call(writeCase.name, writeCase.arguments({ yearlyIncome: 0 })));
    const reloaded = (await call("list_investments")).investments?.find((row) => row.id === returned.id);
    expect(reloaded).toMatchObject({ yearlyIncome: 0 });
    if (writeCase.creates) {
      expect(reloaded).not.toHaveProperty("incomeMode");
      expect(reloaded).not.toHaveProperty("incomeCalculationMode");
      expect(reloaded).not.toHaveProperty("incomeKind");
    } else {
      expect(reloaded).toMatchObject({ incomeMode: "principal-yield", incomeCalculationMode: "principalYield", incomeKind: "interest", importedNote: "keep me", includeIncome: true, overrideProposal: true });
    }
    expect(workbook.settings.ui).toMatchObject({ selectedAssetIds: [101], investmentWhatIfOpen: false });
  });

  test.each([
    { incomeMode: "annual-income", incomeCalculationMode: "principalYield" },
    { incomeMode: "principal-yield", incomeCalculationMode: "annualIncome" },
  ])("rejects conflicting aliases %j without saving", async (values) => {
    const { workbook, saves, client } = await connectWorkbook();
    const before = structuredClone(workbook);
    const result = await client.callTool({ name: writeCase.name, arguments: writeCase.arguments(values) });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Conflicting income modes");
    expect(saves).toHaveLength(0);
    expect(workbook).toEqual(before);
  });

  test.each([
    { incomeMode: "annual-amount" },
    { incomeCalculationMode: "annual-income" },
    { incomeKind: "unknown-income-kind" },
  ])("rejects invalid income fields %j at the MCP boundary", async (values) => {
    const { workbook, saves, apiFetch, client } = await connectWorkbook();
    const before = structuredClone(workbook);
    const result = await client.callTool({ name: writeCase.name, arguments: writeCase.arguments(values) });
    expect(result.isError).toBe(true);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(saves).toHaveLength(0);
    expect(workbook).toEqual(before);
  });
});

describe("stateful investment write separation", () => {
  test.each(writeCases.filter((writeCase) => !writeCase.creates))("$label preserves select=false and explicit includeIncome precedence", async (writeCase) => {
    const { workbook, saves, call } = await connectWorkbook();
    const first = writtenRow(await call(writeCase.name, writeCase.arguments({ incomeMode: "annual-income", select: false, newPercent: 0 })));
    expect(first).toMatchObject({ incomeMode: "annual-income", incomeCalculationMode: "annualIncome", includeIncome: false, overrideProposal: true, newPercent: 0 });
    expect(first).not.toHaveProperty("select");
    const second = writtenRow(await call(writeCase.name, writeCase.arguments({ incomeCalculationMode: "principalYield", includeIncome: false, select: true })));
    expect(second).toMatchObject({ incomeMode: "principal-yield", incomeCalculationMode: "principalYield", includeIncome: false, overrideProposal: true, newPercent: 0 });
    expect(saves.map((save) => save.expectedRevision)).toEqual([7, 8]);
    expect(workbook.settings.ui).toMatchObject({ selectedAssetIds: [101], investmentWhatIfOpen: false });
  });

  test("keeps explicit modes, WhatIf, selection, and visual highlights independent over successive writes", async () => {
    const { workbook, saves, call } = await connectWorkbook();
    await call("update_investment_row", { rowId: 101, values: { incomeMode: "annual-income", yearlyIncome: 0, newPercent: 0 } });
    expect(workbook.tabs.investments[0]).toMatchObject({ includeIncome: true, overrideProposal: true });
    expect(workbook.settings.ui).toMatchObject({ selectedAssetIds: [101], investmentWhatIfOpen: false });
    await call("set_whatif_checkbox", { rowId: 101, checked: false });
    expect(workbook.tabs.investments[0]).toMatchObject({ includeIncome: true, overrideProposal: false });
    expect(workbook.settings.ui).toMatchObject({ selectedAssetIds: [101], investmentWhatIfOpen: true });
    await call("select_rows", { rowIds: [101], checked: false });
    expect(workbook.tabs.investments[0]).toMatchObject({ includeIncome: false, overrideProposal: false });
    expect(workbook.settings.ui.selectedAssetIds).toEqual([101]);
    const beforeHighlights = structuredClone(workbook.tabs.investments);
    await call("highlight_investment_rows", { symbols: ["PAY"], mode: "replace" });
    expect(workbook.settings.ui.selectedAssetIds).toEqual([202]);
    expect(workbook.tabs.investments).toEqual(beforeHighlights);
    await call("set_row_highlight", { clear: true });
    expect(workbook.settings.ui.selectedAssetIds).toEqual([]);
    expect(workbook.settings.ui.investmentWhatIfOpen).toBe(true);
    expect(workbook.tabs.investments).toEqual(beforeHighlights);
    const reloaded = await call("list_investments");
    expect(reloaded.investments?.[0]).toMatchObject({ incomeMode: "annual-income", incomeCalculationMode: "annualIncome", yearlyIncome: 0, newPercent: 0, includeIncome: false, overrideProposal: false });
    expect(saves.map((save) => save.expectedRevision)).toEqual([7, 8, 9, 10, 11]);
  });

  test("saves mixed bulk updates and additions once with per-row modes", async () => {
    const { workbook, saves, call } = await connectWorkbook();
    await call("bulk_update_investments", { updates: [
      { rowId: 101, values: { incomeMode: "annual-income", yearlyIncome: 0, select: false } },
      { rowId: 202, values: { incomeCalculationMode: "principalYield", totalInvestment: 0, newPercent: 0 } },
      { query: "New income row", addIfMissing: true, values: { ...createFields, incomeMode: "annual-income", incomeKind: "rentalIncome", yearlyIncome: 1200, select: false, overrideProposal: false, newPercent: 0 } },
    ] });
    expect(saves).toHaveLength(1);
    expect(workbook.tabs.investments).toMatchObject([
      { id: 101, incomeMode: "annual-income", incomeCalculationMode: "annualIncome", yearlyIncome: 0, includeIncome: false, overrideProposal: true },
      { id: 202, incomeMode: "principal-yield", incomeCalculationMode: "principalYield", totalInvestment: 0, newPercent: 0, includeIncome: false, overrideProposal: false },
      { id: 203, incomeMode: "annual-income", incomeCalculationMode: "annualIncome", incomeKind: "rentalIncome", yearlyIncome: 1200, includeIncome: false, overrideProposal: false, newPercent: 0 },
    ]);
    expect(workbook.settings.ui).toMatchObject({ selectedAssetIds: [101], investmentWhatIfOpen: false });
  });

  test.each(["bulk_update_investments", "replace_investments_table"])("%s does not persist an earlier valid row when a later row has conflicting modes", async (name) => {
    const { workbook, saves, client, call } = await connectWorkbook();
    const before = structuredClone(workbook);
    const valid = { incomeMode: "annual-income", yearlyIncome: 0 };
    const conflict = { incomeMode: "principal-yield", incomeCalculationMode: "annualIncome" };
    const args = name === "bulk_update_investments"
      ? { updates: [{ rowId: 101, values: valid }, { query: "New income row", addIfMissing: true, values: { ...createFields, ...conflict } }] }
      : { rows: [{ id: 101, ...valid }, { id: 202, ...conflict }], returnCalculation: false };
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Conflicting income modes");
    expect(saves).toHaveLength(0);
    expect(workbook).toEqual(before);
    expect((await call("list_investments")).investments?.map(({ uiColumns, ...row }) => row)).toEqual(before.tabs.investments);
  });

  test("replacement's default highlight clearing does not alter income or checkbox inputs", async () => {
    const { workbook, call } = await connectWorkbook();
    await call("replace_investments_table", { rows: [{ id: 101, ...createFields, incomeMode: "annual-income", yearlyIncome: 0, includeIncome: false, overrideProposal: true, newPercent: 0 }], returnCalculation: false });
    expect(workbook.settings.ui).toMatchObject({ selectedAssetIds: [], investmentWhatIfOpen: false });
    expect(workbook.tabs.investments[0]).toMatchObject({ incomeMode: "annual-income", incomeCalculationMode: "annualIncome", yearlyIncome: 0, includeIncome: false, overrideProposal: true, newPercent: 0 });
  });
});
