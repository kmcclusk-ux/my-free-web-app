export type QuickCalculatorHandoff = {
  version: 1;
  id: string;
  createdAt: string;
  ordinaryIncome: number;
  investmentIncome: number;
  investmentTaxTreatment: string;
  filingStatus: 'single' | 'mfj' | 'mfs' | 'hoh';
  deductionMode: 'standard' | 'itemized';
  itemizedDeduction: number;
  stateCode: string;
  localityId: string;
};

export function parseQuickCalculatorHandoff(raw: unknown, now = Date.now()): QuickCalculatorHandoff | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as QuickCalculatorHandoff;
  const createdAt = Date.parse(value.createdAt);
  if (value.version !== 1 || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id)) return null;
  if (!Number.isFinite(createdAt) || createdAt > now + 300000 || now - createdAt > 86400000) return null;
  if (![value.ordinaryIncome, value.investmentIncome, value.itemizedDeduction].every(amount => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0)) return null;
  if (!['single', 'mfj', 'mfs', 'hoh'].includes(value.filingStatus) || !['standard', 'itemized'].includes(value.deductionMode)) return null;
  if (typeof value.stateCode !== 'string' || !/^[A-Z]{2}$/.test(value.stateCode) || typeof value.localityId !== 'string') return null;
  if (!['income', 'muni-bonds', 'state tax free', 'fed tax free', 'qualified-div', 'non-qualified-div', 'short term gain', 'long term gain'].includes(value.investmentTaxTreatment)) return null;
  return value;
}

export function quickCalculatorIncomeRecords(handoff: QuickCalculatorHandoff, firstId: number) {
  const accountName = `Quick calculator ${handoff.id}`;
  const accountTypeName = `Quick calculator taxable ${handoff.id}`;
  const entries = [
    { suffix: 'ordinary', amount: handoff.ordinaryIncome, treatment: 'income', category: 'non investment income' },
    { suffix: 'investment', amount: handoff.investmentIncome, treatment: handoff.investmentTaxTreatment, category: 'investment income' },
  ].filter(entry => entry.amount > 0);
  const investments = entries.map((entry, index) => ({
    id: firstId + index, description: `${entry.suffix === 'ordinary' ? 'Ordinary' : 'Investment'} income imported from quick calculator`,
    account: accountName, category: entry.category, totalInvestment: 0, yearlyIncome: entry.amount,
    includeIncome: true, overrideProposal: false, symbol: `QC-${handoff.id}-${entry.suffix}`,
    newSymbol: '', incomeMode: 'annual-income' as const,
  }));
  const assets = entries.map((entry, index) => ({
    id: firstId + index, symbol: investments[index].symbol, percentReturn: 0, assetType: 'Income',
    category: entry.category, taxTreatment: entry.treatment, incomeItem: true, extraData: 0,
    description: investments[index].description, exDividend: '', divPayout: '',
  }));
  return {
    investments, assets,
    account: { id: firstId, account: accountName, accountType: accountTypeName, taxStatus: 'taxable', dividendAccrued: 'no', includeInFreeCashflow: 'yes' },
    accountType: { id: firstId, name: accountTypeName, taxStatus: 'taxable', includeInAllocation: false },
  };
}
