"use strict";

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { fedTax2025Mfj, fedPrefTax2024 } from "./taxCalcs";

function response(
  statusCode: number,
  body: unknown,
  origin: string = "*"
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

function decodeBody(event: APIGatewayProxyEvent): string | null {
  if (!event.body) return null;
  return event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
}

type CalcName = "FED_TAX_2025_MFJ" | "FED_PREF_TAX_2024";
type FilingStatus = "single" | "mfj" | "mfs" | "hoh";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const origin = "*";

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

  if (event.httpMethod !== "POST") {
    return response(405, { error: "Method not allowed. Use POST." }, origin);
  }

  const raw = decodeBody(event);
  if (!raw) {
    return response(
      400,
      { error: 'Missing JSON body. Expected {"calc":"...", ...}.' },
      origin
    );
  }

  let body: any;
  try {
    body = JSON.parse(raw.trim());
  } catch {
    return response(400, { error: "Invalid JSON body." }, origin);
  }

  const calc = body?.calc as CalcName | undefined;
  if (typeof calc !== "string") {
    return response(400, { error: "Missing field: calc" }, origin);
  }

  if (calc === "FED_TAX_2025_MFJ") {
    const ti = Number(body.taxableIncome);
    if (!Number.isFinite(ti) || ti < 0) {
      return response(
        400,
        { error: "taxableIncome must be a number >= 0" },
        origin
      );
    }
    const tax = fedTax2025Mfj(ti);
    return response(200, { calc, taxableIncome: ti, tax }, origin);
  }

  if (calc === "FED_PREF_TAX_2024") {
    const ord = Number(body.ordinaryTaxable) || 0;
    const pref = Number(body.prefTaxable) || 0;
    const fs = String(body.filingStatus || "single").toLowerCase() as FilingStatus;

    if (!["single", "mfj", "mfs", "hoh"].includes(fs)) {
      return response(
        400,
        { error: "filingStatus must be one of: single, mfj, mfs, hoh" },
        origin
      );
    }
    if (!Number.isFinite(ord) || ord < 0) {
      return response(
        400,
        { error: "ordinaryTaxable must be a number >= 0" },
        origin
      );
    }
    if (!Number.isFinite(pref) || pref < 0) {
      return response(
        400,
        { error: "prefTaxable must be a number >= 0" },
        origin
      );
    }

    const tax = fedPrefTax2024(ord, pref, fs);
    return response(
      200,
      { calc, ordinaryTaxable: ord, prefTaxable: pref, filingStatus: fs, tax },
      origin
    );
  }

  return response(
    400,
    { error: "Unknown calc.", allowed: ["FED_TAX_2025_MFJ", "FED_PREF_TAX_2024"] },
    origin
  );
};