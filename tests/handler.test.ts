import { describe, expect, test } from "vitest";
import { handler } from "../amplify/backend/function/helloWorld/index.js";

function post(body: unknown) {
  return handler({
    httpMethod: "POST",
    body: JSON.stringify(body),
    isBase64Encoded: false,
  } as any);
}

describe("Lambda handler", () => {
  test("FED_TAX_2025_COMBINED returns ordinary, pref, and niit totals", async () => {
    const response = await post({
      calc: "FED_TAX_2025_COMBINED",
      ordinaryTaxable: 150000,
      prefTaxable: 25000,
      filingStatus: "mfj",
      magi: 310000,
      netInvestmentIncome: 50000,
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.ordinaryTax).toBe(22828);
    expect(json.prefTax).toBe(3750);
    expect(json.niit).toBe(1900);
    expect(json.tax).toBe(28478);
  });

  test("FED_TAX_2025_COMBINED rejects non-mfj filing statuses", async () => {
    const response = await post({
      calc: "FED_TAX_2025_COMBINED",
      ordinaryTaxable: 100000,
      prefTaxable: 1000,
      filingStatus: "single",
      magi: 150000,
      netInvestmentIncome: 1000,
    });

    expect(response.statusCode).toBe(400);
    const json = JSON.parse(response.body);
    expect(json.error).toMatch(/mfj only/i);
  });
});
