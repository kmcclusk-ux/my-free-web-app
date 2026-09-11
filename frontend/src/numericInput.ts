export function toNumber(value: number | string | boolean | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  const str = String(value || "")
    .replace(/[$,]/g, "")
    .replace(/%/g, "")
    .trim();
  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatDollarInputValue(value: number | string | boolean | null | undefined) {
  const rawValue = String(value ?? "").replace(/[$,%\s]/g, "");
  if (rawValue === "" || rawValue === "-" || rawValue === "." || rawValue === "-.") return rawValue;
  const isNegative = rawValue.startsWith("-");
  const unsignedValue = isNegative ? rawValue.slice(1) : rawValue;
  const [integerPart = "", decimalPart] = unsignedValue.split(".");
  const formattedInteger = integerPart.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",") || "0";
  return `${isNegative ? "-" : ""}${formattedInteger}${decimalPart !== undefined ? `.${decimalPart}` : ""}`;
}
