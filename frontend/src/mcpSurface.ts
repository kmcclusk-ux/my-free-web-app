export type ModelSurfaceKey =
  | "investmentsIncome"
  | "assets"
  | "assetClasses"
  | "taxTreatments"
  | "accounts"
  | "accountTaxCategories"
  | "accountTypes"
  | "federalTax"
  | "stateTax"
  | "localTax";

export type ModelSurfaceTab =
  | "investments"
  | "federal"
  | "state"
  | "local"
  | "tickers"
  | "categories"
  | "taxTreatment"
  | "accounts"
  | "accountTaxType"
  | "accountType";

export type FocusedModelSurface = {
  surface: ModelSurfaceKey;
  tab: ModelSurfaceTab;
  action: "view" | "add" | "edit";
  recordId: number | null;
  editorKind: "investment" | "income" | null;
};

const surfaceAliases: Record<string, { surface: ModelSurfaceKey; tab: ModelSurfaceTab }> = {
  investmentsincome: { surface: "investmentsIncome", tab: "investments" },
  investments: { surface: "investmentsIncome", tab: "investments" },
  investment: { surface: "investmentsIncome", tab: "investments" },
  income: { surface: "investmentsIncome", tab: "investments" },
  assets: { surface: "assets", tab: "tickers" },
  asset: { surface: "assets", tab: "tickers" },
  tickers: { surface: "assets", tab: "tickers" },
  assetclasses: { surface: "assetClasses", tab: "categories" },
  categories: { surface: "assetClasses", tab: "categories" },
  taxtreatments: { surface: "taxTreatments", tab: "taxTreatment" },
  taxtreatment: { surface: "taxTreatments", tab: "taxTreatment" },
  accounts: { surface: "accounts", tab: "accounts" },
  account: { surface: "accounts", tab: "accounts" },
  accounttaxcategories: { surface: "accountTaxCategories", tab: "accountTaxType" },
  accounttaxtype: { surface: "accountTaxCategories", tab: "accountTaxType" },
  accounttypes: { surface: "accountTypes", tab: "accountType" },
  accounttype: { surface: "accountTypes", tab: "accountType" },
  investmenttype: { surface: "accountTypes", tab: "accountType" },
  federaltax: { surface: "federalTax", tab: "federal" },
  federal: { surface: "federalTax", tab: "federal" },
  statetax: { surface: "stateTax", tab: "state" },
  state: { surface: "stateTax", tab: "state" },
  localtax: { surface: "localTax", tab: "local" },
  local: { surface: "localTax", tab: "local" },
};

let latestToolSurface: FocusedModelSurface | null = null;

function normalizedKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function focusedSurfaceFromValues(values: Record<string, unknown> | null): FocusedModelSurface | null {
  if (!values) return null;
  const nestedUi = objectValue(values.ui);
  const rawSurface = values.surface ?? values.modelSurface ?? nestedUi?.surface;
  const match = surfaceAliases[normalizedKey(rawSurface)];
  if (!match) return null;

  const rawAction = normalizedKey(values.action ?? nestedUi?.action);
  const action = rawAction === "edit"
    ? "edit"
    : rawAction === "add" || rawAction === "create" || rawAction === "new"
      ? "add"
      : "view";
  const rawRecordId = values.recordId ?? values.id ?? nestedUi?.recordId;
  const numericRecordId = Number(rawRecordId);
  const recordId = rawRecordId !== undefined && rawRecordId !== null && String(rawRecordId).trim() !== "" && Number.isFinite(numericRecordId)
    ? numericRecordId
    : null;
  const rawEditorKind = normalizedKey(values.editorKind ?? nestedUi?.editorKind);
  const editorKind = rawEditorKind === "income" ? "income" : rawEditorKind === "investment" ? "investment" : null;

  return { ...match, action, recordId, editorKind };
}

export function parseFocusedModelSurface(search: string, toolOutput?: unknown): FocusedModelSurface | null {
  const output = objectValue(toolOutput);
  const fromTool = focusedSurfaceFromValues(output);
  if (fromTool) return fromTool;

  const params = new URLSearchParams(search);
  if (!params.has("surface") && !params.has("mcp_surface") && params.get("mcp_ui") !== "1") return null;
  return focusedSurfaceFromValues({
    surface: params.get("surface") ?? params.get("mcp_surface"),
    action: params.get("action"),
    recordId: params.get("recordId") ?? params.get("record_id") ?? params.get("id"),
    editorKind: params.get("editorKind") ?? params.get("editor_kind"),
  });
}

export function rememberFocusedModelSurface(toolOutput: unknown): FocusedModelSurface | null {
  latestToolSurface = parseFocusedModelSurface("", toolOutput);
  return latestToolSurface;
}

export function readFocusedModelSurface(): FocusedModelSurface | null {
  if (typeof window === "undefined") return null;
  const openai = (window as Window & { openai?: { toolOutput?: unknown } }).openai;
  return latestToolSurface || parseFocusedModelSurface(window.location.search, openai?.toolOutput);
}
