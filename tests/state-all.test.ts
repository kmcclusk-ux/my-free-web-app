import { describe, expect, test } from "vitest";
import { getStateTaxProfile, stateTax2025 } from "../amplify/backend/function/helloWorld/taxCalcs.js";

type StateTaxFixture = {
  state: string;
  single100k: number;
  mfj100k: number;
  single500k: number;
  mfj500k: number;
};

const publishedStateFixtures: StateTaxFixture[] = [
  { state: "AL", single100k: 4960, mfj100k: 4920, single500k: 24960, mfj500k: 24920 },
  { state: "AK", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "AZ", single100k: 2500, mfj100k: 2500, single500k: 12500, mfj500k: 12500 },
  { state: "AR", single100k: 3814.5, mfj100k: 3814.5, single500k: 19414.5, mfj500k: 19414.5 },
  { state: "CA", single100k: 5842.36, mfj100k: 3155.12, single500k: 45107.9, mfj500k: 39577.96 },
  { state: "CO", single100k: 4400, mfj100k: 4400, single500k: 22000, mfj500k: 22000 },
  { state: "CT", single100k: 4750, mfj100k: 4000, single500k: 31250, mfj500k: 28000 },
  { state: "DE", single100k: 5583.5, mfj100k: 5583.5, single500k: 31983.5, mfj500k: 31983.5 },
  { state: "FL", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "GA", single100k: 5390, mfj100k: 5390, single500k: 26950, mfj500k: 26950 },
  { state: "HI", single100k: 6491.2, mfj100k: 5382.4, single500k: 45216.2, mfj500k: 37432.4 },
  { state: "ID", single100k: 5428.87, mfj100k: 5162.75, single500k: 28208.87, mfj500k: 27942.75 },
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
  { state: "MO", single100k: 4524.06, mfj100k: 4517.49, single500k: 23324.06, mfj500k: 23317.49 },
  { state: "MT", single100k: 5646.8, mfj100k: 5393.6, single500k: 29246.8, mfj500k: 28993.6 },
  { state: "NE", single100k: 4722.03, mfj100k: 4244.14, single500k: 25522.03, mfj500k: 25044.14 },
  { state: "NV", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "NH", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "NJ", single100k: 3475, mfj100k: 2750, single500k: 28955, mfj500k: 27807.5 },
  { state: "NM", single100k: 4358, mfj100k: 4089, single500k: 26858, mfj500k: 25534 },
  { state: "NY", single100k: 5431.75, mfj100k: 5167.5, single500k: 31850.85, mfj500k: 30362.55 },
  { state: "NC", single100k: 4250, mfj100k: 4250, single500k: 21250, mfj500k: 21250 },
  { state: "ND", single100k: 1004.74, mfj100k: 370.99, single500k: 10208.2, mfj500k: 9281.58 },
  { state: "OH", single100k: 2033.63, mfj100k: 2033.63, single500k: 13033.63, mfj500k: 13033.63 },
  { state: "OK", single100k: 4561.5, mfj100k: 4373, single500k: 23561.5, mfj500k: 23373 },
  { state: "OR", single100k: 8441, mfj100k: 8132, single500k: 47753.5, mfj500k: 46007 },
  { state: "PA", single100k: 3070, mfj100k: 3070, single500k: 15350, mfj500k: 15350 },
  { state: "RI", single100k: 3951, mfj100k: 3951, single500k: 26898.54, mfj500k: 26898.54 },
  { state: "SC", single100k: 5522.64, mfj100k: 5522.64, single500k: 30322.64, mfj500k: 30322.64 },
  { state: "SD", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "TN", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "TX", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "UT", single100k: 4550, mfj100k: 4550, single500k: 22750, mfj500k: 22750 },
  { state: "VT", single100k: 5043.25, mfj100k: 4001.63, single500k: 38250.25, mfj500k: 35830.73 },
  { state: "VA", single100k: 5492.5, mfj100k: 5492.5, single500k: 28492.5, mfj500k: 28492.5 },
  { state: "WA", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "WV", single100k: 3981.5, mfj100k: 3981.5, single500k: 23261.5, mfj500k: 23261.5 },
  { state: "WI", single100k: 4903.55, mfj100k: 4771.43, single500k: 30256.24, mfj500k: 27591.52 },
  { state: "WY", single100k: 0, mfj100k: 0, single500k: 0, mfj500k: 0 },
  { state: "DC", single100k: 6900, mfj100k: 6900, single500k: 42775, mfj500k: 42775 },
];

const noBroadIncomeTaxStates = ["AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY"];

function expectCloseToCents(actual: number, expected: number) {
  expect(Number(actual.toFixed(2))).toBeCloseTo(expected, 2);
}

describe("2025 state income tax published fixture coverage", () => {
  test("covers all 50 states plus DC", () => {
    expect(publishedStateFixtures).toHaveLength(51);
    expect(new Set(publishedStateFixtures.map((fixture) => fixture.state)).size).toBe(51);
  });

  test.each(publishedStateFixtures)("$state single and mfj published scenarios", (fixture) => {
    expectCloseToCents(stateTax2025(100000, fixture.state, "single").tax, fixture.single100k);
    expectCloseToCents(stateTax2025(100000, fixture.state, "mfj").tax, fixture.mfj100k);
    expectCloseToCents(stateTax2025(500000, fixture.state, "single").tax, fixture.single500k);
    expectCloseToCents(stateTax2025(500000, fixture.state, "mfj").tax, fixture.mfj500k);
  });

  test.each(noBroadIncomeTaxStates)("%s has no broad-based individual income tax", (state) => {
    expect(stateTax2025(1000000, state, "single").tax).toBe(0);
    expect(stateTax2025(1000000, state, "mfj").tax).toBe(0);
  });

  test("unknown state falls back to California profile", () => {
    expect(stateTax2025(100000, "ZZ", "single")).toMatchObject({
      state: "CA",
      stateName: "California",
    });
  });

  test("documented local-tax exclusions stay visible to callers", () => {
    expect(getStateTaxProfile("MD").note).toMatch(/local Maryland/i);
    expect(getStateTaxProfile("NY").note).toMatch(/local income taxes/i);
    expect(getStateTaxProfile("OH").note).toMatch(/local income taxes/i);
    expect(getStateTaxProfile("PA").note).toMatch(/local earned-income taxes/i);
  });
});
