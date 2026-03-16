import { useState } from 'react';
import type { LedgerData, PendingInboundItem, PendingOutboundItem } from '../../state/models';
import { formatCents } from '../../state/calc';
import { useDropdownCollapsed } from '../../state/DropdownStateContext';

function escapeText(s: string): string {
  return s;
}

function sameDestinationInbound(a: PendingInboundItem, b: PendingInboundItem): boolean {
  if ((a.depositTo || 'bank') !== (b.depositTo || 'bank')) return false;
  const dep = a.depositTo || 'bank';
  if (dep === 'bank') return (a.targetBankId || '') === (b.targetBankId || '');
  if (dep === 'card') return (a.targetCardId || '') === (b.targetCardId || '');
  if (dep === 'hysa') return (a.targetInvestingAccountId || '') === (b.targetInvestingAccountId || '');
  return true;
}

function getInboundDestinationName(data: LedgerData, p: PendingInboundItem): string {
  const dep = p.depositTo || 'bank';
  if (dep === 'bank') {
    const bank = p.targetBankId ? (data.banks || []).find((b) => b.id === p.targetBankId) : undefined;
    return bank?.name || 'Bank';
  }
  if (dep === 'card') {
    const card = p.targetCardId ? (data.cards || []).find((c) => c.id === p.targetCardId) : undefined;
    return card?.name || 'Card';
  }
  if (dep === 'hysa') {
    // LedgerData does not currently expose investing accounts here; keep label simple.
    return 'HYSA';
  }
  return 'Account';
}

type JoinStep = 'idle' | { fromId: string } | { fromId: string; toId: string };

function renderInboundItem(
  p: PendingInboundItem,
  data: LedgerData,
  onPosted?: (id: string) => void,
  onDelete?: (id: string) => void,
  onJoin?: (id: string) => void,
  onJoinWithThis?: (id: string) => void,
  joiningFromId?: string | null
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
  const isJoiningFrom = joiningFromId === p.id;
  const canJoinWith = joiningFromId && joiningFromId !== p.id;
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
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {onJoin && !joiningFromId ? (
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '2px 6px' }} onClick={() => onJoin(p.id)}>
            Join
          </button>
        ) : null}
        {onJoinWithThis && canJoinWith ? (
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '2px 6px' }} onClick={() => onJoinWithThis(p.id)}>
            Join with this
          </button>
        ) : null}
        {isJoiningFrom ? (
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Select another to join...</span>
        ) : null}
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
  onJoinInbound?: (id1: string, id2: string, combined: Omit<PendingInboundItem, 'id'>, dateISO: string) => void;
}) {
  const [refundsCollapsed, setRefundsCollapsed] = useDropdownCollapsed('pending_in_refunds', true);
  const [otherInCollapsed, setOtherInCollapsed] = useDropdownCollapsed('pending_in_other', true);
  const [joinStep, setJoinStep] = useState<JoinStep>('idle');
  const [joinDate, setJoinDate] = useState(() => new Date().toISOString().slice(0, 10));
  const refunds = props.items.filter((p) => Boolean(p.isRefund || p.depositTo === 'card'));
  const otherIn = props.items.filter((p) => !Boolean(p.isRefund || p.depositTo === 'card'));

  const fromItem = joinStep !== 'idle' ? props.items.find((p) => p.id === joinStep.fromId) : undefined;
  const toItem = joinStep !== 'idle' && 'toId' in joinStep ? props.items.find((p) => p.id === joinStep.toId) : undefined;
  const joiningFromId = joinStep !== 'idle' ? joinStep.fromId : null;

  const renderItem = (p: PendingInboundItem) =>
    renderInboundItem(
      p,
      props.data,
      props.onPosted,
      props.onDelete,
      props.onJoinInbound ? () => setJoinStep({ fromId: p.id }) : undefined,
      props.onJoinInbound && fromItem && sameDestinationInbound(fromItem, p)
        ? (toId) => setJoinStep({ fromId: fromItem.id, toId })
        : undefined,
      joiningFromId
    );

  const confirmJoin = () => {
    if (!fromItem || !toItem || !props.onJoinInbound || joinStep === 'idle' || !('toId' in joinStep)) return;
    const destName = getInboundDestinationName(props.data, fromItem);
    const combined: Omit<PendingInboundItem, 'id'> = {
      label: `Transfer to ${destName}`,
      amountCents: (fromItem.amountCents || 0) + (toItem.amountCents || 0),
      depositTo: fromItem.depositTo,
      targetBankId: fromItem.targetBankId,
      targetCardId: fromItem.targetCardId,
      targetInvestingAccountId: fromItem.targetInvestingAccountId,
      isRefund: fromItem.isRefund,
      createdAt: new Date(joinDate).toISOString(),
    };
    props.onJoinInbound(fromItem.id, toItem.id, combined, new Date(joinDate).toISOString());
    setJoinStep('idle');
    setJoinDate(new Date().toISOString().slice(0, 10));
  };

  return (
    <div>
      {joinStep !== 'idle' && 'toId' in joinStep && fromItem && toItem ? (
        <div className="pending-item" style={{ flexWrap: 'wrap', marginBottom: 8, padding: 8, background: 'var(--surface)', borderRadius: 6 }}>
          <div style={{ width: '100%', marginBottom: 6, fontSize: '0.9rem' }}>
            Join into one: <strong>{formatCents((fromItem.amountCents || 0) + (toItem.amountCents || 0))}</strong> — Transfer to {getInboundDestinationName(props.data, fromItem)}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Date:</span>
            <input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} style={{ padding: 4, fontSize: '0.9rem' }} />
          </label>
          <button type="button" className="btn btn-posted" onClick={confirmJoin}>Confirm join</button>
          <button type="button" className="btn btn-secondary" onClick={() => setJoinStep('idle')}>Cancel</button>
        </div>
      ) : null}
      {refunds.length > 0 ? (
        <>
          <div
            className="pending-group-header"
            style={{ cursor: 'pointer', padding: '6px 0', marginBottom: 2, fontSize: '0.9rem', color: 'var(--muted)' }}
            onClick={() => setRefundsCollapsed(!refundsCollapsed)}
          >
            Refunds ({refunds.length}) {refundsCollapsed ? '▸' : '▾'}
          </div>
          {!refundsCollapsed ? refunds.map((p) => renderItem(p)) : null}
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
          {!otherInCollapsed ? otherIn.map((p) => renderItem(p)) : null}
        </>
      ) : null}
    </div>
  );
}

function sameDestinationOutbound(a: PendingOutboundItem, b: PendingOutboundItem): boolean {
  const typeA = a.outboundType || 'standard';
  const typeB = b.outboundType || 'standard';
  if (typeA !== typeB) return false;
  if (typeA === 'cc_payment') {
    return (a.sourceBankId || '') === (b.sourceBankId || '') && (a.targetCardId || '') === (b.targetCardId || '');
  }
  return (a.sourceBankId || '') === (b.sourceBankId || '') && (a.targetCardId || '') === (b.targetCardId || '') && (a.paymentTargetId || '') === (b.paymentTargetId || '');
}

function getOutboundDestinationLabel(data: LedgerData, p: PendingOutboundItem): string {
  if (p.outboundType === 'cc_payment') {
    const bank = p.sourceBankId ? (data.banks || []).find((b) => b.id === p.sourceBankId) : undefined;
    const card = p.targetCardId ? (data.cards || []).find((c) => c.id === p.targetCardId) : undefined;
    const bankName = bank?.name || 'Bank';
    const cardName = card?.name || 'Card';
    return `${bankName} to ${cardName} Transfer`;
  }
  return p.label || 'Transfer';
}

function renderOutboundItem(
  p: PendingOutboundItem,
  data: LedgerData,
  onPosted?: (id: string) => void,
  onDelete?: (id: string) => void,
  onJoin?: (id: string) => void,
  onJoinWithThis?: (id: string) => void,
  joiningFromId?: string | null
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
  const isJoiningFrom = joiningFromId === p.id;
  const canJoinWith = joiningFromId && joiningFromId !== p.id;
  return (
    <div className="pending-item" key={p.id}>
      <span>
        {isCcPay ? <span className="pending-ccpay-badge">CC Payment</span> : null}
        {isCcPay ? ' ' : null}
        {escapeText(label.replace(/^CC Payment\s*/, ''))}
        {' '}
        <span className="pending-amount outbound-amount">{amountText}</span>
      </span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {onJoin && !joiningFromId ? (
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '2px 6px' }} onClick={() => onJoin(p.id)}>
            Join
          </button>
        ) : null}
        {onJoinWithThis && canJoinWith ? (
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '2px 6px' }} onClick={() => onJoinWithThis(p.id)}>
            Join with this
          </button>
        ) : null}
        {isJoiningFrom ? (
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Select another to join...</span>
        ) : null}
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
  onJoinOutbound?: (id1: string, id2: string, combined: Omit<PendingOutboundItem, 'id'>, dateISO: string) => void;
}) {
  const [ccPaymentsCollapsed, setCcPaymentsCollapsed] = useDropdownCollapsed('pending_out_cc', true);
  const [otherOutCollapsed, setOtherOutCollapsed] = useDropdownCollapsed('pending_out_other', true);
  const [joinStep, setJoinStep] = useState<JoinStep>('idle');
  const [joinDate, setJoinDate] = useState(() => new Date().toISOString().slice(0, 10));
  const ccPayments = props.items.filter((p) => p.outboundType === 'cc_payment');
  const otherOut = props.items.filter((p) => p.outboundType !== 'cc_payment');

  const fromItem = joinStep !== 'idle' ? props.items.find((p) => p.id === joinStep.fromId) : undefined;
  const toItem = joinStep !== 'idle' && 'toId' in joinStep ? props.items.find((p) => p.id === joinStep.toId) : undefined;
  const joiningFromId = joinStep !== 'idle' ? joinStep.fromId : null;

  const renderOutItem = (p: PendingOutboundItem) =>
    renderOutboundItem(
      p,
      props.data,
      props.onPosted,
      props.onDelete,
      props.onJoinOutbound ? () => setJoinStep({ fromId: p.id }) : undefined,
      props.onJoinOutbound && fromItem && sameDestinationOutbound(fromItem, p)
        ? (toId) => setJoinStep({ fromId: fromItem.id, toId })
        : undefined,
      joiningFromId
    );

  const confirmJoinOut = () => {
    if (!fromItem || !toItem || !props.onJoinOutbound || joinStep === 'idle' || !('toId' in joinStep)) return;
    const combinedLabel = getOutboundDestinationLabel(props.data, fromItem);
    const combined: Omit<PendingOutboundItem, 'id'> = {
      label: combinedLabel,
      amountCents: (fromItem.amountCents || 0) + (toItem.amountCents || 0),
      outboundType: fromItem.outboundType,
      sourceBankId: fromItem.sourceBankId,
      targetCardId: fromItem.targetCardId,
      paymentTargetId: fromItem.paymentTargetId,
      createdAt: new Date(joinDate).toISOString(),
    };
    props.onJoinOutbound(fromItem.id, toItem.id, combined, new Date(joinDate).toISOString());
    setJoinStep('idle');
    setJoinDate(new Date().toISOString().slice(0, 10));
  };

  return (
    <div>
      {joinStep !== 'idle' && 'toId' in joinStep && fromItem && toItem ? (
        <div className="pending-item" style={{ flexWrap: 'wrap', marginBottom: 8, padding: 8, background: 'var(--surface)', borderRadius: 6 }}>
          <div style={{ width: '100%', marginBottom: 6, fontSize: '0.9rem' }}>
            Join into one: <strong>{formatCents((fromItem.amountCents || 0) + (toItem.amountCents || 0))}</strong> — {getOutboundDestinationLabel(props.data, fromItem)}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Date:</span>
            <input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} style={{ padding: 4, fontSize: '0.9rem' }} />
          </label>
          <button type="button" className="btn btn-posted" onClick={confirmJoinOut}>Confirm join</button>
          <button type="button" className="btn btn-secondary" onClick={() => setJoinStep('idle')}>Cancel</button>
        </div>
      ) : null}
      {ccPayments.length > 0 ? (
        <>
          <div
            className="pending-group-header"
            style={{ cursor: 'pointer', padding: '6px 0', marginBottom: 2, fontSize: '0.9rem', color: 'var(--muted)' }}
            onClick={() => setCcPaymentsCollapsed(!ccPaymentsCollapsed)}
          >
            Credit card payments ({ccPayments.length}) {ccPaymentsCollapsed ? '▸' : '▾'}
          </div>
          {!ccPaymentsCollapsed ? ccPayments.map((p) => renderOutItem(p)) : null}
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
          {!otherOutCollapsed ? otherOut.map((p) => renderOutItem(p)) : null}
        </>
      ) : null}
    </div>
  );
}

