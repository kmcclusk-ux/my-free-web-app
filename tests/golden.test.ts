import { describe, expect, test } from "vitest";
import { fedTax2025Mfj, caTax2025Mfj } from "../amplify/backend/function/helloWorld/src/taxCalcs.ts";

describe("Golden vectors", () => {
  test("FED_TAX_2025_MFJ", () => {
    const cases: Array<[number, number]> = [
      [0, 0],
      [23850, 2385],
      [450000, 98126],
    ];
    for (const [ti, expected] of cases) {
      expect(fedTax2025Mfj(ti)).toBe(expected);
    }
  });

  test("STATE_TAX_2025_CA_MFJ", () => {
    // Fill these once with your known-good CA outputs
    const cases: Array<[number, number]> = [
      [0, 0],
      // [50000, 1234],
      // [100000, 2345],
      // [450000, 34567],
    ];
    for (const [ti, expected] of cases) {
      expect(caTax2025Mfj(ti)).toBe(expected);
    }
  });
});