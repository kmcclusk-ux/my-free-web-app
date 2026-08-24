# AfterTax US Action Contract

Use this contract only when the user requests a UI or workbook change.

## Interpretation

- Interpret the request semantically. Do not search for the entire command as literal row text.
- `select rows`, `highlight rows`, `show only ... rows`, and `select only ... rows` refer to highlighted-row selection, not the Inc/includeIncome checkbox.
- `select only` replaces the existing highlighted selection with exactly the matching rows.
- Ignore command/filler words when identifying a match value, including `select`, `only`, `the`, `rows`, `row`, `where`, `with`, `containing`, `account`, `is`, `equals`, `named`, `called`, `please`, `show`, and `highlight`.
- If the user names a field, match it first: account -> `holding.account`; symbol/ticker -> `symbol` or `effectiveSymbol`; description -> `description`. Without a named field, search account, description, symbol, effectiveSymbol, and category.
- Match case-insensitively. Allow a minor spelling error or omitted character only when one current value is clearly intended. For example, `vangard` may match `Vanguard` when it is the unique close current value.
- Never insert the unparsed command into a selector or claim no matches before comparing the meaningful value with current data.
- Ask one concise clarification only when multiple materially different current values are equally plausible.

## Internal JSON Envelope

For the internal assistant, return JSON only:

```json
{"message":"short confirmation","actions":[{"type":"selectRows","payload":{"ids":[1,2,3]},"requiresConfirmation":false}]}
```

For ChatGPT, use the host adaptation rules in `SKILL.md`. Do not claim that proposed JSON was executed when no AfterTax US action tool is available.

## Actions

- `setCheckbox`: `{"id":17,"field":"includeIncome|overrideProposal","checked":true}`.
- `setAllCheckboxes`: `{"field":"includeIncome|overrideProposal","checked":true}`. Confirmation required.
- `selectAsset`: `{"assetId":"ticker, stable row id, description, or account text"}`.
- `selectAssets`, `highlightRows`, or `selectRows`: use `{"ids":[17,21]}`, `{"symbol":"VTI"}`, or `{"query":"matching text"}`. Prefer exact stable IDs. `selectRows` is the canonical action for `select only`.
- `selectAccount`: `{"accountId":"account id or exact account name"}`.
- `setFilter`: `{"filterName":"account|category|asset","value":"current value"}`.
- `clearFilters`: empty payload.
- `sortTable`: `{"tableId":"investments","column":"description|account|category|totalInvestment|yearlyIncome|symbol|includedTotal|filteredIncome","direction":"asc|desc"}`.
- `setView`: `{"viewName":"Investments|Tickers|Accounts|Federal Tax|State Tax|Local Tax|Tax Calculator|focus_grid|analytics"}`.
- `updateSettings`: `{"section":"federal|state|local|planner|ui","values":{...}}`. Confirmation required.
- `setWhatIf`: `{"scope":"investments|federal|state","enabled":true}`. Confirmation required.
- `addRow`: `{"tableId":"investments|tickers|accounts|categories|taxTreatment|accountTaxType|accountType","row":{...}}`. Confirmation required.
- `updateRow`: `{"tableId":"...","id":17,"values":{...}}`; an exact `selector` or `all:true` may replace `id`. Confirmation required.
- `upsertRows`: `{"tableId":"...","rows":[{...}],"matchField":"optional allowed field"}`. Confirmation required.
- `replaceRows`: `{"tableId":"...","rows":[{...}]}`. Use only for an explicit whole-table replacement. Confirmation required.
- `deleteRows`: `{"tableId":"...","ids":[17,21]}`; an exact `selector` or `all:true` may replace IDs. Confirmation required.

Allowed table fields and ownership are defined in `model-layout.md` and may be narrowed by `CURRENT AFTERTAX US MODEL DATA.editableTables`.

## Mutation Rules

- Use stable IDs from current model data. Spreadsheet row numbers are not IDs unless the host explicitly maps them.
- Prefer `upsertRows` for bulk Assets, Accounts, Asset Classes, Tax Treatments, Account Tax Categories, or Account Types. Match by symbol, account, name, label, taxStatus, or name respectively.
- Use `replaceRows` only when the user explicitly requests replacement/reset of the entire table.
- Use `setCheckbox`/`setAllCheckboxes` for Inc. Inc is not a filter.
- Highlighting, selecting, filtering, sorting, and navigation are non-destructive. Data mutation, persisted settings, WhatIf state, bulk checkbox changes, and deletion retain their confirmation requirement.
- Keep the action as narrow as possible and do not modify related tables unless required to satisfy the explicit request.
