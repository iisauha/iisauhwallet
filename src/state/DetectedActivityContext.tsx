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
  items: DetectedActivityItem[];
  setItems: (items: DetectedActivityItem[] | ((prev: DetectedActivityItem[]) => DetectedActivityItem[])) => void;
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
  const [items, setItemsState] = useState<DetectedActivityItem[]>(loadDetectedActivity);
  const [launchFlow, setLaunchFlow] = useState<LaunchFlow | null>(null);

  const setItems = useCallback((updater: DetectedActivityItem[] | ((prev: DetectedActivityItem[]) => DetectedActivityItem[])) => {
    setItemsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveDetectedActivity(next);
      return next;
    });
  }, []);

  const markResolved = useCallback((id: string) => {
    setItemsState((prev) => {
      const next = prev.map((i) => (i.id === id ? { ...i, status: 'resolved' as const } : i));
      saveDetectedActivity(next);
      return next;
    });
    setLaunchFlow(null);
  }, []);

  const markIgnored = useCallback((id: string) => {
    setItemsState((prev) => {
      const next = prev.map((i) => (i.id === id ? { ...i, status: 'ignored' as const } : i));
      saveDetectedActivity(next);
      return next;
    });
    setLaunchFlow(null);
  }, []);

  const refresh = useCallback(() => {
    setItemsState(loadDetectedActivity());
  }, []);

  const value = useMemo<ContextValue>(
    () => ({
      items,
      setItems,
      launchFlow,
      setLaunchFlow,
      markResolved,
      markIgnored,
      refresh
    }),
    [items, setItems, launchFlow, markResolved, markIgnored, refresh]
  );

  return (
    <DetectedActivityContext.Provider value={value}>
      {children}
    </DetectedActivityContext.Provider>
  );
}
