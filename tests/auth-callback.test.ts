import { describe, expect, test } from "vitest";
import { readAuthCallback } from "../frontend/src/authCallback";

describe("authentication callback", () => {
  test("reports denied login without requiring an authorization code", () => {
    expect(readAuthCallback("?error=access_denied&error_description=Sign-in+cancelled")).toEqual({ kind: "error", error: "Sign-in cancelled" });
  });
  test("recognizes codes and does not invent errors on ordinary app navigation", () => {
    expect(readAuthCallback("?code=example&state=nonce")).toEqual({ kind: "code", code: "example", state: "nonce" });
    expect(readAuthCallback("?tab=accounts")).toEqual({ kind: "none" });
  });
});
