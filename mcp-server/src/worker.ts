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

const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

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

function isAuthorized(request: Request, env: WorkerEnv) {
  const expectedToken = env.MCP_AUTH_TOKEN?.trim();
  if (!expectedToken) return true;

  const url = new URL(request.url);
  const suppliedToken = getBearerToken(request) || url.searchParams.get("mcp_token") || "";
  return suppliedToken === expectedToken;
}

async function getTransport(sessionId: string | null, env: WorkerEnv) {
  if (sessionId && transports.has(sessionId)) {
    return transports.get(sessionId)!;
  }

  const config = resolvePortfolioConfig({
    apiBaseUrl: env.PORTFOLIO_API_BASE_URL,
    defaultWorkspaceId: env.PORTFOLIO_WORKSPACE_ID,
    portfolioSyncToken: env.PORTFOLIO_SYNC_TOKEN,
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    enableJsonResponse: true,
    onsessioninitialized: (id) => {
      transports.set(id, transport);
    },
    onsessionclosed: (id) => {
      transports.delete(id);
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
      return jsonResponse({ ...payload, authProtected: Boolean(env.MCP_AUTH_TOKEN) });
    }

    if (url.pathname === mcpPath) {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ error: "Unauthorized MCP request." }, { status: 401 });
      }

      const sessionId = request.headers.get("mcp-session-id");
      const transport = await getTransport(sessionId, env);
      return transport.handleRequest(request);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return jsonResponse({ error: "Not found" }, { status: 404 });
  },
};
