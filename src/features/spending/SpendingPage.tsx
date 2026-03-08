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
type BreakdownView = 'category' | 'card';

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

function hexToRgba(hex: string, alpha: number) {
  const clean = (hex || '').replace('#', '').trim();
  const full =
    clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.length === 6 ? clean : '64748b';
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${Number.isFinite(r) ? r : 100}, ${Number.isFinite(g) ? g : 116}, ${Number.isFinite(b) ? b : 139}, ${alpha})`;
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

  useEffect(() => {
    if (detected?.launchFlow?.flow === 'add_purchase') setOpenAdd(true);
  }, [detected?.launchFlow?.flow]);
  const [view, setView] = useState<BreakdownView>('category');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
  const [purchasesCollapsed, setPurchasesCollapsed] = useDropdownCollapsed('spending_purchases', true);
  const [showAllPurchases, setShowAllPurchases] = useState<boolean>(false);
  const [editingPurchaseKey, setEditingPurchaseKey] = useState<string | null>(null);

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

  const filteredPurchases = useMemo(() => {
    const q = (searchQuery || '').trim();
    if (!q) return periodPurchases;
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

    return periodPurchases.filter((p: any) => {
      const title = String(p.title || '');
      const catId = String(p.category || 'uncategorized');
      const catName = String(getCategoryName(cfg, catId) || '');
      const sub = String(p.subcategory || '');
      const haystack = `${title} ${catName} ${sub}`;
      if (rx) return rx.test(haystack);
      return haystack.toLowerCase().includes(lower);
    });
  }, [periodPurchases, searchQuery, cfg]);

  const periodTotalCents = useMemo(() => {
    return filteredPurchases.reduce((s, p) => s + (p.amountCents || 0), 0);
  }, [filteredPurchases]);

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

  const sortedPurchases = useMemo(
    () =>
      filteredPurchases
        .slice()
        .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || '')),
    [filteredPurchases]
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
    renderSpendingPieChart(canvasRef.current, byCategory);
  }, [byCategory, view]);

  return (
    <div className="tab-panel active" id="spendingContent">
      <div className="filter-bar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
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
        <button
          type="button"
          className={view === 'card' ? 'btn btn-secondary ll-toggle active' : 'btn btn-secondary ll-toggle'}
          onClick={() => setView((v) => (v === 'category' ? 'card' : 'category'))}
          aria-pressed={view === 'card'}
        >
          By Card
        </button>
      </div>

      <p className="section-title">Spending distribution</p>
      <div className="card">
        {view === 'category' ? (
          <div className="spending-chart-wrap" style={{ position: 'relative', width: '100%', height: 220 }}>
            <canvas ref={canvasRef} />
          </div>
        ) : (
          <div>
            {byCard.map((c) => (
              <div className="row" key={c.paymentTargetName} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="name">{c.paymentTargetName}</span>
                <span className="amount">{formatCents(c.amountCents)}</span>
              </div>
            ))}
            {!byCard.length ? <div style={{ color: 'var(--muted)' }}>No purchases in this period.</div> : null}
          </div>
        )}
      </div>

      <p className="section-title">This period total</p>
      <div className="card">
        <span className="amount">{formatCents(periodTotalCents)}</span>
      </div>

      <p className="section-title">By category</p>
      <div>
        {byCategory.map((c) => (
          <div
            className="card"
            key={c.categoryId}
            style={{ background: hexToRgba(getCategoryColor(c.categoryId), 0.14), borderColor: 'var(--border)' }}
          >
            <div className="row">
              <span className="name">{getCategoryName(cfg, c.categoryId)}</span>
              <span className="amount">{formatCents(c.amountCents)}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px 0' }}>
        <div
          className="section-header"
          style={{ margin: 0, padding: '4px 8px', flex: 1 }}
          onClick={() => setPurchasesCollapsed(!purchasesCollapsed)}
        >
          <span className="section-header-left">Purchases</span>
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

      <button
        type="button"
        className="btn btn-add"
        style={{ marginTop: 16, width: '100%' }}
        onClick={() => {
          setEditingPurchaseKey(null);
          setOpenAdd(true);
        }}
      >
        + Add Purchase
      </button>

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
          if (detected?.launchFlow?.flow === 'add_purchase') detected.setLaunchFlow(null);
        }}
        purchaseKey={editingPurchase ? getPurchaseUiId(editingPurchase) : null}
        prefill={detected?.launchFlow?.flow === 'add_purchase' && detected.launchFlow.item ? { title: detected.launchFlow.item.title, amountCents: Math.abs(detected.launchFlow.item.amountCents), dateISO: detected.launchFlow.item.dateISO } : null}
        onSave={detected?.launchFlow?.flow === 'add_purchase' ? () => { detected.markResolved(detected.launchFlow!.detectedId, 'add_purchase'); detected.setLaunchFlow(null); setOpenAdd(false); } : undefined}
      />

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

