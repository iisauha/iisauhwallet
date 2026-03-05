import { create } from 'zustand';
import type { LedgerData, PendingInboundItem, PendingOutboundItem, Purchase, RecurringItem } from './models';
import { loadData, loadSubTracker, nowIso, saveData, saveSubTracker, setLastPostedBankId, uid } from './storage';
import { PHYSICAL_CASH_ID } from './keys';
import { addDaysLocal, addMonthsPreserveDay, addYearsPreserveDay, parseLocalDateKey, recurringIntervalDays, toLocalDateKey } from './calc';

export interface LedgerState {
  data: LedgerData;
  actions: {
    reload: () => void;
    addBankAccount: (name: string) => void;
    deleteBankAccount: (id: string) => void;
    addCreditCard: (name: string) => void;
    deleteCreditCard: (id: string) => void;
    updateBankBalance: (id: string, amountCents: number, mode: 'add' | 'set') => void;
    updateCardBalance: (id: string, amountCents: number, mode: 'add' | 'set') => void;
    addPendingInbound: (item: Omit<PendingInboundItem, 'id' | 'createdAt'>) => void;
    addPendingOutbound: (item: Omit<PendingOutboundItem, 'id' | 'createdAt'>) => void;
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
      opts?: { bankId?: string; isRefund?: boolean; targetCardId?: string }
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
    deleteBankAccount: (id) => {
      const next = structuredClone(get().data) as LedgerData;
      next.banks = next.banks.filter((b) => b.id !== id && b.type !== 'physical_cash');
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
      const next = structuredClone(get().data) as LedgerData;
      next.cards = next.cards.filter((c) => c.id !== id);
      saveData(next);
      set({ data: next });
    },
    updateBankBalance: (id, amountCents, mode) => {
      const next = structuredClone(get().data) as LedgerData;
      const bank = next.banks.find((b) => b.id === id);
      if (!bank) return;
      bank.balanceCents = mode === 'set' ? amountCents : (bank.balanceCents || 0) + amountCents;
      bank.updatedAt = nowIso();
      saveData(next);
      set({ data: next });
    },
    updateCardBalance: (id, amountCents, mode) => {
      const next = structuredClone(get().data) as LedgerData;
      const card = next.cards.find((c) => c.id === id);
      if (!card) return;
      card.balanceCents = mode === 'set' ? amountCents : (card.balanceCents || 0) + amountCents;
      card.updatedAt = nowIso();
      saveData(next);
      set({ data: next });
    },
    addPendingInbound: (item) => {
      const next = structuredClone(get().data) as LedgerData;
      next.pendingIn.push({ ...item, id: uid(), createdAt: nowIso() });
      saveData(next);
      set({ data: next });
    },
    addPendingOutbound: (item) => {
      const next = structuredClone(get().data) as LedgerData;
      next.pendingOut.push({ ...item, id: uid(), createdAt: nowIso() });
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

      // Roll back snapshot effects of the old purchase (mirror deletePurchase logic).
      const appliedOld = !!oldP.applyToSnapshot && !!oldP.paymentSource;
      if (appliedOld) {
        const isSplitApplied = !!oldP.isSplit && oldP.splitSnapshot && typeof oldP.splitSnapshot.amountCents === 'number';
        const amount = isSplitApplied
          ? oldP.splitSnapshot.amountCents
          : typeof oldP.amountCents === 'number'
            ? oldP.amountCents
            : 0;
        const src = isSplitApplied && oldP.splitSnapshot.paymentSource ? oldP.splitSnapshot.paymentSource : oldP.paymentSource;
        const targetId = isSplitApplied && oldP.splitSnapshot.paymentTargetId
          ? oldP.splitSnapshot.paymentTargetId
          : oldP.paymentTargetId;

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

      // Remove any split-generated pending inbound for the old purchase.
      if (oldP.isSplit && oldP.splitPendingId && Array.isArray(next.pendingIn)) {
        next.pendingIn = next.pendingIn.filter((pi: any) => pi.id !== oldP.splitPendingId);
      }

      // Roll back SUB tracker effects of the old purchase (mirror deletePurchase logic).
      try {
        const isCardOld =
          oldP.applyToSnapshot && (oldP.paymentSource === 'card' || oldP.paymentSource === 'credit_card') && oldP.paymentTargetId;
        const deltaOld = typeof oldP.amountCents === 'number' ? oldP.amountCents : 0;
        if (isCardOld && deltaOld > 0) {
          const targetId = String(oldP.paymentTargetId || '');
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
            const nextSpend = Math.max(0, prev - deltaOld);
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

      // Apply updated purchase (mirror addPurchase logic, but keep same id).
      const p: any = { ...updated, id };

      // If split purchase with inbound reimbursement, create pending inbound item.
      if (p.isSplit && typeof p.splitInboundCents === 'number' && p.splitInboundCents > 0) {
        const pendingId = uid();
        const label = 'Venmo - "' + (p.title || 'Purchase') + '"';
        next.pendingIn.push({
          id: pendingId,
          label,
          amountCents: p.splitInboundCents,
          createdAt: nowIso(),
          linkedPurchaseId: id,
          fromSplit: true
        });
        p.splitPendingId = pendingId;
      }

      // Apply to snapshot for updated purchase.
      const appliedNew = !!p.applyToSnapshot && !!p.paymentSource;
      if (appliedNew) {
        const isSplitAppliedNew = !!p.isSplit && p.splitSnapshot && typeof p.splitSnapshot.amountCents === 'number';
        const amountNew = isSplitAppliedNew
          ? p.splitSnapshot.amountCents
          : typeof p.amountCents === 'number'
            ? p.amountCents
            : 0;
        const srcNew = isSplitAppliedNew && p.splitSnapshot.paymentSource ? p.splitSnapshot.paymentSource : p.paymentSource;
        const targetIdNew = isSplitAppliedNew && p.splitSnapshot.paymentTargetId
          ? p.splitSnapshot.paymentTargetId
          : p.paymentTargetId;

        if ((srcNew === 'card' || srcNew === 'credit_card') && targetIdNew) {
          const card = next.cards.find((c) => c.id === targetIdNew);
          if (card) {
            card.balanceCents = (card.balanceCents || 0) + amountNew;
            card.updatedAt = nowIso();
          }
        } else if ((srcNew === 'bank' || srcNew === 'cash') && (targetIdNew || srcNew === 'cash')) {
          const bankTargetIdNew = targetIdNew || PHYSICAL_CASH_ID;
          const bank = next.banks.find((b) => b.id === bankTargetIdNew);
          if (bank) {
            bank.balanceCents = (bank.balanceCents || 0) - amountNew;
            bank.updatedAt = nowIso();
          }
        }
      }

      // SUB tracker for updated purchase.
      try {
        const isCardNew =
          p.applyToSnapshot && (p.paymentSource === 'card' || p.paymentSource === 'credit_card') && p.paymentTargetId;
        const deltaNew = typeof p.amountCents === 'number' ? p.amountCents : 0;
        if (isCardNew && deltaNew > 0) {
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
            const nextSpend = (typeof e.spendCents === 'number' ? e.spendCents : 0) + deltaNew;
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

      next.purchases[idx] = p;
      saveData(next);
      set({ data: next });
    },
    addPurchase: (purchase) => {
      const next = structuredClone(get().data) as LedgerData;
      const id = uid();
      const p: any = { ...purchase, id };
      const normalize = (s: unknown) => (typeof s === 'string' ? s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : '');

      // If split purchase with inbound reimbursement, create pending inbound item (legacy behavior).
      if (p.isSplit && typeof p.splitInboundCents === 'number' && p.splitInboundCents > 0) {
        const pendingId = uid();
        const label = 'Venmo - "' + (p.title || 'Purchase') + '"';
        next.pendingIn.push({
          id: pendingId,
          label,
          amountCents: p.splitInboundCents,
          createdAt: nowIso(),
          linkedPurchaseId: id,
          fromSplit: true
        });
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
        }
      }

      // SUB tracker: track spend on applied card purchases (uses user's portion, not split total),
      // and guard against double counting by tracking applied purchase IDs.
      try {
        const isCard = p.applyToSnapshot && (p.paymentSource === 'card' || p.paymentSource === 'credit_card') && p.paymentTargetId;
        const delta = typeof p.amountCents === 'number' ? p.amountCents : 0;
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
        const delta = typeof p.amountCents === 'number' ? p.amountCents : 0;
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

      next.recurring.forEach((r: any) => {
        if (!r || !r.active || !r.autoPay) return;
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
            const fullAmountCents =
              r.expectedMinCents != null && r.expectedMaxCents != null
                ? Math.round((r.expectedMinCents + r.expectedMaxCents) / 2)
                : typeof r.amountCents === 'number'
                  ? r.amountCents
                  : 0;
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
      const next = structuredClone(get().data) as LedgerData;
      if (kind === 'in') next.pendingIn = next.pendingIn.filter((p) => p.id !== id);
      else next.pendingOut = next.pendingOut.filter((p) => p.id !== id);
      saveData(next);
      set({ data: next });
    },
    clearPending: (kind) => {
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

      if (kind === 'in' && item.targetBankId) {
        const bank = next.banks.find((b) => b.id === item.targetBankId);
        if (bank) {
          bank.balanceCents = (bank.balanceCents || 0) + amount;
          bank.updatedAt = nowIso();
        }
        markRecurringInstanceHandledIfPresent(item);
        next.pendingIn = next.pendingIn.filter((p) => p.id !== id);
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
        const bank = next.banks.find((b) => b.id === item.sourceBankId);
        const card = next.cards.find((c) => c.id === item.targetCardId);
        if (!bank || !card) {
          markRecurringInstanceHandledIfPresent(item);
          next.pendingOut = next.pendingOut.filter((p) => p.id !== id);
          saveData(next);
          set({ data: next });
          return { needsBankSelection: false };
        }
        if (typeof card.balanceCents === 'number' && card.balanceCents < 0) {
          return { needsBankSelection: false };
        }
        bank.balanceCents = (bank.balanceCents || 0) - amount;
        card.balanceCents = (card.balanceCents || 0) - amount;
        bank.updatedAt = nowIso();
        card.updatedAt = nowIso();
        markRecurringInstanceHandledIfPresent(item);
        next.pendingOut = next.pendingOut.filter((p) => p.id !== id);
        saveData(next);
        set({ data: next });
        return { needsBankSelection: false };
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
      else next.pendingOut = next.pendingOut.filter((p) => p.id !== id);
      setLastPostedBankId(kind, bank.id);

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

