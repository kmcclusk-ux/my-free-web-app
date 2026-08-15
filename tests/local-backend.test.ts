import { describe, expect, test } from "vitest";
import {
  calculateLocalTax2025,
  localTaxBaseKeys,
  localTaxProfiles2025,
} from "../amplify/backend/function/helloWorld/taxCalcs.js";

const allBaseAmounts = Object.fromEntries(localTaxBaseKeys.map((key) => [key, 10000]));

describe("2025 local backend engine", () => {
  test("every supported profile has a unique id and complete taxable-base definition", () => {
    expect(new Set(localTaxProfiles2025.map((profile) => profile.id)).size).toBe(localTaxProfiles2025.length);
    for (const profile of localTaxProfiles2025) {
      expect(Object.keys(profile.base).sort()).toEqual([...localTaxBaseKeys].sort());
      const result = calculateLocalTax2025({ enabled: true, localityId: profile.id, taxableBaseAmounts: allBaseAmounts });
      expect(result.tax).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.tax)).toBe(true);
    }
  });

  test.each([
    ["single", 12000, 369],
    ["single", 50000, 1813],
    ["mfj", 21600, 665],
    ["mfj", 100000, 3651.6],
    ["mfs", 50000, 1813],
    ["hoh", 60000, 2176],
  ] as const)("NYC %s schedule taxes $%i at $%i", (filingStatus, income, expectedTax) => {
    const result = calculateLocalTax2025({
      enabled: true,
      localityId: "ny-nyc",
      filingStatus,
      taxableBaseAmounts: { wages: income },
    });
    expect(result.tax).toBeCloseTo(expectedTax, 2);
  });

  test("NYC broad base includes investment income but excludes retirement and Social Security", () => {
    const result = calculateLocalTax2025({ enabled: true, localityId: "ny-nyc", taxableBaseAmounts: allBaseAmounts });
    expect(result.taxableIncome).toBe(70000);
  });

  test("Yonkers resident tax is 16.75% of New York State income tax", () => {
    const result = calculateLocalTax2025({
      enabled: true,
      localityId: "ny-yonkers",
      residency: "resident",
      stateIncomeTax: 10000,
      stateMarginalRate: 0.0685,
      taxableBaseAmounts: { wages: 200000 },
    });
    expect(result.calculationBase).toBe(10000);
    expect(result.tax).toBe(1675);
    expect(result.marginalRate).toBeCloseTo(0.0685 * 0.1675, 8);
  });

  test("Yonkers nonresident tax is 0.5% of earnings", () => {
    const result = calculateLocalTax2025({
      enabled: true,
      localityId: "ny-yonkers",
      residency: "nonresident",
      stateIncomeTax: 10000,
      taxableBaseAmounts: { wages: 100000, dividends: 50000 },
    });
    expect(result.taxableIncome).toBe(100000);
    expect(result.tax).toBe(500);
  });

  test("Philadelphia applies the effective July 2025 resident and nonresident wage rates", () => {
    const resident = calculateLocalTax2025({ enabled: true, localityId: "pa-philadelphia", residency: "resident", taxableBaseAmounts: { wages: 100000 } });
    const nonresident = calculateLocalTax2025({ enabled: true, localityId: "pa-philadelphia", residency: "nonresident", taxableBaseAmounts: { wages: 100000 } });
    expect(resident.tax).toBeCloseTo(3740, 8);
    expect(nonresident.tax).toBeCloseTo(3430, 8);
  });

  test("earnings-only cities ignore dividends and capital gains", () => {
    const result = calculateLocalTax2025({
      enabled: true,
      localityId: "oh-columbus",
      taxableBaseAmounts: { wages: 100000, selfEmployment: 20000, dividends: 50000, capitalGains: 50000 },
    });
    expect(result.taxableIncome).toBe(120000);
    expect(result.tax).toBe(3000);
  });

  test("custom profile uses caller rates and selected categories only", () => {
    const result = calculateLocalTax2025({
      enabled: true,
      localityId: "custom",
      residency: "resident",
      customRate: 0.0125,
      customTaxableBase: { wages: true, dividends: true },
      taxableBaseAmounts: { wages: 100000, dividends: 20000, capitalGains: 30000 },
    });
    expect(result.taxableIncome).toBe(120000);
    expect(result.tax).toBe(1500);
  });

  test("disabled local tax remains zero while preserving the selected base", () => {
    const result = calculateLocalTax2025({ enabled: false, localityId: "ny-nyc", taxableBaseAmounts: { wages: 100000 } });
    expect(result.enabled).toBe(false);
    expect(result.taxableIncome).toBe(100000);
    expect(result.tax).toBe(0);
  });
});
