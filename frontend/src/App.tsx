
import { useEffect, useState } from "react";
import "./App.css";

type TabKey = "investments" | "federal" | "state" | "calculator" | "tickers" | "taxTreatment" | "accounts" | "accountTaxType" | "investmentType";
type FilingStatus = "single" | "mfj";
type TaxResult = { calc: string; tax: number; ordinaryTax?: number; prefTax?: number; niit?: number };
type ApiError = { error: string };

type InvestmentRow = { id: number; account: string; name: string; ticker: string; investmentType: string; marketValue: number; annualIncome: number; taxTreatment: string; notes: string };
type TickerRow = { id: number; ticker: string; issuer: string; assetClass: string; dividendRate: number; exDividendDate: string; payoutDate: string; notes: string };
type TaxTreatmentRow = { id: number; label: string; federalBucket: string; stateBucket: string; preferredRate: string; notes: string };
type AccountRow = { id: number; account: string; institution: string; type: string; owner: string; notes: string };
type AccountTaxTypeRow = { id: number; account: string; taxType: string; includeInCashflow: string; notes: string };
type InvestmentTypeRow = { id: number; type: string; defaultTaxTreatment: string; preferredEligible: string; stateTreatment: string; notes: string };

type FederalSettings = { filingStatus: FilingStatus; extraOrdinaryIncome: number; extraQualifiedIncome: number; extraLongTermCapitalGains: number; socialSecurity: number; mortgageInterest: number; propertyTax: number; stateIncomeTax: number; standardDeduction: number; saltCap: number };
type StateSettings = { extraStateIncome: number; mortgageInterest: number; propertyTax: number; stateIncomeTax: number; standardDeduction: number };

type PlannerSettings = { federalWithholding: number; stateWithholding: number };

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;
const navItems: Array<{ key: TabKey; label: string; meta: string }> = [
  { key: "investments", label: "Investments", meta: "holdings grid" },
  { key: "federal", label: "Federal Tax", meta: "auto from investments" },
  { key: "state", label: "State Tax", meta: "CA worksheet" },
  { key: "calculator", label: "Tax Calculator", meta: "continuous totals" },
  { key: "tickers", label: "Tickers", meta: "market reference" },
  { key: "taxTreatment", label: "Tax Treatment", meta: "mapping table" },
  { key: "accounts", label: "Accounts", meta: "account registry" },
  { key: "accountTaxType", label: "Account Tax Type", meta: "tax wrappers" },
  { key: "investmentType", label: "Investment Type", meta: "type defaults" },
];

const initialInvestments: InvestmentRow[] = [
  { id: 1, account: "Vanguard Brokerage", name: "Municipal Bond Ladder", ticker: "NAD", investmentType: "Muni Bond", marketValue: 145000, annualIncome: 45200, taxTreatment: "", notes: "Primary tax-free sleeve" },
  { id: 2, account: "Interactive Brokers", name: "Dividend Core", ticker: "SPYI", investmentType: "ETF", marketValue: 118500, annualIncome: 31210, taxTreatment: "Qualified-div", notes: "Preferred-rate income" },
  { id: 3, account: "Rental Portfolio", name: "Palmetto + Sitio", ticker: "PRIVATE", investmentType: "Real Estate", marketValue: 99855, annualIncome: 61836, taxTreatment: "", notes: "Net ordinary cash flow" },
  { id: 4, account: "Schwab Rollover IRA", name: "Preferred Income ETF", ticker: "PFFA", investmentType: "ETF", marketValue: 84250, annualIncome: 10440, taxTreatment: "Qualified-div", notes: "Deferred wrapper" },
  { id: 5, account: "Treasury Direct", name: "I Bonds", ticker: "IBOND", investmentType: "Treasury", marketValue: 24000, annualIncome: 840, taxTreatment: "", notes: "State-exempt income" },
];
const initialTickers: TickerRow[] = [
  { id: 1, ticker: "SPYI", issuer: "NEOS", assetClass: "ETF", dividendRate: 0.12, exDividendDate: "2026-03-20", payoutDate: "2026-03-28", notes: "Income ETF" },
  { id: 2, ticker: "PFFA", issuer: "Virtus", assetClass: "Preferred ETF", dividendRate: 0.11, exDividendDate: "2026-03-21", payoutDate: "2026-03-31", notes: "Preferred sleeve" },
  { id: 3, ticker: "NAD", issuer: "Nuveen", assetClass: "Muni CEF", dividendRate: 0.047, exDividendDate: "2026-03-10", payoutDate: "2026-04-01", notes: "Federal tax free" },
];
const initialTaxTreatments: TaxTreatmentRow[] = [
  { id: 1, label: "Income", federalBucket: "ordinary", stateBucket: "taxable", preferredRate: "no", notes: "Interest and ordinary income" },
  { id: 2, label: "Qualified-div", federalBucket: "preferred", stateBucket: "taxable", preferredRate: "yes", notes: "Qualified dividends" },
  { id: 3, label: "Tax free", federalBucket: "excluded", stateBucket: "excluded", preferredRate: "no", notes: "Federal and CA muni income" },
  { id: 4, label: "State tax free", federalBucket: "ordinary", stateBucket: "excluded", preferredRate: "no", notes: "Treasuries" },
];
const initialAccounts: AccountRow[] = [
  { id: 1, account: "Vanguard Brokerage", institution: "Vanguard", type: "Brokerage", owner: "Joint", notes: "Taxable core account" },
  { id: 2, account: "Interactive Brokers", institution: "IBKR", type: "Brokerage", owner: "Joint", notes: "Active income sleeve" },
  { id: 3, account: "Schwab Rollover IRA", institution: "Schwab", type: "IRA", owner: "Kevin", notes: "Tax deferred" },
  { id: 4, account: "Treasury Direct", institution: "US Treasury", type: "Direct", owner: "Joint", notes: "Savings bonds" },
];
const initialAccountTaxTypes: AccountTaxTypeRow[] = [
  { id: 1, account: "Vanguard Brokerage", taxType: "taxable", includeInCashflow: "yes", notes: "Fully modeled" },
  { id: 2, account: "Interactive Brokers", taxType: "taxable", includeInCashflow: "yes", notes: "Fully modeled" },
  { id: 3, account: "Schwab Rollover IRA", taxType: "deferred", includeInCashflow: "no", notes: "Exclude from current tax flow" },
  { id: 4, account: "Treasury Direct", taxType: "taxable", includeInCashflow: "yes", notes: "Interest taxable federally" },
];
const initialInvestmentTypes: InvestmentTypeRow[] = [
  { id: 1, type: "ETF", defaultTaxTreatment: "Qualified-div", preferredEligible: "mixed", stateTreatment: "taxable", notes: "Default equity income treatment" },
  { id: 2, type: "Muni Bond", defaultTaxTreatment: "Tax free", preferredEligible: "no", stateTreatment: "excluded", notes: "Federal and state tax free" },
  { id: 3, type: "Treasury", defaultTaxTreatment: "State tax free", preferredEligible: "no", stateTreatment: "excluded", notes: "State exempt interest" },
  { id: 4, type: "Real Estate", defaultTaxTreatment: "Income", preferredEligible: "no", stateTreatment: "taxable", notes: "Net rental income" },
];
const initialFederalSettings: FederalSettings = { filingStatus: "mfj", extraOrdinaryIncome: 0, extraQualifiedIncome: 0, extraLongTermCapitalGains: 0, socialSecurity: 0, mortgageInterest: 19500, propertyTax: 19000, stateIncomeTax: 5153, standardDeduction: 31500, saltCap: 40400 };
const initialStateSettings: StateSettings = { extraStateIncome: 0, mortgageInterest: 26500, propertyTax: 19000, stateIncomeTax: 5153, standardDeduction: 11000 };
const initialPlannerSettings: PlannerSettings = { federalWithholding: 0, stateWithholding: 0 };

function toNumber(value: number | string) { const num = Number(value); return Number.isFinite(num) ? num : 0; }
function formatCurrency(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function formatCurrencyDetailed(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value); }
function formatPercent(value: number) { return `${(value * 100).toFixed(1)}%`; }
function taxableSocialSecurity(ssIncome: number, otherIncome: number, muniBondIncome: number, filingStatus: FilingStatus) {
  const ss = toNumber(ssIncome); if (ss <= 0) return 0;
  const provisionalIncome = toNumber(otherIncome) + toNumber(muniBondIncome) + ss * 0.5;
  const thresholds = filingStatus === "mfj" ? { base1: 32000, base2: 44000, cap: 6000 } : { base1: 25000, base2: 34000, cap: 4500 };
  if (provisionalIncome <= thresholds.base1) return 0;
  if (provisionalIncome <= thresholds.base2) return Math.min(ss * 0.5, (provisionalIncome - thresholds.base1) * 0.5);
  const aboveSecondBand = (provisionalIncome - thresholds.base2) * 0.85;
  return Math.min(ss * 0.85, aboveSecondBand + Math.min(thresholds.cap, ss * 0.5));
}
async function postTaxCalculation(payload: Record<string, number | string>) {
  if (!API_BASE_URL) throw new Error("Missing VITE_API_BASE_URL in frontend/.env");
  const response = await fetch(`${API_BASE_URL}/hello`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const json = (await response.json()) as TaxResult | ApiError;
  if (!response.ok) throw new Error((json as ApiError).error || "API request failed");
  return json as TaxResult;
}
function MetricCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "accent" | "warning" }) {
  return <div className={`metric-card metric-card--${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}
function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <section className="sheet-section"><div className="section-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</section>; }
function DataTable<T extends { id: number }>({ title, subtitle, rows, columns, onChange, onAdd, onRemove }: { title: string; subtitle: string; rows: T[]; columns: Array<{ key: keyof T; label: string; type?: "text" | "number" }>; onChange: (id: number, field: keyof T, value: string) => void; onAdd: () => void; onRemove: (id: number) => void; }) {
  return <Section title={title} subtitle={subtitle}><div className="actions-row"><button className="primary-button" type="button" onClick={onAdd}>Add row</button></div><div className="table-wrap table-wrap--tall"><table className="sheet-table"><thead><tr>{columns.map((column) => <th key={String(column.key)}>{column.label}</th>)}<th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={String(column.key)}><input type={column.type === "number" ? "number" : "text"} value={String(row[column.key] ?? "")} onChange={(event) => onChange(row.id, column.key, event.target.value)} /></td>)}<td><button className="ghost-button" type="button" onClick={() => onRemove(row.id)}>Remove</button></td></tr>)}</tbody></table></div></Section>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("investments");
  const [investments, setInvestments] = useState(initialInvestments);
  const [tickers, setTickers] = useState(initialTickers);
  const [taxTreatments, setTaxTreatments] = useState(initialTaxTreatments);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [accountTaxTypes, setAccountTaxTypes] = useState(initialAccountTaxTypes);
  const [investmentTypes, setInvestmentTypes] = useState(initialInvestmentTypes);
  const [federalSettings, setFederalSettings] = useState(initialFederalSettings);
  const [stateSettings, setStateSettings] = useState(initialStateSettings);
  const [plannerSettings, setPlannerSettings] = useState(initialPlannerSettings);
  const [federalResult, setFederalResult] = useState<TaxResult | null>(null);
  const [stateResult, setStateResult] = useState<TaxResult | null>(null);
  const [federalError, setFederalError] = useState<string | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);

  const accountTaxMap = Object.fromEntries(accountTaxTypes.map((row) => [row.account, row.taxType.toLowerCase()]));
  const typeTreatmentMap = Object.fromEntries(investmentTypes.map((row) => [row.type, row.defaultTaxTreatment]));
  const treatmentMap = Object.fromEntries(taxTreatments.map((row) => [row.label.toLowerCase(), row]));

  const flows = investments.reduce((acc, row) => {
    const accountTaxType = accountTaxMap[row.account] || "taxable";
    const includeInCashflow = (accountTaxTypes.find((item) => item.account === row.account)?.includeInCashflow || "yes").toLowerCase() !== "no";
    const effectiveTreatment = (row.taxTreatment || typeTreatmentMap[row.investmentType] || "Income").toLowerCase();
    const treatment = treatmentMap[effectiveTreatment] || treatmentMap.income;
    acc.totalInvestmentAmount += row.marketValue;
    if (includeInCashflow) acc.totalIncome += row.annualIncome;
    if (accountTaxType !== "taxable") return acc;
    if (treatment.federalBucket === "ordinary") acc.federalOrdinary += row.annualIncome;
    if (treatment.federalBucket === "preferred") acc.federalPreferred += row.annualIncome;
    if (effectiveTreatment === "tax free") acc.muniIncome += row.annualIncome;
    if (treatment.stateBucket === "taxable") acc.stateTaxable += row.annualIncome;
    return acc;
  }, { totalInvestmentAmount: 0, totalIncome: 0, federalOrdinary: 0, federalPreferred: 0, muniIncome: 0, stateTaxable: 0 });

  const taxableSs = taxableSocialSecurity(federalSettings.socialSecurity, flows.federalOrdinary + federalSettings.extraOrdinaryIncome + federalSettings.extraQualifiedIncome + federalSettings.extraLongTermCapitalGains, flows.muniIncome, federalSettings.filingStatus);
  const ordinaryBeforeDeductions = flows.federalOrdinary + federalSettings.extraOrdinaryIncome + taxableSs;
  const preferredBeforeDeductions = flows.federalPreferred + federalSettings.extraQualifiedIncome + federalSettings.extraLongTermCapitalGains;
  const grossFederalTaxable = ordinaryBeforeDeductions + preferredBeforeDeductions;
  const itemizedFederalDeduction = Math.min(federalSettings.propertyTax + federalSettings.stateIncomeTax, federalSettings.saltCap) + federalSettings.mortgageInterest;
  const federalDeduction = Math.max(federalSettings.standardDeduction, itemizedFederalDeduction);
  const federalTaxableAfterDeductions = Math.max(grossFederalTaxable - federalDeduction, 0);
  const prefTaxable = Math.min(preferredBeforeDeductions, federalTaxableAfterDeductions);
  const ordinaryTaxable = Math.max(federalTaxableAfterDeductions - prefTaxable, 0);
  const magi = grossFederalTaxable;
  const netInvestmentIncome = flows.federalOrdinary + flows.federalPreferred + federalSettings.extraQualifiedIncome + federalSettings.extraLongTermCapitalGains;
  const niitThreshold = federalSettings.filingStatus === "mfj" ? 250000 : 200000;
  const niitBase = Math.max(Math.min(netInvestmentIncome, Math.max(magi - niitThreshold, 0)), 0);

  const stateGross = flows.stateTaxable + stateSettings.extraStateIncome;
  const stateItemized = stateSettings.mortgageInterest + stateSettings.propertyTax + stateSettings.stateIncomeTax;
  const stateDeduction = Math.max(stateSettings.standardDeduction, stateItemized);
  const stateTaxableAfterDeductions = Math.max(stateGross - stateDeduction, 0);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await postTaxCalculation({ calc: "FED_TAX_2025_COMBINED", ordinaryTaxable, prefTaxable, filingStatus: federalSettings.filingStatus, magi, netInvestmentIncome });
        if (!cancelled) { setFederalResult(response); setFederalError(null); }
      } catch (error) {
        if (!cancelled) setFederalError(error instanceof Error ? error.message : "Unknown federal API error");
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [ordinaryTaxable, prefTaxable, federalSettings.filingStatus, magi, netInvestmentIncome]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await postTaxCalculation({ calc: "STATE_TAX_2025_CA_MFJ", taxableIncome: stateTaxableAfterDeductions });
        if (!cancelled) { setStateResult(response); setStateError(null); }
      } catch (error) {
        if (!cancelled) setStateError(error instanceof Error ? error.message : "Unknown state API error");
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [stateTaxableAfterDeductions]);

  const totalTax = (federalResult?.tax || 0) + (stateResult?.tax || 0);
  const afterTaxIncome = flows.totalIncome - totalTax;
  const netAfterWithholding = totalTax - plannerSettings.federalWithholding - plannerSettings.stateWithholding;
  function updateCollection<T extends { id: number }>(setter: React.Dispatch<React.SetStateAction<T[]>>, numericFields: Array<keyof T> = []) { return (id: number, field: keyof T, value: string) => setter((current) => current.map((row) => (row.id === id ? { ...row, [field]: numericFields.includes(field) ? toNumber(value) : value } : row))); }
  function addRow<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, row: T) { setter((current) => [...current, row]); }
  function removeRow<T extends { id: number }>(setter: React.Dispatch<React.SetStateAction<T[]>>) { return (id: number) => setter((current) => current.filter((row) => row.id !== id)); }

  return (
    <div className="workspace-shell">
      <aside className="sidebar"><div className="sidebar__brand"><p>Portfolio Workbench</p><h1>Tax + investment planner</h1><span>Workbook-style navigation with live Lambda tax runs.</span></div><nav className="sidebar__nav">{navItems.map((item) => <button key={item.key} type="button" className={item.key === activeTab ? "nav-item nav-item--active" : "nav-item"} onClick={() => setActiveTab(item.key)}><strong>{item.label}</strong><span>{item.meta}</span></button>)}</nav></aside>
      <main className="content-panel">
        <div className="summary-ribbon"><MetricCard label="Total investment amount" value={formatCurrency(flows.totalInvestmentAmount)} tone="accent" /><MetricCard label="Annual income" value={formatCurrency(flows.totalIncome)} /><MetricCard label="Portfolio yield" value={formatPercent(flows.totalInvestmentAmount > 0 ? flows.totalIncome / flows.totalInvestmentAmount : 0)} /><MetricCard label="After-tax income" value={formatCurrency(afterTaxIncome)} tone="warning" /><MetricCard label="Federal tax" value={formatCurrencyDetailed(federalResult?.tax || 0)} /><MetricCard label="State tax" value={formatCurrencyDetailed(stateResult?.tax || 0)} /><MetricCard label="Total tax" value={formatCurrencyDetailed(totalTax)} /></div>
        <div className="content-topbar"><div><p className="eyebrow">Current Sheet</p><h2>{navItems.find((item) => item.key === activeTab)?.label}</h2></div><div className="topbar-chip">API: {API_BASE_URL ? "connected" : "missing .env"}</div></div>
        {activeTab === "investments" && <DataTable title="Investments" subtitle="Primary source table. These rows now flow automatically into the federal and state tax sheets through account tax type, investment type, and tax treatment mappings." rows={investments} columns={[{ key: "account", label: "Account" }, { key: "name", label: "Investment" }, { key: "ticker", label: "Ticker" }, { key: "investmentType", label: "Investment Type" }, { key: "marketValue", label: "Market Value", type: "number" }, { key: "annualIncome", label: "Annual Income", type: "number" }, { key: "taxTreatment", label: "Tax Treatment Override" }, { key: "notes", label: "Notes" }]} onChange={updateCollection(setInvestments, ["marketValue", "annualIncome"])} onAdd={() => addRow(setInvestments, { id: Date.now(), account: "New Account", name: "New Investment", ticker: "", investmentType: "ETF", marketValue: 0, annualIncome: 0, taxTreatment: "", notes: "" })} onRemove={removeRow(setInvestments)} />}
        {activeTab === "tickers" && <DataTable title="Tickers" subtitle="Reference table for symbols, issuers, dividend dates, and notes." rows={tickers} columns={[{ key: "ticker", label: "Ticker" }, { key: "issuer", label: "Issuer" }, { key: "assetClass", label: "Asset Class" }, { key: "dividendRate", label: "Dividend Rate", type: "number" }, { key: "exDividendDate", label: "Ex-Date" }, { key: "payoutDate", label: "Payout" }, { key: "notes", label: "Notes" }]} onChange={updateCollection(setTickers, ["dividendRate"])} onAdd={() => addRow(setTickers, { id: Date.now(), ticker: "", issuer: "", assetClass: "", dividendRate: 0, exDividendDate: "", payoutDate: "", notes: "" })} onRemove={removeRow(setTickers)} />}
        {activeTab === "taxTreatment" && <DataTable title="Tax Treatment" subtitle="Maps effective investment treatment into federal and state tax buckets." rows={taxTreatments} columns={[{ key: "label", label: "Label" }, { key: "federalBucket", label: "Federal Bucket" }, { key: "stateBucket", label: "State Bucket" }, { key: "preferredRate", label: "Preferred Rate" }, { key: "notes", label: "Notes" }]} onChange={updateCollection(setTaxTreatments)} onAdd={() => addRow(setTaxTreatments, { id: Date.now(), label: "", federalBucket: "ordinary", stateBucket: "taxable", preferredRate: "no", notes: "" })} onRemove={removeRow(setTaxTreatments)} />}
        {activeTab === "accounts" && <DataTable title="Accounts" subtitle="Institution and wrapper registry used by the investments table." rows={accounts} columns={[{ key: "account", label: "Account" }, { key: "institution", label: "Institution" }, { key: "type", label: "Type" }, { key: "owner", label: "Owner" }, { key: "notes", label: "Notes" }]} onChange={updateCollection(setAccounts)} onAdd={() => addRow(setAccounts, { id: Date.now(), account: "", institution: "", type: "", owner: "", notes: "" })} onRemove={removeRow(setAccounts)} />}
        {activeTab === "accountTaxType" && <DataTable title="Account Tax Type" subtitle="Determines whether an account is taxable, deferred, or tax-free, and whether it flows into cashflow and current tax calculations." rows={accountTaxTypes} columns={[{ key: "account", label: "Account" }, { key: "taxType", label: "Tax Type" }, { key: "includeInCashflow", label: "Include In Cashflow" }, { key: "notes", label: "Notes" }]} onChange={updateCollection(setAccountTaxTypes)} onAdd={() => addRow(setAccountTaxTypes, { id: Date.now(), account: "", taxType: "taxable", includeInCashflow: "yes", notes: "" })} onRemove={removeRow(setAccountTaxTypes)} />}
        {activeTab === "investmentType" && <DataTable title="Investment Type" subtitle="Provides default tax treatment behavior when the investment row does not override it." rows={investmentTypes} columns={[{ key: "type", label: "Type" }, { key: "defaultTaxTreatment", label: "Default Tax Treatment" }, { key: "preferredEligible", label: "Preferred Eligible" }, { key: "stateTreatment", label: "State Treatment" }, { key: "notes", label: "Notes" }]} onChange={updateCollection(setInvestmentTypes)} onAdd={() => addRow(setInvestmentTypes, { id: Date.now(), type: "", defaultTaxTreatment: "Income", preferredEligible: "no", stateTreatment: "taxable", notes: "" })} onRemove={removeRow(setInvestmentTypes)} />}

        {activeTab === "federal" && <Section title="Federal Tax" subtitle="Continuously recalculated from the investments sheet plus deduction and filing-status settings."><div className="form-grid"><label><span>Filing status</span><select value={federalSettings.filingStatus} onChange={(e) => setFederalSettings((c) => ({ ...c, filingStatus: e.target.value as FilingStatus }))}><option value="mfj">Married filing jointly</option><option value="single">Single</option></select></label><label><span>Extra ordinary income</span><input type="number" value={federalSettings.extraOrdinaryIncome} onChange={(e) => setFederalSettings((c) => ({ ...c, extraOrdinaryIncome: toNumber(e.target.value) }))} /></label><label><span>Extra qualified income</span><input type="number" value={federalSettings.extraQualifiedIncome} onChange={(e) => setFederalSettings((c) => ({ ...c, extraQualifiedIncome: toNumber(e.target.value) }))} /></label><label><span>Extra LTCG</span><input type="number" value={federalSettings.extraLongTermCapitalGains} onChange={(e) => setFederalSettings((c) => ({ ...c, extraLongTermCapitalGains: toNumber(e.target.value) }))} /></label><label><span>Social Security</span><input type="number" value={federalSettings.socialSecurity} onChange={(e) => setFederalSettings((c) => ({ ...c, socialSecurity: toNumber(e.target.value) }))} /></label><label><span>Mortgage interest</span><input type="number" value={federalSettings.mortgageInterest} onChange={(e) => setFederalSettings((c) => ({ ...c, mortgageInterest: toNumber(e.target.value) }))} /></label><label><span>Property tax</span><input type="number" value={federalSettings.propertyTax} onChange={(e) => setFederalSettings((c) => ({ ...c, propertyTax: toNumber(e.target.value) }))} /></label><label><span>State income tax</span><input type="number" value={federalSettings.stateIncomeTax} onChange={(e) => setFederalSettings((c) => ({ ...c, stateIncomeTax: toNumber(e.target.value) }))} /></label><label><span>Standard deduction</span><input type="number" value={federalSettings.standardDeduction} onChange={(e) => setFederalSettings((c) => ({ ...c, standardDeduction: toNumber(e.target.value) }))} /></label><label><span>SALT cap</span><input type="number" value={federalSettings.saltCap} onChange={(e) => setFederalSettings((c) => ({ ...c, saltCap: toNumber(e.target.value) }))} /></label></div><div className="metric-grid"><MetricCard label="Ordinary from investments" value={formatCurrency(flows.federalOrdinary)} /><MetricCard label="Preferred from investments" value={formatCurrency(flows.federalPreferred)} /><MetricCard label="Muni income" value={formatCurrency(flows.muniIncome)} /><MetricCard label="Ordinary taxable" value={formatCurrency(ordinaryTaxable)} tone="accent" /><MetricCard label="Preferred taxable" value={formatCurrency(prefTaxable)} /><MetricCard label="MAGI" value={formatCurrency(magi)} /><MetricCard label="Net investment income" value={formatCurrency(netInvestmentIncome)} /><MetricCard label="NIIT base" value={formatCurrency(niitBase)} /></div>{federalError && <div className="status-card status-card--error">{federalError}</div>}{federalResult && <div className="api-grid"><MetricCard label="Federal total" value={formatCurrencyDetailed(federalResult.tax)} tone="accent" /><MetricCard label="Ordinary tax" value={formatCurrencyDetailed(federalResult.ordinaryTax || 0)} /><MetricCard label="Preferred tax" value={formatCurrencyDetailed(federalResult.prefTax || 0)} /><MetricCard label="NIIT" value={formatCurrencyDetailed(federalResult.niit || 0)} /></div>}</Section>}
        {activeTab === "state" && <Section title="State Tax" subtitle="Continuously recalculated California worksheet using investment-driven taxable income plus manual adjustments."><div className="status-card status-card--note">Current backend support is still modeled for the California MFJ route.</div><div className="form-grid form-grid--compact-wide"><label><span>Extra California income</span><input type="number" value={stateSettings.extraStateIncome} onChange={(e) => setStateSettings((c) => ({ ...c, extraStateIncome: toNumber(e.target.value) }))} /></label><label><span>Mortgage interest</span><input type="number" value={stateSettings.mortgageInterest} onChange={(e) => setStateSettings((c) => ({ ...c, mortgageInterest: toNumber(e.target.value) }))} /></label><label><span>Property tax</span><input type="number" value={stateSettings.propertyTax} onChange={(e) => setStateSettings((c) => ({ ...c, propertyTax: toNumber(e.target.value) }))} /></label><label><span>State income tax</span><input type="number" value={stateSettings.stateIncomeTax} onChange={(e) => setStateSettings((c) => ({ ...c, stateIncomeTax: toNumber(e.target.value) }))} /></label><label><span>CA standard deduction</span><input type="number" value={stateSettings.standardDeduction} onChange={(e) => setStateSettings((c) => ({ ...c, standardDeduction: toNumber(e.target.value) }))} /></label></div><div className="metric-grid"><MetricCard label="State-taxable from investments" value={formatCurrency(flows.stateTaxable)} /><MetricCard label="CA gross" value={formatCurrency(stateGross)} /><MetricCard label="CA deduction used" value={formatCurrency(stateDeduction)} /><MetricCard label="CA taxable after deductions" value={formatCurrency(stateTaxableAfterDeductions)} tone="accent" /></div>{stateError && <div className="status-card status-card--error">{stateError}</div>}{stateResult && <div className="api-grid"><MetricCard label="California tax" value={formatCurrencyDetailed(stateResult.tax)} tone="accent" /></div>}</Section>}
        {activeTab === "calculator" && <Section title="Tax Calculator" subtitle="Always-live scenario summary. As investments or settings change, total tax and after-tax income update automatically."><div className="form-grid form-grid--compact"><label><span>Federal withholding</span><input type="number" value={plannerSettings.federalWithholding} onChange={(e) => setPlannerSettings((c) => ({ ...c, federalWithholding: toNumber(e.target.value) }))} /></label><label><span>State withholding</span><input type="number" value={plannerSettings.stateWithholding} onChange={(e) => setPlannerSettings((c) => ({ ...c, stateWithholding: toNumber(e.target.value) }))} /></label></div><div className="api-grid"><MetricCard label="Federal tax" value={formatCurrencyDetailed(federalResult?.tax || 0)} /><MetricCard label="State tax" value={formatCurrencyDetailed(stateResult?.tax || 0)} /><MetricCard label="Total tax" value={formatCurrencyDetailed(totalTax)} tone="accent" /><MetricCard label="After-tax income" value={formatCurrencyDetailed(afterTaxIncome)} /><MetricCard label="Net owed / refund" value={formatCurrencyDetailed(netAfterWithholding)} tone={netAfterWithholding > 0 ? "warning" : "accent"} /></div></Section>}
      </main>
    </div>
  );
}

