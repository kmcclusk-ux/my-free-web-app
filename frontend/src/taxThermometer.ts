import type { CSSProperties } from "react";

export type ThermometerMarker = { amount: number; label: string; detail: string; tone?: string; rate?: number };
export type ThermometerRateBand = { start: number; end: number; label: string; index: number; total: number; colorIndex: number; colorTotal: number };

export type TaxThermometerRateMarker = {
  amount: number;
  rate: number;
  source: string;
};

export type CombinedTaxThermometerMarker = {
  amount: number;
  rate: number;
  sources: string[];
};

type CombinedTaxThermometerOptions = {
  federalBaseRate: number;
  stateBaseRate: number;
  localBaseRate?: number;
  niitThreshold: number;
  niitRate?: number;
};

function finiteNonnegative(value: number) {
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

function normalizeMarkers(markers: TaxThermometerRateMarker[]) {
  return markers
    .filter((marker) => Number.isFinite(marker.amount) && marker.amount >= 0)
    .map((marker) => ({
      amount: marker.amount,
      rate: finiteNonnegative(marker.rate),
      source: marker.source,
    }))
    .sort((left, right) => left.amount - right.amount);
}

function rateAtIncome(markers: TaxThermometerRateMarker[], amount: number, baseRate: number) {
  let rate = finiteNonnegative(baseRate);
  for (const marker of markers) {
    if (marker.amount > amount) break;
    rate = marker.rate;
  }
  return rate;
}

export function buildCombinedTaxThermometerMarkers(
  federalMarkers: TaxThermometerRateMarker[],
  stateMarkers: TaxThermometerRateMarker[],
  localMarkers: TaxThermometerRateMarker[],
  options: CombinedTaxThermometerOptions,
) {
  const federal = normalizeMarkers(federalMarkers);
  const state = normalizeMarkers(stateMarkers);
  const local = normalizeMarkers(localMarkers);
  const niitThreshold = finiteNonnegative(options.niitThreshold);
  const niitRate = finiteNonnegative(options.niitRate ?? 0.038);
  const thresholdSources = new Map<number, string[]>();

  for (const marker of [...federal, ...state, ...local]) {
    if (marker.amount <= 0) continue;
    const sources = thresholdSources.get(marker.amount) || [];
    if (!sources.includes(marker.source)) sources.push(marker.source);
    thresholdSources.set(marker.amount, sources);
  }
  if (niitThreshold > 0 && niitRate > 0) {
    const sources = thresholdSources.get(niitThreshold) || [];
    if (!sources.includes("NIIT")) sources.push("NIIT");
    thresholdSources.set(niitThreshold, sources);
  }

  return [...thresholdSources.entries()]
    .sort(([left], [right]) => left - right)
    .map(([amount, sources]) => {
      const rate = rateAtIncome(federal, amount, options.federalBaseRate)
        + rateAtIncome(state, amount, options.stateBaseRate)
        + rateAtIncome(local, amount, options.localBaseRate ?? 0)
        + (amount >= niitThreshold ? niitRate : 0);
      return { amount, rate, sources };
    })
    .filter((marker, index, allMarkers) => index === 0 || Math.abs(marker.rate - allMarkers[index - 1].rate) > 0.0000001);
}

export function taxScheduleBaseRate(brackets: ReadonlyArray<{ threshold: number; rate: number }>) {
  return brackets.find((bracket) => bracket.threshold === 0)?.rate ?? 0;
}

export function getThermometerScale(values: ReadonlyArray<{ amount: number }>, markers: ThermometerMarker[]) {
  const valueMax = Math.max(1000, ...values.map((value) => value.amount));
  const sortedMarkers = [...markers].sort((a, b) => a.amount - b.amount);
  const nearbyCeiling = Math.max(valueMax * 1.35, valueMax + 75000);
  const nextMarker = sortedMarkers.find((marker) => marker.amount > valueMax);
  const nearbyMarkers = sortedMarkers.filter((marker) => marker.amount <= nearbyCeiling);
  const shouldIncludeNextInScale = Boolean(
    nextMarker &&
    (nearbyMarkers.length === 0 || nextMarker.amount <= Math.max(valueMax * 1.75, valueMax + 125000))
  );
  const scaleBase = Math.max(
    valueMax,
    ...nearbyMarkers.map((marker) => marker.amount),
    ...(shouldIncludeNextInScale && nextMarker ? [nextMarker.amount] : [])
  );
  const increment = scaleBase <= 100000 ? 10000 : scaleBase <= 500000 ? 25000 : 50000;
  const scaleMax = Math.ceil((scaleBase * 1.08) / increment) * increment;
  return {
    scaleMax,
    visibleMarkers: sortedMarkers.filter((marker) => marker.amount <= scaleMax),
  };
}

export function buildThermometerRateBands(markers: ThermometerMarker[], scaleMax: number, baseRateLabel: string): ThermometerRateBand[] {
  const sortedMarkers = [...markers].sort((first, second) => first.amount - second.amount);
  const allBands = [
    { start: 0, end: sortedMarkers[0]?.amount ?? scaleMax, label: baseRateLabel },
    ...sortedMarkers.map((marker, index) => ({
      start: marker.amount,
      end: sortedMarkers[index + 1]?.amount ?? Number.POSITIVE_INFINITY,
      label: marker.label,
    })),
  ].filter((band) => band.end > band.start);
  const visibleBands = allBands
    .map((band, colorIndex) => ({ ...band, colorIndex, colorTotal: allBands.length }))
    .filter((band) => band.start < scaleMax)
    .map((band) => ({ ...band, end: Math.min(band.end, scaleMax) }));
  return visibleBands.map((band, index) => ({ ...band, index, total: visibleBands.length }));
}

export function rateBandStyle(band: ThermometerRateBand, scaleMax: number) {
  const start = Math.max(0, Math.min(100, (band.start / scaleMax) * 100));
  const end = Math.max(start, Math.min(100, (band.end / scaleMax) * 100));
  const { background, border } = rateBandColors(band);
  return {
    "--rate-start": `${start}%`,
    "--rate-size": `${end - start}%`,
    "--rate-band-bg": background,
    "--rate-band-border": border,
  } as CSSProperties;
}

function rateBandColors(band: ThermometerRateBand) {
  const position = band.colorTotal <= 1 ? 0 : band.colorIndex / (band.colorTotal - 1);
  const hue = Math.round(145 - position * 145);
  const saturation = Math.round(58 + position * 14);
  const lightness = Math.round(85 - position * 14);
  return {
    background: `hsl(${hue} ${saturation}% ${lightness}% / .82)`,
    border: `hsl(${hue} ${saturation}% ${Math.max(34, lightness - 26)}% / .42)`,
  };
}

export function rateBandGradientStops(bands: ThermometerRateBand[], scaleMax: number) {
  if (bands.length === 0) return "rgba(248, 250, 252, .82) 0% 100%";
  return bands.map((band) => {
    const start = Math.max(0, Math.min(100, (band.start / scaleMax) * 100));
    const end = Math.max(start, Math.min(100, (band.end / scaleMax) * 100));
    return `${rateBandColors(band).background} ${start}% ${end}%`;
  }).join(", ");
}
