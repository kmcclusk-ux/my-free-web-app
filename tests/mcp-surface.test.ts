import { describe, expect, it } from "vitest";
import { parseFocusedModelSurface } from "../frontend/src/mcpSurface";

describe("focused MCP model surfaces", () => {
  it("maps direct focused URLs to the existing frontend tabs", () => {
    expect(parseFocusedModelSurface("?mcp_ui=1&surface=assets&action=edit&recordId=42")).toEqual({
      surface: "assets",
      tab: "tickers",
      action: "edit",
      recordId: 42,
      editorKind: null,
    });
    expect(parseFocusedModelSurface("?surface=state-tax")).toMatchObject({ surface: "stateTax", tab: "state", action: "view" });
    expect(parseFocusedModelSurface("?surface=accountType")).toMatchObject({ surface: "accountTypes", tab: "accountType" });
  });

  it("prefers MCP structured content over URL parameters", () => {
    expect(parseFocusedModelSurface("?surface=federalTax", {
      surface: "taxTreatments",
      action: "edit",
      recordId: 8,
    })).toEqual({
      surface: "taxTreatments",
      tab: "taxTreatment",
      action: "edit",
      recordId: 8,
      editorKind: null,
    });
  });

  it("opens the existing add-income form when requested", () => {
    expect(parseFocusedModelSurface("", {
      surface: "investmentsIncome",
      action: "add",
      editorKind: "income",
    })).toEqual({
      surface: "investmentsIncome",
      tab: "investments",
      action: "add",
      recordId: null,
      editorKind: "income",
    });
  });

  it("ignores unrelated application URLs", () => {
    expect(parseFocusedModelSurface("?view=normal")).toBeNull();
  });
});
