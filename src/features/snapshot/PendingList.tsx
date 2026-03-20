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
  onEdit?: (item: PendingInboundItem) => void,
  onJoin?: (id: string) => void,
  onJoinWithThis?: (id: string) => void,
  joiningFromId?: string | null,
  onExitJoin?: () => void
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
  const inJoinMode = joiningFromId != null;
  const btnStyle = { minHeight: 32, padding: '6px 10px', fontSize: '0.85rem' };
  return (
    <div className="pending-item" key={p.id}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
        <span>
        {isRefund ? <span className="pending-refund-badge">Refund</span> : null}
        {isHysa && !isRefund ? <span className="pending-refund-badge" style={{ background: 'var(--green-light)' }}>HYSA</span> : null}
        {isRefund || isHysa ? ' — ' : null}
        {escapeText(baseLabel.replace(/^Refund —\s*/, '').replace(/^To HYSA —\s*/, ''))}
        {' '}
        <span className="pending-amount inbound-amount">{amountText}</span>
        </span>
        {isJoiningFrom ? (
          <span style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>Select another to join…</span>
        ) : null}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-posted"
          style={btnStyle}
          onClick={() => onPosted?.(p.id)}
        >
          Posted
        </button>
        <button
          type="button"
          className="btn-delete"
          style={btnStyle}
          onClick={() => onDelete?.(p.id)}
        >
          Delete
        </button>
        {onEdit ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={btnStyle}
            onClick={() => onEdit(p)}
          >
            Edit
          </button>
        ) : null}
        {onJoin && !joiningFromId ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={btnStyle}
            onClick={() => onJoin(p.id)}
          >
            Join
          </button>
        ) : onJoinWithThis && canJoinWith ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={btnStyle}
            onClick={() => onJoinWithThis(p.id)}
          >
            Join with this
          </button>
        ) : (
          <span />
        )}
        {inJoinMode && onExitJoin ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={btnStyle}
            onClick={onExitJoin}
          >
            Exit
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

export function PendingInboundList(props: {
  data: LedgerData;
  items: PendingInboundItem[];
  onPosted?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEditInbound?: (item: PendingInboundItem) => void;
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
      props.onEditInbound,
      props.onJoinInbound ? () => setJoinStep({ fromId: p.id }) : undefined,
      props.onJoinInbound && fromItem && sameDestinationInbound(fromItem, p)
        ? (toId) => setJoinStep({ fromId: fromItem.id, toId })
        : undefined,
      joiningFromId,
      () => setJoinStep('idle')
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
        <div
          className="card"
          style={{
            padding: '10px 12px',
            marginBottom: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
            Join into one:{' '}
            <strong>{formatCents((fromItem.amountCents || 0) + (toItem.amountCents || 0))}</strong>{' '}
            — Transfer to {getInboundDestinationName(props.data, fromItem)}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))' }}>Date</span>
              <input
                type="date"
                value={joinDate}
                onChange={(e) => setJoinDate(e.target.value)}
                style={{
                  padding: '6px 8px',
                  fontSize: '0.9rem',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-hover)',
                  color: 'var(--ui-primary-text, var(--text))',
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-posted" style={{ minHeight: 36, padding: '8px 14px', fontSize: '0.9rem' }} onClick={confirmJoin}>
                Confirm join
              </button>
              <button type="button" className="btn btn-secondary" style={{ minHeight: 36, padding: '8px 14px', fontSize: '0.9rem' }} onClick={() => setJoinStep('idle')}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {refunds.length > 0 ? (
        <div style={{ marginBottom: 8 }}>
          <div
            className="section-header"
            onClick={() => setRefundsCollapsed(!refundsCollapsed)}
            style={{ fontSize: '0.98rem', fontWeight: 600 }}
          >
            <span className="section-header-left">
              {refunds.length === 1 ? `Refunds (${refunds.length} item)` : `Refunds (${refunds.length} items)`}
            </span>
            <span className="chevron">{refundsCollapsed ? '▸' : '▾'}</span>
          </div>
          {!refundsCollapsed ? (
            <div className="pending-inbound-wrapper">
              {refunds.map((p) => renderItem(p))}
            </div>
          ) : null}
        </div>
      ) : null}
      {otherIn.length > 0 ? (
        <div style={{ marginBottom: 8 }}>
          <div
            className="section-header"
            onClick={() => setOtherInCollapsed(!otherInCollapsed)}
            style={{ fontSize: '0.98rem', fontWeight: 600 }}
          >
            <span className="section-header-left">
              {otherIn.length === 1 ? `Other inbound (${otherIn.length} item)` : `Other inbound (${otherIn.length} items)`}
            </span>
            <span className="chevron">{otherInCollapsed ? '▸' : '▾'}</span>
          </div>
          {!otherInCollapsed ? (
            <div className="pending-inbound-wrapper">
              {otherIn.map((p) => renderItem(p))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function sameDestinationOutbound(a: PendingOutboundItem, b: PendingOutboundItem): boolean {
  const typeA = a.outboundType || 'standard';
  const typeB = b.outboundType || 'standard';
  if (typeA !== typeB) return false;
  if (typeA === 'cc_payment') {
    const aIsHysa = a.paymentSource === 'hysa' || a.meta?.hysaSubBucket != null;
    const bIsHysa = b.paymentSource === 'hysa' || b.meta?.hysaSubBucket != null;
    if (aIsHysa || bIsHysa) {
      return (
        a.paymentSource === b.paymentSource &&
        (a.paymentTargetId || '') === (b.paymentTargetId || '') &&
        (a.meta?.hysaSubBucket || '') === (b.meta?.hysaSubBucket || '') &&
        (a.targetCardId || '') === (b.targetCardId || '')
      );
    }
    return (a.sourceBankId || '') === (b.sourceBankId || '') && (a.targetCardId || '') === (b.targetCardId || '');
  }
  return (a.sourceBankId || '') === (b.sourceBankId || '') && (a.targetCardId || '') === (b.targetCardId || '') && (a.paymentTargetId || '') === (b.paymentTargetId || '');
}

function getOutboundDestinationLabel(data: LedgerData, p: PendingOutboundItem): string {
  if (p.outboundType === 'cc_payment') {
    const card = p.targetCardId ? (data.cards || []).find((c) => c.id === p.targetCardId) : undefined;
    const cardName = card?.name || 'Card';
    const hysaSub = p.meta?.hysaSubBucket;
    if (p.paymentSource === 'hysa' || hysaSub != null) {
      const sourceLabel = hysaSub === 'reserved' ? 'HYSA (Reserved savings)' : 'HYSA (Money in HYSA Designated for Bills)';
      return `${sourceLabel} to ${cardName} Transfer`;
    }

    const bank = p.sourceBankId ? (data.banks || []).find((b) => b.id === p.sourceBankId) : undefined;
    const bankName = bank?.name || 'Bank';
    return `${bankName} to ${cardName} Transfer`;
  }
  return p.label || 'Transfer';
}

function renderOutboundItem(
  p: PendingOutboundItem,
  data: LedgerData,
  onPosted?: (id: string) => void,
  onDelete?: (id: string) => void,
  onEdit?: (item: PendingOutboundItem) => void,
  onJoin?: (id: string) => void,
  onJoinWithThis?: (id: string) => void,
  joiningFromId?: string | null,
  onExitJoin?: () => void
) {
  const isCcPay = p.outboundType === 'cc_payment';
  let label: string;
  const amountText = formatCents(p.amountCents);
  if (isCcPay) {
    const card = p.targetCardId ? (data.cards || []).find((c) => c.id === p.targetCardId) : undefined;
    const cardName = card ? card.name || 'Card' : 'Card';
    const hysaSub = p.meta?.hysaSubBucket;
    if (p.paymentSource === 'hysa' || hysaSub != null) {
      const sourceLabel = hysaSub === 'reserved' ? 'HYSA (Reserved savings)' : 'HYSA (Money in HYSA Designated for Bills)';
      label = `CC Payment From ${sourceLabel} → ${cardName}`;
    } else {
      const bank = p.sourceBankId ? (data.banks || []).find((b) => b.id === p.sourceBankId) : undefined;
      const bankName = bank ? bank.name || 'Bank' : 'Bank';
      label = `CC Payment From ${bankName} → ${cardName}`;
    }
  } else {
    label = `${p.label}`;
  }
  const isJoiningFrom = joiningFromId === p.id;
  const canJoinWith = joiningFromId && joiningFromId !== p.id;
  const inJoinMode = joiningFromId != null;
  const btnStyle = { minHeight: 32, padding: '6px 10px', fontSize: '0.85rem' };
  return (
    <div className="pending-item" key={p.id}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
        <span>
          {isCcPay ? <span className="pending-ccpay-badge">CC Payment</span> : null}
          {isCcPay ? ' ' : null}
          {escapeText(label.replace(/^CC Payment\s*/, ''))}
          {' '}
          <span className="pending-amount outbound-amount">{amountText}</span>
        </span>
        {isJoiningFrom ? (
          <span style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>Select another to join…</span>
        ) : null}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-posted"
          style={btnStyle}
          onClick={() => onPosted?.(p.id)}
        >
          Posted
        </button>
        <button
          type="button"
          className="btn-delete"
          style={btnStyle}
          onClick={() => onDelete?.(p.id)}
        >
          Delete
        </button>
        {onEdit ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={btnStyle}
            onClick={() => onEdit(p)}
          >
            Edit
          </button>
        ) : null}
        {onJoin && !joiningFromId ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={btnStyle}
            onClick={() => onJoin(p.id)}
          >
            Join
          </button>
        ) : onJoinWithThis && canJoinWith ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={btnStyle}
            onClick={() => onJoinWithThis(p.id)}
          >
            Join with this
          </button>
        ) : (
          <span />
        )}
        {inJoinMode && onExitJoin ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={btnStyle}
            onClick={onExitJoin}
          >
            Exit
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

export function PendingOutboundList(props: {
  data: LedgerData;
  items: PendingOutboundItem[];
  onPosted?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEditOutbound?: (item: PendingOutboundItem) => void;
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
      props.onEditOutbound,
      props.onJoinOutbound ? () => setJoinStep({ fromId: p.id }) : undefined,
      props.onJoinOutbound && fromItem && sameDestinationOutbound(fromItem, p)
        ? (toId) => setJoinStep({ fromId: fromItem.id, toId })
        : undefined,
      joiningFromId,
      () => setJoinStep('idle')
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
      paymentSource: fromItem.paymentSource,
      paymentTargetId: fromItem.paymentTargetId,
      meta: fromItem.meta,
      createdAt: new Date(joinDate).toISOString(),
    };
    props.onJoinOutbound(fromItem.id, toItem.id, combined, new Date(joinDate).toISOString());
    setJoinStep('idle');
    setJoinDate(new Date().toISOString().slice(0, 10));
  };

  return (
    <div>
      {joinStep !== 'idle' && 'toId' in joinStep && fromItem && toItem ? (
        <div
          className="card"
          style={{
            padding: '10px 12px',
            marginBottom: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
            Join into one:{' '}
            <strong>{formatCents((fromItem.amountCents || 0) + (toItem.amountCents || 0))}</strong>{' '}
            — {getOutboundDestinationLabel(props.data, fromItem)}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))' }}>Date</span>
              <input
                type="date"
                value={joinDate}
                onChange={(e) => setJoinDate(e.target.value)}
                style={{
                  padding: '6px 8px',
                  fontSize: '0.9rem',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-hover)',
                  color: 'var(--ui-primary-text, var(--text))',
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-posted" style={{ minHeight: 36, padding: '8px 14px', fontSize: '0.9rem' }} onClick={confirmJoinOut}>
                Confirm join
              </button>
              <button type="button" className="btn btn-secondary" style={{ minHeight: 36, padding: '8px 14px', fontSize: '0.9rem' }} onClick={() => setJoinStep('idle')}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {ccPayments.length > 0 ? (
        <div style={{ marginBottom: 8 }}>
          <div
            className="section-header"
            onClick={() => setCcPaymentsCollapsed(!ccPaymentsCollapsed)}
            style={{ fontSize: '0.98rem', fontWeight: 600 }}
          >
            <span className="section-header-left">
              {ccPayments.length === 1 ? `Credit card payments (${ccPayments.length} item)` : `Credit card payments (${ccPayments.length} items)`}
            </span>
            <span className="chevron">{ccPaymentsCollapsed ? '▸' : '▾'}</span>
          </div>
          {!ccPaymentsCollapsed ? (
            <div className="pending-outbound-wrapper">
              {ccPayments.map((p) => renderOutItem(p))}
            </div>
          ) : null}
        </div>
      ) : null}
      {otherOut.length > 0 ? (
        <div style={{ marginBottom: 8 }}>
          <div
            className="section-header"
            onClick={() => setOtherOutCollapsed(!otherOutCollapsed)}
            style={{ fontSize: '0.98rem', fontWeight: 600 }}
          >
            <span className="section-header-left">
              {otherOut.length === 1 ? `Other pending outbound (${otherOut.length} item)` : `Other pending outbound (${otherOut.length} items)`}
            </span>
            <span className="chevron">{otherOutCollapsed ? '▸' : '▾'}</span>
          </div>
          {!otherOutCollapsed ? (
            <div className="pending-outbound-wrapper">
              {otherOut.map((p) => renderOutItem(p))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

