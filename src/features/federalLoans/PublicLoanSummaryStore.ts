import { PUBLIC_LOAN_SUMMARY_KEY } from '../../state/keys';
import { loadEncryptedKey, saveEncryptedKey } from '../../state/storage';

export type PublicLoanPaymentMode = 'current_payment' | 'first_payment_date';

export interface PublicLoanSummary {
  estimatedMonthlyPaymentCents: number | null;
  /** When set, used as the public-loan Payment(now) source (e.g. after "Use as current payment"). */
  currentPaymentCents?: number | null;
  /** Optional first payment date (YYYY-MM-DD). In first_payment_date mode, estimated payment contributes only when today >= this date. */
  firstPaymentDate?: string | null;
  /** How public payment is applied to Payment(now): current_payment = use currentPaymentCents now; first_payment_date = use estimated only when today >= firstPaymentDate. */
  paymentMode?: PublicLoanPaymentMode | null;
  /** When true, first-payment-date auto-add to Payment(now) is paused (does not clear the estimate). */
  firstPaymentDateAutoAddPaused?: boolean;
  /** Last date (YYYY-MM-DD) we auto-added public to Payment(now) due to first payment date; used to avoid double-add. */
  firstPaymentDateLastAutoAddedAt?: string | null;
  notesText: string;
  /** Optional summary: total public loan balance (cents). User-editable; reduced when posted. */
  totalBalanceCents?: number | null;
  /** Optional summary: average public interest rate (e.g. 5.5 for 5.5%). */
  avgInterestRatePercent?: number | null;
  /** When true, estimated interest (balance × avgRate) is added to the public principal shown in the donut ring. */
  includeInterestInPrincipal?: boolean;
}

const DEFAULT: PublicLoanSummary = {
  estimatedMonthlyPaymentCents: null,
  currentPaymentCents: null,
  firstPaymentDate: null,
  paymentMode: 'current_payment',
  firstPaymentDateAutoAddPaused: false,
  firstPaymentDateLastAutoAddedAt: null,
  notesText: '',
  totalBalanceCents: null,
  avgInterestRatePercent: null,
  includeInterestInPrincipal: false
};

function parseNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  return null;
}

function parse(raw: unknown): PublicLoanSummary {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT };
  const o = raw as Record<string, unknown>;
  const estimatedMonthlyPaymentCents =
    typeof o.estimatedMonthlyPaymentCents === 'number' && o.estimatedMonthlyPaymentCents >= 0
      ? o.estimatedMonthlyPaymentCents
      : null;
  const currentPaymentCents = parseNum(o.currentPaymentCents) ?? null;
  const firstPaymentDate = typeof o.firstPaymentDate === 'string' && o.firstPaymentDate.trim() ? o.firstPaymentDate.trim() : null;
  const paymentMode =
    o.paymentMode === 'current_payment' || o.paymentMode === 'first_payment_date'
      ? o.paymentMode
      : firstPaymentDate
        ? ('first_payment_date' as const)
        : ('current_payment' as const);
  const firstPaymentDateAutoAddPaused = o.firstPaymentDateAutoAddPaused === true;
  const firstPaymentDateLastAutoAddedAt =
    typeof o.firstPaymentDateLastAutoAddedAt === 'string' && o.firstPaymentDateLastAutoAddedAt.trim()
      ? o.firstPaymentDateLastAutoAddedAt.trim()
      : null;
  const notesText = typeof o.notesText === 'string' ? o.notesText : '';
  const totalBalanceCents = parseNum(o.totalBalanceCents) ?? null;
  const avgInterestRatePercent = parseNum(o.avgInterestRatePercent) ?? null;
  const includeInterestInPrincipal = o.includeInterestInPrincipal === true;
  return {
    estimatedMonthlyPaymentCents,
    currentPaymentCents,
    firstPaymentDate,
    paymentMode,
    firstPaymentDateAutoAddPaused,
    firstPaymentDateLastAutoAddedAt,
    notesText,
    totalBalanceCents,
    avgInterestRatePercent,
    includeInterestInPrincipal
  };
}

export function loadPublicLoanSummary(): PublicLoanSummary {
  try {
    const raw = loadEncryptedKey(PUBLIC_LOAN_SUMMARY_KEY);
    if (!raw) return { ...DEFAULT };
    return parse(JSON.parse(raw));
  } catch {
    return { ...DEFAULT };
  }
}

export function savePublicLoanSummary(summary: PublicLoanSummary): void {
  try {
    saveEncryptedKey(PUBLIC_LOAN_SUMMARY_KEY, JSON.stringify(summary));
  } catch {}
}
