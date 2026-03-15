import { useCallback, useEffect, useState } from 'react';
import { loadPasscodeHash, savePasscodeHash, clearPasscodeHash, hashPasscode } from '../../state/storage';

type Step = 'enter' | 'create' | 'confirm' | 'forgot-confirm';

function isValidFourDigits(value: string): boolean {
  return /^\d{4}$/.test(value);
}

export function PasscodeGate({ children }: { children: React.ReactNode }) {
  const [storedHash, setStoredHash] = useState<string | null>(() => loadPasscodeHash());
  const [authenticated, setAuthenticated] = useState(false);
  const [step, setStep] = useState<Step>(() => (loadPasscodeHash() === null ? 'create' : 'enter'));
  const [input, setInput] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [error, setError] = useState('');
  const [showForgotConfirm, setShowForgotConfirm] = useState(false);

  useEffect(() => {
    if (storedHash === null) {
      setStep('create');
      setInput('');
      setConfirmInput('');
      setError('');
    } else {
      setStep('enter');
      setInput('');
      setError('');
    }
  }, [storedHash === null]);

  const handleCreate = useCallback(async () => {
    setError('');
    if (!isValidFourDigits(input)) {
      setError('Enter 4 digits');
      return;
    }
    setStep('confirm');
    setConfirmInput('');
  }, [input]);

  const handleConfirmCreate = useCallback(async () => {
    setError('');
    if (!isValidFourDigits(confirmInput)) {
      setError('Enter 4 digits');
      return;
    }
    if (input !== confirmInput) {
      setError('Passcodes do not match');
      return;
    }
    const hash = await hashPasscode(input);
    savePasscodeHash(hash);
    setStoredHash(hash);
    setAuthenticated(true);
    setInput('');
    setConfirmInput('');
  }, [input, confirmInput]);

  const handleEnter = useCallback(async () => {
    setError('');
    if (!isValidFourDigits(input)) {
      setError('Enter 4 digits');
      return;
    }
    const hash = await hashPasscode(input);
    if (hash !== storedHash) {
      setError('Incorrect passcode');
      return;
    }
    setAuthenticated(true);
    setInput('');
  }, [input, storedHash]);

  const handleForgotConfirm = useCallback(() => {
    clearPasscodeHash();
    setStoredHash(null);
    setShowForgotConfirm(false);
    setStep('create');
    setInput('');
    setConfirmInput('');
    setError('');
  }, []);

  if (authenticated) {
    return <>{children}</>;
  }

  return (
    <div
      className="passcode-gate"
      style={{
        minHeight: '100dvh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--bg)',
        color: 'var(--text)',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="passcode-gate-content"
        style={{
          width: '100%',
          maxWidth: 340,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          animation: 'passcodeFadeIn 0.3s ease-out',
        }}
      >
        {showForgotConfirm ? (
          <>
            <h1 style={{ margin: '0 0 12px 0', fontSize: '1.5rem', fontWeight: 600, textAlign: 'center' }}>
              Reset passcode?
            </h1>
            <p style={{ margin: '0 0 24px 0', fontSize: '0.95rem', color: 'var(--muted)', lineHeight: 1.5, textAlign: 'center' }}>
              This only affects this device. Your financial data will not be deleted. You will need to create a new 4-digit passcode to open the app again.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, minWidth: 100 }}
                onClick={() => setShowForgotConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{ flex: 1, minWidth: 100 }}
                onClick={handleForgotConfirm}
              >
                Reset passcode
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: 600, textAlign: 'center' }}>
              {step === 'enter'
                ? 'Enter Passcode'
                : step === 'confirm'
                  ? 'Confirm passcode'
                  : 'Create passcode'}
            </h1>
            <p style={{ margin: '0 0 24px 0', fontSize: '0.95rem', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
              {step === 'enter'
                ? 'Enter your 4-digit passcode to continue.'
                : step === 'confirm'
                  ? 'Re-enter your 4-digit passcode.'
                  : 'Choose a 4-digit passcode to protect access on this device.'}
            </p>
            {(step === 'enter' || step === 'create') && (
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoComplete="off"
                value={input}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setInput(v);
                  setError('');
                }}
                placeholder="••••"
                aria-label="Passcode"
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  fontSize: '1.5rem',
                  letterSpacing: '0.4em',
                  textAlign: 'center',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  marginBottom: 12,
                }}
              />
            )}
            {step === 'confirm' && (
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoComplete="off"
                value={confirmInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setConfirmInput(v);
                  setError('');
                }}
                placeholder="••••"
                aria-label="Confirm passcode"
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  fontSize: '1.5rem',
                  letterSpacing: '0.4em',
                  textAlign: 'center',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  marginBottom: 12,
                }}
              />
            )}
            {error ? (
              <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--red)' }}>{error}</p>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {step === 'enter' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px 16px' }}
                  onClick={handleEnter}
                >
                  Continue
                </button>
              )}
              {step === 'create' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px 16px' }}
                  onClick={handleCreate}
                >
                  Continue
                </button>
              )}
              {step === 'confirm' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px 16px' }}
                  onClick={handleConfirmCreate}
                >
                  Save passcode
                </button>
              )}
              {step === 'enter' && (
                <button
                  type="button"
                  className="btn clear-btn"
                  style={{ width: '100%', padding: '10px 16px', fontSize: '0.9rem' }}
                  onClick={() => setShowForgotConfirm(true)}
                >
                  Forgot passcode?
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <style>{`
        .passcode-gate {
          background: var(--bg);
        }
        @keyframes passcodeFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
