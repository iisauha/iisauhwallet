import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatCents, parseCents } from '../../state/calc';
import { PHYSICAL_CASH_ID } from '../../state/keys';
import { useLedgerStore } from '../../state/store';
import { getCategoryName, getCategorySubcategories, loadCategoryConfig, loadSubTracker, loadInvesting } from '../../state/storage';
import type { SubTrackerEntry } from '../../state/storage';
import { computeRewardDeltaForPurchase, suggestAllCardsForPurchase, type RewardDelta, type SuggestResult } from '../rewards/rewardMatching';
import { Select } from '../../ui/Select';
import { useContentGuard } from '../../state/useContentGuard';
import { sortByRecent, recordSelections } from '../../state/recentSelections';

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Returns the first active SUB Tracker entry's card (user is working toward that SUB). */
function getActiveSubTrackerCardId(): string | null {
  const tracker = loadSubTracker();
  const entries = (tracker.entries || []) as SubTrackerEntry[];
  for (const e of entries) {
    if (e.cardRef.type !== 'card') continue;
    const tiers = (e.tiers || []).slice().sort((a, b) => (a.spendTargetCents || 0) - (b.spendTargetCents || 0));
    const maxTarget = tiers.length ? Math.max(...tiers.map((t) => t.spendTargetCents || 0)) : 0;
    const spendCents = typeof e.spendCents === 'number' ? e.spendCents : 0;
    if (maxTarget > 0 && spendCents < maxTarget) return e.cardRef.cardId;
  }
  return null;
}

export type AddPurchasePrefill = { title?: string; amountCents?: number; dateISO?: string };

export function AddPurchaseModal(props: {
  open: boolean;
  onClose: () => void;
  purchaseKey?: string | null;
  prefill?: AddPurchasePrefill | null;
  onSave?: () => void;
  /** When true, form is for a card purchase with reimbursement expected; prefill card and create pending inbound on save. */
  reimbursementExpected?: boolean;
}) {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);
  const contentGuard = useContentGuard();
  const cfg = useMemo(() => loadCategoryConfig(), []);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dateISO, setDateISO] = useState(todayKey());
  const [category, setCategory] = useState('food');
  const [subcategory, setSubcategory] = useState('');
  const [notes, setNotes] = useState('');
  const [isSplit, setIsSplit] = useState(false);
  const [myPortion, setMyPortion] = useState('');
  const [applyToSnapshot, setApplyToSnapshot] = useState(true);
  const [paymentSource, setPaymentSource] = useState<'card' | 'bank' | 'cash' | 'hysa' | ''>('');
  const [paymentTargetId, setPaymentTargetId] = useState('');
  const [hysaSubBucket, setHysaSubBucket] = useState<'liquid' | 'reserved'>('liquid');
  const [reimbursementBankId, setReimbursementBankId] = useState('');
  const [splitBankId, setSplitBankId] = useState('');
  const hysaAccounts = useMemo(() => {
    const inv = loadInvesting();
    return (inv.accounts || []).filter((a: any) => a.type === 'hysa');
  }, []);
  const [suggestedCardsOrder, setSuggestedCardsOrder] = useState<SuggestResult[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [showSuggestionPopup, setShowSuggestionPopup] = useState(false);
  const [suggestionAccepted, setSuggestionAccepted] = useState(false);
  const currentSuggestion = suggestedCardsOrder[suggestionIndex] ?? null;
  const suggestedCardId = currentSuggestion?.card.id ?? null;
  const suggestedCardName = currentSuggestion
    ? (data.cards || []).find((c) => c.id === currentSuggestion.card.id)?.name ?? null
    : null;
  const [hasSelectedCategory, setHasSelectedCategory] = useState(false);
  const [showSubTrackerPopup, setShowSubTrackerPopup] = useState(false);
  const [suggestedSubTrackerCardId, setSuggestedSubTrackerCardId] = useState<string | null>(null);
  const [rewardAdjustPopup, setRewardAdjustPopup] = useState<null | {
    rewardType: 'cashback' | 'miles' | 'points';
    cardId: string;
    cardName: string;
    deltaLabel: string;
    computedDelta: number; // cents for cashback, raw count for points/miles
    newBalanceLabel: string;
    newBalance: number; // cents for cashback, raw count for points/miles
    currentBalance: number; // cents for cashback, raw count for points/miles
  }>(null);
  const [rewardAdjustMode, setRewardAdjustMode] = useState<'computed' | 'manual'>('computed');
  const [rewardAdjustManualStr, setRewardAdjustManualStr] = useState<string>('');

  useEffect(() => {
    if (!rewardAdjustPopup) return;
    setRewardAdjustMode('computed');
    setRewardAdjustManualStr('');
  }, [rewardAdjustPopup]);

  const [editRewardPopup, setEditRewardPopup] = useState<
    | null
    | {
        oldCardId: string | null;
        oldCardName: string;
        oldRewardType: 'cashback' | 'miles' | 'points';
        oldDelta: number; // cents for cashback, raw count for points/miles
        oldCurrentBalance: number; // cents for cashback, raw count for points/miles

        newCardId: string | null;
        newCardName: string;
        newRewardType: 'cashback' | 'miles' | 'points';
        newDelta: number; // cents for cashback, raw count for points/miles
        newCurrentBalance: number; // cents for cashback, raw count for points/miles
      }
  >(null);

  const [editRewardMode, setEditRewardMode] = useState<'computed' | 'manual'>('computed');
  const [editManualSubtractStr, setEditManualSubtractStr] = useState<string>('');
  const [editManualAddStr, setEditManualAddStr] = useState<string>('');

  useEffect(() => {
    if (!editRewardPopup) return;
    setEditRewardMode('computed');
    setEditManualSubtractStr('');
    setEditManualAddStr('');
  }, [editRewardPopup]);

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

  const currentPurchase = useMemo(() => {
    if (!props.purchaseKey) return null;
    const list: any[] = data.purchases || [];
    return list.find((p) => getPurchaseUiId(p) === props.purchaseKey) || null;
  }, [props.purchaseKey, data.purchases]);

  const isEditing = !!currentPurchase;

  // Merchant autocomplete
  const [acOpen, setAcOpen] = useState(false);
  const titleWrapRef = useRef<HTMLDivElement>(null);
  const acSuppressRef = useRef(false); // prevent reopening right after a suggestion is picked

  const acSuggestions = useMemo(() => {
    if (!title.trim()) return [];
    const q = title.toLowerCase();
    const allPurchases: any[] = data.purchases || [];
    const matched = allPurchases.filter((p) => (p.title || '').toLowerCase().includes(q));
    const byMerchant = new Map<string, any>();
    for (const p of matched) {
      const key = (p.title || '').toLowerCase();
      const existing = byMerchant.get(key);
      if (!existing || (p.dateISO || '') > (existing.dateISO || '')) {
        byMerchant.set(key, p);
      }
    }
    return Array.from(byMerchant.values())
      .sort((a, b) => ((b.dateISO || '') > (a.dateISO || '') ? 1 : -1))
      .slice(0, 5);
  }, [title, data.purchases]);

  useEffect(() => {
    if (isEditing || acSuppressRef.current) return;
    if (acSuggestions.length > 0 && title.trim().length > 0) {
      setAcOpen(true);
    } else {
      setAcOpen(false);
    }
  }, [acSuggestions, title, isEditing]);

  useEffect(() => {
    if (!acOpen) return;
    function handleOutside(e: MouseEvent) {
      if (titleWrapRef.current && !titleWrapRef.current.contains(e.target as Node)) {
        setAcOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [acOpen]);

  function resetForm() {
    setTitle('');
    setAmount('');
    setDateISO(todayKey());
    setCategory('food');
    setSubcategory('');
    setNotes('');
    setIsSplit(false);
    setMyPortion('');
    setApplyToSnapshot(true);
    setPaymentSource('');
    setPaymentTargetId('');
    setShowSuggestionPopup(false);
    setSuggestedCardsOrder([]);
    setHasSelectedCategory(false);
    setShowSubTrackerPopup(false);
    setSuggestedSubTrackerCardId(null);
    setReimbursementBankId('');
    setSplitBankId('');
    setAcOpen(false);
    acSuppressRef.current = false;
  }

  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (prevOpenRef.current && !props.open) {
      resetForm();
    }
    prevOpenRef.current = props.open;
  }, [props.open]);

  useEffect(() => {
    if (props.open) setSuggestionAccepted(false);
  }, [props.open]);

  const subs = useMemo(() => getCategorySubcategories(cfg, category), [cfg, category]);

  useEffect(() => {
    if (props.open && props.prefill && !currentPurchase) {
      const p = props.prefill;
      if (p.title) setTitle(p.title);
      if (typeof p.amountCents === 'number' && p.amountCents > 0) setAmount((p.amountCents / 100).toFixed(2));
      if (p.dateISO) setDateISO(p.dateISO);
    }
  }, [props.open, props.prefill, currentPurchase]);

  useEffect(() => {
    if (props.open && props.reimbursementExpected && !currentPurchase) {
      setApplyToSnapshot(true);
      setPaymentSource('card');
      setIsSplit(false);
      setMyPortion('');
    }
  }, [props.open, props.reimbursementExpected, currentPurchase]);

  // SUB Tracker first: when opening Add Purchase, if there's an active SUB Tracker card, ask to use it first. Stop once user accepted any suggestion.
  useEffect(() => {
    if (!props.open || isEditing || suggestionAccepted) return;
    const cardId = getActiveSubTrackerCardId();
    if (cardId && data.cards?.some((c) => c.id === cardId)) {
      setSuggestedSubTrackerCardId(cardId);
      setShowSubTrackerPopup(true);
    }
  }, [props.open, isEditing, data.cards, suggestionAccepted]);

  // After category/subcategory selection, suggest cards in priority order. Do not show if user already accepted a suggestion (SUB or card).
  useEffect(() => {
    if (!props.open || isEditing || !data.cards?.length || !hasSelectedCategory || showSubTrackerPopup || suggestionAccepted) return;
    const activeSubId = getActiveSubTrackerCardId();
    const order = suggestAllCardsForPurchase(category, subcategory, data.cards, activeSubId);
    if (order.length > 0) {
      setSuggestedCardsOrder(order);
      setSuggestionIndex(0);
      setShowSuggestionPopup(true);
    } else {
      setSuggestedCardsOrder([]);
      setShowSuggestionPopup(false);
    }
  }, [props.open, category, subcategory, isEditing, data.cards, hasSelectedCategory, showSubTrackerPopup, suggestionAccepted]);

  if (!props.open) return null;

  // Prefill when opening for edit.
  if (currentPurchase && !title && !amount && !notes && !isSplit) {
    const p: any = currentPurchase;
    setTitle(p.title || '');
    const isSplitPurchase =
      !!p.isSplit || typeof p.splitTotalCents === 'number' || typeof p.originalTotal === 'number';
    const totalCentsRaw =
      typeof p.originalTotal === 'number'
        ? p.originalTotal
        : typeof p.splitTotalCents === 'number'
          ? p.splitTotalCents
          : p.amountCents || 0;
    const portionCentsRaw =
      typeof p.splitMyPortionCents === 'number' ? p.splitMyPortionCents : p.amountCents || 0;
    setAmount(((isSplitPurchase ? totalCentsRaw : p.amountCents || 0) / 100).toFixed(2));
    setMyPortion(isSplitPurchase ? (portionCentsRaw / 100).toFixed(2) : '');
    setIsSplit(isSplitPurchase);
    setDateISO(p.dateISO || todayKey());
    setCategory(p.category || 'food');
    setSubcategory(p.subcategory || '');
    setNotes(p.notes || '');
    setApplyToSnapshot(!!p.applyToSnapshot);
    setPaymentSource((p.paymentSource as any) || '');
    setPaymentTargetId(p.paymentTargetId || '');
    setHysaSubBucket((p as any).hysaSubBucket || 'liquid');
    setSplitBankId(p.splitTargetBankId || '');
  }

  const totalCents = parseCents(amount);
  const myPortionCents = isSplit ? parseCents(myPortion) : totalCents;
  const inboundCents = Math.max(0, totalCents - myPortionCents);
  const splitError =
    isSplit && (
      myPortionCents <= 0 ? 'My portion must be greater than 0. Use "Add Card Purchase (Full reimbursement expected)" for full reimbursement.'
      : myPortionCents < 0 ? 'My portion cannot be negative.'
      : myPortionCents > totalCents ? 'My portion cannot exceed total amount.'
      : ''
    );

  const canSave =
    (title.trim().length > 0 || true) &&
    totalCents > 0 &&
    !!dateISO &&
    !!category &&
    (!isSplit || !splitError) &&
    (!applyToSnapshot || (paymentSource !== '' && (paymentSource === 'cash' || paymentTargetId)));

  const suggestedSubTrackerCardName =
    suggestedSubTrackerCardId ? (data.cards || []).find((c) => c.id === suggestedSubTrackerCardId)?.name : null;

  return (
    <>
      {showSubTrackerPopup && suggestedSubTrackerCardId && suggestedSubTrackerCardName ? createPortal(
        <div className="modal-overlay" style={{ zIndex: 10001 }}>
          <div className="modal">
            <h3>Wanna use your {suggestedSubTrackerCardName} card? You have a sign up bonus active.</h3>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowSubTrackerPopup(false);
                  setSuggestedSubTrackerCardId(null);
                }}
              >
                No
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSuggestionAccepted(true);
                  setApplyToSnapshot(true);
                  setPaymentSource('card');
                  setPaymentTargetId(suggestedSubTrackerCardId);
                  setShowSubTrackerPopup(false);
                  setSuggestedSubTrackerCardId(null);
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
      {showSuggestionPopup && currentSuggestion && suggestedCardName ? createPortal(
        <div className="modal-overlay" style={{ zIndex: 10001 }}>
          <div className="modal">
            <h3>Use {suggestedCardName}?</h3>
            {currentSuggestion.rule ? (
              <p style={{ fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', marginTop: -4, marginBottom: 12 }}>
                {currentSuggestion.rule.isCatchAll ? 'Catch-all' : (currentSuggestion.rule.subcategory || currentSuggestion.rule.category)}: {currentSuggestion.rule.value}%
              </p>
            ) : null}
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (suggestionIndex + 1 >= suggestedCardsOrder.length) {
                    setShowSuggestionPopup(false);
                    setSuggestedCardsOrder([]);
                  } else {
                    setSuggestionIndex((i) => i + 1);
                  }
                }}
              >
                No
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSuggestionAccepted(true);
                  setApplyToSnapshot(true);
                  setPaymentSource('card');
                  setPaymentTargetId(currentSuggestion.card.id);
                  setShowSuggestionPopup(false);
                  setSuggestedCardsOrder([]);
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      {rewardAdjustPopup ? createPortal(
        <div className="modal-overlay" style={{ zIndex: 10002 }}>
          <div className="modal">
            <h3 style={{ marginBottom: 10 }}>Update rewards?</h3>
            <p style={{ color: 'var(--ui-primary-text, var(--text))', marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
              Would you like to add {rewardAdjustPopup.deltaLabel} to your {rewardAdjustPopup.cardName} rewards? Your new balance will be {rewardAdjustPopup.newBalanceLabel}.
            </p>
            {rewardAdjustMode === 'manual' ? (
              <div className="field" style={{ marginTop: 8 }}>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 6, color: 'var(--ui-primary-text, var(--text))' }}>
                  Specify how much {rewardAdjustPopup.rewardType === 'cashback' ? 'cash back ($)' : rewardAdjustPopup.rewardType} to add
                </label>
                <input
                  className="ll-control"
                  value={rewardAdjustManualStr}
                  onChange={(e) => setRewardAdjustManualStr(e.target.value)}
                  inputMode={rewardAdjustPopup.rewardType === 'cashback' ? 'decimal' : 'numeric'}
                  placeholder={rewardAdjustPopup.rewardType === 'cashback' ? 'e.g. 20' : 'e.g. 40000'}
                />
              </div>
            ) : null}
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setRewardAdjustPopup(null);
                  props.onSave?.();
                  props.onClose();
                  setTitle('');
                  setAmount('');
                  setNotes('');
                  setIsSplit(false);
                  setMyPortion('');
                  setApplyToSnapshot(false);
                  setPaymentSource('');
                  setPaymentTargetId('');
                  setShowSuggestionPopup(false);
                  setSuggestedCardsOrder([]);
                  setHasSelectedCategory(false);
                  setShowSubTrackerPopup(false);
                  setSuggestedSubTrackerCardId(null);
                }}
              >
                No
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (rewardAdjustMode === 'computed') {
                    if (rewardAdjustPopup.rewardType === 'cashback') {
                      actions.updateCardRewardTotals(rewardAdjustPopup.cardId, { rewardCashbackCents: rewardAdjustPopup.newBalance });
                    } else if (rewardAdjustPopup.rewardType === 'points') {
                      actions.updateCardRewardTotals(rewardAdjustPopup.cardId, { rewardPoints: rewardAdjustPopup.newBalance });
                    } else {
                      actions.updateCardRewardTotals(rewardAdjustPopup.cardId, { rewardMiles: rewardAdjustPopup.newBalance });
                    }
                  } else {
                    // Manual delta. We treat the input as "how much to add" (not the final balance).
                    const cleaned = (rewardAdjustManualStr || '0').replace(/,/g, '');
                    const deltaInput =
                      rewardAdjustPopup.rewardType === 'cashback'
                        ? parseCents(rewardAdjustManualStr)
                        : Math.round(parseFloat(cleaned));
                    const delta = Number.isFinite(deltaInput) ? deltaInput : 0;
                    if (!(delta > 0)) return;
                    const nextBalance = Math.max(0, rewardAdjustPopup.currentBalance + delta);
                    if (rewardAdjustPopup.rewardType === 'cashback') {
                      actions.updateCardRewardTotals(rewardAdjustPopup.cardId, { rewardCashbackCents: nextBalance });
                    } else if (rewardAdjustPopup.rewardType === 'points') {
                      actions.updateCardRewardTotals(rewardAdjustPopup.cardId, { rewardPoints: nextBalance });
                    } else {
                      actions.updateCardRewardTotals(rewardAdjustPopup.cardId, { rewardMiles: nextBalance });
                    }
                  }

                  setRewardAdjustPopup(null);
                  setRewardAdjustMode('computed');
                  setRewardAdjustManualStr('');
                  props.onSave?.();
                  props.onClose();
                  setTitle('');
                  setAmount('');
                  setNotes('');
                  setIsSplit(false);
                  setMyPortion('');
                  setApplyToSnapshot(false);
                  setPaymentSource('');
                  setPaymentTargetId('');
                  setShowSuggestionPopup(false);
                  setSuggestedCardsOrder([]);
                  setHasSelectedCategory(false);
                  setShowSubTrackerPopup(false);
                  setSuggestedSubTrackerCardId(null);
                }}
              >
                {rewardAdjustMode === 'computed' ? 'Yes' : 'Apply manual'}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setRewardAdjustMode((m) => (m === 'computed' ? 'manual' : 'computed'));
                  setRewardAdjustManualStr('');
                }}
                style={{ padding: '12px 16px' }}
              >
                {rewardAdjustMode === 'computed' ? 'Manual…' : 'Use computed'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      {editRewardPopup ? createPortal(
        <div className="modal-overlay" style={{ zIndex: 10003 }}>
          <div className="modal">
            <h3 style={{ marginBottom: 10 }}>Update rewards?</h3>
            <p style={{ color: 'var(--ui-primary-text, var(--text))', marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
              Since the payment method changed, rewards will be updated by subtracting your previous amount from <strong>{editRewardPopup.oldCardName}</strong> and adding your new amount to <strong>{editRewardPopup.newCardName}</strong>.
            </p>

            <div style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.95rem', lineHeight: 1.8, marginBottom: 8 }}>
              <div>
                Subtract:{' '}
                <strong>
                  {editRewardPopup.oldRewardType === 'cashback'
                    ? `${formatCents(editRewardPopup.oldDelta)} cash back`
                    : `${editRewardPopup.oldDelta.toLocaleString()} ${editRewardPopup.oldRewardType}`}
                </strong>{' '}
                from {editRewardPopup.oldCardName}
              </div>
              <div>
                Add:{' '}
                <strong>
                  {editRewardPopup.newRewardType === 'cashback'
                    ? `${formatCents(editRewardPopup.newDelta)} cash back`
                    : `${editRewardPopup.newDelta.toLocaleString()} ${editRewardPopup.newRewardType}`}
                </strong>{' '}
                to {editRewardPopup.newCardName}
              </div>
            </div>

            {editRewardMode === 'manual' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="field">
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 6, color: 'var(--ui-primary-text, var(--text))' }}>
                    Subtract how much from {editRewardPopup.oldCardName}
                  </label>
                  <input
                    className="ll-control"
                    disabled={!editRewardPopup.oldCardId}
                    value={editManualSubtractStr}
                    onChange={(e) => setEditManualSubtractStr(e.target.value)}
                    inputMode={editRewardPopup.oldRewardType === 'cashback' ? 'decimal' : 'numeric'}
                    placeholder={editRewardPopup.oldRewardType === 'cashback' ? 'e.g. 20' : 'e.g. 40000'}
                  />
                </div>
                <div className="field">
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: 6, color: 'var(--ui-primary-text, var(--text))' }}>
                    Add how much to {editRewardPopup.newCardName}
                  </label>
                  <input
                    className="ll-control"
                    disabled={!editRewardPopup.newCardId}
                    value={editManualAddStr}
                    onChange={(e) => setEditManualAddStr(e.target.value)}
                    inputMode={editRewardPopup.newRewardType === 'cashback' ? 'decimal' : 'numeric'}
                    placeholder={editRewardPopup.newRewardType === 'cashback' ? 'e.g. 20' : 'e.g. 40000'}
                  />
                </div>
              </div>
            ) : null}

            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => {
                setEditRewardPopup(null);
                props.onSave?.();
                props.onClose();
                setTitle('');
                setAmount('');
                setNotes('');
                setIsSplit(false);
                setMyPortion('');
                setApplyToSnapshot(false);
                setPaymentSource('');
                setPaymentTargetId('');
                setShowSuggestionPopup(false);
                setSuggestedCardsOrder([]);
                setHasSelectedCategory(false);
                setShowSubTrackerPopup(false);
                setSuggestedSubTrackerCardId(null);
              }}>
                No
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (editRewardMode === 'computed') {
                    const sameCard = !!editRewardPopup.oldCardId && !!editRewardPopup.newCardId && editRewardPopup.oldCardId === editRewardPopup.newCardId;
                    const sameType = editRewardPopup.oldRewardType === editRewardPopup.newRewardType;

                    if (sameCard && sameType && editRewardPopup.oldCardId) {
                      const finalBalance = Math.max(0, editRewardPopup.oldCurrentBalance - editRewardPopup.oldDelta + editRewardPopup.newDelta);
                      if (editRewardPopup.oldRewardType === 'cashback') {
                        actions.updateCardRewardTotals(editRewardPopup.oldCardId, { rewardCashbackCents: finalBalance });
                      } else if (editRewardPopup.oldRewardType === 'points') {
                        actions.updateCardRewardTotals(editRewardPopup.oldCardId, { rewardPoints: finalBalance });
                      } else {
                        actions.updateCardRewardTotals(editRewardPopup.oldCardId, { rewardMiles: finalBalance });
                      }
                    } else {
                      if (editRewardPopup.oldCardId) {
                        if (editRewardPopup.oldRewardType === 'cashback') {
                          actions.updateCardRewardTotals(editRewardPopup.oldCardId, {
                            rewardCashbackCents: Math.max(0, editRewardPopup.oldCurrentBalance - editRewardPopup.oldDelta)
                          });
                        } else if (editRewardPopup.oldRewardType === 'points') {
                          actions.updateCardRewardTotals(editRewardPopup.oldCardId, {
                            rewardPoints: Math.max(0, editRewardPopup.oldCurrentBalance - editRewardPopup.oldDelta)
                          });
                        } else {
                          actions.updateCardRewardTotals(editRewardPopup.oldCardId, {
                            rewardMiles: Math.max(0, editRewardPopup.oldCurrentBalance - editRewardPopup.oldDelta)
                          });
                        }
                      }

                      if (editRewardPopup.newCardId) {
                        if (editRewardPopup.newRewardType === 'cashback') {
                          actions.updateCardRewardTotals(editRewardPopup.newCardId, {
                            rewardCashbackCents: editRewardPopup.newCurrentBalance + editRewardPopup.newDelta
                          });
                        } else if (editRewardPopup.newRewardType === 'points') {
                          actions.updateCardRewardTotals(editRewardPopup.newCardId, {
                            rewardPoints: editRewardPopup.newCurrentBalance + editRewardPopup.newDelta
                          });
                        } else {
                          actions.updateCardRewardTotals(editRewardPopup.newCardId, {
                            rewardMiles: editRewardPopup.newCurrentBalance + editRewardPopup.newDelta
                          });
                        }
                      }
                    }
                  } else {
                    const manualOld = editRewardPopup.oldRewardType === 'cashback'
                      ? parseCents((editManualSubtractStr || '0').replace(/,/g, ''))
                      : Math.round(parseFloat((editManualSubtractStr || '0').replace(/,/g, '')));
                    const manualNew = editRewardPopup.newRewardType === 'cashback'
                      ? parseCents((editManualAddStr || '0').replace(/,/g, ''))
                      : Math.round(parseFloat((editManualAddStr || '0').replace(/,/g, '')));
                    const oldDeltaToApply = Number.isFinite(manualOld) ? manualOld : 0;
                    const newDeltaToApply = Number.isFinite(manualNew) ? manualNew : 0;

                    const sameCard = !!editRewardPopup.oldCardId && !!editRewardPopup.newCardId && editRewardPopup.oldCardId === editRewardPopup.newCardId;
                    const sameType = editRewardPopup.oldRewardType === editRewardPopup.newRewardType;

                    if (sameCard && sameType && editRewardPopup.oldCardId && (oldDeltaToApply > 0 || newDeltaToApply > 0)) {
                      const finalBalance = Math.max(0, editRewardPopup.oldCurrentBalance - oldDeltaToApply + newDeltaToApply);
                      if (editRewardPopup.oldRewardType === 'cashback') {
                        actions.updateCardRewardTotals(editRewardPopup.oldCardId, { rewardCashbackCents: finalBalance });
                      } else if (editRewardPopup.oldRewardType === 'points') {
                        actions.updateCardRewardTotals(editRewardPopup.oldCardId, { rewardPoints: finalBalance });
                      } else {
                        actions.updateCardRewardTotals(editRewardPopup.oldCardId, { rewardMiles: finalBalance });
                      }
                    } else {
                      if (editRewardPopup.oldCardId && oldDeltaToApply > 0) {
                        if (editRewardPopup.oldRewardType === 'cashback') {
                          actions.updateCardRewardTotals(editRewardPopup.oldCardId, {
                            rewardCashbackCents: Math.max(0, editRewardPopup.oldCurrentBalance - oldDeltaToApply)
                          });
                        } else if (editRewardPopup.oldRewardType === 'points') {
                          actions.updateCardRewardTotals(editRewardPopup.oldCardId, {
                            rewardPoints: Math.max(0, editRewardPopup.oldCurrentBalance - oldDeltaToApply)
                          });
                        } else {
                          actions.updateCardRewardTotals(editRewardPopup.oldCardId, {
                            rewardMiles: Math.max(0, editRewardPopup.oldCurrentBalance - oldDeltaToApply)
                          });
                        }
                      }
                      if (editRewardPopup.newCardId && newDeltaToApply > 0) {
                        if (editRewardPopup.newRewardType === 'cashback') {
                          actions.updateCardRewardTotals(editRewardPopup.newCardId, {
                            rewardCashbackCents: editRewardPopup.newCurrentBalance + newDeltaToApply
                          });
                        } else if (editRewardPopup.newRewardType === 'points') {
                          actions.updateCardRewardTotals(editRewardPopup.newCardId, {
                            rewardPoints: editRewardPopup.newCurrentBalance + newDeltaToApply
                          });
                        } else {
                          actions.updateCardRewardTotals(editRewardPopup.newCardId, {
                            rewardMiles: editRewardPopup.newCurrentBalance + newDeltaToApply
                          });
                        }
                      }
                    }
                  }

                  setEditRewardPopup(null);
                  setEditRewardMode('computed');
                  setEditManualSubtractStr('');
                  setEditManualAddStr('');
                  props.onSave?.();
                  props.onClose();
                  setTitle('');
                  setAmount('');
                  setNotes('');
                  setIsSplit(false);
                  setMyPortion('');
                  setApplyToSnapshot(false);
                  setPaymentSource('');
                  setPaymentTargetId('');
                  setShowSuggestionPopup(false);
                  setSuggestedCardsOrder([]);
                  setHasSelectedCategory(false);
                  setShowSubTrackerPopup(false);
                  setSuggestedSubTrackerCardId(null);
                }}
              >
                {editRewardMode === 'computed' ? 'Yes' : 'Apply manual'}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setEditRewardMode((m) => (m === 'computed' ? 'manual' : 'computed'));
                  setEditManualSubtractStr('');
                  setEditManualAddStr('');
                }}
                style={{ padding: '12px 16px' }}
              >
                {editRewardMode === 'computed' ? 'Manual…' : 'Use computed'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
      <div className="modal-overlay modal-overlay--fullscreen">
      <div className="modal">
        <div className="modal-header">
          <h3 style={{ margin: 0, flex: 1 }}>{isEditing ? 'Edit Purchase' : props.reimbursementExpected ? 'Add Card Purchase (Full reimbursement expected)' : 'Add Purchase'}</h3>
          <button type="button" aria-label="Close" onClick={props.onClose} className="modal-close-btn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
        </div>
        {props.reimbursementExpected && !isEditing ? (
          <p style={{ fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', marginTop: -4, marginBottom: 12 }}>
            A pending inbound entry will be created for this amount. When you receive reimbursement, post it from Pending Inbound and choose which bank to deposit into.
          </p>
        ) : null}
        <div className="field">
          <label>Title / Merchant</label>
          <div ref={titleWrapRef} style={{ position: 'relative' }}>
            <input
              value={title}
              onChange={(e) => {
                const v = e.target.value;
                if (contentGuard(v, () => setTitle(''))) return;
                setTitle(v);
                acSuppressRef.current = false;
              }}
              onFocus={() => {
                if (!acSuppressRef.current && title.trim()) setAcOpen(true);
              }}
              placeholder="e.g. Coffee shop"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            {acOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: 'var(--ui-modal-bg, var(--ui-card-bg, var(--surface)))',
                border: '1px solid var(--ui-border, var(--border))',
                borderRadius: 12,
                zIndex: 200,
                marginTop: 4,
                overflow: 'hidden',
                boxShadow: 'var(--shadow-strong)',
              }}>
                {acSuggestions.map((p: any, i: number) => {
                  const cardName = (data.cards || []).find((c: any) => c.id === p.paymentTargetId)?.name;
                  const meta = [
                    p.category ? getCategoryName(cfg, p.category) : null,
                    p.subcategory || null,
                    cardName || null,
                  ].filter(Boolean) as string[];
                  return (
                    <button
                      key={i}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        acSuppressRef.current = true;
                        setTitle(p.title || '');
                        if (p.category) setCategory(p.category);
                        setSubcategory(p.subcategory || '');
                        if (!paymentTargetId && p.paymentTargetId) {
                          setPaymentTargetId(p.paymentTargetId);
                          if (p.paymentSource) setPaymentSource(p.paymentSource as any);
                        }
                        setAcOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        justifyContent: 'center',
                        width: '100%',
                        minHeight: 52,
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        borderBottom: i < acSuggestions.length - 1 ? '1px solid var(--ui-border, var(--border))' : 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        gap: 3,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--ui-add-btn, var(--accent)) 8%, transparent)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.2 }}>
                        {p.title || ''}
                      </span>
                      {meta.length > 0 && (
                        <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.3 }}>
                          {meta.join(' · ')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
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
          <Select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setHasSelectedCategory(true);
            }}
          >
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
            <Select
              value={subcategory}
              onChange={(e) => {
                setSubcategory(e.target.value);
                setHasSelectedCategory(true);
              }}
            >
              <option value="">-</option>
              {subs.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="field">
          <label>Notes (optional)</label>
          <textarea value={notes} onChange={(e) => { const v = e.target.value; if (!contentGuard(v, () => setNotes(''))) setNotes(v); }} placeholder="Optional" />
        </div>

        {!props.reimbursementExpected ? (
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
                id="split"
              />
              <label htmlFor="split">Split with someone else</label>
            </div>
            {isSplit ? (
              <>
              <div className="field">
                <label>My Portion ($)</label>
                <input value={myPortion} onChange={(e) => setMyPortion(e.target.value)} inputMode="decimal" placeholder="0.00" />
                <div style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.9rem', marginTop: 6 }}>
                  Amount others owe you: {inboundCents > 0 ? `$${(inboundCents / 100).toFixed(2)}` : '$0.00'}
                </div>
                {splitError ? <div style={{ color: 'var(--danger)', marginTop: 6 }}>{splitError}</div> : null}
              </div>
              {inboundCents > 0 ? (
                <div className="field">
                  <label>Reimbursement deposits to</label>
                  <Select value={splitBankId} onChange={(e) => setSplitBankId(e.target.value)}>
                    <option value="">Default (first bank)</option>
                    {sortByRecent(data.banks || [], b => b.id).map((b) => (
                      <option key={b.id} value={b.id}>
                        Bank - {b.name} ({formatCents(b.balanceCents || 0)})
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              </>
            ) : null}
          </>
        ) : null}

        <div className="toggle-row">
          <input type="checkbox" checked={applyToSnapshot} onChange={(e) => setApplyToSnapshot(e.target.checked)} id="apply" />
          <label htmlFor="apply">Update account balance</label>
        </div>

        {applyToSnapshot ? (
          <>
            <div className="field">
              <label>Payment Source</label>
              <Select
                value={paymentSource}
                onChange={(e) => {
                  const v = e.target.value as any;
                  setPaymentSource(v);
                  setPaymentTargetId('');
                }}
              >
                <option value="">- Select source -</option>
                <option value="card">Credit Card</option>
                <option value="bank">Cash (Bank)</option>
                <option value="cash">Physical Cash</option>
                <option value="hysa">HYSA</option>
              </Select>
            </div>
            {paymentSource === 'card' ? (
              <div className="field">
                <label>Select Card</label>
                <Select value={paymentTargetId} onChange={(e) => setPaymentTargetId(e.target.value)}>
                  <option value="">Select</option>
                  {sortByRecent(data.cards || [], c => c.id).map((c) => (
                    <option key={c.id} value={c.id}>
                      Card - {c.name} ({formatCents(c.balanceCents || 0)})
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            {props.reimbursementExpected && paymentSource === 'card' && paymentTargetId ? (
              <div className="field">
                <label>Reimbursement deposits to</label>
                <Select value={reimbursementBankId} onChange={(e) => setReimbursementBankId(e.target.value)}>
                  <option value="">Default (first bank)</option>
                  {(data.banks || []).map((b) => (
                    <option key={b.id} value={b.id}>
                      Bank - {b.name} ({formatCents(b.balanceCents || 0)})
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            {paymentSource === 'bank' ? (
              <div className="field">
                <label>Select Bank</label>
                <Select value={paymentTargetId} onChange={(e) => setPaymentTargetId(e.target.value)}>
                  <option value="">Select</option>
                  {(data.banks || []).map((b) => (
                    <option key={b.id} value={b.id}>
                      Bank - {b.name} ({formatCents(b.balanceCents || 0)})
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            {paymentSource === 'cash' ? (
              <div style={{ color: 'var(--ui-primary-text, var(--text))', fontSize: '0.9rem', marginTop: -6, marginBottom: 10 }}>
                This will be deducted from your Physical Cash balance.
              </div>
            ) : null}
            {paymentSource === 'hysa' ? (
              <>
                <div className="field">
                  <label>HYSA Account</label>
                  <Select value={paymentTargetId} onChange={(e) => setPaymentTargetId(e.target.value)}>
                    <option value="">Select</option>
                    {sortByRecent(hysaAccounts, (a: any) => a.id).map((a: any) => (
                      <option key={a.id} value={a.id}>
                        HYSA - {a.name} ({formatCents(a.balanceCents || 0)})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="field">
                  <label>HYSA Bucket</label>
                  <Select value={hysaSubBucket} onChange={(e) => setHysaSubBucket(e.target.value as any)}>
                    <option value="liquid">Bills fund</option>
                    <option value="reserved">Savings reserve</option>
                  </Select>
                </div>
              </>
            ) : null}
          </>
        ) : null}

        <div className="btn-row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              resetForm();
              props.onClose();
            }}
          >
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
                purchase.originalTotal = totalCents;
                if (splitBankId) purchase.splitTargetBankId = splitBankId;
              }
              if (applyToSnapshot) {
                const appliedAmount = isSplit ? totalCents : myPortionCents;
                purchase.applyToSnapshot = true;
                purchase.paymentSource = paymentSource === 'cash' ? 'cash' : paymentSource;
                purchase.paymentTargetId = paymentSource === 'cash' ? PHYSICAL_CASH_ID : paymentTargetId;
                if (paymentSource === 'hysa') purchase.hysaSubBucket = hysaSubBucket;
                if (isSplit) {
                  purchase.splitSnapshot = { amountCents: appliedAmount, paymentSource: purchase.paymentSource, paymentTargetId: purchase.paymentTargetId };
                }
              }
              if (props.reimbursementExpected && !isEditing) {
                purchase.fullReimbursementExpected = true;
              }
              if (isEditing && currentPurchase && currentPurchase.id) {
                const oldPurchase: any = currentPurchase;

                const computeLeg = (p: any) => {
                  const result = {
                    cardId: null as string | null,
                    cardName: 'No card',
                    rewardType: (p?.paymentSource === 'card' || p?.paymentSource === 'credit_card' ? 'points' : 'points') as
                      | 'cashback'
                      | 'miles'
                      | 'points',
                    delta: 0,
                    currentBalance: 0
                  };

                  const isSplitApplied = !!p?.isSplit && !!p?.splitSnapshot && typeof p?.splitSnapshot.amountCents === 'number';
                  const src = isSplitApplied && p.splitSnapshot?.paymentSource ? p.splitSnapshot.paymentSource : p?.paymentSource;
                  const targetId = isSplitApplied && p.splitSnapshot?.paymentTargetId ? p.splitSnapshot.paymentTargetId : p?.paymentTargetId;
                  const amountCents = isSplitApplied
                    ? p.splitSnapshot.amountCents
                    : typeof p?.amountCents === 'number'
                      ? p.amountCents
                      : 0;

                  if (!p?.applyToSnapshot || (src !== 'card' && src !== 'credit_card') || !targetId) return result;

                  const card = (data.cards || []).find((c) => c.id === targetId) || null;
                  if (!card) return result;

                  result.cardId = card.id;
                  result.cardName = card.name || 'Card';
                  result.currentBalance =
                    card.rewardCashbackCents ?? 0; // default overwritten after rewardType is decided

                  // Try compute from rules matched to category/subcategory.
                  const rewardDelta =
                    p?.category
                      ? computeRewardDeltaForPurchase({
                          card,
                          amountCents,
                          category: p.category,
                          subcategory: p.subcategory
                        })
                      : null;

                  if (rewardDelta) {
                    result.rewardType = rewardDelta.rewardType;
                    if (rewardDelta.rewardType === 'cashback') {
                      result.delta = rewardDelta.deltaCashbackCents;
                      result.currentBalance = card.rewardCashbackCents ?? 0;
                    } else if (rewardDelta.rewardType === 'points') {
                      result.delta = rewardDelta.deltaPoints;
                      result.currentBalance = card.rewardPoints ?? 0;
                    } else {
                      result.delta = rewardDelta.deltaMiles;
                      result.currentBalance = card.rewardMiles ?? 0;
                    }
                  } else {
                    // No matched rule => treat as zero delta but keep unit aligned to what this card tracks.
                    result.rewardType = (card.rewardType || 'points') as any;
                    if (result.rewardType === 'cashback') result.currentBalance = card.rewardCashbackCents ?? 0;
                    else if (result.rewardType === 'points') result.currentBalance = card.rewardPoints ?? 0;
                    else result.currentBalance = card.rewardMiles ?? 0;
                    result.delta = 0;
                  }
                  return result;
                };

                // Compute old/new legs based on the pre-save purchase vs the new edited purchase.
                const oldLeg = computeLeg(oldPurchase);
                const newLeg = computeLeg(purchase);

                recordSelections(paymentSource, paymentTargetId, reimbursementBankId, splitBankId);
                actions.updatePurchase(currentPurchase.id, purchase);

                // Only prompt when rewards would actually need to change.
                // Editing title/notes should not trigger a rewards popup when payment method/amount/rules are unchanged.
                const rewardsNeedUpdate = oldLeg.cardId !== newLeg.cardId || oldLeg.rewardType !== newLeg.rewardType || oldLeg.delta !== newLeg.delta;
                if (rewardsNeedUpdate) {
                  setEditRewardPopup({
                    oldCardId: oldLeg.cardId,
                    oldCardName: oldLeg.cardName,
                    oldRewardType: oldLeg.rewardType,
                    oldDelta: oldLeg.delta,
                    oldCurrentBalance: oldLeg.currentBalance,

                    newCardId: newLeg.cardId,
                    newCardName: newLeg.cardName,
                    newRewardType: newLeg.rewardType,
                    newDelta: newLeg.delta,
                    newCurrentBalance: newLeg.currentBalance
                  });
                  return;
                }

                props.onSave?.();
                props.onClose();
                setTitle('');
                setAmount('');
                setNotes('');
                setIsSplit(false);
                setMyPortion('');
                setApplyToSnapshot(false);
                setPaymentSource('');
                setPaymentTargetId('');
                setShowSuggestionPopup(false);
                setSuggestedCardsOrder([]);
                setHasSelectedCategory(false);
                setShowSubTrackerPopup(false);
                setSuggestedSubTrackerCardId(null);
                return;
              }

              // Add purchase first (required), then optionally adjust rewards via popup.
              recordSelections(paymentSource, paymentTargetId, reimbursementBankId, splitBankId);
              actions.addPurchase(purchase);
              if (props.reimbursementExpected && applyToSnapshot && paymentSource === 'card' && paymentTargetId) {
                const reimbursementCents = isSplit && purchase.splitSnapshot && typeof purchase.splitSnapshot.amountCents === 'number'
                  ? purchase.splitSnapshot.amountCents
                  : myPortionCents;
                if (reimbursementCents > 0) {
                  const inboundItem: any = {
                    label: `Reimbursement: ${title.trim() || 'Purchase'}`,
                    amountCents: reimbursementCents,
                    depositTo: 'bank' as const
                  };
                  if (reimbursementBankId) {
                    inboundItem.targetBankId = reimbursementBankId;
                  }
                  actions.addPendingInbound(inboundItem);
                }
              }

              const getAppliedCard = () => {
                if (!purchase.applyToSnapshot) return null;
                const isSplitApplied = !!purchase.isSplit && !!purchase.splitSnapshot && typeof purchase.splitSnapshot.amountCents === 'number';
                const src = isSplitApplied && purchase.splitSnapshot?.paymentSource ? purchase.splitSnapshot.paymentSource : purchase.paymentSource;
                const targetId = isSplitApplied && purchase.splitSnapshot?.paymentTargetId ? purchase.splitSnapshot.paymentTargetId : purchase.paymentTargetId;
                if (!targetId) return null;
                if (src !== 'card' && src !== 'credit_card') return null;
                const card = (data.cards || []).find((c) => c.id === targetId);
                return card || null;
              };

              const card = getAppliedCard();
              const appliedAmountCents = (() => {
                const isSplitApplied = !!purchase.isSplit && !!purchase.splitSnapshot && typeof purchase.splitSnapshot.amountCents === 'number';
                if (isSplitApplied) return purchase.splitSnapshot.amountCents;
                return typeof purchase.amountCents === 'number' ? purchase.amountCents : 0;
              })();

              const rewardDelta: RewardDelta | null =
                card && purchase.category ? computeRewardDeltaForPurchase({ card, amountCents: appliedAmountCents, category: purchase.category, subcategory: purchase.subcategory }) : null;

              if (rewardDelta) {
                if (!card) return;
                const current = card.rewardCashbackCents ?? 0;
                const pointsCurrent = card.rewardPoints ?? 0;
                const milesCurrent = card.rewardMiles ?? 0;

                if (rewardDelta.rewardType === 'cashback') {
                  const newBalance = current + rewardDelta.deltaCashbackCents;
                  setRewardAdjustPopup({
                    rewardType: 'cashback',
                    cardId: card.id,
                    cardName: card.name || 'Card',
                    deltaLabel: `${formatCents(rewardDelta.deltaCashbackCents)} cash back`,
                    computedDelta: rewardDelta.deltaCashbackCents,
                    newBalanceLabel: `${formatCents(newBalance)} cash back`,
                    newBalance,
                    currentBalance: current
                  });
                } else if (rewardDelta.rewardType === 'points') {
                  const newBalance = pointsCurrent + rewardDelta.deltaPoints;
                  setRewardAdjustPopup({
                    rewardType: 'points',
                    cardId: card.id,
                    cardName: card.name || 'Card',
                    deltaLabel: `${rewardDelta.deltaPoints.toLocaleString()} points`,
                    computedDelta: rewardDelta.deltaPoints,
                    newBalanceLabel: `${newBalance.toLocaleString()} points`,
                    newBalance,
                    currentBalance: pointsCurrent
                  });
                } else {
                  const newBalance = milesCurrent + rewardDelta.deltaMiles;
                  setRewardAdjustPopup({
                    rewardType: 'miles',
                    cardId: card.id,
                    cardName: card.name || 'Card',
                    deltaLabel: `${rewardDelta.deltaMiles.toLocaleString()} miles`,
                    computedDelta: rewardDelta.deltaMiles,
                    newBalanceLabel: `${newBalance.toLocaleString()} miles`,
                    newBalance,
                    currentBalance: milesCurrent
                  });
                }
                return;
              }

              props.onSave?.();
              props.onClose();
              setTitle('');
              setAmount('');
              setNotes('');
              setIsSplit(false);
              setMyPortion('');
              setApplyToSnapshot(false);
              setPaymentSource('');
              setPaymentTargetId('');
              setShowSuggestionPopup(false);
              setSuggestedCardsOrder([]);
              setHasSelectedCategory(false);
              setShowSubTrackerPopup(false);
              setSuggestedSubTrackerCardId(null);
            }}
          >
            Save
          </button>
        </div>
      </div>
      </div>
    </>
  );
}

