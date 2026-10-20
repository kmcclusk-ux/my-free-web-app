type InvestmentIncomeRow = {
  includeIncome: boolean;
  yearlyIncome: number;
  monthlyIncome: number;
};

type SelectableInvestmentRow = {
  id: number;
  includeIncome: boolean;
};

export function sumIncludedInvestmentIncome(rows: readonly InvestmentIncomeRow[]) {
  return rows.reduce((totals, row) => {
    if (!row.includeIncome) return totals;
    totals.yearlyIncome += Number.isFinite(row.yearlyIncome) ? row.yearlyIncome : 0;
    totals.monthlyIncome += Number.isFinite(row.monthlyIncome) ? row.monthlyIncome : 0;
    return totals;
  }, { yearlyIncome: 0, monthlyIncome: 0 });
}

export function selectedRowsAfterTaxIncome(totalIncome: number, totalTax: number) {
  const includedIncome = Number.isFinite(totalIncome) ? totalIncome : 0;
  const taxBurden = Number.isFinite(totalTax) ? Math.max(totalTax, 0) : 0;
  return includedIncome - taxBurden;
}

export function setVisibleInvestmentRowsIncluded<T extends SelectableInvestmentRow>(
  rows: readonly T[],
  visibleRowIds: readonly number[],
  includeIncome: boolean,
) {
  const visibleIds = new Set(visibleRowIds);
  return rows.map((row) => visibleIds.has(row.id) && row.includeIncome !== includeIncome
    ? { ...row, includeIncome }
    : row);
}
