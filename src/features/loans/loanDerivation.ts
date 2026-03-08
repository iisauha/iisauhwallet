/**
 * Loan derivation and estimated payment map for use by store/calc without importing LoansPage.
 * Used by recurring integration to resolve "estimated payment (now)" by loan id.
 */
import type { Loan } from '../../state/storage';
import type { PaymentScheduleRange } from '../../state/storage';
import { loadFederalRepaymentConfig } from '../../state/storage';

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** If the given date falls within a schedule range, return that range's payment (cents); else null. */
export function getActiveSchedulePaymentCents(
  ranges: PaymentScheduleRange[] | undefined,
  asOf: Date
): number | null {
  if (!ranges || ranges.length === 0) return null;
  const key = toDateKey(asOf);
  for (const r of ranges) {
    if (key >= r.startDate && key <= r.endDate) return r.paymentCents;
  }
  return null;
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

/** Discretionary income = AGI - threshold (dollars). IBR/PAYE use 150% of poverty level; ICR uses 100%. */
function discretionaryIncomeDollars(agiCents: number, thresholdDollars: number): number {
  const agiDollars = agiCents / 100;
  return Math.max(0, agiDollars - thresholdDollars);
}

const PHASE_OUT_DATE = '2028-07-01';
const ALL_PLANS_CUTOFF = '2026-07-01';
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

function getAgiCents(loan: Loan, detectedAnnualIncomeCents: number): number {
  const useManual = loan.idrUseManualIncome;
  return useManual
    ? Math.max(0, loan.idrManualAnnualIncomeCents ?? 0)
    : Math.max(0, detectedAnnualIncomeCents);
}

/** One total federal payment (IBR/PAYE/ICR only) from total eligible public balance + income. Uses user-editable poverty level. */
function computeFederalTotalPaymentCents(allPublicLoans: Loan[], agiCents: number): number | null {
  const eligible = allPublicLoans.filter((l) => l.category === 'public' && l.borrowerType !== 'parent');
  if (eligible.length === 0) return null;
  const { povertyLevelDollars } = loadFederalRepaymentConfig();
  const threshold150 = 1.5 * povertyLevelDollars;
  const threshold100 = 1.0 * povertyLevelDollars;
  const disc150 = discretionaryIncomeDollars(agiCents, threshold150);
  const disc100 = discretionaryIncomeDollars(agiCents, threshold100);
  const now = new Date();
  const phaseOutTime = parseDateCompare(PHASE_OUT_DATE);
  const allBeforeCutoff = allPublicLoansDisbursedBefore(allPublicLoans, ALL_PLANS_CUTOFF);
  const noLoanBefore2007 = hasNoPublicLoanBefore(allPublicLoans, PAYE_NO_LOAN_BEFORE);
  const atLeastOneAfter2011 = hasAtLeastOnePublicLoanAfter(allPublicLoans, PAYE_AT_LEAST_ONE_AFTER);
  const beforePhaseOut = now.getTime() < phaseOutTime;

  const candidates: number[] = [];
  const ibrCents = Math.round((disc150 * 0.1 / 12) * 100);
  if (allBeforeCutoff && beforePhaseOut) candidates.push(ibrCents);

  if (allBeforeCutoff && noLoanBefore2007 && atLeastOneAfter2011 && beforePhaseOut) {
    candidates.push(ibrCents);
  }

  const icrCents = Math.round((disc100 * 0.2 / 12) * 100);
  if (allBeforeCutoff && beforePhaseOut) candidates.push(icrCents);

  return candidates.length > 0 ? Math.min(...candidates) : null;
}

function deriveMonthlyNowCents(
  loan: Loan,
  allLoans: Loan[],
  detectedAnnualIncomeCents: number
): number | null {
  const { balanceCents, interestRatePercent, repaymentStatus, termMonths, category } = loan;
  const allPublicLoans = allLoans.filter((l) => l.category === 'public');
  const interestOnlyMonthly = computeInterestOnlyMonthlyCents(balanceCents, interestRatePercent);
  const fullPaymentCents = computeAmortizedPaymentCents(balanceCents, interestRatePercent, termMonths) ?? interestOnlyMonthly;

  if (category === 'public') {
    if (repaymentStatus === 'in_school_interest_only' || repaymentStatus === 'grace_interest_only') {
      return 0;
    }
    if (repaymentStatus === 'full_repayment') {
      return fullPaymentCents;
    }
    if (repaymentStatus === 'idr') {
      const agiCents = getAgiCents(loan, detectedAnnualIncomeCents);
      return computeFederalTotalPaymentCents(allPublicLoans, agiCents);
    }
    if (repaymentStatus === 'deferred_forbearance') {
      return 0;
    }
    if (repaymentStatus === 'custom_payment' && loan.nextPaymentCents && loan.nextPaymentCents > 0) {
      return loan.nextPaymentCents;
    }
    return fullPaymentCents;
  }

  // Private loans: payment mode determines estimated monthly payment
  const mode = loan.privatePaymentMode ?? 'custom_monthly';
  if (mode === 'interest_only') {
    return computeInterestOnlyMonthlyCents(loan.balanceCents, loan.interestRatePercent);
  }
  if (mode === 'full_repayment') {
    return computeAmortizedPaymentCents(loan.balanceCents, loan.interestRatePercent, loan.termMonths) ?? 0;
  }
  return loan.nextPaymentCents ?? 0;
}

/** Returns map of loan id -> estimated monthly payment (now) in cents, or null if not available. */
export function getLoanEstimatedPaymentNowMap(
  loans: Loan[],
  detectedAnnualIncomeCents: number
): Record<string, number | null> {
  const map: Record<string, number | null> = {};
  for (const loan of loans) {
    const cents = deriveMonthlyNowCents(loan, loans, detectedAnnualIncomeCents);
    map[loan.id] = cents;
  }
  return map;
}

function annualizeCents(
  amountCents: number,
  freq: string,
  everyNDays?: number,
  intervalDays?: number
): number {
  if (freq === 'monthly') return amountCents * 12;
  if (freq === 'weekly') return Math.round(amountCents * 52);
  if (freq === 'biweekly') return Math.round(amountCents * 26);
  if (freq === 'yearly') return amountCents;
  const days =
    typeof intervalDays === 'number' && intervalDays > 0
      ? intervalDays
      : typeof everyNDays === 'number' && everyNDays > 0
        ? everyNDays
        : 30;
  return Math.round((amountCents * 365) / days);
}

export type DetectedAgiResult = {
  agiCents: number;
  grossCents: number;
  retirementContributionsCents: number;
};

/**
 * Derive AGI from recurring full-time job income minus pre-tax employer/retirement contributions.
 * Used for federal loan repayment calculations.
 */
export function getDetectedAgiFromRecurring(
  recurring: Array<{
    type?: string;
    amountCents?: number;
    frequency?: string;
    everyNDays?: number;
    intervalDays?: number;
    preTaxDeductions?: Array<{ amountCents?: number; deductionType?: string }>;
  }>
): DetectedAgiResult {
  const recs = recurring.filter((r) => r.type === 'income' && (r as any).isFullTimeJob);
  let grossCents = 0;
  let retirementContributionsCents = 0;
  for (const r of recs) {
    const amt = r.amountCents || 0;
    const freq = r.frequency || 'monthly';
    const annual = annualizeCents(
      amt,
      freq,
      r.everyNDays,
      (r as any).intervalDays
    );
    grossCents += annual;
    const deductions = r.preTaxDeductions || [];
    for (const d of deductions) {
      if (d.deductionType === 'retirement' && typeof d.amountCents === 'number' && d.amountCents > 0) {
        retirementContributionsCents += annualizeCents(
          d.amountCents,
          freq,
          r.everyNDays,
          (r as any).intervalDays
        );
      }
    }
  }
  const agiCents = Math.max(0, grossCents - retirementContributionsCents);
  return { agiCents, grossCents, retirementContributionsCents };
}

/** Returns AGI (recurring full-time income minus pre-tax retirement contributions) for loan derivation. */
export function getDetectedAnnualIncomeCentsFromRecurring(
  recurring: Array<{ type?: string; amountCents?: number; frequency?: string; everyNDays?: number; intervalDays?: number; preTaxDeductions?: Array<{ amountCents?: number; deductionType?: string }> }>
): number {
  return getDetectedAgiFromRecurring(recurring).agiCents;
}
