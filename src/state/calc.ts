import type { CreditCard, LedgerData, PendingInboundItem, PendingOutboundItem } from './models';

export function formatCents(c: number): string {
  const n = Number(c);
  if (Number.isNaN(n)) return '$0.00';
  return (
    '$' +
    (n / 100)
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  );
}

export function parseCents(s: string): number {
  if (typeof s !== 'string') return 0;
  const cleaned = s.replace(/[$,]/g, '').trim();
  if (!cleaned) return 0;
  const num = parseFloat(cleaned);
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}

export function sumBankTotalCents(data: LedgerData): number {
  return (data.banks || []).reduce((s, b) => s + (b.balanceCents || 0), 0);
}

export function sumCcDebtCents(cards: CreditCard[]): number {
  return (cards || []).reduce((s, c) => s + Math.max(c.balanceCents || 0, 0), 0);
}

export function sumCcCreditCents(cards: CreditCard[]): number {
  return (cards || []).reduce((s, c) => s + Math.max(-(c.balanceCents || 0), 0), 0);
}

export function sumPendingOutCents(pendingOut: PendingOutboundItem[]): number {
  return (pendingOut || []).reduce((s, p) => s + (p.amountCents || 0), 0);
}

export function sumPendingInCents(pendingIn: PendingInboundItem[]): number {
  return (pendingIn || []).reduce((s, p) => s + (p.amountCents || 0), 0);
}

// IMPORTANT: matches legacy snapshotNeedsPaint expectedFinal formula exactly.
export function calcFinalNetCashCents(data: LedgerData): {
  bankTotalCents: number;
  ccDebtCents: number;
  ccCreditCents: number;
  pendingOutCents: number;
  pendingInCents: number;
  finalNetCashCents: number;
} {
  const bankTotalCents = sumBankTotalCents(data);
  const ccDebtCents = sumCcDebtCents(data.cards || []);
  const ccCreditCents = sumCcCreditCents(data.cards || []);
  const pendingOutCents = sumPendingOutCents(data.pendingOut || []);
  const pendingInCents = sumPendingInCents(data.pendingIn || []);

  const finalNetCashCents = bankTotalCents + pendingInCents - pendingOutCents - ccDebtCents + ccCreditCents;

  return { bankTotalCents, ccDebtCents, ccCreditCents, pendingOutCents, pendingInCents, finalNetCashCents };
}

