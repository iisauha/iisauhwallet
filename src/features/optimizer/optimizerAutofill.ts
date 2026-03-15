import type { RecurringItem } from '../../state/models';

/** Convert recurring amount to monthly equivalent (cents). */
function toMonthlyCents(amountCents: number, frequency: RecurringItem['frequency']): number {
  switch (frequency) {
    case 'monthly':
      return amountCents;
    case 'weekly':
      return Math.round(amountCents * (52 / 12));
    case 'biweekly':
      return Math.round(amountCents * (26 / 12));
    case 'yearly':
      return Math.round(amountCents / 12);
    case 'every_n_days':
      return Math.round((amountCents * 30) / Math.max(1, 30)); // approximate: treat as monthly
    default:
      return amountCents;
  }
}

/**
 * Compute autofill values from recurring expenses:
 * - Rent: sum of monthly-equivalent amounts for category 'rent'
 * - Utilities: sum of 'Electricity + Gas' under category 'utilities'
 * - WiFi: sum of 'WiFi' under category 'utilities'
 * - Private Loans: sum of category 'loan_payment'
 */
export function getOptimizerAutofillFromRecurring(recurring: RecurringItem[]): {
  rent_monthly: string;
  utilities_monthly: string;
  wifi_monthly: string;
  private_loans_monthly: string;
} {
  const expenses = recurring.filter((r) => (r.type || 'expense') !== 'income');
  let rentCents = 0;
  let utilitiesCents = 0;
  let wifiCents = 0;
  let privateLoansCents = 0;
  for (const r of expenses) {
    const cat = r.category || '';
    const sub = r.subcategory || '';
    const monthly = toMonthlyCents(r.amountCents || 0, r.frequency || 'monthly');
    if (cat === 'rent') rentCents += monthly;
    if (cat === 'utilities' && sub === 'Electricity + Gas') utilitiesCents += monthly;
    if (cat === 'utilities' && sub === 'WiFi') wifiCents += monthly;
    if (cat === 'loan_payment') privateLoansCents += monthly;
  }
  return {
    rent_monthly: rentCents > 0 ? (rentCents / 100).toFixed(2) : '',
    utilities_monthly: utilitiesCents > 0 ? (utilitiesCents / 100).toFixed(2) : '',
    wifi_monthly: wifiCents > 0 ? (wifiCents / 100).toFixed(2) : '',
    private_loans_monthly: privateLoansCents > 0 ? (privateLoansCents / 100).toFixed(2) : '',
  };
}
