export function readAuthCallback(search: string) {
  const params = new URLSearchParams(search);
  const error = params.get("error_description") || params.get("error");
  if (error) return { kind: "error" as const, error };
  const code = params.get("code");
  return code ? { kind: "code" as const, code, state: params.get("state") } : { kind: "none" as const };
}
