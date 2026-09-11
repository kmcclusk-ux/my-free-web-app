# AfterTax US Snapshot Embed

Use the snapshot calculator as an iframe in a chatbot shell, AI answer card, help-center bot, or marketing page.

## Iframe

```html
<iframe
  src="https://calculator.aftertaxus.com/?embed=1&state=CA&filingStatus=mfj&income=300000&deductionMethod=standard&stateDeduction=10000&amount=250000&aSymbol=ExampleA&aYield=4.8&aTaxType=ordinary&bSymbol=ExampleB&bYield=4.4&bTaxType=treasury"
  title="AfterTax US investment comparison"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin"
  style="width:100%;max-width:920px;height:760px;border:0;border-radius:24px;overflow:hidden"
></iframe>
```

## URL Parameters

- `embed=1` turns on the compact chatbot-friendly layout.
- `filingStatus` accepts `mfj`, `single`, `mfs`, or `hoh`.
- `state` accepts a two-letter state code like `CA`, `TX`, or `NY`.
- `income` is income before deductions and before the two compared investments.
- `deductionMethod` accepts `standard` or `itemized`.
- `mortgageInterest`, `propertyTax`, `charitable`, and `otherDeductions` are already-allowed federal amounts used when `deductionMethod=itemized`. Eligibility limits and SALT caps must be applied before entry.
- `stateDeduction` is the separate, already-allowed state deduction/exclusion total. It defaults to zero, not the federal deduction. Automatic state eligibility, credits and special taxes are outside this simplified model.
- `amount` is the shared investment amount used for both scenarios.
- `aSymbol`, `aYield`, `aTaxType` configure Investment A.
- `bSymbol`, `bYield`, `bTaxType` configure Investment B.
- `aAmount` and `bAmount` are still accepted for older links; `amount` takes priority.
- `aTaxType` and `bTaxType` accept `ordinary`, `qualified`, `treasury`, `muni`, or `taxFree`.

## Chatbot Integration

The iframe posts live results to its parent window whenever inputs change:

```js
window.addEventListener("message", (event) => {
  if (event.source !== iframe.contentWindow || event.origin !== "https://calculator.aftertaxus.com") return;
  if (event.data?.type !== "aftertaxus-snapshot-result") return;
  console.log(event.data.payload);
});
```

The parent can update the calculator without reloading the iframe:

```js
iframe.contentWindow.postMessage({
  type: "aftertaxus-snapshot-set-inputs",
  payload: {
    filingStatus: "mfj",
    stateCode: "CA",
    taxableIncome: 300000,
    stateAllowedDeduction: 10000,
    deductionMethod: "itemized",
    itemizedDeductions: { mortgageInterest: 12000, propertyTax: 10000, charitable: 2500, other: 0 },
    investmentAmount: 250000,
    investmentA: { symbol: "ExampleA", yieldPercent: 4.8, taxType: "ordinary" },
    investmentB: { symbol: "ExampleB", yieldPercent: 4.4, taxType: "treasury" }
  }
}, "https://calculator.aftertaxus.com");
```

Messaging requires an HTTP(S) embedding parent whose origin is available in the iframe's referrer. The calculator checks both message source and origin and sends results only to that origin, never a wildcard. With a suppressed referrer the calculator remains usable, but cross-window messaging is disabled. Do not put personal information or credentials in share-link parameters.

## Calculation scope

Uses the 2025 shared portfolio engine for incremental federal ordinary/preferred income tax, NIIT and state bracket tax. The baseline is ordinary income, not a complete existing portfolio. Existing investment-income NIIT effects, Social Security taxation, local/payroll taxes, AMT, credits and automatic state exclusions are not modeled. A municipal exemption must match residency and the fund's actual eligible income; the symbol alone does not establish tax treatment.

Catalog yields and the examples here are illustrative, not live market quotes. Selecting a symbol resets tax treatment to ordinary income for user confirmation. Dollar inputs support zero through $1 trillion and yields zero through 1,000%; invalid interactive drafts retain the last valid calculation with a visible warning. Invalid URL/message numbers retain the prior/default value.

The `taxableIncome` message field retains its legacy name for compatibility but means income **before** deductions and the compared investment. An iframe-capable host is required; this is not an MCP Apps implementation.
