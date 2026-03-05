import { useEffect, useMemo, useState } from 'react';
import { formatLongLocalDate, parseCents } from '../../state/calc';
import { useLedgerStore } from '../../state/store';
import { loadCategoryConfig, getCategoryName, getCategorySubcategories } from '../../state/storage';
import { Select } from '../../ui/Select';

export function RecurringPage() {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);
  const cfg = useMemo(() => loadCategoryConfig(), []);

  useEffect(() => {
    actions.processRecurringBillsUpToToday();
  }, [actions]);

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [expectedMin, setExpectedMin] = useState('');
  const [expectedMax, setExpectedMax] = useState('');
  const [frequency, setFrequency] = useState<'monthly' | 'weekly' | 'biweekly' | 'yearly' | 'every_n_days'>('monthly');
  const [everyNDays, setEveryNDays] = useState('30');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  });
  const [active, setActive] = useState(true);
  const [autoPay, setAutoPay] = useState(false);
  const [paymentSource, setPaymentSource] = useState<'card' | 'bank' | ''>('');
  const [paymentTargetId, setPaymentTargetId] = useState('');
  const [category, setCategory] = useState('food');
  const [subcategory, setSubcategory] = useState('');
  const [notes, setNotes] = useState('');
  const [isSplit, setIsSplit] = useState(false);
  const [myPortion, setMyPortion] = useState('');
  const [useLastDayOfMonth, setUseLastDayOfMonth] = useState(false);

  const subs = useMemo(() => getCategorySubcategories(cfg, category), [cfg, category]);

  const recurring = (data as any).recurring || [];
  const income = recurring.filter((r: any) => r.type === 'income');
  const expenses = recurring.filter((r: any) => (r.type || 'expense') !== 'income');
  const expensesByCategory = useMemo(() => {
    const map = new Map<string, any[]>();
    expenses.forEach((r: any) => {
      const cat = (r.category || 'uncategorized') as string;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(r);
    });
    return Array.from(map.entries());
  }, [expenses]);
  const [expensesCollapsed, setExpensesCollapsed] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);

  return (
    <div className="tab-panel active" id="recurringContent">
      <p className="section-title">Recurring Items</p>
      <p className="section-title" style={{ marginTop: 16, fontSize: '1rem' }}>
        Recurring Income
      </p>
      {income.map((r: any) => (
        <div className="card" key={r.id}>
          <div className="row">
            <span className="name">{r.name || 'Income'}</span>
            <span className="amount">{`$${((r.amountCents || 0) / 100).toFixed(2)}`}</span>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>
            {r.frequency || 'monthly'} • start {formatLongLocalDate(r.startDate)}
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setConfirmDelete({ id: r.id, label: r.name || 'Recurring income' })}
            >
              Delete
            </button>
          </div>
        </div>
      ))}

      <p className="section-title" style={{ marginTop: 24, fontSize: '1rem' }}>
        Recurring Expenses
      </p>
      {expensesByCategory.map(([catId, items]) => {
        const headerLabel = getCategoryName(cfg, catId);
        const collapsed = expensesCollapsed[catId] ?? true;
        return (
          <div key={catId} style={{ marginBottom: 8 }}>
            <div
              className="section-header"
              onClick={() => setExpensesCollapsed((prev) => ({ ...prev, [catId]: !collapsed }))}
            >
              <span className="section-header-left">
                {headerLabel} — <span>{items.length} item{items.length === 1 ? '' : 's'}</span>
              </span>
              <span className="chevron">{collapsed ? '▸' : '▾'}</span>
            </div>
            {!collapsed ? (
              <>
                {items.map((r: any) => (
                  <div className="card" key={r.id}>
                    <div className="row">
                      <span className="name">{r.name || 'Expense'}</span>
                      <span className="amount">{`$${((r.amountCents || 0) / 100).toFixed(2)}`}</span>
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>
                      {getCategoryName(cfg, r.category || 'uncategorized')} • {r.frequency || 'monthly'} • start{' '}
                      {formatLongLocalDate(r.startDate)} {r.autoPay ? '• autopay' : ''}
                    </div>
                    <div className="btn-row">
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => setConfirmDelete({ id: r.id, label: r.name || 'Recurring' })}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </>
            ) : null}
          </div>
        );
      })}

      <button type="button" className="btn btn-add" style={{ marginTop: 16, width: '100%' }} onClick={() => setOpen(true)}>
        + Add Recurring Item
      </button>

      {open ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Recurring Item</h3>
            <div className="field">
              <label>Type</label>
              <Select value={type} onChange={(e) => setType(e.target.value as any)}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </Select>
            </div>
            <div className="field">
              <label>Name / Merchant</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent" />
            </div>
            <div className="field">
              <label>Amount ($)</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
            </div>
            <div className="field">
              <label>Expected min ($) optional</label>
              <input value={expectedMin} onChange={(e) => setExpectedMin(e.target.value)} inputMode="decimal" placeholder="e.g. 90" />
            </div>
            <div className="field">
              <label>Expected max ($) optional</label>
              <input value={expectedMax} onChange={(e) => setExpectedMax(e.target.value)} inputMode="decimal" placeholder="e.g. 150" />
            </div>

            {type !== 'income' ? (
              <>
                <div className="toggle-row">
                  <input
                    type="checkbox"
                    checked={isSplit}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setIsSplit(next);
                      if (next) {
                        const totalCents = parseCents(amount);
                        if (totalCents > 0) {
                          const half = Math.round(totalCents / 2);
                          setMyPortion((half / 100).toFixed(2));
                        }
                      } else {
                        setMyPortion('');
                      }
                    }}
                    id="recSplit"
                  />
                  <label htmlFor="recSplit">Split with others</label>
                </div>
                {isSplit ? (
                  <div className="field">
                    <label>My portion ($)</label>
                    <input value={myPortion} onChange={(e) => setMyPortion(e.target.value)} inputMode="decimal" placeholder="0.00" />
                  </div>
                ) : null}
                <div className="field">
                  <label>Category</label>
                  <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {Object.keys(cfg).map((id) => (
                      <option key={id} value={id}>
                        {getCategoryName(cfg, id)}
                      </option>
                    ))}
                  </Select>
                </div>
                {subs.length ? (
                  <div className="field">
                    <label>Subcategory</label>
                    <Select value={subcategory} onChange={(e) => setSubcategory(e.target.value)}>
                      <option value="">—</option>
                      {subs.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="field">
              <label>Notes (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>

            <div className="field">
              <label>Frequency</label>
              <Select value={frequency} onChange={(e) => setFrequency(e.target.value as any)}>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="yearly">Yearly</option>
                <option value="every_n_days">Custom (every N days)</option>
              </Select>
            </div>
            {frequency === 'every_n_days' ? (
              <div className="field">
                <label>Every N days</label>
                <input type="number" value={everyNDays} onChange={(e) => setEveryNDays(e.target.value)} min={1} step={1} />
              </div>
            ) : null}
            <div className="field">
              <label>Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    setStartDate(v);
                    return;
                  }
                  if (useLastDayOfMonth) {
                    const [y, m] = v.split('-').map(Number);
                    if (Number.isFinite(y) && Number.isFinite(m)) {
                      const last = new Date(y, m, 0);
                      const mm = String(last.getMonth() + 1).padStart(2, '0');
                      const dd = String(last.getDate()).padStart(2, '0');
                      setStartDate(`${y}-${mm}-${dd}`);
                    } else {
                      setStartDate(v);
                    }
                  } else {
                    setStartDate(v);
                  }
                }}
              />
            </div>
            <div className="toggle-row">
              <input
                type="checkbox"
                checked={useLastDayOfMonth}
                onChange={(e) => {
                  const next = e.target.checked;
                  setUseLastDayOfMonth(next);
                  if (next && startDate) {
                    const [yStr, mStr] = startDate.split('-');
                    const y = Number(yStr);
                    const m = Number(mStr);
                    if (Number.isFinite(y) && Number.isFinite(m)) {
                      const last = new Date(y, m, 0);
                      const mm = String(last.getMonth() + 1).padStart(2, '0');
                      const dd = String(last.getDate()).padStart(2, '0');
                      setStartDate(`${y}-${mm}-${dd}`);
                    }
                  }
                }}
                id="lastDay"
              />
              <label htmlFor="lastDay">Use last day of month</label>
            </div>
            <div className="toggle-row">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} id="active" />
              <label htmlFor="active">Active</label>
            </div>
            <div className="toggle-row">
              <input type="checkbox" checked={autoPay} onChange={(e) => setAutoPay(e.target.checked)} id="autopay" />
              <label htmlFor="autopay">Auto Pay / Auto Deposit</label>
            </div>

            {type === 'income' ? (
              <div className="field">
                <label>Default deposit bank (for posting)</label>
                <Select value={paymentTargetId} onChange={(e) => setPaymentTargetId(e.target.value)}>
                  <option value="">— Select bank —</option>
                  {(data.banks || []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <>
                <div className="field">
                  <label>Default payment source</label>
                  <Select value={paymentSource} onChange={(e) => setPaymentSource(e.target.value as any)}>
                    <option value="">— Select source —</option>
                    <option value="card">Credit Card</option>
                    <option value="bank">Cash (Bank)</option>
                  </Select>
                </div>
                <div className="field">
                  <label>Default payment target</label>
                  <Select value={paymentTargetId} onChange={(e) => setPaymentTargetId(e.target.value)}>
                    <option value="">— Select —</option>
                    {(paymentSource === 'card' ? data.cards : data.banks).map((x: any) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}

            <div className="btn-row">
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const amountCents = parseCents(amount);
                  if (!(amountCents > 0)) return;
                  const expectedMinCents = expectedMin.trim() ? parseCents(expectedMin) : undefined;
                  const expectedMaxCents = expectedMax.trim() ? parseCents(expectedMax) : undefined;
                  const every = frequency === 'every_n_days' ? Math.max(1, parseInt(everyNDays || '1', 10) || 1) : undefined;
                  const intervalDays = frequency === 'every_n_days' ? every : undefined;
                  actions.addRecurringItem({
                    name: name.trim() || (type === 'income' ? 'Recurring income' : 'Recurring'),
                    amountCents,
                    expectedMinCents,
                    expectedMaxCents,
                    type,
                    frequency,
                    everyNDays: every,
                    intervalDays,
                    startDate,
                    endDate: undefined,
                    active,
                    autoPay: autoPay || undefined,
                    paymentSource: type === 'income' ? undefined : paymentSource || undefined,
                    paymentTargetId: paymentTargetId || undefined,
                    useLastDayOfMonth: useLastDayOfMonth || undefined,
                    category: type === 'income' ? undefined : category,
                    subcategory: type === 'income' ? undefined : (subcategory || undefined),
                    notes: notes || undefined,
                    isSplit: type !== 'income' && isSplit ? true : undefined,
                    myPortionCents: type !== 'income' && isSplit ? parseCents(myPortion) : undefined
                  });
                  setOpen(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
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
                  actions.deleteRecurringItem(confirmDelete.id);
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

