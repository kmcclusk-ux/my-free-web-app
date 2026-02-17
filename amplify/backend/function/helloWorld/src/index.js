"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
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
const handler = async (event) => {
    const origin = "*"; // tighten later for prod domains
    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
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
    // Enforce POST for this endpoint
    if (event.httpMethod !== "POST") {
        return jsonResponse(405, { error: "Method not allowed. Use POST." }, origin);
    }
    if (!event.body) {
        return jsonResponse(400, { error: 'Missing JSON body. Expected {"value": <number>}.' }, origin);
    }
    // Decode body (API Gateway sometimes base64 encodes)
    const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body;
    const trimmed = rawBody.trim();
    // Parse JSON
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    }
    catch {
        return jsonResponse(400, {
            error: "Invalid JSON body.",
            debug: {
                isBase64Encoded: !!event.isBase64Encoded,
                bodyFirst100: trimmed.slice(0, 100),
            },
        }, origin);
    }
    // Extract value (accept number or numeric string)
    const v = parsed.value;
    const num = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(num)) {
        return jsonResponse(400, { error: "Field 'value' must be a number." }, origin);
    }
    const output = num * 2500;
    return jsonResponse(200, { input: num, output }, origin);
};
exports.handler = handler;
