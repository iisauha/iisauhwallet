import { useMemo, useState } from 'react';
import { calcFinalNetCashCents, formatCents, parseCents } from '../../state/calc';
import { useLedgerStore } from '../../state/store';
import { Select } from '../../ui/Select';
import {
  loadExpectedCosts,
  loadExpectedIncome,
  loadUpcomingWindowPreference,
  saveExpectedCosts,
  saveExpectedIncome,
  saveUpcomingWindowPreference,
  uid
} from '../../state/storage';
import { getRecurringIncomeOccurrencesInWindow, getRecurringOccurrencesInWindow } from '../../state/calc';

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function UpcomingPage() {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);

  const [windowDays, setWindowDays] = useState(() => loadUpcomingWindowPreference().days);
  const [expectedCosts, setExpectedCosts] = useState(() => loadExpectedCosts());
  const [expectedIncome, setExpectedIncome] = useState(() => loadExpectedIncome());
  const [modal, setModal] = useState<
    | { type: 'none' }
    | {
        type: 'add-expected';
        kind: 'income' | 'cost';
        title: string;
        date: string;
        notes: string;
        useRange: boolean;
        amount: string;
        minAmount: string;
        maxAmount: string;
      }
  >({ type: 'none' });

  const totals = useMemo(() => calcFinalNetCashCents(data), [data]);

  const recurringCosts = useMemo(() => getRecurringOccurrencesInWindow(data, windowDays), [data, windowDays]);
  const recurringIncome = useMemo(() => getRecurringIncomeOccurrencesInWindow(data, windowDays), [data, windowDays]);

  const costsInWindow = useMemo(() => {
    return expectedCosts.filter((c) => (c.status === 'expected' || c.status == null) && c.expectedDate);
  }, [expectedCosts]);
  const incomeInWindow = useMemo(() => {
    return expectedIncome.filter((i) => (i.status === 'expected' || i.status == null) && i.expectedDate);
  }, [expectedIncome]);

  const totalExpectedCostsCents = useMemo(() => {
    const mid = (min: number | null, max: number | null, amt: number) => {
      if (min != null && max != null) return Math.round((min + max) / 2);
      return amt;
    };
    let total = 0;
    recurringCosts.forEach((o) => {
      total += mid(o.minCents, o.maxCents, o.amountCents);
    });
    costsInWindow.forEach((c) => {
      total += mid((c.minCents as any) ?? null, (c.maxCents as any) ?? null, c.amountCents || 0);
    });
    return total;
  }, [recurringCosts, costsInWindow]);

  const totalExpectedIncomeCents = useMemo(() => {
    return incomeInWindow.reduce((s, i) => s + (i.amountCents || 0), 0) + recurringIncome.reduce((s, i) => s + (i.amountCents || 0), 0);
  }, [incomeInWindow, recurringIncome]);

  const projectedBalanceCents = totals.finalNetCashCents - totalExpectedCostsCents + totalExpectedIncomeCents;
  const statusOk = projectedBalanceCents >= 0;
  const [incomeCollapsed, setIncomeCollapsed] = useState(true);
  const [costsCollapsed, setCostsCollapsed] = useState(true);

  const today = todayKey();
  function formatDaysLeft(dateISO: string) {
    if (!dateISO) return '';
    const d = new Date(dateISO + 'T00:00:00');
    const t = new Date(today + 'T00:00:00');
    if (Number.isNaN(d.getTime()) || Number.isNaN(t.getTime())) return '';
    const diffMs = d.getTime() - t.getTime();
    const diffDays = Math.round(diffMs / 86400000);
    if (diffDays >= 1) return `~${diffDays} days left`;
    return 'Overdue / Due very soon!';
  }

  return (
    <div className="tab-panel active" id="upcomingContent">
      <p className="section-title">Upcoming Cashflow</p>
      <div className="settings-section">
        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--muted)', marginBottom: 6 }}>Time window</label>
        <Select
          value={String(windowDays)}
          onChange={(e) => {
            const v = e.target.value === 'custom' ? windowDays : parseInt(e.target.value, 10);
            const days = Math.min(365, Math.max(1, isNaN(v) ? 30 : v));
            setWindowDays(days);
            saveUpcomingWindowPreference({ days });
          }}
        >
          <option value="14">Next 14 days</option>
          <option value="21">Next 21 days</option>
          <option value="30">Next 30 days</option>
          <option value="45">Next 45 days</option>
        </Select>
      </div>

      <div
        className="section-header"
        style={{ marginTop: 24 }}
        onClick={() => setIncomeCollapsed((v) => !v)}
      >
        <span className="section-header-left" style={{ color: 'var(--green)' }}>
          Expected Income
        </span>
        <span className="chevron">{incomeCollapsed ? '▸' : '▾'}</span>
      </div>
      {!incomeCollapsed ? (
        <>
          {incomeInWindow.map((i) => (
            <div className="card" key={i.id}>
              <div className="row">
                <span className="name">{i.title}</span>
                <span className="amount">{formatCents(i.amountCents || 0)}</span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>{formatDaysLeft(i.expectedDate)}</div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    actions.addPendingInbound({ label: i.title, amountCents: i.amountCents || 0, depositTo: 'bank' });
                    const next = expectedIncome.map((x) => (x.id === i.id ? { ...x, status: 'moved_to_pending' as const } : x));
                    setExpectedIncome(next);
                    saveExpectedIncome(next);
                  }}
                >
                  Move to Pending Inbound
                </button>
              </div>
            </div>
          ))}
          {recurringIncome.map((i) => (
            <div className="card" key={i.id}>
              <div className="row">
                <span className="name">{i.title}</span>
                <span className="amount">{formatCents(i.amountCents || 0)}</span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>
                {formatDaysLeft(i.expectedDate)} • From recurring
              </div>
              {!i.autoPay ? (
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      actions.addPendingInbound({
                        label: i.title,
                        amountCents: i.amountCents || 0,
                        depositTo: 'bank',
                        targetBankId: i.paymentTargetId || undefined,
                        recurringId: i.recurringId,
                        recurringDateKey: i.expectedDate
                      });
                    }}
                  >
                    Move to Pending Inbound
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-add"
            onClick={() => {
              setModal({
                type: 'add-expected',
                kind: 'income',
                title: '',
                date: todayKey(),
                notes: '',
                useRange: false,
                amount: '',
                minAmount: '',
                maxAmount: ''
              });
            }}
            style={{ marginTop: 8 }}
          >
            + Add expected income
          </button>
        </>
      ) : null}

      <div
        className="section-header"
        style={{ marginTop: 24 }}
        onClick={() => setCostsCollapsed((v) => !v)}
      >
        <span className="section-header-left" style={{ color: 'var(--red)' }}>
          Expected Costs
        </span>
        <span className="chevron">{costsCollapsed ? '▸' : '▾'}</span>
      </div>
      {!costsCollapsed ? (
        <>
          {costsInWindow.map((c) => (
            <div className="card" key={c.id}>
              <div className="row">
                <span className="name">{c.title}</span>
                <span className="amount">{formatCents(c.amountCents || 0)}</span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>{formatDaysLeft(c.expectedDate)}</div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    actions.addPendingOutbound({ label: c.title, amountCents: c.amountCents || 0 });
                    const next = expectedCosts.map((x) => (x.id === c.id ? { ...x, status: 'moved_to_pending' as const } : x));
                    setExpectedCosts(next);
                    saveExpectedCosts(next);
                  }}
                >
                  Move to Pending Outbound
                </button>
              </div>
            </div>
          ))}
          {recurringCosts.map((c) => (
            <div className="card" key={c.recurringId + ':' + c.dateKey}>
              <div className="row">
                <span className="name">{c.recurringName}</span>
                <span className="amount">{formatCents(c.amountCents || 0)}</span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>
                {formatDaysLeft(c.dateKey)} • From recurring
              </div>
              {!c.autoPay ? (
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      actions.addPendingOutbound({
                        label: c.recurringName,
                        amountCents: c.amountCents || 0,
                        recurringId: c.recurringId,
                        recurringDateKey: c.dateKey,
                        paymentSource: c.paymentSource as any,
                        paymentTargetId: c.paymentTargetId,
                        splitTotalCents: c.isSplit ? c.fullAmountCents : undefined,
                        myPortionCents: c.isSplit ? c.amountCents : undefined,
                        category: c.category,
                        subcategory: c.subcategory
                      });
                    }}
                  >
                    Move to Pending Outbound
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-add"
            onClick={() => {
              setModal({
                type: 'add-expected',
                kind: 'cost',
                title: '',
                date: todayKey(),
                notes: '',
                useRange: false,
                amount: '',
                minAmount: '',
                maxAmount: ''
              });
            }}
            style={{ marginTop: 8 }}
          >
            + Add expected cost
          </button>
        </>
      ) : null}
      <button
        type="button"
        className="btn btn-add"
        onClick={() => {
          setModal({
            type: 'add-expected',
            kind: 'cost',
            title: '',
            date: todayKey(),
            notes: '',
            useRange: false,
            amount: '',
            minAmount: '',
            maxAmount: ''
          });
        }}
        style={{ marginTop: 8 }}
      >
        + Add expected cost
      </button>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="summary-kv">
          <span className="k">Current Net Cash</span>
          <span className="v pos">{formatCents(totals.finalNetCashCents)}</span>
        </div>
        <div className="summary-kv">
          <span className="k">Expected costs in window</span>
          <span className="v upcoming-cost-amount">{formatCents(totalExpectedCostsCents)}</span>
        </div>
        <div className="summary-kv">
          <span className="k">Expected income in window</span>
          <span className="v upcoming-income-amount">{formatCents(totalExpectedIncomeCents)}</span>
        </div>
        <div className="summary-kv">
          <span className="k">Projected balance</span>
          <span className={projectedBalanceCents >= 0 ? 'v pos' : 'v neg'}>{formatCents(projectedBalanceCents)}</span>
        </div>
        <div style={{ marginTop: 10 }}>
          <span className={statusOk ? 'upcoming-status-ok' : 'upcoming-status-warn'}>
            {statusOk ? 'OK to pay' : 'May require additional funds'}
          </span>
        </div>
      </div>

      {modal.type === 'add-expected' ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{modal.kind === 'income' ? 'Add Expected Income' : 'Add Expected Cost'}</h3>
            <div className="field">
              <label>Title / Label</label>
              <input value={modal.title} onChange={(e) => setModal({ ...modal, title: e.target.value })} placeholder="e.g. Paycheck" />
            </div>
            <div className="toggle-row">
              <input
                type="checkbox"
                checked={modal.useRange}
                onChange={(e) => setModal({ ...modal, useRange: e.target.checked })}
                id="useRange"
              />
              <label htmlFor="useRange">Use Range</label>
            </div>

            {!modal.useRange ? (
              <div className="field">
                <label>Amount ($)</label>
                <input value={modal.amount} onChange={(e) => setModal({ ...modal, amount: e.target.value })} inputMode="decimal" placeholder="0.00" />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>Min Amount ($)</label>
                  <input value={modal.minAmount} onChange={(e) => setModal({ ...modal, minAmount: e.target.value })} inputMode="decimal" placeholder="0.00" />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Max Amount ($)</label>
                  <input value={modal.maxAmount} onChange={(e) => setModal({ ...modal, maxAmount: e.target.value })} inputMode="decimal" placeholder="0.00" />
                </div>
              </div>
            )}

            <div className="field">
              <label>Expected Date</label>
              <input type="date" value={modal.date} onChange={(e) => setModal({ ...modal, date: e.target.value })} />
            </div>

            <div className="field">
              <label>Notes (optional)</label>
              <textarea value={modal.notes} onChange={(e) => setModal({ ...modal, notes: e.target.value })} placeholder="Optional" />
            </div>

            {(() => {
              const titleOk = modal.title.trim().length > 0;
              const dateOk = modal.date.trim().length > 0;
              const amountOk = !modal.useRange ? parseCents(modal.amount) > 0 : parseCents(modal.minAmount) > 0 && parseCents(modal.maxAmount) > 0;
              const rangeOk = !modal.useRange ? true : parseCents(modal.maxAmount) >= parseCents(modal.minAmount);
              const canSave = titleOk && dateOk && amountOk && rangeOk;
              return (
                <div className="btn-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: 'none' })}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!canSave}
                    onClick={() => {
                      if (!canSave) return;
                      const title = modal.title.trim();
                      const expectedDate = modal.date.trim();
                      const notes = modal.notes.trim() || undefined;
                      const minCents = modal.useRange ? parseCents(modal.minAmount) : null;
                      const maxCents = modal.useRange ? parseCents(modal.maxAmount) : null;
                      const amountCents =
                        modal.useRange && minCents != null && maxCents != null ? Math.round((minCents + maxCents) / 2) : parseCents(modal.amount);

                      if (modal.kind === 'income') {
                        const next = [
                          ...expectedIncome,
                          {
                            id: uid(),
                            title,
                            expectedDate,
                            amountCents,
                            minCents: modal.useRange ? minCents : undefined,
                            maxCents: modal.useRange ? maxCents : undefined,
                            notes,
                            status: 'expected' as const
                          }
                        ];
                        setExpectedIncome(next);
                        saveExpectedIncome(next);
                      } else {
                        const next = [
                          ...expectedCosts,
                          {
                            id: uid(),
                            title,
                            expectedDate,
                            amountCents,
                            minCents: modal.useRange ? minCents : undefined,
                            maxCents: modal.useRange ? maxCents : undefined,
                            notes,
                            status: 'expected' as const
                          }
                        ];
                        setExpectedCosts(next);
                        saveExpectedCosts(next);
                      }
                      setModal({ type: 'none' });
                    }}
                  >
                    Save
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}

    </div>
  );
}

