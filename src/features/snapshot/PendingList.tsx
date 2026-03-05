import type { LedgerData, PendingInboundItem, PendingOutboundItem } from '../../state/models';
import { formatCents } from '../../state/calc';

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
        const baseLabel = isRefund ? `Refund — ${p.label}${cardName ? ` → ${cardName}` : ''}` : p.label;
        const amountText = formatCents(p.amountCents);
        return (
          <div className="pending-item" key={p.id}>
            <span>
              {isRefund ? <span className="pending-refund-badge">Refund</span> : null}
              {isRefund ? ' — ' : null}
              {escapeText(baseLabel.replace(/^Refund —\s*/, ''))}
              {' '}
              <span className="pending-amount inbound-amount">{amountText}</span>
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-posted" onClick={() => props.onPosted?.(p.id)}>
                Posted
              </button>
              <button type="button" className="btn-delete" onClick={() => props.onDelete?.(p.id)}>
                Delete
              </button>
            </div>
          </div>
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
        const amountText = formatCents(p.amountCents);
        if (isCcPay) {
          const bank = p.sourceBankId ? (props.data.banks || []).find((b) => b.id === p.sourceBankId) : undefined;
          const card = p.targetCardId ? (props.data.cards || []).find((c) => c.id === p.targetCardId) : undefined;
          const bankName = bank ? bank.name || 'Bank' : 'Bank';
          const cardName = card ? card.name || 'Card' : 'Card';
          label = `CC Payment From ${bankName} → ${cardName}`;
        } else {
          label = `${p.label}`;
        }
        return (
          <div className="pending-item" key={p.id}>
            <span>
              {isCcPay ? <span className="pending-ccpay-badge">CC Payment</span> : null}
              {isCcPay ? ' ' : null}
              {escapeText(label.replace(/^CC Payment\s*/, ''))}
              {' '}
              <span className="pending-amount outbound-amount">{amountText}</span>
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-posted" onClick={() => props.onPosted?.(p.id)}>
                Posted
              </button>
              <button type="button" className="btn-delete" onClick={() => props.onDelete?.(p.id)}>
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

