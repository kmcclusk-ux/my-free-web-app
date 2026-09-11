import { describe, expect, it } from 'vitest';
import { parseQuickCalculatorHandoff, quickCalculatorIncomeRecords, type QuickCalculatorHandoff } from '../frontend/src/quickCalculatorHandoff';
import { fedTaxAdjust, stateTaxAdjust } from '../frontend/src/taxTreatmentRules';

const handoff: QuickCalculatorHandoff = { version: 1, id: 'synthetic-import', createdAt: new Date().toISOString(), ordinaryIncome: 100000, investmentIncome: 10000, investmentTaxTreatment: 'fed tax free', filingStatus: 'single', deductionMode: 'standard', itemizedDeduction: 0, stateCode: 'CA', localityId: 'none' };

describe('quick calculator tax-character handoff', () => {
  it('keeps federally exempt investment income out of wages/federal ordinary income', () => {
    const records = quickCalculatorIncomeRecords(handoff, 100);
    expect(records.account.account).not.toBe('Income');
    expect(records.account.accountType).not.toContain('W2');
    expect(records.assets.map(asset => asset.taxTreatment)).toEqual(['income', 'fed tax free']);
    expect(fedTaxAdjust(records.investments[1].yearlyIncome, records.assets[1].taxTreatment)).toBe(0);
    expect(stateTaxAdjust(records.investments[1].yearlyIncome, records.assets[1].taxTreatment)).toBe(10000);
    expect(records.investments.every(row => row.incomeMode === 'annual-income')).toBe(true);
  });

  it('preserves qualified dividends and stable import identities without overwriting another account', () => {
    const first = quickCalculatorIncomeRecords({ ...handoff, investmentTaxTreatment: 'qualified-div' }, 100);
    const repeated = quickCalculatorIncomeRecords(handoff, 200);
    expect(first.investments.map(row => row.symbol)).toEqual(repeated.investments.map(row => row.symbol));
    expect(fedTaxAdjust(10000, first.assets[1].taxTreatment, true)).toBe(10000);
    expect(fedTaxAdjust(10000, first.assets[1].taxTreatment, false)).toBe(0);
  });

  it('validates financial inputs, import age, and unsupported special tax treatment', () => {
    expect(parseQuickCalculatorHandoff(handoff)).toEqual(handoff);
    for (const invalid of [{ ordinaryIncome: -1 }, { investmentIncome: NaN }, { itemizedDeduction: '1000' }, { version: 3 }, { investmentTaxTreatment: 'section 1256' }, { createdAt: '2000-01-01' }]) {
      expect(parseQuickCalculatorHandoff({ ...handoff, ...invalid })).toBeNull();
    }
  });
});
