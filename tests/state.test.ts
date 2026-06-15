import { describe, expect, test } from "vitest";
import { caTax2025Mfj, stateTax2025 } from "../amplify/backend/function/helloWorld/taxCalcs.js";

describe("STATE_TAX_2025_CA_MFJ", () => {
  test("0 => 0", () => {
    expect(caTax2025Mfj(0)).toBe(0);
  });

  test("monotonic", () => {
    expect(caTax2025Mfj(100000)).toBeLessThanOrEqual(caTax2025Mfj(200000));
  });

  test("generic state calculator accepts mfs and hoh statuses", () => {
    expect(stateTax2025(100000, "CA", "mfs").filingStatus).toBe("mfs");
    expect(stateTax2025(100000, "CA", "hoh").filingStatus).toBe("hoh");
  });
});
