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
          Manual input
        </h2>
        <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
          All financial data in this application is entered manually by you. The app does not pull in transactions or balances from your accounts on its own.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          No automatic financial data collection
        </h2>
        <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
          The public version of this app does not automatically retrieve bank account data. You decide what information to record.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          Data storage
        </h2>
        <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
          Your financial entries are stored locally in your browser (e.g. on your device). The application does not transmit your financial records to external servers. The developer does not have access to your financial information.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          No financial credential collection
        </h2>
        <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
          This app does not collect bank login credentials, account authentication information, or any other sensitive financial access data.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          Your responsibility
        </h2>
        <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
          You control what information you enter. You are responsible for keeping your device and browser secure so that your local data remains under your control.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          Transparency
        </h2>
        <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
          This application is a personal finance tracking tool. It does not provide financial advice and is not a financial institution.
        </p>
      </section>

      <section className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
          Questions / contact
        </h2>
        <p style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
          If you have any questions about this Privacy Policy, you may contact:<br />
          <a href="mailto:isaiahaaguilar1@gmail.com" style={{ color: 'var(--accent)' }}>isaiahaaguilar1@gmail.com</a>
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
