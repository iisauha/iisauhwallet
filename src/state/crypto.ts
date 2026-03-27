// AES-GCM encryption layer for localStorage and export files.
// Device key: random 256-bit key stored in localStorage — makes data unreadable in DevTools.
// Passcode key: PBKDF2-derived from user passcode — used for exported backup files.

import type { LedgerData } from './models';
import {
  STORAGE_KEY,
  INVESTING_KEY,
  SUB_TRACKER_KEY,
  LOANS_KEY,
  CATEGORY_STORAGE_KEY,
  EXPECTED_COSTS_KEY,
  EXPECTED_INCOME_KEY,
  LAST_ADJUSTMENTS_KEY,
  COASTFIRE_KEY,
  FEDERAL_REPAYMENT_CONFIG_KEY,
  BIRTHDATE_KEY,
  PUBLIC_PAYMENT_NOW_ADDED_KEY,
  PRIVATE_PAYMENT_NOW_BASE_KEY,
  LAST_RECOMPUTE_DATE_KEY,
  PAYMENT_NOW_MANUAL_OVERRIDE_KEY,
  CARD_REWARD_ADJUSTMENTS_KEY,
  CARD_REWARD_ONLY_ENTRIES_KEY,
  REWARDS_VISIBLE_CARD_IDS_KEY,
  FEDERAL_LOAN_PARAMETERS_KEY,
  PUBLIC_LOAN_ESTIMATOR_KEY,
  PUBLIC_LOAN_SUMMARY_KEY,
  OPTIMIZER_ASSUMPTIONS_KEY,
  OPTIMIZER_LAST_RESULT_KEY,
  USER_DISPLAY_NAME_KEY,
  USER_PROFILE_IMAGE_KEY,
} from './keys';

const DEVICE_KEY_LS_KEY = 'iisauhwallet_dk_v1';
const DEVICE_KEY_WRAPPED_PASS_LS_KEY = 'iisauhwallet_dk_pass_wrap_v1';
const DEVICE_KEY_WRAPPED_REC_LS_KEY = 'iisauhwallet_dk_rec_wrap_v1';
const ENC_PREFIX = 'enc1:';

// All financial/sensitive keys that must be encrypted with the device key.
const AUX_ENCRYPTED_KEYS: string[] = [
  INVESTING_KEY,
  SUB_TRACKER_KEY,
  LOANS_KEY,
  CATEGORY_STORAGE_KEY,
  EXPECTED_COSTS_KEY,
  EXPECTED_INCOME_KEY,
  LAST_ADJUSTMENTS_KEY,
  COASTFIRE_KEY,
  FEDERAL_REPAYMENT_CONFIG_KEY,
  BIRTHDATE_KEY,
  PUBLIC_PAYMENT_NOW_ADDED_KEY,
  PRIVATE_PAYMENT_NOW_BASE_KEY,
  LAST_RECOMPUTE_DATE_KEY,
  PAYMENT_NOW_MANUAL_OVERRIDE_KEY,
  CARD_REWARD_ADJUSTMENTS_KEY,
  CARD_REWARD_ONLY_ENTRIES_KEY,
  REWARDS_VISIBLE_CARD_IDS_KEY,
  FEDERAL_LOAN_PARAMETERS_KEY,
  PUBLIC_LOAN_ESTIMATOR_KEY,
  PUBLIC_LOAN_SUMMARY_KEY,
  OPTIMIZER_ASSUMPTIONS_KEY,
  OPTIMIZER_LAST_RESULT_KEY,
  USER_DISPLAY_NAME_KEY,
  USER_PROFILE_IMAGE_KEY,
];

let deviceKey: CryptoKey | null = null;
let dataCache: LedgerData | null = null;

// ── Sync cache (bridges async crypto with sync Zustand store) ─────────────

export function getCachedData(): LedgerData | null {
  return dataCache;
}

export function setCachedData(data: LedgerData | null): void {
  dataCache = data;
}

// ── Auxiliary key cache (all other encrypted financial keys) ──────────────
// undefined (not in map) = not yet initialized; null = key absent from localStorage; string = decrypted value

const auxCache = new Map<string, string | null>();

/** Returns the decrypted value for an aux key, or undefined if initCrypto hasn't run yet. */
export function getAuxCached(key: string): string | null | undefined {
  return auxCache.has(key) ? (auxCache.get(key) ?? null) : undefined;
}

export function setAuxCached(key: string, value: string | null): void {
  auxCache.set(key, value);
}

// ── Base64 helpers ────────────────────────────────────────────────────────

export function b64Enc(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function b64Dec(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// ── Device key management ─────────────────────────────────────────────────

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  try {
    const stored = localStorage.getItem(DEVICE_KEY_LS_KEY);
    if (stored) {
      const raw = b64Dec(stored);
      return await crypto.subtle.importKey(
        'raw', raw as Uint8Array<ArrayBuffer>, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      );
    }
  } catch (_) {}

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );
  const raw = await crypto.subtle.exportKey('raw', key);
  localStorage.setItem(DEVICE_KEY_LS_KEY, b64Enc(new Uint8Array(raw)));
  return key;
}

// ── Device-key AES-GCM encrypt/decrypt ───────────────────────────────────

export async function encryptWithDeviceKey(plaintext: string): Promise<string> {
  if (!deviceKey) return plaintext;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, deviceKey, new TextEncoder().encode(plaintext)
  );
  return ENC_PREFIX + b64Enc(iv) + '.' + b64Enc(new Uint8Array(ct));
}

export async function decryptWithDeviceKey(stored: string): Promise<string> {
  if (!deviceKey || !stored.startsWith(ENC_PREFIX)) return stored;
  const rest = stored.slice(ENC_PREFIX.length);
  const dot = rest.indexOf('.');
  if (dot === -1) return stored;
  try {
    const iv = b64Dec(rest.slice(0, dot));
    const ct = b64Dec(rest.slice(dot + 1));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> }, deviceKey, ct as Uint8Array<ArrayBuffer>);
    return new TextDecoder().decode(plain);
  } catch (_) {
    return stored; // decryption failed — return as-is (corrupt or wrong key)
  }
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(ENC_PREFIX);
}

// ── Passcode-derived AES-GCM (for export files) ───────────────────────────

async function deriveKeyFromPasscode(passcode: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as Uint8Array<ArrayBuffer>, iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Encrypts a plaintext string with a passcode. Returns a JSON string (the encrypted backup format). */
export async function encryptWithPasscode(plaintext: string, passcode: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPasscode(passcode, salt);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)
  );
  return JSON.stringify({
    version: 'iisauhwallet-encrypted-v1',
    salt: b64Enc(salt),
    iv: b64Enc(iv),
    data: b64Enc(new Uint8Array(ct)),
  });
}

/** Decrypts an encrypted backup JSON string using the given passcode. Throws if wrong passcode. */
export async function decryptWithPasscode(jsonText: string, passcode: string): Promise<string> {
  const payload = JSON.parse(jsonText) as { salt: string; iv: string; data: string };
  const salt = b64Dec(payload.salt);
  const iv = b64Dec(payload.iv);
  const ct = b64Dec(payload.data);
  const key = await deriveKeyFromPasscode(passcode, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> }, key, ct as Uint8Array<ArrayBuffer>);
  return new TextDecoder().decode(plain);
}

// ── Key-wrapping helpers (Fix 3: device key never stored in plaintext post-migration) ────

type WrappedKeyPayload = { s: string; iv: string; d: string };

async function deriveWrappingKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as Uint8Array<ArrayBuffer>, iterations: 100_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function wrapRawKey(rawBytes: Uint8Array, secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveWrappingKey(secret, salt);
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, wrappingKey, rawBytes as Uint8Array<ArrayBuffer>
  );
  const payload: WrappedKeyPayload = { s: b64Enc(salt), iv: b64Enc(iv), d: b64Enc(new Uint8Array(wrapped)) };
  return JSON.stringify(payload);
}

async function unwrapRawKey(json: string, secret: string): Promise<Uint8Array | null> {
  try {
    const { s, iv, d } = JSON.parse(json) as WrappedKeyPayload;
    const salt = b64Dec(s);
    const ivBytes = b64Dec(iv);
    const ct = b64Dec(d);
    const wrappingKey = await deriveWrappingKey(secret, salt);
    const raw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes as Uint8Array<ArrayBuffer> }, wrappingKey, ct as Uint8Array<ArrayBuffer>
    );
    return new Uint8Array(raw);
  } catch (_) {
    return null;
  }
}

// ── Cache population (shared by initCrypto and post-auth unlock) ───────────

async function populateAuxCache(): Promise<void> {
  // Main ledger key
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    if (isEncrypted(raw)) {
      try {
        const plain = await decryptWithDeviceKey(raw);
        dataCache = JSON.parse(plain) as LedgerData;
      } catch (_) {}
    } else {
      try { dataCache = JSON.parse(raw) as LedgerData; } catch (_) {}
      encryptWithDeviceKey(raw).then((ct) => localStorage.setItem(STORAGE_KEY, ct)).catch(() => {});
    }
  }

  // Auxiliary financial keys
  for (const k of AUX_ENCRYPTED_KEYS) {
    try {
      const rawAux = localStorage.getItem(k);
      if (!rawAux) {
        auxCache.set(k, null);
      } else if (isEncrypted(rawAux)) {
        try {
          auxCache.set(k, await decryptWithDeviceKey(rawAux));
        } catch (_) {
          auxCache.set(k, null);
        }
      } else {
        auxCache.set(k, rawAux);
        encryptWithDeviceKey(rawAux).then((ct) => localStorage.setItem(k, ct)).catch(() => {});
      }
    } catch (_) {
      auxCache.set(k, null);
    }
  }
}

// ── Initialization (called once before React renders) ─────────────────────

export async function initCrypto(): Promise<void> {
  try {
    const passWrappedJson = localStorage.getItem(DEVICE_KEY_WRAPPED_PASS_LS_KEY);
    const plaintextKey = localStorage.getItem(DEVICE_KEY_LS_KEY);

    if (passWrappedJson && !plaintextKey) {
      // Post-migration: device key is wrapped; needs passcode to unlock.
      // Leave deviceKey = null and cache empty until unlockWithPasscode() is called after auth.
      return;
    }

    // Legacy, paused mode, or fresh install: load/create plaintext device key.
    deviceKey = await getOrCreateDeviceKey();
    await populateAuxCache();
  } catch (_) {
    deviceKey = null; // crypto unavailable — graceful degradation to plaintext
  }
}

// ── Post-auth unlock (Fix 3 exported API) ────────────────────────────────

/** Clear device key and caches from memory (call on auto-lock). */
export function lockCrypto(): void {
  deviceKey = null;
  dataCache = null;
  auxCache.clear();
}

export function isDeviceKeyLoaded(): boolean {
  return deviceKey !== null;
}

/**
 * Unlock after passcode auth. Handles two cases:
 *   - Post-migration: unwraps device key from PBKDF2-wrapped storage.
 *   - Legacy/fresh: device key is already in memory (loaded by initCrypto);
 *     wraps it with the passcode and deletes the plaintext copy.
 * Always re-populates the aux cache so the store can reload with real data.
 */
export async function unlockWithPasscode(passcode: string): Promise<boolean> {
  try {
    const passWrappedJson = localStorage.getItem(DEVICE_KEY_WRAPPED_PASS_LS_KEY);
    const plaintextKey = localStorage.getItem(DEVICE_KEY_LS_KEY);

    if (passWrappedJson) {
      // Post-migration path: unwrap with PBKDF2(passcode).
      const rawBytes = await unwrapRawKey(passWrappedJson, passcode);
      if (!rawBytes) return false;
      deviceKey = await crypto.subtle.importKey(
        'raw', rawBytes as Uint8Array<ArrayBuffer>,
        { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
      );
      await populateAuxCache();
      return true;
    }

    if (plaintextKey) {
      // Legacy path: plaintext key is already in memory from initCrypto.
      // Migrate now: wrap with passcode and delete the plaintext copy.
      if (!deviceKey) {
        const raw = b64Dec(plaintextKey);
        deviceKey = await crypto.subtle.importKey(
          'raw', raw as Uint8Array<ArrayBuffer>,
          { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
        );
      }
      const rawBytes = new Uint8Array(await crypto.subtle.exportKey('raw', deviceKey));
      const wrapped = await wrapRawKey(rawBytes, passcode);
      localStorage.setItem(DEVICE_KEY_WRAPPED_PASS_LS_KEY, wrapped);
      localStorage.removeItem(DEVICE_KEY_LS_KEY);
      await populateAuxCache();
      return true;
    }

    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Unlock via recovery key (for the forgot-passcode recovery flow).
 * Requires that a recovery-wrapped device key was previously stored.
 */
export async function unlockWithRecoveryKey(recoveryKey: string): Promise<boolean> {
  try {
    const recWrappedJson = localStorage.getItem(DEVICE_KEY_WRAPPED_REC_LS_KEY);
    if (!recWrappedJson) return false;
    const rawBytes = await unwrapRawKey(recWrappedJson, recoveryKey);
    if (!rawBytes) return false;
    deviceKey = await crypto.subtle.importKey(
      'raw', rawBytes as Uint8Array<ArrayBuffer>,
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    );
    await populateAuxCache();
    return true;
  } catch (_) {
    return false;
  }
}

/** Re-wrap the in-memory device key with a new passcode. Call after passcode change/reset. */
export async function rewrapDeviceKeyWithPasscode(newPasscode: string): Promise<void> {
  if (!deviceKey) return;
  const rawBytes = new Uint8Array(await crypto.subtle.exportKey('raw', deviceKey));
  const wrapped = await wrapRawKey(rawBytes, newPasscode);
  localStorage.setItem(DEVICE_KEY_WRAPPED_PASS_LS_KEY, wrapped);
}

/** Store a recovery-key-wrapped copy of the device key. Call when recovery key is generated. */
export async function wrapDeviceKeyWithRecoveryKey(recoveryKey: string): Promise<void> {
  if (!deviceKey) return;
  const rawBytes = new Uint8Array(await crypto.subtle.exportKey('raw', deviceKey));
  const wrapped = await wrapRawKey(rawBytes, recoveryKey);
  localStorage.setItem(DEVICE_KEY_WRAPPED_REC_LS_KEY, wrapped);
}

/** Wrap initial device key with passcode on first passcode creation. Also removes plaintext copy. */
export async function wrapDeviceKeyWithPasscode(passcode: string): Promise<void> {
  if (!deviceKey) return;
  const rawBytes = new Uint8Array(await crypto.subtle.exportKey('raw', deviceKey));
  const wrapped = await wrapRawKey(rawBytes, passcode);
  localStorage.setItem(DEVICE_KEY_WRAPPED_PASS_LS_KEY, wrapped);
  localStorage.removeItem(DEVICE_KEY_LS_KEY);
}

/**
 * Write device key to plaintext storage. Called when user pauses passcode so
 * initCrypto can load it on subsequent starts without needing passcode auth.
 */
export async function exportDeviceKeyToStorage(): Promise<void> {
  if (!deviceKey) return;
  const rawBytes = new Uint8Array(await crypto.subtle.exportKey('raw', deviceKey));
  localStorage.setItem(DEVICE_KEY_LS_KEY, b64Enc(rawBytes));
}

/** Generate a fresh device key in memory (call after data wipe). Does not write to storage. */
export async function resetDeviceKey(): Promise<void> {
  deviceKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );
  dataCache = null;
  auxCache.clear();
}
