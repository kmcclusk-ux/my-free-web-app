import { describe, expect, it } from "vitest";
import { selectedRowsAfterTaxIncome, sumIncludedInvestmentIncome } from "../frontend/src/investmentTableTotals";

describe("investment table income totals", () => {
  it("updates annual and monthly dividends from included rows", () => {
    const rows = [
      { includeIncome: true, yearlyIncome: 1_200, monthlyIncome: 100, displayYearlyIncome: 1_200, displayMonthlyIncome: 100 },
      { includeIncome: false, yearlyIncome: 2_400, monthlyIncome: 200, displayYearlyIncome: 2_400, displayMonthlyIncome: 200 },
      { includeIncome: true, yearlyIncome: 3_600, monthlyIncome: 300, displayYearlyIncome: 0, displayMonthlyIncome: 0 },
    ];

    expect(sumIncludedInvestmentIncome(rows)).toEqual({ yearlyIncome: 4_800, monthlyIncome: 400 });

    rows[1].includeIncome = true;
    expect(sumIncludedInvestmentIncome(rows)).toEqual({ yearlyIncome: 7_200, monthlyIncome: 600 });

    rows[0].includeIncome = false;
    expect(sumIncludedInvestmentIncome(rows)).toEqual({ yearlyIncome: 6_000, monthlyIncome: 500 });
  });

  it("uses all selected income for the top after-tax total", () => {
    expect(selectedRowsAfterTaxIncome(640, 0)).toBe(640);
    expect(selectedRowsAfterTaxIncome(640, 140)).toBe(500);
  });
});
