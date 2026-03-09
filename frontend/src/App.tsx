import { useState } from "react";

type CalcType = "FED_TAX_2025_MFJ" | "STATE_TAX_2025_CA_MFJ" | "FED_PREF_TAX_2024";
type FilingStatus = "single" | "mfj" | "mfs" | "hoh";

type ApiOk =
  | { calc: "FED_TAX_2025_MFJ" | "STATE_TAX_2025_CA_MFJ"; taxableIncome: number; tax: number }
  | {
      calc: "FED_PREF_TAX_2024";
      ordinaryTaxable: number;
      prefTaxable: number;
      filingStatus: FilingStatus;
      tax: number;
    };

type ApiErr = { error: string; allowed?: string[] };

const fieldStyle = { padding: 8, width: 220 };

export default function App() {
  const [calc, setCalc] = useState<CalcType>("FED_TAX_2025_MFJ");
  const [taxableIncome, setTaxableIncome] = useState("450000");
  const [ordinaryTaxable, setOrdinaryTaxable] = useState("150000");
  const [prefTaxable, setPrefTaxable] = useState("25000");
  const [filingStatus, setFilingStatus] = useState<FilingStatus>("mfj");
  const [out, setOut] = useState<ApiOk | null>(null);
  const [err, setErr] = useState<ApiErr | null>(null);
  const [loading, setLoading] = useState(false);

  async function callHello() {
    setLoading(true);
    setErr(null);
    setOut(null);

    try {
      const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
      if (!base) {
        setErr({ error: "Missing VITE_API_BASE_URL." });
        return;
      }

      let payload: Record<string, string | number> = { calc };

      if (calc === "FED_PREF_TAX_2024") {
        const ordinary = Number(ordinaryTaxable);
        const pref = Number(prefTaxable);

        if (!Number.isFinite(ordinary) || ordinary < 0 || !Number.isFinite(pref) || pref < 0) {
          setErr({ error: "Enter valid non-negative amounts for ordinary and preferential income." });
          return;
        }

        payload = {
          calc,
          ordinaryTaxable: ordinary,
          prefTaxable: pref,
          filingStatus,
        };
      } else {
        const income = Number(taxableIncome);

        if (!Number.isFinite(income) || income < 0) {
          setErr({ error: "Enter a valid non-negative taxable income." });
          return;
        }

        payload = { calc, taxableIncome: income };
      }

      const res = await fetch(`${base}/hello`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as ApiOk | ApiErr;

      if (!res.ok) {
        setErr(data as ApiErr);
        return;
      }

      setOut(data as ApiOk);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setErr({ error: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720 }}>
      <h1>Tax API Smoke Test</h1>
      <p>Send a request to the Amplify API and inspect the tax calculation response.</p>

      <div style={{ display: "grid", gap: 12 }}>
        <label>
          <div>Calculation</div>
          <select value={calc} onChange={(e) => setCalc(e.target.value as CalcType)} style={fieldStyle}>
            <option value="FED_TAX_2025_MFJ">Federal tax 2025 MFJ</option>
            <option value="STATE_TAX_2025_CA_MFJ">California tax 2025 MFJ</option>
            <option value="FED_PREF_TAX_2024">Federal preferential tax 2024</option>
          </select>
        </label>

        {calc === "FED_PREF_TAX_2024" ? (
          <>
            <label>
              <div>Ordinary taxable income</div>
              <input
                type="number"
                value={ordinaryTaxable}
                onChange={(e) => setOrdinaryTaxable(e.target.value)}
                style={fieldStyle}
              />
            </label>
            <label>
              <div>Preferential taxable income</div>
              <input
                type="number"
                value={prefTaxable}
                onChange={(e) => setPrefTaxable(e.target.value)}
                style={fieldStyle}
              />
            </label>
            <label>
              <div>Filing status</div>
              <select
                value={filingStatus}
                onChange={(e) => setFilingStatus(e.target.value as FilingStatus)}
                style={fieldStyle}
              >
                <option value="single">Single</option>
                <option value="mfj">Married filing jointly</option>
                <option value="mfs">Married filing separately</option>
                <option value="hoh">Head of household</option>
              </select>
            </label>
          </>
        ) : (
          <label>
            <div>Taxable income</div>
            <input
              type="number"
              value={taxableIncome}
              onChange={(e) => setTaxableIncome(e.target.value)}
              style={fieldStyle}
            />
          </label>
        )}

        <button onClick={callHello} disabled={loading} style={{ padding: "10px 14px", width: 220 }}>
          {loading ? "Calling..." : "Send request"}
        </button>
      </div>

      {out && <pre style={{ marginTop: 16 }}>{JSON.stringify(out, null, 2)}</pre>}

      {err && (
        <pre style={{ marginTop: 16, color: "crimson" }}>
          {JSON.stringify(err, null, 2)}
        </pre>
      )}
    </div>
  );
}
