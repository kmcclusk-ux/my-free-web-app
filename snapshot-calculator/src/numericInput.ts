export const MAX_SNAPSHOT_AMOUNT = 1_000_000_000_000;
export const MAX_SNAPSHOT_YIELD_PERCENT = 1_000;

export function snapshotNumber(value: unknown, maximum = MAX_SNAPSHOT_AMOUNT): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const cleaned = typeof value === "string" ? value.replace(/[$,%\s,]/g, "") : value;
  if (cleaned === "" || cleaned === ".") return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= maximum ? parsed : null;
}
