import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  fedTax2025Mfj,
  fedTax2025Ordinary,
  fedPrefTax2024,
  caTax2025Mfj,
  niitTax,
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
  | { calc: "STATE_TAX_2025_CA_MFJ"; taxableIncome: number };

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

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const origin = "*";

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
      ],
    },
    origin
  );
};
