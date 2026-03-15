/**
 * Device sync context: state, create/join/pause/resume/disconnect, push on persist, poll for remote.
 * On remote apply: write to localStorage, reload ledger store, dispatch event for other stores to re-read.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  getSyncState,
  saveSyncState,
  applySyncPayload,
  createSyncCode as apiCreateCode,
  joinWithCode as apiJoinWithCode,
  pushWallet,
  fetchWallet,
  getPollIntervalMs,
  type SyncState,
  type SyncPayload,
} from './walletSyncApi';

const PERSIST_EVENT = 'iisauhwallet-persist';

export type SyncContextValue = {
  syncState: SyncState;
  isCreatingCode: boolean;
  isJoining: boolean;
  isPushing: boolean;
  error: string | null;
  createSyncCode: () => Promise<{ pairingCode: string; walletId: string }>;
  joinWithCode: (code: string) => Promise<void>;
  pauseSync: () => void;
  resumeSync: () => void;
  disconnectSync: () => void;
  clearError: () => void;
  /** After remote payload applied; components can use this to re-read from localStorage. */
  lastSyncAppliedAt: number | null;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSync() {
  const ctx = useContext(SyncContext);
  return ctx;
}

/** Call this after applying remote payload so components that cache loadInvesting/loadLoans re-read. */
export function useSyncInvalidate(): number {
  const ctx = useSync();
  return ctx?.lastSyncAppliedAt ?? 0;
}

type SyncProviderProps = {
  children: React.ReactNode;
  /** Called after applying remote payload so ledger store reloads from localStorage. */
  onReloadLedger?: () => void;
};

export function SyncProvider({ children, onReloadLedger }: SyncProviderProps) {
  const [syncState, setSyncState] = useState<SyncState>(() => getSyncState());
  const [isCreatingCode, setIsCreatingCode] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAppliedAt, setLastSyncAppliedAt] = useState<number | null>(null);
  const reloadRef = useRef(onReloadLedger);
  reloadRef.current = onReloadLedger;
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const persist = useCallback(() => {
    const state = getSyncState();
    if (!state.walletId || state.syncPaused) return;
    setIsPushing(true);
    setError(null);
    pushWallet(state.walletId)
      .then((updatedAt) => {
        saveSyncState({ ...state, lastSyncedAt: updatedAt });
        setSyncState(getSyncState());
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Push failed'))
      .finally(() => setIsPushing(false));
  }, []);

  useEffect(() => {
    const handler = () => persist();
    window.addEventListener(PERSIST_EVENT, handler);
    return () => window.removeEventListener(PERSIST_EVENT, handler);
  }, [persist]);

  const poll = useCallback(() => {
    const state = getSyncState();
    if (!state.walletId || state.syncPaused) return;
    fetchWallet(state.walletId).then((remote) => {
      if (!remote) return;
      const localUpdated = state.lastSyncedAt || '0';
      if (remote.updatedAt <= localUpdated) return;
      applySyncPayload(remote.payload as SyncPayload);
      const next = { ...getSyncState(), lastSyncedAt: remote.updatedAt };
      saveSyncState(next);
      setSyncState(next);
      reloadRef.current?.();
      setLastSyncAppliedAt(Date.now());
      window.dispatchEvent(new Event('iisauhwallet-sync-applied'));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const state = getSyncState();
    if (!state.walletId || state.syncPaused) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }
    poll();
    const ms = getPollIntervalMs();
    pollTimerRef.current = setInterval(poll, ms);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [syncState.walletId, syncState.syncPaused, poll]);

  const createSyncCode = useCallback(async () => {
    setIsCreatingCode(true);
    setError(null);
    try {
      const { walletId, pairingCode } = await apiCreateCode();
      saveSyncState({
        ...getSyncState(),
        walletId,
        syncPaused: false,
        lastSyncedAt: new Date().toISOString(),
      });
      setSyncState(getSyncState());
      return { pairingCode, walletId };
    } finally {
      setIsCreatingCode(false);
    }
  }, []);

  const joinWithCode = useCallback(async (code: string) => {
    setIsJoining(true);
    setError(null);
    try {
      const result = await apiJoinWithCode(String(code).trim());
      applySyncPayload(result.payload);
      saveSyncState({
        ...getSyncState(),
        walletId: result.walletId,
        syncPaused: false,
        lastSyncedAt: result.updatedAt,
      });
      setSyncState(getSyncState());
      reloadRef.current?.();
      setLastSyncAppliedAt(Date.now());
      window.dispatchEvent(new Event('iisauhwallet-sync-applied'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Join failed');
      throw e;
    } finally {
      setIsJoining(false);
    }
  }, []);

  const pauseSync = useCallback(() => {
    const next = { ...getSyncState(), syncPaused: true };
    saveSyncState(next);
    setSyncState(next);
  }, []);

  const resumeSync = useCallback(() => {
    const next = { ...getSyncState(), syncPaused: false };
    saveSyncState(next);
    setSyncState(next);
  }, []);

  const disconnectSync = useCallback(() => {
    const next = { ...getSyncState(), walletId: null, syncPaused: false, lastSyncedAt: null };
    saveSyncState(next);
    setSyncState(next);
  }, []);

  const value: SyncContextValue = {
    syncState,
    isCreatingCode,
    isJoining,
    isPushing,
    error,
    createSyncCode,
    joinWithCode,
    pauseSync,
    resumeSync,
    disconnectSync,
    clearError: () => setError(null),
    lastSyncAppliedAt,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/** Call after any persistence so linked devices get the update. */
export function notifySyncPush(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PERSIST_EVENT));
}
