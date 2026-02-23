import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  fedTax2025Mfj,
  fedPrefTax2024,
  caTax2025Mfj,
  type FilingStatus,
} from "./taxCalcs";

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
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
      calc: "FED_PREF_TAX_2024";
      ordinaryTaxable: number;
      prefTaxable: number;
      filingStatus: FilingStatus;
    }
  // keep old name (backwards compatible)
  | { calc: "CA_TAX_2025_MFJ"; taxableIncome: number }
  // new name (what you were calling from PowerShell)
  | { calc: "STATE_TAX_2025_CA_MFJ"; taxableIncome: number };

function isFilingStatus(x: string): x is FilingStatus {
  return x === "single" || x === "mfj" || x === "mfs" || x === "hoh";
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const origin = "*";

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return corsPreflight(origin);
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

  // --- FED ordinary ---
  if (calc === "FED_TAX_2025_MFJ") {
    const ti = Number((body as any).taxableIncome);
    if (!Number.isFinite(ti) || ti < 0) {
      return jsonResponse(
        400,
        { error: "taxableIncome must be a number >= 0" },
        origin
      );
    }
    const tax = fedTax2025Mfj(ti);
    return jsonResponse(200, { calc, taxableIncome: ti, tax }, origin);
  }

  // --- CA MFJ (accept BOTH calc names) ---
  if (calc === "CA_TAX_2025_MFJ" || calc === "STATE_TAX_2025_CA_MFJ") {
    const ti = Number((body as any).taxableIncome);
    if (!Number.isFinite(ti) || ti < 0) {
      return jsonResponse(
        400,
        { error: "taxableIncome must be a number >= 0" },
        origin
      );
    }
    const tax = caTax2025Mfj(ti);
    return jsonResponse(200, { calc, taxableIncome: ti, tax }, origin);
  }

  // --- FED preferential ---
  if (calc === "FED_PREF_TAX_2024") {
    const ord = Number((body as any).ordinaryTaxable) || 0;
    const pref = Number((body as any).prefTaxable) || 0;
    const fsRaw = String((body as any).filingStatus || "single").toLowerCase();

    if (!isFilingStatus(fsRaw)) {
      return jsonResponse(
        400,
        { error: "filingStatus must be one of: single, mfj, mfs, hoh" },
        origin
      );
    }
    if (!Number.isFinite(ord) || ord < 0) {
      return jsonResponse(
        400,
        { error: "ordinaryTaxable must be a number >= 0" },
        origin
      );
    }
    if (!Number.isFinite(pref) || pref < 0) {
      return jsonResponse(
        400,
        { error: "prefTaxable must be a number >= 0" },
        origin
      );
    }

    const tax = fedPrefTax2024(ord, pref, fsRaw);
    return jsonResponse(
      200,
      {
        calc,
        ordinaryTaxable: ord,
        prefTaxable: pref,
        filingStatus: fsRaw,
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
        "FED_PREF_TAX_2024",
        "CA_TAX_2025_MFJ",
        "STATE_TAX_2025_CA_MFJ",
      ],
    },
    origin
  );
};