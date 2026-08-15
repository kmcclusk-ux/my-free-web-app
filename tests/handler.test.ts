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

  test("STATE_TAX_2025 uses backend-owned state schedules and ignores injected brackets", async () => {
    const response = await post({
      calc: "STATE_TAX_2025",
      state: "CA",
      filingStatus: "mfj",
      taxableIncome: 200000,
      brackets: [
        { threshold: 0, rate: 0 },
      ],
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.state).toBe("CA");
    expect(json.tax).toBeCloseTo(11477.276, 3);
    expect(json.effectiveRate).toBeCloseTo(11477.276 / 200000, 8);
    expect(json.marginalRate).toBe(0.093);
  });

  test("TAX_CONFIG_2025 publishes the backend-owned state and local definitions", async () => {
    const response = await post({ calc: "TAX_CONFIG_2025" });
    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.taxYear).toBe(2025);
    expect(json.states).toHaveLength(51);
    expect(json.states.find((profile: { code: string }) => profile.code === "CA").mfj[1].threshold).toBe(22158);
    expect(json.localities.find((profile: { id: string }) => profile.id === "ny-yonkers").kind).toBe("state-surcharge");
  });

  test("TAX_PLAN_2025 returns federal income tax for 455k instead of payroll tax alone", async () => {
    const response = await post({
      calc: "TAX_PLAN_2025",
      filingStatus: "mfj",
      state: "CA",
      ordinaryIncomeExcludingSocialSecurity: 455000,
      preferredIncome: 0,
      netInvestmentIncome: 0,
      w2Income: 0,
      totalIncome: 455000,
      displayIncome: 455000,
      federalDeductionMode: "standard",
      stateGrossIncome: 455000,
      stateDeductionMode: "standard",
      stateStandardDeduction: 11080,
      local: { enabled: false },
    });
    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.body);
    expect(json.federal.taxableIncome).toBe(423500);
    expect(json.federal.incomeTax).toBe(89646);
    expect(json.federal.payrollTax).toBe(0);
    expect(json.state.incomeTax).toBeGreaterThan(0);
    expect(json.totalTax).toBe(json.federal.total + json.state.total + json.local.tax);
    expect(json.afterTaxIncome).toBe(455000 - json.totalTax);
  });

  test("aggregate endpoints reject unknown state and local schedules", async () => {
    const stateResponse = await post({
      calc: "TAX_PLAN_2025",
      filingStatus: "single",
      state: "ZZ",
      ordinaryIncomeExcludingSocialSecurity: 100000,
      preferredIncome: 0,
      stateGrossIncome: 100000,
    });
    expect(stateResponse.statusCode).toBe(400);
    expect(JSON.parse(stateResponse.body).error).toMatch(/unsupported state/i);

    const localResponse = await post({
      calc: "TAX_PLAN_2025",
      filingStatus: "single",
      state: "CA",
      ordinaryIncomeExcludingSocialSecurity: 100000,
      preferredIncome: 0,
      stateGrossIncome: 100000,
      local: { enabled: true, localityId: "missing" },
    });
    expect(localResponse.statusCode).toBe(400);
    expect(JSON.parse(localResponse.body).error).toMatch(/unsupported locality/i);
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
