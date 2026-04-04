import { useEffect, useMemo, useRef, useState } from 'react';
import { IconPlus } from '../../ui/icons';
import { calcFinalNetCashCents, formatCents, parseCents, toLocalDateKey } from '../../state/calc';
import { useContentGuard } from '../../state/useContentGuard';
import { useLedgerStore } from '../../state/store';
import { Select } from '../../ui/Select';
import { sortByRecent, recordSelections } from '../../state/recentSelections';
import {
  loadExpectedCosts,
  loadExpectedIncome,
  loadUpcomingWindowPreference,
  loadLastAdjustments,
  saveExpectedCosts,
  saveExpectedIncome,
  saveLastAdjustments,
  saveUpcomingWindowPreference,
  uid,
  loadInvesting,
  loadUpcomingDismissedOccurrences,
  dismissUpcomingOccurrence,
  type HysaAccount
} from '../../state/storage';
import { useDropdownCollapsed } from '../../state/DropdownStateContext';
import { getRecurringIncomeOccurrencesInWindow, getRecurringOccurrencesInWindow } from '../../state/calc';
import { loadLoans, getVisiblePaymentNowCents } from '../../state/storage';
import { loadPublicLoanSummary } from '../federalLoans/PublicLoanSummaryStore';
import { getLoanEstimatedPaymentNowMap, getDetectedAnnualIncomeCentsFromRecurring, getPrivatePaymentNowTotal } from '../loans/loanDerivation';
import { useDialog } from '../../ui/DialogProvider';
import { scheduleSnapCorrection } from '../../ui/carouselSnap';
import { computeRewardDeltaForPurchase, type RewardDelta } from '../rewards/rewardMatching';
import { createPortal } from 'react-dom';


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
  const contentGuard = useContentGuard();
  const { showConfirm } = useDialog();

  const [windowDays, setWindowDays] = useState(() => loadUpcomingWindowPreference().days);
  const [customDaysInput, setCustomDaysInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [expectedCosts, setExpectedCosts] = useState(() => loadExpectedCosts());
  const [expectedIncome, setExpectedIncome] = useState(() => loadExpectedIncome());
  const [lastAdjustments, setLastAdjustments] = useState(() => loadLastAdjustments());
  const [dismissedOccurrences, setDismissedOccurrences] = useState(() => loadUpcomingDismissedOccurrences());
  const [incomeCarouselIdx, setIncomeCarouselIdx] = useState(0);
  const [costsCarouselIdx, setCostsCarouselIdx] = useState(0);
  const [showAllIncome, setShowAllIncome] = useState(false);
  const [showAllCosts, setShowAllCosts] = useState(false);
  const incomeCarouselRef = useRef<HTMLDivElement>(null);
  const costsCarouselRef = useRef<HTMLDivElement>(null);

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
        targetBankId: string;
        targetHysaId: string;
        hysaSubBucket: 'liquid' | 'reserved';
        paymentSource: 'bank' | 'card' | '';
        paymentTargetId: string;
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

  const [rewardPopup, setRewardPopup] = useState<null | {
    rewardType: 'cashback' | 'miles' | 'points';
    cardId: string;
    cardName: string;
    deltaLabel: string;
    computedDelta: number;
    newBalanceLabel: string;
    newBalance: number;
    currentBalance: number;
  }>(null);
  const [rewardMode, setRewardMode] = useState<'computed' | 'manual'>('computed');
  const [rewardManualStr, setRewardManualStr] = useState('');

  const [splitInboundPopup, setSplitInboundPopup] = useState<null | {
    title: string;
    fullAmountCents: number;
    userPortionCents: number;
    reimbursementCents: number;
    depositTo: 'bank' | 'hysa';
    targetBankId: string;
    targetHysaId: string;
    hysaSubBucket: 'liquid' | 'reserved';
  }>(null);

  useEffect(() => {
    if (!rewardPopup) return;
    setRewardMode('computed');
    setRewardManualStr('');
  }, [rewardPopup]);

  const today = todayKey();

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

  const recurringFilterOpts = useMemo(
    () => ({
      pendingIn: data.pendingIn || [],
      pendingOut: data.pendingOut || [],
      dismissedKeys: dismissedOccurrences,
      maxPastDays: 90
    }),
    [data.pendingIn, data.pendingOut, dismissedOccurrences]
  );

  const recurringCosts = useMemo(
    () =>
      getRecurringOccurrencesInWindow(
        data,
        windowDays,
        loanPaymentMap,
        totalVisiblePaymentNowCents,
        recurringFilterOpts
      ),
    [data, windowDays, loanPaymentMap, totalVisiblePaymentNowCents, recurringFilterOpts]
  );
  const recurringIncome = useMemo(
    () => getRecurringIncomeOccurrencesInWindow(data, windowDays, recurringFilterOpts),
    [data, windowDays, recurringFilterOpts]
  );

  const costsInWindow = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() + windowDays);
    const endKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    return expectedCosts.filter((c) =>
      (c.status === 'expected' || c.status == null) && c.expectedDate && c.expectedDate <= endKey
    );
  }, [expectedCosts, windowDays]);

  const incomeInWindow = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() + windowDays);
    const endKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    return expectedIncome.filter((i) =>
      (i.status === 'expected' || i.status == null) && i.expectedDate && i.expectedDate <= endKey
    );
  }, [expectedIncome, windowDays]);

  const totalExpectedCostsCents = useMemo(() => {
    const mid = (min: number | null, max: number | null, amt: number) => {
      if (min != null && max != null) return Math.round((min + max) / 2);
      return amt;
    };
    let total = 0;
    recurringCosts.forEach((o) => {
      if ((o.dateKey || '') >= today) total += mid(o.minCents, o.maxCents, o.amountCents);
    });
    costsInWindow.forEach((c) => {
      if ((c.expectedDate || '') >= today) {
        total += mid((c.minCents as any) ?? null, (c.maxCents as any) ?? null, c.amountCents || 0);
      }
    });
    return total;
  }, [recurringCosts, costsInWindow, today]);

  const totalExpectedIncomeCents = useMemo(() => {
    let total = 0;
    recurringIncome.forEach((i) => {
      if ((i.expectedDate || '') >= today) total += i.amountCents || 0;
    });
    incomeInWindow.forEach((i) => {
      if ((i.expectedDate || '') >= today) total += i.amountCents || 0;
    });
    return total;
  }, [incomeInWindow, recurringIncome, today]);

  const linkedHysaLiquidTotalCents = useMemo(() => {
    try {
      const inv = loadInvesting();
      let total = 0;
      (inv.accounts || []).forEach((acc: any) => {
        if (!acc || acc.type !== 'hysa') return;
        const h = acc as HysaAccount;
        if (!h.linkedCheckingBankId) return;
        const balance = typeof h.balanceCents === 'number' ? h.balanceCents : 0;
        const reservedRaw =
          typeof h.reservedSavingsCents === 'number' && h.reservedSavingsCents >= 0
            ? h.reservedSavingsCents
            : 0;
        const reserved = Math.min(reservedRaw, balance);
        const liquid = Math.max(0, balance - reserved);
        if (liquid > 0) total += liquid;
      });
      return total;
    } catch {
      return 0;
    }
  }, [data]);

  const displayedFinalNetCashCents =
    totals.finalNetCashCents + (linkedHysaLiquidTotalCents > 0 ? linkedHysaLiquidTotalCents : 0);
  const amountRemainingCents =
    displayedFinalNetCashCents + totalExpectedIncomeCents - totalExpectedCostsCents;
  const [incomeCollapsed, setIncomeCollapsed] = useDropdownCollapsed('upcoming_expected_income', true);
  const [costsCollapsed, setCostsCollapsed] = useDropdownCollapsed('upcoming_expected_costs', true);

  function getDaysLeft(dateISO: string): number | null {
    if (!dateISO) return null;
    const d = new Date(dateISO + 'T00:00:00');
    const t = new Date(today + 'T00:00:00');
    if (Number.isNaN(d.getTime()) || Number.isNaN(t.getTime())) return null;
    const diffMs = d.getTime() - t.getTime();
    return Math.round(diffMs / 86400000);
  }

  function formatExpectedTiming(dateISO: string) {
    const diffDays = getDaysLeft(dateISO);
    if (diffDays == null) return '';
    if (diffDays < 0) {
      const n = -diffDays;
      return n === 1 ? 'Expected 1 day ago' : `Expected ${n} days ago`;
    }
    if (diffDays === 0) return 'Due today';
    return `~${diffDays} days left`;
  }

  function sortKeyForDate(dateISO: string): number {
    const d = getDaysLeft(dateISO);
    return d ?? 9999;
  }

  const sortedIncomeInWindow = [...incomeInWindow].sort(
    (a, b) => sortKeyForDate(a.expectedDate || '') - sortKeyForDate(b.expectedDate || '')
  );

  const sortedRecurringIncome = [...recurringIncome].sort(
    (a, b) => sortKeyForDate(a.expectedDate || '') - sortKeyForDate(b.expectedDate || '')
  );

  const sortedCostsInWindow = [...costsInWindow].sort(
    (a, b) => sortKeyForDate(a.expectedDate || '') - sortKeyForDate(b.expectedDate || '')
  );

  const sortedRecurringCosts = [...recurringCosts].sort(
    (a, b) => sortKeyForDate(a.dateKey || '') - sortKeyForDate(b.dateKey || '')
  );

  const allIncomeItems = [
    ...sortedIncomeInWindow.map(i => ({ kind: 'expected' as const, item: i, days: sortKeyForDate(i.expectedDate || '') })),
    ...sortedRecurringIncome.map(i => ({ kind: 'recurring' as const, item: i, days: sortKeyForDate(i.expectedDate || '') }))
  ].sort((a, b) => a.days - b.days);

  const allCostItems = [
    ...sortedCostsInWindow.map(c => ({ kind: 'expected' as const, item: c, days: sortKeyForDate(c.expectedDate || '') })),
    ...sortedRecurringCosts.map(c => ({ kind: 'recurring' as const, item: c, days: sortKeyForDate(c.dateKey || '') }))
  ].sort((a, b) => a.days - b.days);

  const displayedIncome = showAllIncome ? allIncomeItems : allIncomeItems.slice(0, 5);
  const displayedCosts = showAllCosts ? allCostItems : allCostItems.slice(0, 5);

  return (
    <div className="tab-panel active" id="upcomingContent">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
        <p className="section-title page-title" style={{ margin: 0 }}>Upcoming</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {showCustomInput ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min={1}
                value={customDaysInput}
                onChange={(e) => setCustomDaysInput(e.target.value)}
                onBlur={() => {
                  const v = parseInt(customDaysInput, 10);
                  if (!isNaN(v) && v >= 1) {
                    setWindowDays(v);
                    saveUpcomingWindowPreference({ days: v });
                  }
                  setShowCustomInput(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = parseInt(customDaysInput, 10);
                    if (!isNaN(v) && v >= 1) {
                      setWindowDays(v);
                      saveUpcomingWindowPreference({ days: v });
                    }
                    setShowCustomInput(false);
                  }
                }}
                autoFocus
                placeholder="days"
                style={{ width: 56, padding: '6px 10px', fontSize: '0.82rem', borderRadius: 10, border: '1px solid var(--ui-border, var(--border))', background: 'var(--ui-surface-secondary, var(--surface))', color: 'var(--ui-primary-text, var(--text))', fontFamily: 'var(--app-font-family)', textAlign: 'center' }}
              />
              <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>days</span>
            </div>
          ) : (
            <Select
              className="upcoming-window-select"
              value={[7, 14, 21, 30, 60, 90].includes(windowDays) ? String(windowDays) : 'custom'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'custom') {
                  setShowCustomInput(true);
                  setCustomDaysInput(String(windowDays));
                } else {
                  const v = parseInt(val, 10);
                  setWindowDays(v);
                  saveUpcomingWindowPreference({ days: v });
                }
              }}
              style={{ minHeight: 'unset', padding: '6px 12px', fontSize: '0.85rem' }}
            >
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="21">21 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
              {![7, 14, 21, 30, 60, 90].includes(windowDays) ? (
                <option value="custom">{windowDays} days</option>
              ) : (
                <option value="custom">Custom…</option>
              )}
            </Select>
          )}
        </div>
      </div>

      <div
        className="section-header"
        style={{ marginTop: 0 }}
        onClick={() => setIncomeCollapsed(!incomeCollapsed)}
      >
        <span className="section-header-left" style={{ color: 'var(--ui-title-text, var(--green))' }}>
          Expected Income
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="chevron">{incomeCollapsed ? '▸' : '▾'}</span>
        </span>
      </div>
      {!incomeCollapsed ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button
              type="button"
              className="snapshot-add-btn"
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
                  maxAmount: '',
                  targetBankId: '',
                  targetHysaId: '',
                  hysaSubBucket: 'liquid',
                  paymentSource: '',
                  paymentTargetId: '',
                });
              }}
            >
              <IconPlus /> Add
            </button>
          </div>
          <div
            className="card-carousel"
            ref={incomeCarouselRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const rawIdx = el.scrollLeft / (el.clientWidth || 1);
              setIncomeCarouselIdx(Math.round(rawIdx));
              scheduleSnapCorrection(el);
            }}
          >
          {displayedIncome.map((entry) => {
            if (entry.kind === 'expected') {
              const i = entry.item;
              return (
                <div className="card-carousel-item" key={i.id}>
                <div className="card">
                  <div className="row">
                    <span className="name">{i.title}</span>
                    <span className="amount" style={{ color: 'var(--green)' }}>
                      {formatCents(i.amountCents || 0)}
                    </span>
                  </div>
                  <div style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.9rem', marginTop: 6 }}>{formatExpectedTiming(i.expectedDate)}</div>
                  <div className="btn-row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
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
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                      onClick={async () => {
                        const ok = await showConfirm('Remove this expected income from Upcoming?');
                        if (!ok) return;
                        const next = expectedIncome.filter((x) => x.id !== i.id);
                        setExpectedIncome(next);
                        saveExpectedIncome(next);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                </div>
              );
            } else {
              const i = entry.item;
              return (
                <div className="card-carousel-item" key={i.id}>
                <div className="card">
                  <div className="row">
                    <span className="name">{i.title}</span>
                    <span className="amount" style={{ color: 'var(--green)' }}>
                      {formatCents(i.amountCents || 0)}
                    </span>
                  </div>
                  <div style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.9rem', marginTop: 6 }}>
                    {formatExpectedTiming(i.expectedDate)} • From recurring
                  </div>
                  <div className="btn-row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
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
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                      onClick={async () => {
                        const ok = await showConfirm('Remove this occurrence from Upcoming only? Your recurring income is not changed.');
                        if (!ok) return;
                        dismissUpcomingOccurrence('inc', i.recurringId, i.expectedDate);
                        setDismissedOccurrences(loadUpcomingDismissedOccurrences());
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                </div>
              );
            }
          })}
          </div>
          {displayedIncome.length > 1 && (showAllIncome && allIncomeItems.length >= 5 ? (
            <div style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 6, marginBottom: 8 }}>
              {incomeCarouselIdx + 1} of {displayedIncome.length}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 6, marginBottom: 8 }}>
                {displayedIncome.map((_, i) => (
                  <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', display: 'inline-block', flexShrink: 0, background: i === incomeCarouselIdx ? 'var(--ui-add-btn, var(--accent))' : 'var(--ui-border, var(--border))', transition: 'background 0.15s' }} />
                ))}
              </div>
              {allIncomeItems.length >= 5 && incomeCarouselIdx >= displayedIncome.length - 1 ? (
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 14px', minHeight: 'unset' }} onClick={() => setShowAllIncome(true)}>See more</button>
                </div>
              ) : null}
            </>
          ))}
        </>
      ) : null}

      <div
        className="section-header"
        style={{ marginTop: 24 }}
        onClick={() => setCostsCollapsed(!costsCollapsed)}
      >
        <span className="section-header-left" style={{ color: 'var(--ui-title-text, var(--red))' }}>
          Expected Costs
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="chevron">{costsCollapsed ? '▸' : '▾'}</span>
        </span>
      </div>
      {!costsCollapsed ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button
              type="button"
              className="snapshot-add-btn"
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
                  maxAmount: '',
                  targetBankId: '',
                  targetHysaId: '',
                  hysaSubBucket: 'liquid',
                  paymentSource: '',
                  paymentTargetId: '',
                });
              }}
            >
              <IconPlus /> Add
            </button>
          </div>
          <div
            className="card-carousel"
            ref={costsCarouselRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const rawIdx = el.scrollLeft / (el.clientWidth || 1);
              setCostsCarouselIdx(Math.round(rawIdx));
              scheduleSnapCorrection(el);
            }}
          >
          {displayedCosts.map((entry) => {
            if (entry.kind === 'expected') {
              const c = entry.item;
              return (
                <div className="card-carousel-item" key={c.id}>
                <div className="card">
                  <div className="row">
                    <span className="name">{c.title}</span>
                    <span className="amount" style={{ color: 'var(--red)' }}>
                      {formatCents(c.amountCents || 0)}
                    </span>
                  </div>
                  <div style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.9rem', marginTop: 6 }}>{formatExpectedTiming(c.expectedDate)}</div>
                  <div className="btn-row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                    {c.paymentSource === 'card' ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                        onClick={() => {
                          const amountCents = c.amountCents || 0;
                          actions.addPurchase({
                            title: c.title,
                            amountCents,
                            dateISO: toLocalDateKey(new Date()),
                            notes: c.notes,
                            applyToSnapshot: !!c.paymentTargetId,
                            paymentSource: 'card',
                            paymentTargetId: c.paymentTargetId,
                          } as any);
                          const next = expectedCosts.map((x) =>
                            x.id === c.id ? { ...x, status: 'moved_to_pending' as const } : x
                          );
                          setExpectedCosts(next);
                          saveExpectedCosts(next);
                        }}
                      >
                        Purchase Was Charged to Card
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
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
                    )}
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                      onClick={async () => {
                        const ok = await showConfirm('Remove this expected cost from Upcoming?');
                        if (!ok) return;
                        const next = expectedCosts.filter((x) => x.id !== c.id);
                        setExpectedCosts(next);
                        saveExpectedCosts(next);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                </div>
              );
            } else {
              const c = entry.item;
              const recurringItem = (data.recurring || []).find((r: any) => r.id === c.recurringId);
              const isCardCharge = recurringItem?.paymentSource === 'card';
              return (
                <div className="card-carousel-item" key={c.recurringId + ':' + c.dateKey}>
                <div className="card">
                  <div className="row">
                    <span className="name">{c.recurringName}</span>
                    <span className="amount" style={{ color: 'var(--red)' }}>
                      {formatCents(c.amountCents || 0)}
                    </span>
                  </div>
                  <div style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.9rem', marginTop: 6 }}>
                    {formatExpectedTiming(c.dateKey)} • From recurring
                  </div>
                  <div className="btn-row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                    {isCardCharge ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                        onClick={() => {
                          const isSplitRec = !!c.isSplit && typeof c.myPortionCents === 'number' && c.myPortionCents > 0;
                          const fullAmountCents = c.fullAmountCents || c.amountCents || 0;
                          const userPortionCents = isSplitRec ? (c.myPortionCents ?? c.amountCents ?? 0) : fullAmountCents;
                          const splitInboundCents = isSplitRec ? fullAmountCents - userPortionCents : 0;
                          const shouldApply = !!recurringItem?.paymentTargetId;

                          const purchase: any = {
                            title: c.recurringName,
                            amountCents: userPortionCents,
                            dateISO: toLocalDateKey(new Date()),
                            category: recurringItem?.category,
                            subcategory: recurringItem?.subcategory,
                            notes: recurringItem?.notes,
                            applyToSnapshot: shouldApply,
                            paymentSource: 'card',
                            paymentTargetId: recurringItem?.paymentTargetId,
                          };

                          if (isSplitRec) {
                            purchase.isSplit = true;
                            purchase.splitTotalCents = fullAmountCents;
                            purchase.splitMyPortionCents = userPortionCents;
                            purchase.originalTotal = fullAmountCents;
                            if (shouldApply) {
                              purchase.splitSnapshot = {
                                amountCents: fullAmountCents,
                                paymentSource: 'card',
                                paymentTargetId: recurringItem?.paymentTargetId
                              };
                            }
                          }

                          actions.addPurchase(purchase);
                          actions.markRecurringHandled(c.recurringId, c.dateKey);

                          // Show split reimbursement popup to let user pick deposit destination
                          if (isSplitRec && splitInboundCents > 0) {
                            const firstBankId = (data.banks || [])[0]?.id || '';
                            setSplitInboundPopup({
                              title: c.recurringName,
                              fullAmountCents,
                              userPortionCents,
                              reimbursementCents: splitInboundCents,
                              depositTo: 'bank',
                              targetBankId: firstBankId,
                              targetHysaId: '',
                              hysaSubBucket: 'liquid',
                            });
                          }

                          // Show reward popup if card has reward rules matching this category
                          if (recurringItem?.paymentTargetId && recurringItem?.category) {
                            const card = (data.cards || []).find((cc: any) => cc.id === recurringItem.paymentTargetId);
                            if (card) {
                              const rewardDelta = computeRewardDeltaForPurchase({
                                card,
                                amountCents: fullAmountCents,
                                category: recurringItem.category,
                                subcategory: recurringItem.subcategory
                              });
                              if (rewardDelta) {
                                if (rewardDelta.rewardType === 'cashback') {
                                  const cur = card.rewardCashbackCents ?? 0;
                                  setRewardPopup({
                                    rewardType: 'cashback', cardId: card.id, cardName: card.name || 'Card',
                                    deltaLabel: `${formatCents(rewardDelta.deltaCashbackCents)} cash back`,
                                    computedDelta: rewardDelta.deltaCashbackCents,
                                    newBalanceLabel: `${formatCents(cur + rewardDelta.deltaCashbackCents)} cash back`,
                                    newBalance: cur + rewardDelta.deltaCashbackCents, currentBalance: cur
                                  });
                                } else if (rewardDelta.rewardType === 'points') {
                                  const cur = card.rewardPoints ?? 0;
                                  setRewardPopup({
                                    rewardType: 'points', cardId: card.id, cardName: card.name || 'Card',
                                    deltaLabel: `${rewardDelta.deltaPoints.toLocaleString()} points`,
                                    computedDelta: rewardDelta.deltaPoints,
                                    newBalanceLabel: `${(cur + rewardDelta.deltaPoints).toLocaleString()} points`,
                                    newBalance: cur + rewardDelta.deltaPoints, currentBalance: cur
                                  });
                                } else {
                                  const cur = card.rewardMiles ?? 0;
                                  setRewardPopup({
                                    rewardType: 'miles', cardId: card.id, cardName: card.name || 'Card',
                                    deltaLabel: `${rewardDelta.deltaMiles.toLocaleString()} miles`,
                                    computedDelta: rewardDelta.deltaMiles,
                                    newBalanceLabel: `${(cur + rewardDelta.deltaMiles).toLocaleString()} miles`,
                                    newBalance: cur + rewardDelta.deltaMiles, currentBalance: cur
                                  });
                                }
                              }
                            }
                          }
                        }}
                      >
                        Purchase Was Charged to Card
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                        onClick={() => {
                          const initialCents = (c.isSplit && c.fullAmountCents) ? c.fullAmountCents : (c.amountCents || 0);
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
                    )}
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                      onClick={async () => {
                        const ok = await showConfirm('Remove this occurrence from Upcoming only? Your recurring expense is not changed.');
                        if (!ok) return;
                        dismissUpcomingOccurrence('exp', c.recurringId, c.dateKey);
                        setDismissedOccurrences(loadUpcomingDismissedOccurrences());
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                </div>
              );
            }
          })}
          </div>
          {displayedCosts.length > 1 && (showAllCosts && allCostItems.length >= 5 ? (
            <div style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 6, marginBottom: 8 }}>
              {costsCarouselIdx + 1} of {displayedCosts.length}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 6, marginBottom: 8 }}>
                {displayedCosts.map((_, i) => (
                  <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', display: 'inline-block', flexShrink: 0, background: i === costsCarouselIdx ? 'var(--ui-add-btn, var(--accent))' : 'var(--ui-border, var(--border))', transition: 'background 0.15s' }} />
                ))}
              </div>
              {allCostItems.length >= 5 && costsCarouselIdx >= displayedCosts.length - 1 ? (
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 14px', minHeight: 'unset' }} onClick={() => setShowAllCosts(true)}>See more</button>
                </div>
              ) : null}
            </>
          ))}
        </>
      ) : null}

      <div className="summary" style={{ marginTop: 24 }}>
        <div className="summary-compact">
          <div className="summary-kv">
            <span className="k">Final Net Cash</span>
            <span className={displayedFinalNetCashCents < 0 ? 'v neg' : 'v pos'}>{formatCents(displayedFinalNetCashCents)}</span>
          </div>
          <div className="summary-kv">
            <span className="k">Expected income in {windowDays} days</span>
            <span className="v upcoming-income-amount">{formatCents(totalExpectedIncomeCents)}</span>
          </div>
          <div className="summary-kv">
            <span className="k">Expected costs in {windowDays} days</span>
            <span className="v upcoming-cost-amount">{formatCents(totalExpectedCostsCents)}</span>
          </div>
          <div className="summary-kv amount-remaining-emphasis">
            <span className="k">Amount remaining</span>
            <span className={amountRemainingCents >= 0 ? 'v pos' : 'v neg'}>{formatCents(amountRemainingCents)}</span>
          </div>
          <div>
            {amountRemainingCents > 0 ? (
              <span className="upcoming-status-ok">All expenses covered</span>
            ) : (
              <span className="upcoming-status-warn">May require additional funds</span>
            )}
          </div>
        </div>
      </div>

      {modal.type === 'add-expected' ? (() => {
        const hysaAccounts = loadInvesting().accounts.filter((a: any) => a.type === 'hysa');
        return (
        <div className="modal-overlay modal-overlay--fullscreen">
          <div className="modal">
            <div className="modal-header modal-header--sticky">
              <h3 style={{ margin: 0, flex: 1 }}>{modal.kind === 'income' ? 'Add Expected Income' : 'Add Expected Cost'}</h3>
              <button type="button" aria-label="Close" onClick={() => setModal({ type: 'none' })} className="modal-close-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="field">
              <label>Title / Label</label>
              <input value={modal.title} onChange={(e) => { const v = e.target.value; if (!contentGuard(v, () => setModal({ ...modal, title: '' }))) setModal({ ...modal, title: v }); }} placeholder="e.g. Paycheck" />
            </div>
            <div className="field">
              <label>Amount ($)</label>
              <input value={modal.amount} onChange={(e) => setModal({ ...modal, amount: e.target.value })} inputMode="decimal" placeholder="0.00" />
            </div>

            <div className="field">
              <label>Expected Date</label>
              <input type="date" value={modal.date} onChange={(e) => setModal({ ...modal, date: e.target.value })} />
            </div>

            <div className="field">
              <label>Notes (optional)</label>
              <textarea value={modal.notes} onChange={(e) => { const v = e.target.value; if (!contentGuard(v, () => setModal({ ...modal, notes: '' }))) setModal({ ...modal, notes: v }); }} placeholder="Optional" />
            </div>

            {modal.kind === 'income' && (
              <>
                <div className="field">
                  <label>Deposit to bank</label>
                  <Select
                    value={modal.targetBankId}
                    onChange={(e) => setModal({ ...modal, targetBankId: e.target.value })}
                  >
                    <option value="">Select bank...</option>
                    {sortByRecent(data.banks || [], (b: any) => b.id).map((b: any) => (
                      <option key={b.id} value={b.id}>Bank - {b.name} ({formatCents(b.balanceCents || 0)})</option>
                    ))}
                  </Select>
                </div>
                {hysaAccounts.length > 0 && (
                  <div className="field">
                    <label>Deposit to HYSA (optional)</label>
                    <Select
                      value={modal.targetHysaId}
                      onChange={(e) => setModal({ ...modal, targetHysaId: e.target.value })}
                    >
                      <option value="">None</option>
                      {sortByRecent(hysaAccounts, (a: any) => a.id).map((a: any) => (
                        <option key={a.id} value={a.id}>HYSA - {a.name} ({formatCents(a.balanceCents || 0)})</option>
                      ))}
                    </Select>
                  </div>
                )}
                {modal.targetHysaId && (
                  <div className="field">
                    <label>HYSA Bucket</label>
                    <Select
                      value={modal.hysaSubBucket}
                      onChange={(e) => setModal({ ...modal, hysaSubBucket: e.target.value as 'liquid' | 'reserved' })}
                    >
                      <option value="liquid">Bills fund</option>
                      <option value="reserved">Savings reserve</option>
                    </Select>
                  </div>
                )}
              </>
            )}

            {modal.kind === 'cost' && (
              <div className="field">
                <label>Payment source</label>
                <Select
                  value={modal.paymentSource}
                  onChange={(e) => setModal({ ...modal, paymentSource: e.target.value as any, paymentTargetId: '' })}
                >
                  <option value="">None</option>
                  <option value="bank">Bank account</option>
                  <option value="card">Credit card</option>
                </Select>
              </div>
            )}

            {modal.kind === 'cost' && modal.paymentSource === 'bank' && (
              <div className="field">
                <label>From bank account</label>
                <Select
                  value={modal.paymentTargetId}
                  onChange={(e) => setModal({ ...modal, paymentTargetId: e.target.value })}
                >
                  <option value="">Select bank...</option>
                  {sortByRecent(data.banks || [], (b: any) => b.id).map((b: any) => (
                    <option key={b.id} value={b.id}>Bank - {b.name} ({formatCents(b.balanceCents || 0)})</option>
                  ))}
                </Select>
              </div>
            )}

            {modal.kind === 'cost' && modal.paymentSource === 'card' && (
              <div className="field">
                <label>Charged to card</label>
                <Select
                  value={modal.paymentTargetId}
                  onChange={(e) => setModal({ ...modal, paymentTargetId: e.target.value })}
                >
                  <option value="">Select card...</option>
                  {sortByRecent(data.cards || [], (c: any) => c.id).map((c: any) => (
                    <option key={c.id} value={c.id}>Card - {c.name} ({formatCents(c.balanceCents || 0)})</option>
                  ))}
                </Select>
              </div>
            )}

            {(() => {
              const titleOk = modal.title.trim().length > 0;
              const dateOk = modal.date.trim().length > 0;
              const amountOk = parseCents(modal.amount) > 0;
              const canSave = titleOk && dateOk && amountOk;
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
                      const amountCents = parseCents(modal.amount);

                      if (modal.kind === 'income') {
                        const next = [
                          ...expectedIncome,
                          {
                            id: uid(),
                            title,
                            expectedDate,
                            amountCents,
                            notes,
                            targetBankId: modal.targetBankId || undefined,
                            targetHysaId: modal.targetHysaId || undefined,
                            hysaSubBucket: modal.targetHysaId ? modal.hysaSubBucket : undefined,
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
                            notes,
                            paymentSource: modal.paymentSource || undefined,
                            paymentTargetId: modal.paymentTargetId || undefined,
                            status: 'expected' as const
                          }
                        ];
                        setExpectedCosts(next);
                        saveExpectedCosts(next);
                      }
                      recordSelections(modal.targetBankId, modal.targetHysaId, modal.paymentSource, modal.paymentTargetId);
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
        );
      })() : null}
      {modal.type === 'adjust-amount' ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Adjust amount?</h3>
            <p style={{ color: 'var(--ui-primary-text, var(--text))', marginTop: 0 }}>
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
                      actions.addPendingInbound({ label: item.title, amountCents: cents, depositTo: 'bank', targetBankId: item.targetBankId || undefined });
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
                      const recurringHysaSource =
                        rec?.paymentSource === 'hysa' && rec?.paymentTargetId
                          ? {
                              investingAccountId: rec.paymentTargetId,
                              hysaSubBucket: (rec as any).hysaSubBucket === 'reserved' ? 'reserved' as const : 'liquid' as const
                            }
                          : undefined;
                      const meta = {
                        ...(baseMeta || {}),
                        ...(recurringHysaSource ? { recurringHysaSource } : {}),
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
                      const userPortionCents = item.isSplit && typeof item.myPortionCents === 'number' ? item.myPortionCents : cents;
                      actions.addPendingOutbound({
                        label: item.recurringName,
                        amountCents: cents,
                        recurringId: item.recurringId,
                        recurringDateKey: item.dateKey,
                        paymentSource: item.paymentSource as any,
                        paymentTargetId: item.paymentTargetId,
                        splitTotalCents: item.isSplit ? item.fullAmountCents : undefined,
                        myPortionCents: item.isSplit ? userPortionCents : undefined,
                        category: item.category,
                        subcategory: item.subcategory,
                        meta
                      });
                      if (item.isSplit && item.fullAmountCents > userPortionCents) {
                        const reimbursementCents = item.fullAmountCents - userPortionCents;
                        const firstBankId = (data.banks || [])[0]?.id || '';
                        setSplitInboundPopup({
                          title: item.recurringName,
                          fullAmountCents: item.fullAmountCents,
                          userPortionCents,
                          reimbursementCents,
                          depositTo: 'bank',
                          targetBankId: firstBankId,
                          targetHysaId: '',
                          hysaSubBucket: 'liquid',
                        });
                      }
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

      {rewardPopup ? createPortal(
        <div className="modal-overlay" style={{ zIndex: 10002 }}>
          <div className="modal">
            <h3 style={{ marginBottom: 10 }}>Update rewards?</h3>
            <p style={{ color: 'var(--ui-primary-text, var(--text))', marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
              Would you like to add {rewardPopup.deltaLabel} to your {rewardPopup.cardName} rewards? Your new balance will be {rewardPopup.newBalanceLabel}.
            </p>
            {rewardMode === 'manual' ? (
              <div className="field" style={{ marginTop: 8 }}>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 6, color: 'var(--ui-primary-text, var(--text))' }}>
                  Specify how much {rewardPopup.rewardType === 'cashback' ? 'cash back ($)' : rewardPopup.rewardType} to add
                </label>
                <input
                  className="ll-control"
                  value={rewardManualStr}
                  onChange={(e) => setRewardManualStr(e.target.value)}
                  inputMode={rewardPopup.rewardType === 'cashback' ? 'decimal' : 'numeric'}
                  placeholder={rewardPopup.rewardType === 'cashback' ? 'e.g. 20' : 'e.g. 40000'}
                />
              </div>
            ) : null}
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setRewardPopup(null)}>No</button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (rewardMode === 'computed') {
                    if (rewardPopup.rewardType === 'cashback') {
                      actions.updateCardRewardTotals(rewardPopup.cardId, { rewardCashbackCents: rewardPopup.newBalance });
                    } else if (rewardPopup.rewardType === 'points') {
                      actions.updateCardRewardTotals(rewardPopup.cardId, { rewardPoints: rewardPopup.newBalance });
                    } else {
                      actions.updateCardRewardTotals(rewardPopup.cardId, { rewardMiles: rewardPopup.newBalance });
                    }
                  } else {
                    const cleaned = (rewardManualStr || '0').replace(/,/g, '');
                    const deltaInput =
                      rewardPopup.rewardType === 'cashback'
                        ? parseCents(rewardManualStr)
                        : Math.round(parseFloat(cleaned));
                    const delta = Number.isFinite(deltaInput) ? deltaInput : 0;
                    if (!(delta > 0)) return;
                    const nextBalance = Math.max(0, rewardPopup.currentBalance + delta);
                    if (rewardPopup.rewardType === 'cashback') {
                      actions.updateCardRewardTotals(rewardPopup.cardId, { rewardCashbackCents: nextBalance });
                    } else if (rewardPopup.rewardType === 'points') {
                      actions.updateCardRewardTotals(rewardPopup.cardId, { rewardPoints: nextBalance });
                    } else {
                      actions.updateCardRewardTotals(rewardPopup.cardId, { rewardMiles: nextBalance });
                    }
                  }
                  setRewardPopup(null);
                }}
              >
                {rewardMode === 'computed' ? 'Yes' : 'Add'}
              </button>
              {rewardMode === 'computed' ? (
                <button type="button" className="btn btn-secondary" onClick={() => setRewardMode('manual')}>Specify</button>
              ) : (
                <button type="button" className="btn btn-secondary" onClick={() => setRewardMode('computed')}>Use computed</button>
              )}
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      {splitInboundPopup ? createPortal(
        <div className="modal-overlay" style={{ zIndex: 10002 }}>
          <div className="modal">
            <h3 style={{ marginBottom: 10 }}>Split Reimbursement</h3>
            <p style={{ color: 'var(--ui-primary-text, var(--text))', marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
              This purchase is being split from a total of{' '}
              <strong>{formatCents(splitInboundPopup.fullAmountCents)}</strong>. Your portion is{' '}
              <strong>{formatCents(splitInboundPopup.userPortionCents)}</strong>, so you are expecting a{' '}
              <strong>{formatCents(splitInboundPopup.reimbursementCents)}</strong> reimbursement for{' '}
              <em>{splitInboundPopup.title}</em>.
            </p>
            <div className="field" style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 6, color: 'var(--ui-primary-text, var(--text))' }}>
                Where will this reimbursement be deposited?
              </label>
              <Select
                value={splitInboundPopup.depositTo}
                onChange={(e) => setSplitInboundPopup({ ...splitInboundPopup, depositTo: e.target.value as 'bank' | 'hysa' })}
              >
                <option value="bank">Bank Account</option>
                <option value="hysa">HYSA</option>
              </Select>
            </div>
            {splitInboundPopup.depositTo === 'bank' ? (
              <div className="field" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 6, color: 'var(--ui-primary-text, var(--text))' }}>
                  Bank Account
                </label>
                <Select
                  value={splitInboundPopup.targetBankId}
                  onChange={(e) => setSplitInboundPopup({ ...splitInboundPopup, targetBankId: e.target.value })}
                >
                  {sortByRecent(data.banks || [], (b: any) => b.id).map((b: any) => (
                    <option key={b.id} value={b.id}>Bank - {b.name || 'Bank'} ({formatCents(b.balanceCents || 0)})</option>
                  ))}
                </Select>
              </div>
            ) : (
              <>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 6, color: 'var(--ui-primary-text, var(--text))' }}>
                    HYSA Account
                  </label>
                  <Select
                    value={splitInboundPopup.targetHysaId}
                    onChange={(e) => setSplitInboundPopup({ ...splitInboundPopup, targetHysaId: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {sortByRecent(loadInvesting().accounts.filter((a: any) => a.type === 'hysa'), (a: any) => a.id).map((a: any) => (
                      <option key={a.id} value={a.id}>HYSA - {a.name || 'HYSA'} ({formatCents(a.balanceCents || 0)})</option>
                    ))}
                  </Select>
                </div>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 6, color: 'var(--ui-primary-text, var(--text))' }}>
                    Sub-bucket
                  </label>
                  <Select
                    value={splitInboundPopup.hysaSubBucket}
                    onChange={(e) => setSplitInboundPopup({ ...splitInboundPopup, hysaSubBucket: e.target.value as 'liquid' | 'reserved' })}
                  >
                    <option value="liquid">Bills fund</option>
                    <option value="reserved">Savings reserve</option>
                  </Select>
                </div>
              </>
            )}
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-posted"
                onClick={() => {
                  const p = splitInboundPopup;
                  if (p.depositTo === 'bank') {
                    actions.addPendingInbound({
                      label: p.title,
                      amountCents: p.reimbursementCents,
                      depositTo: 'bank',
                      targetBankId: p.targetBankId || undefined,
                      fromSplit: true,
                    });
                  } else {
                    actions.addPendingInbound({
                      label: p.title,
                      amountCents: p.reimbursementCents,
                      depositTo: 'hysa',
                      targetInvestingAccountId: p.targetHysaId || undefined,
                      fromSplit: true,
                      meta: p.hysaSubBucket ? { hysaSubBucket: p.hysaSubBucket } : undefined,
                    } as any);
                  }
                  recordSelections(p.targetBankId, p.targetHysaId, p.depositTo);
                  setSplitInboundPopup(null);
                }}
              >
                Add Reimbursement
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

    </div>
  );
}

