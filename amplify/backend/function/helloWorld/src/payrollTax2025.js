"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isW2IncomeType = isW2IncomeType;
exports.calculateW2PayrollTaxForWorkers = calculateW2PayrollTaxForWorkers;
exports.calculateW2PayrollTax = calculateW2PayrollTax;
exports.getSupportedW2PayrollTaxStateCodes = getSupportedW2PayrollTaxStateCodes;
const taxProfiles2025_1 = require("./taxProfiles2025");
const SOCIAL_SECURITY_WAGE_BASE_2025 = 176100;
const SOCIAL_SECURITY_EMPLOYEE_RATE = 0.062;
const MEDICARE_EMPLOYEE_RATE = 0.0145;
const ADDITIONAL_MEDICARE_RATE = 0.009;
const HAWAII_TDI_WEEKLY_MAXIMUM_2025 = 7.21;
const ALL_STATE_AND_DC_CODES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
    "DC",
];
function additionalMedicareThreshold(filingStatus) {
    if (filingStatus === "mfj")
        return 250000;
    if (filingStatus === "mfs")
        return 125000;
    return 200000;
}
function cappedPayrollTax(wages, component) {
    const taxableWages = Math.min(Math.max(wages, 0), component.wageBase ?? Number.POSITIVE_INFINITY);
    const rawTax = taxableWages * component.rate;
    return Math.min(rawTax, component.maxTax ?? Number.POSITIVE_INFINITY);
}
const STATE_W2_PAYROLL_COMPONENTS_2025 = {
    AL: [],
    AK: [{ label: "AK employee unemployment insurance", rate: 0.005, wageBase: 51800 }],
    AZ: [],
    AR: [],
    CA: [{ label: "CA SDI", rate: 0.012 }],
    CO: [{ label: "CO FAMLI employee share", rate: 0.0045, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 }],
    CT: [{ label: "CT paid leave", rate: 0.005, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 }],
    DE: [
        { label: "DE paid parental leave employee share", rate: 0.0032, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 },
        { label: "DE paid medical leave employee share", rate: 0.004, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 },
        { label: "DE paid family caregiving leave employee share", rate: 0.0008, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 },
    ],
    FL: [],
    GA: [],
    HI: [{ label: "HI temporary disability insurance employee share", rate: 0.005 }],
    ID: [],
    IL: [],
    IN: [],
    IA: [],
    KS: [],
    KY: [],
    LA: [],
    ME: [{ label: "ME paid leave employee share", rate: 0.005, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 }],
    MD: [],
    MA: [{ label: "MA PFML employee share", rate: 0.0046, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 }],
    MI: [],
    MN: [],
    MS: [],
    MO: [],
    MT: [],
    NE: [],
    NV: [],
    NH: [],
    NJ: [
        { label: "NJ UI/WF/SWF employee share", rate: 0.003825, wageBase: 43200 },
        { label: "NJ temporary disability", rate: 0.0023, wageBase: 165400 },
        { label: "NJ family leave insurance", rate: 0.0033, wageBase: 165400 },
    ],
    NM: [],
    NY: [
        { label: "NY state disability insurance", rate: 0.005, maxTax: 31.2 },
        { label: "NY paid family leave", rate: 0.00388, maxTax: 354.53 },
    ],
    NC: [],
    ND: [],
    OH: [],
    OK: [],
    OR: [
        { label: "OR paid leave employee share", rate: 0.006, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 },
        { label: "OR statewide transit tax", rate: 0.001 },
    ],
    PA: [{ label: "PA employee unemployment withholding", rate: 0.0007 }],
    RI: [{ label: "RI temporary disability insurance", rate: 0.013, wageBase: 89200 }],
    SC: [],
    SD: [],
    TN: [],
    TX: [],
    UT: [],
    VT: [],
    VA: [],
    WA: [
        { label: "WA paid family and medical leave employee share", rate: 0.0092 * 0.7152, wageBase: SOCIAL_SECURITY_WAGE_BASE_2025 },
        { label: "WA Cares Fund", rate: 0.0058 },
    ],
    WV: [],
    WI: [],
    WY: [],
    DC: [],
};
function isW2IncomeType(incomeType) {
    return String(incomeType || "").trim().toLowerCase() === "w2 wages";
}
function requireNonnegativeAmount(value, field) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new RangeError(`${field} must be a finite nonnegative number.`);
    }
    return value;
}
function hawaiiTdiTax(wages, options, workerId, assumptions) {
    const component = STATE_W2_PAYROLL_COMPONENTS_2025.HI[0];
    for (const flag of [options?.covered, options?.employerPaid]) {
        if (flag !== undefined && typeof flag !== "boolean")
            throw new TypeError("HI TDI coverage and employerPaid must be boolean.");
    }
    if (options?.covered === false || options?.employerPaid === true)
        return { ...component, tax: 0, maxTax: 0, weeklyMaxTax: HAWAII_TDI_WEEKLY_MAXIMUM_2025 };
    if (options?.covered === undefined)
        assumptions.push(`${workerId}: HI TDI eligibility and employee participation assumed; confirm coverage.`);
    if (options?.weeklyWages !== undefined && options.weeksWorked !== undefined)
        throw new RangeError("Supply HI weeklyWages or weeksWorked, not both.");
    const weeks = options?.weeklyWages?.length ?? options?.weeksWorked ?? 52;
    if (!Number.isInteger(weeks) || weeks < 0 || weeks > 53 || (weeks === 0 && wages > 0)) {
        throw new RangeError("HI TDI requires 0 to 53 worked weeks, and positive wages require at least one week.");
    }
    const weeklyWages = options?.weeklyWages ?? Array.from({ length: weeks }, () => weeks > 0 ? wages / weeks : 0);
    const weeklyTotal = weeklyWages.reduce((total, amount) => total + requireNonnegativeAmount(amount, "HI weekly wages"), 0);
    if (Math.abs(weeklyTotal - wages) > 0.01)
        throw new RangeError("HI weekly wages must sum to the worker's state wages.");
    if (options?.weeklyWages === undefined && wages > 0) {
        assumptions.push(`${workerId}: HI TDI assumes wages spread evenly across ${weeks} weeks${options?.weeksWorked === undefined ? " (default full year)" : ""}; provide weeklyWages for uneven pay.`);
    }
    const premiums = options?.weeklyPremiums;
    if (premiums !== undefined && premiums.length !== weeks)
        throw new RangeError("HI weekly premiums must match the number of wage weeks.");
    if (premiums === undefined && wages > 0)
        assumptions.push(`${workerId}: HI TDI estimates the statutory maximum employee share; the half-premium limit is unknown.`);
    const tax = weeklyWages.reduce((total, weeklyWage, index) => {
        const halfPremium = premiums === undefined ? Number.POSITIVE_INFINITY : requireNonnegativeAmount(premiums[index], "HI weekly premium") / 2;
        return total + Math.min(weeklyWage * component.rate, HAWAII_TDI_WEEKLY_MAXIMUM_2025, halfPremium);
    }, 0);
    return { ...component, tax, maxTax: HAWAII_TDI_WEEKLY_MAXIMUM_2025 * weeks, weeklyMaxTax: HAWAII_TDI_WEEKLY_MAXIMUM_2025 };
}
function workerStateComponents(wages, stateCode, workerId, programs, assumptions) {
    if (programs.delawarePaidLeave !== undefined && stateCode !== "DE")
        throw new RangeError("Delaware paid leave requires DE state wages.");
    if (programs.hawaiiTdi !== undefined && stateCode !== "HI")
        throw new RangeError("Hawaii TDI requires HI state wages.");
    if (stateCode === "HI")
        return [hawaiiTdiTax(wages, programs.hawaiiTdi, workerId, assumptions)];
    let definitions = STATE_W2_PAYROLL_COMPONENTS_2025[stateCode];
    if (stateCode === "DE") {
        const paidLeave = programs.delawarePaidLeave;
        if (paidLeave === undefined) {
            if (wages > 0)
                assumptions.push(`${workerId}: DE paid leave omitted because coverage and employee share are unknown; this is not a verified exemption.`);
            return [];
        }
        if (!["none", "parental", "full"].includes(paidLeave.coverage))
            throw new RangeError("Invalid Delaware paid leave coverage.");
        const employeeShare = paidLeave.employeeShare ?? 0.5;
        requireNonnegativeAmount(employeeShare, "DE employee share");
        if (employeeShare > 0.5)
            throw new RangeError("DE employee share cannot exceed half of the program contribution.");
        if (paidLeave.coverage === "none")
            return [];
        if (paidLeave.employeeShare === undefined && wages > 0)
            assumptions.push(`${workerId}: DE employee share assumed at the maximum 50% of covered program cost; confirm the employer's election.`);
        definitions = (paidLeave.coverage === "parental" ? definitions.slice(0, 1) : definitions).map((component) => ({ ...component, rate: component.rate * employeeShare }));
    }
    return definitions.map((component) => ({ ...component, tax: cappedPayrollTax(wages, component) }));
}
function calculateW2PayrollTaxForWorkers(workerInputs, filingStatus, stateCodeInput, workerPrograms = {}) {
    const stateCode = (0, taxProfiles2025_1.getStateTaxProfile)(stateCodeInput).code;
    if (!["single", "mfj", "mfs", "hoh"].includes(filingStatus))
        throw new RangeError("Invalid payroll filing status.");
    const assumptions = ["Employee liability estimate only; employer withholding, excess-withholding credits and self-employment tax are not modeled."];
    const groupedWorkers = new Map();
    for (const input of workerInputs) {
        const workerId = typeof input.workerId === "string" ? input.workerId.trim() : "";
        if (!workerId)
            throw new RangeError("Every wage source requires a stable workerId; do not use a job or row identifier.");
        const amounts = {
            wages: requireNonnegativeAmount(input.wages, "wages"),
            socialSecurityWages: requireNonnegativeAmount(input.socialSecurityWages ?? input.wages, "socialSecurityWages"),
            medicareWages: requireNonnegativeAmount(input.medicareWages ?? input.wages, "medicareWages"),
            stateWages: requireNonnegativeAmount(input.stateWages ?? input.wages, "stateWages"),
        };
        if (input.socialSecurityWages === undefined || input.medicareWages === undefined || input.stateWages === undefined) {
            assumptions.push(`${workerId}: unspecified payroll wage bases use wages; confirm Social Security, Medicare and state-covered wages.`);
        }
        const worker = groupedWorkers.get(workerId) ?? { workerId, wages: 0, socialSecurityWages: 0, medicareWages: 0, stateWages: 0 };
        for (const key of ["wages", "socialSecurityWages", "medicareWages", "stateWages"]) {
            worker[key] = requireNonnegativeAmount(worker[key] + amounts[key], `Total ${key}`);
        }
        groupedWorkers.set(workerId, worker);
    }
    for (const workerId of Object.keys(workerPrograms)) {
        if (!groupedWorkers.has(workerId))
            throw new RangeError(`Payroll program facts reference unknown workerId: ${workerId}`);
    }
    if (stateCode !== "DE" && stateCode !== "HI") {
        assumptions.push(`${stateCode}: existing state program defaults assume employee participation; a complete 2025 program/none-applicable verification is outstanding.`);
    }
    assumptions.push("One state applies to all supplied state wages; multi-state sourcing and employer-specific insurance/refund rules are not modeled.");
    const workers = [...groupedWorkers.values()].map((worker) => {
        const programs = Object.prototype.hasOwnProperty.call(workerPrograms, worker.workerId) ? workerPrograms[worker.workerId] : {};
        const components = workerStateComponents(worker.stateWages, stateCode, worker.workerId, programs, assumptions);
        return {
            ...worker,
            federal: {
                socialSecurity: Math.min(worker.socialSecurityWages, SOCIAL_SECURITY_WAGE_BASE_2025) * SOCIAL_SECURITY_EMPLOYEE_RATE,
                medicare: worker.medicareWages * MEDICARE_EMPLOYEE_RATE,
            },
            state: { components, total: components.reduce((total, component) => total + component.tax, 0) },
        };
    });
    const wages = requireNonnegativeAmount(workers.reduce((total, worker) => total + worker.wages, 0), "Household wages");
    const medicareWages = requireNonnegativeAmount(workers.reduce((total, worker) => total + worker.medicareWages, 0), "Household Medicare wages");
    const socialSecurity = workers.reduce((total, worker) => total + worker.federal.socialSecurity, 0);
    const medicare = workers.reduce((total, worker) => total + worker.federal.medicare, 0);
    const additionalMedicare = Math.max(medicareWages - additionalMedicareThreshold(filingStatus), 0) * ADDITIONAL_MEDICARE_RATE;
    const federalTotal = socialSecurity + medicare + additionalMedicare;
    const stateComponents = workers.flatMap((worker) => worker.state.components.map((component) => ({ ...component, workerId: worker.workerId })));
    const stateTotal = stateComponents.reduce((total, component) => total + component.tax, 0);
    return {
        wages,
        federal: { socialSecurity, medicare, additionalMedicare, total: federalTotal },
        state: { stateCode, components: stateComponents, total: stateTotal },
        total: federalTotal + stateTotal,
        workers,
        assumptions: [...new Set(assumptions)],
        calculationKind: "employee-liability-estimate",
    };
}
function calculateW2PayrollTax(wagesInput, filingStatus, stateCodeInput, programs = {}) {
    const wages = Number.isFinite(Number(wagesInput)) ? Math.max(Number(wagesInput), 0) : 0;
    const result = calculateW2PayrollTaxForWorkers([{ workerId: "legacy-worker", wages }], filingStatus, stateCodeInput, { "legacy-worker": programs });
    result.assumptions.unshift("Legacy aggregate wages are treated as one worker; use calculateW2PayrollTaxForWorkers for multiple earners.");
    return result;
}
function getSupportedW2PayrollTaxStateCodes() {
    return [...ALL_STATE_AND_DC_CODES];
}
