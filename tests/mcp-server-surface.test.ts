import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  MODEL_SURFACE_RESOURCE_URI,
  createPortfolioServer,
} from "../mcp-server/src/portfolioServer";

const workbook = {
  workspaceId: "default",
  tabs: {
    investments: [{ id: 3, symbol: "VOO", description: "Index investment" }],
    tickers: [{ id: 7, symbol: "VOO", description: "Vanguard S&P 500 ETF" }],
  },
  settings: {},
  updatedAt: "2026-08-22T18:00:00.000Z",
};

async function connectTestClient() {
  const server = createPortfolioServer({
    apiBaseUrl: "https://portfolio.test/hello",
    portfolioMcpToken: "test-token",
    uiAppOrigin: "https://www.aftertaxus.com",
    loadUiHtml: async () => '<!doctype html><html><script type="module" src="/assets/app.js"></script></html>',
  });
  const client = new Client({ name: "focused-surface-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("focused MCP model surfaces", () => {
  it("advertises the focused render tool and app-only data bridge", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(workbook)));
    const { client, server } = await connectTestClient();
    try {
      const result = await client.listTools();
      const renderTool = result.tools.find((tool) => tool.name === "show_model_surface");
      const bridgeTool = result.tools.find((tool) => tool.name === "run_model_surface_api");
      expect(renderTool?._meta?.["openai/outputTemplate"]).toBe(MODEL_SURFACE_RESOURCE_URI);
      expect(renderTool?._meta?.ui).toEqual({ resourceUri: MODEL_SURFACE_RESOURCE_URI });
      expect(bridgeTool?._meta?.ui).toEqual({ visibility: ["app"] });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("serves the existing app shell as an MCP App resource", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(workbook)));
    const { client, server } = await connectTestClient();
    try {
      const listed = await client.listResources();
      expect(listed.resources.some((resource) => resource.uri === MODEL_SURFACE_RESOURCE_URI)).toBe(true);
      const result = await client.readResource({ uri: MODEL_SURFACE_RESOURCE_URI });
      expect(result.contents[0]?.mimeType).toBe("text/html;profile=mcp-app");
      expect("text" in result.contents[0] ? result.contents[0].text : "").toContain(
        'src="https://www.aftertaxus.com/assets/app.js"'
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("resolves a data row and returns only its requested editor surface", async () => {
    const apiFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("X-Portfolio-MCP-Token")).toBe("test-token");
      return Response.json(workbook);
    });
    vi.stubGlobal("fetch", apiFetch);
    const { client, server } = await connectTestClient();
    try {
      const result = await client.callTool({
        name: "show_model_surface",
        arguments: { surface: "assets", action: "edit", query: "VOO" },
      });
      expect(result.structuredContent).toMatchObject({
        surface: "assets",
        tab: "tickers",
        action: "edit",
        recordId: 7,
        title: "Assets",
      });
      expect((result.structuredContent as { appUrl: string }).appUrl).toContain("surface=assets");
      expect(apiFetch).toHaveBeenCalledOnce();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("opens every requested model area without the full dashboard", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(workbook)));
    const { client, server } = await connectTestClient();
    const expectedTabs = {
      investmentsIncome: "investments",
      assets: "tickers",
      assetClasses: "categories",
      taxTreatments: "taxTreatment",
      accounts: "accounts",
      accountTaxCategories: "accountTaxType",
      accountTypes: "accountType",
      federalTax: "federal",
      stateTax: "state",
      localTax: "local",
    } as const;
    try {
      for (const [surface, tab] of Object.entries(expectedTabs)) {
        const result = await client.callTool({
          name: "show_model_surface",
          arguments: { surface, action: "view" },
        });
        expect(result.structuredContent).toMatchObject({ surface, tab, action: "view" });
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
