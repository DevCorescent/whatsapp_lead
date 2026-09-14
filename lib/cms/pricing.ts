// Shared by the homepage pricing section and /pricing, so both quote the same figure.

/** "₹2,999" — Indian digit grouping, whole units. */
export function formatPlanPrice(currency: string, amount: number): string {
  return `${currency}${Math.round(amount).toLocaleString("en-IN")}`;
}

/** Monthly-equivalent price on annual billing. The discount is clamped to 0–90%. */
export function annualMonthlyPrice(price: number, discountPercent: number): number {
  const discount = Math.min(Math.max(discountPercent, 0), 90);
  return Math.round(price * (1 - discount / 100));
}
