import { useCallback, useEffect, useState } from 'react';
import {
  loadPasscodeHash,
  savePasscodeHash,
  hashPasscode,
  hashForStorage,
  loadPasscodeHint,
  savePasscodeHint,
  loadRecoveryKeyHash,
  saveRecoveryKeyHash,
  loadSecurityQA,
  saveSecurityQA,
  loadRecoverySetupDone,
  saveRecoverySetupDone,
  loadPasscodeFailedAttempts,
  savePasscodeFailedAttempts,
  loadPasscodeLockoutUntil,
  savePasscodeLockoutUntil,
  loadSecurityQuizCompleted,
  loadPasscodePaused,
  loadPasscode6Digit,
  savePasscode6Digit,
  generateRecoveryKey,
  wipeAllAppData,
  type SecurityQA,
} from '../../state/storage';
import { SecurityOnboarding } from './SecurityOnboarding';

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_HOURS = 24;

type Step =
  | 'security-onboarding'
  | 'enter'
  | 'create'
  | 'confirm'
  | 'hint'
  | 'security-questions'
  | 'recovery-key-show'
  | 'forgot-options'
  | 'recovery-key-enter'
  | 'security-answers-enter'
  | 'hint-show'
  | 'reset-new-passcode'
  | 'update-to-6digit'
  | 'update-to-6digit-confirm'
  | 'wipe-confirm'
  | 'lockout'
  | 'migration-prompt';

const SECURITY_QUESTION_OPTIONS = [
  'What is your birth month and year? (e.g. January 1990)',
  'What city were you born in?',
  'What was the name of your first pet?',
  'What is your mother\'s maiden name?',
  'What was the name of your first school?',
  'What is your favorite book?',
  'What street did you grow up on?',
];

const PASSCODE_LENGTH = 6;
function isValidSixDigits(value: string): boolean {
  return new RegExp(`^\\d{${PASSCODE_LENGTH}}$`).test(value);
}

function getLockoutEnd(): Date | null {
  const raw = loadPasscodeLockoutUntil();
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function isLockedOut(): boolean {
  const end = getLockoutEnd();
  if (!end) return false;
  return new Date() < end;
}

export function PasscodeGate({ children }: { children: React.ReactNode }) {
  const [storedHash, setStoredHash] = useState<string | null>(() => loadPasscodeHash());
  const [authenticated, setAuthenticated] = useState(false);
  const [step, setStep] = useState<Step>(() => {
    if (!loadSecurityQuizCompleted()) return 'security-onboarding';
    const hash = loadPasscodeHash();
    if (hash !== null) {
      if (!loadPasscode6Digit()) return 'update-to-6digit';
      if (isLockedOut()) return 'lockout';
      if (!loadRecoverySetupDone()) return 'migration-prompt';
      return 'enter';
    }
    return 'create';
  });
  const [input, setInput] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [hintInput, setHintInput] = useState('');
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [securityQ1, setSecurityQ1] = useState('');
  const [securityQ2, setSecurityQ2] = useState('');
  const [securityA1, setSecurityA1] = useState('');
  const [securityA2, setSecurityA2] = useState('');
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState('');
  const [error, setError] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(loadPasscodeFailedAttempts);

  const resetFailedAttempts = useCallback(() => {
    savePasscodeFailedAttempts(0);
    setFailedAttempts(0);
  }, []);

  const recordFailedAttempt = useCallback(() => {
    const next = failedAttempts + 1;
    savePasscodeFailedAttempts(next);
    setFailedAttempts(next);
    if (next >= MAX_FAILED_ATTEMPTS) {
      setStep('wipe-confirm');
      setError('');
    }
  }, [failedAttempts]);

  useEffect(() => {
    if (!loadSecurityQuizCompleted()) {
      setStep('security-onboarding');
      setInput('');
      setConfirmInput('');
      setError('');
      return;
    }
    if (!storedHash) {
      setStep('create');
      setInput('');
      setConfirmInput('');
      setError('');
      return;
    }
    if (!loadPasscode6Digit()) {
      setStep('update-to-6digit');
      setInput('');
      setConfirmInput('');
      setError('');
      return;
    }
    if (isLockedOut()) {
      setStep('lockout');
      return;
    }
    if (!loadRecoverySetupDone()) {
      setStep('migration-prompt');
      setInput('');
      setError('');
      return;
    }
    setStep('enter');
    setInput('');
    setError('');
  }, [storedHash]);

  const handleCreate = useCallback(() => {
    setError('');
    if (!isValidSixDigits(input)) {
      setError(`Enter ${PASSCODE_LENGTH} digits`);
      return;
    }
    setStep('confirm');
    setConfirmInput('');
  }, [input]);

  const handleConfirmCreate = useCallback(async () => {
    setError('');
    if (!isValidSixDigits(confirmInput)) {
      setError(`Enter ${PASSCODE_LENGTH} digits`);
      return;
    }
    if (input !== confirmInput) {
      setError('Passcodes do not match');
      return;
    }
    const hash = await hashPasscode(input);
    savePasscodeHash(hash);
    savePasscode6Digit(true);
    setStoredHash(hash);
    setStep('hint');
    setHintInput('');
  }, [input, confirmInput]);

  const handleHintNext = useCallback(() => {
    if (hintInput.trim()) savePasscodeHint(hintInput.trim());
    else savePasscodeHint(null);
    setStep('security-questions');
    setSecurityQ1('');
    setSecurityQ2('');
    setSecurityA1('');
    setSecurityA2('');
  }, [hintInput]);

  const handleSecurityQuestionsNext = useCallback(async () => {
    if (securityQ1 && securityQ2 && securityA1.trim() && securityA2.trim()) {
      const a1Hash = await hashForStorage(securityA1);
      const a2Hash = await hashForStorage(securityA2);
      saveSecurityQA({ q1: securityQ1, q2: securityQ2, a1Hash, a2Hash });
    } else {
      saveSecurityQA(null);
    }
    const key = generateRecoveryKey();
    const keyHash = await hashForStorage(key);
    saveRecoveryKeyHash(keyHash);
    setGeneratedRecoveryKey(key);
    setStep('recovery-key-show');
  }, [securityQ1, securityQ2, securityA1, securityA2]);

  const handleRecoveryKeyShowDone = useCallback(() => {
    saveRecoverySetupDone(true);
    setAuthenticated(true);
    setGeneratedRecoveryKey('');
  }, []);

  const handleEnter = useCallback(async () => {
    setError('');
    if (!isValidSixDigits(input)) {
      setError(`Enter ${PASSCODE_LENGTH} digits`);
      return;
    }
    const hash = await hashPasscode(input);
    if (hash !== storedHash) {
      recordFailedAttempt();
      setError(`Incorrect passcode. ${MAX_FAILED_ATTEMPTS - failedAttempts - 1} attempts remaining.`);
      setInput('');
      return;
    }
    resetFailedAttempts();
    setAuthenticated(true);
    setInput('');
  }, [input, storedHash, failedAttempts, recordFailedAttempt, resetFailedAttempts]);

  const handleForgotOptions = useCallback(() => {
    setStep('forgot-options');
    setError('');
    setRecoveryKeyInput('');
    setSecurityA1('');
    setSecurityA2('');
  }, []);

  const handleRecoveryKeySubmit = useCallback(async () => {
    setError('');
    const trimmed = recoveryKeyInput.trim();
    if (!trimmed) {
      setError('Enter your recovery key');
      return;
    }
    const storedHashKey = loadRecoveryKeyHash();
    if (!storedHashKey) {
      setError('Recovery key not set up');
      return;
    }
    const inputHash = await hashForStorage(trimmed);
    if (inputHash !== storedHashKey) {
      recordFailedAttempt();
      setError('Incorrect recovery key');
      setRecoveryKeyInput('');
      return;
    }
    resetFailedAttempts();
    setStep('reset-new-passcode');
    setInput('');
    setConfirmInput('');
    setRecoveryKeyInput('');
  }, [recoveryKeyInput, recordFailedAttempt, resetFailedAttempts]);

  const handleSecurityAnswersSubmit = useCallback(async () => {
    setError('');
    const qa = loadSecurityQA();
    if (!qa) {
      setError('Security questions not set up');
      return;
    }
    const a1Hash = await hashForStorage(securityA1.trim().toLowerCase());
    const a2Hash = await hashForStorage(securityA2.trim().toLowerCase());
    if (a1Hash !== qa.a1Hash || a2Hash !== qa.a2Hash) {
      recordFailedAttempt();
      setError('Incorrect answers');
      setSecurityA1('');
      setSecurityA2('');
      return;
    }
    resetFailedAttempts();
    setStep('reset-new-passcode');
    setInput('');
    setConfirmInput('');
    setSecurityA1('');
    setSecurityA2('');
  }, [securityA1, securityA2, recordFailedAttempt, resetFailedAttempts]);

  const handleUpdateTo6DigitVerify = useCallback(async () => {
    setError('');
    if (!input.trim()) {
      setError('Enter your current passcode');
      return;
    }
    const hash = await hashPasscode(input);
    if (hash !== storedHash) {
      setError('Incorrect passcode');
      setInput('');
      return;
    }
    setStep('update-to-6digit-confirm');
    setInput('');
    setConfirmInput('');
    setError('');
  }, [input, storedHash]);

  const handleUpdateTo6DigitConfirm = useCallback(async () => {
    setError('');
    if (!isValidSixDigits(input)) {
      setError(`Enter ${PASSCODE_LENGTH} digits`);
      return;
    }
    if (input !== confirmInput) {
      setError('Passcodes do not match');
      return;
    }
    const hash = await hashPasscode(input);
    savePasscodeHash(hash);
    savePasscode6Digit(true);
    setStoredHash(hash);
    setAuthenticated(true);
    setInput('');
    setConfirmInput('');
    setError('');
  }, [input, confirmInput]);

  const handleResetNewPasscode = useCallback(async () => {
    setError('');
    if (!isValidSixDigits(input)) {
      setError(`Enter ${PASSCODE_LENGTH} digits`);
      return;
    }
    if (input !== confirmInput) {
      setError('Passcodes do not match');
      return;
    }
    const hash = await hashPasscode(input);
    savePasscodeHash(hash);
    savePasscode6Digit(true);
    setStoredHash(hash);
    setAuthenticated(true);
    setInput('');
    setConfirmInput('');
    setStep('enter');
  }, [input, confirmInput]);

  const handleWipeConfirm = useCallback(() => {
    wipeAllAppData();
    setStoredHash(null);
    setStep('create');
    setFailedAttempts(0);
    savePasscodeFailedAttempts(0);
    savePasscodeLockoutUntil(null);
    setError('');
  }, []);

  const handleDontWipe = useCallback(() => {
    const until = new Date();
    until.setHours(until.getHours() + LOCKOUT_HOURS);
    savePasscodeLockoutUntil(until.toISOString());
    savePasscodeFailedAttempts(0);
    setFailedAttempts(0);
    setStep('lockout');
    setError('');
  }, []);

  const handleMigrationSkip = useCallback(() => {
    saveRecoverySetupDone(true);
    setStep('enter');
    setInput('');
    setError('');
  }, []);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    fontSize: '1.5rem',
    letterSpacing: '0.4em',
    textAlign: 'center',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--ui-primary-text, var(--text))',
    marginBottom: 12,
  };
  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text)',
    marginBottom: 12,
    fontSize: '0.95rem',
  };

  if (loadPasscodePaused() || authenticated) {
    return <>{children}</>;
  }

  const lockoutEnd = getLockoutEnd();
  const lockoutMessage = lockoutEnd
    ? `Recovery attempts are disabled for 24 hours until ${lockoutEnd.toLocaleString()}.`
    : 'Recovery attempts are disabled for 24 hours.';

  if (step === 'security-onboarding') {
    return (
      <div className="passcode-gate">
        <SecurityOnboarding onPass={() => setStep(storedHash ? 'enter' : 'create')} />
      </div>
    );
  }

  const content = (
    <div
      className="passcode-gate-content"
      style={{
        width: '100%',
        maxWidth: 380,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        animation: 'passcodeFadeIn 0.3s ease-out',
      }}
    >
      {/* Lockout */}
      {step === 'lockout' && (
        <>
          <h1 style={{ margin: '0 0 12px 0', fontSize: '1.5rem', fontWeight: 600, textAlign: 'center' }}>
            Too many failed attempts
          </h1>
          <p style={{ margin: '0 0 24px 0', fontSize: '0.95rem', color: 'var(--muted)', lineHeight: 1.5, textAlign: 'center' }}>
            {lockoutMessage}
          </p>
        </>
      )}

      {/* Wipe confirm */}
      {step === 'wipe-confirm' && (
        <>
          <h1 style={{ margin: '0 0 12px 0', fontSize: '1.25rem', fontWeight: 600, textAlign: 'center' }}>
            Unable to recover passcode
          </h1>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.95rem', color: 'var(--muted)', lineHeight: 1.5, textAlign: 'center' }}>
            Since you cannot remember your passcode or recovery details, the app may need to wipe all locally stored data on this device. In the future, please save your recovery key and choose a passcode you will remember. If you have previous JSON backups, you can import them after wiping.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" className="btn btn-danger" onClick={handleWipeConfirm}>
              Confirm wipe
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleDontWipe}>
              Don&apos;t wipe
            </button>
          </div>
          <p style={{ marginTop: 16, fontSize: '0.85rem', color: 'var(--muted)', textAlign: 'center' }}>
            Choosing &quot;Don&apos;t wipe&quot; will lock recovery attempts for 24 hours.
          </p>
        </>
      )}

      {/* Migration prompt */}
      {step === 'migration-prompt' && (
        <>
          <h1 style={{ margin: '0 0 12px 0', fontSize: '1.25rem', fontWeight: 600, textAlign: 'center' }}>
            Finish security setup
          </h1>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.95rem', color: 'var(--muted)', lineHeight: 1.5, textAlign: 'center' }}>
            Add a recovery key and optional security questions so you can recover your passcode if you forget it. If you skip, forgetting your passcode may require wiping local data.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setStep('hint');
                setHintInput(loadPasscodeHint() || '');
              }}
            >
              Set up recovery
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleMigrationSkip}>
              Skip for now
            </button>
          </div>
        </>
      )}

      {/* Create / Confirm / Hint / Security Q / Recovery key show */}
      {step === 'create' && (
        <>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: 600, textAlign: 'center', color: 'var(--ui-primary-text, var(--text))' }}>Create passcode</h1>
          <p style={{ margin: '0 0 24px 0', fontSize: '0.95rem', color: 'var(--ui-primary-text, var(--text))', textAlign: 'center', lineHeight: 1.5 }}>
            Choose a {PASSCODE_LENGTH}-digit passcode to protect access on this device.
          </p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={PASSCODE_LENGTH}
            autoComplete="off"
            value={input}
            onChange={(e) => { setInput(e.target.value.replace(/\D/g, '').slice(0, PASSCODE_LENGTH)); setError(''); }}
            placeholder={'•'.repeat(PASSCODE_LENGTH)}
            aria-label="Passcode"
            style={inputStyle}
          />
          {error ? <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--red)' }}>{error}</p> : null}
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleCreate}>Continue</button>
        </>
      )}

      {step === 'confirm' && (
        <>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: 600, textAlign: 'center', color: 'var(--ui-primary-text, var(--text))' }}>Confirm passcode</h1>
          <p style={{ margin: '0 0 24px 0', fontSize: '0.95rem', color: 'var(--ui-primary-text, var(--text))', textAlign: 'center', lineHeight: 1.5 }}>Re-enter your {PASSCODE_LENGTH}-digit passcode.</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={PASSCODE_LENGTH}
            autoComplete="off"
            value={confirmInput}
            onChange={(e) => { setConfirmInput(e.target.value.replace(/\D/g, '').slice(0, PASSCODE_LENGTH)); setError(''); }}
            placeholder={'•'.repeat(PASSCODE_LENGTH)}
            aria-label="Confirm passcode"
            style={inputStyle}
          />
          {error ? <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--red)' }}>{error}</p> : null}
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleConfirmCreate}>Save passcode</button>
        </>
      )}

      {step === 'hint' && (
        <>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 600, textAlign: 'center' }}>Password hint (optional)</h1>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
            A hint can be shown if you forget your passcode. It does not allow reset by itself. Leave blank to skip.
          </p>
          <input
            type="text"
            autoComplete="off"
            value={hintInput}
            onChange={(e) => setHintInput(e.target.value)}
            placeholder="e.g. Last 4 of my phone"
            style={{ ...inputStyle, letterSpacing: 'normal' }}
          />
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleHintNext}>Continue</button>
        </>
      )}

      {step === 'security-questions' && (
        <>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 600, textAlign: 'center' }}>Security questions (optional)</h1>
          <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
            Answer two questions to recover your passcode later. You can skip; recovery will be limited without them.
          </p>
          <label style={{ fontSize: '0.9rem', marginBottom: 4 }}>Question 1</label>
          <select
            value={securityQ1}
            onChange={(e) => setSecurityQ1(e.target.value)}
            style={selectStyle}
          >
            <option value="">— Skip security questions —</option>
            {SECURITY_QUESTION_OPTIONS.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
          {securityQ1 && (
            <>
              <input type="text" autoComplete="off" value={securityA1} onChange={(e) => setSecurityA1(e.target.value)} placeholder="Answer 1" style={inputStyle} />
              <label style={{ fontSize: '0.9rem', marginBottom: 4 }}>Question 2</label>
              <select value={securityQ2} onChange={(e) => setSecurityQ2(e.target.value)} style={selectStyle}>
                <option value="">— Select —</option>
                {SECURITY_QUESTION_OPTIONS.filter((q) => q !== securityQ1).map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
              {securityQ2 && (
                <input type="text" autoComplete="off" value={securityA2} onChange={(e) => setSecurityA2(e.target.value)} placeholder="Answer 2" style={inputStyle} />
              )}
            </>
          )}
          <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleSecurityQuestionsNext}>
            Continue
          </button>
        </>
      )}

      {step === 'recovery-key-show' && (
        <>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 600, textAlign: 'center' }}>Recovery key</h1>
          <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
            This is the best way to recover your passcode. Save it somewhere safe; it will not be shown again in full. You can regenerate it later in Settings after entering your passcode.
          </p>
          <div style={{ padding: 16, background: 'var(--surface)', borderRadius: 10, fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: 2, textAlign: 'center', marginBottom: 12 }}>
            {generatedRecoveryKey}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginBottom: 8 }}
            onClick={() => navigator.clipboard?.writeText(generatedRecoveryKey)}
          >
            Copy key
          </button>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: 'var(--red)', textAlign: 'center', lineHeight: 1.5 }}>
            Without saving this key (or security questions), passcode recovery may require wiping local data.
          </p>
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleRecoveryKeyShowDone}>
            I have saved my recovery key
          </button>
        </>
      )}

      {/* Enter */}
      {step === 'enter' && (
        <>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: 600, textAlign: 'center', color: 'var(--ui-primary-text, var(--text))' }}>Enter Passcode</h1>
          <p style={{ margin: '0 0 24px 0', fontSize: '0.95rem', color: 'var(--ui-primary-text, var(--text))', textAlign: 'center', lineHeight: 1.5 }}>
            Enter your {PASSCODE_LENGTH}-digit passcode to continue.
          </p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={PASSCODE_LENGTH}
            autoComplete="off"
            value={input}
            onChange={(e) => { setInput(e.target.value.replace(/\D/g, '').slice(0, PASSCODE_LENGTH)); setError(''); }}
            placeholder={'•'.repeat(PASSCODE_LENGTH)}
            aria-label="Passcode"
            style={inputStyle}
          />
          {error ? <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--red)' }}>{error}</p> : null}
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleEnter}>Continue</button>
          <button type="button" className="btn clear-btn" style={{ width: '100%', padding: '10px 16px', fontSize: '0.9rem', marginTop: 18 }} onClick={handleForgotOptions}>
            Forgot passcode?
          </button>
        </>
      )}

      {step === 'update-to-6digit' && (
        <>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 600, textAlign: 'center', color: 'var(--ui-primary-text, var(--text))' }}>Update to 6-digit passcode</h1>
          <p style={{ margin: '0 0 24px 0', fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', textAlign: 'center', lineHeight: 1.5 }}>
            This app now requires a 6-digit passcode. Enter your current passcode to continue, then set a new 6-digit one.
          </p>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={input}
            onChange={(e) => { setInput(e.target.value.replace(/\D/g, '')); setError(''); }}
            placeholder="Current passcode"
            aria-label="Current passcode"
            style={inputStyle}
          />
          {error ? <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--red)' }}>{error}</p> : null}
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleUpdateTo6DigitVerify}>Continue</button>
        </>
      )}

      {step === 'update-to-6digit-confirm' && (
        <>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 600, textAlign: 'center', color: 'var(--ui-primary-text, var(--text))' }}>Set new 6-digit passcode</h1>
          <p style={{ margin: '0 0 24px 0', fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', textAlign: 'center', lineHeight: 1.5 }}>Enter and confirm your new 6-digit passcode.</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={PASSCODE_LENGTH}
            autoComplete="off"
            value={input}
            onChange={(e) => { setInput(e.target.value.replace(/\D/g, '').slice(0, PASSCODE_LENGTH)); setError(''); }}
            placeholder={'•'.repeat(PASSCODE_LENGTH)}
            aria-label="New passcode"
            style={inputStyle}
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={PASSCODE_LENGTH}
            autoComplete="off"
            value={confirmInput}
            onChange={(e) => { setConfirmInput(e.target.value.replace(/\D/g, '').slice(0, PASSCODE_LENGTH)); setError(''); }}
            placeholder={'•'.repeat(PASSCODE_LENGTH)}
            aria-label="Confirm new passcode"
            style={inputStyle}
          />
          {error ? <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--red)' }}>{error}</p> : null}
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleUpdateTo6DigitConfirm}>Save new passcode</button>
        </>
      )}

      {/* Forgot options */}
      {step === 'forgot-options' && (
        <>
          <h1 style={{ margin: '0 0 12px 0', fontSize: '1.25rem', fontWeight: 600, textAlign: 'center' }}>Recover passcode</h1>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
            Use your recovery key or security questions to reset your passcode. The hint alone does not allow reset.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loadRecoveryKeyHash() && (
              <button type="button" className="btn btn-primary" onClick={() => setStep('recovery-key-enter')}>Use recovery key</button>
            )}
            {loadSecurityQA() && (
              <button type="button" className="btn btn-primary" onClick={() => setStep('security-answers-enter')}>Answer security questions</button>
            )}
            {loadPasscodeHint() && (
              <button type="button" className="btn btn-secondary" onClick={() => setStep('hint-show')}>View password hint</button>
            )}
            {!loadRecoveryKeyHash() && !loadSecurityQA() && !loadPasscodeHint() && (
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)', textAlign: 'center' }}>No recovery options were set up. You may need to wipe local data.</p>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => setStep('enter')}>Back</button>
          </div>
        </>
      )}

      {step === 'recovery-key-enter' && (
        <>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 600, textAlign: 'center' }}>Enter recovery key</h1>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
            Paste or type the recovery key you saved during setup.
          </p>
          <input
            type="text"
            autoComplete="off"
            value={recoveryKeyInput}
            onChange={(e) => { setRecoveryKeyInput(e.target.value.trim()); setError(''); }}
            placeholder="Recovery key"
            style={{ ...inputStyle, letterSpacing: 2, fontFamily: 'monospace' }}
          />
          {error ? <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--red)' }}>{error}</p> : null}
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleRecoveryKeySubmit}>Verify and reset passcode</button>
          <button type="button" className="btn btn-secondary" onClick={() => setStep('forgot-options')}>Back</button>
        </>
      )}

      {step === 'security-answers-enter' && (() => {
        const qa = loadSecurityQA();
        if (!qa) return null;
        return (
          <>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 600, textAlign: 'center' }}>Security questions</h1>
            <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.5 }}>{qa.q1}</p>
            <input type="text" autoComplete="off" value={securityA1} onChange={(e) => setSecurityA1(e.target.value)} placeholder="Answer 1" style={inputStyle} />
            <p style={{ margin: '12px 0 4px 0', fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.5 }}>{qa.q2}</p>
            <input type="text" autoComplete="off" value={securityA2} onChange={(e) => setSecurityA2(e.target.value)} placeholder="Answer 2" style={inputStyle} />
            {error ? <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--red)' }}>{error}</p> : null}
            <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleSecurityAnswersSubmit}>Verify and reset passcode</button>
            <button type="button" className="btn btn-secondary" onClick={() => setStep('forgot-options')}>Back</button>
          </>
        );
      })()}

      {step === 'hint-show' && (
        <>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 600, textAlign: 'center' }}>Password hint</h1>
          <p style={{ margin: '0 0 24px 0', padding: 16, background: 'var(--surface)', borderRadius: 10, color: 'var(--text)' }}>
            {loadPasscodeHint() || 'No hint set.'}
          </p>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--muted)', textAlign: 'center' }}>
            The hint alone does not allow passcode reset. Use recovery key or security questions if you set them up.
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => setStep('forgot-options')}>Back</button>
        </>
      )}

      {step === 'reset-new-passcode' && (
        <>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 600, textAlign: 'center', color: 'var(--ui-primary-text, var(--text))' }}>Set new passcode</h1>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', textAlign: 'center', lineHeight: 1.5 }}>Enter and confirm your new {PASSCODE_LENGTH}-digit passcode.</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={PASSCODE_LENGTH}
            autoComplete="off"
            value={input}
            onChange={(e) => { setInput(e.target.value.replace(/\D/g, '').slice(0, PASSCODE_LENGTH)); setError(''); }}
            placeholder="New passcode"
            style={inputStyle}
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={PASSCODE_LENGTH}
            autoComplete="off"
            value={confirmInput}
            onChange={(e) => { setConfirmInput(e.target.value.replace(/\D/g, '').slice(0, PASSCODE_LENGTH)); setError(''); }}
            placeholder="Confirm new passcode"
            style={inputStyle}
          />
          {error ? <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--red)' }}>{error}</p> : null}
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleResetNewPasscode}>Save new passcode</button>
        </>
      )}
    </div>
  );

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
      {content}
      <style>{`
        .passcode-gate { background: var(--bg); }
        @keyframes passcodeFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
