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
import type { RecurringItem } from '../../state/models';
import { Select } from '../../ui/Select';
import { Modal } from '../../ui/Modal';

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

// ----- Federal repayment plan formulas and eligibility -----
// Poverty guidelines: 2025 HHS (48 contiguous; AK/HI higher). Amounts in dollars.
const FPG_2025_CONTIGUOUS = [0, 15650, 21150, 26650, 32150, 37650, 43150, 48650, 54150] as const;
const FPG_2025_AK = [0, 19550, 26450, 33350, 40250, 47150, 54050, 60950, 67850] as const;
const FPG_2025_HI = [0, 17980, 24320, 30660, 37000, 43340, 49680, 56020, 62360] as const;
const FPG_ADD_PER_PERSON_CONTIGUOUS = 5500;
const FPG_ADD_PER_PERSON_AK = 6900;
const FPG_ADD_PER_PERSON_HI = 6340;

function getFederalPovertyGuidelineDollars(
  householdSize: number,
  stateOfResidency: 'contiguous' | 'AK' | 'HI'
): number {
  const size = Math.max(1, Math.min(householdSize, 20));
  const table =
    stateOfResidency === 'AK' ? FPG_2025_AK : stateOfResidency === 'HI' ? FPG_2025_HI : FPG_2025_CONTIGUOUS;
  const addPer =
    stateOfResidency === 'AK' ? FPG_ADD_PER_PERSON_AK : stateOfResidency === 'HI' ? FPG_ADD_PER_PERSON_HI : FPG_ADD_PER_PERSON_CONTIGUOUS;
  if (size <= 8) return table[size] as number;
  return (table[8] as number) + (size - 8) * addPer;
}

/** Discretionary income = AGI - (150% × FPG). Returns dollars (for plan formulas). */
function discretionaryIncomeDollars(
  agiCents: number,
  householdSize: number,
  stateOfResidency: 'contiguous' | 'AK' | 'HI'
): number {
  const fpg = getFederalPovertyGuidelineDollars(householdSize, stateOfResidency);
  const threshold = 1.5 * fpg;
  const agiDollars = agiCents / 100;
  return Math.max(0, agiDollars - threshold);
}

export type FederalPlanRow = {
  planId: 'ibr' | 'paye' | 'icr' | 'rap' | 'standard';
  planName: string;
  monthlyPaymentCents: number;
  forgivenessYears: number;
  eligible: boolean;
};

const PHASE_OUT_DATE = '2028-07-01';
const RAP_START_DATE = '2026-07-01';
const ALL_PLANS_CUTOFF = '2026-07-01'; // IBR/PAYE/ICR only if all disbursed before this
const PAYE_NO_LOAN_BEFORE = '2007-10-01';
const PAYE_AT_LEAST_ONE_AFTER = '2011-10-01';

function parseDateCompare(iso: string): number {
  return new Date(iso + 'T00:00:00').getTime();
}

function allPublicLoansDisbursedBefore(loans: Loan[], before: string): boolean {
  const cutoff = parseDateCompare(before);
  for (const l of loans) {
    if (l.category !== 'public') continue;
    const d = l.disbursementDate;
    if (!d || parseDateCompare(d) >= cutoff) return false;
  }
  return true;
}

function hasNoPublicLoanBefore(loans: Loan[], before: string): boolean {
  const t = parseDateCompare(before);
  for (const l of loans) {
    if (l.category !== 'public') continue;
    const d = l.disbursementDate;
    if (d && parseDateCompare(d) < t) return false;
  }
  return true;
}

function hasAtLeastOnePublicLoanAfter(loans: Loan[], after: string): boolean {
  const t = parseDateCompare(after);
  for (const l of loans) {
    if (l.category !== 'public') continue;
    const d = l.disbursementDate;
    if (d && parseDateCompare(d) >= t) return true;
  }
  return false;
}

function computeFederalPlans(
  loan: Loan,
  allPublicLoans: Loan[],
  agiCents: number
): { plans: FederalPlanRow[]; lowestEligibleCents: number | null } {
  const plans: FederalPlanRow[] = [];
  const isParent = loan.borrowerType === 'parent';
  const householdSize = Math.max(1, loan.householdSize ?? 1);
  const stateOfResidency = loan.stateOfResidency ?? 'contiguous';
  const discDollars = discretionaryIncomeDollars(agiCents, householdSize, stateOfResidency);
  const now = new Date();
  const phaseOutTime = parseDateCompare(PHASE_OUT_DATE);
  const rapStartTime = parseDateCompare(RAP_START_DATE);

  const standard120 = computeAmortizedPaymentCents(
    loan.balanceCents,
    loan.interestRatePercent,
    120
  );
  const standardCents = standard120 ?? computeInterestOnlyMonthlyCents(loan.balanceCents, loan.interestRatePercent);
  const icr12Year = computeAmortizedPaymentCents(loan.balanceCents, loan.interestRatePercent, 144);

  const allBeforeCutoff = allPublicLoansDisbursedBefore(allPublicLoans, ALL_PLANS_CUTOFF);
  const noLoanBefore2007 = hasNoPublicLoanBefore(allPublicLoans, PAYE_NO_LOAN_BEFORE);
  const atLeastOneAfter2011 = hasAtLeastOnePublicLoanAfter(allPublicLoans, PAYE_AT_LEAST_ONE_AFTER);
  const beforePhaseOut = now.getTime() < phaseOutTime;
  const rapAvailable = now.getTime() >= rapStartTime;

  // IBR: 10% discretionary / 12; 20 yr forgiveness. Eligible if all disbursed before 7/1/2026, not parent.
  const ibrEligible = loan.category === 'public' && !isParent && allBeforeCutoff && beforePhaseOut;
  const ibrMonthlyDollars = (discDollars * 0.1) / 12;
  const ibrCents = Math.round(ibrMonthlyDollars * 100);
  plans.push({
    planId: 'ibr',
    planName: 'IBR',
    monthlyPaymentCents: ibrCents,
    forgivenessYears: 20,
    eligible: ibrEligible
  });

  // PAYE: 10% discretionary / 12, cap at Standard 10-yr; 20 yr. No loan before 10/1/2007, at least one after 10/1/2011; before phase out.
  const payeEligible =
    loan.category === 'public' &&
    !isParent &&
    allBeforeCutoff &&
    noLoanBefore2007 &&
    atLeastOneAfter2011 &&
    beforePhaseOut;
  const payeUncapped = (discDollars * 0.1) / 12;
  const payeCapped =
    standardCents != null ? Math.min(payeUncapped * 100, standardCents) : payeUncapped * 100;
  const payeCents = Math.round(payeCapped);
  plans.push({
    planId: 'paye',
    planName: 'PAYE',
    monthlyPaymentCents: payeCents,
    forgivenessYears: 20,
    eligible: payeEligible
  });

  // ICR: lesser of 20% discretionary/12 or 12-year amortized; 25 yr. Estimates only. Phase out.
  const icrEligible = loan.category === 'public' && !isParent && allBeforeCutoff && beforePhaseOut;
  const icr20Pct = (discDollars * 0.2) / 12;
  const icr12YearCents = icr12Year ?? Infinity;
  const icrCents = Math.round(Math.min(icr20Pct * 100, icr12YearCents));
  plans.push({
    planId: 'icr',
    planName: 'ICR',
    monthlyPaymentCents: icrCents,
    forgivenessYears: 25,
    eligible: icrEligible
  });

  // RAP: 6% discretionary / 12, min $10/mo; 30 yr. Available from 7/1/2026.
  const rapEligible = loan.category === 'public' && !isParent && rapAvailable;
  const rapUncapped = (discDollars * 0.06) / 12;
  const rapCents = Math.max(1000, Math.round(rapUncapped * 100)); // $10 min = 1000 cents
  plans.push({
    planId: 'rap',
    planName: 'RAP',
    monthlyPaymentCents: rapCents,
    forgivenessYears: 30,
    eligible: rapEligible
  });

  // Standard 10-year: always eligible
  plans.push({
    planId: 'standard',
    planName: 'Standard',
    monthlyPaymentCents: standardCents,
    forgivenessYears: 10,
    eligible: true
  });

  const eligiblePlans = plans.filter((p) => p.eligible);
  const lowestEligibleCents =
    eligiblePlans.length > 0
      ? Math.min(...eligiblePlans.map((p) => p.monthlyPaymentCents))
      : null;

  return { plans, lowestEligibleCents };
}

type LoanWithDerived = Loan & {
  monthlyNowCents: number | null;
  monthlyLaterCents: number | null;
  dailyInterestCents: number;
  monthlyInterestCents: number;
  payoffMonths: number | null;
  federalPlans?: FederalPlanRow[];
};

function getAgiCents(loan: Loan, detectedAnnualIncomeCents: number): number {
  const useManual = loan.idrUseManualIncome;
  return useManual
    ? Math.max(0, loan.idrManualAnnualIncomeCents ?? 0)
    : Math.max(0, detectedAnnualIncomeCents);
}

function deriveForLoan(
  loan: Loan,
  allLoans: Loan[],
  detectedAnnualIncomeCents: number
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

  const isPublicInSchoolOrGrace =
    category === 'public' &&
    (repaymentStatus === 'in_school_interest_only' || repaymentStatus === 'grace_interest_only');

  if (category === 'public') {
    const agiCents = getAgiCents(loan, detectedAnnualIncomeCents);
    const { plans, lowestEligibleCents } = computeFederalPlans(loan, allPublicLoans, agiCents);
    federalPlans = plans;

    if (repaymentStatus === 'in_school_interest_only' || repaymentStatus === 'grace_interest_only') {
      // In school: $0 current payment (per Part 6). After grace = lowest eligible plan.
      monthlyNowCents = 0;
      monthlyLaterCents = lowestEligibleCents;
      payoffMonths =
        monthlyLaterCents != null && monthlyLaterCents > 0
          ? computeMonthsToPayoff(balanceCents, interestRatePercent, monthlyLaterCents)
          : computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
    } else if (repaymentStatus === 'full_repayment') {
      monthlyNowCents = fullPaymentCents;
      monthlyLaterCents = null;
      payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
    } else if (repaymentStatus === 'idr') {
      monthlyNowCents = lowestEligibleCents;
      monthlyLaterCents = null;
      payoffMonths =
        monthlyNowCents != null && monthlyNowCents > 0
          ? computeMonthsToPayoff(balanceCents, interestRatePercent, monthlyNowCents)
          : null;
    } else if (repaymentStatus === 'deferred_forbearance') {
      monthlyNowCents = 0;
      monthlyLaterCents = lowestEligibleCents ?? fullPaymentCents;
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
    // Private loan: unchanged behavior
    const futurePlan = loan.futureRepaymentPlan || 'na';
    if (repaymentStatus === 'in_school_interest_only' || repaymentStatus === 'grace_interest_only') {
      monthlyNowCents = interestOnlyMonthly;
      monthlyLaterCents = fullPaymentCents;
      payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
    } else if (repaymentStatus === 'full_repayment') {
      monthlyNowCents = fullPaymentCents;
      monthlyLaterCents = null;
      payoffMonths = computeMonthsToPayoff(balanceCents, interestRatePercent, fullPaymentCents);
    } else if (repaymentStatus === 'deferred_forbearance') {
      monthlyNowCents = 0;
      monthlyLaterCents = fullPaymentCents;
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
  }

  return {
    ...loan,
    monthlyNowCents,
    monthlyLaterCents,
    dailyInterestCents,
    monthlyInterestCents,
    payoffMonths,
    federalPlans
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
      stateOfResidency: 'contiguous'
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
    stateOfResidency: l.stateOfResidency ?? 'contiguous'
  };
}

function editorToLoan(e: LoanEditorState, prev: Loan | null): Loan | null {
  const balanceCents = Math.round(parseFloat(e.balance || '0') * 100);
  const ratePercent = parseFloat(e.ratePercent || '0');
  const termMonths =
    e.termMonths && parseInt(e.termMonths, 10) > 0 ? parseInt(e.termMonths, 10) : undefined;
  const nextPaymentCents =
    e.nextPayment && parseFloat(e.nextPayment) > 0
      ? Math.round(parseFloat(e.nextPayment) * 100)
      : undefined;
  const idrManualAnnualIncomeCents =
    e.idrManualAnnualIncome && parseFloat(e.idrManualAnnualIncome) > 0
      ? Math.round(parseFloat(e.idrManualAnnualIncome) * 100)
      : undefined;

  if (!(balanceCents >= 0 && !Number.isNaN(ratePercent))) return null;

  const gracePeriodEndDate =
    e.repaymentStatus === 'in_school_interest_only' && e.gracePeriodEndDate
      ? e.gracePeriodEndDate
      : undefined;

  const futureRepaymentPlan =
    e.category === 'public' ? (e.futureRepaymentPlan || 'na') : undefined;

  const subsidyType = e.category === 'public' ? e.subsidyType : undefined;
  const disbursementDate = e.category === 'public' && e.disbursementDate ? e.disbursementDate : undefined;
  const householdSize =
    e.category === 'public' && e.householdSize
      ? Math.max(1, Math.min(20, parseInt(e.householdSize, 10) || 1))
      : undefined;
  const dependents =
    e.category === 'public' && e.dependents !== ''
      ? Math.max(0, Math.min(20, parseInt(e.dependents, 10) || 0))
      : undefined;

  return {
    id: prev?.id || uid(),
    name: e.name.trim() || 'Loan',
    lender: e.lender.trim() || undefined,
    category: e.category,
    balanceCents,
    interestRatePercent: ratePercent,
    rateType: e.rateType,
    termMonths,
    repaymentStatus: e.repaymentStatus,
    futureRepaymentPlan,
    subsidyType,
    disbursementDate,
    borrowerType: e.category === 'public' ? e.borrowerType : undefined,
    householdSize,
    dependents,
    stateOfResidency: e.category === 'public' ? e.stateOfResidency : undefined,
    paymentScheduleRanges: prev?.paymentScheduleRanges,
    gracePeriodEndDate,
    nextPaymentCents,
    nextPaymentDate: e.nextPaymentDate || undefined,
    notes: e.notes.trim() || undefined,
    active: e.active,
    idrUseManualIncome: e.idrUseManualIncome,
    idrManualAnnualIncomeCents
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
  onBreakdown: () => void;
  onRefinance?: () => void;
}) {
  const { loan: l, onEdit, onDelete, onPayoffAge, onBreakdown, onRefinance } = props;
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
      <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 6 }}>
        Estimated payment after grace:{' '}
        {l.monthlyLaterCents != null ? formatCents(l.monthlyLaterCents) : '—'}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 8 }}>
        {l.lender ? `Servicer: ${l.lender}` : null}
        {l.lender ? ' · ' : null}
        Daily ≈ {formatCents(l.dailyInterestCents)}
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
              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Plan</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px' }}>Monthly payment</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px' }}>Forgiveness</th>
                  </tr>
                </thead>
                <tbody>
                  {l.federalPlans.map((p) => (
                    <tr
                      key={p.planId}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        opacity: p.eligible ? 1 : 0.6
                      }}
                    >
                      <td style={{ padding: '4px 8px' }}>
                        {p.planName}
                        {!p.eligible ? ' (not eligible)' : ''}
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
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="btn-row" style={{ marginTop: 6, flexWrap: 'wrap', gap: 6 }}>
        <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem' }} onClick={onEdit}>Edit</button>
        <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem' }} onClick={onDelete}>Delete</button>
        <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem' }} onClick={onPayoffAge}>Payoff age</button>
        <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem' }} onClick={onBreakdown}>Breakdown</button>
        {onRefinance ? <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem' }} onClick={onRefinance}>Refinance</button> : null}
      </div>
    </div>
  );
}

export function LoansPage() {
  const data = useLedgerStore((s) => s.data);
  const [state, setState] = useState<LoansState>(() => loadLoans());
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; value: LoanEditorState } | null>(null);
  const [refiLoan, setRefiLoan] = useState<Loan | null>(null);
  const [payoffLoan, setPayoffLoan] = useState<LoanWithDerived | null>(null);
  const [scheduleLoan, setScheduleLoan] = useState<LoanWithDerived | null>(null);

  const birthdateISO = loadBirthdateISO();

  const detectedAnnualIncomeCents = useMemo(() => {
    const rec = (data.recurring || []).filter(
      (r) => r.type === 'income' && r.isFullTimeJob
    );
    if (!rec.length) return 0;
    return rec.reduce((s, r) => s + recurringAnnualIncomeCents(r as any), 0);
  }, [data.recurring]);

  const loansWithDerived: LoanWithDerived[] = useMemo(() => {
    return (state.loans || []).map((l) =>
      deriveForLoan(l, state.loans || [], detectedAnnualIncomeCents)
    );
  }, [state.loans, detectedAnnualIncomeCents]);

  const summary = useMemo(() => {
    let totalBalance = 0;
    let totalMonthlyNow = 0;
    let totalMonthlyLater = 0;
    let weightedRateNumerator = 0;

    let anyLater = false;

    loansWithDerived.forEach((l) => {
      const bal = l.balanceCents || 0;
      totalBalance += bal;
      if (l.monthlyNowCents != null) totalMonthlyNow += l.monthlyNowCents;
      if (l.monthlyLaterCents != null) {
        totalMonthlyLater += l.monthlyLaterCents;
        anyLater = true;
      }
      weightedRateNumerator += bal * l.interestRatePercent;
    });

    const weightedRate =
      totalBalance > 0 ? weightedRateNumerator / totalBalance : 0;

    // Use the latest payoff among loans (rough approximation).
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
      weightedRate,
      payoffAge
    };
  }, [loansWithDerived, birthdateISO]);

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

  const hasRecurringIncome = detectedAnnualIncomeCents > 0;

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
        <div className="summary-kv" style={{ marginTop: 4 }}>
          <span className="k">Payment (now)</span>
          <span className="v" style={{ color: 'var(--red)' }}>
            {summary.totalMonthlyNow > 0 ? formatCents(summary.totalMonthlyNow) : '—'}
          </span>
        </div>
        <div className="summary-kv" style={{ marginTop: 2 }}>
          <span className="k">After grace</span>
          <span className="v" style={{ color: 'var(--red)' }}>
            {summary.totalMonthlyLater != null ? formatCents(summary.totalMonthlyLater) : '—'}
          </span>
        </div>
        <div className="summary-kv" style={{ marginTop: 2 }}>
          <span className="k">Avg rate</span>
          <span className="v">
            {summary.totalBalance > 0 ? `${summary.weightedRate.toFixed(2)}%` : '—'}
          </span>
        </div>
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

      {loansWithDerived.length === 0 ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ marginTop: 0, marginBottom: 8, color: 'var(--muted)', fontSize: '0.9rem' }}>
            Track student and other loans here. All values are manual and for estimates only.
          </p>
          <button
            type="button"
            className="btn btn-add"
            onClick={() =>
              setEditor({
                mode: 'add',
                value: loanToEditor(null, hasRecurringIncome)
              })
            }
          >
            + Add loan
          </button>
        </div>
      ) : null}

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
          onBreakdown={() => setScheduleLoan(l)}
          onRefinance={l.category === 'private' ? () => setRefiLoan(l) : undefined}
        />
      ))}

      {loansWithDerived.length > 0 ? (
        <button
          type="button"
          className="btn btn-add"
          style={{ width: '100%', marginTop: 8 }}
          onClick={() =>
            setEditor({
              mode: 'add',
              value: loanToEditor(null, hasRecurringIncome)
            })
          }
        >
          + Add loan
        </button>
      ) : null}

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

      {/* Payment breakdown / schedule modal */}
      <Modal
        open={!!scheduleLoan}
        title="Payment breakdown"
        onClose={() => setScheduleLoan(null)}
      >
        {scheduleLoan ? (
          <PaymentScheduleModal
            loan={scheduleLoan}
            onClose={() => setScheduleLoan(null)}
            onSave={(ranges) => {
              persist({
                loans: state.loans.map((l) =>
                  l.id === scheduleLoan.id ? { ...l, paymentScheduleRanges: ranges } : l
                )
              });
              setScheduleLoan(null);
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function LoanEditorForm(props: {
  state: LoanEditorState;
  hasRecurringIncome: boolean;
  onChange: (next: LoanEditorState) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { state, onChange, onCancel, onSave, hasRecurringIncome } = props;
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
          <div className="field">
            <label>Adjusted Gross Income (AGI)</label>
            <div className="toggle-row">
              <input
                type="checkbox"
                id="idrUseManual"
                checked={state.idrUseManualIncome || !hasRecurringIncome}
                onChange={(e) =>
                  onChange({
                    ...state,
                    idrUseManualIncome: e.target.checked || !hasRecurringIncome
                  })
                }
              />
              <label htmlFor="idrUseManual">
                {hasRecurringIncome
                  ? 'Use manual AGI instead of detected full-time job income'
                  : 'Use manual AGI'}
              </label>
            </div>
            <input
              value={state.idrManualAnnualIncome}
              onChange={(e) => onChange({ ...state, idrManualAnnualIncome: e.target.value })}
              inputMode="decimal"
              placeholder="Annual AGI ($) if manual"
              style={{ marginTop: 4 }}
            />
          </div>
          <div className="field">
            <label>Household size</label>
            <input
              type="number"
              min={1}
              max={20}
              value={state.householdSize}
              onChange={(e) => onChange({ ...state, householdSize: e.target.value })}
              inputMode="numeric"
            />
            <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--muted)' }}>
              For poverty guideline (default 1).
            </p>
          </div>
          <div className="field">
            <label>Number of dependents</label>
            <input
              type="number"
              min={0}
              max={20}
              value={state.dependents}
              onChange={(e) => onChange({ ...state, dependents: e.target.value })}
              inputMode="numeric"
            />
            <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--muted)' }}>
              Default 0.
            </p>
          </div>
          <div className="field">
            <label>State of residency</label>
            <Select
              value={state.stateOfResidency}
              onChange={(e) =>
                onChange({
                  ...state,
                  stateOfResidency: (e.target.value as LoanStateOfResidency) || 'contiguous'
                })
              }
            >
              <option value="contiguous">48 contiguous states / D.C.</option>
              <option value="AK">Alaska</option>
              <option value="HI">Hawaii</option>
            </Select>
            <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--muted)' }}>
              For federal poverty guideline.
            </p>
          </div>
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
      <div className="field">
        <label>Repayment term (months)</label>
        <input
          value={state.termMonths}
          onChange={(e) => onChange({ ...state, termMonths: e.target.value })}
          inputMode="numeric"
          placeholder="e.g. 120"
        />
      </div>
      <div className="field">
        <label>Current status</label>
        <Select
          value={state.repaymentStatus}
          onChange={(e) =>
            onChange({
              ...state,
              repaymentStatus: e.target.value as any
            })
          }
        >
          <option value="in_school_interest_only">In school / interest-only</option>
          <option value="grace_interest_only">Grace period / interest-only</option>
          <option value="full_repayment">Full repayment</option>
          {idrAllowed ? <option value="idr">IDR (income-driven)</option> : null}
          <option value="deferred_forbearance">Deferred / forbearance</option>
          <option value="custom_payment">Custom monthly payment</option>
        </Select>
        <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--muted)' }}>
          Current repayment status
        </p>
      </div>
      {state.category === 'public' ? (
        <div className="field">
          <label>Plan after grace</label>
          <Select
            value={state.futureRepaymentPlan}
            onChange={(e) =>
              onChange({
                ...state,
                futureRepaymentPlan: (e.target.value || 'na') as FutureRepaymentPlan
              })
            }
          >
            <option value="na">N/A</option>
            <option value="idr">IDR</option>
            <option value="standard">Standard</option>
            <option value="graduated">Graduated</option>
            <option value="extended">Extended</option>
            <option value="custom">Custom</option>
          </Select>
          <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--muted)' }}>
            Future repayment plan (used for &quot;after grace&quot; estimate)
          </p>
        </div>
      ) : null}
      {state.repaymentStatus === 'in_school_interest_only' ? (
        <div className="field">
          <label>Grace Period End Date</label>
          <input
            type="date"
            value={state.gracePeriodEndDate}
            onChange={(e) => onChange({ ...state, gracePeriodEndDate: e.target.value })}
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
          <p style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
            Full repayment is assumed to start after this date.
          </p>
        </div>
      ) : null}
      <div className="field">
        <label>Next payment amount ($)</label>
        <input
          value={state.nextPayment}
          onChange={(e) => onChange({ ...state, nextPayment: e.target.value })}
          inputMode="decimal"
          placeholder="Optional"
        />
      </div>
      <div className="field">
        <label>Next payment date</label>
        <input
          type="date"
          value={state.nextPaymentDate}
          onChange={(e) => onChange({ ...state, nextPaymentDate: e.target.value })}
        />
      </div>
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

function sortRanges(ranges: PaymentScheduleRange[]): PaymentScheduleRange[] {
  return [...ranges].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function rangesOverlap(a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }): boolean {
  return a.startDate < b.endDate && a.endDate > b.startDate;
}

function PaymentScheduleModal(props: {
  loan: LoanWithDerived;
  onClose: () => void;
  onSave: (ranges: PaymentScheduleRange[]) => void;
}) {
  const { loan, onClose, onSave } = props;
  const [ranges, setRanges] = useState<PaymentScheduleRange[]>(() =>
    sortRanges(loan.paymentScheduleRanges || [])
  );
  const [adding, setAdding] = useState(false);
  const [addStart, setAddStart] = useState(todayISO());
  const [addEnd, setAddEnd] = useState('');
  const [addPayment, setAddPayment] = useState(
    loan.monthlyNowCents != null ? (loan.monthlyNowCents / 100).toFixed(2) : ''
  );
  const [addRate, setAddRate] = useState(loan.interestRatePercent ? String(loan.interestRatePercent) : '');
  const [addNote, setAddNote] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const sortedRanges = useMemo(() => sortRanges(ranges), [ranges]);

  function handleGenerate() {
    const newRanges: PaymentScheduleRange[] = [];
    const start = todayISO();
    if (loan.monthlyNowCents != null && loan.monthlyNowCents > 0) {
      const end = loan.gracePeriodEndDate || addMonths(new Date(), 12).toISOString().slice(0, 10);
      newRanges.push({
        id: uid(),
        startDate: start,
        endDate: end,
        paymentCents: loan.monthlyNowCents,
        ratePercent: loan.interestRatePercent,
        note: 'Estimated (current)'
      });
    }
    if (loan.monthlyLaterCents != null && loan.monthlyLaterCents > 0 && loan.gracePeriodEndDate) {
      const graceEnd = loan.gracePeriodEndDate;
      const laterEnd = addMonths(new Date(graceEnd + 'T00:00:00'), 120).toISOString().slice(0, 10);
      newRanges.push({
        id: uid(),
        startDate: graceEnd,
        endDate: laterEnd,
        paymentCents: loan.monthlyLaterCents,
        ratePercent: loan.interestRatePercent,
        note: 'Estimated (after grace)'
      });
    }
    if (newRanges.length > 0) setRanges((prev) => sortRanges([...prev, ...newRanges]));
  }

  function handleAdd() {
    setAddError(null);
    if (!addStart || !addEnd) {
      setAddError('Start and end date required');
      return;
    }
    if (addStart >= addEnd) {
      setAddError('End date must be after start date');
      return;
    }
    const paymentCents = Math.round(parseFloat(addPayment || '0') * 100);
    if (!(paymentCents > 0)) {
      setAddError('Payment must be greater than 0');
      return;
    }
    const newRange: PaymentScheduleRange = {
      id: uid(),
      startDate: addStart,
      endDate: addEnd,
      paymentCents,
      ratePercent: addRate ? parseFloat(addRate) : undefined,
      note: addNote.trim() || undefined
    };
    for (const r of ranges) {
      if (rangesOverlap(newRange, r)) {
        setAddError('This range overlaps an existing range');
        return;
      }
    }
    setRanges((prev) => sortRanges([...prev, newRange]));
    setAdding(false);
    setAddStart(todayISO());
    setAddEnd('');
    setAddPayment(loan.monthlyNowCents != null ? (loan.monthlyNowCents / 100).toFixed(2) : '');
    setAddRate(String(loan.interestRatePercent));
    setAddNote('');
  }

  return (
    <>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 0, marginBottom: 8 }}>
        Optional payment schedule ranges. No gaps or overlaps.
      </p>
      <div style={{ marginBottom: 8 }}>
        <button type="button" className="btn btn-secondary" style={{ marginRight: 8 }} onClick={handleGenerate}>
          Generate estimated schedule
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
          Add range
        </button>
      </div>
      {loan.rateType === 'variable' ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '4px 0 8px' }}>
          Variable-rate: each range stores its rate. Use “Recompute” to update a range’s payment when the loan’s rate changes.
        </p>
      ) : null}
      {sortedRanges.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
          {sortedRanges.map((r) => {
            const recomputedPayment =
              loan.rateType === 'variable' && loan.interestRatePercent != null
                ? computeAmortizedPaymentCents(
                    loan.balanceCents,
                    loan.interestRatePercent,
                    loan.termMonths
                  ) ?? computeInterestOnlyMonthlyCents(loan.balanceCents, loan.interestRatePercent)
                : null;
            const rateDiffers =
              loan.rateType === 'variable' &&
              r.ratePercent != null &&
              Math.abs(r.ratePercent - (loan.interestRatePercent ?? 0)) > 0.01;
            return (
              <li
                key={r.id}
                style={{
                  padding: '6px 8px',
                  marginBottom: 4,
                  background: 'var(--bg-muted, rgba(0,0,0,0.05))',
                  borderRadius: 4,
                  fontSize: '0.9rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <span>
                  {r.startDate} – {r.endDate} = {formatCents(r.paymentCents)}
                  {r.ratePercent != null ? ` (${r.ratePercent.toFixed(2)}%)` : ''}
                </span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {loan.rateType === 'variable' && rateDiffers && recomputedPayment != null ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '2px 8px', fontSize: '0.8rem' }}
                      onClick={() => {
                        setRanges((prev) =>
                          prev.map((x) =>
                            x.id === r.id
                              ? {
                                  ...x,
                                  paymentCents: recomputedPayment,
                                  ratePercent: loan.interestRatePercent
                                }
                              : x
                          )
                        );
                      }}
                    >
                      Recompute with current rate
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '2px 8px', fontSize: '0.8rem' }}
                    onClick={() => {
                      setRanges((prev) => prev.filter((x) => x.id !== r.id));
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {adding ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginTop: 8 }}>
          <div className="field">
            <label>Start date</label>
            <input type="date" value={addStart} onChange={(e) => setAddStart(e.target.value)} />
          </div>
          <div className="field">
            <label>End date</label>
            <input type="date" value={addEnd} onChange={(e) => setAddEnd(e.target.value)} />
          </div>
          <div className="field">
            <label>Payment ($)</label>
            <input
              value={addPayment}
              onChange={(e) => setAddPayment(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div className="field">
            <label>Rate % (optional)</label>
            <input value={addRate} onChange={(e) => setAddRate(e.target.value)} inputMode="decimal" />
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <input value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="Optional" />
          </div>
          {addError ? <p style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: 4 }}>{addError}</p> : null}
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => { setAdding(false); setAddError(null); }}>Cancel</button>
            <button type="button" className="btn btn-secondary" onClick={handleAdd}>Add</button>
          </div>
        </div>
      ) : null}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-secondary" onClick={() => onSave(ranges)}>Save</button>
      </div>
    </>
  );
}

