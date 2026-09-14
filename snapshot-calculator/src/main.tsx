import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { FullAppUpgrade } from "./FullAppUpgrade";
import { federalStandardDeduction2025, investmentResult } from "./calculation";
import { embeddingParentOrigin, trustedEmbeddingMessage } from "./embedding";
import { MAX_SNAPSHOT_AMOUNT, MAX_SNAPSHOT_YIELD_PERCENT, snapshotNumber } from "./numericInput";

type FilingStatus = "mfj" | "single" | "mfs" | "hoh";
type TaxType = "ordinary" | "qualified" | "treasury" | "muni" | "taxFree";
type DeductionMethod = "standard" | "itemized";

type InvestmentInput = {
  symbol: string;
  amount: number;
  yieldPercent: number;
  taxType: TaxType;
};

type SnapshotInputs = {
  filingStatus: FilingStatus;
  stateCode: string;
  taxableIncome: number;
  investmentAmount: number;
  stateAllowedDeduction: number;
  deductionMethod: DeductionMethod;
  itemizedDeductions: ItemizedDeductions;
  investmentA: InvestmentInput;
  investmentB: InvestmentInput;
};

type ItemizedDeductions = {
  mortgageInterest: number;
  propertyTax: number;
  charitable: number;
  other: number;
};

type InvestmentSymbolOption = {
  symbol: string;
  dividendYield: number;
};

const US_FLAG = "https://upload.wikimedia.org/wikipedia/en/a/a4/Flag_of_the_United_States.svg";

const filingStatusOptions: Array<{ value: FilingStatus; label: string }> = [
  { value: "mfj", label: "Married filing jointly" },
  { value: "single", label: "Single" },
  { value: "mfs", label: "Married filing separately" },
  { value: "hoh", label: "Head of household" },
];

const taxTypeOptions: Array<{ value: TaxType; label: string; note: string }> = [
  { value: "ordinary", label: "Ordinary income", note: "Taxable federally and by most states." },
  { value: "qualified", label: "Qualified dividend / LTCG", note: "Preferential federal rates; state taxable." },
  { value: "treasury", label: "Treasury interest", note: "Federal taxable, state tax-free." },
  { value: "muni", label: "In-state municipal bond", note: "Federal and state tax-free estimate." },
  { value: "taxFree", label: "Tax-free income", note: "No modeled federal or state tax." },
];
const popularInvestmentCatalog: InvestmentSymbolOption[] = [
  { symbol: "SPY", dividendYield: 1.1 }, { symbol: "VOO", dividendYield: 1.1 }, { symbol: "IVV", dividendYield: 1.1 }, { symbol: "VTI", dividendYield: 1.2 }, { symbol: "QQQ", dividendYield: 0.5 },
  { symbol: "QQQM", dividendYield: 0.6 }, { symbol: "SCHD", dividendYield: 3.5 }, { symbol: "VIG", dividendYield: 1.7 }, { symbol: "VYM", dividendYield: 2.7 }, { symbol: "DGRO", dividendYield: 2.2 },
  { symbol: "JEPI", dividendYield: 7.3 }, { symbol: "JEPQ", dividendYield: 9.0 }, { symbol: "BND", dividendYield: 3.7 }, { symbol: "AGG", dividendYield: 3.6 }, { symbol: "TLT", dividendYield: 4.1 },
  { symbol: "IEF", dividendYield: 3.5 }, { symbol: "SHY", dividendYield: 3.8 }, { symbol: "SGOV", dividendYield: 4.6 }, { symbol: "BIL", dividendYield: 3.6 }, { symbol: "GOVT", dividendYield: 3.7 },
  { symbol: "HYG", dividendYield: 5.9 }, { symbol: "LQD", dividendYield: 4.3 }, { symbol: "MUB", dividendYield: 2.9 }, { symbol: "VNQ", dividendYield: 3.9 }, { symbol: "XLK", dividendYield: 0.7 },
  { symbol: "XLF", dividendYield: 1.5 }, { symbol: "XLE", dividendYield: 3.1 }, { symbol: "XLV", dividendYield: 1.6 }, { symbol: "XLY", dividendYield: 0.8 }, { symbol: "XLP", dividendYield: 2.5 },
  { symbol: "IWM", dividendYield: 1.3 }, { symbol: "DIA", dividendYield: 1.7 }, { symbol: "EFA", dividendYield: 3.0 }, { symbol: "EEM", dividendYield: 2.5 }, { symbol: "VXUS", dividendYield: 3.0 },
  { symbol: "GLD", dividendYield: 0 }, { symbol: "SLV", dividendYield: 0 }, { symbol: "USO", dividendYield: 0 }, { symbol: "TQQQ", dividendYield: 1.0 }, { symbol: "SQQQ", dividendYield: 7.0 },
  { symbol: "ARKK", dividendYield: 0 }, { symbol: "SCHG", dividendYield: 0.5 }, { symbol: "SCHX", dividendYield: 1.2 }, { symbol: "SPLG", dividendYield: 1.2 }, { symbol: "RSP", dividendYield: 1.5 },
  { symbol: "VGT", dividendYield: 0.7 }, { symbol: "VUG", dividendYield: 0.5 }, { symbol: "VTV", dividendYield: 2.3 }, { symbol: "VB", dividendYield: 1.4 }, { symbol: "BSV", dividendYield: 4.1 },
  { symbol: "PFFA", dividendYield: 9.0 }, { symbol: "NAC", dividendYield: 5.7 }, { symbol: "AAPL", dividendYield: 0.5 }, { symbol: "MSFT", dividendYield: 0.7 }, { symbol: "NVDA", dividendYield: 0.0 },
  { symbol: "AMZN", dividendYield: 0 }, { symbol: "META", dividendYield: 0.3 }, { symbol: "GOOGL", dividendYield: 0.4 }, { symbol: "GOOG", dividendYield: 0.4 }, { symbol: "TSLA", dividendYield: 0 },
  { symbol: "BRK.B", dividendYield: 0 }, { symbol: "AVGO", dividendYield: 1.1 }, { symbol: "LLY", dividendYield: 0.6 }, { symbol: "JPM", dividendYield: 2.0 }, { symbol: "V", dividendYield: 0.7 },
  { symbol: "MA", dividendYield: 0.5 }, { symbol: "NFLX", dividendYield: 0 }, { symbol: "COST", dividendYield: 0.5 }, { symbol: "WMT", dividendYield: 0.9 }, { symbol: "HD", dividendYield: 2.1 },
  { symbol: "ORCL", dividendYield: 1.2 }, { symbol: "AMD", dividendYield: 0 }, { symbol: "ADBE", dividendYield: 0 }, { symbol: "CRM", dividendYield: 0.4 }, { symbol: "PEP", dividendYield: 3.0 },
  { symbol: "KO", dividendYield: 3.0 }, { symbol: "MCD", dividendYield: 2.3 }, { symbol: "CSCO", dividendYield: 2.7 }, { symbol: "INTC", dividendYield: 1.1 }, { symbol: "IBM", dividendYield: 3.0 },
  { symbol: "QCOM", dividendYield: 2.1 }, { symbol: "TXN", dividendYield: 2.8 }, { symbol: "AMGN", dividendYield: 3.0 }, { symbol: "UNH", dividendYield: 1.4 }, { symbol: "JNJ", dividendYield: 3.2 },
  { symbol: "ABBV", dividendYield: 3.5 }, { symbol: "MRK", dividendYield: 3.5 }, { symbol: "PFE", dividendYield: 6.5 }, { symbol: "ABT", dividendYield: 2.0 }, { symbol: "TMO", dividendYield: 0.4 },
  { symbol: "DIS", dividendYield: 0.7 }, { symbol: "NKE", dividendYield: 2.4 }, { symbol: "SBUX", dividendYield: 2.5 }, { symbol: "BA", dividendYield: 0 }, { symbol: "CAT", dividendYield: 1.8 },
  { symbol: "GE", dividendYield: 0.5 }, { symbol: "GS", dividendYield: 2.5 }, { symbol: "BAC", dividendYield: 2.3 }, { symbol: "WFC", dividendYield: 2.1 }, { symbol: "XOM", dividendYield: 3.5 },
];
const popularInvestmentYieldBySymbol = new Map(popularInvestmentCatalog.map((option) => [option.symbol, option.dividendYield]));
const thermometerMarkers = [50, 40, 30, 20, 10];

const taxTypeValues = new Set<TaxType>(taxTypeOptions.map((option) => option.value));
const filingStatusValues = new Set<FilingStatus>(filingStatusOptions.map((option) => option.value));
const deductionMethodValues = new Set<DeductionMethod>(["standard", "itemized"]);

const standardDeductions: Record<FilingStatus, number> = {
  mfj: federalStandardDeduction2025("mfj"),
  single: federalStandardDeduction2025("single"),
  mfs: federalStandardDeduction2025("mfs"),
  hoh: federalStandardDeduction2025("hoh"),
};

const defaultInputs: SnapshotInputs = {
  filingStatus: "mfj",
  stateCode: "CA",
  taxableIncome: 120000,
  investmentAmount: 100000,
  stateAllowedDeduction: 0,
  deductionMethod: "standard",
  itemizedDeductions: { mortgageInterest: 0, propertyTax: 0, charitable: 0, other: 0 },
  investmentA: { symbol: "BIL", amount: 100000, yieldPercent: 3.6, taxType: "treasury" },
  investmentB: { symbol: "NAC", amount: 100000, yieldPercent: popularInvestmentYieldBySymbol.get("NAC")!, taxType: "muni" },
};

const stateOptions = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"],
  ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"],
  ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"],
  ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"],
  ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
] as const;

const stateNames = Object.fromEntries(stateOptions);
const noIncomeTaxStates = new Set(["AK", "FL", "NV", "NH", "SD", "TN", "TX", "WA", "WY"]);

const stateFlagOverrides: Record<string, string> = {
  CA: "Flag_of_California.svg",
  FL: "Flag_of_Florida.svg",
  NY: "Flag_of_New_York.svg",
  TX: "Flag_of_Texas.svg",
  WA: "Flag_of_Washington.svg",
};


function stateFlagUrl(stateCode: string) {
  const name = stateNames[stateCode] || stateCode;
  const fileName = stateFlagOverrides[stateCode] || `Flag of ${name}.svg`;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=48`;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number, maximum = MAX_SNAPSHOT_AMOUNT) {
  if (value === null || value === undefined || value === "") return fallback;
  return snapshotNumber(value, maximum) ?? fallback;
}

function numberParam(params: URLSearchParams, key: string, fallback: number, maximum = MAX_SNAPSHOT_AMOUNT) {
  return numberValue(params.get(key), fallback, maximum);
}

function filingStatusParam(params: URLSearchParams, fallback: FilingStatus) {
  const value = params.get("filingStatus") || params.get("filing") || fallback;
  return filingStatusValues.has(value as FilingStatus) ? value as FilingStatus : fallback;
}

function stateParam(params: URLSearchParams, fallback: string) {
  const value = (params.get("state") || params.get("stateCode") || fallback).toUpperCase();
  return stateNames[value] ? value : fallback;
}

function taxTypeParam(params: URLSearchParams, key: string, fallback: TaxType) {
  const value = params.get(key) || fallback;
  return taxTypeValues.has(value as TaxType) ? value as TaxType : fallback;
}

function deductionMethodParam(params: URLSearchParams, fallback: DeductionMethod) {
  const value = params.get("deductionMethod") || fallback;
  return deductionMethodValues.has(value as DeductionMethod) ? value as DeductionMethod : fallback;
}

function itemizedDeductionsFromParams(params: URLSearchParams, fallback: ItemizedDeductions) {
  return {
    mortgageInterest: numberParam(params, "mortgageInterest", fallback.mortgageInterest),
    propertyTax: numberParam(params, "propertyTax", fallback.propertyTax),
    charitable: numberParam(params, "charitable", fallback.charitable),
    other: numberParam(params, "otherDeductions", fallback.other),
  };
}

function investmentFromParams(params: URLSearchParams, prefix: "a" | "b", fallback: InvestmentInput) {
  return {
    symbol: (params.get(`${prefix}Symbol`) || fallback.symbol).toUpperCase(),
    amount: numberParam(params, `${prefix}Amount`, fallback.amount),
    yieldPercent: numberParam(params, `${prefix}Yield`, fallback.yieldPercent, MAX_SNAPSHOT_YIELD_PERCENT),
    taxType: taxTypeParam(params, `${prefix}TaxType`, fallback.taxType),
  };
}

function getInitialSettings() {
  if (typeof window === "undefined") {
    return { isEmbedMode: false, inputs: defaultInputs };
  }
  const params = new URLSearchParams(window.location.search);
  const investmentA = investmentFromParams(params, "a", defaultInputs.investmentA);
  const investmentB = investmentFromParams(params, "b", defaultInputs.investmentB);
  const investmentAmount = numberParam(params, "amount", investmentA.amount || investmentB.amount || defaultInputs.investmentAmount);
  return {
    isEmbedMode: params.get("embed") === "1" || params.get("mode") === "embed",
    inputs: {
      filingStatus: filingStatusParam(params, defaultInputs.filingStatus),
      stateCode: stateParam(params, defaultInputs.stateCode),
      taxableIncome: numberParam(params, "income", defaultInputs.taxableIncome),
      investmentAmount,
      stateAllowedDeduction: numberParam(params, "stateDeduction", defaultInputs.stateAllowedDeduction),
      deductionMethod: deductionMethodParam(params, defaultInputs.deductionMethod),
      itemizedDeductions: itemizedDeductionsFromParams(params, defaultInputs.itemizedDeductions),
      investmentA: { ...investmentA, amount: investmentAmount },
      investmentB: { ...investmentB, amount: investmentAmount },
    },
  };
}

function buildShareUrl(inputs: SnapshotInputs, embed = true) {
  const url = new URL(typeof window === "undefined" ? "https://calculator.aftertaxus.com/" : window.location.href);
  url.search = "";
  url.searchParams.set("embed", embed ? "1" : "0");
  url.searchParams.set("filingStatus", inputs.filingStatus);
  url.searchParams.set("state", inputs.stateCode);
  url.searchParams.set("income", String(inputs.taxableIncome));
  url.searchParams.set("amount", String(inputs.investmentAmount));
  url.searchParams.set("stateDeduction", String(inputs.stateAllowedDeduction));
  url.searchParams.set("deductionMethod", inputs.deductionMethod);
  url.searchParams.set("mortgageInterest", String(inputs.itemizedDeductions.mortgageInterest));
  url.searchParams.set("propertyTax", String(inputs.itemizedDeductions.propertyTax));
  url.searchParams.set("charitable", String(inputs.itemizedDeductions.charitable));
  url.searchParams.set("otherDeductions", String(inputs.itemizedDeductions.other));
  url.searchParams.set("aSymbol", inputs.investmentA.symbol);
  url.searchParams.set("aAmount", String(inputs.investmentAmount));
  url.searchParams.set("aYield", String(inputs.investmentA.yieldPercent));
  url.searchParams.set("aTaxType", inputs.investmentA.taxType);
  url.searchParams.set("bSymbol", inputs.investmentB.symbol);
  url.searchParams.set("bAmount", String(inputs.investmentAmount));
  url.searchParams.set("bYield", String(inputs.investmentB.yieldPercent));
  url.searchParams.set("bTaxType", inputs.investmentB.taxType);
  return url.toString();
}

function safeInvestmentUpdate(value: unknown, fallback: InvestmentInput) {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  const taxType = stringValue(record.taxType);
  return {
    symbol: (stringValue(record.symbol) || fallback.symbol).toUpperCase(),
    amount: numberValue(record.amount, fallback.amount),
    yieldPercent: numberValue(record.yieldPercent, fallback.yieldPercent, MAX_SNAPSHOT_YIELD_PERCENT),
    taxType: taxTypeValues.has(taxType as TaxType) ? taxType as TaxType : fallback.taxType,
  };
}

function dividendYieldLookupUrl(symbol: string) {
  const normalizedSymbol = (symbol || "").trim().toLowerCase();
  return normalizedSymbol
    ? `https://stockanalysis.com/etf/${encodeURIComponent(normalizedSymbol)}/dividend/`
    : "https://stockanalysis.com/etf/";
}

function currency(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits }).format(value);
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function yearlyIncomeAmount(value: number) {
  return `${currency(value)}/yr`;
}


function formatDollarInput(value: number | string) {
  const rawValue = String(value).replace(/[$,%\s,]/g, "");
  if (rawValue === "" || rawValue === "-" || rawValue === "." || rawValue === "-.") return rawValue;
  const isNegative = rawValue.startsWith("-");
  const unsignedValue = isNegative ? rawValue.slice(1) : rawValue;
  const [integerPart = "", decimalPart] = unsignedValue.split(".");
  const formattedInteger = integerPart.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") || "0";
  return `${isNegative ? "-" : ""}${formattedInteger}${decimalPart !== undefined ? `.${decimalPart}` : ""}`;
}

function NumberField({ label, value, onChange, prefix, suffix, className = "" }: { label: string; value: number; onChange: (value: number) => void; prefix?: string; suffix?: string; className?: string }) {
  const isDollarField = prefix === "$";
  const displayValue = isDollarField ? formatDollarInput(value) : String(value);
  const maximum = suffix === "%" ? MAX_SNAPSHOT_YIELD_PERCENT : MAX_SNAPSHOT_AMOUNT;
  const [draft, setDraft] = useState({ value, text: displayValue });
  const draftValue = draft.value === value ? draft.text : displayValue;
  const invalid = snapshotNumber(draftValue, maximum) === null;

  function handleChange(rawValue: string) {
    const nextValue = snapshotNumber(rawValue, maximum);
    setDraft({ value: nextValue ?? value, text: isDollarField ? formatDollarInput(rawValue) : rawValue });
    if (nextValue !== null) onChange(nextValue);
  }

  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      <div className="input-shell">
        {prefix && <em>{prefix}</em>}
        <input type="text" inputMode="decimal" value={draftValue} aria-invalid={invalid} onChange={(event) => handleChange(event.target.value)} />
        {suffix && <em>{suffix}</em>}
      </div>
      {invalid && <small role="alert">Enter 0–{maximum.toLocaleString("en-US")}. Results use the last valid value.</small>}
    </label>
  );
}

function DifferenceBadge({ value }: { value: number }) {
  const className = value > 0 ? "difference-badge difference-badge--positive" : value < 0 ? "difference-badge difference-badge--negative" : "difference-badge";
  return <span className={className}>{yearlyIncomeAmount(value)}</span>;
}

function MiniFireworks() {
  return (
    <span className="mini-fireworks" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function YieldLookupLink({ symbol }: { symbol: string }) {
  return <a className="yield-lookup-link" href={dividendYieldLookupUrl(symbol)} target="_blank" rel="noreferrer" aria-label={`Look up current dividend yield for ${symbol || "this investment"}`}>Yield lookup</a>;
}

function investmentSymbolOptions(symbol: string): InvestmentSymbolOption[] {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol || popularInvestmentYieldBySymbol.has(normalizedSymbol)) return popularInvestmentCatalog;
  return [{ symbol: normalizedSymbol, dividendYield: valueOrZero(popularInvestmentYieldBySymbol.get(normalizedSymbol)) }, ...popularInvestmentCatalog];
}

function valueOrZero(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function symbolOptionLabel(option: InvestmentSymbolOption) {
  return `${option.symbol} — ${option.dividendYield.toFixed(1)}%`;
}

function InvestmentCard({ title, yearlyIncome, isWinner, value, onChange }: { title: string; yearlyIncome: number; isWinner: boolean; value: InvestmentInput; onChange: (value: InvestmentInput) => void }) {
  const taxType = taxTypeOptions.find((option) => option.value === value.taxType) || taxTypeOptions[0];
  const symbolOptions = investmentSymbolOptions(value.symbol);
  const changeSymbol = (symbol: string) => {
    const normalizedSymbol = symbol.toUpperCase();
    const dividendYield = popularInvestmentYieldBySymbol.get(normalizedSymbol);
    if (normalizedSymbol === value.symbol) return;
    onChange({ ...value, symbol: normalizedSymbol, yieldPercent: dividendYield ?? 0, taxType: "ordinary" });
  };
  return (
    <section className={`investment-card ${isWinner ? "investment-card--winner" : ""}`}>
      {isWinner && <MiniFireworks />}
      <div className="card-kicker investment-name-line"><span>{title}</span><DifferenceBadge value={yearlyIncome} /></div>
      <label className="field">
        <span>Asset / Symbol</span>
        <div className="symbol-field-row">
          <input value={value.symbol} placeholder="Type symbol" onChange={(event) => changeSymbol(event.target.value)} />
          <select value={value.symbol} onChange={(event) => changeSymbol(event.target.value)} aria-label={`${title} symbol dropdown`}>
            {symbolOptions.map((option) => <option key={option.symbol} value={option.symbol}>{symbolOptionLabel(option)}</option>)}
          </select>
        </div>
      </label>
      <div className="yield-field-row">
        <NumberField className="yield-field" label="Yield" suffix="%" value={value.yieldPercent} onChange={(yieldPercent) => onChange({ ...value, yieldPercent })} />
        <YieldLookupLink symbol={value.symbol} />
      </div>
      <label className="field">
        <span>Tax type</span>
        <select value={value.taxType} onChange={(event) => onChange({ ...value, taxType: event.target.value as TaxType })}>
          {taxTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <p className="tax-note">{taxType.note} Catalog yields are illustrative samples, not live quotes. Changing an asset resets its tax treatment to ordinary income; confirm treatment and enter the yield you want to compare.</p>
    </section>
  );
}

function DeductionsPanel({
  filingStatus,
  method,
  itemizedDeductions,
  deductionTotal,
  onMethodChange,
  onItemizedChange,
}: {
  filingStatus: FilingStatus;
  method: DeductionMethod;
  itemizedDeductions: ItemizedDeductions;
  deductionTotal: number;
  onMethodChange: (method: DeductionMethod) => void;
  onItemizedChange: (deductions: ItemizedDeductions) => void;
}) {
  const standardDeduction = standardDeductions[filingStatus];
  return (
    <section className="deductions-panel">
      <label className="field deduction-method-field">
        <span>Deduction method</span>
        <select value={method} onChange={(event) => onMethodChange(event.target.value as DeductionMethod)}>
          <option value="standard">Standard deduction ({currency(standardDeduction)})</option>
          <option value="itemized">Itemized deductions</option>
        </select>
      </label>
      <div className="deduction-summary">
        <span>Deduction used</span>
        <strong>{currency(deductionTotal)}</strong>
      </div>
      {method === "itemized" && (
        <div className="itemized-grid">
          <NumberField label="Mortgage interest" prefix="$" value={itemizedDeductions.mortgageInterest} onChange={(mortgageInterest) => onItemizedChange({ ...itemizedDeductions, mortgageInterest })} />
          <NumberField label="Property tax" prefix="$" value={itemizedDeductions.propertyTax} onChange={(propertyTax) => onItemizedChange({ ...itemizedDeductions, propertyTax })} />
          <NumberField label="Charitable" prefix="$" value={itemizedDeductions.charitable} onChange={(charitable) => onItemizedChange({ ...itemizedDeductions, charitable })} />
          <NumberField label="Other" prefix="$" value={itemizedDeductions.other} onChange={(other) => onItemizedChange({ ...itemizedDeductions, other })} />
        </div>
      )}
    </section>
  );
}

function ComparisonBars({ a, b, nameA, nameB, label, valueKey, scaleMax }: { a: ReturnType<typeof investmentResult>; b: ReturnType<typeof investmentResult>; nameA: string; nameB: string; label: string; valueKey: "beforeTaxIncome" | "afterTaxIncome"; scaleMax: number }) {
  const max = Math.max(scaleMax, 1);
  const widthA = Math.max(0, Math.min((a[valueKey] / max) * 100, 100));
  const widthB = Math.max(0, Math.min((b[valueKey] / max) * 100, 100));
  return (
    <div className="bar-group">
      <h3>{label}</h3>
      <div className="bar-row">
        <span className="bar-name"><span className="bar-name-text">{nameA}</span><DifferenceBadge value={a[valueKey]} /></span>
        <div className="bar-track"><div className="bar-fill bar-fill-a" style={{ width: `${widthA}%` }} /></div>
        <strong>{currency(a[valueKey])}</strong>
      </div>
      <div className="bar-row">
        <span className="bar-name"><span className="bar-name-text">{nameB}</span><DifferenceBadge value={b[valueKey]} /></span>
        <div className="bar-track"><div className="bar-fill bar-fill-b" style={{ width: `${widthB}%` }} /></div>
        <strong>{currency(b[valueKey])}</strong>
      </div>
    </div>
  );
}

function App() {
  const initialSettings = useMemo(() => getInitialSettings(), []);
  const [filingStatus, setFilingStatus] = useState<FilingStatus>(initialSettings.inputs.filingStatus);
  const [stateCode, setStateCode] = useState(initialSettings.inputs.stateCode);
  const [taxableIncome, setTaxableIncome] = useState(initialSettings.inputs.taxableIncome);
  const [investmentAmount, setInvestmentAmount] = useState(initialSettings.inputs.investmentAmount);
  const [stateAllowedDeduction, setStateAllowedDeduction] = useState(initialSettings.inputs.stateAllowedDeduction);
  const [deductionMethod, setDeductionMethod] = useState<DeductionMethod>(initialSettings.inputs.deductionMethod);
  const [itemizedDeductions, setItemizedDeductions] = useState<ItemizedDeductions>(initialSettings.inputs.itemizedDeductions);
  const [investmentA, setInvestmentA] = useState<InvestmentInput>(initialSettings.inputs.investmentA);
  const [investmentB, setInvestmentB] = useState<InvestmentInput>(initialSettings.inputs.investmentB);
  const [copyStatus, setCopyStatus] = useState("");

  const scenarioA = useMemo(() => ({ ...investmentA, amount: investmentAmount }), [investmentA, investmentAmount]);
  const scenarioB = useMemo(() => ({ ...investmentB, amount: investmentAmount }), [investmentB, investmentAmount]);
  const scenarioAName = scenarioA.symbol || "First investment";
  const scenarioBName = scenarioB.symbol || "Second investment";
  const itemizedDeductionTotal = itemizedDeductions.mortgageInterest + itemizedDeductions.propertyTax + itemizedDeductions.charitable + itemizedDeductions.other;
  const deductionTotal = deductionMethod === "standard" ? standardDeductions[filingStatus] : itemizedDeductionTotal;
  const taxableIncomeAfterDeductions = Math.max(0, taxableIncome - deductionTotal);
  const resultA = useMemo(() => investmentResult(scenarioA, taxableIncome, filingStatus, stateCode, deductionTotal, stateAllowedDeduction), [scenarioA, taxableIncome, filingStatus, stateCode, deductionTotal, stateAllowedDeduction]);
  const resultB = useMemo(() => investmentResult(scenarioB, taxableIncome, filingStatus, stateCode, deductionTotal, stateAllowedDeduction), [scenarioB, taxableIncome, filingStatus, stateCode, deductionTotal, stateAllowedDeduction]);
  const differenceA = resultA.afterTaxIncome - resultB.afterTaxIncome;
  const differenceB = resultB.afterTaxIncome - resultA.afterTaxIncome;
  const incomeBarScaleMax = Math.max(resultA.beforeTaxIncome, resultB.beforeTaxIncome, 1);
  const hasWinner = Math.abs(differenceA) > 0.5;
  const winner = resultA.afterTaxIncome >= resultB.afterTaxIncome ? { label: scenarioAName, symbol: scenarioA.symbol, result: resultA, other: resultB } : { label: scenarioBName, symbol: scenarioB.symbol, result: resultB, other: resultA };
  const advantage = Math.abs(resultA.afterTaxIncome - resultB.afterTaxIncome);
  const selectedStateName = stateNames[stateCode] || stateCode;
  const inputs = useMemo<SnapshotInputs>(() => ({ filingStatus, stateCode, taxableIncome, investmentAmount, stateAllowedDeduction, deductionMethod, itemizedDeductions, investmentA: scenarioA, investmentB: scenarioB }), [filingStatus, stateCode, taxableIncome, investmentAmount, stateAllowedDeduction, deductionMethod, itemizedDeductions, scenarioA, scenarioB]);
  const shareUrl = useMemo(() => buildShareUrl(inputs), [inputs]);
  const embedPayload = useMemo(() => ({
    inputs,
    resultA,
    resultB,
    winner: {
      label: winner.label,
      symbol: winner.symbol,
      advantage,
      afterTaxIncome: winner.result.afterTaxIncome,
      effectiveTaxRate: winner.result.effectiveTaxRate,
    },
  }), [advantage, inputs, resultA, resultB, winner]);

  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const parentOrigin = embeddingParentOrigin(document.referrer);
    if (parentOrigin) window.parent.postMessage({ type: "aftertaxus-snapshot-result", payload: embedPayload }, parentOrigin);
  }, [embedPayload]);

  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const parentOrigin = embeddingParentOrigin(document.referrer);
    const handleMessage = (event: MessageEvent) => {
      if (!trustedEmbeddingMessage(event, window.parent, parentOrigin)) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      const record = data as Record<string, unknown>;
      if (record.type !== "aftertaxus-snapshot-set-inputs" || !record.payload || typeof record.payload !== "object") return;
      const payload = record.payload as Record<string, unknown>;
      const nextFilingStatus = stringValue(payload.filingStatus);
      const nextStateCode = stringValue(payload.stateCode || payload.state).toUpperCase();
      if (filingStatusValues.has(nextFilingStatus as FilingStatus)) setFilingStatus(nextFilingStatus as FilingStatus);
      if (stateNames[nextStateCode]) setStateCode(nextStateCode);
      if (payload.taxableIncome !== undefined || payload.income !== undefined) {
        setTaxableIncome(numberValue(payload.taxableIncome ?? payload.income, taxableIncome));
      }
      if (payload.investmentAmount !== undefined || payload.amount !== undefined) {
        setInvestmentAmount(numberValue(payload.investmentAmount ?? payload.amount, investmentAmount));
      }
      if (payload.stateAllowedDeduction !== undefined) setStateAllowedDeduction(numberValue(payload.stateAllowedDeduction, stateAllowedDeduction));
      const nextDeductionMethod = stringValue(payload.deductionMethod);
      if (deductionMethodValues.has(nextDeductionMethod as DeductionMethod)) setDeductionMethod(nextDeductionMethod as DeductionMethod);
      if (payload.itemizedDeductions && typeof payload.itemizedDeductions === "object") {
        const deductions = payload.itemizedDeductions as Record<string, unknown>;
        setItemizedDeductions((current) => ({
          mortgageInterest: numberValue(deductions.mortgageInterest, current.mortgageInterest),
          propertyTax: numberValue(deductions.propertyTax, current.propertyTax),
          charitable: numberValue(deductions.charitable, current.charitable),
          other: numberValue(deductions.other, current.other),
        }));
      }
      if (payload.investmentA) {
        const nextInvestment = safeInvestmentUpdate(payload.investmentA, investmentA);
        setInvestmentA(nextInvestment);
        if (payload.investmentAmount === undefined && payload.amount === undefined) setInvestmentAmount(nextInvestment.amount);
      }
      if (payload.investmentB) {
        const nextInvestment = safeInvestmentUpdate(payload.investmentB, investmentB);
        setInvestmentB(nextInvestment);
        if (payload.investmentAmount === undefined && payload.amount === undefined && !payload.investmentA) setInvestmentAmount(nextInvestment.amount);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [investmentA, investmentAmount, investmentB, taxableIncome, stateAllowedDeduction]);

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy failed");
    }
    window.setTimeout(() => setCopyStatus(""), 1600);
  }

  return (
    <main className={`snapshot-app ${initialSettings.isEmbedMode ? "snapshot-app--embed" : ""}`}>
      {initialSettings.isEmbedMode ? (
        <section className="embed-header">
          <div className="brand-row">
            <span className="brand-mark">C</span>
            <strong>AfterTax US Snapshot</strong>
            <img src={US_FLAG} alt="US flag" />
          </div>
          <div className="embed-summary">
            <span>After-tax winner</span>
            <strong>{winner.symbol || winner.label}</strong>
            <em>+{currency(advantage)} / year</em>
          </div>
          <button type="button" className="copy-link-button" onClick={copyShareLink}>{copyStatus || "Copy embed link"}</button>
        </section>
      ) : (
        <section className="hero">
          <div className="brand-row">
            <span className="brand-mark">C</span>
            <strong>AfterTax US</strong>
            <img src={US_FLAG} alt="US flag" />
          </div>
          <div className="hero-copy">
            <p className="eyebrow">Free snapshot calculator · 2025 estimate</p>
            <h1>Which wins after tax?</h1>
            <p>Compare two investments after federal and state taxes. No account needed. <a className="snapshot-text-link" href="https://aftertaxus.com/app/" rel="noreferrer" referrerPolicy="no-referrer">Open free portfolio app</a></p>
          </div>
          <div className="winner-card">
            <span>After-tax winner</span>
            <strong>{winner.symbol || winner.label}</strong>
            <em>+{currency(advantage)} / year</em>
          </div>
        </section>
      )}

      <section className="shared-investment-panel">
        <NumberField label="Investment amount for both scenarios" prefix="$" value={investmentAmount} onChange={setInvestmentAmount} />
      </section>

      <section className="compare-grid">
        <InvestmentCard title={scenarioAName} yearlyIncome={resultA.afterTaxIncome} isWinner={differenceA > 0.5} value={investmentA} onChange={setInvestmentA} />
        <div className="versus">VS</div>
        <InvestmentCard title={scenarioBName} yearlyIncome={resultB.afterTaxIncome} isWinner={differenceB > 0.5} value={investmentB} onChange={setInvestmentB} />
        <section className="tax-drag-card tax-drag-card--featured">
          <div className="thermometer-card">
            <div className="thermo-title">
              <span><img src={US_FLAG} alt="" /> + <img src={stateFlagUrl(stateCode)} alt="" /></span>
              <strong>Tax drag</strong>
            </div>
            <div className="thermo-track">
              <div className="thermo-markers" aria-hidden="true">
                {thermometerMarkers.map((marker) => (
                  <span key={marker} className="thermo-marker" style={{ bottom: `${marker}%` }}>
                    <b>{marker}%</b>
                  </span>
                ))}
              </div>
              <div className="thermo-fill" style={{ height: `${Math.min(Math.max(winner.result.effectiveTaxRate * 100, 4), 100)}%` }} />
              {noIncomeTaxStates.has(stateCode) && <div className="no-tax-stamp">No state income tax</div>}
            </div>
            <strong>{percent(winner.result.effectiveTaxRate)}</strong>
            <span>winning investment effective tax drag</span>
          </div>
          <div className="tax-feature-copy">
            <p className="eyebrow">After-tax impact</p>
            <h2>{winner.symbol || winner.label} wins by {currency(advantage)} per year</h2>
            <p>Taxable base after deductions: {currency(taxableIncomeAfterDeductions)}.</p>
            <div className="tax-lines">
              <div><span>{investmentA.symbol || "A"} tax cost</span><strong>{currency(resultA.taxCost)}</strong></div>
              <div><span>{investmentB.symbol || "B"} tax cost</span><strong>{currency(resultB.taxCost)}</strong></div>
              <div><span>Tax saved</span><strong>{currency(Math.abs(resultA.taxCost - resultB.taxCost))}</strong></div>
            </div>
          </div>
        </section>
      </section>

      <section className="setup-panel">
        <label className="field">
          <span>Filing status</span>
          <select value={filingStatus} onChange={(event) => setFilingStatus(event.target.value as FilingStatus)}>
            {filingStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="field state-field">
          <span>State</span>
          <div className="state-select-shell">
            <img src={stateFlagUrl(stateCode)} alt={`${selectedStateName} flag`} />
            <select value={stateCode} onChange={(event) => setStateCode(event.target.value)}>
              {stateOptions.map(([code, name]) => <option key={code} value={code}>{code} - {name}</option>)}
            </select>
          </div>
        </label>
        <NumberField label="Income before deductions and investments" prefix="$" value={taxableIncome} onChange={setTaxableIncome} />
      </section>

      <DeductionsPanel
        filingStatus={filingStatus}
        method={deductionMethod}
        itemizedDeductions={itemizedDeductions}
        deductionTotal={deductionTotal}
        onMethodChange={setDeductionMethod}
        onItemizedChange={setItemizedDeductions}
      />

      <section className="deductions-panel">
        <NumberField label="State deductions and exclusions (already allowed)" prefix="$" value={stateAllowedDeduction} onChange={setStateAllowedDeduction} />
        <p className="muted">Separate from federal deductions. Defaults to $0: enter your state-allowed amount to refine this estimate. Enter federal itemized amounts only after eligibility limits and SALT caps; the calculator does not establish eligibility.</p>
      </section>

      <section className="results-panel">
        <div className="results-main">
          <ComparisonBars a={resultA} b={resultB} nameA={scenarioAName} nameB={scenarioBName} label="Before-tax income" valueKey="beforeTaxIncome" scaleMax={incomeBarScaleMax} />
          <ComparisonBars a={resultA} b={resultB} nameA={scenarioAName} nameB={scenarioBName} label="After-tax income" valueKey="afterTaxIncome" scaleMax={incomeBarScaleMax} />
        </div>
      </section>

      {initialSettings.isEmbedMode ? (
        <section className="embed-footer">
          <span>AI/chatbot ready: preload via URL parameters or update this frame with postMessage.</span>
        </section>
      ) : (
        <FullAppUpgrade />
      )}
      <p className="muted">2025 planning estimate using the portfolio tax engine, not a tax return. Federal and state deductions are separate. Excludes local/payroll taxes, credits, AMT, automatic state eligibility adjustments, and tax effects on existing Social Security or investment income. In-state muni treatment requires your residency and the fund's eligible income composition to match. Yields are samples or your entries, not current market data. <a className="snapshot-text-link" href="https://aftertaxus.com/how-it-works.html" rel="noreferrer" referrerPolicy="no-referrer">How it works and methodology</a></p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
