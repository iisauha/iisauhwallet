import { useCallback, useEffect, useRef, useState } from 'react';
import { OnboardingGuide, isOnboardingDone, markOnboardingDone } from '../onboarding/OnboardingGuide';
import {
  loadPasscodeHash,
  savePasscodeHash,
  hashForStorage,
  createPasscodeHash,
  verifyPasscode,
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
  loadPasscodePaused,
  loadShowWelcomeScreen,
  loadAutoLockMinutes,
  loadPasscode6Digit,
  savePasscode6Digit,
  generateRecoveryKey,
  wipeAllAppData,
  loadUserDisplayName,
  loadUserProfileImage,
  type SecurityQA,
} from '../../state/storage';
import {
  lockCrypto,
  unlockWithPasscode,
  unlockWithRecoveryKey,
  rewrapDeviceKeyWithPasscode,
  wrapDeviceKeyWithPasscode,
  wrapDeviceKeyWithRecoveryKey,
  resetDeviceKey,
} from '../../state/crypto';
import { initSync, stopSync, pullFromSupabase, hasRemoteData, saveSyncPassphrase, loadSyncPassphrase } from '../../state/sync';
import { RESTORE_PASSCODE_KEY } from '../auth/CloudRestoreGate';
import { isBiometricAvailable, isBiometricEnabled, enrollBiometric, authenticateWithBiometric } from '../../state/biometric';
import { supabase } from '../../state/supabase';
import { useAuth } from '../../state/AuthContext';
import { useLedgerStore } from '../../state/store';
import { Select } from '../../ui/Select';
import { WelcomeIntro } from './WelcomeIntro';

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_HOURS = 24;

type Step =
  | 'welcome-intro'
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

function WelcomeScreen({ name, profileImage, visible }: { name: string; profileImage: string | null; visible: boolean }) {
  const [photoVisible, setPhotoVisible] = useState(false);
  const [greetVisible, setGreetVisible] = useState(false);
  const [nameVisible, setNameVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setPhotoVisible(true), 30);
    const t2 = setTimeout(() => setGreetVisible(true), 120);
    const t3 = setTimeout(() => setNameVisible(true), 230);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
        opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease',
      }}
    >
      <div
        style={{
          width: 110, height: 110, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          opacity: photoVisible ? 1 : 0, transition: 'opacity 0.6s ease, transform 0.6s ease',
          transform: photoVisible ? 'scale(1)' : 'scale(0.85)',
          background: profileImage ? 'transparent' : 'var(--surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {profileImage
          ? <img src={profileImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
          : <span style={{ fontSize: '2.8rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--app-font-family)' }}>{name.charAt(0).toUpperCase()}</span>
        }
      </div>
      <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
        <div
          style={{
            fontSize: '20px', fontWeight: 400, color: 'var(--muted)',
            fontFamily: 'var(--app-font-family)',
            opacity: greetVisible ? 1 : 0,
            transform: greetVisible ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.55s ease, transform 0.55s ease',
          }}
        >
          Welcome back,
        </div>
        <div
          style={{
            fontSize: '38px', fontWeight: 700, color: 'var(--accent)',
            fontFamily: 'var(--app-font-family)',
            opacity: nameVisible ? 1 : 0,
            transform: nameVisible ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 0.55s ease, transform 0.55s ease',
          }}
        >
          {name}
        </div>
      </div>
    </div>
  );
}

export function PasscodeGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [storedHash, setStoredHash] = useState<string | null>(() => loadPasscodeHash());
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const shouldShowWelcomeInit = loadPasscodePaused() && loadShowWelcomeScreen() && !!loadUserDisplayName();
  const [showWelcome, setShowWelcome] = useState(shouldShowWelcomeInit);
  const [welcomeVisible, setWelcomeVisible] = useState(shouldShowWelcomeInit);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const justLoggedInRef = useRef(false);
  const confirmedPasscodeRef = useRef('');
  const [biometricPrompt, setBiometricPrompt] = useState(false);
  const biometricTriedRef = useRef(false);
  const [biometricDismissed, setBiometricDismissed] = useState(false);
  const passwordFieldRef = useRef<HTMLInputElement | null>(null);

  // Auto-unlock after cloud restore (CloudRestoreGate saved passcode in sessionStorage)
  useEffect(() => {
    const savedPass = sessionStorage.getItem(RESTORE_PASSCODE_KEY);
    if (!savedPass || !storedHash || authenticated) return;
    sessionStorage.removeItem(RESTORE_PASSCODE_KEY);
    (async () => {
      try {
        const matches = await verifyPasscode(savedPass, storedHash);
        if (!matches) return;
        await unlockWithPasscode(savedPass);
        useLedgerStore.getState().actions.reload();
        await saveSyncPassphrase(savedPass);
        initSync(savedPass);
        setAuthenticated(true);
      } catch (e) {
        console.error('[PasscodeGate] auto-unlock after restore failed:', e);
      }
    })();
  }, [storedHash, authenticated]);

  // Auto-lock on inactivity (skip when passcode is paused — no auth gate to show).
  // CRITICAL: pause timer when app is backgrounded (iOS PWAs fire timers while hidden,
  // which would clear crypto caches and corrupt the UI when the user returns).
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef(Date.now());
  useEffect(() => {
    const minutes = loadAutoLockMinutes();
    if (!storedHash || minutes === 0 || loadPasscodePaused()) return;
    const ms = minutes * 60 * 1000;

    function clearTimer() {
      if (inactivityTimerRef.current) { clearTimeout(inactivityTimerRef.current); inactivityTimerRef.current = null; }
    }

    function doLock() {
      clearTimer();
      stopSync();
      lockCrypto();
      biometricTriedRef.current = false; // reset so Face ID triggers again on next unlock
      setAuthenticated(false);
    }

    function startTimer() {
      clearTimer();
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, ms - elapsed);
      inactivityTimerRef.current = setTimeout(doLock, remaining);
    }

    function onActivity() {
      lastActivityRef.current = Date.now();
      // Only restart timer if app is visible (don't start timers while backgrounded)
      if (!document.hidden) startTimer();
    }

    function onVisibilityChange() {
      if (document.hidden) {
        // App going to background — pause the timer entirely
        clearTimer();
      } else {
        // App coming back — check if lock period elapsed while hidden
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed >= ms) {
          doLock();
        } else {
          startTimer();
        }
      }
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibilityChange);
    startTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearTimer();
    };
  }, [storedHash]);

  // Auto-trigger Face ID / Touch ID when entering passcode screen
  useEffect(() => {
    if (authenticated || biometricTriedRef.current) return;
    if (!storedHash || !isBiometricEnabled() || loadPasscodePaused()) return;
    // Brief delay so the UI renders before Face ID prompt
    const t = setTimeout(async () => {
      biometricTriedRef.current = true;
      const passcode = await authenticateWithBiometric();
      if (!passcode) {
        // Face ID was dismissed or failed — make field tappable and auto-focus to pop keyboard
        setBiometricDismissed(true);
        setTimeout(() => {
          const el = passwordFieldRef.current;
          if (el) {
            el.removeAttribute('readonly');
            el.focus();
            el.click();
          }
        }, 300);
        return;
      }
      // Biometric succeeded — unlock
      const matches = await verifyPasscode(passcode, storedHash);
      if (!matches) return;
      await unlockWithPasscode(passcode);
      const localData = useLedgerStore.getState().data;
      const hasLocalData = localData && (localData.banks?.length > 0 || localData.cards?.length > 0 || localData.purchases?.length > 0);
      if (!hasLocalData) {
        try {
          const remote = await hasRemoteData();
          if (remote) await pullFromSupabase(passcode);
        } catch {}
      }
      useLedgerStore.getState().actions.reload();
      saveSyncPassphrase(passcode);
      initSync(passcode);
      setAuthenticated(true);
    }, 100);
    return () => clearTimeout(t);
  }, [storedHash, authenticated]);

  const [step, setStep] = useState<Step>(() => {
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
  const [failedAttempts, setFailedAttempts] = useState(() => loadPasscodeFailedAttempts());
  const [delayUntil, setDelayUntil] = useState(0); // ms timestamp; 0 = no delay
  const [countdown, setCountdown] = useState(0); // seconds remaining

  // Tick countdown down while a delay is active.
  useEffect(() => {
    if (delayUntil === 0) return;
    const tick = () => {
      const remaining = Math.ceil((delayUntil - Date.now()) / 1000);
      if (remaining <= 0) { setCountdown(0); setDelayUntil(0); }
      else setCountdown(remaining);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [delayUntil]);

  const resetFailedAttempts = useCallback(() => {
    savePasscodeFailedAttempts(0);
    setFailedAttempts(0);
    setDelayUntil(0);
    setCountdown(0);
  }, []);

  const recordFailedAttempt = useCallback(() => {
    const next = failedAttempts + 1;
    savePasscodeFailedAttempts(next);
    setFailedAttempts(next);
    if (next >= MAX_FAILED_ATTEMPTS) {
      setStep('wipe-confirm');
      setError('');
      return;
    }
    // Progressive delays: 3 fails → 2s, 5 fails → 5s, 7 fails → 10s
    let delaySec = 0;
    if (next >= 7) delaySec = 10;
    else if (next >= 5) delaySec = 5;
    else if (next >= 3) delaySec = 2;
    if (delaySec > 0) setDelayUntil(Date.now() + delaySec * 1000);
  }, [failedAttempts]);

  useEffect(() => {
    if (!storedHash) {
      setStep('welcome-intro');
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
    const hash = await createPasscodeHash(input);
    savePasscodeHash(hash);
    savePasscode6Digit(true);
    setStoredHash(hash);
    await wrapDeviceKeyWithPasscode(input);
    saveSyncPassphrase(input);
    confirmedPasscodeRef.current = input;
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
    await wrapDeviceKeyWithRecoveryKey(key);
    setGeneratedRecoveryKey(key);
    setStep('recovery-key-show');
  }, [securityQ1, securityQ2, securityA1, securityA2]);

  const handleRecoveryKeyShowDone = useCallback(() => {
    saveRecoverySetupDone(true);
    setGeneratedRecoveryKey('');
    if (confirmedPasscodeRef.current) {
      initSync(confirmedPasscodeRef.current);
      confirmedPasscodeRef.current = '';
    }
    if (!isOnboardingDone()) {
      setShowOnboarding(true);
    } else {
      setAuthenticated(true);
    }
  }, []);

  const handleEnter = useCallback(async () => {
    setError('');
    if (delayUntil > 0 && Date.now() < delayUntil) return;
    if (!isValidSixDigits(input)) {
      setError(`Enter ${PASSCODE_LENGTH} digits`);
      return;
    }
    const matches = storedHash ? await verifyPasscode(input, storedHash) : false;
    if (!matches) {
      recordFailedAttempt();
      setError(`Incorrect passcode. ${MAX_FAILED_ATTEMPTS - failedAttempts - 1} attempts remaining.`);
      setInput('');
      return;
    }
    // Migrate legacy SHA-256 hash to PBKDF2 on first successful login.
    if (storedHash && !storedHash.startsWith('pbkdf2v1:')) {
      const newHash = await createPasscodeHash(input);
      savePasscodeHash(newHash);
      setStoredHash(newHash);
    }
    // Unlock device key (migrates plaintext→wrapped on first login, or unwraps on subsequent).
    await unlockWithPasscode(input);
    // If this device has no local data but Supabase has data, pull it down first.
    const localData = useLedgerStore.getState().data;
    const hasLocalData = localData && (localData.banks?.length > 0 || localData.cards?.length > 0 || localData.purchases?.length > 0);
    if (!hasLocalData) {
      try {
        const remote = await hasRemoteData();
        if (remote) {
          await pullFromSupabase(input);
        }
      } catch {}
    }
    useLedgerStore.getState().actions.reload();
    saveSyncPassphrase(input);
    initSync(input);
    resetFailedAttempts();
    justLoggedInRef.current = true;
    // Check if we should offer biometric enrollment
    if (!isBiometricEnabled()) {
      const available = await isBiometricAvailable();
      if (available) {
        confirmedPasscodeRef.current = input;
        setBiometricPrompt(true);
      }
    }
    setAuthenticated(true);
    setInput('');
  }, [input, storedHash, failedAttempts, delayUntil, recordFailedAttempt, resetFailedAttempts]);

  const handlePasswordUnlock = useCallback(async () => {
    if (!passwordInput || passwordLoading) return;
    if (!user?.email) { setError('No email found. Sign out and sign in again.'); return; }
    setPasswordLoading(true);
    setError('');
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordInput,
      });
      if (authError) {
        setError('Incorrect password.');
        setPasswordLoading(false);
        return;
      }
      // Password verified. Use the saved sync passphrase to unlock crypto.
      const syncPass = await loadSyncPassphrase();
      if (syncPass) {
        await unlockWithPasscode(syncPass);
        const localData = useLedgerStore.getState().data;
        const hasLocalData = localData && (localData.banks?.length > 0 || localData.cards?.length > 0 || localData.purchases?.length > 0);
        if (!hasLocalData) {
          try {
            const remote = await hasRemoteData();
            if (remote) await pullFromSupabase(syncPass);
          } catch {}
        }
        useLedgerStore.getState().actions.reload();
        saveSyncPassphrase(syncPass);
        initSync(syncPass);
        if (!isBiometricEnabled()) {
          const available = await isBiometricAvailable();
          if (available) {
            confirmedPasscodeRef.current = syncPass;
            setBiometricPrompt(true);
          }
        }
        setAuthenticated(true);
      } else {
        setError('Could not unlock. Try your 6-digit passcode instead.');
      }
    } catch {
      setError('Something went wrong. Try again.');
    }
    setPasswordLoading(false);
    setPasswordInput('');
  }, [passwordInput, passwordLoading, user]);

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
    // Try to unlock device key so it can be re-wrapped with the new passcode.
    await unlockWithRecoveryKey(trimmed);
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
    const matches = storedHash ? await verifyPasscode(input, storedHash) : false;
    if (!matches) {
      setError('Incorrect passcode');
      setInput('');
      return;
    }
    // Migrate device key now while we still have the old passcode.
    await unlockWithPasscode(input);
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
    const hash = await createPasscodeHash(input);
    savePasscodeHash(hash);
    savePasscode6Digit(true);
    setStoredHash(hash);
    await rewrapDeviceKeyWithPasscode(input);
    useLedgerStore.getState().actions.reload();
    saveSyncPassphrase(input);
    initSync(input);
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
    const hash = await createPasscodeHash(input);
    savePasscodeHash(hash);
    savePasscode6Digit(true);
    setStoredHash(hash);
    await rewrapDeviceKeyWithPasscode(input);
    useLedgerStore.getState().actions.reload();
    saveSyncPassphrase(input);
    initSync(input);
    setAuthenticated(true);
    setInput('');
    setConfirmInput('');
    setStep('enter');
  }, [input, confirmInput]);

  const handleWipeConfirm = useCallback(async () => {
    wipeAllAppData();
    await resetDeviceKey();
    useLedgerStore.getState().actions.reload();
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
    markOnboardingDone();
    setShowSkipWarning(false);
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
    color: 'transparent',
    textShadow: '0 0 0 var(--ui-primary-text, var(--text))',
    caretColor: 'var(--ui-primary-text, var(--text))',
    marginBottom: 12,
    WebkitTextSecurity: 'disc',
  } as React.CSSProperties;
  const textInputStyle: React.CSSProperties = {
    ...inputStyle,
    fontSize: '1rem',
    letterSpacing: 'normal',
    textAlign: 'left',
  };
  const selectStyle: React.CSSProperties = {
    width: '100%',
    marginBottom: 12,
    fontSize: '0.95rem',
  };

  useEffect(() => {
    if (!authenticated || !justLoggedInRef.current) return;
    justLoggedInRef.current = false;
    if (!loadShowWelcomeScreen()) return;
    const name = loadUserDisplayName();
    if (!name) return;
    setShowWelcome(true);
    setWelcomeVisible(true);
    const t1 = setTimeout(() => setWelcomeVisible(false), 1600);
    const t2 = setTimeout(() => setShowWelcome(false), 1950);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [authenticated]);

  // Start sync when passcode is paused (use saved passphrase)
  useEffect(() => {
    if (!loadPasscodePaused()) return;
    loadSyncPassphrase().then((pass) => {
      if (pass) initSync(pass);
    });
    return () => { stopSync(); };
  }, []);

  // Dismiss welcome screen after animation (timers only — state is initialized synchronously above)
  useEffect(() => {
    if (!showWelcome) return;
    const t1 = setTimeout(() => setWelcomeVisible(false), 1600);
    const t2 = setTimeout(() => setShowWelcome(false), 1950);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [showWelcome]);

  if (showOnboarding) {
    return (
      <OnboardingGuide
        onDone={() => {
          markOnboardingDone();
          setShowOnboarding(false);
          setAuthenticated(true);
        }}
      />
    );
  }

  if (showWelcome) {
    return (
      <WelcomeScreen
        name={loadUserDisplayName() || ''}
        profileImage={loadUserProfileImage()}
        visible={welcomeVisible}
      />
    );
  }

  if (loadPasscodePaused() || authenticated) {
    return (
      <>
        {children}
        {biometricPrompt && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 99999, padding: 20,
          }}>
            <div style={{
              background: 'var(--surface, #1a1a1a)', borderRadius: 16, padding: 24,
              maxWidth: 340, width: '100%', textAlign: 'center',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #4a9eff)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="3" width="14" height="18" rx="3" />
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 15v2" />
                </svg>
              </div>
              <h3 style={{ margin: '0 0 8px', color: 'var(--ui-primary-text, var(--text, #fff))' }}>Enable Face ID?</h3>
              <p style={{ margin: '0 0 20px', fontSize: '0.88rem', color: 'var(--ui-secondary-text, #999)', lineHeight: 1.45 }}>
                Unlock the app with Face ID or Touch ID instead of typing your passcode every time.
              </p>
              <button
                type="button"
                style={{
                  width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
                  background: 'var(--accent, #4a9eff)', color: '#fff', fontSize: '1rem',
                  fontWeight: 600, cursor: 'pointer', marginBottom: 10,
                }}
                onClick={async () => {
                  const pass = confirmedPasscodeRef.current;
                  if (pass) await enrollBiometric(pass, loadUserDisplayName() || undefined);
                  confirmedPasscodeRef.current = '';
                  setBiometricPrompt(false);
                }}
              >
                Enable
              </button>
              <button
                type="button"
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
                  background: 'transparent', color: 'var(--ui-secondary-text, #999)',
                  fontSize: '0.88rem', cursor: 'pointer',
                }}
                onClick={() => {
                  confirmedPasscodeRef.current = '';
                  setBiometricPrompt(false);
                }}
              >
                Not now
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (step === 'welcome-intro') {
    return <WelcomeIntro onDone={() => setStep('create')} />;
  }

  const lockoutEnd = getLockoutEnd();
  const lockoutMessage = lockoutEnd
    ? `Recovery attempts are disabled for 24 hours until ${lockoutEnd.toLocaleString()}.`
    : 'Recovery attempts are disabled for 24 hours.';

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
          <p style={{ margin: '0 0 24px 0', fontSize: '0.95rem', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.5, textAlign: 'center' }}>
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
          <p style={{ margin: '0 0 16px 0', fontSize: '0.95rem', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.5, textAlign: 'center' }}>
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
          <p style={{ marginTop: 16, fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))', textAlign: 'center' }}>
            Choosing &quot;Don&apos;t wipe&quot; will lock recovery attempts for 24 hours.
          </p>
        </>
      )}

      {/* Migration prompt */}
      {step === 'migration-prompt' && !showSkipWarning && (
        <>
          <h1 style={{ margin: '0 0 12px 0', fontSize: '1.25rem', fontWeight: 600, textAlign: 'center' }}>
            Finish security setup
          </h1>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.95rem', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.5, textAlign: 'center' }}>
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
            <button type="button" className="btn btn-secondary" onClick={() => setShowSkipWarning(true)}>
              Skip
            </button>
          </div>
        </>
      )}

      {/* Skip confirmation warning */}
      {step === 'migration-prompt' && showSkipWarning && (
        <>
          <h1 style={{ margin: '0 0 12px 0', fontSize: '1.2rem', fontWeight: 600, textAlign: 'center' }}>
            Are you sure?
          </h1>
          <div style={{ margin: '0 0 20px 0', padding: '14px 16px', background: 'color-mix(in srgb, var(--red, #ef4444) 12%, transparent)', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--red, #ef4444) 30%, transparent)' }}>
            <p style={{ margin: '0 0 10px 0', fontSize: '0.92rem', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.55 }}>
              By skipping, you acknowledge:
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.65 }}>
              <li>Because you are skipping setup, <strong>you will not receive a recovery key.</strong></li>
              <li>If you forget your passcode, the only way back into the app is to enter an incorrect passcode 10 times. After 10 failed attempts, an option to <strong>permanently wipe all your data</strong> will appear. There is no other way in.</li>
              <li>There are <strong>no exceptions</strong> to this. By skipping, you are assuming this risk entirely.</li>
            </ul>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" className="btn btn-primary" onClick={() => setShowSkipWarning(false)}>
              Go back and set up recovery
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleMigrationSkip}>
              I understand, skip anyway
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
            type="tel"
            inputMode="numeric"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            maxLength={PASSCODE_LENGTH}
            autoComplete="one-time-code"
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
            type="tel"
            inputMode="numeric"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            maxLength={PASSCODE_LENGTH}
            autoComplete="one-time-code"
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
          <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', textAlign: 'center', lineHeight: 1.5 }}>
            A hint can be shown if you forget your passcode. It does not allow reset by itself. Leave blank to skip.
          </p>
          <input
            type="text"
            autoComplete="one-time-code"
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
          <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', textAlign: 'center', lineHeight: 1.5 }}>
            Answer two questions to recover your passcode later. You can skip; recovery will be limited without them.
          </p>
          <label style={{ fontSize: '0.9rem', marginBottom: 4 }}>Question 1</label>
          <Select
            value={securityQ1}
            onChange={(e) => setSecurityQ1(e.target.value)}
            style={selectStyle}
          >
            <option value="">- Skip security questions -</option>
            {SECURITY_QUESTION_OPTIONS.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </Select>
          {securityQ1 && (
            <>
              <input type="text" autoComplete="one-time-code" value={securityA1} onChange={(e) => setSecurityA1(e.target.value)} placeholder="Answer 1" style={textInputStyle} />
              <label style={{ fontSize: '0.9rem', marginBottom: 4 }}>Question 2</label>
              <Select value={securityQ2} onChange={(e) => setSecurityQ2(e.target.value)} style={selectStyle}>
                <option value="">Select...</option>
                {SECURITY_QUESTION_OPTIONS.filter((q) => q !== securityQ1).map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </Select>
              {securityQ2 && (
                <input type="text" autoComplete="one-time-code" value={securityA2} onChange={(e) => setSecurityA2(e.target.value)} placeholder="Answer 2" style={textInputStyle} />
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
          <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', textAlign: 'center', lineHeight: 1.5 }}>
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
          {/* Logo */}
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
          <h1 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: 600, textAlign: 'center', color: 'var(--ui-primary-text, var(--text))' }}>Welcome Back</h1>
          <p style={{ margin: '0 0 20px 0', fontSize: '0.95rem', color: 'var(--muted, #888)', textAlign: 'center', lineHeight: 1.5 }}>
            {isBiometricEnabled() ? 'Use Face ID or enter your password to continue.' : 'Enter your password to unlock.'}
          </p>
          {user?.email ? (
            <div style={{ marginBottom: 12, padding: '10px 16px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.9rem', color: 'var(--muted)', textAlign: 'center' }}>
              {user.email}
            </div>
          ) : null}
          <input
            ref={passwordFieldRef}
            type="password"
            autoComplete="current-password"
            value={passwordInput}
            onChange={(e) => { setPasswordInput(e.target.value); setError(''); }}
            placeholder="Password"
            aria-label="Password"
            disabled={isBiometricEnabled() && !biometricDismissed && !passwordInput}
            style={{
              width: '100%',
              padding: '14px 16px',
              fontSize: '1rem',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--ui-primary-text, var(--text))',
              marginBottom: 12,
              boxSizing: 'border-box',
              opacity: isBiometricEnabled() && !biometricDismissed && !passwordInput ? 0.4 : 1,
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordUnlock(); }}
          />
          {error ? <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--red)' }}>{error}</p> : null}
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', opacity: passwordLoading ? 0.6 : 1 }}
            onClick={handlePasswordUnlock}
            disabled={passwordLoading}
          >
            {passwordLoading ? 'Unlocking...' : 'Unlock'}
          </button>
          <button type="button" className="btn clear-btn" style={{ width: '100%', padding: '10px 16px', fontSize: '0.9rem', marginTop: 18 }} onClick={handleForgotOptions}>
            Forgot password?
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
            type="tel"
            inputMode="numeric"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            autoComplete="one-time-code"
            value={input}
            onChange={(e) => { setInput(e.target.value.replace(/\D/g, '')); setError(''); }}
            placeholder={'•'.repeat(PASSCODE_LENGTH)}
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
            type="tel"
            inputMode="numeric"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            maxLength={PASSCODE_LENGTH}
            autoComplete="one-time-code"
            value={input}
            onChange={(e) => { setInput(e.target.value.replace(/\D/g, '').slice(0, PASSCODE_LENGTH)); setError(''); }}
            placeholder={'•'.repeat(PASSCODE_LENGTH)}
            aria-label="New passcode"
            style={inputStyle}
          />
          <input
            type="tel"
            inputMode="numeric"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            maxLength={PASSCODE_LENGTH}
            autoComplete="one-time-code"
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
          <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', textAlign: 'center', lineHeight: 1.5 }}>
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
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', textAlign: 'center' }}>No recovery options were set up. You may need to wipe local data.</p>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => setStep('enter')}>Back</button>
          </div>
        </>
      )}

      {step === 'recovery-key-enter' && (
        <>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 600, textAlign: 'center' }}>Enter recovery key</h1>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', textAlign: 'center', lineHeight: 1.5 }}>
            Paste or type the recovery key you saved during setup.
          </p>
          <input
            type="text"
            autoComplete="one-time-code"
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
            <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.5 }}>{qa.q1}</p>
            <input type="text" autoComplete="one-time-code" value={securityA1} onChange={(e) => setSecurityA1(e.target.value)} placeholder="Answer 1" style={textInputStyle} />
            <p style={{ margin: '12px 0 4px 0', fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.5 }}>{qa.q2}</p>
            <input type="text" autoComplete="one-time-code" value={securityA2} onChange={(e) => setSecurityA2(e.target.value)} placeholder="Answer 2" style={textInputStyle} />
            {error ? <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--red)' }}>{error}</p> : null}
            <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleSecurityAnswersSubmit}>Verify and reset passcode</button>
            <button type="button" className="btn btn-secondary" onClick={() => setStep('forgot-options')}>Back</button>
          </>
        );
      })()}

      {step === 'hint-show' && (
        <>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 600, textAlign: 'center' }}>Password hint</h1>
          <p style={{ margin: '0 0 24px 0', padding: 16, background: 'var(--surface)', borderRadius: 10, color: 'var(--ui-primary-text, var(--text))' }}>
            {loadPasscodeHint() || 'No hint set.'}
          </p>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--text))', textAlign: 'center' }}>
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
            type="tel"
            inputMode="numeric"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            maxLength={PASSCODE_LENGTH}
            autoComplete="one-time-code"
            value={input}
            onChange={(e) => { setInput(e.target.value.replace(/\D/g, '').slice(0, PASSCODE_LENGTH)); setError(''); }}
            placeholder="New passcode"
            style={inputStyle}
          />
          <input
            type="tel"
            inputMode="numeric"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            maxLength={PASSCODE_LENGTH}
            autoComplete="one-time-code"
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
        height: '100dvh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--bg)',
        color: 'var(--ui-primary-text, var(--text))',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0,
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
