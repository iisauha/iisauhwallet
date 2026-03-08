import { PUBLIC_LOAN_SUMMARY_KEY } from '../../state/keys';

export interface PublicLoanSummary {
  estimatedMonthlyPaymentCents: number | null;
  /** When set, used as the public-loan Payment(now) source (e.g. after "Use as current payment"). */
  currentPaymentCents?: number | null;
  notesText: string;
  /** Optional summary: total public loan balance (cents). */
  totalBalanceCents?: number | null;
  /** Optional summary: average public interest rate (e.g. 5.5 for 5.5%). */
  avgInterestRatePercent?: number | null;
}

const DEFAULT: PublicLoanSummary = {
  estimatedMonthlyPaymentCents: null,
  currentPaymentCents: null,
  notesText: '',
  totalBalanceCents: null,
  avgInterestRatePercent: null
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
  const notesText = typeof o.notesText === 'string' ? o.notesText : '';
  const totalBalanceCents = parseNum(o.totalBalanceCents) ?? null;
  const avgInterestRatePercent = parseNum(o.avgInterestRatePercent) ?? null;
  return {
    estimatedMonthlyPaymentCents,
    currentPaymentCents,
    notesText,
    totalBalanceCents,
    avgInterestRatePercent
  };
}

export function loadPublicLoanSummary(): PublicLoanSummary {
  try {
    const raw = localStorage.getItem(PUBLIC_LOAN_SUMMARY_KEY);
    if (!raw) return { ...DEFAULT };
    return parse(JSON.parse(raw));
  } catch {
    return { ...DEFAULT };
  }
}

export function savePublicLoanSummary(summary: PublicLoanSummary): void {
  try {
    localStorage.setItem(PUBLIC_LOAN_SUMMARY_KEY, JSON.stringify(summary));
  } catch {}
}
