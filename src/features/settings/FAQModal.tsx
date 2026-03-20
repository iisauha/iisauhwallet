import { useState } from 'react';
import { Modal } from '../../ui/Modal';

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'Does the passcode encrypt my data in storage?',
    a: 'No, it does not encrypt the saved files. It works like a lock on the app: it hides the screens until you enter the code, while balances and settings stay in normal browser storage on your device.',
  },
  {
    q: 'If someone gets my phone/laptop, how much can they see?',
    a: 'Usually they need your device unlock and either your app passcode or for protection to be paused. Keeping a device PIN and the app passcode on is the simple habit that helps most people.',
  },
  {
    q: 'What changes when I “Pause passcode protection”?',
    a: 'The app stops asking for your code until you turn protection back on. Use that when you are the only one using the device and you want quicker access.',
  },
  {
    q: 'Where do my profile name and profile picture live?',
    a: 'Only on this device, in this site’s browser storage. The photo is stored small so it loads fast and does not fill storage.',
  },
  {
    q: 'Is my profile picture/name included in backup exports?',
    a: 'Not always. Export JSON is built around money-tracking data, so name or photo may be missing and you can re-add them after a restore if needed.',
  },
  {
    q: 'What happens if I import a backup file from another device?',
    a: 'This device’s app data is replaced by what is in the file. Pick files you created yourself or fully trust so your numbers stay accurate.',
  },
  {
    q: 'Does the app upload my data to the internet?',
    a: 'No, not for normal use. What you enter stays in your browser on this device until you export a backup or clear the site data.',
  },
  {
    q: 'Can browser extensions read my wallet data?',
    a: 'Only if a browser extension is allowed to read this site’s storage. Most people never need to worry about that.',
  },
  {
    q: 'Does the app developer have access to my recovery key or passcode?',
    a: 'No. Those stay on your device and are not sent to the developer.',
  },
  {
    q: 'What does “Reset all data” actually do?',
    a: 'It clears this site’s data in the browser and reloads. Export JSON first if you want to keep a copy.',
  },
  {
    q: 'Are my backups safe to upload to cloud or email?',
    a: 'You can if you want a copy off the device. Treat the file like any private document because the app does not add a separate password on export.',
  },
  {
    q: 'Does the app require the “official link” to work?',
    a: 'You should use the official link so you know you are on the real app. The Security Policy lists the recommended URL.',
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
