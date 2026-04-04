/**
 * CloudRestoreGate sits between AuthGate and PasscodeGate.
 *
 * On a new device/context where there's no local passcode hash:
 * 1. Checks if the user has cloud data
 * 2. If yes → shows "Enter your passcode to restore" screen
 * 3. On success → imports everything, saves passcode in sessionStorage for
 *    PasscodeGate to auto-unlock, then reloads to apply theme
 *
 * If no cloud data exists → passes through to PasscodeGate (new user flow).
 * If local data already exists → passes through immediately (returning user).
 */

import { useEffect, useRef, useState } from 'react';
import { loadPasscodeHash } from '../../state/storage';
import { hasRemoteData, pullFromSupabase, saveSyncPassphrase } from '../../state/sync';
import { markOnboardingDone } from '../onboarding/OnboardingGuide';

/** Key used to pass passcode from CloudRestoreGate → PasscodeGate after reload. */
export const RESTORE_PASSCODE_KEY = '__cloud_restore_passcode';

export function CloudRestoreGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'has-local' | 'restore-prompt' | 'no-cloud'>('checking');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const reloadingRef = useRef(false);

  useEffect(() => {
    const hash = loadPasscodeHash();
    if (hash) {
      setStatus('has-local');
      return;
    }
    hasRemoteData().then((has) => {
      setStatus(has ? 'restore-prompt' : 'no-cloud');
    }).catch(() => {
      setStatus('no-cloud');
    });
  }, []);

  if (status === 'checking') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', color: 'var(--ui-primary-text, #fff)' }}>
        Checking for existing data...
      </div>
    );
  }

  if (status === 'has-local' || status === 'no-cloud') {
    return <>{children}</>;
  }

  const handleRestore = async () => {
    if (!passcode.trim()) {
      setError('Enter your passcode.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const pass = passcode.trim();
      const success = await pullFromSupabase(pass, false); // don't preserve device keys on fresh restore
      if (!success) {
        setError('Could not restore. Wrong passcode or decryption failed.');
        setLoading(false);
        return;
      }

      // Data is now in localStorage (decrypted and re-encrypted with this device's key).
      // Mark onboarding done so the user skips intro.
      markOnboardingDone();

      // Save passcode in sessionStorage so PasscodeGate can auto-unlock after reload.
      // sessionStorage is cleared when the tab closes — safe for temporary use.
      try { sessionStorage.setItem(RESTORE_PASSCODE_KEY, pass); } catch {}

      // Save sync passphrase for future cloud syncs on this device.
      try { await saveSyncPassphrase(pass); } catch {}

      // Reload page to apply imported theme, appearance, and let PasscodeGate
      // handle device key wrapping properly with the auto-unlock flow.
      if (!reloadingRef.current) {
        reloadingRef.current = true;
        window.location.reload();
      }
    } catch (e) {
      console.error('[CloudRestoreGate] restore error:', e);
      setError('Restore failed. Check your connection and try again.');
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Welcome Back</h2>
        <p style={styles.subtitle}>
          We found your data in the cloud. Enter your passcode to restore it to this device.
        </p>

        <div style={styles.field}>
          <label style={styles.label}>Passcode</label>
          <input
            type="password"
            inputMode="numeric"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            style={styles.input}
            placeholder="Enter passcode"
            autoComplete="off"
            onKeyDown={(e) => e.key === 'Enter' && handleRestore()}
          />
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <button
          type="button"
          style={{ ...styles.button, opacity: loading ? 0.6 : 1 }}
          onClick={handleRestore}
          disabled={loading}
        >
          {loading ? 'Restoring...' : 'Restore My Data'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100dvh',
    padding: 20,
    background: 'var(--bg, #111)',
    overflow: 'hidden',
    position: 'fixed' as const,
    top: 0,
    left: 0,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    padding: 28,
    borderRadius: 16,
    background: 'var(--surface, #1a1a1a)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
  },
  title: {
    margin: '0 0 4px',
    fontSize: '1.4rem',
    color: 'var(--ui-primary-text, var(--text, #fff))',
    textAlign: 'center' as const,
  },
  subtitle: {
    margin: '0 0 20px',
    fontSize: '0.9rem',
    color: 'var(--ui-secondary-text, #999)',
    textAlign: 'center' as const,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    display: 'block',
    marginBottom: 4,
    fontSize: '0.85rem',
    color: 'var(--ui-primary-text, var(--text, #fff))',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border, #333)',
    background: 'var(--input-bg, #222)',
    color: 'var(--ui-primary-text, var(--text, #fff))',
    fontSize: '1rem',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  error: {
    color: 'var(--danger, #e74c3c)',
    fontSize: '0.85rem',
    marginBottom: 12,
    textAlign: 'center' as const,
  },
  button: {
    width: '100%',
    padding: '12px 0',
    borderRadius: 10,
    border: 'none',
    background: 'var(--accent, #4a9eff)',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
  },
};
