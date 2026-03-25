// AES-GCM encryption layer for localStorage and export files.
// Device key: random 256-bit key stored in localStorage — makes data unreadable in DevTools.
// Passcode key: PBKDF2-derived from user passcode — used for exported backup files.

import type { LedgerData } from './models';
import { STORAGE_KEY } from './keys';

const DEVICE_KEY_LS_KEY = 'iisauhwallet_dk_v1';
const ENC_PREFIX = 'enc1:';

let deviceKey: CryptoKey | null = null;
let dataCache: LedgerData | null = null;

// ── Sync cache (bridges async crypto with sync Zustand store) ─────────────

export function getCachedData(): LedgerData | null {
  return dataCache;
}

export function setCachedData(data: LedgerData | null): void {
  dataCache = data;
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
        'raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
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
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, deviceKey, ct);
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
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
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
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plain);
}

// ── Initialization (called once before React renders) ─────────────────────

export async function initCrypto(): Promise<void> {
  try {
    deviceKey = await getOrCreateDeviceKey();

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return; // no data yet

    if (isEncrypted(raw)) {
      // Already encrypted — decrypt into cache
      try {
        const plain = await decryptWithDeviceKey(raw);
        dataCache = JSON.parse(plain) as LedgerData;
      } catch (_) {}
    } else {
      // Plaintext data — parse into cache and migrate to encrypted (fire-and-forget)
      try {
        dataCache = JSON.parse(raw) as LedgerData;
      } catch (_) {}
      encryptWithDeviceKey(raw)
        .then((ct) => localStorage.setItem(STORAGE_KEY, ct))
        .catch(() => {});
    }
  } catch (_) {
    deviceKey = null; // crypto unavailable — graceful degradation to plaintext
  }
}
