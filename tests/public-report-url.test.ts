import { describe, expect, test } from "vitest";
import { namespacedPublicReportSlug, publicUsernameForUser, resolvePublicUsername } from "../frontend/src/publicReportUrls";

describe("public report URLs", () => {
  test("uses the email username instead of a Cognito UUID", () => {
    expect(publicUsernameForUser({
      sub: "d8618310-6071-7086-fc3f-ed7359ac",
      username: "d8618310-6071-7086-fc3f-ed7359ac",
      email: "kmcclusk@gmail.com",
    })).toBe("kmcclusk");
  });

  test("prefers a non-opaque account username", () => {
    expect(publicUsernameForUser({
      sub: "d8618310-6071-7086-fc3f-ed7359ac",
      username: "Kevin.McCluskey",
      email: "different@example.com",
    })).toBe("kevin-mccluskey");
  });

  test("uses an entered username and otherwise keeps a saved username", () => {
    const user = { sub: "account-id", email: "email-user@example.com" };
    expect(resolvePublicUsername(user, "saved-user", "Entered User")).toBe("entered-user");
    expect(resolvePublicUsername(user, "saved-user", "")).toBe("saved-user");
    expect(resolvePublicUsername(user)).toBe("email-user");
  });

  test("builds the storage slug behind the public username route", () => {
    expect(namespacedPublicReportSlug("kmcclusk", "CA tax scenarios")).toBe("kmcclusk-ca-tax-scenarios");
  });
});
