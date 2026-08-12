export type SocialSecurityFilingStatus = "single" | "mfj" | "mfs" | "hoh";

export function calculateTaxableSocialSecurity(
  benefits: number,
  otherIncome: number,
  taxExemptInterest: number,
  filingStatus: SocialSecurityFilingStatus
) {
  const annualBenefits = Math.max(Number(benefits) || 0, 0);
  if (annualBenefits === 0) return 0;

  // MFS uses a zero base when spouses lived together during the year. The app
  // does not collect living-arrangement data, so this is the conservative case.
  const baseAmount = filingStatus === "mfj" ? 32000 : filingStatus === "mfs" ? 0 : 25000;
  const upperAmount = filingStatus === "mfj" ? 44000 : filingStatus === "mfs" ? 0 : 34000;
  const provisionalIncome = Math.max(Number(otherIncome) || 0, 0)
    + Math.max(Number(taxExemptInterest) || 0, 0)
    + annualBenefits * 0.5;

  if (provisionalIncome <= baseAmount) return 0;
  if (provisionalIncome <= upperAmount) {
    return Math.min(annualBenefits * 0.5, (provisionalIncome - baseAmount) * 0.5);
  }

  const lowerTierTaxable = Math.min(annualBenefits * 0.5, (upperAmount - baseAmount) * 0.5);
  return Math.min(annualBenefits * 0.85, (provisionalIncome - upperAmount) * 0.85 + lowerTierTaxable);
}
