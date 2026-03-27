import { FEDERAL_LOAN_PARAMETERS_KEY } from '../../state/keys';
import { loadEncryptedKey, saveEncryptedKey } from '../../state/storage';

export type FilingStatus = 'single' | 'mfj' | 'mfs';
export type RepaymentPlanOption = 'IBR' | 'PAYE' | 'ICR';
export type FederalStatusOption =
  | 'In School'
  | 'Grace'
  | 'Repayment'
  | 'Deferment'
  | 'Forbearance';

export interface FederalLoanParameters {
  householdSize: number;
  dependents: number;
  filingStatus: FilingStatus;
  state: string;
  nycResident: boolean;
  agiCents: number;
  useRecurringIncome: boolean;
  repaymentPlan: RepaymentPlanOption;
  povertyLevel: number;
  nextPaymentDate: string;
  status: FederalStatusOption;
}

const DEFAULTS: FederalLoanParameters = {
  householdSize: 1,
  dependents: 0,
  filingStatus: 'single',
  state: '',
  nycResident: false,
  agiCents: 0,
  useRecurringIncome: true,
  repaymentPlan: 'IBR',
  povertyLevel: 15650,
  nextPaymentDate: '',
  status: 'Repayment'
};

function parseParams(raw: unknown): FederalLoanParameters | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const householdSize = typeof o.householdSize === 'number' && o.householdSize >= 1 ? o.householdSize : 1;
  const dependents = typeof o.dependents === 'number' && o.dependents >= 0 ? o.dependents : 0;
  const filingStatus =
    o.filingStatus === 'mfj' || o.filingStatus === 'mfs' ? o.filingStatus : 'single';
  const state = typeof o.state === 'string' ? o.state : '';
  const nycResident = o.nycResident === true;
  const agiCents = typeof o.agiCents === 'number' && o.agiCents >= 0 ? o.agiCents : 0;
  const useRecurringIncome = o.useRecurringIncome !== false;
  const repaymentPlan =
    o.repaymentPlan === 'PAYE' || o.repaymentPlan === 'ICR' ? o.repaymentPlan : 'IBR';
  const povertyLevel =
    typeof o.povertyLevel === 'number' && o.povertyLevel >= 0 ? o.povertyLevel : DEFAULTS.povertyLevel;
  const nextPaymentDate = typeof o.nextPaymentDate === 'string' ? o.nextPaymentDate : '';
  const status =
    o.status === 'In School' || o.status === 'Grace' || o.status === 'Deferment' || o.status === 'Forbearance'
      ? o.status
      : 'Repayment';
  return {
    householdSize,
    dependents,
    filingStatus,
    state,
    nycResident,
    agiCents,
    useRecurringIncome,
    repaymentPlan,
    povertyLevel,
    nextPaymentDate,
    status
  };
}

export function loadFederalLoanParameters(): FederalLoanParameters | null {
  try {
    const raw = loadEncryptedKey(FEDERAL_LOAN_PARAMETERS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parseParams(parsed);
  } catch {
    return null;
  }
}

export function saveFederalLoanParameters(params: FederalLoanParameters): void {
  try {
    saveEncryptedKey(FEDERAL_LOAN_PARAMETERS_KEY, JSON.stringify(params));
  } catch {}
}

export function getDefaultFederalLoanParameters(): FederalLoanParameters {
  return { ...DEFAULTS };
}

/**
 * Compute estimated monthly payment (cents) from global federal parameters.
 * IBR/PAYE: 0.10 * (AGI - 1.5 * povertyLevel) / 12; ICR: 0.20 * (AGI - 1.0 * povertyLevel) / 12.
 * Clamp to >= 0.
 */
export function computeEstimatedMonthlyPaymentCents(
  params: FederalLoanParameters,
  agiCentsOverride: number | null
): number {
  const agiCents = agiCentsOverride != null ? agiCentsOverride : params.agiCents;
  const agiDollars = agiCents / 100;
  const p = params.povertyLevel;
  let discretionary: number;
  if (params.repaymentPlan === 'ICR') {
    discretionary = Math.max(0, agiDollars - 1.0 * p);
    return Math.round((discretionary * 0.2 / 12) * 100);
  }
  discretionary = Math.max(0, agiDollars - 1.5 * p);
  return Math.round((discretionary * 0.1 / 12) * 100);
}
