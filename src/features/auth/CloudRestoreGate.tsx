/**
 * CloudRestoreGate sits between AuthGate and PasscodeGate.
 *
 * On a new device/context where there's no local passcode hash:
 * 1. Checks if the user has cloud data
 * 2. If yes → shows "Enter your passcode to restore" screen
 * 3. On success → imports everything, applies theme, skips onboarding/passcode creation
 * 4. User lands directly in the app
 *
 * If no cloud data exists → passes through to PasscodeGate (new user flow).
 * If local data already exists → passes through immediately (returning user).
 */

import { useEffect, useState } from 'react';
import { loadPasscodeHash } from '../../state/storage';
import { markOnboardingDone } from '../onboarding/OnboardingGuide';
import { hasRemoteData, pullFromSupabase, saveSyncPassphrase, initSync } from '../../state/sync';
import { initCrypto, unlockWithPasscode } from '../../state/crypto';
import { useLedgerStore } from '../../state/store';

/** Apply any saved theme/appearance from localStorage after import. */
function applyImportedTheme() {
  try {
    // Re-trigger CSS variable application by dispatching a storage event
    // The ThemeProvider and AppearanceProvider read from localStorage on mount,
    // so we force a re-render by reloading the page after restore.
  } catch {}
}

export function CloudRestoreGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'has-local' | 'restore-prompt' | 'no-cloud' | 'restored'>('checking');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  if (status === 'restored') {
    // After successful restore, reload the page so ThemeProvider, AppearanceProvider,
    // and PasscodeGate all re-read from the freshly imported localStorage.
    // This ensures theme, fonts, and passcode state are all correct.
    window.location.reload();
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', color: 'var(--ui-primary-text, #fff)' }}>
        Restoring...
      </div>
    );
  }

  const handleRestore = async () => {
    if (!passcode.trim()) {
      setError('Enter your passcode.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const success = await pullFromSupabase(passcode.trim());
      if (success) {
        // Re-initialize crypto with the imported device key
        await initCrypto();
        // Unlock with the user's passcode so the device key is ready
        await unlockWithPasscode(passcode.trim());
        // Save passphrase for future cloud sync on this device
        await saveSyncPassphrase(passcode.trim());
        // Start syncing
        initSync(passcode.trim());
        // Mark onboarding as done so they skip the intro
        markOnboardingDone();
        // Reload store
        useLedgerStore.getState().actions.reload();
        applyImportedTheme();
        // Reload page to apply theme and skip passcode creation
        setStatus('restored');
      } else {
        setError('Could not restore. Wrong passcode or no data found.');
      }
    } catch {
      setError('Restore failed. Check your connection and try again.');
    }
    setLoading(false);
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
            placeholder="Enter your passcode"
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

        <button
          type="button"
          style={styles.link}
          onClick={() => setStatus('no-cloud')}
        >
          Skip and start fresh
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
    minHeight: '100dvh',
    padding: 20,
    background: 'var(--bg, #111)',
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
  link: {
    display: 'block',
    width: '100%',
    marginTop: 14,
    background: 'none',
    border: 'none',
    color: 'var(--ui-secondary-text, #999)',
    fontSize: '0.82rem',
    cursor: 'pointer',
    textAlign: 'center' as const,
    padding: 0,
  },
};
