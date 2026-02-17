import { useState } from "react";

type ApiOk = { input: number; output: number };
type ApiErr = { error: string; debug?: any };

export default function App() {
  const [value, setValue] = useState<string>("7");
  const [out, setOut] = useState<ApiOk | null>(null);
  const [err, setErr] = useState<ApiErr | null>(null);
  const [loading, setLoading] = useState(false);

  async function callHello() {
    setLoading(true);
    setErr(null);
    setOut(null);

    try {
      const base = import.meta.env.VITE_API_BASE_URL as string;
      const num = Number(value);

      if (!Number.isFinite(num)) {
        setErr({ error: "Please enter a valid number." });
        return;
      }

      const res = await fetch(`${base}/hello`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: num })
      });

      const data = (await res.json()) as ApiOk | ApiErr;

      if (!res.ok) {
        setErr(data as ApiErr);
        return;
      }

      setOut(data as ApiOk);
    } catch (e: any) {
      setErr({ error: e?.message ?? "Unknown error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Multiply by 10</h1>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ padding: 8, width: 140 }}
        />
        <button onClick={callHello} disabled={loading} style={{ padding: "8px 12px" }}>
          {loading ? "Calling..." : "Send (POST JSON)"}
        </button>
      </div>

      {out && (
        <pre style={{ marginTop: 16 }}>
          {JSON.stringify(out, null, 2)}
        </pre>
      )}

      {err && (
        <pre style={{ marginTop: 16, color: "crimson" }}>
          {JSON.stringify(err, null, 2)}
        </pre>
      )}
    </div>
  );
}
