import { useEffect, useMemo, useState } from 'react';
import { calcFinalNetCashCents, formatCents, parseCents } from '../../state/calc';
import { SHOW_ZERO_BALANCES_KEY, SHOW_ZERO_CARDS_KEY, SHOW_ZERO_CASH_KEY } from '../../state/keys';
import { useLedgerStore } from '../../state/store';
import { loadLoans, loadInvesting, type HysaAccount } from '../../state/storage';
import { loadPublicLoanSummary } from '../federalLoans/PublicLoanSummaryStore';
import { useDetectedActivityOptional } from '../../state/DetectedActivityContext';
import { getLastPostedBankId, loadBoolPref, saveBoolPref, loadCategoryConfig, getCategoryName, getCategorySubcategories, uid } from '../../state/storage';
import { useDropdownCollapsed } from '../../state/DropdownStateContext';
import type { RewardRule } from '../../state/models';
import { getEffectiveRules } from '../rewards/rewardMatching';
import { Select } from '../../ui/Select';
import { BankAccountCard } from './AccountCard';
import { PendingInboundList, PendingOutboundList } from './PendingList';

export function SnapshotPage() {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);
  const detected = useDetectedActivityOptional();

  useEffect(() => {
    if (!detected?.launchFlow) return;
    const { flow, item } = detected.launchFlow;
    if (flow !== 'pending_in' && flow !== 'pending_out') return;
    setModal((prev) => {
      if (prev.type === 'add-pending') return prev;
      const firstBankId = data.banks?.[0]?.id || '';
      if (flow === 'pending_in') {
        return {
          type: 'add-pending',
          kind: 'in',
          label: item.title,
          amount: (Math.abs(item.amountCents) / 100).toFixed(2),
          isRefund: false,
          depositTo: 'bank',
          targetCardId: '',
          targetBankId: firstBankId,
          targetInvestingAccountId: '',
          hysaSubBucket: '',
          outboundType: 'standard',
          sourceBankId: firstBankId,
          targetCardIdOut: '',
          outboundSourceKind: 'bank',
          outboundSourceHysaAccountId: '',
          outboundHysaSubBucket: ''
        } as any;
      }
      return {
        type: 'add-pending',
        kind: 'out',
        label: item.title,
        amount: (Math.abs(item.amountCents) / 100).toFixed(2),
        isRefund: false,
        depositTo: 'bank',
        targetCardId: '',
        targetBankId: firstBankId,
        targetInvestingAccountId: '',
        hysaSubBucket: '',
        outboundType: 'standard',
        sourceBankId: firstBankId,
        targetCardIdOut: '',
        outboundSourceKind: 'bank',
        outboundSourceHysaAccountId: '',
        outboundHysaSubBucket: ''
      } as any;
    });
  }, [detected?.launchFlow?.flow, detected?.launchFlow?.detectedId, detected?.launchFlow?.item, data.banks]);

  const legacyShowZero = loadBoolPref(SHOW_ZERO_BALANCES_KEY, false);
  const [showZeroCashItems, setShowZeroCashItems] = useState<boolean>(loadBoolPref(SHOW_ZERO_CASH_KEY, legacyShowZero));
  const [showZeroCreditCards, setShowZeroCreditCards] = useState<boolean>(loadBoolPref(SHOW_ZERO_CARDS_KEY, legacyShowZero));
  const [cashCollapsed, setCashCollapsed] = useDropdownCollapsed('snapshot_cash', true);
  const [cardsCollapsed, setCardsCollapsed] = useDropdownCollapsed('snapshot_cards', true);
  const [pendingInCollapsed, setPendingInCollapsed] = useDropdownCollapsed('snapshot_pending_in', true);
  const [pendingOutCollapsed, setPendingOutCollapsed] = useDropdownCollapsed('snapshot_pending_out', true);
  const [summaryPendingOutBreakdownCollapsed, setSummaryPendingOutBreakdownCollapsed] = useDropdownCollapsed(
    'snapshot_summary_pending_out_breakdown',
    true
  );
  const [summaryCcDetailsCollapsed, setSummaryCcDetailsCollapsed] = useDropdownCollapsed(
    'snapshot_summary_cc_balance_details',
    true
  );

  const [modal, setModal] = useState<
    | { type: 'none' }
    | { type: 'add-bank'; name: string }
    | { type: 'add-card'; name: string }
    | { type: 'edit-balance'; kind: 'bank' | 'card'; id: string; amount: string; useSet: boolean }
    | {
        type: 'add-pending';
        kind: 'in' | 'out';
        label: string;
        amount: string;
        isRefund: boolean;
        depositTo: 'bank' | 'card' | 'hysa';
        targetCardId: string;
        targetBankId: string;
        targetInvestingAccountId: string;
        hysaSubBucket: 'liquid' | 'reserved' | '';
        outboundType: 'standard' | 'cc_payment';
        sourceBankId: string;
        targetCardIdOut: string;
        outboundSourceKind: 'bank' | 'hysa';
        outboundSourceHysaAccountId: string;
        outboundHysaSubBucket: 'liquid' | 'reserved' | '';
      }
    | { type: 'post-inbound'; pendingId: string; isRefund: boolean; dest: string }
    | { type: 'post-bank'; kind: 'out'; pendingId: string; bankId: string; loanAdjustments?: any }
    | { type: 'loan-payment-confirm'; pendingId: string }
    | {
        type: 'loan-payment-preview';
        pendingId: string;
        privateRows: { loanId: string; name: string; currentBalanceCents: number; subCentsInput: string }[];
        publicPortionCents: number;
        publicCurrentBalanceCents: number | null;
      }
    | { type: 'confirm'; title: string; message: string; onConfirm: () => void }
    | {
        type: 'card-reward-config';
        cardId: string;
        rules: RewardRule[];
        rewardCashbackCents: string;
        rewardPoints: string;
        rewardMiles: string;
      }
  >({ type: 'none' });

  const totals = useMemo(() => calcFinalNetCashCents(data), [data]);

  const investingState = useMemo(() => loadInvesting(), []);
  const banksSortedByBalance = useMemo(
    () => [...(data.banks || [])].sort((a, b) => (b.balanceCents || 0) - (a.balanceCents || 0)),
    [data.banks]
  );
  const cardsSortedByBalance = useMemo(
    () => [...(data.cards || [])].sort((a, b) => (b.balanceCents || 0) - (a.balanceCents || 0)),
    [data.cards]
  );
  const hysaAccountsSorted = useMemo(
    () =>
      (investingState.accounts || [])
        .filter((a: any) => a.type === 'hysa')
        .sort((a: any, b: any) => (b.balanceCents || 0) - (a.balanceCents || 0)),
    [investingState.accounts]
  );

  const pendingCcPaymentCents = totals.pendingCcPaymentCents || 0;
  const pendingOutNonCcCents = totals.pendingOutNonCcCents ?? totals.pendingOutCents;

  const linkedHysaLiquidByBankId = useMemo(() => {
    try {
      const inv = loadInvesting();
      const map: Record<string, number> = {};
      (inv.accounts || []).forEach((acc: any) => {
        if (!acc || acc.type !== 'hysa') return;
        const h = acc as HysaAccount;
        const bankId = h.linkedCheckingBankId || null;
        if (!bankId) return;
        const balance = typeof h.balanceCents === 'number' ? h.balanceCents : 0;
        const reservedRaw =
          typeof h.reservedSavingsCents === 'number' && h.reservedSavingsCents >= 0
            ? h.reservedSavingsCents
            : 0;
        const reserved = Math.min(reservedRaw, balance);
        const liquid = Math.max(0, balance - reserved);
        if (liquid <= 0) return;
        map[bankId] = (map[bankId] || 0) + liquid;
      });
      return map;
    } catch {
      return {};
    }
  }, []);

  const totalLinkedHysaCents = useMemo(
    () => Object.values(linkedHysaLiquidByBankId).reduce((a, b) => a + b, 0),
    [linkedHysaLiquidByBankId]
  );

  const displayedFinalNetCashCents =
    totalLinkedHysaCents > 0 ? totals.finalNetCashCents + totalLinkedHysaCents : totals.finalNetCashCents;
  const finalNetCashDisplayClass =
    displayedFinalNetCashCents >= 0 ? 'summary-kv final-net-cash positive' : 'summary-kv final-net-cash negative';

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

  function buildLoanPaymentPreview(pendingId: string) {
    const pending = (data.pendingOut || []).find((p) => p.id === pendingId);
    if (!pending || !pending.recurringId) return null;
    const recurring = (data.recurring || []).find((r) => r.id === pending.recurringId);
    if (!recurring || !recurring.useLoanEstimatedPayment) return null;
    const amount = pending.amountCents || 0;
    const meta: any = pending.meta || {};
    const loansState = loadLoans();
    const privateBreakdown: Record<string, number> =
      meta.privateLoanBreakdownCents && typeof meta.privateLoanBreakdownCents === 'object'
        ? { ...meta.privateLoanBreakdownCents }
        : recurring.linkedLoanId
          ? { [recurring.linkedLoanId]: amount }
          : {};
    const privateRows = Object.keys(privateBreakdown).map((loanId) => {
      const loan = (loansState.loans || []).find((l: any) => l.id === loanId && l.category === 'private');
      const currentBalanceCents = loan?.balanceCents ?? 0;
      const subCents = privateBreakdown[loanId] ?? 0;
      return {
        loanId,
        name: loan?.name || 'Private loan',
        currentBalanceCents,
        subCentsInput: ((subCents || 0) / 100).toFixed(2),
      };
    });
    const publicSummary = loadPublicLoanSummary();
    const publicPortionCents: number = publicSummary.estimatedMonthlyPaymentCents ?? 0;
    const publicCurrentBalanceCents = publicSummary.totalBalanceCents ?? null;
    return {
      pendingId,
      privateRows,
      publicPortionCents,
      publicCurrentBalanceCents,
    };
  }

  function postLoanPayment(pendingId: string, loanAdjustments: any) {
    const res = actions.markPendingPosted('out', pendingId, { loanAdjustments });
    if (!res.needsBankSelection) {
      setModal({ type: 'none' });
      return;
    }
    const last = getLastPostedBankId('out');
    const defaultId = data.banks.some((b) => b.id === last) ? last : data.banks[0]?.id || '';
    setModal({ type: 'post-bank', kind: 'out', pendingId, bankId: `bank:${defaultId}`, loanAdjustments });
  }

  function handlePendingPosted(kind: 'in' | 'out', id: string) {
    if (kind === 'out') {
      const pending = (data.pendingOut || []).find((p) => p.id === id);
      if (pending && pending.recurringId) {
        const recurring = (data.recurring || []).find((r) => r.id === pending.recurringId);
        if (recurring?.useLoanEstimatedPayment) {
          setModal({ type: 'loan-payment-confirm', pendingId: id });
          return;
        }
      }
    }
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
        onClick={() => setCashCollapsed(!cashCollapsed)}
      >
        <span className="section-header-left">
          Cash
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
            {visibleBanks.map((b) => {
              const linkedLiquid = linkedHysaLiquidByBankId[b.id] || 0;
              return (
                <div className="card ll-account-card" key={b.id}>
                  <button
                    type="button"
                    className="ll-card-button"
                    onClick={() =>
                      setModal({ type: 'edit-balance', kind: 'bank', id: b.id, amount: '', useSet: false })
                    }
                  >
                    <BankAccountCard bank={b} />
                  </button>
                  {linkedLiquid > 0 ? (
                    <div style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
                      Includes {formatCents(linkedLiquid)} available instantly from linked HYSA
                    </div>
                  ) : null}
                  <div className="btn-row" style={{ marginTop: 10, marginBottom: 0 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() =>
                        setModal({ type: 'edit-balance', kind: 'bank', id: b.id, amount: '', useSet: false })
                      }
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
              );
            })}
          </div>
          <button type="button" className="btn btn-add" style={{ width: '100%', marginTop: 8 }} onClick={() => setModal({ type: 'add-bank', name: '' })} >
            + Add Bank Account
          </button>
        </>
      ) : null}

      <div
        className="section-header"
        id="cardHeader"
        style={{ marginTop: 24 }}
        onClick={() => setCardsCollapsed(!cardsCollapsed)}
      >
        <span className="section-header-left">
          Credit Cards
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
            {visibleCards.map((c) => {
              const balanceCents = c.balanceCents ?? 0;
              const amountClass =
                balanceCents > 0 ? 'amount amount-neg' : balanceCents < 0 ? 'amount amount-pos' : 'amount amount-pos';
              return (
                <div className="card ll-account-card" key={c.id}>
                  <div
                    className="ll-card-button"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
                    role="button"
                    tabIndex={0}
                    onClick={() => setModal({ type: 'edit-balance', kind: 'card', id: c.id, amount: '', useSet: false })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setModal({ type: 'edit-balance', kind: 'card', id: c.id, amount: '', useSet: false });
                      }
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="name bank-card-name">{c.name}</span>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rules = getEffectiveRules(c);
                          setModal({
                            type: 'card-reward-config',
                            cardId: c.id,
                            rules: rules.length > 0 ? rules : [{ id: uid(), category: '', subcategory: '', value: 1.5, unit: 'cashback_percent', isCatchAll: false }],
                            rewardCashbackCents: typeof c.rewardCashbackCents === 'number' ? String(c.rewardCashbackCents) : '',
                            rewardPoints: typeof c.rewardPoints === 'number' ? String(c.rewardPoints) : '',
                            rewardMiles: typeof c.rewardMiles === 'number' ? String(c.rewardMiles) : ''
                          });
                        }}
                        title="Card reward categories"
                        aria-label="Card reward categories"
                      >
                        ⓘ
                      </button>
                    </span>
                    <span className={amountClass}>{formatCents(balanceCents)}</span>
                  </div>
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
              );
            })}
          </div>
          <button type="button" className="btn btn-add" style={{ width: '100%', marginTop: 8 }} onClick={() => setModal({ type: 'add-card', name: '' })} >
            + Add Credit Card
          </button>
        </>
      ) : null}

      <div
        className="section-header"
        id="pendingInHeader"
        style={{ marginTop: 24 }}
        onClick={() => setPendingInCollapsed(!pendingInCollapsed)}
      >
        <span className="section-header-left">
          Pending Inbound
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
            <button type="button" className="btn btn-add" onClick={() => setModal({ type: 'add-pending', kind: 'in', label: '', amount: '', isRefund: false, depositTo: 'bank', targetCardId: '', targetBankId: '', targetInvestingAccountId: '', hysaSubBucket: '', outboundType: 'standard', sourceBankId: '', targetCardIdOut: '', outboundSourceKind: 'bank', outboundSourceHysaAccountId: '', outboundHysaSubBucket: '' })}>
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
        style={{ marginTop: 24 }}
        onClick={() => setPendingOutCollapsed(!pendingOutCollapsed)}
      >
        <span className="section-header-left">
          Pending Outbound
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
            <button type="button" className="btn btn-add" onClick={() => setModal({ type: 'add-pending', kind: 'out', label: '', amount: '', isRefund: false, depositTo: 'bank', targetCardId: '', targetBankId: '', targetInvestingAccountId: '', hysaSubBucket: '', outboundType: 'standard', sourceBankId: '', targetCardIdOut: '', outboundSourceKind: 'bank', outboundSourceHysaAccountId: '', outboundHysaSubBucket: '' })}>
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
            <span className="k">Current Cash in Checking Accounts</span>
            <span className="v" style={{ color: 'var(--green)' }}>{formatCents(totals.bankTotalCents)}</span>
          </div>
          {totalLinkedHysaCents > 0 ? (
            <div className="summary-kv">
              <span className="k">Money in HYSA Designated for Bills</span>
              <span className="v" style={{ color: 'var(--green)' }}>{formatCents(totalLinkedHysaCents)}</span>
            </div>
          ) : null}
          <div
            className="summary-kv"
            style={{ cursor: 'pointer' }}
            onClick={() => setSummaryCcDetailsCollapsed(!summaryCcDetailsCollapsed)}
            title={summaryCcDetailsCollapsed ? 'Show details' : 'Hide details'}
          >
            <span className="k">
              Total Credit Card Balance
              <span style={{ marginLeft: 6, fontSize: '0.85rem', opacity: 0.8 }}>{summaryCcDetailsCollapsed ? '▸' : '▾'}</span>
            </span>
            <span className="v" style={{ color: 'var(--red)' }}>{formatCents(totals.ccDebtCents)}</span>
          </div>
          {!summaryCcDetailsCollapsed ? (
            <>
              <div className="summary-kv" style={{ fontSize: '0.9rem', paddingLeft: 12, marginTop: 0 }}>
                <span className="k">Estimated Card Rewards</span>
                <span className="v" style={{ color: 'var(--muted)' }}>—</span>
              </div>
              {(data.cards || []).map((c) => {
                const parts: string[] = [];
                if (typeof c.rewardCashbackCents === 'number' && c.rewardCashbackCents > 0) parts.push(formatCents(c.rewardCashbackCents) + ' cashback');
                if (typeof c.rewardPoints === 'number' && c.rewardPoints > 0) parts.push((c.rewardPoints).toLocaleString() + ' pts');
                if (typeof c.rewardMiles === 'number' && c.rewardMiles > 0) parts.push((c.rewardMiles).toLocaleString() + ' mi');
                if (parts.length === 0) return null;
                return (
                  <div key={c.id} className="summary-kv" style={{ fontSize: '0.85rem', paddingLeft: 20, marginTop: 0 }}>
                    <span className="k">↳ {c.name}</span>
                    <span className="v" style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{parts.join(' · ')}</span>
                  </div>
                );
              })}
              <div
                className="summary-kv"
                style={{ fontSize: '0.9rem', paddingLeft: 12, marginTop: 6, cursor: 'pointer' }}
                onClick={() => setSummaryPendingOutBreakdownCollapsed(!summaryPendingOutBreakdownCollapsed)}
                title={summaryPendingOutBreakdownCollapsed ? 'Show breakdown' : 'Hide breakdown'}
              >
                <span className="k">
                  Pending Outbound
                  <span style={{ marginLeft: 6, fontSize: '0.85rem', opacity: 0.8 }}>{summaryPendingOutBreakdownCollapsed ? '▸' : '▾'}</span>
                </span>
                <span className="v" style={{ color: 'var(--red)' }}>{formatCents(totals.pendingOutCents)}</span>
              </div>
              {!summaryPendingOutBreakdownCollapsed ? (
                <>
                  <div className="summary-kv" style={{ fontSize: '0.9rem', paddingLeft: 20, marginTop: 0 }}>
                    <span className="k">↳ Credit card payments</span>
                    <span className="v" style={{ color: 'var(--red)' }}>{formatCents(pendingCcPaymentCents)}</span>
                  </div>
                  <div className="summary-kv" style={{ fontSize: '0.9rem', marginTop: 0 }}>
                    <span className="k" style={{ paddingLeft: 20 }}>↳ Other pending outbound</span>
                    <span className="v" style={{ color: 'var(--red)' }}>{formatCents(pendingOutNonCcCents)}</span>
                  </div>
                </>
              ) : null}
            </>
          ) : null}
          <div className="summary-kv">
            <span className="k">Credit Card Credit</span>
            <span className="v" style={{ color: 'var(--green)' }}>{formatCents(totals.ccCreditCents)}</span>
          </div>
          <div className="summary-kv">
            <span className="k">Total Pending Inbound</span>
            <span className="v" style={{ color: 'var(--green)' }}>{formatCents(totals.pendingInCents)}</span>
          </div>
          <div className={finalNetCashDisplayClass} >
            <span className="k">Final Net Cash</span>
            <span className="v" style={{ color: displayedFinalNetCashCents >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {formatCents(displayedFinalNetCashCents)}
            </span>
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

            {modal.type === 'loan-payment-confirm' ? (
              <>
                <h3>Apply this payment to loan balances?</h3>
                <p style={{ color: 'var(--muted)', marginTop: 0 }}>
                  Do you want this posted loan payment to update the loan balances in the Loans tab?
                </p>
                <div className="btn-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: 'none' })}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      postLoanPayment(modal.pendingId, { skipLoanAdjustments: true });
                    }}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    className="btn btn-add"
                    onClick={() => {
                      const preview = buildLoanPaymentPreview(modal.pendingId);
                      if (!preview) {
                        postLoanPayment(modal.pendingId, {});
                        return;
                      }
                      setModal({ type: 'loan-payment-preview', ...preview });
                    }}
                  >
                    Yes
                  </button>
                </div>
              </>
            ) : null}

            {modal.type === 'loan-payment-preview' ? (
              <>
                <h3>Loan payment breakdown</h3>
                <p style={{ color: 'var(--muted)', marginTop: 0 }}>
                  Review how this payment will update your loan balances. You can edit the private loan amounts for this
                  posted payment only.
                </p>
                <div className="card" style={{ padding: 10, marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 6 }}>Private loans</div>
                  {modal.privateRows.length === 0 ? (
                    <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>No private loans detected.</p>
                  ) : (
                    modal.privateRows.map((row, idx) => {
                      const current = row.currentBalanceCents || 0;
                      const subCents = Math.max(
                        0,
                        Math.round(parseFloat(row.subCentsInput.replace(/,/g, '')) * 100) || 0
                      );
                      const newBalance = Math.max(0, current - subCents);
                      return (
                        <div
                          key={row.loanId}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)',
                            gap: 8,
                            alignItems: 'center',
                            marginBottom: 6,
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '0.9rem' }}>{row.name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                              Current balance: {formatCents(current)}
                            </div>
                          </div>
                          <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Subtract ($)</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.subCentsInput}
                              onChange={(e) => {
                                const nextRows = modal.privateRows.slice();
                                nextRows[idx] = { ...row, subCentsInput: e.target.value };
                                setModal({ ...modal, privateRows: nextRows });
                              }}
                              style={{ width: '100%', padding: '4px 6px' }}
                            />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>New balance</div>
                            <div style={{ fontSize: '0.9rem' }}>{formatCents(newBalance)}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="card" style={{ padding: 10, marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 6 }}>Public loans</div>
                  <div style={{ fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Subtract</span>
                    <span>{formatCents(modal.publicPortionCents || 0)}</span>
                  </div>
                  <div style={{ fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span>New total balance</span>
                    <span>
                      {modal.publicCurrentBalanceCents != null
                        ? formatCents(Math.max(0, modal.publicCurrentBalanceCents - (modal.publicPortionCents || 0)))
                        : '—'}
                    </span>
                  </div>
                </div>
                <div className="btn-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: 'none' })}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-add"
                    onClick={() => {
                      const overrides: Record<string, number> = {};
                      for (const row of modal.privateRows) {
                        const cents = Math.max(
                          0,
                          Math.round(parseFloat(row.subCentsInput.replace(/,/g, '')) * 100) || 0
                        );
                        overrides[row.loanId] = cents;
                      }
                      postLoanPayment(modal.pendingId, { privateBreakdownOverrides: overrides });
                    }}
                  >
                    Confirm
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

            {modal.type === 'card-reward-config' ? (() => {
              const cfg = loadCategoryConfig();
              const updateRule = (idx: number, patch: Partial<RewardRule>) => {
                const next = modal.rules.slice();
                next[idx] = { ...next[idx], ...patch };
                setModal({ ...modal, rules: next });
              };
              const addRule = () => {
                setModal({
                  ...modal,
                  rules: [...modal.rules, { id: uid(), category: '', subcategory: '', value: 1.5, unit: 'cashback_percent', isCatchAll: false }]
                });
              };
              const removeRule = (idx: number) => {
                const next = modal.rules.filter((_, i) => i !== idx);
                setModal({ ...modal, rules: next.length > 0 ? next : [{ id: uid(), category: '', subcategory: '', value: 1.5, unit: 'cashback_percent', isCatchAll: false }] });
              };
              const setCatchAll = (idx: number, isCatchAll: boolean) => {
                const next = modal.rules.map((r, i) => ({ ...r, isCatchAll: i === idx ? isCatchAll : false }));
                setModal({ ...modal, rules: next });
              };
              const validRules = modal.rules.filter((r) => r.category && r.category.trim());
              return (
                <>
                  <h3>Card reward rules</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: -4, marginBottom: 12 }}>
                    Add rules for category/subcategory. Exact match wins; catch-all applies when no rule matches.
                  </p>
                  {modal.rules.map((rule, idx) => {
                    const subs = getCategorySubcategories(cfg, rule.category);
                    return (
                      <div key={rule.id} className="card" style={{ padding: 10, marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Rule {idx + 1}</span>
                          <button type="button" className="btn clear-btn" style={{ padding: '2px 8px', fontSize: '0.8rem' }} onClick={() => removeRule(idx)}>Remove</button>
                        </div>
                        <div className="field">
                          <label>Category</label>
                          <Select
                            value={rule.category}
                            onChange={(e) => updateRule(idx, { category: e.target.value, subcategory: '' })}
                          >
                            <option value="">— None —</option>
                            {Object.keys(cfg).map((id) => (
                              <option key={id} value={id}>{getCategoryName(cfg, id)}</option>
                            ))}
                          </Select>
                        </div>
                        {subs.length > 0 ? (
                          <div className="field">
                            <label>Subcategory (blank = whole category)</label>
                            <Select
                              value={rule.subcategory || ''}
                              onChange={(e) => updateRule(idx, { subcategory: e.target.value })}
                            >
                              <option value="">— None —</option>
                              {subs.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </Select>
                          </div>
                        ) : null}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <div className="field" style={{ flex: '1 1 80px' }}>
                            <label>Value</label>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={rule.value}
                              onChange={(e) => updateRule(idx, { value: parseFloat(e.target.value) || 0 })}
                              style={{ width: '100%' }}
                            />
                          </div>
                          <div className="field" style={{ flex: '1 1 120px' }}>
                            <label>Type</label>
                            <Select
                              value={rule.unit}
                              onChange={(e) => updateRule(idx, { unit: e.target.value as RewardRule['unit'] })}
                            >
                              <option value="cashback_percent">% cashback</option>
                              <option value="points_multiplier">× points</option>
                              <option value="miles_multiplier">× miles</option>
                            </Select>
                          </div>
                        </div>
                        <div className="toggle-row" style={{ marginTop: 6 }}>
                          <input
                            type="checkbox"
                            id={`catchAll-${idx}`}
                            checked={!!rule.isCatchAll}
                            onChange={(e) => setCatchAll(idx, e.target.checked)}
                          />
                          <label htmlFor={`catchAll-${idx}`}>Catch-all (use when no other rule matches)</label>
                        </div>
                      </div>
                    );
                  })}
                  <button type="button" className="btn btn-secondary" style={{ marginBottom: 12 }} onClick={addRule}>+ Add rule</button>
                  <div className="field" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <label style={{ fontSize: '0.9rem' }}>Reward totals (manual override)</label>
                    <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 8px 0' }}>
                      Edit to sync with reality or after redeeming. Leave blank to use auto total from purchases.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 100px' }}>
                        <label style={{ fontSize: '0.75rem' }}>Cashback ($)</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={modal.rewardCashbackCents}
                          onChange={(e) => setModal({ ...modal, rewardCashbackCents: e.target.value })}
                          style={{ width: '100%', padding: '6px 8px' }}
                        />
                      </div>
                      <div style={{ flex: '1 1 80px' }}>
                        <label style={{ fontSize: '0.75rem' }}>Points</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="0"
                          value={modal.rewardPoints}
                          onChange={(e) => setModal({ ...modal, rewardPoints: e.target.value })}
                          style={{ width: '100%', padding: '6px 8px' }}
                        />
                      </div>
                      <div style={{ flex: '1 1 80px' }}>
                        <label style={{ fontSize: '0.75rem' }}>Miles</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="0"
                          value={modal.rewardMiles}
                          onChange={(e) => setModal({ ...modal, rewardMiles: e.target.value })}
                          style={{ width: '100%', padding: '6px 8px' }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="btn-row">
                    <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: 'none' })}>Cancel</button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        actions.updateCardRewardRules(modal.cardId, validRules);
                        const cashbackStr = modal.rewardCashbackCents.trim().replace(/,/g, '');
                        const pointsStr = modal.rewardPoints.trim().replace(/,/g, '');
                        const milesStr = modal.rewardMiles.trim().replace(/,/g, '');
                        const cashbackCents = cashbackStr ? Math.round(parseFloat(cashbackStr) * 100) : undefined;
                        const points = pointsStr ? Math.round(parseFloat(pointsStr)) : undefined;
                        const miles = milesStr ? Math.round(parseFloat(milesStr)) : undefined;
                        const totalsPayload: { rewardCashbackCents?: number; rewardPoints?: number; rewardMiles?: number } = {};
                        if (typeof cashbackCents === 'number' && !Number.isNaN(cashbackCents)) totalsPayload.rewardCashbackCents = cashbackCents;
                        if (typeof points === 'number' && !Number.isNaN(points)) totalsPayload.rewardPoints = points;
                        if (typeof miles === 'number' && !Number.isNaN(miles)) totalsPayload.rewardMiles = miles;
                        if (Object.keys(totalsPayload).length > 0) actions.updateCardRewardTotals(modal.cardId, totalsPayload);
                        setModal({ type: 'none' });
                      }}
                    >
                      Save
                    </button>
                  </div>
                </>
              );
            })() : null}

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
                {detected?.launchFlow && (detected.launchFlow.flow === 'pending_in' || detected.launchFlow.flow === 'pending_out') && detected.launchFlow.item ? (
                  <div className="card" style={{ marginBottom: 12, padding: 10, fontSize: '0.85rem', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Detected activity (reference)</div>
                    <div>Merchant: {detected.launchFlow.item.title}</div>
                    <div>Amount: {formatCents(detected.launchFlow.item.amountCents)}</div>
                    <div>Account: {detected.launchFlow.item.accountName}</div>
                    <div>Date: {detected.launchFlow.item.dateISO}</div>
                    <div>Status: {detected.launchFlow.item.pending ? 'Pending' : 'Posted'}</div>
                  </div>
                ) : null}
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
                        onChange={(e) => {
                          const v = e.target.value as 'bank' | 'card' | 'hysa';
                          setModal({ ...modal, depositTo: v, targetInvestingAccountId: v !== 'hysa' ? '' : modal.targetInvestingAccountId, hysaSubBucket: v !== 'hysa' ? '' : modal.hysaSubBucket });
                        }}
                        disabled={modal.isRefund}
                      >
                        <option value="bank">Bank</option>
                        <option value="card">Credit Card</option>
                        <option value="hysa">HYSA</option>
                      </Select>
                    </div>
                    {modal.isRefund || modal.depositTo === 'card' ? (
                      <div className="field">
                        <label>Card</label>
                        <Select value={modal.targetCardId} onChange={(e) => setModal({ ...modal, targetCardId: e.target.value })}>
                          <option value="">— Select —</option>
                          {cardsSortedByBalance.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} — {formatCents(c.balanceCents || 0)}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ) : modal.depositTo === 'hysa' ? (
                      <>
                        <div className="field">
                          <label>HYSA Account</label>
                          <Select value={modal.targetInvestingAccountId} onChange={(e) => setModal({ ...modal, targetInvestingAccountId: e.target.value })}>
                            <option value="">— Select —</option>
                            {hysaAccountsSorted.map((a: any) => (
                              <option key={a.id} value={a.id}>
                                {a.name} — {formatCents(a.balanceCents || 0)}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="field">
                          <label>Use which HYSA portion?</label>
                          <Select value={modal.hysaSubBucket} onChange={(e) => setModal({ ...modal, hysaSubBucket: e.target.value as any })}>
                            <option value="">— Select —</option>
                            <option value="liquid">Money in HYSA Designated for Bills</option>
                            <option value="reserved">Reserved savings</option>
                          </Select>
                        </div>
                      </>
                    ) : (
                      <div className="field">
                        <label>Bank (optional)</label>
                        <Select value={modal.targetBankId || ''} onChange={(e) => setModal({ ...modal, targetBankId: e.target.value })}>
                          <option value="">— Select —</option>
                          {banksSortedByBalance.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} — {formatCents(b.balanceCents || 0)}
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
                            {banksSortedByBalance.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name} — {formatCents(b.balanceCents || 0)}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="field">
                          <label>To Credit Card</label>
                          <Select value={modal.targetCardIdOut} onChange={(e) => setModal({ ...modal, targetCardIdOut: e.target.value })}>
                            <option value="">— Select —</option>
                            {cardsSortedByBalance.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} — {formatCents(c.balanceCents || 0)}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="field">
                          <label>From</label>
                          <Select
                            value={modal.outboundSourceKind}
                            onChange={(e) => setModal({ ...modal, outboundSourceKind: e.target.value as 'bank' | 'hysa', outboundSourceHysaAccountId: e.target.value === 'hysa' ? modal.outboundSourceHysaAccountId : '', outboundHysaSubBucket: e.target.value === 'hysa' ? modal.outboundHysaSubBucket : '' })}
                          >
                            <option value="bank">Bank</option>
                            <option value="hysa">HYSA</option>
                          </Select>
                        </div>
                        {modal.outboundSourceKind === 'bank' ? (
                          <div className="field">
                            <label>Bank</label>
                            <Select value={modal.sourceBankId} onChange={(e) => setModal({ ...modal, sourceBankId: e.target.value })}>
                              <option value="">— Select —</option>
                              {banksSortedByBalance.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name} — {formatCents(b.balanceCents || 0)}
                                </option>
                              ))}
                            </Select>
                          </div>
                        ) : (
                          <>
                            <div className="field">
                              <label>HYSA Account</label>
                              <Select value={modal.outboundSourceHysaAccountId} onChange={(e) => setModal({ ...modal, outboundSourceHysaAccountId: e.target.value })}>
                                <option value="">— Select —</option>
                                {hysaAccountsSorted.map((a: any) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name} — {formatCents(a.balanceCents || 0)}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="field">
                              <label>Use which HYSA portion?</label>
                              <Select value={modal.outboundHysaSubBucket} onChange={(e) => setModal({ ...modal, outboundHysaSubBucket: e.target.value as any })}>
                                <option value="">— Select —</option>
                                <option value="liquid">Money in HYSA Designated for Bills</option>
                                <option value="reserved">Reserved savings</option>
                              </Select>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </>
                )}

                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setModal({ type: 'none' });
                      if (detected?.launchFlow?.flow === 'pending_in' || detected?.launchFlow?.flow === 'pending_out') detected?.setLaunchFlow(null);
                    }}
                  >
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
                        if (depositTo === 'hysa' && (!modal.targetInvestingAccountId || !modal.hysaSubBucket)) return;
                        actions.addPendingInbound({
                          label: modal.label.trim() || 'Pending',
                          amountCents,
                          depositTo,
                          isRefund: modal.isRefund || depositTo === 'card' ? true : undefined,
                          targetCardId: depositTo === 'card' ? modal.targetCardId : undefined,
                          targetBankId: depositTo === 'bank' ? (modal.targetBankId || undefined) : undefined,
                          targetInvestingAccountId: depositTo === 'hysa' ? modal.targetInvestingAccountId : undefined,
                          meta: depositTo === 'hysa' && (modal.hysaSubBucket === 'liquid' || modal.hysaSubBucket === 'reserved') ? { hysaSubBucket: modal.hysaSubBucket } : undefined
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
                          if (modal.outboundSourceKind === 'hysa') {
                            if (!modal.outboundSourceHysaAccountId) return;
                            const subBucket = modal.outboundHysaSubBucket === 'reserved' ? 'reserved' : 'liquid';
                            actions.addPendingOutbound({
                              label: modal.label.trim() || 'Pending',
                              amountCents,
                              outboundType: 'standard',
                              paymentSource: 'hysa',
                              paymentTargetId: modal.outboundSourceHysaAccountId,
                              meta: { hysaSubBucket: subBucket }
                            });
                          } else {
                            actions.addPendingOutbound({ label: modal.label.trim() || 'Pending', amountCents, outboundType: 'standard' });
                          }
                        }
                      }
                      if (detected?.launchFlow && (detected.launchFlow.flow === 'pending_in' || detected.launchFlow.flow === 'pending_out')) {
                        detected.markResolved(detected.launchFlow.detectedId, detected.launchFlow.flow);
                        detected.setLaunchFlow(null);
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
                    {banksSortedByBalance.map((b) => (
                      <option key={b.id} value={`bank:${b.id}`}>
                        {b.name} — {formatCents(b.balanceCents || 0)}
                      </option>
                    ))}
                    {modal.isRefund ? (
                      <>
                        <option value="" disabled>
                          ──────────
                        </option>
                        {cardsSortedByBalance.map((c) => (
                          <option key={c.id} value={`card:${c.id}`}>
                            {c.name} — {formatCents(c.balanceCents || 0)}
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
                    {banksSortedByBalance.map((b) => (
                      <option key={b.id} value={`bank:${b.id}`}>
                        {b.name} — {formatCents(b.balanceCents || 0)}
                      </option>
                    ))}
                    {cardsSortedByBalance.length ? (
                      <>
                        <option value="" disabled>
                          ──────────
                        </option>
                        {cardsSortedByBalance.map((c) => (
                          <option key={c.id} value={`card:${c.id}`}>
                            {c.name} — {formatCents(c.balanceCents || 0)}
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
                        actions.markPendingPosted('out', modal.pendingId, {
                          targetCardId: destId,
                          loanAdjustments: modal.loanAdjustments,
                        });
                      } else {
                        actions.markPendingPosted('out', modal.pendingId, {
                          bankId: destId,
                          loanAdjustments: modal.loanAdjustments,
                        });
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

