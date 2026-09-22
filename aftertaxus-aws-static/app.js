const API_ENDPOINT = '/api/hello';
const QUICK_CALCULATOR_HANDOFF_KEY = 'aftertaxus-quick-calculator-handoff-v1';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
});

const elements = {
  income: document.querySelector('#income'),
  investmentIncome: document.querySelector('#investmentIncome'),
  stateCode: document.querySelector('#stateCode'),
  localityPanel: document.querySelector('#localityPanel'),
  localityId: document.querySelector('#localityId'),
  investmentTaxTreatment: document.querySelector('#investmentTaxTreatment'),
  filingStatus: document.querySelector('#filingStatus'),
  deductionMode: document.querySelector('#deductionMode'),
  standardDeduction: document.querySelector('#standardDeduction'),
  itemizedDeduction: document.querySelector('#itemizedDeduction'),
  incomeValue: document.querySelector('#incomeValue'),
  investmentValue: document.querySelector('#investmentValue'),
  incomeRangeValue: document.querySelector('#incomeRangeValue'),
  investmentIncomeRangeValue: document.querySelector('#investmentIncomeRangeValue'),
  stateValue: document.querySelector('#stateValue'),
  localValue: document.querySelector('#localValue'),
  filingStatusValue: document.querySelector('#filingStatusValue'),
  afterTaxValue: document.querySelector('#afterTaxValue'),
  taxSummary: document.querySelector('#taxSummary'),
  openTaxReport: document.querySelector('#openTaxReport'),
  taxReportModal: document.querySelector('#taxReportModal'),
  taxReportContent: document.querySelector('#taxReportContent'),
  afterTaxScale: document.querySelector('#afterTaxScale'),
  grossBar: document.querySelector('#grossBar'),
  keepBar: document.querySelector('#keepBar'),
  grossBarValue: document.querySelector('#grossBarValue'),
  keepBarValue: document.querySelector('#keepBarValue'),
};

const taxConfig = {
  states: [],
  localities: [{ id: 'none', locality: 'No local income tax', state: '', kind: 'none', residentRate: 0 }],
};

const standardDeductions2025 = {
  single: 15750,
  mfj: 31500,
  mfs: 15750,
  hoh: 23625,
};

const filingStatusLabels = {
  single: 'Single',
  mfj: 'Married filing jointly',
  mfs: 'Married filing separately',
  hoh: 'Head of household',
};

let requestSequence = 0;
let estimateTimer = 0;
let lastSuccessfulEstimate = null;
let chartScaleMax = 209000;
const estimateCache = new Map();

function numberValue(element) {
  return Number(element?.value || 0);
}

function setText(element, value) {
  if (element) element.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function postTaxCalculation(body) {
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json.error || json.message || 'Tax calculation failed.');
    error.status = response.status;
    throw error;
  }
  return json;
}

function stateLabel(profile) {
  if (!profile) return '';
  const noIncomeTax = Array.isArray(profile.single) && profile.single.length === 0;
  return `${profile.code} - ${profile.name}${noIncomeTax ? ' (no individual income tax)' : ''}`;
}

function localityLabel(profile) {
  if (!profile || profile.id === 'none') return 'No local income tax';
  const rate = Number(profile.residentRate || 0);
  const rateText = profile.kind === 'progressive'
    ? 'progressive'
    : profile.kind === 'state-surcharge'
      ? `${percent.format(rate)} of state tax`
      : percent.format(rate);
  return `${profile.locality} (${rateText})`;
}

function populateStateDropdown() {
  if (!(elements.stateCode instanceof HTMLSelectElement) || taxConfig.states.length === 0) return;
  const selectedState = elements.stateCode.value || 'CA';
  elements.stateCode.innerHTML = taxConfig.states
    .map((profile) => `<option value="${profile.code}">${stateLabel(profile)}</option>`)
    .join('');
  elements.stateCode.value = taxConfig.states.some((profile) => profile.code === selectedState) ? selectedState : 'CA';
}

function populateLocalityDropdown() {
  if (!(elements.localityId instanceof HTMLSelectElement)) return;
  const selectedState = elements.stateCode?.value || 'CA';
  const selectedLocality = elements.localityId.value || 'none';
  const stateLocalities = taxConfig.localities
    .filter((profile) => profile.id !== 'none' && profile.state === selectedState);
  const options = taxConfig.localities
    .filter((profile) => profile.id === 'none' || profile.state === selectedState)
    .sort((left, right) => (left.id === 'none' ? -1 : right.id === 'none' ? 1 : left.locality.localeCompare(right.locality)));
  elements.localityId.innerHTML = options
    .map((profile) => `<option value="${profile.id}">${localityLabel(profile)}</option>`)
    .join('');
  elements.localityId.value = options.some((profile) => profile.id === selectedLocality) ? selectedLocality : 'none';
  if (elements.localityPanel instanceof HTMLElement) {
    elements.localityPanel.hidden = stateLocalities.length === 0;
  }
}

function selectedStateProfile() {
  return taxConfig.states.find((profile) => profile.code === elements.stateCode?.value);
}

function selectedLocalityProfile() {
  return taxConfig.localities.find((profile) => profile.id === elements.localityId?.value) || taxConfig.localities[0];
}

function selectedFilingStatus() {
  return elements.filingStatus?.value || 'single';
}

function selectedDeductionMode() {
  return elements.deductionMode?.value === 'itemized' ? 'itemized' : 'standard';
}

function normalizeTaxTreatmentKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isReturnOfCapitalTaxTreatment(value) {
  return ['returnofcapital', 'hold'].includes(normalizeTaxTreatmentKey(value));
}

function isTaxFreeTaxTreatment(value) {
  return ['taxfree', 'taxexempt'].includes(normalizeTaxTreatmentKey(value)) || isReturnOfCapitalTaxTreatment(value);
}

function isSocialSecurityTaxTreatment(value) {
  return ['socialsecurity', 'ss85fed'].includes(normalizeTaxTreatmentKey(value));
}

function isSection1256TaxTreatment(value) {
  return ['section1256', 'index6040'].includes(normalizeTaxTreatmentKey(value));
}

function isW2TaxTreatment(value) {
  return ['w2income', 'wages', 'w2wages'].includes(normalizeTaxTreatmentKey(value));
}

function taxTreatmentRule(label) {
  const key = normalizeTaxTreatmentKey(label);
  const base = {
    ordinaryShare: 1,
    preferredShare: 0,
    stateRule: 'taxable',
    niitIncluded: true,
    localCategory: 'interest',
  };
  if (key === 'munibonds') return { ...base, ordinaryShare: 0, stateRule: 'taxable', niitIncluded: false, localCategory: 'interest' };
  if (isTaxFreeTaxTreatment(label)) return { ...base, ordinaryShare: 0, stateRule: 'exempt', niitIncluded: false, localCategory: '' };
  if (key === 'fedtaxfree') return { ...base, ordinaryShare: 0, stateRule: 'taxable', niitIncluded: false, localCategory: 'interest' };
  if (key === 'statetaxfree' || key === 'treasuryinterest' || key === 'ustreasuryinterest') return { ...base, stateRule: 'treasury-exempt' };
  if (isSection1256TaxTreatment(label)) return { ...base, ordinaryShare: 0.4, preferredShare: 0.6, localCategory: 'capitalGains' };
  if (['qualifieddiv', 'longtermgain'].includes(key)) return { ...base, ordinaryShare: 0, preferredShare: 1, localCategory: key === 'qualifieddiv' ? 'dividends' : 'capitalGains' };
  if (isSocialSecurityTaxTreatment(label)) return { ...base, ordinaryShare: 0, stateRule: 'exempt', niitIncluded: false, localCategory: 'socialSecurity' };
  if (isW2TaxTreatment(label)) return { ...base, niitIncluded: false, localCategory: 'wages' };
  if (key === 'realestate') return { ...base, localCategory: 'rentalIncome' };
  if (key === 'nonqualifieddiv') return { ...base, localCategory: 'dividends' };
  if (key === 'shorttermgain') return { ...base, localCategory: 'capitalGains' };
  return base;
}

function selectedInvestmentTaxTreatment() {
  return elements.investmentTaxTreatment?.value || 'income';
}

function splitInvestmentIncome(amount) {
  const treatment = selectedInvestmentTaxTreatment();
  const rule = taxTreatmentRule(treatment);
  const ordinaryShare = Math.max(0, Math.min(1, Number(rule.ordinaryShare) || 0));
  const preferredShare = Math.max(0, Math.min(1, Number(rule.preferredShare) || 0));
  const scale = ordinaryShare + preferredShare > 1 ? 1 / (ordinaryShare + preferredShare) : 1;
  const ordinaryFederal = isSocialSecurityTaxTreatment(treatment) ? 0 : amount * ordinaryShare * scale;
  const preferredFederal = isSocialSecurityTaxTreatment(treatment) ? 0 : amount * preferredShare * scale;
  const stateTaxable = ['exempt', 'treasury-exempt'].includes(rule.stateRule) ? 0 : amount;
  const localBaseAmounts = {
    wages: 0,
    selfEmployment: 0,
    interest: 0,
    dividends: 0,
    capitalGains: 0,
    rentalIncome: 0,
    businessIncome: 0,
    retirementIncome: 0,
    socialSecurity: 0,
  };
  if (rule.localCategory && localBaseAmounts[rule.localCategory] !== undefined) {
    localBaseAmounts[rule.localCategory] = amount;
  }
  return {
    treatment,
    rule,
    ordinaryFederal,
    preferredFederal,
    stateTaxable,
    taxExemptInterest: rule.ordinaryShare === 0 && rule.preferredShare === 0 && rule.stateRule === 'taxable' ? amount : 0,
    socialSecurityBenefits: isSocialSecurityTaxTreatment(treatment) ? amount : 0,
    additionalW2Income: isW2TaxTreatment(treatment) ? amount : 0,
    netInvestmentIncome: rule.niitIncluded === false || isW2TaxTreatment(treatment) || isSocialSecurityTaxTreatment(treatment) ? 0 : amount,
    localBaseAmounts,
  };
}

function selectedStandardDeduction() {
  return standardDeductions2025[selectedFilingStatus()] || standardDeductions2025.single;
}

function updateDeductionControls() {
  const filingStatus = selectedFilingStatus();
  const deductionMode = selectedDeductionMode();
  const standardDeduction = selectedStandardDeduction();
  const itemizedAmount = numberValue(elements.itemizedDeduction);

  setText(elements.filingStatusValue, filingStatusLabels[filingStatus] || filingStatusLabels.single);
  if (elements.standardDeduction instanceof HTMLInputElement) {
    elements.standardDeduction.value = currency.format(standardDeduction);
    elements.standardDeduction.hidden = deductionMode !== 'standard';
  }

  if (elements.itemizedDeduction instanceof HTMLInputElement) {
    elements.itemizedDeduction.disabled = deductionMode !== 'itemized';
    elements.itemizedDeduction.hidden = deductionMode !== 'itemized';
  }
}

function updateChart(gross, keep) {
  const safeKeep = Math.max(Math.min(Number(keep) || 0, gross), 0);
  updateChartScale(gross);
  const grossPercent = gross > 0 ? 100 : 0;
  const keepPercent = chartScaleMax > 0 ? Math.max(Math.min((safeKeep / chartScaleMax) * 100, 100), safeKeep > 0 ? 2 : 0) : 0;
  setText(elements.grossBarValue, currency.format(gross));
  setText(elements.keepBarValue, currency.format(safeKeep));
  if (elements.grossBar) {
    elements.grossBar.style.width = '100%';
    elements.grossBar.style.height = `${grossPercent}%`;
  }
  if (elements.keepBar) {
    elements.keepBar.style.width = '100%';
    elements.keepBar.style.height = `${keepPercent}%`;
  }
}

function showPendingChart(gross) {
  updateChartScale(gross);
  const grossPercent = gross > 0 ? 100 : 0;
  setText(elements.grossBarValue, currency.format(gross));
  setText(elements.keepBarValue, 'Calculating...');
  if (elements.grossBar) {
    elements.grossBar.style.width = '100%';
    elements.grossBar.style.height = `${grossPercent}%`;
  }
  if (elements.keepBar) {
    elements.keepBar.style.width = '100%';
    elements.keepBar.style.height = '2%';
  }
}

function updateChartScale(gross) {
  const nextScaleMax = Math.max(Number(gross) || 0, 1);
  if (nextScaleMax !== chartScaleMax) {
    chartScaleMax = nextScaleMax;
    renderChartScale();
  } else if (!elements.afterTaxScale?.children.length) {
    renderChartScale();
  }
}

function renderChartScale() {
  if (!elements.afterTaxScale) return;
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  elements.afterTaxScale.innerHTML = ticks
    .map((tick) => {
      const value = chartScaleMax * tick;
      return `<div class="after-tax-scale__tick" style="bottom:${tick * 100}%"><span>${currency.format(value)}</span></div>`;
    })
    .join('');
}

function reportRow(label, value, detail = '') {
  return `
    <div class="tax-report-row">
      <dt>${escapeHtml(label)}</dt>
      <dd>
        <strong>${escapeHtml(value)}</strong>
        ${detail ? `<span>${escapeHtml(detail)}</span>` : ''}
      </dd>
    </div>
  `;
}

function renderTaxReport() {
  if (!elements.taxReportContent) return;
  if (!lastSuccessfulEstimate) {
    elements.taxReportContent.innerHTML = '<p>Run a calculation to view the full tax summary.</p>';
    return;
  }
  const { result, gross } = lastSuccessfulEstimate;
  const federal = result.federal || {};
  const state = result.state || {};
  const local = result.local || {};
  const payroll = result.payroll || {};
  const deductions = federal.deductions || {};
  const keep = Math.max(Number(result.afterTaxIncome || 0), 0);
  const totalTax = Math.max(Number(result.totalTax || 0), 0);
  const blendedRate = gross > 0 ? totalTax / gross : 0;
  const stateTax = Number(state.total ?? state.incomeTax ?? 0);
  const localTax = Number(local.tax || 0);
  const federalIncomeTax = Number(federal.incomeTax || 0);
  const federalPayrollTax = Number(payroll.federal?.total ?? federal.payrollTax ?? federal.ficaTax ?? 0);
  const statePayrollTax = Number(payroll.state?.total ?? state.payrollTax ?? 0);
  elements.taxReportContent.innerHTML = `
    <dl class="tax-report-grid">
      ${reportRow('Gross income', currency.format(gross), 'Ordinary income plus selected investment income.')}
      ${reportRow('Estimated after-tax amount', currency.format(keep), `${percent.format(gross > 0 ? keep / gross : 0)} of gross income.`)}
      ${reportRow('Total estimated tax', currency.format(totalTax), `Blended rate ${percent.format(blendedRate)}.`)}
      ${reportRow('Federal income tax', currency.format(federalIncomeTax), `Taxable income ${currency.format(Number(federal.taxableIncome || 0))}.`)}
      ${reportRow('Federal payroll tax', currency.format(federalPayrollTax), `W-2 wages ${currency.format(Number(payroll.wages || 0))}.`)}
      ${reportRow('State tax', currency.format(stateTax), `${state.stateName || result.stateName || elements.stateCode?.value || 'Selected state'}.`)}
      ${reportRow('Local tax', currency.format(localTax), local.enabled ? localityLabel(selectedLocalityProfile()) : 'No local income tax selected.')}
      ${reportRow('Federal deduction', currency.format(Number(deductions.total || deductions.standardOrItemizedDeduction || 0)), `${federal.deductionMode || selectedDeductionMode()} deduction mode.`)}
      ${reportRow('Investment treatment', selectedInvestmentTaxTreatment(), `${currency.format(numberValue(elements.investmentIncome))} of selected investment income.`)}
    </dl>
    <p class="tax-report-disclaimer">Educational estimate only. Not tax, legal, fiduciary, financial, or investment advice.</p>
  `;
}

function openTaxReport() {
  renderTaxReport();
  if (elements.taxReportModal instanceof HTMLElement) {
    elements.taxReportModal.hidden = false;
    elements.taxReportModal.querySelector('button')?.focus();
  }
}

function closeTaxReport() {
  if (elements.taxReportModal instanceof HTMLElement) {
    elements.taxReportModal.hidden = true;
  }
}

function buildTaxPlanRequest(gross, income, investmentIncome) {
  const locality = selectedLocalityProfile();
  const deductionMode = selectedDeductionMode();
  const itemizedAmount = numberValue(elements.itemizedDeduction);
  const investmentSplit = splitInvestmentIncome(investmentIncome);
  const federalOrdinaryIncome = income + investmentSplit.ordinaryFederal + investmentSplit.additionalW2Income;
  const stateGrossIncome = income + investmentSplit.additionalW2Income + investmentSplit.stateTaxable;
  const localBaseAmounts = {
    ...investmentSplit.localBaseAmounts,
    wages: investmentSplit.localBaseAmounts.wages + income,
  };
  return {
    calc: 'TAX_PLAN_2025',
    filingStatus: selectedFilingStatus(),
    state: elements.stateCode?.value || 'CA',
    ordinaryIncomeExcludingSocialSecurity: federalOrdinaryIncome,
    preferredIncome: investmentSplit.preferredFederal,
    socialSecurityBenefits: investmentSplit.socialSecurityBenefits,
    taxExemptInterest: investmentSplit.taxExemptInterest,
    netInvestmentIncome: investmentSplit.netInvestmentIncome,
    w2Income: income + investmentSplit.additionalW2Income,
    totalIncome: gross,
    displayIncome: gross,
    federalDeductionMode: deductionMode,
    federalItemizedDeductions: deductionMode === 'itemized'
      ? [{ amount: itemizedAmount, deductionType: 'Other itemized deduction' }]
      : [],
    stateGrossIncome,
    stateDeductionMode: deductionMode,
    stateItemizedDeductions: deductionMode === 'itemized'
      ? [{ amount: itemizedAmount, deductionType: 'Other itemized deduction' }]
      : [],
    local: {
      enabled: locality?.id !== 'none',
      localityId: locality?.id || 'none',
      residency: 'resident',
      taxableBaseAmounts: localBaseAmounts,
    },
  };
}

function currentInputs() {
  const income = numberValue(elements.income);
  const investmentIncome = numberValue(elements.investmentIncome);
  return { income, investmentIncome, gross: income + investmentIncome };
}

function renderSuccessfulEstimate(result, gross) {
  const keep = Math.max(Number(result.afterTaxIncome || 0), 0);
  const totalTax = Math.max(Number(result.totalTax || 0), 0);
  const blendedRate = gross > 0 ? totalTax / gross : 0;
  const state = result.state || {};
  const local = result.local || {};
  setText(elements.stateValue, state.stateName ? `${state.stateName}: ${currency.format(state.total || state.incomeTax || 0)}` : 'State calculation loaded');
  setText(elements.localValue, local.enabled ? `${localityLabel(selectedLocalityProfile())}: ${currency.format(local.tax || 0)}` : 'No local income tax');
  setText(elements.afterTaxValue, currency.format(keep));
  setText(elements.taxSummary, `Estimated taxes: ${currency.format(totalTax)} · blended rate ${percent.format(blendedRate)} · ${filingStatusLabels[selectedFilingStatus()]} · 2025 backend model`);
  updateChart(gross, keep);
  lastSuccessfulEstimate = { result, gross };
}

function renderCurrentInputs() {
  const { income, investmentIncome, gross } = currentInputs();
  updateDeductionControls();
  setText(elements.incomeValue, currency.format(income));
  setText(elements.investmentValue, currency.format(investmentIncome));
  setText(elements.grossBarValue, currency.format(gross));
  return { income, investmentIncome, gross };
}

function scheduleUpdateEstimate(delay = 250) {
  if (estimateTimer) window.clearTimeout(estimateTimer);
  renderCurrentInputs();
  estimateTimer = window.setTimeout(() => {
    estimateTimer = 0;
    updateEstimate();
  }, delay);
}

async function updateEstimate() {
  const sequence = ++requestSequence;
  const { income, investmentIncome, gross } = renderCurrentInputs();
  const requestBody = buildTaxPlanRequest(gross, income, investmentIncome);
  const cacheKey = JSON.stringify(requestBody);

  setText(elements.afterTaxValue, 'Calculating...');
  setText(elements.taxSummary, 'Using AfterTaxUS backend tax library; no login required.');
  if (lastSuccessfulEstimate) {
    updateChart(gross, lastSuccessfulEstimate.result.afterTaxIncome);
  } else {
    showPendingChart(gross);
  }

  try {
    const result = estimateCache.get(cacheKey) || await postTaxCalculation(requestBody);
    if (sequence !== requestSequence) return;
    estimateCache.set(cacheKey, result);
    renderSuccessfulEstimate(result, gross);
  } catch (error) {
    if (sequence !== requestSequence) return;
    const message = error instanceof Error ? error.message : 'Tax calculation failed.';
    if (lastSuccessfulEstimate) {
      renderSuccessfulEstimate(lastSuccessfulEstimate.result, gross);
      setText(elements.taxSummary, `${message} Showing the last successful estimate while the backend catches up.`);
    } else {
      setText(elements.afterTaxValue, 'Unavailable');
      setText(elements.taxSummary, `${message} The calculator did not use a local fallback.`);
      setText(elements.stateValue, 'Backend busy — retrying');
      setText(elements.localValue, 'Backend busy — retrying');
      showPendingChart(gross);
    }
    if (error?.status === 429 || error?.status >= 500) scheduleUpdateEstimate(1200);
  }
}

async function loadTaxConfig() {
  setText(elements.stateValue, 'Loading states...');
  setText(elements.localValue, 'Loading localities...');
  try {
    const config = await postTaxCalculation({ calc: 'TAX_CONFIG_2025' });
    taxConfig.states = Array.isArray(config.states) ? config.states : taxConfig.states;
    taxConfig.localities = Array.isArray(config.localities) ? config.localities : taxConfig.localities;
    populateStateDropdown();
    populateLocalityDropdown();
  } catch (error) {
    setText(elements.taxSummary, 'Could not load backend tax configuration. Try refreshing in a moment.');
  } finally {
    updateEstimate();
  }
}

[elements.income, elements.investmentIncome, elements.itemizedDeduction]
  .filter((element) => element instanceof HTMLInputElement)
  .forEach((element) => element.addEventListener('input', () => scheduleUpdateEstimate()));

document.querySelectorAll('[data-range-target][data-range-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const target = document.querySelector(`#${button.dataset.rangeTarget}`);
    if (!(target instanceof HTMLInputElement)) return;
    const currentMax = Number(target.max);
    const minimumMax = target.id === 'income' ? 50000 : 25000;
    const nextMax = button.dataset.rangeAction === 'increase'
      ? currentMax * 2
      : Math.max(minimumMax, currentMax / 2);
    target.max = String(nextMax);
    if (Number(target.value) > nextMax) target.value = String(nextMax);
    const rangeValue = target.id === 'income' ? elements.incomeRangeValue : elements.investmentIncomeRangeValue;
    setText(rangeValue, `Max ${currency.format(nextMax)}`);
    scheduleUpdateEstimate(0);
  });
});

if (elements.investmentTaxTreatment instanceof HTMLSelectElement) {
  elements.investmentTaxTreatment.addEventListener('change', () => scheduleUpdateEstimate(0));
}

if (elements.stateCode instanceof HTMLSelectElement) {
  elements.stateCode.addEventListener('change', () => {
    populateLocalityDropdown();
    scheduleUpdateEstimate(0);
  });
}

if (elements.localityId instanceof HTMLSelectElement) {
  elements.localityId.addEventListener('change', () => scheduleUpdateEstimate(0));
}

if (elements.filingStatus instanceof HTMLSelectElement) {
  elements.filingStatus.addEventListener('change', () => scheduleUpdateEstimate(0));
}

if (elements.deductionMode instanceof HTMLSelectElement) {
  elements.deductionMode.addEventListener('change', () => scheduleUpdateEstimate(0));
}

if (elements.openTaxReport instanceof HTMLButtonElement) {
  elements.openTaxReport.addEventListener('click', openTaxReport);
}

document.querySelectorAll('[data-close-tax-report]')
  .forEach((element) => element.addEventListener('click', closeTaxReport));

document.querySelectorAll('[data-quick-calculator-handoff]').forEach((link) => {
  link.addEventListener('click', () => {
    const payload = {
      version: 1,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
      ordinaryIncome: numberValue(elements.income),
      investmentIncome: numberValue(elements.investmentIncome),
      investmentTaxTreatment: selectedInvestmentTaxTreatment(),
      filingStatus: selectedFilingStatus(),
      deductionMode: selectedDeductionMode(),
      itemizedDeduction: numberValue(elements.itemizedDeduction),
      stateCode: elements.stateCode?.value || 'CA',
      localityId: elements.localityId?.value || 'none',
    };
    try {
      window.localStorage.setItem(QUICK_CALCULATOR_HANDOFF_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Quick calculator values could not be prepared for the full app.', error);
    }
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeTaxReport();
});

loadTaxConfig();

