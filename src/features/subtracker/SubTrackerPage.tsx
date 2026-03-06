import { useEffect, useMemo, useState } from 'react';
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
  type CompletedBonusUnitType
} from '../../state/storage';
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
  if (/\$|dollar|cash|back\s*$/.test(t) || t.includes('cash back')) {
    return { quantity: quantity || 0, unitType: 'cash' };
  }
  if (/miles?/.test(t)) return { quantity, unitType: 'miles' };
  if (/points?/.test(t)) return { quantity, unitType: 'points' };
  return { quantity, unitType: 'other' };
}

function entryToCompletedBonus(
  e: SubTrackerEntry,
  cardName: string,
  _rewardText: string,
  achievedTier: SubTrackerTier
): CompletedBonus {
  const { quantity, unitType } = parseRewardText(achievedTier.rewardText || '');
  return {
    id: uid(),
    cardId: e.cardRef.type === 'card' ? e.cardRef.cardId : undefined,
    cardName,
    unitType,
    rewardQuantity: quantity,
    rewardLabel: (achievedTier.rewardText || '').trim() || 'Bonus',
    centsPerUnit: unitType === 'points' || unitType === 'miles' ? 1 : undefined,
    completedAt: todayKey(),
    notes: undefined
  };
}

function completedBonusCashValueCents(b: CompletedBonus): number {
  if (b.unitType === 'cash') return Math.round(b.rewardQuantity * 100);
  const cpp = b.centsPerUnit != null && b.centsPerUnit >= 0 ? b.centsPerUnit : 1;
  return Math.round(b.rewardQuantity * (cpp / 100));
}

function AddCompletedBonusModal({
  cards,
  onClose,
  onSave
}: {
  cards: { id: string; name: string }[];
  onClose: () => void;
  onSave: (bonus: CompletedBonus) => void;
}) {
  const [cardMode, setCardMode] = useState<'card' | 'manual'>('card');
  const [cardId, setCardId] = useState(cards[0]?.id || '');
  const [manualName, setManualName] = useState('');
  const [rewardLabel, setRewardLabel] = useState('');
  const [rewardQuantity, setRewardQuantity] = useState('');
  const [unitType, setUnitType] = useState<CompletedBonusUnitType>('points');
  const [centsPerUnit, setCentsPerUnit] = useState('1');
  const [completedAt, setCompletedAt] = useState(todayKey());
  const [notes, setNotes] = useState('');

  const cardName = cardMode === 'card' ? (cards.find((c) => c.id === cardId)?.name || '') : manualName.trim() || 'Card';

  function handleSave() {
    const qty = parseFloat(rewardQuantity);
    if (!(qty >= 0)) return;
    const cpp = unitType === 'points' || unitType === 'miles' ? (parseFloat(centsPerUnit) || 1) : undefined;
    const bonus: CompletedBonus = {
      id: uid(),
      cardId: cardMode === 'card' ? cardId : undefined,
      cardName,
      unitType,
      rewardQuantity: qty,
      rewardLabel: rewardLabel.trim() || (unitType === 'cash' ? `$${qty}` : `${qty} ${unitType}`),
      centsPerUnit: cpp,
      completedAt,
      notes: notes.trim() || undefined
    };
    onSave(bonus);
  }

  return (
    <Modal open title="Add Completed Bonus" onClose={onClose}>
      <div className="field">
        <label>Card</label>
        <Select
          value={cardMode === 'card' ? `card:${cardId}` : 'manual'}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'manual') {
              setCardMode('manual');
            } else if (v.startsWith('card:')) {
              setCardMode('card');
              setCardId(v.slice(5));
            }
          }}
        >
          {(cards || []).map((c) => (
            <option key={c.id} value={`card:${c.id}`}>
              {c.name}
            </option>
          ))}
          <option value="manual">Manual (enter name below)</option>
        </Select>
      </div>
      {cardMode === 'manual' ? (
        <div className="field">
          <label>Card name</label>
          <input
            className="ll-control"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            placeholder="e.g. Chase Sapphire Preferred"
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
        <Select
          value={unitType}
          onChange={(e) => setUnitType(e.target.value as CompletedBonusUnitType)}
        >
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
        <input
          className="ll-control"
          type="date"
          value={completedAt}
          onChange={(e) => setCompletedAt(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Notes (optional)</label>
        <input
          className="ll-control"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
        />
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

export function SubTrackerPage() {
  const data = useLedgerStore((s) => s.data);
  const cards = data.cards || [];

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
  const [tierTarget, setTierTarget] = useState('');
  const [tierReward, setTierReward] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorEntryId, setEditorEntryId] = useState<string | null>(null);
  const [spentInput, setSpentInput] = useState<string>('0.00');
  const [addCompletedOpen, setAddCompletedOpen] = useState(false);

  const cardNameById = useMemo(() => new Map(cards.map((c) => [c.id, c.name || 'Card'])), [cards]);

  const entries = (tracker.entries || []) as SubTrackerEntry[];
  const completedBonuses = (tracker.completedBonuses || []) as CompletedBonus[];

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
    const stillActive: SubTrackerEntry[] = [];
    const toAdd: CompletedBonus[] = [];
    for (const e of entries) {
      const tiers = (e.tiers || []).slice().sort((a, b) => (a.spendTargetCents || 0) - (b.spendTargetCents || 0));
      const maxTarget = tiers.length ? Math.max(...tiers.map((t) => t.spendTargetCents || 0)) : 0;
      const spendCents = typeof e.spendCents === 'number' ? e.spendCents : 0;
      if (maxTarget > 0 && spendCents >= maxTarget) {
        const achievedTier = tiers[tiers.length - 1];
        const name = entryDisplayName(e);
        toAdd.push(entryToCompletedBonus(e, name, achievedTier.rewardText, achievedTier));
      } else {
        stillActive.push(e);
      }
    }
    if (toAdd.length > 0) {
      persist({ entries: stillActive, completedBonuses: [...completedBonuses, ...toAdd] });
    }
  }, [tracker]);

  function entryDisplayName(e: SubTrackerEntry) {
    return e.cardRef.type === 'card' ? cardNameById.get(e.cardRef.cardId) || 'Card' : e.cardRef.name || 'Card';
  }

  return (
    <div className="tab-panel active" id="subTrackerContent">
      <p className="section-title">SUB Tracker</p>

      {subview === 'completed' ? (
        <>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <span className="section-header-left">Completed Sign Up Bonuses</span>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginBottom: 16, width: '100%' }}
            onClick={() => setSubview('main')}
          >
            Go back to main page
          </button>
          {completedBonuses.map((b) => {
            const cashCents = completedBonusCashValueCents(b);
            const isPointsOrMiles = b.unitType === 'points' || b.unitType === 'miles';
            return (
              <div className="card" key={b.id} style={{ marginBottom: 12 }}>
                <div className="row" style={{ marginBottom: 4 }}>
                  <span className="name" style={{ fontSize: '1.05rem' }}>{b.cardName}</span>
                </div>
                <div style={{ fontSize: '0.95rem', color: 'var(--muted)' }}>
                  <div><strong>Bonus:</strong> {b.rewardLabel}</div>
                  <div><strong>Date completed:</strong> {formatLongLocalDate(b.completedAt)}</div>
                  {isPointsOrMiles ? (
                    <div style={{ marginTop: 6 }}>
                      <label style={{ fontSize: '0.85rem' }}>Cents per {b.unitType === 'miles' ? 'mile' : 'point'}</label>
                      <input
                        className="ll-control"
                        type="number"
                        min={0}
                        step={0.1}
                        value={b.centsPerUnit ?? 1}
                        onChange={(ev) => {
                          const v = parseFloat(ev.target.value);
                          const next = (tracker.completedBonuses || []).map((x) =>
                            x.id === b.id ? { ...x, centsPerUnit: Number.isFinite(v) && v >= 0 ? v : 1 } : x
                          );
                          persist({ completedBonuses: next });
                        }}
                        style={{ width: 80, marginLeft: 8 }}
                      />
                      <span style={{ marginLeft: 8 }}>→ Cash value: {formatCents(cashCents)}</span>
                    </div>
                  ) : (
                    <div style={{ marginTop: 4 }}>Cash value: {formatCents(cashCents)}</div>
                  )}
                  {b.notes ? <div style={{ marginTop: 4 }}>Notes: {b.notes}</div> : null}
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className="btn btn-add"
            style={{ width: '100%', marginTop: 8, marginBottom: 16 }}
            onClick={() => setAddCompletedOpen(true)}
          >
            Add Completed Bonus
          </button>
          <div
            className="card"
            style={{
              background: 'var(--green-light)',
              border: '1px solid var(--green)',
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
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 6, marginBottom: 0 }}>
                Estimated value based on current valuation (cents per point/mile).
              </p>
            ) : null}
          </div>
          {addCompletedOpen ? (
            <AddCompletedBonusModal
              cards={cards}
              onClose={() => setAddCompletedOpen(false)}
              onSave={(bonus) => {
                persist({ completedBonuses: [...completedBonuses, bonus] });
                setAddCompletedOpen(false);
              }}
            />
          ) : null}
        </>
      ) : (
        <>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ width: '100%', marginBottom: 12 }}
        onClick={() => setSubview('completed')}
      >
        See all Sign Up Bonuses Completed
      </button>

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

        const tiers = Array.isArray(e.tiers) ? e.tiers.slice().sort((a, b) => (a.spendTargetCents || 0) - (b.spendTargetCents || 0)) : [];
        const nextTier = tiers.find((t) => spendCents < (t.spendTargetCents || 0)) || tiers[tiers.length - 1] || null;
        const nextTarget = nextTier ? nextTier.spendTargetCents || 0 : 0;
        const remainingCents = nextTier ? Math.max(0, nextTarget - spendCents) : 0;

        const requiredPace =
          monthsWindowValue != null && nextTarget > 0 ? nextTarget / monthsWindowValue : null;
        const currentPace = elapsedDays != null ? (spendCents / elapsedDays) * 30 : null;
        const ratio = nextTarget > 0 ? Math.min(1, Math.max(0, spendCents / nextTarget)) : null;

        return (
          <div className="card" key={e.id}>
            <div className="row" style={{ marginBottom: 6 }}>
              <span className="name" style={{ fontSize: '1.05rem' }}>
                {name}
              </span>
            </div>
            <div style={{ fontSize: '0.95rem', marginTop: 2 }}>
              <strong>Spent so far:</strong>{' '}
              <span>
                {formatCents(spendCents)}
                {nextTarget ? ` / ${formatCents(nextTarget)}` : ''}
              </span>
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: 4 }}>
              <div>
                <strong>Required pace:</strong>{' '}
                {requiredPace == null ? '—' : `${formatCents(Math.round(requiredPace))} / month`}
              </div>
              <div>
                <strong>Current pace:</strong>{' '}
                {currentPace == null ? '—' : `${formatCents(Math.round(currentPace))} / month`}
              </div>
              <div>
                <strong>Remaining to target:</strong>{' '}
                {nextTarget ? formatCents(remainingCents) : '—'}
              </div>
              <div>
                <strong>Days left:</strong>{' '}
                {daysRemaining != null ? `~${daysRemaining} days` : 'Unknown'}
              </div>
            </div>
            {ratio != null ? (
              <div style={{ marginTop: 6 }}>
                <div
                  style={{
                    width: '100%',
                    height: 4,
                    borderRadius: 999,
                    background: 'rgba(148, 163, 184, 0.35)',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      width: `${ratio * 100}%`,
                      height: '100%',
                      background: 'var(--green)'
                    }}
                  />
                </div>
              </div>
            ) : null}
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
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
                  const firstTier = (e.tiers || [])[0];
                  setTierTarget(firstTier ? (firstTier.spendTargetCents / 100).toFixed(2) : '');
                  setTierReward(firstTier?.rewardText || '');
                  setEditorEntryId(e.id);
                  setEditorOpen(true);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setConfirmDelete({ kind: 'entry', entryId: e.id, label: name })}
              >
                Delete
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const achievedTier = tiers.filter((t) => (t.spendTargetCents || 0) <= spendCents).pop() || tiers[tiers.length - 1];
                  if (!achievedTier) return;
                  const bonus = entryToCompletedBonus(e, name, achievedTier.rewardText, achievedTier);
                  persist({
                    entries: entries.filter((x) => x.id !== e.id),
                    completedBonuses: [...completedBonuses, bonus]
                  });
                }}
              >
                Mark complete
              </button>
            </div>
            <div className="btn-row" style={{ marginTop: 4 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const current = (e.spendCents || 0) / 100;
                  const v = window.prompt('Set spent so far ($)', current.toFixed(2));
                  if (v == null) return;
                  const cents = parseCents(v);
                  if (!(cents >= 0)) return;
                  const updated = entries.map((x) =>
                    x.id === e.id ? { ...x, spendCents: cents, updatedAt: new Date().toISOString() } : x
                  );
                  persist({ version: 1, entries: updated });
                }}
              >
                Set
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const v = window.prompt('Add to spent so far ($)', '0.00');
                  if (v == null) return;
                  const delta = parseCents(v);
                  if (!(delta > 0)) return;
                  const updated = entries.map((x) => {
                    if (x.id !== e.id) return x;
                    const prev = typeof x.spendCents === 'number' ? x.spendCents : 0;
                    return { ...x, spendCents: prev + delta, updatedAt: new Date().toISOString() };
                  });
                  persist({ version: 1, entries: updated });
                }}
              >
                Add
              </button>
            </div>
          </div>
        );
      })}

      {confirmDelete ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Are you sure you want to delete this?</h3>
            <p style={{ color: 'var(--muted)', marginTop: 0 }}>{confirmDelete.label}</p>
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

      <button
        type="button"
        className="btn btn-add"
        style={{ width: '100%', marginTop: 16 }}
        onClick={() => {
          setCardMode('card');
          setCardId(cards[0]?.id || '');
          setManualName('');
          setStartDate(todayKey());
          setUseDeadlineDate(true);
          setDeadlineDate(todayKey());
          setMonthsWindow('3');
          setTierTarget('');
          setTierReward('');
          setSpentInput('0.00');
          setConfirmDelete(null);
          setEditorEntryId(null);
          setEditorOpen(true);
        }}
      >
        + Add tracked card
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

        <div style={{ display: 'flex', gap: 10 }}>
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
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Tier spend target ($)</label>
            <input
              className="ll-control"
              value={tierTarget}
              onChange={(e) => setTierTarget(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 3000"
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Tier reward text</label>
            <input
              className="ll-control"
              value={tierReward}
              onChange={(e) => setTierReward(e.target.value)}
              placeholder="e.g. 90k miles"
            />
          </div>
        </div>

        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => setEditorOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const targetCents = parseCents(tierTarget);
              if (!(targetCents > 0)) return;
              const rewardText = (tierReward || '').trim() || 'Bonus';
              const spentCents = parseCents(spentInput);
              if (!(spentCents >= 0)) return;
              if (editorEntryId) {
                // Editing top-level fields and first tier.
                const updatedEntries = entries.map((x) => {
                  if (x.id !== editorEntryId) return x;
                  const existingTiers = x.tiers || [];
                  const first = existingTiers[0];
                  const updatedFirst: SubTrackerTier = first
                    ? { ...first, spendTargetCents: targetCents, rewardText }
                    : { id: uid(), spendTargetCents: targetCents, rewardText };
                  const newTiers = [updatedFirst, ...existingTiers.slice(1)];
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
                const tier: SubTrackerTier = { id: uid(), spendTargetCents: targetCents, rewardText };
                const entry: SubTrackerEntry = {
                  id: uid(),
                  cardRef: cardMode === 'card' ? { type: 'card', cardId } : { type: 'manual', name: manualName.trim() || 'Card' },
                  startDate: startDate || todayKey(),
                  deadlineDate: useDeadlineDate ? deadlineDate || todayKey() : undefined,
                  monthsWindow: useDeadlineDate ? undefined : Math.max(1, parseInt(monthsWindow || '1', 10) || 1),
                  tiers: [tier],
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

