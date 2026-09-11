import React, { Fragment } from "react";
import { buildThermometerRateBands, getThermometerScale, rateBandGradientStops, rateBandStyle, type ThermometerMarker } from "./taxThermometer";

export type ThermometerValue = { amount: number; label: string; value: string; tone: string; content?: React.ReactNode };
export type ThermometerStat = { label: string; value: string; tone?: string };

function formatCurrency(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function formatCurrencyDetailed(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value); }
function formatSignedCurrency(value: number) { return Math.abs(value) < 0.5 ? "$0" : `${value > 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`; }

export function TaxThermometer({ title, titleLabel, titleValue, subtitle, taxableIncome, values, markers, stats, footerLabel, footerValue, baseRateLabel, currentRateLabel, noTaxStamp }: { title: React.ReactNode; titleLabel?: string; titleValue?: string; subtitle: string; taxableIncome: number; values: ThermometerValue[]; markers: ThermometerMarker[]; stats: ThermometerStat[]; footerLabel: string; footerValue: string; baseRateLabel: string; currentRateLabel?: string; noTaxStamp?: string }) {
  const labelText = titleLabel || (typeof title === "string" ? title : "Tax thermometer");
  const { scaleMax, visibleMarkers } = getThermometerScale(values, markers);
  const positionStyle = (amount: number) => ({ "--thermo-position": `${Math.max(0, Math.min(100, (amount / scaleMax) * 100))}%` } as React.CSSProperties);
  const sortedRateMarkers = [...markers].sort((first, second) => first.amount - second.amount);
  const lowerBracketBoundary = [...sortedRateMarkers].reverse().find((marker) => marker.amount <= taxableIncome);
  const upperBracketBoundary = sortedRateMarkers.find((marker) => marker.amount > taxableIncome);
  const rateBands = buildThermometerRateBands(markers, scaleMax, baseRateLabel);
  const trackStyle = { "--rate-gradient-stops": rateBandGradientStops(rateBands, scaleMax) } as React.CSSProperties;

  return (
    <div className="tax-thermometer" aria-label={`${labelText}. ${subtitle}`}>
      <>
          {titleValue && <div className="tax-thermometer__title-value">{titleValue}</div>}
          <div className="tax-thermometer__track" aria-label={`${labelText} tax threshold thermometer`} style={trackStyle}>
            {noTaxStamp && <div className="tax-thermometer__no-tax-stamp" aria-label={noTaxStamp}>{noTaxStamp}</div>}
            {rateBands.map((band) => (
              <div
                key={`${band.label}-${band.start}-${band.end}`}
                className={`tax-thermometer__rate-band ${band.index === 0 ? "tax-thermometer__rate-band--first" : ""} ${band.index === band.total - 1 ? "tax-thermometer__rate-band--last" : ""} ${band.end - band.start < scaleMax * 0.055 ? "tax-thermometer__rate-band--compact" : ""}`.trim()}
                style={rateBandStyle(band, scaleMax)}
                title={`${band.label} bracket: ${formatCurrency(band.start)} to ${band.end >= scaleMax ? `${formatCurrency(scaleMax)}+` : formatCurrency(band.end)}${currentRateLabel && taxableIncome >= band.start && taxableIncome <= band.end ? `. Current marginal rate: ${currentRateLabel}` : ""}`}
              >
                <span>{band.label}</span>
              </div>
            ))}
            {values.map((value) => (
              <div
                key={`${value.label}-${value.tone}-fill`}
                className={`tax-thermometer__value-fill tax-thermometer__value-fill--${value.tone}`}
                style={positionStyle(value.amount)}
                aria-hidden="true"
              />
            ))}
            <div className="tax-thermometer__heat" />
            {visibleMarkers.map((marker) => {
              const isLowerBoundary = lowerBracketBoundary?.amount === marker.amount;
              const isUpperBoundary = upperBracketBoundary?.amount === marker.amount;
              const distance = isLowerBoundary
                ? Math.max(taxableIncome - marker.amount, 0)
                : Math.max(marker.amount - taxableIncome, 0);
              const distanceLabel = isLowerBoundary
                ? `Subtract ${formatCurrencyDetailed(distance)}`
                : isUpperBoundary
                  ? `Add ${formatCurrencyDetailed(distance)}`
                  : "";
              const titleDistance = isLowerBoundary
                ? `${distanceLabel} of taxable income to reach the prior bracket boundary`
                : isUpperBoundary
                  ? `${distanceLabel} of taxable income to enter the ${marker.label} bracket`
                  : `${formatSignedCurrency(taxableIncome - marker.amount)} vs current taxable income`;
              const distanceBubbleAmount = (taxableIncome + marker.amount) / 2;

              return (
                <Fragment key={`${marker.label}-${marker.amount}`}>
                  <div
                    className={`tax-thermometer__tick tax-thermometer__tick--${marker.tone || "default"} ${isLowerBoundary || isUpperBoundary ? "tax-thermometer__tick--adjacent" : ""}`.trim()}
                    style={positionStyle(marker.amount)}
                    title={`${marker.detail}: ${formatCurrency(marker.amount)} (${titleDistance})`}
                    aria-label={`${marker.detail}: ${formatCurrency(marker.amount)}. ${titleDistance}`}
                    tabIndex={0}
                  >
                    <span className="tax-thermometer__tick-label">
                      <strong>{formatCurrency(marker.amount)}</strong>
                    </span>
                  </div>
                  {distanceLabel && (
                    <div
                      className={`tax-thermometer__distance-bubble ${isLowerBoundary ? "tax-thermometer__distance-bubble--past" : "tax-thermometer__distance-bubble--away"}`}
                      style={positionStyle(distanceBubbleAmount)}
                      title={titleDistance}
                      aria-label={titleDistance}
                      tabIndex={0}
                    >
                      <span className="tax-thermometer__distance-arrow">{isLowerBoundary ? "↓" : "↑"}</span>
                      <span>{distanceLabel}</span>
                    </div>
                  )}
                </Fragment>
              );
            })}
            {values.map((value) => (
              <div
                key={`${value.label}-${value.tone}`}
                className={`tax-thermometer__value tax-thermometer__value--${value.tone}`}
                style={positionStyle(value.amount)}
                title={`${value.label}: ${value.value}`}
                aria-label={`${value.label}: ${value.value}`}
                tabIndex={0}
              >
                <span className="tax-thermometer__value-label">
                  <em>{value.label}</em>
                  <strong>{value.content || value.value.split("\n").map((line) => <span key={line}>{line}</span>)}</strong>
                </span>
              </div>
            ))}
          </div>
          {stats.length > 0 && (
            <div className="tax-thermometer__stats">
              {stats.map((stat) => (
                <div key={`${stat.label}-${stat.value}`}>
                  {stat.tone && <span className={`tax-thermometer__dot tax-thermometer__dot--${stat.tone}`} />}
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
          )}
          {(footerLabel || footerValue) && (
            <div className="tax-thermometer__footer">
              <span>{footerLabel}</span>
              <strong>{footerValue}</strong>
            </div>
          )}
      </>
    </div>
  );
}
