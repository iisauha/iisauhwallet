import { useState } from 'react';
import { Modal } from '../../ui/Modal';
import { loadPasscodeHash, savePasscodeHash, hashPasscode, savePasscode6Digit } from '../../state/storage';

const PASSCODE_LENGTH = 6;
function isValidSixDigits(value: string): boolean {
  return new RegExp(`^\\d{${PASSCODE_LENGTH}}$`).test(value);
}

export function ResetPasscodeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<'current' | 'new'>('current');
  const [currentPasscode, setCurrentPasscode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [error, setError] = useState('');

  const handleVerifyCurrent = async () => {
    setError('');
    if (!currentPasscode.trim()) {
      setError('Enter your current passcode');
      return;
    }
    const stored = loadPasscodeHash();
    if (!stored) {
      setError('No passcode set');
      return;
    }
    const hash = await hashPasscode(currentPasscode);
    if (hash !== stored) {
      setError('Incorrect passcode');
      setCurrentPasscode('');
      return;
    }
    setStep('new');
    setNewPasscode('');
    setConfirmPasscode('');
    setError('');
  };

  const handleSaveNew = async () => {
    setError('');
    if (!isValidSixDigits(newPasscode)) {
      setError(`Enter ${PASSCODE_LENGTH} digits`);
      return;
    }
    if (newPasscode !== confirmPasscode) {
      setError('Passcodes do not match');
      return;
    }
    const hash = await hashPasscode(newPasscode);
    savePasscodeHash(hash);
    savePasscode6Digit(true);
    onClose();
    setStep('current');
    setCurrentPasscode('');
    setNewPasscode('');
    setConfirmPasscode('');
  };

  const handleClose = () => {
    setStep('current');
    setCurrentPasscode('');
    setNewPasscode('');
    setConfirmPasscode('');
    setError('');
    onClose();
  };

  if (!open) return null;

  return (
    <Modal open={open} title="Reset passcode" onClose={handleClose}>
      {step === 'current' && (
        <>
          <p style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: 'var(--ui-primary-text, var(--text))' }}>
            Enter your current passcode to continue.
          </p>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={currentPasscode}
            onChange={(e) => { setCurrentPasscode(e.target.value.replace(/\D/g, '')); setError(''); }}
            placeholder={'•'.repeat(PASSCODE_LENGTH)}
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: '1.25rem',
              letterSpacing: '0.4em',
              textAlign: 'center',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--ui-card-bg, var(--surface))',
              color: 'var(--ui-primary-text, var(--text))',
              marginBottom: 12,
            }}
          />
          {error && <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--red)' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={handleClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleVerifyCurrent}>Continue</button>
          </div>
        </>
      )}
      {step === 'new' && (
        <>
          <p style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: 'var(--ui-primary-text, var(--text))' }}>
            Enter and confirm your new {PASSCODE_LENGTH}-digit passcode.
          </p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={PASSCODE_LENGTH}
            autoComplete="off"
            value={newPasscode}
            onChange={(e) => { setNewPasscode(e.target.value.replace(/\D/g, '').slice(0, PASSCODE_LENGTH)); setError(''); }}
            placeholder={'•'.repeat(PASSCODE_LENGTH)}
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: '1.25rem',
              letterSpacing: '0.4em',
              textAlign: 'center',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--ui-card-bg, var(--surface))',
              color: 'var(--ui-primary-text, var(--text))',
              marginBottom: 12,
            }}
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={PASSCODE_LENGTH}
            autoComplete="off"
            value={confirmPasscode}
            onChange={(e) => { setConfirmPasscode(e.target.value.replace(/\D/g, '').slice(0, PASSCODE_LENGTH)); setError(''); }}
            placeholder={'•'.repeat(PASSCODE_LENGTH)}
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: '1.25rem',
              letterSpacing: '0.4em',
              textAlign: 'center',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--ui-card-bg, var(--surface))',
              color: 'var(--ui-primary-text, var(--text))',
              marginBottom: 12,
            }}
          />
          {error && <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--red)' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setStep('current')}>Back</button>
            <button type="button" className="btn btn-primary" onClick={handleSaveNew}>Save new passcode</button>
          </div>
        </>
      )}
    </Modal>
  );
}
