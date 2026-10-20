import { describe, expect, it } from "vitest";
import { selectedRowsAfterTaxIncome, setVisibleInvestmentRowsIncluded, sumIncludedInvestmentIncome } from "../frontend/src/investmentTableTotals";

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

  it("changes inclusion only for rows currently visible", () => {
    const rows = [
      { id: 1, includeIncome: false, label: "visible" },
      { id: 2, includeIncome: true, label: "hidden" },
      { id: 3, includeIncome: false, label: "visible" },
    ];

    const selected = setVisibleInvestmentRowsIncluded(rows, [1, 3], true);
    expect(selected.map((row) => row.includeIncome)).toEqual([true, true, true]);
    expect(selected[1]).toBe(rows[1]);

    const deselected = setVisibleInvestmentRowsIncluded(selected, [1, 3], false);
    expect(deselected.map((row) => row.includeIncome)).toEqual([false, true, false]);
  });
});
