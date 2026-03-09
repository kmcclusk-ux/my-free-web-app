import { describe, expect, test } from "vitest";
import { fedTax2025Mfj } from "../amplify/backend/function/helloWorld/taxCalcs.js";

describe("FED_TAX_2025_MFJ", () => {
  test("0 => 0", () => {
    expect(fedTax2025Mfj(0)).toBe(0);
  });

  test("450000 => 98126", () => {
    expect(fedTax2025Mfj(450000)).toBe(98126);
  });

  test("monotonic", () => {
    expect(fedTax2025Mfj(100000)).toBeLessThanOrEqual(fedTax2025Mfj(200000));
  });
});
