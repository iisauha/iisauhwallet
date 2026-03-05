import { useMemo, useState } from 'react';
import { calcFinalNetCashCents, formatCents, parseCents } from '../../state/calc';
import { SHOW_ZERO_BALANCES_KEY, SHOW_ZERO_CARDS_KEY, SHOW_ZERO_CASH_KEY } from '../../state/keys';
import { useLedgerStore } from '../../state/store';
import { getLastPostedBankId, loadBoolPref, saveBoolPref } from '../../state/storage';
import { BankAccountCard, CreditCardCard } from './AccountCard';
import { PendingInboundList, PendingOutboundList } from './PendingList';

export function SnapshotPage() {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);

  const legacyShowZero = loadBoolPref(SHOW_ZERO_BALANCES_KEY, false);
  const [showZeroCashItems, setShowZeroCashItems] = useState<boolean>(loadBoolPref(SHOW_ZERO_CASH_KEY, legacyShowZero));
  const [showZeroCreditCards, setShowZeroCreditCards] = useState<boolean>(loadBoolPref(SHOW_ZERO_CARDS_KEY, legacyShowZero));

  const [modal, setModal] = useState<
    | { type: 'none' }
    | { type: 'add-bank'; name: string }
    | { type: 'add-card'; name: string }
    | { type: 'edit-balance'; kind: 'bank' | 'card'; id: string; amount: string; useSet: boolean }
    | { type: 'add-pending'; kind: 'in' | 'out'; label: string; amount: string; isRefund: boolean; depositTo: 'bank' | 'card'; targetCardId: string; outboundType: 'standard' | 'cc_payment'; sourceBankId: string; targetCardIdOut: string }
    | { type: 'post-bank'; kind: 'in' | 'out'; pendingId: string; bankId: string }
    | { type: 'confirm'; title: string; message: string; onConfirm: () => void }
  >({ type: 'none' });

  const totals = useMemo(() => calcFinalNetCashCents(data), [data]);
  const finalNetCashClass =
    totals.finalNetCashCents >= 0 ? 'summary-kv final-net-cash positive' : 'summary-kv final-net-cash negative';

  const visibleBanks = useMemo(() => {
    const list = data.banks || [];
    return showZeroCashItems ? list : list.filter((b) => (b.balanceCents || 0) !== 0);
  }, [data.banks, showZeroCashItems]);

  const visibleCards = useMemo(() => {
    const list = data.cards || [];
    return showZeroCreditCards ? list : list.filter((c) => (c.balanceCents || 0) !== 0);
  }, [data.cards, showZeroCreditCards]);

  function openConfirm(title: string, message: string, onConfirm: () => void) {
    setModal({ type: 'confirm', title, message, onConfirm });
  }

  function handlePendingPosted(kind: 'in' | 'out', id: string) {
    const res = actions.markPendingPosted(kind, id);
    if (!res.needsBankSelection) return;
    const last = getLastPostedBankId(kind);
    const defaultId = data.banks.some((b) => b.id === last) ? last : data.banks[0]?.id || '';
    setModal({ type: 'post-bank', kind, pendingId: id, bankId: defaultId });
  }

  return (
    <div className="tab-panel active" id="snapshotContent">
      <div className="section-header" id="bankHeader">
        <span className="section-header-left">
          Cash — <span>{formatCents(totals.bankTotalCents)}</span>
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            const next = !showZeroCashItems;
            setShowZeroCashItems(next);
            saveBoolPref(SHOW_ZERO_CASH_KEY, next);
          }}
        >
          {showZeroCashItems ? 'Hide $0 cash' : 'Show $0 cash'}
        </button>
      </div>
      <div>
        {visibleBanks.map((b) => (
          <div key={b.id}>
            <div onClick={() => setModal({ type: 'edit-balance', kind: 'bank', id: b.id, amount: '', useSet: false })}>
              <BankAccountCard bank={b} />
            </div>
            {b.type !== 'physical_cash' ? (
              <div className="btn-row" style={{ marginTop: -2, marginBottom: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: 'edit-balance', kind: 'bank', id: b.id, amount: '', useSet: false })}>
                  Add / Set
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() =>
                    openConfirm('Delete bank?', `Delete "${b.name}"? This does not erase other data.`, () => actions.deleteBankAccount(b.id))
                  }
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={() => setModal({ type: 'add-bank', name: '' })}>
        + Add Bank Account
      </button>

      <div className="section-header" id="cardHeader" style={{ marginTop: 24 }}>
        <span className="section-header-left">
          Credit Cards — <span>{formatCents(totals.ccDebtCents - totals.ccCreditCents)}</span>
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            const next = !showZeroCreditCards;
            setShowZeroCreditCards(next);
            saveBoolPref(SHOW_ZERO_CARDS_KEY, next);
          }}
        >
          {showZeroCreditCards ? 'Hide $0 balances' : 'Show $0 balances'}
        </button>
      </div>
      <div>
        {visibleCards.map((c) => (
          <div key={c.id}>
            <div onClick={() => setModal({ type: 'edit-balance', kind: 'card', id: c.id, amount: '', useSet: false })}>
              <CreditCardCard card={c} />
            </div>
            <div className="btn-row" style={{ marginTop: -2, marginBottom: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: 'edit-balance', kind: 'card', id: c.id, amount: '', useSet: false })}>
                Add / Set
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => openConfirm('Delete card?', `Delete "${c.name}"?`, () => actions.deleteCreditCard(c.id))}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={() => setModal({ type: 'add-card', name: '' })}>
        + Add Credit Card
      </button>

      <div className="section-header" id="pendingInHeader" style={{ marginTop: 24 }}>
        <span className="section-header-left">
          Pending Inbound — <span>{formatCents(totals.pendingInCents)}</span>
        </span>
      </div>
      <PendingInboundList
        data={data}
        items={data.pendingIn || []}
        onPosted={(id) => handlePendingPosted('in', id)}
        onDelete={(id) => openConfirm('Delete pending?', 'Delete this pending inbound item?', () => actions.deletePending('in', id))}
      />
      <div className="btn-row">
        <button type="button" className="btn btn-add" onClick={() => setModal({ type: 'add-pending', kind: 'in', label: '', amount: '', isRefund: false, depositTo: 'bank', targetCardId: '', outboundType: 'standard', sourceBankId: '', targetCardIdOut: '' })}>
          + Add item
        </button>
        <button type="button" className="btn clear-btn" onClick={() => openConfirm('Clear all?', 'Clear all pending inbound items?', () => actions.clearPending('in'))}>
          Clear All
        </button>
      </div>

      <div className="section-header" id="pendingOutHeader" style={{ marginTop: 24 }}>
        <span className="section-header-left">
          Pending Outbound — <span>{formatCents(totals.pendingOutCents)}</span>
        </span>
      </div>
      <PendingOutboundList
        data={data}
        items={data.pendingOut || []}
        onPosted={(id) => handlePendingPosted('out', id)}
        onDelete={(id) => openConfirm('Delete pending?', 'Delete this pending outbound item?', () => actions.deletePending('out', id))}
      />
      <div className="btn-row">
        <button type="button" className="btn btn-add" onClick={() => setModal({ type: 'add-pending', kind: 'out', label: '', amount: '', isRefund: false, depositTo: 'bank', targetCardId: '', outboundType: 'standard', sourceBankId: '', targetCardIdOut: '' })}>
          + Add item
        </button>
        <button type="button" className="btn clear-btn" onClick={() => openConfirm('Clear all?', 'Clear all pending outbound items?', () => actions.clearPending('out'))}>
          Clear All
        </button>
      </div>

      <div className="summary" id="snapshotSummary">
        <div className="summary-compact">
          <div className="summary-kv">
            <span className="k">Net Cash (Cash Total)</span>
            <span className="v">{formatCents(totals.bankTotalCents)}</span>
          </div>
          <div className="summary-kv">
            <span className="k">Total Current Credit Card Balance</span>
            <span className="v">{formatCents(totals.ccDebtCents)}</span>
          </div>
          <div className="summary-kv">
            <span className="k">Credit Card Credit</span>
            <span className="v">{formatCents(totals.ccCreditCents)}</span>
          </div>
          <div className="summary-kv">
            <span className="k">Total Pending Outbound</span>
            <span className="v">{formatCents(totals.pendingOutCents)}</span>
          </div>
          <div className="summary-kv">
            <span className="k">Total Pending Inbound</span>
            <span className="v">{formatCents(totals.pendingInCents)}</span>
          </div>
          <div className={finalNetCashClass}>
            <span className="k">Final Net Cash</span>
            <span className="v">{formatCents(totals.finalNetCashCents)}</span>
          </div>
        </div>
      </div>

      {modal.type !== 'none' ? (
        <div className="modal-overlay">
          <div className="modal">
            {modal.type === 'add-bank' ? (
              <>
                <h3>New bank account</h3>
                <div className="field">
                  <label>Name</label>
                  <input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} placeholder="Bank" />
                </div>
                <div className="btn-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: 'none' })}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      actions.addBankAccount(modal.name.trim() || 'Bank');
                      setModal({ type: 'none' });
                    }}
                  >
                    Add
                  </button>
                </div>
              </>
            ) : null}

            {modal.type === 'add-card' ? (
              <>
                <h3>New credit card</h3>
                <div className="field">
                  <label>Name</label>
                  <input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} placeholder="Card" />
                </div>
                <div className="btn-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: 'none' })}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      actions.addCreditCard(modal.name.trim() || 'Card');
                      setModal({ type: 'none' });
                    }}
                  >
                    Add
                  </button>
                </div>
              </>
            ) : null}

            {modal.type === 'edit-balance' ? (
              <>
                <h3>Amount</h3>
                <div className="field">
                  <label>Amount ($)</label>
                  <input value={modal.amount} onChange={(e) => setModal({ ...modal, amount: e.target.value })} inputMode="decimal" placeholder="0.00" />
                </div>
                <div className="toggle-row">
                  <input
                    type="checkbox"
                    checked={modal.useSet}
                    onChange={(e) => setModal({ ...modal, useSet: e.target.checked })}
                    id="useSet"
                  />
                  <label htmlFor="useSet">Set (replace value)</label>
                </div>
                <div className="btn-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: 'none' })}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const cents = parseCents(modal.amount);
                      const mode = modal.useSet ? 'set' : 'add';
                      if (modal.kind === 'bank') actions.updateBankBalance(modal.id, cents, mode);
                      else actions.updateCardBalance(modal.id, cents, mode);
                      setModal({ type: 'none' });
                    }}
                  >
                    OK
                  </button>
                </div>
              </>
            ) : null}

            {modal.type === 'add-pending' ? (
              <>
                <h3>{modal.kind === 'in' ? 'Add pending inbound item' : 'Add pending outbound item'}</h3>
                <div className="field">
                  <label>Label</label>
                  <input value={modal.label} onChange={(e) => setModal({ ...modal, label: e.target.value })} placeholder="e.g. Venmo" />
                </div>
                <div className="field">
                  <label>Amount ($)</label>
                  <input value={modal.amount} onChange={(e) => setModal({ ...modal, amount: e.target.value })} inputMode="decimal" placeholder="0.00" />
                </div>

                {modal.kind === 'in' ? (
                  <>
                    <div className="toggle-row">
                      <input type="checkbox" checked={modal.isRefund} onChange={(e) => setModal({ ...modal, isRefund: e.target.checked })} id="isRefund" />
                      <label htmlFor="isRefund">Is this a refund/credit?</label>
                    </div>
                    <div className="field">
                      <label>Deposit To</label>
                      <select
                        value={modal.isRefund ? 'card' : modal.depositTo}
                        onChange={(e) => setModal({ ...modal, depositTo: e.target.value as any })}
                        disabled={modal.isRefund}
                      >
                        <option value="bank">Bank</option>
                        <option value="card">Credit Card</option>
                      </select>
                    </div>
                    {modal.isRefund || modal.depositTo === 'card' ? (
                      <div className="field">
                        <label>Card</label>
                        <select value={modal.targetCardId} onChange={(e) => setModal({ ...modal, targetCardId: e.target.value })}>
                          <option value="">— Select —</option>
                          {(data.cards || []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="field">
                        <label>Bank (optional)</label>
                        <select value={(modal as any).targetBankId || ''} onChange={(e) => setModal({ ...(modal as any), targetBankId: e.target.value })}>
                          <option value="">— Select —</option>
                          {(data.banks || []).map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="field">
                      <label>Outbound Type</label>
                      <select value={modal.outboundType} onChange={(e) => setModal({ ...modal, outboundType: e.target.value as any })}>
                        <option value="standard">Standard Outbound</option>
                        <option value="cc_payment">Credit Card Payment</option>
                      </select>
                    </div>
                    {modal.outboundType === 'cc_payment' ? (
                      <>
                        <div className="field">
                          <label>From Bank</label>
                          <select value={modal.sourceBankId} onChange={(e) => setModal({ ...modal, sourceBankId: e.target.value })}>
                            <option value="">— Select —</option>
                            {(data.banks || []).map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>To Credit Card</label>
                          <select value={modal.targetCardIdOut} onChange={(e) => setModal({ ...modal, targetCardIdOut: e.target.value })}>
                            <option value="">— Select —</option>
                            {(data.cards || []).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    ) : null}
                  </>
                )}

                <div className="btn-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: 'none' })}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-add"
                    onClick={() => {
                      const amountCents = parseCents(modal.amount);
                      if (!(amountCents > 0)) return;
                      if (modal.kind === 'in') {
                        const depositTo = modal.isRefund ? 'card' : modal.depositTo;
                        if (depositTo === 'card' && !modal.targetCardId) return;
                        actions.addPendingInbound({
                          label: modal.label.trim() || 'Pending',
                          amountCents,
                          depositTo,
                          isRefund: modal.isRefund || depositTo === 'card' ? true : undefined,
                          targetCardId: depositTo === 'card' ? modal.targetCardId : undefined,
                          targetBankId: depositTo === 'bank' ? ((modal as any).targetBankId || undefined) : undefined
                        });
                      } else {
                        if (modal.outboundType === 'cc_payment') {
                          if (!modal.sourceBankId || !modal.targetCardIdOut) return;
                          actions.addPendingOutbound({
                            label: modal.label.trim() || 'Pending',
                            amountCents,
                            outboundType: 'cc_payment',
                            sourceBankId: modal.sourceBankId,
                            targetCardId: modal.targetCardIdOut
                          });
                        } else {
                          actions.addPendingOutbound({ label: modal.label.trim() || 'Pending', amountCents, outboundType: 'standard' });
                        }
                      }
                      setModal({ type: 'none' });
                    }}
                  >
                    Add
                  </button>
                </div>
              </>
            ) : null}

            {modal.type === 'post-bank' ? (
              <>
                <h3>{modal.kind === 'in' ? 'Confirm deposit posted' : 'Confirm payment posted'}</h3>
                <p style={{ color: 'var(--muted)', marginTop: 0 }}>
                  {modal.kind === 'in' ? 'Which bank should this deposit go to?' : 'Which bank should this subtract from?'}
                </p>
                <div className="field">
                  <label>Bank account</label>
                  <select value={modal.bankId} onChange={(e) => setModal({ ...modal, bankId: e.target.value })}>
                    {(data.banks || []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="btn-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: 'none' })}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      actions.markPendingPosted(modal.kind, modal.pendingId, modal.bankId);
                      setModal({ type: 'none' });
                    }}
                  >
                    Confirm
                  </button>
                </div>
              </>
            ) : null}

            {modal.type === 'confirm' ? (
              <>
                <h3>{modal.title}</h3>
                <p style={{ color: 'var(--muted)' }}>{modal.message}</p>
                <div className="btn-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: 'none' })}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      modal.onConfirm();
                      setModal({ type: 'none' });
                    }}
                  >
                    Confirm
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

