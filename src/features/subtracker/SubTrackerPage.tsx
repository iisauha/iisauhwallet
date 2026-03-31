import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCents, formatLongLocalDate, parseCents } from '../../state/calc';
import { useLedgerStore } from '../../state/store';
import {
  loadSubTracker,
  saveSubTracker,
  uid,
  type SubTrackerData,
  type SubTrackerEntry,
  type SubTrackerTier,
  type CompletedBonus,
  type CompletedBonusUnitType,
  type CompletedBonusBankAccountRef
} from '../../state/storage';
import { useDropdownCollapsed } from '../../state/DropdownStateContext';
import { Select } from '../../ui/Select';
import { Modal } from '../../ui/Modal';

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function toDate(key: string) {
  if (!key) return new Date(NaN);
  return new Date(key + 'T00:00:00');
}

function addMonthsFromStart(startISO: string, months: number) {
  const d = toDate(startISO);
  if (Number.isNaN(d.getTime())) return '';
  const next = new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, '0');
  const dd = String(next.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseRewardText(text: string): { quantity: number; unitType: CompletedBonusUnitType } {
  const t = (text || '').trim().toLowerCase();
  const kMatch = t.match(/^([\d,.]+\s*)(k|k\s)/);
  const numStr = t.replace(/[^0-9.]/g, '');
  let quantity = parseFloat(numStr) || 0;
  if (kMatch && quantity > 0) quantity = quantity * 1000;
  if (t.includes('cash back') || /\$|dollar|cash|back\s*$/.test(t)) {
    return { quantity: quantity || 0, unitType: 'cash' };
  }
  if (/miles?|mi\b/.test(t)) return { quantity, unitType: 'miles' };
  if (/points?|pts?\b/.test(t)) return { quantity, unitType: 'points' };
  return { quantity, unitType: 'other' };
}

function formatTierRewardQtyPlain(qty: number, unitType: CompletedBonusUnitType): string {
  if (!Number.isFinite(qty)) return '0';
  if (unitType === 'cash') {
    const rounded2 = Math.round(qty * 100) / 100;
    return Number.isInteger(rounded2) ? String(rounded2.toFixed(0)) : String(rounded2.toFixed(2)).replace(/\.00$/, '');
  }
  return Math.round(qty).toLocaleString();
}

function formatTierRewardHashNumeric(parsed: { quantity: number; unitType: CompletedBonusUnitType }): string {
  const qty = Number.isFinite(parsed.quantity) ? Math.max(0, parsed.quantity) : 0;
  if (!(qty > 0)) return 'Bonus';

  if (parsed.unitType === 'cash') {
    const dollars = formatTierRewardQtyPlain(qty, 'cash');
    return `$${dollars}`;
  }

  if (parsed.unitType === 'points' || parsed.unitType === 'miles') {
    const unit = parsed.unitType === 'points' ? 'points' : 'miles';
    if (qty >= 1000) {
      const k = qty / 1000;
      const kStr = Number.isInteger(k) ? String(k) : k.toFixed(1).replace(/\.0$/, '');
      return `${kStr}k ${unit}`;
    }
    return `${Math.round(qty).toLocaleString()} ${unit}`;
  }

  return formatTierRewardQtyPlain(qty, parsed.unitType);
}

function entryToCompletedBonus(
  e: SubTrackerEntry,
  cardName: string,
  achievedTiers: SubTrackerTier[],
  centsPerUnitOverride?: number
): CompletedBonus {
  const parsedTiers = achievedTiers
    .filter((t) => t && typeof t.rewardText === 'string')
    .map((t) => ({ tier: t, parsed: parseRewardText(t.rewardText || '') }));

  const firstUnitType = parsedTiers[0]?.parsed.unitType || 'other';
  const unitType = parsedTiers.every((x) => x.parsed.unitType === firstUnitType)
    ? firstUnitType
    : parsedTiers.find((x) => x.parsed.unitType !== 'other')?.parsed.unitType || firstUnitType;

  const totalQuantity = parsedTiers.reduce((s, x) => s + (Number.isFinite(x.parsed.quantity) ? x.parsed.quantity : 0), 0);

  const formatCompactQty = (qty: number) => {
    if (!Number.isFinite(qty)) return '0';
    if (unitType === 'cash') return Number.isInteger(qty) ? qty.toFixed(0) : qty.toFixed(2).replace(/\.00$/, '');
    if ((unitType === 'points' || unitType === 'miles') && qty >= 1000) {
      const k = qty / 1000;
      const decimals = Math.abs(k - Math.round(k)) < 1e-9 ? 0 : 1;
      const kStr = k.toFixed(decimals).replace(/\.0$/, '');
      return `${kStr}k`;
    }
    return String(Math.round(qty));
  };

  const rewardLabel =
    totalQuantity > 0
      ? unitType === 'cash'
        ? `$${formatCompactQty(totalQuantity)}`
        : `${formatCompactQty(totalQuantity)} ${unitType}`
      : 'Bonus';
  return {
    id: uid(),
    cardId: e.cardRef.type === 'card' ? e.cardRef.cardId : undefined,
    cardName,
    unitType,
    rewardQuantity: totalQuantity,
    rewardLabel,
    centsPerUnit:
      unitType === 'points' || unitType === 'miles'
        ? typeof centsPerUnitOverride === 'number' && centsPerUnitOverride >= 0
          ? centsPerUnitOverride
          : 1
        : undefined,
    completedAt: e.startDate || todayKey(),
    notes: undefined
  };
}

function completedBonusCashValueCents(b: CompletedBonus): number {
  if (b.unitType === 'cash') return Math.round(b.rewardQuantity * 100);
  const cpp = b.centsPerUnit != null && b.centsPerUnit >= 0 ? b.centsPerUnit : 1;
  return Math.round(b.rewardQuantity * cpp);
}

function CompletedBonusEditorModal({
  cards,
  banks,
  mode,
  initial,
  onClose,
  onSave
}: {
  cards: { id: string; name: string }[];
  banks: { id: string; name: string }[];
  mode: 'add' | 'edit';
  initial: CompletedBonus | null;
  onClose: () => void;
  onSave: (bonus: CompletedBonus) => void;
}) {
  const init = initial;
  const initAccountValue = (() => {
    if (init?.cardId && cards.some((c) => c.id === init.cardId)) return `card:${init.cardId}`;
    const ref = init?.bankAccountRef;
    if (ref && ref.type === 'bank' && banks.some((b) => b.id === ref.bankId)) {
      return `bank:${ref.bankId}`;
    }
    if (init?.bankAccountRef?.type === 'manual') return 'manual';
    if (init?.cardName) return 'manual';
    if (cards[0]?.id) return `card:${cards[0].id}`;
    if (banks[0]?.id) return `bank:${banks[0].id}`;
    return 'manual';
  })();
  const [accountValue, setAccountValue] = useState<string>(initAccountValue);
  const [manualAccountName, setManualAccountName] = useState<string>(() => {
    if (init?.bankAccountRef?.type === 'manual') return init.bankAccountRef.name || '';
    if (!init?.cardId && init?.cardName) return init.cardName;
    return '';
  });
  const [rewardLabel, setRewardLabel] = useState(init?.rewardLabel || '');
  const [rewardQuantity, setRewardQuantity] = useState(init ? String(init.rewardQuantity) : '');
  const [unitType, setUnitType] = useState<CompletedBonusUnitType>(init?.unitType || 'points');
  const [centsPerUnit, setCentsPerUnit] = useState(init?.centsPerUnit != null ? String(init.centsPerUnit) : '1');
  const [completedAt, setCompletedAt] = useState(init?.completedAt || todayKey());
  const [notes, setNotes] = useState(init?.notes || '');

  const selected = useMemo(() => {
    if (accountValue.startsWith('card:')) {
      const id = accountValue.slice('card:'.length);
      const name = cards.find((c) => c.id === id)?.name || 'Card';
      return { kind: 'card' as const, id, name };
    }
    if (accountValue.startsWith('bank:')) {
      const id = accountValue.slice('bank:'.length);
      const name = banks.find((b) => b.id === id)?.name || 'Bank';
      return { kind: 'bank' as const, id, name };
    }
    const name = manualAccountName.trim() || 'Account';
    return { kind: 'manual' as const, name };
  }, [accountValue, cards, banks, manualAccountName]);

  function handleSave() {
    const qty = parseFloat(rewardQuantity);
    if (!(qty >= 0)) return;
    const cpp =
      unitType === 'points' || unitType === 'miles'
        ? Math.max(0, parseFloat(centsPerUnit) || 1)
        : undefined;
    let cardId: string | undefined = undefined;
    let cardName: string = selected.name;
    let bankAccountRef: CompletedBonusBankAccountRef | undefined = undefined;

    if (selected.kind === 'card') {
      cardId = selected.id;
      cardName = selected.name;
      // Preserve legacy bank destination if it existed, since we no longer surface it in the UI.
      bankAccountRef = init?.bankAccountRef;
    } else if (selected.kind === 'bank') {
      bankAccountRef = { type: 'bank', bankId: selected.id };
      cardId = undefined;
      cardName = selected.name;
    } else {
      bankAccountRef = { type: 'manual', name: manualAccountName.trim() || 'Account' };
      cardId = undefined;
      cardName = manualAccountName.trim() || 'Account';
    }

    const bonus: CompletedBonus = {
      id: init?.id || uid(),
      cardId,
      cardName,
      unitType,
      rewardQuantity: qty,
      rewardLabel: rewardLabel.trim() || (unitType === 'cash' ? `$${qty}` : `${qty} ${unitType}`),
      centsPerUnit: cpp,
      bankAccountRef,
      completedAt,
      notes: notes.trim() || undefined
    };
    onSave(bonus);
  }

  return (
    <Modal open title={mode === 'edit' ? 'Edit Completed Bonus' : 'Add Completed Bonus'} onClose={onClose}>
      <div className="field">
        <label>Account</label>
        <Select
          value={accountValue}
          onChange={(e) => {
            const v = e.target.value;
            setAccountValue(v);
          }}
        >
          <optgroup label="Credit Cards">
            {(cards || []).map((c) => (
              <option key={c.id} value={`card:${c.id}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Bank / Cash Accounts">
            {(banks || []).map((b) => (
              <option key={b.id} value={`bank:${b.id}`}>
                {b.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Manual">
            <option value="manual">Manual (enter name below)</option>
          </optgroup>
        </Select>
      </div>
      {selected.kind === 'manual' ? (
        <div className="field">
          <label>Account name</label>
          <input
            className="ll-control"
            value={manualAccountName}
            onChange={(e) => setManualAccountName(e.target.value)}
            placeholder="e.g. Chase Sapphire Preferred or Old Checking"
          />
        </div>
      ) : null}
      <div className="field">
        <label>Reward description / type</label>
        <input
          className="ll-control"
          value={rewardLabel}
          onChange={(e) => setRewardLabel(e.target.value)}
          placeholder="e.g. 90,000 miles, 75,000 points, $200 cash back"
        />
      </div>
      <div className="field">
        <label>Reward quantity (numeric)</label>
        <input
          className="ll-control"
          type="number"
          min={0}
          step={1}
          value={rewardQuantity}
          onChange={(e) => setRewardQuantity(e.target.value)}
          placeholder="e.g. 90000"
        />
      </div>
      <div className="field">
        <label>Unit type</label>
        <Select value={unitType} onChange={(e) => setUnitType(e.target.value as CompletedBonusUnitType)}>
          <option value="miles">miles</option>
          <option value="points">points</option>
          <option value="cash">cash</option>
          <option value="other">other</option>
        </Select>
      </div>
      {(unitType === 'points' || unitType === 'miles') ? (
        <div className="field">
          <label>Cents per {unitType === 'miles' ? 'mile' : 'point'}</label>
          <input
            className="ll-control"
            type="number"
            min={0}
            step={0.1}
            value={centsPerUnit}
            onChange={(e) => setCentsPerUnit(e.target.value)}
            placeholder="1"
          />
        </div>
      ) : null}

      <div className="field">
        <label>Date completed</label>
        <input className="ll-control" type="date" value={completedAt} onChange={(e) => setCompletedAt(e.target.value)} />
      </div>
      <div className="field">
        <label>Notes (optional)</label>
        <input className="ll-control" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleSave}>
          Save
        </button>
      </div>
    </Modal>
  );
}

function WindowedCarouselDots({ count, current }: { count: number; current: number }) {
  if (count <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 6, marginBottom: 8 }}>
      {[-2, -1, 0, 1, 2].map((offset) => {
        const idx = current + offset;
        const exists = idx >= 0 && idx < count;
        const isActive = offset === 0;
        const absOff = Math.abs(offset);
        const size = isActive ? 8 : absOff === 1 ? 7 : 6;
        const opacity = !exists ? 0.2 : isActive ? 1 : absOff === 1 ? 0.6 : 0.35;
        return (
          <span
            key={offset}
            style={{
              width: size,
              height: size,
              borderRadius: '50%',
              background: isActive ? 'var(--ui-add-btn, var(--accent))' : 'var(--ui-border, var(--border))',
              opacity,
              display: 'inline-block',
              flexShrink: 0,
              transition: 'all 0.2s',
            }}
          />
        );
      })}
    </div>
  );
}

export function SubTrackerPage({ addTrigger = 0 }: { addTrigger?: number } = {}) {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);
  const cards = data.cards || [];
  const banks = (data.banks || []).map((b: any) => ({ id: b.id, name: b.name || 'Bank' }));

  const [tracker, setTracker] = useState(() => loadSubTracker());
  const [subview, setSubview] = useState<'main' | 'completed'>('main');
  const [confirmDelete, setConfirmDelete] = useState<
    | null
    | { kind: 'entry'; entryId: string; label: string }
    | { kind: 'tier'; entryId: string; tierId: string; label: string }
  >(null);

  const [cardMode, setCardMode] = useState<'card' | 'manual'>('card');
  const [cardId, setCardId] = useState(cards[0]?.id || '');
  const [manualName, setManualName] = useState('');
  const [startDate, setStartDate] = useState(todayKey());
  const [useDeadlineDate, setUseDeadlineDate] = useState(true);
  const [deadlineDate, setDeadlineDate] = useState(todayKey());
  const [monthsWindow, setMonthsWindow] = useState('3');
  type RewardUnitDraft = 'cash' | 'points' | 'miles';
  type TierDraft = { id: string; spendTarget: string; rewardAmount: string; rewardUnit: RewardUnitDraft };
  const [tierDrafts, setTierDrafts] = useState<TierDraft[]>(() => [{ id: uid(), spendTarget: '', rewardAmount: '', rewardUnit: 'points' }]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorEntryId, setEditorEntryId] = useState<string | null>(null);

  const [completedCarouselHeight, setCompletedCarouselHeight] = useState<number | undefined>(undefined);
  const completedCarouselRef = useRef<HTMLDivElement>(null);
  const [completedCarouselIdx, setCompletedCarouselIdx] = useState(0);
  const [entriesCarouselHeight, setEntriesCarouselHeight] = useState<number | undefined>(undefined);
  const entriesCarouselRef = useRef<HTMLDivElement>(null);
  const [entriesCarouselIdx, setEntriesCarouselIdx] = useState(0);

  const lastAddTriggerRef = useRef(addTrigger);
  useEffect(() => {
    if (addTrigger !== lastAddTriggerRef.current) {
      lastAddTriggerRef.current = addTrigger;
      if (addTrigger > 0) { setEditorOpen(true); setEditorEntryId(null); }
    }
  }, [addTrigger]);
  const [spentInput, setSpentInput] = useState<string>('0.00');
  const [completedEditor, setCompletedEditor] = useState<null | { mode: 'add' } | { mode: 'edit'; id: string }>(null);
  const [completedBonusesCollapsed, setCompletedBonusesCollapsed] = useDropdownCollapsed('sub_tracker_completed_bonuses', false);
  const [rewardAddPrompt, setRewardAddPrompt] = useState<null | {
    cardId: string;
    cardName: string;
    unitType: 'cash' | 'points' | 'miles';
    earnedQuantity: number;
    currentRewardBalance: number;
    newRewardBalance: number;
    newCashbackCents?: number;
    estimatedCashCents: number;
    centsPerUnitUsed?: number;
  }>(null);

  const cardNameById = useMemo(() => new Map(cards.map((c) => [c.id, c.name || 'Card'])), [cards]);

  const entries = (tracker.entries || []) as SubTrackerEntry[];
  const completedBonuses = (tracker.completedBonuses || []) as CompletedBonus[];
  const bankNameById = useMemo(() => new Map((data.banks || []).map((b: any) => [b.id, b.name || 'Bank'])), [data.banks]);

  function persist(next: any) {
    const merged: SubTrackerData = {
      version: 1,
      entries: next.entries !== undefined ? next.entries : tracker.entries,
      completedBonuses: next.completedBonuses !== undefined ? next.completedBonuses : (tracker.completedBonuses ?? [])
    };
    setTracker(merged);
    saveSubTracker(merged);
  }

  useEffect(() => {
    // Auto-complete is intentionally disabled.
    // A completed sign-up bonus is created only when the user clicks "Complete"
    // so we can show a rewards-addition confirmation prompt.
  }, []);

  useEffect(() => {
    if (completedBonusesCollapsed) {
      setCompletedCarouselHeight(undefined);
      return;
    }
    requestAnimationFrame(() => {
      const carousel = completedCarouselRef.current;
      if (!carousel) return;
      const firstItem = carousel.children[0] as HTMLElement | undefined;
      if (firstItem) setCompletedCarouselHeight(firstItem.offsetHeight);
    });
  }, [completedBonuses.length, completedBonusesCollapsed]);

  useEffect(() => {
    const carousel = entriesCarouselRef.current;
    if (!carousel) return;
    const firstItem = carousel.children[0] as HTMLElement | undefined;
    if (firstItem) setEntriesCarouselHeight(firstItem.offsetHeight);
  }, [entries.length]);

  useEffect(() => {
    const el = completedCarouselRef.current;
    if (!el) return;
    let ro: ResizeObserver | null = null;
    const observeCurrent = () => {
      ro?.disconnect();
      const idx = Math.round(el.scrollLeft / (el.clientWidth || 1));
      const item = el.children[idx] as HTMLElement | undefined;
      if (!item) return;
      ro = new ResizeObserver(() => setCompletedCarouselHeight((el.children[Math.round(el.scrollLeft / (el.clientWidth || 1))] as HTMLElement | undefined)?.offsetHeight));
      ro.observe(item);
    };
    const handler = () => {
      const idx = Math.round(el.scrollLeft / (el.clientWidth || 1));
      setCompletedCarouselIdx(idx);
      const item = el.children[idx] as HTMLElement | undefined;
      if (item) setCompletedCarouselHeight(item.offsetHeight);
      observeCurrent();
    };
    observeCurrent();
    el.addEventListener('scrollend', handler);
    return () => { el.removeEventListener('scrollend', handler); ro?.disconnect(); };
  }, []);

  useEffect(() => {
    const el = entriesCarouselRef.current;
    if (!el) return;
    let ro: ResizeObserver | null = null;
    const observeCurrent = () => {
      ro?.disconnect();
      const idx = Math.round(el.scrollLeft / (el.clientWidth || 1));
      const item = el.children[idx] as HTMLElement | undefined;
      if (!item) return;
      ro = new ResizeObserver(() => setEntriesCarouselHeight((el.children[Math.round(el.scrollLeft / (el.clientWidth || 1))] as HTMLElement | undefined)?.offsetHeight));
      ro.observe(item);
    };
    const handler = () => {
      const idx = Math.round(el.scrollLeft / (el.clientWidth || 1));
      setEntriesCarouselIdx(idx);
      const item = el.children[idx] as HTMLElement | undefined;
      if (item) setEntriesCarouselHeight(item.offsetHeight);
      observeCurrent();
    };
    observeCurrent();
    el.addEventListener('scrollend', handler);
    return () => { el.removeEventListener('scrollend', handler); ro?.disconnect(); };
  }, []);

  function entryDisplayName(e: SubTrackerEntry) {
    return e.cardRef.type === 'card' ? cardNameById.get(e.cardRef.cardId) || 'Card' : e.cardRef.name || 'Card';
  }

  return (
    <div className="tab-panel active" id="subTrackerContent">
      <p className="section-title page-title">Bonuses</p>

      {subview === 'completed' ? (
        <>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginBottom: 16, width: '100%' }}
            onClick={() => {
              setSubview('main');
              setEntriesCarouselHeight(undefined);
            }}
          >
            Go back to main page
          </button>
          <div
            className="section-header"
            style={{ marginBottom: 12 }}
            onClick={() => setCompletedBonusesCollapsed(!completedBonusesCollapsed)}
          >
            <span className="section-header-left">Show All Completed sign up bonuses</span>
            <span className="chevron">{completedBonusesCollapsed ? '▸' : '▾'}</span>
          </div>
          {!completedBonusesCollapsed ? (
          <>
          <div
            style={completedCarouselHeight != null ? { height: completedCarouselHeight, overflow: 'hidden' } : {}}
          >
          <div
            ref={completedCarouselRef}
            className="card-carousel"
            style={{ marginBottom: 0 }}
            onScroll={(e) => {
              const el = e.currentTarget;
              const rawIdx = el.scrollLeft / (el.clientWidth || 1);
              const leftIdx = Math.floor(rawIdx);
              const rightIdx = Math.min(leftIdx + 1, el.children.length - 1);
              const progress = rawIdx - leftIdx;
              const lh = (el.children[leftIdx] as HTMLElement | undefined)?.offsetHeight ?? 0;
              const rh = (el.children[rightIdx] as HTMLElement | undefined)?.offsetHeight ?? lh;
              setCompletedCarouselHeight(Math.round(lh + (rh - lh) * progress));
            }}
          >
          {completedBonuses.map((b) => {
            const cashCents = completedBonusCashValueCents(b);
            const isPointsOrMiles = b.unitType === 'points' || b.unitType === 'miles';
            const bankLabel =
              b.bankAccountRef?.type === 'bank'
                ? bankNameById.get(b.bankAccountRef.bankId) || 'Bank'
                : b.bankAccountRef?.type === 'manual'
                  ? b.bankAccountRef.name
                  : '';
            return (
              <div className="card-carousel-item" key={b.id}><div className="card" style={{ marginBottom: 0 }}>
                <div className="row" style={{ marginBottom: 4 }}>
                  <span className="name" style={{ fontSize: '1.05rem' }}>{b.cardName}</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                    onClick={() => setCompletedEditor({ mode: 'edit', id: b.id })}
                  >
                    Edit
                  </button>
                </div>
                <div style={{ fontSize: '0.95rem', color: 'var(--ui-primary-text, var(--text))' }}>
                  <div><strong>Bonus:</strong> {b.rewardLabel}</div>
                  <div><strong>Date completed:</strong> {formatLongLocalDate(b.completedAt)}</div>
                  {b.cardId && bankLabel ? <div><strong>Checking / bank:</strong> {bankLabel}</div> : null}
                  {isPointsOrMiles ? (
                    <div style={{ marginTop: 6 }}>
                      <div>
                        <strong>Valuation:</strong> {(b.centsPerUnit ?? 1).toFixed(2)}¢ / {b.unitType === 'miles' ? 'mile' : 'point'}
                      </div>
                      <div style={{ marginTop: 2 }}>
                        <strong>Estimated cash value:</strong> <span style={{ color: 'var(--green)' }}>{formatCents(cashCents)}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 6 }}>
                      <strong>Cash value:</strong> <span style={{ color: 'var(--green)' }}>{formatCents(cashCents)}</span>
                    </div>
                  )}
                  {b.notes ? <div style={{ marginTop: 4 }}>Notes: {b.notes}</div> : null}
                </div>
              </div></div>
            );
          })}
          </div>
          </div>
          <WindowedCarouselDots count={completedBonuses.length} current={completedCarouselIdx} />
          <button
            type="button"
            className="btn btn-add"
            style={{ width: '100%', marginTop: 8, marginBottom: 16 }}
            onClick={() => setCompletedEditor({ mode: 'add' })}
          >
            Add Completed Bonus
          </button>
          </>
          ) : null}
          <div
            className="card"
            style={{
              padding: 14,
              marginTop: 8
            }}
          >
            <div className="row">
              <span className="name" style={{ fontWeight: 600 }}>Total value earned from completed sign-up bonuses</span>
              <span className="amount" style={{ color: 'var(--green)', fontWeight: 600 }}>
                {formatCents(completedBonuses.reduce((s, x) => s + completedBonusCashValueCents(x), 0))}
              </span>
            </div>
            {completedBonuses.some((b) => (b.unitType === 'points' || b.unitType === 'miles') && (b.centsPerUnit == null || b.centsPerUnit === 1)) ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 6, marginBottom: 0 }}>
                Estimated value based on current valuation (cents per point/mile).
              </p>
            ) : null}
          </div>
          {completedEditor ? (
            <CompletedBonusEditorModal
              mode={completedEditor.mode}
              initial={completedEditor.mode === 'edit' ? completedBonuses.find((b) => b.id === completedEditor.id) || null : null}
              cards={cards}
              banks={banks}
              onClose={() => setCompletedEditor(null)}
              onSave={(bonus) => {
                if (completedEditor.mode === 'add') {
                  persist({ completedBonuses: [...completedBonuses, bonus] });
                } else {
                  persist({ completedBonuses: completedBonuses.map((x) => (x.id === bonus.id ? bonus : x)) });
                }
                setCompletedEditor(null);
              }}
            />
          ) : null}
        </>
      ) : (
        <>
      <div
        style={entriesCarouselHeight != null ? { height: entriesCarouselHeight, overflow: 'hidden' } : {}}
      >
      <div
        ref={entriesCarouselRef}
        className="card-carousel"
        style={{ marginBottom: 0 }}
        onScroll={(e) => {
          const el = e.currentTarget;
          const rawIdx = el.scrollLeft / (el.clientWidth || 1);
          const leftIdx = Math.floor(rawIdx);
          const rightIdx = Math.min(leftIdx + 1, el.children.length - 1);
          const progress = rawIdx - leftIdx;
          const lh = (el.children[leftIdx] as HTMLElement | undefined)?.offsetHeight ?? 0;
          const rh = (el.children[rightIdx] as HTMLElement | undefined)?.offsetHeight ?? lh;
          setEntriesCarouselHeight(Math.round(lh + (rh - lh) * progress));
        }}
      >
      {entries.map((e) => {
        const name = entryDisplayName(e);
        const start = toDate(e.startDate);
        const deadline = e.deadlineDate ? toDate(e.deadlineDate) : e.monthsWindow ? toDate(addMonthsFromStart(e.startDate, e.monthsWindow)) : new Date(NaN);
        const now = new Date();
        const spendCents = typeof e.spendCents === 'number' ? e.spendCents : 0;

        const daysRemaining = Number.isNaN(deadline.getTime()) ? null : Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 86400000));
        const elapsedDays = Number.isNaN(start.getTime()) ? null : Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86400000));

        const totalWindowDays =
          Number.isNaN(deadline.getTime()) || Number.isNaN(start.getTime())
            ? null
            : Math.max(1, Math.ceil((deadline.getTime() - start.getTime()) / 86400000));
        const monthsWindowValue =
          e.monthsWindow != null && e.monthsWindow > 0
            ? e.monthsWindow
            : totalWindowDays != null
              ? totalWindowDays / 30.44
              : null;

        const tiers = Array.isArray(e.tiers)
          ? e.tiers.slice().sort((a, b) => (a.spendTargetCents || 0) - (b.spendTargetCents || 0))
          : [];
        const finalTarget = tiers.length ? tiers[tiers.length - 1].spendTargetCents || 0 : 0;

        const requiredPace =
          monthsWindowValue != null && finalTarget > 0 ? finalTarget / monthsWindowValue : null;
        const currentPace = elapsedDays != null ? (spendCents / elapsedDays) * 30 : null;
        const ratio = finalTarget > 0 ? clamp(spendCents / finalTarget, 0, 1) : null;

        return (
          <div className="card-carousel-item" key={e.id}>
          <div className="card">
            <div className="row" style={{ marginBottom: 4 }}>
              <span className="name" style={{ fontSize: '1.05rem' }}>
                {name}
              </span>
            </div>
            <div style={{ fontSize: '0.95rem', marginTop: 2 }}>
              <span style={{ color: 'var(--ui-primary-text, var(--text))' }}>Required spend: </span>
              <span>{finalTarget ? formatCents(finalTarget) : '—'}</span>
            </div>
            <div style={{ fontSize: '0.95rem', marginTop: 2 }}>
              <span style={{ color: 'var(--ui-primary-text, var(--text))' }}>Current spend: </span>
              <span>{formatCents(spendCents)}{finalTarget ? ` / ${formatCents(finalTarget)}` : ''}</span>
            </div>
            {ratio != null ? (
              <><div style={{ marginTop: 12, marginBottom: 4 }}>
                {/* Tier reward labels */}
                <div style={{ position: 'relative', width: '100%', height: 20, marginBottom: 4 }}>
                  {tiers.slice(0, Math.max(0, tiers.length - 1)).map((t, idx) => {
                    const left = finalTarget > 0 ? (t.spendTargetCents / finalTarget) * 100 : 0;
                    const clampedLeft = clamp(left, 2, 98);
                    const parsed = parseRewardText(t.rewardText || '');
                    const label = formatTierRewardHashNumeric(parsed);
                    const rewardDisplay = idx === 0 ? label : `+${label}`;
                    return (
                      <div
                        key={t.id + ':label'}
                        style={{
                          position: 'absolute',
                          left: `${clampedLeft}%`,
                          top: 0,
                          transform: 'translateX(-50%)',
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          color: 'var(--ui-primary-text, var(--text))',
                          whiteSpace: 'nowrap',
                          zIndex: 4,
                          maxWidth: 140,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {rewardDisplay}
                      </div>
                    );
                  })}

                  {tiers.length > 0 ? (() => {
                    const lastIdx = tiers.length - 1;
                    const last = tiers[lastIdx];
                    const parsed = parseRewardText(last.rewardText || '');
                    const label = formatTierRewardHashNumeric(parsed);
                    const rewardDisplay = lastIdx === 0 ? label : `+${label}`;
                    return (
                      <div
                        style={{
                          position: 'absolute',
                          left: '100%',
                          top: 0,
                          transform: 'translateX(-100%)',
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          color: 'var(--ui-primary-text, var(--text))',
                          whiteSpace: 'nowrap',
                          zIndex: 4,
                          maxWidth: 170,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {rewardDisplay}
                      </div>
                    );
                  })() : null}
                </div>
                <div style={{ position: 'relative', height: 10, borderRadius: 999, background: 'color-mix(in srgb, var(--border) 60%, transparent)', overflow: 'visible' }}>
                  {/* Tier marker lines */}
                  {tiers.slice(0, Math.max(0, tiers.length - 1)).map((t) => {
                    const left = finalTarget > 0 ? (t.spendTargetCents / finalTarget) * 100 : 0;
                    return (
                      <div
                        key={t.id}
                        style={{
                          position: 'absolute',
                          left: `${left}%`,
                          top: -3,
                          bottom: -3,
                          width: 2,
                          borderRadius: 1,
                          background: 'var(--bg)',
                          zIndex: 4,
                          transform: 'translateX(-1px)',
                          boxShadow: '0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent)'
                        }}
                      />
                    );
                  })}
                  {/* Fill bar */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      height: '100%',
                      width: `${Math.min(ratio * 100, 100)}%`,
                      borderRadius: 999,
                      background: ratio >= 1
                        ? 'var(--green)'
                        : 'linear-gradient(90deg, #86efac, #16a34a)',
                      transition: 'width 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                      boxShadow: ratio > 0 ? '0 0 8px color-mix(in srgb, var(--green) 50%, transparent)' : 'none',
                      zIndex: 2,
                    }}
                  />
                  {/* Pulse dot at leading edge */}
                  {ratio > 0 && ratio < 1 ? (
                    <div
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: `${Math.min(ratio * 100, 100)}%`,
                        transform: 'translate(-50%, -50%)',
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: 'var(--green)',
                        zIndex: 5,
                        boxShadow: '0 0 0 3px color-mix(in srgb, var(--green) 25%, transparent)',
                        animation: 'progress-pulse-green 2s ease-in-out infinite',
                      }}
                    />
                  ) : null}
                </div>
                {/* Percentage label */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.75rem', color: 'var(--muted)' }}>
                  <span>$0</span>
                  <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                    {(ratio * 100).toPrecision(3).replace(/\.?0+$/, '')}%
                  </span>
                  <span>${(finalTarget / 100).toLocaleString()}</span>
                </div>
              </div>
            </>) : null}
            <div
              className="btn-row"
              style={{
                marginTop: 10,
                display: 'flex',
                flexWrap: 'nowrap',
                gap: 10,
                alignItems: 'center',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                paddingBottom: 2,
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset', flexShrink: 0 }}
                onClick={() => {
                  // Open edit modal with this entry's values.
                  const ref = e.cardRef;
                  if (ref.type === 'card') {
                    setCardMode('card');
                    setCardId(ref.cardId);
                    setManualName('');
                  } else {
                    setCardMode('manual');
                    setManualName(ref.name || '');
                    setCardId(cards[0]?.id || '');
                  }
                  setStartDate(e.startDate || todayKey());
                  if (e.deadlineDate) {
                    setUseDeadlineDate(true);
                    setDeadlineDate(e.deadlineDate);
                  } else {
                    setUseDeadlineDate(false);
                    setMonthsWindow(String(e.monthsWindow || '3'));
                    setDeadlineDate(todayKey());
                  }
                  const sortedTiers = Array.isArray(e.tiers)
                    ? e.tiers.slice().sort((a, b) => (a.spendTargetCents || 0) - (b.spendTargetCents || 0))
                    : [];
                  setTierDrafts(
                    sortedTiers.map((t) => ({
                      id: t.id,
                      spendTarget: (t.spendTargetCents / 100).toFixed(2),
                      rewardAmount: (() => {
                        const parsed = parseRewardText(t.rewardText || '');
                        if (parsed.unitType === 'cash') return formatTierRewardQtyPlain(parsed.quantity, 'cash');
                        if (parsed.unitType === 'miles') return String(Math.round(parsed.quantity));
                        return String(Math.round(parsed.quantity)); // default points
                      })(),
                      rewardUnit: (() => {
                        const parsed = parseRewardText(t.rewardText || '');
                        if (parsed.unitType === 'cash') return 'cash';
                        if (parsed.unitType === 'miles') return 'miles';
                        return 'points';
                      })()
                    }))
                  );
                  const currentSpendCents = typeof e.spendCents === 'number' ? e.spendCents : 0;
                  setSpentInput((currentSpendCents / 100).toFixed(2));
                  setEditorEntryId(e.id);
                  setEditorOpen(true);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset', flexShrink: 0 }}
                onClick={() => setConfirmDelete({ kind: 'entry', entryId: e.id, label: name })}
              >
                Delete
              </button>
              <button
                type="button"
                className="btn btn-complete-green"
                style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset', flexShrink: 0 }}
                onClick={() => {
                  const achievedTiers = tiers.filter((t) => (t.spendTargetCents || 0) <= spendCents);
                  if (!achievedTiers.length) return;
                  const parsed = achievedTiers
                    .map((t) => parseRewardText(t.rewardText || ''))
                    .filter((p) => p.unitType !== 'other' && p.quantity > 0);
                  const unitTypes = Array.from(new Set(parsed.map((p) => p.unitType)));
                  if (unitTypes.length !== 1) {
                    alert('All milestone rewards must use the same unit type (cash back, points, or miles) to complete.');
                    return;
                  }
                  const unitType = unitTypes[0] as 'cash' | 'points' | 'miles';
                  const linkedCardId = e.cardRef.type === 'card' ? e.cardRef.cardId : undefined;
                  const card = linkedCardId ? cards.find((c) => c.id === linkedCardId) : undefined;
                  const centsPerUnitOverride =
                    unitType === 'points'
                      ? card?.avgCentsPerPoint
                      : unitType === 'miles'
                        ? card?.avgCentsPerMile
                        : undefined;

                  const bonus = entryToCompletedBonus(e, name, achievedTiers, centsPerUnitOverride);
                  persist({
                    entries: entries.filter((x) => x.id !== e.id),
                    completedBonuses: [...completedBonuses, bonus]
                  });

                  // Optional: offer to add the earned rewards to the card's rewards overview.
                  if (e.cardRef.type === 'card' && card) {
                    const earnedCashCents = completedBonusCashValueCents(bonus);
                    const currentCashbackCents = card.rewardCashbackCents ?? 0;
                    const currentPoints = card.rewardPoints ?? 0;
                    const currentMiles = card.rewardMiles ?? 0;

                    if (unitType === 'cash') {
                      const earnedCents = Math.round(bonus.rewardQuantity * 100);
                      const newCashbackCents = currentCashbackCents + earnedCents;
                      setRewardAddPrompt({
                        cardId: card.id,
                        cardName: card.name || name,
                        unitType,
                        earnedQuantity: bonus.rewardQuantity,
                        currentRewardBalance: currentCashbackCents / 100,
                        newRewardBalance: newCashbackCents / 100,
                        newCashbackCents,
                        estimatedCashCents: earnedCashCents
                      });
                    } else if (unitType === 'points') {
                      const newPoints = currentPoints + bonus.rewardQuantity;
                      setRewardAddPrompt({
                        cardId: card.id,
                        cardName: card.name || name,
                        unitType,
                        earnedQuantity: bonus.rewardQuantity,
                        currentRewardBalance: currentPoints,
                        newRewardBalance: newPoints,
                        estimatedCashCents: earnedCashCents,
                        centsPerUnitUsed: centsPerUnitOverride
                      });
                    } else if (unitType === 'miles') {
                      const newMiles = currentMiles + bonus.rewardQuantity;
                      setRewardAddPrompt({
                        cardId: card.id,
                        cardName: card.name || name,
                        unitType,
                        earnedQuantity: bonus.rewardQuantity,
                        currentRewardBalance: currentMiles,
                        newRewardBalance: newMiles,
                        estimatedCashCents: earnedCashCents,
                        centsPerUnitUsed: centsPerUnitOverride
                      });
                    }
                  }
                }}
              >
                Complete
              </button>
            </div>
            {requiredPace != null && currentPace != null ? (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span className={currentPace >= requiredPace ? 'upcoming-status-ok' : 'upcoming-status-warn'}>
                  {currentPace >= requiredPace ? 'On pace' : 'Not on pace'}
                </span>
                {(() => {
                  const dailyPace = elapsedDays != null && elapsedDays > 0 ? spendCents / elapsedDays : null;
                  if (!dailyPace || dailyPace <= 0 || finalTarget <= spendCents) return null;
                  const daysToHit = (finalTarget - spendCents) / dailyPace;
                  const hitDate = new Date();
                  hitDate.setDate(hitDate.getDate() + Math.ceil(daysToHit));
                  const label = hitDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                  return (
                    <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                      Estimated to Complete: {label}
                    </span>
                  );
                })()}
              </div>
            ) : null}
          </div>
          </div>
        );
      })}
      </div>
      </div>
      <WindowedCarouselDots count={entries.length} current={entriesCarouselIdx} />

      {confirmDelete ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Are you sure you want to delete this?</h3>
            <p style={{ color: 'var(--ui-primary-text, var(--text))', marginTop: 0 }}>{confirmDelete.label}</p>
            <div className="btn-row">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (confirmDelete.kind === 'entry') {
                    persist({ version: 1, entries: entries.filter((x) => x.id !== confirmDelete.entryId) });
                  } else {
                    persist({
                      version: 1,
                      entries: entries.map((x) =>
                        x.id === confirmDelete.entryId ? { ...x, tiers: (x.tiers || []).filter((t) => t.id !== confirmDelete.tierId) } : x
                      )
                    });
                  }
                  setConfirmDelete(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rewardAddPrompt ? (
        <Modal
          open={true}
          title="Add earned rewards to Rewards overview?"
          onClose={() => setRewardAddPrompt(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
              You completed this sign-up bonus and earned{" "}
              <strong>
                {rewardAddPrompt.unitType === 'cash'
                  ? formatCents(Math.round(rewardAddPrompt.earnedQuantity * 100))
                  : rewardAddPrompt.earnedQuantity.toLocaleString()}{' '}
                {rewardAddPrompt.unitType === 'cash'
                  ? 'cash back'
                  : rewardAddPrompt.unitType === 'points'
                    ? 'points'
                    : 'miles'}
              </strong>
              .
            </p>
            <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
              New rewards balance for <strong>{rewardAddPrompt.cardName}</strong> will be{' '}
              <strong>
                {rewardAddPrompt.unitType === 'cash'
                  ? formatCents(rewardAddPrompt.newCashbackCents ?? 0)
                  : `${rewardAddPrompt.newRewardBalance.toLocaleString()} ${rewardAddPrompt.unitType === 'points' ? 'points' : 'miles'}`}
              </strong>
              .
            </p>
            {rewardAddPrompt.unitType !== 'cash' ? (
              <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6, fontSize: '0.9rem' }}>
                Estimated cash value (based on your card cents-per-point/mile):{' '}
                <strong style={{ color: 'var(--green)' }}>{formatCents(rewardAddPrompt.estimatedCashCents)}</strong>
              </p>
            ) : null}

            <div className="btn-row" style={{ marginTop: 6 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setRewardAddPrompt(null)}>
                Not now
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const p = rewardAddPrompt;
                  if (!p) return;
                  if (p.unitType === 'cash') {
                    actions.updateCardRewardTotals(p.cardId, {
                      rewardType: 'cashback',
                      rewardCashbackCents: p.newCashbackCents ?? 0
                    });
                  } else if (p.unitType === 'points') {
                    actions.updateCardRewardTotals(p.cardId, {
                      rewardType: 'points',
                      rewardPoints: p.newRewardBalance
                    });
                    if (typeof p.centsPerUnitUsed === 'number') {
                      actions.updateCardRewardCpp(p.cardId, { avgCentsPerPoint: p.centsPerUnitUsed });
                    }
                  } else if (p.unitType === 'miles') {
                    actions.updateCardRewardTotals(p.cardId, {
                      rewardType: 'miles',
                      rewardMiles: p.newRewardBalance
                    });
                    if (typeof p.centsPerUnitUsed === 'number') {
                      actions.updateCardRewardCpp(p.cardId, { avgCentsPerMile: p.centsPerUnitUsed });
                    }
                  }
                  setRewardAddPrompt(null);
                }}
              >
                Add rewards
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      <button
        type="button"
        className="btn btn-add"
        style={{ width: '100%', marginTop: 12 }}
        onClick={() => {
          setCardMode('card');
          setCardId(cards[0]?.id || '');
          setManualName('');
          setStartDate(todayKey());
          setUseDeadlineDate(true);
          setDeadlineDate(todayKey());
          setMonthsWindow('3');
          setTierDrafts([{ id: uid(), spendTarget: '', rewardAmount: '', rewardUnit: 'points' }]);
          setSpentInput('0.00');
          setConfirmDelete(null);
          setEditorEntryId(null);
          setEditorOpen(true);
        }}
      >
        Add tracked card
      </button>

      <button
        type="button"
        className="btn btn-secondary"
        style={{ width: '100%', marginTop: 10 }}
        onClick={() => setSubview('completed')}
      >
        See all Sign Up Bonuses Completed
      </button>

      <Modal
        open={editorOpen}
        title={editorEntryId ? 'Edit tracked card' : 'Add tracked card'}
        onClose={() => setEditorOpen(false)}
      >
        <div className="field">
          <label>Card</label>
          <Select
            value={cardMode === 'card' ? `card:${cardId}` : `manual:${manualName}`}
            onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith('manual:')) {
                setCardMode('manual');
                setManualName(v.slice('manual:'.length));
              } else if (v.startsWith('card:')) {
                setCardMode('card');
                setCardId(v.slice('card:'.length));
              }
            }}
          >
            {(cards || []).map((c) => (
              <option key={c.id} value={`card:${c.id}`}>
                {c.name}
              </option>
            ))}
            <option value={`manual:${manualName}`}>Manual…</option>
          </Select>
          {cardMode === 'manual' ? (
            <div className="field" style={{ marginTop: 10 }}>
              <label>Manual card name</label>
              <input
                className="ll-control"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="e.g. Chase Sapphire Preferred"
              />
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Start date</label>
            <input className="ll-control" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{useDeadlineDate ? 'Deadline date' : 'Months window'}</label>
            {useDeadlineDate ? (
              <input className="ll-control" type="date" value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} />
            ) : (
              <input
                className="ll-control"
                type="number"
                min={1}
                step={1}
                value={monthsWindow}
                onChange={(e) => setMonthsWindow(e.target.value)}
              />
            )}
          </div>
        </div>

        <div className="toggle-row">
          <input type="checkbox" checked={useDeadlineDate} onChange={(e) => setUseDeadlineDate(e.target.checked)} id="subUseDeadline" />
          <label htmlFor="subUseDeadline">Use a deadline date (otherwise use months window)</label>
        </div>

        <div className="field">
          <label>Spent so far ($)</label>
          <input
            className="ll-control"
            value={spentInput}
            onChange={(ev) => setSpentInput(ev.target.value)}
            inputMode="decimal"
            placeholder={editorEntryId ? 'e.g. 1500 or +50 to add' : '0'}
          />
          {editorEntryId ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', margin: '4px 0 0 0' }}>
              Enter amount to set total, or +amount to add (e.g. +50).
            </p>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tierDrafts.map((draft, idx) => (
            <div
              key={draft.id}
              style={{
                border: '1px solid var(--ui-outline-btn, var(--ui-border, var(--border)))',
                borderRadius: 10,
                padding: 10,
                background: 'var(--ui-modal-bg, var(--surface))'
              }}
            >
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div className="field" style={{ flex: 1, minWidth: 140 }}>
                  <label>Milestone {idx + 1} spend target ($)</label>
                  <input
                    className="ll-control"
                    value={draft.spendTarget}
                    onChange={(e) =>
                      setTierDrafts((prev) => prev.map((x) => (x.id === draft.id ? { ...x, spendTarget: e.target.value } : x)))
                    }
                    inputMode="decimal"
                    placeholder="e.g. 3000"
                  />
                </div>
                <div className="field" style={{ flex: 1, minWidth: 180 }}>
                  <label>Milestone {idx + 1} reward</label>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                    <input
                      className="ll-control"
                      type="number"
                      min={0}
                      step={draft.rewardUnit === 'cash' ? '0.01' : '1'}
                      inputMode="decimal"
                      value={draft.rewardAmount}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setTierDrafts((prev) =>
                          prev.map((x) => {
                            if (x.id !== draft.id) return x;
                            const unit = x.rewardUnit;
                            if (unit === 'cash') {
                              // Keep digits + at most one decimal point (max 2 decimals).
                              const cleaned = raw.replace(/[^0-9.]/g, '');
                              const firstDot = cleaned.indexOf('.');
                              let normalized = cleaned;
                              if (firstDot !== -1) {
                                normalized = `${cleaned.slice(0, firstDot)}.${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
                                const parts = normalized.split('.');
                                normalized =
                                  parts.length === 2 ? `${parts[0]}.${parts[1].slice(0, 2)}` : parts[0];
                              }
                              return { ...x, rewardAmount: normalized };
                            }
                            return { ...x, rewardAmount: raw.replace(/\D/g, '') };
                          })
                        );
                      }}
                      placeholder={draft.rewardUnit === 'cash' ? 'e.g. 200' : 'e.g. 70000'}
                    />
                    <Select
                      value={draft.rewardUnit}
                      onChange={(e) => {
                        const v = e.target.value as RewardUnitDraft;
                        setTierDrafts((prev) => prev.map((x) => (x.id === draft.id ? { ...x, rewardUnit: v } : x)));
                      }}
                      style={{ minWidth: 128, marginBottom: 0 }}
                    >
                      <option value="cash">Cash back ($)</option>
                      <option value="points">Points</option>
                      <option value="miles">Miles</option>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="btn-row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
                {tierDrafts.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                    onClick={() => setTierDrafts((prev) => prev.filter((x) => x.id !== draft.id))}
                  >
                    Remove milestone
                  </button>
                ) : null}
              </div>
            </div>
          ))}

          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.85rem', width: 'fit-content' }}
            onClick={() =>
              setTierDrafts((prev) => [...prev, { id: uid(), spendTarget: '', rewardAmount: '', rewardUnit: 'points' }])
            }
          >
            Add milestone
          </button>
        </div>

        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => setEditorOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const parsedDraftTiers = tierDrafts
                .map((d) => ({
                  id: d.id,
                  spendTargetCents: parseCents(d.spendTarget),
                  rewardQuantity: parseFloat(d.rewardAmount || ''),
                  rewardText:
                    d.rewardUnit === 'cash'
                      ? `${parseFloat(d.rewardAmount || '')} cash back`
                      : `${parseFloat(d.rewardAmount || '')} ${d.rewardUnit}`
                }))
                .filter((t) => t.spendTargetCents > 0 && Number.isFinite(t.rewardQuantity) && t.rewardQuantity > 0)
                .sort((a, b) => a.spendTargetCents - b.spendTargetCents);
              if (!parsedDraftTiers.length) return;

              const newTiers: SubTrackerTier[] = parsedDraftTiers.map((t) => ({
                id: t.id,
                spendTargetCents: t.spendTargetCents,
                rewardText: t.rewardText
              }));
              let spentCents: number;
              if (editorEntryId) {
                const trimmed = (spentInput || '').trim();
                const entry = entries.find((x) => x.id === editorEntryId);
                const currentSpendCents = entry && typeof entry.spendCents === 'number' ? entry.spendCents : 0;
                if (trimmed.startsWith('+')) {
                  const delta = parseCents(trimmed.slice(1));
                  if (!(delta > 0)) return;
                  spentCents = currentSpendCents + delta;
                } else {
                  spentCents = parseCents(trimmed);
                  if (!(spentCents >= 0)) return;
                }
              } else {
                spentCents = parseCents(spentInput);
                if (!(spentCents >= 0)) return;
              }
              if (editorEntryId) {
                const updatedEntries = entries.map((x) => {
                  if (x.id !== editorEntryId) return x;
                  return {
                    ...x,
                    cardRef: cardMode === 'card' ? { type: 'card', cardId } : { type: 'manual', name: manualName.trim() || 'Card' },
                    startDate: startDate || todayKey(),
                    deadlineDate: useDeadlineDate ? deadlineDate || todayKey() : undefined,
                    monthsWindow: useDeadlineDate ? undefined : Math.max(1, parseInt(monthsWindow || '1', 10) || 1),
                    tiers: newTiers,
                    spendCents: spentCents,
                    updatedAt: new Date().toISOString()
                  };
                });
                persist({ version: 1, entries: updatedEntries });
              } else {
                const entry: SubTrackerEntry = {
                  id: uid(),
                  cardRef: cardMode === 'card' ? { type: 'card', cardId } : { type: 'manual', name: manualName.trim() || 'Card' },
                  startDate: startDate || todayKey(),
                  deadlineDate: useDeadlineDate ? deadlineDate || todayKey() : undefined,
                  monthsWindow: useDeadlineDate ? undefined : Math.max(1, parseInt(monthsWindow || '1', 10) || 1),
                  tiers: newTiers,
                  spendCents: spentCents,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                };
                persist({ version: 1, entries: [entry, ...entries] });
              }
              setEditorOpen(false);
            }}
          >
            Save
          </button>
        </div>
      </Modal>
        </>
      )}
    </div>
  );
}

