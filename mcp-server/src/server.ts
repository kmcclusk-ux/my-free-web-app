import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { URL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  createHealthPayload,
  createPortfolioServer,
  DEFAULT_WORKSPACE_ID,
  resolvePortfolioConfig,
} from "./portfolioServer.js";

const PORT = Number(process.env.PORT ?? 8787);
const MCP_PATH = process.env.MCP_PATH ?? "/mcp";
const config = resolvePortfolioConfig({
  apiBaseUrl: process.env.PORTFOLIO_API_BASE_URL,
  defaultWorkspaceId: process.env.PORTFOLIO_WORKSPACE_ID,
  portfolioSyncToken: process.env.PORTFOLIO_SYNC_TOKEN,
  portfolioMcpToken: process.env.PORTFOLIO_MCP_TOKEN,
});

const transports = new Map<string, StreamableHTTPServerTransport>();

async function ensureTransport(sessionId?: string) {
  if (sessionId && transports.has(sessionId)) {
    return transports.get(sessionId)!;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      transports.set(id, transport);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      transports.delete(transport.sessionId);
    }
  };

  const server = createPortfolioServer(config);
  await server.connect(transport);
  return transport;
}

const httpServer = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(createHealthPayload(config, MCP_PATH)));
      return;
    }

    if (url.pathname !== MCP_PATH) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
    const transport = await ensureTransport(sessionId);
    await transport.handleRequest(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown MCP server error";
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }
});

httpServer.listen(PORT, () => {
  console.log(
    JSON.stringify({
      message: "Portfolio MCP server listening",
      port: PORT,
      mcpPath: MCP_PATH,
      healthUrl: `http://localhost:${PORT}/health`,
      mcpUrl: `http://localhost:${PORT}${MCP_PATH}`,
      apiBaseUrl: config.apiBaseUrl,
      workspaceId: config.defaultWorkspaceId || DEFAULT_WORKSPACE_ID,
      hasPortfolioSyncToken: Boolean(config.portfolioSyncToken),
      hasPortfolioMcpToken: Boolean(config.portfolioMcpToken),
    })
  );
});
