import { PUBLIC_LOAN_ESTIMATOR_KEY } from '../../state/keys';

export interface PublicLoanEstimatorState {
  totalBalanceCents: number;
  avgInterestRatePercent: number;
  agiCents: number;
  householdSize: number;
  state: string;
  dependents: number;
  povertyLevelDollars: number;
  actualPaymentOverrideCents: number | null;
}

function parseNumber(v: unknown, min: number, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= min) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,/g, '').trim());
    if (Number.isFinite(n) && n >= min) return n;
  }
  return fallback;
}

function parseState(raw: unknown): PublicLoanEstimatorState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    totalBalanceCents: Math.max(0, Math.round(parseNumber(o.totalBalanceCents, 0, 0))),
    avgInterestRatePercent: parseNumber(o.avgInterestRatePercent, 0, 0),
    agiCents: Math.max(0, Math.round(parseNumber(o.agiCents, 0, 0))),
    householdSize: Math.max(1, Math.min(10, Math.round(parseNumber(o.householdSize, 1, 1)))),
    state: typeof o.state === 'string' ? o.state : '',
    dependents: Math.max(0, Math.round(parseNumber(o.dependents, 0, 0))),
    povertyLevelDollars: parseNumber(o.povertyLevelDollars, 0, 0),
    actualPaymentOverrideCents:
      o.actualPaymentOverrideCents != null && typeof o.actualPaymentOverrideCents === 'number' && o.actualPaymentOverrideCents > 0
        ? o.actualPaymentOverrideCents
        : null
  };
}

export function loadPublicLoanEstimator(): PublicLoanEstimatorState {
  try {
    const raw = localStorage.getItem(PUBLIC_LOAN_ESTIMATOR_KEY);
    if (!raw) return getDefaultPublicLoanEstimatorState();
    const parsed = JSON.parse(raw) as unknown;
    const state = parseState(parsed);
    return state ?? getDefaultPublicLoanEstimatorState();
  } catch {
    return getDefaultPublicLoanEstimatorState();
  }
}

export function getDefaultPublicLoanEstimatorState(): PublicLoanEstimatorState {
  return {
    totalBalanceCents: 0,
    avgInterestRatePercent: 0,
    agiCents: 0,
    householdSize: 1,
    state: '',
    dependents: 0,
    povertyLevelDollars: 0,
    actualPaymentOverrideCents: null
  };
}

export function savePublicLoanEstimator(state: PublicLoanEstimatorState): void {
  try {
    localStorage.setItem(PUBLIC_LOAN_ESTIMATOR_KEY, JSON.stringify(state));
  } catch {}
}

/** 12-year amortized monthly payment in cents (for ICR cap). */
export function compute12YearAmortizedPaymentCents(
  balanceCents: number,
  ratePercent: number
): number {
  if (!(balanceCents > 0)) return 0;
  const n = 144;
  const r = ratePercent / 100 / 12;
  const principalDollars = balanceCents / 100;
  if (r <= 0) return Math.round((principalDollars / n) * 100);
  const pow = Math.pow(1 + r, n);
  const paymentDollars = (principalDollars * r * pow) / (pow - 1);
  return Math.round(paymentDollars * 100);
}

export type PlanEstimate = { planId: 'ibr' | 'paye' | 'icr'; planName: string; monthlyPaymentCents: number };

export function computePlanEstimates(state: PublicLoanEstimatorState): {
  ibr: PlanEstimate;
  paye: PlanEstimate;
  icr: PlanEstimate;
  lowestCents: number | null;
} {
  const agiDollars = state.agiCents / 100;
  const threshold150 = 1.5 * state.povertyLevelDollars;
  const threshold100 = 1.0 * state.povertyLevelDollars;
  const disc150 = Math.max(0, agiDollars - threshold150);
  const disc100 = Math.max(0, agiDollars - threshold100);

  const ibrCents = Math.round((disc150 * 0.1 / 12) * 100);
  const payeCents = Math.round((disc150 * 0.1 / 12) * 100);
  const icr20Cents = Math.round((disc100 * 0.2 / 12) * 100);
  const icr12YearCents = compute12YearAmortizedPaymentCents(state.totalBalanceCents, state.avgInterestRatePercent);
  const icrCents = Math.min(icr20Cents, icr12YearCents);

  const ibr: PlanEstimate = { planId: 'ibr', planName: 'IBR', monthlyPaymentCents: ibrCents };
  const paye: PlanEstimate = { planId: 'paye', planName: 'PAYE', monthlyPaymentCents: payeCents };
  const icr: PlanEstimate = { planId: 'icr', planName: 'ICR', monthlyPaymentCents: icrCents };

  const lowestCents = Math.min(ibrCents, payeCents, icrCents);
  return { ibr, paye, icr, lowestCents };
}
