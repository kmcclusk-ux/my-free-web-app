# Tax model audit

## Source of truth

The 2025 backend tax plan is the calculation authority for the frontend, MCP server, and snapshot calculator:

- `amplify/backend/function/helloWorld/src/taxCalcs.ts` combines federal, state, local, and W-2 payroll calculations.
- `amplify/backend/function/helloWorld/src/taxProfiles2025.ts` stores the state schedules.
- `amplify/backend/function/helloWorld/src/localTaxProfiles2025.ts` stores the supported local-tax presets and income bases.
- `amplify/backend/function/helloWorld/src/payrollTax2025.ts` stores employee W-2 payroll components.

The MCP and frontend derive portfolio rows first, then send the same `TAX_PLAN_2025` input shape to the backend engine. The snapshot calculator uses the shared federal and state functions for its two-investment comparison.

## Important model behavior

- Income excluded from the spendable after-tax display still remains in the tax base. The model reports it separately as `excludedIncome` and subtracts the resulting tax from spendable income.
- Rental depreciation is not recomputed by the frontend. Imported yearly income is treated as the already-adjusted amount.
- Capital losses offset explicitly supplied long-term capital gains first. Any remaining loss is limited to the federal annual ordinary-income limit.
- Federal itemized SALT includes modeled state and local income tax and applies the filing-status and AGI-based cap in the shared federal engine.
- W-2 payroll taxes are applied only to rows identified as W-2 income. Investment, Social Security, retirement, and rental rows do not receive FICA withholding.
- A saved Investments WhatIf switch controls saved calculations when a caller omits `whatIfActive`. Scenario tools explicitly opt into their temporary scenario behavior.
- The Investments UI `✓` checkbox controls calculation inclusion. Visual row highlighting is stored separately and cannot change tax results.

## Validation

Run the complete suite from the repository root:

```text
npm test
npm --prefix frontend run build
npm --prefix snapshot-calculator run build
npm --prefix mcp-server run build
```

The regression suite includes federal filing statuses, Social Security thresholds, NIIT, capital-loss ordering, state schedules, local tax bases, W-2 payroll caps, excluded-income flow reconciliation, MCP field contracts, and snapshot-calculator calculations.

## Boundaries

This is a planning model, not a tax-return preparer or legal opinion. It does not attempt to model every credit, exemption, phaseout, AMT rule, QBI deduction, Medicare withholding exception, state credit, state capital-gain surcharge, local filing rule, employer-specific payroll election, or carryforward schedule. Several state and local profiles intentionally use simplified 2025 planning schedules; confirm a return against the applicable tax authority before filing or making a financial decision.

Reference checks used during the audit include the [IRS 2025 tax inflation adjustments](https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2025), [IRS NIIT guidance](https://www.irs.gov/newsroom/questions-and-answers-on-the-net-investment-income-tax), [IRS Publication 915](https://www.irs.gov/publications/p915), [IRS Publication 550](https://www.irs.gov/publications/p550), [Ohio's 2025 IT 1040 booklet](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/ohio_individual/individual/2025/it1040-booklet.pdf), and the [Maryland 2025 rate guidance](https://services.marylandcomptroller.gov/taxes/en/maryland-income-tax-rates-and-brackets?id=kb_article_view&sysparm_article=KB0010014).
