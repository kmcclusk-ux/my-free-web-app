type PortfolioChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function isPortfolioActionRequest(content: string) {
  return /\b(?:add|apply|change|check|clear|create|delete|edit|filter|find|highlight|open|remove|replace|reset|select|set|show only|sort|uncheck|update)\b/i.test(content);
}

function buildRowMatchingIndex(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object") return { accounts: [], rows: [] };
  const source = snapshot as Record<string, any>;
  const holdings = Array.isArray(source.holdings) ? source.holdings : [];
  const accountRows = Array.isArray(source.accounts) ? source.accounts : [];
  const accounts = uniqueStrings([
    ...holdings.map((row: any) => row?.account),
    ...accountRows.map((row: any) => row?.account),
  ]).slice(0, 100);
  const rows = holdings.slice(0, 250).map((row: any) => ({
    id: row?.id,
    account: row?.account,
    description: row?.description,
    symbol: row?.symbol,
    effectiveSymbol: row?.effectiveSymbol,
    category: row?.category,
  }));
  return { accounts, rows };
}

function buildCurrentModelContext(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object") return {};
  const source = snapshot as Record<string, any>;
  const references = source.referenceTables && typeof source.referenceTables === "object"
    ? source.referenceTables
    : {};
  return {
    view: source.view,
    settings: source.settings,
    accounts: Array.isArray(source.accounts) ? source.accounts.slice(0, 250) : [],
    assets: Array.isArray(references.tickers) ? references.tickers.slice(0, 500) : [],
    assetClasses: Array.isArray(references.categories) ? references.categories.slice(0, 250) : [],
    taxTreatments: Array.isArray(references.taxTreatment) ? references.taxTreatment.slice(0, 250) : [],
    accountTaxCategories: Array.isArray(references.accountTaxType) ? references.accountTaxType.slice(0, 250) : [],
    accountTypes: Array.isArray(references.accountType) ? references.accountType.slice(0, 250) : [],
    allocationTotalsByAssetClass: source.assetClasses,
    metrics: source.metrics,
    concentration: source.concentration,
    editableTables: source.editableTables,
  };
}

const AFTERTAXUS_MODEL_LAYOUT = `
AFTERTAX US COMPLETE MODEL LAYOUT

MENTAL MODEL AND DATA FLOW
- AfterTax US is a workbook-style portfolio, income, and tax model. Its primary chain is: Investments / Income rows -> Asset lookup -> Account lookup -> Account Type -> Account Tax Category, while each Asset also points to an Asset Class and Tax Treatment. Those resolved values feed federal, state, and local tax calculations, after-tax income, yield, allocation, and concentration outputs.
- Treat table names as distinct concepts. An investment is a user's holding or income row. An asset is a reusable lookup definition keyed by Asset ID/symbol. An account is a named container. Account Type maps that container to an Account Tax Category. Tax Treatment describes how an asset's income is taxed. Asset Class describes allocation, not tax treatment.
- Use exact IDs and values from CURRENT AFTERTAX US MODEL DATA whenever available. Never confuse a spreadsheet row number with the stable investment id. A highlighted/selected row is UI state and is separate from the Inc/includeIncome calculation checkbox.

1. INVESTMENTS / INCOME (tableId: investments)
- Purpose: the main holding and income-source grid. Each row contributes a balance and/or annual income and resolves descriptive and tax attributes through its Asset and Account.
- Stored fields: id (stable app row id); spreadsheetRowNumber (display/import provenance only); description (holding or income-source name); account (links to Accounts.account); category (asset-class value, normally resolved through the Asset); totalInvestment (principal/current amount); yearlyIncome (annual income amount); includeIncome/Inc (whether the row participates in modeled calculations); select (legacy alias of includeIncome in snapshots, not highlighted-row state); overrideProposal/WhatIf (whether proposed asset/yield overrides are active); symbol (current Asset ID); newSymbol (proposed Asset ID); newPercent (proposed annual yield as a decimal).
- Derived row fields: monthlyIncome; currentPercent; effectiveSymbol; effectivePercent; incomeItem; extraData; filteredIncome; investmentIncome; displayInvestmentIncome; investmentOrdinaryMonthly; investmentPreferredMonthly; investmentStateMonthly; niitIncome; displayYearlyIncome; displayMonthlyIncome; displayFilteredIncome; includedTotal; taxStatus; taxTreatment; stateTaxRule; localTaxCategory; currentAssetTaxTone; proposedAssetTaxTone; investmentType; ordinaryMonthly; preferredMonthly; stateMonthly; displayOrdinaryMonthly; displayPreferredMonthly; displayStateMonthly; displayNonInvestmentIncome; w2Income; nonTaxableMonthly; nonInvestmentIncome; and allocation buckets cash, stocks, preferredStock, bonds, muniBond, muniInterest, businessDevelopment, coveredCall, realEstate, bitcoin.
- WhatIf behavior: when overrideProposal is true, newSymbol/newPercent become effectiveSymbol/effectivePercent for downstream calculations. Otherwise the current symbol and Asset dividend rate apply.
- Income behavior: income sources are represented in this same grid and have a matching Asset lookup row marked as an income item/type. The add-income flow asks for sourceName and an annual or monthly amount; persisted yearlyIncome is annualized. Income rows receive special red visual treatment but remain model rows, not a separate tax table.
- View controls: filters are account, category, and asset; sortable fields are description, account, category, totalInvestment, yearlyIncome, symbol, includedTotal, and filteredIncome. selectedAssetIds are highlighted rows. Saved row selections use stable row hashes outside the LLM snapshot so reordering/imports do not change identity.

2. ASSETS (tableId: tickers; referenceTables.tickers)
- Purpose: reusable lookup definitions applied to investment/income rows through symbol/Asset ID.
- Fields: id; symbol (Asset ID and primary match key); percentReturn (annual dividend/yield decimal); assetType (for example ETF, stock, bond, or income); category (links to Asset Classes.name); taxTreatment (links to Tax Treatments.label); incomeItem (whether this represents non-investment income); extraData (treatment-specific numeric input); description; exDividend; divPayout.
- Resolution: an investment symbol resolves dividend rate, asset type, asset class, treatment, description, income flag, and extra tax data from this table. effectiveSymbol resolves the proposed asset when WhatIf is active.

3. ACCOUNTS (tableId: accounts)
- Purpose: named portfolio containers referenced by Investments.account.
- Fields: id; account (account name and primary match key); accountType (links to Account Type.name); taxStatus (resolved/legacy account tax category); dividendAccrued; includeInFreeCashflow (the UI presents this inversely as "Exclude from aftertax income").
- Resolution: Account.accountType -> Account Type.taxStatus -> Account Tax Category.taxStatus. This account-level tax status determines whether otherwise taxable asset income is currently taxable, tax-deferred, tax-free, or another configured category. Account cashflow inclusion controls whether income contributes to spendable after-tax/free-cashflow outputs.

4. ACCOUNT TYPE (tableId: accountType; referenceTables.accountType)
- Purpose: maps recognizable account kinds to account tax categories and supports allocation rollups.
- Fields: id; name (primary match key, such as Brokerage Account, Traditional IRA, Roth IRA, or a custom type); taxStatus (links to Account Tax Category.taxStatus); includeInAllocation (whether this type appears in account-type allocation reporting).
- Do not treat Account Type as Asset Type. Account Type classifies the account container; Asset Type classifies an asset/income definition.

5. ACCOUNT TAX CATEGORY (tableId: accountTaxType; referenceTables.accountTaxType)
- Purpose: controlled list of account-level tax statuses used by Account Type and account-tax allocation reporting.
- Fields: id; taxStatus (primary match key); includeInAllocation.
- This layer modifies whether income flowing from an Asset's Tax Treatment is currently recognized. It is distinct from Tax Treatment: account tax category describes the wrapper; tax treatment describes the income character.

6. ASSET CLASSES (tableId: categories; referenceTables.categories)
- Purpose: controlled list for Assets.category and portfolio-allocation rollups.
- Fields: id; name (primary match key); includeInAllocation.
- Dynamic allocation totals can include cash, stocks, preferredStock, bonds, muniBond, businessDevelopment, coveredCall, realEstate, and bitcoin. Derived rows may also track muniInterest. Asset Class is for exposure/allocation and does not by itself determine federal/state/local taxation.

7. TAX TREATMENTS (tableId: taxTreatment; referenceTables.taxTreatment)
- Purpose: structured income-character rules referenced by Assets.taxTreatment.
- Fields: id; label (Treatment ID and primary match key); ordinaryShare (fraction assigned to federal ordinary income); preferredShare (fraction assigned to federal qualified-dividend/long-term-gain treatment); stateRule (taxable, exempt, or treasury-exempt); niitIncluded (whether income enters net investment income for NIIT); localCategory (one of the local taxable-base categories); description (human explanation); includeInAllocation (whether included in tax-treatment allocation reporting).
- ordinaryShare and preferredShare are decimals and should normally describe the intended split of taxable investment income. stateRule controls state inclusion independently of federal character. treasury-exempt represents federally taxable but state-exempt treatment. localCategory routes income into the selected locality's base. Account tax category may suppress current taxation even when the asset treatment is taxable.

8. FEDERAL TAX (settings.federal; updateSettings section: federal)
- Inputs: filingStatus (single, mfj, mfs, hoh); deductionMode (standard or itemized); extraOrdinaryIncome; extraPreferredIncome; extraOrdinaryItems [{id, amount, incomeType}]; extraPreferredItems [{id, amount, incomeType}]; aboveLineDeductionItems [{id, amount, deductionType}]; deductionItems [{id, amount, deductionType}]; mortgageInterest; propertyTax. Statutory standard deduction, bracket values, NIIT thresholds, payroll thresholds, and SALT cap are backend-owned for the modeled tax year.
- Income construction: resolved row income is split into ordinary and preferred components by Tax Treatment; non-investment income and enabled federal WhatIf items are added; tax-free income is excluded. MAGI and netInvestmentIncome are separately tracked for NIIT.
- Deduction flow: gross ordinary + preferred income -> above-the-line adjustments -> income before standard/itemized deduction -> selected deduction -> federal taxable income, then ordinary and preferred taxable portions.
- Outputs/details: ordinary income before deductions; preferred income before deductions; gross federal taxable income; above-the-line adjustments; income after adjustments; standard versus itemized deduction; federal/ordinary/preferred taxable income; SALT inputs and cap; ordinary tax; preferred tax; NIIT; federal income tax; employee Social Security; Medicare; Additional Medicare; total FICA; total federal tax plus payroll; effective federal rates; current ordinary marginal bracket.
- Known limitations requiring external review include credits, AMT, QBI, basis, carryforwards, many phaseouts, and jurisdiction/eligibility-specific deduction rules.

9. STATE TAX (settings.state; updateSettings section: state)
- Inputs: stateCode; extraStateIncome; deductionMode; deductionItems [{id, amount, deductionType}]; mortgageInterest; propertyTax; standardDeduction. Federal filingStatus is reused.
- Income construction: starts from federally taxable modeled income, then applies each Tax Treatment.stateRule, adds federal WhatIf income and state extra income, and applies the selected state deduction. State schedules may be progressive, flat, or no broad-based individual income tax.
- Outputs/details: federal-taxable investments; state-tax-free investments and dividends; state taxability adjustment; gross modeled state income; standard/itemized deduction comparison; state taxable income; state income tax; modeled employee state payroll contributions; total state tax plus payroll; effective and marginal state rates; bracket schedule.
- State-specific credits, residency/sourcing, deduction caps, exemptions, recapture, and phaseouts may not be fully modeled.

10. LOCAL TAX (settings.local; updateSettings section: local)
- Inputs: enabled; localityId; localityName; residency (resident or nonresident); rate; nonresidentRate; taxableBase flags.
- Locality profile fields: id; locality; state; kind (none, flat, progressive, or state-surcharge); residentRate; nonresidentRate; brackets [{threshold, rate}]; base; nonresidentBase; note.
- Taxable-base categories: wages, selfEmployment, interest, dividends, capitalGains, rentalIncome, businessIncome, retirementIncome, socialSecurity. Each Tax Treatment.localCategory routes income to one of these categories, and the selected locality/residency determines which categories are included.
- Outputs/details: enabled status; locality; residency; rate structure; resident/nonresident rates; amount and include/exclude status for every base category; total local taxable base; effective local rate; marginal local rate; estimated local tax; modeled bracket schedule. Local deductions and credits are not modeled.

11. PLANNER, UI, OUTPUTS, AND REPORTING
- Planner settings: federalWithholding and stateWithholding.
- UI settings relevant to assistant actions: incomePrimaryPeriod; darkMode; investmentFavorites; selectedAssetIds; selectedInvestmentHashes; investmentWhatIfOpen. View state includes activeTab, focusGrid, filters, sort, and selectedAssetIds.
- Core metrics: totalInvestmentAmount; totalIncome; portfolioYield; portfolioBeforeTaxYield; portfolioAfterTaxYield; investmentIncome; investmentAfterTaxIncome; afterTaxIncome; federalTax; stateTax; totalTax; federalTaxable; stateTaxable; magi; netInvestmentIncome.
- Concentration outputs: top holding, top account, and top asset class with allocation percentages. Reporting rollups include portfolio asset-class allocation, account-tax-category allocation, account-type allocation, and tax-treatment allocation.
- Scenarios/model versions save the complete model data snapshot. Published summary reports can include income, investments, after-tax income, marginal/effective rates, federal/state/local/total tax, taxable bases, filing status, locality, allocation rollups, and scenario comparisons.

MODEL INTERPRETATION RULES
- Follow links before acting: Investment.account -> Account.accountType -> Account Type.taxStatus -> Account Tax Category; Investment.effectiveSymbol -> Asset.category/Tax Treatment/incomeItem; Asset.category -> Asset Class; Asset.taxTreatment -> Tax Treatment -> federal/state/NIIT/local treatment.
- Prefer editing the authoritative lookup table when the user requests a reusable rule change. Edit an Investment row for a holding-specific amount, account, inclusion, symbol, or WhatIf proposal. Edit Assets for symbol-level yield/class/treatment metadata. Edit Accounts/Account Type/Account Tax Category for account-wrapper behavior. Edit Tax Treatments for income-character rules. Edit settings for tax assumptions.
- Do not infer that the word "account" means Account Type or Account Tax Category, or that "asset" means an investment row. Use the user's wording plus the model relationships and current data to choose the correct surface.
`;

export function appendPortfolioActionContext(messages: PortfolioChatMessage[], snapshot: unknown): PortfolioChatMessage[] {
  const lastUserIndex = messages.map((message) => message.role).lastIndexOf("user");
  if (lastUserIndex < 0 || !isPortfolioActionRequest(messages[lastUserIndex].content)) return messages;

  const index = buildRowMatchingIndex(snapshot);
  const currentModel = buildCurrentModelContext(snapshot);
  const actionContext = `

<aftertaxus_action_execution_context>
You are translating the user's natural-language request into an action for the AfterTax US portfolio UI. Interpret the request semantically; do not search for the entire raw command as literal row text.

${AFTERTAXUS_MODEL_LAYOUT}

ROW-SELECTION RULES
- "select rows", "highlight rows", "show only ... rows", and "select only ... rows" refer to the UI's highlighted-row selection, not the Inc/includeIncome checkbox.
- "select only" means replace the existing highlighted selection with exactly the matching rows. Return one selectRows action containing the exact matching row IDs from the supplied portfolio snapshot.
- Ignore command/filler words when identifying the value to match, including: select, only, the, rows, row, where, with, containing, account, is, equals, named, called, please, show, and highlight.
- If the user names a field, match that field first. "where the account is X" must match holding.account against X. "symbol/ticker X" must match symbol/effectiveSymbol. "description contains X" must match description. Without a named field, search account, description, symbol, effectiveSymbol, and category.
- Match case-insensitively. Allow a minor spelling error or omitted character when one real snapshot value is clearly the intended match. For example, "vangard" should match "Vanguard" when Vanguard is the unique close account/description value. Do not invent a value that is absent from the snapshot.
- Resolve matches yourself from the row index below. Never put the unparsed phrase (for example, "only the where the account is vangard") into a selector and never claim no rows matched until you have compared the meaningful value against the listed fields.
- If one interpretation is clearly best, execute it. Ask a concise clarification only when multiple materially different snapshot values are equally plausible.

ACTION OUTPUT
- For a UI/workbook change, return JSON only: {"message":"short confirmation","actions":[...]}
- Highlight/select rows: {"type":"selectRows","payload":{"ids":[1,2,3]},"requiresConfirmation":false}
- Use IDs exactly as listed in the current row index. Do not use spreadsheet row numbers unless they are explicitly supplied as IDs in the snapshot.
- For an informational question with no requested change, answer normally and return no action.

AVAILABLE ACCOUNT VALUES
${JSON.stringify(index.accounts)}

CURRENT ROW MATCHING INDEX
${JSON.stringify(index.rows)}

CURRENT AFTERTAX US MODEL DATA
The following is live data from the user's current model. It follows the complete layout above. Missing or undefined sections are not available in the current snapshot; do not invent them.
${JSON.stringify(currentModel)}
</aftertaxus_action_execution_context>`;

  return messages.map((message, index) => index === lastUserIndex
    ? { ...message, content: `${message.content}${actionContext}` }
    : message);
}
