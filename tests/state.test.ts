import { describe, expect, test } from "vitest";
import { caTax2025Mfj } from "../amplify/backend/function/helloWorld/src/taxCalcs.ts";

describe("STATE_TAX_2025_CA_MFJ", () => {
  test("0 => 0", () => {
    expect(caTax2025Mfj(0)).toBe(0);
  });

  test("monotonic", () => {
    expect(caTax2025Mfj(100000))
      .toBeLessThanOrEqual(caTax2025Mfj(200000));
  });
});