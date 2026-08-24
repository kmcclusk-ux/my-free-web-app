export type InvestmentIdentityRow = {
  id: number;
  description?: unknown;
  account?: unknown;
  category?: unknown;
  totalInvestment?: unknown;
  yearlyIncome?: unknown;
  symbol?: unknown;
};

const ROW_HASH_PREFIX = "rowhash:v1:";

function normalizeIdentityText(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeIdentityNumber(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return String(Math.round(number * 1_000_000) / 1_000_000);
}

function fnv1a32(value: string, seed: number) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildInvestmentRowHash(row: InvestmentIdentityRow) {
  const canonicalRow = JSON.stringify([
    normalizeIdentityText(row.description),
    normalizeIdentityText(row.account),
    normalizeIdentityText(row.category),
    normalizeIdentityNumber(row.totalInvestment),
    normalizeIdentityNumber(row.yearlyIncome),
    normalizeIdentityText(row.symbol),
  ]);
  return `${ROW_HASH_PREFIX}${fnv1a32(canonicalRow, 0x811c9dc5)}${fnv1a32(canonicalRow, 0x9e3779b9)}`;
}

export function normalizeSelectedInvestmentHashes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? "").trim()).filter((entry) => entry.startsWith(ROW_HASH_PREFIX));
}

export function buildSelectedInvestmentHashes(rows: InvestmentIdentityRow[], selectedIds: number[]) {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  return selectedIds.map((id) => rowById.get(id)).filter((row): row is InvestmentIdentityRow => Boolean(row)).map(buildInvestmentRowHash);
}

export function resolveSelectedInvestmentIds(rows: InvestmentIdentityRow[], hashes: string[]) {
  const idsByHash = new Map<string, number[]>();
  rows.forEach((row) => {
    const hash = buildInvestmentRowHash(row);
    idsByHash.set(hash, [...(idsByHash.get(hash) || []), row.id]);
  });

  return hashes.flatMap((hash) => {
    const matchingIds = idsByHash.get(hash);
    const id = matchingIds?.shift();
    return id === undefined ? [] : [id];
  });
}
