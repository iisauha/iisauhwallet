import { Modal } from '../../ui/Modal';

const GITHUB_URL = 'https://github.com/iisauha/iisauhwallet';

export function AppGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <Modal open={open} title="How This App Works" onClose={onClose}>
      <div style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0 }}>
          This app is a <strong>manual-entry, local-first</strong> finance tracker. You enter your own balances and transactions. There is no direct connection to your bank by default.
        </p>

        <section>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>Main tabs</h4>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li><strong>Snapshot</strong> — Cash, credit cards, pending in/out, and final net cash in one view. Add accounts and post pending here.</li>
            <li><strong>Spending</strong> — Log purchases by category. View totals and export CSV. Cards can have a reward category so the app suggests categories when you log a purchase.</li>
            <li><strong>Upcoming</strong> — Expected income and expenses from recurring items. Shows how much you have left after expected costs. Linked HYSA “bills” portion counts as liquid here.</li>
            <li><strong>Recurring</strong> — Salary, rent, subscriptions, loan payments. Feeds into Upcoming and can apply to Snapshot. Includes the 457(b) optimizer (Run optimizer / View last result).</li>
            <li><strong>Loans</strong> — Federal (with IDR/repayment estimates) and private loans. Payment modes and recompute for private balances.</li>
            <li><strong>Investing</strong> — HYSA (reserved vs bills, link to checking), Roth IRA, 401k, general. Adjust HYSA Allocation to move between reserved and bills.</li>
            <li><strong>Sign-up bonus tracker</strong> — Track credit card bonuses and spend targets.</li>
            <li><strong>Settings</strong> — Backup, sync, security, App Customization, FAQ, and this guide.</li>
          </ul>
        </section>

        <section>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>How data is stored</h4>
          <p style={{ margin: 0 }}>
            All wallet data is stored <strong>locally in your browser</strong>. The creator does not have access to it. Device sync is optional: if you enable it (Settings → Device Sync), you can share one wallet across devices with a 6-digit code.
          </p>
        </section>

        <section>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>Backups and security</h4>
          <p style={{ margin: 0 }}>
            Use <strong>Export JSON</strong> (Settings) to save a full backup; <strong>Import JSON</strong> restores (and replaces current data). Set a passcode for the app; you can add a hint, security questions, and a recovery key. For full details see the <strong>Security Policy</strong> (Settings → Security Policy).
          </p>
        </section>

        <section>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>Useful features</h4>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li><strong>Pending in/out</strong> — Track money in motion; post to bank/card when it settles.</li>
            <li><strong>Linked HYSA</strong> — Link an HYSA to a checking account so “money designated for bills” counts as liquid in Upcoming and when choosing HYSA as a payment source.</li>
            <li><strong>Recurring → Upcoming</strong> — Recurring income and expenses drive expected income/costs in Upcoming; you can move items to pending from there.</li>
            <li><strong>Reward category</strong> — In Snapshot, set a reward category per card; Spending will suggest it when you add a purchase on that card.</li>
            <li><strong>App Customization</strong> — Settings → App Customization for colors, fonts, and theme.</li>
          </ul>
        </section>

        <p style={{ margin: 0, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>
            View full documentation on GitHub
          </a>
        </p>
      </div>
    </Modal>
  );
}
