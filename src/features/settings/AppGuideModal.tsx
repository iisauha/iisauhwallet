import { Modal } from '../../ui/Modal';

const GITHUB_URL = 'https://github.com/iisauha/iisauhwallet';

export function AppGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <Modal open={open} title="How This App Works" onClose={onClose}>
      <div style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--ui-primary-text, var(--text))', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0 }}>
          This app is a <strong>manual-entry, local-first</strong> finance tracker. You type your own numbers, and by default it does not connect to your bank.
        </p>

        <section>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>What each tab is for</h4>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li><strong>Snapshot</strong> — Your “where you stand now” view: cash + cards + pending in/out.</li>
            <li><strong>Spending</strong> — Log purchases, categorize them, and export monthly CSV.</li>
            <li><strong>Upcoming</strong> — Forecast using recurring items (and HYSA “bills” if linked).</li>
            <li><strong>Recurring</strong> — Repeating income/expenses that feed Upcoming; can also update Snapshot when configured.</li>
            <li><strong>Loans</strong> — Track federal/private loans and payment progress.</li>
            <li><strong>Investing</strong> — HYSA (reserved vs bills), Roth IRA/401k, general investing.</li>
            <li><strong>Sign-up bonus tracker</strong> — Track bonus tiers and progress for your cards.</li>
            <li><strong>Settings</strong> — Backup/import, passcode/security policy, FAQ, and customization.</li>
          </ul>
        </section>

        <section>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>The big idea: “pending” and “posting”
          </h4>
          <p style={{ margin: 0 }}>
            “Pending inbound/outbound” is money in motion. When you <strong>post</strong> it (i.e. when it actually lands/leaves), the ledger updates and <strong>Snapshot changes</strong> right away.
          </p>
        </section>

        <section>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>Security and privacy (simple version)</h4>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Your wallet data is stored locally in your browser (local-first).</li>
            <li>The passcode is an <strong>access gate</strong> for the app UI; it does not encrypt your browser storage.</li>
            <li>You can set a display name and profile photo in Settings. Those are stored locally too.</li>
            <li>If you enable optional backend features (for example, Plaid “Detected activity”), the app makes network requests only to your configured backend.</li>
          </ul>
          <p style={{ margin: '8px 0 0 0' }}>
            For exact wording, see the <strong>Security Policy</strong> (Settings → Security Policy).
          </p>
        </section>

        <section>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>Backups</h4>
          <p style={{ margin: 0 }}>
            Use <strong>Export JSON</strong> to back up your wallet/ledger data and <strong>Import JSON</strong> to restore (replaces current data on this device). Treat backups as sensitive files.
          </p>
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
