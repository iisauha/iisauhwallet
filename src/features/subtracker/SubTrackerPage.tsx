import { useMemo, useState } from 'react';
import { formatCents, formatLongLocalDate, parseCents } from '../../state/calc';
import { useLedgerStore } from '../../state/store';
import { loadSubTracker, saveSubTracker, uid, type SubTrackerEntry, type SubTrackerTier } from '../../state/storage';
import { Select } from '../../ui/Select';

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

export function SubTrackerPage() {
  const data = useLedgerStore((s) => s.data);
  const cards = data.cards || [];

  const [tracker, setTracker] = useState(() => loadSubTracker());
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

  const cardNameById = useMemo(() => new Map(cards.map((c) => [c.id, c.name || 'Card'])), [cards]);

  function persist(next: any) {
    setTracker(next);
    saveSubTracker(next);
  }

  function entryDisplayName(e: SubTrackerEntry) {
    return e.cardRef.type === 'card' ? cardNameById.get(e.cardRef.cardId) || 'Card' : e.cardRef.name || 'Card';
  }

  const entries = (tracker.entries || []) as SubTrackerEntry[];

  return (
    <div className="tab-panel active" id="subTrackerContent">
      <p className="section-title">SUB Tracker</p>

      <div className="card">
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

        <div className="btn-row" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="btn btn-add"
            onClick={() => {
              const targetCents = parseCents(tierTarget);
              if (!(targetCents > 0)) return;
              const rewardText = (tierReward || '').trim() || 'Bonus';
              const entryId = uid();
              const tier: SubTrackerTier = { id: uid(), spendTargetCents: targetCents, rewardText };
              const entry: SubTrackerEntry = {
                id: entryId,
                cardRef: cardMode === 'card' ? { type: 'card', cardId } : { type: 'manual', name: manualName.trim() || 'Card' },
                startDate: startDate || todayKey(),
                deadlineDate: useDeadlineDate ? deadlineDate || todayKey() : undefined,
                monthsWindow: useDeadlineDate ? undefined : Math.max(1, parseInt(monthsWindow || '1', 10) || 1),
                tiers: [tier],
                spendCents: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              persist({ version: 1, entries: [entry, ...entries] });
              setTierTarget('');
              setTierReward('');
            }}
          >
            + Add tracked card
          </button>
        </div>
      </div>

      {entries.map((e) => {
        const name = entryDisplayName(e);
        const start = toDate(e.startDate);
        const deadline = e.deadlineDate ? toDate(e.deadlineDate) : e.monthsWindow ? toDate(addMonthsFromStart(e.startDate, e.monthsWindow)) : new Date(NaN);
        const now = new Date();
        const spendCents = typeof e.spendCents === 'number' ? e.spendCents : 0;

        const daysRemaining = Number.isNaN(deadline.getTime()) ? null : Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
        const elapsedDays = Number.isNaN(start.getTime()) ? null : Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86400000));

        const tiers = Array.isArray(e.tiers) ? e.tiers.slice().sort((a, b) => (a.spendTargetCents || 0) - (b.spendTargetCents || 0)) : [];
        const nextTier = tiers.find((t) => spendCents < (t.spendTargetCents || 0)) || tiers[tiers.length - 1] || null;

        const remainingCents = nextTier ? Math.max(0, (nextTier.spendTargetCents || 0) - spendCents) : 0;
        const monthsRemaining = daysRemaining == null ? null : Math.max(0.01, daysRemaining / 30.44);
        const monthsSinceStart = elapsedDays == null ? null : Math.max(0.01, elapsedDays / 30.44);

        const requiredPace = monthsRemaining == null ? null : remainingCents / monthsRemaining;
        const actualPace = monthsSinceStart == null ? null : spendCents / monthsSinceStart;
        const onPace = requiredPace == null || actualPace == null ? true : actualPace >= requiredPace;

        return (
          <div className="card" key={e.id}>
            <div className="row">
              <span className="name">{name}</span>
              <span className="amount">{formatCents(spendCents)}</span>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>
              Start {formatLongLocalDate(e.startDate)}
              {e.deadlineDate ? ` • Deadline ${formatLongLocalDate(e.deadlineDate)}` : e.monthsWindow ? ` • Window ${e.monthsWindow} mo` : ''}
              {daysRemaining != null ? ` • ~${Math.max(0, daysRemaining)} days remaining` : ''}
            </div>

            <div className="field" style={{ marginTop: 10 }}>
              <label>Spent so far ($)</label>
              <input
                className="ll-control"
                value={(spendCents / 100).toFixed(2)}
                onChange={(ev) => {
                  const nextAmount = parseCents(ev.target.value);
                  const updatedEntries = entries.map((x) =>
                    x.id === e.id ? { ...x, spendCents: nextAmount, updatedAt: new Date().toISOString() } : x
                  );
                  persist({ version: 1, entries: updatedEntries });
                }}
                inputMode="decimal"
              />
            </div>

            <div className="card" style={{ marginTop: 10, marginBottom: 0, background: 'rgba(148, 163, 184, 0.06)' }}>
              <div className="row">
                <span className="name" style={{ fontWeight: 600 }}>
                  Pace
                </span>
                <span className="amount" style={{ fontSize: '1rem', color: onPace ? 'var(--green)' : 'var(--red)' }}>
                  {onPace ? 'On pace' : 'Behind'}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                <div className="row" style={{ fontSize: '0.95rem' }}>
                  <span style={{ color: 'var(--muted)' }}>Required pace</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {requiredPace == null ? '—' : `${formatCents(Math.round(requiredPace))} / month`}
                  </span>
                </div>
                <div className="row" style={{ fontSize: '0.95rem' }}>
                  <span style={{ color: 'var(--muted)' }}>Your pace</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {actualPace == null ? '—' : `${formatCents(Math.round(actualPace))} / month`}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem', fontWeight: 600, marginBottom: 8 }}>Tiers</div>
              {tiers.length ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {tiers.map((t) => {
                    const target = t.spendTargetCents || 0;
                    const pct = target > 0 ? clamp(spendCents / target, 0, 1) : 0;
                    const remaining = Math.max(0, target - spendCents);
                    return (
                      <div key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <div className="row">
                          <span className="name" style={{ fontWeight: 600 }}>
                            {formatCents(Math.min(spendCents, target))} / {formatCents(target)}
                          </span>
                          <span style={{ color: 'var(--muted)' }}>{t.rewardText || 'Bonus'}</span>
                        </div>
                        <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>Remaining: {formatCents(remaining)}</div>
                        <div className="ll-progress" style={{ marginTop: 8 }}>
                          <div className="ll-progress-bar" style={{ width: `${Math.round(pct * 100)}%` }} />
                        </div>
                        <div className="btn-row" style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() =>
                              setConfirmDelete({
                                kind: 'tier',
                                entryId: e.id,
                                tierId: t.id,
                                label: `${name} → ${formatCents(target)} (${t.rewardText || 'Bonus'})`
                              })
                            }
                          >
                            Delete tier
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: 'var(--muted)' }}>No tiers.</div>
              )}
            </div>

            <div className="btn-row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setConfirmDelete({ kind: 'entry', entryId: e.id, label: name })}
              >
                Delete tracked card
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
    </div>
  );
}

