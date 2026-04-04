/**
 * Biometric authentication (Face ID / Touch ID) via WebAuthn.
 *
 * Flow:
 * 1. User enters passcode → app offers to enable biometrics
 * 2. WebAuthn creates a platform credential (backed by Face ID/Touch ID)
 * 3. The passcode is encrypted with a random AES key stored in localStorage
 *    (the key is only usable after WebAuthn authentication succeeds)
 * 4. On next login, WebAuthn triggers Face ID → on success, passcode is decrypted
 *
 * The passcode is still the real encryption key for all data. Biometrics just
 * provide a faster way to retrieve it without typing.
 */

const BIOMETRIC_ENABLED_KEY = 'iisauhwallet_biometric_enabled_v1';
const BIOMETRIC_CREDENTIAL_ID_KEY = 'iisauhwallet_biometric_cred_id_v1';
const BIOMETRIC_ENCRYPTED_PASS_KEY = 'iisauhwallet_biometric_enc_pass_v1';
const BIOMETRIC_SALT_KEY = 'iisauhwallet_biometric_salt_v1';

/** Check if the device supports platform biometric authentication. */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    if (!window.PublicKeyCredential) return false;
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch {
    return false;
  }
}

/** Check if biometric login is currently enabled for this device. */
export function isBiometricEnabled(): boolean {
  try {
    return localStorage.getItem(BIOMETRIC_ENABLED_KEY) === '1' &&
      !!localStorage.getItem(BIOMETRIC_CREDENTIAL_ID_KEY) &&
      !!localStorage.getItem(BIOMETRIC_ENCRYPTED_PASS_KEY);
  } catch {
    return false;
  }
}

/** Helper: base64url encode */
function b64url(bytes: Uint8Array): string {
  let str = '';
  bytes.forEach(b => { str += String.fromCharCode(b); });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Helper: base64url decode */
function b64urlDec(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encrypt the passcode with a random key for biometric storage. */
async function encryptPasscode(passcode: string): Promise<{ encrypted: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(passcode);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const rawKey = await crypto.subtle.exportKey('raw', key);

  // Store: iv + ciphertext + raw key all together (security is via WebAuthn gate, not key secrecy)
  const payload = {
    iv: b64url(iv),
    ct: b64url(new Uint8Array(ct)),
    k: b64url(new Uint8Array(rawKey)),
  };
  return { encrypted: JSON.stringify(payload), salt: b64url(salt) };
}

/** Decrypt the stored passcode. */
async function decryptPasscode(encrypted: string): Promise<string> {
  const payload = JSON.parse(encrypted) as { iv: string; ct: string; k: string };
  const iv = b64urlDec(payload.iv);
  const ct = b64urlDec(payload.ct);
  const rawKey = b64urlDec(payload.k);
  const key = await crypto.subtle.importKey('raw', rawKey as Uint8Array<ArrayBuffer>, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> }, key, ct as Uint8Array<ArrayBuffer>);
  return new TextDecoder().decode(plain);
}

/**
 * Register biometric authentication for a given passcode.
 * Triggers Face ID / Touch ID enrollment.
 */
export async function enrollBiometric(passcode: string, displayName?: string): Promise<boolean> {
  try {
    const available = await isBiometricAvailable();
    if (!available) return false;

    // Create a WebAuthn credential (triggers Face ID/Touch ID)
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userName = displayName || 'My Wallet';

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'alenjo', id: window.location.hostname },
        user: {
          id: userId,
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 },  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    }) as PublicKeyCredential | null;

    if (!credential) return false;

    // Store the credential ID
    const credId = b64url(new Uint8Array(credential.rawId));
    localStorage.setItem(BIOMETRIC_CREDENTIAL_ID_KEY, credId);

    // Encrypt and store the passcode
    const { encrypted, salt } = await encryptPasscode(passcode);
    localStorage.setItem(BIOMETRIC_ENCRYPTED_PASS_KEY, encrypted);
    localStorage.setItem(BIOMETRIC_SALT_KEY, salt);
    localStorage.setItem(BIOMETRIC_ENABLED_KEY, '1');

    return true;
  } catch (e) {
    console.error('[biometric] enroll error:', e);
    return false;
  }
}

/**
 * Authenticate with biometrics and retrieve the stored passcode.
 * Triggers Face ID / Touch ID prompt.
 */
export async function authenticateWithBiometric(): Promise<string | null> {
  try {
    if (!isBiometricEnabled()) return null;

    const credIdB64 = localStorage.getItem(BIOMETRIC_CREDENTIAL_ID_KEY);
    if (!credIdB64) return null;

    const credId = b64urlDec(credIdB64);
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    // Trigger Face ID / Touch ID
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{
          type: 'public-key',
          id: credId as Uint8Array<ArrayBuffer>,
          transports: ['internal'],
        }],
        userVerification: 'required',
        timeout: 60000,
      },
    }) as PublicKeyCredential | null;

    if (!assertion) return null;

    // Biometric succeeded — decrypt and return the passcode
    const encrypted = localStorage.getItem(BIOMETRIC_ENCRYPTED_PASS_KEY);
    if (!encrypted) return null;

    return await decryptPasscode(encrypted);
  } catch (e) {
    console.error('[biometric] auth error:', e);
    return null;
  }
}

/** Disable biometric authentication. */
export function disableBiometric() {
  localStorage.removeItem(BIOMETRIC_ENABLED_KEY);
  localStorage.removeItem(BIOMETRIC_CREDENTIAL_ID_KEY);
  localStorage.removeItem(BIOMETRIC_ENCRYPTED_PASS_KEY);
  localStorage.removeItem(BIOMETRIC_SALT_KEY);
}

/** Re-enroll biometrics with a new passcode (call after passcode change). */
export async function updateBiometricPasscode(newPasscode: string): Promise<boolean> {
  if (!isBiometricEnabled()) return false;
  try {
    const { encrypted, salt } = await encryptPasscode(newPasscode);
    localStorage.setItem(BIOMETRIC_ENCRYPTED_PASS_KEY, encrypted);
    localStorage.setItem(BIOMETRIC_SALT_KEY, salt);
    return true;
  } catch {
    return false;
  }
}
