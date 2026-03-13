import { describe, expect, test } from "vitest";
import {
  fedTax2025Mfj,
  fedTax2025Single,
  fedTax2025Ordinary,
} from "../amplify/backend/function/helloWorld/taxCalcs.js";

describe("2025 federal ordinary tax", () => {
  test("mfj 0 => 0", () => {
    expect(fedTax2025Mfj(0)).toBe(0);
  });

  test("mfj 450000 => 98126", () => {
    expect(fedTax2025Mfj(450000)).toBe(98126);
  });

  test("single 150000 => 28847", () => {
    expect(fedTax2025Single(150000)).toBe(28847);
  });

  test("status-aware helper routes mfj and single correctly", () => {
    expect(fedTax2025Ordinary(450000, "mfj")).toBe(98126);
    expect(fedTax2025Ordinary(150000, "single")).toBe(28847);
  });

  test("ordinary tax is monotonic", () => {
    expect(fedTax2025Mfj(100000)).toBeLessThanOrEqual(fedTax2025Mfj(200000));
    expect(fedTax2025Single(100000)).toBeLessThanOrEqual(fedTax2025Single(200000));
  });
});

