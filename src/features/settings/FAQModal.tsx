import { useState } from 'react';
import { Modal } from '../../ui/Modal';

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'Does the passcode encrypt my data in storage?',
    a: 'No. The passcode is an access gate for the app UI. Your wallet ledger and settings are stored locally in your browser storage. Anyone who can access your browser storage (or who can bypass/skip the gate) may be able to view your data.',
  },
  {
    q: 'If someone gets my phone/laptop, how much can they see?',
    a: 'With the passcode gate enabled, they still may be blocked from using the app UI. However, if they can read your browser storage or you have paused protection, your data could be visible. This is why the Security Policy also emphasizes backups and device access.',
  },
  {
    q: 'What changes when I “Pause passcode protection”?',
    a: 'Pausing removes the passcode requirement until you resume protection. That makes the app easier to open for anyone with access to the device.',
  },
  {
    q: 'Where do my profile name and profile picture live?',
    a: 'They are stored locally in your browser. The display name is stored as plain text; the profile picture is resized and stored as a small JPEG data URL. See the Security Policy for the exact storage and backup implications.',
  },
  {
    q: 'Is my profile picture/name included in “Export JSON” backups?',
    a: 'Not necessarily. The current JSON export primarily backs up the wallet ledger/storage keys. The Security Policy explains which parts are included, and you should treat any exported/imported file as sensitive.',
  },
  {
    q: 'What happens if I import JSON from another device?',
    a: 'Import can replace the current ledger state on this device. Only import files you trust. Untrusted JSON can also bloat local storage or change behavior unexpectedly (for example, via large embedded strings like profile images).',
  },
  {
    q: 'Does the app send anything to a server by default?',
    a: 'By default, no. The app is manual-entry and local-first. If you configure an optional backend (for “Detected activity”), network calls can happen only to your configured backend URL.',
  },
  {
    q: 'If I enable “Detected activity” (Plaid), what kind of data could be sent?',
    a: 'The frontend can request link tokens/health checks and load detected activity items from your backend. The exact data shape is controlled by your backend implementation. Review the Security Policy and only enable backend features you understand.',
  },
  {
    q: 'Can browser extensions read my wallet data?',
    a: 'Potentially. Since data is stored in browser storage, any script running under your site context, or extensions with appropriate permissions, may be able to read it. The app cannot fully protect against that threat model.',
  },
  {
    q: 'Does the creator/admin have access to my recovery key or passcode?',
    a: 'No. The passcode hash and recovery-related security values are stored locally for your device. The creator is not intended to have access to them.',
  },
  {
    q: 'What does “Reset all data” actually do?',
    a: 'It clears this site’s `localStorage` and reloads the app, wiping your locally stored ledger data (and also your locally stored profile data). If you still have an export, you can re-import afterward.',
  },
  {
    q: 'Are my backups safe to upload to cloud or email?',
    a: 'Only if you accept the risk. Backup JSON and CSV files can contain sensitive financial information. This app does not encrypt backup files on export; treat them as sensitive documents.',
  },
  {
    q: 'Does the app require the “official link” to work?',
    a: 'You should only use the official site. The Security Policy warns against using alternate/unofficial links. A different domain could potentially run a tampered version.',
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
