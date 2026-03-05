import { create } from 'zustand';
import type { LedgerData, PendingInboundItem, PendingOutboundItem } from './models';
import { loadData, nowIso, saveData, setLastPostedBankId, uid } from './storage';

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
    deletePending: (kind: 'in' | 'out', id: string) => void;
    clearPending: (kind: 'in' | 'out') => void;
    markPendingPosted: (kind: 'in' | 'out', id: string, bankId?: string) => { needsBankSelection: boolean };
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
    markPendingPosted: (kind, id, bankId) => {
      const current = get().data;
      const next = structuredClone(current) as LedgerData;
      const list = kind === 'in' ? next.pendingIn : next.pendingOut;
      const idx = list.findIndex((p) => p.id === id);
      if (idx === -1) return { needsBankSelection: false };
      const item: any = list[idx];
      const amount = item.amountCents || 0;

      if (kind === 'in' && item.targetBankId) {
        const bank = next.banks.find((b) => b.id === item.targetBankId);
        if (bank) {
          bank.balanceCents = (bank.balanceCents || 0) + amount;
          bank.updatedAt = nowIso();
        }
        next.pendingIn = next.pendingIn.filter((p) => p.id !== id);
        saveData(next);
        set({ data: next });
        return { needsBankSelection: false };
      }

      if (kind === 'in' && item.isRefund && item.targetCardId) {
        const card = next.cards.find((c) => c.id === item.targetCardId);
        if (card) {
          card.balanceCents = (card.balanceCents || 0) - amount;
          card.updatedAt = nowIso();
        }
        next.pendingIn = next.pendingIn.filter((p) => p.id !== id);
        saveData(next);
        set({ data: next });
        return { needsBankSelection: false };
      }

      if (kind === 'out' && item.outboundType === 'cc_payment') {
        const bank = next.banks.find((b) => b.id === item.sourceBankId);
        const card = next.cards.find((c) => c.id === item.targetCardId);
        if (!bank || !card) {
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

      const resolvedBankId = bankId || (next.banks.length === 1 ? next.banks[0].id : '');
      if (!resolvedBankId) return { needsBankSelection: true };

      const bank = next.banks.find((b) => b.id === resolvedBankId) || next.banks[0];
      bank.balanceCents = kind === 'in' ? (bank.balanceCents || 0) + amount : (bank.balanceCents || 0) - amount;
      bank.updatedAt = nowIso();
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

