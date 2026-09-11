import { resolveIncomeCalculationMode } from "../../mcp-server/src/portfolioIncome";

export type IncomeMode = "principal-yield" | "annual-income";
export type InvestmentFavorite = { name: string; investmentKeys: string[]; createdAt: string };
export type TaxWhatIfItem = { id: number; amount: number; incomeType: string };

export function resolveIncomeMode(input: { incomeMode?: IncomeMode; incomeItem?: boolean; assetType?: string; wageAccount?: boolean }): IncomeMode {
  return resolveIncomeCalculationMode(input) === "annualIncome" ? "annual-income" : "principal-yield";
}

export function proposedInvestmentRate(explicitRate: number | null | undefined, catalogRate: number | undefined, currentRate = 0) {
  return explicitRate ?? catalogRate ?? currentRate;
}

export function investmentAnnualIncome(mode: IncomeMode, principal: number, rate: number, enteredIncome: number) {
  return mode === "annual-income" ? enteredIncome : principal * rate;
}

function finiteAmount(value: unknown) {
  const amount = Number(typeof value === "string" ? value.replace(/[$,\s]/g, "") : value);
  return Number.isFinite(amount) ? amount : 0;
}

export function normalizeTaxWhatIfItems(raw: unknown, defaultType: string, legacyAmount = 0): TaxWhatIfItem[] {
  if (!Array.isArray(raw)) return [{ id: 1, amount: finiteAmount(legacyAmount), incomeType: defaultType }];
  return raw.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    return [{ id: Number(item.id) || index + 1, amount: finiteAmount(item.amount), incomeType: String(item.incomeType ?? "").trim() }];
  });
}

export function sumTaxWhatIfItems(items: readonly TaxWhatIfItem[] | undefined, legacyAmount = 0) {
  return Array.isArray(items) ? items.reduce((total, item) => total + (item.incomeType.trim() ? finiteAmount(item.amount) : 0), 0) : finiteAmount(legacyAmount);
}

function importedBoolean(value: unknown, field: string) {
  if (typeof value === "boolean") return value;
  const key = String(value).trim().toLowerCase();
  if (["yes", "true", "1", "y"].includes(key)) return true;
  if (["no", "false", "0", "n"].includes(key)) return false;
  throw new Error(`${field}: expected yes/no or a boolean.`);
}

export function accountCashflowInclusion(row: Record<string, unknown>): "yes" | "no" {
  const includeKeys = new Set(["includeinfreecashflow", "include"]);
  const excludeKeys = new Set(["excludefromaftertaxincome", "excludefromaftertax", "excludefromfreecashflow", "exclude"]);
  const values = Object.entries(row).flatMap(([field, value]) => {
    const key = field.toLowerCase().replace(/[^a-z0-9]/g, "");
    if ((!includeKeys.has(key) && !excludeKeys.has(key)) || value == null || String(value).trim() === "") return [];
    const checked = importedBoolean(value, field);
    return [{ field, included: excludeKeys.has(key) ? !checked : checked }];
  });
  if (values.some((value) => value.included !== values[0].included)) throw new Error(`Account inclusion: contradictory fields ${values.map((value) => value.field).join(", ")}.`);
  return (values[0]?.included ?? true) ? "yes" : "no";
}

export function investmentFavoritesError(raw: unknown): string | null {
  if (!Array.isArray(raw)) return "investmentFavorites: expected an array.";
  const names = new Set<string>();
  for (const [index, entry] of raw.entries()) {
    const field = `investmentFavorites[${index}]`;
    if (!entry || typeof entry !== "object") return `${field}: expected a favorite object.`;
    const favorite = entry as Record<string, unknown>;
    if (typeof favorite.name !== "string" || !favorite.name.trim()) return `${field}.name: expected a nonempty string.`;
    const nameKey = favorite.name.trim().toLowerCase();
    if (names.has(nameKey)) return `${field}.name: duplicate favorite name.`;
    names.add(nameKey);
    if (!Array.isArray(favorite.investmentKeys) || favorite.investmentKeys.some((key) => typeof key !== "string" || !/^(row\||rowhash:v1:).+/.test(key.trim()))) return `${field}.investmentKeys: expected row identity strings.`;
    if (favorite.createdAt !== undefined && (typeof favorite.createdAt !== "string" || !Number.isFinite(Date.parse(favorite.createdAt)))) return `${field}.createdAt: expected a date string.`;
  }
  return null;
}

export function normalizeInvestmentFavorites(raw: unknown): InvestmentFavorite[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (investmentFavoritesError([entry])) return [];
    const favorite = entry as InvestmentFavorite;
    return [{ name: favorite.name.trim(), investmentKeys: [...new Set(favorite.investmentKeys.map((key) => key.trim()))], createdAt: favorite.createdAt || "1970-01-01T00:00:00.000Z" }];
  });
}

export function incrementalInvestmentTax(current: { totalTax: number } | null, baseline: { totalTax: number } | null): number | null {
  return current && baseline ? current.totalTax - baseline.totalTax : null;
}

export class WorkbookSyncGuard {
  revision = 0;
  generation = 0;
  dirty = false;
  conflict = false;

  edited() {
    this.generation += 1;
    this.dirty = true;
  }

  canApplyRemote(generation: number) {
    return generation === this.generation && !this.dirty && !this.conflict;
  }

  loaded(revision = 0) {
    this.revision = revision;
    this.dirty = false;
    this.conflict = false;
  }

  saved(revision: number, generation: number) {
    this.revision = revision;
    if (generation === this.generation) this.dirty = false;
  }
}
