import { createPortfolioHttpServer } from './httpServer.js';

const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const list = (value?: string) => value?.split(',').map(entry => entry.trim()).filter(Boolean);
const { httpServer, host } = createPortfolioHttpServer({
  apiBaseUrl: process.env.PORTFOLIO_API_BASE_URL,
  defaultWorkspaceId: process.env.PORTFOLIO_WORKSPACE_ID,
  portfolioSyncToken: process.env.PORTFOLIO_SYNC_TOKEN,
  portfolioMcpToken: process.env.PORTFOLIO_MCP_TOKEN,
  uiAppOrigin: process.env.AFTERTAX_UI_ORIGIN,
}, {
  host: process.env.MCP_HOST,
  path: process.env.MCP_PATH,
  accessToken: process.env.MCP_ACCESS_TOKEN,
  allowedHosts: list(process.env.MCP_ALLOWED_HOSTS),
  allowedOrigins: list(process.env.MCP_ALLOWED_ORIGINS),
});
httpServer.listen(port, host, () => {
  console.log(JSON.stringify({ message: 'Portfolio MCP server listening', host, port }));
});
