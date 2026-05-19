"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const https_1 = require("https");
const taxCalcs_1 = require("./taxCalcs");
const workbookStore_1 = require("./workbookStore");
function jsonResponse(statusCode, body, origin = "*") {
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
function corsPreflight(origin = "*") {
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
function decodeBody(event) {
    if (!event.body)
        return null;
    return event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body;
}
const PORTFOLIO_ASSISTANT_SYSTEM_PROMPT = `You are a portfolio assistant embedded in this investment portfolio app.
Use only the provided portfolio state and calculations. If data is missing, say what is missing.
Do not invent balances, prices, returns, allocations, gains, losses, or tax figures.
Explain financial information neutrally. Do not provide personalized investment, tax, legal, trading, transfer, or irreversible-action advice.
You may help analyze diversification, concentration, allocation, fees, income, and performance using supplied data.
When the user asks you to change the UI, return JSON only in this shape:
{"message":"short explanation","actions":[{"type":"setFilter","payload":{"filterName":"account","value":"taxable"}}]}.
Allowed action types are setCheckbox, setAllCheckboxes, selectAsset, selectAccount, setFilter, clearFilters, sortTable, and setView.
For "clear all Inc checkboxes", return {"message":"Clearing all Inc checkboxes.","actions":[{"type":"setAllCheckboxes","payload":{"field":"includeIncome","checked":false},"requiresConfirmation":true}]}.
For "select all Inc checkboxes", return {"message":"Selecting all Inc checkboxes.","actions":[{"type":"setAllCheckboxes","payload":{"field":"includeIncome","checked":true},"requiresConfirmation":true}]}.
Do not use setFilter for Inc. Inc is a checkbox field, not a filter.
For single-row checkbox requests, return only setCheckbox actions unless the user explicitly asks to filter, sort, select, or switch views.
For actions that hide or change the visible rows, set requiresConfirmation to true.
Do not request placing trades, transferring money, deleting data, or irreversible changes.`;
function isFilingStatus(x) {
    return x === "single" || x === "mfj" || x === "mfs" || x === "hoh";
}
function isOrdinary2025FilingStatus(x) {
    return x === "single" || x === "mfj";
}
function readNonNegativeNumber(value, fieldName) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
        return { error: `${fieldName} must be a number >= 0` };
    }
    return { value: num };
}
function getProxySegments(event) {
    const pathParameters = (event.pathParameters ?? {});
    const directProxy = pathParameters.proxy || pathParameters["proxy+"];
    if (directProxy) {
        return directProxy.split("/").filter(Boolean);
    }
    const candidates = [
        event.path,
        event.resource,
        event.requestContext?.path,
        event.requestContext?.resourcePath,
    ].filter((value) => typeof value === "string" && value.length > 0);
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
function parseJsonBody(event) {
    const raw = decodeBody(event);
    if (!raw)
        return null;
    return JSON.parse(raw.trim());
}
function postJsonToOpenRouter(payload, apiKey) {
    const body = JSON.stringify(payload);
    return new Promise((resolve, reject) => {
        const req = (0, https_1.request)("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
                "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://portfolio-workbook.local",
                "X-Title": "Portfolio Workbook Assistant",
            },
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            res.on("end", () => {
                resolve({
                    statusCode: res.statusCode || 0,
                    body: Buffer.concat(chunks).toString("utf8"),
                });
            });
        });
        req.on("error", reject);
        req.setTimeout(30000, () => {
            req.destroy(new Error("OpenRouter request timed out."));
        });
        req.write(body);
        req.end();
    });
}
function sanitizeChatMessages(messages) {
    if (!Array.isArray(messages))
        return [];
    return messages
        .filter((message) => {
        if (!message || typeof message !== "object")
            return false;
        const role = message.role;
        const content = message.content;
        return (role === "user" || role === "assistant") && typeof content === "string" && content.trim().length > 0;
    })
        .slice(-16)
        .map((message) => ({
        role: message.role,
        content: message.content.slice(0, 4000),
    }));
}
function parseAssistantChatContent(content) {
    const trimmed = content.trim();
    const jsonCandidate = trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    try {
        const parsed = JSON.parse(jsonCandidate);
        const message = typeof parsed?.message === "string" ? parsed.message : trimmed;
        const actions = Array.isArray(parsed?.actions)
            ? parsed.actions
                .filter((action) => !!action && typeof action === "object" && typeof action.type === "string")
                .map((action) => ({
                type: action.type,
                payload: action.payload && typeof action.payload === "object" ? action.payload : {},
                requiresConfirmation: Boolean(action.requiresConfirmation),
            }))
            : [];
        return { message, actions };
    }
    catch {
        return { message: trimmed, actions: [] };
    }
}
function inferBulkIncCheckboxAction(userContent, assistantContent) {
    const text = `${userContent}\n${assistantContent}`.toLowerCase();
    const mentionsIncCheckboxes = /\binc\b/.test(text) &&
        (text.includes("checkbox") ||
            text.includes("check box") ||
            text.includes("checked") ||
            text.includes("unchecked") ||
            text.includes("clear") ||
            text.includes("uncheck") ||
            text.includes("deselect") ||
            text.includes("select all"));
    const mentionsBulk = text.includes("all") || text.includes("every");
    if (!mentionsIncCheckboxes || !mentionsBulk)
        return null;
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
function normalizeAssistantActions(actions, userContent, assistantContent) {
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
function openRouterErrorMessage(statusCode, body) {
    let detail = body;
    try {
        const parsed = JSON.parse(body);
        detail = parsed?.error?.message || parsed?.message || body;
    }
    catch {
        detail = body;
    }
    if (statusCode === 401 || statusCode === 403)
        return `OpenRouter authentication failed: ${detail}`;
    if (statusCode === 404 || statusCode === 422)
        return `OpenRouter model/request was invalid: ${detail}`;
    if (statusCode === 429)
        return `OpenRouter rate limit reached: ${detail}`;
    if (statusCode >= 500)
        return `OpenRouter service error: ${detail}`;
    return `OpenRouter request failed (${statusCode}): ${detail}`;
}
async function handlePortfolioChatRoute(event, origin) {
    if (event.httpMethod !== "POST") {
        return jsonResponse(405, { error: "Portfolio chat route supports POST only." }, origin);
    }
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return jsonResponse(500, { error: "Missing OPENROUTER_API_KEY on the backend." }, origin);
    }
    let body = null;
    try {
        body = parseJsonBody(event);
    }
    catch {
        return jsonResponse(400, { error: "Invalid JSON body." }, origin);
    }
    if (!body || typeof body !== "object") {
        return jsonResponse(400, { error: "Missing portfolio chat request body." }, origin);
    }
    const messages = sanitizeChatMessages(body.messages);
    if (messages.length === 0) {
        return jsonResponse(400, { error: "Portfolio chat requires at least one user message." }, origin);
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
    let openRouterResult;
    try {
        openRouterResult = await postJsonToOpenRouter(requestPayload, apiKey);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "OpenRouter network error.";
        return jsonResponse(502, { error: message }, origin);
    }
    if (openRouterResult.statusCode < 200 || openRouterResult.statusCode >= 300) {
        return jsonResponse(openRouterResult.statusCode === 429 ? 429 : 502, { error: openRouterErrorMessage(openRouterResult.statusCode, openRouterResult.body) }, origin);
    }
    try {
        const parsed = JSON.parse(openRouterResult.body);
        const content = parsed?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) {
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
        const response = {
            message,
            actions,
            model: String(parsed?.model || model),
            usage: parsed?.usage,
        };
        return jsonResponse(200, response, origin);
    }
    catch {
        return jsonResponse(502, { error: "OpenRouter returned invalid JSON." }, origin);
    }
}
async function handleWorkbookRoute(event, origin) {
    let store;
    try {
        store = new workbookStore_1.WorkbookStore();
    }
    catch (error) {
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
            let body = null;
            try {
                body = parseJsonBody(event);
            }
            catch {
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
            let body = null;
            try {
                body = parseJsonBody(event);
            }
            catch {
                return jsonResponse(400, { error: "Invalid JSON body." }, origin);
            }
            if (!body || (typeof body !== "object")) {
                return jsonResponse(400, { error: "Missing workbook payload." }, origin);
            }
            const result = await store.saveWorkspace(workspaceId, body);
            return jsonResponse(200, result, origin);
        }
        return jsonResponse(405, { error: "Workbook route supports GET, PUT, and POST." }, origin);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Workbook storage error.";
        return jsonResponse(400, { error: message }, origin);
    }
}
const handler = async (event) => {
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
        return jsonResponse(400, { error: 'Missing JSON body. Expected {"calc":"...", ...}.' }, origin);
    }
    let body;
    try {
        body = JSON.parse(raw.trim());
    }
    catch {
        return jsonResponse(400, { error: "Invalid JSON body." }, origin);
    }
    const calc = body?.calc;
    if (typeof calc !== "string") {
        return jsonResponse(400, { error: "Missing field: calc" }, origin);
    }
    if (calc === "PORTFOLIO_CHAT") {
        return handlePortfolioChatRoute({
            ...event,
            body: JSON.stringify({
                messages: body.messages,
                portfolioSnapshot: body.portfolioSnapshot,
            }),
            isBase64Encoded: false,
        }, origin);
    }
    if (calc === "WORKBOOK_GET" || calc === "WORKBOOK_GET_TAB" || calc === "WORKBOOK_SAVE" || calc === "WORKBOOK_SAVE_TAB") {
        let store;
        try {
            store = new workbookStore_1.WorkbookStore();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Workbook storage is unavailable.";
            return jsonResponse(500, { error: message }, origin);
        }
        try {
            const workspaceId = String(body.workspaceId || "default");
            if (calc === "WORKBOOK_GET") {
                const result = await store.getWorkspace(workspaceId);
                return jsonResponse(200, result, origin);
            }
            if (calc === "WORKBOOK_GET_TAB") {
                const tabName = String(body.tabName || "");
                if (!tabName) {
                    return jsonResponse(400, { error: "WORKBOOK_GET_TAB requires tabName" }, origin);
                }
                const result = await store.getTab(workspaceId, tabName);
                return jsonResponse(200, result, origin);
            }
            if (calc === "WORKBOOK_SAVE_TAB") {
                const tabName = String(body.tabName || "");
                if (!tabName) {
                    return jsonResponse(400, { error: "WORKBOOK_SAVE_TAB requires tabName" }, origin);
                }
                const result = await store.putTab(workspaceId, tabName, body.data);
                return jsonResponse(200, result, origin);
            }
            const result = await store.saveWorkspace(workspaceId, {
                tabs: body.tabs,
                settings: body.settings,
            });
            return jsonResponse(200, result, origin);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Workbook storage error.";
            return jsonResponse(400, { error: message }, origin);
        }
    }
    if (calc === "FED_TAX_2025_MFJ") {
        const taxableIncome = readNonNegativeNumber(body.taxableIncome, "taxableIncome");
        if ("error" in taxableIncome) {
            return jsonResponse(400, { error: taxableIncome.error }, origin);
        }
        const tax = (0, taxCalcs_1.fedTax2025Mfj)(taxableIncome.value);
        return jsonResponse(200, { calc, taxableIncome: taxableIncome.value, tax }, origin);
    }
    if (calc === "FED_TAX_2025_ORDINARY") {
        const taxableIncome = readNonNegativeNumber(body.taxableIncome, "taxableIncome");
        if ("error" in taxableIncome) {
            return jsonResponse(400, { error: taxableIncome.error }, origin);
        }
        const filingStatus = String(body.filingStatus || "single").toLowerCase();
        if (!isFilingStatus(filingStatus)) {
            return jsonResponse(400, { error: "filingStatus must be one of: single, mfj, mfs, hoh" }, origin);
        }
        if (!isOrdinary2025FilingStatus(filingStatus)) {
            return jsonResponse(400, { error: "FED_TAX_2025_ORDINARY currently supports filingStatus=single or mfj" }, origin);
        }
        const tax = (0, taxCalcs_1.fedTax2025Ordinary)(taxableIncome.value, filingStatus);
        return jsonResponse(200, { calc, taxableIncome: taxableIncome.value, filingStatus, tax }, origin);
    }
    if (calc === "CA_TAX_2025_MFJ" || calc === "STATE_TAX_2025_CA_MFJ") {
        const taxableIncome = readNonNegativeNumber(body.taxableIncome, "taxableIncome");
        if ("error" in taxableIncome) {
            return jsonResponse(400, { error: taxableIncome.error }, origin);
        }
        const tax = (0, taxCalcs_1.caTax2025Mfj)(taxableIncome.value);
        return jsonResponse(200, { calc, taxableIncome: taxableIncome.value, tax }, origin);
    }
    if (calc === "FED_PREF_TAX_2024") {
        const ordinaryTaxable = readNonNegativeNumber(body.ordinaryTaxable, "ordinaryTaxable");
        if ("error" in ordinaryTaxable) {
            return jsonResponse(400, { error: ordinaryTaxable.error }, origin);
        }
        const prefTaxable = readNonNegativeNumber(body.prefTaxable, "prefTaxable");
        if ("error" in prefTaxable) {
            return jsonResponse(400, { error: prefTaxable.error }, origin);
        }
        const filingStatus = String(body.filingStatus || "single").toLowerCase();
        if (!isFilingStatus(filingStatus)) {
            return jsonResponse(400, { error: "filingStatus must be one of: single, mfj, mfs, hoh" }, origin);
        }
        const tax = (0, taxCalcs_1.fedPrefTax2024)(ordinaryTaxable.value, prefTaxable.value, filingStatus);
        return jsonResponse(200, {
            calc,
            ordinaryTaxable: ordinaryTaxable.value,
            prefTaxable: prefTaxable.value,
            filingStatus,
            tax,
        }, origin);
    }
    if (calc === "FED_TAX_2025_COMBINED") {
        const ordinaryTaxable = readNonNegativeNumber(body.ordinaryTaxable, "ordinaryTaxable");
        if ("error" in ordinaryTaxable) {
            return jsonResponse(400, { error: ordinaryTaxable.error }, origin);
        }
        const prefTaxable = readNonNegativeNumber(body.prefTaxable, "prefTaxable");
        if ("error" in prefTaxable) {
            return jsonResponse(400, { error: prefTaxable.error }, origin);
        }
        const filingStatus = String(body.filingStatus || "mfj").toLowerCase();
        if (!isFilingStatus(filingStatus)) {
            return jsonResponse(400, { error: "filingStatus must be one of: single, mfj, mfs, hoh" }, origin);
        }
        if (!isOrdinary2025FilingStatus(filingStatus)) {
            return jsonResponse(400, { error: "FED_TAX_2025_COMBINED currently supports filingStatus=single or mfj" }, origin);
        }
        const magi = readNonNegativeNumber(body.magi, "magi");
        if ("error" in magi) {
            return jsonResponse(400, { error: magi.error }, origin);
        }
        const netInvestmentIncome = readNonNegativeNumber(body.netInvestmentIncome, "netInvestmentIncome");
        if ("error" in netInvestmentIncome) {
            return jsonResponse(400, { error: netInvestmentIncome.error }, origin);
        }
        const ordinaryTax = (0, taxCalcs_1.fedTax2025Ordinary)(ordinaryTaxable.value, filingStatus);
        const prefTax = (0, taxCalcs_1.fedPrefTax2024)(ordinaryTaxable.value, prefTaxable.value, filingStatus);
        const niit = (0, taxCalcs_1.niitTax)(magi.value, netInvestmentIncome.value, filingStatus);
        const tax = ordinaryTax + prefTax + niit;
        return jsonResponse(200, {
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
        }, origin);
    }
    return jsonResponse(400, {
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
    }, origin);
};
exports.handler = handler;
