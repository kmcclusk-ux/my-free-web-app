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
  test("FED_TAX_2025_COMBINED returns ordinary, pref, and niit totals for mfj", async () => {
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

  test("FED_TAX_2025_COMBINED taxes high ordinary income through all reached brackets", async () => {
    const response = await post({
      calc: "FED_TAX_2025_COMBINED",
      ordinaryTaxable: 453000,
      prefTaxable: 0,
      filingStatus: "mfj",
      magi: 453000,
      netInvestmentIncome: 0,
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.ordinaryTax).toBe(99086);
    expect(json.prefTax).toBe(0);
    expect(json.niit).toBe(0);
    expect(json.tax).toBe(99086);
  });

  test("FED_TAX_2025_COMBINED derives taxable income from 455k of gross ordinary income", async () => {
    const response = await post({
      calc: "FED_TAX_2025_COMBINED",
      ordinaryIncome: 455000,
      preferredIncome: 0,
      deduction: 31500,
      filingStatus: "mfj",
      magi: 455000,
      netInvestmentIncome: 0,
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.taxableIncome).toBe(423500);
    expect(json.ordinaryTaxable).toBe(423500);
    expect(json.prefTaxable).toBe(0);
    expect(json.ordinaryTax).toBe(89646);
    expect(json.tax).toBe(89646);
  });

  test("FED_TAX_2025_COMBINED taxes 455k of preferential investment income", async () => {
    const response = await post({
      calc: "FED_TAX_2025_COMBINED",
      ordinaryIncome: 0,
      preferredIncome: 455000,
      deduction: 31500,
      filingStatus: "mfj",
      magi: 455000,
      netInvestmentIncome: 455000,
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.taxableIncome).toBe(423500);
    expect(json.ordinaryTaxable).toBe(0);
    expect(json.prefTaxable).toBe(423500);
    expect(json.prefTax).toBe(49020);
    expect(json.niit).toBe(7790);
    expect(json.tax).toBe(56810);
  });

  test("FED_TAX_2025_COMBINED selects the official standard deduction by filing status", async () => {
    const response = await post({
      calc: "FED_TAX_2025_COMBINED",
      ordinaryIncome: 455000,
      preferredIncome: 0,
      deductionMode: "standard",
      aboveLineDeduction: 0,
      itemizedDeduction: 999999,
      filingStatus: "single",
      magi: 455000,
      netInvestmentIncome: 0,
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.deduction).toBe(15750);
    expect(json.taxableIncome).toBe(439250);
    expect(json.ordinaryTax).toBe(123284.75);
  });

  test("FED_TAX_2025_COMBINED returns ordinary, pref, and niit totals for single", async () => {
    const response = await post({
      calc: "FED_TAX_2025_COMBINED",
      ordinaryTaxable: 150000,
      prefTaxable: 25000,
      filingStatus: "single",
      magi: 260000,
      netInvestmentIncome: 50000,
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.ordinaryTax).toBe(28847);
    expect(json.prefTax).toBe(3750);
    expect(json.niit).toBe(1900);
    expect(json.tax).toBe(34497);
  });

  test("FED_TAX_2025_ORDINARY supports all filing statuses", async () => {
    const response = await post({
      calc: "FED_TAX_2025_ORDINARY",
      taxableIncome: 150000,
      filingStatus: "single",
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.tax).toBe(28847);
    expect(json.filingStatus).toBe("single");

    const mfsResponse = await post({
      calc: "FED_TAX_2025_ORDINARY",
      taxableIncome: 450000,
      filingStatus: "mfs",
    });
    const mfsJson = JSON.parse(mfsResponse.body);
    expect(mfsResponse.statusCode).toBe(200);
    expect(mfsJson.tax).toBe(128531.25);

    const hohResponse = await post({
      calc: "FED_TAX_2025_ORDINARY",
      taxableIncome: 150000,
      filingStatus: "hoh",
    });
    const hohJson = JSON.parse(hohResponse.body);
    expect(hohResponse.statusCode).toBe(200);
    expect(hohJson.tax).toBe(27108);
  });

  test("FED_TAX_2025_COMBINED supports head of household", async () => {
    const response = await post({
      calc: "FED_TAX_2025_COMBINED",
      ordinaryTaxable: 150000,
      prefTaxable: 0,
      filingStatus: "hoh",
      magi: 150000,
      netInvestmentIncome: 0,
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.ordinaryTax).toBe(27108);
    expect(json.tax).toBe(27108);
  });

  test("FED_PREF_TAX_2025 honors 2025 preferential thresholds", async () => {
    const zeroResponse = await post({
      calc: "FED_PREF_TAX_2025",
      ordinaryTaxable: 50000,
      prefTaxable: 25000,
      filingStatus: "mfj",
    });
    expect(zeroResponse.statusCode).toBe(200);
    expect(JSON.parse(zeroResponse.body).tax).toBe(0);

    const fifteenResponse = await post({
      calc: "FED_PREF_TAX_2025",
      ordinaryTaxable: 150000,
      prefTaxable: 25000,
      filingStatus: "mfj",
    });
    expect(fifteenResponse.statusCode).toBe(200);
    expect(JSON.parse(fifteenResponse.body).tax).toBe(3750);

    const twentyResponse = await post({
      calc: "FED_PREF_TAX_2025",
      ordinaryTaxable: 600050,
      prefTaxable: 10000,
      filingStatus: "mfj",
    });
    expect(twentyResponse.statusCode).toBe(200);
    expect(JSON.parse(twentyResponse.body).tax).toBe(2000);
  });

  test("STATE_TAX_2025 calculates progressive brackets supplied by the UI", async () => {
    const response = await post({
      calc: "STATE_TAX_2025",
      state: "TS",
      filingStatus: "mfj",
      taxableIncome: 200000,
      brackets: [
        { threshold: 0, rate: 0.01 },
        { threshold: 100000, rate: 0.02 },
      ],
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.tax).toBe(3000);
    expect(json.effectiveRate).toBe(0.015);
    expect(json.marginalRate).toBe(0.02);
  });

  test("LOCAL_TAX calculates flat and progressive local tax", async () => {
    const flatResponse = await post({
      calc: "LOCAL_TAX",
      taxableIncome: 100000,
      enabled: true,
      kind: "flat",
      rate: 0.015,
    });
    expect(flatResponse.statusCode).toBe(200);
    expect(JSON.parse(flatResponse.body).tax).toBe(1500);

    const progressiveResponse = await post({
      calc: "LOCAL_TAX",
      taxableIncome: 200000,
      enabled: true,
      kind: "progressive",
      brackets: [
        { threshold: 0, rate: 0.01 },
        { threshold: 100000, rate: 0.02 },
      ],
    });
    expect(progressiveResponse.statusCode).toBe(200);
    expect(JSON.parse(progressiveResponse.body).tax).toBe(3000);
  });
});
