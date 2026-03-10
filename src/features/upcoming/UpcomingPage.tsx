import { useMemo, useState } from 'react';
import { calcFinalNetCashCents, formatCents, parseCents } from '../../state/calc';
import { useLedgerStore } from '../../state/store';
import { Select } from '../../ui/Select';
import {
  loadExpectedCosts,
  loadExpectedIncome,
  loadUpcomingWindowPreference,
  loadLastAdjustments,
  saveExpectedCosts,
  saveExpectedIncome,
  saveLastAdjustments,
  saveUpcomingWindowPreference,
  uid
} from '../../state/storage';
import { useDropdownCollapsed } from '../../state/DropdownStateContext';
import { getRecurringIncomeOccurrencesInWindow, getRecurringOccurrencesInWindow } from '../../state/calc';
import { loadLoans, getVisiblePaymentNowCents } from '../../state/storage';
import { loadPublicLoanSummary } from '../federalLoans/PublicLoanSummaryStore';
import { getLoanEstimatedPaymentNowMap, getDetectedAnnualIncomeCentsFromRecurring, getPrivatePaymentNowTotal } from '../loans/loanDerivation';

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
  const [lastAdjustments, setLastAdjustments] = useState(() => loadLastAdjustments());
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
     | {
         type: 'adjust-amount';
         direction: 'in' | 'out';
         label: string;
         originalCents: number;
         amount: string;
         error: string | null;
         source:
           | { kind: 'expected-income'; id: string }
           | { kind: 'recurring-income'; id: string }
           | { kind: 'expected-cost'; id: string }
           | { kind: 'recurring-cost'; recurringId: string; dateKey: string };
      }
  >({ type: 'none' });

  const totals = useMemo(() => calcFinalNetCashCents(data), [data]);

  const loanPaymentMap = useMemo(() => {
    const loansState = loadLoans();
    const detectedIncome = getDetectedAnnualIncomeCentsFromRecurring((data as any).recurring || []);
    return getLoanEstimatedPaymentNowMap(loansState.loans || [], detectedIncome);
  }, [data.recurring]);

  const totalVisiblePaymentNowCents = useMemo(() => {
    const loansState = loadLoans();
    const detectedIncome = getDetectedAnnualIncomeCentsFromRecurring((data as any).recurring || []);
    const derivedPrivate = getPrivatePaymentNowTotal(loansState.loans || [], detectedIncome);
    return getVisiblePaymentNowCents(derivedPrivate);
  }, [loanPaymentMap, data.recurring]);

  const recurringCosts = useMemo(
    () => getRecurringOccurrencesInWindow(data, windowDays, loanPaymentMap, totalVisiblePaymentNowCents),
    [data, windowDays, loanPaymentMap, totalVisiblePaymentNowCents]
  );
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
  const [incomeCollapsed, setIncomeCollapsed] = useDropdownCollapsed('upcoming_expected_income', true);
  const [costsCollapsed, setCostsCollapsed] = useDropdownCollapsed('upcoming_expected_costs', true);

  const today = todayKey();

  function getDaysLeft(dateISO: string): number | null {
    if (!dateISO) return null;
    const d = new Date(dateISO + 'T00:00:00');
    const t = new Date(today + 'T00:00:00');
    if (Number.isNaN(d.getTime()) || Number.isNaN(t.getTime())) return null;
    const diffMs = d.getTime() - t.getTime();
    return Math.round(diffMs / 86400000);
  }

  function formatDaysLeft(dateISO: string) {
    const diffDays = getDaysLeft(dateISO);
    if (diffDays == null) return '';
    if (diffDays >= 1) return `~${diffDays} days left`;
    return 'Overdue / Due very soon!';
  }

  const sortedIncomeInWindow = [...incomeInWindow].sort((a, b) => {
    const aDays = getDaysLeft(a.expectedDate || '') ?? 0;
    const bDays = getDaysLeft(b.expectedDate || '') ?? 0;
    const aVerySoon = aDays < 1;
    const bVerySoon = bDays < 1;
    if (aVerySoon !== bVerySoon) return aVerySoon ? -1 : 1;
    return aDays - bDays;
  });

  const sortedRecurringIncome = [...recurringIncome].sort((a, b) => {
    const aDays = getDaysLeft(a.expectedDate || '') ?? 0;
    const bDays = getDaysLeft(b.expectedDate || '') ?? 0;
    const aVerySoon = aDays < 1;
    const bVerySoon = bDays < 1;
    if (aVerySoon !== bVerySoon) return aVerySoon ? -1 : 1;
    return aDays - bDays;
  });

  const sortedCostsInWindow = [...costsInWindow].sort((a, b) => {
    const aDays = getDaysLeft(a.expectedDate || '') ?? 0;
    const bDays = getDaysLeft(b.expectedDate || '') ?? 0;
    const aVerySoon = aDays < 1;
    const bVerySoon = bDays < 1;
    if (aVerySoon !== bVerySoon) return aVerySoon ? -1 : 1;
    return aDays - bDays;
  });

  const sortedRecurringCosts = [...recurringCosts].sort((a, b) => {
    const aDays = getDaysLeft(a.dateKey || '') ?? 0;
    const bDays = getDaysLeft(b.dateKey || '') ?? 0;
    const aVerySoon = aDays < 1;
    const bVerySoon = bDays < 1;
    if (aVerySoon !== bVerySoon) return aVerySoon ? -1 : 1;
    return aDays - bDays;
  });

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
        onClick={() => setIncomeCollapsed(!incomeCollapsed)}
      >
        <span className="section-header-left" style={{ color: 'var(--green)' }}>
          Expected Income
        </span>
        <span className="chevron">{incomeCollapsed ? '▸' : '▾'}</span>
      </div>
      {!incomeCollapsed ? (
        <>
          {sortedIncomeInWindow.map((i) => (
            <div className="card" key={i.id}>
              <div className="row">
                <span className="name">{i.title}</span>
                <span className="amount" style={{ color: 'var(--green)' }}>
                  {formatCents(i.amountCents || 0)}
                </span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>{formatDaysLeft(i.expectedDate)}</div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                    onClick={() => {
                      const initialCents = i.amountCents || 0;
                      const last = lastAdjustments[i.id];
                      setModal({
                        type: 'adjust-amount',
                        direction: 'in',
                        label: i.title,
                        originalCents: initialCents,
                        amount: (initialCents / 100).toFixed(2),
                        error: null,
                        source: { kind: 'expected-income', id: i.id, lastCents: typeof last === 'number' ? last : undefined }
                      } as any);
                    }}
                >
                  Move to Pending Inbound
                </button>
              </div>
            </div>
          ))}
          {sortedRecurringIncome.map((i) => (
            <div className="card" key={i.id}>
              <div className="row">
                <span className="name">{i.title}</span>
                <span className="amount" style={{ color: 'var(--green)' }}>
                  {formatCents(i.amountCents || 0)}
                </span>
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
                      const initialCents = i.amountCents || 0;
                      const last = lastAdjustments[i.id];
                      setModal({
                        type: 'adjust-amount',
                        direction: 'in',
                        label: i.title,
                        originalCents: initialCents,
                        amount: (initialCents / 100).toFixed(2),
                        error: null,
                        source: { kind: 'recurring-income', id: i.id, lastCents: typeof last === 'number' ? last : undefined }
                      } as any);
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
        onClick={() => setCostsCollapsed(!costsCollapsed)}
      >
        <span className="section-header-left" style={{ color: 'var(--red)' }}>
          Expected Costs
        </span>
        <span className="chevron">{costsCollapsed ? '▸' : '▾'}</span>
      </div>
      {!costsCollapsed ? (
        <>
          {sortedCostsInWindow.map((c) => (
            <div className="card" key={c.id}>
              <div className="row">
                <span className="name">{c.title}</span>
                <span className="amount" style={{ color: 'var(--red)' }}>
                  {formatCents(c.amountCents || 0)}
                </span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>{formatDaysLeft(c.expectedDate)}</div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                    onClick={() => {
                      const initialCents = c.amountCents || 0;
                      const last = lastAdjustments[c.id];
                      setModal({
                        type: 'adjust-amount',
                        direction: 'out',
                        label: c.title,
                        originalCents: initialCents,
                        amount: (initialCents / 100).toFixed(2),
                        error: null,
                        source: { kind: 'expected-cost', id: c.id, lastCents: typeof last === 'number' ? last : undefined }
                      } as any);
                    }}
                >
                  Move to Pending Outbound
                </button>
              </div>
            </div>
          ))}
          {sortedRecurringCosts.map((c) => (
            <div className="card" key={c.recurringId + ':' + c.dateKey}>
              <div className="row">
                <span className="name">{c.recurringName}</span>
                <span className="amount" style={{ color: 'var(--red)' }}>
                  {formatCents(c.amountCents || 0)}
                </span>
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
                      const initialCents = c.amountCents || 0;
                      const key = `${c.recurringId}:${c.dateKey}`;
                      const last = lastAdjustments[key];
                      setModal({
                        type: 'adjust-amount',
                        direction: 'out',
                        label: c.recurringName,
                        originalCents: initialCents,
                        amount: (initialCents / 100).toFixed(2),
                        error: null,
                        source: {
                          kind: 'recurring-cost',
                          recurringId: c.recurringId,
                          dateKey: c.dateKey,
                          lastCents: typeof last === 'number' ? last : undefined
                        }
                      } as any);
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
      {modal.type === 'adjust-amount' ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Adjust amount?</h3>
            <p style={{ color: 'var(--muted)', marginTop: 0 }}>
              {(() => {
                const m: any = modal;
                const hasLast = typeof m.source?.lastCents === 'number';
                if (!hasLast) {
                  return `You estimated a value of ${formatCents(modal.originalCents)}. Would you like to adjust it before moving to Pending?`;
                }
                return `You estimated a value of ${formatCents(
                  modal.originalCents
                )}. Last time you adjusted this to ${formatCents(
                  m.source.lastCents
                )}. Would you like to use that value again?`;
              })()}
            </p>
            <div className="field">
              <label>Amount ($)</label>
              <input
                value={modal.amount}
                inputMode="decimal"
                onChange={(e) => {
                  const value = e.target.value;
                  let error: string | null = null;
                  const cents = parseCents(value || '0');
                  if (Number.isNaN(cents) || cents < 0) {
                    error = 'Enter a valid non-negative amount.';
                  }
                  setModal({ ...modal, amount: value, error });
                }}
                placeholder="0.00"
              />
              {modal.error ? (
                <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: 4 }}>{modal.error}</div>
              ) : null}
            </div>
            <div className="btn-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {typeof (modal as any).source?.lastCents === 'number' ? (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const m: any = modal;
                      const last = m.source.lastCents as number;
                      setModal({ ...m, amount: (last / 100).toFixed(2), error: null });
                    }}
                  >
                    Use {formatCents((modal as any).source.lastCents)}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const m: any = modal;
                      setModal({ ...m, amount: (m.originalCents / 100).toFixed(2), error: null });
                    }}
                  >
                    Edit manually
                  </button>
                </>
              ) : null}
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModal({ type: 'none' })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!!modal.error}
                onClick={() => {
                  const cents = parseCents((modal as any).amount || '0');
                  if (Number.isNaN(cents) || cents < 0) return;

                  const m: any = modal;
                  const source: any = m.source;

                  if (source.kind === 'expected-income') {
                    const item = (expectedIncome as any[]).find((x) => x.id === source.id);
                    if (item) {
                      actions.addPendingInbound({ label: item.title, amountCents: cents, depositTo: 'bank' });
                      const next = (expectedIncome as any[]).map((x) =>
                        x.id === item.id ? { ...x, status: 'moved_to_pending' as const } : x
                      );
                      setExpectedIncome(next as any);
                      saveExpectedIncome(next as any);
                    }
                  } else if (source.kind === 'recurring-income') {
                    const item = (recurringIncome as any[]).find((x) => x.id === source.id);
                    if (item) {
                      actions.addPendingInbound({
                        label: item.title,
                        amountCents: cents,
                        depositTo: 'bank',
                        targetBankId: item.paymentTargetId || undefined,
                        recurringId: item.recurringId,
                        recurringDateKey: item.expectedDate
                      });
                    }
                  } else if (source.kind === 'expected-cost') {
                    const item = (expectedCosts as any[]).find((x) => x.id === source.id);
                    if (item) {
                      actions.addPendingOutbound({
                        label: item.title,
                        amountCents: cents,
                        meta: {
                          source: 'upcoming',
                          addToSpendingOnConfirm: true,
                          originalCategory: undefined,
                          originalSubcategory: undefined,
                          originalTitle: item.title,
                          originalNotes: item.notes,
                          originalAccount: undefined
                        }
                      });
                      const next = (expectedCosts as any[]).map((x) =>
                        x.id === item.id ? { ...x, status: 'moved_to_pending' as const } : x
                      );
                      setExpectedCosts(next as any);
                      saveExpectedCosts(next as any);
                    }
                  } else if (source.kind === 'recurring-cost') {
                    const item = (recurringCosts as any[]).find(
                      (x) => x.recurringId === source.recurringId && x.dateKey === source.dateKey
                    );
                    if (item) {
                      const rec = ((data as any).recurring || []).find(
                        (r: any) => r.id === item.recurringId
                      );
                      const baseMeta =
                        rec &&
                        rec.investingTransferEnabled &&
                        rec.investingTargetAccountId &&
                        rec.investingTargetType
                          ? {
                              kind: 'transfer',
                              investingType: rec.investingTargetType,
                              investingAccountId: rec.investingTargetAccountId
                            }
                          : undefined;
                      let privateLoanBreakdownCents: Record<string, number> | undefined;
                      if (rec?.useLoanEstimatedPayment && cents > 0) {
                        const loansState = loadLoans();
                        const detectedIncome = getDetectedAnnualIncomeCentsFromRecurring((data as any).recurring || []);
                        const loanPaymentMap = getLoanEstimatedPaymentNowMap(loansState.loans || [], detectedIncome);
                        if (rec.linkedLoanId) {
                          privateLoanBreakdownCents = { [rec.linkedLoanId]: cents };
                        } else {
                          const privateLoans = (loansState.loans || []).filter(
                            (l: any) => l.category === 'private' && !l.excludeFromCurrentPayment
                          );
                          privateLoanBreakdownCents = {};
                          for (const l of privateLoans) {
                            const amt = loanPaymentMap[l.id];
                            if (amt != null && amt > 0) privateLoanBreakdownCents![l.id] = amt;
                          }
                        }
                      }
                      const publicSummary = loadPublicLoanSummary();
                      const publicPortionCents =
                        rec?.useLoanEstimatedPayment && !rec.linkedLoanId
                          ? (() => {
                              const estimated = publicSummary.estimatedMonthlyPaymentCents ?? 0;
                              const current = publicSummary.currentPaymentCents ?? null;
                              // Use the same monthly public payment concept as LoansPage summary:
                              // prefer currentPaymentCents when set and > 0, otherwise fall back to estimatedMonthlyPaymentCents.
                              if (current != null && current > 0) return current;
                              return estimated > 0 ? estimated : 0;
                            })()
                          : 0;
                      const meta = {
                        ...(baseMeta || {}),
                        source: 'upcoming',
                        addToSpendingOnConfirm: true,
                        originalCategory: item.category,
                        originalSubcategory: item.subcategory,
                        originalTitle: item.recurringName,
                        originalNotes: item.notes,
                        originalAccount:
                          item.paymentSource && item.paymentTargetId
                            ? `${item.paymentSource}:${item.paymentTargetId}`
                            : item.paymentSource || undefined,
                        ...(privateLoanBreakdownCents && Object.keys(privateLoanBreakdownCents).length > 0
                          ? { privateLoanBreakdownCents }
                          : {}),
                        ...(publicPortionCents > 0 ? { publicPortionCents } : {}),
                        totalVisiblePaymentNowCents: cents
                      };
                      actions.addPendingOutbound({
                        label: item.recurringName,
                        amountCents: cents,
                        recurringId: item.recurringId,
                        recurringDateKey: item.dateKey,
                        paymentSource: item.paymentSource as any,
                        paymentTargetId: item.paymentTargetId,
                        splitTotalCents: item.isSplit ? item.fullAmountCents : undefined,
                        myPortionCents: item.isSplit ? cents : undefined,
                        category: item.category,
                        subcategory: item.subcategory,
                        meta
                      });
                    }
                  }

                  // persist last adjustment for this item
                  try {
                    let key: string | null = null;
                    if (source.kind === 'expected-income' || source.kind === 'recurring-income' || source.kind === 'expected-cost') {
                      key = source.id;
                    } else if (source.kind === 'recurring-cost') {
                      key = `${source.recurringId}:${source.dateKey}`;
                    }
                    if (key) {
                      const nextMap = { ...lastAdjustments, [key]: cents };
                      setLastAdjustments(nextMap);
                      saveLastAdjustments(nextMap);
                    }
                  } catch (_) {}

                  setModal({ type: 'none' });
                }}
              >
                Move
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

