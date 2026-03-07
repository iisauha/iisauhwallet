import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <div className="tab-panel active" style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 80 }}>
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>
          Privacy Policy – IisauhWallet
        </h1>
        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)' }}>Last updated: March 2026</p>
      </div>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          Information We Collect
        </h2>
        <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text)', lineHeight: 1.6 }}>
          <li>Financial account information accessed through Plaid</li>
          <li>Transaction data such as merchant name, amount, and date</li>
          <li>User-entered financial data including budgets, recurring income, investments, and account balances</li>
        </ul>
        <p style={{ margin: '12px 0 0 0', fontSize: '0.9rem', color: 'var(--muted)', fontStyle: 'italic' }}>
          IisauhWallet does NOT collect bank usernames or passwords. Bank authentication is handled securely through Plaid.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          How We Use Information
        </h2>
        <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
          Information is used only to:
        </p>
        <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, color: 'var(--text)', lineHeight: 1.6 }}>
          <li>Display financial account activity</li>
          <li>Track spending and financial goals</li>
          <li>Provide budgeting insights</li>
          <li>Allow users to categorize transactions</li>
        </ul>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          Data Storage
        </h2>
        <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
          Financial data retrieved through Plaid is used only for application functionality. Access tokens and credentials are never exposed to the frontend.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          Data Sharing
        </h2>
        <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
          IisauhWallet does NOT sell or share financial data with third parties.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          User Control
        </h2>
        <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
          Users may disconnect accounts at any time, which stops further data retrieval.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          Security
        </h2>
        <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
          All communications use HTTPS encryption (TLS 1.2+).
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          Third Party Services
        </h2>
        <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
          IisauhWallet uses Plaid to connect financial institutions.
        </p>
        <p style={{ margin: '8px 0 0 0', color: 'var(--text)', lineHeight: 1.6 }}>
          Plaid privacy policy: <a href="https://plaid.com/legal/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>https://plaid.com/legal/</a>
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          Contact
        </h2>
        <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
          Isaiah<br />
          Developer – IisauhWallet<br />
          Email: your@email.com
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
