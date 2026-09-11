import { afterEach, describe, expect, test, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPortfolioServer } from "../mcp-server/src/portfolioServer";
import { calculateTaxPlan2025 } from "../amplify/backend/function/helloWorld/src/taxCalcs";

afterEach(() => vi.unstubAllGlobals());

async function calculate(settings: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
  const workbook = {
    workspaceId: "default", updatedAt: null,
    tabs: {
      accounts: [
        { account: "Job", accountType: "W2 income", includeInFreeCashflow: "no" },
        { account: "Brokerage", accountType: "Brokerage Account", includeInFreeCashflow: "yes" },
        { account: "IRA", accountType: "IRA", includeInFreeCashflow: "yes" },
      ],
      accountType: [{ name: "W2 income", taxStatus: "taxable" }, { name: "Brokerage Account", taxStatus: "taxable" }, { name: "IRA", taxStatus: "deferred" }],
      tickers: [
        { symbol: "W2", assetType: "Income", taxTreatment: "W2 income" },
        { symbol: "Dividend", percentReturn: 0.05, taxTreatment: "qualified-div" },
        { symbol: "Cash", percentReturn: 0, taxTreatment: "income" },
        { symbol: "Muni", percentReturn: 0.05, taxTreatment: "fed tax free" },
      ],
      investments: [
        { id: 1, account: "Job", symbol: "W2", yearlyIncome: 300_000, totalInvestment: 0, includeIncome: true },
        { id: 2, account: "Brokerage", symbol: "Dividend", totalInvestment: 100_000, includeIncome: true, newSymbol: "Cash", overrideProposal: true },
        { id: 3, account: "IRA", symbol: "Dividend", totalInvestment: 100_000, includeIncome: true },
        { id: 4, account: "Brokerage", symbol: "Muni", totalInvestment: 100_000, includeIncome: true },
      ],
    },
    settings: {
      federal: { filingStatus: "single", deductionMode: "standard" },
      state: { stateCode: "CA", standardDeduction: 5_706 },
      local: { enabled: true, localityId: "custom", rate: 0.01, taxableBase: { wages: true } },
      ...settings,
    },
  };
  const requests: Parameters<typeof calculateTaxPlan2025>[0][] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (body.calc === "TAX_PLAN_2025") {
      requests.push(body);
      return Response.json(calculateTaxPlan2025(body));
    }
    if (body.calc && body.calc !== "WORKBOOK_GET") throw new Error(`Unexpected API calculation: ${body.calc}`);
    return Response.json(workbook);
  }));
  const server = createPortfolioServer({ apiBaseUrl: "https://portfolio.test/hello", portfolioMcpToken: "test-only" });
  const client = new Client({ name: "calculation-audit", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const response = await client.callTool({ name: "calculate_portfolio", arguments: { includeRows: true, ...options } });
    expect(response.isError, JSON.stringify(response.content)).not.toBe(true);
    const content = response.content as Array<{ type: string; text: string }>;
    return { result: JSON.parse(content[0].text), requests };
  } finally {
    await client.close();
    await server.close();
  }
}

describe("MCP to authoritative tax engine", () => {
  test("all taxes, excluded income, sheltered income and NIIT reconcile", async () => {
    const { result, requests } = await calculate();
    expect(requests).toHaveLength(2);
    expect(requests[0].netInvestmentIncome).toBe(5_000);
    expect(requests[0].taxExemptInterest).toBe(5_000);
    expect(requests[1].taxExemptInterest).toBe(0);
    expect(result.taxes.localIncomeTax).toBe(3_000);
    expect(result.income.excludedFromAfterTaxIncome).toBe(300_000);
    expect(result.income.annualAfterTax).toBeCloseTo(10_000 - result.taxes.totalTax, 6);
    expect(result.portfolio.investmentTax).toBeCloseTo(calculateTaxPlan2025(requests[0]).totalTax - calculateTaxPlan2025(requests[1]).totalTax, 6);
  });
  test("saved WhatIf activates a zero yield, while an explicit false restores the original", async () => {
    const settings = { ui: { investmentWhatIfOpen: true } };
    const active = await calculate(settings);
    expect(active.result.rows[1].yearlyIncome).toBe(0);
    const original = await calculate(settings, { whatIfActive: false });
    expect(original.result.rows[1].yearlyIncome).toBe(5_000);
  });

  test("excluded income is reported separately from calculation income", async () => {
    const { result } = await calculate();
    expect(result.flows.nonInvestmentIncome).toBe(300_000);
    expect(result.flows.displayNonInvestmentIncome).toBe(0);
    expect(result.income.excludedFromAfterTaxIncome).toBe(300_000);
  });
});

describe("MCP field contracts", () => {
  test("keeps row inclusion, WhatIf, and visual highlighting separate", async () => {
    const server = createPortfolioServer({ apiBaseUrl: "https://portfolio.test/hello", portfolioMcpToken: "test-only" });
    const client = new Client({ name: "contract-audit", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const listed = await client.listTools();
      const checkbox = listed.tools.find((tool) => tool.name === "set_investment_checkbox") as any;
      const update = listed.tools.find((tool) => tool.name === "update_investment") as any;
      expect(checkbox).toBeDefined();
      expect(checkbox.inputSchema.properties.field.enum).toEqual(["includeIncome", "overrideProposal", "select"]);
      expect(update.inputSchema.properties.values.properties.highlight).toBeUndefined();
      expect(listed.tools.some((tool) => tool.name === "highlight_investment_rows")).toBe(true);
      expect(listed.tools.some((tool) => tool.name === "set_row_highlight")).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });

  test("selection and visual highlighting persist as separate fields", async () => {
    const workbook = {
      workspaceId: "default",
      revision: 0,
      updatedAt: "2026-09-08T20:00:00.000Z",
      tabs: {
        investments: [{ id: 101, spreadsheetRowNumber: 17, symbol: "BIL", includeIncome: true }],
        tickers: [{ symbol: "BIL", percentReturn: 0.04, taxTreatment: "income" }],
        accounts: [],
        accountType: [],
      },
      settings: { ui: { selectedAssetIds: [101] } },
    };
    const saves: Array<Record<string, any>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.calc === "WORKBOOK_SAVE") {
        if (body.expectedRevision !== workbook.revision) return Response.json({ error: "Workbook changed" }, { status: 409 });
        saves.push(body);
        Object.assign(workbook.tabs, structuredClone(body.tabs));
        Object.assign(workbook.settings, structuredClone(body.settings));
        workbook.revision += 1;
        return Response.json({ workspaceId: "default", revision: workbook.revision, updatedAt: "2026-09-08T20:00:01.000Z", savedKeys: ["investments", "settings"] });
      }
      if (body.calc === "WORKBOOK_GET") return Response.json(workbook);
      throw new Error(`Unexpected API calculation: ${body.calc}`);
    }));
    const server = createPortfolioServer({ apiBaseUrl: "https://portfolio.test/hello", portfolioMcpToken: "test-only" });
    const client = new Client({ name: "separation-audit", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const selection = await client.callTool({ name: "select_rows", arguments: { rowNumbers: [17], checked: false } });
      const highlight = await client.callTool({ name: "highlight_investment_rows", arguments: { ids: [101], mode: "replace" } });
      expect(selection.isError).not.toBe(true);
      expect(highlight.isError).not.toBe(true);
      expect(saves).toHaveLength(2);
      expect(saves[0].tabs.investments[0].includeIncome).toBe(false);
      expect(saves[0].settings.ui.selectedAssetIds).toEqual([101]);
      expect(saves[1].tabs.investments[0].includeIncome).toBe(false);
      expect(saves[1].settings.ui.selectedAssetIds).toEqual([101]);
      expect(saves.map((save) => save.expectedRevision)).toEqual([0, 1]);
      expect(workbook.tabs.investments[0].includeIncome).toBe(false);
      expect(workbook.revision).toBe(2);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
