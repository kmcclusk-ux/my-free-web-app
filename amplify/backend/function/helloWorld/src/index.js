"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
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
        ],
    }, origin);
};
exports.handler = handler;
