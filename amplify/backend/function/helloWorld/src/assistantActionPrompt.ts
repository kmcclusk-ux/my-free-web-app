import { existsSync, readFileSync } from "fs";
import { join } from "path";
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

function loadAfterTaxUsSkillPrompt() {
  const candidates = [
    join(__dirname, "skills", "aftertaxus-portfolio-model"),
    join(__dirname, "..", "skills", "aftertaxus-portfolio-model"),
  ];
  const skillRoot = candidates.find((candidate) => existsSync(join(candidate, "SKILL.md")));
  if (!skillRoot) throw new Error("AfterTax US assistant skill files are missing.");

  return [
    "SKILL.md",
    join("references", "model-layout.md"),
    join("references", "action-contract.md"),
  ].map((relativePath) => readFileSync(join(skillRoot, relativePath), "utf8").trim()).join("\n\n");
}

const AFTERTAXUS_SKILL_PROMPT = loadAfterTaxUsSkillPrompt();

export function appendPortfolioActionContext(messages: PortfolioChatMessage[], snapshot: unknown): PortfolioChatMessage[] {
  const lastUserIndex = messages.map((message) => message.role).lastIndexOf("user");
  if (lastUserIndex < 0 || !isPortfolioActionRequest(messages[lastUserIndex].content)) return messages;

  const index = buildRowMatchingIndex(snapshot);
  const currentModel = buildCurrentModelContext(snapshot);
  const actionContext = `

<aftertaxus_action_execution_context>
You are translating the user's natural-language request into an action for the AfterTax US portfolio UI. Interpret the request semantically; do not search for the entire raw command as literal row text.

${AFTERTAXUS_SKILL_PROMPT}

RUNTIME MODEL CONTEXT
The sections below contain live values supplied by the AfterTax US host for this request.

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
