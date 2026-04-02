import { useCallback, useRef, useState } from 'react';
import type { LedgerData, PendingInboundItem, PendingOutboundItem } from '../../state/models';
import { formatCents } from '../../state/calc';
import { scheduleSnapCorrection } from '../../ui/carouselSnap';

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
    return 'HYSA';
  }
  return 'Account';
}

type JoinStep = 'idle' | { selectedIds: string[] };

function useCarouselScroll() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [idx, setIdx] = useState(0);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const idxRef = useRef(0);
  const heightRef = useRef<number | undefined>(undefined);
  const rafRef = useRef<number | null>(null);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rawIdx = el.scrollLeft / (el.clientWidth || 1);
    const snappedIdx = Math.round(rawIdx);

    // Update index only when it actually changes
    if (snappedIdx !== idxRef.current) {
      idxRef.current = snappedIdx;
      setIdx(snappedIdx);
    }

    // Throttle height updates via rAF to avoid re-rendering every scroll pixel
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (!ref.current) return;
        const curEl = ref.current;
        const curRaw = curEl.scrollLeft / (curEl.clientWidth || 1);
        const leftIdx = Math.floor(curRaw);
        const rightIdx = Math.min(leftIdx + 1, curEl.children.length - 1);
        const progress = curRaw - leftIdx;
        const lh = (curEl.children[leftIdx] as HTMLElement | undefined)?.offsetHeight ?? 0;
        const rh = (curEl.children[rightIdx] as HTMLElement | undefined)?.offsetHeight ?? lh;
        const newH = Math.round(lh + (rh - lh) * progress);
        if (newH !== heightRef.current) {
          heightRef.current = newH;
          setHeight(newH);
        }
      });
    }

    scheduleSnapCorrection(el);
  }, []);

  return { ref, idx, height, onScroll };
}

function CarouselIndicator({ count, activeIdx, showAll, onSeeMore }: { count: number; activeIdx: number; showAll: boolean; onSeeMore: () => void }) {
  if (count <= 1) return null;
  if (showAll) {
    return (
      <div style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 6, marginBottom: 8 }}>
        {activeIdx + 1} of {count}
      </div>
    );
  }
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 6, marginBottom: 8 }}>
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: i === activeIdx ? 'var(--accent)' : 'var(--border)',
              transition: 'background 0.2s',
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
        ))}
      </div>
      {count >= 5 && activeIdx >= count - 1 ? (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 14px', minHeight: 'unset' }} onClick={onSeeMore}>See more</button>
        </div>
      ) : null}
    </>
  );
}

function renderInboundCard(
  p: PendingInboundItem,
  data: LedgerData,
  onPosted?: (id: string) => void,
  onDelete?: (id: string) => void,
  onEdit?: (item: PendingInboundItem) => void,
  onStartJoin?: (id: string) => void,
  onToggleJoin?: (id: string) => void,
  selectedIds?: Set<string>,
  isEligible?: boolean,
  onExitJoin?: () => void
) {
  const isRefund = Boolean(p.isRefund || p.depositTo === 'card');
  const isHysa = p.depositTo === 'hysa';
  const card = p.targetCardId ? (data.cards || []).find((c) => c.id === p.targetCardId) : undefined;
  const cardName = card ? card.name || '' : '';
  const baseLabel = isRefund
    ? `Refund - ${p.label}${cardName ? ` → ${cardName}` : ''}`
    : isHysa
      ? `To HYSA - ${p.label}`
      : p.label;
  const amountText = formatCents(p.amountCents);
  const inJoinMode = selectedIds != null && selectedIds.size > 0;
  const isSelected = selectedIds?.has(p.id) ?? false;
  const btnStyle = { minHeight: 32, padding: '6px 10px', fontSize: '0.85rem' };
  return (
    <div className="card-carousel-item" key={p.id}>
      <div className="card" style={isSelected ? { outline: '2px solid var(--accent)', outlineOffset: -2 } : undefined}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div className="row">
            <span className="name">
              {isRefund ? <span className="pending-refund-badge">Refund</span> : null}
              {isHysa && !isRefund ? <span className="pending-refund-badge" style={{ background: 'var(--green-light)' }}>HYSA</span> : null}
              {isRefund || isHysa ? ' - ' : null}
              {escapeText(baseLabel.replace(/^Refund -\s*/, '').replace(/^To HYSA -\s*/, ''))}
            </span>
            <span className="amount inbound-amount">{amountText}</span>
          </div>
          {isSelected && selectedIds!.size === 1 ? (
            <span style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>Swipe to add more…</span>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start', marginTop: 10 }}>
          <button type="button" className="btn btn-posted" style={btnStyle} onClick={() => onPosted?.(p.id)}>Mark Received</button>
          <button type="button" className="btn-delete" style={btnStyle} onClick={() => onDelete?.(p.id)}>Delete</button>
          {onEdit ? (
            <button type="button" className="btn btn-secondary" style={btnStyle} onClick={() => onEdit(p)}>Edit</button>
          ) : null}
          {!inJoinMode && onStartJoin ? (
            <button type="button" className="btn btn-secondary" style={btnStyle} onClick={() => onStartJoin(p.id)}>Combine</button>
          ) : inJoinMode && isEligible && !isSelected && onToggleJoin ? (
            <button type="button" className="btn btn-secondary" style={btnStyle} onClick={() => onToggleJoin(p.id)}>Combine with this</button>
          ) : inJoinMode && isSelected && selectedIds!.size > 1 && onToggleJoin ? (
            <button type="button" className="btn btn-secondary" style={btnStyle} onClick={() => onToggleJoin(p.id)}>Remove from combine</button>
          ) : null}
          {inJoinMode && onExitJoin ? (
            <button type="button" className="btn btn-secondary" style={btnStyle} onClick={onExitJoin}>Exit</button>
          ) : null}
        </div>
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
  onJoinInbound?: (ids: string[], combined: Omit<PendingInboundItem, 'id'>, dateISO: string) => void;
}) {
  const [joinStep, setJoinStep] = useState<JoinStep>('idle');
  const [joinDate, setJoinDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showAll, setShowAll] = useState(false);
  const carousel = useCarouselScroll();

  const hasMore = props.items.length >= 5;
  const visibleItems = showAll ? props.items : props.items.slice(0, 5);

  const selectedIds = joinStep !== 'idle' ? new Set(joinStep.selectedIds) : new Set<string>();
  const firstSelected = joinStep !== 'idle' ? props.items.find((p) => p.id === joinStep.selectedIds[0]) : undefined;

  const toggleJoin = (id: string) => {
    if (joinStep === 'idle') return;
    const ids = joinStep.selectedIds;
    if (ids.includes(id)) {
      const next = ids.filter((x) => x !== id);
      if (next.length === 0) { setJoinStep('idle'); return; }
      setJoinStep({ selectedIds: next });
    } else {
      setJoinStep({ selectedIds: [...ids, id] });
    }
  };

  const renderItem = (p: PendingInboundItem) => {
    const isEligible = firstSelected ? sameDestinationInbound(firstSelected, p) : false;
    return renderInboundCard(
      p,
      props.data,
      props.onPosted,
      props.onDelete,
      props.onEditInbound,
      props.onJoinInbound ? (id) => setJoinStep({ selectedIds: [id] }) : undefined,
      props.onJoinInbound ? (id) => toggleJoin(id) : undefined,
      selectedIds.size > 0 ? selectedIds : undefined,
      isEligible,
      () => setJoinStep('idle')
    );
  };

  const selectedItems = joinStep !== 'idle' ? joinStep.selectedIds.map((id) => props.items.find((p) => p.id === id)).filter(Boolean) as PendingInboundItem[] : [];
  const totalCents = selectedItems.reduce((s, p) => s + (p.amountCents || 0), 0);

  const confirmJoin = () => {
    if (!firstSelected || selectedItems.length < 2 || !props.onJoinInbound || joinStep === 'idle') return;
    const destName = getInboundDestinationName(props.data, firstSelected);
    const combined: Omit<PendingInboundItem, 'id'> = {
      label: `Transfer to ${destName}`,
      amountCents: totalCents,
      depositTo: firstSelected.depositTo,
      targetBankId: firstSelected.targetBankId,
      targetCardId: firstSelected.targetCardId,
      targetInvestingAccountId: firstSelected.targetInvestingAccountId,
      isRefund: firstSelected.isRefund,
      createdAt: new Date(joinDate).toISOString(),
    };
    props.onJoinInbound(joinStep.selectedIds, combined, new Date(joinDate).toISOString());
    setJoinStep('idle');
    setJoinDate(new Date().toISOString().slice(0, 10));
  };

  return (
    <div>
      {joinStep !== 'idle' && selectedItems.length >= 2 ? (
        <div
          className="card"
          style={{ padding: '10px 12px', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
            Combine {selectedItems.length} items into one:{' '}
            <strong>{formatCents(totalCents)}</strong>{' '}
            - Transfer to {firstSelected ? getInboundDestinationName(props.data, firstSelected) : ''}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))' }}>Date</span>
              <input
                type="date"
                value={joinDate}
                onChange={(e) => setJoinDate(e.target.value)}
                style={{ padding: '6px 8px', fontSize: '0.9rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-hover)', color: 'var(--ui-primary-text, var(--text))' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-posted" style={{ minHeight: 36, padding: '8px 14px', fontSize: '0.9rem' }} onClick={confirmJoin}>
                Confirm combine
              </button>
              <button type="button" className="btn btn-secondary" style={{ minHeight: 36, padding: '8px 14px', fontSize: '0.9rem' }} onClick={() => setJoinStep('idle')}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div style={carousel.height != null ? { height: carousel.height, overflow: 'hidden' } : {}}>
        <div className="card-carousel" ref={carousel.ref} onScroll={carousel.onScroll}>
          {visibleItems.map((p) => renderItem(p))}
        </div>
      </div>
      <CarouselIndicator count={visibleItems.length} activeIdx={carousel.idx} showAll={showAll && hasMore} onSeeMore={() => setShowAll(true)} />
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
  return (a.sourceBankId || '') === (b.sourceBankId || '') && (a.targetCardId || '') === (b.targetCardId || '') && (a.paymentTargetId || '') === (b.paymentTargetId || '') && (a.paymentSource || '') === (b.paymentSource || '');
}

function getOutboundDestinationLabel(data: LedgerData, p: PendingOutboundItem): string {
  if (p.outboundType === 'cc_payment') {
    const card = p.targetCardId ? (data.cards || []).find((c) => c.id === p.targetCardId) : undefined;
    const cardName = card?.name || 'Card';
    const hysaSub = p.meta?.hysaSubBucket;
    if (p.paymentSource === 'hysa' || hysaSub != null) {
      const sourceLabel = hysaSub === 'reserved' ? 'HYSA (Savings reserve)' : 'HYSA (Bills fund)';
      return `${sourceLabel} to ${cardName} Transfer`;
    }

    const bank = p.sourceBankId ? (data.banks || []).find((b) => b.id === p.sourceBankId) : undefined;
    const bankName = bank?.name || 'Bank';
    return `${bankName} to ${cardName} Transfer`;
  }
  return p.label || 'Transfer';
}

function renderOutboundCard(
  p: PendingOutboundItem,
  data: LedgerData,
  onPosted?: (id: string) => void,
  onDelete?: (id: string) => void,
  onEdit?: (item: PendingOutboundItem) => void,
  onStartJoin?: (id: string) => void,
  onToggleJoin?: (id: string) => void,
  selectedIds?: Set<string>,
  isEligible?: boolean,
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
      const sourceLabel = hysaSub === 'reserved' ? 'HYSA (Savings reserve)' : 'HYSA (Bills fund)';
      label = `CC Payment From ${sourceLabel} → ${cardName}`;
    } else {
      const bank = p.sourceBankId ? (data.banks || []).find((b) => b.id === p.sourceBankId) : undefined;
      const bankName = bank ? bank.name || 'Bank' : 'Bank';
      label = `CC Payment From ${bankName} → ${cardName}`;
    }
  } else {
    label = `${p.label}`;
  }
  const inJoinMode = selectedIds != null && selectedIds.size > 0;
  const isSelected = selectedIds?.has(p.id) ?? false;
  const btnStyle = { minHeight: 32, padding: '6px 10px', fontSize: '0.85rem' };
  return (
    <div className="card-carousel-item" key={p.id}>
      <div className="card" style={isSelected ? { outline: '2px solid var(--accent)', outlineOffset: -2 } : undefined}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div className="row">
            <span className="name">
              {isCcPay ? <span className="pending-ccpay-badge">CC Payment</span> : null}
              {isCcPay ? ' ' : null}
              {escapeText(label.replace(/^CC Payment\s*/, ''))}
            </span>
            <span className="amount outbound-amount">{amountText}</span>
          </div>
          {isSelected && selectedIds!.size === 1 ? (
            <span style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>Swipe to add more…</span>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start', marginTop: 10 }}>
          <button type="button" className="btn btn-posted" style={btnStyle} onClick={() => onPosted?.(p.id)}>Mark Cleared</button>
          <button type="button" className="btn-delete" style={btnStyle} onClick={() => onDelete?.(p.id)}>Delete</button>
          {onEdit ? (
            <button type="button" className="btn btn-secondary" style={btnStyle} onClick={() => onEdit(p)}>Edit</button>
          ) : null}
          {!inJoinMode && onStartJoin ? (
            <button type="button" className="btn btn-secondary" style={btnStyle} onClick={() => onStartJoin(p.id)}>Combine</button>
          ) : inJoinMode && isEligible && !isSelected && onToggleJoin ? (
            <button type="button" className="btn btn-secondary" style={btnStyle} onClick={() => onToggleJoin(p.id)}>Combine with this</button>
          ) : inJoinMode && isSelected && selectedIds!.size > 1 && onToggleJoin ? (
            <button type="button" className="btn btn-secondary" style={btnStyle} onClick={() => onToggleJoin(p.id)}>Remove from combine</button>
          ) : null}
          {inJoinMode && onExitJoin ? (
            <button type="button" className="btn btn-secondary" style={btnStyle} onClick={onExitJoin}>Exit</button>
          ) : null}
        </div>
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
  onJoinOutbound?: (ids: string[], combined: Omit<PendingOutboundItem, 'id'>, dateISO: string) => void;
}) {
  const [joinStep, setJoinStep] = useState<JoinStep>('idle');
  const [joinDate, setJoinDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showAll, setShowAll] = useState(false);
  const carousel = useCarouselScroll();

  const hasMore = props.items.length >= 5;
  const visibleItems = showAll ? props.items : props.items.slice(0, 5);

  const selectedIds = joinStep !== 'idle' ? new Set(joinStep.selectedIds) : new Set<string>();
  const firstSelected = joinStep !== 'idle' ? props.items.find((p) => p.id === joinStep.selectedIds[0]) : undefined;

  const toggleJoin = (id: string) => {
    if (joinStep === 'idle') return;
    const ids = joinStep.selectedIds;
    if (ids.includes(id)) {
      const next = ids.filter((x) => x !== id);
      if (next.length === 0) { setJoinStep('idle'); return; }
      setJoinStep({ selectedIds: next });
    } else {
      setJoinStep({ selectedIds: [...ids, id] });
    }
  };

  const renderOutItem = (p: PendingOutboundItem) => {
    const isEligible = firstSelected ? sameDestinationOutbound(firstSelected, p) : false;
    return renderOutboundCard(
      p,
      props.data,
      props.onPosted,
      props.onDelete,
      props.onEditOutbound,
      props.onJoinOutbound ? (id) => setJoinStep({ selectedIds: [id] }) : undefined,
      props.onJoinOutbound ? (id) => toggleJoin(id) : undefined,
      selectedIds.size > 0 ? selectedIds : undefined,
      isEligible,
      () => setJoinStep('idle')
    );
  };

  const selectedItems = joinStep !== 'idle' ? joinStep.selectedIds.map((id) => props.items.find((p) => p.id === id)).filter(Boolean) as PendingOutboundItem[] : [];
  const totalCents = selectedItems.reduce((s, p) => s + (p.amountCents || 0), 0);

  const confirmJoinOut = () => {
    if (!firstSelected || selectedItems.length < 2 || !props.onJoinOutbound || joinStep === 'idle') return;
    const combinedLabel = getOutboundDestinationLabel(props.data, firstSelected);
    const combined: Omit<PendingOutboundItem, 'id'> = {
      label: combinedLabel,
      amountCents: totalCents,
      outboundType: firstSelected.outboundType,
      sourceBankId: firstSelected.sourceBankId,
      targetCardId: firstSelected.targetCardId,
      paymentSource: firstSelected.paymentSource,
      paymentTargetId: firstSelected.paymentTargetId,
      meta: firstSelected.meta,
      createdAt: new Date(joinDate).toISOString(),
    };
    props.onJoinOutbound(joinStep.selectedIds, combined, new Date(joinDate).toISOString());
    setJoinStep('idle');
    setJoinDate(new Date().toISOString().slice(0, 10));
  };

  return (
    <div>
      {joinStep !== 'idle' && selectedItems.length >= 2 ? (
        <div
          className="card"
          style={{ padding: '10px 12px', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
            Combine {selectedItems.length} items into one:{' '}
            <strong>{formatCents(totalCents)}</strong>{' '}
            - {firstSelected ? getOutboundDestinationLabel(props.data, firstSelected) : ''}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))' }}>Date</span>
              <input
                type="date"
                value={joinDate}
                onChange={(e) => setJoinDate(e.target.value)}
                style={{ padding: '6px 8px', fontSize: '0.9rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-hover)', color: 'var(--ui-primary-text, var(--text))' }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-posted" style={{ minHeight: 36, padding: '8px 14px', fontSize: '0.9rem' }} onClick={confirmJoinOut}>
                Confirm combine
              </button>
              <button type="button" className="btn btn-secondary" style={{ minHeight: 36, padding: '8px 14px', fontSize: '0.9rem' }} onClick={() => setJoinStep('idle')}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div style={carousel.height != null ? { height: carousel.height, overflow: 'hidden' } : {}}>
        <div className="card-carousel" ref={carousel.ref} onScroll={carousel.onScroll}>
          {visibleItems.map((p) => renderOutItem(p))}
        </div>
      </div>
      <CarouselIndicator count={visibleItems.length} activeIdx={carousel.idx} showAll={showAll && hasMore} onSeeMore={() => setShowAll(true)} />
    </div>
  );
}
