type InvestmentIncomeRow = {
  includeIncome: boolean;
  yearlyIncome: number;
  monthlyIncome: number;
};

export function sumIncludedInvestmentIncome(rows: readonly InvestmentIncomeRow[]) {
  return rows.reduce((totals, row) => {
    if (!row.includeIncome) return totals;
    totals.yearlyIncome += Number.isFinite(row.yearlyIncome) ? row.yearlyIncome : 0;
    totals.monthlyIncome += Number.isFinite(row.monthlyIncome) ? row.monthlyIncome : 0;
    return totals;
  }, { yearlyIncome: 0, monthlyIncome: 0 });
}
