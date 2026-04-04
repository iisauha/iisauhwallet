/**
 * CloudRestoreGate sits between AuthGate and PasscodeGate.
 *
 * On a new device/context where there's no local passcode hash:
 * 1. Checks if the user has cloud data
 * 2. If yes → shows "Enter your passcode to restore" screen
 * 3. On success → imports everything (including passcode hash, settings, data)
 * 4. PasscodeGate then sees the imported passcode hash and works normally
 *
 * If no cloud data exists → passes through to PasscodeGate (new user flow).
 * If local data already exists → passes through immediately (returning user).
 */

import { useEffect, useState } from 'react';
import { loadPasscodeHash } from '../../state/storage';
import { hasRemoteData, pullFromSupabase } from '../../state/sync';
import { initCrypto } from '../../state/crypto';
import { useLedgerStore } from '../../state/store';

export function CloudRestoreGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'has-local' | 'restore-prompt' | 'no-cloud' | 'done'>('checking');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If local passcode hash exists, this device already has data
    const hash = loadPasscodeHash();
    if (hash) {
      setStatus('has-local');
      return;
    }

    // No local data — check cloud
    hasRemoteData().then((has) => {
      setStatus(has ? 'restore-prompt' : 'no-cloud');
    }).catch(() => {
      setStatus('no-cloud');
    });
  }, []);

  // Pass through immediately if local data exists or no cloud data
  if (status === 'checking') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', color: 'var(--ui-primary-text, #fff)' }}>
        Checking for existing data...
      </div>
    );
  }

  if (status === 'has-local' || status === 'no-cloud' || status === 'done') {
    return <>{children}</>;
  }

  // Cloud data exists but no local data — ask for passcode to restore
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
        // Re-initialize crypto with the imported data (device key, etc.)
        await initCrypto();
        useLedgerStore.getState().actions.reload();
        setStatus('done');
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
    fontSize: '1.2rem',
    letterSpacing: '0.3em',
    textAlign: 'center' as const,
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
