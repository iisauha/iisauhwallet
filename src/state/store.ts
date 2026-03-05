import { create } from 'zustand';
import type { LedgerData } from './models';
import { loadData, saveData } from './storage';

export interface LedgerState {
  data: LedgerData;
  actions: {
    reload: () => void;
    // write actions added in later milestones (C+)
  };
}

export const useLedgerStore = create<LedgerState>((set, get) => ({
  data: loadData(),
  actions: {
    reload: () => {
      set({ data: loadData() });
    }
  }
}));

export function persistData(next: LedgerData) {
  saveData(next);
  useLedgerStore.setState({ data: next });
}

