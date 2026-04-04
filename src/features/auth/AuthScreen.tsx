import { useState } from 'react';
import { useAuth } from '../../state/AuthContext';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    if (mode === 'signup') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }
    setLoading(true);
    const result = mode === 'signin'
      ? await signIn(email.trim(), password)
      : await signUp(email.trim(), password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else if (mode === 'signup') {
      setSignUpSuccess(true);
    }
  };

  if (signUpSuccess) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.title}>Check your email</h2>
          <p style={styles.subtitle}>
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then come back and sign in.
          </p>
          <button
            type="button"
            style={styles.button}
            onClick={() => {
              setSignUpSuccess(false);
              setMode('signin');
              setPassword('');
              setConfirmPassword('');
            }}
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</h2>
        <p style={styles.subtitle}>
          {mode === 'signin'
            ? 'Sign in to sync your data across devices.'
            : 'Create an account to securely back up your data.'}
        </p>

        <div style={styles.field}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            placeholder="you@example.com"
            autoComplete="email"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            placeholder="Enter password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        {mode === 'signup' && (
          <div style={styles.field}>
            <label style={styles.label}>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={styles.input}
              placeholder="Confirm password"
              autoComplete="new-password"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}

        <button
          type="button"
          style={{ ...styles.button, opacity: loading ? 0.6 : 1 }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>

        <button
          type="button"
          style={styles.link}
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
            setPassword('');
            setConfirmPassword('');
          }}
        >
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
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
    color: 'var(--accent, #4a9eff)',
    fontSize: '0.85rem',
    cursor: 'pointer',
    textAlign: 'center' as const,
    padding: 0,
  },
};
