# AfterTax US Snapshot Embed

Use the snapshot calculator as an iframe in a chatbot shell, AI answer card, help-center bot, or marketing page.

## Iframe

```html
<iframe
  src="https://calculator.aftertaxus.com/?embed=1&state=CA&filingStatus=mfj&income=300000&amount=250000&aSymbol=BIL&aYield=4.8&aTaxType=ordinary&bSymbol=NAC&bYield=4.4&bTaxType=treasury"
  title="AfterTax US investment comparison"
  loading="lazy"
  style="width:100%;max-width:920px;height:760px;border:0;border-radius:24px;overflow:hidden"
></iframe>
```

## URL Parameters

- `embed=1` turns on the compact chatbot-friendly layout.
- `filingStatus` accepts `mfj`, `single`, `mfs`, or `hoh`.
- `state` accepts a two-letter state code like `CA`, `TX`, or `NY`.
- `income` is taxable income before the two compared investments.
- `amount` is the shared investment amount used for both scenarios.
- `aSymbol`, `aYield`, `aTaxType` configure Investment A.
- `bSymbol`, `bYield`, `bTaxType` configure Investment B.
- `aAmount` and `bAmount` are still accepted for older links; `amount` takes priority.
- `aTaxType` and `bTaxType` accept `ordinary`, `qualified`, `treasury`, `muni`, or `taxFree`.

## Chatbot Integration

The iframe posts live results to its parent window whenever inputs change:

```js
window.addEventListener("message", (event) => {
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
    investmentAmount: 250000,
    investmentA: { symbol: "BIL", yieldPercent: 4.8, taxType: "ordinary" },
    investmentB: { symbol: "NAC", yieldPercent: 4.4, taxType: "treasury" }
  }
}, "https://calculator.aftertaxus.com");
```

Normal ChatGPT chats cannot render arbitrary third-party iframes inline, but this works well for a custom chatbot web app, GPT action landing page, embedded browser surface, or any page that can host an iframe.
