import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createHealthPayload, createPortfolioServer, resolvePortfolioConfig } from "./portfolioServer.js";

type AssetsBinding = {
  fetch(request: Request): Promise<Response>;
};

type WorkerEnv = {
  ASSETS?: AssetsBinding;
  PORTFOLIO_API_BASE_URL?: string;
  PORTFOLIO_WORKSPACE_ID?: string;
  PORTFOLIO_SYNC_TOKEN?: string;
  MCP_AUTH_TOKEN?: string;
  MCP_PATH?: string;
};

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

function getSuppliedMcpToken(request: Request) {
  const url = new URL(request.url);
  return getBearerToken(request) || url.searchParams.get("mcp_token") || "";
}

function resolveMcpToken(request: Request, env: WorkerEnv) {
  const suppliedToken = getSuppliedMcpToken(request);
  const expectedToken = env.MCP_AUTH_TOKEN?.trim();

  if (expectedToken && suppliedToken === expectedToken) {
    return { ok: true as const, portfolioSyncToken: env.PORTFOLIO_SYNC_TOKEN || "" };
  }

  if (suppliedToken) {
    return { ok: true as const, portfolioMcpToken: suppliedToken };
  }

  if (!expectedToken && !env.PORTFOLIO_SYNC_TOKEN) {
    return { ok: true as const };
  }

  return { ok: false as const };
}

async function handleMcpRequest(request: Request, env: WorkerEnv, tokenConfig: { portfolioSyncToken?: string; portfolioMcpToken?: string }) {
  const config = resolvePortfolioConfig({
    apiBaseUrl: env.PORTFOLIO_API_BASE_URL,
    defaultWorkspaceId: env.PORTFOLIO_WORKSPACE_ID,
    portfolioSyncToken: tokenConfig.portfolioSyncToken,
    portfolioMcpToken: tokenConfig.portfolioMcpToken,
  });

  // Cloudflare Workers are serverless; subsequent MCP requests are not guaranteed
  // to hit the same isolate. Stateless transport avoids fragile in-memory sessions.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = createPortfolioServer(config);
  await server.connect(transport);
  return transport.handleRequest(request);
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const mcpPath = env.MCP_PATH || "/mcp";

    if (request.method === "GET" && url.pathname === "/health") {
      const payload = createHealthPayload(
        {
          apiBaseUrl: env.PORTFOLIO_API_BASE_URL,
          defaultWorkspaceId: env.PORTFOLIO_WORKSPACE_ID,
          portfolioSyncToken: env.PORTFOLIO_SYNC_TOKEN,
        },
        mcpPath
      );
      return jsonResponse({ ...payload, authProtected: Boolean(env.MCP_AUTH_TOKEN || env.PORTFOLIO_SYNC_TOKEN), supportsUserMcpTokens: true });
    }

    if (url.pathname === mcpPath) {
      const tokenConfig = resolveMcpToken(request, env);
      if (!tokenConfig.ok) {
        return jsonResponse({ error: "Unauthorized MCP request." }, { status: 401 });
      }

      return handleMcpRequest(request, env, tokenConfig);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return jsonResponse({ error: "Not found" }, { status: 404 });
  },
};
