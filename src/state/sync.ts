/**
 * Supabase sync module — pushes/pulls E2E-encrypted data blobs.
 *
 * Architecture:
 * - localStorage remains the primary data store (offline-first)
 * - After every save, the full app state is exported, encrypted with the user's
 *   passcode, and upserted to Supabase as an opaque blob
 * - On login from a new device, the blob is fetched, decrypted, and imported
 * - The passcode never leaves the client
 */

import { supabase } from './supabase';
import { exportJSON, importJSON } from './storage';
import { encryptWithPasscode, decryptWithPasscode, encryptWithDeviceKey, decryptWithDeviceKey } from './crypto';

let _passcode: string | null = null;
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _listening = false;
let _syncing = false;
let _lastSyncedAt: string | null = null;
const _syncListeners: Set<() => void> = new Set();

const DEBOUNCE_MS = 2000;
const LAST_SYNCED_KEY = '__lastSyncedAt';

// Persist and restore last synced time
try { _lastSyncedAt = localStorage.getItem(LAST_SYNCED_KEY); } catch {}

/** Get the last successful sync timestamp (ISO string or null). */
export function getLastSyncedAt(): string | null { return _lastSyncedAt; }

/** Subscribe to sync status changes. Returns unsubscribe function. */
export function onSyncChange(fn: () => void): () => void {
  _syncListeners.add(fn);
  return () => { _syncListeners.delete(fn); };
}

function notifySyncListeners() {
  _syncListeners.forEach(fn => { try { fn(); } catch {} });
}

/** Get the current Supabase user ID, or null if not signed in. */
function getUserId(): string | null {
  // supabase.auth.getUser() is async; use the session cache for sync path
  const session = (supabase as any).auth?.['currentSession'];
  // Fallback: check localStorage for the session
  try {
    const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (storageKey) {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?.user?.id ?? null;
      }
    }
  } catch {}
  return session?.user?.id ?? null;
}

async function getAuthUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/** Push current app state to Supabase (encrypted). */
async function pushToSupabase(): Promise<boolean> {
  if (_syncing || !_passcode) return false;
  _syncing = true;
  try {
    const userId = await getAuthUserId();
    if (!userId || !_passcode) return false;

    const plaintext = exportJSON();
    const encrypted = await encryptWithPasscode(plaintext, _passcode);

    const { error } = await supabase
      .from('user_data')
      .upsert(
        {
          user_id: userId,
          encrypted_data: encrypted,
          updated_at: new Date().toISOString(),
          schema_version: 1
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('[sync] push failed:', error.message);
      return false;
    }
    _lastSyncedAt = new Date().toISOString();
    try { localStorage.setItem(LAST_SYNCED_KEY, _lastSyncedAt); } catch {}
    notifySyncListeners();

    // Save a daily snapshot (one per calendar day)
    saveDailySnapshot(userId, encrypted).catch(() => {});

    return true;
  } catch (e) {
    console.error('[sync] push error:', e);
    return false;
  } finally {
    _syncing = false;
  }
}

/** Pull app state from Supabase, decrypt, and import into localStorage. */
export async function pullFromSupabase(passcode: string): Promise<boolean> {
  try {
    const userId = await getAuthUserId();
    if (!userId) return false;

    const { data, error } = await supabase
      .from('user_data')
      .select('encrypted_data')
      .eq('user_id', userId)
      .single();

    if (error || !data?.encrypted_data) return false;

    const plaintext = await decryptWithPasscode(data.encrypted_data, passcode);
    importJSON(plaintext);
    return true;
  } catch (e) {
    console.error('[sync] pull error:', e);
    return false;
  }
}

/** Check if the user has data stored in Supabase. */
export async function hasRemoteData(): Promise<boolean> {
  try {
    const userId = await getAuthUserId();
    if (!userId) return false;
    const { data, error } = await supabase
      .from('user_data')
      .select('user_id')
      .eq('user_id', userId)
      .single();
    return !error && !!data;
  } catch {
    return false;
  }
}

/** Schedule a debounced push after data changes. */
function schedulePush() {
  if (!_passcode) return;
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    pushToSupabase();
  }, DEBOUNCE_MS);
}

function onDataChanged() {
  schedulePush();
}

/**
 * Start syncing. Call after passcode unlock.
 * - Stores passcode in memory for encryption
 * - Listens for data-changed events to auto-push
 * - If localStorage has data, does initial push to ensure remote is current
 */
export function initSync(passcode: string) {
  _passcode = passcode;
  if (!_listening) {
    window.addEventListener('data-changed', onDataChanged);
    _listening = true;
  }
  // Initial push to sync local → remote
  setTimeout(() => pushToSupabase(), 500);
}

/**
 * Stop syncing. Call on lock or sign-out.
 */
export function stopSync() {
  _passcode = null;
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
  if (_listening) {
    window.removeEventListener('data-changed', onDataChanged);
    _listening = false;
  }
}

/**
 * Force an immediate sync (e.g., after passcode change).
 */
export async function forceSyncToSupabase(passcode: string): Promise<boolean> {
  _passcode = passcode;
  return pushToSupabase();
}

// ── Snapshot (version history) ──────────────────────────────────────────

const SNAPSHOT_DAY_KEY = '__lastSnapshotDay';

/** Save a snapshot if we haven't already saved one today. */
async function saveDailySnapshot(userId: string, encrypted: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  try {
    const lastDay = localStorage.getItem(SNAPSHOT_DAY_KEY);
    if (lastDay === today) return; // already saved today

    await supabase.from('user_data_snapshots').insert({
      user_id: userId,
      encrypted_data: encrypted
    });
    localStorage.setItem(SNAPSHOT_DAY_KEY, today);
  } catch {}
}

export type SnapshotEntry = { id: string; created_at: string };

/** List all snapshots for the current user, newest first. */
export async function listSnapshots(): Promise<SnapshotEntry[]> {
  try {
    const userId = await getAuthUserId();
    if (!userId) return [];
    const { data, error } = await supabase
      .from('user_data_snapshots')
      .select('id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(90);
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

/** Restore a specific snapshot by ID. */
export async function restoreSnapshot(snapshotId: string, passcode: string): Promise<boolean> {
  try {
    const userId = await getAuthUserId();
    if (!userId) return false;
    const { data, error } = await supabase
      .from('user_data_snapshots')
      .select('encrypted_data')
      .eq('id', snapshotId)
      .eq('user_id', userId)
      .single();
    if (error || !data?.encrypted_data) return false;
    const plaintext = await decryptWithPasscode(data.encrypted_data, passcode);
    importJSON(plaintext);
    return true;
  } catch (e) {
    console.error('[sync] restore snapshot error:', e);
    return false;
  }
}

/** Delete a specific snapshot by ID. */
export async function deleteSnapshot(snapshotId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user_data_snapshots')
      .delete()
      .eq('id', snapshotId);
    return !error;
  } catch {
    return false;
  }
}

// ── Sync passphrase persistence ─────────────────────────────────────────
// The user's passcode is the cloud encryption key. We save it (encrypted with
// the device key) so cloud sync works even when the passcode gate is paused.
// On a new device, the user enters their passcode during unlock → we save it
// for that device too.

const SYNC_PASS_KEY = 'iisauhwallet_sync_pass_v1';

/** Save the passcode (encrypted with device key) for cloud sync. */
export async function saveSyncPassphrase(passcode: string): Promise<void> {
  try {
    const encrypted = await encryptWithDeviceKey(passcode);
    localStorage.setItem(SYNC_PASS_KEY, encrypted);
  } catch {}
}

/** Load the saved passcode for cloud sync (when passcode gate is paused). */
export async function loadSyncPassphrase(): Promise<string | null> {
  try {
    const raw = localStorage.getItem(SYNC_PASS_KEY);
    if (!raw) return null;
    const decrypted = await decryptWithDeviceKey(raw);
    return decrypted || null;
  } catch {
    return null;
  }
}
