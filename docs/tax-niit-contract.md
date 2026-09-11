# Federal NIIT input contract (2025)

Applies to `calculateFederalTax2025` and `calculateTaxPlan2025` in
`amplify/backend/function/helloWorld/src/taxCalcs.ts`. This is a planning-engine
contract, not a complete Form 8960 preparation workflow. Existing model/version
identifiers remain unchanged; the aggregate mode and reconciliation output are
additive.

## Official source expectations

Retrieved September 10, 2026: IRS [2025 Form 8960 instructions, archived PDF](https://www.irs.gov/pub/irs-prior/i8960--2025.pdf)
and [2025 HTML instructions](https://www.irs.gov/instructions/i8960).

- Lines 5a–5d start with return-reported gains/losses and apply NIIT-specific
  exclusions. Excluded gains use negative adjustments; excluded losses use
  positive adjustments. NIIT loss-carryforward adjustments can differ from
  regular-tax carryforwards.
- Line 2 uses ordinary dividends, including the qualified portion, rather than
  adding qualified dividends separately.
- Lines 9a–9c require allowable, properly allocated expenses. Expenses already
  included in net activity income must not be deducted again. Investment interest
  depends on the permitted deduction, not merely cash paid. Ordinary investment
  management/custodial fees are generally disallowed in 2025.

The IRS [2025 Form 8960](https://www.irs.gov/pub/irs-pdf/f8960.pdf), lines 12–17,
floors NII at zero and taxes the smaller of NII or positive MAGI excess at 3.8%.
The instructions specify thresholds of $200,000 single/HOH, $250,000 MFJ/qualifying
surviving spouse, and $125,000 MFS.

## Choose one NIIT representation

### 1. Separate investment ledger

Supply `investmentIncome`, even `{}` for capital-only classification with explicit
adjustments. Its six income fields are mutually nonduplicative NIIT amounts:

- `taxableInterest`, `ordinaryDividends`, `taxableAnnuities`: nonnegative amounts.
- `passiveRentalIncome`, `passiveBusinessIncome`, `otherInvestmentIncome`: signed
  net amounts after activity-level expenses and caller-determined limitations.
- `ordinaryDividends` includes any qualified dividends also present in
  `preferredIncome`; the engine does not add `preferredIncome` to NIIT.
- Do not put modeled capital gains in `otherInvestmentIncome`. The engine adds
  `capital.ordinaryGain + capital.preferentialGain` automatically, after netting
  current losses and carryovers, then subtracts the current capital-loss deduction
  once ($3,000 maximum; $1,500 for MFS).
- `allowedInvestmentExpenses` is a nonnegative **additional** NIIT deduction:
  exclude expenses already netted into any of the six income fields. There is no
  automatic import from above-line/itemized deduction rows or modeled SALT.
- `capitalGainOrLossAdjustment` is a signed, caller-computed NIIT-only difference
  from the engine's capital result, **after** its netting and current deduction.
  Do not repeat regular capital offsets, carryovers, or expenses here. It changes
  neither regular income tax nor the engine's regular capital carryovers.

The ledger classifies income for NIIT; it does not add interest, dividends, rents,
or other noncapital income to regular AGI. Include those amounts separately in
the regular-income inputs, with qualified dividends in `preferredIncome`.
With explicit `capitalGains`, exclude its gains from regular ordinary/preferred
inputs because the engine adds its net gains there too.

### 2. Legacy aggregate (default, unchanged)

Supply `netInvestmentIncome` and omit `netInvestmentIncomeMode`, or set it to
`"pre-capital-loss"`. Despite its historical name, this aggregate is **before the
engine's capital losses**, includes gross modeled capital gains, and is **after
any caller-allowed investment expenses**. The engine subtracts the modeled
gain offset and current capital-loss deduction once. It does not add capital
gains again or subtract regular-tax expense rows. This remains true with an
explicit `capitalGains` ledger. An explicit zero remains authoritative.

### 3. Already-final aggregate (opt-in)

Set `netInvestmentIncomeMode: "final"` and supply nonnegative
`netInvestmentIncome`: the completed NII amount after all capital netting,
NIIT-specific adjustments and allowed expenses. The engine uses it unchanged
for the MAGI-limited NIIT calculation. Capital fields still affect regular income
tax, but add/subtract nothing further from this NIIT total. This avoids repeating
losses or expenses already included by an upstream calculator.

Any explicit aggregate mode requires an aggregate amount and cannot coexist
with `investmentIncome`. Without a mode, the old combination of ledger and
aggregate remains accepted: the ledger wins (even `{}`), with an
`NIIT_AGGREGATE_IGNORED` warning rather than silent precedence.

### 4. Neither ledger nor aggregate

If `capitalGains` is supplied, NIIT now derives the explicit net investment
capital amount, including the current deductible loss, instead of silently
omitting capital gains. `NIIT_CAPITAL_ONLY` warns that other investment income
and NIIT-specific classifications must still be supplied. No investment income
is guessed from wages, Social Security, tax-exempt interest or `preferredIncome`.
Omitted aggregates with only legacy preferred/gain inputs retain historical
zero-NII behavior; migrate these callers explicitly rather than inferring it.

## Reconciliation and examples

`niitDetails` reports `source`, `grossNetInvestmentIncome`,
`capitalLossOffsetApplied`, `capitalLossDeductionApplied`,
`allowedInvestmentExpenses`, `capitalGainOrLossAdjustment`, and
`netInvestmentIncome`. The final amount is the zero-floored input subtotal minus
the two applied capital-loss amounts and expenses, plus the signed adjustment.
The floor is applied only after combining all amounts.

The existing `grossNetInvestmentIncome` output retains its historical semantics:
ledger income plus already-netted positive capital gains, or the entered
aggregate. For capital-only it is the net positive capital gain; for final mode
it is already final, **not** reconstructed gross income. Use `source` to interpret
it; it is not universally Form 8960 line 8.

Synthetic examples (single filer, MAGI sufficiently above the threshold):

| Inputs | Expected NII | NIIT |
| --- | ---: | ---: |
| Explicit LTCG $50,000; no NIIT aggregate/ledger | $50,000 | $1,900 |
| Explicit gains $30,000, losses $10,000; interest ledger $5,000 | $25,000 | $950 |
| Same capital; legacy aggregate $35,000 | $25,000 | $950 |
| Same capital; final aggregate $23,000 after $2,000 expenses | $23,000 | $874 |
| Net capital loss $20,000; interest ledger $12,000 | $9,000 | $342 |

Warnings also identify legacy capital-loss adjustments and caller-supplied
expense/capital overrides. They cannot determine whether two dollar amounts
refer to the same underlying expense or gain. Entering the same expense in both
a regular-tax deduction and the NIIT expense ledger is not itself duplication:
those are separate calculations; duplication *within* NIIT is prohibited by this
contract.

## Limitations and validation

The caller remains responsible for classification, passive-loss limits, allowed
expense allocation, basis/wash sales, and NIIT-specific exclusions/carryforwards.
The engine does not validate Form 4952, residency/elections, foreign-entity
worksheets, or reconcile ledger totals to regular AGI. The final mode is a manual
override, not verification of an external Form 8960. A default legacy aggregate
that was already netted remains ambiguous: select final mode explicitly.
The HTTP `TAX_PLAN_2025` endpoint accepts and forwards this mode. Dedicated UI
controls and the MCP tax-input schema do not yet expose the advanced aggregate
mode; those adapters require follow-up. Existing callers keep the legacy mode.

Regression tests directly import the TypeScript source:

```powershell
node node_modules/vitest/vitest.mjs run tests/niit-ledger.test.ts
```

Run `npm run validate` before release. It rebuilds generated Lambda JavaScript,
checks source/artifact consistency, and runs the full integration suite,
including HTTP boundary tests in `tests/handler-security.test.ts`.
