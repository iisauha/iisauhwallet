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
} from './keys';

const DEVICE_KEY_LS_KEY = 'iisauhwallet_dk_v1';
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

function b64Enc(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64Dec(b64: string): Uint8Array {
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

// ── Initialization (called once before React renders) ─────────────────────

export async function initCrypto(): Promise<void> {
  try {
    deviceKey = await getOrCreateDeviceKey();

    // ── Main ledger key ───────────────────────────────────────────────────
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

    // ── Auxiliary financial keys ──────────────────────────────────────────
    for (const k of AUX_ENCRYPTED_KEYS) {
      try {
        const rawAux = localStorage.getItem(k);
        if (!rawAux) {
          auxCache.set(k, null);
        } else if (isEncrypted(rawAux)) {
          try {
            auxCache.set(k, await decryptWithDeviceKey(rawAux));
          } catch (_) {
            auxCache.set(k, null); // decryption failed — treat as missing
          }
        } else {
          auxCache.set(k, rawAux);
          encryptWithDeviceKey(rawAux).then((ct) => localStorage.setItem(k, ct)).catch(() => {});
        }
      } catch (_) {
        auxCache.set(k, null);
      }
    }
  } catch (_) {
    deviceKey = null; // crypto unavailable — graceful degradation to plaintext
  }
}
