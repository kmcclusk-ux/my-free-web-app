import { describe, expect, test } from "vitest";
import { normalizeSymbolFinderPattern, parseSymbolFinderInput, symbolMatchesFinderPatterns } from "../frontend/src/symbolFinder";

describe("investment symbol finder", () => {
  test("parses multiple symbols and canonicalizes wildcard patterns", () => {
    expect(parseSymbolFinderInput("bil, vti*; brk.b")).toEqual(["BIL", "VTI*", "BRK.B"]);
    expect(normalizeSymbolFinderPattern(" brk*anything ")).toBe("BRK*");
  });

  test("keeps plain symbols exact and treats a trailing star as a prefix wildcard", () => {
    expect(symbolMatchesFinderPatterns("BIL", ["BIL"])).toBe(true);
    expect(symbolMatchesFinderPatterns("BILS", ["BIL"])).toBe(false);
    expect(symbolMatchesFinderPatterns("VTIP", ["vti*"])).toBe(true);
    expect(symbolMatchesFinderPatterns("VTIAX", ["VTI*"])).toBe(true);
    expect(symbolMatchesFinderPatterns("VOO", ["VTI*"])).toBe(false);
  });

  test("allows a star by itself to match every nonblank symbol", () => {
    expect(symbolMatchesFinderPatterns("SPY", ["*"])).toBe(true);
    expect(symbolMatchesFinderPatterns("", ["*"])).toBe(false);
  });
});
