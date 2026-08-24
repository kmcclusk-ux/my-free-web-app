import { describe, expect, it } from "vitest";
import { appendPortfolioActionContext } from "../amplify/backend/function/helloWorld/src/assistantActionPrompt";

const snapshot = {
  holdings: [
    { id: 8, account: "Vanguard Brokerage", description: "Vanguard Total Stock Market", symbol: "VTI", category: "Stocks" },
    { id: 11, account: "Fidelity IRA", description: "Vanguard Total Bond Market", symbol: "BND", category: "Bonds" },
    { id: 14, account: "Fidelity IRA", description: "Fidelity Government Cash", symbol: "SPAXX", category: "Cash" },
  ],
  accounts: [{ id: 1, account: "Vanguard Brokerage" }, { id: 2, account: "Fidelity IRA" }],
};

describe("portfolio assistant action context", () => {
  it("appends detailed semantic row-selection guidance and live row values", () => {
    const result = appendPortfolioActionContext([
      { role: "user" as const, content: "select only the rows where the account is vangard" },
    ], snapshot);
    const content = result[0].content;
    expect(content).toContain("select only the rows where the account is vangard");
    expect(content).toContain("match holding.account");
    expect(content).toContain('"Vanguard Brokerage"');
    expect(content).toContain('"id":8');
    expect(content).toContain('"type":"selectRows"');
    expect(content).toContain('"vangard" should match "Vanguard"');
  });

  it("appends context only to the latest action request", () => {
    const messages = [
      { role: "user" as const, content: "What is my total income?" },
      { role: "assistant" as const, content: "Here is the total." },
      { role: "user" as const, content: "select only the vanguard rows" },
    ];
    const result = appendPortfolioActionContext(messages, snapshot);
    expect(result[0].content).toBe(messages[0].content);
    expect(result[1].content).toBe(messages[1].content);
    expect(result[2].content).toContain("aftertaxus_action_execution_context");
  });

  it("does not add action instructions to an informational request", () => {
    const messages = [{ role: "user" as const, content: "What is my largest holding?" }];
    expect(appendPortfolioActionContext(messages, snapshot)).toBe(messages);
  });
});
