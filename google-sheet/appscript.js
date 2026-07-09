function clearDelta() {
  const sheet = SpreadsheetApp.getActiveSheet();
  sheet.getRange(4, 12).setValue(0); // row 4, col 12 -> sets to zero
}

const TAX_API_URL = "https://j4evba8fpj.execute-api.us-west-2.amazonaws.com/portfolio/hello";
const WORKBOOK_SYNC_TOKEN_PROPERTY = "PORTFOLIO_WORKBOOK_SYNC_TOKEN";

function getWorkbookSyncToken_() {
  return PropertiesService.getScriptProperties().getProperty(WORKBOOK_SYNC_TOKEN_PROPERTY) || "";
}

function callTaxApi(payload) {
  var syncToken = getWorkbookSyncToken_();
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    headers: syncToken ? {
      "X-Portfolio-Sync-Token": syncToken,
      "X-Portfolio-MCP-Token": syncToken
    } : {}
  };

  var resp = UrlFetchApp.fetch(TAX_API_URL, options);
  var code = resp.getResponseCode();
  var text = resp.getContentText();

  if (code !== 200) {
    throw new Error("HTTP " + code + ": " + text);
  }

  return JSON.parse(text);
}

/**
 * Calculates a new amount based on the tax treatment.
 *
 * @param {number} amount - The input amount.
 * @param {string} taxTreatment - The tax treatment type (e.g., "qualified", "nonqualified", "tax-free").
 * @return {number} The adjusted amount after tax treatment.
 *
 * @customfunction
 */
function FED_TAX_ADJUST(amount, taxTreatment, extra, pref) {
  Logger.log('Starting TAX_ADJUST test...');

  switch (taxTreatment.toLowerCase()) {
    case 'hold':
      return 0;
    case 'tax free':
      return 0;
    case 'state tax free':
      if (pref) return 0;
      return amount;
    case 'fed tax free':
      return 0;
    case 'index-60-40':
      if (pref) return amount * 0.60;
      return amount * 0.40;
    case 'income':
      if (pref) return 0;
      return amount;
    case 'ss-85-fed':
      if (pref) return 0;
      return amount * 0.85;
    case 'qualified-div':
      if (!pref) return 0;
      return amount;
    case 'non-qualified-div':
      if (pref) return 0;
      return amount;
    case 'short term gain':
      if (pref) return 0;
      return amount;
    case 'long term gain':
      if (!pref) return 0;
      return amount;
    case 'real estate':
      if (pref) return 0;
      return amount - extra;
    default:
      if (pref) return 0;
      return amount;
  }
}

/**
 * Calculates CA state tax for an amount based on tax treatment.
 *
 * @param {number} amount        The item's pre-tax amount.
 * @param {string} taxTreatment  Label describing the tax type.
 * @param {number} extra         Base CA taxable income (Form 540 line 19) BEFORE this item.
 * @return {number} Incremental CA-taxable amount attributable to this item.
 *
 * @customfunction
 */
function STATE_TAX_ADJUST(amount, taxTreatment, extra) {
  Logger.log('Starting STATE_TAX_ADJUST...');

  var amt = Number(amount);
  var base = Number(extra) || 0;
  if (!isFinite(amt) || amt <= 0) return 0;

  var t = (taxTreatment || '').toString().toLowerCase().trim();
  var stateTaxable = 0;

  switch (t) {
    case 'hold':
      return 0;
    case 'tax free':
    case 'state tax free':
      stateTaxable = 0;
      break;
    case 'fed tax free':
      stateTaxable = amt;
      break;
    case 'index-60-40':
    case 'income':
    case 'qualified-div':
    case 'non-qualified-div':
    case 'short term gain':
    case 'long term gain':
      stateTaxable = amt;
      break;
    case 'ss-85-fed':
      Logger.log('STATE_TAX_ADJUST: Social Security is CA tax free.');
      stateTaxable = 0;
      break;
    case 'real estate':
      stateTaxable = amt - base;
      if (stateTaxable < 0) stateTaxable = 0;
      break;
    default:
      stateTaxable = amt;
      break;
  }

  if (stateTaxable <= 0) return 0;
  return stateTaxable;
}

/**
 * Backward-compatible alias used by older sheet formulas.
 *
 * @customfunction
 */
function FED_ADJUST(amount, taxTreatment, extra, pref) {
  return FED_TAX_ADJUST(amount, taxTreatment, extra, pref);
}

/**
 * Backward-compatible alias used by older sheet formulas.
 *
 * @customfunction
 */
function STATE_ADJUST(amount, taxTreatment, extra) {
  return STATE_TAX_ADJUST(amount, taxTreatment, extra);
}

function CA_TAX_2025_MFJ(taxableIncome) {
  taxableIncome = Number(taxableIncome);
  if (!isFinite(taxableIncome) || taxableIncome <= 0) {
    return 0;
  }

  const brackets = [
    { max: 21512, rate: 0.010 },
    { max: 50998, rate: 0.020 },
    { max: 80490, rate: 0.040 },
    { max: 111732, rate: 0.060 },
    { max: 141212, rate: 0.080 },
    { max: 721318, rate: 0.093 },
    { max: 865574, rate: 0.103 },
    { max: 1442628, rate: 0.113 },
    { max: Number.POSITIVE_INFINITY, rate: 0.123 }
  ];

  let tax = 0;
  let prevMax = 0;

  for (let i = 0; i < brackets.length; i++) {
    const b = brackets[i];
    if (taxableIncome <= prevMax) break;

    const incomeInBracket = Math.min(taxableIncome, b.max) - prevMax;
    if (incomeInBracket > 0) {
      tax += incomeInBracket * b.rate;
    }

    if (taxableIncome <= b.max) {
      break;
    }

    prevMax = b.max;
  }

  if (taxableIncome > 1000000) {
    tax += (taxableIncome - 1000000) * 0.01;
  }

  return tax;
}

function FED_TAX_2025_ORDINARY_API(taxableIncome, filingStatus) {
  taxableIncome = Number(taxableIncome);
  if (!isFinite(taxableIncome) || taxableIncome <= 0) return 0;

  filingStatus = normalizeFilingStatus(filingStatus || 'single');

  var json = callTaxApi({
    calc: 'FED_TAX_2025_ORDINARY',
    taxableIncome: taxableIncome,
    filingStatus: filingStatus
  });

  return Number(json.tax || 0);
}

function FED_TAX_2025_MFJ_API(taxableIncome) {
  return FED_TAX_2025_ORDINARY_API(taxableIncome, 'mfj');
}

function FED_PREF_TAX_2024_API(ordinaryTaxable, prefTaxable, filingStatus) {
  ordinaryTaxable = Number(ordinaryTaxable) || 0;
  prefTaxable = Number(prefTaxable) || 0;
  filingStatus = normalizeFilingStatus(filingStatus || 'single');

  if (prefTaxable <= 0) return 0;

  var json = callTaxApi({
    calc: 'FED_PREF_TAX_2024',
    ordinaryTaxable: ordinaryTaxable,
    prefTaxable: prefTaxable,
    filingStatus: filingStatus
  });

  return Number(json.tax || 0);
}

/**
 * Unified federal tax wrapper.
 * Sheet usage: =FED_TAX_API("FED_TAX_2025_COMBINED",150000,25000,"single",310000,50000)
 *
 * FED_TAX_2025_COMBINED currently supports filingStatus of mfj and single.
 * Pass MAGI and net investment income so the backend can calculate NIIT as part
 * of the total federal liability.
 */
function FED_TAX_API(calc, ordinaryTaxable, prefTaxable, filingStatus, magi, netInvestmentIncome) {
  calc = String(calc || 'FED_TAX_2025_COMBINED').toUpperCase();
  ordinaryTaxable = Number(ordinaryTaxable) || 0;
  prefTaxable = Number(prefTaxable) || 0;
  filingStatus = normalizeFilingStatus(filingStatus || 'mfj');
  magi = Number(magi) || 0;
  netInvestmentIncome = Number(netInvestmentIncome) || 0;

  if (calc === 'FED_TAX_2025_MFJ') {
    return FED_TAX_2025_MFJ_API(ordinaryTaxable);
  }

  if (calc === 'FED_TAX_2025_ORDINARY') {
    return FED_TAX_2025_ORDINARY_API(ordinaryTaxable, filingStatus);
  }

  if (calc === 'FED_PREF_TAX_2024') {
    return FED_PREF_TAX_2024_API(ordinaryTaxable, prefTaxable, filingStatus);
  }

  if (calc === 'FED_TAX_2025_COMBINED') {
    var json = callTaxApi({
      calc: 'FED_TAX_2025_COMBINED',
      ordinaryTaxable: ordinaryTaxable,
      prefTaxable: prefTaxable,
      filingStatus: filingStatus,
      magi: magi,
      netInvestmentIncome: netInvestmentIncome
    });
    return Number(json.tax || 0);
  }

  throw new Error('Unsupported calc: ' + calc);
}

function FED_PREF_TAX(ordinaryTaxable, prefTaxable, filingStatus) {
  ordinaryTaxable = Number(ordinaryTaxable) || 0;
  prefTaxable = Number(prefTaxable) || 0;
  if (prefTaxable <= 0) return 0;

  filingStatus = String(filingStatus || '').toLowerCase();

  var brackets = {
    single: { z0: 47025, z15: 518900 },
    mfj: { z0: 94050, z15: 583750 },
    mfs: { z0: 47025, z15: 291850 },
    hoh: { z0: 63000, z15: 551350 }
  };

  var b = brackets[filingStatus] || brackets.single;
  var TI = ordinaryTaxable + prefTaxable;
  var QDCG = prefTaxable;
  var taxableOrd = TI - QDCG;

  var amount0 = Math.max(0, Math.min(QDCG, b.z0 - taxableOrd));
  var baseFor15 = Math.max(taxableOrd, b.z0);
  var amount15 = Math.max(0, Math.min(QDCG - amount0, b.z15 - baseFor15));
  var amount20 = Math.max(0, QDCG - amount0 - amount15);

  return amount15 * 0.15 + amount20 * 0.20;
}

function onEdit(e) {
  const sheetName = 'investments';
  const outputCellA1 = 'F4';
  const prevCellA1 = 'J4';
  const deltaCellA1 = 'K4';

  const sheet = e.source.getSheetByName(sheetName);
  if (!sheet) return;

  const outputCell = sheet.getRange(outputCellA1);
  const prevCell = sheet.getRange(prevCellA1);
  const deltaCell = sheet.getRange(deltaCellA1);

  const newOutput = outputCell.getValue();
  const prevOutput = prevCell.getValue();

  if (prevOutput !== '' && !isNaN(prevOutput) && !isNaN(newOutput)) {
    const delta = newOutput - prevOutput;
    deltaCell.setValue(delta);
  }

  prevCell.setValue(newOutput);
}

function copyValuesOnly() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const source = sheet.getRange('G4');
  const target = sheet.getRange('L4');
  target.setValue(source.getValue());
}

function callLambda() {
  return callTaxApi({
    calc: 'FED_TAX_2025_COMBINED',
    ordinaryTaxable: 150000,
    prefTaxable: 25000,
    filingStatus: 'single',
    magi: 310000,
    netInvestmentIncome: 50000
  });
}

function LAMBDA_MULTIPLY(value) {
  if (value === '' || value === null) {
    return 'Missing value';
  }

  try {
    return FED_TAX_2025_MFJ_API(value);
  } catch (err) {
    return 'Exception: ' + err;
  }
}

function STATE_TAX_2025_CA_MFJ_API(taxableIncome) {
  taxableIncome = Number(taxableIncome);
  if (!isFinite(taxableIncome) || taxableIncome <= 0) return 0;

  var json = callTaxApi({
    calc: 'STATE_TAX_2025_CA_MFJ',
    taxableIncome: taxableIncome
  });

  return Number(json.tax || 0);
}

function normalizeFilingStatus(filingStatus) {
  var fs = String(filingStatus || 'mfj').toLowerCase().trim();
  if (fs === 'married filing jointly' || fs === 'joint' || fs === 'married joint') return 'mfj';
  if (fs === 'married filing separately') return 'mfs';
  if (fs === 'head of household') return 'hoh';
  if (fs === 'single' || fs === 'individual') return 'single';
  return fs;
}

function socialSecurityThresholds(filingStatus) {
  var fs = normalizeFilingStatus(filingStatus);

  if (fs === 'mfj') {
    return { base1: 32000, base2: 44000, bandCap: 6000 };
  }

  if (fs === 'single' || fs === 'hoh') {
    return { base1: 25000, base2: 34000, bandCap: 4500 };
  }

  // Conservative default for MFS. The actual IRS result can depend on living-apart status.
  return { base1: 0, base2: 0, bandCap: 0 };
}

/**
 * Estimates the taxable portion of Social Security using the standard provisional-income thresholds.
 *
 * Inputs:
 *  - ssIncome: total Social Security benefits
 *  - otherIncome: income included in provisional income other than SS and muni interest
 *  - muniBondIncome: tax-exempt interest, including muni-bond income
 *  - filingStatus: single, mfj, mfs, hoh
 *
 * @customfunction
 */
function TAXABLE_SS(ssIncome, otherIncome, muniBondIncome, filingStatus) {
  var ss = Number(ssIncome) || 0;
  var other = Number(otherIncome) || 0;
  var muni = Number(muniBondIncome) || 0;
  if (ss <= 0) return 0;

  var thresholds = socialSecurityThresholds(filingStatus);
  var provisionalIncome = other + muni + (0.5 * ss);

  if (provisionalIncome <= thresholds.base1) {
    return 0;
  }

  if (provisionalIncome <= thresholds.base2) {
    return Math.min(0.5 * ss, 0.5 * (provisionalIncome - thresholds.base1));
  }

  var aboveSecondBand = 0.85 * (provisionalIncome - thresholds.base2);
  var carryFromFirstBand = Math.min(thresholds.bandCap, 0.5 * ss);
  return Math.min(0.85 * ss, aboveSecondBand + carryFromFirstBand);
}

/**
 * Returns MAGI and net investment income inputs for the NIIT-capable federal tax API.
 *
 * Output spills across 3 cells:
 *  1. MAGI for NIIT purposes
 *  2. Net investment income
 *  3. Taxable Social Security used in the MAGI estimate
 *
 * Example:
 * =NIIT_INPUTS_FROM_BUCKETS(2000,120000,40000,3000,22000,15000,"mfj")
 *
 * @customfunction
 */
function NIIT_INPUTS_FROM_BUCKETS(muniBondIncome, regularIncome, ssIncome, ordinaryDividends, qualifiedDividends, longTermCapitalGains, filingStatus) {
  var muni = Number(muniBondIncome) || 0;
  var regular = Number(regularIncome) || 0;
  var ss = Number(ssIncome) || 0;
  var ordinaryDiv = Number(ordinaryDividends) || 0;
  var qualifiedDiv = Number(qualifiedDividends) || 0;
  var ltcg = Number(longTermCapitalGains) || 0;

  var otherIncomeForSs = regular + ordinaryDiv + qualifiedDiv + ltcg;
  var taxableSs = TAXABLE_SS(ss, otherIncomeForSs, muni, filingStatus);

  var magi = regular + ordinaryDiv + qualifiedDiv + ltcg + taxableSs;
  var netInvestmentIncome = ordinaryDiv + qualifiedDiv + ltcg;

  return [[magi, netInvestmentIncome, taxableSs]];
}

/**
 * Convenience wrapper that computes MAGI + NII from your raw buckets and calls the combined federal API.
 *
 * Example:
 * =FED_TAX_FROM_BUCKETS(150000,25000,2000,120000,40000,3000,22000,15000,"mfj")
 *
 * Arguments:
 *  - ordinaryTaxable
 *  - prefTaxable
 *  - muniBondIncome
 *  - regularIncome
 *  - ssIncome
 *  - ordinaryDividends
 *  - qualifiedDividends
 *  - longTermCapitalGains
 *  - filingStatus
 *
 * @customfunction
 */
function FED_TAX_FROM_BUCKETS(ordinaryTaxable, prefTaxable, muniBondIncome, regularIncome, ssIncome, ordinaryDividends, qualifiedDividends, longTermCapitalGains, filingStatus) {
  var inputs = NIIT_INPUTS_FROM_BUCKETS(
    muniBondIncome,
    regularIncome,
    ssIncome,
    ordinaryDividends,
    qualifiedDividends,
    longTermCapitalGains,
    filingStatus
  );

  var magi = Number(inputs[0][0]) || 0;
  var netInvestmentIncome = Number(inputs[0][1]) || 0;

  return FED_TAX_API(
    'FED_TAX_2025_COMBINED',
    ordinaryTaxable,
    prefTaxable,
    filingStatus,
    magi,
    netInvestmentIncome
  );
}

/**
 * Convenience wrapper to return Federal + CA + Total + NIIT in one spill range.
 *
 * Returns 1x4 cells in this order:
 *  1) Federal tax
 *  2) CA state tax
 *  3) Combined tax
 *  4) NIIT component from federal response (if returned)
 *
 * Example:
 * =FED_STATE_TAX_API("mfj", 150000, 25000, 200000, 50000, 120000)
 *
 * @customfunction
 */
function FED_STATE_TAX_API(filingStatus, ordinaryTaxable, prefTaxable, magi, netInvestmentIncome, caTaxableIncome) {
  filingStatus = normalizeFilingStatus(filingStatus || 'mfj');
  ordinaryTaxable = Number(ordinaryTaxable) || 0;
  prefTaxable = Number(prefTaxable) || 0;
  magi = Number(magi) || 0;
  netInvestmentIncome = Number(netInvestmentIncome) || 0;
  caTaxableIncome = Number(caTaxableIncome) || 0;

  var federal = callTaxApi({
    calc: 'FED_TAX_2025_COMBINED',
    ordinaryTaxable: ordinaryTaxable,
    prefTaxable: prefTaxable,
    filingStatus: filingStatus,
    magi: magi,
    netInvestmentIncome: netInvestmentIncome
  });

  var state = callTaxApi({
    calc: 'STATE_TAX_2025_CA_MFJ',
    taxableIncome: caTaxableIncome
  });

  var federalTax = Number(federal.tax || 0);
  var stateTax = Number(state.tax || 0);
  var niit = Number(federal.niit || 0);
  return [[federalTax, stateTax, federalTax + stateTax, niit]];
}

function callWorkbookApi(payload) {
  return callTaxApi(payload);
}

function WORKBOOK_GET(workspaceId) {
  return callWorkbookApi({
    calc: "WORKBOOK_GET",
    workspaceId: String(workspaceId || "default")
  });
}

function WORKBOOK_GET_TAB(workspaceId, tabName) {
  return callWorkbookApi({
    calc: "WORKBOOK_GET_TAB",
    workspaceId: String(workspaceId || "default"),
    tabName: String(tabName || "")
  });
}

function WORKBOOK_SAVE_TAB(workspaceId, tabName, data) {
  return callWorkbookApi({
    calc: "WORKBOOK_SAVE_TAB",
    workspaceId: String(workspaceId || "default"),
    tabName: String(tabName || ""),
    data: data
  });
}

function WORKBOOK_SAVE(workspaceId, tabs, settings) {
  return callWorkbookApi({
    calc: "WORKBOOK_SAVE",
    workspaceId: String(workspaceId || "default"),
    tabs: tabs || {},
    settings: settings || {}
  });
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Workbook Sync')
    .addItem('Set Sync Token', 'SET_WORKBOOK_SYNC_TOKEN')
    .addItem('Repair Assets Column Formulas', 'REPAIR_ASSET_COLUMN_FORMULAS')
    .addItem('Export To Data Store', 'EXPORT_WORKBOOK_TO_DATASTORE')
    .addToUi();
}

function repairAssetColumnFormulas_(sheet) {
  if (!sheet) return 0;
  var formulas = sheet.getDataRange().getFormulas();
  var repaired = 0;
  var taxTreatmentColumns = [19, 20, 21]; // T:V, zero-based
  var assetClassColumn = 23; // X, zero-based

  for (var r = 0; r < formulas.length; r++) {
    for (var i = 0; i < taxTreatmentColumns.length; i++) {
      var taxColumn = taxTreatmentColumns[i];
      var taxFormula = String((formulas[r] && formulas[r][taxColumn]) || '');
      var repairedTaxFormula = taxFormula.replace(/CHOOSECOLS\(tickers,\s*1\),\s*0\),\s*4\)/gi, 'CHOOSECOLS(tickers,1), 0), 5)');
      if (repairedTaxFormula !== taxFormula) {
        sheet.getRange(r + 1, taxColumn + 1).setFormula(repairedTaxFormula);
        repaired++;
      }
    }

    var assetFormula = String((formulas[r] && formulas[r][assetClassColumn]) || '');
    var repairedAssetFormula = assetFormula.replace(/CHOOSECOLS\(tickers,\s*1\),\s*0\),\s*3\)/gi, 'CHOOSECOLS(tickers,1), 0), 4)');
    if (repairedAssetFormula !== assetFormula) {
      sheet.getRange(r + 1, assetClassColumn + 1).setFormula(repairedAssetFormula);
      repaired++;
    }
  }

  return repaired;
}

function REPAIR_ASSET_COLUMN_FORMULAS() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var investmentsSheet = getSheetByNames_(spreadsheet, ['investments', 'Investments']);
  var repaired = repairAssetColumnFormulas_(investmentsSheet);
  SpreadsheetApp.flush();
  spreadsheet.toast(repaired + ' shifted Assets lookup formula(s) repaired.', 'Workbook Sync', 8);
  return repaired;
}

function SET_WORKBOOK_SYNC_TOKEN() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt(
    'Workbook Sync Token',
    'Paste the sync token for the portfolio account that should own this spreadsheet export.',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  var token = response.getResponseText().trim();
  if (!token) {
    PropertiesService.getScriptProperties().deleteProperty(WORKBOOK_SYNC_TOKEN_PROPERTY);
    SpreadsheetApp.getActiveSpreadsheet().toast('Workbook sync token cleared.', 'Workbook Sync', 6);
    return;
  }

  PropertiesService.getScriptProperties().setProperty(WORKBOOK_SYNC_TOKEN_PROPERTY, token);
  SpreadsheetApp.getActiveSpreadsheet().toast('Workbook sync token saved.', 'Workbook Sync', 6);
}

function normalizeExportHeader_(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s-]/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function setExportRecordCell_(record, headerKey, columnNumber, value) {
  var columnKey = 'col_' + columnNumber;
  record[columnKey] = value;

  if (!headerKey) {
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(record, headerKey)) {
    record[headerKey] = value;
    return;
  }

  record[headerKey + '_' + columnNumber] = value;
}

function exportValueIsBlank_(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function exportNumber_(value) {
  var numeric = Number(String(value || '').replace(/[\$,]/g, '').trim());
  return isFinite(numeric) ? numeric : 0;
}

function firstExportValue_(record, keys) {
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (!exportValueIsBlank_(record[key])) {
      return record[key];
    }
  }
  return undefined;
}

function normalizeInvestmentExportRecord_(record) {
  var totalInvestment = firstExportValue_(record, ['totalInvestment', 'total_investment', 'total_inv', 'total_inv_amount', 'totalinvestment', 'inv', 'col_5']);
  var yearlyIncome = firstExportValue_(record, ['yearlyIncome', 'yearly_income', 'yr_inc', 'yearinc', 'yearly_income_amount', 'year', 'yr', 'col_6']);
  var monthlyIncome = firstExportValue_(record, ['monthlyIncome', 'monthly_income', 'mnth_inc', 'month_inc', 'mnth', 'month', 'monthly', 'col_7']);
  var includedYearlyIncome = firstExportValue_(record, ['filtered', 'filtered_income', 'included_income', 'col_17']);

  if ((exportValueIsBlank_(yearlyIncome) || exportNumber_(yearlyIncome) === 0) && exportNumber_(includedYearlyIncome) !== 0) {
    yearlyIncome = includedYearlyIncome;
  }
  if (exportValueIsBlank_(yearlyIncome) && !exportValueIsBlank_(monthlyIncome)) {
    yearlyIncome = exportNumber_(monthlyIncome) * 12;
  }
  if ((exportValueIsBlank_(monthlyIncome) || exportNumber_(monthlyIncome) === 0) && !exportValueIsBlank_(yearlyIncome)) {
    monthlyIncome = exportNumber_(yearlyIncome) / 12;
  }

  if (!exportValueIsBlank_(totalInvestment)) {
    record.total_inv = totalInvestment;
    record.totalInvestment = totalInvestment;
  }
  if (!exportValueIsBlank_(yearlyIncome)) {
    record.yr_inc = yearlyIncome;
    record.yearlyIncome = yearlyIncome;
  }
  if (!exportValueIsBlank_(monthlyIncome)) {
    record.mnth_inc = monthlyIncome;
    record.monthlyIncome = monthlyIncome;
  }
}

function exportRate_(value) {
  if (exportValueIsBlank_(value)) return undefined;
  var text = String(value).trim();
  var hasPercentSign = text.indexOf('%') >= 0;
  var numeric = Number(text.replace(/[\$,%]/g, '').trim());
  if (!isFinite(numeric)) return undefined;
  if (hasPercentSign || Math.abs(numeric) > 1) {
    return numeric / 100;
  }
  return numeric;
}

function exportLooksBoolean_(value) {
  var text = String(value || '').trim().toLowerCase();
  return text === 'true' || text === 'false' || text === 'yes' || text === 'no' || text === 'y' || text === 'n' || text === '1' || text === '0';
}

function exportBoolean_(value) {
  var text = String(value || '').trim().toLowerCase();
  return text === 'true' || text === 'yes' || text === 'y' || text === '1';
}

function normalizeTickerExportRecord_(record) {
  var symbol = firstExportValue_(record, ['symbol', 'ticker', 'asset', 'asset_id', 'col_1']);
  var percentReturn = exportRate_(firstExportValue_(record, ['percentReturn', 'percent_return', 'return', 'roi', 'dividend', 'col_2']));
  var incomeItem = firstExportValue_(record, ['incomeItem', 'income_item', 'income', 'is_income_item', 'income_ticker']);
  var hasIncomeItemColumn = !exportValueIsBlank_(incomeItem) || exportLooksBoolean_(record.col_3);
  if (exportValueIsBlank_(incomeItem) && hasIncomeItemColumn) {
    incomeItem = record.col_3;
  }
  var category = firstExportValue_(record, hasIncomeItemColumn ? ['category', 'asset_class', 'class', 'col_4', 'col_3'] : ['category', 'asset_class', 'class', 'col_3', 'col_4']);
  var taxTreatment = firstExportValue_(record, hasIncomeItemColumn ? ['taxTreatment', 'tax_treatment', 'tax_treatment_based_on_investment_type_not_account_type', 'tax_status', 'col_5', 'col_4'] : ['taxTreatment', 'tax_treatment', 'tax_treatment_based_on_investment_type_not_account_type', 'tax_status', 'col_4', 'col_5']);
  var extraData = firstExportValue_(record, hasIncomeItemColumn ? ['extraData', 'extra_data', 'extra_data_for_tax_calc_monthly_depreciation_amount', 'extra_tax_data', 'col_6', 'col_5'] : ['extraData', 'extra_data', 'extra_data_for_tax_calc_monthly_depreciation_amount', 'extra_tax_data', 'col_5', 'col_6']);
  var description = firstExportValue_(record, hasIncomeItemColumn ? ['description', 'desc', 'col_7', 'col_6'] : ['description', 'desc', 'col_6', 'col_7']);
  var exDividend = firstExportValue_(record, hasIncomeItemColumn ? ['exDividend', 'ex_dividend', 'ex_divided', 'ex_divided_8', 'ex_divided_7', 'col_8', 'col_7'] : ['exDividend', 'ex_dividend', 'ex_divided', 'ex_divided_7', 'col_7', 'col_8']);
  var divPayout = firstExportValue_(record, hasIncomeItemColumn ? ['divPayout', 'div_payout', 'payout', 'col_9', 'col_8'] : ['divPayout', 'div_payout', 'payout', 'col_8', 'col_9']);
  var normalizedSymbol = String(symbol || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  var normalizedCategory = String(category || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalizedSymbol === 'noninvestmentincome' || normalizedCategory === 'noninvestmentincome' || normalizedCategory === 'socialsecurity') {
    incomeItem = true;
  }

  if (!exportValueIsBlank_(symbol)) record.symbol = symbol;
  if (percentReturn !== undefined) {
    record.percent_return = percentReturn;
    record.percentReturn = percentReturn;
    record.dividend = percentReturn;
  }
  if (!exportValueIsBlank_(incomeItem)) {
    record.income_item = exportBoolean_(incomeItem);
    record.incomeItem = exportBoolean_(incomeItem);
  }
  if (!exportValueIsBlank_(category)) record.category = category;
  if (!exportValueIsBlank_(taxTreatment)) {
    record.tax_treatment = taxTreatment;
    record.taxTreatment = taxTreatment;
  }
  if (!exportValueIsBlank_(extraData)) {
    record.extra_data = extraData;
    record.extraData = extraData;
  }
  if (!exportValueIsBlank_(description)) record.description = description;
  if (!exportValueIsBlank_(exDividend)) {
    record.ex_dividend = exDividend;
    record.exDividend = exDividend;
  }
  if (!exportValueIsBlank_(divPayout)) {
    record.div_payout = divPayout;
    record.divPayout = divPayout;
  }
}

function normalizeCategoryExportRecord_(record) {
  var name = firstExportValue_(record, ['name', 'category', 'asset_class', 'assetclass', 'label', 'col_1']);
  if (!exportValueIsBlank_(name)) {
    record.name = name;
    record.category = name;
    record.label = name;
  }
}

function normalizeTaxTreatmentExportRecord_(record) {
  var label = firstExportValue_(record, ['label', 'tax_treatment', 'taxtreatment', 'tax_status', 'status', 'col_1']);
  if (!exportValueIsBlank_(label)) {
    record.label = label;
    record.tax_treatment = label;
  }
}

function normalizeAccountTaxTypeExportRecord_(record) {
  var taxStatus = firstExportValue_(record, ['tax_status', 'taxStatus', 'tax_category', 'account_tax_category', 'status', 'col_1']);
  if (!exportValueIsBlank_(taxStatus)) {
    record.tax_status = taxStatus;
    record.taxStatus = taxStatus;
  }
}

function inferExportAccountTypeTaxStatus_(name) {
  var key = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) return '';
  if (key.indexOf('w2') >= 0 || key.indexOf('wage') >= 0) return 'taxable';
  if (key.indexOf('401') >= 0 || key.indexOf('ira') >= 0) return 'deferred';
  if (key.indexOf('brokerage') >= 0) return 'taxable';
  return '';
}

function normalizeAccountTypeExportRecord_(record) {
  var name = firstExportValue_(record, ['name', 'accountType', 'account_type', 'accounttype', 'type', 'label', 'col_1']);
  var taxStatus = firstExportValue_(record, ['tax_status', 'taxStatus', 'tax_treatment', 'status', 'col_2']);
  if (!exportValueIsBlank_(name)) {
    record.name = name;
    record.accountType = name;
    record.account_type = name;
  }
  if (exportValueIsBlank_(taxStatus)) {
    taxStatus = inferExportAccountTypeTaxStatus_(name);
  }
  if (!exportValueIsBlank_(taxStatus)) {
    record.tax_status = taxStatus;
    record.taxStatus = taxStatus;
  }
}

function normalizeAccountExportRecord_(record) {
  var account = firstExportValue_(record, ['account', 'account_name', 'account_names', 'acct', 'accnt', 'col_1']);
  var accountType = firstExportValue_(record, ['account_type', 'accountType', 'accounttype', 'type', 'acct_type', 'col_2']);
  var taxStatus = firstExportValue_(record, ['tax_status', 'taxStatus', 'tax_treatment', 'status', 'col_3']);
  var dividendAccrued = firstExportValue_(record, ['dividend_accrued', 'dividendAccrued', 'dividend_accrual', 'col_4']);
  var excludeAfterTax = firstExportValue_(record, [
    'exclude_from_aftertax_income',
    'exclude_from_after_tax_income',
    'exclude_aftertax_income',
    'exclude_after_tax_income',
    'excluded_from_aftertax_income',
    'include_in_free_cashflow',
    'includeInFreeCashflow',
    'include_in_free_cash_flow',
    'include',
    'col_5'
  ]);

  if (!exportValueIsBlank_(account)) {
    record.account = account;
    record.account_name = account;
  }
  if (!exportValueIsBlank_(accountType)) {
    record.account_type = accountType;
    record.accountType = accountType;
  }
  if (!exportValueIsBlank_(taxStatus)) {
    record.tax_status = taxStatus;
    record.taxStatus = taxStatus;
  }
  if (!exportValueIsBlank_(dividendAccrued)) {
    record.dividend_accrued = dividendAccrued;
    record.dividendAccrued = dividendAccrued;
  }
  if (!exportValueIsBlank_(excludeAfterTax)) {
    var headerSaysExclude = !exportValueIsBlank_(firstExportValue_(record, [
      'exclude_from_aftertax_income',
      'exclude_from_after_tax_income',
      'exclude_aftertax_income',
      'exclude_after_tax_income',
      'excluded_from_aftertax_income'
    ]));
    var includeValue = headerSaysExclude ? !exportBoolean_(excludeAfterTax) : exportBoolean_(excludeAfterTax);
    record.include_in_free_cashflow = includeValue ? 'yes' : 'no';
    record.includeInFreeCashflow = includeValue ? 'yes' : 'no';
  }
}

function sheetToRowObjects_(sheet, normalizeRecord, options) {
  if (!sheet) return [];

  var values = sheet.getDataRange().getDisplayValues();
  if (!values || values.length < 2) return [];

  options = options || {};
  var headers = values[0].map(normalizeExportHeader_);
  var stopColumnIndex = typeof options.stopOnBlankColumn === 'number' ? options.stopOnBlankColumn : -1;
  var descIndex = headers.indexOf('desc');
  if (descIndex < 0) {
    descIndex = headers.indexOf('description');
  }
  var rows = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (stopColumnIndex >= 0 && String(row[stopColumnIndex] || '').trim() === '') {
      break;
    }
    if (descIndex >= 0) {
      var descValue = String(row[descIndex] || '').trim().toUpperCase();
      if (descValue === 'END') break;
    }

    var hasData = row.some(function(cell) {
      return String(cell || '').trim() !== '';
    });

    if (!hasData) continue;

    var record = {};
    for (var c = 0; c < headers.length; c++) {
      setExportRecordCell_(record, headers[c], c + 1, row[c]);
    }
    record.id = r + 1;
    record.spreadsheet_row_number = r + 1;
    record.spreadsheetRowNumber = r + 1;
    if (normalizeRecord) normalizeRecord(record);
    rows.push(record);
  }

  return rows;
}

function sheetToRowObjectsFromLine8UntilEndDescription_(sheet) {
  if (!sheet) return [];

  var values = sheet.getDataRange().getDisplayValues();
  if (!values || values.length < 8) return [];

  var primaryHeaderRowIndex = 4; // line 5 (canonical headers)
  var secondaryHeaderRowIndex = 6; // line 7 (short aliases)
  var dataStartIndex = 7; // line 8
  var primaryHeaders = values[primaryHeaderRowIndex].map(normalizeExportHeader_);
  var secondaryHeaders = values[secondaryHeaderRowIndex].map(normalizeExportHeader_);
  var primaryHasDesc = primaryHeaders.indexOf('description') >= 0 || primaryHeaders.indexOf('desc') >= 0;
  var headers = primaryHasDesc ? primaryHeaders : secondaryHeaders;
  var endSentinelIndex = headers.indexOf('description');
  if (endSentinelIndex < 0) {
    endSentinelIndex = headers.indexOf('desc');
  }
  if (endSentinelIndex < 0) {
    endSentinelIndex = 0; // fallback to first column (typically A / desc)
  }
  var rows = [];

  for (var r = dataStartIndex; r < values.length; r++) {
    var row = values[r];

    var sentinelValue = String(row[endSentinelIndex] || '').trim().toUpperCase();
    if (sentinelValue === 'END') {
      break;
    }

    var hasData = row.some(function(cell) {
      return String(cell || '').trim() !== '';
    });

    if (!hasData) continue;

    var record = {};
    for (var c = 0; c < headers.length; c++) {
      setExportRecordCell_(record, headers[c], c + 1, row[c]);
    }
    record.spreadsheet_row_number = r + 1;
    record.spreadsheetRowNumber = r + 1;

    // Normalize older/short column aliases into canonical keys expected by downstream apps.
    if (!record.total_inv && record.inv !== undefined) record.total_inv = record.inv;
    if (!record.yr_inc && record.yr !== undefined) record.yr_inc = record.yr;
    if (!record.symbol && record.symb !== undefined) record.symbol = record.symb;
    if (!record.new_symbol && record.n !== undefined) record.new_symbol = record.n;
    if (!record.new_percent && record.new !== undefined) record.new_percent = record.new;
    normalizeInvestmentExportRecord_(record);

    rows.push(record);
  }

  return rows;
}

function sheetToMatrix_(sheet) {
  if (!sheet) return [];

  var values = sheet.getDataRange().getDisplayValues();
  return values.filter(function(row) {
    return row.some(function(cell) {
      return String(cell || '').trim() !== '';
    });
  });
}

function sheetToFormulaSnapshot_(sheet) {
  if (!sheet) {
    return {
      sheetName: null,
      range: null,
      formulaCount: 0,
      formulaCells: []
    };
  }

  var range = sheet.getDataRange();
  var formulas = range.getFormulas();
  var formulasR1C1 = range.getFormulasR1C1();
  var values = range.getDisplayValues();
  var formulaCells = [];

  for (var r = 0; r < formulas.length; r++) {
    for (var c = 0; c < formulas[r].length; c++) {
      var formula = String(formulas[r][c] || '').trim();
      if (!formula) continue;

      formulaCells.push({
        a1: sheet.getRange(r + 1, c + 1).getA1Notation(),
        row: r + 1,
        column: c + 1,
        value: values[r][c],
        formula: formulas[r][c],
        formulaR1C1: formulasR1C1[r][c]
      });
    }
  }

  return {
    sheetName: sheet.getName(),
    range: range.getA1Notation(),
    formulaCount: formulaCells.length,
    formulaCells: formulaCells
  };
}

function getSheetByNames_(spreadsheet, names) {
  for (var i = 0; i < names.length; i++) {
    var sheet = spreadsheet.getSheetByName(names[i]);
    if (sheet) return sheet;
  }
  return null;
}

function parseExportString_(value) {
  if (exportValueIsBlank_(value)) return undefined;
  return String(value).trim();
}

function findExportRowValue_(rows, labels) {
  if (!rows) return undefined;
  var labelMap = {};
  for (var i = 0; i < labels.length; i++) {
    labelMap[String(labels[i]).trim().toLowerCase()] = true;
  }
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    for (var c = 0; c < row.length; c++) {
      var cell = String(row[c] || '').trim().toLowerCase();
      if (!labelMap[cell]) continue;
      for (var next = c + 1; next < row.length; next++) {
        if (!exportValueIsBlank_(row[next])) return row[next];
      }
    }
  }
  return undefined;
}

function exportFilingStatus_(value) {
  var text = String(value || '').trim().toLowerCase();
  if (!text) return undefined;
  if (text === 'mfj' || text.indexOf('joint') >= 0) return 'mfj';
  if (text === 'mfs' || text.indexOf('separate') >= 0) return 'mfs';
  if (text === 'hoh' || text.indexOf('head') >= 0) return 'hoh';
  if (text === 'single') return 'single';
  return text;
}

function exportDeductionMode_(value) {
  var text = String(value || '').trim().toLowerCase();
  if (!text) return undefined;
  if (text.indexOf('item') >= 0) return 'itemized';
  return 'standard';
}

function rowsToAmountTypeItems_(sheet, amountKeys, typeKeys, defaultType) {
  var rows = sheetToRowObjects_(sheet, null, { stopOnBlankColumn: 0 });
  var items = [];
  for (var i = 0; i < rows.length; i++) {
    var record = rows[i];
    var amount = firstExportValue_(record, amountKeys.concat(['amount', 'col_1']));
    var type = firstExportValue_(record, typeKeys.concat(['income_type', 'deduction_type', 'type', 'col_2']));
    if (exportValueIsBlank_(amount) && exportValueIsBlank_(type)) continue;
    items.push({
      id: Number(record.id) || i + 1,
      amount: exportNumber_(amount),
      incomeType: parseExportString_(type) || defaultType,
      deductionType: parseExportString_(type) || defaultType
    });
  }
  return items;
}

function buildFederalSettingsExport_(federalSheet, extraOrdinarySheet, extraPreferredSheet, aboveLineSheet, itemizedSheet) {
  var rows = sheetToMatrix_(federalSheet);
  var settings = {
    sheetName: federalSheet ? federalSheet.getName() : null,
    rows: rows
  };
  var filingStatus = exportFilingStatus_(findExportRowValue_(rows, ['Filing status', 'Filing Status']));
  var deductionMode = exportDeductionMode_(findExportRowValue_(rows, ['Deduction mode', 'Deduction Method', 'Federal deduction method']));
  var mortgageInterest = findExportRowValue_(rows, ['Mortgage interest', 'Mortgage Interest']);
  var propertyTax = findExportRowValue_(rows, ['Property tax', 'Property Tax']);
  var standardDeduction = findExportRowValue_(rows, ['Standard deduction', 'Standard Deduction']);
  var saltCap = findExportRowValue_(rows, ['SALT cap', 'SALT Cap']);
  var extraOrdinaryIncome = findExportRowValue_(rows, ['Extra ordinary income', 'Extra Ordinary Income']);
  var extraPreferredIncome = findExportRowValue_(rows, ['Extra preferred income', 'Extra Preferred Income']);

  if (filingStatus) settings.filingStatus = filingStatus;
  if (deductionMode) settings.deductionMode = deductionMode;
  if (!exportValueIsBlank_(mortgageInterest)) settings.mortgageInterest = exportNumber_(mortgageInterest);
  if (!exportValueIsBlank_(propertyTax)) settings.propertyTax = exportNumber_(propertyTax);
  if (!exportValueIsBlank_(standardDeduction)) settings.standardDeduction = exportNumber_(standardDeduction);
  if (!exportValueIsBlank_(saltCap)) settings.saltCap = exportNumber_(saltCap);
  if (!exportValueIsBlank_(extraOrdinaryIncome)) settings.extraOrdinaryIncome = exportNumber_(extraOrdinaryIncome);
  if (!exportValueIsBlank_(extraPreferredIncome)) settings.extraPreferredIncome = exportNumber_(extraPreferredIncome);

  var extraOrdinaryItems = rowsToAmountTypeItems_(extraOrdinarySheet, ['ordinary_amount'], ['ordinary_type'], 'W2 wages')
    .map(function(item) { return { id: item.id, amount: item.amount, incomeType: item.incomeType }; });
  var extraPreferredItems = rowsToAmountTypeItems_(extraPreferredSheet, ['preferred_amount'], ['preferred_type'], 'Long-term capital gains')
    .map(function(item) { return { id: item.id, amount: item.amount, incomeType: item.incomeType }; });
  var aboveLineItems = rowsToAmountTypeItems_(aboveLineSheet, ['deduction_amount'], ['deduction_type'], '')
    .map(function(item) { return { id: item.id, amount: item.amount, deductionType: item.deductionType }; });
  var deductionItems = rowsToAmountTypeItems_(itemizedSheet, ['deduction_amount'], ['deduction_type'], '')
    .map(function(item) { return { id: item.id, amount: item.amount, deductionType: item.deductionType }; });

  if (extraOrdinaryItems.length) settings.extraOrdinaryItems = extraOrdinaryItems;
  if (extraPreferredItems.length) settings.extraPreferredItems = extraPreferredItems;
  if (aboveLineItems.length) settings.aboveLineDeductionItems = aboveLineItems;
  if (deductionItems.length) settings.deductionItems = deductionItems;

  return settings;
}

function buildStateSettingsExport_(stateSheet) {
  var rows = sheetToMatrix_(stateSheet);
  var settings = {
    sheetName: stateSheet ? stateSheet.getName() : null,
    rows: rows
  };
  var stateCode = findExportRowValue_(rows, ['State', 'State code', 'State Code']);
  var extraStateIncome = findExportRowValue_(rows, ['Extra state income', 'Extra State Income']);
  var mortgageInterest = findExportRowValue_(rows, ['Mortgage interest', 'Mortgage Interest']);
  var propertyTax = findExportRowValue_(rows, ['Property tax', 'Property Tax']);
  var standardDeduction = findExportRowValue_(rows, ['Standard deduction', 'Standard Deduction']);

  if (!exportValueIsBlank_(stateCode)) settings.stateCode = String(stateCode).trim().slice(0, 2).toUpperCase();
  if (!exportValueIsBlank_(extraStateIncome)) settings.extraStateIncome = exportNumber_(extraStateIncome);
  if (!exportValueIsBlank_(mortgageInterest)) settings.mortgageInterest = exportNumber_(mortgageInterest);
  if (!exportValueIsBlank_(propertyTax)) settings.propertyTax = exportNumber_(propertyTax);
  if (!exportValueIsBlank_(standardDeduction)) settings.standardDeduction = exportNumber_(standardDeduction);

  return settings;
}

function collectWorkbookExportPayload_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  var investmentsSheet = getSheetByNames_(spreadsheet, ['investments', 'Investments']);
  var tickersSheet = getSheetByNames_(spreadsheet, ['Assets', 'assets', 'tickers', 'Tickers']);
  var categoriesSheet = getSheetByNames_(spreadsheet, ['Asset Classes', 'asset classes', 'Asset Class', 'asset class', 'categories', 'Categories']);
  var taxTreatmentSheet = getSheetByNames_(spreadsheet, ['tax treatment', 'Tax Treatment', 'tax-treatment', 'Tax-Treatment', 'tax_treatment', 'TaxTreatment', 'taxTreatment']);
  var accountsSheet = getSheetByNames_(spreadsheet, ['accounts', 'Accounts']);
  var accountTaxTypeSheet = getSheetByNames_(spreadsheet, ['Account Tax Category', 'account tax category', 'account tax type', 'Account Tax Type']);
  var accountTypeSheet = getSheetByNames_(spreadsheet, ['Account Type', 'account type', 'Account Types', 'account types']);
  var federalSheet = getSheetByNames_(spreadsheet, ['Federal Tax', 'federal tax']);
  var stateSheet = getSheetByNames_(spreadsheet, ['State Tax', 'state tax']);
  var plannerSheet = getSheetByNames_(spreadsheet, ['tax-calculator', 'Tax Calculator', 'tax calculator']);
  var extraOrdinarySheet = getSheetByNames_(spreadsheet, ['Federal Extra Ordinary Income', 'Extra Ordinary Income', 'extra ordinary income']);
  var extraPreferredSheet = getSheetByNames_(spreadsheet, ['Federal Extra Preferred Income', 'Extra Preferred Income', 'extra preferred income']);
  var aboveLineSheet = getSheetByNames_(spreadsheet, ['Federal Above Line Deductions', 'Above Line Deductions', 'Standard Deduction Deductions']);
  var itemizedSheet = getSheetByNames_(spreadsheet, ['Federal Itemized Deductions', 'Itemized Deductions', 'Deductions']);

  return {
    tabs: {
      investments: sheetToRowObjectsFromLine8UntilEndDescription_(investmentsSheet),
      tickers: sheetToRowObjects_(tickersSheet, normalizeTickerExportRecord_, { stopOnBlankColumn: 0 }),
      categories: sheetToRowObjects_(categoriesSheet, normalizeCategoryExportRecord_, { stopOnBlankColumn: 0 }),
      taxTreatment: sheetToRowObjects_(taxTreatmentSheet, normalizeTaxTreatmentExportRecord_, { stopOnBlankColumn: 0 }),
      accounts: sheetToRowObjects_(accountsSheet, normalizeAccountExportRecord_, { stopOnBlankColumn: 0 }),
      accountTaxType: sheetToRowObjects_(accountTaxTypeSheet, normalizeAccountTaxTypeExportRecord_, { stopOnBlankColumn: 0 }),
      accountType: sheetToRowObjects_(accountTypeSheet, normalizeAccountTypeExportRecord_, { stopOnBlankColumn: 0 })
    },
      settings: {
        federal: buildFederalSettingsExport_(federalSheet, extraOrdinarySheet, extraPreferredSheet, aboveLineSheet, itemizedSheet),
      state: buildStateSettingsExport_(stateSheet),
      planner: {
        sheetName: plannerSheet ? plannerSheet.getName() : null,
        rows: sheetToMatrix_(plannerSheet)
      },
      formulas: {
        exportedAt: new Date().toISOString(),
        sheets: {
          investments: sheetToFormulaSnapshot_(investmentsSheet),
          tickers: sheetToFormulaSnapshot_(tickersSheet),
          categories: sheetToFormulaSnapshot_(categoriesSheet),
          taxTreatment: sheetToFormulaSnapshot_(taxTreatmentSheet),
          accounts: sheetToFormulaSnapshot_(accountsSheet),
          accountTaxType: sheetToFormulaSnapshot_(accountTaxTypeSheet),
          accountType: sheetToFormulaSnapshot_(accountTypeSheet),
          federal: sheetToFormulaSnapshot_(federalSheet),
          state: sheetToFormulaSnapshot_(stateSheet),
          planner: sheetToFormulaSnapshot_(plannerSheet)
        }
      }
    }
  };
}

function EXPORT_WORKBOOK_TO_DATASTORE() {
  var workspaceId = 'default';
  REPAIR_ASSET_COLUMN_FORMULAS();
  var payload = collectWorkbookExportPayload_();
  var result = WORKBOOK_SAVE(workspaceId, payload.tabs, payload.settings);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Workbook exported to data store for workspace "' + workspaceId + '".',
    'Workbook Sync',
    8
  );

  return result;
}
