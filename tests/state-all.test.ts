import { describe, expect, test } from "vitest";
import { getStateTaxProfile, stateTax2025, stateTaxProfiles, type StateTaxFilingStatus as FilingStatus } from "../amplify/backend/function/helloWorld/src/taxProfiles2025";

type StateTaxFixture = {
  state: string;
  single100k: number;
  mfj100k: number;
  single500k: number;
  mfj500k: number;
};

const scheduleRegressionFixtures: StateTaxFixture[] = [
  { state: "AL", single100k: 4960, mfj100k: 4920, single500k: 24960, mfj500k: 24920 },
  { state: "AK", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "AZ", single100k: 2500, mfj100k: 2500, single500k: 12500, mfj500k: 12500 },
  { state: "AR", single100k: 3814.5, mfj100k: 3814.5, single500k: 19414.5, mfj500k: 19414.5 },
  { state: "CA", single100k: 5738.64, mfj100k: 3069.78, single500k: 44766.14, mfj500k: 39377.28 },
  { state: "CO", single100k: 4400, mfj100k: 4400, single500k: 22000, mfj500k: 22000 },
  { state: "CT", single100k: 4750, mfj100k: 4000, single500k: 31250, mfj500k: 28000 },
  { state: "DE", single100k: 5583.5, mfj100k: 5583.5, single500k: 31983.5, mfj500k: 31983.5 },
  { state: "FL", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "GA", single100k: 5190, mfj100k: 5190, single500k: 25950, mfj500k: 25950 },
  { state: "HI", single100k: 6491.2, mfj100k: 5382.4, single500k: 45216.2, mfj500k: 37432.4 },
  { state: "ID", single100k: 5300, mfj100k: 5300, single500k: 26500, mfj500k: 26500 },
  { state: "IL", single100k: 4950, mfj100k: 4950, single500k: 24750, mfj500k: 24750 },
  { state: "IN", single100k: 3000, mfj100k: 3000, single500k: 15000, mfj500k: 15000 },
  { state: "IA", single100k: 3800, mfj100k: 3800, single500k: 19000, mfj500k: 19000 },
  { state: "KS", single100k: 5492.6, mfj100k: 5405.2, single500k: 27812.6, mfj500k: 27725.2 },
  { state: "KY", single100k: 4000, mfj100k: 4000, single500k: 20000, mfj500k: 20000 },
  { state: "LA", single100k: 3000, mfj100k: 3000, single500k: 15000, mfj500k: 15000 },
  { state: "ME", single100k: 6641.6, mfj100k: 6240.8, single500k: 35241.6, mfj500k: 34733.2 },
  { state: "MD", single100k: 4697.5, mfj100k: 4697.5, single500k: 27135, mfj500k: 26572.5 },
  { state: "MA", single100k: 5000, mfj100k: 5000, single500k: 25000, mfj500k: 25000 },
  { state: "MI", single100k: 4250, mfj100k: 4250, single500k: 21250, mfj500k: 21250 },
  { state: "MN", single100k: 6327.74, mfj100k: 6109.51, single500k: 43681.74, mfj500k: 39964.92 },
  { state: "MS", single100k: 3960, mfj100k: 3960, single500k: 21560, mfj500k: 21560 },
  { state: "MO", single100k: 4524.02, mfj100k: 4524.02, single500k: 23324.02, mfj500k: 23324.02 },
  { state: "MT", single100k: 5646.8, mfj100k: 5393.6, single500k: 29246.8, mfj500k: 28993.6 },
  { state: "NE", single100k: 4722.03, mfj100k: 4244.14, single500k: 25522.03, mfj500k: 25044.14 },
  { state: "NV", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "NH", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "NJ", single100k: 4243.75, mfj100k: 2750, single500k: 29723.75, mfj500k: 27807.5 },
  { state: "NM", single100k: 4358, mfj100k: 4089, single500k: 26858, mfj500k: 25534 },
  { state: "NY", single100k: 5431.75, mfj100k: 5167.5, single500k: 31850.85, mfj500k: 30362.55 },
  { state: "NC", single100k: 4250, mfj100k: 4250, single500k: 21250, mfj500k: 21250 },
  { state: "ND", single100k: 1004.74, mfj100k: 370.99, single500k: 10208.2, mfj500k: 9281.58 },
  { state: "OH", single100k: 2375.63, mfj100k: 2375.63, single500k: 14894.32, mfj500k: 14894.32 },
  { state: "OK", single100k: 4561.5, mfj100k: 4373, single500k: 23561.5, mfj500k: 23373 },
  { state: "OR", single100k: 8441, mfj100k: 8132, single500k: 47753.5, mfj500k: 46007 },
  { state: "PA", single100k: 3070, mfj100k: 3070, single500k: 15350, mfj500k: 15350 },
  { state: "RI", single100k: 3951, mfj100k: 3951, single500k: 26898.54, mfj500k: 26898.54 },
  { state: "SC", single100k: 5358.3, mfj100k: 5358.3, single500k: 29358.3, mfj500k: 29358.3 },
  { state: "SD", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "TN", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "TX", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "UT", single100k: 4500, mfj100k: 4500, single500k: 22500, mfj500k: 22500 },
  { state: "VT", single100k: 5043.25, mfj100k: 4001.63, single500k: 38250.25, mfj500k: 35830.73 },
  { state: "VA", single100k: 5492.5, mfj100k: 5492.5, single500k: 28492.5, mfj500k: 28492.5 },
  { state: "WA", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "WV", single100k: 3981.5, mfj100k: 3981.5, single500k: 23261.5, mfj500k: 23261.5 },
  { state: "WI", single100k: 4713.56, mfj100k: 4518.08, single500k: 30066.25, mfj500k: 27338.17 },
  { state: "WY", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "DC", single100k: 6900, mfj100k: 6900, single500k: 42775, mfj500k: 42775 },
];

const noBroadIncomeTaxStates = ["AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY"];

function expectCloseToCents(actual: number, expected: number) {
  expect(Number(actual.toFixed(2))).toBeCloseTo(expected, 2);
}

describe("2025 state schedule regressions, not complete return-rule verification", () => {
  test("catalog contains 50 states plus DC; this is a structural count only", () => {
    expect(scheduleRegressionFixtures).toHaveLength(51);
    expect(new Set(scheduleRegressionFixtures.map((fixture) => fixture.state)).size).toBe(51);
  });

  test.each(scheduleRegressionFixtures)("$state single and mfj schedule-only scenarios", (fixture) => {
    expectCloseToCents(stateTax2025(100000, fixture.state, "single").tax, fixture.single100k);
    expectCloseToCents(stateTax2025(100000, fixture.state, "mfj").tax, fixture.mfj100k);
    expectCloseToCents(stateTax2025(500000, fixture.state, "single").tax, fixture.single500k);
    expectCloseToCents(stateTax2025(500000, fixture.state, "mfj").tax, fixture.mfj500k);
  });

  test.each(noBroadIncomeTaxStates)("%s has no broad-based individual income tax", (state) => {
    expect(stateTax2025(1000000, state, "single").tax).toBe(0);
    expect(stateTax2025(1000000, state, "mfj").tax).toBe(0);
  });

  test("unknown state is rejected instead of silently calculating California", () => {
    expect(() => stateTax2025(100000, "ZZ", "single")).toThrow(/state or DC code/);
  });

  test.each([
    ["single", 125000, 8063.638],
    ["mfs", 125000, 8063.638],
    ["mfj", 125000, 4768.10],
    ["hoh", 125000, 6035.38],
  ] as Array<[FilingStatus, number, number]>)("California official 2025 %s schedule at $%i", (filingStatus, income, expectedTax) => {
    expect(stateTax2025(income, "CA", filingStatus).tax).toBeCloseTo(expectedTax, 2);
  });

  test("New Jersey head of household uses the official joint and HOH schedule", () => {
    expect(stateTax2025(100000, "NJ", "hoh").tax).toBeCloseTo(2750, 2);
    expect(stateTax2025(100000, "NJ", "single").tax).toBeCloseTo(4243.75, 2);
  });

  test("every state schedule honors its marginal rates and any statutory base-tax steps", () => {
    const filingStatuses: FilingStatus[] = ["single", "mfj", "mfs", "hoh"];
    for (const profile of stateTaxProfiles) {
      for (const filingStatus of filingStatuses) {
        const brackets = filingStatus === "mfj" ? profile.mfj
          : filingStatus === "mfs" ? profile.mfs ?? profile.single
          : filingStatus === "hoh" ? profile.hoh ?? profile.single
          : profile.single;
        expect(brackets.map((bracket) => bracket.threshold)).toEqual([...brackets].map((bracket) => bracket.threshold).sort((left, right) => left - right));
        for (const bracket of brackets) {
          expect(bracket.threshold).toBeGreaterThanOrEqual(0);
          expect(bracket.rate).toBeGreaterThanOrEqual(0);
          const atThreshold = stateTax2025(bracket.threshold, profile.code, filingStatus).tax;
          const afterThreshold = stateTax2025(bracket.threshold + 1, profile.code, filingStatus).tax;
          if (profile.code === "MO") {
            expect(Math.round(afterThreshold)).toBeGreaterThanOrEqual(Math.round(atThreshold));
          } else {
            expect(afterThreshold).toBeGreaterThanOrEqual(atThreshold);
          }
          if (bracket.baseTax !== undefined) {
            expect(afterThreshold).toBeCloseTo(bracket.baseTax + bracket.rate, 8);
          } else {
            expect(afterThreshold - atThreshold).toBeCloseTo(bracket.rate, 8);
          }
        }
      }
    }
  });

  test("all filing statuses are monotonic across representative incomes in every state", () => {
    const filingStatuses: FilingStatus[] = ["single", "mfj", "mfs", "hoh"];
    const incomes = [0, 1, 10000, 50000, 100000, 500000, 1000000, 2000000];
    for (const profile of stateTaxProfiles) {
      for (const filingStatus of filingStatuses) {
        const taxes = incomes.map((income) => stateTax2025(income, profile.code, filingStatus).tax);
        for (let index = 1; index < taxes.length; index += 1) {
          expect(taxes[index]).toBeGreaterThanOrEqual(taxes[index - 1]);
        }
      }
    }
  });

  test("documented local-tax exclusions stay visible to callers", () => {
    expect(getStateTaxProfile("MD").note).toMatch(/local Maryland/i);
    expect(getStateTaxProfile("NY").note).toMatch(/local income taxes/i);
    expect(getStateTaxProfile("OH").note).toMatch(/local income taxes/i);
    expect(getStateTaxProfile("PA").note).toMatch(/local earned-income taxes/i);
  });
});
