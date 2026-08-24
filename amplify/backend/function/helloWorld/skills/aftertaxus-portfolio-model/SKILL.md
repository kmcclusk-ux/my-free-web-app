---
name: aftertaxus-portfolio-model
description: Interpret, explain, and operate the AfterTax US investments, income, accounts, assets, tax treatments, and federal/state/local tax model. Use when a request refers to an AfterTax US model, workbook, portfolio snapshot, UI action, or model-backed calculation; do not use for unrelated portfolio or tax questions without AfterTax US data.
---

# AfterTax US Portfolio Model

Use the user's request together with the current AfterTax US model data supplied by the host. Treat that model data as the source of truth for balances, income, settings, row IDs, lookup values, and calculated outputs.

## Required Context

Read [references/model-layout.md](references/model-layout.md) before interpreting model fields or choosing which table/settings section owns a requested change.

Read [references/action-contract.md](references/action-contract.md) whenever the user asks to select, highlight, filter, sort, add, edit, delete, replace, configure, or otherwise change the model or UI.

The host may append these runtime sections after the skill instructions:

- `AVAILABLE ACCOUNT VALUES`: current account names.
- `CURRENT ROW MATCHING INDEX`: stable investment IDs and matching fields.
- `CURRENT AFTERTAX US MODEL DATA`: current settings, reference tables, metrics, concentration, editable fields, and view state.

If a needed runtime section is absent, state what is missing. Do not invent model values.

## Workflow

1. Identify whether the request is informational or asks for a model/UI change.
2. Resolve the user's terminology through the relationships in the model layout. Distinguish investments from assets, accounts from account types, and tax treatments from account tax categories.
3. Use current IDs and exact current values where available. Interpret natural language semantically and tolerate an obvious minor typo only when one current value is the clear match.
4. For informational requests, answer from current model data and label any limitation caused by missing data.
5. For changes, follow the action contract and use the narrowest authoritative surface. Never turn a request to highlight rows into an Inc/includeIncome change.
6. Do not claim a mutation was executed unless the host confirms execution.

## Host Adaptation

- Internal AfterTax US assistant: return the JSON action envelope defined in the action contract. The application executes or confirms it.
- ChatGPT with an AfterTax US action tool/connector: translate the action into that tool's schema, invoke it only within the user's request, and report the observed result.
- ChatGPT without an action tool/connector: provide a concise proposed action or structured JSON for the user to apply; clearly say it was not executed.
- For read-only analysis, use any supplied snapshot directly. Authentication is a transport concern and must not change model interpretation.

## Boundaries

- Do not browse for facts already represented in the current model. Use external sources only when the user asks for current external facts and the host permits it.
- Do not invent balances, prices, returns, allocations, gains, losses, tax figures, or statutory assumptions.
- Explain outputs neutrally. Do not present the model as filing advice or request trades, transfers, brokerage connections, or other irreversible financial actions.
- Preserve confirmation requirements for destructive, bulk, persisted-setting, and WhatIf changes.
