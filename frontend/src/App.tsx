import { useState } from "react";

export default function App() {
  const [out, setOut] = useState<any>(null);

  async function callHello() {
    const base = import.meta.env.VITE_API_BASE_URL;
    console.log("Calling:", `${base}/hello`);
    const res = await fetch(`${base}/hello`);
    const data = await res.json();
    setOut(data);
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Portfolio App</h1>
      <button onClick={callHello}>Call Lambda</button>
      <pre style={{ marginTop: 16 }}>{out ? JSON.stringify(out, null, 2) : ""}</pre>
    </div>
  );
}
