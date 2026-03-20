import { STORAGE_KEY } from './keys';
import type { LedgerData } from './models';

const ENCRYPTION_VERSION = 1;

type EncryptedLedgerBlobV1 = {
  version: number;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
};

let unlocked = false;
let decryptedLedger: LedgerData | null = null;

let aesKey: CryptoKey | null = null;
let kdfSaltBytes: Uint8Array | null = null;
let baseKey: CryptoKey | null = null;

let saveQueue: Promise<void> = Promise.resolve();

function bytesToBase64(bytes: Uint8Array): string {
  // Convert Uint8Array -> binary string -> base64.
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveAesKeyFromPasscode(passcode: string, saltBytes: Uint8Array): Promise<CryptoKey> {
  const passBytes = new TextEncoder().encode(passcode);
  const baseKey = await crypto.subtle.importKey('raw', passBytes, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations: 210000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function deriveAesKeyFromBaseKey(saltBytes: Uint8Array): Promise<CryptoKey> {
  if (!baseKey) throw new Error('Secure storage is locked.');
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations: 210000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function isEncryptedBlobV1(value: unknown): value is EncryptedLedgerBlobV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as any;
  return (
    v.version === ENCRYPTION_VERSION &&
    typeof v.salt === 'string' &&
    typeof v.iv === 'string' &&
    typeof v.ciphertext === 'string'
  );
}

async function encryptLedgerDataToBlob(data: LedgerData, saltBytes: Uint8Array, key: CryptoKey): Promise<EncryptedLedgerBlobV1> {
  const ivBytes = crypto.getRandomValues(new Uint8Array(12)); // 96-bit recommended for GCM
  const plaintext = JSON.stringify(data);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource },
    key,
    plaintextBytes
  );
  const ciphertextBytes = new Uint8Array(ciphertextBuf);

  return {
    version: ENCRYPTION_VERSION,
    salt: bytesToBase64(saltBytes),
    iv: bytesToBase64(ivBytes),
    ciphertext: bytesToBase64(ciphertextBytes)
  };
}

async function decryptLedgerDataFromBlob(blob: EncryptedLedgerBlobV1, passcode: string): Promise<LedgerData> {
  const saltBytes = base64ToBytes(blob.salt);
  const ivBytes = base64ToBytes(blob.iv);
  const ciphertextBytes = base64ToBytes(blob.ciphertext);

  const key = await deriveAesKeyFromPasscode(passcode, saltBytes);
  const plaintextBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource },
    key,
    ciphertextBytes as unknown as BufferSource
  );
  const plaintext = new TextDecoder().decode(plaintextBuf);
  return JSON.parse(plaintext) as LedgerData;
}

function lock() {
  unlocked = false;
  decryptedLedger = null;
  aesKey = null;
  kdfSaltBytes = null;
  baseKey = null;
}

export function isUnlocked(): boolean {
  return unlocked;
}

export function getDecryptedLedgerData(): LedgerData | null {
  return unlocked ? decryptedLedger : null;
}

export async function unlockWithPasscode(passcode: string): Promise<void> {
  lock();

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // Nothing to decrypt: still derive a key so the next save encrypts.
    kdfSaltBytes = crypto.getRandomValues(new Uint8Array(16));
    aesKey = await deriveAesKeyFromPasscode(passcode, kdfSaltBytes);
    // Prepare baseKey for later decrypts of blobs with different salts during the same session.
    baseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passcode),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    unlocked = true;
    decryptedLedger = null;
    return;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Data corrupted or invalid.');
  }

  if (isEncryptedBlobV1(parsed)) {
    baseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passcode),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    try {
      decryptedLedger = await decryptLedgerDataFromBlob(parsed, passcode);
    } catch {
      throw new Error('Data corrupted or invalid.');
    }

    kdfSaltBytes = base64ToBytes(parsed.salt);
    aesKey = await deriveAesKeyFromBaseKey(kdfSaltBytes);
    unlocked = true;
    return;
  }

  // Plaintext migration: raw is plaintext LedgerData JSON. Encrypt it after correct passcode entry.
  // If encryption fails for any reason, do not overwrite storage.
  const plaintextLedger = parsed as LedgerData;
  kdfSaltBytes = crypto.getRandomValues(new Uint8Array(16));
  baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passcode),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  aesKey = await deriveAesKeyFromBaseKey(kdfSaltBytes);

  decryptedLedger = plaintextLedger;

  // Encrypt/migrate best-effort.
  try {
    const blob = await encryptLedgerDataToBlob(plaintextLedger, kdfSaltBytes, aesKey);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
  } catch (_) {
    // Do not overwrite plaintext if encryption fails.
  }

  unlocked = true;
}

export function lockSecureStorage() {
  lock();
}

export async function encryptAndPersistLedgerData(data: LedgerData): Promise<void> {
  if (!unlocked || !aesKey || !kdfSaltBytes) {
    throw new Error('Secure storage is locked.');
  }

  // Ensure ordered writes if multiple updates happen quickly.
  saveQueue = saveQueue.then(async () => {
    const blob = await encryptLedgerDataToBlob(data, kdfSaltBytes!, aesKey!);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
    decryptedLedger = data;
  });

  return saveQueue;
}

export async function reencryptLedgerData(oldPasscode: string, newPasscode: string): Promise<void> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // Nothing exists yet; just unlock+encrypt by calling unlock and then encrypting.
    await unlockWithPasscode(newPasscode);
    if (decryptedLedger) await encryptAndPersistLedgerData(decryptedLedger);
    return;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Data corrupted or invalid.');
  }

  let plaintext: LedgerData;
  if (isEncryptedBlobV1(parsed)) {
    plaintext = await decryptLedgerDataFromBlob(parsed, oldPasscode).catch(() => {
      throw new Error('Data corrupted or invalid.');
    });
  } else {
    // Plaintext storage: treat oldPasscode as "correct enough" since plaintext encryption migration
    // is only triggered after passcode gate verification anyway.
    plaintext = parsed as LedgerData;
  }

  // Fresh salt for new passcode encryption.
  kdfSaltBytes = crypto.getRandomValues(new Uint8Array(16));
  aesKey = await deriveAesKeyFromPasscode(newPasscode, kdfSaltBytes);
  decryptedLedger = plaintext;
  unlocked = true;

  const blob = await encryptLedgerDataToBlob(plaintext, kdfSaltBytes, aesKey);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
}

export function isEncryptedLedgerBlobV1(value: unknown): value is EncryptedLedgerBlobV1 {
  return isEncryptedBlobV1(value);
}

export async function decryptAndLoadEncryptedLedgerBlob(blob: EncryptedLedgerBlobV1): Promise<void> {
  if (!baseKey) throw new Error('Secure storage is locked.');
  const saltBytes = base64ToBytes(blob.salt);
  const ivBytes = base64ToBytes(blob.iv);
  const ciphertextBytes = base64ToBytes(blob.ciphertext);

  const nextAesKey = await deriveAesKeyFromBaseKey(saltBytes);

  try {
    const plaintextBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource },
      nextAesKey,
      ciphertextBytes as unknown as BufferSource
    );
    const plaintext = new TextDecoder().decode(plaintextBuf);
    decryptedLedger = JSON.parse(plaintext) as LedgerData;
  } catch {
    throw new Error('Wrong passcode or data corrupted.');
  }

  // Switch current encryption parameters to match the imported blob.
  kdfSaltBytes = saltBytes;
  aesKey = nextAesKey;
  unlocked = true;
}

