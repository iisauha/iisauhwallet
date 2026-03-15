import { useState } from 'react';
import type { LedgerData, PendingInboundItem, PendingOutboundItem } from '../../state/models';
import { formatCents } from '../../state/calc';

function escapeText(s: string): string {
  return s;
}

function renderInboundItem(
  p: PendingInboundItem,
  data: LedgerData,
  onPosted?: (id: string) => void,
  onDelete?: (id: string) => void
) {
  const isRefund = Boolean(p.isRefund || p.depositTo === 'card');
  const isHysa = p.depositTo === 'hysa';
  const card = p.targetCardId ? (data.cards || []).find((c) => c.id === p.targetCardId) : undefined;
  const cardName = card ? card.name || '' : '';
  const baseLabel = isRefund
    ? `Refund — ${p.label}${cardName ? ` → ${cardName}` : ''}`
    : isHysa
      ? `To HYSA — ${p.label}`
      : p.label;
  const amountText = formatCents(p.amountCents);
  return (
    <div className="pending-item" key={p.id}>
      <span>
        {isRefund ? <span className="pending-refund-badge">Refund</span> : null}
        {isHysa && !isRefund ? <span className="pending-refund-badge" style={{ background: 'var(--green-light)' }}>HYSA</span> : null}
        {isRefund || isHysa ? ' — ' : null}
        {escapeText(baseLabel.replace(/^Refund —\s*/, '').replace(/^To HYSA —\s*/, ''))}
        {' '}
        <span className="pending-amount inbound-amount">{amountText}</span>
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-posted" onClick={() => onPosted?.(p.id)}>
          Posted
        </button>
        <button type="button" className="btn-delete" onClick={() => onDelete?.(p.id)}>
          Delete
        </button>
      </div>
    </div>
  );
}

export function PendingInboundList(props: {
  data: LedgerData;
  items: PendingInboundItem[];
  onPosted?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [refundsCollapsed, setRefundsCollapsed] = useState(true);
  const [otherInCollapsed, setOtherInCollapsed] = useState(true);
  const refunds = props.items.filter((p) => Boolean(p.isRefund || p.depositTo === 'card'));
  const otherIn = props.items.filter((p) => !Boolean(p.isRefund || p.depositTo === 'card'));
  return (
    <div>
      {refunds.length > 0 ? (
        <>
          <div
            className="pending-group-header"
            style={{ cursor: 'pointer', padding: '6px 0', marginBottom: 2, fontSize: '0.9rem', color: 'var(--muted)' }}
            onClick={() => setRefundsCollapsed(!refundsCollapsed)}
          >
            Refunds ({refunds.length}) {refundsCollapsed ? '▸' : '▾'}
          </div>
          {!refundsCollapsed ? refunds.map((p) => renderInboundItem(p, props.data, props.onPosted, props.onDelete)) : null}
        </>
      ) : null}
      {otherIn.length > 0 ? (
        <>
          <div
            className="pending-group-header"
            style={{ cursor: 'pointer', padding: '6px 0', marginBottom: 2, fontSize: '0.9rem', color: 'var(--muted)' }}
            onClick={() => setOtherInCollapsed(!otherInCollapsed)}
          >
            Other inbound ({otherIn.length}) {otherInCollapsed ? '▸' : '▾'}
          </div>
          {!otherInCollapsed ? otherIn.map((p) => renderInboundItem(p, props.data, props.onPosted, props.onDelete)) : null}
        </>
      ) : null}
    </div>
  );
}

function renderOutboundItem(
  p: PendingOutboundItem,
  data: LedgerData,
  onPosted?: (id: string) => void,
  onDelete?: (id: string) => void
) {
  const isCcPay = p.outboundType === 'cc_payment';
  let label: string;
  const amountText = formatCents(p.amountCents);
  if (isCcPay) {
    const bank = p.sourceBankId ? (data.banks || []).find((b) => b.id === p.sourceBankId) : undefined;
    const card = p.targetCardId ? (data.cards || []).find((c) => c.id === p.targetCardId) : undefined;
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
        <button type="button" className="btn btn-posted" onClick={() => onPosted?.(p.id)}>
          Posted
        </button>
        <button type="button" className="btn-delete" onClick={() => onDelete?.(p.id)}>
          Delete
        </button>
      </div>
    </div>
  );
}

export function PendingOutboundList(props: {
  data: LedgerData;
  items: PendingOutboundItem[];
  onPosted?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [ccPaymentsCollapsed, setCcPaymentsCollapsed] = useState(true);
  const [otherOutCollapsed, setOtherOutCollapsed] = useState(true);
  const ccPayments = props.items.filter((p) => p.outboundType === 'cc_payment');
  const otherOut = props.items.filter((p) => p.outboundType !== 'cc_payment');
  return (
    <div>
      {ccPayments.length > 0 ? (
        <>
          <div
            className="pending-group-header"
            style={{ cursor: 'pointer', padding: '6px 0', marginBottom: 2, fontSize: '0.9rem', color: 'var(--muted)' }}
            onClick={() => setCcPaymentsCollapsed(!ccPaymentsCollapsed)}
          >
            Credit card payments ({ccPayments.length}) {ccPaymentsCollapsed ? '▸' : '▾'}
          </div>
          {!ccPaymentsCollapsed ? ccPayments.map((p) => renderOutboundItem(p, props.data, props.onPosted, props.onDelete)) : null}
        </>
      ) : null}
      {otherOut.length > 0 ? (
        <>
          <div
            className="pending-group-header"
            style={{ cursor: 'pointer', padding: '6px 0', marginBottom: 2, fontSize: '0.9rem', color: 'var(--muted)' }}
            onClick={() => setOtherOutCollapsed(!otherOutCollapsed)}
          >
            Other pending outbound ({otherOut.length}) {otherOutCollapsed ? '▸' : '▾'}
          </div>
          {!otherOutCollapsed ? otherOut.map((p) => renderOutboundItem(p, props.data, props.onPosted, props.onDelete)) : null}
        </>
      ) : null}
    </div>
  );
}

