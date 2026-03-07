import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLedgerStore } from '../../state/store';
import { exportJSON, importJSON, loadCategoryConfig, saveCategoryConfig } from '../../state/storage';
import { ManageCategoriesModal } from './ManageCategoriesModal';
import { formatCents } from '../../state/calc';
import { usePlaidLink } from '../../hooks/usePlaidLink';
import { hasApiBase, getPlaidAccountsSnapshot, type PlaidAccountsResponse } from '../../api/detectedActivityApi';

const PLAID_UI_ENABLED = import.meta.env.DEV || (import.meta as any).env?.VITE_ENABLE_PLAID_UI === 'true';

function downloadJsonFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const actions = useLedgerStore((s) => s.actions);
  const [manageOpen, setManageOpen] = useState(false);
  const { openLink, error: plaidError, setError: setPlaidError, loading: plaidLoading } = usePlaidLink();
  const [plaidSnapshot, setPlaidSnapshot] = useState<PlaidAccountsResponse | null>(null);
  const [plaidSnapshotLoading, setPlaidSnapshotLoading] = useState(false);
  const [plaidSnapshotError, setPlaidSnapshotError] = useState<string | null>(null);

  const showPlaidUi = PLAID_UI_ENABLED && hasApiBase();

  async function handleRefreshPlaidSnapshot() {
    if (!showPlaidUi) return;
    setPlaidSnapshotError(null);
    setPlaidSnapshotLoading(true);
    try {
      const snapshot = await getPlaidAccountsSnapshot();
      setPlaidSnapshot(snapshot);
    } catch (e) {
      setPlaidSnapshotError(e instanceof Error ? e.message : 'Failed to load Plaid balances');
    } finally {
      setPlaidSnapshotLoading(false);
    }
  }

  return (
    <div className="tab-panel active" id="settingsContent">
      {showPlaidUi ? (
        <>
          <p className="section-title">Linked Accounts (Plaid Snapshot)</p>
          <div className="settings-section" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: '0.85rem' }}
                onClick={openLink}
                disabled={plaidLoading}
              >
                {plaidLoading ? 'Connecting…' : 'Connect Bank'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem' }}
                onClick={handleRefreshPlaidSnapshot}
                disabled={plaidSnapshotLoading}
              >
                {plaidSnapshotLoading ? 'Refreshing…' : 'Refresh Balances'}
              </button>
            </div>
            {plaidError ? (
              <p style={{ color: 'var(--red)', fontSize: '0.85rem', margin: 0 }}>
                {plaidError}{' '}
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '2px 8px', fontSize: '0.75rem', marginLeft: 6 }}
                  onClick={() => setPlaidError(null)}
                >
                  Dismiss
                </button>
              </p>
            ) : null}
            {plaidSnapshotError ? (
              <p style={{ color: 'var(--red)', fontSize: '0.85rem', margin: 0 }}>{plaidSnapshotError}</p>
            ) : null}
            {!plaidSnapshotLoading && plaidSnapshot && plaidSnapshot.accounts.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>No Plaid account linked yet.</p>
            ) : null}
            {!plaidSnapshotLoading && plaidSnapshot && plaidSnapshot.accounts.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ color: 'var(--muted)', margin: 0, fontSize: '0.85rem' }}>
                  Institution:{' '}
                  <span style={{ color: 'var(--text)' }}>
                    {plaidSnapshot.institutionName || 'Unknown institution'}
                  </span>
                </p>
                {plaidSnapshot.summary ? (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 10,
                      fontSize: '0.8rem',
                      color: 'var(--muted)',
                    }}
                  >
                    <span>
                      Net worth:{' '}
                      <span style={{ color: 'var(--text)' }}>
                        {formatCents(plaidSnapshot.summary.netWorth)}
                      </span>
                    </span>
                    <span>
                      Assets:{' '}
                      <span style={{ color: 'var(--text)' }}>
                        {formatCents(plaidSnapshot.summary.totalAssets)}
                      </span>
                    </span>
                    <span>
                      Liabilities:{' '}
                      <span style={{ color: 'var(--text)' }}>
                        {formatCents(plaidSnapshot.summary.totalLiabilities)}
                      </span>
                    </span>
                    <span>
                      Cash:{' '}
                      <span style={{ color: 'var(--text)' }}>
                        {formatCents(plaidSnapshot.summary.totalCash)}
                      </span>
                    </span>
                    <span>
                      Credit:{' '}
                      <span style={{ color: 'var(--text)' }}>
                        {formatCents(plaidSnapshot.summary.totalCredit)}
                      </span>
                    </span>
                    <span>
                      Investments:{' '}
                      <span style={{ color: 'var(--text)' }}>
                        {formatCents(plaidSnapshot.summary.totalInvestments)}
                      </span>
                    </span>
                  </div>
                ) : null}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {plaidSnapshot.accounts.map((acc) => (
                    <div
                      key={acc.accountId}
                      className="card"
                      style={{
                        padding: 8,
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 4,
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                          {acc.name || acc.officialName || 'Account'}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                          {acc.type}
                          {acc.subtype ? ` · ${acc.subtype}` : ''}
                        </div>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 4 }}>
                        {acc.mask ? `•••• ${acc.mask}` : null}
                        {acc.isoCurrencyCode ? ` · ${acc.isoCurrencyCode}` : null}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 8,
                          fontSize: '0.8rem',
                          color: 'var(--muted)',
                        }}
                      >
                        <span>
                          Current:{' '}
                          <span style={{ color: 'var(--text)' }}>
                            {typeof acc.currentBalance === 'number'
                              ? formatCents(acc.currentBalance)
                              : '—'}
                          </span>
                        </span>
                        <span>
                          Available:{' '}
                          <span style={{ color: 'var(--text)' }}>
                            {typeof acc.availableBalance === 'number'
                              ? formatCents(acc.availableBalance)
                              : '—'}
                          </span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {!plaidSnapshotLoading && !plaidSnapshot && !plaidSnapshotError ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
                No Plaid balances loaded yet. Use Connect Bank and Refresh Balances to view linked accounts.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      <p className="section-title">Privacy</p>
      <div className="settings-section">
        <Link to="/privacy" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          Privacy Policy
        </Link>
      </div>

      <p className="section-title" style={{ marginTop: 24 }}>Backup</p>
      <div className="settings-section">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            const text = exportJSON();
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `iisauhwallet-backup-${ts}.json`;

            // Attempt share sheet first (best for iOS PWA).
            try {
              const nav: any = navigator as any;
              if (nav.share) {
                const file = new File([text], filename, { type: 'application/json' });
                await nav.share({ files: [file], title: 'Backup', text: 'iisauhwallet backup' });
                return;
              }
            } catch (_) {}

            // Fallback: new tab with JSON.
            try {
              const w = window.open('', '_blank');
              if (w) {
                w.document.open();
                w.document.write(
                  '<pre style="white-space:pre-wrap;word-break:break-word;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; padding:16px;">' +
                    text.replace(/</g, '&lt;') +
                    '</pre>'
                );
                w.document.close();
                return;
              }
            } catch (_) {}

            // Last resort: download.
            downloadJsonFile(filename, text);
          }}
        >
          Export JSON
        </button>
        <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => fileRef.current?.click()}>
          Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => {
              try {
                importJSON(String(r.result || ''));
                actions.reload();
                alert('Import done.');
              } catch (_) {
                alert('Invalid JSON.');
              }
              e.target.value = '';
            };
            r.readAsText(f);
          }}
        />
      </div>

      <p className="section-title" style={{ marginTop: 24 }}>
        Categories
      </p>
      <div className="settings-section">
        <button type="button" className="btn btn-secondary" onClick={() => setManageOpen(true)}>
          Manage Categories
        </button>
      </div>
      <ManageCategoriesModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        load={() => loadCategoryConfig()}
        save={(cfg) => saveCategoryConfig(cfg)}
      />

      <p className="section-title" style={{ marginTop: 24 }}>
        Danger zone
      </p>
      <div className="settings-section">
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            if (!confirm('Reset all data? This will clear localStorage for this site.')) return;
            // Explicit user action only.
            localStorage.clear();
            actions.reload();
          }}
        >
          Reset All Data
        </button>
      </div>
    </div>
  );
}

