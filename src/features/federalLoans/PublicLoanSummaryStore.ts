import { PUBLIC_LOAN_SUMMARY_KEY } from '../../state/keys';

export interface PublicLoanSummary {
  estimatedMonthlyPaymentCents: number | null;
  notesText: string;
  /** Optional: data URLs (e.g. base64 image) for screenshots. Kept small to avoid localStorage limits. */
  attachments?: string[];
  /** Optional summary: total public loan balance (cents). */
  totalBalanceCents?: number | null;
  /** Optional summary: average public interest rate (e.g. 5.5 for 5.5%). */
  avgInterestRatePercent?: number | null;
}

const DEFAULT: PublicLoanSummary = {
  estimatedMonthlyPaymentCents: null,
  notesText: '',
  attachments: [],
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
  const notesText = typeof o.notesText === 'string' ? o.notesText : '';
  let attachments: string[] = [];
  if (Array.isArray(o.attachments)) {
    attachments = o.attachments.filter((x): x is string => typeof x === 'string').slice(0, 6);
  }
  const totalBalanceCents = parseNum(o.totalBalanceCents) ?? null;
  const avgInterestRatePercent = parseNum(o.avgInterestRatePercent) ?? null;
  return {
    estimatedMonthlyPaymentCents,
    notesText,
    attachments,
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
