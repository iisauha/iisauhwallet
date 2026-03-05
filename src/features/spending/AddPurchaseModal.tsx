import { useMemo, useState } from 'react';
import { parseCents } from '../../state/calc';
import { PHYSICAL_CASH_ID } from '../../state/keys';
import { useLedgerStore } from '../../state/store';
import { getCategoryName, getCategorySubcategories, loadCategoryConfig } from '../../state/storage';

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function AddPurchaseModal(props: { open: boolean; onClose: () => void }) {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);
  const cfg = useMemo(() => loadCategoryConfig(), []);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dateISO, setDateISO] = useState(todayKey());
  const [category, setCategory] = useState('food');
  const [subcategory, setSubcategory] = useState('');
  const [notes, setNotes] = useState('');
  const [isSplit, setIsSplit] = useState(false);
  const [myPortion, setMyPortion] = useState('');
  const [applyToSnapshot, setApplyToSnapshot] = useState(false);
  const [paymentSource, setPaymentSource] = useState<'card' | 'bank' | 'cash' | ''>('');
  const [paymentTargetId, setPaymentTargetId] = useState('');

  const subs = useMemo(() => getCategorySubcategories(cfg, category), [cfg, category]);

  if (!props.open) return null;

  const totalCents = parseCents(amount);
  const myPortionCents = isSplit ? parseCents(myPortion) : totalCents;
  const inboundCents = Math.max(0, totalCents - myPortionCents);
  const splitError =
    isSplit && (myPortionCents < 0 ? 'My portion cannot be negative.' : myPortionCents > totalCents ? 'My portion cannot exceed total amount.' : '');

  const canSave =
    (title.trim().length > 0 || true) &&
    totalCents > 0 &&
    !!dateISO &&
    !!category &&
    (!isSplit || !splitError) &&
    (!applyToSnapshot || (paymentSource !== '' && (paymentSource === 'cash' || paymentTargetId)));

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Add Purchase</h3>
        <div className="field">
          <label>Title / Merchant</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Coffee shop" />
        </div>
        <div className="field">
          <label>Amount ($)</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
        </div>
        <div className="field">
          <label>Date</label>
          <input type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} />
        </div>
        <div className="field">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.keys(cfg).map((id) => (
              <option key={id} value={id}>
                {getCategoryName(cfg, id)}
              </option>
            ))}
          </select>
        </div>
        {subs.length ? (
          <div className="field">
            <label>Subcategory</label>
            <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)}>
              <option value="">—</option>
              {subs.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field">
          <label>Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>

        <div className="toggle-row">
          <input type="checkbox" checked={isSplit} onChange={(e) => setIsSplit(e.target.checked)} id="split" />
          <label htmlFor="split">Split</label>
        </div>
        {isSplit ? (
          <div className="field">
            <label>My Portion ($)</label>
            <input value={myPortion} onChange={(e) => setMyPortion(e.target.value)} inputMode="decimal" placeholder="0.00" />
            <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>
              Reimbursement (Inbound): {inboundCents > 0 ? `$${(inboundCents / 100).toFixed(2)}` : '$0.00'}
            </div>
            {splitError ? <div style={{ color: 'var(--danger)', marginTop: 6 }}>{splitError}</div> : null}
          </div>
        ) : null}

        <div className="toggle-row">
          <input type="checkbox" checked={applyToSnapshot} onChange={(e) => setApplyToSnapshot(e.target.checked)} id="apply" />
          <label htmlFor="apply">Apply to Snapshot</label>
        </div>

        {applyToSnapshot ? (
          <>
            <div className="field">
              <label>Payment Source</label>
              <select
                value={paymentSource}
                onChange={(e) => {
                  const v = e.target.value as any;
                  setPaymentSource(v);
                  setPaymentTargetId('');
                }}
              >
                <option value="">— Select source —</option>
                <option value="card">Credit Card</option>
                <option value="bank">Cash (Bank)</option>
                <option value="cash">Physical Cash</option>
              </select>
            </div>
            {paymentSource === 'card' ? (
              <div className="field">
                <label>Select Card</label>
                <select value={paymentTargetId} onChange={(e) => setPaymentTargetId(e.target.value)}>
                  <option value="">— Select —</option>
                  {(data.cards || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {paymentSource === 'bank' ? (
              <div className="field">
                <label>Select Bank</label>
                <select value={paymentTargetId} onChange={(e) => setPaymentTargetId(e.target.value)}>
                  <option value="">— Select —</option>
                  {(data.banks || []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {paymentSource === 'cash' ? (
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: -6, marginBottom: 10 }}>
                Will apply against Physical Cash ({PHYSICAL_CASH_ID}).
              </div>
            ) : null}
          </>
        ) : null}

        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={props.onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canSave}
            onClick={() => {
              if (!canSave) return;
              const purchase: any = {
                title: title.trim() || 'Purchase',
                amountCents: myPortionCents,
                dateISO,
                category,
                subcategory: subcategory || undefined,
                notes: notes || undefined
              };
              if (isSplit) {
                purchase.isSplit = true;
                purchase.splitTotalCents = totalCents;
                purchase.splitMyPortionCents = myPortionCents;
                purchase.splitInboundCents = inboundCents;
              }
              if (applyToSnapshot) {
                const appliedAmount = isSplit ? totalCents : myPortionCents;
                purchase.applyToSnapshot = true;
                purchase.paymentSource = paymentSource === 'cash' ? 'cash' : paymentSource;
                purchase.paymentTargetId = paymentSource === 'cash' ? PHYSICAL_CASH_ID : paymentTargetId;
                if (isSplit) {
                  purchase.splitSnapshot = { amountCents: appliedAmount, paymentSource: purchase.paymentSource, paymentTargetId: purchase.paymentTargetId };
                }
              }
              actions.addPurchase(purchase);
              props.onClose();
              setTitle('');
              setAmount('');
              setNotes('');
              setIsSplit(false);
              setMyPortion('');
              setApplyToSnapshot(false);
              setPaymentSource('');
              setPaymentTargetId('');
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

