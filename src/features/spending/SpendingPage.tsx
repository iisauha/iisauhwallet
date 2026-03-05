import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCents } from '../../state/calc';
import { useLedgerStore } from '../../state/store';
import { getCategoryName, loadCategoryConfig } from '../../state/storage';
import { AddPurchaseModal } from './AddPurchaseModal';
import { renderSpendingPieChart } from './charts';

type FilterKey = 'this_month' | 'last_month' | 'all_time' | 'custom';

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
  const [filter, setFilter] = useState<FilterKey>('this_month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [openAdd, setOpenAdd] = useState(false);

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

  const filteredPurchases = useMemo(() => {
    const list: any[] = data.purchases || [];
    return list.filter((p) => {
      const k = p.dateISO || '';
      if (!k) return false;
      return k >= startKey && k < endKey;
    });
  }, [data.purchases, startKey, endKey]);

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

  useEffect(() => {
    if (!canvasRef.current) return;
    renderSpendingPieChart(canvasRef.current, byCategory);
  }, [byCategory]);

  const cfg = useMemo(() => loadCategoryConfig(), []);

  return (
    <div className="tab-panel active" id="spendingContent">
      <div className="filter-bar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)}>
          <option value="this_month">This Month</option>
          <option value="last_month">Last Month</option>
          <option value="all_time">All Time</option>
          <option value="custom">Custom</option>
        </select>
        {filter === 'custom' ? (
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </span>
        ) : null}
      </div>

      <p className="section-title">Spending distribution</p>
      <div className="card">
        <div className="spending-chart-wrap" style={{ position: 'relative', width: '100%', height: 220 }}>
          <canvas ref={canvasRef} />
        </div>
      </div>

      <p className="section-title">This period total</p>
      <div className="card">
        <span className="amount">{formatCents(periodTotalCents)}</span>
      </div>

      <p className="section-title">By category</p>
      <div>
        {byCategory.map((c) => (
          <div className="card" key={c.categoryId}>
            <div className="row">
              <span className="name">{getCategoryName(cfg, c.categoryId)}</span>
              <span className="amount">{formatCents(c.amountCents)}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="section-title">Purchases</p>
      <div>
        {filteredPurchases
          .slice()
          .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || ''))
          .map((p: any) => (
            <div className="card" key={p.id}>
              <div className="row">
                <span className="name">{p.title || 'Purchase'}</span>
                <span className="amount">{formatCents(p.amountCents || 0)}</span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>
                {p.dateISO || ''} • {getCategoryName(cfg, p.category || 'uncategorized')}
              </div>
              <div className="btn-row">
                <button type="button" className="btn btn-danger" onClick={() => actions.deletePurchase(p.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
      </div>

      <button type="button" className="btn btn-add" style={{ marginTop: 16, width: '100%' }} onClick={() => setOpenAdd(true)}>
        + Add Purchase
      </button>

      <AddPurchaseModal open={openAdd} onClose={() => setOpenAdd(false)} />
    </div>
  );
}

