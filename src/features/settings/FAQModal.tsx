import { useState } from 'react';
import { Modal } from '../../ui/Modal';

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'What does this app track?',
    a: 'You track your own accounts (banks, credit cards, cash), balances, pending money moving between accounts, purchases, recurring bills, loans, and investing/HYSA. Everything is entered by you; the app does not connect to your real bank to pull data automatically.',
  },
  {
    q: 'How does pending inbound/outbound work?',
    a: 'Pending inbound is money you expect to receive (e.g. a paycheck or transfer) that you have not yet posted to an account. Pending outbound is money you plan to move out (e.g. paying a card from checking). You post them when the money actually lands or leaves so your balances stay accurate.',
  },
  {
    q: 'What does "Money in HYSA designated for bills" mean?',
    a: 'It is the part of your HYSA balance that you treat as available for bills and checking-linked spending. The rest can be "reserved savings." You can move money between these two portions using Adjust HYSA Allocation in the Investing section.',
  },
  {
    q: 'How does device sync work?',
    a: 'In Settings → Device Sync you can create a 6-digit code on one device (e.g. your phone) and enter it on another (e.g. your laptop). The joining device replaces its local data with the synced wallet. After that, changes on either device sync to the other. You can pause or disconnect sync anytime.',
  },
  {
    q: 'How do I back up my data?',
    a: 'Use Settings → Export JSON to save a copy of your wallet data. You can also export monthly purchases as CSV. Keep the file somewhere safe. Import JSON restores from a backup. If you ever wipe the app after too many failed passcode attempts, you can re-import a previous JSON backup to restore your data.',
  },
  {
    q: 'How does passcode setup work?',
    a: 'When you first set a passcode, you can optionally add a password hint, two security questions (with answers), and the app generates a recovery key. Save the recovery key somewhere safe; it is shown only once. All of this is stored locally on your device. The creator cannot access your passcode, hint, answers, or recovery key.',
  },
  {
    q: 'What is the recovery key?',
    a: 'The recovery key is a random code generated during passcode setup. It is the best way to recover your passcode if you forget it. Save it when it is shown; the app does not show it again in full. You can regenerate it in Settings (Security) after entering your passcode. Only a hash of the key is stored locally; the creator cannot see it.',
  },
  {
    q: 'What do security questions do?',
    a: 'If you set two security questions during setup, you can answer them on the "Forgot passcode?" flow to reset your passcode. Answers are stored in hashed form on your device only. The creator cannot access them.',
  },
  {
    q: 'What does the password hint do?',
    a: 'The hint is a reminder you choose (e.g. "Last 4 of my phone"). It is shown when you tap "Forgot passcode?" and choose "View password hint." The hint alone does not allow passcode reset—you still need your recovery key or security answers to reset.',
  },
  {
    q: 'What happens after too many wrong passcode attempts?',
    a: 'After 10 failed attempts (passcode or recovery), the app offers two options: (1) Confirm wipe—clears all local app data on the device so you can start fresh; you can re-import a previous JSON backup if you have one. (2) Don\'t wipe—recovery attempts are locked for 24 hours. No data is sent to any server; the creator cannot access your credentials.',
  },
  {
    q: 'Can the creator access my passcode or recovery key?',
    a: 'No. Passcodes, hints, security answers, and recovery keys are stored only on your device. They are hashed or stored locally; the app has no backend that receives them. The creator cannot access this information.',
  },
  {
    q: 'How do I reset my passcode?',
    a: 'From the lock screen: tap "Forgot passcode?" then use your recovery key or security questions to reset. From inside the app: Settings → Security → Reset passcode. You must enter your current passcode, then set and confirm a new one.',
  },
  {
    q: 'Does the app connect to my real bank automatically?',
    a: 'No. All account names, balances, and transactions are entered by you. The app does not log into your bank or pull transactions. Optional Plaid-based features (if you enable them and have a backend configured) can fetch transactions for linking, but the app works fully without any bank connection.',
  },
  {
    q: 'How do I edit account names or categories?',
    a: 'Account names: Settings → Edit Account Names. Categories: Settings → Manage Categories. You can rename banks, cards, and investing accounts, and add or edit spending categories and subcategories.',
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
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
              background: 'var(--surface)',
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
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              {item.q}
              <span style={{ fontSize: '1.2rem', color: 'var(--muted)' }}>{expandedIndex === i ? '−' : '+'}</span>
            </button>
            {expandedIndex === i && (
              <div
                style={{
                  padding: '0 16px 14px',
                  fontSize: '0.9rem',
                  lineHeight: 1.55,
                  color: 'var(--ui-muted-text, var(--muted))',
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
