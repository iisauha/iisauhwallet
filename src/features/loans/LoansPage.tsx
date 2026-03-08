import { useMemo, useState } from 'react';
import { useLedgerStore } from '../../state/store';
import { formatCents } from '../../state/calc';
import {
  loadLoans,
  saveLoans,
  type LoansState,
  type Loan,
  type FutureRepaymentPlan,
  type PaymentScheduleRange,
  type LoanBorrowerType,
  type LoanStateOfResidency,
  uid,
  loadBirthdateISO
} from '../../state/storage';
import { getDetectedAgiFromRecurring, getActiveSchedulePaymentCents } from './loanDerivation';
import type { RecurringItem } from '../../state/models';
import { Select } from '../../ui/Select';
import { Modal } from '../../ui/Modal';
import { loadPublicLoanSummary } from '../federalLoans/PublicLoanSummaryStore';
import { PublicLoanSimpleCard } from '../federalLoans/PublicLoanSimpleCard';

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** First future schedule range's payment (for "after grace" / later amount). Ranges sorted by startDate; first with startDate > today. */
function getFirstFutureSchedulePaymentCents(loan: Loan): number | null {
  const ranges = loan.paymentScheduleRanges;
  if (!ranges || ranges.length === 0) return null;
  const today = todayISO();
  const sorted = [...ranges].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const next = sorted.find((r) => r.startDate > today);
  return next != null ? next.paymentCents : null;
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

function daysBetween(startISO: string, endISO: string): number {
  const a = new Date(startISO + 'T00:00:00').getTime();
  const b = new Date(endISO + 'T00:00:00').getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/**
 * For a private loan in Deferred/Forbearance, estimate balance over time from schedule rows.
 * Used for display only; does not affect Payment(now).
 */
function computeDeferredBalanceTimeline(loan: Loan): {
  estimatedCurrentBalanceCents: number;
  balanceAtRepaymentStartCents: number | null;
  startingBalanceCents: number;
} | null {
  if (loan.category !== 'private' || loan.repaymentStatus !== 'deferred_forbearance') return null;
  const ranges = loan.paymentScheduleRanges;
  if (!ranges || ranges.length === 0) return null;

  const sorted = [...ranges].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const today = todayISO();
  const rate = loan.interestRatePercent / 100;
  let runningBalance = loan.balanceCents;
  let balanceAtRepaymentStart: number | null = null;
  let estimatedCurrent: number | null = null;

  for (const r of sorted) {
    const { startDate, endDate, paymentCents, accruedInterestCents } = r;
    if (today < startDate) {
      estimatedCurrent = runningBalance;
      break;
    }
    if (today >= startDate && today <= endDate) {
      if (paymentCents === 0) {
        const daysInRange = Math.max(1, daysBetween(startDate, endDate));
        const totalAccrued =
          accruedInterestCents != null && accruedInterestCents >= 0
            ? accruedInterestCents
            : Math.round((runningBalance * rate) / 365 * daysInRange);
        const daysToToday = Math.max(0, daysBetween(startDate, today));
        const accruedToToday = Math.round((totalAccrued * daysToToday) / daysInRange);
        estimatedCurrent = runningBalance + accruedToToday;
        runningBalance += totalAccrued;
      } else {
        if (balanceAtRepaymentStart == null) balanceAtRepaymentStart = runningBalance;
        const monthRate = rate / 12;
        let bal = runningBalance;
        let monthStart = startDate;
        while (monthStart <= endDate) {
          const nextMonth = addMonths(new Date(monthStart + 'T00:00:00'), 1);
          const monthEnd = nextMonth.toISOString().slice(0, 10);
          const interestCents = Math.round((bal * monthRate));
          bal = bal + interestCents - paymentCents;
          if (bal < 0) bal = 0;
          if (monthEnd > today) {
            const daysToToday = Math.max(0, daysBetween(monthStart, today));
            const partialInterest = Math.round(bal * (rate / 365) * daysToToday);
            estimatedCurrent = bal + partialInterest;
            break;
          }
          estimatedCurrent = bal;
          monthStart = monthEnd;
        }
        runningBalance = bal;
      }
      break;
    }
    if (today > endDate) {
      if (paymentCents === 0) {
        const daysInRange = Math.max(1, daysBetween(startDate, endDate));
        const totalAccrued =
          accruedInterestCents != null && accruedInterestCents >= 0
            ? accruedInterestCents
            : Math.round((runningBalance * rate) / 365 * daysInRange);
        runningBalance += totalAccrued;
      } else {
        if (balanceAtRepaymentStart == null) balanceAtRepaymentStart = runningBalance;
        const monthRate = rate / 12;
        let bal = runningBalance;
        let monthStart = startDate;
        while (monthStart <= endDate) {
          const nextMonth = addMonths(new Date(monthStart + 'T00:00:00'), 1);
          const monthEnd = nextMonth.toISOString().slice(0, 10);
          const interestCents = Math.round((bal * monthRate));
          bal = bal + interestCents - paymentCents;
          if (bal < 0) bal = 0;
          monthStart = monthEnd;
        }
        runningBalance = bal;
      }
    }
  }
  if (estimatedCurrent == null) estimatedCurrent = runningBalance;
  return {
    estimatedCurrentBalanceCents: estimatedCurrent,
    balanceAtRepaymentStartCents: balanceAtRepaymentStart,
    startingBalanceCents: loan.balanceCents
  };
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

function computeInterestOnlyMonthlyCents(balanceCents: number, ratePercent: number): number {
  const r = ratePercent / 100;
  if (!(balanceCents > 0 && r > 0)) return 0;
  const monthlyRate = r / 12;
  const dollars = (balanceCents / 100) * monthlyRate;
  return Math.round(dollars * 100);
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
  /** For private deferred: estimated balance today from schedule timeline (display only). */
  estimatedCurrentBalanceCents?: number | null;
  /** For private deferred: balance at start of first repayment range (display only). */
  balanceAtRepaymentStartCents?: number | null;
};

function getActiveMonthlyPayment(loan: LoanWithDerived): number | null {
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
  const monthlyInterestCents = dailyInterestCents * 30;

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
    // Private loan: 3 status modes with optional schedule
    const now = new Date();
    const scheduleNow = getActiveSchedulePaymentCents(loan.paymentScheduleRanges, now);
    const futureSchedulePayment = getFirstFutureSchedulePaymentCents(loan);

    if (repaymentStatus === 'in_school_interest_only' || repaymentStatus === 'grace_interest_only') {
      monthlyNowCents = interestOnlyMonthly;
      monthlyLaterCents = futureSchedulePayment ?? fullPaymentCents;
      payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
    } else if (repaymentStatus === 'deferred_forbearance') {
      monthlyNowCents = scheduleNow ?? 0;
      monthlyLaterCents = futureSchedulePayment ?? fullPaymentCents;
      payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
    } else if (repaymentStatus === 'full_repayment') {
      monthlyNowCents = scheduleNow ?? fullPaymentCents;
      monthlyLaterCents = null;
      payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
    } else if (repaymentStatus === 'custom_payment' && loan.nextPaymentCents && loan.nextPaymentCents > 0) {
      monthlyNowCents = loan.nextPaymentCents;
      monthlyLaterCents = null;
      payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, loan.nextPaymentCents);
    } else {
      // Legacy idr or unknown: treat as full repayment
      monthlyNowCents = scheduleNow ?? fullPaymentCents;
      monthlyLaterCents = null;
      payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
    }
  }

  const timeline =
    category === 'private' && repaymentStatus === 'deferred_forbearance'
      ? computeDeferredBalanceTimeline(loan)
      : null;

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
    estimatedCurrentBalanceCents: timeline?.estimatedCurrentBalanceCents ?? undefined,
    balanceAtRepaymentStartCents: timeline?.balanceAtRepaymentStartCents ?? undefined
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
      scheduleAccruedInterestStrings: {}
    };
  }
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
    scheduleAccruedInterestStrings: {}
  };
}

function editorToLoan(e: LoanEditorState, prev: Loan | null): Loan | null {
  const balanceCents = Math.round(parseFloat(e.balance || '0') * 100);
  const ratePercent = parseFloat(e.ratePercent || '0');
  const idrManualAnnualIncomeCents =
    e.idrManualAnnualIncome && parseFloat(e.idrManualAnnualIncome) > 0
      ? Math.round(parseFloat(e.idrManualAnnualIncome) * 100)
      : undefined;

  if (!(balanceCents >= 0 && !Number.isNaN(ratePercent))) return null;

  const isPublic = e.category === 'public';
  const termMonths = isPublic
    ? prev?.termMonths
    : (e.termMonths && parseInt(e.termMonths, 10) > 0 ? parseInt(e.termMonths, 10) : undefined);
  const nextPaymentCents = isPublic
    ? prev?.nextPaymentCents
    : (e.nextPayment && parseFloat(e.nextPayment) > 0
        ? Math.round(parseFloat(e.nextPayment) * 100)
        : undefined);
  const repaymentStatus = isPublic
    ? (prev?.repaymentStatus ?? 'full_repayment')
    : e.repaymentStatus;
  const gracePeriodEndDate = isPublic
    ? prev?.gracePeriodEndDate
    : (e.repaymentStatus === 'in_school_interest_only' && e.gracePeriodEndDate
        ? e.gracePeriodEndDate
        : undefined);
  const futureRepaymentPlan = isPublic
    ? (prev?.futureRepaymentPlan ?? 'na')
    : (e.futureRepaymentPlan || undefined);
  const nextPaymentDate = isPublic ? (prev?.nextPaymentDate ?? undefined) : (e.nextPaymentDate || undefined);

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
    paymentScheduleRanges: isPublic ? prev?.paymentScheduleRanges : (e.paymentScheduleRanges?.length ? e.paymentScheduleRanges.map((r) => {
      const str = e.schedulePaymentStrings?.[r.id];
      const cents = str !== undefined && str !== '' ? Math.round(parseFloat(String(str).replace(/,/g, '')) * 100) : r.paymentCents;
      let accruedInterestCents: number | undefined = r.accruedInterestCents ?? undefined;
      const accStr = e.scheduleAccruedInterestStrings?.[r.id];
      if (accStr !== undefined) {
        if (accStr === '') accruedInterestCents = undefined;
        else {
          const n = Math.round(parseFloat(String(accStr).replace(/,/g, '')) * 100);
          if (Number.isFinite(n) && n >= 0) accruedInterestCents = n;
        }
      }
      return {
        ...r,
        paymentCents: Number.isFinite(cents) && cents >= 0 ? cents : r.paymentCents,
        accruedInterestCents
      };
    }) : undefined),
    gracePeriodEndDate,
    nextPaymentCents,
    nextPaymentDate,
    notes: e.notes.trim() || undefined,
    active: e.active,
    idrUseManualIncome: e.category === 'public' ? undefined : e.idrUseManualIncome,
    idrManualAnnualIncomeCents: e.category === 'public' ? undefined : idrManualAnnualIncomeCents
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
      return '—';
  }
}

function LoanCard(props: {
  loan: LoanWithDerived;
  onEdit: () => void;
  onDelete: () => void;
  onPayoffAge: () => void;
  onRefinance?: () => void;
}) {
  const { loan: l, onEdit, onDelete, onPayoffAge, onRefinance } = props;
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
      <div style={{ fontSize: '0.9rem', marginBottom: 4 }}>
        <span style={{ color: 'var(--muted)' }}>{statusLabel(l.repaymentStatus)}</span>
        {l.category === 'public' && l.subsidyType ? (
          <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}> · {l.subsidyType}</span>
        ) : null}
      </div>
      {l.nextPaymentDate ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 4 }}>
          Next payment date: {l.nextPaymentDate}
        </div>
      ) : null}
      <div style={{ fontSize: '0.9rem', marginBottom: 4 }}>
        Payment now: {getActiveMonthlyPayment(l) != null ? formatCents(getActiveMonthlyPayment(l)!) : '—'}
      </div>
      {l.category === 'private' && l.repaymentStatus === 'deferred_forbearance' && l.estimatedCurrentBalanceCents != null && l.estimatedCurrentBalanceCents > 0 ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 4 }}>
          Estimated current balance: {formatCents(l.estimatedCurrentBalanceCents)}
          {l.balanceAtRepaymentStartCents != null && l.balanceAtRepaymentStartCents > 0 ? (
            <span style={{ display: 'block', marginTop: 2 }}>
              Balance at repayment start: {formatCents(l.balanceAtRepaymentStartCents)}
            </span>
          ) : null}
        </div>
      ) : null}
      {l.category === 'public' && (l.totalFederalPaymentCents != null || l.approximateShareCents != null) ? (
        <>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 2 }}>
            Total federal payment (after grace): {l.totalFederalPaymentCents != null ? formatCents(l.totalFederalPaymentCents) : '—'}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 4 }}>
            Approximate share of total: {l.approximateShareCents != null ? formatCents(l.approximateShareCents) : '—'} (not separately calculated)
          </div>
        </>
      ) : l.category === 'private' || l.monthlyLaterCents != null ? (
        <div style={{ fontSize: '0.9rem', marginBottom: 4 }}>
          After grace: {l.monthlyLaterCents != null ? formatCents(l.monthlyLaterCents) : '—'}
        </div>
      ) : null}
      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>
        {l.lender ? `Servicer: ${l.lender} · ` : null}
        Interest accrual ≈ {formatCents(l.dailyInterestCents)}/day · {formatCents(l.monthlyInterestCents)}/mo
      </div>
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
                              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>
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
        <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem' }} onClick={onEdit}>Edit</button>
        <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem' }} onClick={onDelete}>Delete</button>
        <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem' }} onClick={onPayoffAge}>Payoff age</button>
        {onRefinance ? <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem' }} onClick={onRefinance}>Refinance</button> : null}
      </div>
    </div>
  );
}

export type LoanViewFilter = 'public' | 'private';

export function LoansPage() {
  const data = useLedgerStore((s) => s.data);
  const [state, setState] = useState<LoansState>(() => loadLoans());
  const [loanView, setLoanView] = useState<LoanViewFilter>('public');
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; value: LoanEditorState } | null>(null);
  const [refiLoan, setRefiLoan] = useState<Loan | null>(null);
  const [payoffLoan, setPayoffLoan] = useState<LoanWithDerived | null>(null);
  const [publicSummary, setPublicSummary] = useState(() => loadPublicLoanSummary());
  const [showAfterGraceBreakdown, setShowAfterGraceBreakdown] = useState(false);

  const birthdateISO = loadBirthdateISO();

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

  const summary = useMemo(() => {
    let totalBalance = 0;
    let totalMonthlyNow = 0;
    let totalMonthlyLater = 0;
    let weightedRateNumerator = 0;

    let anyLater = false;

    let privateAfterGraceCents = 0;
    loansWithDerived.forEach((l) => {
      const bal = l.balanceCents || 0;
      totalBalance += bal;
      if (l.monthlyNowCents != null) totalMonthlyNow += l.monthlyNowCents;
      if (l.monthlyLaterCents != null) {
        totalMonthlyLater += l.monthlyLaterCents;
        privateAfterGraceCents += l.monthlyLaterCents;
        anyLater = true;
      }
      weightedRateNumerator += bal * l.interestRatePercent;
    });

    const publicCurrentCents = (() => {
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
        : 0;
    })();
    if (publicCurrentCents > 0) totalMonthlyNow += publicCurrentCents;

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

    const now = new Date();
    let latestPayoffDate: Date | null = null;
    loansWithDerived.forEach((l) => {
      if (l.payoffMonths != null && l.payoffMonths > 0) {
        const estDate = addMonths(now, l.payoffMonths);
        if (!latestPayoffDate || estDate > latestPayoffDate) latestPayoffDate = estDate;
      }
    });

    let payoffAge: number | null = null;
    if (latestPayoffDate) {
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
      payoffAge
    };
  }, [loansWithDerived, birthdateISO, publicSummary]);

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

  return (
    <div className="tab-panel active" id="loansContent">
      <p className="section-title" style={{ marginBottom: 8 }}>Loans</p>

      <div className="summary-compact" style={{ marginBottom: 12, padding: '10px 12px' }}>
        <div className="summary-kv" style={{ marginTop: 0 }}>
          <span className="k">Total balance</span>
          <span className="v" style={{ color: 'var(--red)', fontWeight: 600 }}>
            {formatCents(summary.totalBalance)}
          </span>
        </div>
        <div className="summary-kv" style={{ marginTop: 4, alignItems: 'center' }}>
          <span className="k" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Payment (now)
            <button
              type="button"
              aria-label="After-grace breakdown"
              onClick={() => setShowAfterGraceBreakdown(true)}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                color: 'var(--muted)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0
              }}
            >
              i
            </button>
          </span>
          <span className="v" style={{ color: 'var(--red)' }}>
            {summary.totalMonthlyNow > 0 ? formatCents(summary.totalMonthlyNow) : '—'}
          </span>
        </div>
        {summary.avgPrivateRate != null ? (
          <div className="summary-kv" style={{ marginTop: 2 }}>
            <span className="k">Avg private rate</span>
            <span className="v">{summary.avgPrivateRate.toFixed(2)}%</span>
          </div>
        ) : null}
        {summary.avgPublicRate != null ? (
          <div className="summary-kv" style={{ marginTop: 2 }}>
            <span className="k">Avg public rate</span>
            <span className="v">{summary.avgPublicRate.toFixed(2)}%</span>
          </div>
        ) : null}
        <div className="summary-kv" style={{ marginTop: 2 }}>
          <span className="k">Payoff age</span>
          <span className="v">
            {summary.payoffAge != null
              ? `${summary.payoffAge} yrs`
              : birthdateISO
                ? '—'
                : 'Set birthdate in Settings'}
          </span>
        </div>
      </div>

      <div
        className="segmented"
        style={{
          display: 'flex',
          gap: 0,
          marginBottom: 12,
          borderRadius: 8,
          padding: 2,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)'
        }}
        role="tablist"
        aria-label="Loan type"
      >
        <button
          type="button"
          role="tab"
          aria-selected={loanView === 'public'}
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: '0.9rem',
            fontWeight: loanView === 'public' ? 600 : 400,
            border: 'none',
            borderRadius: 6,
            background: loanView === 'public' ? 'var(--bg)' : 'transparent',
            color: loanView === 'public' ? 'var(--fg)' : 'var(--muted)',
            cursor: 'pointer'
          }}
          onClick={() => setLoanView('public')}
        >
          Public
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={loanView === 'private'}
          style={{
            flex: 1,
            padding: '8px 12px',
            fontSize: '0.9rem',
            fontWeight: loanView === 'private' ? 600 : 400,
            border: 'none',
            borderRadius: 6,
            background: loanView === 'private' ? 'var(--bg)' : 'transparent',
            color: loanView === 'private' ? 'var(--fg)' : 'var(--muted)',
            cursor: 'pointer'
          }}
          onClick={() => setLoanView('private')}
        >
          Private
        </button>
      </div>

      {loanView === 'public' ? (
        <PublicLoanSimpleCard onSave={() => setPublicSummary(loadPublicLoanSummary())} />
      ) : (
        <>
          {loansWithDerived.length === 0 ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <p style={{ marginTop: 0, marginBottom: 8, color: 'var(--muted)', fontSize: '0.9rem' }}>
                No private loans. Track student and other private loans here. All values are manual and for estimates only.
              </p>
              <button
                type="button"
                className="btn btn-add"
                onClick={() =>
                  setEditor({
                    mode: 'add',
                    value: { ...loanToEditor(null, hasRecurringIncome), category: 'private' }
                  })
                }
              >
                + Add Private Loan
              </button>
            </div>
          ) : (
            <>
              {loansWithDerived.map((l) => (
                <LoanCard
                  key={l.id}
                  loan={l}
                  onEdit={() => setEditor({ mode: 'edit', value: loanToEditor(l, hasRecurringIncome) })}
                  onDelete={() => {
                    if (!confirm('Delete this loan?')) return;
                    persist({ loans: state.loans.filter((x) => x.id !== l.id) });
                  }}
                  onPayoffAge={() => setPayoffLoan(l)}
                  onRefinance={() => setRefiLoan(l)}
                />
              ))}
              <button
                type="button"
                className="btn btn-add"
                style={{ width: '100%', marginTop: 8 }}
                onClick={() =>
                  setEditor({
                    mode: 'add',
                    value: { ...loanToEditor(null, hasRecurringIncome), category: 'private' }
                  })
                }
              >
                + Add Private Loan
              </button>
            </>
          )}
        </>
      )}

      {/* Loan editor modal */}
      <Modal
        open={!!editor}
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
        title="Estimated payoff age"
        onClose={() => setPayoffLoan(null)}
      >
        {payoffLoan ? (
          <PayoffDetails loan={payoffLoan} birthdateISO={birthdateISO} />
        ) : null}
      </Modal>

      {/* Refinance modal (private loans only) */}
      <Modal
        open={!!refiLoan}
        title="Refinance simulation"
        onClose={() => setRefiLoan(null)}
      >
        {refiLoan ? <RefinanceSimulator loan={refiLoan} /> : null}
      </Modal>

      {/* After-grace breakdown (hidden by default) */}
      <Modal
        open={showAfterGraceBreakdown}
        title="After-grace breakdown"
        onClose={() => setShowAfterGraceBreakdown(false)}
      >
        <div className="summary-compact" style={{ gap: 8 }}>
          <div className="summary-kv">
            <span className="k">Public</span>
            <span className="v" style={{ color: 'var(--red)' }}>
              {summary.publicAfterGraceCents > 0 ? formatCents(summary.publicAfterGraceCents) : '—'}
            </span>
          </div>
          <div className="summary-kv">
            <span className="k">Private</span>
            <span className="v" style={{ color: 'var(--red)' }}>
              {summary.privateAfterGraceCents > 0 ? formatCents(summary.privateAfterGraceCents) : '—'}
            </span>
          </div>
          <div className="summary-kv" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span className="k">Total after grace</span>
            <span className="v" style={{ color: 'var(--red)', fontWeight: 600 }}>
              {summary.totalMonthlyLater != null ? formatCents(summary.totalMonthlyLater) : '—'}
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
            <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--muted)' }}>
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
            <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--muted)' }}>
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
            <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--muted)' }}>
              Parent PLUS is eligible only for Standard repayment unless consolidated.
            </p>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 0, marginBottom: 8 }}>
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
            <label>Repayment term (months)</label>
            <input
              value={state.termMonths}
              onChange={(e) => onChange({ ...state, termMonths: e.target.value })}
              inputMode="numeric"
              placeholder="e.g. 120"
            />
            <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--muted)' }}>
              For reference and for full-repayment calculation
            </p>
          </div>
          <div className="field">
            <label>Current status</label>
            <Select
              value={state.repaymentStatus === 'grace_interest_only' || state.repaymentStatus === 'idr' || state.repaymentStatus === 'custom_payment' ? 'full_repayment' : state.repaymentStatus}
              onChange={(e) =>
                onChange({
                  ...state,
                  repaymentStatus: e.target.value as Loan['repaymentStatus']
                })
              }
            >
              <option value="in_school_interest_only">In School / Interest Only</option>
              <option value="deferred_forbearance">Deferred / Forbearance</option>
              <option value="full_repayment">Full Repayment</option>
            </Select>
            <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--muted)' }}>
              In School: interest-only payment now. Deferred: use schedule below. Full: amortized or schedule override.
            </p>
          </div>
          {(state.repaymentStatus === 'deferred_forbearance' || state.repaymentStatus === 'full_repayment') && (
            <div className="field" style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <label style={{ display: 'block', marginBottom: 6 }}>Payment schedule (date ranges)</label>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 8 }}>
                {state.repaymentStatus === 'deferred_forbearance' ? 'Add rows so the active range for today sets Payment(now).' : 'Optional. If a range covers today, it overrides the calculated payment.'}
              </p>
              {(state.paymentScheduleRanges || []).map((r) => (
                <div key={r.id} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <input
                      type="date"
                      value={r.startDate}
                      onChange={(e) => onChange({ ...state, paymentScheduleRanges: state.paymentScheduleRanges.map((x) => x.id === r.id ? { ...x, startDate: e.target.value } : x) })}
                      style={{ width: 120, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                    />
                    <input
                      type="date"
                      value={r.endDate}
                      onChange={(e) => onChange({ ...state, paymentScheduleRanges: state.paymentScheduleRanges.map((x) => x.id === r.id ? { ...x, endDate: e.target.value } : x) })}
                      style={{ width: 120, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={state.schedulePaymentStrings?.[r.id] ?? (r.paymentCents / 100).toFixed(2)}
                      onChange={(e) => onChange({ ...state, schedulePaymentStrings: { ...state.schedulePaymentStrings, [r.id]: e.target.value } })}
                      placeholder="0.00"
                      style={{ width: 80, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                    />
                    <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>$/mo</span>
                    {state.repaymentStatus === 'deferred_forbearance' ? (
                      <>
                        <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Accrued (opt):</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={state.scheduleAccruedInterestStrings?.[r.id] ?? (r.accruedInterestCents != null ? (r.accruedInterestCents / 100).toFixed(2) : '')}
                          onChange={(e) => onChange({ ...state, scheduleAccruedInterestStrings: { ...state.scheduleAccruedInterestStrings, [r.id]: e.target.value } })}
                          placeholder="—"
                          style={{ width: 72, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                        />
                        <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>$</span>
                      </>
                    ) : null}
                    <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => onChange({ ...state, paymentScheduleRanges: state.paymentScheduleRanges.filter((x) => x.id !== r.id) })}>Remove</button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem' }}
                onClick={() => onChange({
                  ...state,
                  paymentScheduleRanges: [...(state.paymentScheduleRanges || []), { id: uid(), startDate: todayISO(), endDate: todayISO(), paymentCents: 0 }]
                })}
              >
                Add row
              </button>
            </div>
          )}
        </>
      ) : null}
      {state.category === 'public' ? (
        <p style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
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
      <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: 0 }}>
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
            {loan.monthlyNowCents != null ? formatCents(loan.monthlyNowCents) : '—'}
          </span>
        </div>
        {loan.repaymentStatus === 'in_school_interest_only' && loan.gracePeriodEndDate ? (
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

function RefinanceSimulator(props: { loan: Loan }) {
  const { loan } = props;
  const [ratePercent, setRatePercent] = useState<string>(String(loan.interestRatePercent));
  const [termMonths, setTermMonths] = useState<string>(
    loan.termMonths != null ? String(loan.termMonths) : '120'
  );
  const [overridePayment, setOverridePayment] = useState<string>('');

  const derived = useMemo(() => {
    const currentPayment =
      computeAmortizedPaymentCents(loan.balanceCents, loan.interestRatePercent, loan.termMonths) ??
      computeInterestOnlyMonthlyCents(loan.balanceCents, loan.interestRatePercent);
    const currentMonths = computeMonthsToPayoff(
      loan.balanceCents,
      loan.interestRatePercent,
      currentPayment
    );

    const newRate = parseFloat(ratePercent || '0');
    const newTerm = termMonths && parseInt(termMonths, 10) > 0 ? parseInt(termMonths, 10) : 0;
    let refiPayment =
      computeAmortizedPaymentCents(loan.balanceCents, newRate, newTerm) ??
      computeInterestOnlyMonthlyCents(loan.balanceCents, newRate);
    const override =
      overridePayment && parseFloat(overridePayment) > 0
        ? Math.round(parseFloat(overridePayment) * 100)
        : null;
    if (override != null) refiPayment = override;
    const refiMonths =
      refiPayment != null
        ? computeMonthsToPayoff(loan.balanceCents, newRate, refiPayment)
        : null;

    return { currentPayment, currentMonths, refiPayment, refiMonths };
  }, [loan, ratePercent, termMonths, overridePayment]);

  return (
    <>
      <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: 0 }}>
        This tool compares your current loan to a simplified refinance scenario. All values
        are estimates only and do not reflect lender-specific terms.
      </p>
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
      <div className="field">
        <label>Optional monthly payment override ($)</label>
        <input
          value={overridePayment}
          onChange={(e) => setOverridePayment(e.target.value)}
          inputMode="decimal"
          placeholder="Optional"
        />
      </div>

      <div className="summary-compact" style={{ marginTop: 8 }}>
        <div className="summary-kv">
          <span className="k">Current est. payment</span>
          <span className="v">
            {derived.currentPayment != null ? formatCents(derived.currentPayment) : '—'}
          </span>
        </div>
        <div className="summary-kv">
          <span className="k">Current est. months to payoff</span>
          <span className="v">
            {derived.currentMonths != null ? `~${derived.currentMonths} months` : '—'}
          </span>
        </div>
        <div className="summary-kv">
          <span className="k">Refinanced est. payment</span>
          <span className="v">
            {derived.refiPayment != null ? formatCents(derived.refiPayment) : '—'}
          </span>
        </div>
        <div className="summary-kv">
          <span className="k">Refinanced est. months to payoff</span>
          <span className="v">
            {derived.refiMonths != null ? `~${derived.refiMonths} months` : '—'}
          </span>
        </div>
      </div>
    </>
  );
}

