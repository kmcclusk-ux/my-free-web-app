import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const appSource = readFileSync("frontend/src/App.tsx", "utf8");
const frontendTaxMathSource = readFileSync("frontend/src/taxMath.ts", "utf8");
const backendTaxSource = readFileSync("amplify/backend/function/helloWorld/src/taxCalcs.ts", "utf8");

describe("backend tax source of truth", () => {
  test("frontend requests only the aggregate backend tax plan and configuration", () => {
    expect(appSource).not.toContain('calc: "FED_TAX_2025_COMBINED"');
    expect(appSource).not.toContain('calc: "LOCAL_TAX"');
    expect(appSource).toContain('calc: "TAX_PLAN_2025"');
    expect(appSource).toContain('calc: "TAX_CONFIG_2025"');
  });

  test("frontend tax helper contains classification only", () => {
    expect(frontendTaxMathSource).toContain("isW2IncomeType");
    expect(frontendTaxMathSource).not.toMatch(/tax\s*=|socialSecurity|medicare|bracket|deduction/i);
  });

  test("backend owns federal, state, local, payroll, and Social Security calculations", () => {
    for (const symbol of [
      "calculateFederalTax2025",
      "calculateStateTax2025",
      "calculateLocalTax2025",
      "calculateW2PayrollTax",
      "calculateTaxableSocialSecurity2025",
      "calculateTaxPlan2025",
    ]) {
      expect(backendTaxSource).toContain(symbol);
    }
  });
});
