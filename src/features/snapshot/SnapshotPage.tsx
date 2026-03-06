import { useMemo, useState } from 'react';
import { calcFinalNetCashCents, formatCents, parseCents } from '../../state/calc';
import { SHOW_ZERO_BALANCES_KEY, SHOW_ZERO_CARDS_KEY, SHOW_ZERO_CASH_KEY } from '../../state/keys';
import { useLedgerStore } from '../../state/store';
import { getLastPostedBankId, loadBoolPref, saveBoolPref } from '../../state/storage';
import { useDropdownCollapsed } from '../../state/DropdownStateContext';
import { Select } from '../../ui/Select';
import { BankAccountCard, CreditCardCard } from './AccountCard';
import { PendingInboundList, PendingOutboundList } from './PendingList';

export function SnapshotPage() {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);

  const legacyShowZero = loadBoolPref(SHOW_ZERO_BALANCES_KEY, false);
  const [showZeroCashItems, setShowZeroCashItems] = useState<boolean>(loadBoolPref(SHOW_ZERO_CASH_KEY, legacyShowZero));
  const [showZeroCreditCards, setShowZeroCreditCards] = useState<boolean>(loadBoolPref(SHOW_ZERO_CARDS_KEY, legacyShowZero));
  const [cashCollapsed, setCashCollapsed] = useDropdownCollapsed('snapshot_cash', true);
  const [cardsCollapsed, setCardsCollapsed] = useDropdownCollapsed('snapshot_cards', true);
  const [pendingInCollapsed, setPendingInCollapsed] = useDropdownCollapsed('snapshot_pending_in', true);
  const [pendingOutCollapsed, setPendingOutCollapsed] = useDropdownCollapsed('snapshot_pending_out', true);

  const [modal, setModal] = useState<
    | { type: 'none' }
    | { type: 'add-bank'; name: string }
    | { type: 'add-card'; name: string }
    | { type: 'edit-balance'; kind: 'bank' | 'card'; id: string; amount: string; useSet: boolean }
    | { type: 'add-pending'; kind: 'in' | 'out'; label: string; amount: string; isRefund: boolean; depositTo: 'bank' | 'card'; targetCardId: string; outboundType: 'standard' | 'cc_payment'; sourceBankId: string; targetCardIdOut: string }
    | { type: 'post-inbound'; pendingId: string; isRefund: boolean; dest: string }
    | { type: 'post-bank'; kind: 'out'; pendingId: string; bankId: string }
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
    if (kind === 'in') {
      const last = getLastPostedBankId('in');
      const defaultBankId = data.banks.some((b) => b.id === last) ? last : data.banks[0]?.id || '';
      setModal({ type: 'post-inbound', pendingId: id, isRefund: false, dest: `bank:${defaultBankId}` });
    } else {
      const last = getLastPostedBankId('out');
      const defaultId = data.banks.some((b) => b.id === last) ? last : data.banks[0]?.id || '';
      setModal({ type: 'post-bank', kind: 'out', pendingId: id, bankId: `bank:${defaultId}` });
    }
  }

  return (
    <div className="tab-panel active" id="snapshotContent">
      <div
        className="section-header"
        id="bankHeader"
        style={{ background: 'rgba(22, 163, 74, 0.12)' }}
        onClick={() => setCashCollapsed(!cashCollapsed)}
      >
        <span className="section-header-left" style={{ color: 'var(--green)' }}>
          Cash — <span>{formatCents(totals.bankTotalCents)}</span>
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={(e) => {
            e.stopPropagation();
            const next = !showZeroCashItems;
            setShowZeroCashItems(next);
            saveBoolPref(SHOW_ZERO_CASH_KEY, next);
          }}
        >
          {showZeroCashItems ? 'Hide $0 cash' : 'Show $0 cash'}
        </button>
        <span className="chevron">{cashCollapsed ? '▸' : '▾'}</span>
      </div>
      {!cashCollapsed ? (
        <>
          <div>
            {visibleBanks.map((b) => (
              <div className="card ll-account-card" key={b.id}>
                <button
                  type="button"
                  className="ll-card-button"
                  onClick={() => setModal({ type: 'edit-balance', kind: 'bank', id: b.id, amount: '', useSet: false })}
                >
                  <BankAccountCard bank={b} />
                </button>
                <div className="btn-row" style={{ marginTop: 10, marginBottom: 0 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setModal({ type: 'edit-balance', kind: 'bank', id: b.id, amount: '', useSet: false })}
                  >
                    Add / Set
                  </button>
                  <button
                    type="button"
                    className="btn clear-btn"
                    onClick={() => {
                      actions.updateBankBalance(b.id, 0, 'set');
                    }}
                  >
                    Clear
                  </button>
                  {b.type !== 'physical_cash' ? (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() =>
                        openConfirm(
                          'Are you sure you want to delete this?',
                          'Are you sure you want to delete this?',
                          () => actions.deleteBankAccount(b.id)
                        )
                      }
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-add" style={{ width: '100%', marginTop: 8 }} onClick={() => setModal({ type: 'add-bank', name: '' })}>
            + Add Bank Account
          </button>
        </>
      ) : null}

      <div
        className="section-header"
        id="cardHeader"
        style={{ marginTop: 24, background: 'rgba(220, 38, 38, 0.12)' }}
        onClick={() => setCardsCollapsed(!cardsCollapsed)}
      >
        <span className="section-header-left" style={{ color: 'var(--red)' }}>
          Credit Cards — <span>{formatCents(totals.ccDebtCents - totals.ccCreditCents)}</span>
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={(e) => {
            e.stopPropagation();
            const next = !showZeroCreditCards;
            setShowZeroCreditCards(next);
            saveBoolPref(SHOW_ZERO_CARDS_KEY, next);
          }}
        >
          {showZeroCreditCards ? 'Hide $0 balances' : 'Show $0 balances'}
        </button>
        <span className="chevron">{cardsCollapsed ? '▸' : '▾'}</span>
      </div>
      {!cardsCollapsed ? (
        <>
          <div>
            {visibleCards.map((c) => (
              <div className="card ll-account-card" key={c.id}>
                <button
                  type="button"
                  className="ll-card-button"
                  onClick={() => setModal({ type: 'edit-balance', kind: 'card', id: c.id, amount: '', useSet: false })}
                >
                  <CreditCardCard card={c} />
                </button>
                <div className="btn-row" style={{ marginTop: 10, marginBottom: 0 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setModal({ type: 'edit-balance', kind: 'card', id: c.id, amount: '', useSet: false })}
                  >
                    Add / Set
                  </button>
                  <button
                    type="button"
                    className="btn clear-btn"
                    onClick={() => {
                      actions.updateCardBalance(c.id, 0, 'set');
                    }}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() =>
                      openConfirm(
                        'Are you sure you want to delete this?',
                        'Are you sure you want to delete this?',
                        () => actions.deleteCreditCard(c.id)
                      )
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-add" style={{ width: '100%', marginTop: 8 }} onClick={() => setModal({ type: 'add-card', name: '' })}>
            + Add Credit Card
          </button>
        </>
      ) : null}

      <div
        className="section-header"
        id="pendingInHeader"
        style={{ marginTop: 24, background: 'rgba(22, 163, 74, 0.12)' }}
        onClick={() => setPendingInCollapsed(!pendingInCollapsed)}
      >
        <span className="section-header-left" style={{ color: 'var(--green)' }}>
          Pending Inbound — <span>{formatCents(totals.pendingInCents)}</span>
        </span>
        <span className="chevron">{pendingInCollapsed ? '▸' : '▾'}</span>
      </div>
      {!pendingInCollapsed ? (
        <div className="pending-inbound-wrapper">
          <PendingInboundList
            data={data}
            items={data.pendingIn || []}
            onPosted={(id) => handlePendingPosted('in', id)}
            onDelete={(id) => openConfirm('Are you sure you want to delete this?', 'Are you sure you want to delete this?', () => actions.deletePending('in', id))}
          />
          <div className="btn-row">
            <button type="button" className="btn btn-add" onClick={() => setModal({ type: 'add-pending', kind: 'in', label: '', amount: '', isRefund: false, depositTo: 'bank', targetCardId: '', outboundType: 'standard', sourceBankId: '', targetCardIdOut: '' })}>
              + Add item
            </button>
            <button type="button" className="btn clear-btn" onClick={() => openConfirm('Clear all?', 'Clear all pending inbound items?', () => actions.clearPending('in'))}>
              Clear All
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="section-header"
        id="pendingOutHeader"
        style={{ marginTop: 24, background: 'rgba(220, 38, 38, 0.12)' }}
        onClick={() => setPendingOutCollapsed(!pendingOutCollapsed)}
      >
        <span className="section-header-left" style={{ color: 'var(--red)' }}>
          Pending Outbound — <span>{formatCents(totals.pendingOutCents)}</span>
        </span>
        <span className="chevron">{pendingOutCollapsed ? '▸' : '▾'}</span>
      </div>
      {!pendingOutCollapsed ? (
        <div className="pending-outbound-wrapper">
          <PendingOutboundList
            data={data}
            items={data.pendingOut || []}
            onPosted={(id) => handlePendingPosted('out', id)}
            onDelete={(id) => openConfirm('Are you sure you want to delete this?', 'Are you sure you want to delete this?', () => actions.deletePending('out', id))}
          />
          <div className="btn-row">
            <button type="button" className="btn btn-add" onClick={() => setModal({ type: 'add-pending', kind: 'out', label: '', amount: '', isRefund: false, depositTo: 'bank', targetCardId: '', outboundType: 'standard', sourceBankId: '', targetCardIdOut: '' })}>
              + Add item
            </button>
            <button type="button" className="btn clear-btn" onClick={() => openConfirm('Clear all?', 'Clear all pending outbound items?', () => actions.clearPending('out'))}>
              Clear All
            </button>
          </div>
        </div>
      ) : null}

      <div className="summary" id="snapshotSummary">
        <div className="summary-compact">
          <div className="summary-kv">
            <span className="k">Net Cash (Cash Total)</span>
            <span className="v" style={{ color: 'var(--green)' }}>{formatCents(totals.bankTotalCents)}</span>
          </div>
          <div className="summary-kv">
            <span className="k">Total Current Credit Card Balance</span>
            <span className="v" style={{ color: 'var(--red)' }}>{formatCents(totals.ccDebtCents)}</span>
          </div>
          <div className="summary-kv">
            <span className="k">Credit Card Credit</span>
            <span className="v" style={{ color: 'var(--green)' }}>{formatCents(totals.ccCreditCents)}</span>
          </div>
          <div className="summary-kv">
            <span className="k">Total Pending Outbound</span>
            <span className="v" style={{ color: 'var(--red)' }}>{formatCents(totals.pendingOutCents)}</span>
          </div>
          <div className="summary-kv">
            <span className="k">Total Pending Inbound</span>
            <span className="v" style={{ color: 'var(--green)' }}>{formatCents(totals.pendingInCents)}</span>
          </div>
          <div className={finalNetCashClass}>
            <span className="k">Final Net Cash</span>
            <span className="v" style={{ color: 'var(--green)' }}>{formatCents(totals.finalNetCashCents)}</span>
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
                      <Select
                        value={modal.isRefund ? 'card' : modal.depositTo}
                        onChange={(e) => setModal({ ...modal, depositTo: e.target.value as any })}
                        disabled={modal.isRefund}
                      >
                        <option value="bank">Bank</option>
                        <option value="card">Credit Card</option>
                      </Select>
                    </div>
                    {modal.isRefund || modal.depositTo === 'card' ? (
                      <div className="field">
                        <label>Card</label>
                        <Select value={modal.targetCardId} onChange={(e) => setModal({ ...modal, targetCardId: e.target.value })}>
                          <option value="">— Select —</option>
                          {(data.cards || []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ) : (
                      <div className="field">
                        <label>Bank (optional)</label>
                        <Select value={(modal as any).targetBankId || ''} onChange={(e) => setModal({ ...(modal as any), targetBankId: e.target.value })}>
                          <option value="">— Select —</option>
                          {(data.banks || []).map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="field">
                      <label>Outbound Type</label>
                      <Select value={modal.outboundType} onChange={(e) => setModal({ ...modal, outboundType: e.target.value as any })}>
                        <option value="standard">Standard Outbound</option>
                        <option value="cc_payment">Credit Card Payment</option>
                      </Select>
                    </div>
                    {modal.outboundType === 'cc_payment' ? (
                      <>
                        <div className="field">
                          <label>From Bank</label>
                          <Select value={modal.sourceBankId} onChange={(e) => setModal({ ...modal, sourceBankId: e.target.value })}>
                            <option value="">— Select —</option>
                            {(data.banks || []).map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="field">
                          <label>To Credit Card</label>
                          <Select value={modal.targetCardIdOut} onChange={(e) => setModal({ ...modal, targetCardIdOut: e.target.value })}>
                            <option value="">— Select —</option>
                            {(data.cards || []).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </Select>
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

            {modal.type === 'post-inbound' ? (
              <>
                <h3>Confirm deposit posted</h3>
                <p style={{ color: 'var(--muted)', marginTop: 0 }}>Where should this inbound be applied?</p>
                <div className="toggle-row">
                  <input
                    type="checkbox"
                    checked={modal.isRefund}
                    onChange={(e) => {
                      const nextIsRefund = e.target.checked;
                      let nextDest = modal.dest;
                      if (!nextIsRefund && nextDest.startsWith('card:')) {
                        const fallbackBankId = data.banks?.[0]?.id || '';
                        nextDest = `bank:${fallbackBankId}`;
                      }
                      setModal({ ...modal, isRefund: nextIsRefund, dest: nextDest });
                    }}
                    id="postIsRefund"
                  />
                  <label htmlFor="postIsRefund">Is this a refund?</label>
                </div>
                <div className="field">
                  <label>Deposit To</label>
                  <Select
                    value={modal.dest}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!modal.isRefund && v.startsWith('card:')) return;
                      setModal({ ...modal, dest: v });
                    }}
                  >
                    {(data.banks || []).map((b) => (
                      <option key={b.id} value={`bank:${b.id}`}>
                        {b.name}
                      </option>
                    ))}
                    {modal.isRefund ? (
                      <>
                        <option value="" disabled>
                          ──────────
                        </option>
                        {(data.cards || []).map((c) => (
                          <option key={c.id} value={`card:${c.id}`}>
                            {c.name}
                          </option>
                        ))}
                      </>
                    ) : null}
                  </Select>
                </div>
                <div className="btn-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: 'none' })}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const [kind, destId] = (modal.dest || '').split(':');
                      if (kind === 'card') {
                        if (!modal.isRefund || !destId) return;
                        actions.markPendingPosted('in', modal.pendingId, { isRefund: true, targetCardId: destId });
                      } else {
                        if (!destId) return;
                        actions.markPendingPosted('in', modal.pendingId, { bankId: destId });
                      }
                      setModal({ type: 'none' });
                    }}
                  >
                    Confirm
                  </button>
                </div>
              </>
            ) : null}

            {modal.type === 'post-bank' ? (
              <>
                <h3>Confirm payment posted</h3>
                <p style={{ color: 'var(--muted)', marginTop: 0 }}>Which account should this subtract from?</p>
                <div className="field">
                  <label>Account</label>
                  <Select value={modal.bankId} onChange={(e) => setModal({ ...modal, bankId: e.target.value })}>
                    {(data.banks || []).map((b) => (
                      <option key={b.id} value={`bank:${b.id}`}>
                        {b.name}
                      </option>
                    ))}
                    {(data.cards || []).length ? (
                      <>
                        <option value="" disabled>
                          ──────────
                        </option>
                        {(data.cards || []).map((c) => (
                          <option key={c.id} value={`card:${c.id}`}>
                            {c.name}
                          </option>
                        ))}
                      </>
                    ) : null}
                  </Select>
                </div>
                <div className="btn-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: 'none' })}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      if (!modal.bankId) return;
                      const [kind, destId] = modal.bankId.split(':');
                      if (!destId) return;
                      if (kind === 'card') {
                        actions.markPendingPosted('out', modal.pendingId, { targetCardId: destId });
                      } else {
                        actions.markPendingPosted('out', modal.pendingId, { bankId: destId });
                      }
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
                    className="btn btn-danger"
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

