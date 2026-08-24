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

export function appendPortfolioActionContext(messages: PortfolioChatMessage[], snapshot: unknown): PortfolioChatMessage[] {
  const lastUserIndex = messages.map((message) => message.role).lastIndexOf("user");
  if (lastUserIndex < 0 || !isPortfolioActionRequest(messages[lastUserIndex].content)) return messages;

  const index = buildRowMatchingIndex(snapshot);
  const actionContext = `

<aftertaxus_action_execution_context>
You are translating the user's natural-language request into an action for the AfterTax US portfolio UI. Interpret the request semantically; do not search for the entire raw command as literal row text.

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
</aftertaxus_action_execution_context>`;

  return messages.map((message, index) => index === lastUserIndex
    ? { ...message, content: `${message.content}${actionContext}` }
    : message);
}
