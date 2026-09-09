# AfterTaxUS engineering review and implementation backlog

Review date: September 8, 2026. Source baseline: commit `a32c652`, plus the local working tree where explicitly identified. This is a review and work plan, not a tax-compliance certification or a claim that the following fixes have been implemented.

## Executive assessment

The application has useful functionality and a shared backend tax engine, but it is not yet a reliably validated end-to-end tax model. The highest risks are incorrect income classification before the engine, incomplete jurisdiction-specific rules, inconsistent frontend/MCP input derivation, and storage that can acknowledge incomplete writes. Refactoring the UI alone will not solve these issues.

The existing 224 tests all pass. Nevertheless, this review reproduced incorrect or inconsistent results. Some tests preserve incorrect assumptions rather than detect them. Prioritize the monetary and data-integrity issues below before adding more features or undertaking a wholesale rewrite.

This backlog contains **70 primary tasks** (1 P0, 54 P1, 15 P2), **51 state/DC verification work orders**, and smaller deduction implementation subtasks. Counts describe work identified, not 121 independently proven defects. Gap, Risk and Debt entries are labeled separately from confirmed bugs.

### Verification performed

- Reviewed the tax engine, all state/local/payroll profile definitions, frontend and MCP derivation/persistence paths, request handlers, workbook storage, spreadsheet exporter, snapshot calculator, authentication/embedded bridge, and deployment/test configuration.
- Inspected relevant UI components, styles and action/history code. Reviewed the additional local marketing calculators separately from the committed portfolio application.
- Ran `npm test`: **21 test files, 224 passing tests**.
- Ran all three package builds: frontend, snapshot-calculator and mcp-server **pass in this working directory**. The Lambda build also passes as part of `npm test`.
- Ran frontend lint: **15 errors and 5 warnings**. The frontend production bundle is approximately **559 kB JavaScript and 227 kB CSS**, before compression.
- Executed isolated synthetic calculations and in-memory MCP calls. No customer portfolio was changed and no live write API was exercised.
- Cross-checked selected tax rules against official sources linked below. **Not every state's entire tax return, every credit, or every deployed route was independently validated.** The state verification work orders explicitly cover that remaining work.
- A local-only source dependency makes the successful local build misleading: the committed application imports an untracked authentication helper.

### Concrete evidence

These are current-code observations, not newly approved expected values for existing golden tests.

| Case | Observed | Required result or issue |
| --- | --- | --- |
| Wisconsin, 2025, single, $100,000 state taxable income, before credits | $4,903.55 | $4,713.56 under the published rate schedule; current second bracket is outdated. See S01. |
| Wisconsin, 2025, MFJ, $100,000 state taxable income, before credits | $4,771.43 | $4,518.08 under the published rate schedule. See S01. |
| Missouri rate segment at $2,000 taxable income | Single: $13.74; MFJ schedule: $10.305 | The same published segment uses 2%, not the MFJ profile's 1.5%. Joint allocation is a separate issue. See S01. |
| Two spouses each earn $100,000 of Social Security wages in 2025 | Household payroll function charges $10,918.20 Social Security tax | $12,400 employee Social Security tax across two workers. See P01. |
| Eligible $3,000 net investment capital loss; $30,000 investment interest; MAGI remains well above NIIT threshold | $1,140 NIIT | $1,026 for this ordinary Form 8960 scenario. See F03. |
| $100,000 investment, proposed asset catalog yield 6%, row New % explicitly 9% | MCP derives $6,000/year | Explicit row yield is ignored; should be $9,000 under an explicit-override contract. See M05. |
| ETF principal changed to zero, stored yearly income $999 | Becomes an income item and still contributes $999/year | Zeroing an investment must not silently convert it into income. See M02. |
| Closed Federal WhatIf with stored $100,000 long-term gain and a selected qualified-dividend investment | MCP still sends $100,000 as long-term gains | Inactive gain changes capital-loss netting. See M06. |
| Maryland generic county preset, requested 2.5% and dividends disabled | Still uses 3.2% and includes dividends | Editable override fields are ignored outside the custom profile. See L01. |
| Unknown state passed directly to shared state helper | Silently calculates California | Public handler checks this, but shared callers still need strict validation. See M01. |

Wisconsin values are bracket-formula results before return-specific rounding/credits, using the [Wisconsin DOR 2025 schedules](https://www.revenue.wi.gov/Pages/FAQS/pcs-taxrates.aspx). Missouri comparison uses the [2025 Missouri tax chart](https://dor.mo.gov/forms/2025%20Tax%20Chart_2025.pdf). Payroll and NIIT authorities are attached to their tasks.

## How Luna should execute this backlog

1. Work on **one task ID or one explicitly named child task at a time**. Recheck the current source; line numbers below describe the review baseline and will move.
2. Read the task's dependencies and the relevant domain contract before editing. Add a regression that fails for the identified reason first; do not merely update expected totals.
3. Implement the smallest root-cause fix, including schema migration, UI/MCP/import adapters and tests where relevant. Preserve unrelated local changes.
4. For tax-law work, open the linked official source, pin the tax year and record the form/worksheet line used. If required facts are absent, return an explicit unsupported/needs-input diagnostic rather than inventing values.
5. Distinguish **gross expense entered** from **already-eligible deduction entered**. Existing manual deduction inputs cannot automatically be reinterpreted as gross expenses.
6. Run focused tests, then the full suite and affected builds. Do not deploy or change live portfolios while reproducing a bug. Production infrastructure tests require a disposable environment or mocks.
7. Record completion evidence: changed files, before/after fixture, source, commands/results and remaining limitations. An implementation is not complete just because TypeScript compiles.

Reusable assignment prompt:

> Read C:/myapp/docs/engineering-review-backlog.md. Implement task R03 only, checking its dependencies and current source first. Add a regression for the documented failure, make the smallest root-cause fix, and verify success and failure paths. Do not change tax assumptions, other backlog tasks, live data, or deployment configuration. Preserve unrelated working-tree files. Report the task ID, files changed, tests run and any remaining blocker. Replace R03 with the specific task or child-task ID assigned next.

Baseline validation commands, run from `C:/myapp`:

```powershell
npm test
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix snapshot-calculator run build
npm --prefix mcp-server run build
```

For a focused root-suite regression, use `npx vitest run tests/<relevant-test-file>.test.ts`; replace the filename rather than passing the placeholder literally. Tests importing compiled Lambda JavaScript require `npm run build` first. R02 should make that dependency explicit so a targeted test cannot accidentally exercise stale JavaScript.

Priority: **P0** release blocker; **P1** incorrect money/data or significant exposure; **P2** reliability, missing coverage or maintainability; **P3** optional improvement. Classification: **Bug** confirmed code defect; **Gap** intentionally simplified/missing capability; **Risk** failure mode identified from code but not exercised live; **Debt** maintenance work. Size S/M/L is implementation complexity, not a time promise. Large tax tasks must be split into the listed child deliverables and reviewed before production use.

### Non-negotiable behavior contracts

- The Investments **✓** means include in calculations. **WhatIf** means use that row's proposed values only while the global WhatIf switch is open. **Highlight** is visual only. None is an alias for another.
- Selected excluded-account income remains in every applicable tax base. Spendable after-tax income is **selected spendable income minus all modeled taxes on all selected income**. It can legitimately be negative. Do not subtract an excluded-only tax baseline from the tax bill.
- Snapshot/search/highlight/filter state must not change the calculation population. Investment principal/yield statistics exclude genuine income items.
- Imported rental income is already net of any spreadsheet depreciation. Do not subtract depreciation again.
- Original values and WhatIf values are independently stored. Closing a panel disables its effect, not its stored entries.
- A tax exemption is jurisdiction- and income-type-specific. Do not infer retirement distributions, Social Security or wages from a symbol/account substring when explicit classification exists.
- Never force imported totals, clamp rates to make a graphic look orderly, or adjust expected fixtures to make the current implementation pass. Tax savings can make a before/after scenario delta unintuitive; explain the real calculation.
- Effective rates can only be added if their denominators match. Marginal rates require a specified additional-income scenario; a wage dollar and a dividend dollar do not bear the same taxes.

## Source map

Task references use these aliases plus baseline line/function locations. Every alias resolves to an absolute path. Proposed new test/module names are identified as new, not existing files.

| Alias | File |
| --- | --- |
| APP | `C:/myapp/frontend/src/App.tsx` |
| CSS | `C:/myapp/frontend/src/App.css` |
| ENGINE | `C:/myapp/amplify/backend/function/helloWorld/src/taxCalcs.ts` |
| STATES | `C:/myapp/amplify/backend/function/helloWorld/src/taxProfiles2025.ts` |
| LOCAL | `C:/myapp/amplify/backend/function/helloWorld/src/localTaxProfiles2025.ts` |
| PAYROLL | `C:/myapp/amplify/backend/function/helloWorld/src/payrollTax2025.ts` |
| HANDLER | `C:/myapp/amplify/backend/function/helloWorld/src/index.ts` |
| STORE | `C:/myapp/amplify/backend/function/helloWorld/src/workbookStore.ts` |
| MCP | `C:/myapp/mcp-server/src/portfolioServer.ts` |
| INCOME | `C:/myapp/mcp-server/src/portfolioIncome.ts` |
| WORKER | `C:/myapp/mcp-server/src/worker.ts` |
| NODE-MCP | `C:/myapp/mcp-server/src/server.ts` |
| BRIDGE | `C:/myapp/frontend/src/mcpApiBridge.ts` |
| IDENTITY | `C:/myapp/frontend/src/investmentRowIdentity.ts` |
| SHEETS | `C:/myapp/google-sheet/appscript.js` |
| SNAPSHOT | `C:/myapp/snapshot-calculator/src/calculation.ts` |
| SNAPSHOT-UI | `C:/myapp/snapshot-calculator/src/main.tsx` |
| STATIC | `C:/myapp/aftertaxus-aws-static/app.js` (local/untracked at review) |
| TEASER | `C:/myapp/aftertaxus-site/app/CalculatorTeaser.tsx` (additional local Sites project) |
| TESTS | `C:/myapp/tests/` |

## R — Release and storage integrity

### R01 — Make a clean checkout buildable
**P0 · Bug · S · Dependencies: none**

**Evidence:** APP:10 and `C:/myapp/tests/auth-callback.test.ts` import `C:/myapp/frontend/src/authCallback.ts`. That helper exists locally but `git ls-files --error-unmatch frontend/src/authCallback.ts` fails. A clone lacks a required module.

**Implementation:** Review and track the helper or replace its imports with a tracked implementation. Inventory required untracked sources separately from generated artifacts, private data and credentials. Never solve this with `git add .`.

**Acceptance:** Build/test a clean archive or fresh clone using only tracked files and declared dependencies; authentication test resolves without borrowing the working directory. Confirm no secrets or customer exports entered the patch.

### R02 — Gate releases on the whole product, not one test file
**P1 · Risk/Debt · M · Dependencies: R01**

**Evidence:** `C:/myapp/amplify.yml` runs only `test:tax-treatments` before the frontend build. The local GitHub workflow is untracked and does not run the full test suite. Generated Lambda JS exists in two locations; snapshot scripts invoke a sibling package's Vite installation.

**Implementation:** Add a reproducible root validation command and tracked CI workflow for Lambda build, all tests, frontend lint/build, MCP build and snapshot build. Pin a supported Node runtime and install each package reproducibly. Select one generated deployment artifact pipeline; either stop tracking compiled copies or enforce exact generated-source consistency. Make the snapshot package self-contained or adopt explicit workspaces. Version the tax engine and app together in health/build metadata.

**Acceptance:** A clean Linux runner and Windows development machine pass the same checks. Deliberate engine, MCP and frontend failures each block release. Deployment uses the validated artifact, not a stale zip.

### R03 — Do not report successful workbook writes with unprocessed items
**P1 · Bug · M · Dependencies: none**

**Evidence:** STORE:281 `saveWorkspace` awaits `BatchWriteCommand` but ignores `UnprocessedItems`, then reports every item in `savedKeys` as saved. Similar batch use exists in token/report operations.

**Implementation:** Inventory every batch write. Retry only unprocessed items with bounded backoff/jitter; fail explicitly if exhausted. Do not advance refresh markers or claim a complete save before success. Prefer the transactional solution in R05 for workbook-wide updates.

**Acceptance:** A fake DynamoDB client returns partial success, then success; all items eventually persist exactly once logically. Persistent throttling produces a failed save, never a success toast or completed MCP mutation. Include token revocation/report deletion cases if they share this helper.

### R04 — Read complete workbooks and handle storage size limits
**P1 · Bug/Risk · M · Dependencies: none**

**Evidence:** STORE:196 `getWorkspace` performs one Query and ignores `LastEvaluatedKey`; each entire tab/settings collection is stored as one item. Formula snapshots, scenarios and named versions can make these payloads large.

**Implementation:** Paginate all queries needing complete results, including token/report lists. Use direct GetItem for a known tab. Validate serialized item size before saving; move large formula/version blobs to separately versioned storage or partition records. Return actionable size errors rather than silently missing tabs.

**Acceptance:** Mock multiple query pages and verify complete tabs/settings/updatedAt. Large-workbook tests hit the configured safety limit with an intelligible error and no partial write. Paginated token lists still allow revoking the target token.

### R05 — Add atomic revisions and optimistic concurrency
**P1 · Risk · L · Dependencies: M01; coordinate R03/R04**

**Evidence:** APP:8324 and MCP:209 write whole stale workbook snapshots; STORE has no expected revision or conditional workbook write. Batch updates across related tables are not atomic. Concurrent browser/MCP edits can overwrite each other even if both requests succeed.

**Implementation:** Introduce an immutable workbook revision and `expectedRevision`. Commit affected records plus revision transactionally, or atomically swap a validated immutable snapshot pointer. Provide narrow row/settings mutations with idempotency keys. Reject conflicts with 409 and preserve the user's unsaved edits. Do not substitute timestamps for a monotonic revision.

**Acceptance:** Two clients read revision N; unrelated or conflicting concurrent edits cannot silently overwrite one another. Partial tab failures expose no mixed-revision workbook. Retried add/split/delete operations do not duplicate mutations. A stale restore is explicitly confirmed or rejected.

### R06 — Refresh the UI in both directions without losing edits
**P1 · Bug/Risk · M · Dependencies: R05, M06**

**Evidence:** APP:7993 `applyWorkbookResponse` sets the global WhatIf switch true on remote refresh but does not set it false. Polling reads the whole workbook and remote application resets undo history. A request already in flight can race local editing even though new polls skip the saving state.

**Implementation:** Poll a lightweight revision endpoint; fetch a coherent snapshot only when changed. Apply saved booleans symmetrically, guard application with a local edit generation/dirty revision, cancel obsolete requests and define a conflict UI. Preserve appropriate local history or clearly mark remote operations as a new history boundary.

**Acceptance:** MCP changes ✓, WhatIf and highlight independently; a visible browser updates each true→false and false→true without reload. Start a poll, make a local edit, then release the old response: it must not overwrite the edit. Idle polling does not repeatedly fetch full formula/version payloads.

## M — Canonical model and row semantics

### M01 — Validate a versioned model at every boundary
**P1 · Bug/Debt · L · Dependencies: none**

**Evidence:** HANDLER:2472 validates state/status for `TAX_PLAN_2025` then forwards the rest via `any`. ENGINE's `nonNegative` converts invalid/nonfinite numbers to zero. Workbook writes accept arbitrary nested data. Direct shared helpers silently default invalid states/localities.

**Implementation:** Create a neutral shared schema package for workbook, rows, tax input/output and mutations. Encode annual dollars, decimal rates and percentage UI values explicitly. Reject malformed/nonfinite values, invalid categories, impossible share sums and invalid foreign references. Validate locality/state compatibility. Keep migrations separate from calculation; return structured diagnostics with tab/row/field locations. Do not reject legitimate negative gain/loss values once modeled explicitly.

**Acceptance:** The same invalid payload fails consistently in API, MCP, import and embedded editor. Missing data does not become a zero-tax success. Existing valid saved workbooks migrate once and round-trip without value changes.

### M02 — Stop turning zero-principal investments into income items
**P1 · Bug · M · Dependencies: M01**

**Evidence:** APP:7501 and MCP:983 treat `(totalInvestment === 0 && importedYearlyIncome !== 0)` as an income item. Explicit `incomeItem` is ignored when a non-Income assetType is present.

**Implementation:** Introduce an explicit income calculation mode: principal×yield versus annual income. Resolve legacy flags in migration with diagnostics for conflicts. Once normalized, changing principal cannot change the mode. Keep manually entered annual/monthly income for actual income rows only.

**Acceptance:** An ETF with stale stored yearly income becomes zero income when principal becomes zero. SS, W2 and rental rows retain entered annual income with zero principal. Import, select/unselect, save/reload and split preserve the selected calculation mode.

### M03 — Remove name-based tax classification from normal calculations
**P1 · Bug · M · Dependencies: M01/M02**

**Evidence:** INCOME:46 `localIncomeCategory` prioritizes account/symbol patterns and converts every `nonInvestmentIncome` into `businessIncome`. A name containing `ira` can cause retirement treatment; explicit category metadata can lose to names. APP/MCP separately infer W2 accounts.

**Implementation:** Define explicit income-kind and account-treatment enums with documented precedence. Use heuristics only during legacy migration, recording what was inferred. Separate wages, active business, passive rental, pension/distribution, deferred compensation, Social Security, interest and dividends. Preserve existing metadata unless it is invalid; do not reinterpret an account on rename.

**Acceptance:** Renaming an account or asset leaves taxes unchanged. Explicit retirement income never becomes occupational-taxable business income. An account name incidentally containing `ira` is not a retirement account. Changing an SS asset to an explicitly ordinary asset removes SS treatment.

### M04 — Distinguish retirement distributions from sheltered accrual
**P1 · Bug/Gap · L · Dependencies: M03**

**Evidence:** `accountAllowsCurrentIncome` permits income-item distributions from deferred accounts, but APP/MCP still apply the underlying asset's preferred-dividend or exempt-interest rule. Sheltered accrual is also allowed into displayed income without an explicit withdrawal model.

**Implementation:** Model accrual, distribution and spendable cash separately. Taxable traditional-account distributions use ordinary retirement income, with explicit nontaxable basis where supported; qualified Roth distributions are separate. Never carry an underlying muni/dividend exemption through a taxable IRA distribution. Keep NIIT and payroll exclusions separate from ordinary income inclusion. Flag unsupported early-withdrawal, QCD or basis cases rather than guessing.

**Acceptance:** A taxable $10,000 traditional IRA distribution is ordinary, not qualified-dividend income, with no FICA/NIIT on the distribution itself. An undistributed IRA dividend creates no current income tax. Retitling its underlying asset does not change distribution tax character. See [IRS Publication 590-B](https://www.irs.gov/publications/p590b).

### M05 — Make explicit New % override the catalog yield
**P1 · Bug · S · Dependencies: M01**

**Evidence:** APP:7493 and MCP:975 use proposedTicker yield before `row.newPercent`. APP:7445 also uses `row.newPercent || default`, discarding zero.

**Implementation:** Store an optional explicit override separately from the catalog fallback. Use nullish presence, not truthiness. Selecting a new asset seeds its yield; editing New % then owns that row's override. Reset-to-current must clear the explicit override according to the UI contract.

**Acceptance:** $100,000 × explicit 9% gives $9,000 despite a 6% catalog yield. Explicit 0% gives zero. Deselecting row WhatIf or closing global WhatIf restores the original yield without destroying the proposal. Frontend/MCP agree after reload.

### M06 — Apply one consistent WhatIf activation policy
**P1 · Bug · M · Dependencies: M01**

**Evidence:** MCP:1111 adds `sumLongTermCapitalGainWhatIfItems(preferredItems)` even when Federal WhatIf is closed. APP's corresponding value is gated. Federal/state open flags are local UI state while MCP uses per-call booleans; the investment flag has separate persisted state.

**Implementation:** Normalize effective WhatIf inputs once before building any tax, NIIT, payroll, local or baseline request. Gate every category, not just ordinary/preferred totals. Distinguish saved scenario activation from temporary calculation options. Persist the agreed flags, or explicitly communicate which are temporary instead of implying saved-model parity.

**Acceptance:** Closed panels contribute zero to all bases even with saved gains/losses/W2 amounts. Reopen restores entries. A current qualified-dividend row cannot become a capital gain because a closed panel contains gains. Bulk scenarios can override activation without permanently mutating the workbook.

### M07 — Do not resurrect cleared WhatIf values from legacy scalars
**P1 · Bug · S · Dependencies: M01/M06**

**Evidence:** APP:2818 and MCP:860 `sumTaxWhatIfItems` use the old scalar when the item total is zero. Empty or zero-valued new entries can reactivate stale income; different category aggregators use different fallback rules.

**Implementation:** Migrate a legacy scalar only when the newer array is absent, not empty or zero. After migration the array is authoritative and the obsolete scalar is removed or synchronized. Keep blank unclassified items out of tax calculations until classification is chosen.

**Acceptance:** Clearing a $100,000 list leaves zero after close/reopen and reload, even if legacy scalar data exists. An explicitly empty list remains empty. Frontend and MCP W2/NIIT/local totals follow the same migration.

### M08 — Preserve account inclusion defaults consistently on import
**P1 · Bug · S · Dependencies: M01**

**Evidence:** APP:2765 initializes inclusion to yes, then overwrites it with `normalizeYesNo(undefined)` when the imported field is missing. MCP defaults that same missing field to included. This can make imported after-tax income differ without any tax-engine error.

**Implementation:** Resolve missing versus explicit false before boolean normalization. Map the positively stored inclusion field and negatively worded Exclude checkbox in one adapter. Recognize supported old/new spreadsheet headers; report contradictory fields rather than choosing silently.

**Acceptance:** Missing field follows a documented included default; explicit yes/no and booleans round-trip correctly. A $20,000 excluded row stays in tax bases but not spendable income. Same imported workbook produces equal frontend/MCP tax requests.

### M09 — Make row IDs, visible row numbers and highlights unambiguous
**P1 · Bug · M · Dependencies: M01**

**Evidence:** MCP:607 bulk matching treats `ids` as either internal IDs or spreadsheet row numbers. Other resolvers use different precedence. IDENTITY hashes include mutable amounts/names; changing a row can invalidate saved visual identity.

**Implementation:** Introduce stable immutable row identity, with separately typed `rowIds` and `visibleRowNumbers`. Reject ambiguous legacy selectors rather than selecting their union. Store highlight state by stable IDs; use content hashes only as an explicit import-remapping fallback. Keep ✓, WhatIf and highlighting as independent mutations.

**Acceptance:** With one row whose ID is 17 and another whose displayed row is 17, each selector changes exactly the intended row. Reorder/filter/edit/split/reimport tests verify stable targeting. Highlighting alone never changes tax or inclusion; selecting all never highlights all.

### M10 — Preserve structured favorites in assistant settings updates
**P2 · Bug · S · Dependencies: M01**

**Evidence:** APP:10450 converts favorite objects with `.map(String)` and asserts `UiSettings`; objects become `[object Object]`.

**Implementation:** Reuse the same validated `normalizeInvestmentFavorites` contract as load/import. Reject unsupported favorite shapes with field-level errors. Keep selection identities consistent with M09.

**Acceptance:** Save/rename/apply/delete a structured favorite through each UI/MCP action and reload it unchanged. Invalid input cannot erase valid favorites or silently turn them into strings.

### M11 — Lock down excluded-income and yield population invariants
**P1 · Risk/Regression prevention · M · Dependencies: M02/M03, F03**

**Evidence:** ENGINE:547 now correctly uses `displayIncome - totalTax`; adapter inconsistencies can still feed it the wrong population. Existing tests mostly assert arithmetic after accepting derived inputs.

**Implementation:** Add a per-row contribution ledger containing inclusion, spendability and federal/state/local/payroll/NIIT contributions. Derive aggregates and explanatory popovers from it. Do not reinstate an excluded-only baseline or floor negative cashflow to zero. Distinguish income accrual from spendable withdrawals per M04.

**Acceptance:** Cross-product tests cover included/excluded × taxable/deferred/exempt × wages/dividends/SS/rent. Toggling account exclusion alone leaves taxes unchanged and reduces after-tax income by exactly that selected income. Selecting an already-excluded taxable row changes after-tax income by the negative tax delta, not by its gross income. Filters/highlights have zero effect.

### M12 — Use explicit money/rate units and stable rounding
**P1 · Risk/Debt · M · Dependencies: M01**

**Evidence:** SHEETS `exportRate_`, APP and MCP normalizers infer decimals versus percentages from magnitude; rates near 1 are ambiguous. Binary floating point, monthly conversions and per-row rounding are mixed across views and split operations.

**Implementation:** Normalize external formats once into decimal rates and annual dollar values with provenance. Define supported legacy input formats instead of using magnitude in core math. Use integer cents or a decimal strategy for allocation/persistence; define tax worksheet rounding separately from display rounding. Keep full calculation precision until the specified rounding step.

**Acceptance:** 0%, 0.5%, 1%, 6.25%, explicit decimal 0.01, and explicit percent 1 produce intended values. Split $100.01 three ways and recombine with no cent loss. Twelve displayed monthly values need not define annual tax rounding, but the underlying annual/monthly ledger must reconcile.

## F — Federal tax correctness

### F01 — Implement actual short/long-term gain and loss netting
**P1 · Bug/Gap · L · Dependencies: M01/M03/M06**

**Evidence:** ENGINE:379 offsets all losses only against explicit long-term gains, then caps the remainder at $3,000/$1,500. Short-term gains are not separately representable; gains, losses and carryforwards lose their character.

**Implementation:** Add separate current-year ST/LT gains, losses and carryforwards. Net within each category, then cross-net using Schedule D ordering; apply the ordinary loss limit only to the remaining net loss. Preserve carryforward character and exclude qualified dividends from capital-gain netting. Do not silently sum the same loss from two deduction panels.

**Acceptance:** $20,000 ST gain plus $10,000 eligible ST loss yields $10,000 net ST gain, not a $3,000 deduction against $20,000. Test LT loss against ST gain, ST loss against LT gain, qualified dividends with no gains, MFS limit, no taxable income and carryover export/restore. Use [IRS Publication 550](https://www.irs.gov/publications/p550), including its worked loss examples, rather than current-code totals.

### F02 — Correct the special capital-gain choices already exposed
**P1 · Bug · L · Dependencies: F01**

**Evidence:** APP:1129 offers Section 1250 and collectibles gains; the engine routes them through the same 0/15/20% preferred-income calculation. Section 1256 splitting is label-based and lacks complete netting.

**Implementation:** Distinguish qualified dividends, normal LTCG, unrecaptured Section 1250 gain, collectibles/28%-rate gain and eligible Section 1256 gains. Implement the relevant Schedule D Tax Worksheet, including ordinary-rate ceilings and ordering. Alternatively disable unsupported choices with an explicit diagnostic until implemented; do not silently treat them as normal LTCG.

**Acceptance:** Official worksheet fixtures cover 25%-maximum and 28%-maximum gain categories, lower ordinary-rate cases, mixed categories and losses. Confirm gains are not all taxed at the maximum. Authority: [IRS capital gains guidance](https://www.irs.gov/taxtopics/tc409).

### F03 — Calculate net investment income, not gross investment receipts
**P1 · Bug/Gap · L · Dependencies: F01/M03**

**Evidence:** ENGINE:419 reduces NII only by loss offset against LTCG, not the eligible remaining capital-loss deduction. INCOME lacks active/passive business facts and cannot allocate eligible investment expenses. Shared exempt-treatment aliases also differ between APP and MCP.

**Implementation:** Build an explicit Form 8960 ledger with applicable net gains/losses, passive investment income, allocable expenses and MAGI adjustments. Avoid double-counting Schedule D losses. Distinguish retirement/wages from investment income even when they increase MAGI. Normalize exemption aliases and derive taxable interest additions independently of labels.

**Acceptance:** At MAGI sufficiently above threshold, $30,000 investment interest less an eligible $3,000 net investment capital loss gives $27,000 NII and $1,026 NIIT. Test threshold crossings, NII smaller than excess MAGI, exempt interest, nonpassive business, rental participation and distribution exclusions. Use [2025 Form 8960 instructions](https://www.irs.gov/instructions/i8960).

### F04 — Carry filing-status eligibility into the engine
**P1 · Gap/Bug · M · Dependencies: M01**

**Evidence:** ENGINE:337 accepts MFS lived-apart information, but `calculateFederalTax2025` never receives/passes it. The model has only four filing statuses and cannot represent qualifying surviving spouse eligibility distinctly.

**Implementation:** Add explicit spouse-living-apart and qualifying-surviving-spouse facts. Map status rules by tax provision, not by globally replacing one status with another. Keep MFS capital-loss, NIIT, deduction and state treatments coordinated.

**Acceptance:** MFS together and apart scenarios with the same SS benefits produce the correct different taxable portions; benefits alone are not automatically 85% taxable in the lived-apart case. Test surviving spouse independently for ordinary brackets, standard deduction, SS and NIIT. Authority: [IRS Publication 915](https://www.irs.gov/publications/p915).

### F05 — Replace deduction warnings with explicit calculation modes
**P1 · Gap · L · Dependencies: M01/F01**

**Evidence:** ENGINE:386/404 deducts almost any named adjustment/itemized amount in full. APP:1133 explicitly tells users several limitations are not calculated and medical amounts must already be eligible. This is a documented simplification, not permission to relabel existing amounts as gross expenses.

**Implementation child tasks, one per patch:**

- **F05-medical:** Store gross unreimbursed eligible expenses versus allowed-amount override; compute the AGI floor in automatic mode. Test $100,000 AGI and $10,000 qualifying expenses → $2,500 allowed; an existing $10,000 allowed-amount override remains $10,000. See [IRS Publication 502](https://www.irs.gov/publications/p502).
- **F05-HSA:** Collect coverage, eligible months, age/catch-up and employer/pre-tax contributions; calculate remaining eligibility rather than deducting a second time. Test annual self-only/family limits, partial-year choices and explicit already-allowed override. See [IRS Publication 969](https://www.irs.gov/publications/p969).
- **F05-IRA:** Collect owner, age, compensation, workplace plan coverage, spouse coverage and MAGI; implement current-year deduction/phaseout worksheets. Test excess contributions and MFS eligibility. Research the applicable year's Pub. 590-A first.
- **F05-student-loan/educator:** Implement separate limits and eligibility; loan interest includes MAGI phaseout and filing restrictions. Give each category its own fixtures, not a shared flat cap.
- **F05-mortgage:** Capture qualified acquisition-debt balance/date/use and calculate eligible interest, or clearly retain an allowed-interest override. Never assume every dollar of interest is deductible.
- **F05-charity:** Separate cash/property/organization limitation groups, elections and carryovers. Implement supported AGI limits; reject unsupported property valuation cases.
- **F05-self-employed-health:** Limit to qualifying business income and eligibility, and integrate with the chosen SE-tax model; do not deduct employer-pre-tax benefits twice.

**Acceptance for every child:** Show entered, allowed, disallowed/carried-forward and reason. Persist eligibility facts through UI/MCP/import/version restore. Unknown deduction names return a diagnostic; an explicit manual allowed-amount override is labeled as such and does not claim automatic validation.

### F06 — Distinguish SALT tax paid from tax liability and unify its breakdown
**P1 · Gap/Bug · M · Dependencies: M01, S02/L02**

**Evidence:** ENGINE:408 automatically uses calculated state/local income-tax liability as deductible tax paid. APP:8466 reconstructs SALT entered from property plus state tax but omits local tax, disagreeing with the engine. MAGI is treated as AGI.

**Implementation:** Keep a clearly labeled planning assumption using modeled tax, plus an explicit taxes-paid input when known. Implement eligible tax categories/election and provision-specific MAGI; avoid duplicate property/state/local tax entries. Drive every breakdown from backend `saltEntered`, `saltDeduction`, `saltCap` and component values.

**Acceptance:** State liability differs from withholding/payments without silently replacing actual tax paid. Local taxes appear in the same SALT total everywhere. Test 2025 MFJ/MFS caps, phaseout/floor and standard mode. Use the [2025 Schedule A instructions](https://www.irs.gov/pub/irs-prior/i1040sca--2025.pdf); obtain separate rules for employee contributions where relevant.

### F07 — Add age/dependent deductions and 2025 Schedule 1-A support
**P1 · Gap · L · Dependencies: M01/F05**

**Evidence:** ENGINE:172 standard deductions depend only on four statuses. There is no age/blind/dependent information, spouse-itemizes restriction or Schedule 1-A deduction stage.

**Implementation:** First add taxpayer/spouse facts and additional standard-deduction rules. Then separate child tasks for senior, qualified tips, overtime and eligible car-loan-interest deductions. Apply their eligibility, MAGI phaseouts and correct placement after AGI; do not reduce FICA wages merely because a federal deduction applies. If outside current scope, prominently flag affected scenarios instead of displaying a complete-tax claim.

**Acceptance:** A qualifying senior gets the supported age-related deductions without reducing taxable Social Security by fiat. Dependent/MFS-spouse-itemizes cases use the correct standard deduction. Wage-related deductions do not remove Social Security/Medicare tax. Use [IRS Schedule 1-A guidance](https://www.irs.gov/newsroom/schedule-1-a-additional-deductions-what-to-know-about-the-new-form) and pinned 2025 instructions.

### F08 — Make tax-year and supported-rule boundaries explicit
**P1 · Gap/Debt · L · Dependencies: M01**

**Evidence:** The engine is permanently 2025; `FED_PREF_TAX_2024` is an alias for 2025. AMT, QBI, many credits and several special tax rules are not modeled, although the UI offers broad after-tax estimates.

**Implementation:** Persist taxYear/modelVersion/source revision in workbook, requests, reports and exports. Label the current product as 2025 until a separately verified 2026 module exists; never swap all constants in place. Retire misleading year aliases with explicit compatibility metadata. Maintain a machine-readable support matrix and scenario diagnostics for missing AMT/QBI/credits. Implement each significant missing tax module as a separate researched task, not a generic deduction percentage.

**Acceptance:** Old scenarios remain reproducible after new schedules ship. Wrong/unsupported year produces a clear error. A scenario potentially affected by an unsupported major tax rule is visibly qualified, not described as fully calculated. Historical names cannot return a different tax year silently.

## S — State tax correctness

### S01 — Correct confirmed Wisconsin and Missouri schedule defects
**P1 · Bug · M · Dependencies: none; M01 for broader migration**

**Evidence:** STATES Wisconsin still switches to 5.3% at $29,370 single / $39,150 MFJ; official 2025 thresholds are $50,480/$67,300. Missouri MFJ uses 1.5% in a segment where the chart specifies 2%. TESTS `state-all.test.ts` repeats these wrong expectations.

**Implementation:** Update each state from its official 2025 table, preserving formula/table rounding policy. Add explicit MFS schedules where required. Keep Missouri per-spouse computation/allocations distinct from ordinary filing-status bracket selection; do not assume a joint return is always one combined taxable-income calculation.

**Acceptance:** Wisconsin single/MFJ $100,000 fixtures match $4,713.56/$4,518.08 before credits. Test threshold ±$1 and Wisconsin MFS separately. Missouri's $1,313–$2,626 segment uses 2% consistently. Attach official worksheets to fixtures: [Wisconsin](https://www.revenue.wi.gov/TaxForms2025/2025-form1-ES-inst.pdf), [Missouri](https://dor.mo.gov/forms/2025%20Tax%20Chart_2025.pdf).

### S02 — Build state taxable income with state-specific rules
**P1 · Gap/Bug · L · Dependencies: M01/F01/F05/F08**

**Evidence:** ENGINE:468 subtracts a caller-entered standard deduction or all entered itemized amounts from a generic state gross. APP:1223 defaults every new model to $26,500 mortgage interest, $19,000 property tax and an old $11,000 CA standard deduction. Most profiles silently reuse single for HOH/MFS.

**Implementation:** Remove personal sample deductions from new-user defaults. Add per-state adapters declaring whether their starting base is federal AGI, federal taxable income or a separate calculation; apply state additions/subtractions, allowed deductions, exemptions, filing statuses and credit/recapture rules. Preserve explicit manual allowed deductions as overrides. Run one state work order at a time using the appendix; do not pretend a 51-state bracket table is a 51-state return calculation.

**Acceptance:** New accounts contain zero invented personal expenses. Changing state/status recalculates automatic deductions without retaining CA amounts as another state's defaults. Federal adjustments flow to each state only where that state conforms. State outputs expose starting income, modifications, deductions, exemptions and taxable income. HOH/MFS inheritance must be explicitly justified per state.

### S03 — Stop exempting Social Security and retirement uniformly across states
**P1 · Bug/Gap · L · Dependencies: M03/M04/F04/S02**

**Evidence:** APP:1360 and MCP:744 classify Social Security as state-exempt regardless of selected state; state adjustment ignores stateCode. Retirement exclusions likewise lack jurisdiction eligibility facts.

**Implementation:** Feed federal taxable benefits and retirement categories to each state adapter. Implement state-specific subtraction/phaseout rules with required age/MAGI/status facts. Separate federal SS taxation from state treatment and never equate a local exemption with a statewide exemption.

**Acceptance:** California SS remains exempt; a high-income Minnesota case does not receive an unconditional full subtraction. Include the state's available alternative method where supported, not only a single threshold. Test pension/IRA exclusions separately. See [Minnesota's official subtraction rules](https://www.revenue.state.mn.us/social-security-benefit-subtraction) and the applicable state return schedules.

### S04 — Model exemptions by jurisdiction and income composition
**P1 · Bug/Gap · L · Dependencies: M01/M03/S02**

**Evidence:** `stateTaxAdjust` effectively ignores stateCode. Broad tax-free/state-exempt labels and stored shares can disagree; local classification excludes state-exempt income automatically. There is no issuer-state or fund-distribution composition model.

**Implementation:** Define independent federal/state/local treatment and income composition, including Treasury interest, home-state/out-of-state municipal interest and partial exempt percentages. Normalize canonical labels and detect conflicting custom shares. Collect fund-source/issuer facts where necessary; show unknown rather than assuming full exemption. Model return of capital as basis-dependent or flag missing basis.

**Acceptance:** A federally exempt, state-taxable municipal payment never enters federal ordinary/preferred/NII merely because of a stale label mapping. Its exempt interest can still affect federal SS provisional income. Home-state status changes state tax correctly; Treasury exemption does not leak to federal. Local treatment follows the actual locality, not a generic state flag.

### S05 — Cover special state capital-gain/recapture taxes or disclose them
**P1 · Gap · L · Dependencies: F01/F08/S02**

**Evidence:** Washington profile is empty and explicitly omits its capital-gains excise tax; Massachusetts/other states use one ordinary schedule for all income. New York-style recapture and Maryland's extra capital-gain rule cannot be expressed by the current generic brackets.

**Implementation:** Create individual researched child tasks for WA capital-gains excise, MA income-class rates/surtax, MD gains addition and NY/CT recapture. Return separate components and supported-rule flags. Restrict the thermometer's no-tax stamp to the precise modeled tax, not all taxes in that jurisdiction.

**Acceptance:** A WA resident with taxable qualifying gains is not shown as universally tax-free. Separate exempt asset classes/thresholds and tax years. Ordinary income without those gains still incurs no WA broad wage income tax. See [Washington's 2025 tiered gains rates](https://dor.wa.gov/forms-publications/publications-subject/special-notices/new-tiered-rates-washingtons-capital-gains-tax). Other child tasks must attach their own official return instructions before implementation.

## L — Local taxes

### L01 — Make visible rate/base overrides actually control the calculation
**P1 · Bug · S · Dependencies: M01**

**Evidence:** ENGINE:504 only honors `customRate`/`customTaxableBase` for `id === custom`. APP offers editable local checkbox state regardless, and generic MD/IN presets tell users to choose a rate the engine ignores.

**Implementation:** Separate official preset defaults from explicit user overrides; track override provenance. Either honor edits consistently or make preset fields read-only with a clear Customize action. An edit cannot appear successful while the engine ignores it.

**Acceptance:** Changing a supported editable rate changes tax; changing a base checkbox changes only that category. Reset restores official defaults. The synthetic 2.5% wage-only override on $100,000 produces $2,500 only when explicitly in override mode, not an unannounced change to the official county rule.

### L02 — Use each locality's taxable base, not raw category totals
**P1 · Gap/Bug · L · Dependencies: S02/M03/M04**

**Evidence:** ENGINE:518 adds gross categories and directly applies local rates. NYC never receives NY deductions/exemptions. LOCAL's broad base excludes all retirement income for NYC/MD/IN. Nonresident source amounts and exemptions are not represented.

**Implementation:** Add locality adapters for state-taxable-base, earnings-base and state-surcharge taxes. NYC consumes the correct NY taxable base; Yonkers uses the appropriate state-tax amount; county personal-income taxes use their state's base rules. Earnings taxes receive sourced earnings, not generic non-investment receipts. Add residence/work location and allocation inputs when required.

**Acceptance:** NYC with $100,000 gross income and NY deductions does not tax all $100,000 as city taxable income. Taxable retirement is not universally excluded. Nonresident intangible income and out-of-city earnings are treated correctly; exemptions and credits are separately exposed. Authority: [2025 New York IT-201 instructions](https://www.tax.ny.gov/pdf/current_forms/it/it201i.pdf); obtain county/city instructions for each additional adapter.

### L03 — Replace generic locality placeholders with dated coverage
**P2 · Gap · L · Dependencies: F08/L02**

**Evidence:** LOCAL includes generic Maryland/Indiana county rates rather than actual county selection; one locality cannot represent concurrent city/county/district taxes. Philadelphia preset covers only one tax type and one effective-date rate.

**Implementation:** Add a sourced catalog with jurisdiction ID, tax type, residence/work applicability, effective dates, rates/brackets and base adapter. Support multiple applicable levies and credits for tax paid elsewhere. Separate Philadelphia Wage Tax from other potentially applicable city taxes. Keep unsupported locations visibly manual rather than fabricating a rate from city name.

**Acceptance:** Selecting a specific county loads its verified schedule; changing city clears incompatible selections. Midyear rate changes use dated wages or a disclosed approximation. Multiple levies sum without double-counting credits. Each catalog record has a source/date and a fixture; no claim of exhaustive local coverage until the catalog supports it.

## P — Payroll and employment taxes

### P01 — Apply Social Security and state wage caps per worker
**P1 · Bug · L · Dependencies: M01/M03**

**Evidence:** PAYROLL:125 caps one summed household wage value. The model cannot distinguish two spouses from one person with two jobs.

**Implementation:** Add stable earner identity to W2 income, aggregate wages per worker for Social Security and applicable state employee caps, and aggregate household wages only for provisions that use filing status. Keep employer withholding and final employee liability distinguishable; do not automatically give every row a new wage cap.

**Acceptance:** Two spouses each earning $100,000 owe $12,400 employee SS tax in 2025; one worker earning $200,000 across two jobs has the $10,918.20 annual liability cap, with excess withholding handled separately if modeled. Test Additional Medicare filing thresholds independently. See [IRS separate-spouse excess Social Security instructions](https://www.irs.gov/instructions/i1040ss).

### P02 — Separate income-tax wages, payroll wages and work state
**P1 · Gap · L · Dependencies: P01/S02**

**Evidence:** One annual W2 value drives federal ordinary income, SS, Medicare and all state components. Residence state also determines payroll contributions; coverage/exemption/employer facts are absent.

**Implementation:** Represent income-tax wages, SS wages and Medicare wages or clearly labeled assumptions equivalent to W2 boxes 1/3/5. Track work state, covered payroll programs, employee share and applicable exemptions. Distinguish Additional Medicare withholding from joint-return liability. Do not subtract a pretax deduction again from a wage value already net of it.

**Acceptance:** A retirement-plan deferral can change income-tax wages without changing SS/Medicare wages where appropriate. Two-state employment applies source/reciprocity rules only when supported; otherwise emits a diagnostic. Wage-only tax components never apply to dividends, SS or rent.

### P03 — Verify all state employee payroll components, including Delaware
**P1 · Gap · M per state · Dependencies: F08/P02**

**Evidence:** PAYROLL includes an empty Delaware list even though paid-leave contributions began January 1, 2025. Several programs assume fixed employee participation; Hawaii's weekly cap is multiplied by 52 regardless of work duration.

**Implementation:** Inventory all 50 states/DC using dated official program sources. Add Delaware with coverage/employer-share facts rather than charging every worker universally. Model capped programs per worker/pay period where needed. Represent unknown employee share as an explicit assumption. Do not charge employer-only programs as employee deductions.

**Acceptance:** Covered Delaware employee scenarios calculate the configured employee contribution; exempt/employer-paid scenarios do not. Partial-year capped-program fixtures differ correctly from full-year ones. Every state has either verified components or a verified none-applicable record. Source: [Delaware Department of Labor](https://labor.delaware.gov/delaware-paid-leave/).

### P04 — Explicitly handle self-employment tax scope
**P2 · Gap · L · Dependencies: M03/P01**

**Evidence:** The UI accepts self-employment/business income while the engine only computes W2 payroll tax. Labeling the result all taxes can omit substantial employment taxes.

**Implementation:** Either implement a separate Schedule SE module with earned-income/net-earnings facts, SS coordination and deductible employer-equivalent portion, or flag SE tax as excluded for such rows. Do not apply W2 FICA to business income as a shortcut. Implement QBI separately if later supported.

**Acceptance:** Business income never receives W2 withholding merely due to a category guess. Supported SE scenarios reconcile tax and above-line adjustment; unsupported ones clearly identify the omitted component. Attach current-year Schedule SE worked examples before coding amounts.

## U — Results, UI, history and maintainability

### U01 — Derive marginal rates from a specified next-income scenario
**P1 · Bug · L · Dependencies: M03/F03/S02/L02/P01**

**Evidence:** APP:8457 adds ordinary federal, state, local, NIIT and payroll rates into one number. A wage increment should not automatically receive NIIT, nor a dividend increment FICA. APP:4133 merges incompatible taxable-income/MAGI thresholds and forces a running maximum via `highestCombinedRate`. The thermometer adds NIIT by total base even without investment income.

**Implementation:** Add a shared marginal-rate calculation by increment kind: wages, ordinary investment income, qualified dividend/LTCG, exempt interest. Compute consistent tax deltas and identify discontinuities/phaseouts. Define the thermometer axis and map each jurisdiction's thresholds into that same scenario rather than merging unrelated dollar bases. Remove the artificial running maximum; do not replace an effective-rate label with a fake marginal value.

**Acceptance:** Wage and dividend increments have distinct correct component rates. Zero NII does not automatically add NIIT to wage marginal tax. Taxable-income deductions move cutoffs correctly. Both genuine rate decreases from caps/recapture expiry and increases remain truthful. Compare finite differences away from boundaries and explicit one-sided boundary fixtures.

### U02 — Unify effective-rate denominators and income labels
**P1 · Bug/Contract gap · M · Dependencies: M11/U01**

**Evidence:** APP:4250 uses `max(totalIncome, federalTaxable, stateTaxable, localTaxable)` for thermometer effective rates, while APP:8460 uses totalIncome for the tile. WhatIf additions enter tax bases without entering `totalIncome/displayIncome` in the current request. These can produce different rates for the same result.

**Implementation:** Define named gross selected income, taxable income, spendable income and optional tax-only WhatIf income. Make the extra-income cashflow assumption explicit rather than silently changing historical behavior. Return denominator/value/label from the engine and use it in every tile, thermometer, report and MCP response.

**Acceptance:** Components sum to the displayed combined effective rate only when divided by the same denominator. Exclusion affects spendability but not the chosen tax-rate denominator accidentally. The UI clearly states if WhatIf income changes taxes only or also cash available. Zero denominator gives not-applicable, not a made-up percentage.

### U03 — Keep results tied to one successful input revision
**P1 · Risk/Bug · M · Dependencies: R05/M01**

**Evidence:** APP:7897 uses `||` for valid zero engine outputs; APP:8338 defaults missing results to zero. The UI exposes a calculation-status badge, but baseline results, current inputs and old results may still be mixed. STATIC:489 re-renders a previous result with the new gross amount after an error.

**Implementation:** Carry input hash/revision through current and baseline requests. Present pending/stale/error states across all dependent values, not only one badge. Use nullish presence for valid zeroes. Retain the entire old snapshot with its old labels when displaying stale data; never imply it belongs to current inputs.

**Acceptance:** Delay/reorder/fail both current and baseline responses; no hybrid yield or rate is shown as current. Zero AGI/deduction is respected. A failed first calculation never shows zero tax as a valid answer. Editing while offline leaves visible unsaved/stale status.

### U04 — Use one portfolio-yield attribution calculation
**P1 · Bug/Debt · M · Dependencies: M11/U03**

**Evidence:** APP:8440 clamps investment tax delta to nonnegative and reconstructs components; MCP:1158 uses the signed total-tax difference. Baseline failures can be treated as zero baseline tax in the UI.

**Implementation:** Put baseline definition and incremental investment-tax attribution in the shared calculation layer. Return a signed delta with provenance and explicit status. Agree how undistributed sheltered accrual and excluded investment income enter yield; keep principal limited to included investment-mode rows.

**Acceptance:** Frontend/MCP/report yields are identical for the same revision. Removing a preferred investment cannot cause a failed baseline request to charge all household tax against that investment. A legitimately negative incremental tax delta is explained, not silently clamped.

### U05 — Make history operate on atomic model actions
**P2 · Risk/Debt · M · Dependencies: R05/M01/M06**

**Evidence:** APP history serializes model state in effects; settings and WhatIf UI states are stored in multiple places, and remote refresh resets history. Multi-setter actions need explicit transaction boundaries.

**Implementation:** Introduce one command/reducer boundary for add/edit/delete/split/import, tax settings and scenario activation. Capture one before/after snapshot or inverse operation per user action. Decide and document remote-edit history behavior. Ensure named versions capture the entire calculational model, schema/year and activation flags.

**Acceptance:** Delete a deduction, switch method/state/locality, split a row, edit a WhatIf and restore a named version: one Undo restores the exact previous calculation inputs; Redo reproduces them. Typing should not create hundreds of meaningless history entries. Remote changes cannot be silently overwritten by an old inverse snapshot.

### U06 — Extract the frontend monolith along domain boundaries
**P2 · Debt · L · Dependencies: monetary fixes have regression coverage**

**Evidence:** APP combines authentication, model normalization, calculations, API calls, investment grid, reports, history, dialogs and tax graphics in roughly 11,700 lines. Frontend imports domain helpers from the MCP package, and several tests import APP to access pure functions.

**Implementation:** Extract pure normalized-model/derivation code first into a neutral shared package, then API/auth/history hooks, then feature components. Keep existing behavior under characterization tests; do not redesign the product during extraction. Remove duplicate state/federal/label rules only after parity tests cover both callers.

**Acceptance:** Tax tests no longer import the React root. Dependency direction is frontend/MCP/snapshot → shared model/engine, not frontend → MCP server. Each extracted module has a narrow typed interface. Review changes in small commits; no numerical fixture changes in a pure refactor.

### U07 — Fix lint findings by cause, not blanket suppression
**P2 · Debt/Risk · M · Dependencies: U06 incrementally**

**Evidence:** Frontend lint reports 15 errors/5 warnings, including state synchronization in input/animation effects, dependency issues, exports mixed with components and mutations flagged by React tooling. Not every diagnostic proves a user-visible bug.

**Implementation:** Inventory diagnostics, separate genuine stale-closure bugs from safe local computation patterns, and refactor appropriately. Extract pure helpers, make event handlers stable where necessary and simplify input synchronization without losing edit drafts. Use narrow documented exceptions only after demonstrating safety.

**Acceptance:** Lint passes without disabling a rule for APP wholesale. Currency editing, typing intermediate values, animation and repeated search remain functional under StrictMode. Build does not hide lint failures.

### U08 — Replace layered theme patches with component tokens
**P2 · Debt/Risk · M · Dependencies: T04 baseline screenshots**

**Evidence:** CSS has accumulated many broad selectors and repeated overrides; the built stylesheet is about 227 kB. The history contains repeated light/dark WhatIf and popup regressions.

**Implementation:** Establish semantic theme variables for surfaces, text, borders, taxable/exempt/zero rows, selected controls and warnings. Scope styles by component rather than styling every descendant span/button. Remove superseded rules after checking computed styles. Preserve the default-light/saved-choice contract.

**Acceptance:** Both themes cover every tab, mini-sheet, dropdown, resizer, toolbar, modal and thermometer label. Saved dark mode survives reload; first-time users start light. WhatIf columns appear on the first open in either theme. No financial rule is encoded in CSS visibility.

### U09 — Stabilize grid geometry and popup placement
**P2 · Risk/Debt · M · Dependencies: M09/T04**

**Evidence:** InvestmentsTable:5147 onward coordinates sticky columns, persistent widths, highlighted filtering, search scrolling and inline menus; previous regressions indicate these interactions lack browser coverage.

**Implementation:** Use one column definition/width/offset model for header/body/footer and WhatIf columns. Render menus in a viewport-aware layer with flipping/max-height/keyboard navigation. Scroll only the table viewport for row navigation. Store widths by column identity and version, not visible index.

**Acceptance:** At narrow/wide widths and 200% zoom, highlighted rows contain every cell, sticky account/asset/dividend columns align, menus near the bottom remain scrollable, and first WhatIf open reveals actual cells. Resizing, sorting, hidden columns and reload preserve geometry.

### U10 — Make hover features and motion accessible
**P2 · Gap · M · Dependencies: T04**

**Evidence:** Important explanations use hover popovers and icon-only controls; custom pickers, tumbling values and camera effects require keyboard/touch/reduced-motion validation.

**Implementation:** Add focus/click access to tax breakdowns, accessible control names, proper modal focus/escape handling and keyboard navigation. Provide non-color taxability cues and reduced-motion behavior for values/flashes. Do not announce every animation frame to screen readers. Preserve selected-input native undo where appropriate.

**Acceptance:** Complete investment editing, search cycling, deductions, save/restore and tax explanation using keyboard alone. Touch users can open/dismiss breakdowns. Accessibility checks and manual focus tests pass in both themes; reduced motion disables nonessential flashes/tumbling.

## A — APIs, MCP, authentication and privacy

### A01 — Make MCP names, units and outputs match the UI contract
**P1 · Debt/Risk · M · Dependencies: M01/M09/M06**

**Evidence:** MCP still has legacy aliases and multiple implementations of selection actions. `investmentUiColumns` can return stored rather than derived income, while its human-readable field names imply what the user sees. Selection/WhatIf/highlight confusion recurred repeatedly.

**Implementation:** Publish a single canonical field/operation manifest shared by frontend and MCP. Keep existing URLs and backward aliases, but deprecate ambiguous aliases with exact descriptions. Return visible row number plus stable ID, units, resolved fields, revision and persisted status. Generate schema tests from the manifest; do not rely on a prose claim that an unavailable tool exists.

**Acceptance:** All published MCP path aliases expose the same current tool schema. Select-all checks ✓ only; WhatIf checks proposal only; highlight is visual only. Tool reads show derived Year/Month/Dividend for the active scenario and also expose original/proposed source values unambiguously.

### A02 — Add bounded requests, batching and safe retry semantics
**P2 · Risk · M · Dependencies: R05**

**Evidence:** MCP:171 fetch has no deadline and assumes every response is JSON. Each calculation can read the workbook and request current/baseline taxes independently. Public UI traffic competes with synchronization on a heavily throttled backend.

**Implementation:** Centralize timeouts, cancellation, structured HTTP errors and bounded backoff respecting Retry-After. Retry reads/calculations safely; require idempotency for mutations. Calculate related current/baseline/scenarios in one request where practical. Deduplicate identical in-flight requests and cap bulk/scenario counts.

**Acceptance:** HTML 502, 429, timeout and aborted requests produce useful errors, not JSON parse failures or hangs. Retried writes cannot duplicate rows. A many-row WhatIf scenario uses bounded requests rather than one expensive roundtrip per field.

### A03 — Protect the standalone Node MCP server
**P1 · Risk · M · Dependencies: none**

**Evidence:** NODE-MCP:50 accepts requests without caller authentication, uses configured backend credentials and calls `listen(PORT)` without a loopback host. Its transport map has no explicit idle expiration. Exposure depends on whether this server is run on a reachable interface; no live attack was attempted.

**Implementation:** Default to loopback for local use; require authenticated principals and appropriate origin/host validation for intentional network exposure. Scope credentials per principal instead of granting everyone a shared privileged config. Bound/expire sessions and close resources on disconnect/errors.

**Acceptance:** An unauthenticated network caller cannot read or modify the configured workbook. Expired/unknown session IDs do not grow unbounded transport state. Test permitted loopback operation and explicitly configured authenticated remote operation separately.

### A04 — Harden and test the complete authentication lifecycle
**P2 · Risk/Debt · M · Dependencies: R01**

**Evidence:** APP:824 sign-in silently returns if config is missing; callback/PKCE/token exchange live inside APP. Tokens include refreshToken but renewal behavior is not a complete tested flow. HANDLER:509 implements custom JWT verification and cached signing keys.

**Implementation:** Extract an auth state machine with visible misconfiguration errors, code/state/PKCE handling, expiry/refresh/logout, cancellation and callback cleanup on failure. Use a maintained Cognito verification implementation or rigorously test token_use/audience/issuer/expiry and key rotation. Keep secrets out of browser config and never log tokens.

**Acceptance:** Sign in/create account each start the appropriate flow exactly once. Test missing config, denied login, malformed callback storage, mismatched state, expired tokens, rotating signing key, refresh failure and logout. Two different users never inherit cached portfolio/auth state.

### A05 — Prevent credentials and financial queries entering analytics
**P1 · Risk · M · Dependencies: none**

**Evidence:** WORKER accepts query-string MCP tokens. Local `C:/myapp/aftertaxus-aws-static/analytics.js` transmits `location.pathname + location.search` and document.referrer. Backend analytics path normalization must not be assumed to remove sensitive query values. Browser assistant histories are origin-global rather than clearly user-scoped.

**Implementation:** Prefer authorization headers for new clients while preserving a documented transition for query-token connectors. Redact query parameters/referrers before analytics, logs and error reports; record only an allowlisted route and non-sensitive attribution. Scope/clear assistant histories by authenticated user and define retention/deletion. Rotate any credential known to have been shared outside its intended boundary; do not print it in logs or documentation.

**Acceptance:** Requests with `mcp_token`, OAuth code or financial URL inputs leave no values in analytics events, reports or logs. Logging out and logging in as another user cannot reveal previous portfolio chat/history. Old connectors remain functional until explicitly migrated.

### A06 — Establish a real embedded-host trust boundary
**P2 · Risk · M · Dependencies: M01/A01**

**Evidence:** BRIDGE:15 posts tool payloads to `window.parent` with wildcard origin and treats any iframe parent as an MCP host. Responses check source but not an established trusted-host/session handshake. A global fetch replacement redirects API calls based on URL path.

**Implementation:** Prefer the supported host bridge/protocol, validate initialization/session and schema, and constrain target/accepted origins where compatible with the actual host. Do not hardcode assumptions that break sandboxed hosts; document the authenticated channel. Narrow interception to the expected API origin and add teardown. Bound pending calls and validate returned status/body.

**Acceptance:** An arbitrary embedding page cannot spoof a trusted model session or silently capture API payloads merely because it is the parent. Valid ChatGPT embedding still loads and writes via authenticated tools. Normal standalone fetch remains unaffected; malformed or late messages cannot satisfy a different request.

### A07 — Test tenant isolation and bound public endpoint abuse
**P1 · Risk · L · Dependencies: M01/R05/A02**

**Evidence:** HANDLER contains Cognito, sync-token, MCP-token, public-report and analytics access paths; WORKER forwards public API requests. Application-level payload/rate bounds and isolation tests are sparse. Cloudflare protection does not automatically remove direct API Gateway access.

**Implementation:** Add principal/workspace authorization tests for every read/write route, token revocation and report ownership. Validate body size, row count, nesting and scenario limits before expensive processing. Separate cheap public calculators/analytics from private writes and paid chat quotas. Inventory direct-origin bypass and protect it with the chosen authenticated origin design; document kill-switch limitations instead of promising a hard cost cap.

**Acceptance:** User A cannot access user B by changing workspace, token ID, report ID or raw bridge body. Revoked tokens fail. Oversized requests are rejected before persistence/chat spend. Public smoke tests use no real customer data. Consult [Cloudflare Workers production guidance](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) and the deployed AWS architecture before changing access rules.

## I — Spreadsheet import/export

### I01 — Export the full supported tax settings model
**P1 · Gap · M · Dependencies: M01/M06/S02/L01**

**Evidence:** SHEETS:1200 exports state code and a few scalar deductions but not the full state deduction-mode/items model. `collectWorkbookExportPayload_` exports no local settings or explicit UI/scenario activation. Stale frontend settings can survive or new arrays can be missing.

**Implementation:** Publish a field-by-field import/export contract with required/optional/absent/empty semantics. Add state deduction mode/items, locality/residency/base overrides and the agreed activation flags. Include model/schema/tax year and data provenance. Recognize renamed tabs without requiring internal names. Do not export transient visual filters as calculation inclusion.

**Acceptance:** A synthetic workbook containing each supported field exports, loads, saves and reloads without loss. Empty lists can intentionally clear data; absent tabs produce documented keep/clear behavior. Unsupported fields are reported in a migration report rather than silently omitted.

### I02 — Test header mapping, percentages and row termination as a pipeline
**P1 · Risk · M · Dependencies: M01/M08/M12**

**Evidence:** SHEETS:721 onward has many aliases and positional fallbacks; row 8 scanning and blank-line stopping are layout-specific. There are no behavioral Apps Script export tests in the root suite.

**Implementation:** Extract pure normalizers or execute them with mocked SpreadsheetApp/Utilities. Build fixtures for the historical Tickers layout and new Assets layout, yes/no checkboxes, percentage formats, W2/SS/income items, blank separators, footer text and spreadsheet errors. Validate duplicates/unknown references before sending data. Attach original cell coordinates to warnings.

**Acceptance:** No Last Updated/footer rows become assets; intentional first blank line stops where documented. Annual/monthly and percent values retain units. Export→frontend→MCP produces identical row ledgers and tax inputs, not merely equal imported header totals. No private workbook is committed as a fixture.

### I03 — Make export read-only; move formula repair to an explicit action
**P1 · Bug/Risk · S · Dependencies: I02**

**Evidence:** SHEETS:1275 `EXPORT_WORKBOOK_TO_DATASTORE` calls `REPAIR_ASSET_COLUMN_FORMULAS`, which rewrites formulas in hardcoded T:V/X columns based on regular expressions. Export can alter the source workbook before the user knows what will change.

**Implementation:** Remove automatic repair from the export path. Keep an explicit migration/repair command that previews affected cells, validates the source layout and permits backup/reversal. Prefer header-based references over fixed positions.

**Acceptance:** Export calls no mutating sheet APIs. Running a repair twice is idempotent, only changes validated cells and can be reversed from its backup. An unfamiliar spreadsheet layout is rejected rather than rewritten.

### I04 — Eliminate independent legacy spreadsheet tax formulas
**P1 · Bug/Debt · M · Dependencies: F08/I02**

**Evidence:** SHEETS:182 `CA_TAX_2025_MFJ` still contains older thresholds, separate from STATES. Functions bearing 2024 names call a 2025 backend alias. Row tax adjustments and SS/NIIT are also duplicated.

**Implementation:** Inventory public spreadsheet function names and preserve compatibility through a versioned shared calculation contract. Delegate to the pinned authoritative engine or generate pure Apps Script functions from the same validated tax data. Clearly distinguish a function accepting taxable income from one computing it from gross. Document migration of old tax-year names.

**Acceptance:** Calling a spreadsheet function and its backend equivalent with the same year/status/taxable input gives the same value. Exports do not contain totals that later require the frontend to be artificially pinned. Network retries do not create a formula-driven request storm.

## C — Calculators and marketing surfaces

### C01 — Give the snapshot calculator a correct state deduction model
**P1 · Bug/Gap · M · Dependencies: S02/F08**

**Evidence:** SNAPSHOT:5 applies the same combined federal deduction to the state base. Its function computes state tax independently of the full state adapter. SNAPSHOT-UI describes an income-before-deductions input while internal naming still says taxableIncome.

**Implementation:** Define whether the input is gross/AGI or already taxable; rename and migrate URL/embedded fields accordingly. Use distinct federal and state deduction logic. Preserve incremental baseline-vs-investment comparison using the same engine/rule version. Disclose intentionally omitted local/payroll/SS interactions rather than presenting them as fully supported.

**Acceptance:** Federal deduction changes do not automatically reduce state income in nonconforming states. Selecting CA versus a no-broad-income-tax state changes only applicable components. When matching assumptions are used, the snapshot's tax delta equals the full engine's delta.

### C02 — Label yield data and avoid inferring tax treatment from a symbol alone
**P2 · Gap/Risk · M · Dependencies: M01/S04**

**Evidence:** SNAPSHOT-UI:61 contains a hardcoded yield catalog; default NAC yield differs from its catalog entry. There is no clear authoritative current-yield lookup in this code path. Selecting symbols can leave a previously chosen treatment in place.

**Implementation:** Distinguish sample, user-entered and retrieved yield; show metric type, source and as-of date. Unify defaults/catalog. If lookup is added, normalize yield units and retain a manual override. Require confirmed tax treatment/composition for arbitrary symbols; a symbol name is not tax evidence.

**Acceptance:** No static number is presented as live/current. Catalog/default selection is consistent; changing a symbol cannot silently keep an incompatible Treasury/muni treatment. Unknown symbols require yield/treatment or display a clear assumption. Tests mock lookup data rather than asserting today's market yield.

### C03 — Preserve tax character in the quick-calculator handoff
**P1 · Bug · M · Dependencies: M01/M03/M04**

**Evidence:** APP:8114 creates both ordinary and investment income in an account of type W2 income. The account override then makes the investment income wages, even if the handoff says qualified dividends or federally exempt income.

**Implementation:** Use separately typed income rows/accounts or a typed handoff model that preserves each income kind. Do not treat generic ordinary income as necessarily W2. Validate version/year/values and deduplicate by import ID. Apply the handoff as one undoable model transaction; do not overwrite an unrelated existing Income account's rules.

**Acceptance:** A muni handoff remains federally exempt; qualified dividends remain preferred and do not incur FICA. Repeating the same handoff does not add duplicate income. Undo restores the previous workbook and settings exactly.

### C04 — Remove conflicting calculator implementations from active routes
**P1 · Bug/Debt · M · Dependencies: R02/F08/C01**

**Evidence:** TEASER:22 has a separate invented four-step ordinary-tax approximation and flat 15% investment tax. STATIC uses the backend but omits stateStandardDeduction and assumes generic ordinary income is W2. Both coexist with SNAPSHOT and APP; their deployment status is not established by Git alone.

**Implementation:** Inventory actual routes/artifacts, label retired prototypes and make active calculators use the shared request/derivation contract. Keep presentation differences, not competing tax engines. Remove unsupported tax claims or show conspicuous scope warnings. Preserve the Sites project's separate lifecycle; do not deploy it accidentally while fixing the portfolio app.

**Acceptance:** Every public calculator route identifies its model/year and supported assumptions. Equivalent inputs produce equivalent tax components across active surfaces. A CI check detects a reintroduced handwritten competing schedule. Prototype removal/archival is explicit and does not erase user work.

## O — Operations

### O01 — Cleanly separate source, private data and deploy artifacts
**P2 · Risk/Debt · M · Dependencies: R01/R02**

**Evidence:** The workspace contains untracked app sources, archives, exports, scripts and a local credential file alongside the repository. Several deploy configurations/scripts are not tracked. Broad staging can expose private material or ship the wrong frontend.

**Implementation:** Document the authoritative source and deployment target for each surface. Add narrowly scoped ignore patterns for known credentials/customer exports/build archives, not patterns that hide real source. Add secret scanning and artifact manifests/checksums. Move local operational secrets to the designated secret store; never put them into documentation or generated frontend assets.

**Acceptance:** A clean status clearly separates intended source changes from private/generated files. Clean CI can reproduce every intended deploy artifact. Secret scanning uses synthetic fixtures and reports no credential values in logs. Do not delete local files as part of this task.

### O02 — Make backend shutoff/restart scripts fail truthfully
**P1 · Bug · S · Dependencies: none**

**Evidence:** `C:/myapp/shutoff-aftertaxus-backend.ps1` and `C:/myapp/turn-back-on-aftertaxus-backend.ps1` print success after native AWS commands without checking `$LASTEXITCODE`. `$ErrorActionPreference = Stop` alone does not reliably convert native-command failures into exceptions across supported PowerShell versions. Restart deletes the concurrency setting rather than restoring a previous custom value.

**Implementation:** Check every AWS exit code, verify readback, print success only after confirming state and return a nonzero process exit on failure. Save/restore the prior reservation when appropriate or clearly document restore-to-unreserved behavior. Parameterize target/environment and display it before action.

**Acceptance:** Mock AWS AccessDenied and network failure: scripts stop, report failure and never claim protection is active. Successful shutoff verifies reserved concurrency 0. Restart restores the explicitly intended state. Do not exercise these against production during tests.

## T — Test quality and verification work

### T01 — Replace self-confirming tax fixtures with independent evidence
**P1 · Debt/Gap · L · Dependencies: F08; incremental with each monetary task**

**Evidence:** TESTS `state-all.test.ts` embeds incorrect Wisconsin/Missouri expectations. Many federal tests recompute expected results using the same bracket structure as production. A count of 70 state tests does not mean all return rules/statuses are tested.

**Implementation:** Give every authoritative fixture metadata: tax year, source URL/document revision/page or worksheet line, input basis, status, expected intermediate values, final tax and rounding policy. Separate raw bracket arithmetic tests from full-return/planning-base tests. Add official examples plus independently hand-worked boundary fixtures. Retain an explicit unsupported-rules matrix.

**Acceptance:** At least one external anchor per jurisdiction/status family and each special calculation path, plus threshold tests. Fixtures do not import the production schedule to compute expectations. Correcting one state requires explaining why the old expectation was wrong. Do not assert universal continuity/monotonic marginal rates where the actual rule has a cliff or recapture.

### T02 — Use stateful persistence fakes in MCP tests
**P1 · Bug in test design · S · Dependencies: none; extend after R05**

**Evidence:** `C:/myapp/tests/mcp-calculation.test.ts` test named selection and visual highlighting persist as separate fields returns the original workbook on every read. It explicitly expects inclusion to become true in the second save after deselection. This does not test persistence and can conceal the reported regression.

**Implementation:** Make the fake store accept writes, advance revisions and serve updated snapshots. Assert final saved state, not merely arguments from isolated calls. Add partial-write/conflict/timeout behavior to the fake rather than overfitting it to the current code.

**Acceptance:** Deselect, highlight, reread: ✓ stays false and highlight changes only visual state. Do the reverse order, bulk selection, WhatIf and remote reload. A deliberately broken whole-workbook update must make the regression fail.

### T03 — Add cross-surface and metamorphic calculation tests
**P1 · Gap · M · Dependencies: M01/M11; incremental**

**Implementation:** Run the same normalized synthetic workbook through frontend derivation, MCP derivation and engine; compare intermediate row/base/deduction ledgers, not just final totals. Add properties for split/recombine, reorder, inclusion round-trip, WhatIf close/open, exclusion-only change, zero principal, repeated import, and known exemption behavior. Generate small mixed portfolios with reproducible seeds.

**Acceptance:** Any changed intermediate category fails with row ID and field name. Highlight/filter/reorder cannot change taxes. Splitting a single earner into multiple rows does not create extra wage caps. A state-exempt swap can affect federal SS/NIIT only through documented interactions, not stale overrides.

### T04 — Add real browser regression coverage
**P2 · Gap · L · Dependencies: R01/M01; begin before UI refactors**

**Evidence:** The current suite is Node Vitest; source-string assertions and helper tests cannot detect blank sticky cells, theme conflicts, clipped pickers or first-click WhatIf rendering failures.

**Implementation:** Add a local browser test harness with synthetic authentication/workbook fixtures and mocked API timing. Cover light/dark, narrow/desktop/zoom, sticky/resized/highlighted grids, first/repeated WhatIf toggle, symbol-dropdown/Enter search, popup flipping, hover/focus breakdowns, undo/redo, named versions and live MCP refresh. Keep visual snapshots limited to meaningful stable regions.

**Acceptance:** Tests reproduce the historical first-open/blank-highlight bugs when a corresponding broken style/state change is intentionally introduced. Browser tests never use real portfolio credentials or rewrite customer data. Accessibility and reduced-motion cases are included.

### T05 — Test storage, transport and authorization failure paths
**P1 · Gap · M · Dependencies: R03/R04/R05/A03/A07**

**Implementation:** Add dedicated STORE tests for pagination/unprocessed items/atomic failure/revision conflicts and HANDLER tests for input schemas/tenant ownership/token revocation. Exercise Worker and Node MCP transports rather than only in-memory tool definitions. Add public-route/embedded-bridge contract tests with malformed replies and timeout behavior.

**Acceptance:** Every failure produces truthful status and leaves previously saved data intact. A permitted user still works after auth hardening; an unauthenticated caller cannot gain access through an alternate path. Concurrency failures are deterministic tests, not timing-dependent sleeps.

## State-by-state work orders for S02/T01/P03

Use IDs `STATE-<code>-2025`. These are **51 separate verification work orders**, not claims that every listed state is currently incorrect. The reviewed profiles generally contain only single/MFJ; absent HOH/MFS definitions silently inherit single. Verification must prove whether inheritance is valid. Reusing one table is acceptable only when the authority says so.

### Required deliverables for each state

1. Locate final official 2025 resident instructions, rate schedules, deduction/exemption rules and employee payroll program sources. Record retrieval date and form revision; avoid a current-year page silently replacing 2025 data.
2. Fill a coverage record for each supported status: gross-income starting basis, conformity/additions/subtractions, standard/itemized deductions, exemptions, SS/retirement, interest/gains and credits/recapture. Mark omitted rules explicitly.
3. Add a state adapter under the shared tax package selected by M01/S02. Keep ordinary wage income, investment income and taxable-income-only API contracts distinct. Do not change all states in a single patch.
4. Add independent fixtures for zero, low, middle and high income; every bracket's lower/upper edge; all supported statuses; Treasury/home/out-of-state muni interest; SS/retirement; and applicable payroll/local interactions. If a rule is not applicable, record why rather than adding a pretend calculation.
5. Run focused state fixtures, full tax tests and parity tests. Publish the exact supported/unsupported matrix for that state. Request domain review for complex recapture, allocation or basis rules before release.

The focus column identifies what to examine first, not a complete legal specification. It must be verified against the named state's authority before implementation.

| Work order | Jurisdiction | First verification focus |
| --- | --- | --- |
| STATE-AL-2025 | Alabama | Starting income, deduction/exemption rules, federal-tax deduction interaction and occupational locality sourcing. |
| STATE-AK-2025 | Alaska | Verify no broad income tax separately from employee unemployment contributions. |
| STATE-AZ-2025 | Arizona | Federal/state conformity, deductions, exemptions and flat-rate application. |
| STATE-AR-2025 | Arkansas | Income-dependent tax tables/adjustments; do not assume the two-entry profile covers every income range. |
| STATE-CA-2025 | California | All statuses, actual standard deductions, exemption credits/phaseouts, SS/retirement, municipal sourcing and high-income surcharge. |
| STATE-CO-2025 | Colorado | Federal taxable-income linkage, state modifications and retirement/SS rules. |
| STATE-CT-2025 | Connecticut | Status tables, exemptions/credits, benefit recapture and SS/pension subtraction eligibility. |
| STATE-DE-2025 | Delaware | State deduction/retirement rules, Wilmington sourcing and paid-leave employee participation. |
| STATE-FL-2025 | Florida | Explicit no-broad-income-tax coverage; preserve federal/NIIT rules. |
| STATE-GA-2025 | Georgia | Final 2025 rate, filing deductions/exemptions and retirement adjustments. |
| STATE-HI-2025 | Hawaii | 2025 bracket changes, HOH/MFS, deductions/exemptions and weekly TDI caps. |
| STATE-ID-2025 | Idaho | Flat-rate taxable-base adjustments, deduction/exemption rules and retirement eligibility. |
| STATE-IL-2025 | Illinois | Exemptions and retirement subtraction; do not copy the federal standard deduction blindly. |
| STATE-IN-2025 | Indiana | State base/exemptions and actual county of residence/employment rates. |
| STATE-IA-2025 | Iowa | 2025 flat-rate transition, deductions and age-dependent retirement exclusions. |
| STATE-KS-2025 | Kansas | Brackets, filing deductions/exemptions and SS/retirement modifications. |
| STATE-KY-2025 | Kentucky | State base and pension exclusions; occupational-tax source allocation. |
| STATE-LA-2025 | Louisiana | 2025 flat-tax/base transition and revised deduction/exemption rules. |
| STATE-ME-2025 | Maine | HOH/MFS, deduction/exemption phaseouts, pension subtraction and paid leave. |
| STATE-MD-2025 | Maryland | New brackets, state/local deduction rules, county schedules, retirement and additional gains tax. |
| STATE-MA-2025 | Massachusetts | Income classes, short-term gains, surtax and state-specific deductions. |
| STATE-MI-2025 | Michigan | Retirement/SS and exemption rules; resident/nonresident city treatment. |
| STATE-MN-2025 | Minnesota | Filing schedules, SS alternative/simplified subtraction, retirement and state modifications. |
| STATE-MS-2025 | Mississippi | Exempt initial income band, filing rules and retirement income exclusions. |
| STATE-MO-2025 | Missouri | Correct rate chart, taxpayer/spouse allocation and state deductions/adjustments. |
| STATE-MT-2025 | Montana | State taxable-base rules and gain/retirement treatment by status. |
| STATE-NE-2025 | Nebraska | Final rate schedules, filing deductions/exemptions and SS/retirement treatment. |
| STATE-NV-2025 | Nevada | Explicit no-broad-income-tax coverage; no employee income-tax proxy. |
| STATE-NH-2025 | New Hampshire | Verify 2025 treatment after interest/dividends tax repeal; preserve historical-year distinction. |
| STATE-NJ-2025 | New Jersey | Separate gross-income classes, loss restrictions, retirement exclusions and employee payroll components. |
| STATE-NM-2025 | New Mexico | Updated brackets, HOH/MFS, deductions and SS/gain exclusions. |
| STATE-NY-2025 | New York | HOH/MFS, NY AGI and recapture, retirement exclusions and NYC/Yonkers integration. |
| STATE-NC-2025 | North Carolina | Final rate, deduction limits and state modifications. |
| STATE-ND-2025 | North Dakota | Filing thresholds and state additions/subtractions. |
| STATE-OH-2025 | Ohio | Published base-tax/nonbusiness schedule, business-income treatment, exemptions and local allocation; preserve official boundary semantics. |
| STATE-OK-2025 | Oklahoma | Status-dependent brackets/deductions/exemptions and retirement modifications. |
| STATE-OR-2025 | Oregon | Federal/state adjustments, filing deductions, federal-tax subtraction limits and transit/paid-leave scope. |
| STATE-PA-2025 | Pennsylvania | Separate income classes and loss restrictions, retirement exclusions and earned-income/local sourcing. |
| STATE-RI-2025 | Rhode Island | Filing deduction/exemption phaseouts, retirement/SS and TDI. |
| STATE-SC-2025 | South Carolina | Final 2025 rate table and retirement/age-based deductions. |
| STATE-SD-2025 | South Dakota | Explicit no-broad-income-tax coverage. |
| STATE-TN-2025 | Tennessee | Explicit no-broad-income-tax coverage; no obsolete investment-income tax. |
| STATE-TX-2025 | Texas | Explicit no-broad-income-tax coverage; federal and payroll remain applicable. |
| STATE-UT-2025 | Utah | Taxpayer credits and phaseouts, SS treatment and retirement adjustments. |
| STATE-VT-2025 | Vermont | Status schedules, deduction/exemption rules and SS subtraction eligibility. |
| STATE-VA-2025 | Virginia | State standard deductions, age/retirement rules and exemptions. |
| STATE-WA-2025 | Washington | Capital-gains excise versus no wage income tax; PFML/WA Cares participation. |
| STATE-WV-2025 | West Virginia | Status-specific calculations, exemptions and final 2025 SS treatment. |
| STATE-WI-2025 | Wisconsin | Correct new bracket widths, MFS, sliding deduction and new retirement subtraction. |
| STATE-WY-2025 | Wyoming | Explicit no-broad-income-tax coverage. |
| STATE-DC-2025 | District of Columbia | Filing/deduction rules, exemptions/adjustments and separation of employer-only payroll programs. |

## Recommended implementation order

1. **Release/data safety:** R01, R03, R04, O02, T02; establish R02 without hiding existing lint failures.
2. **Model contract:** M01, M08, M09, M10; R05/R06; then M02/M03/M05/M06/M07/M12. Start T03 immediately.
3. **Known monetary defects:** S01, F01/F02/F03/F04, P01, M04, L01, C03. Each carries its own failing regression.
4. **Tax-base completeness:** S02 per state, S03/S04/S05, L02/L03, P02/P03/P04 and F05/F06/F07/F08. Start high-use states first, but keep unsupported states visibly qualified.
5. **Consistent results:** M11, U01/U02/U03/U04, I01/I02/I03/I04, C01/C02/C04.
6. **Security/operations in parallel with safe model work:** A03/A04/A05/A06/A07, A02, O01, T05. Do not defer a reachable unauthenticated Node MCP deployment.
7. **UI maintenance after coverage:** T04, U05/U06/U07/U08/U09/U10, A01 and ongoing T01. Prefer small extractions over a replacement application.

Several tasks can proceed earlier if their dependency contract is already agreed. Avoid simultaneous edits to the giant APP file by multiple agents; agree on shared schema changes first.

## Definition of done for the overall remediation

- Clean-checkout builds and comprehensive CI pass; local-only files cannot hide release failures.
- The same normalized workbook/revision produces the same inputs, components and totals through browser, MCP, import and supported calculators.
- Every supported tax rule has a dated official source and independent expected fixtures; every unsupported material rule is clearly surfaced.
- Storage acknowledges only complete committed revisions; concurrent edits are protected and clients refresh both true and false changes correctly.
- Excluded income, selection, WhatIf, highlighting, year, money units and manual deduction overrides obey the contracts above.
- Tax graphics explain actual results rather than reshaping them. Pending/error states cannot masquerade as zero tax or a current successful result.
- Authentication, tenant boundaries, secret handling and operations scripts have failure-path tests. UI workflows work in both themes, with keyboard/touch and narrow viewports.
- Published scope language matches the real coverage matrix. A planning estimate is never represented as a verified full tax return solely because all unit tests pass.
