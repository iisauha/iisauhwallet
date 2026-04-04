import { useState } from 'react';
import { useAuth } from '../../state/AuthContext';

type View = 'landing' | 'signin' | 'signup' | 'success';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [view, setView] = useState<View>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    if (view === 'signup') {
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
    const result = view === 'signin'
      ? await signIn(email.trim(), password)
      : await signUp(email.trim(), password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else if (view === 'signup') {
      setView('success');
    }
  };

  const container: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100dvh',
    padding: 24,
    background: 'var(--bg, #0b0b0f)',
    overflow: 'hidden',
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    boxSizing: 'border-box',
  };

  // Landing page (like Atmos)
  if (view === 'landing') {
    return (
      <div style={container}>
        {/* Logo - uses CSS mask to recolor PNG to accent color */}
        <div style={{
          width: 140,
          height: 140,
          backgroundColor: 'var(--accent, #f97316)',
          WebkitMaskImage: 'url(/icon.png)',
          WebkitMaskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskImage: 'url(/icon.png)',
          maskSize: 'contain',
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          marginBottom: 16,
        } as React.CSSProperties} />

        <h1 style={{
          margin: '0 0 6px',
          fontSize: '2rem',
          fontWeight: 700,
          color: 'var(--ui-primary-text, var(--text, #fff))',
          fontFamily: 'var(--app-font-family)',
          letterSpacing: '0.02em',
        }}>
          alenjo
        </h1>

        <p style={{
          margin: '0 0 48px',
          fontSize: '0.95rem',
          color: 'var(--muted, #888)',
          fontFamily: 'var(--app-font-family)',
        }}>
          Your finances, simplified.
        </p>

        <button
          type="button"
          onClick={() => setView('signin')}
          style={{
            width: '100%',
            maxWidth: 340,
            padding: '16px 0',
            borderRadius: 50,
            border: 'none',
            background: 'var(--accent, #f97316)',
            color: '#fff',
            fontSize: '1.05rem',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--app-font-family)',
            marginBottom: 14,
          }}
        >
          Login
        </button>

        <button
          type="button"
          onClick={() => setView('signup')}
          style={{
            width: '100%',
            maxWidth: 340,
            padding: '16px 0',
            borderRadius: 50,
            border: '1.5px solid var(--muted, #555)',
            background: 'transparent',
            color: 'var(--ui-primary-text, var(--text, #fff))',
            fontSize: '1.05rem',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--app-font-family)',
          }}
        >
          Sign Up
        </button>
      </div>
    );
  }

  // Success after sign up
  if (view === 'success') {
    return (
      <div style={container}>
        <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', color: 'var(--ui-primary-text, var(--text, #fff))', fontFamily: 'var(--app-font-family)' }}>
            Check your email
          </h2>
          <p style={{ margin: '0 0 28px', fontSize: '0.9rem', color: 'var(--muted, #888)', lineHeight: 1.5, fontFamily: 'var(--app-font-family)' }}>
            We sent a confirmation link to <strong style={{ color: 'var(--ui-primary-text, var(--text, #fff))' }}>{email}</strong>. Click it to activate your account, then come back and sign in.
          </p>
          <button
            type="button"
            onClick={() => { setView('signin'); setPassword(''); setConfirmPassword(''); }}
            style={{
              width: '100%',
              maxWidth: 340,
              padding: '16px 0',
              borderRadius: 50,
              border: 'none',
              background: 'var(--accent, #f97316)',
              color: '#fff',
              fontSize: '1.05rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--app-font-family)',
            }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // Login / Sign Up form
  const isSignUp = view === 'signup';

  return (
    <div style={container}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Small logo */}
        <div style={{
          width: 56,
          height: 56,
          backgroundColor: 'var(--accent, #f97316)',
          WebkitMaskImage: 'url(/icon.png)',
          WebkitMaskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskImage: 'url(/icon.png)',
          maskSize: 'contain',
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          margin: '0 auto 20px',
        } as React.CSSProperties} />

        <h2 style={{ margin: '0 0 24px', fontSize: '1.4rem', fontWeight: 600, textAlign: 'center', color: 'var(--ui-primary-text, var(--text, #fff))', fontFamily: 'var(--app-font-family)' }}>
          {isSignUp ? 'Create Account' : 'Welcome Back'}
        </h2>

        <div style={{ marginBottom: 14 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            style={fieldStyle}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            style={fieldStyle}
          />
        </div>

        {isSignUp && (
          <div style={{ marginBottom: 14 }}>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm Password"
              autoComplete="new-password"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              style={fieldStyle}
            />
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--danger, #e74c3c)', fontSize: '0.85rem', marginBottom: 14, textAlign: 'center', fontFamily: 'var(--app-font-family)' }}>
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%',
            padding: '16px 0',
            borderRadius: 50,
            border: 'none',
            background: 'var(--accent, #f97316)',
            color: '#fff',
            fontSize: '1.05rem',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--app-font-family)',
            opacity: loading ? 0.6 : 1,
            marginBottom: 16,
          }}
        >
          {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Login'}
        </button>

        <button
          type="button"
          onClick={() => {
            setView(isSignUp ? 'signin' : 'signup');
            setError(null);
            setPassword('');
            setConfirmPassword('');
          }}
          style={{
            display: 'block',
            width: '100%',
            background: 'none',
            border: 'none',
            color: 'var(--accent, #f97316)',
            fontSize: '0.88rem',
            cursor: 'pointer',
            textAlign: 'center',
            padding: 0,
            fontFamily: 'var(--app-font-family)',
          }}
        >
          {isSignUp ? 'Already have an account? Login' : "Don't have an account? Sign Up"}
        </button>

        <button
          type="button"
          onClick={() => { setView('landing'); setError(null); setPassword(''); setConfirmPassword(''); }}
          style={{
            display: 'block',
            width: '100%',
            background: 'none',
            border: 'none',
            color: 'var(--muted, #888)',
            fontSize: '0.82rem',
            cursor: 'pointer',
            textAlign: 'center',
            padding: 0,
            marginTop: 14,
            fontFamily: 'var(--app-font-family)',
          }}
        >
          Back
        </button>
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid var(--border, #333)',
  background: 'var(--surface, #1a1a1a)',
  color: 'var(--ui-primary-text, var(--text, #fff))',
  fontSize: '1rem',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'var(--app-font-family)',
};
