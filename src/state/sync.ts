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
import { encryptWithPasscode, decryptWithPasscode } from './crypto';

let _passcode: string | null = null;
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _listening = false;
let _syncing = false;

const DEBOUNCE_MS = 2000;

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
