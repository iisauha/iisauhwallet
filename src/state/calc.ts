import type { CreditCard, LedgerData, PendingInboundItem, PendingOutboundItem } from './models';

export function formatCents(c: number): string {
  const n = Number(c);
  if (Number.isNaN(n)) return '$0.00';
  return (
    '$' +
    (n / 100)
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  );
}

export function parseCents(s: string): number {
  if (typeof s !== 'string') return 0;
  const cleaned = s.replace(/[$,]/g, '').trim();
  if (!cleaned) return 0;
  const num = parseFloat(cleaned);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

/** Parse a string to a finite number, returning fallback if NaN/Infinity. */
export function safeParseFloat(s: string, fallback = 0): number {
  const n = parseFloat(s.replace(/[$,]/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
}

export function sumBankTotalCents(data: LedgerData): number {
  return (data.banks || []).reduce((s, b) => s + (b.balanceCents || 0), 0);
}

export function sumCcDebtCents(cards: CreditCard[]): number {
  return (cards || []).reduce((s, c) => s + Math.max(c.balanceCents || 0, 0), 0);
}

export function sumCcCreditCents(cards: CreditCard[]): number {
  return (cards || []).reduce((s, c) => s + Math.max(-(c.balanceCents || 0), 0), 0);
}

export function sumPendingOutCents(pendingOut: PendingOutboundItem[]): number {
  return (pendingOut || []).reduce((s, p) => s + (p.amountCents || 0), 0);
}

export function sumPendingInCents(pendingIn: PendingInboundItem[]): number {
  return (pendingIn || []).reduce((s, p) => s + (p.amountCents || 0), 0);
}

export function formatLongLocalDate(dateISO: string): string {
  if (!dateISO) return '';
  const d = new Date(dateISO + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return dateISO;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function calcFinalNetCashCents(data: LedgerData): {
  bankTotalCents: number;
  ccDebtCents: number;
  ccCreditCents: number;
  pendingOutCents: number;
  /** Pending outbound that are NOT credit card payments (used for net cash). */
  pendingOutNonCcCents: number;
  /** Pending outbound that ARE credit card payments (bank → card transfers). */
  pendingCcPaymentCents: number;
  pendingInCents: number;
  finalNetCashCents: number;
} {
  const bankTotalCents = sumBankTotalCents(data);
  const ccDebtCents = sumCcDebtCents(data.cards || []);
  const ccCreditCents = sumCcCreditCents(data.cards || []);
  const allPendingOut = data.pendingOut || [];
  const pendingOutCents = sumPendingOutCents(allPendingOut);
  const pendingCcPaymentCents = sumPendingOutCents(allPendingOut.filter((p) => p.outboundType === 'cc_payment'));
  const pendingOutNonCcCents = pendingOutCents - pendingCcPaymentCents;
  const pendingInCents = sumPendingInCents(data.pendingIn || []);

  // For net cash, only subtract true outbound costs. Credit card payments are transfers
  // that pay down an already-counted card balance, so we exclude them here to avoid
  // double-counting the liability. CC credit (negative card balances) is excluded from
  // net cash so it is not counted as available money.
  const finalNetCashCents = bankTotalCents + pendingInCents - pendingOutNonCcCents - ccDebtCents;

  return {
    bankTotalCents,
    ccDebtCents,
    ccCreditCents,
    pendingOutCents,
    pendingOutNonCcCents,
    pendingCcPaymentCents,
    pendingInCents,
    finalNetCashCents
  };
}

export function toLocalDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

export function parseLocalDateKey(key: string) {
  if (typeof key !== 'string' || !key) return new Date(NaN);
  const parts = key.split('-').map(Number);
  if (parts.length !== 3) return new Date(NaN);
  const [y, m, d] = parts;
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return new Date(NaN);
  return new Date(y, m - 1, d);
}

export function addDaysLocal(date: Date, days: number) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonthsPreserveDay(startDate: Date, currentDate: Date, months: number) {
  const base = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const targetMonthIndex = currentDate.getMonth() + months;
  const targetYear = currentDate.getFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12 + 12) % 12;
  const baseDay = base.getDate();
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(baseDay, lastDay);
  return new Date(targetYear, targetMonth, day);
}

export function addYearsPreserveDay(startDate: Date, currentDate: Date, years: number) {
  const base = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const targetYear = currentDate.getFullYear() + years;
  const targetMonth = base.getMonth();
  const baseDay = base.getDate();
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(baseDay, lastDay);
  return new Date(targetYear, targetMonth, day);
}

export function recurringIntervalDays(r: any) {
  return typeof r.intervalDays === 'number' && r.intervalDays > 0
    ? r.intervalDays
    : typeof r.everyNDays === 'number' && r.everyNDays > 0
      ? Math.floor(r.everyNDays)
      : 1;
}

export type RecurringExpenseOccurrence = {
  dateKey: string;
  amountCents: number;
  minCents: number | null;
  maxCents: number | null;
  recurringId: string;
  recurringName: string;
  autoPay: boolean;
  paymentSource?: string;
  paymentTargetId?: string;
  category?: string;
  subcategory?: string;
  isSplit: boolean;
  myPortionCents: number | null;
  fullAmountCents: number;
};

export type RecurringIncomeOccurrence = {
  id: string;
  expectedDate: string;
  amountCents: number;
  title: string;
  autoPay: boolean;
  paymentTargetId?: string;
  recurringId: string;
};

/** Filters for Upcoming: past-due stays visible until pending move or dismiss. */
export type UpcomingRecurringFilterOptions = {
  pendingIn?: PendingInboundItem[];
  pendingOut?: PendingOutboundItem[];
  dismissedKeys?: Set<string>;
  /** Past occurrences with dateKey >= today - maxPastDays; default 90 */
  maxPastDays?: number;
};

export function getRecurringOccurrencesInWindow(
  data: LedgerData,
  windowDays: number,
  loanAmountMap?: Record<string, number | null>,
  totalVisiblePaymentNowCents?: number | null,
  filterOpts?: UpcomingRecurringFilterOptions
): RecurringExpenseOccurrence[] {
  const today = new Date();
  const endDate = addDaysLocal(today, windowDays);
  const endKey = toLocalDateKey(endDate);
  const maxPastDays = filterOpts?.maxPastDays ?? 90;
  const pastCutoffKey = toLocalDateKey(addDaysLocal(today, -maxPastDays));
  const dismissed = filterOpts?.dismissedKeys ?? new Set();
  const pendingOut = filterOpts?.pendingOut ?? [];
  const result: RecurringExpenseOccurrence[] = [];
  if (!Array.isArray((data as any).recurring)) return result;
  (data as any).recurring.forEach((r: any) => {
    if (!r || !r.active) return;
    if ((r.type || 'expense') === 'income') return;
    const start = parseLocalDateKey(r.startDate);
    if (Number.isNaN(start.getTime())) return;
    const end = r.endDate ? parseLocalDateKey(r.endDate) : null;
    const freq = r.frequency || 'monthly';
    const nDays = freq === 'custom' || freq === 'every_n_days' ? recurringIntervalDays(r) : 0;
    let current: Date;
    if (freq === 'monthly' && r.useLastDayOfMonth) current = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    else current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    function advance() {
      if (freq === 'weekly') current = addDaysLocal(current, 7);
      else if (freq === 'biweekly') current = addDaysLocal(current, 14);
      else if (freq === 'yearly') current = addYearsPreserveDay(start, current, 1);
      else if (freq === 'custom' || freq === 'every_n_days') current = addDaysLocal(current, nDays);
      else if (freq === 'monthly' && r.useLastDayOfMonth) current = new Date(current.getFullYear(), current.getMonth() + 2, 0);
      else current = addMonthsPreserveDay(start, current, 1);
    }
    function resolveFullAmount(): number {
      if (loanAmountMap && r.useLoanEstimatedPayment) {
        if (r.linkedLoanId && loanAmountMap[r.linkedLoanId] != null) return loanAmountMap[r.linkedLoanId]!;
        if (!r.linkedLoanId && totalVisiblePaymentNowCents != null && totalVisiblePaymentNowCents > 0) return totalVisiblePaymentNowCents;
      }
      return r.expectedMinCents != null && r.expectedMaxCents != null
        ? Math.round((r.expectedMinCents + r.expectedMaxCents) / 2)
        : typeof r.amountCents === 'number'
          ? r.amountCents
          : 0;
    }
    function pushOccurrence(dateKey: string) {
      const isSplitRec = !!r.isSplit && typeof r.myPortionCents === 'number' && r.myPortionCents > 0;
      const fullAmount = resolveFullAmount();
      const amountCents = isSplitRec ? r.myPortionCents : fullAmount;
      const minCents = isSplitRec ? null : typeof r.expectedMinCents === 'number' ? r.expectedMinCents : null;
      const maxCents = isSplitRec ? null : typeof r.expectedMaxCents === 'number' ? r.expectedMaxCents : null;
      result.push({
        dateKey,
        amountCents,
        minCents,
        maxCents,
        recurringId: r.id,
        recurringName: r.name || 'Recurring',
        autoPay: !!r.autoPay,
        paymentSource: r.paymentSource,
        paymentTargetId: r.paymentTargetId,
        category: r.category,
        subcategory: r.subcategory,
        isSplit: isSplitRec,
        myPortionCents: isSplitRec ? r.myPortionCents : null,
        fullAmountCents: fullAmount
      });
    }
    const rid = r.id || '';
    let guard = 0;
    while (guard < 5000) {
      guard++;
      if (end && current > end) break;
      const dateKey = toLocalDateKey(current);
      if (dateKey > endKey) break;
      if (dateKey >= pastCutoffKey) {
        const regKey = rid + ':' + dateKey;
        const posted = !!(data as any).recurringPosted?.[regKey];
        const isDismissed = dismissed.has(`exp:${rid}:${dateKey}`);
        const hasPending = pendingOut.some(
          (p) => p.recurringId === rid && p.recurringDateKey === dateKey
        );
        if (!posted && !isDismissed && !hasPending) pushOccurrence(dateKey);
      }
      advance();
    }
  });
  return result;
}

export function getRecurringIncomeOccurrencesInWindow(
  data: LedgerData,
  windowDays: number,
  filterOpts?: UpcomingRecurringFilterOptions
): RecurringIncomeOccurrence[] {
  const today = new Date();
  const endDate = addDaysLocal(today, windowDays);
  const endKey = toLocalDateKey(endDate);
  const maxPastDays = filterOpts?.maxPastDays ?? 90;
  const pastCutoffKey = toLocalDateKey(addDaysLocal(today, -maxPastDays));
  const dismissed = filterOpts?.dismissedKeys ?? new Set();
  const pendingIn = filterOpts?.pendingIn ?? [];
  const result: RecurringIncomeOccurrence[] = [];
  if (!Array.isArray((data as any).recurring)) return result;
  (data as any).recurring.forEach((r: any) => {
    if (!r || r.type !== 'income') return;
    if (r.isActive === false) return;
    const start = parseLocalDateKey(r.startDate);
    if (Number.isNaN(start.getTime())) return;
    const end = r.endDate ? parseLocalDateKey(r.endDate) : null;
    const freq = r.frequency || 'monthly';
    const nDays = freq === 'custom' || freq === 'every_n_days' ? recurringIntervalDays(r) : 0;
    let current: Date;
    if (freq === 'monthly' && r.useLastDayOfMonth) current = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    else current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    function advance() {
      if (freq === 'weekly') current = addDaysLocal(current, 7);
      else if (freq === 'biweekly') current = addDaysLocal(current, 14);
      else if (freq === 'yearly') current = addYearsPreserveDay(start, current, 1);
      else if (freq === 'custom' || freq === 'every_n_days') current = addDaysLocal(current, nDays);
      else if (freq === 'monthly' && r.useLastDayOfMonth) current = new Date(current.getFullYear(), current.getMonth() + 2, 0);
      else current = addMonthsPreserveDay(start, current, 1);
    }
    const amountCents =
      r.expectedMinCents != null && r.expectedMaxCents != null
        ? Math.round((r.expectedMinCents + r.expectedMaxCents) / 2)
        : typeof r.amountCents === 'number'
          ? r.amountCents
          : 0;
    function pushIncome(dateKey: string) {
      result.push({
        id: 'rec:' + r.id + ':' + dateKey,
        expectedDate: dateKey,
        amountCents,
        title: r.name || 'Recurring income',
        autoPay: !!r.autoPay,
        paymentTargetId: r.paymentTargetId,
        recurringId: r.id
      });
    }
    const rid = r.id || '';
    let guard = 0;
    while (guard < 5000) {
      guard++;
      if (end && current > end) break;
      const dateKey = toLocalDateKey(current);
      if (dateKey > endKey) break;
      if (dateKey >= pastCutoffKey) {
        const regKey = rid + ':' + dateKey;
        const posted = !!(data as any).recurringPosted?.[regKey];
        const isDismissed = dismissed.has(`inc:${rid}:${dateKey}`);
        const hasPending = pendingIn.some(
          (p) => p.recurringId === rid && p.recurringDateKey === dateKey
        );
        if (!posted && !isDismissed && !hasPending) pushIncome(dateKey);
      }
      advance();
    }
  });
  return result;
}

