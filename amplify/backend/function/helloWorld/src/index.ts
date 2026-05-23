import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { request as httpsRequest } from "https";
import {
  fedTax2025Mfj,
  fedTax2025Ordinary,
  fedPrefTax2024,
  caTax2025Mfj,
  niitTax,
  type FilingStatus,
} from "./taxCalcs";
import { WorkbookStore, type WorkbookPayload } from "./workbookStore";

function jsonResponse(
  statusCode: number,
  body: unknown,
  origin = "*"
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
    body: JSON.stringify(body),
  };
}

function corsPreflight(origin = "*"): APIGatewayProxyResult {
  return {
    statusCode: 204,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
    body: "",
  };
}

function decodeBody(event: APIGatewayProxyEvent): string | null {
  if (!event.body) return null;
  return event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
}

type RequestBody =
  | { calc: "FED_TAX_2025_MFJ"; taxableIncome: number }
  | {
      calc: "FED_TAX_2025_ORDINARY";
      taxableIncome: number;
      filingStatus: FilingStatus;
    }
  | {
      calc: "FED_PREF_TAX_2024";
      ordinaryTaxable: number;
      prefTaxable: number;
      filingStatus: FilingStatus;
    }
  | {
      calc: "FED_TAX_2025_COMBINED";
      ordinaryTaxable: number;
      prefTaxable: number;
      filingStatus: FilingStatus;
      magi: number;
      netInvestmentIncome: number;
    }
  | { calc: "CA_TAX_2025_MFJ"; taxableIncome: number }
  | { calc: "STATE_TAX_2025_CA_MFJ"; taxableIncome: number }
  | { calc: "WORKBOOK_GET"; workspaceId?: string }
  | { calc: "WORKBOOK_GET_TAB"; workspaceId?: string; tabName: string }
  | { calc: "WORKBOOK_SAVE"; workspaceId?: string; tabs?: Record<string, unknown>; settings?: Record<string, unknown> }
  | { calc: "WORKBOOK_SAVE_TAB"; workspaceId?: string; tabName: string; data: unknown }
  | { calc: "PORTFOLIO_CHAT"; messages?: PortfolioChatMessage[]; portfolioSnapshot?: unknown };

type PortfolioChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AssistantAction = {
  type: string;
  payload?: Record<string, unknown>;
  requiresConfirmation?: boolean;
};

type PortfolioChatResponse = {
  message: string;
  actions: AssistantAction[];
  model: string;
  usage?: unknown;
};

const PORTFOLIO_ASSISTANT_SYSTEM_PROMPT = `You are a portfolio assistant embedded in this investment portfolio app.
Use only the provided portfolio state, workbook tables, reference tables, and calculated metrics. If data is missing, say what is missing.
You can answer open-ended questions about investments, tickers, accounts, tax treatment, account tax type, investment type, categories, filters, selected rows, allocation, income, diversification, concentration, and calculated tax/after-tax metrics.
Do not invent balances, prices, returns, allocations, gains, losses, or tax figures. Explain financial information neutrally. Do not provide personalized investment, tax, legal, trading, transfer, or irreversible-action advice.
If web search tools are available, use them only when the user asks for current external information or facts not present in the workbook snapshot. Do not browse for questions that can be answered from the supplied portfolio/workbook data.
When the user only asks a question, answer normally in concise prose or markdown. When the user asks you to change the app UI or workbook data, return JSON only in this shape:
{"message":"short explanation","actions":[{"type":"setFilter","payload":{"filterName":"account","value":"taxable"}}]}.
Allowed action types are setCheckbox, setAllCheckboxes, selectAsset, selectAssets, selectAccount, setFilter, clearFilters, sortTable, setView, addRow, updateRow, and deleteRows.
Editable tableIds are investments, tickers, accounts, categories, taxTreatment, accountTaxType, and investmentType.
Use row ids from the snapshot when possible. If a request is ambiguous, select/highlight matching rows or ask a clarifying question instead of changing or deleting data.
Action schemas:
- setCheckbox payload: {"id": investment row id, "field":"includeIncome"|"overrideProposal", "checked": boolean}.
- setAllCheckboxes payload: {"field":"includeIncome"|"overrideProposal", "checked": boolean}. Use requiresConfirmation true.
- addRow payload: {"tableId":"investments"|"tickers"|"accounts"|"categories"|"taxTreatment"|"accountTaxType"|"investmentType","row":{allowed fields for that table}}. Use requiresConfirmation true.
- updateRow payload: {"tableId":"...","id": row id OR "selector":"text to match","values":{allowed fields to change}}. Use requiresConfirmation true unless it is a harmless view-only action.
- deleteRows payload: {"tableId":"...","ids":[row ids] OR "selector":"text to match"}. Always use requiresConfirmation true.
- selectAsset payload: {"assetId":"ticker, row id, description, or account text"}.
- selectAssets payload: {"assetIds":[row ids]} or {"symbol":"ticker"}.
- selectAccount payload: {"accountId":"account id or account name"}.
- setFilter payload: {"filterName":"account"|"category"|"asset","value":"filter value"}.
- sortTable payload: {"tableId":"investments","column":"description"|"account"|"category"|"totalInvestment"|"yearlyIncome"|"symbol"|"includedTotal"|"filteredIncome","direction":"asc"|"desc"}.
- setView payload: {"viewName":"Investments"|"Tickers"|"Accounts"|"Federal Tax"|"State Tax"|"Tax Calculator"|"focus_grid"|"analytics"}.
Investment row fields: description, account, category, totalInvestment, yearlyIncome, includeIncome, overrideProposal, symbol, newSymbol, newPercent.
Ticker row fields: symbol, percentReturn, category, taxTreatment, extraData, description, exDividend, divPayout.
Account row fields: account, taxStatus, dividendAccrued, includeInFreeCashflow.
Category row fields: name. Tax treatment row fields: label. Account tax type row fields: taxStatus. Investment type row fields: name.
To highlight rows for a ticker or description, use {"message":"Highlighting matching rows.","actions":[{"type":"selectAsset","payload":{"assetId":"BSJQ"}}]}.
For "clear all Inc checkboxes", return {"message":"Clearing all Inc checkboxes.","actions":[{"type":"setAllCheckboxes","payload":{"field":"includeIncome","checked":false},"requiresConfirmation":true}]}.
For "select all Inc checkboxes", return {"message":"Selecting all Inc checkboxes.","actions":[{"type":"setAllCheckboxes","payload":{"field":"includeIncome","checked":true},"requiresConfirmation":true}]}.
Do not use setFilter for Inc. Inc is a checkbox field, not a filter.
Do not request placing trades, transferring money, connecting brokerage accounts, or external irreversible financial actions.`;

function isFilingStatus(x: string): x is FilingStatus {
  return x === "single" || x === "mfj" || x === "mfs" || x === "hoh";
}

function isOrdinary2025FilingStatus(x: FilingStatus): x is "single" | "mfj" {
  return x === "single" || x === "mfj";
}

function readNonNegativeNumber(value: unknown, fieldName: string) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return { error: `${fieldName} must be a number >= 0` };
  }
  return { value: num };
}

function getProxySegments(event: APIGatewayProxyEvent): string[] {
  const pathParameters = (event.pathParameters ?? {}) as Record<string, string | undefined>;
  const directProxy = pathParameters.proxy || pathParameters["proxy+"];
  if (directProxy) {
    return directProxy.split("/").filter(Boolean);
  }

  const candidates = [
    event.path,
    (event as any).resource,
    (event as any).requestContext?.path,
    (event as any).requestContext?.resourcePath,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  for (const candidate of candidates) {
    const workbookMatch = candidate.match(/workbook\/(.+)$/);
    if (workbookMatch?.[1]) {
      return ["workbook", ...workbookMatch[1].split("/").filter(Boolean)];
    }

    const helloMatch = candidate.match(/\/hello\/(.+)$/);
    if (helloMatch?.[1]) {
      return helloMatch[1].split("/").filter(Boolean);
    }
  }

  return [];
}

function parseJsonBody<T>(event: APIGatewayProxyEvent): T | null {
  const raw = decodeBody(event);
  if (!raw) return null;
  return JSON.parse(raw.trim()) as T;
}

function postJsonToOpenRouter(
  payload: unknown,
  apiKey: string,
  timeoutMs = 22000
): Promise<{ statusCode: number; body: string }> {
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    let completed = false;
    let req: ReturnType<typeof httpsRequest>;
    const finish = (callback: () => void) => {
      if (completed) return;
      completed = true;
      clearTimeout(totalTimeout);
      callback();
    };
    const totalTimeout = setTimeout(() => {
      req.destroy(new Error("OpenRouter request timed out."));
    }, timeoutMs);

    req = httpsRequest(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://portfolio-workbook.local",
          "X-Title": "Portfolio Workbook Assistant",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          finish(() => resolve({
            statusCode: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8"),
          }));
        });
      }
    );

    req.on("error", (error) => {
      finish(() => reject(error));
    });
    req.setTimeout(Math.min(timeoutMs, 15000), () => {
      req.destroy(new Error("OpenRouter request timed out."));
    });
    req.write(body);
    req.end();
  });
}

function getTextFromHttps(url: string, timeoutMs = 8000): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    let completed = false;
    let req: ReturnType<typeof httpsRequest>;
    const finish = (callback: () => void) => {
      if (completed) return;
      completed = true;
      clearTimeout(totalTimeout);
      callback();
    };
    const totalTimeout = setTimeout(() => {
      req.destroy(new Error("External quote request timed out."));
    }, timeoutMs);

    req = httpsRequest(
      url,
      {
        method: "GET",
        headers: {
          "Accept": "application/json,text/plain,*/*",
          "User-Agent": "PortfolioWorkbookAssistant/1.0",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          finish(() => resolve({
            statusCode: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8"),
          }));
        });
      }
    );

    req.on("error", (error) => {
      finish(() => reject(error));
    });
    req.setTimeout(Math.min(timeoutMs, 7000), () => {
      req.destroy(new Error("External quote request timed out."));
    });
    req.end();
  });
}

function sanitizeChatMessages(messages: unknown): PortfolioChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message): message is PortfolioChatMessage => {
      if (!message || typeof message !== "object") return false;
      const role = (message as any).role;
      const content = (message as any).content;
      return (role === "user" || role === "assistant") && typeof content === "string" && content.trim().length > 0;
    })
    .slice(-16)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 4000),
    }));
}

function parseAssistantChatContent(content: string): { message: string; actions: AssistantAction[] } {
  const trimmed = content.trim();
  const jsonCandidate = trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  try {
    const parsed = JSON.parse(jsonCandidate);
    const message = typeof parsed?.message === "string" ? parsed.message : trimmed;
    const actions = Array.isArray(parsed?.actions)
      ? parsed.actions
          .filter((action: unknown): action is AssistantAction => !!action && typeof action === "object" && typeof (action as any).type === "string")
          .map((action: AssistantAction) => ({
            type: action.type,
            payload: action.payload && typeof action.payload === "object" ? action.payload : {},
            requiresConfirmation: Boolean(action.requiresConfirmation),
          }))
      : [];
    return { message, actions };
  } catch {
    return { message: trimmed, actions: [] };
  }
}

function inferBulkIncCheckboxAction(userContent: string, assistantContent: string): AssistantAction | null {
  const text = `${userContent}\n${assistantContent}`.toLowerCase();
  const mentionsIncCheckboxes =
    /\binc\b/.test(text) &&
    (
      text.includes("checkbox") ||
      text.includes("check box") ||
      text.includes("checked") ||
      text.includes("unchecked") ||
      text.includes("clear") ||
      text.includes("uncheck") ||
      text.includes("deselect") ||
      text.includes("select all")
    );
  const mentionsBulk = text.includes("all") || text.includes("every");
  if (!mentionsIncCheckboxes || !mentionsBulk) return null;

  if (text.includes("clear") || text.includes("uncheck") || text.includes("unchecked") || text.includes("deselect")) {
    return {
      type: "setAllCheckboxes",
      payload: { field: "includeIncome", checked: false },
      requiresConfirmation: true,
    };
  }

  if (text.includes("select") || text.includes("check") || text.includes("checked")) {
    return {
      type: "setAllCheckboxes",
      payload: { field: "includeIncome", checked: true },
      requiresConfirmation: true,
    };
  }

  return null;
}

function normalizeAssistantActions(actions: AssistantAction[], userContent: string, assistantContent: string): AssistantAction[] {
  const inferredBulkAction = inferBulkIncCheckboxAction(userContent, assistantContent);

  if (actions.length === 0) {
    return inferredBulkAction ? [inferredBulkAction] : [];
  }

  return actions.map((action) => {
    if (action.type === "setFilter") {
      const filterName = String(action.payload?.filterName || "").trim().toLowerCase();
      if (["inc", "include", "includeincome", "inc checkbox", "inc checkboxes"].includes(filterName)) {
        return inferredBulkAction || action;
      }
    }

    if (action.type === "setAllCheckboxes") {
      const checked = typeof action.payload?.checked === "boolean"
        ? action.payload.checked
        : inferredBulkAction?.payload?.checked;
      if (typeof checked === "boolean") {
        return {
          type: "setAllCheckboxes",
          payload: {
            field: action.payload?.field === "overrideProposal" ? "overrideProposal" : "includeIncome",
            checked,
          },
          requiresConfirmation: true,
        };
      }
    }

    return action;
  });
}

function extractAssistantText(parsed: any): string | null {
  const message = parsed?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string" && content.trim()) return content;

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.content === "string") return part.content;
        return "";
      })
      .join("")
      .trim();
    if (text) return text;
  }

  if (content && typeof content === "object") {
    const text = [
      (content as any).text,
      (content as any).content,
      (content as any).message,
      (content as any).output_text,
    ].find((value) => typeof value === "string" && value.trim());
    if (typeof text === "string") return text;
  }

  const fallback =
    message?.text ||
    parsed?.choices?.[0]?.text ||
    parsed?.message ||
    parsed?.output_text ||
    parsed?.output?.[0]?.content?.[0]?.text;
  return typeof fallback === "string" && fallback.trim() ? fallback : null;
}

function toSnapshotNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function parseBooleanEnv(value: unknown) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function parsePositiveIntegerEnv(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function extractTickerSymbolsFromText(text: string) {
  const ignored = new Set([
    "AI", "API", "IRS", "CA", "MFJ", "SS",
    "A", "AN", "AND", "ARE", "ASK", "AT", "CURRENT", "DIVIDEND", "DIVIDENDS", "DO", "EACH", "EVERY", "FOR", "FROM", "GET", "GIVE", "HERE",
    "IN", "INVESTMENT", "INVESTMENTS", "IS", "LATEST", "LIST", "MARKET", "ME", "NAV", "OF", "PORTFOLIO", "PRICE", "PRICES", "QUOTE",
    "QUOTES", "RATIO", "SHOW", "SYMBOL", "SYMBOLS", "THE", "THEIR", "TICKER", "TICKERS", "TODAY", "VALUE", "WHAT", "YIELD",
  ]);
  const matches = text.match(/\b\^?[A-Za-z][A-Za-z0-9.-]{0,9}\b/g) || [];
  return [...new Set(matches.map((match) => match.toUpperCase()).filter((match) => !ignored.has(match)))];
}

function questionLikelyNeedsWebSearch(text: string) {
  return /\b(current|latest|today|market|quote|price|dividend|distribution|yield|ex[-\s]?dividend|nav|expense ratio)\b/i.test(text);
}

function buildCompactExternalLookupContext(snapshot: unknown, userContent: string) {
  if (!snapshot || typeof snapshot !== "object") {
    return { querySymbols: extractTickerSymbolsFromText(userContent) };
  }

  const querySymbols = extractTickerSymbolsFromText(userContent);
  const upperSymbols = new Set(querySymbols);
  const source = snapshot as any;
  const holdings = Array.isArray(source.holdings)
    ? source.holdings.filter((holding: any) => {
        const symbols = [holding?.symbol, holding?.effectiveSymbol, holding?.newSymbol].map((value) => normalizePortfolioMatchValue(value));
        return symbols.some((symbol) => upperSymbols.has(symbol));
      })
    : [];
  const tickers = Array.isArray(source.referenceTables?.tickers)
    ? source.referenceTables.tickers.filter((ticker: any) => upperSymbols.has(normalizePortfolioMatchValue(ticker?.symbol)))
    : [];

  return {
    generatedAt: source.generatedAt,
    querySymbols,
    matchingHoldings: holdings,
    matchingTickers: tickers,
    metrics: source.metrics || {},
  };
}

function formatSnapshotCurrency(value: number) {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatSnapshotPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatSignedCurrency(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatQuoteTime(epochSeconds: unknown, timeZone?: string) {
  const epoch = Number(epochSeconds);
  if (!Number.isFinite(epoch) || epoch <= 0) return "the latest available Yahoo Finance timestamp";
  return new Date(epoch * 1000).toLocaleString("en-US", {
    timeZone: timeZone || "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function escapeMarkdownCell(value: unknown) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function getRecentUserContent(messages: PortfolioChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.content || "";
}

function getYahooFinanceQuoteSymbol(text: string) {
  const urlMatch = text.match(/finance\.yahoo\.com\/quote\/([^/?#\s]+)/i);
  if (urlMatch?.[1]) return decodeURIComponent(urlMatch[1]).toUpperCase();
  if (!/\b(current|latest|today|market|quote|prices?|value)\b/i.test(text)) return null;
  if (/\b(each|all|every|portfolio|investments?|tickers?|symbols?)\b/i.test(text)) return null;

  const quotePatterns = [
    /\b(?:quote|prices?|value)\s+(?:of|for)?\s*(\^?[A-Za-z][A-Za-z0-9.-]{0,9})\b/i,
    /\b(?:current|latest|today|market)\s+(?:quote|prices?|value)\s+(?:of|for)?\s*(\^?[A-Za-z][A-Za-z0-9.-]{0,9})\b/i,
    /\b(\^?[A-Za-z][A-Za-z0-9.-]{0,9})\s+(?:current\s+|latest\s+|today\s+|market\s+)?(?:quote|prices?|value)\b/i,
  ];
  for (const pattern of quotePatterns) {
    const match = text.match(pattern)?.[1];
    if (!match) continue;
    const symbol = match.toUpperCase();
    if (extractTickerSymbolsFromText(symbol).length === 1) return symbol;
  }

  const symbols = extractTickerSymbolsFromText(text);
  if (symbols.length !== 1) return null;
  return symbols[0];
}

type YahooQuote = {
  symbol: string;
  lookupSymbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayLow: number;
  dayHigh: number;
  volume: number;
  currency: string;
  quoteTime: string;
  yahooUrl: string;
};

const YAHOO_QUOTE_SYMBOL_ALIASES: Record<string, string> = {
  SPX: "^SPX",
};

async function fetchYahooFinanceQuote(symbol: string): Promise<YahooQuote> {
  const cleanSymbol = symbol.toUpperCase();
  const lookupSymbol = YAHOO_QUOTE_SYMBOL_ALIASES[cleanSymbol] || cleanSymbol;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(lookupSymbol)}?range=1d&interval=1m`;
  const response = await getTextFromHttps(url, 8000);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Yahoo quote endpoint returned ${response.statusCode}.`);
  }

  const parsed = JSON.parse(response.body);
  const result = parsed?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) throw new Error("Yahoo quote endpoint did not include quote metadata.");

  const price = toSnapshotNumber(meta.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Yahoo quote endpoint did not include a usable current market price.");
  }
  const previousClose = toSnapshotNumber(meta.previousClose ?? meta.chartPreviousClose);
  const change = previousClose > 0 ? price - previousClose : 0;
  return {
    symbol: cleanSymbol,
    lookupSymbol,
    name: String(meta.longName || meta.shortName || cleanSymbol),
    price,
    previousClose,
    change,
    changePercent: previousClose > 0 ? change / previousClose : 0,
    dayLow: toSnapshotNumber(meta.regularMarketDayLow),
    dayHigh: toSnapshotNumber(meta.regularMarketDayHigh),
    volume: toSnapshotNumber(meta.regularMarketVolume),
    currency: String(meta.currency || "USD"),
    quoteTime: formatQuoteTime(meta.regularMarketTime, meta.exchangeTimezoneName),
    yahooUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(lookupSymbol)}/`,
  };
}

async function answerYahooFinanceQuoteQuestion(messages: PortfolioChatMessage[]): Promise<PortfolioChatResponse | null> {
  const lastUserMessage = getRecentUserContent(messages);
  const symbol = getYahooFinanceQuoteSymbol(lastUserMessage);
  if (!symbol) return null;

  try {
    const quote = await fetchYahooFinanceQuote(symbol);
    return {
      message: [
        `Yahoo Finance quote for **${quote.symbol}** (${quote.name}): **${formatSnapshotCurrency(quote.price)} ${quote.currency}** as of ${quote.quoteTime}.`,
        `Change vs previous close ${formatSnapshotCurrency(quote.previousClose)}: **${formatSignedCurrency(quote.change)} (${quote.changePercent >= 0 ? "+" : ""}${formatSnapshotPercent(quote.changePercent)})**.`,
        quote.dayLow || quote.dayHigh ? `Day range: ${formatSnapshotCurrency(quote.dayLow)} - ${formatSnapshotCurrency(quote.dayHigh)}.` : "",
        quote.volume ? `Volume: ${quote.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })}.` : "",
        `Source: ${quote.yahooUrl}`,
      ].filter(Boolean).join("\n"),
      actions: [],
      model: "direct-yahoo-finance-chart",
    };
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Yahoo Finance lookup failed.";
    return {
      message: `I could not fetch the Yahoo Finance quote directly for ${symbol}: ${message}`,
      actions: [],
      model: "direct-yahoo-finance-chart",
    };
  }
}

function isLikelyMarketTickerSymbol(value: unknown) {
  const symbol = String(value || "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return false;
  return !new Set(["SS", "AUX-SS"]).has(symbol);
}

function getPortfolioPriceRequest(text: string) {
  return /\b(current|latest|today|market)?\s*(prices?|quotes?)\b/i.test(text) &&
    /\b(each|all|every|portfolio|investments?|tickers?|symbols?)\b/i.test(text);
}

function getPortfolioTickerSymbols(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object") return [];
  const source = snapshot as any;
  const holdings = Array.isArray(source.holdings) ? source.holdings : [];
  const symbols: string[] = holdings
    .flatMap((holding: any) => [holding?.effectiveSymbol, holding?.symbol])
    .map((symbol: unknown) => String(symbol || "").trim().toUpperCase())
    .filter((symbol: string) => isLikelyMarketTickerSymbol(symbol));
  return [...new Set<string>(symbols)].sort((a, b) => a.localeCompare(b));
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += limit) {
    const chunk = items.slice(index, index + limit);
    results.push(...await Promise.all(chunk.map(mapper)));
  }
  return results;
}

async function answerPortfolioTickerPricesQuestion(messages: PortfolioChatMessage[], snapshot: unknown): Promise<PortfolioChatResponse | null> {
  const lastUserMessage = getRecentUserContent(messages);
  if (!getPortfolioPriceRequest(lastUserMessage)) return null;

  const symbols = getPortfolioTickerSymbols(snapshot);
  if (symbols.length === 0) {
    return {
      message: "I could not find any market-style ticker symbols in the current portfolio snapshot.",
      actions: [],
      model: "direct-yahoo-finance-chart",
    };
  }

  const quoteResults = await mapWithConcurrency(symbols, 6, async (symbol) => {
    try {
      return { symbol, quote: await fetchYahooFinanceQuote(symbol), error: "" };
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "quote lookup failed";
      return { symbol, quote: null, error: message };
    }
  });

  const tableRows = quoteResults.map((result) => {
    if (!result.quote) {
      return `| ${escapeMarkdownCell(result.symbol)} | unavailable | - | - | - | ${escapeMarkdownCell(result.error)} |`;
    }
    const quote = result.quote;
    return `| ${escapeMarkdownCell(quote.symbol)} | ${formatSnapshotCurrency(quote.price)} ${escapeMarkdownCell(quote.currency)} | ${formatSignedCurrency(quote.change)} | ${quote.changePercent >= 0 ? "+" : ""}${formatSnapshotPercent(quote.changePercent)} | ${escapeMarkdownCell(quote.quoteTime)} | ${escapeMarkdownCell(quote.name)} |`;
  });

  return {
    message: [
      `Current Yahoo Finance prices for ${symbols.length} portfolio ticker${symbols.length === 1 ? "" : "s"}:`,
      "",
      "| Ticker | Price | Change | Change % | Quote time | Name / status |",
      "|---|---:|---:|---:|---|---|",
      ...tableRows,
    ].join("\n"),
    actions: [],
    model: "direct-yahoo-finance-chart",
  };
}

function normalizePortfolioMatchValue(value: unknown) {
  return String(value || "")
    .replace(/[';]s\b/gi, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function portfolioMatchTokens(value: unknown) {
  const normalized = normalizePortfolioMatchValue(value);
  if (!normalized) return [];
  return [
    normalized,
    ...normalized.split(/[^A-Z0-9]+/).filter(Boolean),
  ];
}

function portfolioValueMatchesSelector(value: unknown, selector: string) {
  const normalized = normalizePortfolioMatchValue(value);
  if (!normalized || !selector) return false;
  if (normalized === selector) return true;
  if (portfolioMatchTokens(value).includes(selector)) return true;
  if (selector === "SS" && normalized.includes("SOCIAL SECURITY")) return true;
  return selector.length >= 3 && normalized.includes(selector);
}

function portfolioSelectorTokens(selector: string) {
  return normalizePortfolioMatchValue(selector)
    .split(/[^A-Z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token && !["ALL", "LINE", "LINES", "ROW", "ROWS", "HOLDING", "HOLDINGS", "INVESTMENT", "INVESTMENTS", "DESC", "DESCRIPTION", "SYMBOL", "SYMBOLS", "TICKER", "TICKERS"].includes(token));
}

function holdingMatchesSelector(holding: any, selector: string) {
  const values = [
    holding?.symbol,
    holding?.effectiveSymbol,
    holding?.newSymbol,
    holding?.description,
    holding?.account,
  ];
  if (values.some((value) => portfolioValueMatchesSelector(value, selector))) return true;

  const combined = values.filter(Boolean).join(" ");
  const tokens = portfolioSelectorTokens(selector);
  return tokens.length > 1 && tokens.every((token) => portfolioValueMatchesSelector(combined, token));
}

function cleanPortfolioSelectorPhrase(value: unknown) {
  return String(value || "")
    .replace(/^[\s"'`]+|[\s"'`.?!]+$/g, "")
    .replace(/[';]s\b/gi, "")
    .replace(/\b(?:all|line|lines|row|rows|holding|holdings|investment|investments)\b/gi, " ")
    .replace(/\b(?:desc|description|symbol|symbols|ticker|tickers)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitPortfolioSelectors(selector: string) {
  const cleaned = cleanPortfolioSelectorPhrase(selector);
  if (!cleaned) return [];

  const hasExplicitList = /,|\bor\b/i.test(selector);
  const tickerLikeTokens = cleaned.split(/\s+/).filter((token) => /^[A-Za-z][A-Za-z0-9.-]{1,9}$/.test(token));
  const shouldSplitWhitespaceList =
    !hasExplicitList &&
    /\b(?:symbol|symbols|ticker|tickers)\b/i.test(selector) &&
    tickerLikeTokens.length > 1;

  const parts = hasExplicitList
    ? cleaned.split(/\s*,\s*|\s+\bor\s+/i)
    : shouldSplitWhitespaceList
      ? tickerLikeTokens
      : [cleaned];

  return [...new Set(parts.map(cleanPortfolioSelectorPhrase).filter(Boolean))];
}

function getSelectRowsSelector(matchesText: string) {
  const text = matchesText.trim();
  const normalizedCommand = text.replace(/\bhightlight\b/gi, "highlight").replace(/\bhilight\b/gi, "highlight");
  const asksToSelectRows =
    /\bhighlight\b/i.test(normalizedCommand) ||
    (
      /\b(select|find)\b/i.test(normalizedCommand) &&
      /\b(rows?|holdings?|investments?)\b/i.test(normalizedCommand) &&
      !/\b(check|checkbox|checked|unchecked|inc)\b/i.test(normalizedCommand)
    );
  if (!asksToSelectRows) return null;

  const selectorMatch =
    normalizedCommand.match(/\b(?:contain(?:s|ing)?|with|matching|for|called|named)\s+(.+)$/i) ||
    normalizedCommand.match(/\b(?:select|highlight|find)\s+(?:the\s+)?(?:rows?|holdings?|investments?)\s+(.+)$/i) ||
    normalizedCommand.match(/\b(?:select|highlight|find)\s+(.+?)(?:\s+(?:rows?|holdings?|investments?))?$/i);
  const selector = cleanPortfolioSelectorPhrase(selectorMatch?.[1] || "");
  return selector ? selector : null;
}

function answerSelectRowsQuestion(messages: PortfolioChatMessage[], snapshot: unknown): PortfolioChatResponse | null {
  const lastUserMessage = getRecentUserContent(messages);
  const selector = getSelectRowsSelector(lastUserMessage);
  if (!selector) return null;

  if (snapshot && typeof snapshot === "object") {
    const holdings = Array.isArray((snapshot as any).holdings) ? (snapshot as any).holdings : [];
    const selectors = splitPortfolioSelectors(selector);
    const selectorKeys = selectors.map(normalizePortfolioMatchValue);
    const matches = holdings.filter((holding: any) => selectorKeys.some((selectorKey) => holdingMatchesSelector(holding, selectorKey)));
    const selectorLabel = selectors.length > 1 ? selectors.join(", ") : selector;
    if (holdings.length > 0 && matches.length === 0) {
      return {
        message: `I could not find any rows containing "${selectorLabel}".`,
        actions: [],
        model: "local-portfolio-calculation",
      };
    }

    return {
      message: `Highlighting ${matches.length} matching row${matches.length === 1 ? "" : "s"} containing "${selectorLabel}".`,
      actions: [{ type: "selectAssets", payload: { assetIds: matches.map((holding: any) => holding.id).filter((id: unknown) => id !== undefined), selector: selectorLabel }, requiresConfirmation: false }],
      model: "local-portfolio-calculation",
    };
  }

  return {
    message: `Highlighting rows containing "${selector}".`,
    actions: [{ type: "selectAsset", payload: { assetId: selector }, requiresConfirmation: false }],
    model: "local-portfolio-calculation",
  };
}

function getTickerTotalQuestion(matchesText: string) {
  const socialSecurityMatch = /\bsocial security\b/i.test(matchesText);
  const symbolMatch = matchesText.match(/\b([A-Z]{2,6}[A-Z0-9.-]*)\b/);
  const asksTotal = /\b(total|sum|amount|value)\b/i.test(matchesText);
  if (socialSecurityMatch && asksTotal) return "SS";
  return symbolMatch && asksTotal ? symbolMatch[1].toUpperCase() : null;
}

function answerSymbolDividendTableQuestion(messages: PortfolioChatMessage[], snapshot: unknown): PortfolioChatResponse | null {
  const lastUserMessage = getRecentUserContent(messages);
  const lastLower = lastUserMessage.toLowerCase();
  const recentText = messages.slice(-6).map((message) => message.content).join("\n").toLowerCase();
  const mentionsSymbols = /\b(symbols?|tickers?)\b/.test(recentText);
  const asksForTable = /\b(table|list|show|include|included|all|continue)\b/.test(lastLower);
  const asksForDividendData = /\b(dividends?|income|yield|payout)\b/.test(recentText);

  if (!snapshot || typeof snapshot !== "object" || !mentionsSymbols || !asksForTable || !asksForDividendData) {
    return null;
  }

  const holdings = Array.isArray((snapshot as any).holdings) ? (snapshot as any).holdings : [];
  if (holdings.length === 0) return null;

  const grouped = new Map<string, {
    symbol: string;
    holdings: number;
    accounts: Set<string>;
    totalInvestment: number;
    includedTotal: number;
    annualIncome: number;
    includedIncome: number;
  }>();

  holdings.forEach((holding: any) => {
    const symbol = String(holding?.effectiveSymbol || holding?.symbol || "(blank)").trim() || "(blank)";
    const existing = grouped.get(symbol) || {
      symbol,
      holdings: 0,
      accounts: new Set<string>(),
      totalInvestment: 0,
      includedTotal: 0,
      annualIncome: 0,
      includedIncome: 0,
    };

    existing.holdings += 1;
    if (holding?.account) existing.accounts.add(String(holding.account));
    existing.totalInvestment += toSnapshotNumber(holding?.totalInvestment);
    existing.includedTotal += toSnapshotNumber(holding?.includedTotal);
    existing.annualIncome += toSnapshotNumber(holding?.yearlyIncome);
    existing.includedIncome += toSnapshotNumber(holding?.filteredIncome);
    grouped.set(symbol, existing);
  });

  const rows = [...grouped.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const totals = rows.reduce(
    (acc, row) => {
      acc.totalInvestment += row.totalInvestment;
      acc.includedTotal += row.includedTotal;
      acc.annualIncome += row.annualIncome;
      acc.includedIncome += row.includedIncome;
      return acc;
    },
    { totalInvestment: 0, includedTotal: 0, annualIncome: 0, includedIncome: 0 }
  );

  const tableLines = [
    "| Symbol | Holdings | Accounts | Total investment | Included total | Annual dividends/income | Included income | Yield |",
    "|---|---:|---|---:|---:|---:|---:|---:|",
    ...rows.map((row) => {
      const accounts = [...row.accounts].slice(0, 3).join(", ");
      const accountLabel = row.accounts.size > 3 ? `${accounts}, +${row.accounts.size - 3}` : accounts;
      const yieldValue = row.totalInvestment > 0 ? row.annualIncome / row.totalInvestment : 0;
      return `| ${escapeMarkdownCell(row.symbol)} | ${row.holdings} | ${escapeMarkdownCell(accountLabel || "-")} | ${formatSnapshotCurrency(row.totalInvestment)} | ${formatSnapshotCurrency(row.includedTotal)} | ${formatSnapshotCurrency(row.annualIncome)} | ${formatSnapshotCurrency(row.includedIncome)} | ${formatSnapshotPercent(yieldValue)} |`;
    }),
    `| Total | ${holdings.length} | - | ${formatSnapshotCurrency(totals.totalInvestment)} | ${formatSnapshotCurrency(totals.includedTotal)} | ${formatSnapshotCurrency(totals.annualIncome)} | ${formatSnapshotCurrency(totals.includedIncome)} | ${formatSnapshotPercent(totals.totalInvestment > 0 ? totals.annualIncome / totals.totalInvestment : 0)} |`,
  ];

  return {
    message: `Here is the symbol table using the app snapshot. I am treating yearly income as dividends/income because detailed ex-dividend and payout schedule fields are not included in the chat snapshot.\n\n${tableLines.join("\n")}`,
    actions: [],
    model: "local-portfolio-calculation",
  };
}

function answerSimplePortfolioQuestion(messages: PortfolioChatMessage[], snapshot: unknown): PortfolioChatResponse | null {
  const lastUserMessage = getRecentUserContent(messages);
  const symbol = getTickerTotalQuestion(lastUserMessage);
  if (!symbol || !snapshot || typeof snapshot !== "object") return null;

  const holdings = Array.isArray((snapshot as any).holdings) ? (snapshot as any).holdings : [];
  const selector = normalizePortfolioMatchValue(symbol);
  const matches = holdings.filter((holding: any) => holdingMatchesSelector(holding, selector));

  if (matches.length === 0) return null;

  const totalInvestment = matches.reduce((sum: number, holding: any) => sum + toSnapshotNumber(holding?.totalInvestment), 0);
  const includedTotal = matches.reduce((sum: number, holding: any) => sum + toSnapshotNumber(holding?.includedTotal), 0);
  const annualIncome = matches.reduce((sum: number, holding: any) => sum + toSnapshotNumber(holding?.yearlyIncome), 0);
  const includedAnnualIncome = matches.reduce((sum: number, holding: any) => {
    if (Object.prototype.hasOwnProperty.call(holding || {}, "filteredIncome")) {
      return sum + toSnapshotNumber(holding?.filteredIncome);
    }
    return sum + (holding?.includeIncome ? toSnapshotNumber(holding?.yearlyIncome) : 0);
  }, 0);
  const investmentPhrase = totalInvestment === 0 && annualIncome > 0
    ? "Total investment is $0 because these appear to be income-only rows."
    : `Total investment is ${formatSnapshotCurrency(totalInvestment)}. Included investment total is ${formatSnapshotCurrency(includedTotal)}.`;

  return {
    message: `${symbol} appears in ${matches.length} holding${matches.length === 1 ? "" : "s"}. ${investmentPhrase} Annual income is ${formatSnapshotCurrency(annualIncome)}. Included annual income is ${formatSnapshotCurrency(includedAnnualIncome)}. I highlighted the matching rows.`,
    actions: [{ type: "selectAsset", payload: { assetId: symbol }, requiresConfirmation: false }],
    model: "local-portfolio-calculation",
  };
}

function openRouterErrorMessage(statusCode: number, body: string) {
  let detail = body;
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.error?.message || parsed?.message || body;
  } catch {
    detail = body;
  }

  if (statusCode === 401 || statusCode === 403) return `OpenRouter authentication failed: ${detail}`;
  if (statusCode === 404 || statusCode === 422) return `OpenRouter model/request was invalid: ${detail}`;
  if (statusCode === 429) return `OpenRouter rate limit reached: ${detail}`;
  if (statusCode >= 500) return `OpenRouter service error: ${detail}`;
  return `OpenRouter request failed (${statusCode}): ${detail}`;
}

async function handlePortfolioChatRoute(
  event: APIGatewayProxyEvent,
  origin: string
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Portfolio chat route supports POST only." }, origin);
  }

  let body: { messages?: unknown; portfolioSnapshot?: unknown } | null = null;
  try {
    body = parseJsonBody<{ messages?: unknown; portfolioSnapshot?: unknown }>(event);
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body." }, origin);
  }

  if (!body || typeof body !== "object") {
    return jsonResponse(400, { error: "Missing portfolio chat request body." }, origin);
  }

  const messages = sanitizeChatMessages(body.messages);
  if (messages.length === 0) {
    return jsonResponse(400, { error: "Portfolio chat requires at least one user message." }, origin);
  }

  const directQuoteAnswer = await answerYahooFinanceQuoteQuestion(messages);
  if (directQuoteAnswer) {
    return jsonResponse(200, directQuoteAnswer, origin);
  }

  const portfolioPricesAnswer = await answerPortfolioTickerPricesQuestion(messages, body.portfolioSnapshot);
  if (portfolioPricesAnswer) {
    return jsonResponse(200, portfolioPricesAnswer, origin);
  }

  const localAnswer =
    answerSelectRowsQuestion(messages, body.portfolioSnapshot) ||
    answerSymbolDividendTableQuestion(messages, body.portfolioSnapshot) ||
    answerSimplePortfolioQuestion(messages, body.portfolioSnapshot);
  if (localAnswer) {
    return jsonResponse(200, localAnswer, origin);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { error: "Missing OPENROUTER_API_KEY on the backend." }, origin);
  }

  const lastUserMessage = getRecentUserContent(messages);
  const webSearchEnabled = parseBooleanEnv(process.env.ENABLE_ASSISTANT_WEB_SEARCH);
  const shouldAttachWebSearch = webSearchEnabled && questionLikelyNeedsWebSearch(lastUserMessage);
  const model = shouldAttachWebSearch
    ? process.env.OPENROUTER_WEB_SEARCH_MODEL || process.env.OPENROUTER_MODEL || "openrouter/free"
    : process.env.OPENROUTER_MODEL || "openrouter/free";
  const openRouterTimeoutMs = parsePositiveIntegerEnv(process.env.OPENROUTER_TIMEOUT_MS, shouldAttachWebSearch ? 22000 : 18000, 24000);
  const webSearchMaxResults = parsePositiveIntegerEnv(process.env.ASSISTANT_WEB_SEARCH_MAX_RESULTS, 3, 10);
  const webSearchContextSize = String(process.env.ASSISTANT_WEB_SEARCH_CONTEXT_SIZE || "low").toLowerCase();
  const webSearchParameters = {
    max_results: webSearchMaxResults,
    max_total_results: webSearchMaxResults,
    search_context_size: ["low", "medium", "high"].includes(webSearchContextSize) ? webSearchContextSize : "low",
  };
  const portfolioContext = JSON.stringify(
    shouldAttachWebSearch
      ? buildCompactExternalLookupContext(body.portfolioSnapshot, lastUserMessage)
      : body.portfolioSnapshot || {}
  );
  const requestPayload = {
    model,
    temperature: 0.2,
    max_tokens: 1600,
    messages: [
      { role: "system", content: PORTFOLIO_ASSISTANT_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Current portfolio state JSON. Treat this as the only source of truth and do not expose raw private data unless needed to answer the user's question:\n${portfolioContext}`,
      },
      ...messages,
    ],
    ...(shouldAttachWebSearch
      ? {
          tools: [
            {
              type: "openrouter:web_search",
              parameters: webSearchParameters,
            },
          ],
        }
      : {}),
  };

  let openRouterResult: { statusCode: number; body: string };
  try {
    openRouterResult = await postJsonToOpenRouter(requestPayload, apiKey, openRouterTimeoutMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenRouter network error.";
    if (message.toLowerCase().includes("timed out")) {
      return jsonResponse(200, {
        message: shouldAttachWebSearch
          ? "OpenRouter web search timed out before returning current market data. Try the same question again, or ask for a known source/site if you want me to narrow the lookup."
          : "OpenRouter timed out before returning an answer. Try again with a smaller question.",
        actions: [],
        model,
      }, origin);
    }
    return jsonResponse(502, { error: message }, origin);
  }

  if (openRouterResult.statusCode < 200 || openRouterResult.statusCode >= 300) {
    return jsonResponse(
      openRouterResult.statusCode === 429 ? 429 : 502,
      { error: openRouterErrorMessage(openRouterResult.statusCode, openRouterResult.body) },
      origin
    );
  }

  try {
    const parsed = JSON.parse(openRouterResult.body);
    const content = extractAssistantText(parsed);
    if (!content) {
      const finishReason = parsed?.choices?.[0]?.finish_reason;
      const fallbackMessage = finishReason === "length"
        ? "OpenRouter stopped before producing a complete answer. Try asking for fewer rows or fewer columns."
        : "OpenRouter returned an empty answer. Try rephrasing the question or asking for a smaller table.";
      return jsonResponse(200, {
        message: fallbackMessage,
        actions: [],
        model: String(parsed?.model || model),
        usage: parsed?.usage,
      }, origin);
    }

    const normalized = parseAssistantChatContent(content);
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
    const actions = normalizeAssistantActions(normalized.actions, lastUserMessage, content);
    const inferredBulkAction = actions.find((action) => action.type === "setAllCheckboxes");
    const message = normalized.actions.length === 0 && inferredBulkAction
      ? Boolean(inferredBulkAction.payload?.checked)
        ? "Selecting all Inc checkboxes."
        : "Clearing all Inc checkboxes."
      : normalized.message;
    const response: PortfolioChatResponse = {
      message,
      actions,
      model: String(parsed?.model || model),
      usage: parsed?.usage,
    };
    return jsonResponse(200, response, origin);
  } catch {
    return jsonResponse(502, { error: "OpenRouter returned invalid JSON." }, origin);
  }
}

async function handleWorkbookRoute(
  event: APIGatewayProxyEvent,
  origin: string
): Promise<APIGatewayProxyResult> {
  let store: WorkbookStore;
  try {
    store = new WorkbookStore();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workbook storage is unavailable.";
    return jsonResponse(500, { error: message }, origin);
  }

  const [, workspaceId = "default", tabName, action] = getProxySegments(event);

  try {
    if (event.httpMethod === "GET") {
      if (!workspaceId) {
        return jsonResponse(400, { error: "Missing workspaceId in workbook path." }, origin);
      }

      if (tabName) {
        const result = await store.getTab(workspaceId, tabName);
        return jsonResponse(200, result, origin);
      }

      const result = await store.getWorkspace(workspaceId);
      return jsonResponse(200, result, origin);
    }

    if (event.httpMethod === "PUT") {
      if (!workspaceId || !tabName) {
        return jsonResponse(400, { error: "PUT requires /hello/workbook/{workspaceId}/{tabName}." }, origin);
      }

      let body: { data?: unknown } | null = null;
      try {
        body = parseJsonBody<{ data?: unknown }>(event);
      } catch {
        return jsonResponse(400, { error: "Invalid JSON body." }, origin);
      }

      if (!body || !("data" in body)) {
        return jsonResponse(400, { error: "PUT body must include a data field." }, origin);
      }

      const result = await store.putTab(workspaceId, tabName, body.data);
      return jsonResponse(200, result, origin);
    }

    if (event.httpMethod === "POST") {
      if (!workspaceId || action !== "save") {
        return jsonResponse(400, { error: "POST requires /hello/workbook/{workspaceId}/save." }, origin);
      }

      let body: WorkbookPayload | null = null;
      try {
        body = parseJsonBody<WorkbookPayload>(event);
      } catch {
        return jsonResponse(400, { error: "Invalid JSON body." }, origin);
      }

      if (!body || (typeof body !== "object")) {
        return jsonResponse(400, { error: "Missing workbook payload." }, origin);
      }

      const result = await store.saveWorkspace(workspaceId, body);
      return jsonResponse(200, result, origin);
    }

    return jsonResponse(405, { error: "Workbook route supports GET, PUT, and POST." }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workbook storage error.";
    return jsonResponse(400, { error: message }, origin);
  }
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const origin = "*";

  if (event.httpMethod === "OPTIONS") {
    return corsPreflight(origin);
  }

  const segments = getProxySegments(event);
  if (segments[0] === "workbook") {
    return handleWorkbookRoute(event, origin);
  }

  if (segments[0] === "api" && segments[1] === "portfolio-chat") {
    return handlePortfolioChatRoute(event, origin);
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed. Use POST." }, origin);
  }

  const raw = decodeBody(event);
  if (!raw) {
    return jsonResponse(
      400,
      { error: 'Missing JSON body. Expected {"calc":"...", ...}.' },
      origin
    );
  }

  let body: RequestBody;
  try {
    body = JSON.parse(raw.trim());
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body." }, origin);
  }

  const calc = (body as any)?.calc;
  if (typeof calc !== "string") {
    return jsonResponse(400, { error: "Missing field: calc" }, origin);
  }

  if (calc === "PORTFOLIO_CHAT") {
    return handlePortfolioChatRoute(
      {
        ...event,
        body: JSON.stringify({
          messages: (body as any).messages,
          portfolioSnapshot: (body as any).portfolioSnapshot,
        }),
        isBase64Encoded: false,
      },
      origin
    );
  }

  if (calc === "WORKBOOK_GET" || calc === "WORKBOOK_GET_TAB" || calc === "WORKBOOK_SAVE" || calc === "WORKBOOK_SAVE_TAB") {
    let store: WorkbookStore;
    try {
      store = new WorkbookStore();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workbook storage is unavailable.";
      return jsonResponse(500, { error: message }, origin);
    }

    try {
      const workspaceId = String((body as any).workspaceId || "default");

      if (calc === "WORKBOOK_GET") {
        const result = await store.getWorkspace(workspaceId);
        return jsonResponse(200, result, origin);
      }

      if (calc === "WORKBOOK_GET_TAB") {
        const tabName = String((body as any).tabName || "");
        if (!tabName) {
          return jsonResponse(400, { error: "WORKBOOK_GET_TAB requires tabName" }, origin);
        }
        const result = await store.getTab(workspaceId, tabName);
        return jsonResponse(200, result, origin);
      }

      if (calc === "WORKBOOK_SAVE_TAB") {
        const tabName = String((body as any).tabName || "");
        if (!tabName) {
          return jsonResponse(400, { error: "WORKBOOK_SAVE_TAB requires tabName" }, origin);
        }
        const result = await store.putTab(workspaceId, tabName, (body as any).data);
        return jsonResponse(200, result, origin);
      }

      const result = await store.saveWorkspace(workspaceId, {
        tabs: (body as any).tabs,
        settings: (body as any).settings,
      });
      return jsonResponse(200, result, origin);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Workbook storage error.";
      return jsonResponse(400, { error: message }, origin);
    }
  }

  if (calc === "FED_TAX_2025_MFJ") {
    const taxableIncome = readNonNegativeNumber((body as any).taxableIncome, "taxableIncome");
    if ("error" in taxableIncome) {
      return jsonResponse(400, { error: taxableIncome.error }, origin);
    }

    const tax = fedTax2025Mfj(taxableIncome.value);
    return jsonResponse(200, { calc, taxableIncome: taxableIncome.value, tax }, origin);
  }

  if (calc === "FED_TAX_2025_ORDINARY") {
    const taxableIncome = readNonNegativeNumber((body as any).taxableIncome, "taxableIncome");
    if ("error" in taxableIncome) {
      return jsonResponse(400, { error: taxableIncome.error }, origin);
    }

    const filingStatus = String((body as any).filingStatus || "single").toLowerCase();
    if (!isFilingStatus(filingStatus)) {
      return jsonResponse(
        400,
        { error: "filingStatus must be one of: single, mfj, mfs, hoh" },
        origin
      );
    }

    if (!isOrdinary2025FilingStatus(filingStatus)) {
      return jsonResponse(
        400,
        { error: "FED_TAX_2025_ORDINARY currently supports filingStatus=single or mfj" },
        origin
      );
    }

    const tax = fedTax2025Ordinary(taxableIncome.value, filingStatus);
    return jsonResponse(200, { calc, taxableIncome: taxableIncome.value, filingStatus, tax }, origin);
  }

  if (calc === "CA_TAX_2025_MFJ" || calc === "STATE_TAX_2025_CA_MFJ") {
    const taxableIncome = readNonNegativeNumber((body as any).taxableIncome, "taxableIncome");
    if ("error" in taxableIncome) {
      return jsonResponse(400, { error: taxableIncome.error }, origin);
    }

    const tax = caTax2025Mfj(taxableIncome.value);
    return jsonResponse(200, { calc, taxableIncome: taxableIncome.value, tax }, origin);
  }

  if (calc === "FED_PREF_TAX_2024") {
    const ordinaryTaxable = readNonNegativeNumber((body as any).ordinaryTaxable, "ordinaryTaxable");
    if ("error" in ordinaryTaxable) {
      return jsonResponse(400, { error: ordinaryTaxable.error }, origin);
    }

    const prefTaxable = readNonNegativeNumber((body as any).prefTaxable, "prefTaxable");
    if ("error" in prefTaxable) {
      return jsonResponse(400, { error: prefTaxable.error }, origin);
    }

    const filingStatus = String((body as any).filingStatus || "single").toLowerCase();
    if (!isFilingStatus(filingStatus)) {
      return jsonResponse(
        400,
        { error: "filingStatus must be one of: single, mfj, mfs, hoh" },
        origin
      );
    }

    const tax = fedPrefTax2024(ordinaryTaxable.value, prefTaxable.value, filingStatus);
    return jsonResponse(
      200,
      {
        calc,
        ordinaryTaxable: ordinaryTaxable.value,
        prefTaxable: prefTaxable.value,
        filingStatus,
        tax,
      },
      origin
    );
  }

  if (calc === "FED_TAX_2025_COMBINED") {
    const ordinaryTaxable = readNonNegativeNumber((body as any).ordinaryTaxable, "ordinaryTaxable");
    if ("error" in ordinaryTaxable) {
      return jsonResponse(400, { error: ordinaryTaxable.error }, origin);
    }

    const prefTaxable = readNonNegativeNumber((body as any).prefTaxable, "prefTaxable");
    if ("error" in prefTaxable) {
      return jsonResponse(400, { error: prefTaxable.error }, origin);
    }

    const filingStatus = String((body as any).filingStatus || "mfj").toLowerCase();
    if (!isFilingStatus(filingStatus)) {
      return jsonResponse(
        400,
        { error: "filingStatus must be one of: single, mfj, mfs, hoh" },
        origin
      );
    }

    if (!isOrdinary2025FilingStatus(filingStatus)) {
      return jsonResponse(
        400,
        { error: "FED_TAX_2025_COMBINED currently supports filingStatus=single or mfj" },
        origin
      );
    }

    const magi = readNonNegativeNumber((body as any).magi, "magi");
    if ("error" in magi) {
      return jsonResponse(400, { error: magi.error }, origin);
    }

    const netInvestmentIncome = readNonNegativeNumber(
      (body as any).netInvestmentIncome,
      "netInvestmentIncome"
    );
    if ("error" in netInvestmentIncome) {
      return jsonResponse(400, { error: netInvestmentIncome.error }, origin);
    }

    const ordinaryTax = fedTax2025Ordinary(ordinaryTaxable.value, filingStatus);
    const prefTax = fedPrefTax2024(ordinaryTaxable.value, prefTaxable.value, filingStatus);
    const niit = niitTax(magi.value, netInvestmentIncome.value, filingStatus);
    const tax = ordinaryTax + prefTax + niit;

    return jsonResponse(
      200,
      {
        calc,
        ordinaryTaxable: ordinaryTaxable.value,
        prefTaxable: prefTaxable.value,
        filingStatus,
        magi: magi.value,
        netInvestmentIncome: netInvestmentIncome.value,
        niit,
        ordinaryTax,
        prefTax,
        tax,
      },
      origin
    );
  }

  return jsonResponse(
    400,
    {
      error: "Unknown calc.",
      allowed: [
        "FED_TAX_2025_MFJ",
        "FED_TAX_2025_ORDINARY",
        "FED_PREF_TAX_2024",
        "FED_TAX_2025_COMBINED",
        "CA_TAX_2025_MFJ",
        "STATE_TAX_2025_CA_MFJ",
        "PORTFOLIO_CHAT",
      ],
    },
    origin
  );
};



