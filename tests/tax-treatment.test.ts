import { describe, expect, test } from "vitest";
import {
  canonicalStateRuleForTaxTreatment,
  accountStatusAllowsCurrentTaxableIncome,
  defaultTaxTreatmentLabels,
  defaultTaxTreatmentRule,
  fedTaxAdjust,
  stateTaxAdjust,
} from "../frontend/src/App";
import { calculateTaxableSocialSecurity2025 } from "../amplify/backend/function/helloWorld/taxCalcs.js";

const amount = 100;
const expectedTreatments = [
  { label: "state tax free", ordinary: 100, preferred: 0, state: 0, niit: true },
  { label: "fed tax free", ordinary: 0, preferred: 0, state: 100, niit: false },
  { label: "section 1256", ordinary: 40, preferred: 60, state: 100, niit: true },
  { label: "W2 income", ordinary: 100, preferred: 0, state: 100, niit: false },
  { label: "income", ordinary: 100, preferred: 0, state: 100, niit: true },
  { label: "social security", ordinary: 85, preferred: 0, state: 0, niit: false },
  { label: "qualified-div", ordinary: 0, preferred: 100, state: 100, niit: true },
  { label: "non-qualified-div", ordinary: 100, preferred: 0, state: 100, niit: true },
  { label: "short term gain", ordinary: 100, preferred: 0, state: 100, niit: true },
  { label: "long term gain", ordinary: 0, preferred: 100, state: 100, niit: true },
  { label: "return of capital", ordinary: 0, preferred: 0, state: 0, niit: false },
] as const;

describe("investment tax-treatment regression coverage", () => {
  test("current distributions remain taxable even when held in deferred accounts", () => {
    expect(accountStatusAllowsCurrentTaxableIncome("deferred", true)).toBe(true);
    expect(accountStatusAllowsCurrentTaxableIncome("deferred", false)).toBe(false);
    expect(accountStatusAllowsCurrentTaxableIncome("taxable", false)).toBe(true);
  });

  test("the expectation table covers every built-in treatment exactly once", () => {
    expect(expectedTreatments.map((row) => row.label)).toEqual([...defaultTaxTreatmentLabels]);
    expect(new Set(expectedTreatments.map((row) => row.label)).size).toBe(defaultTaxTreatmentLabels.length);
  });

  test.each(expectedTreatments)("$label applies federal, state, and NIIT treatment", (expected) => {
    const rule = defaultTaxTreatmentRule(expected.label);
    expect(fedTaxAdjust(amount, expected.label, false)).toBeCloseTo(expected.ordinary);
    expect(fedTaxAdjust(amount, expected.label, true)).toBeCloseTo(expected.preferred);
    expect(stateTaxAdjust(amount, expected.label, "CA")).toBeCloseTo(expected.state);
    expect(rule.niitIncluded).toBe(expected.niit);
  });

  test("canonical state exemptions override stale imported state rules", () => {
    const staleTaxableRule = { id: 1, label: "state tax free", ordinaryShare: 1, preferredShare: 0, stateRule: "taxable", niitIncluded: true, localCategory: "interest", description: "", includeInAllocation: true };
    expect(canonicalStateRuleForTaxTreatment("state tax free")).toBe("treasury-exempt");
    expect(stateTaxAdjust(amount, "state tax free", "CA", staleTaxableRule)).toBe(0);
    expect(stateTaxAdjust(amount, "return of capital", "CA", staleTaxableRule)).toBe(0);
    expect(stateTaxAdjust(amount, "social security", "CA", staleTaxableRule)).toBe(0);
  });

  test("legacy exported treatment names remain aliases for current schema labels", () => {
    const aliases = [
      { legacy: "hold", current: "return of capital" },
      { legacy: "ss-85-fed", current: "social security" },
      { legacy: "index-60-40", current: "section 1256" },
      { legacy: "tax-free", current: "return of capital" },
    ] as const;
    for (const pair of aliases) {
      expect(fedTaxAdjust(amount, pair.legacy, false)).toBeCloseTo(fedTaxAdjust(amount, pair.current, false));
      expect(fedTaxAdjust(amount, pair.legacy, true)).toBeCloseTo(fedTaxAdjust(amount, pair.current, true));
      expect(stateTaxAdjust(amount, pair.legacy, "CA")).toBeCloseTo(stateTaxAdjust(amount, pair.current, "CA"));
      expect(defaultTaxTreatmentRule(pair.legacy).niitIncluded).toBe(defaultTaxTreatmentRule(pair.current).niitIncluded);
    }
  });

  test("custom federal shares are capped and proportionally normalized", () => {
    const oversizedRule = { id: 1, label: "custom", ordinaryShare: 0.8, preferredShare: 0.8, stateRule: "taxable", niitIncluded: true, localCategory: "interest", description: "", includeInAllocation: true };
    expect(fedTaxAdjust(amount, "custom", false, oversizedRule)).toBeCloseTo(50);
    expect(fedTaxAdjust(amount, "custom", true, oversizedRule)).toBeCloseTo(50);
  });

  test("Social Security is not taxable below the provisional-income base", () => {
    expect(calculateTaxableSocialSecurity2025(24000, 10000, 0, "single")).toBe(0);
  });

  test("Social Security is partially taxable between the base amounts", () => {
    expect(calculateTaxableSocialSecurity2025(24000, 16000, 0, "single")).toBe(1500);
  });

  test("Social Security reaches but never exceeds the 85% cap", () => {
    expect(calculateTaxableSocialSecurity2025(24000, 100000, 0, "single")).toBe(20400);
  });

  test("tax-exempt interest is included in provisional income", () => {
    expect(calculateTaxableSocialSecurity2025(24000, 10000, 10000, "single")).toBe(3500);
  });

  test("married filing jointly uses the higher base amounts", () => {
    expect(calculateTaxableSocialSecurity2025(30000, 15000, 0, "mfj")).toBe(0);
    expect(calculateTaxableSocialSecurity2025(30000, 25000, 0, "mfj")).toBe(4000);
  });
});
