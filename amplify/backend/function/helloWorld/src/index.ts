import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

type InputBody = {
  value?: unknown;
};

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

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
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
    return jsonResponse(
      400,
      { error: 'Missing JSON body. Expected {"value": <number>}.' },
      origin
    );
  }

  // Decode body (API Gateway sometimes base64 encodes)
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  const trimmed = rawBody.trim();

  // Parse JSON
  let parsed: InputBody;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return jsonResponse(
      400,
      {
        error: "Invalid JSON body.",
        debug: {
          isBase64Encoded: !!event.isBase64Encoded,
          bodyFirst100: trimmed.slice(0, 100),
        },
      },
      origin
    );
  }

  // Extract value (accept number or numeric string)
  const v = parsed.value;
  const num =
    typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;

  if (!Number.isFinite(num)) {
    return jsonResponse(400, { error: "Field 'value' must be a number." }, origin);
  }

  const output = num * 15;

  return jsonResponse(200, { input: num, output }, origin);
};
