import { describe, expect, it } from 'vitest';
import { investmentResult } from '../snapshot-calculator/src/calculation';
import { calculateTaxPlan2025 } from '../amplify/backend/function/helloWorld/src/taxCalcs';

describe('snapshot and portfolio engine agreement', () => {
  it('does not apply a federal deduction to the California base', () => {
    const investment = { amount: 100000, yieldPercent: 5, taxType: 'ordinary' };
    const first = investmentResult(investment, 30000, 'single', 'CA', 15750, 2000);
    const second = investmentResult(investment, 30000, 'single', 'CA', 25000, 2000);
    expect(first.stateTax).toBe(second.stateTax);
    expect(first.federalTax).not.toBe(second.federalTax);
  });

  it.each(['single', 'mfj', 'mfs', 'hoh'] as const)('matches a portfolio incremental investment under %s assumptions', filingStatus => {
    const snapshot = investmentResult({ amount: 100000, yieldPercent: 5, taxType: 'qualified' }, 300000, filingStatus, 'CA', 20000, 10000);
    const request = { filingStatus, state: 'CA', ordinaryIncomeExcludingSocialSecurity: 300000, preferredIncome: 0, stateGrossIncome: 300000, federalDeductionMode: 'itemized' as const, federalItemizedDeductions: [{ amount: 20000, deductionType: 'Other itemized deduction' }], stateStandardDeduction: 10000, salt: { mode: 'taxes-paid' as const, stateIncomeTaxPaid: 0, localIncomeTaxPaid: 0, realEstateTaxPaid: 0, personalPropertyTaxPaid: 0 } };
    const baseline = calculateTaxPlan2025(request);
    const scenario = calculateTaxPlan2025({ ...request, preferredIncome: 5000, stateGrossIncome: 305000, netInvestmentIncome: 5000 });
    expect(snapshot.taxCost).toBeCloseTo(scenario.totalTax - baseline.totalTax, 8);
    expect(snapshot.afterTaxIncome).toBeCloseTo(5000 - snapshot.taxCost, 8);
  });

  it('applies only the selected tax character and rejects malformed inputs', () => {
    expect(investmentResult({ amount: 100000, yieldPercent: 5, taxType: 'treasury' }, 300000, 'single', 'CA', 15750, 5706).stateTax).toBe(0);
    expect(investmentResult({ amount: 100000, yieldPercent: 5, taxType: 'ordinary' }, 300000, 'single', 'TX', 15750, 0).stateTax).toBe(0);
    expect(() => investmentResult({ amount: 100000, yieldPercent: Infinity, taxType: 'ordinary' }, 300000, 'single', 'CA')).toThrow('finite');
  });
});
