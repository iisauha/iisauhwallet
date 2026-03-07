import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  loadDetectedActivity,
  saveDetectedActivity,
  type DetectedActivityItem
} from './detectedActivity';

export type LaunchFlowType = 'add_purchase' | 'pending_in' | 'pending_out' | 'transfer';

export type LaunchFlow = {
  flow: LaunchFlowType;
  detectedId: string;
  item: DetectedActivityItem;
};

type ContextValue = {
  /** Merged list: local (mock) + backend (Plaid sandbox). */
  items: DetectedActivityItem[];
  setItems: (items: DetectedActivityItem[] | ((prev: DetectedActivityItem[]) => DetectedActivityItem[])) => void;
  /** Backend-sourced items only (in-memory). Updated after sync. */
  backendItems: DetectedActivityItem[];
  setBackendItems: (items: DetectedActivityItem[] | ((prev: DetectedActivityItem[]) => DetectedActivityItem[])) => void;
  launchFlow: LaunchFlow | null;
  setLaunchFlow: (f: LaunchFlow | null) => void;
  markResolved: (id: string, resolvedAs?: string) => void;
  markIgnored: (id: string) => void;
  markReopened: (id: string) => void;
  refresh: () => void;
  loadBackendItems: () => Promise<void>;
};

const DetectedActivityContext = createContext<ContextValue | null>(null);

export function useDetectedActivity(): ContextValue {
  const ctx = useContext(DetectedActivityContext);
  if (!ctx) throw new Error('useDetectedActivity must be used within DetectedActivityProvider');
  return ctx;
}

export function useDetectedActivityOptional(): ContextValue | null {
  return useContext(DetectedActivityContext);
}

function apiItemToDetected(a: {
  id: string;
  title: string;
  amountCents: number;
  dateISO: string;
  accountName: string;
  accountType: string;
  pending: boolean;
  status: string;
  suggestedAction?: string;
  possibleTransferMatchId?: string;
  updatedFromPending?: boolean;
}): DetectedActivityItem {
  return {
    id: a.id,
    title: a.title,
    amountCents: a.amountCents,
    dateISO: a.dateISO,
    accountName: a.accountName,
    accountType: a.accountType,
    pending: a.pending,
    status: (a.status as DetectedActivityItem['status']) || 'new',
    suggestedAction: a.suggestedAction as DetectedActivityItem['suggestedAction'],
    possibleTransferMatchId: a.possibleTransferMatchId,
    updatedFromPending: a.updatedFromPending,
  };
}

export function DetectedActivityProvider({ children }: { children: React.ReactNode }) {
  const [localItems, setLocalItemsState] = useState<DetectedActivityItem[]>(loadDetectedActivity);
  const [backendItems, setBackendItemsState] = useState<DetectedActivityItem[]>([]);
  const [launchFlow, setLaunchFlow] = useState<LaunchFlow | null>(null);

  const loadBackendItems = useCallback(async () => {
    const api = await import('../api/detectedActivityApi');
    if (!api.hasApiBase()) return;
    try {
      const { items: list } = await api.getDetectedActivity();
      setBackendItemsState(list.map(apiItemToDetected));
    } catch (_) {}
  }, []);

  React.useEffect(() => {
    loadBackendItems();
  }, [loadBackendItems]);

  const items = useMemo(
    () => [...localItems, ...backendItems],
    [localItems, backendItems]
  );

  const setItems = useCallback((updater: DetectedActivityItem[] | ((prev: DetectedActivityItem[]) => DetectedActivityItem[])) => {
    setLocalItemsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveDetectedActivity(next);
      return next;
    });
  }, []);

  const setBackendItems = useCallback((updater: DetectedActivityItem[] | ((prev: DetectedActivityItem[]) => DetectedActivityItem[])) => {
    setBackendItemsState((prev) => (typeof updater === 'function' ? updater(prev) : updater));
  }, []);

  const markResolved = useCallback((id: string, resolvedAs?: string) => {
    if (id.startsWith('plaid_')) {
      setBackendItemsState((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: 'resolved' as const } : i))
      );
      setLaunchFlow(null);
      import('../api/detectedActivityApi').then((api) => api.resolveDetectedItem(id, resolvedAs).catch(() => {}));
    } else {
      setLocalItemsState((prev) => {
        const next = prev.map((i) => (i.id === id ? { ...i, status: 'resolved' as const } : i));
        saveDetectedActivity(next);
        return next;
      });
      setLaunchFlow(null);
    }
  }, []);

  const markIgnored = useCallback((id: string) => {
    if (id.startsWith('plaid_')) {
      setBackendItemsState((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: 'ignored' as const } : i))
      );
      setLaunchFlow(null);
      import('../api/detectedActivityApi').then((api) => api.ignoreDetectedItem(id).catch(() => {}));
    } else {
      setLocalItemsState((prev) => {
        const next = prev.map((i) => (i.id === id ? { ...i, status: 'ignored' as const } : i));
        saveDetectedActivity(next);
        return next;
      });
      setLaunchFlow(null);
    }
  }, []);

  const markReopened = useCallback((id: string) => {
    if (id.startsWith('plaid_')) {
      setBackendItemsState((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: 'new' as const } : i))
      );
      import('../api/detectedActivityApi').then((api) => api.resetDetectedItem(id).catch(() => {}));
    } else {
      setLocalItemsState((prev) => {
        const next = prev.map((i) => (i.id === id ? { ...i, status: 'new' as const } : i));
        saveDetectedActivity(next);
        return next;
      });
    }
  }, []);

  const refresh = useCallback(() => {
    setLocalItemsState(loadDetectedActivity());
  }, []);

  const value = useMemo<ContextValue>(
    () => ({
      items,
      setItems,
      backendItems,
      setBackendItems,
      launchFlow,
      setLaunchFlow,
      markResolved,
      markIgnored,
      markReopened,
      refresh,
      loadBackendItems,
    }),
    [items, setItems, backendItems, setBackendItems, launchFlow, markResolved, markIgnored, markReopened, refresh, loadBackendItems]
  );

  return (
    <DetectedActivityContext.Provider value={value}>
      {children}
    </DetectedActivityContext.Provider>
  );
}
