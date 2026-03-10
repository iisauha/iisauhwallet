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
 * - Other: sum of monthly-equivalent amounts for category 'subscriptions'
 */
export function getOptimizerAutofillFromRecurring(recurring: RecurringItem[]): { rent_monthly: string; other_monthly: string } {
  const expenses = recurring.filter((r) => (r.type || 'expense') !== 'income');
  let rentCents = 0;
  let otherCents = 0;
  for (const r of expenses) {
    const cat = r.category || '';
    const monthly = toMonthlyCents(r.amountCents || 0, r.frequency || 'monthly');
    if (cat === 'rent') rentCents += monthly;
    if (cat === 'subscriptions') otherCents += monthly;
  }
  return {
    rent_monthly: rentCents > 0 ? (rentCents / 100).toFixed(2) : '',
    other_monthly: otherCents > 0 ? (otherCents / 100).toFixed(2) : '',
  };
}
