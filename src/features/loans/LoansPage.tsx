import { useEffect, useMemo, useState } from 'react';
import { useLedgerStore } from '../../state/store';
import { formatCents } from '../../state/calc';
import { scheduleSnapCorrection } from '../../ui/carouselSnap';
import {
  loadLoans,
  saveLoans,
  savePrivatePaymentNowBase,
  loadLastRecomputeDate,
  applyRecomputeCycleToPrivateBalances,
  loadPaymentNowManualOverride,
  savePaymentNowManualOverride,
  loadLoansSectionShowPublic,
  saveLoansSectionShowPublic,
  loadLoansSectionShowPrivate,
  saveLoansSectionShowPrivate,
  type LoansState,
  type Loan,
  type FutureRepaymentPlan,
  type PaymentScheduleRange,
  type PrivatePaymentRange,
  type PrivatePaymentRangeMode,
  type LoanBorrowerType,
  type LoanStateOfResidency,
  uid,
  loadBirthdateISO,
} from '../../state/storage';
import { getDetectedAgiFromRecurring, getPrivatePaymentNowTotal, getLoanEstimatedPaymentNowMap, computeMonthlyInterestCents, computeProjectionMonthlyInterestCents } from './loanDerivation';
import type { RecurringItem } from '../../state/models';
import { useDialog } from '../../ui/DialogProvider';
import { Select } from '../../ui/Select';
import { Modal } from '../../ui/Modal';
import { AnimatedNumber } from '../../ui/AnimatedNumber';
import { IconPlus } from '../../ui/icons';
// PublicLoanSummaryStore and PublicLoanSimpleCard replaced by individual public loan records
import { syncLoansToSupabase, fetchLatestLedgerRows, type LedgerRow } from '../../state/loanSync';

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseDateISO(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeAgeFromBirthdate(birthdateISO: string | null, asOf: Date): number | null {
  if (!birthdateISO) return null;
  const d = parseDateISO(birthdateISO);
  if (!d) return null;
  let age = asOf.getFullYear() - d.getFullYear();
  const beforeBirthdayThisYear =
    asOf.getMonth() < d.getMonth() ||
    (asOf.getMonth() === d.getMonth() && asOf.getDate() < d.getDate());
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

function recurringAnnualIncomeCents(r: RecurringItem): number {
  if (!r || r.type !== 'income' || !r.amountCents) return 0;
  const amt = r.amountCents;
  const freq = r.frequency || 'monthly';
  if (freq === 'monthly') return amt * 12;
  if (freq === 'weekly') return Math.round(amt * 52);
  if (freq === 'biweekly') return Math.round(amt * 26);
  if (freq === 'yearly') return amt;
  const days =
    typeof r.intervalDays === 'number' && r.intervalDays > 0
      ? r.intervalDays
      : typeof r.everyNDays === 'number' && r.everyNDays > 0
        ? r.everyNDays
        : 30;
  return Math.round((amt * 365) / days);
}

/** Thin wrapper around shared private-loan monthly interest (loanDerivation). */
function computeInterestOnlyMonthlyCents(balanceCents: number, ratePercent: number): number {
  return computeMonthlyInterestCents(balanceCents, ratePercent);
}

function computeAmortizedPaymentCents(
  balanceCents: number,
  ratePercent: number,
  termMonths: number | undefined | null
): number | null {
  const n = termMonths && termMonths > 0 ? Math.round(termMonths) : 0;
  if (!(balanceCents > 0 && n > 0)) return null;
  const rMonthly = ratePercent / 100 / 12;
  const principal = balanceCents / 100;
  let paymentDollars: number;
  if (rMonthly <= 0) {
    paymentDollars = principal / n;
  } else {
    const pow = Math.pow(1 + rMonthly, n);
    paymentDollars = (principal * rMonthly * pow) / (pow - 1);
  }
  return Math.round(paymentDollars * 100);
}

/** Full repayment Payment(now) = single rounded amortized payment (avoids 1-cent drift). Breakdown fields for display only. */
function computeFullRepaymentBreakdown(
  balanceCents: number,
  ratePercent: number,
  termMonths: number
): { monthlyInterestCents: number; amortizedCents: number; principalPortionCents: number; fullRepaymentCents: number } {
  // Projection context: use rate/12 so breakdown is consistent with the amortization formula
  const monthlyInterestCents = computeProjectionMonthlyInterestCents(balanceCents, ratePercent);
  const amortizedCents = computeAmortizedPaymentCents(balanceCents, ratePercent, termMonths) ?? 0;
  const principalPortionCents = Math.max(0, amortizedCents - monthlyInterestCents);
  // Use single rounded amortized payment as full repayment to avoid 1-cent drift.
  const fullRepaymentCents = amortizedCents;
  return { monthlyInterestCents, amortizedCents, principalPortionCents, fullRepaymentCents };
}

function computeMonthsToPayoff(
  balanceCents: number,
  ratePercent: number,
  monthlyPaymentCents: number
): number | null {
  if (!(balanceCents > 0 && monthlyPaymentCents > 0)) return null;
  const rMonthly = ratePercent / 100 / 12;
  if (rMonthly <= 0) {
    return Math.ceil(balanceCents / monthlyPaymentCents);
  }
  // N = -ln(1 - r*P / A) / ln(1 + r)
  const P = balanceCents / 100;
  const A = monthlyPaymentCents / 100;
  const numeratorInner = 1 - (rMonthly * P) / A;
  if (numeratorInner <= 0 || numeratorInner >= 1) return null;
  const n = -Math.log(numeratorInner) / Math.log(1 + rMonthly);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.ceil(n);
}

const FAR_FUTURE_ISO = '2099-12-31';

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Effective ranges for a private loan: from stored ranges or one implicit from legacy fields. */
function getEffectivePrivateRanges(loan: Loan): PrivatePaymentRange[] {
  const ranges = loan.privatePaymentRanges;
  if (ranges && ranges.length > 0) {
    return [...ranges].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }
  const today = toDateKey(new Date());
  const mode = loan.privatePaymentMode ?? 'custom_monthly';
  return [
    {
      id: uid(),
      startDate: today,
      endDate: FAR_FUTURE_ISO,
      mode: mode as PrivatePaymentRangeMode,
      customPaymentCents: mode === 'custom_monthly' ? (loan.nextPaymentCents ?? undefined) : undefined
    }
  ];
}

function getActivePrivateRange(ranges: PrivatePaymentRange[], asOfISO: string): PrivatePaymentRange | null {
  for (const r of ranges) {
    if (asOfISO >= r.startDate && asOfISO <= r.endDate) return r;
  }
  return null;
}

/** First range with mode full_repayment and startDate > afterISO. */
function getFirstFutureFullRepaymentRange(ranges: PrivatePaymentRange[], afterISO: string): PrivatePaymentRange | null {
  for (const r of ranges) {
    if (r.mode === 'full_repayment' && r.startDate > afterISO) return r;
  }
  return null;
}

/** First future range that has a payment (custom, full_repayment, or interest_only). Used for hidden future/grace value. */
function getFirstFutureRepaymentRange(ranges: PrivatePaymentRange[], afterISO: string): PrivatePaymentRange | null {
  const sorted = [...ranges].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (const r of sorted) {
    if (r.startDate <= afterISO) continue;
    if (r.mode === 'deferred') continue;
    return r;
  }
  return null;
}

/** Earliest range with mode full_repayment (by start date). For payoff start. */
function getFirstFullRepaymentRange(ranges: PrivatePaymentRange[]): PrivatePaymentRange | null {
  let found: PrivatePaymentRange | null = null;
  for (const r of ranges) {
    if (r.mode !== 'full_repayment') continue;
    if (!found || r.startDate < found.startDate) found = r;
  }
  return found;
}

/** derivedTermMonths: from getRangeDerivedTermMonths(ranges). Used for full_repayment and not for interest_only. */
function paymentCentsFromPrivateRange(
  range: PrivatePaymentRange,
  balanceCents: number,
  ratePercent: number,
  derivedTermMonths: number
): number {
  switch (range.mode) {
    case 'deferred':
      return 0;
    case 'interest_only':
      return computeMonthlyInterestCents(balanceCents, ratePercent);
    case 'full_repayment':
      if (derivedTermMonths <= 0) return computeMonthlyInterestCents(balanceCents, ratePercent);
      const { fullRepaymentCents } = computeFullRepaymentBreakdown(balanceCents, ratePercent, derivedTermMonths);
      return fullRepaymentCents;
    case 'custom_monthly':
      return range.customPaymentCents ?? 0;
    default:
      return 0;
  }
}

/** Calendar months between two YYYY-MM-DD dates (whole months). */
function monthsBetween(startISO: string, endISO: string): number {
  const a = new Date(startISO + 'T00:00:00');
  const b = new Date(endISO + 'T00:00:00');
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return Math.max(0, months);
}

/** Days between two YYYY-MM-DD dates (for accrual). */
function daysBetween(startISO: string, endISO: string): number {
  const a = new Date(startISO + 'T00:00:00').getTime();
  const b = new Date(endISO + 'T00:00:00').getTime();
  return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)));
}

/** Private deferred only: daily interest in cents (balance × rate/365). Total interest = daily × daysInRange. */
function computeDeferredDailyInterestCents(balanceCents: number, ratePercent: number): number {
  if (!(balanceCents > 0)) return 0;
  return (balanceCents * (ratePercent / 100)) / 365;
}

/** Private deferred: total interest over full range. AES convention: Math.round per day × days. */
function computeDeferredRangeInterestCents(
  balanceCents: number,
  ratePercent: number,
  startISO: string,
  endISO: string
): number {
  if (!(balanceCents > 0)) return 0;
  // AES nightly accumulation convention: round per day, then multiply by days
  const dailyCents = Math.round(balanceCents * (ratePercent / 100) / 365);
  const days = daysBetween(startISO, endISO);
  return dailyCents * days;
}

/**
 * If this private loan has any deferred range that has ended (endDate <= today) and we haven't applied
 * interest for it yet, add the full deferred-range interest to balance and set the one-time guard.
 * Applies all such ranges in one pass (chronological by end date). Returns updated loan or null if no change.
 */
function applyDeferredInterestToPrivateLoanIfNeeded(loan: Loan): Loan | null {
  if (loan.category !== 'private') return null;
  const ranges = getEffectivePrivateRanges(loan);
  const todayISO = toDateKey(new Date());
  const endedDeferred = ranges
    .filter((r) => r.mode === 'deferred' && r.endDate <= todayISO && !loan.deferredInterestAppliedForRangeEndDates?.includes(r.endDate))
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  if (endedDeferred.length === 0) return null;
  let balanceCents = loan.balanceCents ?? 0;
  const applied = [...(loan.deferredInterestAppliedForRangeEndDates ?? [])];
  for (const r of endedDeferred) {
    const addCents = computeDeferredRangeInterestCents(balanceCents, loan.interestRatePercent, r.startDate, r.endDate);
    balanceCents += addCents;
    applied.push(r.endDate);
  }
  return {
    ...loan,
    balanceCents,
    deferredInterestAppliedForRangeEndDates: applied
  };
}

/** Lender-style unpaid interest: balance * (rate/100) / 365 * elapsedDays. */
function computeUnpaidInterestFromAccrual(
  balanceCents: number,
  ratePercent: number,
  anchorISO: string,
  asOfISO: string
): number {
  const days = daysBetween(anchorISO, asOfISO);
  if (days <= 0) return 0;
  // Standardized to 365 for consistency with all other interest formulas in this codebase
  const dollars = (balanceCents / 100) * (ratePercent / 100) / 365 * days;
  return Math.round(dollars * 100);
}

/**
 * Compute full months elapsed between two ISO dates, accounting for day-of-month.
 * e.g. "2024-09-30" → "2026-04-05" = 18 (not 19, because Apr 5 < Sep 30 day).
 */
function fullMonthsElapsed(startISO: string, endISO: string): number {
  const a = new Date(startISO + 'T00:00:00');
  const b = new Date(endISO + 'T00:00:00');
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return Math.max(0, months);
}

/** Add N months to an ISO date string, return ISO string. */
function addMonthsToISO(startISO: string, months: number): string {
  const d = addMonths(new Date(startISO + 'T00:00:00'), months);
  return toDateKey(d);
}

/**
 * Compute unpaid interest using user-input anchored system.
 *
 * deferred:       anchor + daily × daysSinceAnchor (monotonic growth)
 * interest_only:  daily × daysSinceLastBillingDay (self-correcting sawtooth;
 *                 resets to 0 each billing cycle using billingDayOfMonth)
 * custom_monthly: anchor + shortfall × months + daily × remainder
 * full_repayment: 0
 */
function computeAnchoredUnpaidInterest(loan: Loan, asOfISO: string): number {
  // Public subsidized: always 0 while in school
  if (loan.category === 'public' && loan.subsidyType === 'subsidized') return 0;

  const { balanceCents, interestRatePercent } = loan;
  if (!(balanceCents > 0) || !(interestRatePercent > 0)) return 0;

  const anchor = loan.currentInterestBalanceCents;
  if (anchor == null) return 0; // user hasn't entered interest balance yet

  // AES nightly accumulation convention: Math.round per day (per disbursement for public unsub)
  const dailyCents = (loan.disbursements && loan.disbursements.length > 0)
    ? loan.disbursements.reduce((sum, d) => sum + Math.round(d.amountCents * (interestRatePercent / 100) / 365), 0)
    : Math.round(balanceCents * (interestRatePercent / 100) / 365);
  const anchorDate = loan.interestBalanceAnchorDate ?? asOfISO;

  // Public unsubsidized: simple anchor + daily forward (no payment ranges)
  if (loan.category === 'public') {
    const daysElapsed = daysBetween(anchorDate, asOfISO);
    const unpaid = anchor + (dailyCents * daysElapsed);
    console.log(`[unpaidInterest] ${loan.name} | public unsub | anchor=${anchor}¢ daily=${dailyCents} days=${daysElapsed} → $${(unpaid/100).toFixed(2)}`);
    return unpaid;
  }

  // Private loans: range-based logic
  const ranges = getEffectivePrivateRanges(loan);
  const activeRange = getActivePrivateRange(ranges, asOfISO);
  const mode = activeRange?.mode ?? 'deferred';

  let unpaidCents = 0;
  let debugDetail = '';

  switch (mode) {
    case 'deferred': {
      // Anchor + daily forward projection from anchor date
      const daysElapsed = daysBetween(anchorDate, asOfISO);
      unpaidCents = anchor + (dailyCents * daysElapsed);
      debugDetail = `deferred: anchor=${anchor}¢ anchorDate=${anchorDate} daily=${dailyCents} days=${daysElapsed} → ${anchor}+(${dailyCents}×${daysElapsed})=${unpaidCents}¢`;
      break;
    }
    case 'interest_only': {
      // Hybrid: if a billing day has passed since the anchor date, the user paid and
      // interest reset — use self-correcting billing-day sawtooth from that point.
      // If no billing day has passed yet, the user hasn't paid — anchor+forward.
      const billingDay = loan.billingDayOfMonth;
      if (billingDay != null && billingDay >= 1 && billingDay <= 31) {
        const today = new Date(asOfISO + 'T00:00:00');
        const day = Math.min(billingDay, 28);
        let lastPayment: string;
        if (today.getDate() >= day) {
          lastPayment = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        } else {
          const prev = new Date(today.getFullYear(), today.getMonth() - 1, day);
          lastPayment = toDateKey(prev);
        }
        if (lastPayment > anchorDate) {
          // Billing day passed since anchor → user paid, sawtooth from billing day
          const daysElapsed = daysBetween(lastPayment, asOfISO);
          unpaidCents = dailyCents * daysElapsed;
          debugDetail = `interest_only: billing(${lastPayment}) days=${daysElapsed} daily=${dailyCents} → ${unpaidCents}¢`;
        } else {
          // No billing day since anchor → user hasn't paid yet, anchor+forward
          const daysElapsed = daysBetween(anchorDate, asOfISO);
          unpaidCents = anchor + (dailyCents * daysElapsed);
          debugDetail = `interest_only: anchor+fwd anchor=${anchor}¢ days=${daysElapsed} daily=${dailyCents} → ${unpaidCents}¢`;
        }
      } else {
        // No billing day set — fall back to anchor + daily forward
        const daysElapsed = daysBetween(anchorDate, asOfISO);
        unpaidCents = anchor + (dailyCents * daysElapsed);
        debugDetail = `interest_only (no billingDay): anchor=${anchor}¢ days=${daysElapsed} daily=${dailyCents} → ${unpaidCents}¢`;
      }
      break;
    }
    case 'custom_monthly': {
      // Anchor + monthly shortfall + daily remainder forward from anchor date
      const customPayment = activeRange?.customPaymentCents ?? 0;
      const monthlyInterestCents = Math.round(balanceCents * (interestRatePercent / 100) / 12);
      const shortfall = Math.max(0, monthlyInterestCents - customPayment);
      const months = fullMonthsElapsed(anchorDate, asOfISO);
      const monthStart = addMonthsToISO(anchorDate, months);
      const remainderDays = daysBetween(monthStart, asOfISO);
      unpaidCents = anchor + (shortfall * months) + (dailyCents * remainderDays);
      debugDetail = `custom_monthly: anchor=${anchor}¢ anchorDate=${anchorDate} shortfall=${shortfall} months=${months} remainderDays=${remainderDays} daily=${dailyCents} → ${anchor}+(${shortfall}×${months})+(${dailyCents}×${remainderDays})=${unpaidCents}¢`;
      break;
    }
    case 'full_repayment':
      unpaidCents = 0;
      debugDetail = 'full_repayment: 0¢';
      break;
  }

  // DEBUG: log per-loan — remove after confirming targets
  console.log(`[unpaidInterest] ${loan.name} | bal=${balanceCents}¢ ($${(balanceCents/100).toFixed(2)}) rate=${interestRatePercent}% daily=${dailyCents} | ${debugDetail} | TOTAL=$${(unpaidCents/100).toFixed(2)}`);

  return unpaidCents;
}

/**
 * Unpaid interest for any loan (private or public unsubsidized).
 * Priority: ledger (server-computed nightly) → anchored computation → 0.
 * Public subsidized always returns 0 (handled inside computeAnchoredUnpaidInterest).
 */
function getUnpaidInterestForLoan(
  loan: Loan,
  asOfISO: string,
  ledgerMap?: Record<string, LedgerRow>
): { cents: number; source: 'ledger' | 'estimated' | 'fallback' } {
  // 1. Ledger: server-computed nightly interest (primary when available)
  const ledgerRow = ledgerMap?.[loan.id];
  if (ledgerRow) {
    const accruedCents = ledgerRow.closing_balance_cents - loan.balanceCents;
    if (accruedCents >= 0) {
      return { cents: accruedCents, source: 'ledger' };
    }
  }
  // 2. Anchored computation from user-entered AES interest balance
  const cents = computeAnchoredUnpaidInterest(loan, asOfISO);
  if (cents > 0) return { cents, source: 'estimated' };
  return { cents: 0, source: 'fallback' };
}

/** Derive total loan span in months from earliest range start to latest range end. */
function getRangeDerivedTermMonths(ranges: PrivatePaymentRange[]): number {
  if (ranges.length === 0) return 0;
  let earliest = ranges[0].startDate;
  let latest = ranges[0].endDate;
  for (const r of ranges) {
    if (r.startDate < earliest) earliest = r.startDate;
    if (r.endDate > latest) latest = r.endDate;
  }
  return monthsBetween(earliest, latest);
}

export type FederalPlanRow = {
  planId: 'ibr' | 'paye' | 'icr';
  planName: string;
  monthlyPaymentCents: number;
  forgivenessYears: number;
  eligible: boolean;
  note?: string;
};

export type FederalTotals = {
  totalEligibleBalanceCents: number;
  plans: FederalPlanRow[];
  lowestTotalCents: number | null;
};

type LoanWithDerived = Loan & {
  monthlyNowCents: number | null;
  monthlyLaterCents: number | null;
  dailyInterestCents: number;
  monthlyInterestCents: number;
  payoffMonths: number | null;
  federalPlans?: FederalPlanRow[];
  totalFederalPaymentCents?: number | null;
  approximateShareCents?: number | null;
  /** Private only: future full-repayment amount when not yet in full repayment (for hidden breakdown). */
  futureFullRepaymentCents?: number | null;
  /** Private only: interest portion of future full repayment (for hidden breakdown). */
  futureFullRepaymentInterestCents?: number | null;
  /** Private only: principal portion of future full repayment (for hidden breakdown). */
  futureFullRepaymentPrincipalCents?: number | null;
  /** Private only: latest range end date (YYYY-MM-DD) for payoff timeline. */
  latestRangeEndISO?: string;
  /** Private only: true when hidden future/grace value came from a custom monthly range (manual override). */
  futureValueFromCustom?: boolean;
  /** Private only: true when future value is a projection (no explicit range set), not from a configured range. */
  futureIsProjected?: boolean;
  /** Private only: mode of the active range (for display). */
  activePrivateRangeMode?: PrivatePaymentRangeMode | null;
  /** Private only: unpaid interest cents and source (ledger / estimated / fallback). */
  unpaidInterestCents?: number;
  unpaidInterestSource?: 'ledger' | 'estimated' | 'fallback';
  /** For private deferred: estimated balance today from schedule timeline (display only). */
  estimatedCurrentBalanceCents?: number | null;
  /** For private deferred: balance at start of first repayment range (display only). */
  balanceAtRepaymentStartCents?: number | null;
  /** For private in-school interest-only: accrued unpaid interest to date (display). */
  inSchoolAccruedCents?: number | null;
  /** For private in-school interest-only: principal + accrued (display). */
  inSchoolTotalOwedCents?: number | null;
  /** Private deferred only: daily interest (cents, for display). */
  deferredDailyInterestCents?: number;
  /** Private deferred only: total days in the selected deferred range. */
  deferredDaysInRange?: number;
  /** Private deferred only: total interest accrued across the full deferred range (cents). */
  deferredInterestTotalCents?: number;
  /** Private deferred only: projected balance when deferment ends (current + deferred interest). */
  deferredProjectedBalanceCents?: number;
};

function getActiveMonthlyPayment(loan: LoanWithDerived): number | null {
  // Private: range-based only; no legacy grace override
  if (loan.category === 'private') return loan.monthlyNowCents;
  const today = new Date();
  if (loan.gracePeriodEndDate) {
    const graceEnd = new Date(loan.gracePeriodEndDate + 'T00:00:00');
    if (today >= graceEnd) {
      return loan.monthlyLaterCents ?? loan.monthlyNowCents;
    }
  }
  return loan.monthlyNowCents;
}

function deriveForLoan(
  loan: Loan,
  allLoans: Loan[],
  detectedAnnualIncomeCents: number,
  federalTotals: FederalTotals | null,
  ledgerMap?: Record<string, LedgerRow>
): LoanWithDerived {
  const { balanceCents, interestRatePercent, repaymentStatus, termMonths, category } = loan;
  const allPublicLoans = allLoans.filter((l) => l.category === 'public');
  const isPublicSubsidizedInSchoolOrGrace =
    category === 'public' &&
    loan.subsidyType === 'subsidized' &&
    (repaymentStatus === 'in_school_interest_only' || repaymentStatus === 'grace_interest_only');
  // AES-matched: floor per loan (or per disbursement) in cents, then sum.
  const dailyInterestCents = isPublicSubsidizedInSchoolOrGrace
    ? 0
    : (loan.disbursements && loan.disbursements.length > 0)
      ? loan.disbursements.reduce((sum, d) => sum + Math.floor(d.amountCents * (interestRatePercent / 100) / 365), 0)
      : Math.floor(balanceCents * (interestRatePercent / 100) / 365);
  let monthlyInterestCents = dailyInterestCents * 30;

  const interestOnlyMonthly = computeInterestOnlyMonthlyCents(balanceCents, interestRatePercent);
  const fullPaymentCents = computeAmortizedPaymentCents(balanceCents, interestRatePercent, termMonths) ?? interestOnlyMonthly;

  let monthlyNowCents: number | null = null;
  let monthlyLaterCents: number | null = null;
  let payoffMonths: number | null = null;
  let federalPlans: FederalPlanRow[] | undefined;
  let totalFederalPaymentCents: number | null | undefined;
  let approximateShareCents: number | null | undefined;

  const isPublicInSchoolOrGrace =
    category === 'public' &&
    (repaymentStatus === 'in_school_interest_only' || repaymentStatus === 'grace_interest_only');

  if (category === 'public') {
    const isParent = loan.borrowerType === 'parent';
    const eligibleForIdr = !isParent && federalTotals && federalTotals.totalEligibleBalanceCents > 0;
    const totalPayment = federalTotals?.lowestTotalCents ?? null;
    federalPlans = federalTotals?.plans;

    if (eligibleForIdr && federalTotals) {
      totalFederalPaymentCents = federalTotals.lowestTotalCents;
      approximateShareCents =
        federalTotals.totalEligibleBalanceCents > 0 && federalTotals.lowestTotalCents != null
          ? Math.round((balanceCents / federalTotals.totalEligibleBalanceCents) * federalTotals.lowestTotalCents)
          : null;
    }

    if (repaymentStatus === 'in_school_interest_only' || repaymentStatus === 'grace_interest_only') {
      monthlyNowCents = 0;
      monthlyLaterCents = eligibleForIdr ? approximateShareCents ?? null : null;
      payoffMonths =
        totalPayment != null && totalPayment > 0
          ? computeMonthsToPayoff(balanceCents, interestRatePercent, approximateShareCents ?? fullPaymentCents)
          : computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
    } else if (repaymentStatus === 'full_repayment') {
      monthlyNowCents = fullPaymentCents;
      monthlyLaterCents = null;
      payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
    } else if (repaymentStatus === 'idr') {
      monthlyNowCents = eligibleForIdr ? approximateShareCents ?? null : null;
      monthlyLaterCents = null;
      payoffMonths =
        totalPayment != null && (approximateShareCents ?? 0) > 0
          ? computeMonthsToPayoff(balanceCents, interestRatePercent, approximateShareCents!)
          : null;
    } else if (repaymentStatus === 'deferred_forbearance') {
      monthlyNowCents = 0;
      monthlyLaterCents = eligibleForIdr ? approximateShareCents ?? fullPaymentCents : fullPaymentCents;
      payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
    } else if (repaymentStatus === 'custom_payment') {
      const custom = loan.nextPaymentCents && loan.nextPaymentCents > 0 ? loan.nextPaymentCents : null;
      monthlyNowCents = custom;
      monthlyLaterCents = null;
      payoffMonths =
        custom != null ? computeMonthsToPayoff(balanceCents, interestRatePercent, custom) : null;
    } else {
      monthlyNowCents = null;
      monthlyLaterCents = null;
      payoffMonths = null;
    }
  } else {
    // Private loan: range-based payment logic
    const todayISO = toDateKey(new Date());
    const effectiveRanges = getEffectivePrivateRanges(loan);
    // Canonical term: explicit loan.termMonths if set; range-span derivation as fallback only
    const derivedTermMonths = (loan.termMonths && loan.termMonths > 0) ? loan.termMonths : getRangeDerivedTermMonths(effectiveRanges); /* fallback: range span */
    const activeRange = getActivePrivateRange(effectiveRanges, todayISO);
    const paymentNow = activeRange
      ? paymentCentsFromPrivateRange(activeRange, balanceCents, interestRatePercent, derivedTermMonths)
      : 0;
    monthlyNowCents = paymentNow;
    // Private monthly interest uses (balance × rate/365) × days in cycle for display and breakdown.
    monthlyInterestCents = computeMonthlyInterestCents(balanceCents, interestRatePercent);

    // Projected balance: if a future full_repayment range exists, account for deferred interest
    // that will capitalize before repayment starts. Computed once, reused for display and payoff.
    const firstFullRange = getFirstFullRepaymentRange(effectiveRanges);
    const hasFutureFullRepayment = !!(firstFullRange && todayISO < firstFullRange.startDate);
    const capitalizedInterest = hasFutureFullRepayment
      ? computeDeferredRangeInterestCents(balanceCents, interestRatePercent, todayISO, firstFullRange!.startDate)
      : 0;
    const projectedBalanceCents = balanceCents + capitalizedInterest;
    // Use projected balance for breakdown when repayment hasn't started yet
    const repaymentBalanceCents = hasFutureFullRepayment ? projectedBalanceCents : balanceCents;

    // Future/grace value: first future range (custom → full_repayment → interest_only). Custom overrides calculated.
    const fullRepaymentBreakdown =
      derivedTermMonths > 0
        ? computeFullRepaymentBreakdown(repaymentBalanceCents, interestRatePercent, derivedTermMonths)
        : null;
    const futureFullPayment = fullRepaymentBreakdown?.fullRepaymentCents ?? 0;

    let latestRangeEndISO = '';
    for (const r of effectiveRanges) {
      if (r.endDate > latestRangeEndISO) latestRangeEndISO = r.endDate;
    }

    const firstFuture = getFirstFutureRepaymentRange(effectiveRanges, todayISO);
    const inFullRepaymentNow = activeRange?.mode === 'full_repayment';
    let futureFullRepaymentCents: number | null = null;
    let futureFullRepaymentInterestCents: number | null = null;
    let futureFullRepaymentPrincipalCents: number | null = null;
    let futureValueFromCustom = false;
    let futureIsProjected = false;

    // 1) Check first future range: full_repayment → interest_only → custom_monthly.
    if (firstFuture != null) {
      let futureCents = 0;
      if (firstFuture.mode === 'custom_monthly') {
        futureCents = firstFuture.customPaymentCents ?? 0;
        futureValueFromCustom = true;
      } else if (firstFuture.mode === 'full_repayment' && fullRepaymentBreakdown) {
        futureCents = fullRepaymentBreakdown.fullRepaymentCents;
        futureFullRepaymentInterestCents = fullRepaymentBreakdown.monthlyInterestCents;
        futureFullRepaymentPrincipalCents = fullRepaymentBreakdown.principalPortionCents;
      } else if (firstFuture.mode === 'interest_only') {
        futureCents = computeProjectionMonthlyInterestCents(balanceCents, interestRatePercent);
      }
      if (futureCents > 0) {
        futureFullRepaymentCents = futureCents;
        monthlyLaterCents = futureCents;
      }
    }

    // 2) If currently in full_repayment with no future range override, use the amortized payment.
    if (futureFullRepaymentCents == null && inFullRepaymentNow && futureFullPayment > 0) {
      futureFullRepaymentCents = futureFullPayment;
      monthlyLaterCents = futureFullPayment;
    }

    // 3) Fix 3: custom_monthly active with no future range → project full repayment as after-grace estimate.
    if (futureFullRepaymentCents == null && activeRange?.mode === 'custom_monthly' && futureFullPayment > 0) {
      futureFullRepaymentCents = futureFullPayment;
      futureFullRepaymentInterestCents = fullRepaymentBreakdown?.monthlyInterestCents ?? null;
      futureFullRepaymentPrincipalCents = fullRepaymentBreakdown?.principalPortionCents ?? null;
      futureIsProjected = true;
      monthlyLaterCents = futureFullPayment;
    }

    // 4) Fix 1: deferred with no future range → project payment from projected balance at deferment end.
    if (futureFullRepaymentCents == null && (activeRange?.mode === 'deferred' || !activeRange) && derivedTermMonths > 0) {
      // Use the deferred range's end date (or latest range end) as the grace end proxy
      const graceEndISO = activeRange?.endDate ?? (latestRangeEndISO || todayISO);
      const graceEnd = graceEndISO > todayISO ? graceEndISO : todayISO;
      const projBal = balanceCents + computeDeferredRangeInterestCents(balanceCents, interestRatePercent, todayISO, graceEnd);
      const projBreakdown = computeFullRepaymentBreakdown(projBal, interestRatePercent, derivedTermMonths);
      futureFullRepaymentCents = projBreakdown.fullRepaymentCents;
      futureFullRepaymentInterestCents = projBreakdown.monthlyInterestCents;
      futureFullRepaymentPrincipalCents = projBreakdown.principalPortionCents;
      futureIsProjected = true;
      monthlyLaterCents = projBreakdown.fullRepaymentCents;
    }

    // Payoff estimate: futureFullPayment already uses projected balance, so reuse directly
    if (firstFullRange && futureFullPayment > 0) {
      if (hasFutureFullRepayment) {
        const monthsUntilStart = monthsBetween(todayISO, firstFullRange.startDate);
        const payoffFromStart = computeMonthsToPayoff(projectedBalanceCents, interestRatePercent, futureFullPayment);
        payoffMonths = payoffFromStart != null ? monthsUntilStart + payoffFromStart : null;
      } else {
        payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, futureFullPayment);
      }
    } else {
      // Projection context (payoff check): use rate/12 consistent with computeMonthsToPayoff
      const monthlyInterestOnly = computeProjectionMonthlyInterestCents(balanceCents, interestRatePercent);
      if (paymentNow > 0 && paymentNow <= monthlyInterestOnly) {
        payoffMonths = null;
      } else {
        payoffMonths = paymentNow > 0
          ? computeMonthsToPayoff(balanceCents, interestRatePercent, paymentNow)
          : (futureFullPayment > 0 ? computeMonthsToPayoff(balanceCents, interestRatePercent, futureFullPayment) : null);
      }
    }

    const { cents: unpaidInterestCents, source: unpaidInterestSource } = getUnpaidInterestForLoan(loan, todayISO, ledgerMap);

    // Deferred/forbearance: compute full-range interest and projected balance for display
    let deferredDailyInterestCents: number | undefined;
    let deferredDaysInRange: number | undefined;
    let deferredInterestTotalCents: number | undefined;
    let deferredProjectedBalanceCents: number | undefined;
    if (activeRange?.mode === 'deferred') {
      const daysInRange = daysBetween(activeRange.startDate, activeRange.endDate);
      const dailyCents = computeDeferredDailyInterestCents(balanceCents, interestRatePercent);
      const totalCents = computeDeferredRangeInterestCents(balanceCents, interestRatePercent, activeRange.startDate, activeRange.endDate);
      deferredDailyInterestCents = dailyCents;
      deferredDaysInRange = daysInRange;
      deferredInterestTotalCents = totalCents;
      deferredProjectedBalanceCents = balanceCents + totalCents;
    }

    return {
      ...loan,
      monthlyNowCents,
      monthlyLaterCents,
      dailyInterestCents,
      monthlyInterestCents,
      payoffMonths,
      federalPlans,
      totalFederalPaymentCents,
      approximateShareCents,
      futureFullRepaymentCents,
      futureFullRepaymentInterestCents: futureFullRepaymentInterestCents ?? undefined,
      futureFullRepaymentPrincipalCents: futureFullRepaymentPrincipalCents ?? undefined,
      futureValueFromCustom: futureValueFromCustom || undefined,
      futureIsProjected: futureIsProjected || undefined,
      activePrivateRangeMode: activeRange?.mode ?? null,
      latestRangeEndISO: latestRangeEndISO || undefined,
      unpaidInterestCents: unpaidInterestCents,
      unpaidInterestSource: unpaidInterestSource,
      deferredDailyInterestCents: deferredDailyInterestCents ?? undefined,
      deferredDaysInRange: deferredDaysInRange ?? undefined,
      deferredInterestTotalCents: deferredInterestTotalCents ?? undefined,
      deferredProjectedBalanceCents: deferredProjectedBalanceCents ?? undefined
    };
  }

  return {
    ...loan,
    monthlyNowCents,
    monthlyLaterCents,
    dailyInterestCents,
    monthlyInterestCents,
    payoffMonths,
    federalPlans,
    totalFederalPaymentCents,
    approximateShareCents
  };
}

type LoanEditorState = {
  id?: string;
  name: string;
  lender: string;
  category: Loan['category'];
  balance: string;
  ratePercent: string;
  rateType: Loan['rateType'];
  termMonths: string;
  repaymentStatus: Loan['repaymentStatus'];
  futureRepaymentPlan: FutureRepaymentPlan;
  subsidyType: 'subsidized' | 'unsubsidized';
  disbursementDate: string;
  /** Public loans: per-disbursement amounts for interest tracking. */
  disbursements: { date: string; amount: string }[];
  gracePeriodEndDate: string;
  nextPayment: string;
  nextPaymentDate: string;
  notes: string;
  active: boolean;
  idrUseManualIncome: boolean;
  idrManualAnnualIncome: string;
  borrowerType: LoanBorrowerType;
  householdSize: string;
  dependents: string;
  stateOfResidency: LoanStateOfResidency;
  paymentScheduleRanges: PaymentScheduleRange[];
  schedulePaymentStrings: Record<string, string>;
  scheduleAccruedInterestStrings: Record<string, string>;
  privatePaymentMode: 'interest_only' | 'full_repayment' | 'custom_monthly';
  /** Private: date ranges (start, end, mode, custom $ string). */
  privatePaymentRanges: { id: string; startDate: string; endDate: string; mode: PrivatePaymentRangeMode; customPayment: string }[];
  /** Private: interest accrual anchor date (YYYY-MM-DD). */
  accrualAnchorDate: string;
  /** Private: current interest balance from AES ($). */
  currentInterestBalance: string;
  /** Private interest_only: billing day of month (1-31). */
  billingDayOfMonth: string;
};

function loanToEditor(l: Loan | null | undefined, hasRecurringIncome: boolean): LoanEditorState {
  if (!l) {
    return {
      name: '',
      lender: '',
      category: 'public',
      balance: '',
      ratePercent: '',
      rateType: 'fixed',
      termMonths: '',
      repaymentStatus: 'full_repayment',
      futureRepaymentPlan: 'na',
      subsidyType: 'unsubsidized',
      disbursementDate: '',
      disbursements: [],
      gracePeriodEndDate: '',
      nextPayment: '',
      nextPaymentDate: '',
      notes: '',
      active: true,
      idrUseManualIncome: !hasRecurringIncome,
      idrManualAnnualIncome: '',
      borrowerType: 'student',
      householdSize: '1',
      dependents: '0',
      stateOfResidency: 'contiguous',
      paymentScheduleRanges: [],
      schedulePaymentStrings: {},
      scheduleAccruedInterestStrings: {},
      privatePaymentMode: 'full_repayment',
      privatePaymentRanges: [],
      accrualAnchorDate: '',
      currentInterestBalance: '',
      billingDayOfMonth: ''
    };
  }
  const priv = l as Loan;
  const privRanges = priv.privatePaymentRanges;
  const defaultRanges =
    privRanges && privRanges.length > 0
      ? privRanges.map((r) => ({
          id: r.id,
          startDate: r.startDate,
          endDate: r.endDate,
          mode: r.mode,
          customPayment: r.customPaymentCents != null ? (r.customPaymentCents / 100).toFixed(2) : ''
        }))
      : [
          {
            id: uid(),
            startDate: toDateKey(new Date()),
            endDate: FAR_FUTURE_ISO,
            mode: (priv.privatePaymentMode ?? 'full_repayment') as PrivatePaymentRangeMode,
            customPayment: priv.nextPaymentCents != null ? (priv.nextPaymentCents / 100).toFixed(2) : ''
          }
        ];
  return {
    id: l.id,
    name: l.name,
    lender: l.lender || '',
    category: l.category,
    balance: (l.balanceCents / 100).toFixed(2),
    ratePercent: String(l.interestRatePercent),
    rateType: l.rateType,
    termMonths: l.termMonths != null ? String(l.termMonths) : '',
    repaymentStatus: l.repaymentStatus,
    futureRepaymentPlan: l.futureRepaymentPlan || 'na',
    subsidyType: l.subsidyType || 'unsubsidized',
    disbursementDate: l.disbursementDate || '',
    disbursements: (l.disbursements || []).map(d => ({ date: d.date, amount: (d.amountCents / 100).toFixed(2) })),
    gracePeriodEndDate: l.gracePeriodEndDate || '',
    nextPayment: l.nextPaymentCents != null ? (l.nextPaymentCents / 100).toFixed(2) : '',
    nextPaymentDate: l.nextPaymentDate || '',
    notes: l.notes || '',
    active: l.active !== false,
    idrUseManualIncome: !!l.idrUseManualIncome,
    idrManualAnnualIncome:
      l.idrManualAnnualIncomeCents != null ? (l.idrManualAnnualIncomeCents / 100).toFixed(2) : '',
    borrowerType: l.borrowerType ?? 'student',
    householdSize: String(l.householdSize ?? 1),
    dependents: String(l.dependents ?? 0),
    stateOfResidency: l.stateOfResidency ?? 'contiguous',
    paymentScheduleRanges: l.paymentScheduleRanges ?? [],
    schedulePaymentStrings: {},
    scheduleAccruedInterestStrings: (() => {
      const out: Record<string, string> = {};
      (l.paymentScheduleRanges ?? []).forEach((r) => {
        if (r.accruedInterestCents != null) out[r.id] = (r.accruedInterestCents / 100).toFixed(2);
      });
      return out;
    })(),
    privatePaymentMode: priv.privatePaymentMode ?? 'custom_monthly',
    privatePaymentRanges: defaultRanges,
    accrualAnchorDate: priv.accrualAnchorDate ?? '',
    currentInterestBalance: priv.currentInterestBalanceCents != null ? (priv.currentInterestBalanceCents / 100).toFixed(2) : '',
    billingDayOfMonth: priv.billingDayOfMonth != null ? String(priv.billingDayOfMonth) : ''
  };
}

function editorToLoan(e: LoanEditorState, prev: Loan | null): Loan | null {
  const rawBal = parseFloat(e.balance || '0');
  const balanceCents = Number.isFinite(rawBal) ? Math.round(rawBal * 100) : 0;
  const ratePercent = parseFloat(e.ratePercent || '0');
  const rawIncome = parseFloat(e.idrManualAnnualIncome || '0');
  const idrManualAnnualIncomeCents =
    Number.isFinite(rawIncome) && rawIncome > 0
      ? Math.round(rawIncome * 100)
      : undefined;

  if (!(balanceCents >= 0 && Number.isFinite(ratePercent))) return null;

  const isPublic = e.category === 'public';
  const termMonths = isPublic
    ? prev?.termMonths
    : undefined;
  const nextPaymentStr = isPublic ? undefined : (e.nextPayment !== undefined ? String(e.nextPayment).replace(/,/g, '').trim() : '');
  const nextPaymentCents = isPublic
    ? prev?.nextPaymentCents
    : (e.privatePaymentRanges?.length
        ? prev?.nextPaymentCents
        : nextPaymentStr === ''
          ? undefined
          : (() => {
              const n = Math.round(parseFloat(nextPaymentStr!) * 100);
              return Number.isFinite(n) && n >= 0 ? n : undefined;
            })());
  const repaymentStatus = isPublic ? (prev?.repaymentStatus ?? 'full_repayment') : 'full_repayment';
  const gracePeriodEndDate = isPublic ? prev?.gracePeriodEndDate : undefined;
  const futureRepaymentPlan = isPublic ? (prev?.futureRepaymentPlan ?? 'na') : undefined;
  const nextPaymentDate = isPublic ? (prev?.nextPaymentDate ?? undefined) : undefined;

  const subsidyType = e.category === 'public' ? e.subsidyType : undefined;
  const disbursementDate = e.category === 'public' && e.disbursementDate ? e.disbursementDate : undefined;
  const disbursements = e.category === 'public' && e.disbursements.length > 0
    ? e.disbursements.filter(d => d.date && d.amount).map(d => ({ date: d.date, amountCents: Math.round(parseFloat(d.amount.replace(/,/g, '')) * 100) })).filter(d => Number.isFinite(d.amountCents) && d.amountCents > 0)
    : undefined;
  const householdSize = undefined;
  const dependents = undefined;
  const stateOfResidency = undefined;

  return {
    id: prev?.id || uid(),
    name: e.name.trim() || 'Loan',
    lender: e.lender.trim() || undefined,
    category: e.category,
    balanceCents,
    interestRatePercent: ratePercent,
    rateType: e.rateType,
    termMonths,
    repaymentStatus,
    futureRepaymentPlan: futureRepaymentPlan ?? undefined,
    subsidyType,
    disbursementDate,
    disbursements,
    borrowerType: e.category === 'public' ? e.borrowerType : undefined,
    householdSize,
    dependents,
    stateOfResidency,
    paymentScheduleRanges: isPublic ? prev?.paymentScheduleRanges : undefined,
    gracePeriodEndDate,
    nextPaymentCents,
    nextPaymentDate,
    notes: e.notes.trim() || undefined,
    active: e.active,
    idrUseManualIncome: e.category === 'public' ? undefined : e.idrUseManualIncome,
    idrManualAnnualIncomeCents: e.category === 'public' ? undefined : idrManualAnnualIncomeCents,
    accruedInterestCents: isPublic ? undefined : undefined,
    accrualLastUpdatedAt: isPublic ? undefined : undefined,
    privatePaymentMode: isPublic ? undefined : e.privatePaymentMode,
    accrualAnchorDate: isPublic ? undefined : (e.accrualAnchorDate?.trim() || undefined),
    currentInterestBalanceCents: isPublic ? undefined : (() => {
      const s = e.currentInterestBalance?.replace(/,/g, '').trim();
      if (!s) return undefined;
      const n = Math.round(parseFloat(s) * 100);
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    })(),
    interestBalanceAnchorDate: isPublic ? undefined : (() => {
      const s = e.currentInterestBalance?.replace(/,/g, '').trim();
      if (!s) return prev?.interestBalanceAnchorDate;
      const n = Math.round(parseFloat(s) * 100);
      // If user changed the value, update the anchor date to today
      if (Number.isFinite(n) && n >= 0 && n !== prev?.currentInterestBalanceCents) return todayISO();
      return prev?.interestBalanceAnchorDate;
    })(),
    billingDayOfMonth: isPublic ? undefined : (() => {
      const s = e.billingDayOfMonth?.trim();
      if (!s) return undefined;
      const n = parseInt(s, 10);
      return Number.isFinite(n) && n >= 1 && n <= 31 ? n : undefined;
    })(),
    privatePaymentRanges:
      isPublic
        ? undefined
        : e.privatePaymentRanges.map((r) => {
            const customVal =
              r.mode === 'custom_monthly' && r.customPayment.trim() !== ''
                ? Math.round(parseFloat(r.customPayment.replace(/,/g, '')) * 100)
                : undefined;
            return {
              id: r.id,
              startDate: r.startDate,
              endDate: r.endDate,
              mode: r.mode,
              customPaymentCents: customVal != null && Number.isFinite(customVal) && customVal >= 0 ? customVal : undefined
            };
          }),
    deferredInterestAppliedForRangeEndDates: isPublic ? undefined : (prev?.deferredInterestAppliedForRangeEndDates ?? undefined)
  };
}

function statusLabel(status: Loan['repaymentStatus']): string {
  switch (status) {
    case 'in_school_interest_only':
      return 'In school';
    case 'grace_interest_only':
      return 'Grace';
    case 'full_repayment':
      return 'Full repayment';
    case 'idr':
      return 'IDR';
    case 'deferred_forbearance':
      return 'Deferred';
    case 'custom_payment':
      return 'Custom';
    default:
      return '-';
  }
}

function LoanCard(props: {
  loan: LoanWithDerived;
  onEdit: () => void;
  onDelete: () => void;
  onPayoffAge?: () => void;
  onRefinance?: () => void;
}) {
  const { loan: l, onEdit, onDelete } = props;
  const [plansOpen, setPlansOpen] = useState(false);

  return (
    <div className="card" key={l.id} style={{ marginBottom: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span className="name" style={{ fontSize: '1rem', fontWeight: 600 }}>
          {l.name}
        </span>
        <span
          style={{
            fontSize: '0.7rem',
            padding: '2px 6px',
            borderRadius: 999,
            background: l.category === 'public' ? 'rgba(59,130,246,0.15)' : 'rgba(234,179,8,0.15)',
            color: l.category === 'public' ? 'var(--blue)' : 'var(--yellow)'
          }}
        >
          {l.category === 'public' ? 'Public' : 'Private'}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px', marginBottom: 4 }}>
        <span style={{ color: 'var(--red)', fontWeight: 600 }}>{formatCents(l.balanceCents)}</span>
        <span style={{ fontSize: '0.9rem' }}>
          {l.interestRatePercent.toFixed(2)}% {l.rateType === 'fixed' ? 'fixed' : 'variable'}
        </span>
      </div>
      {l.category === 'public' ? (
        <div style={{ fontSize: '0.9rem', marginBottom: 4 }}>
          <span style={{ color: 'var(--ui-primary-text, var(--text))' }}>{statusLabel(l.repaymentStatus)}</span>
          {l.subsidyType ? (
            <span style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.8rem' }}> · {l.subsidyType}</span>
          ) : null}
        </div>
      ) : null}
      {l.category === 'public' && l.nextPaymentDate ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))', marginBottom: 4 }}>
          Next payment date: {l.nextPaymentDate}
        </div>
      ) : null}
      <div style={{ fontSize: '0.9rem', marginBottom: 4, fontWeight: 700, color: 'var(--ui-primary-text, var(--text))' }}>
        Current monthly payment: {getActiveMonthlyPayment(l) != null ? formatCents(getActiveMonthlyPayment(l)!) : '-'}
      </div>
      {l.category === 'private' ? (
        <>
          <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
            Payment phase: {l.activePrivateRangeMode === 'deferred' ? 'Deferred / Forbearance' : l.activePrivateRangeMode === 'interest_only' ? 'Interest Only' : l.activePrivateRangeMode === 'full_repayment' ? 'Full Repayment' : l.activePrivateRangeMode === 'custom_monthly' ? 'Custom' : '-'}
          </div>
          {l.activePrivateRangeMode === 'deferred' && l.deferredDailyInterestCents != null && l.deferredDaysInRange != null && l.deferredInterestTotalCents != null && l.deferredProjectedBalanceCents != null ? (
            <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
              <div style={{ marginBottom: 2 }}>Deferred / Forbearance</div>
              <div style={{ color: 'var(--ui-primary-text, var(--text))', marginBottom: 2 }}>Days across deferred range: {l.deferredDaysInRange} days</div>
              <div style={{ color: 'var(--ui-primary-text, var(--text))', marginBottom: 2 }}>Interest accrued across deferment: {formatCents(l.deferredInterestTotalCents)}</div>
              <div style={{ color: 'var(--ui-primary-text, var(--text))' }}>Balance after deferment ends: {formatCents(l.deferredProjectedBalanceCents)}</div>
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
              Monthly interest: {formatCents(l.monthlyInterestCents)}
            </div>
          )}
          {l.dailyInterestCents > 0 && (
            <div style={{ fontSize: '0.85rem', marginBottom: 4, color: 'var(--ui-primary-text, var(--text))' }}>
              {formatCents(l.dailyInterestCents)} / day
            </div>
          )}
          {(l.unpaidInterestCents ?? 0) > 0 && (
            <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
              Unpaid accumulated interest: {formatCents(l.unpaidInterestCents!)}
            </div>
          )}
          <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
            {l.payoffMonths != null && l.payoffMonths > 0 ? (
              <>Estimated payoff: {addMonths(new Date(), l.payoffMonths).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</>
            ) : (
              <span style={{ color: 'var(--ui-primary-text, var(--text))' }}>Payment may be too low to reduce balance.</span>
            )}
          </div>
          {l.lender ? (
            <div style={{ fontSize: '0.75rem', color: 'var(--ui-primary-text, var(--text))', marginBottom: 4 }}>
              Servicer: {l.lender}
            </div>
          ) : null}
        </>
      ) : null}
      {l.category === 'public' && (l.totalFederalPaymentCents != null || l.approximateShareCents != null) ? (
        <>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 2 }}>
            Total federal payment (after grace): {l.totalFederalPaymentCents != null ? formatCents(l.totalFederalPaymentCents) : '-'}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))', marginBottom: 4 }}>
            Approximate share of total: {l.approximateShareCents != null ? formatCents(l.approximateShareCents) : '-'} (not separately calculated)
          </div>
        </>
      ) : null}
      {l.category === 'public' ? (
        <div style={{ fontSize: '0.75rem', color: 'var(--ui-primary-text, var(--text))', marginBottom: 4 }}>
          {l.lender ? `Servicer: ${l.lender} · ` : null}
          Interest accrual ≈ {formatCents(l.dailyInterestCents)}/day · {formatCents(l.monthlyInterestCents)}/mo
        </div>
      ) : null}
      {l.category === 'public' && l.federalPlans && l.federalPlans.length > 0 ? (
        <div style={{ marginBottom: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
            onClick={() => setPlansOpen((o) => !o)}
          >
            {plansOpen ? 'Hide' : 'Compare'} repayment plans
          </button>
          {plansOpen ? (
            <div style={{ marginTop: 8, overflowX: 'auto' }}>
              {(() => {
                const eligible = l.federalPlans!.filter((p) => p.eligible);
                const lowestId = eligible.length > 0
                  ? eligible.reduce((a, b) => (a.monthlyPaymentCents <= b.monthlyPaymentCents ? a : b)).planId
                  : null;
                return (
                  <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '4px 8px' }}>Plan</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px' }}>Total monthly</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px' }}>Forgiveness</th>
                      </tr>
                    </thead>
                    <tbody>
                      {l.federalPlans!.map((p) => (
                        <tr
                          key={p.planId}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            opacity: p.eligible ? 1 : 0.6
                          }}
                        >
                          <td style={{ padding: '4px 8px' }}>
                            <span>{p.planName}</span>
                            {p.planId === lowestId ? ' (lowest)' : ''}
                            {!p.eligible ? ' (not eligible)' : ''}
                            {p.note ? (
                              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 2 }}>
                                {p.note}
                              </span>
                            ) : null}
                          </td>
                          <td style={{ textAlign: 'right', padding: '4px 8px' }}>
                            {formatCents(p.monthlyPaymentCents)}
                          </td>
                          <td style={{ textAlign: 'right', padding: '4px 8px' }}>
                            {p.forgivenessYears} years
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="btn-row" style={{ marginTop: 6, flexWrap: 'wrap', gap: 6 }}>
        <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem', minHeight: 'unset' }} onClick={onEdit}>Edit</button>
        <button type="button" className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '0.85rem', minHeight: 'unset' }} onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

/** Simulator only: consolidated private loan monthly payment from total balance + rate + term. Does not modify any loan data. */
function ConsolidatedLoanSimulatorModal(props: {
  totalPrivateBalanceCents: number;
  currentTotalAfterGraceCents: number;
  onClose: () => void;
}) {
  const { totalPrivateBalanceCents, currentTotalAfterGraceCents, onClose } = props;
  const [rateInput, setRateInput] = useState('');
  const [termYearsInput, setTermYearsInput] = useState('10');

  const derived = useMemo(() => {
    const rate = parseFloat(rateInput || '0');
    const termYears = parseFloat(termYearsInput || '0');
    const termMonths = termYears > 0 ? Math.round(termYears * 12) : 0;
    const newMonthly =
      totalPrivateBalanceCents > 0 && termMonths > 0
        ? computeAmortizedPaymentCents(totalPrivateBalanceCents, rate, termMonths) ??
          computeInterestOnlyMonthlyCents(totalPrivateBalanceCents, rate)
        : totalPrivateBalanceCents > 0
          ? computeInterestOnlyMonthlyCents(totalPrivateBalanceCents, rate)
          : null;
    return { newMonthly };
  }, [totalPrivateBalanceCents, rateInput, termYearsInput]);

  return (
    <Modal open title="Consolidated loan (simulator)" onClose={onClose}>
      <p style={{ fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 0, marginBottom: 12 }}>
        Simulate one consolidated private loan using your total private balance. This does not change any real loan data.
      </p>
      <div className="summary-compact" style={{ marginBottom: 12 }}>
        <div className="summary-kv">
          <span className="k">Total private balance</span>
          <span className="v">{formatCents(totalPrivateBalanceCents)}</span>
        </div>
        <div className="summary-kv">
          <span className="k">Current after grace</span>
          <span className="v">{currentTotalAfterGraceCents > 0 ? formatCents(currentTotalAfterGraceCents) : '-'}</span>
        </div>
      </div>
      <div className="field">
        <label>New interest rate (%)</label>
        <input
          className="ll-control"
          value={rateInput}
          onChange={(e) => setRateInput(e.target.value)}
          inputMode="decimal"
          placeholder="e.g. 6.5"
          style={{ maxWidth: 140 }}
        />
      </div>
      <div className="field">
        <label>New term (years)</label>
        <input
          className="ll-control"
          value={termYearsInput}
          onChange={(e) => setTermYearsInput(e.target.value)}
          inputMode="numeric"
          placeholder="e.g. 10"
          style={{ maxWidth: 140 }}
        />
      </div>
      <div className="summary-compact" style={{ marginTop: 12 }}>
        <div className="summary-kv">
          <span className="k">New consolidation amount</span>
          <span className="v">{derived.newMonthly != null ? formatCents(derived.newMonthly) : '-'}</span>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

export type LoanViewFilter = 'public' | 'private';

export function LoansPage() {
  const data = useLedgerStore((s) => s.data);
  const { showConfirm } = useDialog();
  const [state, setState] = useState<LoansState>(() => loadLoans());
  const [showPublic, setShowPublic] = useState(() => loadLoansSectionShowPublic());
  const [showPrivate, setShowPrivate] = useState(() => loadLoansSectionShowPrivate());
  useEffect(() => {
    // Ensure mutual exclusivity if persisted settings are inconsistent.
    if (showPublic && showPrivate) {
      setShowPrivate(false);
      saveLoansSectionShowPrivate(false);
    }
  }, [showPublic, showPrivate]);
  const [showConsolidationModal, setShowConsolidationModal] = useState(false);
  const [showLoanToolsModal, setShowLoanToolsModal] = useState(false);
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; value: LoanEditorState } | null>(null);
  const [refiLoan, setRefiLoan] = useState<LoanWithDerived | null>(null);
  const [payoffLoan, setPayoffLoan] = useState<LoanWithDerived | null>(null);
  const [showAfterGraceBreakdown, setShowAfterGraceBreakdown] = useState(false);
  const [showRecomputeConfirm, setShowRecomputeConfirm] = useState(false);
  const [paymentNowOverride, setPaymentNowOverride] = useState<number | null>(() => loadPaymentNowManualOverride());
  const [showEditPaymentNow, setShowEditPaymentNow] = useState(false);
  const [editPaymentInput, setEditPaymentInput] = useState('');
  const [privateCarouselIdx, setPrivateCarouselIdx] = useState(0);
  const [showAllLoans, setShowAllLoans] = useState(false);

  // Ledger data from Supabase nightly interest accrual
  const [ledgerMap, setLedgerMap] = useState<Record<string, LedgerRow>>({});
  useEffect(() => {
    fetchLatestLedgerRows().then(setLedgerMap).catch(() => {});
    // Initial sync of all loans to Supabase (fire-and-forget)
    syncLoansToSupabase(state.loans || []).catch(() => {});
  }, []);

  const birthdateISO = loadBirthdateISO();

  // When Loans page loads: if any private loan's deferred range has ended, add deferred interest to balance once
  useEffect(() => {
    const s = loadLoans();
    const loans = s.loans || [];
    const updated = loans.map((l) => applyDeferredInterestToPrivateLoanIfNeeded(l) ?? l);
    if (updated.some((l, i) => l !== loans[i])) {
      saveLoans({ ...s, loans: updated });
      setState(loadLoans());
    }
  }, []);

  const detectedAgi = useMemo(
    () => getDetectedAgiFromRecurring((data.recurring || []) as any),
    [data.recurring]
  );
  const detectedAnnualIncomeCents = detectedAgi.agiCents;

  const allActiveLoans = useMemo(
    () => (state.loans || []).filter((l) => l.active !== false),
    [state.loans]
  );
  const loansWithDerived: LoanWithDerived[] = useMemo(() => {
    return allActiveLoans.map((l) =>
      deriveForLoan(l, state.loans || [], detectedAnnualIncomeCents, null, ledgerMap)
    );
  }, [state.loans, allActiveLoans, detectedAnnualIncomeCents, ledgerMap]);

  // Split for rendering
  const publicLoansWithDerived = useMemo(() => loansWithDerived.filter(l => l.category === 'public'), [loansWithDerived]);
  const privateLoansWithDerived = useMemo(() => loansWithDerived.filter(l => l.category === 'private'), [loansWithDerived]);

  const displayedPrivateLoans = showAllLoans ? privateLoansWithDerived : privateLoansWithDerived.slice(0, 5);



  const summary = useMemo(() => {
    let totalBalance = 0;
    let totalMonthlyNow = 0;
    let totalMonthlyLater = 0;
    let anyLater = false;

    // Per-category accumulators
    let publicBalanceCents = 0;
    let publicUnpaidInterestCents = 0;
    let publicDailyInterestCents = 0;
    let publicWeightedRateNum = 0;
    let privateBalanceCents = 0;
    let privateUnpaidInterestCents = 0;
    let privateDailyInterestCents = 0;
    let privateWeightedRateNum = 0;

    loansWithDerived.forEach((l) => {
      const bal = l.balanceCents || 0;
      totalBalance += bal;
      if (l.monthlyNowCents != null) totalMonthlyNow += l.monthlyNowCents;
      if (l.monthlyLaterCents != null) { totalMonthlyLater += l.monthlyLaterCents; anyLater = true; }

      if (l.category === 'public') {
        publicBalanceCents += bal;
        publicUnpaidInterestCents += l.unpaidInterestCents ?? 0;
        publicDailyInterestCents += l.dailyInterestCents;
        publicWeightedRateNum += bal * l.interestRatePercent;
      } else {
        privateBalanceCents += bal;
        privateUnpaidInterestCents += l.unpaidInterestCents ?? 0;
        privateDailyInterestCents += l.dailyInterestCents;
        privateWeightedRateNum += bal * l.interestRatePercent;
      }
    });

    const avgPublicRate = publicBalanceCents > 0 ? publicWeightedRateNum / publicBalanceCents : null;
    const avgPrivateRate = privateBalanceCents > 0 ? privateWeightedRateNum / privateBalanceCents : null;

    // Payoff age
    let latestPayoffDate: Date | null = null;
    loansWithDerived.forEach((l) => {
      const endISO = (l as LoanWithDerived).latestRangeEndISO;
      if (endISO) {
        const d = new Date(endISO + 'T00:00:00');
        if (!latestPayoffDate || d > latestPayoffDate) latestPayoffDate = d;
      }
    });
    let payoffAge: number | null = null;
    if (latestPayoffDate && birthdateISO) {
      payoffAge = computeAgeFromBirthdate(birthdateISO, latestPayoffDate);
    }

    return {
      totalBalance,
      totalMonthlyNow,
      totalMonthlyLater: anyLater ? totalMonthlyLater : null,
      avgPrivateRate,
      avgPublicRate,
      payoffAge,
      publicBalanceCents,
      publicUnpaidInterestCents,
      publicDailyInterestCents,
      privateBalanceCents,
      totalUnpaidInterestCents: privateUnpaidInterestCents,
      totalDailyInterestCents: privateDailyInterestCents,
    };
  }, [loansWithDerived, birthdateISO]);

  /** After-grace: per private loan use first future value (custom → full repayment → interest-only). */
  const afterGraceBreakdown = useMemo(() => {
    const privateLoansBreakdown: {
      name: string;
      afterGraceCents: number;
      interestCents?: number;
      principalCents?: number;
      fromCustom?: boolean;
      isProjected?: boolean;
    }[] = [];
    let privateAfterGraceCents = 0;
    loansWithDerived.forEach((l) => {
      if (l.category !== 'private') return;
      const cents = l.futureFullRepaymentCents ?? 0;
      const fromCustom = l.futureValueFromCustom ?? false;
      const isProjected = l.futureIsProjected ?? false;
      if (cents > 0 || fromCustom) {
        privateAfterGraceCents += cents;
        privateLoansBreakdown.push({
          name: l.name,
          afterGraceCents: cents,
          interestCents: l.futureFullRepaymentInterestCents ?? undefined,
          principalCents: l.futureFullRepaymentPrincipalCents ?? undefined,
          fromCustom,
          isProjected
        });
      }
    });
    // Public loans: sum monthlyLaterCents from individual public loan records
    let publicAfterGraceCents = 0;
    loansWithDerived.forEach((l) => {
      if (l.category !== 'public') return;
      if (l.monthlyLaterCents != null && l.monthlyLaterCents > 0) publicAfterGraceCents += l.monthlyLaterCents;
    });
    return {
      privateAfterGraceCents,
      privateLoansBreakdown,
      publicAfterGraceCents,
      combinedAfterGraceCents: privateAfterGraceCents + publicAfterGraceCents
    };
  }, [loansWithDerived]);

  function persist(next: Partial<LoansState>) {
    setState((prev) => {
      const merged: LoansState = {
        version: 1,
        loans: next.loans !== undefined ? next.loans : prev.loans
      };
      saveLoans(merged);
      // Sync all loans to Supabase for nightly interest accrual (fire-and-forget)
      syncLoansToSupabase(merged.loans || []).catch(() => {});
      return merged;
    });
  }

  const hasRecurringIncome = detectedAgi.grossCents > 0;
  const paymentNowDisplayClass =
    summary.totalMonthlyNow >= 0 ? 'summary-kv final-net-cash positive' : 'summary-kv final-net-cash negative';
  const paymentNowAmountColor = summary.totalMonthlyNow > 0 ? 'var(--red)' : 'var(--green)';

  return (
    <div className="tab-panel active" id="loansContent">
      <p className="section-title page-title" style={{ marginBottom: 8 }}>Loans</p>

      {/* Loans Summary — ring: 4 segments (public principal, public interest, private principal, private interest) */}
      {(() => {
        const publicCents = summary.publicBalanceCents;
        const publicInterestCents = summary.publicUnpaidInterestCents;
        const publicDailyInterestCents = summary.publicDailyInterestCents;
        const privateCents = summary.privateBalanceCents;
        const privateInterestCents = summary.totalUnpaidInterestCents;
        const privateDailyInterestCents = summary.totalDailyInterestCents;

        const grandTotalCents = publicCents + publicInterestCents + privateCents + privateInterestCents;

        const size = 180;
        const cx = size / 2;
        const cy = size / 2;
        const r = 68;
        const stroke = 14;
        const circum = 2 * Math.PI * r;

        // Ring: 4 segments — public principal, public interest, private principal, private interest
        const segments = [
          { cents: publicCents, color: 'var(--green)', key: 'pub' },
          { cents: publicInterestCents, color: 'color-mix(in srgb, var(--green) 45%, transparent)', key: 'pub-interest' },
          { cents: privateCents, color: 'var(--blue, #4a90d9)', key: 'priv-principal' },
          { cents: privateInterestCents, color: 'var(--accent)', key: 'priv-interest' },
        ].filter(s => s.cents > 0);

        const segCount = segments.length;
        const gap = segCount > 1 ? 3 : 0;
        const totalGap = gap * segCount;
        const usable = circum - totalGap;

        let offset = 0;
        const arcs = segments.map(seg => {
          const len = grandTotalCents > 0 ? (seg.cents / grandTotalCents) * usable : 0;
          const arc = { ...seg, len, offset: -offset };
          offset += len + gap;
          return arc;
        });

        // Center: compact format with k suffix (reflects principal + interest combined)
        const centerFormatted = (() => {
          const dollars = Math.abs(grandTotalCents) / 100;
          const sign = grandTotalCents < 0 ? '-' : '';
          if (dollars >= 1000) return `${sign}$${(dollars / 1000).toFixed(1)}k`;
          return formatCents(grandTotalCents);
        })();
        const charCount = centerFormatted.length;
        const fontSize = charCount <= 7 ? '1.5rem' : charCount <= 9 ? '1.25rem' : charCount <= 11 ? '1.05rem' : '0.9rem';

        return (
          <div className="loans-summary-card">
            <div className="loans-summary-title">Loans Summary</div>
            <div className="loans-donut-wrap">
              <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="loans-donut-svg">
                <defs>
                  <filter id="donutGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                {/* Background track */}
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} opacity={0.1} />
                {/* Segments */}
                {arcs.map((arc, i) => (
                  <circle
                    key={i}
                    cx={cx} cy={cy} r={r} fill="none"
                    stroke={arc.color} strokeWidth={stroke}
                    strokeDasharray={`${arc.len} ${circum - arc.len}`}
                    strokeDashoffset={arc.offset}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${cx} ${cy})`}
                    filter="url(#donutGlow)"
                    style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.22, 1, 0.36, 1), stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1)' }}
                  />
                ))}
              </svg>
              <div className="loans-donut-center">
                <div className="loans-donut-amount" style={{ fontSize }}>{centerFormatted}</div>
                <div className="loans-donut-label">Total Balance</div>
              </div>
            </div>
            {/* Legend */}
            <div className="loans-summary-rows">
              {/* Public */}
              {publicCents > 0 && (
                <>
                  <div className="loans-legend-row">
                    <span className="loans-legend-dot" style={{ background: 'var(--green)' }} />
                    <span className="loans-legend-label">Public</span>
                    <span className="loans-legend-value"><AnimatedNumber value={publicCents} format={formatCents} cacheKey="loan_public" /></span>
                  </div>
                  {(publicInterestCents > 0 || publicDailyInterestCents > 0) && (
                    <div className="loans-legend-details" style={{ paddingLeft: 22, fontSize: '0.8rem', opacity: 0.75, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2, marginBottom: 4 }}>
                      {publicInterestCents > 0 && (
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'color-mix(in srgb, var(--green) 45%, transparent)', marginRight: 6, verticalAlign: 'middle' }} />Outstanding Interest: {formatCents(publicInterestCents)}</span>
                      )}
                      {publicDailyInterestCents > 0 && (
                        <span>{formatCents(publicDailyInterestCents)} Added / Day</span>
                      )}
                    </div>
                  )}
                </>
              )}
              {/* Private */}
              {privateCents > 0 && (
                <>
                  <div className="loans-legend-row">
                    <span className="loans-legend-dot" style={{ background: 'var(--blue, #4a90d9)' }} />
                    <span className="loans-legend-label">Private</span>
                    <span className="loans-legend-value"><AnimatedNumber value={privateCents} format={formatCents} cacheKey="loan_priv_principal" /></span>
                  </div>
                  {(privateInterestCents > 0 || privateDailyInterestCents > 0) && (
                    <div className="loans-legend-details" style={{ paddingLeft: 22, fontSize: '0.8rem', opacity: 0.75, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2, marginBottom: 4 }}>
                      {privateInterestCents > 0 && (
                        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', marginRight: 6, verticalAlign: 'middle' }} />Unpaid Accumulated Interest: {formatCents(privateInterestCents)}</span>
                      )}
                      {privateDailyInterestCents > 0 && (
                        <span>{formatCents(privateDailyInterestCents)} Added / Day</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Payment */}
            <div className="loans-summary-payment">
              <div className={paymentNowDisplayClass} style={{ marginTop: 0, alignItems: 'center' }}>
                <span className="k" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Monthly Payment
                  <button
                    type="button"
                    className="info-icon"
                    aria-label="Future payment breakdown"
                    onClick={(e) => { e.stopPropagation(); setShowAfterGraceBreakdown(true); }}
                  />
                </span>
                <span className="v" style={{ color: paymentNowAmountColor }}>
                  {summary.totalMonthlyNow > 0 ? <AnimatedNumber value={summary.totalMonthlyNow} format={formatCents} cacheKey="loan_monthly" /> : '-'}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      <div
        className="segmented"
        style={{
          display: 'flex',
          gap: 0,
          marginTop: 16,
          marginBottom: 12,
          borderRadius: 999,
          padding: 2,
          background: 'var(--ui-card-bg, var(--surface))',
          border: '1px solid var(--ui-border, var(--border))'
        }}
        role="tablist"
        aria-label="Loan type"
      >
        <button
          type="button"
          role="tab"
          aria-selected={showPublic}
          style={{
            flex: 1,
            padding: '10px 14px',
            fontSize: '0.9rem',
            fontWeight: showPublic ? 600 : 500,
            borderRadius: 999,
            background: showPublic
              ? 'color-mix(in srgb, var(--ui-add-btn, var(--accent)) 15%, transparent)'
              : 'transparent',
            color: 'var(--ui-primary-text, var(--text))',
            border: `1px solid ${showPublic ? 'var(--ui-add-btn, var(--accent))' : 'transparent'}`,
            cursor: 'pointer',
            transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease'
          }}
          onClick={() => {
            const nextShowPublic = !showPublic;
            setShowPublic(nextShowPublic);
            saveLoansSectionShowPublic(nextShowPublic);
            setShowPrivate(false);
            saveLoansSectionShowPrivate(false);
          }}
        >
          Public
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={showPrivate}
          style={{
            flex: 1,
            padding: '10px 14px',
            fontSize: '0.9rem',
            fontWeight: showPrivate ? 600 : 500,
            borderRadius: 999,
            background: showPrivate
              ? 'color-mix(in srgb, var(--ui-add-btn, var(--accent)) 15%, transparent)'
              : 'transparent',
            color: 'var(--ui-primary-text, var(--text))',
            border: `1px solid ${showPrivate ? 'var(--ui-add-btn, var(--accent))' : 'transparent'}`,
            cursor: 'pointer',
            transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease'
          }}
          onClick={() => {
            const nextShowPrivate = !showPrivate;
            setShowPrivate(nextShowPrivate);
            saveLoansSectionShowPrivate(nextShowPrivate);
            setShowPublic(false);
            saveLoansSectionShowPublic(false);
          }}
        >
          Private
        </button>
      </div>

      {showPublic ? (
        <div style={{ marginBottom: 16 }}>
          {publicLoansWithDerived.length === 0 ? (
            <p className="empty-state-desc" style={{ marginTop: 0, marginBottom: 12 }}>
              No federal loans. Add your public (federal) student loans here.
            </p>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              className="btn-icon-circle"
              aria-label="Add public loan"
              onClick={() => setEditor({ mode: 'add', value: { ...loanToEditor(null, hasRecurringIncome), category: 'public' } })}
            >
              <IconPlus />
            </button>
          </div>
          {publicLoansWithDerived.length > 0 && (
            <div className="card-carousel" style={{ marginBottom: 0 }}>
              {publicLoansWithDerived.map((l) => (
                <div className="card-carousel-item" key={l.id}>
                  <LoanCard
                    loan={l}
                    onEdit={() => setEditor({ mode: 'edit', value: loanToEditor(l, hasRecurringIncome) })}
                    onDelete={async () => {
                      const ok = await showConfirm('Delete this loan?');
                      if (!ok) return;
                      persist({ loans: state.loans.filter((x) => x.id !== l.id) });
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
      {showPrivate ? (
        <>
          {privateLoansWithDerived.length === 0 ? (
            <p className="empty-state-desc" style={{ marginTop: 0, marginBottom: 12 }}>
              No private loans. Track student and other private loans here. All values are manual and for estimates only.
            </p>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              className="snapshot-util-btn"
              onClick={() => setShowLoanToolsModal(true)}
            >
              Loan Tools
            </button>
            <button
              type="button"
              className="snapshot-add-btn"
              onClick={() =>
                setEditor({
                  mode: 'add',
                  value: { ...loanToEditor(null, hasRecurringIncome), category: 'private' }
                })
              }
            >
              <IconPlus /> Add
            </button>
          </div>
          <div
            className="card-carousel"
            style={{ marginBottom: 0 }}
            onScroll={(e) => {
              const el = e.currentTarget;
              const rawIdx = el.scrollLeft / (el.clientWidth || 1);
              setPrivateCarouselIdx(Math.round(rawIdx));
              scheduleSnapCorrection(el);
            }}
          >
          {displayedPrivateLoans.map((l) => (
            <div className="card-carousel-item" key={l.id}>
            <LoanCard
              loan={l}
              onEdit={() => setEditor({ mode: 'edit', value: loanToEditor(l, hasRecurringIncome) })}
              onDelete={async () => {
                const ok = await showConfirm('Delete this loan?');
                if (!ok) return;
                persist({ loans: state.loans.filter((x) => x.id !== l.id) });
              }}
            />
            </div>
          ))}
          </div>
          {displayedPrivateLoans.length > 1 && (showAllLoans && privateLoansWithDerived.length >= 5 ? (
            <div style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 6, marginBottom: 8 }}>
              {privateCarouselIdx + 1} of {displayedPrivateLoans.length}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 6, marginBottom: 8 }}>
                {displayedPrivateLoans.map((_, i) => (
                  <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i === privateCarouselIdx ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s', display: 'inline-block', flexShrink: 0 }} />
                ))}
              </div>
              {privateLoansWithDerived.length >= 5 && privateCarouselIdx >= displayedPrivateLoans.length - 1 ? (
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 14px', minHeight: 'unset' }} onClick={() => setShowAllLoans(true)}>See more</button>
                </div>
              ) : null}
            </>
          ))}
        </>
      ) : null}

      <Modal
        open={showLoanToolsModal}
        title="Loan Tools"
        onClose={() => setShowLoanToolsModal(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.9rem', padding: '6px 12px' }}
              onClick={() => { setShowLoanToolsModal(false); setShowRecomputeConfirm(true); }}
            >
              Recalculate monthly payment
            </button>
            <p style={{ marginTop: 4, marginBottom: 0, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
              Recalculates based on your current balances, rates, and payment schedule.
            </p>
          </div>
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.9rem', padding: '6px 12px' }}
              onClick={() => { setShowLoanToolsModal(false); setShowConsolidationModal(true); }}
            >
              See consolidated loan
            </button>
            <p style={{ marginTop: 4, marginBottom: 0, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
              Simulate one consolidated private loan (rate and term). Does not change any real loan data.
            </p>
          </div>
        </div>
      </Modal>

      {showConsolidationModal ? (
        <ConsolidatedLoanSimulatorModal
          totalPrivateBalanceCents={summary.privateBalanceCents}
          currentTotalAfterGraceCents={afterGraceBreakdown.privateAfterGraceCents}
          onClose={() => setShowConsolidationModal(false)}
        />
      ) : null}

      {/* Loan editor modal */}
      <Modal
        open={!!editor}
        fullscreen
        title={editor?.mode === 'edit' ? 'Edit loan' : 'Add loan'}
        onClose={() => setEditor(null)}
      >
        {editor ? (
          <LoanEditorForm
            state={editor.value}
            hasRecurringIncome={hasRecurringIncome}
            agiSource={hasRecurringIncome ? 'recurring' : 'none'}
            retirementContributionsCents={detectedAgi.retirementContributionsCents}
            onChange={(next) =>
              setEditor((prev) => (prev ? { ...prev, value: next } : prev))
            }
            onCancel={() => setEditor(null)}
            onSave={() => {
              const existing =
                editor && editor.mode === 'edit' && editor.value.id
                  ? state.loans.find((x) => x.id === editor.value.id)
                  : null;
              const loan = editorToLoan(editor.value, existing || null);
              if (!loan) return;
              if (existing) {
                persist({
                  loans: state.loans.map((x) => (x.id === existing.id ? loan : x))
                });
              } else {
                persist({ loans: [...state.loans, loan] });
              }
              setEditor(null);
            }}
          />
        ) : null}
      </Modal>

      {/* Payoff age modal */}
      <Modal
        open={!!payoffLoan}
        fullscreen
        title="Estimated payoff age"
        onClose={() => setPayoffLoan(null)}
      >
        {payoffLoan ? (
          <PayoffDetails loan={payoffLoan} birthdateISO={birthdateISO} />
        ) : null}
      </Modal>

      {/* Refinance modal (private loans only) — uses this loan's after-grace value */}
      <Modal
        open={!!refiLoan}
        fullscreen
        title="After-grace refinance"
        onClose={() => setRefiLoan(null)}
      >
        {refiLoan ? <RefinanceSimulator loan={refiLoan} /> : null}
      </Modal>

      {/* Recompute Payment(now) confirmation */}
      <Modal
        open={showRecomputeConfirm}
        title="Recalculate Monthly Payment"
        onClose={() => setShowRecomputeConfirm(false)}
      >
        <p style={{ marginTop: 0, marginBottom: 16 }}>
          This will recalculate your private loan balances and update the monthly payment total. Continue?
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowRecomputeConfirm(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const today = todayISO();
              const lastDate = loadLastRecomputeDate();
              if (lastDate === today) {
                const loansState = loadLoans();
                savePrivatePaymentNowBase(
                  getPrivatePaymentNowTotal(loansState.loans || [], detectedAnnualIncomeCents)
                );
                setState(loadLoans());
                setShowRecomputeConfirm(false);
                return;
              }
              const loansState = loadLoans();
              const map = getLoanEstimatedPaymentNowMap(loansState.loans || [], detectedAnnualIncomeCents);
              const paymentNowByLoanId: Record<string, number> = {};
              for (const [id, cents] of Object.entries(map)) {
                if (cents != null && cents > 0) paymentNowByLoanId[id] = cents;
              }
              applyRecomputeCycleToPrivateBalances(paymentNowByLoanId);
              const newState = loadLoans();
              savePrivatePaymentNowBase(
                getPrivatePaymentNowTotal(newState.loans || [], detectedAnnualIncomeCents)
              );
              setState(loadLoans());
              setShowRecomputeConfirm(false);
            }}
          >
            Confirm
          </button>
        </div>
      </Modal>

      {/* Edit Payment(now) modal */}
      <Modal
        open={showEditPaymentNow}
        title="Edit Monthly Payment"
        onClose={() => setShowEditPaymentNow(false)}
      >
        <p style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 0, marginBottom: 12 }}>
          Override the displayed monthly payment total to any value. This only affects what is shown here and does not change balances or other calculations.
        </p>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: '0.9rem' }}>Monthly Payment ($)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={editPaymentInput}
            onChange={(e) => setEditPaymentInput(e.target.value)}
            style={{
              width: '100%',
              padding: 8,
              fontSize: '1rem',
              borderRadius: 6,
              border: '1px solid var(--ui-outline-btn, var(--ui-border, var(--border)))',
              background: 'var(--ui-modal-bg, var(--surface))',
              color: 'var(--ui-primary-text, var(--text))'
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const parsed = parseFloat(editPaymentInput);
              const cents = Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0;
              savePaymentNowManualOverride(cents);
              setPaymentNowOverride(cents);
              setShowEditPaymentNow(false);
            }}
          >
            Save
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setShowEditPaymentNow(false)}>
            Cancel
          </button>
        </div>
      </Modal>

      {/* Future Estimated Payments (after-grace) info popup */}
      <Modal
        open={showAfterGraceBreakdown}
        fullscreen
        title="Future Estimated Payments"
        onClose={() => setShowAfterGraceBreakdown(false)}
      >
        <p style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 0, marginBottom: 12 }}>
          If all private loans moved to full repayment, total monthly would be below. Public = estimated monthly payment.
        </p>
        <div className="summary-compact" style={{ gap: 8 }}>
          {afterGraceBreakdown.privateLoansBreakdown.length > 0 ? (
            <>
              <div style={{ marginBottom: 4, fontSize: '0.85rem', fontWeight: 600 }}>Private Loan After Grace Breakdown</div>
              {afterGraceBreakdown.privateLoansBreakdown.map((row) => (
                <div key={row.name} style={{ marginBottom: 8 }}>
                  <div className="summary-kv">
                    <span className="k">{row.name}</span>
                    <span className="v" style={{ color: 'var(--red)' }}>{formatCents(row.afterGraceCents)}</span>
                  </div>
                  {row.isProjected ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', marginLeft: 8, marginTop: 2 }}>
                      Est. full repayment (projected){row.interestCents != null ? ` · Interest: ${formatCents(row.interestCents)}` : ''}
                    </div>
                  ) : row.fromCustom ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', marginLeft: 8, marginTop: 2 }}>
                      Manual input override: {formatCents(row.afterGraceCents)}
                    </div>
                  ) : row.interestCents != null && row.principalCents != null ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', marginLeft: 8, marginTop: 2 }}>
                      Interest: {formatCents(row.interestCents)} · Principal: {formatCents(row.principalCents)} · Full: {formatCents(row.afterGraceCents)}
                    </div>
                  ) : null}
                </div>
              ))}
              <div className="summary-kv" style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                <span className="k">Total Private After Grace</span>
                <span className="v" style={{ color: 'var(--red)' }}>
                  {formatCents(afterGraceBreakdown.privateAfterGraceCents)}
                </span>
              </div>
            </>
          ) : (
            <div className="summary-kv">
              <span className="k">Private Loans After Grace</span>
              <span className="v" style={{ color: 'var(--red)' }}>-</span>
            </div>
          )}
          <div className="summary-kv">
            <span className="k">Public Loans After Grace</span>
            <span className="v" style={{ color: 'var(--red)' }}>
              {afterGraceBreakdown.publicAfterGraceCents > 0 ? formatCents(afterGraceBreakdown.publicAfterGraceCents) : '-'}
            </span>
          </div>
          <div className="summary-kv" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span className="k">Combined After Grace</span>
            <span className="v" style={{ color: 'var(--red)', fontWeight: 600 }}>
              {afterGraceBreakdown.combinedAfterGraceCents > 0 ? formatCents(afterGraceBreakdown.combinedAfterGraceCents) : '-'}
            </span>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setShowAfterGraceBreakdown(false)}>
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}

function LoanEditorForm(props: {
  state: LoanEditorState;
  hasRecurringIncome: boolean;
  agiSource: 'recurring' | 'none';
  retirementContributionsCents: number;
  onChange: (next: LoanEditorState) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { state, onChange, onCancel, onSave, hasRecurringIncome, agiSource, retirementContributionsCents } = props;
  const idrAllowed = state.category === 'public';

  return (
    <>
      <div className="field">
        <label>Loan name</label>
        <input
          value={state.name}
          onChange={(e) => onChange({ ...state, name: e.target.value })}
          placeholder="e.g. Student Loan A"
        />
      </div>
      <div className="field">
        <label>Lender / Servicer</label>
        <input
          value={state.lender}
          onChange={(e) => onChange({ ...state, lender: e.target.value })}
          placeholder={state.category === 'public' ? 'e.g. Dept of Ed / Nelnet' : 'e.g. SoFi'}
        />
      </div>
      <div className="field">
        <label>Category</label>
        <Select
          value={state.category}
          onChange={(e) => {
            const category = e.target.value === 'private' ? 'private' : 'public';
            let repaymentStatus = state.repaymentStatus;
            if (category === 'private' && repaymentStatus === 'idr') {
              repaymentStatus = 'full_repayment';
            }
            onChange({ ...state, category, repaymentStatus });
          }}
        >
          <option value="public">Public</option>
          <option value="private">Private</option>
        </Select>
      </div>
      {state.category === 'public' ? (
        <>
          <div className="field">
            <label>Subsidy type</label>
            <Select
              value={state.subsidyType}
              onChange={(e) =>
                onChange({
                  ...state,
                  subsidyType: e.target.value === 'subsidized' ? 'subsidized' : 'unsubsidized'
                })
              }
            >
              <option value="subsidized">Subsidized</option>
              <option value="unsubsidized">Unsubsidized</option>
            </Select>
            <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
              Subsidized: no interest during school/grace. Unsubsidized: interest from disbursement.
            </p>
          </div>
          <div className="field">
            <label>Disbursement date</label>
            <input
              type="date"
              value={state.disbursementDate}
              onChange={(e) => onChange({ ...state, disbursementDate: e.target.value })}
              style={{
                padding: '6px 8px',
                borderRadius: 4,
                border: '1px solid var(--border)',
                background: 'var(--ui-card-bg, var(--surface))',
                color: 'var(--ui-primary-text, var(--text))',
                fontSize: '0.9rem',
                width: '100%'
              }}
            />
            <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
              {state.subsidyType === 'unsubsidized'
                ? 'Date interest started accruing. Also used for plan eligibility.'
                : 'Used for federal plan eligibility.'}
            </p>
          </div>
          {state.subsidyType === 'unsubsidized' && (
            <div className="field" style={{ marginTop: 4 }}>
              <label>Disbursements (for per-disbursement interest)</label>
              {state.disbursements.map((d, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                  <input type="date" value={d.date} onChange={(e) => { const next = state.disbursements.slice(); next[idx] = { ...d, date: e.target.value }; onChange({ ...state, disbursements: next }); }} style={{ flex: 1, padding: '4px 6px' }} />
                  <input type="text" inputMode="decimal" value={d.amount} placeholder="$" onChange={(e) => { const next = state.disbursements.slice(); next[idx] = { ...d, amount: e.target.value }; onChange({ ...state, disbursements: next }); }} style={{ width: 90, padding: '4px 6px' }} />
                  <button type="button" style={{ padding: '2px 6px', fontSize: '0.8rem' }} onClick={() => onChange({ ...state, disbursements: state.disbursements.filter((_, i) => i !== idx) })}>X</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 8px', marginTop: 2 }} onClick={() => onChange({ ...state, disbursements: [...state.disbursements, { date: '', amount: '' }] })}>
                Add disbursement
              </button>
            </div>
          )}
          <div className="field">
            <label>Borrower type</label>
            <Select
              value={state.borrowerType}
              onChange={(e) =>
                onChange({
                  ...state,
                  borrowerType: (e.target.value === 'parent' ? 'parent' : 'student') as LoanBorrowerType
                })
              }
            >
              <option value="student">Student</option>
              <option value="parent">Parent (Parent PLUS)</option>
            </Select>
            <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
              Parent PLUS is eligible only for Standard repayment unless consolidated.
            </p>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 0, marginBottom: 8 }}>
            Household size, AGI, repayment plan, and poverty level are set in Public Loan Parameters (above).
          </p>
        </>
      ) : null}
      <div className="field">
        <label>Current balance ($)</label>
        <input
          value={state.balance}
          onChange={(e) => onChange({ ...state, balance: e.target.value })}
          inputMode="decimal"
          placeholder="0.00"
        />
      </div>
      <div className="field">
        <label>Interest rate (%)</label>
        <input
          value={state.ratePercent}
          onChange={(e) => onChange({ ...state, ratePercent: e.target.value })}
          inputMode="decimal"
          placeholder="e.g. 6.80"
        />
      </div>
      <div className="field">
        <label>Rate type</label>
        <Select
          value={state.rateType}
          onChange={(e) =>
            onChange({
              ...state,
              rateType: e.target.value === 'variable' ? 'variable' : 'fixed'
            })
          }
        >
          <option value="fixed">Fixed</option>
          <option value="variable">Variable</option>
        </Select>
      </div>
      {state.category !== 'public' ? (
        <>
          <div className="field">
            <label style={{ display: 'block', marginBottom: 6 }}>Payment date ranges</label>
            <p style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 0, marginBottom: 8 }}>
              Set your payment schedule. The range that covers today determines your current monthly payment.
            </p>
            {state.privatePaymentRanges.map((r, idx) => (
              <div
                key={r.id}
                style={{
                  marginBottom: 10,
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: 'var(--ui-modal-bg, var(--surface))'
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <input
                    type="date"
                    value={r.startDate}
                    onChange={(e) =>
                      onChange({
                        ...state,
                        privatePaymentRanges: state.privatePaymentRanges.map((x, i) =>
                          i === idx ? { ...x, startDate: e.target.value } : x
                        )
                      })
                    }
                    style={{ maxWidth: 140 }}
                  />
                  <span style={{ color: 'var(--ui-primary-text, var(--text))' }}>to</span>
                  <input
                    type="date"
                    value={r.endDate}
                    onChange={(e) =>
                      onChange({
                        ...state,
                        privatePaymentRanges: state.privatePaymentRanges.map((x, i) =>
                          i === idx ? { ...x, endDate: e.target.value } : x
                        )
                      })
                    }
                    style={{ maxWidth: 140 }}
                  />
                  <Select
                    value={r.mode}
                    onChange={(e) =>
                      onChange({
                        ...state,
                        privatePaymentRanges: state.privatePaymentRanges.map((x, i) =>
                          i === idx ? { ...x, mode: e.target.value as PrivatePaymentRangeMode } : x
                        )
                      })
                    }
                    style={{ minWidth: 160 }}
                  >
                    <option value="deferred">Deferred / Forbearance</option>
                    <option value="interest_only">Interest Only</option>
                    <option value="full_repayment">Full Repayment</option>
                    <option value="custom_monthly">Custom Monthly Payment</option>
                  </Select>
                  {r.mode === 'custom_monthly' ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="$/mo"
                      value={r.customPayment}
                      onChange={(e) =>
                        onChange({
                          ...state,
                          privatePaymentRanges: state.privatePaymentRanges.map((x, i) =>
                            i === idx ? { ...x, customPayment: e.target.value } : x
                          )
                        })
                      }
                      style={{ width: 72 }}
                    />
                  ) : null}
                </div>
                {state.privatePaymentRanges.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '2px 8px' }}
                    onClick={() =>
                      onChange({
                        ...state,
                        privatePaymentRanges: state.privatePaymentRanges.filter((_, i) => i !== idx)
                      })
                    }
                  >
                    Remove range
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 4, fontSize: '0.85rem' }}
              onClick={() =>
                onChange({
                  ...state,
                  privatePaymentRanges: [
                    ...state.privatePaymentRanges,
                    {
                      id: uid(),
                      startDate: toDateKey(new Date()),
                      endDate: FAR_FUTURE_ISO,
                      mode: 'full_repayment',
                      customPayment: ''
                    }
                  ]
                })
              }
            >
              Add range
            </button>
          </div>
        </>
      ) : null}
      {state.category === 'private' ? (
        <>
          <div className="field" style={{ marginTop: 8 }}>
            <label>Current interest balance ($, from AES)</label>
            <input
              type="text"
              inputMode="decimal"
              value={state.currentInterestBalance}
              onChange={(e) => onChange({ ...state, currentInterestBalance: e.target.value })}
              placeholder="e.g. 87.87"
            />
            <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
              Check your AES account for the current unpaid interest on this loan.
            </p>
          </div>
          {state.privatePaymentRanges.some(r => r.mode === 'interest_only') && (
            <div className="field" style={{ marginTop: 4 }}>
              <label>Billing day of month (1-31)</label>
              <input
                type="text"
                inputMode="numeric"
                value={state.billingDayOfMonth}
                onChange={(e) => onChange({ ...state, billingDayOfMonth: e.target.value })}
                placeholder="e.g. 10"
              />
              <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
                What day of the month does AES bill you for this loan?
              </p>
            </div>
          )}
        </>
      ) : null}
      {state.category === 'public' ? (
        <p style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
          Federal plan estimates use discretionary income (AGI − 150% of poverty guideline). IBR/PAYE/ICR/RAP eligibility depends on disbursement dates.
        </p>
      ) : null}
      <div className="field">
        <label>Notes (optional)</label>
        <textarea
          value={state.notes}
          onChange={(e) => onChange({ ...state, notes: e.target.value })}
          placeholder="Optional details"
        />
      </div>
      <div className="toggle-row" style={{ marginTop: 4 }}>
        <input
          type="checkbox"
          id="loanActive"
          checked={state.active}
          onChange={(e) => onChange({ ...state, active: e.target.checked })}
        />
        <label htmlFor="loanActive">Active loan</label>
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-secondary" onClick={onSave}>
          Save
        </button>
      </div>
    </>
  );
}

function PayoffDetails(props: { loan: LoanWithDerived; birthdateISO: string | null }) {
  const { loan, birthdateISO } = props;
  const now = new Date();
  const payoffDate =
    loan.payoffMonths != null && loan.payoffMonths > 0 ? addMonths(now, loan.payoffMonths) : null;
  const payoffAge =
    payoffDate && birthdateISO ? computeAgeFromBirthdate(birthdateISO, payoffDate) : null;

  return (
    <>
      <p style={{ fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 0 }}>
        This estimate assumes your current interest rate and estimated monthly payment stay
        constant until the loan is paid off.
      </p>
      <div className="summary-compact" style={{ marginTop: 8 }}>
        <div className="summary-kv">
          <span className="k">Loan</span>
          <span className="v">{loan.name}</span>
        </div>
        <div className="summary-kv">
          <span className="k">Balance</span>
          <span className="v" style={{ color: 'var(--red)' }}>
            {formatCents(loan.balanceCents)}
          </span>
        </div>
        <div className="summary-kv">
          <span className="k">Estimated monthly payment</span>
          <span className="v">
            {loan.monthlyNowCents != null ? formatCents(loan.monthlyNowCents) : '-'}
          </span>
        </div>
        {loan.category === 'public' && loan.repaymentStatus === 'in_school_interest_only' && loan.gracePeriodEndDate ? (
          <div className="summary-kv">
            <span className="k">Full repayment from</span>
            <span className="v">
              {(() => {
                const d = parseDateISO(loan.gracePeriodEndDate);
                return d
                  ? d.toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })
                  : loan.gracePeriodEndDate;
              })()}
            </span>
          </div>
        ) : null}
        <div className="summary-kv">
          <span className="k">Estimated payoff date</span>
          <span className="v">
            {payoffDate ? payoffDate.toLocaleDateString() : 'N/A (payment too low or missing)'}
          </span>
        </div>
        <div className="summary-kv">
          <span className="k">Estimated payoff age</span>
          <span className="v">
            {payoffAge != null
              ? `${payoffAge} years`
              : birthdateISO
                ? 'N/A'
                : 'Add your birthdate in Settings'}
          </span>
        </div>
      </div>
    </>
  );
}

function RefinanceSimulator(props: { loan: LoanWithDerived }) {
  const { loan } = props;
  const [ratePercent, setRatePercent] = useState<string>(String(loan.interestRatePercent));
  const [termMonths, setTermMonths] = useState<string>(
    loan.termMonths != null ? String(loan.termMonths) : '120'
  );

  const currentAfterGraceCents = loan.futureFullRepaymentCents ?? 0;

  const derived = useMemo(() => {
    const currentMonths =
      currentAfterGraceCents > 0
        ? computeMonthsToPayoff(
            loan.balanceCents,
            loan.interestRatePercent,
            currentAfterGraceCents
          )
        : null;

    const newRate = parseFloat(ratePercent || '0');
    const newTerm = termMonths && parseInt(termMonths, 10) > 0 ? parseInt(termMonths, 10) : 0;
    const refiPayment =
      computeAmortizedPaymentCents(loan.balanceCents, newRate, newTerm) ??
      computeInterestOnlyMonthlyCents(loan.balanceCents, newRate);
    const refiMonths =
      refiPayment != null
        ? computeMonthsToPayoff(loan.balanceCents, newRate, refiPayment)
        : null;

    return { currentMonths, refiPayment, refiMonths };
  }, [loan.balanceCents, loan.interestRatePercent, currentAfterGraceCents, ratePercent, termMonths]);

  return (
    <>
      <p style={{ fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 0 }}>
        Refinance this loan&apos;s after-grace repayment value with new rate and term. All values
        are estimates only and do not reflect lender-specific terms.
      </p>
      <div className="summary-compact" style={{ marginBottom: 12 }}>
        <div className="summary-kv">
          <span className="k">Current after-grace value</span>
          <span className="v">
            {currentAfterGraceCents > 0 ? formatCents(currentAfterGraceCents) : '-'}
          </span>
        </div>
        {currentAfterGraceCents === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))', margin: 0 }}>
            No after-grace value for this loan; set ranges or full repayment to see a value.
          </p>
        ) : null}
      </div>
      <div className="field">
        <label>New interest rate (%)</label>
        <input
          value={ratePercent}
          onChange={(e) => setRatePercent(e.target.value)}
          inputMode="decimal"
        />
      </div>
      <div className="field">
        <label>New term (months)</label>
        <input
          value={termMonths}
          onChange={(e) => setTermMonths(e.target.value)}
          inputMode="numeric"
        />
      </div>

      <div className="summary-compact" style={{ marginTop: 8 }}>
        {derived.currentMonths != null ? (
          <div className="summary-kv">
            <span className="k">Current est. months to payoff</span>
            <span className="v">~{derived.currentMonths} months</span>
          </div>
        ) : null}
        <div className="summary-kv">
          <span className="k">Refinanced after-grace value</span>
          <span className="v">
            {derived.refiPayment != null ? formatCents(derived.refiPayment) : '-'}
          </span>
        </div>
        <div className="summary-kv">
          <span className="k">Refinanced est. months to payoff</span>
          <span className="v">
            {derived.refiMonths != null ? `~${derived.refiMonths} months` : '-'}
          </span>
        </div>
      </div>
    </>
  );
}

