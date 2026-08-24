import { describe, expect, it } from "vitest";
import { appendPortfolioActionContext } from "../amplify/backend/function/helloWorld/src/assistantActionPrompt";

const snapshot = {
  holdings: [
    { id: 8, account: "Vanguard Brokerage", description: "Vanguard Total Stock Market", symbol: "VTI", category: "Stocks" },
    { id: 11, account: "Fidelity IRA", description: "Vanguard Total Bond Market", symbol: "BND", category: "Bonds" },
    { id: 14, account: "Fidelity IRA", description: "Fidelity Government Cash", symbol: "SPAXX", category: "Cash" },
  ],
  accounts: [{ id: 1, account: "Vanguard Brokerage" }, { id: 2, account: "Fidelity IRA" }],
  settings: {
    federal: { filingStatus: "mfj", deductionMode: "standard" },
    state: { stateCode: "CA", deductionMode: "standard" },
    local: { enabled: false, localityId: "none" },
    planner: { federalWithholding: 1000, stateWithholding: 500 },
  },
  referenceTables: {
    tickers: [{ id: 1, symbol: "VTI", assetType: "ETF", category: "Stocks", taxTreatment: "qualified", percentReturn: 0.015 }],
    categories: [{ id: 1, name: "Stocks", includeInAllocation: true }],
    taxTreatment: [{ id: 1, label: "qualified", ordinaryShare: 0, preferredShare: 1, stateRule: "taxable", niitIncluded: true, localCategory: "dividends" }],
    accountTaxType: [{ id: 1, taxStatus: "taxable", includeInAllocation: true }],
    accountType: [{ id: 1, name: "Brokerage Account", taxStatus: "taxable", includeInAllocation: true }],
  },
};

describe("portfolio assistant action context", () => {
  it("appends detailed semantic row-selection guidance and live row values", () => {
    const result = appendPortfolioActionContext([
      { role: "user" as const, content: "select only the rows where the account is vangard" },
    ], snapshot);
    const content = result[0].content;
    expect(content).toContain("select only the rows where the account is vangard");
    expect(content).toContain("holding.account");
    expect(content).toContain('"Vanguard Brokerage"');
    expect(content).toContain('"id":8');
    expect(content).toContain('"type":"selectRows"');
    expect(content).toContain("`vangard` may match `Vanguard`");
    expect(content).toContain("AFTERTAX US COMPLETE MODEL LAYOUT");
    expect(content).toContain("name: aftertaxus-portfolio-model");
    expect(content).toContain("ChatGPT with an AfterTax US action tool/connector");
    expect(content).toContain("Investment.account -> Account.accountType -> Account Type.taxStatus");
    expect(content).toContain("Taxable-base categories: wages, selfEmployment, interest, dividends");
    expect(content).toContain('"filingStatus":"mfj"');
    expect(content).toContain('"ordinaryShare":0');
    expect(content).toContain('"name":"Brokerage Account"');
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
