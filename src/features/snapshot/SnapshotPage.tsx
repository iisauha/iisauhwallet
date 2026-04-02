import { useEffect, useMemo, useRef, useState } from 'react';
import { calcFinalNetCashCents, formatCents, parseCents } from '../../state/calc';
import { scheduleSnapCorrection } from '../../ui/carouselSnap';
import { SHOW_ZERO_BALANCES_KEY, SHOW_ZERO_CARDS_KEY, SHOW_ZERO_CASH_KEY, LAST_EXPORT_DATE_KEY, BACKUP_LOCATION_LABEL_KEY } from '../../state/keys';
import { useLedgerStore } from '../../state/store';
import { loadLoans, loadInvesting, type HysaAccount } from '../../state/storage';
import { loadPublicLoanSummary } from '../federalLoans/PublicLoanSummaryStore';
import { getLastPostedBankId, loadBoolPref, saveBoolPref, loadCategoryConfig, getCategoryName, getCategorySubcategories, uid, loadActivityLog, exportJSON, logActivityEntry } from '../../state/storage';
import { useDropdownCollapsed } from '../../state/DropdownStateContext';
import type { PendingInboundItem, PendingOutboundItem, RewardRule, RewardUnitType } from '../../state/models';
import { getEffectiveRules } from '../rewards/rewardMatching';
import { Select } from '../../ui/Select';
import { BankAccountCard } from './AccountCard';
import { PendingInboundList, PendingOutboundList } from './PendingList';
import {
  IconCreditCard, IconClock, IconPlus, IconArrowExchange,
} from '../../ui/icons';

// --- Recent Activity Widget ---

type ActivityType = 'purchase' | 'pending-in' | 'pending-out' | 'balance' | 'logged';

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  purchase: 'var(--ui-add-btn, var(--accent))',
  'pending-in': 'var(--green)',
  'pending-out': 'var(--red)',
  balance: 'var(--ui-add-btn, var(--accent))',
  logged: 'var(--muted)',
};

type ActivityItem = {
  label: string;
  type: ActivityType;
  ts: number;
  amount: number | null;
  notes?: string;
  category?: string;
  subcategory?: string;
  descriptor?: string;
};

function RecentActivityWidget() {
  const data = useLedgerStore((s) => s.data);
  const cfg = useMemo(() => loadCategoryConfig(), []);

  const activities = useMemo(() => {
    const items: ActivityItem[] = [];

    (data.purchases || []).forEach((p: any) => {
      if (p.dateISO || p.createdAt) {
        const tsStr = p.createdAt || (p.dateISO + 'T23:59:59');
        items.push({
          label: p.title || 'Purchase',
          type: 'purchase',
          ts: new Date(tsStr).getTime(),
          amount: p.amountCents ?? null,
          notes: p.notes || undefined,
          category: p.category || undefined,
          subcategory: p.subcategory || undefined,
          descriptor: 'Purchase',
        });
      }
    });

    (data.pendingIn || []).forEach((p: any) => {
      if (p.createdAt) {
        const isHysa = p.depositTo === 'hysa';
        const descriptor = isHysa ? 'HYSA deposit' : 'Pending inbound';
        items.push({ label: p.label || 'Inbound transfer', type: 'pending-in', ts: new Date(p.createdAt).getTime(), amount: p.amountCents ?? null, descriptor });
      }
    });

    (data.pendingOut || []).forEach((p: any) => {
      if (p.createdAt) {
        const isHysa = p.meta?.recurringHysaSource || (p.paymentSource === 'hysa');
        const isCcPayment = p.outboundType === 'cc_payment';
        const descriptor = isHysa ? 'HYSA transfer' : isCcPayment ? 'Credit card payment pending' : 'Pending payment';
        items.push({ label: p.label || 'Outbound transfer', type: 'pending-out', ts: new Date(p.createdAt).getTime(), amount: p.amountCents ?? null, descriptor });
      }
    });

    (data.banks || []).forEach((b: any) => {
      if (b.updatedAt) {
        items.push({ label: b.name || 'Bank account', type: 'balance', ts: new Date(b.updatedAt).getTime(), amount: b.balanceCents ?? null, descriptor: 'Balance updated' });
      }
    });

    // Logged actions (deletions, etc.)
    loadActivityLog().forEach((entry) => {
      items.push({
        label: entry.label,
        type: 'logged',
        ts: new Date(entry.ts).getTime(),
        amount: entry.amountCents ?? null,
        descriptor: entry.type === 'delete_purchase' ? 'Deleted purchase'
          : entry.type === 'backup_export' ? 'Backup exported'
          : entry.type === 'backup_import' ? 'Backup imported'
          : entry.type,
      });
    });

    return items.filter((i) => !isNaN(i.ts)).sort((a, b) => b.ts - a.ts).slice(0, 3);
  }, [data]);

  return (
    <div className="recent-activity-widget">
      <p className="section-title" style={{ marginBottom: 10 }}>Recent Activity</p>
      {activities.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>No recent activity yet</p>
      ) : (
        activities.map((a, i) => {
          const d = new Date(a.ts);
          const timeStr = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
          return (
            <div key={i} className="recent-activity-item">
              <div className="recent-activity-dot" style={{ background: 'var(--accent)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="recent-activity-label" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>{a.label}</span>
                  {a.category ? (
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 400 }}>
                      {getCategoryName(cfg, a.category)}{a.subcategory ? ` · ${a.subcategory}` : ''}
                    </span>
                  ) : null}
                </div>
                <div className="recent-activity-type">
                  {a.descriptor ?? a.type}{a.amount != null ? ` · ${formatCents(a.amount)}` : ''}
                </div>
                <div style={{ fontSize: '0.66rem', color: 'var(--muted)', marginTop: 1 }}>
                  {timeStr}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// --- Backup Reminder Banner ---

function BackupReminderBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  const lastExportStr = localStorage.getItem(LAST_EXPORT_DATE_KEY);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let daysSince: number | null = null;
  if (lastExportStr) {
    const parts = lastExportStr.split('-').map(Number);
    const lastDate = new Date(parts[0], parts[1] - 1, parts[2]);
    daysSince = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  const shouldShow = !dismissed && (daysSince === null || daysSince >= 2);

  useEffect(() => {
    if (shouldShow) {
      const t = setTimeout(() => setVisible(true), 30);
      return () => clearTimeout(t);
    }
  }, [shouldShow]);

  // Listen for backup-completed event to hide the banner
  useEffect(() => {
    const handler = () => setDismissed(true);
    window.addEventListener('backup-completed', handler);
    return () => window.removeEventListener('backup-completed', handler);
  }, []);

  if (!shouldShow) return null;

  const backupLabel = localStorage.getItem(BACKUP_LOCATION_LABEL_KEY);

  const handleExportNow = () => {
    const text = exportJSON();
    const fileName = (() => {
      const d = new Date();
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return `${months[d.getMonth()]}_${d.getDate()}_${d.getFullYear()}.json`;
    })();

    const doExport = async () => {
      try {
        const nav: any = navigator as any;
        if (nav.share) {
          const file = new File([text], fileName, { type: 'application/json' });
          await nav.share({ files: [file] });
          localStorage.setItem(LAST_EXPORT_DATE_KEY, new Date().toISOString().slice(0, 10));
          logActivityEntry({ type: 'backup_export', label: 'Data exported', ts: new Date().toISOString() });
          window.dispatchEvent(new CustomEvent('backup-completed'));
          return;
        }
      } catch (_) {}

      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      localStorage.setItem(LAST_EXPORT_DATE_KEY, new Date().toISOString().slice(0, 10));
      logActivityEntry({ type: 'backup_export', label: 'Data exported', ts: new Date().toISOString() });
      window.dispatchEvent(new CustomEvent('backup-completed'));
    };
    doExport();
  };

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-8px)',
        transition: 'opacity 200ms ease, transform 200ms ease',
        background: 'var(--ui-card-bg, var(--surface))',
        borderRadius: 12,
        borderLeft: '4px solid var(--accent)',
        padding: '14px 14px 14px 16px',
        marginBottom: 10,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      {/* Cloud upload icon */}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
        <path d="M12 16V8m0 0l-3 3m3-3l3 3" />
        <path d="M4.06 14.526A4.5 4.5 0 0 1 8 7.5h.5A5.5 5.5 0 0 1 19 9a4 4 0 0 1 1 7.874" />
      </svg>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--ui-primary-text, var(--text))' }}>
          Back up your data
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
          {daysSince === null
            ? "You haven\u2019t backed up yet"
            : `Last backup was ${daysSince} day${daysSince !== 1 ? 's' : ''} ago`}
        </div>
        {backupLabel && (
          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
            Save to: {backupLabel}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleExportNow}
            style={{
              background: 'var(--accent)',
              color: 'var(--ui-primary-text, var(--text))',
              border: 'none',
              borderRadius: 20,
              padding: '6px 16px',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--app-font-family)',
            }}
          >
            Export now
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '0.74rem',
              cursor: 'pointer',
              padding: '6px 4px',
              fontFamily: 'var(--app-font-family)',
            }}
          >
            Remind me later
          </button>
        </div>
      </div>
    </div>
  );
}

export function SnapshotPage({
  onSwitchTab,
  onLogTransaction,
  onReimbursable,
  onAddRecurring,
  onAddBonus,
  onAdjustHysaAllocForAccount,
  pendingInTrigger = 0,
  pendingOutTrigger = 0,
}: {
  onSwitchTab?: (tab: string) => void;
  onLogTransaction?: () => void;
  onReimbursable?: () => void;
  onAddRecurring?: () => void;
  onAddBonus?: () => void;
  onAdjustHysaAllocForAccount?: (hysaAccountId: string) => void;
  pendingInTrigger?: number;
  pendingOutTrigger?: number;
}) {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);

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
        editId?: string;
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
        valueInputs: Record<string, string>;
        rewardType: 'cashback' | 'miles' | 'points';
        rewardBalanceStr: string;
        rewardCppStr: string;
      }
  >({ type: 'none' });

  // Which detail section is expanded: 'cash' | 'cards' | 'pending' | null (accordion)
  const [activeSection, setActiveSection] = useState<'cash' | 'cards' | 'pending' | null>(null);
  const [banksIdx, setBanksIdx] = useState(0);
  const [cardsIdx, setCardsIdx] = useState(0);
  const [showAllBanks, setShowAllBanks] = useState(false);
  const [showAllCards, setShowAllCards] = useState(false);
  const banksCarouselRef = useRef<HTMLDivElement>(null);
  const cardsCarouselRef = useRef<HTMLDivElement>(null);
  const [banksCarouselHeight, setBanksCarouselHeight] = useState<number | undefined>(undefined);
  const [cardsCarouselHeight, setCardsCarouselHeight] = useState<number | undefined>(undefined);

  function toggleSection(s: 'cash' | 'cards' | 'pending') {
    setActiveSection((prev) => (prev === s ? null : s));
  }

  // Open add-pending modal when triggered from quick-action sheet
  // useRef guards prevent firing on tab remount with a stale trigger value
  const lastPendingInTriggerRef = useRef(pendingInTrigger);
  useEffect(() => {
    if (pendingInTrigger !== lastPendingInTriggerRef.current) {
      lastPendingInTriggerRef.current = pendingInTrigger;
      if (pendingInTrigger > 0) {
        setActiveSection('pending');
        setModal({ type: 'add-pending', kind: 'in', label: '', amount: '', isRefund: false, depositTo: 'bank', targetCardId: '', targetBankId: '', targetInvestingAccountId: '', hysaSubBucket: '', outboundType: 'standard', sourceBankId: '', targetCardIdOut: '', outboundSourceKind: 'bank', outboundSourceHysaAccountId: '', outboundHysaSubBucket: '' });
      }
    }
  }, [pendingInTrigger]);

  const lastPendingOutTriggerRef = useRef(pendingOutTrigger);
  useEffect(() => {
    if (pendingOutTrigger !== lastPendingOutTriggerRef.current) {
      lastPendingOutTriggerRef.current = pendingOutTrigger;
      if (pendingOutTrigger > 0) {
        setActiveSection('pending');
        setModal({ type: 'add-pending', kind: 'out', label: '', amount: '', isRefund: false, depositTo: 'bank', targetCardId: '', targetBankId: '', targetInvestingAccountId: '', hysaSubBucket: '', outboundType: 'standard', sourceBankId: '', targetCardIdOut: '', outboundSourceKind: 'bank', outboundSourceHysaAccountId: '', outboundHysaSubBucket: '' });
      }
    }
  }, [pendingOutTrigger]);

  const totals = useMemo(() => calcFinalNetCashCents(data), [data]);

  // Snapshot needs to stay in sync with HYSA updates (pending inbound/outbound postings),
  // which are persisted to localStorage but may not update investingState automatically.
  const investingState = useMemo(() => loadInvesting(), [data.pendingIn, data.pendingOut]);
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
    const map: Record<string, number> = {};
    (investingState.accounts || []).forEach((acc: any) => {
      if (!acc || acc.type !== 'hysa') return;
      const h = acc as HysaAccount;
      const bankId = h.linkedCheckingBankId || null;
      if (!bankId) return;
      const balance = typeof h.balanceCents === 'number' ? h.balanceCents : 0;
      const reservedRaw =
        typeof h.reservedSavingsCents === 'number' && h.reservedSavingsCents >= 0 ? h.reservedSavingsCents : 0;
      const reserved = Math.min(reservedRaw, balance);
      const liquid = Math.max(0, balance - reserved);
      if (liquid <= 0) return;
      map[bankId] = (map[bankId] || 0) + liquid;
    });
    return map;
  }, [investingState]);

  const totalLinkedHysaCents = useMemo(
    () => Object.values(linkedHysaLiquidByBankId).reduce((a, b) => a + b, 0),
    [linkedHysaLiquidByBankId]
  );

  const displayedFinalNetCashCents =
    totalLinkedHysaCents > 0 ? totals.finalNetCashCents + totalLinkedHysaCents : totals.finalNetCashCents;
  const finalNetCashDisplayClass =
    displayedFinalNetCashCents >= 0 ? 'summary-kv final-net-cash positive' : 'summary-kv final-net-cash negative';

  const visibleBanks = useMemo(() => {
    return showZeroCashItems
      ? banksSortedByBalance
      : banksSortedByBalance.filter((b) => (b.balanceCents || 0) !== 0);
  }, [banksSortedByBalance, showZeroCashItems]);

  const visibleCards = useMemo(() => {
    return showZeroCreditCards
      ? cardsSortedByBalance
      : cardsSortedByBalance.filter((c) => (c.balanceCents || 0) !== 0);
  }, [cardsSortedByBalance, showZeroCreditCards]);

  const displayedBanks = showAllBanks ? visibleBanks : visibleBanks.slice(0, 5);
  const displayedCards = showAllCards ? visibleCards : visibleCards.slice(0, 5);

  // Set dynamic height of banks carousel to the currently visible item's height
  useEffect(() => {
    if (activeSection !== 'cash') return;
    requestAnimationFrame(() => {
      const carousel = banksCarouselRef.current;
      if (!carousel) return;
      const firstItem = carousel.children[0] as HTMLElement | undefined;
      if (firstItem) setBanksCarouselHeight(firstItem.offsetHeight);
    });
  }, [activeSection, visibleBanks.length]);

  // Set dynamic height of cards carousel to the currently visible item's height
  useEffect(() => {
    if (activeSection !== 'cards') return;
    requestAnimationFrame(() => {
      const carousel = cardsCarouselRef.current;
      if (!carousel) return;
      const firstItem = carousel.children[0] as HTMLElement | undefined;
      if (firstItem) setCardsCarouselHeight(firstItem.offsetHeight);
    });
  }, [activeSection, visibleCards.length]);


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

  const totalCardDebtCents = totals.ccDebtCents;
  const totalCashCents = totals.bankTotalCents;
  const pendingCount = (data.pendingIn || []).length + (data.pendingOut || []).length;

  return (
    <div className="tab-panel active" id="snapshotContent">

      {/* Backup Reminder */}
      <BackupReminderBanner />

      {/* Recent Activity */}
      <RecentActivityWidget />

      {/* Summary Stat Tiles */}
      <div className="stat-tiles-row">
        <button
          type="button"
          className={`stat-tile${activeSection === 'cards' ? ' active' : ''}`}
          onClick={() => toggleSection('cards')}
          aria-expanded={activeSection === 'cards'}
        >
          <div className="stat-tile-icon"><IconCreditCard /></div>
          <div className="stat-tile-value" style={{ color: totalCardDebtCents > 0 ? 'var(--red)' : 'var(--green)' }}>{formatCents(totalCardDebtCents)}</div>
          <div className="stat-tile-label">Credit Card Balance</div>
        </button>
        <button
          type="button"
          className={`stat-tile${activeSection === 'cash' ? ' active' : ''}`}
          onClick={() => toggleSection('cash')}
          aria-expanded={activeSection === 'cash'}
        >
          <div className="stat-tile-icon"><IconArrowExchange /></div>
          <div className="stat-tile-value" style={{ color: totalCashCents > 0 ? 'var(--green)' : totalCashCents < 0 ? 'var(--red)' : undefined }}>{formatCents(totalCashCents)}</div>
          <div className="stat-tile-label">Bank Balance</div>
        </button>
        <button
          type="button"
          className={`stat-tile${activeSection === 'pending' ? ' active' : ''}`}
          onClick={() => toggleSection('pending')}
          aria-expanded={activeSection === 'pending'}
        >
          <div className="stat-tile-icon"><IconClock /></div>
          <div className="stat-tile-value" style={{ color: pendingCount > 0 ? '#f97316' : undefined }}>{pendingCount}</div>
          <div className="stat-tile-label">Pending</div>
        </button>
      </div>

      <div className={`snapshot-section-body${activeSection === 'cash' ? ' open' : ''}`}>
      <div className="snapshot-section-label" id="snapshotCash">
        <span>Bank Accounts</span>
        <div className="snapshot-section-label-actions">
          <button
            type="button"
            className="snapshot-util-btn"
            onClick={(e) => {
              e.stopPropagation();
              const next = !showZeroCashItems;
              setShowZeroCashItems(next);
              saveBoolPref(SHOW_ZERO_CASH_KEY, next);
            }}
          >
            {showZeroCashItems ? 'Hide $0' : 'Show $0'}
          </button>
          <button
            type="button"
            className="snapshot-add-btn"
            onClick={() => setModal({ type: 'add-bank', name: '' })}
          >
            <IconPlus />
            Add
          </button>
        </div>
      </div>
      <>
          <div style={banksCarouselHeight != null ? { height: banksCarouselHeight, overflow: 'hidden' } : {}}>
          <div
            className="card-carousel"
            ref={banksCarouselRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const rawIdx = el.scrollLeft / (el.clientWidth || 1);
              setBanksIdx(Math.round(rawIdx));
              const leftIdx = Math.floor(rawIdx);
              const rightIdx = Math.min(leftIdx + 1, el.children.length - 1);
              const progress = rawIdx - leftIdx;
              const lh = (el.children[leftIdx] as HTMLElement | undefined)?.offsetHeight ?? 0;
              const rh = (el.children[rightIdx] as HTMLElement | undefined)?.offsetHeight ?? lh;
              setBanksCarouselHeight(Math.round(lh + (rh - lh) * progress));
              scheduleSnapCorrection(el);
            }}
          >
            {displayedBanks.map((b) => {
              const linkedLiquid = linkedHysaLiquidByBankId[b.id] || 0;
              const linkedHysa = hysaAccountsSorted.find((h: any) => h.linkedCheckingBankId === b.id);
              return (
                <div className="card-carousel-item" key={b.id}>
                  <div className="card ll-account-card">
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
                      <div style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
                        Includes {formatCents(linkedLiquid)} from linked HYSA
                      </div>
                    ) : null}
                    <div className="btn-row" style={{ marginTop: 10, marginBottom: 0 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                        onClick={() =>
                          setModal({ type: 'edit-balance', kind: 'bank', id: b.id, amount: '', useSet: false })
                        }
                      >
                        Update Balance
                      </button>
                      {linkedHysa && onAdjustHysaAllocForAccount ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                          onClick={() => onAdjustHysaAllocForAccount((linkedHysa as any).id)}
                        >
                          Adjust HYSA Split
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn clear-btn"
                        style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                        onClick={() =>
                          openConfirm(
                            'Set balance to $0?',
                            'This will set the balance to $0.00. This cannot be undone.',
                            () => actions.updateBankBalance(b.id, 0, 'set')
                          )
                        }
                      >
                        Set to $0
                      </button>
                      {b.type !== 'physical_cash' ? (
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                          onClick={() =>
                            openConfirm(
                              `Delete ${b.name || 'this account'}?`,
                              'This will permanently remove this account and its balance. This cannot be undone.',
                              () => actions.deleteBankAccount(b.id)
                            )
                          }
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
          {displayedBanks.length > 1 && (showAllBanks && visibleBanks.length >= 5 ? (
            <div style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 6, marginBottom: 8 }}>
              {banksIdx + 1} of {displayedBanks.length}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 6, marginBottom: 8 }}>
                {displayedBanks.map((_, i) => (
                  <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i === banksIdx ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s', display: 'inline-block', flexShrink: 0 }} />
                ))}
              </div>
              {visibleBanks.length >= 5 && banksIdx >= displayedBanks.length - 1 ? (
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 14px', minHeight: 'unset' }} onClick={() => setShowAllBanks(true)}>See more</button>
                </div>
              ) : null}
            </>
          ))}
        </>
      </div>

      <div className={`snapshot-section-body${activeSection === 'cards' ? ' open' : ''}`}>
      <div className="snapshot-section-label" id="snapshotCards">
        <span>Credit Cards</span>
        <div className="snapshot-section-label-actions">
          <button
            type="button"
            className="snapshot-util-btn"
            onClick={(e) => {
              e.stopPropagation();
              const next = !showZeroCreditCards;
              setShowZeroCreditCards(next);
              saveBoolPref(SHOW_ZERO_CARDS_KEY, next);
            }}
          >
            {showZeroCreditCards ? 'Hide $0' : 'Show $0'}
          </button>
          <button
            type="button"
            className="snapshot-add-btn"
            onClick={() => setModal({ type: 'add-card', name: '' })}
          >
            <IconPlus />
            Add
          </button>
        </div>
      </div>
      <>
          <div style={cardsCarouselHeight != null ? { height: cardsCarouselHeight, overflow: 'hidden' } : {}}>
          <div
            className="card-carousel"
            ref={cardsCarouselRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const rawIdx = el.scrollLeft / (el.clientWidth || 1);
              setCardsIdx(Math.round(rawIdx));
              const leftIdx = Math.floor(rawIdx);
              const rightIdx = Math.min(leftIdx + 1, el.children.length - 1);
              const progress = rawIdx - leftIdx;
              const lh = (el.children[leftIdx] as HTMLElement | undefined)?.offsetHeight ?? 0;
              const rh = (el.children[rightIdx] as HTMLElement | undefined)?.offsetHeight ?? lh;
              setCardsCarouselHeight(Math.round(lh + (rh - lh) * progress));
              scheduleSnapCorrection(el);
            }}
          >
            {displayedCards.map((c) => {
              const balanceCents = c.balanceCents ?? 0;
              const amountClass =
                balanceCents > 0 ? 'amount amount-neg' : balanceCents < 0 ? 'amount amount-pos' : 'amount amount-pos';
              return (
                <div className="card-carousel-item" key={c.id}>
                  <div className="card ll-account-card">
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
                          className="info-icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            const rules = getEffectiveRules(c);
                            // Migrate legacy single-category rules to categories[] format
                            const migrateRule = (r: RewardRule): RewardRule => {
                              if ((r.categories?.length ?? 0) > 0) return r;
                              if (r.isCatchAll || !r.category) return { ...r, categories: [] };
                              return { ...r, categories: [{ category: r.category, subcategory: r.subcategory || undefined }] };
                            };
                            const initialRules: RewardRule[] = rules.length > 0 ? rules.map(migrateRule) : [{ id: uid(), category: '', subcategory: '', categories: [], value: 1.5, unit: 'cashback_percent' as RewardUnitType, isCatchAll: false }];
                            const valueInputs: Record<string, string> = {};
                            initialRules.forEach((r) => { valueInputs[r.id] = r.value === 0 ? '' : String(r.value); });
                            setModal({
                              type: 'card-reward-config',
                              cardId: c.id,
                              rules: initialRules,
                              valueInputs,
                              rewardType: c.rewardType ?? (c.rewardMiles != null && c.rewardMiles > 0 ? 'miles' : (c.rewardPoints != null && c.rewardPoints > 0 ? 'points' : 'cashback')),
                              rewardBalanceStr: c.rewardType === 'cashback' || (!c.rewardType && (c.rewardPoints == null || c.rewardPoints === 0) && (c.rewardMiles == null || c.rewardMiles === 0))
                                ? (typeof c.rewardCashbackCents === 'number' ? (c.rewardCashbackCents / 100).toFixed(2) : '')
                                : c.rewardType === 'miles' || (c.rewardMiles != null && c.rewardMiles > 0)
                                  ? String(c.rewardMiles ?? '')
                                  : String(c.rewardPoints ?? ''),
                              rewardCppStr: c.rewardType === 'points' || (c.rewardPoints != null && c.rewardPoints > 0) ? (typeof c.avgCentsPerPoint === 'number' ? String(c.avgCentsPerPoint) : '') : (typeof c.avgCentsPerMile === 'number' ? String(c.avgCentsPerMile) : '')
                            });
                          }}
                          title="Card reward categories"
                          aria-label="Card reward categories"
                        >
                          +
                        </button>
                      </span>
                      <span className={amountClass}>{formatCents(balanceCents)}</span>
                    </div>
                    <div className="btn-row" style={{ marginTop: 10, marginBottom: 0 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                        onClick={() => setModal({ type: 'edit-balance', kind: 'card', id: c.id, amount: '', useSet: false })}
                      >
                        Update Balance
                      </button>
                      <button
                        type="button"
                        className="btn clear-btn"
                        style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                        onClick={() =>
                          openConfirm(
                            'Set balance to $0?',
                            'This will set the balance to $0.00. This cannot be undone.',
                            () => actions.updateCardBalance(c.id, 0, 'set')
                          )
                        }
                      >
                        Set to $0
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ fontSize: '0.82rem', padding: '6px 12px', minHeight: 'unset' }}
                        onClick={() =>
                          openConfirm(
                            `Delete ${c.name || 'this card'}?`,
                            'This will permanently remove this card and its balance. This cannot be undone.',
                            () => actions.deleteCreditCard(c.id)
                          )
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
          {displayedCards.length > 1 && (showAllCards && visibleCards.length >= 5 ? (
            <div style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--ui-primary-text, var(--text))', marginTop: 6, marginBottom: 8 }}>
              {cardsIdx + 1} of {displayedCards.length}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 6, marginBottom: 8 }}>
                {displayedCards.map((_, i) => (
                  <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i === cardsIdx ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s', display: 'inline-block', flexShrink: 0 }} />
                ))}
              </div>
              {visibleCards.length >= 5 && cardsIdx >= displayedCards.length - 1 ? (
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 14px', minHeight: 'unset' }} onClick={() => setShowAllCards(true)}>See more</button>
                </div>
              ) : null}
            </>
          ))}
        </>
      </div>

      <div className={`snapshot-section-body${activeSection === 'pending' ? ' open' : ''}`}>
      <div className="snapshot-section-label" id="snapshotPending">
        <span>Pending Inbound</span>
        <button
          type="button"
          className="snapshot-add-btn"
          onClick={() => setModal({ type: 'add-pending', kind: 'in', label: '', amount: '', isRefund: false, depositTo: 'bank', targetCardId: '', targetBankId: '', targetInvestingAccountId: '', hysaSubBucket: '', outboundType: 'standard', sourceBankId: '', targetCardIdOut: '', outboundSourceKind: 'bank', outboundSourceHysaAccountId: '', outboundHysaSubBucket: '' })}
        >
          <IconPlus />
          Add
        </button>
      </div>
      {(data.pendingIn || []).length > 0 ? (
        <>
          <PendingInboundList
            data={data}
            items={data.pendingIn || []}
            onPosted={(id) => handlePendingPosted('in', id)}
            onDelete={(id) => openConfirm('Delete this pending deposit?', 'This will permanently remove this item from your pending deposits.', () => actions.deletePending('in', id))}
            onEditInbound={(item: PendingInboundItem) => {
              const depositTo = (item.depositTo || 'bank') as 'bank' | 'card' | 'hysa';
              const firstBankId = (data.banks || [])[0]?.id || '';
              setModal({
                type: 'add-pending',
                kind: 'in',
                editId: item.id,
                label: item.label || '',
                amount: item.amountCents != null ? (item.amountCents / 100).toFixed(2) : '',
                isRefund: !!(item.isRefund || item.depositTo === 'card'),
                depositTo: item.depositTo === 'card' ? 'card' : depositTo,
                targetCardId: item.targetCardId || '',
                targetBankId: item.targetBankId || firstBankId,
                targetInvestingAccountId: item.targetInvestingAccountId || '',
                hysaSubBucket: (() => {
                  const v = (item.meta as { hysaSubBucket?: string })?.hysaSubBucket || '';
                  return v === 'reserved' ? 'reserved' : v === 'liquid' ? 'liquid' : '';
                })(),
                outboundType: 'standard',
                sourceBankId: firstBankId,
                targetCardIdOut: '',
                outboundSourceKind: 'bank',
                outboundSourceHysaAccountId: '',
                outboundHysaSubBucket: ''
              });
            }}
            onJoinInbound={(ids, combined) => {
              ids.forEach((id) => actions.deletePending('in', id));
              actions.addPendingInbound(combined);
            }}
          />
        </>
      ) : null}

      <div className="snapshot-section-label">
        <span>Pending Outbound</span>
        <button
          type="button"
          className="snapshot-add-btn"
          onClick={() => setModal({ type: 'add-pending', kind: 'out', label: '', amount: '', isRefund: false, depositTo: 'bank', targetCardId: '', targetBankId: '', targetInvestingAccountId: '', hysaSubBucket: '', outboundType: 'standard', sourceBankId: '', targetCardIdOut: '', outboundSourceKind: 'bank', outboundSourceHysaAccountId: '', outboundHysaSubBucket: '' })}
        >
          <IconPlus />
          Add
        </button>
      </div>
      {(data.pendingOut || []).length > 0 ? (
        <>
          <PendingOutboundList
            data={data}
            items={data.pendingOut || []}
            onPosted={(id) => handlePendingPosted('out', id)}
            onDelete={(id) => openConfirm('Delete this pending payment?', 'This will permanently remove this item from your pending payments.', () => actions.deletePending('out', id))}
            onEditOutbound={(item: PendingOutboundItem) => {
              const firstBankId = (data.banks || [])[0]?.id || '';
              const isCc = item.outboundType === 'cc_payment';
              const fromHysa = item.paymentSource === 'hysa' || (item as any).meta?.hysaSubBucket;
              setModal({
                type: 'add-pending',
                kind: 'out',
                editId: item.id,
                label: item.label || '',
                amount: item.amountCents != null ? (item.amountCents / 100).toFixed(2) : '',
                isRefund: false,
                depositTo: 'bank',
                targetCardId: '',
                targetBankId: firstBankId,
                targetInvestingAccountId: '',
                hysaSubBucket: '',
                outboundType: isCc ? 'cc_payment' : 'standard',
                sourceBankId: item.sourceBankId || firstBankId,
                targetCardIdOut: item.targetCardId || '',
                outboundSourceKind: fromHysa ? 'hysa' : 'bank',
                outboundSourceHysaAccountId: (item as any).paymentTargetId || (item as any).meta?.investingAccountId || '',
                outboundHysaSubBucket: (item as any).meta?.hysaSubBucket || ''
              });
            }}
            onJoinOutbound={(ids, combined) => {
              ids.forEach((id) => actions.deletePending('out', id));
              actions.addPendingOutbound(combined);
            }}
          />
        </>
      ) : null}
      </div>

      <div className="summary net-cash-card" id="snapshotSummary">
        <div className="summary-compact">
          <div className="summary-kv">
            <span className="k">Current Bank Balance</span>
            <span className="v" style={{ color: 'var(--green)' }}>{formatCents(totals.bankTotalCents)}</span>
          </div>
          {totalLinkedHysaCents > 0 ? (
            <div className="summary-kv">
              <span className="k">Bills fund</span>
              <span className="v" style={{ color: 'var(--green)' }}>{formatCents(totalLinkedHysaCents)}</span>
            </div>
          ) : null}
          <div className="summary-kv">
            <span className="k">Total Credit Card Balance</span>
            <span className="v" style={{ color: 'var(--red)' }}>{formatCents(totals.ccDebtCents)}</span>
          </div>
          <div className="summary-kv">
            <span className="k">Total Pending Inbound</span>
            <span className="v" style={{ color: 'var(--green)' }}>{formatCents(totals.pendingInCents)}</span>
          </div>
          <div
            className="summary-kv"
            style={{ cursor: 'pointer' }}
            onClick={() => setSummaryPendingOutBreakdownCollapsed(!summaryPendingOutBreakdownCollapsed)}
            title={summaryPendingOutBreakdownCollapsed ? 'Show breakdown' : 'Hide breakdown'}
          >
            <span className="k">
              Total Pending Outbound
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
          <div className={finalNetCashDisplayClass} >
            <span className="k">Final Net Cash</span>
            <span className="v" style={{ color: displayedFinalNetCashCents >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {formatCents(displayedFinalNetCashCents)}
            </span>
          </div>
        </div>
      </div>

      {modal.type !== 'none' ? (
        <div className={modal.type === 'card-reward-config' || modal.type === 'loan-payment-preview' ? 'modal-overlay modal-overlay--fullscreen' : 'modal-overlay'}>
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
                <p style={{ color: 'var(--ui-primary-text, var(--text))', marginTop: 0 }}>
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
                    className="btn btn-secondary"
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
                <div className="modal-header modal-header--sticky">
                  <h3 style={{ margin: 0, flex: 1 }}>Loan payment breakdown</h3>
                  <button type="button" aria-label="Close" onClick={() => setModal({ type: 'none' })} className="modal-close-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
                </div>
                <p style={{ color: 'var(--ui-primary-text, var(--text))', marginTop: 0 }}>
                  Review how this payment will update your loan balances. You can edit the private loan amounts for this
                  posted payment only.
                </p>
                <div className="card" style={{ padding: 10, marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 6 }}>Private loans</div>
                  {modal.privateRows.length === 0 ? (
                    <p style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.85rem', margin: 0 }}>No private loans detected.</p>
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
                            <div style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))' }}>
                              Current balance: {formatCents(current)}
                            </div>
                          </div>
                          <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--ui-primary-text, var(--text))' }}>Subtract ($)</label>
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
                            <div style={{ fontSize: '0.75rem', color: 'var(--ui-primary-text, var(--text))' }}>New balance</div>
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
                        : '-'}
                    </span>
                  </div>
                </div>
                <div className="btn-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: 'none' })}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
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
                const newRule: RewardRule = { id: uid(), category: '', subcategory: '', categories: [], value: 1.5, unit: 'cashback_percent' as RewardUnitType, isCatchAll: false };
                setModal({
                  ...modal,
                  rules: [...modal.rules, newRule],
                  valueInputs: { ...modal.valueInputs, [newRule.id]: '' }
                });
              };
              const removeRule = (idx: number) => {
                const next = modal.rules.filter((_, i) => i !== idx);
                const newRules: RewardRule[] = next.length > 0 ? next : [{ id: uid(), category: '', subcategory: '', categories: [], value: 1.5, unit: 'cashback_percent' as RewardUnitType, isCatchAll: false }];
                const nextInputs = { ...modal.valueInputs };
                if (modal.rules[idx]) delete nextInputs[modal.rules[idx].id];
                if (next.length === 0) nextInputs[newRules[0].id] = '';
                setModal({ ...modal, rules: newRules, valueInputs: nextInputs });
              };
              const setCatchAll = (idx: number, isCatchAll: boolean) => {
                const next = modal.rules.map((r, i) => ({ ...r, isCatchAll: i === idx ? isCatchAll : false }));
                setModal({ ...modal, rules: next });
              };
              const validRules = modal.rules
                .filter((r) => r.isCatchAll || (r.categories && r.categories.length > 0) || (r.category && r.category.trim()))
                .map((r) => ({
                  ...r,
                  value: (() => { const n = parseFloat(modal.valueInputs[r.id] ?? String(r.value)); return Number.isNaN(n) ? 0 : n; })()
                }));
              return (
                <>
                  <div className="modal-header modal-header--sticky">
                    <h3 style={{ margin: 0, flex: 1 }}>Card reward rules</h3>
                    <button type="button" aria-label="Close" onClick={() => setModal({ type: 'none' })} className="modal-close-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))', marginTop: -4, marginBottom: 12 }}>
                    Add rules for category/subcategory. Exact match wins; catch-all applies when no rule matches.
                  </p>
                  {modal.rules.map((rule, idx) => {
                    const pairs = rule.categories ?? [];
                    return (
                      <div key={rule.id} style={{ background: 'var(--ui-surface-secondary, var(--surface))', border: '1px solid var(--ui-border, var(--border))', borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rule {idx + 1}</span>
                          <button type="button" className="btn clear-btn" style={{ padding: '2px 8px', fontSize: '0.75rem', minHeight: 'unset' }} onClick={() => removeRule(idx)}>Remove</button>
                        </div>

                        {/* Rate row: value + unit inline */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
                          <div style={{ flex: '0 0 80px' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Rate</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="1.5"
                              value={modal.valueInputs[rule.id] ?? (rule.value === 0 ? '' : String(rule.value))}
                              onChange={(e) => setModal({ ...modal, valueInputs: { ...modal.valueInputs, [rule.id]: e.target.value } })}
                              style={{ width: '100%', padding: '6px 8px', fontSize: '0.9rem', borderRadius: 8, border: '1px solid var(--ui-border, var(--border))', background: 'var(--ui-card-bg, var(--surface))', color: 'var(--ui-primary-text, var(--text))' }}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Type</label>
                            <Select value={rule.unit} onChange={(e) => updateRule(idx, { unit: e.target.value as RewardRule['unit'] })}>
                              <option value="cashback_percent">% cashback</option>
                              <option value="points_multiplier">× points</option>
                              <option value="miles_multiplier">× miles</option>
                            </Select>
                          </div>
                        </div>

                        {/* Catch-all toggle */}
                        <div className="toggle-row" style={{ margin: '0 0 8px' }}>
                          <input type="checkbox" id={`catchAll-${idx}`} checked={!!rule.isCatchAll} onChange={(e) => setCatchAll(idx, e.target.checked)} />
                          <label htmlFor={`catchAll-${idx}`} style={{ fontSize: '0.82rem' }}>Catch-all (fallback when no other rule matches)</label>
                        </div>

                        {/* Multi-category pairs */}
                        {!rule.isCatchAll && (
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 5 }}>
                              Categories ({pairs.length === 0 ? 'none - add below' : `${pairs.length} selected`})
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                              {pairs.map((pair, pi) => (
                                <span key={pi} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: 'color-mix(in srgb, var(--ui-add-btn, var(--accent)) 14%, transparent)', color: 'var(--ui-add-btn, var(--accent))', fontSize: '0.75rem', fontWeight: 600 }}>
                                  {getCategoryName(cfg, pair.category)}{pair.subcategory ? ` → ${pair.subcategory}` : ''}
                                  <button type="button" onClick={() => updateRule(idx, { categories: pairs.filter((_, i) => i !== pi) })} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', fontSize: '0.85rem', lineHeight: 1, display: 'flex', alignItems: 'center' }}>×</button>
                                </span>
                              ))}
                            </div>
                            {/* Inline add pair */}
                            {(() => {
                              const [addCat, setAddCat] = [
                                (modal as any)[`_addCat_${rule.id}`] ?? '',
                                (v: string) => setModal({ ...modal, [`_addCat_${rule.id}`]: v, [`_addSub_${rule.id}`]: '' } as any),
                              ];
                              const addSub = (modal as any)[`_addSub_${rule.id}`] ?? '';
                              const addSubSetter = (v: string) => setModal({ ...modal, [`_addSub_${rule.id}`]: v } as any);
                              const addSubs = getCategorySubcategories(cfg, addCat);
                              return (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <Select value={addCat} onChange={(e) => setAddCat(e.target.value)} style={{ flex: '1 1 120px', fontSize: '0.82rem', padding: '5px 8px', minHeight: 'unset' }}>
                                    <option value="">+ Category</option>
                                    {Object.keys(cfg).map((id) => <option key={id} value={id}>{getCategoryName(cfg, id)}</option>)}
                                  </Select>
                                  {addSubs.length > 0 && (
                                    <Select value={addSub} onChange={(e) => addSubSetter(e.target.value)} style={{ flex: '1 1 100px', fontSize: '0.82rem', padding: '5px 8px', minHeight: 'unset' }}>
                                      <option value="">Any sub</option>
                                      {addSubs.map((s) => <option key={s} value={s}>{s}</option>)}
                                    </Select>
                                  )}
                                  <button
                                    type="button"
                                    className="snapshot-add-btn"
                                    style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                                    disabled={!addCat}
                                    onClick={() => {
                                      if (!addCat) return;
                                      const newPair = { category: addCat, subcategory: addSub || undefined };
                                      const nextRules = modal.rules.slice();
                                      nextRules[idx] = { ...nextRules[idx], categories: [...pairs, newPair] };
                                      setModal({ ...modal, rules: nextRules, [`_addCat_${rule.id}`]: '', [`_addSub_${rule.id}`]: '' } as any);
                                    }}
                                  >
                                    Add
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button type="button" className="btn btn-secondary" style={{ marginBottom: 12 }} onClick={addRule}>Add rule</button>
                  <div className="field" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <label style={{ fontSize: '0.9rem' }}>Current reward balance</label>
                    <p style={{ fontSize: '0.8rem', color: 'var(--ui-primary-text, var(--text))', margin: '0 0 8px 0' }}>
                      Manual balance for this card. Informational only; does not affect net worth.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ flex: '1 1 120px' }}>
                        <label style={{ fontSize: '0.75rem' }}>Type</label>
                        <Select value={modal.rewardType} onChange={(e) => setModal({ ...modal, rewardType: e.target.value as 'cashback' | 'miles' | 'points' })} style={{ width: '100%' }}>
                          <option value="cashback">Cashback ($)</option>
                          <option value="points">Points</option>
                          <option value="miles">Miles</option>
                        </Select>
                      </div>
                      <div style={{ flex: '1 1 100px' }}>
                        <label style={{ fontSize: '0.75rem' }}>{modal.rewardType === 'cashback' ? 'Balance ($)' : 'Balance'}</label>
                        <input
                          type="text"
                          inputMode={modal.rewardType === 'cashback' ? 'decimal' : 'numeric'}
                          placeholder={modal.rewardType === 'cashback' ? '0.00' : '0'}
                          value={modal.rewardBalanceStr}
                          onChange={(e) => setModal({ ...modal, rewardBalanceStr: e.target.value })}
                          style={{ width: '100%', padding: '6px 8px' }}
                        />
                      </div>
                      {(modal.rewardType === 'points' || modal.rewardType === 'miles') ? (
                        <div style={{ flex: '1 1 80px' }}>
                          <label style={{ fontSize: '0.75rem' }}>Cents per point/mile</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="e.g. 1.2"
                            value={modal.rewardCppStr}
                            onChange={(e) => setModal({ ...modal, rewardCppStr: e.target.value })}
                            style={{ width: '100%', padding: '6px 8px' }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="btn-row">
                    <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: 'none' })}>Cancel</button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        actions.updateCardRewardRules(modal.cardId, validRules);
                        const balanceStr = modal.rewardBalanceStr.trim().replace(/,/g, '');
                        const balance = balanceStr ? (modal.rewardType === 'cashback' ? Math.round(parseFloat(balanceStr) * 100) : Math.round(parseFloat(balanceStr))) : 0;
                        const totals: { rewardType: 'cashback' | 'miles' | 'points'; rewardCashbackCents?: number; rewardPoints?: number; rewardMiles?: number } = { rewardType: modal.rewardType };
                        if (modal.rewardType === 'cashback') totals.rewardCashbackCents = Math.max(0, balance);
                        else if (modal.rewardType === 'points') totals.rewardPoints = Math.max(0, balance);
                        else totals.rewardMiles = Math.max(0, balance);
                        actions.updateCardRewardTotals(modal.cardId, totals);
                        const cpp = modal.rewardCppStr.trim() ? parseFloat(modal.rewardCppStr) : undefined;
                        if ((modal.rewardType === 'points' || modal.rewardType === 'miles') && typeof cpp === 'number' && !Number.isNaN(cpp) && cpp >= 0) {
                          actions.updateCardRewardCpp(modal.cardId, modal.rewardType === 'points' ? { avgCentsPerPoint: cpp } : { avgCentsPerMile: cpp });
                        }
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
                <h3>Update Balance</h3>
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
                  <label htmlFor="useSet">Replace current balance (instead of adding)</label>
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
                    Update Balance
                  </button>
                </div>
              </>
            ) : null}

            {modal.type === 'add-pending' ? (
              <>
                <h3>{modal.editId ? (modal.kind === 'in' ? 'Edit expected deposit' : 'Edit expected payment') : (modal.kind === 'in' ? 'Add expected deposit' : 'Add expected payment')}</h3>
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
                      <input
                        type="checkbox"
                        checked={modal.isRefund}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const singleCardId = checked && cardsSortedByBalance.length === 1 ? cardsSortedByBalance[0]?.id ?? '' : '';
                          setModal({ ...modal, isRefund: checked, targetCardId: checked ? (singleCardId || modal.targetCardId) : '' });
                        }}
                        id="isRefund"
                      />
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
                        {modal.isRefund ? (
                          <option value="card">Credit Card</option>
                        ) : (
                          <>
                            <option value="bank">Bank</option>
                            <option value="hysa">HYSA</option>
                          </>
                        )}
                      </Select>
                    </div>
                    {modal.isRefund || modal.depositTo === 'card' ? (
                      <div className="field">
                        <label>Card</label>
                        <Select value={modal.targetCardId} onChange={(e) => setModal({ ...modal, targetCardId: e.target.value })}>
                          <option value="">Select...</option>
                          {cardsSortedByBalance.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} - {formatCents(c.balanceCents || 0)}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ) : modal.depositTo === 'hysa' ? (
                      <>
                        <div className="field">
                          <label>HYSA Account</label>
                          <Select value={modal.targetInvestingAccountId} onChange={(e) => setModal({ ...modal, targetInvestingAccountId: e.target.value })}>
                            <option value="">Select...</option>
                            {hysaAccountsSorted.map((a: any) => (
                              <option key={a.id} value={a.id}>
                                {a.name} - {formatCents(a.balanceCents || 0)}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="field">
                          <label>Use which HYSA portion?</label>
                          <Select value={modal.hysaSubBucket} onChange={(e) => setModal({ ...modal, hysaSubBucket: e.target.value as any })}>
                            <option value="">Select...</option>
                            <option value="liquid">Bills fund</option>
                            <option value="reserved">Savings reserve</option>
                          </Select>
                        </div>
                      </>
                    ) : (
                      <div className="field">
                        <label>Bank</label>
                        <Select value={modal.targetBankId || ''} onChange={(e) => setModal({ ...modal, targetBankId: e.target.value })}>
                          <option value="">Select...</option>
                          {banksSortedByBalance.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} - {formatCents(b.balanceCents || 0)}
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
                        <option value="standard">General payment / transfer</option>
                        <option value="cc_payment">Credit Card Payment</option>
                      </Select>
                    </div>
                    {modal.outboundType === 'cc_payment' ? (
                      <>
                        <div className="field">
                          <label>From</label>
                          <Select
                            value={modal.outboundSourceKind}
                            onChange={(e) =>
                              setModal({
                                ...modal,
                                outboundSourceKind: e.target.value as 'bank' | 'hysa',
                                outboundSourceHysaAccountId: e.target.value === 'hysa' ? modal.outboundSourceHysaAccountId : '',
                                outboundHysaSubBucket: e.target.value === 'hysa' ? modal.outboundHysaSubBucket : ''
                              })
                            }
                          >
                            <option value="bank">Bank</option>
                            <option value="hysa">HYSA</option>
                          </Select>
                        </div>
                        {modal.outboundSourceKind === 'bank' ? (
                          <div className="field">
                            <label>From Bank</label>
                            <Select value={modal.sourceBankId} onChange={(e) => setModal({ ...modal, sourceBankId: e.target.value })}>
                              <option value="">Select...</option>
                              {banksSortedByBalance.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name} - {formatCents(b.balanceCents || 0)}
                                </option>
                              ))}
                            </Select>
                          </div>
                        ) : (
                          <>
                            <div className="field">
                              <label>HYSA Account</label>
                              <Select
                                value={modal.outboundSourceHysaAccountId}
                                onChange={(e) => setModal({ ...modal, outboundSourceHysaAccountId: e.target.value })}
                              >
                                <option value="">Select...</option>
                                {hysaAccountsSorted.map((a: any) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name} - {formatCents(a.balanceCents || 0)}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="field">
                              <label>Use which HYSA portion?</label>
                              <Select
                                value={modal.outboundHysaSubBucket}
                                onChange={(e) => setModal({ ...modal, outboundHysaSubBucket: e.target.value as any })}
                              >
                                <option value="">Select...</option>
                                <option value="liquid">Bills fund</option>
                                <option value="reserved">Savings reserve</option>
                              </Select>
                            </div>
                          </>
                        )}
                        <div className="field">
                          <label>To Credit Card</label>
                          <Select value={modal.targetCardIdOut} onChange={(e) => setModal({ ...modal, targetCardIdOut: e.target.value })}>
                            <option value="">Select...</option>
                            {cardsSortedByBalance.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} - {formatCents(c.balanceCents || 0)}
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
                              <option value="">Select...</option>
                              {banksSortedByBalance.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name} - {formatCents(b.balanceCents || 0)}
                                </option>
                              ))}
                            </Select>
                          </div>
                        ) : (
                          <>
                            <div className="field">
                              <label>HYSA Account</label>
                              <Select value={modal.outboundSourceHysaAccountId} onChange={(e) => setModal({ ...modal, outboundSourceHysaAccountId: e.target.value })}>
                                <option value="">Select...</option>
                                {hysaAccountsSorted.map((a: any) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name} - {formatCents(a.balanceCents || 0)}
                                  </option>
                                ))}
                              </Select>
                            </div>
                            <div className="field">
                              <label>Use which HYSA portion?</label>
                              <Select value={modal.outboundHysaSubBucket} onChange={(e) => setModal({ ...modal, outboundHysaSubBucket: e.target.value as any })}>
                                <option value="">Select...</option>
                                <option value="liquid">Bills fund</option>
                                <option value="reserved">Savings reserve</option>
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
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const amountCents = parseCents(modal.amount);
                      if (!(amountCents > 0)) return;
                      const editId = modal.editId;
                      if (modal.kind === 'in') {
                        const depositTo = modal.isRefund ? 'card' : modal.depositTo;
                        if (depositTo === 'card' && !modal.targetCardId) return;
                        if (depositTo === 'hysa' && (!modal.targetInvestingAccountId || !modal.hysaSubBucket)) return;
                        const inUpdates = {
                          label: modal.label.trim() || 'Pending',
                          amountCents,
                          depositTo,
                          isRefund: modal.isRefund || depositTo === 'card' ? true : undefined,
                          targetCardId: depositTo === 'card' ? modal.targetCardId : undefined,
                          targetBankId: depositTo === 'bank' ? (modal.targetBankId || undefined) : undefined,
                          targetInvestingAccountId: depositTo === 'hysa' ? modal.targetInvestingAccountId : undefined,
                          meta: depositTo === 'hysa' && (modal.hysaSubBucket === 'liquid' || modal.hysaSubBucket === 'reserved') ? { hysaSubBucket: modal.hysaSubBucket } : undefined
                        };
                        if (editId) actions.updatePendingInbound(editId, inUpdates);
                        else actions.addPendingInbound(inUpdates);
                      } else {
                        if (modal.outboundType === 'cc_payment') {
                          if (!modal.targetCardIdOut) return;

                          if (modal.outboundSourceKind === 'hysa') {
                            if (!modal.outboundSourceHysaAccountId || !modal.outboundHysaSubBucket) return;
                            const subBucket: 'liquid' | 'reserved' =
                              modal.outboundHysaSubBucket === 'reserved' ? 'reserved' : 'liquid';
                            const outUpdates = {
                              label: modal.label.trim() || 'Pending',
                              amountCents,
                              outboundType: 'cc_payment' as const,
                              targetCardId: modal.targetCardIdOut,
                              paymentSource: 'hysa' as const,
                              paymentTargetId: modal.outboundSourceHysaAccountId,
                              meta: { hysaSubBucket: subBucket }
                            };
                            if (editId) actions.updatePendingOutbound(editId, outUpdates);
                            else actions.addPendingOutbound(outUpdates);
                          } else {
                            if (!modal.sourceBankId) return;
                            const outUpdates = {
                              label: modal.label.trim() || 'Pending',
                              amountCents,
                              outboundType: 'cc_payment' as const,
                              sourceBankId: modal.sourceBankId,
                              targetCardId: modal.targetCardIdOut,
                              // Ensure we don't accidentally keep HYSA deduction details
                              paymentSource: undefined,
                              paymentTargetId: undefined,
                              meta: undefined
                            };
                            if (editId) actions.updatePendingOutbound(editId, outUpdates);
                            else actions.addPendingOutbound(outUpdates);
                          }
                        } else {
                          if (modal.outboundSourceKind === 'hysa') {
                            if (!modal.outboundSourceHysaAccountId) return;
                            const subBucket: 'liquid' | 'reserved' = modal.outboundHysaSubBucket === 'reserved' ? 'reserved' : 'liquid';
                            const outUpdates = {
                              label: modal.label.trim() || 'Pending',
                              amountCents,
                              outboundType: 'standard' as const,
                              paymentSource: 'hysa' as const,
                              paymentTargetId: modal.outboundSourceHysaAccountId,
                              meta: { hysaSubBucket: subBucket }
                            };
                            if (editId) actions.updatePendingOutbound(editId, outUpdates);
                            else actions.addPendingOutbound(outUpdates);
                          } else {
                            const outUpdates = { label: modal.label.trim() || 'Pending', amountCents, outboundType: 'standard' as const };
                            if (editId) actions.updatePendingOutbound(editId, outUpdates);
                            else actions.addPendingOutbound(outUpdates);
                          }
                        }
                      }
                      setModal({ type: 'none' });
                    }}
                  >
                    {modal.editId ? 'Save' : 'Add'}
                  </button>
                </div>
              </>
            ) : null}

            {modal.type === 'post-inbound' ? (
              <>
                <h3>Confirm deposit posted</h3>
                <p style={{ color: 'var(--ui-primary-text, var(--text))', marginTop: 0 }}>Where should this inbound be applied?</p>
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
                        {b.name} - {formatCents(b.balanceCents || 0)}
                      </option>
                    ))}
                    {modal.isRefund ? (
                      <>
                        <option value="" disabled>
                          ──────────
                        </option>
                        {cardsSortedByBalance.map((c) => (
                          <option key={c.id} value={`card:${c.id}`}>
                            {c.name} - {formatCents(c.balanceCents || 0)}
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
                <p style={{ color: 'var(--ui-primary-text, var(--text))', marginTop: 0 }}>Which account should this subtract from?</p>
                <div className="field">
                  <label>Account</label>
                  <Select value={modal.bankId} onChange={(e) => setModal({ ...modal, bankId: e.target.value })}>
                    {banksSortedByBalance.map((b) => (
                      <option key={b.id} value={`bank:${b.id}`}>
                        {b.name} - {formatCents(b.balanceCents || 0)}
                      </option>
                    ))}
                    {cardsSortedByBalance.length ? (
                      <>
                        <option value="" disabled>
                          ──────────
                        </option>
                        {cardsSortedByBalance.map((c) => (
                          <option key={c.id} value={`card:${c.id}`}>
                            {c.name} - {formatCents(c.balanceCents || 0)}
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
                <p style={{ color: 'var(--ui-primary-text, var(--text))' }}>{modal.message}</p>
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

