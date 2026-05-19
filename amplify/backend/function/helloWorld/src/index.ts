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
Use only the provided portfolio state and calculations. If data is missing, say what is missing.
Do not invent balances, prices, returns, allocations, gains, losses, or tax figures.
Explain financial information neutrally. Do not provide personalized investment, tax, legal, trading, transfer, or irreversible-action advice.
You may help analyze diversification, concentration, allocation, fees, income, and performance using supplied data.
When the user asks you to change the UI, return JSON only in this shape:
{"message":"short explanation","actions":[{"type":"setFilter","payload":{"filterName":"account","value":"taxable"}}]}.
Allowed action types are setCheckbox, setAllCheckboxes, selectAsset, selectAssets, selectAccount, setFilter, clearFilters, sortTable, and setView.
To highlight rows for a ticker symbol, use {"message":"Highlighting matching rows.","actions":[{"type":"selectAsset","payload":{"assetId":"BSJQ"}}]}. The app will highlight all matching rows for that ticker.
For "clear all Inc checkboxes", return {"message":"Clearing all Inc checkboxes.","actions":[{"type":"setAllCheckboxes","payload":{"field":"includeIncome","checked":false},"requiresConfirmation":true}]}.
For "select all Inc checkboxes", return {"message":"Selecting all Inc checkboxes.","actions":[{"type":"setAllCheckboxes","payload":{"field":"includeIncome","checked":true},"requiresConfirmation":true}]}.
Do not use setFilter for Inc. Inc is a checkbox field, not a filter.
For single-row checkbox requests, return only setCheckbox actions unless the user explicitly asks to filter, sort, select, or switch views.
For actions that hide or change the visible rows, set requiresConfirmation to true.
Do not request placing trades, transferring money, deleting data, or irreversible changes.`;

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
  apiKey: string
): Promise<{ statusCode: number; body: string }> {
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = httpsRequest(
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
          resolve({
            statusCode: res.statusCode || 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error("OpenRouter request timed out."));
    });
    req.write(body);
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
  const content = parsed?.choices?.[0]?.message?.content;
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

  const fallback =
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

function getTickerTotalQuestion(matchesText: string) {
  const symbolMatch = matchesText.match(/\b([A-Z]{2,6}[A-Z0-9.-]*)\b/);
  const asksTotal = /\b(total|sum|amount|value)\b/i.test(matchesText);
  return symbolMatch && asksTotal ? symbolMatch[1].toUpperCase() : null;
}

function answerSimplePortfolioQuestion(messages: PortfolioChatMessage[], snapshot: unknown): PortfolioChatResponse | null {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const symbol = getTickerTotalQuestion(lastUserMessage);
  if (!symbol || !snapshot || typeof snapshot !== "object") return null;

  const holdings = Array.isArray((snapshot as any).holdings) ? (snapshot as any).holdings : [];
  const matches = holdings.filter((holding: any) => {
    const symbols = [holding?.symbol, holding?.effectiveSymbol].map((value) => String(value || "").toUpperCase());
    return symbols.includes(symbol);
  });

  if (matches.length === 0) return null;

  const totalInvestment = matches.reduce((sum: number, holding: any) => sum + toSnapshotNumber(holding?.totalInvestment), 0);
  const includedTotal = matches.reduce((sum: number, holding: any) => sum + toSnapshotNumber(holding?.includedTotal), 0);
  const annualIncome = matches.reduce((sum: number, holding: any) => sum + toSnapshotNumber(holding?.yearlyIncome), 0);

  return {
    message: `${symbol} appears in ${matches.length} holding${matches.length === 1 ? "" : "s"}. Total investment is $${totalInvestment.toLocaleString("en-US", { maximumFractionDigits: 2 })}. Included total is $${includedTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}. Annual income is $${annualIncome.toLocaleString("en-US", { maximumFractionDigits: 2 })}. I highlighted the matching rows.`,
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

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { error: "Missing OPENROUTER_API_KEY on the backend." }, origin);
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

  const localAnswer = answerSimplePortfolioQuestion(messages, body.portfolioSnapshot);
  if (localAnswer) {
    return jsonResponse(200, localAnswer, origin);
  }

  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  const portfolioContext = JSON.stringify(body.portfolioSnapshot || {});
  const requestPayload = {
    model,
    temperature: 0.2,
    max_tokens: 900,
    messages: [
      { role: "system", content: PORTFOLIO_ASSISTANT_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Current portfolio state JSON. Treat this as the only source of truth and do not expose raw private data unless needed to answer the user's question:\n${portfolioContext}`,
      },
      ...messages,
    ],
  };

  let openRouterResult: { statusCode: number; body: string };
  try {
    openRouterResult = await postJsonToOpenRouter(requestPayload, apiKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenRouter network error.";
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
      return jsonResponse(502, { error: "OpenRouter returned malformed model output." }, origin);
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



