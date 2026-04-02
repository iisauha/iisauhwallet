import { useEffect, useMemo, useRef, useState } from 'react';
import { useLedgerStore } from '../../state/store';
import { formatCents } from '../../state/calc';
import { scheduleSnapCorrection } from '../../ui/carouselSnap';
import { HelpTip } from '../../ui/HelpTip';
import {
  loadLoans,
  saveLoans,
  loadPublicPaymentNowAdded,
  savePublicPaymentNowAdded,
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
import { getDetectedAgiFromRecurring, getPrivatePaymentNowTotal, getLoanEstimatedPaymentNowMap, computeMonthlyInterestCents } from './loanDerivation';
import type { RecurringItem } from '../../state/models';
import { useDialog } from '../../ui/DialogProvider';
import { Select } from '../../ui/Select';
import { Modal } from '../../ui/Modal';
import { AnimatedNumber } from '../../ui/AnimatedNumber';
import { IconPlus } from '../../ui/icons';
import { loadPublicLoanSummary, savePublicLoanSummary } from '../federalLoans/PublicLoanSummaryStore';
import { PublicLoanSimpleCard } from '../federalLoans/PublicLoanSimpleCard';

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
  const monthlyInterestCents = computeMonthlyInterestCents(balanceCents, ratePercent);
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

/** Private deferred: total interest over full range (truncated to whole cents). */
function computeDeferredRangeInterestCents(
  balanceCents: number,
  ratePercent: number,
  startISO: string,
  endISO: string
): number {
  const daily = computeDeferredDailyInterestCents(balanceCents, ratePercent);
  const days = daysBetween(startISO, endISO);
  return Math.floor(daily * days);
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

/** Lender-style unpaid interest: balance * (rate/100) / 365.25 * elapsedDays. */
function computeUnpaidInterestFromAccrual(
  balanceCents: number,
  ratePercent: number,
  anchorISO: string,
  asOfISO: string
): number {
  const days = daysBetween(anchorISO, asOfISO);
  if (days <= 0) return 0;
  const dollars = (balanceCents / 100) * (ratePercent / 100) / 365.25 * days;
  return Math.round(dollars * 100);
}

/** Unpaid interest for private loan: override → manual; else accrual anchor → estimated; else fallback. */
function getUnpaidInterestForPrivate(loan: Loan, asOfISO: string): { cents: number; source: 'manual' | 'estimated' | 'fallback' } {
  const override = loan.unpaidInterestOverrideCents;
  if (override != null && override >= 0) {
    return { cents: override, source: 'manual' };
  }
  const anchor = loan.accrualAnchorDate;
  if (anchor) {
    const cents = computeUnpaidInterestFromAccrual(loan.balanceCents, loan.interestRatePercent, anchor, asOfISO);
    return { cents, source: 'estimated' };
  }
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
  /** Private only: mode of the active range (for display). */
  activePrivateRangeMode?: PrivatePaymentRangeMode | null;
  /** Private only: unpaid interest cents and source (manual / estimated). */
  unpaidInterestCents?: number;
  unpaidInterestSource?: 'manual' | 'estimated' | 'fallback';
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
  federalTotals: FederalTotals | null
): LoanWithDerived {
  const { balanceCents, interestRatePercent, repaymentStatus, termMonths, category } = loan;
  const allPublicLoans = allLoans.filter((l) => l.category === 'public');
  const isPublicSubsidizedInSchoolOrGrace =
    category === 'public' &&
    loan.subsidyType === 'subsidized' &&
    (repaymentStatus === 'in_school_interest_only' || repaymentStatus === 'grace_interest_only');
  const dailyInterestCents = isPublicSubsidizedInSchoolOrGrace
    ? 0
    : Math.round((balanceCents * (interestRatePercent / 100)) / 365);
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
    // Private loan: range-based payment logic; term derived from ranges
    const todayISO = toDateKey(new Date());
    const effectiveRanges = getEffectivePrivateRanges(loan);
    const derivedTermMonths = getRangeDerivedTermMonths(effectiveRanges);
    const activeRange = getActivePrivateRange(effectiveRanges, todayISO);
    const paymentNow = activeRange
      ? paymentCentsFromPrivateRange(activeRange, balanceCents, interestRatePercent, derivedTermMonths)
      : 0;
    monthlyNowCents = paymentNow;
    // Private monthly interest uses (balance × rate/365) × days in cycle for display and breakdown.
    monthlyInterestCents = computeMonthlyInterestCents(balanceCents, interestRatePercent);

    // Future/grace value: first future range (custom → full_repayment → interest_only). Custom overrides calculated.
    const fullRepaymentBreakdown =
      derivedTermMonths > 0
        ? computeFullRepaymentBreakdown(balanceCents, interestRatePercent, derivedTermMonths)
        : null;
    const futureFullPayment = fullRepaymentBreakdown?.fullRepaymentCents ?? 0;

    const firstFuture = getFirstFutureRepaymentRange(effectiveRanges, todayISO);
    const inFullRepaymentNow = activeRange?.mode === 'full_repayment';
    let futureFullRepaymentCents: number | null = null;
    let futureFullRepaymentInterestCents: number | null = null;
    let futureFullRepaymentPrincipalCents: number | null = null;
    let futureValueFromCustom = false;
    // 1) If active range is Custom Monthly Payment, include it in hidden future/grace (manual override).
    if (activeRange?.mode === 'custom_monthly') {
      const customCents = activeRange.customPaymentCents ?? 0;
      futureFullRepaymentCents = customCents;
      futureValueFromCustom = true;
      if (customCents > 0) monthlyLaterCents = customCents;
    }
    // 2) Else use first future range: custom overrides all calculations, then full_repayment, then interest_only.
    if (futureFullRepaymentCents == null && firstFuture != null) {
      let futureCents = 0;
      if (firstFuture.mode === 'custom_monthly') {
        futureCents = firstFuture.customPaymentCents ?? 0;
        futureValueFromCustom = true;
      } else if (firstFuture.mode === 'full_repayment' && fullRepaymentBreakdown) {
        futureCents = fullRepaymentBreakdown.fullRepaymentCents;
        futureFullRepaymentInterestCents = fullRepaymentBreakdown.monthlyInterestCents;
        futureFullRepaymentPrincipalCents = fullRepaymentBreakdown.principalPortionCents;
      } else if (firstFuture.mode === 'interest_only') {
        futureCents = computeMonthlyInterestCents(balanceCents, interestRatePercent);
      }
      futureFullRepaymentCents = futureCents;
      if (futureCents > 0) monthlyLaterCents = futureCents;
    }
    if (futureFullRepaymentCents == null && inFullRepaymentNow && futureFullPayment > 0) {
      monthlyLaterCents = futureFullPayment;
    }

    const firstFullRange = getFirstFullRepaymentRange(effectiveRanges);
    if (firstFullRange && futureFullPayment > 0) {
      if (todayISO < firstFullRange.startDate) {
        const monthsUntilStart = monthsBetween(todayISO, firstFullRange.startDate);
        const payoffFromStart = computeMonthsToPayoff(balanceCents, interestRatePercent, futureFullPayment);
        payoffMonths = payoffFromStart != null ? monthsUntilStart + payoffFromStart : null;
      } else {
        payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, futureFullPayment);
      }
    } else {
      const monthlyInterestOnly = computeMonthlyInterestCents(balanceCents, interestRatePercent);
      if (paymentNow > 0 && paymentNow <= monthlyInterestOnly) {
        payoffMonths = null;
      } else {
        payoffMonths = paymentNow > 0
          ? computeMonthsToPayoff(balanceCents, interestRatePercent, paymentNow)
          : (futureFullPayment > 0 ? computeMonthsToPayoff(balanceCents, interestRatePercent, futureFullPayment) : null);
      }
    }

    let latestRangeEndISO = '';
    for (const r of effectiveRanges) {
      if (r.endDate > latestRangeEndISO) latestRangeEndISO = r.endDate;
    }

    const { cents: unpaidInterestCents, source: unpaidInterestSource } = getUnpaidInterestForPrivate(loan, todayISO);

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
  excludeFromCurrentPayment: boolean;
  privatePaymentMode: 'interest_only' | 'full_repayment' | 'custom_monthly';
  /** Private: date ranges (start, end, mode, custom $ string). */
  privatePaymentRanges: { id: string; startDate: string; endDate: string; mode: PrivatePaymentRangeMode; customPayment: string }[];
  /** Private: interest accrual anchor date (YYYY-MM-DD). */
  accrualAnchorDate: string;
  /** Private: manual unpaid interest override ($ string). */
  unpaidInterestOverride: string;
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
      excludeFromCurrentPayment: false,
      privatePaymentMode: 'full_repayment',
      privatePaymentRanges: [],
      accrualAnchorDate: '',
      unpaidInterestOverride: ''
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
    excludeFromCurrentPayment: l.excludeFromCurrentPayment ?? false,
    privatePaymentMode: priv.privatePaymentMode ?? 'custom_monthly',
    privatePaymentRanges: defaultRanges,
    accrualAnchorDate: priv.accrualAnchorDate ?? '',
    unpaidInterestOverride: priv.unpaidInterestOverrideCents != null ? (priv.unpaidInterestOverrideCents / 100).toFixed(2) : ''
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
    excludeFromCurrentPayment: isPublic ? undefined : e.excludeFromCurrentPayment,
    privatePaymentMode: isPublic ? undefined : e.privatePaymentMode,
    accrualAnchorDate: isPublic ? undefined : (e.accrualAnchorDate?.trim() || undefined),
    unpaidInterestOverrideCents: isPublic ? undefined : (() => {
      const s = e.unpaidInterestOverride?.replace(/,/g, '').trim();
      if (s === '') return undefined;
      const n = Math.round(parseFloat(s) * 100);
      return Number.isFinite(n) && n >= 0 ? n : undefined;
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
  onToggleExcludeFromPayment?: (exclude: boolean) => void;
}) {
  const { loan: l, onEdit, onDelete, onToggleExcludeFromPayment } = props;
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
              <div style={{ color: 'var(--ui-primary-text, var(--text))', marginBottom: 2 }}>Daily interest: {formatCents(Math.floor(l.deferredDailyInterestCents))}</div>
              <div style={{ color: 'var(--ui-primary-text, var(--text))', marginBottom: 2 }}>Days across deferred range: {l.deferredDaysInRange} days</div>
              <div style={{ color: 'var(--ui-primary-text, var(--text))', marginBottom: 2 }}>Interest accrued across deferment: {formatCents(l.deferredInterestTotalCents)}</div>
              <div style={{ color: 'var(--ui-primary-text, var(--text))' }}>Balance after deferment ends: {formatCents(l.deferredProjectedBalanceCents)}</div>
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
              Monthly interest: {formatCents(l.monthlyInterestCents)}
            </div>
          )}
          {(l.unpaidInterestCents != null && l.unpaidInterestCents > 0) || l.unpaidInterestSource === 'manual' || l.unpaidInterestSource === 'estimated' ? (
            <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>
              Unpaid interest: {formatCents(l.unpaidInterestCents ?? 0)}
              {l.unpaidInterestSource === 'manual' ? ' (manual)' : l.unpaidInterestSource === 'estimated' ? ' (from accrual date)' : ''}
            </div>
          ) : null}
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
  const [publicSummary, setPublicSummary] = useState(() => loadPublicLoanSummary());
  const [publicPaymentNowAdded, setPublicPaymentNowAdded] = useState(() => loadPublicPaymentNowAdded());
  const [showAfterGraceBreakdown, setShowAfterGraceBreakdown] = useState(false);
  const [showRecomputeConfirm, setShowRecomputeConfirm] = useState(false);
  const [paymentNowOverride, setPaymentNowOverride] = useState<number | null>(() => loadPaymentNowManualOverride());
  const [showEditPaymentNow, setShowEditPaymentNow] = useState(false);
  const [editPaymentInput, setEditPaymentInput] = useState('');
  const privateCarouselRef = useRef<HTMLDivElement>(null);
  const [privateCarouselHeight, setPrivateCarouselHeight] = useState<number | undefined>(undefined);
  const [privateCarouselIdx, setPrivateCarouselIdx] = useState(0);
  const [showAllLoans, setShowAllLoans] = useState(false);

  const birthdateISO = loadBirthdateISO();

  useEffect(() => {
    const s = publicSummary;
    if (s.paymentMode !== 'first_payment_date' || !s.firstPaymentDate || (s.estimatedMonthlyPaymentCents ?? 0) <= 0 || s.firstPaymentDateAutoAddPaused) return;
    const today = todayISO();
    if (s.firstPaymentDate > today) return;
    const last = s.firstPaymentDateLastAutoAddedAt;
    if (last != null && last >= s.firstPaymentDate) return;
    const addCents = s.estimatedMonthlyPaymentCents!;
    savePublicPaymentNowAdded(loadPublicPaymentNowAdded() + addCents);
    savePublicLoanSummary({ ...s, firstPaymentDateLastAutoAddedAt: today });
    setPublicPaymentNowAdded(loadPublicPaymentNowAdded());
    setPublicSummary(loadPublicLoanSummary());
  }, [publicSummary]);

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

  const privateLoans = useMemo(
    () => (state.loans || []).filter((l) => l.category === 'private'),
    [state.loans]
  );
  const loansWithDerived: LoanWithDerived[] = useMemo(() => {
    return privateLoans.map((l) =>
      deriveForLoan(l, state.loans || [], detectedAnnualIncomeCents, null)
    );
  }, [state.loans, privateLoans, detectedAnnualIncomeCents]);

  const displayedLoans = showAllLoans ? loansWithDerived : loansWithDerived.slice(0, 5);

  // Set initial height of private loans carousel to the first item's height
  useEffect(() => {
    if (!showPrivate) return;
    requestAnimationFrame(() => {
      const carousel = privateCarouselRef.current;
      if (!carousel) return;
      const firstItem = carousel.children[0] as HTMLElement | undefined;
      if (firstItem) setPrivateCarouselHeight(firstItem.offsetHeight);
    });
  }, [loansWithDerived.length, showPrivate]);


  const summary = useMemo(() => {
    let totalBalance = 0;
    let derivedPrivatePaymentNowBase = 0;
    let totalMonthlyLater = 0;
    let weightedRateNumerator = 0;

    let anyLater = false;

    let privateAfterGraceCents = 0;
    loansWithDerived.forEach((l) => {
      const bal = l.balanceCents || 0;
      totalBalance += bal;
      if (l.monthlyNowCents != null && !l.excludeFromCurrentPayment) derivedPrivatePaymentNowBase += l.monthlyNowCents;
      if (l.monthlyLaterCents != null) {
        totalMonthlyLater += l.monthlyLaterCents;
        privateAfterGraceCents += l.monthlyLaterCents;
        anyLater = true;
      }
      weightedRateNumerator += bal * l.interestRatePercent;
    });

    const publicEstimateCents = (() => {
      const mode = publicSummary.paymentMode ?? (publicSummary.firstPaymentDate ? 'first_payment_date' : 'current_payment');
      const estimated = publicSummary.estimatedMonthlyPaymentCents ?? 0;
      if (mode === 'first_payment_date') {
        if (estimated <= 0) return 0;
        const first = publicSummary.firstPaymentDate;
        if (!first || todayISO() < first) return 0;
        return estimated;
      }
      return (publicSummary.currentPaymentCents != null && publicSummary.currentPaymentCents > 0)
        ? publicSummary.currentPaymentCents
        : (estimated > 0 ? estimated : 0);
    })();

    // Private base always derived live from each loan card's Payment(now) value.
    // Public loan is only included when the user has explicitly opted in via
    // "Add to monthly total" in the Payment Actions modal (publicPaymentNowAdded > 0).
    const privatePaymentNowBase = derivedPrivatePaymentNowBase;
    const totalMonthlyNow = derivedPrivatePaymentNowBase + (publicPaymentNowAdded > 0 ? publicEstimateCents : 0);

    const privateTotalBalance = totalBalance;
    const publicBalanceCents = publicSummary.totalBalanceCents ?? 0;
    if (publicBalanceCents > 0) totalBalance += publicBalanceCents;

    const publicAfterGraceCents = publicSummary.estimatedMonthlyPaymentCents ?? 0;
    if (publicAfterGraceCents > 0) {
      totalMonthlyLater += publicAfterGraceCents;
      anyLater = true;
    }

    const avgPrivateRate =
      privateTotalBalance > 0 ? weightedRateNumerator / privateTotalBalance : null;
    const avgPublicRate = publicSummary.avgInterestRatePercent ?? null;

    // Payoff age: based on loan whose repayment timeline ends the latest (latest range end date across private loans)
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
      publicAfterGraceCents,
      privateAfterGraceCents,
      avgPrivateRate,
      avgPublicRate,
      payoffAge,
      publicBalanceCents,
      privateBalanceCents: privateTotalBalance,
      privatePaymentNowBase,
      derivedPrivatePaymentNowBase,
      publicPaymentNowAdded,
      publicEstimateCents
    };
  }, [loansWithDerived, birthdateISO, publicSummary, publicPaymentNowAdded]);

  /** After-grace: per private loan use first future value (custom → full repayment → interest-only). */
  const afterGraceBreakdown = useMemo(() => {
    const privateLoansBreakdown: {
      name: string;
      afterGraceCents: number;
      interestCents?: number;
      principalCents?: number;
      fromCustom?: boolean;
    }[] = [];
    let privateAfterGraceCents = 0;
    loansWithDerived.forEach((l) => {
      if (l.category !== 'private') return;
      const cents = l.futureFullRepaymentCents ?? 0;
      const fromCustom = l.futureValueFromCustom ?? false;
      if (cents > 0 || fromCustom) {
        privateAfterGraceCents += cents;
        privateLoansBreakdown.push({
          name: l.name,
          afterGraceCents: cents,
          interestCents: l.futureFullRepaymentInterestCents ?? undefined,
          principalCents: l.futureFullRepaymentPrincipalCents ?? undefined,
          fromCustom
        });
      }
    });
    const publicAfterGraceCents = publicSummary.estimatedMonthlyPaymentCents ?? 0;
    return {
      privateAfterGraceCents,
      privateLoansBreakdown,
      publicAfterGraceCents,
      combinedAfterGraceCents: privateAfterGraceCents + publicAfterGraceCents
    };
  }, [loansWithDerived, publicSummary]);

  function persist(next: Partial<LoansState>) {
    setState((prev) => {
      const merged: LoansState = {
        version: 1,
        loans: next.loans !== undefined ? next.loans : prev.loans
      };
      saveLoans(merged);
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

      <div className="summary">
        <div className="summary-compact" style={{ marginBottom: 0 }}>
          <div className="summary-kv" style={{ marginTop: 0 }}>
            <span className="k">Total balance</span>
            <span className="v" style={{ color: 'var(--red)' }}>
              <AnimatedNumber value={summary.totalBalance} format={formatCents} />
            </span>
          </div>
          <div className="summary-kv" style={{ marginTop: 2, fontSize: '0.85rem' }}>
            <span className="k">Public</span>
            <span className="v" style={{ color: 'var(--ui-primary-text, var(--text))' }}>
              <AnimatedNumber value={summary.publicBalanceCents ?? 0} format={formatCents} />
            </span>
          </div>
          <div className="summary-kv" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            <span className="k">Private</span>
            <span className="v" style={{ color: 'var(--ui-primary-text, var(--text))' }}>
              <AnimatedNumber value={summary.privateBalanceCents ?? 0} format={formatCents} />
            </span>
          </div>

          {summary.avgPublicRate != null ? (
            <div className="summary-kv" style={{ marginTop: 0 }}>
              <span className="k">Avg public rate</span>
              <span className="v">{summary.avgPublicRate.toFixed(2)}%</span>
            </div>
          ) : null}
          {summary.avgPrivateRate != null ? (
            <div className="summary-kv" style={{ marginTop: 0 }}>
              <span className="k">Avg private rate</span>
              <span className="v">{summary.avgPrivateRate.toFixed(2)}%</span>
            </div>
          ) : null}

          <div className={paymentNowDisplayClass} style={{ marginTop: 0, alignItems: 'center' }}>
            <span
              className="k"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Monthly Payment
              <button
                type="button"
                className="info-icon"
                aria-label="Future payment breakdown"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAfterGraceBreakdown(true);
                }}
              >
                +
              </button>
            </span>
            <span className="v" style={{ color: paymentNowAmountColor }}>
              {summary.totalMonthlyNow > 0 ? <AnimatedNumber value={summary.totalMonthlyNow} format={formatCents} /> : '-'}
            </span>
          </div>
        </div>
      </div>

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
          Public<HelpTip text="Federal/public loans use standardized repayment plan estimates (e.g. SAVE, IBR). Balances and payments are entered as a lump sum." />
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
          Private<HelpTip text="Private loans with custom interest rates and payment schedules. Each loan tracks its own balance, accrual, and payment ranges." />
        </button>
      </div>

      {showPublic ? (
        <div style={{ marginBottom: 16 }}>
          <PublicLoanSimpleCard
            onSave={() => setPublicSummary(loadPublicLoanSummary())}
            onAddToPaymentNow={() => setPublicPaymentNowAdded(loadPublicPaymentNowAdded())}
            onRemoveFromPaymentNow={() => { savePublicPaymentNowAdded(0); setPublicPaymentNowAdded(0); }}
            isIncludedInTotal={publicPaymentNowAdded > 0}
          />
        </div>
      ) : null}
      {showPrivate ? (
        <>
          {loansWithDerived.length === 0 ? (
            <p style={{ marginTop: 0, marginBottom: 12, color: 'var(--ui-primary-text, var(--text))', fontSize: '0.9rem' }}>
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
            style={privateCarouselHeight != null ? { height: privateCarouselHeight, overflow: 'hidden' } : {}}
          >
          <div
            ref={privateCarouselRef}
            className="card-carousel"
            style={{ marginBottom: 0 }}
            onScroll={(e) => {
              const el = e.currentTarget;
              const rawIdx = el.scrollLeft / (el.clientWidth || 1);
              setPrivateCarouselIdx(Math.round(rawIdx));
              const leftIdx = Math.floor(rawIdx);
              const rightIdx = Math.min(leftIdx + 1, el.children.length - 1);
              const progress = rawIdx - leftIdx;
              const lh = (el.children[leftIdx] as HTMLElement | undefined)?.offsetHeight ?? 0;
              const rh = (el.children[rightIdx] as HTMLElement | undefined)?.offsetHeight ?? lh;
              setPrivateCarouselHeight(Math.round(lh + (rh - lh) * progress));
              scheduleSnapCorrection(el);
            }}
          >
          {displayedLoans.map((l) => (
            <div className="card-carousel-item" key={l.id}>
            <LoanCard
              loan={l}
              onEdit={() => setEditor({ mode: 'edit', value: loanToEditor(l, hasRecurringIncome) })}
              onDelete={async () => {
                const ok = await showConfirm('Delete this loan?');
                if (!ok) return;
                persist({ loans: state.loans.filter((x) => x.id !== l.id) });
              }}
              onToggleExcludeFromPayment={(exclude) =>
                persist({ loans: (state.loans || []).map((x) => (x.id === l.id ? { ...x, excludeFromCurrentPayment: exclude } : x)) })
              }
            />
            </div>
          ))}
          </div>
          </div>
          {displayedLoans.length > 1 && (showAllLoans && loansWithDerived.length >= 5 ? (
            <div style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 6, marginBottom: 8 }}>
              {privateCarouselIdx + 1} of {displayedLoans.length}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 6, marginBottom: 8 }}>
                {displayedLoans.map((_, i) => (
                  <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i === privateCarouselIdx ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s', display: 'inline-block', flexShrink: 0 }} />
                ))}
              </div>
              {loansWithDerived.length >= 5 && privateCarouselIdx >= displayedLoans.length - 1 ? (
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
                  {row.fromCustom ? (
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
                background: 'var(--bg)',
                color: 'var(--text)',
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
          <div className="field">
            <label>Unpaid interest override ($, optional)</label>
            <input
              type="text"
              inputMode="decimal"
              value={state.unpaidInterestOverride}
              onChange={(e) => onChange({ ...state, unpaidInterestOverride: e.target.value })}
              placeholder="Leave blank to use accrual estimate"
            />
            <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
              Manual unpaid interest; overrides accrual-from-anchor estimate when set.
            </p>
          </div>
          <div className="toggle-row" style={{ marginTop: 4 }}>
            <input
              type="checkbox"
              id="excludeFromPayment"
              checked={state.excludeFromCurrentPayment}
              onChange={(e) => onChange({ ...state, excludeFromCurrentPayment: e.target.checked })}
            />
            <label htmlFor="excludeFromPayment">Exclude from monthly payment total</label>
          </div>
          <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
            If checked, this loan's payment won't be included in your monthly payment total. It will still appear in grace period and future estimates.
          </p>
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

