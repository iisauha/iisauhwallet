import { useState } from 'react';
import { Modal } from '../../ui/Modal';

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'Does the passcode encrypt my data in storage?',
    a: 'No. Think of the passcode as a lock on the app screens: it stops people from opening the app until they type it in. It does not scramble or hide your data where it is saved. Your balances, transactions, and settings are stored in your browser like ordinary website data. Anyone who can read that saved data—or who opens the app while passcode protection is off—may still see your information.',
  },
  {
    q: 'If someone gets my phone/laptop, how much can they see?',
    a: 'With passcode protection on, they may not be able to get past the lock screen of the app. But if they can read what your browser has saved, or you paused protection, your data could still show up. The Security Policy explains more about backups and keeping your device safe.',
  },
  {
    q: 'What changes when I “Pause passcode protection”?',
    a: 'Pausing turns off the passcode until you turn protection back on. Anyone who picks up your device can open the app without entering a code.',
  },
  {
    q: 'Where do my profile name and profile picture live?',
    a: 'Only on your device, inside your browser’s saved data for this app. Your name is stored as regular text. Your photo is shrunk down and saved as a small image. The Security Policy has details on what that means for backups.',
  },
  {
    q: 'Is my profile picture/name included in backup exports?',
    a: 'Not always. The backup file mainly covers the core money-tracking data the app uses. It may not include everything. The Security Policy spells out what is included—treat any file you export or import as private.',
  },
  {
    q: 'What happens if I import a backup file from another device?',
    a: 'Import replaces whatever the app had saved on this device with what is in that file. Only import files you trust. A sketchy or oversized file can cause problems (for example, filling up storage or slowing things down).',
  },
  {
    q: 'Does the app send anything to a server by default?',
    a: 'No. Out of the box you enter information yourself and it stays on your device. If you turn on the optional “Detected activity” feature and point the app at a service you run or trust, then the app may connect to the internet for that—but only toward the address you set.',
  },
  {
    q: 'If I enable “Detected activity” (Plaid), what kind of data could be sent?',
    a: 'That feature talks to a separate service (often your own setup) to link accounts and pull in suggested transactions. Exactly what gets sent depends on how that service is built. Read the Security Policy and only enable it if you’re comfortable with what you’re connecting to.',
  },
  {
    q: 'Can browser extensions read my wallet data?',
    a: 'Possibly. The app saves your data in your browser, so add-ons that are allowed to peek at that kind of storage might see it. The app cannot block every scenario.',
  },
  {
    q: 'Does the app developer have access to my recovery key or passcode?',
    a: 'No. Your passcode and recovery information stay on your device only. The person who built the app does not receive them.',
  },
  {
    q: 'What does “Reset all data” actually do?',
    a: 'It deletes everything this website has stored in your browser for the app, then reloads. That includes your balances and transactions and your profile on this device. If you saved a backup file first, you can import it again afterward.',
  },
  {
    q: 'Are my backups safe to upload to cloud or email?',
    a: 'Only if you accept the risk. Backup files can hold real financial details. The app does not password-protect or scramble those files when you export them—handle them like any sensitive document.',
  },
  {
    q: 'Does the app require the “official link” to work?',
    a: 'You should only use the official website link. The Security Policy explains why random or copycat links are risky—a different site could be a fake or modified version of the app.',
  },
];

export function FAQModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (!open) return null;

  return (
    <Modal open={open} title="FAQ" onClose={onClose}>
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
              <span style={{ fontSize: '1.2rem', color: 'var(--ui-primary-text, var(--muted))' }}>{expandedIndex === i ? '−' : '+'}</span>
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
