import { useState } from 'react';
import { Modal } from '../../ui/Modal';

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'How is my data protected?',
    a: 'Your data is encrypted using a method called AES-256-GCM. This is the same type of encryption used by banks and governments. Your 6-digit passcode is used to create the encryption key through a process called PBKDF2, which runs 100,000 rounds of hashing to make it extremely difficult for anyone to guess. All of this happens on your device before anything is sent anywhere.',
  },
  {
    q: 'What is Supabase and why does this app use it?',
    a: 'Supabase is an open-source cloud platform that provides a secure database and user authentication. It is used by thousands of apps and is built on top of PostgreSQL, one of the most trusted database systems in the world. This app uses Supabase to store your encrypted data in the cloud so you can access it from any device. Supabase handles your email login securely, but it never sees your financial data because everything is encrypted before it reaches the server.',
  },
  {
    q: 'How does cloud sync work?',
    a: 'When you make a change in the app (like adding a purchase or updating a balance), the app takes all of your data, encrypts it with your passcode, and sends the encrypted version to Supabase. The server stores this as a blob of scrambled text that is completely unreadable without your passcode. When you open the app on another device and sign in with the same email and passcode, the app downloads that encrypted blob, decrypts it on your device, and loads everything exactly as you left it. This happens automatically every few seconds.',
  },
  {
    q: 'Can Supabase, the developer, or anyone else read my data?',
    a: 'No. Your data is encrypted on your device before it is sent to the cloud. The Supabase server only stores an encrypted blob. Without your passcode, this blob is meaningless. It cannot be decrypted by the server, by the app developer, or by anyone who gains access to the database. Your passcode and recovery key never leave your device and are never sent over the internet.',
  },
  {
    q: 'What are the layers of security?',
    a: 'There are three layers protecting your data. First, you must sign in with your email and password. This proves your identity to the server. Second, Row Level Security (RLS) on the database ensures that even if someone is signed in, they can only access their own data and nobody else\'s. Third, your data is encrypted with your passcode using AES-256-GCM, so even if someone bypassed the first two layers and accessed the raw database, they would only see encrypted gibberish.',
  },
  {
    q: 'If someone gets my device, what can they see?',
    a: 'They would need both your device unlock code and your app passcode. Your financial data is stored encrypted on the device, and the key to decrypt it is locked behind your passcode. Just having the phone is not enough. If you have Face ID or Touch ID enabled, that adds another layer. You can also pause passcode protection in settings if you are the only person who uses your device, but keep in mind this stores the encryption key without passcode protection.',
  },
  {
    q: 'What if I forget my passcode?',
    a: 'During setup you were given a recovery key, which is a 12-character code. If you saved it, you can use it to regain access and set a new passcode. If you also set up security questions, those work too. If you do not have your recovery key or security answers, your data cannot be recovered. This is not a flaw. It is by design. Because only your passcode can decrypt your data, there is no "reset password" option that could be exploited by someone else.',
  },
  {
    q: 'What happens to my daily cloud backups?',
    a: 'Once per day, the app saves a snapshot of your encrypted data to a separate table in Supabase. These snapshots are like save points. If you accidentally delete something or want to go back to how things were yesterday or last week, you can open Settings, tap Cloud Backups, and restore any previous snapshot. Each snapshot is encrypted the same way as your live data.',
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
