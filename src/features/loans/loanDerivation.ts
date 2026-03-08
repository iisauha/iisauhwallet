/**
 * Loan derivation and estimated payment map for use by store/calc without importing LoansPage.
 * Used by recurring integration to resolve "estimated payment (now)" by loan id.
 */
import type { Loan } from '../../state/storage';

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

const PHASE_OUT_DATE = '2028-07-01';
const RAP_START_DATE = '2026-07-01';
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

function computeFederalLowestCents(
  loan: Loan,
  allPublicLoans: Loan[],
  agiCents: number
): number | null {
  const isParent = loan.borrowerType === 'parent';
  const householdSize = Math.max(1, loan.householdSize ?? 1);
  const stateOfResidency = (loan.stateOfResidency ?? 'contiguous') as 'contiguous' | 'AK' | 'HI';
  const discDollars = discretionaryIncomeDollars(agiCents, householdSize, stateOfResidency);
  const now = new Date();
  const phaseOutTime = parseDateCompare(PHASE_OUT_DATE);
  const rapStartTime = parseDateCompare(RAP_START_DATE);

  const standard120 = computeAmortizedPaymentCents(loan.balanceCents, loan.interestRatePercent, 120);
  const standardCents = standard120 ?? computeInterestOnlyMonthlyCents(loan.balanceCents, loan.interestRatePercent);
  const icr12Year = computeAmortizedPaymentCents(loan.balanceCents, loan.interestRatePercent, 144);

  const allBeforeCutoff = allPublicLoansDisbursedBefore(allPublicLoans, ALL_PLANS_CUTOFF);
  const noLoanBefore2007 = hasNoPublicLoanBefore(allPublicLoans, PAYE_NO_LOAN_BEFORE);
  const atLeastOneAfter2011 = hasAtLeastOnePublicLoanAfter(allPublicLoans, PAYE_AT_LEAST_ONE_AFTER);
  const beforePhaseOut = now.getTime() < phaseOutTime;
  const rapAvailable = now.getTime() >= rapStartTime;

  const candidates: number[] = [];

  if (loan.category === 'public' && !isParent && allBeforeCutoff && beforePhaseOut) {
    candidates.push(Math.round((discDollars * 0.1) / 12 * 100));
  }
  if (
    loan.category === 'public' &&
    !isParent &&
    allBeforeCutoff &&
    noLoanBefore2007 &&
    atLeastOneAfter2011 &&
    beforePhaseOut &&
    standardCents != null
  ) {
    const payeUncapped = (discDollars * 0.1) / 12 * 100;
    candidates.push(Math.round(Math.min(payeUncapped, standardCents)));
  }
  if (loan.category === 'public' && !isParent && allBeforeCutoff && beforePhaseOut && icr12Year != null) {
    candidates.push(Math.round(Math.min((discDollars * 0.2) / 12 * 100, icr12Year)));
  }
  if (loan.category === 'public' && !isParent && rapAvailable) {
    candidates.push(Math.max(1000, Math.round((discDollars * 0.06) / 12 * 100)));
  }
  if (standardCents != null) candidates.push(standardCents);

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
    const agiCents = getAgiCents(loan, detectedAnnualIncomeCents);
    const lowestEligibleCents = computeFederalLowestCents(loan, allPublicLoans, agiCents);

    if (repaymentStatus === 'in_school_interest_only' || repaymentStatus === 'grace_interest_only') {
      return 0;
    }
    if (repaymentStatus === 'full_repayment') {
      return fullPaymentCents;
    }
    if (repaymentStatus === 'idr') {
      return lowestEligibleCents;
    }
    if (repaymentStatus === 'deferred_forbearance') {
      return 0;
    }
    if (repaymentStatus === 'custom_payment' && loan.nextPaymentCents && loan.nextPaymentCents > 0) {
      return loan.nextPaymentCents;
    }
    return fullPaymentCents;
  }

  if (repaymentStatus === 'in_school_interest_only' || repaymentStatus === 'grace_interest_only') {
    return interestOnlyMonthly;
  }
  if (repaymentStatus === 'full_repayment') {
    return fullPaymentCents;
  }
  if (repaymentStatus === 'deferred_forbearance') {
    return 0;
  }
  if (repaymentStatus === 'custom_payment' && loan.nextPaymentCents && loan.nextPaymentCents > 0) {
    return loan.nextPaymentCents;
  }
  return fullPaymentCents;
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

/** Sum annual income from recurring items marked as full-time job (for AGI / loan derivation). */
export function getDetectedAnnualIncomeCentsFromRecurring(
  recurring: Array<{ type?: string; amountCents?: number; frequency?: string; everyNDays?: number; intervalDays?: number }>
): number {
  const recs = recurring.filter((r) => r.type === 'income' && (r as any).isFullTimeJob);
  if (!recs.length) return 0;
  let total = 0;
  for (const r of recs) {
    const amt = r.amountCents || 0;
    const freq = r.frequency || 'monthly';
    if (freq === 'monthly') total += amt * 12;
    else if (freq === 'weekly') total += Math.round(amt * 52);
    else if (freq === 'biweekly') total += Math.round(amt * 26);
    else if (freq === 'yearly') total += amt;
    else {
      const days = typeof (r as any).intervalDays === 'number' && (r as any).intervalDays > 0
        ? (r as any).intervalDays
        : typeof r.everyNDays === 'number' && r.everyNDays > 0
          ? r.everyNDays
          : 30;
      total += Math.round((amt * 365) / days);
    }
  }
  return total;
}
