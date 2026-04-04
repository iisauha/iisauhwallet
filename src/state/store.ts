import { create } from 'zustand';
import type { CreditCard, LedgerData, PendingInboundItem, PendingOutboundItem, Purchase, RecurringItem, RewardRule } from './models';
import { loadData, loadSubTracker, loadInvesting, loadLoans, saveLoans, loadPublicPaymentNowAdded, savePublicPaymentNowAdded, savePrivatePaymentNowBase, getVisiblePaymentNowCents, accrueHysaAccounts, recordHysaBalanceEvent, nowIso, saveData, saveInvesting, saveSubTracker, setLastPostedBankId, uid } from './storage';
import { loadPublicLoanSummary, savePublicLoanSummary } from '../features/federalLoans/PublicLoanSummaryStore';
import { getLoanEstimatedPaymentNowMap, getDetectedAnnualIncomeCentsFromRecurring } from '../features/loans/loanDerivation';
import { PHYSICAL_CASH_ID } from './keys';
import { addDaysLocal, addMonthsPreserveDay, addYearsPreserveDay, parseLocalDateKey, recurringIntervalDays, toLocalDateKey } from './calc';

// ── Single-level undo for destructive actions ──────────────────────────────
import { UNDO_DURATION_KEY } from './keys';

let _undoSnapshot: { data: LedgerData; label: string; expiresAt: number } | null = null;

function getUndoDurationMs(): number {
  try { const v = parseInt(localStorage.getItem(UNDO_DURATION_KEY) || '5', 10); return (v >= 1 && v <= 30 ? v : 5) * 1000; }
  catch { return 5000; }
}

export function getUndoSnapshot() { return _undoSnapshot; }
export function clearUndoSnapshot() { _undoSnapshot = null; }
export function applyUndo(): boolean {
  if (!_undoSnapshot || Date.now() > _undoSnapshot.expiresAt) { _undoSnapshot = null; return false; }
  const data = _undoSnapshot.data;
  saveData(data);
  useLedgerStore.setState({ data });
  _undoSnapshot = null;
  return true;
}

function captureUndo(data: LedgerData, label: string) {
  const ms = getUndoDurationMs();
  _undoSnapshot = { data: structuredClone(data), label, expiresAt: Date.now() + ms };
  window.dispatchEvent(new CustomEvent('undo-available', { detail: { label, durationMs: ms } }));
}

export interface LedgerState {
  data: LedgerData;
  actions: {
    reload: () => void;
    addBankAccount: (name: string) => void;
    updateBankName: (id: string, name: string) => void;
    deleteBankAccount: (id: string) => void;
    addCreditCard: (name: string) => void;
    deleteCreditCard: (id: string) => void;
    updateBankBalance: (id: string, amountCents: number, mode: 'add' | 'set') => void;
    updateCardBalance: (id: string, amountCents: number, mode: 'add' | 'set') => void;
    updateCardName: (id: string, name: string) => void;
    updateCardRewardConfig: (cardId: string, config: { rewardCategory?: string; rewardSubcategory?: string; isCatchAll?: boolean }) => void;
    updateCardRewardRules: (cardId: string, rules: RewardRule[]) => void;
    updateCardRewardTotals: (cardId: string, totals: { rewardCashbackCents?: number; rewardPoints?: number; rewardMiles?: number; rewardType?: 'cashback' | 'miles' | 'points' }) => void;
    updateCardRewardCpp: (cardId: string, cpp: { avgCentsPerPoint?: number; avgCentsPerMile?: number }) => void;
    addPendingInbound: (item: Omit<PendingInboundItem, 'id'>) => void;
    addPendingOutbound: (item: Omit<PendingOutboundItem, 'id'>) => void;
    updatePendingInbound: (id: string, updates: Partial<Omit<PendingInboundItem, 'id'>>) => void;
    updatePendingOutbound: (id: string, updates: Partial<Omit<PendingOutboundItem, 'id'>>) => void;
    addPurchase: (purchase: Omit<Purchase, 'id'>) => void;
    updatePurchase: (id: string, updated: Omit<Purchase, 'id'>) => void;
    deletePurchase: (id: string) => void;
    addRecurringItem: (item: any) => void;
    updateRecurringItem: (id: string, updates: Partial<RecurringItem>) => void;
    deleteRecurringItem: (id: string) => void;
    processRecurringBillsUpToToday: () => void;
    markRecurringHandled: (recurringId: string, dateKey: string) => void;
    deletePending: (kind: 'in' | 'out', id: string) => void;
    clearPending: (kind: 'in' | 'out') => void;
    markPendingPosted: (
      kind: 'in' | 'out',
      id: string,
      opts?: {
        bankId?: string;
        isRefund?: boolean;
        targetCardId?: string;
        loanAdjustments?: {
          skipLoanAdjustments?: boolean;
          privateBreakdownOverrides?: Record<string, number>;
        };
      }
    ) => { needsBankSelection: boolean };
  };
}

export const useLedgerStore = create<LedgerState>((set, get) => ({
  data: loadData(),
  actions: {
    reload: () => {
      set({ data: loadData() });
    },
    addBankAccount: (name) => {
      const next = structuredClone(get().data) as LedgerData;
      next.banks.push({ id: uid(), name: name || 'Bank', type: 'bank', balanceCents: 0, updatedAt: nowIso() });
      saveData(next);
      set({ data: next });
    },
    updateBankName: (id, name) => {
      const next = structuredClone(get().data) as LedgerData;
      const bank = next.banks.find((b) => b.id === id);
      if (!bank) return;
      bank.name = (name || 'Bank').trim() || 'Bank';
      if ((bank as any).updatedAt) (bank as any).updatedAt = nowIso();
      saveData(next);
      set({ data: next });
    },
    deleteBankAccount: (id) => {
      captureUndo(get().data, 'Delete bank account');
      const next = structuredClone(get().data) as LedgerData;
      next.banks = next.banks.filter((b) => b.id !== id && b.type !== 'physical_cash');
      // Clean up orphaned references
      next.pendingIn = next.pendingIn.map((p) => p.targetBankId === id ? { ...p, targetBankId: undefined } : p);
      next.pendingOut = next.pendingOut.map((p) => p.sourceBankId === id ? { ...p, sourceBankId: undefined } : p);
      next.recurring = next.recurring.map((r) =>
        (r as any).paymentTargetId === id && (r as any).paymentSource === 'bank' ? { ...r, paymentTargetId: undefined } as RecurringItem : r
      );
      saveData(next);
      set({ data: next });
    },
    addCreditCard: (name) => {
      const next = structuredClone(get().data) as LedgerData;
      next.cards.push({ id: uid(), name: name || 'Card', balanceCents: 0, updatedAt: nowIso() });
      saveData(next);
      set({ data: next });
    },
    deleteCreditCard: (id) => {
      captureUndo(get().data, 'Delete credit card');
      const next = structuredClone(get().data) as LedgerData;
      next.cards = next.cards.filter((c) => c.id !== id);
      // Clean up orphaned references
      next.pendingIn = next.pendingIn.map((p) => p.targetCardId === id ? { ...p, targetCardId: undefined, depositTo: 'bank' } : p);
      next.pendingOut = next.pendingOut.map((p) => p.targetCardId === id ? { ...p, targetCardId: undefined } : p);
      next.recurring = next.recurring.map((r) => {
        const ps = (r as any).paymentSource;
        return (r as any).paymentTargetId === id && (ps === 'card' || ps === 'credit_card') ? { ...r, paymentTargetId: undefined, paymentSource: undefined } as RecurringItem : r;
      });
      saveData(next);
      set({ data: next });
    },
    updateBankBalance: (id, amountCents, mode) => {
      if (mode === 'set') captureUndo(get().data, 'Set bank balance');
      const next = structuredClone(get().data) as LedgerData;
      const bank = next.banks.find((b) => b.id === id);
      if (!bank) return;
      bank.balanceCents = mode === 'set' ? amountCents : (bank.balanceCents || 0) + amountCents;
      bank.updatedAt = nowIso();
      saveData(next);
      set({ data: next });
    },
    updateCardBalance: (id, amountCents, mode) => {
      if (mode === 'set') captureUndo(get().data, 'Set card balance');
      const next = structuredClone(get().data) as LedgerData;
      const card = next.cards.find((c) => c.id === id);
      if (!card) return;
      card.balanceCents = mode === 'set' ? amountCents : (card.balanceCents || 0) + amountCents;
      card.updatedAt = nowIso();
      saveData(next);
      set({ data: next });
    },
    updateCardName: (id, name) => {
      const next = structuredClone(get().data) as LedgerData;
      const card = next.cards.find((c) => c.id === id);
      if (!card) return;
      card.name = (name || 'Card').trim() || 'Card';
      card.updatedAt = nowIso();
      saveData(next);
      set({ data: next });
    },
    updateCardRewardConfig: (cardId, config) => {
      const next = structuredClone(get().data) as LedgerData;
      const card = next.cards.find((c) => c.id === cardId);
      if (!card) return;
      if (config.rewardCategory !== undefined) card.rewardCategory = config.rewardCategory || undefined;
      if (config.rewardSubcategory !== undefined) card.rewardSubcategory = config.rewardSubcategory || undefined;
      if (config.isCatchAll !== undefined) card.isCatchAll = config.isCatchAll;
      saveData(next);
      set({ data: next });
    },
    updateCardRewardRules: (cardId, rules) => {
      const next = structuredClone(get().data) as LedgerData;
      const card = next.cards.find((c) => c.id === cardId);
      if (!card) return;
      // Sanitize: ensure rule values are positive finite numbers
      const sanitized = (rules || []).map(r => ({
        ...r,
        value: typeof r.value === 'number' && Number.isFinite(r.value) && r.value >= 0 ? r.value : 0,
      }));
      card.rewardRules = sanitized.length > 0 ? sanitized : undefined;
      card.updatedAt = nowIso();
      saveData(next);
      set({ data: next });
    },
    updateCardRewardTotals: (cardId, totals) => {
      const next = structuredClone(get().data) as LedgerData;
      const card = next.cards.find((c) => c.id === cardId);
      if (!card) return;
      if (totals.rewardCashbackCents !== undefined) card.rewardCashbackCents = Math.max(0, Math.round(totals.rewardCashbackCents));
      if (totals.rewardPoints !== undefined) card.rewardPoints = Math.max(0, Math.round(totals.rewardPoints));
      if (totals.rewardMiles !== undefined) card.rewardMiles = Math.max(0, Math.round(totals.rewardMiles));
      if (totals.rewardType !== undefined) {
        card.rewardType = totals.rewardType;
        if (totals.rewardType === 'cashback') {
          card.rewardPoints = 0;
          card.rewardMiles = 0;
        } else if (totals.rewardType === 'points') {
          card.rewardCashbackCents = 0;
          card.rewardMiles = 0;
        } else {
          card.rewardCashbackCents = 0;
          card.rewardPoints = 0;
        }
      }
      card.updatedAt = nowIso();
      saveData(next);
      set({ data: next });
    },
    updateCardRewardCpp: (cardId, cpp) => {
      const next = structuredClone(get().data) as LedgerData;
      const card = next.cards.find((c) => c.id === cardId);
      if (!card) return;
      if ('avgCentsPerPoint' in cpp) card.avgCentsPerPoint = (typeof cpp.avgCentsPerPoint === 'number' && cpp.avgCentsPerPoint >= 0) ? cpp.avgCentsPerPoint : undefined;
      if ('avgCentsPerMile' in cpp) card.avgCentsPerMile = (typeof cpp.avgCentsPerMile === 'number' && cpp.avgCentsPerMile >= 0) ? cpp.avgCentsPerMile : undefined;
      card.updatedAt = nowIso();
      saveData(next);
      set({ data: next });
    },
    addPendingInbound: (item) => {
      const next = structuredClone(get().data) as LedgerData;
      const createdAt = (item as PendingInboundItem).createdAt ?? nowIso();
      next.pendingIn.push({ ...item, id: uid(), createdAt } as PendingInboundItem);
      saveData(next);
      set({ data: next });
    },
    addPendingOutbound: (item) => {
      const next = structuredClone(get().data) as LedgerData;
      const createdAt = (item as PendingOutboundItem).createdAt ?? nowIso();
      next.pendingOut.push({ ...item, id: uid(), createdAt } as PendingOutboundItem);
      saveData(next);
      set({ data: next });
    },
    updatePendingInbound: (id, updates) => {
      const next = structuredClone(get().data) as LedgerData;
      const item = (next.pendingIn || []).find((p) => p.id === id);
      if (!item) return;
      const idx = next.pendingIn!.findIndex((p) => p.id === id);
      next.pendingIn![idx] = { ...item, ...updates, id };
      saveData(next);
      set({ data: next });
    },
    updatePendingOutbound: (id, updates) => {
      const next = structuredClone(get().data) as LedgerData;
      const item = (next.pendingOut || []).find((p) => p.id === id);
      if (!item) return;
      const idx = next.pendingOut!.findIndex((p) => p.id === id);
      next.pendingOut![idx] = { ...item, ...updates, id };
      saveData(next);
      set({ data: next });
    },
    updatePurchase: (id, updated) => {
      const next = structuredClone(get().data) as LedgerData;
      const idx = (next.purchases || []).findIndex((x: any) => x.id === id);
      if (idx === -1) return;
      const oldP: any = (next.purchases || [])[idx];
      const normalize = (s: unknown) =>
        typeof s === 'string' ? s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : '';

      // Build updated purchase object, preserving unspecified fields.
      const p: any = { ...oldP, ...updated, id };

      // Compute totals and portions in cents.
      const getTotal = (q: any) =>
        typeof q.originalTotal === 'number'
          ? q.originalTotal
          : typeof q.splitTotalCents === 'number'
            ? q.splitTotalCents
            : typeof q.amountCents === 'number'
              ? q.amountCents
              : 0;

      const oldTotal = getTotal(oldP);
      const newTotal = getTotal(p);
      const oldPortion = typeof oldP.amountCents === 'number' ? oldP.amountCents : 0;
      const newPortion = typeof p.amountCents === 'number' ? p.amountCents : oldPortion;
      const oldTheirShare = oldTotal - oldPortion;
      const newTheirShare = newTotal - newPortion;

      const totalDelta = newTotal - oldTotal;
      const myDelta = newPortion - oldPortion;
      const theirDelta = newTheirShare - oldTheirShare;

      const oldApply = !!oldP.applyToSnapshot;
      const newApply = !!p.applyToSnapshot;
      const oldSrc = (oldP.paymentSource || '') as string;
      const newSrc = (p.paymentSource || '') as string;
      const oldTargetId = (oldP.paymentTargetId || '') as string;
      const newTargetId = (p.paymentTargetId || '') as string;
      const oldSplit = !!oldP.isSplit;
      const newSplit = !!p.isSplit;

      const sideEffectChanged =
        oldTotal !== newTotal ||
        oldPortion !== newPortion ||
        oldApply !== newApply ||
        normalize(oldSrc) !== normalize(newSrc) ||
        normalize(oldTargetId) !== normalize(newTargetId) ||
        oldSplit !== newSplit;

      // If no side-effect fields changed, simply persist updated purchase fields and exit.
      if (!sideEffectChanged) {
        next.purchases[idx] = p;
        saveData(next);
        set({ data: next });
        return;
      }

      const messages: string[] = [];

      // Snapshot delta application (card/bank) using totalDelta and target changes.
      const applySnapshotDelta = (src: string, targetId: string | undefined, delta: number) => {
        if (!delta || !src) return;
        if ((src === 'card' || src === 'credit_card') && targetId) {
          const card = next.cards.find((c) => c.id === targetId);
          if (card) {
            card.balanceCents = (card.balanceCents || 0) + delta;
            card.updatedAt = nowIso();
          }
        } else if ((src === 'bank' || src === 'cash') && (targetId || src === 'cash')) {
          const bankTargetId = targetId || PHYSICAL_CASH_ID;
          const bank = next.banks.find((b) => b.id === bankTargetId);
          if (bank) {
            bank.balanceCents = (bank.balanceCents || 0) - delta;
            bank.updatedAt = nowIso();
          }
        }
      };

      // Snapshot: remove old if it was applied, then apply new if needed.
      if (oldApply) {
        const oldEffectiveTarget = oldTargetId || (oldSrc === 'cash' ? PHYSICAL_CASH_ID : '');
        applySnapshotDelta(oldSrc, oldEffectiveTarget, -oldTotal);
      }
      if (newApply) {
        const newEffectiveTarget = newTargetId || (newSrc === 'cash' ? PHYSICAL_CASH_ID : '');
        applySnapshotDelta(newSrc, newEffectiveTarget, newTotal);
        const labeled =
          (newSrc === 'card' || newSrc === 'credit_card'
            ? next.cards.find((c) => c.id === newTargetId)?.name
            : next.banks.find((b) => b.id === newEffectiveTarget)?.name) || 'account';
        if (totalDelta !== 0) {
          messages.push(
            `Snapshot updated: ${totalDelta > 0 ? '+' : ''}$${(totalDelta / 100).toFixed(
              2
            )} applied to ${labeled}`
          );
        }
      }

      // SUB tracker delta on totalDelta.
      try {
        const isCardOld =
          oldApply && (oldSrc === 'card' || oldSrc === 'credit_card') && oldTargetId;
        const isCardNew =
          newApply && (newSrc === 'card' || newSrc === 'credit_card') && newTargetId;

        const tracker = loadSubTracker();
        let changedSub = false;

        const adjustSub = (targetId: string, delta: number) => {
          if (!delta) return;
          const cardName = (next.cards || []).find((c) => c.id === targetId)?.name || '';
          const entries = (tracker.entries || []).map((e: any) => {
            if (!e) return e;
            const ref = e.cardRef;
            const matches =
              ref && ref.type === 'card'
                ? String(ref.cardId || '') === targetId
                : ref && ref.type === 'manual'
                  ? normalize(ref.name) && normalize(ref.name) === normalize(cardName)
                  : false;
            if (!matches) return e;
            const applied: string[] = Array.isArray(e.appliedPurchaseIds) ? e.appliedPurchaseIds : [];
            let spend = typeof e.spendCents === 'number' ? e.spendCents : 0;
            if (!applied.includes(id)) {
              applied.push(id);
            }
            spend = Math.max(0, spend + delta);
            changedSub = true;
            return {
              ...e,
              spendCents: spend,
              appliedPurchaseIds: applied,
              updatedAt: nowIso()
            };
          });
          if (changedSub) saveSubTracker({ version: 1, entries });
        };

        // Remove old total from old card if needed.
        if (isCardOld) {
          adjustSub(String(oldTargetId), -oldTotal);
        }
        // Apply new total to new card if needed.
        if (isCardNew) {
          adjustSub(String(newTargetId), newTotal);
        }

        if (isCardNew && totalDelta !== 0) {
          const cardName = (next.cards || []).find((c) => c.id === newTargetId)?.name || 'card';
          messages.push(
            `SUB tracker updated: ${totalDelta > 0 ? '+' : ''}$${(totalDelta / 100).toFixed(
              2
            )} applied to ${cardName}`
          );
        }
      } catch (_) {}

      // Pending inbound delta for split reimbursements using theirDelta.
      if (theirDelta !== 0) {
        const linked = (next.pendingIn || []).filter((pi: any) => pi.linkedPurchaseId === id);
        if (theirDelta > 0) {
          // Add new pending inbound for the delta.
          next.pendingIn = next.pendingIn || [];
          next.pendingIn.push({
            id: uid(),
            label: 'Reimbursement (adjustment): ' + (p.title || 'Purchase'),
            amountCents: theirDelta,
            createdAt: nowIso(),
            linkedPurchaseId: id,
            fromSplit: true
          });
          messages.push(
            `Reimbursement updated: +$${(theirDelta / 100).toFixed(2)} pending inbound`
          );
        } else if (theirDelta < 0 && linked.length) {
          // Reduce existing pending inbound amounts by |theirDelta|.
          let remaining = -theirDelta;
          const updatedPending: any[] = [];
          for (const pi of next.pendingIn) {
            if (pi.linkedPurchaseId !== id || remaining <= 0) {
              updatedPending.push(pi);
              continue;
            }
            const reduce = Math.min(pi.amountCents || 0, remaining);
            const newAmt = (pi.amountCents || 0) - reduce;
            remaining -= reduce;
            if (newAmt > 0) {
              updatedPending.push({ ...pi, amountCents: newAmt });
            }
          }
          next.pendingIn = updatedPending;
          messages.push(
            `Reimbursement updated: -$${((-theirDelta) / 100).toFixed(
              2
            )} removed from pending inbound`
          );
        }
      }

      next.purchases[idx] = p;
      saveData(next);
      set({ data: next });

      if (messages.length && typeof window !== 'undefined') {
        // Simple toast via alert for now.
        try {
          window.alert(messages.join(' • '));
        } catch (_) {
          // ignore
        }
      }
    },
    addPurchase: (purchase) => {
      const next = structuredClone(get().data) as LedgerData;
      const id = uid();
      const p: any = { ...purchase, id, createdAt: nowIso() };
      const normalize = (s: unknown) => (typeof s === 'string' ? s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : '');

      // If split purchase with inbound reimbursement, create pending inbound item (legacy behavior).
      if (p.isSplit && typeof p.splitInboundCents === 'number' && p.splitInboundCents > 0) {
        const pendingId = uid();
        const label = 'Venmo - "' + (p.title || 'Purchase') + '"';
        const inboundItem: any = {
          id: pendingId,
          label,
          amountCents: p.splitInboundCents,
          createdAt: nowIso(),
          linkedPurchaseId: id,
          fromSplit: true,
          depositTo: 'bank' as const
        };
        if (p.splitTargetBankId) {
          inboundItem.targetBankId = p.splitTargetBankId;
        }
        next.pendingIn.push(inboundItem);
        p.splitPendingId = pendingId;
      }

      // Apply to snapshot (legacy behavior).
      const applied = !!p.applyToSnapshot && !!p.paymentSource;
      if (applied) {
        const isSplitApplied = !!p.isSplit && p.splitSnapshot && typeof p.splitSnapshot.amountCents === 'number';
        const amount = isSplitApplied ? p.splitSnapshot.amountCents : (typeof p.amountCents === 'number' ? p.amountCents : 0);
        const src = isSplitApplied && p.splitSnapshot.paymentSource ? p.splitSnapshot.paymentSource : p.paymentSource;
        const targetId = isSplitApplied && p.splitSnapshot.paymentTargetId ? p.splitSnapshot.paymentTargetId : p.paymentTargetId;

        if ((src === 'card' || src === 'credit_card') && targetId) {
          const card = next.cards.find((c) => c.id === targetId);
          if (card) {
            card.balanceCents = (card.balanceCents || 0) + amount;
            card.updatedAt = nowIso();
          }
        } else if ((src === 'bank' || src === 'cash') && (targetId || src === 'cash')) {
          const bankTargetId = targetId || PHYSICAL_CASH_ID;
          const bank = next.banks.find((b) => b.id === bankTargetId);
          if (bank) {
            bank.balanceCents = (bank.balanceCents || 0) - amount;
            bank.updatedAt = nowIso();
          }
        } else if (src === 'hysa' && targetId) {
          let inv = accrueHysaAccounts(loadInvesting());
          const idx = inv.accounts.findIndex((a: any) => a.id === targetId && a.type === 'hysa');
          if (idx !== -1) {
            const acc = inv.accounts[idx] as any;
            const now = Date.now();
            const newBalanceCents = Math.max(0, (acc.balanceCents || 0) - amount);
            let updated = recordHysaBalanceEvent(acc, now, newBalanceCents);
            const subBucket = p.hysaSubBucket;
            if (subBucket === 'reserved') {
              updated = { ...updated, reservedSavingsCents: Math.max(0, (acc.reservedSavingsCents || 0) - amount) };
            }
            inv.accounts = inv.accounts.slice(0, idx).concat([{ ...updated, lastAccruedAt: now }], inv.accounts.slice(idx + 1));
            saveInvesting(inv);
          }
        }
      }

      // SUB tracker: track spend on applied card purchases (uses user's portion, not split total),
      // and guard against double counting by tracking applied purchase IDs.
      try {
        const isCard = p.applyToSnapshot && (p.paymentSource === 'card' || p.paymentSource === 'credit_card') && p.paymentTargetId;
        const getTotal = (q: any) =>
          typeof q.originalTotal === 'number'
            ? q.originalTotal
            : typeof q.splitTotalCents === 'number'
              ? q.splitTotalCents
              : typeof q.amountCents === 'number'
                ? q.amountCents
                : 0;
        const delta = getTotal(p);
        if (isCard && delta > 0) {
          const targetId = String(p.paymentTargetId || '');
          const cardName = (next.cards || []).find((c) => c.id === targetId)?.name || '';
          const tracker = loadSubTracker();
          let changed = false;
          const entries = (tracker.entries || []).map((e: any) => {
            if (!e) return e;
            const ref = e.cardRef;
            const matches =
              ref && ref.type === 'card'
                ? String(ref.cardId || '') === targetId
                : ref && ref.type === 'manual'
                  ? normalize(ref.name) && normalize(ref.name) === normalize(cardName)
                  : false;
            if (!matches) return e;
            const applied: string[] = Array.isArray(e.appliedPurchaseIds) ? e.appliedPurchaseIds : [];
            if (applied.includes(id)) return e;
            const nextSpend = (typeof e.spendCents === 'number' ? e.spendCents : 0) + delta;
            changed = true;
            return {
              ...e,
              spendCents: nextSpend,
              appliedPurchaseIds: [...applied, id],
              updatedAt: nowIso()
            };
          });
          if (changed) saveSubTracker({ version: 1, entries });
        }
      } catch (_) {}

      next.purchases.push(p);
      saveData(next);
      set({ data: next });
    },
    deletePurchase: (id) => {
      captureUndo(get().data, 'Delete purchase');
      const next = structuredClone(get().data) as LedgerData;
      const p: any = (next.purchases || []).find((x: any) => x.id === id);
      if (!p) return;
      const normalize = (s: unknown) => (typeof s === 'string' ? s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : '');

      const applied = !!p.applyToSnapshot && !!p.paymentSource;
      if (applied) {
        const isSplitApplied = !!p.isSplit && p.splitSnapshot && typeof p.splitSnapshot.amountCents === 'number';
        const amount = isSplitApplied ? p.splitSnapshot.amountCents : (typeof p.amountCents === 'number' ? p.amountCents : 0);
        const src = isSplitApplied && p.splitSnapshot.paymentSource ? p.splitSnapshot.paymentSource : p.paymentSource;
        const targetId = isSplitApplied && p.splitSnapshot.paymentTargetId ? p.splitSnapshot.paymentTargetId : p.paymentTargetId;

        if ((src === 'card' || src === 'credit_card') && targetId) {
          const card = next.cards.find((c) => c.id === targetId);
          if (card) {
            card.balanceCents = (card.balanceCents || 0) - amount;
            card.updatedAt = nowIso();
          }
        } else if ((src === 'bank' || src === 'cash') && (targetId || src === 'cash')) {
          const bankTargetId = targetId || PHYSICAL_CASH_ID;
          const bank = next.banks.find((b) => b.id === bankTargetId);
          if (bank) {
            bank.balanceCents = (bank.balanceCents || 0) + amount;
            bank.updatedAt = nowIso();
          }
        }
      }

      if (p.isSplit && p.splitPendingId && Array.isArray(next.pendingIn)) {
        next.pendingIn = next.pendingIn.filter((pi: any) => pi.id !== p.splitPendingId);
      }

      // SUB tracker rollback when deleting a tracked purchase.
      try {
        const isCard = p.applyToSnapshot && (p.paymentSource === 'card' || p.paymentSource === 'credit_card') && p.paymentTargetId;
        const getTotal = (q: any) =>
          typeof q.originalTotal === 'number'
            ? q.originalTotal
            : typeof q.splitTotalCents === 'number'
              ? q.splitTotalCents
              : typeof q.amountCents === 'number'
                ? q.amountCents
                : 0;
        const delta = getTotal(p);
        if (isCard && delta > 0) {
          const targetId = String(p.paymentTargetId || '');
          const cardName = (next.cards || []).find((c) => c.id === targetId)?.name || '';
          const tracker = loadSubTracker();
          let changed = false;
          const entries = (tracker.entries || []).map((e: any) => {
            if (!e) return e;
            const ref = e.cardRef;
            const matches =
              ref && ref.type === 'card'
                ? String(ref.cardId || '') === targetId
                : ref && ref.type === 'manual'
                  ? normalize(ref.name) && normalize(ref.name) === normalize(cardName)
                  : false;
            if (!matches) return e;
            const applied: string[] = Array.isArray(e.appliedPurchaseIds) ? e.appliedPurchaseIds : [];
            if (!applied.includes(id)) return e;
            const prev = typeof e.spendCents === 'number' ? e.spendCents : 0;
            const nextSpend = Math.max(0, prev - delta);
            changed = true;
            return {
              ...e,
              spendCents: nextSpend,
              appliedPurchaseIds: applied.filter((pid) => pid !== id),
              updatedAt: nowIso()
            };
          });
          if (changed) saveSubTracker({ version: 1, entries });
        }
      } catch (_) {}

      next.purchases = next.purchases.filter((x: any) => x.id !== id);
      saveData(next);
      set({ data: next });
    },
    addRecurringItem: (item) => {
      const next = structuredClone(get().data) as any;
      if (!Array.isArray(next.recurring)) next.recurring = [];
      next.recurring.push({ id: uid(), ...item });
      saveData(next);
      set({ data: next });
    },
    updateRecurringItem: (id, updates) => {
      const next = structuredClone(get().data) as any;
      if (!Array.isArray(next.recurring)) next.recurring = [];
      next.recurring = next.recurring.map((r: any) => (r && r.id === id ? { ...r, ...updates } : r));
      saveData(next);
      set({ data: next });
    },
    deleteRecurringItem: (id) => {
      captureUndo(get().data, 'Delete recurring item');
      const next = structuredClone(get().data) as any;
      next.recurring = (next.recurring || []).filter((r: any) => r.id !== id);
      if (next.recurringPosted && typeof next.recurringPosted === 'object') {
        Object.keys(next.recurringPosted).forEach((k) => {
          if (k.startsWith(id + ':')) delete next.recurringPosted[k];
        });
      }
      saveData(next);
      set({ data: next });
    },
    processRecurringBillsUpToToday: () => {
      const next = structuredClone(get().data) as any;
      if (!Array.isArray(next.recurring)) next.recurring = [];
      if (!next.recurringPosted || typeof next.recurringPosted !== 'object') next.recurringPosted = {};
      const todayKey = toLocalDateKey(new Date());
      const today = parseLocalDateKey(todayKey);
      if (Number.isNaN(today.getTime())) return;
      let mutated = false;

      function applyPurchaseToSnapshot(purchase: any) {
        if (!purchase || !purchase.applyToSnapshot || !purchase.paymentSource) return;
        const amount = typeof purchase.splitTotalCents === 'number' ? purchase.splitTotalCents : typeof purchase.amountCents === 'number' ? purchase.amountCents : 0;
        const src = purchase.paymentSource;
        if ((src === 'card' || src === 'credit_card') && purchase.paymentTargetId) {
          const card = next.cards.find((c: any) => c.id === purchase.paymentTargetId);
          if (card) {
            card.balanceCents = (card.balanceCents || 0) + amount;
            card.updatedAt = nowIso();
          }
        } else if ((src === 'bank' || src === 'cash') && (purchase.paymentTargetId || src === 'cash')) {
          const targetId = purchase.paymentTargetId || PHYSICAL_CASH_ID;
          const bank = next.banks.find((b: any) => b.id === targetId);
          if (bank) {
            bank.balanceCents = (bank.balanceCents || 0) - amount;
            bank.updatedAt = nowIso();
          }
        }
      }

      const detectedIncome = getDetectedAnnualIncomeCentsFromRecurring(next.recurring || []);
      const loansState = loadLoans();
      const loanPaymentMap = getLoanEstimatedPaymentNowMap(loansState.loans || [], detectedIncome);

      next.recurring.forEach((r: any) => {
        if (!r || !r.autoPay) return;
        if ((r.type || 'expense') === 'income') {
          if (r.isActive === false) return;
        } else if (!r.active) return;
        const start = parseLocalDateKey(r.startDate);
        if (Number.isNaN(start.getTime())) return;
        const end = r.endDate ? parseLocalDateKey(r.endDate) : null;
        const freq = r.frequency || 'monthly';
        const nDays = freq === 'custom' || freq === 'every_n_days' ? recurringIntervalDays(r) : 0;
        let current: Date;
        if (freq === 'monthly' && r.useLastDayOfMonth) current = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        else current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        function advance() {
          if (freq === 'weekly') current = addDaysLocal(current, 7);
          else if (freq === 'biweekly') current = addDaysLocal(current, 14);
          else if (freq === 'yearly') current = addYearsPreserveDay(start, current, 1);
          else if (freq === 'custom' || freq === 'every_n_days') current = addDaysLocal(current, nDays);
          else if (freq === 'monthly' && r.useLastDayOfMonth) current = new Date(current.getFullYear(), current.getMonth() + 2, 0);
          else current = addMonthsPreserveDay(start, current, 1);
        }

        while (current <= today && (!end || current <= end)) {
          const dateKey = toLocalDateKey(current);
          const regKey = (r.id || '') + ':' + dateKey;
          if (!next.recurringPosted[regKey]) {
            const recType = r.type || 'expense';
            let fullAmountCents: number;
            if (recType !== 'income' && r.useLoanEstimatedPayment) {
              if (r.linkedLoanId && loanPaymentMap[r.linkedLoanId] != null) {
                fullAmountCents = loanPaymentMap[r.linkedLoanId]!;
              } else if (!r.linkedLoanId) {
                const privateLoans = (loansState.loans || []).filter((l: any) => l.category === 'private' && !l.excludeFromCurrentPayment);
                let privateTotal = 0;
                for (const l of privateLoans) {
                  const amt = loanPaymentMap[l.id];
                  if (amt != null && amt > 0) privateTotal += amt;
                }
                fullAmountCents = getVisiblePaymentNowCents(privateTotal);
              } else {
                fullAmountCents =
                  r.expectedMinCents != null && r.expectedMaxCents != null
                    ? Math.round((r.expectedMinCents + r.expectedMaxCents) / 2)
                    : typeof r.amountCents === 'number'
                      ? r.amountCents
                      : 0;
              }
            } else {
              fullAmountCents =
                r.expectedMinCents != null && r.expectedMaxCents != null
                  ? Math.round((r.expectedMinCents + r.expectedMaxCents) / 2)
                  : typeof r.amountCents === 'number'
                    ? r.amountCents
                    : 0;
            }
            if (recType === 'income') {
              if (r.applyToSnapshot && r.paymentTargetId) {
                const bank = next.banks.find((b: any) => b.id === r.paymentTargetId);
                if (bank) {
                  bank.balanceCents = (bank.balanceCents || 0) + fullAmountCents;
                  bank.updatedAt = nowIso();
                }
              }
              next.recurringPosted[regKey] = true;
              mutated = true;
            } else {
              const isSplit = !!r.isSplit && typeof r.myPortionCents === 'number' && r.myPortionCents > 0;
              const myPortionCents = isSplit ? r.myPortionCents : fullAmountCents;
              if (r.applyToSnapshot && r.paymentSource) {
                const purchase: any = {
                  id: uid(),
                  title: r.name || 'Recurring',
                  amountCents: myPortionCents,
                  dateISO: dateKey,
                  category: r.category,
                  subcategory: r.subcategory || undefined,
                  notes: r.notes,
                  recurringId: r.id,
                  recurringDateKey: dateKey,
                  applyToSnapshot: true,
                  paymentSource: r.paymentSource,
                  paymentTargetId: r.paymentTargetId
                };
                if (isSplit) purchase.splitTotalCents = fullAmountCents;
                next.purchases.push(purchase);
                applyPurchaseToSnapshot(purchase);
                if (isSplit && fullAmountCents > myPortionCents) {
                  next.pendingIn.push({
                    id: uid(),
                    label: 'Reimbursement: ' + (r.name || 'Recurring'),
                    amountCents: fullAmountCents - myPortionCents,
                    createdAt: nowIso(),
                    splitRecurringPurchaseId: purchase.id
                  });
                }
                // If this is an Investing recurring expense with investingTransferEnabled and autopay,
                // also credit the configured investing account at post time.
                if (
                  r.category &&
                  r.category !== 'income' &&
                  r.investingTransferEnabled &&
                  r.investingTargetAccountId &&
                  r.investingTargetType
                ) {
                  try {
                    let inv = loadInvesting();
                    inv = accrueHysaAccounts(inv);
                    const idx = inv.accounts.findIndex(
                      (a: any) =>
                        a.id === r.investingTargetAccountId && (a.type === r.investingTargetType)
                    );
                    if (idx !== -1) {
                      const acc = inv.accounts[idx] as any;
                      const newBalanceCents = (acc.balanceCents || 0) + myPortionCents;
                      if (acc.type === 'hysa') {
                        const now = Date.now();
                        const updated = recordHysaBalanceEvent(acc, now, newBalanceCents);
                        inv.accounts = inv.accounts.slice(0, idx).concat([{ ...updated, lastAccruedAt: now }], inv.accounts.slice(idx + 1));
                      } else {
                        acc.balanceCents = newBalanceCents;
                      }
                      saveInvesting(inv);
                    }
                  } catch (_) {}
                }
              }
              next.recurringPosted[regKey] = true;
              mutated = true;
            }
          }
          advance();
        }
      });

      if (mutated) {
        saveData(next);
        set({ data: next });
      }
    },
    markRecurringHandled: (recurringId, dateKey) => {
      const next = structuredClone(get().data) as any;
      if (!next.recurringPosted || typeof next.recurringPosted !== 'object') next.recurringPosted = {};
      next.recurringPosted[recurringId + ':' + dateKey] = true;
      saveData(next);
      set({ data: next });
    },
    deletePending: (kind, id) => {
      captureUndo(get().data, 'Delete pending item');
      const next = structuredClone(get().data) as LedgerData;
      if (kind === 'in') next.pendingIn = next.pendingIn.filter((p) => p.id !== id);
      else next.pendingOut = next.pendingOut.filter((p) => p.id !== id);
      saveData(next);
      set({ data: next });
    },
    clearPending: (kind) => {
      captureUndo(get().data, 'Clear all pending');
      const next = structuredClone(get().data) as LedgerData;
      if (kind === 'in') next.pendingIn = [];
      else next.pendingOut = [];
      saveData(next);
      set({ data: next });
    },
    markPendingPosted: (kind, id, opts) => {
      const current = get().data;
      const next = structuredClone(current) as LedgerData;
      const markRecurringInstanceHandledIfPresent = (pendingItem: any) => {
        const recurringId = String(pendingItem?.recurringId || '');
        const dateKey = String(pendingItem?.recurringDateKey || '');
        if (!recurringId || !dateKey) return;
        const regKey = recurringId + ':' + dateKey;
        const anyNext: any = next as any;
        if (!anyNext.recurringPosted || typeof anyNext.recurringPosted !== 'object') anyNext.recurringPosted = {};
        anyNext.recurringPosted[regKey] = true;
      };
      const list = kind === 'in' ? next.pendingIn : next.pendingOut;
      const idx = list.findIndex((p) => p.id === id);
      if (idx === -1) return { needsBankSelection: false };
      const item: any = list[idx];
      const amount = item.amountCents || 0;
      const resolved = opts || {};
      const loanAdjustments = (resolved as any).loanAdjustments as
        | { skipLoanAdjustments?: boolean; privateBreakdownOverrides?: Record<string, number> }
        | undefined;

      // Apply posted loan payment: only private portion reduces private loan balances; public portion reduces visible Payment(now) only.
      if (kind === 'out' && amount > 0 && item.recurringId && !loanAdjustments?.skipLoanAdjustments) {
        const recurring = next.recurring?.find((r: any) => r.id === item.recurringId);
        if (recurring?.useLoanEstimatedPayment) {
          let breakdown: Record<string, number> = item.meta?.privateLoanBreakdownCents
            ? { ...item.meta.privateLoanBreakdownCents }
            : recurring.linkedLoanId
              ? { [recurring.linkedLoanId]: amount }
              : {};
          if (loanAdjustments?.privateBreakdownOverrides) {
            breakdown = { ...breakdown, ...loanAdjustments.privateBreakdownOverrides };
          }
          const todayKey = toLocalDateKey(new Date());
          if (Object.keys(breakdown).length > 0) {
            const loansState = loadLoans();
            // Safety: if loadLoans returned empty but real data exists, cache miss — abort to prevent wiping loans.
            if (loansState.loans.length === 0) {
              try {
                const rawCheck = localStorage.getItem('iisauhwallet_loans_v1');
                if (rawCheck && rawCheck.length > 10) {
                  console.error('[markPendingPosted] Safety abort: loadLoans() empty but localStorage has data. Skipping loan balance update to prevent data loss.');
                }
              } catch (_) {}
            } else {
              const backupPrivateCount = loansState.loans.filter((l: any) => l.category === 'private').length;
              const loans = loansState.loans.map((l: any) => {
                if (l.category !== 'private') return l;
                const sub = breakdown[l.id] ?? 0;
                if (sub <= 0) return l;
                const newBalance = Math.max(0, (l.balanceCents || 0) - sub);
                return { ...l, balanceCents: newBalance, accrualLastUpdatedAt: todayKey };
              });
              const newPrivateCount = loans.filter((l: any) => l.category === 'private').length;
              if (backupPrivateCount > 0 && newPrivateCount < backupPrivateCount) {
                console.error('[markPendingPosted] Safety abort: would reduce private loans from', backupPrivateCount, 'to', newPrivateCount, '. Restoring backup.');
                saveLoans({ ...loansState, loans: loansState.loans });
              } else {
                saveLoans({ ...loansState, loans });
              }
            }
          }
          savePrivatePaymentNowBase(0);
          const publicSummary = loadPublicLoanSummary();
          const publicPortionCents = publicSummary.estimatedMonthlyPaymentCents ?? 0;
          if (publicPortionCents > 0) {
            const current = loadPublicPaymentNowAdded();
            savePublicPaymentNowAdded(Math.max(0, current - publicPortionCents));
            const pub = loadPublicLoanSummary();
            if (pub.totalBalanceCents != null && pub.totalBalanceCents > 0) {
              savePublicLoanSummary({
                ...pub,
                totalBalanceCents: Math.max(0, pub.totalBalanceCents - publicPortionCents)
              });
            }
          }
        }
      }

      const addSpendingFromPendingIfNeeded = (pending: any, paymentSource: 'card' | 'bank' | 'cash', paymentTargetId?: string) => {
        if (!pending || !pending.meta || pending.meta.source !== 'upcoming' || pending.meta.addToSpendingOnConfirm === false) return;
        const rawAmountCents = typeof pending.amountCents === 'number' ? pending.amountCents : 0;
        if (!(rawAmountCents > 0)) return;
        const amountCents = typeof pending.myPortionCents === 'number' ? pending.myPortionCents : rawAmountCents;
        const todayISO = toLocalDateKey(new Date());
        const title = pending.meta.originalTitle || pending.label || 'Spending';
        const category = pending.meta.originalCategory || pending.category || undefined;
        const subcategory = pending.meta.originalSubcategory || pending.subcategory || undefined;
        const notes = pending.meta.originalNotes || pending.notes || undefined;
        if (!Array.isArray((next as any).purchases)) (next as any).purchases = [];
        const purchase: any = {
          id: uid(),
          title,
          amountCents,
          dateISO: todayISO,
          createdAt: nowIso(),
          category,
          subcategory,
          notes,
          applyToSnapshot: false,
          paymentSource,
          paymentTargetId
        };
        // Carry split info from pending outbound so rewards use full amount
        if (typeof pending.splitTotalCents === 'number' && typeof pending.myPortionCents === 'number') {
          purchase.isSplit = true;
          purchase.splitTotalCents = pending.splitTotalCents;
          purchase.splitMyPortionCents = pending.myPortionCents;
          purchase.originalTotal = pending.splitTotalCents;
          if (paymentSource === 'card' || (paymentSource as string) === 'credit_card') {
            purchase.splitSnapshot = {
              amountCents: pending.splitTotalCents,
              paymentSource,
              paymentTargetId
            };
          }
        }
        (next as any).purchases.push(purchase);
      };

      // Inbound deposit to HYSA (manual pending inbound with depositTo === 'hysa').
      if (kind === 'in' && item.targetInvestingAccountId && amount > 0) {
        let inv = loadInvesting();
        inv = accrueHysaAccounts(inv);
        const idx = inv.accounts.findIndex((a: any) => a.id === item.targetInvestingAccountId && a.type === 'hysa');
        if (idx !== -1) {
          const acc = inv.accounts[idx] as any;
          const newBalanceCents = (acc.balanceCents || 0) + amount;
          const subBucket = item.meta?.hysaSubBucket ?? 'liquid';
          const now = Date.now();
          let updated = recordHysaBalanceEvent(acc, now, newBalanceCents);
          if (subBucket === 'reserved') {
            updated = { ...updated, reservedSavingsCents: (acc.reservedSavingsCents || 0) + amount };
          }
          inv.accounts = inv.accounts.slice(0, idx).concat([{ ...updated, lastAccruedAt: now }], inv.accounts.slice(idx + 1));
          saveInvesting(inv);
          markRecurringInstanceHandledIfPresent(item);
          next.pendingIn = next.pendingIn.filter((p) => p.id !== id);
          saveData(next);
          set({ data: next });
          return { needsBankSelection: false };
        }
      }

      if (kind === 'in' && item.targetBankId) {
        const bank = next.banks.find((b) => b.id === item.targetBankId);
        if (bank) {
          bank.balanceCents = (bank.balanceCents || 0) + amount;
          bank.updatedAt = nowIso();
        }
        markRecurringInstanceHandledIfPresent(item);
        next.pendingIn = next.pendingIn.filter((p) => p.id !== id);
        // Investing transfer: HYSA/General -> Bank
        if (item.meta && item.meta.kind === 'transfer' && item.meta.investingType && item.meta.investingAccountId) {
          let inv = loadInvesting();
          inv = accrueHysaAccounts(inv);
          const idx = inv.accounts.findIndex(
            (a: any) => a.id === item.meta!.investingAccountId && (a.type === item.meta!.investingType)
          );
          if (idx !== -1) {
            const acc = inv.accounts[idx] as any;
            const newBalanceCents = Math.max(0, (acc.balanceCents || 0) - amount);
            if (acc.type === 'hysa') {
              const now = Date.now();
              let updated = recordHysaBalanceEvent(acc, now, newBalanceCents);
              const subBucket = item.meta!.hysaSubBucket;
              if (subBucket === 'reserved') {
                updated = { ...updated, reservedSavingsCents: Math.max(0, (acc.reservedSavingsCents || 0) - amount) };
              }
              inv.accounts = inv.accounts.slice(0, idx).concat([{ ...updated, lastAccruedAt: now }], inv.accounts.slice(idx + 1));
            } else {
              acc.balanceCents = newBalanceCents;
            }
            saveInvesting(inv);
          }
        }
        saveData(next);
        set({ data: next });
        return { needsBankSelection: false };
      }

      // Enforce: inbound cannot be applied to a credit card unless isRefund=true (even if UI is bypassed).
      const refundAllowed = Boolean(item.isRefund) || Boolean(resolved.isRefund);
      const targetCardId = (resolved.targetCardId || item.targetCardId) as string | undefined;
      if (kind === 'in' && refundAllowed && targetCardId) {
        const card = next.cards.find((c) => c.id === targetCardId);
        if (card) {
          card.balanceCents = (card.balanceCents || 0) - amount;
          card.updatedAt = nowIso();
        }
        markRecurringInstanceHandledIfPresent(item);
        next.pendingIn = next.pendingIn.filter((p) => p.id !== id);
        saveData(next);
        set({ data: next });
        return { needsBankSelection: false };
      }

      if (kind === 'out' && item.outboundType === 'cc_payment') {
        const card = next.cards.find((c) => c.id === item.targetCardId);
        if (!card) {
          markRecurringInstanceHandledIfPresent(item);
          next.pendingOut = next.pendingOut.filter((p) => p.id !== id);
          saveData(next);
          set({ data: next });
          return { needsBankSelection: false };
        }
        if (typeof card.balanceCents === 'number' && card.balanceCents < 0) {
          return { needsBankSelection: false };
        }

        // Source can be either a bank (classic transfer) or HYSA (HYSA -> credit card payment).
        if (item.paymentSource === 'hysa' && item.paymentTargetId) {
          let inv = loadInvesting();
          inv = accrueHysaAccounts(inv);
          const idx = inv.accounts.findIndex((a: any) => a.id === item.paymentTargetId && a.type === 'hysa');
          if (idx === -1) {
            markRecurringInstanceHandledIfPresent(item);
            next.pendingOut = next.pendingOut.filter((p) => p.id !== id);
            saveData(next);
            set({ data: next });
            return { needsBankSelection: false };
          }

          const acc = inv.accounts[idx] as any;
          const newBalanceCents = Math.max(0, (acc.balanceCents || 0) - amount);
          const subBucket: 'liquid' | 'reserved' = item.meta?.hysaSubBucket === 'reserved' ? 'reserved' : 'liquid';
          const now = Date.now();
          let updated = recordHysaBalanceEvent(acc, now, newBalanceCents);
          if (subBucket === 'reserved') {
            updated = { ...updated, reservedSavingsCents: Math.max(0, (acc.reservedSavingsCents || 0) - amount) };
          }
          inv.accounts = inv.accounts.slice(0, idx).concat([{ ...updated, lastAccruedAt: now }], inv.accounts.slice(idx + 1));
          saveInvesting(inv);
        } else {
          const bank = next.banks.find((b) => b.id === item.sourceBankId);
          if (!bank) {
            markRecurringInstanceHandledIfPresent(item);
            next.pendingOut = next.pendingOut.filter((p) => p.id !== id);
            saveData(next);
            set({ data: next });
            return { needsBankSelection: false };
          }
          bank.balanceCents = (bank.balanceCents || 0) - amount;
          bank.updatedAt = nowIso();
        }

        card.balanceCents = (card.balanceCents || 0) - amount;
        card.updatedAt = nowIso();
        markRecurringInstanceHandledIfPresent(item);
        next.pendingOut = next.pendingOut.filter((p) => p.id !== id);
        // Purchases don't have a dedicated HYSA source, so map HYSA-paid credit card transfers to "cash" for any optional add-to-spending behavior.
        addSpendingFromPendingIfNeeded(item, item.paymentSource === 'hysa' ? 'cash' : 'bank', item.paymentSource === 'hysa' ? undefined : item.sourceBankId);
        saveData(next);
        set({ data: next });
        return { needsBankSelection: false };
      }

      // Recurring outbound with HYSA as payment source: deduct from HYSA (and selected sub-bucket).
      const hysaSourceAccountId =
        item.paymentSource === 'hysa' && item.paymentTargetId
          ? item.paymentTargetId
          : item.meta?.recurringHysaSource?.investingAccountId;
      if (kind === 'out' && hysaSourceAccountId && amount > 0) {
        let inv = loadInvesting();
        inv = accrueHysaAccounts(inv);
        const idx = inv.accounts.findIndex((a: any) => a.id === hysaSourceAccountId && a.type === 'hysa');
        if (idx !== -1) {
          const acc = inv.accounts[idx] as any;
          const newBalanceCents = Math.max(0, (acc.balanceCents || 0) - amount);
          const subBucket = item.meta?.recurringHysaSource?.hysaSubBucket ?? item.meta?.hysaSubBucket ?? 'liquid';
          const now = Date.now();
          let updated = recordHysaBalanceEvent(acc, now, newBalanceCents);
          if (subBucket === 'reserved') {
            updated = { ...updated, reservedSavingsCents: Math.max(0, (acc.reservedSavingsCents || 0) - amount) };
          }
          inv.accounts = inv.accounts.slice(0, idx).concat([{ ...updated, lastAccruedAt: now }], inv.accounts.slice(idx + 1));
          saveInvesting(inv);
          markRecurringInstanceHandledIfPresent(item);
          next.pendingOut = next.pendingOut.filter((p) => p.id !== id);
          addSpendingFromPendingIfNeeded(item, 'bank', next.banks[0]?.id || '');
          saveData(next);
          set({ data: next });
          return { needsBankSelection: false };
        }
      }

      // Standard in/out uses bank selection when multiple banks exist.
      if (!next.banks.length) {
        if (kind === 'in') next.pendingIn = next.pendingIn.filter((p) => p.id !== id);
        else next.pendingOut = next.pendingOut.filter((p) => p.id !== id);
        saveData(next);
        set({ data: next });
        return { needsBankSelection: false };
      }

      // For standard outbound, allow either bank or credit card as the payment source.
      if (kind === 'out' && resolved.targetCardId) {
        const card = next.cards.find((c) => c.id === resolved.targetCardId);
        if (card) {
          card.balanceCents = (card.balanceCents || 0) + amount;
          card.updatedAt = nowIso();
        }
        markRecurringInstanceHandledIfPresent(item);
        next.pendingOut = next.pendingOut.filter((p) => p.id !== id);
        addSpendingFromPendingIfNeeded(item, 'card', resolved.targetCardId);
        saveData(next);
        set({ data: next });
        return { needsBankSelection: false };
      }

      const resolvedBankId = resolved.bankId || (next.banks.length === 1 ? next.banks[0].id : '');
      if (!resolvedBankId) return { needsBankSelection: true };

      const bank = next.banks.find((b) => b.id === resolvedBankId) || next.banks[0];
      bank.balanceCents = kind === 'in' ? (bank.balanceCents || 0) + amount : (bank.balanceCents || 0) - amount;
      bank.updatedAt = nowIso();
      markRecurringInstanceHandledIfPresent(item);
      if (kind === 'in') next.pendingIn = next.pendingIn.filter((p) => p.id !== id);
      else {
        next.pendingOut = next.pendingOut.filter((p) => p.id !== id);
        addSpendingFromPendingIfNeeded(item, 'bank', bank.id);
      }
      setLastPostedBankId(kind, bank.id);

      // Investing transfer: Bank -> HYSA/General
      if (kind === 'out' && item.meta && item.meta.kind === 'transfer' && item.meta.investingType && item.meta.investingAccountId) {
        let inv = loadInvesting();
        inv = accrueHysaAccounts(inv);
        const idx = inv.accounts.findIndex(
          (a: any) => a.id === item.meta!.investingAccountId && (a.type === item.meta!.investingType)
        );
        if (idx !== -1) {
          const acc = inv.accounts[idx] as any;
          const newBalanceCents = (acc.balanceCents || 0) + amount;
          if (acc.type === 'hysa') {
            const now = Date.now();
            let updated = recordHysaBalanceEvent(acc, now, newBalanceCents);
            const subBucket = item.meta!.hysaSubBucket;
            if (subBucket === 'reserved') {
              updated = { ...updated, reservedSavingsCents: (acc.reservedSavingsCents || 0) + amount };
            }
            inv.accounts = inv.accounts.slice(0, idx).concat([{ ...updated, lastAccruedAt: now }], inv.accounts.slice(idx + 1));
          } else {
            acc.balanceCents = newBalanceCents;
          }
          saveInvesting(inv);
        }
      }

      saveData(next);
      set({ data: next });
      return { needsBankSelection: false };
    }
  }
}));

export function persistData(next: LedgerData) {
  saveData(next);
  useLedgerStore.setState({ data: next });
}

