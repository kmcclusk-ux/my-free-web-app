"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const taxCalcs_1 = require("./taxCalcs");
function jsonResponse(statusCode, body, origin = "*") {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
function readNonNegativeNumber(value, fieldName) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
        return { error: `${fieldName} must be a number >= 0` };
    }
    return { value: num };
}
const handler = async (event) => {
    const origin = "*";
    if (event.httpMethod === "OPTIONS") {
        return corsPreflight(origin);
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
    if (calc === "FED_TAX_2025_MFJ") {
        const taxableIncome = readNonNegativeNumber(body.taxableIncome, "taxableIncome");
        if ("error" in taxableIncome) {
            return jsonResponse(400, { error: taxableIncome.error }, origin);
        }
        const tax = (0, taxCalcs_1.fedTax2025Mfj)(taxableIncome.value);
        return jsonResponse(200, { calc, taxableIncome: taxableIncome.value, tax }, origin);
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
        if (filingStatus !== "mfj") {
            return jsonResponse(400, { error: "FED_TAX_2025_COMBINED currently supports filingStatus=mfj only" }, origin);
        }
        const magi = readNonNegativeNumber(body.magi, "magi");
        if ("error" in magi) {
            return jsonResponse(400, { error: magi.error }, origin);
        }
        const netInvestmentIncome = readNonNegativeNumber(body.netInvestmentIncome, "netInvestmentIncome");
        if ("error" in netInvestmentIncome) {
            return jsonResponse(400, { error: netInvestmentIncome.error }, origin);
        }
        const ordinaryTax = (0, taxCalcs_1.fedTax2025Mfj)(ordinaryTaxable.value);
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
            "FED_PREF_TAX_2024",
            "FED_TAX_2025_COMBINED",
            "CA_TAX_2025_MFJ",
            "STATE_TAX_2025_CA_MFJ",
        ],
    }, origin);
};
exports.handler = handler;
