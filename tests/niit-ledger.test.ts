import { describe, expect, test } from "vitest";
import {
  calculateFederalTax2025,
  calculateTaxPlan2025,
  TaxInputValidationError,
  type CapitalGains2025Input,
  type FederalTax2025Input,
  type FilingStatus,
} from "../amplify/backend/function/helloWorld/src/taxCalcs.ts";

const federalBase: FederalTax2025Input = {
  filingStatus: "single",
  ordinaryIncomeExcludingSocialSecurity: 300_000,
  preferredIncome: 0,
};

describe("Form 8960 capital ledger integration", () => {
  test.each([
    [{ shortTermGains: 20_000 }, 20_000],
    [{ longTermGains: 50_000 }, 50_000],
    [{ shortTermGains: 12_000, longTermGains: 18_000 }, 30_000],
    [{ shortTermGains: 30_000, longTermLosses: 10_000 }, 20_000],
    [{ shortTermGains: -10_000, longTermGains: 30_000 }, 20_000],
    [{ longTermGains: 30_000, shortTermLossCarryover: 12_000, longTermLossCarryover: 3_000 }, 15_000],
    [{ shortTermGains: 10_000, longTermLosses: 20_000 }, 0],
  ] satisfies Array<[CapitalGains2025Input, number]>)("derives NII from explicit capital %j without a duplicate aggregate", (capitalGains, expectedNii) => {
    const result = calculateFederalTax2025({ ...federalBase, capitalGains });
    expect(result.netInvestmentIncome).toBe(expectedNii);
    expect(result.niit).toBeCloseTo(expectedNii * 0.038, 8);
    expect(result.niitDetails.source).toBe("capital-only");
    expect(result.niitDetails.capitalLossOffsetApplied).toBe(0);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "NIIT_CAPITAL_ONLY" }));
  });

  test("keeps an explicit zero aggregate authoritative and does not infer wages or legacy preferred income", () => {
    const explicitZero = calculateFederalTax2025({ ...federalBase, capitalGains: { longTermGains: 50_000 }, netInvestmentIncome: 0 });
    const legacyOmitted = calculateFederalTax2025({ ...federalBase, preferredIncome: 50_000, longTermCapitalGainIncome: 50_000 });
    expect(explicitZero.netInvestmentIncome).toBe(0);
    expect(explicitZero.niitDetails.source).toBe("legacy-aggregate");
    expect(legacyOmitted.netInvestmentIncome).toBe(0);
    expect(calculateFederalTax2025(federalBase).netInvestmentIncome).toBe(0);
  });

  test.each([
    ["single", false, 200_000],
    ["hoh", false, 200_000],
    ["mfj", false, 250_000],
    ["mfs", false, 125_000],
    ["single", true, 250_000],
  ] satisfies Array<[FilingStatus, boolean, number]>)("caps explicit capital NIIT at MAGI excess: %s, surviving spouse %s", (filingStatus, qualifyingSurvivingSpouse, threshold) => {
    const result = calculateFederalTax2025({
      ...federalBase, filingStatus, qualifyingSurvivingSpouse,
      ordinaryIncomeExcludingSocialSecurity: threshold - 15_000,
      capitalGains: { longTermGains: 20_000 },
    });
    expect(result.niitThreshold).toBe(threshold);
    expect(result.niitBase).toBe(5_000);
    expect(result.niit).toBe(190);
    expect(calculateFederalTax2025({ ...federalBase, filingStatus, qualifyingSurvivingSpouse, ordinaryIncomeExcludingSocialSecurity: threshold - 20_000, capitalGains: { longTermGains: 20_000 } }).niit).toBe(0);
  });

  test("nets capital offsets once and includes qualified dividends once in the investment ledger", () => {
    const result = calculateFederalTax2025({
      ...federalBase,
      preferredIncome: 5_000,
      capitalGains: { shortTermGains: 10_000, longTermGains: 40_000, shortTermLosses: 20_000 },
      investmentIncome: { taxableInterest: 5_000, ordinaryDividends: 7_000, allowedInvestmentExpenses: 2_000 },
    });
    expect(result.capital.capitalLossOffset).toBe(20_000);
    expect(result.grossNetInvestmentIncome).toBe(42_000);
    expect(result.netInvestmentIncome).toBe(40_000);
    expect(result.niit).toBe(1_520);
    expect(result.niitDetails).toMatchObject({ source: "investment-ledger", capitalLossOffsetApplied: 0, allowedInvestmentExpenses: 2_000 });
  });

  test.each([["single", 3_000], ["mfj", 3_000], ["hoh", 3_000], ["mfs", 1_500]] satisfies Array<[FilingStatus, number]>)("uses only the current allowable capital loss for %s", (filingStatus, lossDeduction) => {
    const result = calculateFederalTax2025({
      ...federalBase, filingStatus,
      capitalGains: { longTermGains: 10_000, shortTermLossCarryover: 30_000 },
      investmentIncome: { taxableInterest: 12_000 },
    });
    expect(result.netInvestmentIncome).toBe(12_000 - lossDeduction);
    expect(result.niitDetails.capitalLossDeductionApplied).toBe(lossDeduction);
    expect(result.capital.shortTermCarryover).toBe(20_000 - lossDeduction);
  });

  test.each([-8_000, 4_000])("applies signed NIIT-specific capital adjustments once: %i", (capitalGainOrLossAdjustment) => {
    const result = calculateFederalTax2025({
      ...federalBase,
      capitalGains: { longTermGains: 30_000, shortTermLosses: 10_000 },
      investmentIncome: { taxableInterest: 5_000, capitalGainOrLossAdjustment },
    });
    expect(result.netInvestmentIncome).toBe(25_000 + capitalGainOrLossAdjustment);
    expect(result.capital.preferentialGain).toBe(20_000);
    expect(result.adjustedGrossIncome).toBe(320_000);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "NIIT_CAPITAL_ADJUSTMENT_OVERRIDE" }));
  });

  test("can remove an excluded capital loss without repeating the Schedule D offset", () => {
    const result = calculateFederalTax2025({ ...federalBase, capitalGains: { shortTermLosses: 5_000 }, investmentIncome: { taxableInterest: 10_000, capitalGainOrLossAdjustment: 3_000 } });
    expect(result.netInvestmentIncome).toBe(10_000);
    expect(result.capital.capitalLossDeduction).toBe(3_000);
  });
});

describe("NIIT expenses and backward-compatible aggregate contract", () => {
  test.each([undefined, "pre-capital-loss"] as const)("retains gross-gain aggregate semantics for mode %s", (netInvestmentIncomeMode) => {
    const result = calculateFederalTax2025({
      ...federalBase, netInvestmentIncomeMode,
      preferredIncome: 50_000, longTermCapitalGainIncome: 50_000,
      netInvestmentIncome: 55_000,
      aboveLineDeductions: [{ amount: 10_000, deductionType: "Investment loss (Long Term)" }],
    });
    expect(result.grossNetInvestmentIncome).toBe(55_000);
    expect(result.netInvestmentIncome).toBe(45_000);
    expect(result.niit).toBe(1_710);
    expect(result.niitDetails.capitalLossOffsetApplied).toBe(10_000);
  });

  test("does not add explicit gross gains already included in the legacy aggregate", () => {
    const result = calculateFederalTax2025({ ...federalBase, capitalGains: { longTermGains: 30_000, shortTermLosses: 10_000 }, netInvestmentIncome: 35_000 });
    expect(result.netInvestmentIncome).toBe(25_000);
    expect(result.niit).toBe(950);
  });

  test.each([
    [{ longTermGains: 30_000, shortTermLosses: 10_000 }, 40_000, 30_000],
    [{ shortTermGains: 5_000, longTermLosses: 20_000 }, 15_000, 7_000],
  ] satisfies Array<[CapitalGains2025Input, number, number]>)("ledger, legacy aggregate and final aggregate reconcile for %j", (capitalGains, preCapitalLossAggregate, expectedNii) => {
    const input = { ...federalBase, capitalGains };
    const ledger = calculateFederalTax2025({ ...input, investmentIncome: { taxableInterest: 12_000, allowedInvestmentExpenses: 2_000 } });
    const legacy = calculateFederalTax2025({ ...input, netInvestmentIncome: preCapitalLossAggregate });
    const final = calculateFederalTax2025({ ...input, netInvestmentIncome: expectedNii, netInvestmentIncomeMode: "final" });
    for (const result of [ledger, legacy, final]) {
      expect(result.netInvestmentIncome).toBe(expectedNii);
      expect(result.niit).toBeCloseTo(expectedNii * 0.038, 8);
      expect(result.adjustedGrossIncome).toBe(ledger.adjustedGrossIncome);
      expect(result.capital).toEqual(ledger.capital);
    }
  });

  test.each([
    [{ longTermGains: 30_000, shortTermLosses: 10_000 }, 23_000],
    [{ shortTermGains: 5_000, longTermLosses: 20_000 }, 7_000],
    [{ longTermGains: 50_000 }, 0],
  ] satisfies Array<[CapitalGains2025Input, number]>)("final aggregate avoids applying gains, losses or expenses again for %j", (capitalGains, netInvestmentIncome) => {
    const result = calculateFederalTax2025({
      ...federalBase, capitalGains, netInvestmentIncome, netInvestmentIncomeMode: "final",
      deductionMode: "itemized",
      itemizedDeductions: [{ amount: 2_000, deductionType: "Investment interest" }],
    });
    expect(result.netInvestmentIncome).toBe(netInvestmentIncome);
    expect(result.niit).toBeCloseTo(netInvestmentIncome * 0.038, 8);
    expect(result.niitDetails).toMatchObject({ source: "final-aggregate", capitalLossOffsetApplied: 0, capitalLossDeductionApplied: 0, allowedInvestmentExpenses: 0 });
  });

  test("a net activity amount and separate allowed expenses are deducted only once, independently of regular-tax deductions", () => {
    const result = calculateFederalTax2025({
      ...federalBase, ordinaryIncomeExcludingSocialSecurity: 325_000,
      investmentIncome: { passiveRentalIncome: 20_000, taxableInterest: 5_000, allowedInvestmentExpenses: 2_000 },
      deductionMode: "itemized", itemizedDeductions: [{ amount: 2_000, deductionType: "Investment interest" }],
    });
    expect(result.netInvestmentIncome).toBe(23_000);
    expect(result.niit).toBe(874);
    expect(result.deductions.itemizedDeduction).toBe(2_000);
    expect(result.adjustedGrossIncome).toBe(325_000);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "NIIT_ALLOWED_EXPENSE_OVERRIDE" }));
  });

  test("does not infer NIIT deductions from itemized rows or modeled SALT", () => {
    const result = calculateFederalTax2025({ ...federalBase, investmentIncome: { taxableInterest: 20_000 }, deductionMode: "itemized", itemizedDeductions: [{ amount: 2_000, deductionType: "Investment interest" }], stateIncomeTax: 10_000 });
    expect(result.netInvestmentIncome).toBe(20_000);
    expect(result.niitDetails.allowedInvestmentExpenses).toBe(0);
  });

  test("combines signed activity losses and expenses before flooring NII", () => {
    const result = calculateFederalTax2025({ ...federalBase, capitalGains: { longTermGains: 15_000 }, investmentIncome: { taxableInterest: 2_000, passiveRentalIncome: -10_000, passiveBusinessIncome: -4_000, otherInvestmentIncome: -1_000, allowedInvestmentExpenses: 3_000 } });
    expect(result.grossNetInvestmentIncome).toBe(2_000);
    expect(result.netInvestmentIncome).toBe(0);
    expect(result.niit).toBe(0);
  });

  test.each([{}, { taxableInterest: 5_000 }])("retains ledger precedence over an aggregate and diagnoses it: %j", (investmentIncome) => {
    const result = calculateFederalTax2025({ ...federalBase, capitalGains: { longTermGains: 20_000 }, investmentIncome, netInvestmentIncome: 99_000 });
    expect(result.netInvestmentIncome).toBe(20_000 + (investmentIncome.taxableInterest ?? 0));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "NIIT_AGGREGATE_IGNORED", field: "netInvestmentIncome" }));
  });

  test("final NII does not replace MAGI and respects signed MAGI adjustments", () => {
    const result = calculateFederalTax2025({ ...federalBase, ordinaryIncomeExcludingSocialSecurity: 199_000, netInvestmentIncome: 40_000, netInvestmentIncomeMode: "final", magiAdjustments: { niit: 6_000 } });
    expect(result.adjustedGrossIncome).toBe(199_000);
    expect(result.niitMagi).toBe(205_000);
    expect(result.niit).toBe(190);
    expect(calculateFederalTax2025({ ...federalBase, ordinaryIncomeExcludingSocialSecurity: 205_000, netInvestmentIncome: 40_000, netInvestmentIncomeMode: "final", magiAdjustments: { niit: -6_000 } }).niit).toBe(0);
  });

  test.each([
    { netInvestmentIncomeMode: "net", netInvestmentIncome: 20_000 },
    { netInvestmentIncomeMode: "final" },
    { netInvestmentIncomeMode: "final", netInvestmentIncome: 20_000, investmentIncome: {} },
    { netInvestmentIncomeMode: "final", netInvestmentIncome: -1 },
    { investmentIncome: { allowedInvestmentExpenses: -1 } },
    { investmentIncome: { capitalGainOrLossAdjustment: Number.NaN } },
    { investmentIncome: { taxableInterest: Number.POSITIVE_INFINITY } },
    { investmentIncome: { unsupportedExpense: 1_000 } },
  ])("rejects malformed or conflicting NIIT inputs %j", (invalid) => {
    expect(() => calculateFederalTax2025({ ...federalBase, ...invalid } as FederalTax2025Input)).toThrow(TaxInputValidationError);
  });

  test.each([undefined, "pre-capital-loss", "final"] as const)("tax plan forwards NIIT mode %s and capital-only inputs", (netInvestmentIncomeMode) => {
    const result = calculateTaxPlan2025({ ...federalBase, state: "TX", stateGrossIncome: 320_000, capitalGains: { longTermGains: 30_000, shortTermLosses: 10_000 }, netInvestmentIncome: netInvestmentIncomeMode ? 25_000 : undefined, netInvestmentIncomeMode });
    const expectedNii = netInvestmentIncomeMode === "final" ? 25_000 : netInvestmentIncomeMode ? 15_000 : 20_000;
    expect(result.federal.netInvestmentIncome).toBe(expectedNii);
    expect(result.federal.niit).toBeCloseTo(expectedNii * 0.038, 8);
  });
});
