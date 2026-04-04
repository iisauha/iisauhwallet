import { useState } from 'react';
import { Modal } from '../../ui/Modal';

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'Does the passcode encrypt my data?',
    a: 'Yes. All financial data is encrypted with AES-256-GCM. The encryption key is protected by your passcode using PBKDF2 (100,000 iterations). Data synced to the cloud is also encrypted with your passcode before it ever leaves your device. Nobody — not even the server — can read your data without your passcode.',
  },
  {
    q: 'How does cloud sync work?',
    a: 'When you sign in with your email, the app encrypts all your data with your passcode and stores it in the cloud. Every change you make syncs automatically within a few seconds. On a new device, sign in with the same email and enter your passcode to restore everything — data, theme, settings, all of it.',
  },
  {
    q: 'If someone gets my device, what can they see?',
    a: 'They need your device unlock code and your app passcode. The financial data in storage is encrypted and the decryption key is passcode-protected, so possessing the device alone is not enough. "Pause protection" only when you are the sole user and want faster access.',
  },
  {
    q: 'Can the server or developer read my data?',
    a: 'No. Your data is encrypted on your device before it is sent to the cloud. The server only stores an encrypted blob that is unreadable without your passcode. Your passcode and recovery key are never transmitted.',
  },
  {
    q: 'What if I forget my passcode?',
    a: 'Use the recovery key you saved during setup. If you also set up security questions, those work too. Without either, your cloud data cannot be decrypted — this is by design for your security.',
  },
];

export function FAQModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (!open) return null;

  return (
    <Modal open={open} fullscreen title="Security FAQ" onClose={onClose}>
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
              <span className="chevron" style={{ fontSize: '0.9rem' }}>{expandedIndex === i ? '▾' : '▸'}</span>
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
