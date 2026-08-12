import { describe, expect, test } from "vitest";
import {
  canonicalStateRuleForTaxTreatment,
  defaultTaxTreatmentLabels,
  defaultTaxTreatmentRule,
  fedTaxAdjust,
  stateTaxAdjust,
} from "../frontend/src/App";
import { calculateTaxableSocialSecurity } from "../frontend/src/socialSecurityTax";

const amount = 100;
const expectedTreatments = [
  { label: "tax-free", ordinary: 0, preferred: 0, state: 0, niit: false },
  { label: "state tax free", ordinary: 100, preferred: 0, state: 0, niit: true },
  { label: "fed tax free", ordinary: 0, preferred: 0, state: 100, niit: true },
  { label: "index-60-40", ordinary: 40, preferred: 60, state: 100, niit: true },
  { label: "income", ordinary: 100, preferred: 0, state: 100, niit: true },
  { label: "ss-85-fed", ordinary: 85, preferred: 0, state: 0, niit: false },
  { label: "qualified-div", ordinary: 0, preferred: 100, state: 100, niit: true },
  { label: "non-qualified-div", ordinary: 100, preferred: 0, state: 100, niit: true },
  { label: "short term gain", ordinary: 100, preferred: 0, state: 100, niit: true },
  { label: "long term gain", ordinary: 0, preferred: 100, state: 100, niit: true },
  { label: "real estate", ordinary: 100, preferred: 0, state: 100, niit: true },
  { label: "hold", ordinary: 0, preferred: 0, state: 0, niit: false },
] as const;

describe("investment tax-treatment regression coverage", () => {
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
    expect(stateTaxAdjust(amount, "tax-free", "CA", staleTaxableRule)).toBe(0);
  });

  test("custom federal shares are capped and proportionally normalized", () => {
    const oversizedRule = { id: 1, label: "custom", ordinaryShare: 0.8, preferredShare: 0.8, stateRule: "taxable", niitIncluded: true, localCategory: "interest", description: "", includeInAllocation: true };
    expect(fedTaxAdjust(amount, "custom", false, oversizedRule)).toBeCloseTo(50);
    expect(fedTaxAdjust(amount, "custom", true, oversizedRule)).toBeCloseTo(50);
  });

  test("Social Security is not taxable below the provisional-income base", () => {
    expect(calculateTaxableSocialSecurity(24000, 10000, 0, "single")).toBe(0);
  });

  test("Social Security is partially taxable between the base amounts", () => {
    expect(calculateTaxableSocialSecurity(24000, 16000, 0, "single")).toBe(1500);
  });

  test("Social Security reaches but never exceeds the 85% cap", () => {
    expect(calculateTaxableSocialSecurity(24000, 100000, 0, "single")).toBe(20400);
  });

  test("tax-exempt interest is included in provisional income", () => {
    expect(calculateTaxableSocialSecurity(24000, 10000, 10000, "single")).toBe(3500);
  });

  test("married filing jointly uses the higher base amounts", () => {
    expect(calculateTaxableSocialSecurity(30000, 15000, 0, "mfj")).toBe(0);
    expect(calculateTaxableSocialSecurity(30000, 25000, 0, "mfj")).toBe(4000);
  });
});
