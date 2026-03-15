/**
 * Client-side wallet sync: build/apply payload, API calls, local sync state.
 * Uses last-write-wins; payload is full wallet state (all synced keys).
 */

const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL) || '';

const SYNC_STATE_KEY = 'iisauhwallet_sync_state_v1';
const POLL_INTERVAL_MS = 8000;

export type SyncState = {
  walletId: string | null;
  syncPaused: boolean;
  lastSyncedAt: string | null;
  deviceName: string;
};

export type SyncPayload = Record<string, unknown>;

import { SYNC_STORAGE_KEYS } from './syncKeys';

function getStorage(): Storage {
  if (typeof window === 'undefined' || !window.localStorage) throw new Error('localStorage required');
  return window.localStorage;
}

export function getSyncState(): SyncState {
  try {
    const raw = getStorage().getItem(SYNC_STATE_KEY);
    if (!raw) {
      return { walletId: null, syncPaused: false, lastSyncedAt: null, deviceName: getDefaultDeviceName() };
    }
    const parsed = JSON.parse(raw) as Partial<SyncState>;
    return {
      walletId: parsed.walletId ?? null,
      syncPaused: parsed.syncPaused ?? false,
      lastSyncedAt: parsed.lastSyncedAt ?? null,
      deviceName: parsed.deviceName ?? getDefaultDeviceName(),
    };
  } catch {
    return { walletId: null, syncPaused: false, lastSyncedAt: null, deviceName: getDefaultDeviceName() };
  }
}

function getDefaultDeviceName(): string {
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    const ua = navigator.userAgent;
    if (/\b(iPhone|iPad|iPod)\b/i.test(ua)) return 'Phone';
    if (/\b(Android)\b/i.test(ua)) return 'Phone';
    if (/\b(Macintosh|Mac OS)\b/i.test(ua)) return 'Laptop';
    if (/\b(Windows)\b/i.test(ua)) return 'PC';
  }
  return 'This device';
}

export function saveSyncState(state: SyncState): void {
  getStorage().setItem(SYNC_STATE_KEY, JSON.stringify(state));
}

/** Build full wallet payload from localStorage (all SYNC_STORAGE_KEYS). */
export function buildSyncPayload(): SyncPayload {
  const storage = getStorage();
  const payload: SyncPayload = {};
  for (const k of SYNC_STORAGE_KEYS) {
    try {
      const v = storage.getItem(k);
      if (v !== null) payload[k] = v;
    } catch (_) {
      // skip
    }
  }
  return payload;
}

/** Apply remote payload to localStorage. Values are stored as strings (JSON stringified if object). */
export function applySyncPayload(payload: SyncPayload): void {
  const storage = getStorage();
  for (const [k, v] of Object.entries(payload)) {
    try {
      if (v === undefined || v === null) continue;
      if (typeof v === 'string') storage.setItem(k, v);
      else storage.setItem(k, JSON.stringify(v));
    } catch (_) {
      // skip key
    }
  }
}

/** Create sync code (source device). Uploads current state and returns pairing code. */
export async function createSyncCode(): Promise<{ walletId: string; pairingCode: string }> {
  const payload = buildSyncPayload();
  const res = await fetch(`${API_BASE}/api/sync/create-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || 'Failed to create sync code');
  }
  const data = await res.json();
  return { walletId: data.walletId, pairingCode: data.pairingCode };
}

/** Join with pairing code. Returns wallet payload and walletId; caller must apply payload and saveSyncState. */
export async function joinWithCode(
  pairingCode: string
): Promise<{ walletId: string; payload: SyncPayload; updatedAt: string }> {
  const res = await fetch(`${API_BASE}/api/sync/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairingCode: String(pairingCode).trim() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || 'Invalid or expired code');
  }
  const data = await res.json();
  return { walletId: data.walletId, payload: data.payload || {}, updatedAt: data.updatedAt || new Date().toISOString() };
}

/** Get remote wallet state. */
export async function fetchWallet(walletId: string): Promise<{ payload: SyncPayload; updatedAt: string } | null> {
  const res = await fetch(`${API_BASE}/api/sync/wallet/${encodeURIComponent(walletId)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return { payload: data.payload || {}, updatedAt: data.updatedAt || '' };
}

/** Push current local state to remote (last-write-wins). */
export async function pushWallet(walletId: string): Promise<string> {
  const payload = buildSyncPayload();
  const res = await fetch(`${API_BASE}/api/sync/wallet/${encodeURIComponent(walletId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || 'Failed to push');
  }
  const data = await res.json();
  return data.updatedAt || new Date().toISOString();
}

export function getPollIntervalMs(): number {
  return POLL_INTERVAL_MS;
}
