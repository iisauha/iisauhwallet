import { PUBLIC_LOAN_SUMMARY_KEY } from '../../state/keys';

export interface PublicLoanSummary {
  estimatedMonthlyPaymentCents: number | null;
  notesText: string;
  /** Optional: data URLs (e.g. base64 image) for screenshots. Kept small to avoid localStorage limits. */
  attachments?: string[];
}

const DEFAULT: PublicLoanSummary = {
  estimatedMonthlyPaymentCents: null,
  notesText: '',
  attachments: []
};

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
  return { estimatedMonthlyPaymentCents, notesText, attachments };
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
