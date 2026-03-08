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
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
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
  // double-counting the liability.
  const finalNetCashCents = bankTotalCents + pendingInCents - pendingOutNonCcCents - ccDebtCents + ccCreditCents;

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

export function getRecurringOccurrencesInWindow(
  data: LedgerData,
  windowDays: number,
  loanAmountMap?: Record<string, number | null>,
  totalVisiblePaymentNowCents?: number | null
): RecurringExpenseOccurrence[] {
  const today = new Date();
  const todayKey = toLocalDateKey(today);
  const endDate = addDaysLocal(today, windowDays);
  const endKey = toLocalDateKey(endDate);
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
    while (current < today && (!end || current <= end)) {
      const dateKey = toLocalDateKey(current);
      const regKey = (r.id || '') + ':' + dateKey;
      if (!r.autoPay && !(data as any).recurringPosted?.[regKey] && dateKey < todayKey) pushOccurrence(dateKey);
      advance();
    }
    while (current <= endDate && (!end || current <= end)) {
      const dateKey = toLocalDateKey(current);
      const regKey = (r.id || '') + ':' + dateKey;
      const handled = !!(data as any).recurringPosted?.[regKey];
      if (!handled && dateKey >= todayKey && dateKey <= endKey) pushOccurrence(dateKey);
      advance();
    }
  });
  return result;
}

export function getRecurringIncomeOccurrencesInWindow(data: LedgerData, windowDays: number): RecurringIncomeOccurrence[] {
  const today = new Date();
  const todayKey = toLocalDateKey(today);
  const endDate = addDaysLocal(today, windowDays);
  const endKey = toLocalDateKey(endDate);
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
    while (current < today && (!end || current <= end)) {
      const dateKey = toLocalDateKey(current);
      const regKey = (r.id || '') + ':' + dateKey;
      if (!r.autoPay && !(data as any).recurringPosted?.[regKey] && dateKey < todayKey) pushIncome(dateKey);
      advance();
    }
    while (current <= endDate && (!end || current <= end)) {
      const dateKey = toLocalDateKey(current);
      const regKey = (r.id || '') + ':' + dateKey;
      const handled = !!(data as any).recurringPosted?.[regKey];
      if (!handled && dateKey >= todayKey && dateKey <= endKey) pushIncome(dateKey);
      advance();
    }
  });
  return result;
}

