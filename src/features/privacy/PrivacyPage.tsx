import { Link } from 'react-router-dom';

const OFFICIAL_SITE = 'https://iisauha.github.io/iisauhwallet/';

export function PrivacyPage() {
  return (
    <div className="tab-panel active" style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 80 }}>
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Security &amp; Privacy Policy — iisauh wallet
        </h1>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ui-primary-text, var(--muted))' }}>Last updated: March 2026</p>
      </div>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Quick summary (what could worry you)
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          iisauh wallet is designed to be local-first: your wallet ledger is stored in your browser. The passcode blocks app access, but it does <strong>not</strong> encrypt your browser storage. That means your main risk is device/browser access and sharing/exporting sensitive files (like backups).
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          What the app stores locally
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          The app stores your data locally in your browser, including: banks/cards/cash balances, pending inbound/outbound, purchases, recurring income/expenses, loans, investing/HYSA, reward settings, and app UI preferences. It also stores your Settings profile:
        </p>
        <ul style={{ margin: '10px 0 0 0', paddingLeft: 20, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.7 }}>
          <li><strong>Display name</strong> (plain text)</li>
          <li><strong>Profile photo</strong> (resized to a small JPEG and stored as a data URL)</li>
        </ul>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Passcode and recovery (access gate, not encryption)
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          The app supports passcode protection so only you can open the app UI after you lock the app. You can optionally set a password hint, two security questions, and a one-time recovery key shown during setup. The app stores only SHA-256 hashes for the passcode and recovery-related values on your device.
        </p>
        <p style={{ margin: '12px 0 0 0', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          Important: the passcode is an <strong>access gate</strong>. It does <strong>not</strong> encrypt the contents already stored in your browser (including the wallet ledger and profile name/photo).
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Browser storage risk (local-first threat model)
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          Because data lives in your browser storage, you should assume it can be read by anything that can access your device’s browser under your site context (for example: someone with physical access, an unattended logged-in device, browser sync, or extensions with the right permissions).
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Backups and exports (treat as sensitive)
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          <strong>Export JSON</strong> creates a backup of your wallet/ledger-related localStorage keys. This can include sensitive information (balances, transactions, and settings). Treat exported files as confidential.
        </p>
        <p style={{ margin: '12px 0 0 0', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          Profile name/photo are stored locally too, but the current JSON export is allow-listed and may not include all profile fields. If you care about those fields, assume you may need to re-add them after importing to a new device.
        </p>
        <p style={{ margin: '12px 0 0 0', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          <strong>Import JSON</strong> restores backup data and can replace current state on your device. Only import backups you trust.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Optional backend features (network calls)
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          By default, the app does not connect to your bank. However, some optional features depend on a configured backend URL (for example, “Detected activity” / Plaid-based suggestions).
        </p>
        <p style={{ margin: '12px 0 0 0', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          When enabled, the frontend may call endpoints on your backend (health checks, Plaid link-token creation, token exchange, transaction sync, and detected-activity load/resolve/ignore). The exact data your backend stores/uses is controlled by that backend implementation.
        </p>
        <p style={{ margin: '12px 0 0 0', color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          If you do not run a backend or do not configure one, the app still works fully with manual input only.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Creator access limitations
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          The creator is not intended to have access to your wallet data, passcode, recovery key, or profile data. The creator will never ask you for your passcode, recovery key, or financial data. The official site is:
        </p>
        <p style={{ margin: '12px 0 0 0', color: 'var(--accent)', fontWeight: 600, wordBreak: 'break-all' }}>
          {OFFICIAL_SITE}
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Security tips
        </h2>
        <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.7 }}>
          <li>Set a passcode and do not leave the app’s passcode protection paused.</li>
          <li>Save your recovery key when shown. The recovery key is not shown again in full.</li>
          <li>Export JSON backups regularly, and store backup files safely.</li>
          <li>Only import backups you trust.</li>
          <li>Use only the official site link above.</li>
          <li>If you suspect exposure, use “Reset All Data” in Settings to clear local storage for this site.</li>
        </ul>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Transparency
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          This application is a personal finance tracking tool. It does not provide financial advice and is not a financial institution.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--ui-title-text, var(--text))' }}>
          Questions &amp; contact
        </h2>
        <p style={{ margin: 0, color: 'var(--ui-primary-text, var(--text))', lineHeight: 1.6 }}>
          If you have questions about this Security &amp; Privacy Policy, contact:<br />
          <a href="mailto:iisauhaguilar@gmail.com" style={{ color: 'var(--accent)' }}>iisauhaguilar@gmail.com</a>
        </p>
      </section>

      <p style={{ textAlign: 'center', marginBottom: 24 }}>
        <Link to="/" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          Back to app
        </Link>
      </p>
    </div>
  );
}
