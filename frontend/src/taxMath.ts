export function isW2IncomeType(incomeType: string) {
  return String(incomeType || "").trim().toLowerCase() === "w2 wages";
}
