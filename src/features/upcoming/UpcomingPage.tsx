import { useMemo, useState } from 'react';
import { calcFinalNetCashCents, formatCents, parseCents } from '../../state/calc';
import { useLedgerStore } from '../../state/store';
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

export function UpcomingPage() {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);

  const [windowDays, setWindowDays] = useState(() => loadUpcomingWindowPreference().days);
  const [expectedCosts, setExpectedCosts] = useState(() => loadExpectedCosts());
  const [expectedIncome, setExpectedIncome] = useState(() => loadExpectedIncome());

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

  return (
    <div className="tab-panel active" id="upcomingContent">
      <p className="section-title">Upcoming Cashflow</p>
      <div className="settings-section">
        <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--muted)', marginBottom: 6 }}>Time window</label>
        <select
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
        </select>
      </div>

      <div className="card">
        <div className="summary-kv">
          <span className="k">Current Net Cash</span>
          <span className="v">{formatCents(totals.finalNetCashCents)}</span>
        </div>
        <div className="summary-kv">
          <span className="k">Expected costs in window</span>
          <span className="v">{formatCents(totalExpectedCostsCents)}</span>
        </div>
        <div className="summary-kv">
          <span className="k">Expected income in window</span>
          <span className="v">{formatCents(totalExpectedIncomeCents)}</span>
        </div>
        <div className="summary-kv">
          <span className="k">Projected balance</span>
          <span className="v">{formatCents(projectedBalanceCents)}</span>
        </div>
      </div>

      <p className="section-title" style={{ marginTop: 24 }}>
        Expected Income
      </p>
      {incomeInWindow.map((i) => (
        <div className="card" key={i.id}>
          <div className="row">
            <span className="name">{i.title}</span>
            <span className="amount">{formatCents(i.amountCents || 0)}</span>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>{i.expectedDate}</div>
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
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>{i.expectedDate} • From recurring</div>
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
                  actions.markRecurringHandled(i.recurringId, i.expectedDate);
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
          const title = prompt('Income title') || '';
          const date = prompt('Expected date (YYYY-MM-DD)') || '';
          const amt = prompt('Amount ($)') || '';
          const amountCents = parseCents(amt);
          if (!title.trim() || !date.trim() || !(amountCents > 0)) return;
          const next = [...expectedIncome, { id: uid(), title: title.trim(), expectedDate: date.trim(), amountCents, status: 'expected' as const }];
          setExpectedIncome(next);
          saveExpectedIncome(next);
        }}
        style={{ marginTop: 8 }}
      >
        + Add expected income
      </button>

      <p className="section-title" style={{ marginTop: 24 }}>
        Expected Costs
      </p>
      {costsInWindow.map((c) => (
        <div className="card" key={c.id}>
          <div className="row">
            <span className="name">{c.title}</span>
            <span className="amount">{formatCents(c.amountCents || 0)}</span>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>{c.expectedDate}</div>
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
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>{c.dateKey} • From recurring</div>
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
                  actions.markRecurringHandled(c.recurringId, c.dateKey);
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
          const title = prompt('Cost title') || '';
          const date = prompt('Expected date (YYYY-MM-DD)') || '';
          const amt = prompt('Estimated amount ($)') || '';
          const amountCents = parseCents(amt);
          if (!title.trim() || !date.trim() || !(amountCents > 0)) return;
          const next = [...expectedCosts, { id: uid(), title: title.trim(), expectedDate: date.trim(), amountCents, status: 'expected' as const }];
          setExpectedCosts(next);
          saveExpectedCosts(next);
        }}
        style={{ marginTop: 8 }}
      >
        + Add expected cost
      </button>
    </div>
  );
}

