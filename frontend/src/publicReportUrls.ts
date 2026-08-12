export type PublicReportUser = {
  sub: string;
  email?: string;
  name?: string;
  username?: string;
};

export function normalizePublicReportSlug(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{8,12}$/i.test(value.trim());
}

export function publicUsernameForUser(user: PublicReportUser | null) {
  const emailUsername = user?.email?.split("@")[0];
  const candidates = [user?.username, emailUsername, user?.name];

  for (const candidate of candidates) {
    if (!candidate || isUuidLike(candidate)) continue;
    const username = normalizePublicReportSlug(candidate).slice(0, 32);
    if (username) return username;
  }

  return "user";
}

export function resolvePublicUsername(
  user: PublicReportUser | null,
  savedUsername?: string,
  requestedUsername?: string
) {
  for (const candidate of [requestedUsername, savedUsername]) {
    const username = normalizePublicReportSlug(candidate).slice(0, 32);
    if (username) return username;
  }
  return publicUsernameForUser(user);
}

export function namespacedPublicReportSlug(username: string, scenarioSlug: string) {
  const cleanUsername = normalizePublicReportSlug(username).slice(0, 32);
  const cleanScenario = normalizePublicReportSlug(scenarioSlug).slice(0, Math.max(1, 79 - cleanUsername.length));
  return cleanUsername && cleanScenario ? `${cleanUsername}-${cleanScenario}` : "";
}
