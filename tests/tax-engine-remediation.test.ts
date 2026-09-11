import { describe, expect, test } from "vitest";
import { calculateFederalTax2025, calculateTaxPlan2025, federalSaltCap2025, federalStandardDeduction2025, type FederalTax2025Input } from "../amplify/backend/function/helloWorld/src/taxCalcs";
import { calculateW2PayrollTaxForWorkers } from "../amplify/backend/function/helloWorld/src/payrollTax2025";

const federalBase: FederalTax2025Input = { filingStatus: "single", ordinaryIncomeExcludingSocialSecurity: 100_000, preferredIncome: 0 };

describe("2025 official worksheet regressions", () => {
  test("Schedule A worksheet lines 5-10 halves the final MFS cap, not the phaseout threshold twice", () => {
    expect(federalSaltCap2025("mfs", 300_000)).toBe(12_500);
    expect(federalSaltCap2025("mfs", 350_000)).toBe(5_000);
    expect(federalSaltCap2025("mfj", 550_000)).toBe(25_000);
  });

  test.each([
    [20_000, 0, 0, 30_000, 0, 0, 3_000, 0, 7_000],
    [0, 30_000, 20_000, 0, 0, 0, 3_000, 7_000, 0],
    [10_000, 0, 20_000, 0, 10_000, 20_000, 0, 0, 0],
    [0, 12_000, 0, 20_000, 0, 0, 3_000, 9_000, 20_000],
    [30_000, 0, 0, 10_000, 20_000, 0, 0, 0, 0],
  ])("Schedule D ST/LT netting: %j/%j/%j/%j", (shortTermGains, shortTermLosses, longTermGains, longTermLosses, ordinaryGain, preferentialGain, capitalLossDeduction, shortTermCarryover, longTermCarryover) => {
    const result = calculateFederalTax2025({ ...federalBase, capitalGains: { shortTermGains, shortTermLosses, longTermGains, longTermLosses } });
    expect(result.capital).toMatchObject({ ordinaryGain, preferentialGain, capitalLossDeduction, shortTermCarryover, longTermCarryover });
  });

  test("unused capital loss is retained when the standard deduction absorbs all income", () => {
    const result = calculateFederalTax2025({ ...federalBase, ordinaryIncomeExcludingSocialSecurity: 10_000, capitalGains: { shortTermLosses: 12_000 } });
    expect(result.capital.capitalLossDeduction).toBe(3_000);
    expect(result.capital.lossUsedForCarryover).toBe(0);
    expect(result.capital.shortTermCarryover).toBe(12_000);
    expect(result.incomeTax).toBe(0);
  });

  test("qualified dividends are not netted as capital gains", () => {
    const result = calculateFederalTax2025({ ...federalBase, preferredIncome: 10_000, capitalGains: { shortTermLosses: 8_000 } });
    expect(result.preferredIncomeAfterCapitalLoss).toBe(10_000);
    expect(result.capital.capitalLossDeduction).toBe(3_000);
    expect(result.capital.shortTermCarryover).toBe(5_000);
  });

  test("Form 8960 subtracts the allowable net investment capital loss from investment interest", () => {
    const result = calculateFederalTax2025({ ...federalBase, ordinaryIncomeExcludingSocialSecurity: 280_000, netInvestmentIncome: 30_000, aboveLineDeductions: [{ amount: 3_000, deductionType: "Investment loss (short term)" }] });
    expect(result.netInvestmentIncome).toBe(27_000);
    expect(result.niit).toBe(1_026);
  });

  test("Form 8960 separate ledger deducts allocable expenses and uses NIIT MAGI", () => {
    const result = calculateFederalTax2025({ ...federalBase, ordinaryIncomeExcludingSocialSecurity: 205_000, investmentIncome: { taxableInterest: 20_000, allowedInvestmentExpenses: 2_000 }, magiAdjustments: { niit: 10_000 } });
    expect(result.netInvestmentIncome).toBe(18_000);
    expect(result.niitMagi).toBe(215_000);
    expect(result.niit).toBe(570);
  });

  test("Publication 915 distinguishes MFS lived apart from living together", () => {
    const input = { ...federalBase, filingStatus: "mfs" as const, ordinaryIncomeExcludingSocialSecurity: 0, socialSecurityBenefits: 20_000 };
    expect(calculateFederalTax2025(input).taxableSocialSecurity).toBe(8_500);
    expect(calculateFederalTax2025({ ...input, marriedFilingSeparatelyLivedApart: true }).taxableSocialSecurity).toBe(0);
  });

  test("surviving spouse uses joint ordinary rates but the single Social Security base", () => {
    const result = calculateFederalTax2025({ ...federalBase, qualifyingSurvivingSpouse: true, ordinaryIncomeExcludingSocialSecurity: 20_000, socialSecurityBenefits: 20_000 });
    expect(result.taxableSocialSecurity).toBe(2_500);
    expect(result.deductions.standardDeduction).toBe(31_500);
    expect(result.niitThreshold).toBe(250_000);
  });

  test("medical automatic and already-allowed amounts have distinct contracts", () => {
    const automatic = calculateFederalTax2025({ ...federalBase, deductionMode: "itemized", itemizedDeductions: [{ amount: 10_000, deductionType: "Medical expenses", calculationMode: "automatic" }] });
    const allowed = calculateFederalTax2025({ ...federalBase, deductionMode: "itemized", itemizedDeductions: [{ amount: 2_500, deductionType: "Medical expenses" }] });
    expect(automatic.deductions.itemizedDeduction).toBe(2_500);
    expect(allowed.deductions.itemizedDeduction).toBe(2_500);
  });

  test("taxes paid replaces the planning liability assumption instead of doubling SALT", () => {
    const result = calculateFederalTax2025({ ...federalBase, deductionMode: "itemized", stateIncomeTax: 9_000, localIncomeTax: 2_000, salt: { mode: "taxes-paid", election: "sales", salesTaxPaid: 3_000, realEstateTaxPaid: 5_000, personalPropertyTaxPaid: 0 } });
    expect(result.deductions.saltEntered).toBe(8_000);
    expect(result.deductions.saltMode).toBe("taxes-paid");
  });

  test("Publication 501 and Schedule 1-A age benefits remain separate", () => {
    expect(federalStandardDeduction2025("single", { taxpayerAge65OrOlder: true, taxpayerBlind: true })).toBe(19_750);
    expect(federalStandardDeduction2025("mfs", { spouseItemizes: true })).toBe(0);
    expect(federalStandardDeduction2025("single", { canBeClaimedAsDependent: true, dependentEarnedIncome: 2_000 })).toBe(2_450);
    const result = calculateFederalTax2025({ ...federalBase, ordinaryIncomeExcludingSocialSecurity: 100_000, standardDeductionFacts: { taxpayerAge65OrOlder: true }, schedule1A: { claimSeniorDeduction: true, taxpayerHasValidSsn: true } });
    expect(result.deductions.standardDeduction).toBe(17_750);
    expect(result.deductions.seniorDeduction).toBe(4_500);
    expect(result.adjustedGrossIncome).toBe(100_000);
    expect(result.taxableIncome).toBe(77_750);
  });

  test.each([NaN, Infinity, -1, "100000"])("invalid money %s is not silently replaced by zero", (value) => {
    expect(() => calculateFederalTax2025({ ...federalBase, ordinaryIncomeExcludingSocialSecurity: value as number })).toThrow("ordinaryIncomeExcludingSocialSecurity");
  });

  test("unsupported special gains and tax years produce explicit diagnostics", () => {
    expect(() => calculateFederalTax2025({ ...federalBase, taxYear: 2026 })).toThrow("2025");
    expect(() => calculateFederalTax2025({ ...federalBase, capitalGains: { collectiblesGain: 5_000 } })).toThrow("special capital-gain");
    expect(() => calculateFederalTax2025({ ...federalBase, aboveLineDeductions: [{ amount: 50, deductionType: "" }] })).toThrow("category");
  });
});

describe("worker-level payroll and spendable income", () => {
  test("two spouses have separate Social Security caps; two jobs for one worker do not", () => {
    const spouses = calculateW2PayrollTaxForWorkers([{ workerId: "a", wages: 100_000 }, { workerId: "b", wages: 100_000 }], "mfj", "TX");
    const jobs = calculateW2PayrollTaxForWorkers([{ workerId: "a", wages: 100_000 }, { workerId: "a", wages: 100_000 }], "mfj", "TX");
    expect(spouses.federal.socialSecurity).toBe(12_400);
    expect(jobs.federal.socialSecurity).toBe(10_918.2);
  });

  test("DE covered full plan charges the elected employee share and HI honors worked weeks", () => {
    const delaware = calculateW2PayrollTaxForWorkers([{ workerId: "a", wages: 100_000 }], "single", "DE", { a: { delawarePaidLeave: { coverage: "full", employeeShare: 0.5 } } });
    expect(delaware.state.total).toBe(400);
    const hawaii = calculateW2PayrollTaxForWorkers([{ workerId: "a", wages: 100_000 }], "single", "HI", { a: { hawaiiTdi: { weeksWorked: 10 } } });
    expect(hawaii.state.total).toBeCloseTo(72.1, 8);
  });

  test("exclusion changes spendability but not any tax and can make income negative", () => {
    const input = { filingStatus: "mfj" as const, state: "CA", ordinaryIncomeExcludingSocialSecurity: 300_000, preferredIncome: 0, stateGrossIncome: 300_000, w2Income: 300_000, w2Workers: [{ workerId: "a", wages: 150_000 }, { workerId: "b", wages: 150_000 }], totalIncome: 300_000, displayIncome: 300_000 };
    const included = calculateTaxPlan2025(input);
    const excluded = calculateTaxPlan2025({ ...input, displayIncome: 0 });
    expect(included.payroll.federal.socialSecurity).toBe(18_600);
    expect(excluded.totalTax).toBe(included.totalTax);
    expect(excluded.afterTaxIncome).toBe(-excluded.totalTax);
    expect(included.afterTaxIncome - excluded.afterTaxIncome).toBe(300_000);
  });
});
