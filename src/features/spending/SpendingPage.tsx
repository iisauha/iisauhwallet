import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatCents, formatLongLocalDate, parseCents } from '../../state/calc';
import { useLedgerStore } from '../../state/store';
import { getCategoryName, loadCategoryConfig, loadBoolPref, saveBoolPref, logActivityEntry, loadInvesting } from '../../state/storage';
import { SHOW_ZERO_REWARDS_KEY } from '../../state/keys';
import { useDropdownCollapsed } from '../../state/DropdownStateContext';
import { Select } from '../../ui/Select';
import { Modal } from '../../ui/Modal';
import { IconMagnify } from '../../ui/icons';
import { AddPurchaseModal } from './AddPurchaseModal';
import { getCategoryColor, renderSpendingPieChart } from './charts';
import { computeRewardDeltaForPurchase, type RewardDelta } from '../rewards/rewardMatching';

type FilterKey = 'this_month' | 'last_month' | 'all_time' | 'custom';
type BreakdownView = 'category' | 'rewards' | 'card';

function toLocalDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function monthStartKey(d: Date) {
  return toLocalDateKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

function addMonths(d: Date, months: number) {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

export function SpendingPage({ tabVisible = true, addTrigger = 0, reimburseAddTrigger = 0 }: { tabVisible?: boolean; addTrigger?: number; reimburseAddTrigger?: number } = {}) {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);
  const cfg = useMemo(() => loadCategoryConfig(), []);
  const [filter, setFilter] = useState<FilterKey>('this_month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [openAdd, setOpenAdd] = useState(false);

  useEffect(() => {
    if (addTrigger > 0) setOpenAdd(true);
  }, [addTrigger]);
  const [reimbursementMode, setReimbursementMode] = useState(false);

  useEffect(() => {
    if (reimburseAddTrigger > 0) {
      setReimbursementMode(true);
      setOpenAdd(true);
    }
  }, [reimburseAddTrigger]);
  const [view, setView] = useState<BreakdownView>('category');
  const [lastRewardsSubView, setLastRewardsSubView] = useState<'rewards' | 'card'>('rewards');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
  const [rewardSubtractPopup, setRewardSubtractPopup] = useState<null | {
    rewardType: 'cashback' | 'miles' | 'points';
    cardId: string;
    cardName: string;
    deltaLabel: string;
    computedDelta: number; // cents for cashback, raw count for points/miles
    newBalanceLabel: string;
    newBalance: number; // cents for cashback, raw count for points/miles
    currentBalance: number; // before subtracting
  }>(null);
  const [rewardSubtractMode, setRewardSubtractMode] = useState<'computed' | 'manual'>('computed');
  const [rewardSubtractManualStr, setRewardSubtractManualStr] = useState<string>('');

  useEffect(() => {
    if (!rewardSubtractPopup) return;
    setRewardSubtractMode('computed');
    setRewardSubtractManualStr('');
  }, [rewardSubtractPopup]);
  const [purchasesCollapsed, setPurchasesCollapsed] = useDropdownCollapsed('spending_purchases', true);
  const [showAllPurchases, setShowAllPurchases] = useState<boolean>(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [editingPurchaseKey, setEditingPurchaseKey] = useState<string | null>(null);
  const [drilldownCategoryId, setDrilldownCategoryId] = useState<string | null>(null);
  const [editBalanceModal, setEditBalanceModal] = useState<{
    cardId: string;
    cardName: string;
    rewardType: 'cashback' | 'miles' | 'points';
    balance: number;
    cpp: number | undefined;
  } | null>(null);
  const [hideZeroRewards, setHideZeroRewards] = useState(() => loadBoolPref(SHOW_ZERO_REWARDS_KEY, true));
  const [purchasesCarouselRef, setPurchasesCarouselRef] = useState<HTMLDivElement | null>(null);
  const [purchasesCarouselHeight, setPurchasesCarouselHeight] = useState<number | null>(null);
  const [purchasesCarouselIdx, setPurchasesCarouselIdx] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const { startKey, endKey } = useMemo(() => {
    const now = new Date();
    if (filter === 'all_time') return { startKey: '0000-01-01', endKey: '9999-12-31' };
    if (filter === 'this_month') {
      const s = monthStartKey(now);
      const e = monthStartKey(addMonths(now, 1));
      return { startKey: s, endKey: e };
    }
    if (filter === 'last_month') {
      const last = addMonths(now, -1);
      const s = monthStartKey(last);
      const e = monthStartKey(addMonths(last, 1));
      return { startKey: s, endKey: e };
    }
    // custom
    const s = customStart || '0000-01-01';
    const e = customEnd ? toLocalDateKey(new Date(customEnd + 'T00:00:00')) : '9999-12-31';
    return { startKey: s, endKey: e };
  }, [filter, customStart, customEnd]);

  const periodPurchases = useMemo(() => {
    const list: any[] = data.purchases || [];
    return list.filter((p) => {
      const k = p.dateISO || '';
      if (!k) return false;
      return k >= startKey && k < endKey;
    });
  }, [data.purchases, startKey, endKey]);

  /** Personal spending only: exclude full-reimbursement card purchases (they are not my spending). */
  const personalPeriodPurchases = useMemo(() => {
    return periodPurchases.filter((p: any) => !p.fullReimbursementExpected);
  }, [periodPurchases]);

  const filteredPurchases = useMemo(() => {
    const q = (searchQuery || '').trim();
    if (!q) return personalPeriodPurchases;
    const lower = q.toLowerCase();

    let rx: RegExp | null = null;
    if (q.length >= 2 && q.startsWith('/') && q.endsWith('/')) {
      const inner = q.slice(1, -1);
      try {
        rx = new RegExp(inner, 'i');
      } catch {
        rx = null;
      }
    }

    return personalPeriodPurchases.filter((p: any) => {
      const title = String(p.title || '');
      const catId = String(p.category || 'uncategorized');
      const catName = String(getCategoryName(cfg, catId) || '');
      const sub = String(p.subcategory || '');
      const haystack = `${title} ${catName} ${sub}`;
      if (rx) return rx.test(haystack);
      return haystack.toLowerCase().includes(lower);
    });
  }, [personalPeriodPurchases, searchQuery, cfg]);

  const periodTotalCents = useMemo(() => {
    return filteredPurchases.reduce((s, p) => s + (p.amountCents || 0), 0);
  }, [filteredPurchases]);

  const getRewardDeltaAndCardForPurchase = (
    p: any
  ): { card: any; rewardDelta: RewardDelta } | null => {
    if (!p) return null;
    if (!p.applyToSnapshot || !p.paymentSource) return null;

    const isSplitApplied = !!p.isSplit && !!p.splitSnapshot && typeof p.splitSnapshot.amountCents === 'number';
    const amountCents = isSplitApplied
      ? p.splitSnapshot.amountCents
      : typeof p.amountCents === 'number'
        ? p.amountCents
        : 0;

    const src = isSplitApplied && p.splitSnapshot?.paymentSource ? p.splitSnapshot.paymentSource : p.paymentSource;
    const targetId = isSplitApplied && p.splitSnapshot?.paymentTargetId ? p.splitSnapshot.paymentTargetId : p.paymentTargetId;
    if (!targetId) return null;
    if (src !== 'card' && src !== 'credit_card') return null;

    const card = (data.cards || []).find((c: any) => c.id === targetId);
    if (!card || !p.category) return null;

    const rewardDelta = computeRewardDeltaForPurchase({
      card,
      amountCents,
      category: p.category,
      subcategory: p.subcategory
    });

    return rewardDelta ? { card, rewardDelta } : null;
  };

  const totalRewards = useMemo(() => {
    let totalCashback = 0;
    let totalPoints = 0;
    let totalMiles = 0;
    let totalApproxCents = 0;
    let pointsApproxCents = 0;
    let milesApproxCents = 0;
    (data.cards || []).forEach((c: any) => {
      const type =
        c.rewardType ??
        (c.rewardCashbackCents != null &&
        (c.rewardPoints == null || c.rewardPoints === 0) &&
        (c.rewardMiles == null || c.rewardMiles === 0)
          ? 'cashback'
          : c.rewardMiles != null && c.rewardMiles > 0
            ? 'miles'
            : 'points');
      const balance =
        type === 'cashback'
          ? c.rewardCashbackCents ?? 0
          : type === 'miles'
            ? c.rewardMiles ?? 0
            : c.rewardPoints ?? 0;
      if (type === 'cashback') {
        totalCashback += balance;
      } else if (type === 'points') {
        totalPoints += balance;
        if (c.avgCentsPerPoint != null && c.avgCentsPerPoint > 0) {
          const approx = Math.round(balance * c.avgCentsPerPoint);
          totalApproxCents += approx;
          pointsApproxCents += approx;
        }
      } else {
        totalMiles += balance;
        if (c.avgCentsPerMile != null && c.avgCentsPerMile > 0) {
          const approx = Math.round(balance * c.avgCentsPerMile);
          totalApproxCents += approx;
          milesApproxCents += approx;
        }
      }
    });
    return { totalCashback, totalPoints, totalMiles, totalApproxCents, pointsApproxCents, milesApproxCents };
  }, [data.cards]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    filteredPurchases.forEach((p) => {
      const cat = (p.category || 'uncategorized') as string;
      map.set(cat, (map.get(cat) || 0) + (p.amountCents || 0));
    });
    return Array.from(map.entries())
      .map(([categoryId, amountCents]) => ({ categoryId, amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents);
  }, [filteredPurchases]);

  const byCard = useMemo(() => {
    const bankById = new Map<string, string>((data.banks || []).map((b) => [b.id, b.name || 'Bank']));
    const cardById = new Map<string, string>((data.cards || []).map((c) => [c.id, c.name || 'Card']));
    const inv = loadInvesting();
    const hysaById = new Map<string, string>((inv.accounts || []).filter((a: any) => a.type === 'hysa').map((a: any) => [a.id, a.name || 'HYSA']));
    const map = new Map<string, number>();
    filteredPurchases.forEach((p: any) => {
      const targetId = (p.paymentTargetId || '') as string;
      const src = (p.paymentSource || '') as string;
      let name: string;
      if (targetId && (src === 'card' || src === 'credit_card')) {
        name = cardById.get(targetId) || 'Credit Card';
      } else if (targetId && (src === 'bank' || src === 'cash')) {
        name = bankById.get(targetId) || (src === 'cash' ? 'Physical Cash' : 'Bank');
      } else if (src === 'hysa' && targetId) {
        name = 'HYSA - ' + (hysaById.get(targetId) || 'HYSA');
      } else if (src === 'hysa') {
        name = 'HYSA';
      } else if (src === 'cash') {
        name = 'Physical Cash';
      } else if (src) {
        name = src.charAt(0).toUpperCase() + src.slice(1);
      } else {
        name = 'Not specified';
      }
      map.set(name, (map.get(name) || 0) + (p.amountCents || 0));
    });
    return Array.from(map.entries())
      .map(([paymentTargetName, amountCents]) => ({ paymentTargetName, amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents);
  }, [filteredPurchases, data.banks, data.cards]);


  const drilldownFilteredPurchases = useMemo(() => {
    if (!drilldownCategoryId) return filteredPurchases;
    return filteredPurchases.filter((p: any) => (p.category || 'uncategorized') === drilldownCategoryId);
  }, [filteredPurchases, drilldownCategoryId]);

  const sortedPurchases = useMemo(
    () =>
      drilldownFilteredPurchases
        .slice()
        .sort((a, b) => {
          const aKey = a.createdAt || (a.dateISO ? a.dateISO + 'T23:59:59' : '');
          const bKey = b.createdAt || (b.dateISO ? b.dateISO + 'T23:59:59' : '');
          return bKey.localeCompare(aKey);
        }),
    [drilldownFilteredPurchases]
  );
  const hasMorePurchases = sortedPurchases.length > 5;
  const visiblePurchases = showAllPurchases ? sortedPurchases : sortedPurchases.slice(0, 5);

  const getPurchaseUiId = (p: any) => {
    if (p.id) return String(p.id);
    const parts = [
      String(p.dateISO || ''),
      String(p.title || ''),
      String(p.amountCents || 0),
      String(p.category || ''),
      String(p.subcategory || '')
    ];
    return parts.join('|');
  };

  // Stable key that changes whenever the visible purchase list identity changes
  const visiblePurchasesKey = useMemo(
    () => visiblePurchases.map((p: any) => p.id || '').join(','),
    [visiblePurchases]
  );

  // Reset carousel index only on actual filter/drilldown changes — NOT on "See More" expansion
  const filterKey = `${drilldownCategoryId}|${filter}|${customStart}|${customEnd}|${searchQuery}`;
  useEffect(() => {
    setPurchasesCarouselIdx(0);
    if (purchasesCarouselRef) purchasesCarouselRef.scrollLeft = 0;
  }, [filterKey]);

  const editingPurchase = useMemo(() => {
    if (!editingPurchaseKey) return null;
    const list: any[] = data.purchases || [];
    return list.find((p) => getPurchaseUiId(p) === editingPurchaseKey) || null;
  }, [editingPurchaseKey, data.purchases]);

  useEffect(() => {
    if (!purchasesCarouselRef) return;
    const firstItem = purchasesCarouselRef.children[0] as HTMLElement | undefined;
    if (firstItem) setPurchasesCarouselHeight(firstItem.offsetHeight);
  }, [purchasesCarouselRef, visiblePurchasesKey]);


  useEffect(() => {
    if (!canvasRef.current) return;
    if (view !== 'category') return;
    renderSpendingPieChart(
      canvasRef.current,
      byCategory,
      (categoryId) => {
        setDrilldownCategoryId((prev) => (prev === categoryId ? null : categoryId));
      },
      true
    );
  }, [byCategory, view]);

  useLayoutEffect(() => {
    if (!tabVisible || !canvasRef.current) return;
    const ch = (canvasRef.current as { __chart?: { resize?: () => void } }).__chart;
    if (ch?.resize) {
      requestAnimationFrame(() => ch.resize!());
    }
  }, [tabVisible]);

  return (
    <div className="tab-panel active" id="spendingContent">
      <div
        className="filter-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 0,
          paddingRight: 0,
          overflow: 'hidden',
        }}
      >
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterKey)}
          className="spending-filter-select"
          style={{ flexShrink: 0, minWidth: 110 }}
        >
          <option value="this_month">This Month</option>
          <option value="last_month">Last Month</option>
          <option value="all_time">All Time</option>
          <option value="custom">Custom</option>
        </Select>
        {filter === 'custom' ? (
          <span
            style={{
              display: 'flex',
              gap: 6,
              flexShrink: 1,
              minWidth: 0,
              maxWidth: 180,
            }}
          >
            <input
              className="ll-control"
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              style={{ minWidth: 0, flex: 1 }}
            />
            <input
              className="ll-control"
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              style={{ minWidth: 0, flex: 1 }}
            />
          </span>
        ) : (
          <span style={{ flex: 1 }} />
        )}
        <button
          type="button"
          className={view === 'rewards' || view === 'card' ? 'btn btn-secondary ll-toggle active' : 'btn btn-secondary ll-toggle'}
          onClick={() => {
            if (view === 'category') {
              setView(lastRewardsSubView);
            } else {
              const next = view === 'card' ? 'rewards' : 'card';
              setLastRewardsSubView(next);
              setView(next);
            }
          }}
          aria-pressed={view === 'rewards' || view === 'card'}
          style={{ flexShrink: 0 }}
        >
          {view === 'card' ? 'Sources' : 'Rewards'}
        </button>
        <button
          type="button"
          className={view === 'category' ? 'btn btn-secondary ll-toggle active' : 'btn btn-secondary ll-toggle'}
          onClick={() => {
            if (view === 'rewards' || view === 'card') setLastRewardsSubView(view);
            setView('category');
          }}
          aria-pressed={view === 'category'}
          style={{ flexShrink: 0 }}
        >
          Categories
        </button>
      </div>

      {view === 'category' ? <div
        className="card spending-summary-card"
        style={{
          marginTop: 16,
          marginBottom: 16,
          padding: 16,
          borderRadius: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>Total spend this period</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 650, marginTop: 4, color: 'var(--red)' }}>
              {formatCents(periodTotalCents)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>Current Rewards</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: 4 }}>
              {(() => {
                const { totalCashback, pointsApproxCents, milesApproxCents } = totalRewards as {
                  totalCashback: number;
                  pointsApproxCents?: number;
                  milesApproxCents?: number;
                };
                const cashbackCents = (totalCashback || 0) + (pointsApproxCents || 0);
                const travelCents = milesApproxCents || 0;
                if (cashbackCents <= 0 && travelCents <= 0) return '-';
                const labelStyle = {
                  fontSize: '0.8rem',
                  color: 'var(--ui-primary-text, var(--text))',
                  fontWeight: 400,
                } as const;
                return (
                  <>
                    {cashbackCents > 0 && (
                      <div>
                        <span style={{ color: 'var(--green)' }}>{formatCents(cashbackCents)}</span>{' '}
                        <span style={labelStyle}>cashback</span>
                      </div>
                    )}
                    {travelCents > 0 && (
                      <div style={{ marginTop: cashbackCents > 0 ? 2 : 0 }}>
                        <span style={{ color: 'var(--green)' }}>{formatCents(travelCents)}</span>{' '}
                        <span style={labelStyle}>travel value</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div> : null}

      <p className="section-title page-title" style={{ marginTop: 4 }}>
        {view === 'category' ? 'Spending distribution' : view === 'card' ? 'Spending by payment source' : 'Rewards overview'}
      </p>
      <div className={view === 'category' ? 'card card-no-press' : 'card'} style={view === 'category' ? { position: 'relative' } : undefined}>
        {view === 'category' ? (
          <>
            {byCategory.length > 0 ? (
              <>
                <div
                  className="spending-chart-wrap"
                  style={{ position: 'relative', width: '100%', height: 230 }}
                >
                  <canvas ref={canvasRef} />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '5px 10px', minHeight: 'unset', marginTop: 6 }}
                  onClick={() => setLegendOpen(!legendOpen)}
                >
                  {legendOpen ? 'Hide Legend' : 'Legend'}
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)', fontSize: '0.92rem', lineHeight: 1.5 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>No purchases yet</p>
                <p style={{ margin: '6px 0 0' }}>Add a purchase to visualize your spending.</p>
              </div>
            )}
            {legendOpen && byCategory.length > 0 ? (() => {
              const totalCents = byCategory.reduce((s, c) => s + c.amountCents, 0);
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                  {byCategory.map((c) => {
                    const pct = totalCents > 0 ? Math.round((c.amountCents / totalCents) * 100) : 0;
                    const isActive = drilldownCategoryId === c.categoryId;
                    return (
                      <button
                        key={c.categoryId}
                        type="button"
                        onClick={() => setDrilldownCategoryId(prev => prev === c.categoryId ? null : c.categoryId)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 10px', borderRadius: 10,
                          border: isActive ? '2px solid var(--accent)' : '1px solid var(--ui-border, var(--border))',
                          background: isActive ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                          cursor: 'pointer', textAlign: 'left', minWidth: 0,
                          fontFamily: 'var(--app-font-family)',
                        }}
                      >
                        <span style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: getCategoryColor(c.categoryId) }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--ui-primary-text, var(--text))', fontWeight: 500 }}>
                          {getCategoryName(cfg, c.categoryId)}
                        </span>
                        <span style={{ flexShrink: 0, fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600 }}>{pct}%</span>
                      </button>
                    );
                  })}
                </div>
              );
            })() : null}
          </>
        ) : view === 'card' ? (
          <div>
            {byCard.map((c) => (
              <div className="row" key={c.paymentTargetName} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="name">{c.paymentTargetName}</span>
                <span className="amount">{formatCents(c.amountCents)}</span>
              </div>
            ))}
            {!byCard.length ? <div style={{ color: 'var(--ui-primary-text, var(--text))' }}>No purchases in this period.</div> : null}
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            </div>
            {(data.cards || []).length === 0 ? (
              <div style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.9rem' }}>No cards. Add a card in Snapshot.</div>
            ) : (
              <>
                {(data.cards || []).filter((c: any) => {
                  if (!hideZeroRewards) return true;
                  const type =
                    c.rewardType ??
                    (c.rewardCashbackCents != null &&
                    (c.rewardPoints == null || c.rewardPoints === 0) &&
                    (c.rewardMiles == null || c.rewardMiles === 0)
                      ? 'cashback'
                      : c.rewardMiles != null && c.rewardMiles > 0
                        ? 'miles'
                        : 'points');
                  const bal = type === 'cashback' ? (c.rewardCashbackCents ?? 0) : type === 'miles' ? (c.rewardMiles ?? 0) : (c.rewardPoints ?? 0);
                  return bal > 0;
                }).map((c: any) => {
                  const type =
                    c.rewardType ??
                    (c.rewardCashbackCents != null &&
                    (c.rewardPoints == null || c.rewardPoints === 0) &&
                    (c.rewardMiles == null || c.rewardMiles === 0)
                      ? 'cashback'
                      : c.rewardMiles != null && c.rewardMiles > 0
                        ? 'miles'
                        : 'points');
                  const balance =
                    type === 'cashback'
                      ? c.rewardCashbackCents ?? 0
                      : type === 'miles'
                        ? c.rewardMiles ?? 0
                        : c.rewardPoints ?? 0;
                  const cpp =
                    type === 'points'
                      ? c.avgCentsPerPoint ?? undefined
                      : type === 'miles'
                        ? c.avgCentsPerMile ?? undefined
                        : undefined;
                  const approxCents =
                    (type === 'points' && cpp != null && cpp > 0) ||
                    (type === 'miles' && cpp != null && cpp > 0)
                      ? Math.round(balance * cpp)
                      : null;
                  return (
                    <div
                      key={c.id}
                      style={{
                        padding: '8px 0',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{c.name || 'Card'}</div>
                        <div style={{ fontSize: '0.95rem', color: 'var(--fg, inherit)', fontWeight: 500 }}>
                          {type === 'cashback' && formatCents(balance)}
                          {type === 'points' && `${balance.toLocaleString()} pts`}
                          {type === 'miles' && `${balance.toLocaleString()} mi`}
                          {cpp != null && cpp > 0 && (type === 'points' || type === 'miles') && approxCents != null && (
                            <span style={{ color: 'var(--ui-primary-text, var(--text))', fontWeight: 400 }}> · ~{formatCents(approxCents)}</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '2px 8px' }}
                        onClick={() =>
                          setEditBalanceModal({
                            cardId: c.id,
                            cardName: c.name || 'Card',
                            rewardType: type,
                            balance,
                            cpp,
                          })
                        }
                      >
                        Edit balance
                      </button>
                    </div>
                  );
                })}
                {(() => {
                  const { totalCashback, totalPoints, totalMiles, pointsApproxCents, milesApproxCents } = totalRewards;
                  const hasTotals =
                    (totalCashback || 0) > 0 || (totalPoints || 0) > 0 || (totalMiles || 0) > 0;
                  if (!hasTotals) return null;
                  const lineStyle = {
                    fontSize: '0.95rem' as const,
                    color: 'var(--fg, inherit)' as const,
                    fontWeight: 500 as const,
                    marginTop: 4,
                  };
                  return (
                    <div style={{ paddingTop: 12, marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))' }}>Total current</div>
                        <button
                          type="button"
                          className={`ll-toggle${hideZeroRewards ? ' active' : ''}`}
                          style={{ fontSize: '0.75rem', padding: '4px 10px', minHeight: 'unset' }}
                          onClick={() => {
                            const next = !hideZeroRewards;
                            setHideZeroRewards(next);
                            saveBoolPref(SHOW_ZERO_REWARDS_KEY, next);
                          }}
                        >
                          {hideZeroRewards ? 'Show $0' : 'Hide $0'}
                        </button>
                      </div>
                      {(totalCashback || 0) > 0 ? (
                        <div style={lineStyle}>
                          <span style={{ color: 'var(--green)' }}>{formatCents(totalCashback)}</span> cash back
                        </div>
                      ) : null}
                      {(totalPoints || 0) > 0 ? (
                        <div style={lineStyle}>
                          <span style={{ color: 'var(--green)' }}>{totalPoints.toLocaleString()}</span> points
                          {pointsApproxCents != null && pointsApproxCents > 0 ? (
                            <span style={{ color: 'var(--ui-primary-text, var(--text))', fontWeight: 400 }}> (~{formatCents(pointsApproxCents)})</span>
                          ) : null}
                        </div>
                      ) : null}
                      {(totalMiles || 0) > 0 ? (
                        <div style={lineStyle}>
                          <span style={{ color: 'var(--green)' }}>{totalMiles.toLocaleString()}</span> miles
                          {milesApproxCents != null && milesApproxCents > 0 ? (
                            <span style={{ color: 'var(--ui-primary-text, var(--text))', fontWeight: 400 }}> (~{formatCents(milesApproxCents)})</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </div>


      {view === 'category' && drilldownCategoryId ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="snapshot-util-btn"
            onClick={() => setDrilldownCategoryId(null)}
            style={{ fontSize: '0.78rem' }}
          >
            ← All categories
          </button>
          <span style={{ fontSize: '0.84rem', color: 'var(--muted)', fontWeight: 500 }}>
            Only Showing {getCategoryName(cfg, drilldownCategoryId)}
          </span>
        </div>
      ) : null}

      {view === 'category' ? (
      <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '24px 0 12px 0' }}>
        <div
          className="section-header"
          style={{ margin: 0, flex: 1 }}
          onClick={() => setPurchasesCollapsed(!purchasesCollapsed)}
        >
          <span className="section-header-left">Purchases</span>
          <span className="chevron">{purchasesCollapsed ? '▸' : '▾'}</span>
        </div>
        <button
          type="button"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--ui-primary-text, var(--text))', display: 'inline-flex', alignItems: 'center' }}
          onClick={() => {
            setSearchOpen((v) => !v);
            if (searchOpen) setSearchQuery('');
          }}
          aria-label="Search purchases"
          title="Search"
        >
          <IconMagnify />
        </button>
      </div>
      {searchOpen ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            className="ll-control"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='Search title, category, subcategory… (or "/regex/")'
            style={{ flex: 1 }}
          />
          <button type="button" className="btn clear-btn" onClick={() => setSearchQuery('')}>
            Clear
          </button>
        </div>
      ) : null}
      {!purchasesCollapsed ? (
        <div>
          <div style={purchasesCarouselHeight != null ? { height: purchasesCarouselHeight, overflow: 'hidden' } : {}}>
          <div
            className="card-carousel"
            style={{ marginBottom: 0 }}
            ref={(el) => setPurchasesCarouselRef(el)}
            onScroll={(e) => {
              const el = e.currentTarget;
              const rawIdx = el.scrollLeft / (el.clientWidth || 1);
              setPurchasesCarouselIdx(Math.round(rawIdx));
              const leftIdx = Math.floor(rawIdx);
              const rightIdx = Math.min(leftIdx + 1, el.children.length - 1);
              const progress = rawIdx - leftIdx;
              const lh = (el.children[leftIdx] as HTMLElement | undefined)?.offsetHeight ?? 0;
              const rh = (el.children[rightIdx] as HTMLElement | undefined)?.offsetHeight ?? lh;
              setPurchasesCarouselHeight(Math.round(lh + (rh - lh) * progress));
            }}
          >
          {visiblePurchases.map((p: any) => {
            const uiId = getPurchaseUiId(p);
            return (
            <div className="card-carousel-item" key={uiId}><div className="card">
              <div className="row">
                <span className="name">{p.title || 'Purchase'}</span>
                <span className="amount">{formatCents(p.amountCents || 0)}</span>
              </div>
              <div style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.9rem', marginTop: 6 }}>
                {formatLongLocalDate(p.dateISO || '')}
                {p.createdAt ? (() => {
                  const d = new Date(p.createdAt);
                  return Number.isNaN(d.getTime()) ? '' : ` at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
                })() : ''}
                {' '}•{' '}
                <span style={{ color: getCategoryColor(p.category || 'uncategorized'), fontWeight: 600 }}>
                  {getCategoryName(cfg, p.category || 'uncategorized')}
                </span>
                {p.subcategory ? <span> • {p.subcategory}</span> : null}
              </div>
              {p.notes ? (
                <div style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: 4, fontStyle: 'italic' }}>
                  {p.notes}
                </div>
              ) : null}
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                  onClick={() => {
                    setEditingPurchaseKey(uiId);
                    setReimbursementMode(false);
                    setOpenAdd(true);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                  onClick={() => setConfirmDelete({ id: p.id, label: p.title || 'Purchase' })}
                >
                  Delete
                </button>
              </div>
            </div></div>
          )})}
          </div>
          </div>
          {showAllPurchases ? (
            <div style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 6, marginBottom: 8 }}>
              {purchasesCarouselIdx + 1} of {visiblePurchases.length}
            </div>
          ) : (
            <>
              {visiblePurchases.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 6, marginBottom: 8 }}>
                  {visiblePurchases.map((_, i) => (
                    <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', display: 'inline-block', flexShrink: 0, background: i === purchasesCarouselIdx ? 'var(--ui-add-btn, var(--accent))' : 'var(--ui-border, var(--border))', transition: 'background 0.15s' }} />
                  ))}
                </div>
              )}
              {hasMorePurchases && purchasesCarouselIdx >= visiblePurchases.length - 1 ? (
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.82rem', padding: '6px 14px', minHeight: 'unset' }}
                    onClick={() => setShowAllPurchases(true)}
                  >
                    See more
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-add"
          style={{ width: '100%' }}
          onClick={() => {
            setEditingPurchaseKey(null);
            setReimbursementMode(false);
            setOpenAdd(true);
          }}
        >
          Add Purchase
        </button>
        <button
          type="button"
          className="btn btn-add"
          style={{ width: '100%' }}
          onClick={() => {
            setEditingPurchaseKey(null);
            setReimbursementMode(true);
            setOpenAdd(true);
          }}
        >
          Add Card Purchase (Full reimbursement expected)
        </button>
      </div>
      </>
      ) : null}
      <AddPurchaseModal
        open={openAdd}
        onClose={() => {
          setOpenAdd(false);
          setReimbursementMode(false);
          setEditingPurchaseKey(null);
        }}
        purchaseKey={editingPurchase ? getPurchaseUiId(editingPurchase) : null}
        reimbursementExpected={reimbursementMode}
      />

      {editBalanceModal ? (
        <EditBalanceModal
          modal={editBalanceModal}
          onClose={() => setEditBalanceModal(null)}
          onSave={(rewardType, balance, cpp) => {
            const totals: { rewardType: 'cashback' | 'miles' | 'points'; rewardCashbackCents?: number; rewardPoints?: number; rewardMiles?: number } = { rewardType };
            if (rewardType === 'cashback') totals.rewardCashbackCents = balance;
            else if (rewardType === 'points') totals.rewardPoints = balance;
            else totals.rewardMiles = balance;
            actions.updateCardRewardTotals(editBalanceModal.cardId, totals);
            if (rewardType === 'points' && cpp != null) actions.updateCardRewardCpp(editBalanceModal.cardId, { avgCentsPerPoint: cpp });
            else if (rewardType === 'miles' && cpp != null) actions.updateCardRewardCpp(editBalanceModal.cardId, { avgCentsPerMile: cpp });
            setEditBalanceModal(null);
          }}
        />
      ) : null}

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
                  const purchase = (data.purchases || []).find((x: any) => x.id === confirmDelete.id);
                  const rewardInfo = getRewardDeltaAndCardForPurchase(purchase);
                  actions.deletePurchase(confirmDelete.id);
                  logActivityEntry({ type: 'delete_purchase', label: confirmDelete.label, amountCents: purchase?.amountCents ?? undefined, ts: new Date().toISOString() });
                  setConfirmDelete(null);

                  if (!rewardInfo) return;
                  const { card, rewardDelta } = rewardInfo;
                  const cardName = card?.name || 'Card';

                  if (rewardDelta.rewardType === 'cashback') {
                    const current = card.rewardCashbackCents ?? 0;
                    const newBalance = Math.max(0, current - rewardDelta.deltaCashbackCents);
                    setRewardSubtractPopup({
                      rewardType: 'cashback',
                      cardId: card.id,
                      cardName,
                      deltaLabel: `${formatCents(rewardDelta.deltaCashbackCents)} cash back`,
                      computedDelta: rewardDelta.deltaCashbackCents,
                      newBalanceLabel: `${formatCents(newBalance)} cash back`,
                      newBalance,
                      currentBalance: current
                    });
                  } else if (rewardDelta.rewardType === 'points') {
                    const current = card.rewardPoints ?? 0;
                    const newBalance = Math.max(0, current - rewardDelta.deltaPoints);
                    setRewardSubtractPopup({
                      rewardType: 'points',
                      cardId: card.id,
                      cardName,
                      deltaLabel: `${rewardDelta.deltaPoints.toLocaleString()} points`,
                      computedDelta: rewardDelta.deltaPoints,
                      newBalanceLabel: `${newBalance.toLocaleString()} points`,
                      newBalance,
                      currentBalance: current
                    });
                  } else {
                    const current = card.rewardMiles ?? 0;
                    const newBalance = Math.max(0, current - rewardDelta.deltaMiles);
                    setRewardSubtractPopup({
                      rewardType: 'miles',
                      cardId: card.id,
                      cardName,
                      deltaLabel: `${rewardDelta.deltaMiles.toLocaleString()} miles`,
                      computedDelta: rewardDelta.deltaMiles,
                      newBalanceLabel: `${newBalance.toLocaleString()} miles`,
                      newBalance,
                      currentBalance: current
                    });
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rewardSubtractPopup ? (
        <div className="modal-overlay" style={{ zIndex: 10002 }}>
          <div className="modal">
            <h3 style={{ marginBottom: 10 }}>Update rewards?</h3>
            <p style={{ color: 'var(--ui-primary-text, var(--text))', marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
              You just deleted a purchase. Would you like to subtract {rewardSubtractPopup.deltaLabel} from your {rewardSubtractPopup.cardName} rewards? Your new balance will be {rewardSubtractPopup.newBalanceLabel}.
            </p>
            {rewardSubtractMode === 'manual' ? (
              <div className="field" style={{ marginTop: 8 }}>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 6, color: 'var(--ui-primary-text, var(--text))' }}>
                  Specify how much {rewardSubtractPopup.rewardType === 'cashback' ? 'cash back ($)' : rewardSubtractPopup.rewardType} to subtract
                </label>
                <input
                  className="ll-control"
                  value={rewardSubtractManualStr}
                  onChange={(e) => setRewardSubtractManualStr(e.target.value)}
                  inputMode={rewardSubtractPopup.rewardType === 'cashback' ? 'decimal' : 'numeric'}
                  placeholder={rewardSubtractPopup.rewardType === 'cashback' ? 'e.g. 20' : 'e.g. 40000'}
                />
              </div>
            ) : null}
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setRewardSubtractPopup(null)}
              >
                No
              </button>
              <button
                type="button"
                className="btn btn-add"
                onClick={() => {
                  if (rewardSubtractMode === 'computed') {
                    if (rewardSubtractPopup.rewardType === 'cashback') {
                      actions.updateCardRewardTotals(rewardSubtractPopup.cardId, { rewardCashbackCents: rewardSubtractPopup.newBalance });
                    } else if (rewardSubtractPopup.rewardType === 'points') {
                      actions.updateCardRewardTotals(rewardSubtractPopup.cardId, { rewardPoints: rewardSubtractPopup.newBalance });
                    } else {
                      actions.updateCardRewardTotals(rewardSubtractPopup.cardId, { rewardMiles: rewardSubtractPopup.newBalance });
                    }
                  } else {
                    // Manual delta to subtract.
                    const deltaInput =
                      rewardSubtractPopup.rewardType === 'cashback'
                        ? parseCents(rewardSubtractManualStr)
                        : Math.round(parseFloat((rewardSubtractManualStr || '0').replace(/,/g, '')));
                    const delta = Number.isFinite(deltaInput) ? deltaInput : 0;
                    if (!(delta > 0)) return;
                    const nextBalance = Math.max(0, rewardSubtractPopup.currentBalance - delta);
                    if (rewardSubtractPopup.rewardType === 'cashback') {
                      actions.updateCardRewardTotals(rewardSubtractPopup.cardId, { rewardCashbackCents: nextBalance });
                    } else if (rewardSubtractPopup.rewardType === 'points') {
                      actions.updateCardRewardTotals(rewardSubtractPopup.cardId, { rewardPoints: nextBalance });
                    } else {
                      actions.updateCardRewardTotals(rewardSubtractPopup.cardId, { rewardMiles: nextBalance });
                    }
                  }
                  setRewardSubtractPopup(null);
                }}
              >
                {rewardSubtractMode === 'computed' ? 'Yes' : 'Apply manual'}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setRewardSubtractMode((m) => (m === 'computed' ? 'manual' : 'computed'));
                  setRewardSubtractManualStr('');
                }}
                style={{ padding: '12px 16px' }}
              >
                {rewardSubtractMode === 'computed' ? 'Manual…' : 'Use computed'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EditBalanceModal({
  modal,
  onClose,
  onSave
}: {
  modal: { cardName: string; rewardType: 'cashback' | 'miles' | 'points'; balance: number; cpp: number | undefined };
  onClose: () => void;
  onSave: (rewardType: 'cashback' | 'miles' | 'points', balance: number, cpp: number | undefined) => void;
}) {
  const [rewardType, setRewardType] = useState<'cashback' | 'miles' | 'points'>(modal.rewardType);
  const [balanceStr, setBalanceStr] = useState(() =>
    modal.rewardType === 'cashback' ? (modal.balance / 100).toFixed(2) : String(modal.balance)
  );
  const [cppStr, setCppStr] = useState(() => (modal.cpp != null ? String(modal.cpp) : ''));
  const handleSubmit = () => {
    if (rewardType === 'cashback') {
      const cents = Math.max(0, Math.round(parseFloat(balanceStr || '0') * 100));
      onSave('cashback', cents, undefined);
    } else {
      const val = Math.max(0, Math.round(parseFloat(balanceStr || '0')));
      const cpp = cppStr.trim() ? parseFloat(cppStr) : undefined;
      onSave(rewardType, val, Number.isNaN(cpp) || cpp == null ? undefined : cpp);
    }
  };
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Edit rewards balance</h3>
        <p style={{ color: 'var(--ui-primary-text, var(--text))', marginTop: 0 }}>Card: <strong>{modal.cardName}</strong></p>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>
            Rewards type:
            <Select value={rewardType} onChange={(e) => setRewardType(e.target.value as 'cashback' | 'miles' | 'points')} style={{ marginLeft: 8 }}>
              <option value="cashback">Cashback ($)</option>
              <option value="points">Points</option>
              <option value="miles">Miles</option>
            </Select>
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
            Balance:{' '}
            {rewardType === 'cashback' ? (
              <input className="ll-control" type="number" min="0" step="0.01" value={balanceStr} onChange={(e) => setBalanceStr(e.target.value)} />
            ) : (
              <input className="ll-control" type="number" min="0" step="1" value={balanceStr} onChange={(e) => setBalanceStr(e.target.value)} />
            )}
          </label>
          {(rewardType === 'points' || rewardType === 'miles') ? (
            <label style={{ display: 'block', marginBottom: 8 }}>
              CPP (cents per {rewardType === 'points' ? 'point' : 'mile'}): <input className="ll-control" type="number" min="0" step="0.01" placeholder="e.g. 1.2" value={cppStr} onChange={(e) => setCppStr(e.target.value)} />
            </label>
          ) : null}
        </div>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>Save</button>
        </div>
      </div>
    </div>
  );
}

