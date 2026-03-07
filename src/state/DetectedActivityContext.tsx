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
  markResolved: (id: string) => void;
  markIgnored: (id: string) => void;
  refresh: () => void;
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

export function DetectedActivityProvider({ children }: { children: React.ReactNode }) {
  const [localItems, setLocalItemsState] = useState<DetectedActivityItem[]>(loadDetectedActivity);
  const [backendItems, setBackendItemsState] = useState<DetectedActivityItem[]>([]);
  const [launchFlow, setLaunchFlow] = useState<LaunchFlow | null>(null);

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

  const markResolved = useCallback((id: string) => {
    if (id.startsWith('plaid_')) {
      setBackendItemsState((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: 'resolved' as const } : i))
      );
      setLaunchFlow(null);
      // Optionally call API to persist; avoid blocking UI
      import('../api/detectedActivityApi').then((api) => api.resolveDetectedItem(id).catch(() => {}));
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
      refresh
    }),
    [items, setItems, backendItems, setBackendItems, launchFlow, markResolved, markIgnored, refresh]
  );

  return (
    <DetectedActivityContext.Provider value={value}>
      {children}
    </DetectedActivityContext.Provider>
  );
}
