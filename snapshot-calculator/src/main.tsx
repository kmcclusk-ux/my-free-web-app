import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type FilingStatus = "mfj" | "single" | "mfs" | "hoh";
type TaxType = "ordinary" | "qualified" | "treasury" | "muni" | "taxFree";

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
  investmentA: InvestmentInput;
  investmentB: InvestmentInput;
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

const taxTypeValues = new Set<TaxType>(taxTypeOptions.map((option) => option.value));
const filingStatusValues = new Set<FilingStatus>(filingStatusOptions.map((option) => option.value));

const defaultInputs: SnapshotInputs = {
  filingStatus: "mfj",
  stateCode: "CA",
  taxableIncome: 300000,
  investmentA: { symbol: "BIL", amount: 250000, yieldPercent: 4.8, taxType: "ordinary" },
  investmentB: { symbol: "NAC", amount: 250000, yieldPercent: 4.4, taxType: "treasury" },
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

const stateRates: Record<string, number> = {
  AL: 0.05, AZ: 0.025, AR: 0.039, CA: 0.093, CO: 0.044, CT: 0.06, DE: 0.066, DC: 0.085,
  GA: 0.0539, HI: 0.0825, ID: 0.05695, IL: 0.0495, IN: 0.03, IA: 0.038, KS: 0.0558,
  KY: 0.04, LA: 0.03, ME: 0.0715, MD: 0.0575, MA: 0.05, MI: 0.0425, MN: 0.0785,
  MS: 0.044, MO: 0.047, MT: 0.059, NE: 0.052, NJ: 0.0637, NM: 0.049, NY: 0.0685,
  NC: 0.0425, ND: 0.0195, OH: 0.0275, OK: 0.0475, OR: 0.0875, PA: 0.0307, RI: 0.0475,
  SC: 0.062, UT: 0.0455, VT: 0.076, VA: 0.0575, WV: 0.0482, WI: 0.053,
};

function stateFlagUrl(stateCode: string) {
  const name = stateNames[stateCode] || stateCode;
  const fileName = stateFlagOverrides[stateCode] || `Flag of ${name}.svg`;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=48`;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function numberParam(params: URLSearchParams, key: string, fallback: number) {
  return numberValue(params.get(key), fallback);
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

function investmentFromParams(params: URLSearchParams, prefix: "a" | "b", fallback: InvestmentInput) {
  return {
    symbol: (params.get(`${prefix}Symbol`) || fallback.symbol).toUpperCase(),
    amount: numberParam(params, `${prefix}Amount`, fallback.amount),
    yieldPercent: numberParam(params, `${prefix}Yield`, fallback.yieldPercent),
    taxType: taxTypeParam(params, `${prefix}TaxType`, fallback.taxType),
  };
}

function getInitialSettings() {
  if (typeof window === "undefined") {
    return { isEmbedMode: false, inputs: defaultInputs };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    isEmbedMode: params.get("embed") === "1" || params.get("mode") === "embed",
    inputs: {
      filingStatus: filingStatusParam(params, defaultInputs.filingStatus),
      stateCode: stateParam(params, defaultInputs.stateCode),
      taxableIncome: numberParam(params, "income", defaultInputs.taxableIncome),
      investmentA: investmentFromParams(params, "a", defaultInputs.investmentA),
      investmentB: investmentFromParams(params, "b", defaultInputs.investmentB),
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
  url.searchParams.set("aSymbol", inputs.investmentA.symbol);
  url.searchParams.set("aAmount", String(inputs.investmentA.amount));
  url.searchParams.set("aYield", String(inputs.investmentA.yieldPercent));
  url.searchParams.set("aTaxType", inputs.investmentA.taxType);
  url.searchParams.set("bSymbol", inputs.investmentB.symbol);
  url.searchParams.set("bAmount", String(inputs.investmentB.amount));
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
    yieldPercent: numberValue(record.yieldPercent, fallback.yieldPercent),
    taxType: taxTypeValues.has(taxType as TaxType) ? taxType as TaxType : fallback.taxType,
  };
}

function currency(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits }).format(value);
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function bracketedTax(income: number, brackets: ReadonlyArray<{ max: number; rate: number }>) {
  if (!Number.isFinite(income) || income <= 0) return 0;
  let tax = 0;
  let previousMax = 0;
  for (const bracket of brackets) {
    const amount = Math.max(Math.min(income, bracket.max) - previousMax, 0);
    tax += amount * bracket.rate;
    if (income <= bracket.max) break;
    previousMax = bracket.max;
  }
  return tax;
}

function federalOrdinaryTax(income: number, filingStatus: FilingStatus) {
  const schedules: Record<FilingStatus, ReadonlyArray<{ max: number; rate: number }>> = {
    mfj: [
      { max: 23850, rate: 0.10 }, { max: 96950, rate: 0.12 }, { max: 206700, rate: 0.22 },
      { max: 394600, rate: 0.24 }, { max: 501050, rate: 0.32 }, { max: 751600, rate: 0.35 },
      { max: Infinity, rate: 0.37 },
    ],
    single: [
      { max: 11925, rate: 0.10 }, { max: 48475, rate: 0.12 }, { max: 103350, rate: 0.22 },
      { max: 197300, rate: 0.24 }, { max: 250525, rate: 0.32 }, { max: 626350, rate: 0.35 },
      { max: Infinity, rate: 0.37 },
    ],
    mfs: [
      { max: 11925, rate: 0.10 }, { max: 48475, rate: 0.12 }, { max: 103350, rate: 0.22 },
      { max: 197300, rate: 0.24 }, { max: 250525, rate: 0.32 }, { max: 375800, rate: 0.35 },
      { max: Infinity, rate: 0.37 },
    ],
    hoh: [
      { max: 17000, rate: 0.10 }, { max: 64850, rate: 0.12 }, { max: 103350, rate: 0.22 },
      { max: 197300, rate: 0.24 }, { max: 250500, rate: 0.32 }, { max: 626350, rate: 0.35 },
      { max: Infinity, rate: 0.37 },
    ],
  };
  return bracketedTax(income, schedules[filingStatus]);
}

function preferredTax(incomeBeforeInvestment: number, investmentIncome: number, filingStatus: FilingStatus) {
  const thresholds: Record<FilingStatus, { zero: number; fifteen: number }> = {
    single: { zero: 48350, fifteen: 533400 },
    mfj: { zero: 96700, fifteen: 600050 },
    mfs: { zero: 48350, fifteen: 300000 },
    hoh: { zero: 64750, fifteen: 566700 },
  };
  const bracket = thresholds[filingStatus];
  const zeroAmount = Math.max(0, Math.min(investmentIncome, bracket.zero - incomeBeforeInvestment));
  const fifteenBase = Math.max(incomeBeforeInvestment, bracket.zero);
  const fifteenAmount = Math.max(0, Math.min(investmentIncome - zeroAmount, bracket.fifteen - fifteenBase));
  const twentyAmount = Math.max(0, investmentIncome - zeroAmount - fifteenAmount);
  return fifteenAmount * 0.15 + twentyAmount * 0.2;
}

function investmentResult(input: InvestmentInput, taxableIncome: number, filingStatus: FilingStatus, stateCode: string) {
  const beforeTaxIncome = input.amount * (input.yieldPercent / 100);
  const federalOrdinaryBase = input.taxType === "ordinary" || input.taxType === "treasury" ? beforeTaxIncome : 0;
  const federalPreferredBase = input.taxType === "qualified" ? beforeTaxIncome : 0;
  const federalTaxBefore = federalOrdinaryTax(taxableIncome, filingStatus);
  const federalTaxAfterOrdinary = federalOrdinaryTax(taxableIncome + federalOrdinaryBase, filingStatus);
  const federalOrdinaryIncrement = Math.max(federalTaxAfterOrdinary - federalTaxBefore, 0);
  const federalPreferredIncrement = federalPreferredBase > 0 ? preferredTax(taxableIncome, federalPreferredBase, filingStatus) : 0;
  const stateRate = noIncomeTaxStates.has(stateCode) ? 0 : stateRates[stateCode] ?? 0.05;
  const isStateTaxable = input.taxType === "ordinary" || input.taxType === "qualified";
  const stateTax = isStateTaxable ? beforeTaxIncome * stateRate : 0;
  const federalTax = federalOrdinaryIncrement + federalPreferredIncrement;
  const taxCost = federalTax + stateTax;
  const afterTaxIncome = beforeTaxIncome - taxCost;
  return {
    beforeTaxIncome,
    federalTax,
    stateTax,
    taxCost,
    afterTaxIncome,
    effectiveTaxRate: beforeTaxIncome > 0 ? taxCost / beforeTaxIncome : 0,
  };
}

function parseNumberInput(value: string) {
  const cleanedValue = value.replace(/[$,%\s,]/g, "");
  if (cleanedValue === "" || cleanedValue === "-" || cleanedValue === "." || cleanedValue === "-.") return 0;
  const number = Number(cleanedValue);
  return Number.isFinite(number) ? number : null;
}

function NumberField({ label, value, onChange, prefix, suffix }: { label: string; value: number; onChange: (value: number) => void; prefix?: string; suffix?: string }) {
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => {
    const parsedDraftValue = parseNumberInput(draftValue);
    if (parsedDraftValue === value) return;
    setDraftValue(String(value));
  }, [draftValue, value]);

  function handleChange(rawValue: string) {
    setDraftValue(rawValue);
    const nextValue = parseNumberInput(rawValue);
    if (nextValue !== null) onChange(nextValue);
  }

  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-shell">
        {prefix && <em>{prefix}</em>}
        <input type="text" inputMode="decimal" value={draftValue} onChange={(event) => handleChange(event.target.value)} />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  );
}

function InvestmentCard({ title, value, onChange }: { title: string; value: InvestmentInput; onChange: (value: InvestmentInput) => void }) {
  const taxType = taxTypeOptions.find((option) => option.value === value.taxType) || taxTypeOptions[0];
  return (
    <section className="investment-card">
      <div className="card-kicker">{title}</div>
      <label className="field">
        <span>Asset / Symbol</span>
        <input value={value.symbol} onChange={(event) => onChange({ ...value, symbol: event.target.value.toUpperCase() })} />
      </label>
      <NumberField label="Investment amount" prefix="$" value={value.amount} onChange={(amount) => onChange({ ...value, amount })} />
      <NumberField label="Yield" suffix="%" value={value.yieldPercent} onChange={(yieldPercent) => onChange({ ...value, yieldPercent })} />
      <label className="field">
        <span>Tax type</span>
        <select value={value.taxType} onChange={(event) => onChange({ ...value, taxType: event.target.value as TaxType })}>
          {taxTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <p className="tax-note">{taxType.note}</p>
    </section>
  );
}

function ComparisonBars({ a, b, label, valueKey }: { a: ReturnType<typeof investmentResult>; b: ReturnType<typeof investmentResult>; label: string; valueKey: "beforeTaxIncome" | "afterTaxIncome" }) {
  const max = Math.max(a[valueKey], b[valueKey], 1);
  return (
    <div className="bar-group">
      <h3>{label}</h3>
      <div className="bar-row">
        <span>A</span>
        <div className="bar-track"><div className="bar-fill bar-fill-a" style={{ width: `${(a[valueKey] / max) * 100}%` }} /></div>
        <strong>{currency(a[valueKey])}</strong>
      </div>
      <div className="bar-row">
        <span>B</span>
        <div className="bar-track"><div className="bar-fill bar-fill-b" style={{ width: `${(b[valueKey] / max) * 100}%` }} /></div>
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
  const [investmentA, setInvestmentA] = useState<InvestmentInput>(initialSettings.inputs.investmentA);
  const [investmentB, setInvestmentB] = useState<InvestmentInput>(initialSettings.inputs.investmentB);
  const [copyStatus, setCopyStatus] = useState("");

  const resultA = useMemo(() => investmentResult(investmentA, taxableIncome, filingStatus, stateCode), [investmentA, taxableIncome, filingStatus, stateCode]);
  const resultB = useMemo(() => investmentResult(investmentB, taxableIncome, filingStatus, stateCode), [investmentB, taxableIncome, filingStatus, stateCode]);
  const winner = resultA.afterTaxIncome >= resultB.afterTaxIncome ? { label: "Investment A", symbol: investmentA.symbol, result: resultA, other: resultB } : { label: "Investment B", symbol: investmentB.symbol, result: resultB, other: resultA };
  const advantage = Math.abs(resultA.afterTaxIncome - resultB.afterTaxIncome);
  const selectedStateName = stateNames[stateCode] || stateCode;
  const inputs = useMemo<SnapshotInputs>(() => ({ filingStatus, stateCode, taxableIncome, investmentA, investmentB }), [filingStatus, stateCode, taxableIncome, investmentA, investmentB]);
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
    window.parent.postMessage({ type: "aftertaxus-snapshot-result", payload: embedPayload }, "*");
  }, [embedPayload]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleMessage = (event: MessageEvent) => {
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
      if (payload.investmentA) setInvestmentA((current) => safeInvestmentUpdate(payload.investmentA, current));
      if (payload.investmentB) setInvestmentB((current) => safeInvestmentUpdate(payload.investmentB, current));
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [taxableIncome]);

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
            <p className="eyebrow">Free snapshot calculator</p>
            <h1>See which income investment wins after tax.</h1>
            <p>Compare two investments using your filing status, state, taxable income, yield, and tax treatment.</p>
          </div>
          <div className="winner-card">
            <span>After-tax winner</span>
            <strong>{winner.symbol || winner.label}</strong>
            <em>+{currency(advantage)} / year</em>
          </div>
        </section>
      )}

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
        <NumberField label="Taxable income before these investments" prefix="$" value={taxableIncome} onChange={setTaxableIncome} />
      </section>

      <section className="compare-grid">
        <InvestmentCard title="Investment A" value={investmentA} onChange={setInvestmentA} />
        <div className="versus">VS</div>
        <InvestmentCard title="Investment B" value={investmentB} onChange={setInvestmentB} />
      </section>

      <section className="results-panel">
        <div className="results-main">
          <ComparisonBars a={resultA} b={resultB} label="Before-tax income" valueKey="beforeTaxIncome" />
          <ComparisonBars a={resultA} b={resultB} label="After-tax income" valueKey="afterTaxIncome" />
        </div>
        <aside className="tax-drag-card">
          <div className="thermometer-card">
            <div className="thermo-title">
              <span><img src={US_FLAG} alt="" /> + <img src={stateFlagUrl(stateCode)} alt="" /></span>
              <strong>Tax drag</strong>
            </div>
            <div className="thermo-track">
              <div className="thermo-fill" style={{ height: `${Math.min(Math.max(winner.result.effectiveTaxRate * 100, 4), 100)}%` }} />
              {noIncomeTaxStates.has(stateCode) && <div className="no-tax-stamp">No state income tax</div>}
            </div>
            <strong>{percent(winner.result.effectiveTaxRate)}</strong>
            <span>winning investment effective tax drag</span>
          </div>
          <div className="tax-lines">
            <div><span>{investmentA.symbol || "A"} tax cost</span><strong>{currency(resultA.taxCost)}</strong></div>
            <div><span>{investmentB.symbol || "B"} tax cost</span><strong>{currency(resultB.taxCost)}</strong></div>
            <div><span>Tax saved</span><strong>{currency(Math.abs(resultA.taxCost - resultB.taxCost))}</strong></div>
          </div>
          <p className="recommendation">
            {winner.symbol || winner.label} produces more after-tax income here. Lower yield can still win when the tax treatment is better.
          </p>
        </aside>
      </section>

      {initialSettings.isEmbedMode ? (
        <section className="embed-footer">
          <span>AI/chatbot ready: preload via URL parameters or update this frame with postMessage.</span>
        </section>
      ) : (
        <section className="cta-card">
          <div>
            <strong>Want the full portfolio view?</strong>
            <span>AfterTax US models accounts, asset classes, state taxes, deductions, what-if rows, and income exclusions.</span>
          </div>
          <button type="button" onClick={copyShareLink}>{copyStatus || "Copy embeddable comparison"}</button>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
