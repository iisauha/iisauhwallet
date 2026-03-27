import { useState } from 'react';
import { Modal } from '../../ui/Modal';

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'Does the passcode encrypt my data?',
    a: 'Yes. All financial data is encrypted with AES-256-GCM. The encryption key is itself protected by your passcode using PBKDF2 (100,000 iterations) — it is never stored in plaintext alongside your data. Exported backup files are also encrypted with your passcode (PBKDF2 + AES-256-GCM). Neither your data nor the key that decrypts it can be read without your passcode.',
  },
  {
    q: 'If someone gets my device, what can they see?',
    a: 'They need your device unlock code and your app passcode. The financial data in storage is encrypted and the decryption key is passcode-protected, so possessing the device alone is not enough. "Pause protection" only when you are the sole user and want faster access — pausing stores the key in plaintext while disabled.',
  },
  {
    q: 'Does the app upload my data to the internet?',
    a: 'No. Everything stays in your browser on this device. Nothing is sent anywhere unless you manually export a backup file.',
  },
  {
    q: 'Are my backup files safe to store in the cloud?',
    a: 'Yes, if you have a passcode set. Backups are encrypted so they are unreadable without your passcode. Without a passcode the export is plain text, so treat it like any sensitive document.',
  },
  {
    q: 'Does the developer have access to my passcode or data?',
    a: 'No. Your passcode, recovery key, and financial data never leave your device and are not sent to the developer.',
  },
];

export function FAQModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (!open) return null;

  return (
    <Modal open={open} title="Security FAQ" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {FAQ_ITEMS.map((item, i) => (
          <div
            key={i}
            style={{
              border: '1px solid var(--ui-border, var(--border))',
              borderRadius: 10,
              overflow: 'hidden',
              background: 'var(--ui-modal-bg, var(--surface))',
            }}
          >
            <button
              type="button"
              onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
              style={{
                width: '100%',
                padding: '14px 16px',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                color: 'var(--ui-primary-text, var(--text))',
                fontSize: '0.95rem',
                fontWeight: 600,
                fontFamily: 'var(--app-font-family)',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              {item.q}
              <span style={{ fontSize: '1.2rem', color: 'var(--ui-primary-text, var(--text))' }}>{expandedIndex === i ? '−' : '+'}</span>
            </button>
            {expandedIndex === i && (
              <div
                style={{
                  padding: '0 16px 14px',
                  fontSize: '0.9rem',
                  lineHeight: 1.55,
                  fontFamily: 'var(--app-font-family)',
                  color: 'var(--ui-primary-text, var(--text))',
                }}
              >
                {item.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
