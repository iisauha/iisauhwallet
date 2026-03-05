import type { LedgerData, PendingInboundItem, PendingOutboundItem } from '../../state/models';
import { formatCents } from '../../state/calc';
import { SwipeRow } from '../../ui/SwipeRow';

function escapeText(s: string): string {
  return s;
}

export function PendingInboundList(props: {
  data: LedgerData;
  items: PendingInboundItem[];
  onPosted?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div>
      {props.items.map((p) => {
        const isRefund = Boolean(p.isRefund || p.depositTo === 'card');
        const card = p.targetCardId ? (props.data.cards || []).find((c) => c.id === p.targetCardId) : undefined;
        const cardName = card ? card.name || '' : '';
        const label = isRefund ? `Refund — ${p.label} ${formatCents(p.amountCents)}${cardName ? ` → ${cardName}` : ''}` : `${p.label} ${formatCents(p.amountCents)}`;

        return (
          <SwipeRow key={p.id} id={`pending-in:${p.id}`} onDeleteRequested={() => props.onDelete?.(p.id)}>
            <div className="pending-item">
              <span>
                {isRefund ? <span className="pending-refund-badge">Refund</span> : null}
                {isRefund ? ' — ' : null}
                {escapeText(label.replace(/^Refund —\s*/, ''))}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-posted" onClick={() => props.onPosted?.(p.id)}>
                  Posted
                </button>
              </div>
            </div>
          </SwipeRow>
        );
      })}
    </div>
  );
}

export function PendingOutboundList(props: {
  data: LedgerData;
  items: PendingOutboundItem[];
  onPosted?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div>
      {props.items.map((p) => {
        const isCcPay = p.outboundType === 'cc_payment';
        let label: string;
        if (isCcPay) {
          const bank = p.sourceBankId ? (props.data.banks || []).find((b) => b.id === p.sourceBankId) : undefined;
          const card = p.targetCardId ? (props.data.cards || []).find((c) => c.id === p.targetCardId) : undefined;
          const bankName = bank ? bank.name || 'Bank' : 'Bank';
          const cardName = card ? card.name || 'Card' : 'Card';
          label = `CC Payment From ${bankName} → ${cardName} ${formatCents(p.amountCents)}`;
        } else {
          label = `${p.label} ${formatCents(p.amountCents)}`;
        }
        return (
          <SwipeRow key={p.id} id={`pending-out:${p.id}`} onDeleteRequested={() => props.onDelete?.(p.id)}>
            <div className="pending-item">
              <span>
                {isCcPay ? <span className="pending-ccpay-badge">CC Payment</span> : null}
                {isCcPay ? ' ' : null}
                {escapeText(label.replace(/^CC Payment\s*/, ''))}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-posted" onClick={() => props.onPosted?.(p.id)}>
                  Posted
                </button>
              </div>
            </div>
          </SwipeRow>
        );
      })}
    </div>
  );
}

