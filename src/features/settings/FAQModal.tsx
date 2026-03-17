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
    q: 'What does "Money in HYSA Designated for Bills" mean?',
    a: 'It is the part of your HYSA balance that you treat as available for bills and checking-linked spending. The rest can be "reserved savings." You can move money between these two portions using Adjust HYSA Allocation in the Investing section.',
  },
  {
    q: 'How do I back up my data?',
    a: 'Yes. Use Settings → Export JSON or Export Monthly Purchases CSV; Import JSON restores from a backup. Please reference the Security Policy.',
  },
  {
    q: 'How does passcode setup work?',
    a: 'Yes, you can set a passcode in Settings. Please reference the Security Policy.',
  },
  {
    q: 'What is the recovery key?',
    a: 'It is a key you create to recover access if you forget your passcode. Please reference the Security Policy.',
  },
  {
    q: 'What do security questions do?',
    a: 'They help you recover access if you forget your passcode. Please reference the Security Policy.',
  },
  {
    q: 'What does the password hint do?',
    a: 'It reminds you of your passcode without revealing it. Please reference the Security Policy.',
  },
  {
    q: 'What happens after too many wrong passcode attempts?',
    a: 'The app may temporarily lock. Please reference the Security Policy.',
  },
  {
    q: 'Can the creator access my passcode or recovery key?',
    a: 'No. Please reference the Security Policy.',
  },
  {
    q: 'How do I reset my passcode?',
    a: 'Yes. From the lock screen tap "Forgot passcode?" or use Settings → Security & privacy → Reset passcode. Please reference the Security Policy.',
  },
  {
    q: 'Does the app connect to my real bank automatically?',
    a: 'No. Please reference the Security Policy.',
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
                  color: 'var(--ui-muted, var(--muted))',
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
