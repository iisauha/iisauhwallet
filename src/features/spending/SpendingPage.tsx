import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCents, formatLongLocalDate } from '../../state/calc';
import { useLedgerStore } from '../../state/store';
import { useDetectedActivityOptional } from '../../state/DetectedActivityContext';
import { getCategoryName, loadCategoryConfig } from '../../state/storage';
import { useDropdownCollapsed } from '../../state/DropdownStateContext';
import { Select } from '../../ui/Select';
import { AddPurchaseModal } from './AddPurchaseModal';
import { getCategoryColor, renderSpendingPieChart } from './charts';

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

export function SpendingPage() {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);
  const detected = useDetectedActivityOptional();
  const cfg = useMemo(() => loadCategoryConfig(), []);
  const [filter, setFilter] = useState<FilterKey>('this_month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [openAdd, setOpenAdd] = useState(false);
  const [reimbursementMode, setReimbursementMode] = useState(false);

  useEffect(() => {
    if (detected?.launchFlow?.flow === 'add_purchase') setOpenAdd(true);
  }, [detected?.launchFlow?.flow]);
  const [view, setView] = useState<BreakdownView>('category');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
  const [purchasesCollapsed, setPurchasesCollapsed] = useDropdownCollapsed('spending_purchases', true);
  const [byCategoryCollapsed, setByCategoryCollapsed] = useDropdownCollapsed('spending_by_category', false);
  const [showAllPurchases, setShowAllPurchases] = useState<boolean>(false);
  const [editingPurchaseKey, setEditingPurchaseKey] = useState<string | null>(null);
  const [drilldownCategoryId, setDrilldownCategoryId] = useState<string | null>(null);
  const [editBalanceModal, setEditBalanceModal] = useState<{
    cardId: string;
    cardName: string;
    rewardType: 'cashback' | 'miles' | 'points';
    balance: number;
    cpp: number | undefined;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSlicesKeyRef = useRef<string | null>(null);

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

  const totalRewards = useMemo(() => {
    let totalCashback = 0;
    let totalPoints = 0;
    let totalMiles = 0;
    let totalApproxCents = 0;
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
          totalApproxCents += Math.round((balance * c.avgCentsPerPoint) / 100);
        }
      } else {
        totalMiles += balance;
        if (c.avgCentsPerMile != null && c.avgCentsPerMile > 0) {
          totalApproxCents += Math.round((balance * c.avgCentsPerMile) / 100);
        }
      }
    });
    return { totalCashback, totalPoints, totalMiles, totalApproxCents };
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
    const map = new Map<string, number>();
    filteredPurchases.forEach((p: any) => {
      const targetId = (p.paymentTargetId || '') as string;
      const src = (p.paymentSource || '') as string;
      const name =
        targetId && (src === 'card' || src === 'credit_card')
          ? cardById.get(targetId) || 'Unknown / Not specified'
          : targetId && (src === 'bank' || src === 'cash')
            ? bankById.get(targetId) || 'Unknown / Not specified'
            : 'Unknown / Not specified';
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
        .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || '')),
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

  const editingPurchase = useMemo(() => {
    if (!editingPurchaseKey) return null;
    const list: any[] = data.purchases || [];
    return list.find((p) => getPurchaseUiId(p) === editingPurchaseKey) || null;
  }, [editingPurchaseKey, data.purchases]);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (view !== 'category') return;
    const key = JSON.stringify(byCategory);
    const prevKey = lastSlicesKeyRef.current;
    const shouldAnimate = key !== prevKey;
    lastSlicesKeyRef.current = key;
    renderSpendingPieChart(
      canvasRef.current,
      byCategory,
      (categoryId) => {
        setDrilldownCategoryId((prev) => (prev === categoryId ? null : categoryId));
      },
      shouldAnimate
    );
  }, [byCategory, view]);

  return (
    <div className="tab-panel active" id="spendingContent">
      <div
        className="filter-bar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 14,
          paddingRight: 14,
        }}
      >
        <Select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)}>
          <option value="this_month">This Month</option>
          <option value="last_month">Last Month</option>
          <option value="all_time">All Time</option>
          <option value="custom">Custom</option>
        </Select>
        {filter === 'custom' ? (
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="ll-control" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <input className="ll-control" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginRight: 2,
            marginTop: -4,
          }}
        >
          <button
            type="button"
            className={view === 'category' ? 'btn btn-secondary ll-toggle active' : 'btn btn-secondary ll-toggle'}
            onClick={() => setView('category')}
            aria-pressed={view === 'category'}
          >
            Categories
          </button>
          <button
            type="button"
            className={view === 'rewards' || view === 'card' ? 'btn btn-secondary ll-toggle active' : 'btn btn-secondary ll-toggle'}
            onClick={() => setView((prev) => (prev === 'card' ? 'rewards' : 'card'))}
            aria-pressed={view === 'rewards' || view === 'card'}
          >
            {view === 'card' ? 'By card' : 'Rewards'}
          </button>
        </div>
      </div>

      <div
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
            <div style={{ fontSize: '1.5rem', fontWeight: 650, marginTop: 4 }}>
              {formatCents(periodTotalCents)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>Current Rewards</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: 4 }}>
              {totalRewards.totalApproxCents > 0 ? (
                <>
                  ~{formatCents(totalRewards.totalApproxCents)} <span style={{ fontSize: '0.9rem' }}>(approx)</span>
                </>
              ) : (
                '—'
              )}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: '0.75rem',
                opacity: 0.9,
                fontStyle: 'italic',
              }}
            >
              Manual balances only. Informational.
            </div>
          </div>
        </div>
      </div>

      <p className="section-title page-title" style={{ marginTop: 4 }}>
        {view === 'category' ? 'Spending distribution' : view === 'card' ? 'Spending by card' : 'Rewards overview'}
      </p>
      <div className="card">
        {view === 'category' ? (
          <div
            className="spending-chart-wrap"
            style={{ position: 'relative', width: '100%', height: 220 }}
            onClick={(e) => {
              if (drilldownCategoryId && e.target === e.currentTarget) setDrilldownCategoryId(null);
            }}
          >
            <canvas ref={canvasRef} />
            {byCategory.length > 0 && periodTotalCents > 0 ? (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 8,
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  fontSize: '0.8rem',
                }}
              >
                {byCategory.map((c) => {
                  const pct = (c.amountCents / periodTotalCents) * 100;
                  return (
                    <div
                      key={c.categoryId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '2px 6px',
                        borderRadius: 999,
                        background: 'var(--ui-surface-secondary, var(--surface))',
                      }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: getCategoryColor(c.categoryId),
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          maxWidth: 120,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {getCategoryName(cfg, c.categoryId)}
                      </span>
                      <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : view === 'card' ? (
          <div>
            {byCard.map((c) => (
              <div className="row" key={c.paymentTargetName} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="name">{c.paymentTargetName}</span>
                <span className="amount">{formatCents(c.amountCents)}</span>
              </div>
            ))}
            {!byCard.length ? <div style={{ color: 'var(--muted)' }}>No purchases in this period.</div> : null}
          </div>
        ) : (
          <div>
            {(data.cards || []).length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No cards. Add a card in Snapshot.</div>
            ) : (
              <>
                {(data.cards || []).map((c: any) => {
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
                      ? Math.round((balance * cpp) / 100)
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
                            <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · ~{formatCents(approxCents)}</span>
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
                  const { totalCashback, totalPoints, totalMiles, totalApproxCents } = totalRewards;
                  const hasTotals = totalCashback > 0 || totalPoints > 0 || totalMiles > 0;
                  if (!hasTotals && totalApproxCents === 0) return null;
                  return (
                    <div style={{ paddingTop: 12, marginTop: 8, borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 6 }}>Total current</div>
                      <div style={{ fontSize: '0.95rem', color: 'var(--fg, inherit)', fontWeight: 500 }}>
                        {totalCashback > 0 && <span>{formatCents(totalCashback)} cashback</span>}
                        {totalCashback > 0 && (totalPoints > 0 || totalMiles > 0) && ' · '}
                        {totalPoints > 0 && <span>{totalPoints.toLocaleString()} pts</span>}
                        {totalPoints > 0 && totalMiles > 0 && ' · '}
                        {totalMiles > 0 && <span>{totalMiles.toLocaleString()} mi</span>}
                        {totalApproxCents > 0 && (
                          <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · ~{formatCents(totalApproxCents)} (approx)</span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </div>

      {view === 'category' ? (
      <>
      <div
        className="section-header"
        style={{ marginTop: 20, marginBottom: 0 }}
        onClick={() => setByCategoryCollapsed(!byCategoryCollapsed)}
      >
        <span className="section-header-left">By category</span>
        <span className="chevron">{byCategoryCollapsed ? '▸' : '▾'}</span>
      </div>
      {!byCategoryCollapsed ? (
      <>
      {drilldownCategoryId ? (
        <div style={{ marginBottom: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setDrilldownCategoryId(null)}
          >
            Show all categories
          </button>
        </div>
      ) : null}
      <div>
        {byCategory.map((c) => (
          <div
            className="card"
            key={c.categoryId}
            style={{
              background: getCategoryColor(c.categoryId),
              borderColor: 'var(--border)',
              cursor: 'pointer'
            }}
            onClick={() => setDrilldownCategoryId((prev) => (prev === c.categoryId ? null : c.categoryId))}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDrilldownCategoryId((prev) => (prev === c.categoryId ? null : c.categoryId));
              }
            }}
          >
            <div className="row">
              <span className="name">{getCategoryName(cfg, c.categoryId)}</span>
              <span className="amount">{formatCents(c.amountCents)}</span>
            </div>
          </div>
        ))}
      </div>
      </>
      ) : null}
      </>
      ) : null}

      {view === 'category' ? (
      <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '24px 0 12px 0' }}>
        <div
          className="section-header"
          style={{ margin: 0, padding: '4px 8px', flex: 1 }}
          onClick={() => setPurchasesCollapsed(!purchasesCollapsed)}
        >
          <span className="section-header-left">Purchases</span>
          {drilldownCategoryId ? (
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)', marginLeft: 8 }}>
              (showing: {getCategoryName(cfg, drilldownCategoryId)})
            </span>
          ) : null}
          <span className="chevron">{purchasesCollapsed ? '▸' : '▾'}</span>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            setSearchOpen((v) => !v);
            if (searchOpen) setSearchQuery('');
          }}
          aria-label="Search purchases"
          title="Search"
        >
          🔍
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
          {visiblePurchases.map((p: any) => {
            const uiId = getPurchaseUiId(p);
            return (
            <div className="card" key={uiId}>
              <div className="row">
                <span className="name">{p.title || 'Purchase'}</span>
                <span className="amount">{formatCents(p.amountCents || 0)}</span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>
                {formatLongLocalDate(p.dateISO || '')} •{' '}
                <span style={{ color: getCategoryColor(p.category || 'uncategorized'), fontWeight: 600 }}>
                  {getCategoryName(cfg, p.category || 'uncategorized')}
                </span>
                {p.subcategory ? <span> • {p.subcategory}</span> : null}
              </div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-secondary"
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
                  onClick={() => setConfirmDelete({ id: p.id, label: p.title || 'Purchase' })}
                >
                  Delete
                </button>
              </div>
            </div>
          )})}
          {!showAllPurchases && hasMorePurchases ? (
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowAllPurchases(true)}
              >
                See more
              </button>
            </div>
          ) : null}
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
          + Add Purchase
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

      {openAdd && detected?.launchFlow?.flow === 'add_purchase' && detected.launchFlow.item ? (
        <div className="card" style={{ marginBottom: 12, padding: 10, fontSize: '0.85rem', color: 'var(--muted)', border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Detected activity (reference)</div>
          <div>Merchant: {detected.launchFlow.item.title}</div>
          <div>Amount: {formatCents(detected.launchFlow.item.amountCents)}</div>
          <div>Account: {detected.launchFlow.item.accountName}</div>
          <div>Date: {detected.launchFlow.item.dateISO}</div>
          <div>Status: {detected.launchFlow.item.pending ? 'Pending' : 'Posted'}</div>
        </div>
      ) : null}
      <AddPurchaseModal
        open={openAdd}
        onClose={() => {
          setOpenAdd(false);
          setReimbursementMode(false);
          if (detected?.launchFlow?.flow === 'add_purchase') detected.setLaunchFlow(null);
        }}
        purchaseKey={editingPurchase ? getPurchaseUiId(editingPurchase) : null}
        prefill={detected?.launchFlow?.flow === 'add_purchase' && detected.launchFlow.item ? { title: detected.launchFlow.item.title, amountCents: Math.abs(detected.launchFlow.item.amountCents), dateISO: detected.launchFlow.item.dateISO } : null}
        onSave={detected?.launchFlow?.flow === 'add_purchase' ? () => { detected.markResolved(detected.launchFlow!.detectedId, 'add_purchase'); detected.setLaunchFlow(null); setOpenAdd(false); } : undefined}
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
            <p style={{ color: 'var(--muted)', marginTop: 0 }}>{confirmDelete.label}</p>
            <div className="btn-row">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  actions.deletePurchase(confirmDelete.id);
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
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>Card: <strong>{modal.cardName}</strong></p>
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

