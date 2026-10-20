export function normalizeSymbolFinderPattern(value: unknown) {
  const symbol = String(value || "").trim().toUpperCase();
  const wildcardIndex = symbol.indexOf("*");
  return wildcardIndex >= 0 ? `${symbol.slice(0, wildcardIndex)}*` : symbol;
}

export function parseSymbolFinderInput(value: unknown) {
  return String(value || "")
    .split(/[\s,;]+/)
    .map(normalizeSymbolFinderPattern)
    .filter(Boolean);
}

export function symbolMatchesFinderPatterns(symbol: unknown, patterns: readonly string[]) {
  const candidate = String(symbol || "").trim().toLowerCase();
  if (!candidate) return false;
  return patterns.some((pattern) => {
    const normalizedPattern = normalizeSymbolFinderPattern(pattern).toLowerCase();
    return normalizedPattern.endsWith("*")
      ? candidate.startsWith(normalizedPattern.slice(0, -1))
      : candidate === normalizedPattern;
  });
}
