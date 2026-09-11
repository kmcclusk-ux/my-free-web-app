import { describe, expect, test } from "vitest";
import { createRequire } from "node:module";
import { buildCombinedTaxThermometerMarkers, buildThermometerRateBands, getThermometerScale, taxScheduleBaseRate } from "../frontend/src/taxThermometer";
import { TaxThermometer } from "../frontend/src/TaxThermometerView";

const requireFrontend = createRequire(new URL("../frontend/package.json", import.meta.url));
const { createElement } = requireFrontend("react");
const { renderToStaticMarkup } = requireFrontend("react-dom/server");

describe("combined tax thermometer thresholds", () => {
  test("adds federal, California, and NIIT marginal changes without descending labels", () => {
    const markers = buildCombinedTaxThermometerMarkers(
      [
        { amount: 23_850, rate: 0.12, source: "Federal" },
        { amount: 96_950, rate: 0.22, source: "Federal" },
        { amount: 206_700, rate: 0.24, source: "Federal" },
        { amount: 394_600, rate: 0.32, source: "Federal" },
        { amount: 501_050, rate: 0.35, source: "Federal" },
        { amount: 751_600, rate: 0.37, source: "Federal" },
      ],
      [
        { amount: 22_158, rate: 0.02, source: "CA" },
        { amount: 52_528, rate: 0.04, source: "CA" },
        { amount: 82_904, rate: 0.06, source: "CA" },
        { amount: 115_084, rate: 0.08, source: "CA" },
        { amount: 145_448, rate: 0.093, source: "CA" },
        { amount: 742_958, rate: 0.103, source: "CA" },
      ],
      [],
      { federalBaseRate: 0.10, stateBaseRate: 0.01, niitThreshold: 250_000 },
    );

    expect(markers.find((marker) => marker.amount === 250_000)?.rate).toBeCloseTo(0.371, 8);
    expect(markers.find((marker) => marker.amount === 394_600)?.rate).toBeCloseTo(0.451, 8);
    expect(markers.find((marker) => marker.amount === 501_050)?.rate).toBeCloseTo(0.481, 8);
    expect(markers.map((marker) => marker.rate)).toEqual([...markers].sort((left, right) => left.rate - right.rate).map((marker) => marker.rate));
  });

  test("preserves a real rate reduction instead of forcing a running maximum", () => {
    const markers = buildCombinedTaxThermometerMarkers(
      [{ amount: 50_000, rate: 0.24, source: "Federal" }],
      [{ amount: 100_000, rate: 0.02, source: "State" }],
      [],
      { federalBaseRate: 0.22, stateBaseRate: 0.05, niitThreshold: 250_000, niitRate: 0 },
    );
    expect(markers.map((marker) => marker.amount)).toEqual([50_000, 100_000]);
    expect(markers.map((marker) => Number(marker.rate.toFixed(3)))).toEqual([0.29, 0.26]);
  });

  test("keeps fractional state/local rates and merges coincident thresholds", () => {
    const markers = buildCombinedTaxThermometerMarkers(
      [{ amount: 100_000, rate: 0.24, source: "Federal" }],
      [{ amount: 100_000, rate: 0.0425, source: "State" }],
      [{ amount: 100_000, rate: 0.03735, source: "Local" }],
      { federalBaseRate: 0.22, stateBaseRate: 0, niitThreshold: 250_000 },
    );
    expect(markers).toHaveLength(2);
    expect(markers[0].sources).toEqual(["Federal", "State", "Local"]);
    expect(markers[0].rate).toBeCloseTo(0.31985, 10);
  });

  test("a state's tax-free initial range retains a zero base rate", () => {
    expect(taxScheduleBaseRate([{ threshold: 10_000, rate: 0.044 }])).toBe(0);
    expect(taxScheduleBaseRate([{ threshold: 0, rate: 0.0425 }])).toBe(0.0425);
    expect(taxScheduleBaseRate([])).toBe(0);
  });

  test("does not pin an out-of-scale cutoff onto the top of the thermometer", () => {
    const nearby = { amount: 500, label: "1%", detail: "Base bracket" };
    const result = getThermometerScale([{ amount: 1_000 }], [nearby, { amount: 1_000_000, label: "4%", detail: "Surtax" }]);
    expect(result.scaleMax).toBeLessThan(1_000_000);
    expect(result.visibleMarkers).toEqual([nearby]);
  });

  test("changing scale does not change the color assigned to an existing band", () => {
    const markers = [{ amount: 100_000, label: "22%", detail: "Federal" }, { amount: 200_000, label: "24%", detail: "Federal" }];
    const before = buildThermometerRateBands(markers, 150_000, "12%");
    const after = buildThermometerRateBands(markers, 250_000, "12%");
    expect(before.map(({ label, colorIndex, colorTotal }) => ({ label, colorIndex, colorTotal }))).toEqual(after.slice(0, 2).map(({ label, colorIndex, colorTotal }) => ({ label, colorIndex, colorTotal })));
  });

  test("the actual rendered band retains 45.1% even when the current rate is 30.5%", () => {
    const html = renderToStaticMarkup(createElement(TaxThermometer, {
      title: "All taxes",
      subtitle: "Ordinary-income schedule",
      taxableIncome: 420_000,
      values: [{ amount: 420_000, label: "Taxable income", value: "$420,000", tone: "tax" }],
      markers: [
        { amount: 250_000, label: "37.1%", detail: "NIIT" },
        { amount: 394_600, label: "45.1%", detail: "Federal" },
        { amount: 501_050, label: "48.1%", detail: "Federal" },
      ],
      stats: [],
      footerLabel: "",
      footerValue: "",
      baseRateLabel: "33.3%",
      currentRateLabel: "30.5%",
    }));
    const labels = [...html.matchAll(/class="tax-thermometer__rate-band[\s\S]*?<span>([^<]+)<\/span>/g)].map((match) => match[1]);
    expect(labels).toEqual(["33.3%", "37.1%", "45.1%", "48.1%"]);
  });
});
