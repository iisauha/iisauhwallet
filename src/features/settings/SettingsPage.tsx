import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLedgerStore } from '../../state/store';
import {
  exportJSON,
  importJSON,
  loadCategoryConfig,
  saveCategoryConfig,
  loadBirthdateISO,
  saveBirthdateISO,
  getCategoryName,
  loadPasscodeHash,
} from '../../state/storage';
import { ManageCategoriesModal } from './ManageCategoriesModal';
import { AppCustomizationModal } from './AppCustomizationModal';
import { EditAccountNamesModal } from './EditAccountNamesModal';
import { FAQModal } from './FAQModal';
import { AppGuideModal } from './AppGuideModal';
import { ResetPasscodeModal } from './ResetPasscodeModal';
import { Modal } from '../../ui/Modal';
import { useSync } from '../../sync/SyncContext';

/** Returns export filename: Month_Day_Year.json (full month name, underscores, day no leading zero, 4-digit year). */
function getExportFileName(): string {
  const d = new Date();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month}_${day}_${year}.json`;
}

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

function escapeCsvCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportMonthlyPurchasesCsv() {
  const data = useLedgerStore.getState().data;
  const purchases = (data.purchases || []).filter((p: { dateISO?: string }) => {
    const d = p.dateISO || '';
    if (!d) return false;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const monthStart = `${y}-${m}-01`;
    const nextM = now.getMonth() + 2;
    const nextY = nextM > 12 ? y + 1 : y;
    const nextMonthStart = `${nextY}-${String(nextM > 12 ? 1 : nextM).padStart(2, '0')}-01`;
    return d >= monthStart && d < nextMonthStart;
  });
  const cfg = loadCategoryConfig();
  const rows = [
    ['Title', 'Date', 'Amount', 'Category', 'Subcategory'],
    ...purchases.map((p: { title?: string; dateISO?: string; amountCents?: number; category?: string; subcategory?: string }) => [
      escapeCsvCell(String(p.title ?? '')),
      escapeCsvCell(p.dateISO ?? ''),
      String((p.amountCents ?? 0) / 100),
      escapeCsvCell(getCategoryName(cfg, p.category ?? 'uncategorized')),
      escapeCsvCell(String(p.subcategory ?? ''))
    ])
  ];
  const csv = rows.map((r) => r.join(',')).join('\r\n');
  const now = new Date();
  const filename = `purchases_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.csv`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const SYNC_EXPLANATION = (
  <>
    <p style={{ margin: '0 0 12px 0', lineHeight: 1.55 }}>
      Syncing across devices is optional. You can keep using the app locally only. If you enable sync, wallet data is stored remotely so your phone and other devices can share the same wallet. If you have privacy or security concerns, you can skip sync and stay local-only. See the Security Policy or FAQ for more.
    </p>
    <p style={{ margin: 0, lineHeight: 1.55 }}>
      Use this device as the source wallet. A 6-digit code will be generated; enter it on the other device to join.
    </p>
  </>
);

function DeviceSyncSection() {
  const sync = useSync();
  const [joinCode, setJoinCode] = useState('');
  const [createResult, setCreateResult] = useState<{ pairingCode: string; walletId: string } | null>(null);
  const [joinConfirm, setJoinConfirm] = useState(false);
  const [syncInfoOpen, setSyncInfoOpen] = useState(false);

  if (!sync) return null;

  const { syncState, isCreatingCode, isJoining, isPushing, error, createSyncCode, joinWithCode, pauseSync, resumeSync, disconnectSync, clearError } = sync;
  const connected = !!syncState.walletId;

  const handleCreateCode = async () => {
    setCreateResult(null);
    clearError();
    try {
      const result = await createSyncCode();
      setCreateResult(result);
    } catch (_) {}
  };

  const handleJoin = async () => {
    if (!joinConfirm || !joinCode.trim()) return;
    clearError();
    try {
      await joinWithCode(joinCode.trim());
      setJoinCode('');
      setJoinConfirm(false);
    } catch (_) {}
  };

  return (
    <div className="settings-section" style={{ marginBottom: 24 }}>
      {error && (
        <p style={{ color: 'var(--danger, #ef4444)', fontSize: '0.9rem', marginBottom: 12 }}>{error}</p>
      )}
      {!connected ? (
        <>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginBottom: 0 }}
              onClick={handleCreateCode}
              disabled={isCreatingCode}
            >
              {isCreatingCode ? 'Creating…' : 'Create Sync Code'}
            </button>
            <button
              type="button"
              aria-label="Sync explanation"
              onClick={() => setSyncInfoOpen(true)}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: '1px solid var(--muted)',
                background: 'transparent',
                color: 'var(--muted)',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              i
            </button>
          </div>
          <Modal open={syncInfoOpen} title="Device Sync" onClose={() => setSyncInfoOpen(false)}>
            <div style={{ fontSize: '0.95rem', color: 'var(--text)' }}>{SYNC_EXPLANATION}</div>
          </Modal>
          {createResult && (
            <div style={{ padding: '12px 16px', background: 'var(--surface)', borderRadius: 8, marginBottom: 16 }}>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>This device is the source wallet</p>
              <p style={{ fontSize: '1.25rem', letterSpacing: 4, fontVariantNumeric: 'tabular-nums' }}>{createResult.pairingCode}</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 8 }}>Enter this code on the device you want to link. Code expires in 15 minutes.</p>
            </div>
          )}
          <div>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Join existing wallet</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--danger, #b91c1c)', marginBottom: 8 }}>
              This will replace local data on this device with the synced wallet.
            </p>
            {!joinConfirm ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setJoinConfirm(true)}
              >
                Join Existing Wallet
              </button>
            ) : (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ''))}
                  style={{ width: '120px', padding: '10px 12px', fontSize: '1rem', marginRight: 8, marginBottom: 8 }}
                />
                <button type="button" className="btn btn-primary" style={{ marginRight: 8 }} onClick={handleJoin} disabled={isJoining || joinCode.length !== 6}>
                  {isJoining ? 'Joining…' : 'Join'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setJoinConfirm(false); setJoinCode(''); clearError(); }}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <div>
          <p style={{ marginBottom: 8 }}><strong>Sync status:</strong> {syncState.syncPaused ? 'Paused' : 'Active'}{isPushing && ' (pushing…)'}</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 8 }}>
            Wallet: {syncState.walletId?.slice(0, 12)}… · Last synced: {syncState.lastSyncedAt ? new Date(syncState.lastSyncedAt).toLocaleString() : '—'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {syncState.syncPaused ? (
              <button type="button" className="btn btn-secondary" onClick={resumeSync}>Resume Sync</button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={pauseSync}>Pause Sync</button>
            )}
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => { if (confirm('Disconnect this device from the synced wallet? Your local data will stay as-is.')) disconnectSync(); }}
            >
              Disconnect This Device
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const actions = useLedgerStore((s) => s.actions);
  const [manageOpen, setManageOpen] = useState(false);
  const [birthdate, setBirthdate] = useState<string>(() => loadBirthdateISO() || '');
  const [appCustomizationOpen, setAppCustomizationOpen] = useState(false);
  const [editAccountNamesOpen, setEditAccountNamesOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [appGuideOpen, setAppGuideOpen] = useState(false);
  const [resetPasscodeOpen, setResetPasscodeOpen] = useState(false);
  const [aboutCreatorOpen, setAboutCreatorOpen] = useState(false);

  const hasPasscode = loadPasscodeHash() !== null;

  return (
    <div className="tab-panel active" id="settingsContent">
      <p className="section-title page-title">Settings</p>
      <p className="section-title">Appearance</p>
      <div className="settings-section" style={{ marginBottom: 24 }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '12px 18px', fontSize: '1rem' }}
          onClick={() => setAppCustomizationOpen(true)}
        >
          App Customization
        </button>
        <p style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--muted)' }}>
          Colors, typography, and surface styles.
        </p>
      </div>
      <AppCustomizationModal open={appCustomizationOpen} onClose={() => setAppCustomizationOpen(false)} />

      <p className="section-title" style={{ marginTop: 24 }}>Accounts</p>
      <div className="settings-section" style={{ marginBottom: 24 }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '12px 18px', fontSize: '1rem' }}
          onClick={() => setEditAccountNamesOpen(true)}
        >
          Edit Account Names
        </button>
        <p style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--muted)' }}>
          Rename banks, credit cards, and investing accounts.
        </p>
      </div>
      <EditAccountNamesModal open={editAccountNamesOpen} onClose={() => setEditAccountNamesOpen(false)} />

      <p className="section-title" style={{ marginTop: 24 }}>Device Sync</p>
      <DeviceSyncSection />

      {hasPasscode && (
        <>
          <p className="section-title" style={{ marginTop: 24 }}>Security</p>
          <div className="settings-section" style={{ marginBottom: 24 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '12px 18px', fontSize: '1rem' }}
              onClick={() => setResetPasscodeOpen(true)}
            >
              Reset passcode
            </button>
            <p style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--muted)' }}>
              Enter your current passcode, then set a new one. Recovery key and security questions are unchanged.
            </p>
          </div>
          <ResetPasscodeModal open={resetPasscodeOpen} onClose={() => setResetPasscodeOpen(false)} />
        </>
      )}

      <p className="section-title" style={{ marginTop: 24 }}>Security &amp; help</p>
      <div className="settings-section" style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button type="button" className="btn btn-secondary" onClick={() => setAppGuideOpen(true)}>
          How This App Works
        </button>
        <Link to="/privacy" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          Security Policy
        </Link>
        <button type="button" className="btn btn-secondary" onClick={() => setFaqOpen(true)}>
          FAQ
        </button>
      </div>
      <AppGuideModal open={appGuideOpen} onClose={() => setAppGuideOpen(false)} />
      <FAQModal open={faqOpen} onClose={() => setFaqOpen(false)} />

      <p className="section-title" style={{ marginTop: 24 }}>About the creator</p>
      <div className="settings-section" style={{ marginBottom: 24 }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '12px 18px', fontSize: '1rem' }}
          onClick={() => setAboutCreatorOpen(!aboutCreatorOpen)}
        >
          {aboutCreatorOpen ? 'Hide' : 'About the creator'}
        </button>
        {aboutCreatorOpen && (
          <div style={{ marginTop: 12, fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--ui-primary-text, var(--text))' }}>
            <p style={{ margin: '0 0 12px 0' }}>
              I built this app because I wanted a simple way to track every dollar across my accounts. Many existing finance tools focus on subscriptions, automated categorization, or constantly reconnecting bank accounts, and I found that frustrating. I wanted something where I could manually track everything including transfers between accounts or money sitting in apps like Venmo.
            </p>
            <p style={{ margin: '0 0 12px 0' }}>
              So I decided to build my own tool. I created this over the course of about three weeks as a personal project. My goal was to make something simple, transparent, and flexible for tracking finances.
            </p>
            <p style={{ margin: '0 0 12px 0' }}>
              I hope you enjoy using it.
            </p>
            <p style={{ margin: 0 }}>
              For security details, please see the Security Policy.<br />
              If you have questions or feedback you can contact me at:<br />
              <a href="mailto:iisauhaguilar@gmail.com" style={{ color: 'var(--accent)' }}>iisauhaguilar@gmail.com</a>
            </p>
          </div>
        )}
      </div>

      <p className="section-title" style={{ marginTop: 24 }}>Backup</p>
      <div className="settings-section">
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginBottom: 8 }}
          onClick={() => exportMonthlyPurchasesCsv()}
        >
          Export Monthly Purchases CSV
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            const text = exportJSON();
            const fileName = getExportFileName();

            // Attempt share sheet first (best for iOS PWA).
            try {
              const nav: any = navigator as any;
              if (nav.share) {
                const file = new File([text], fileName, { type: 'application/json' });
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

            // Last resort: download single JSON file.
            downloadJsonFile(fileName, text);
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

      <p className="section-title" style={{ marginTop: 24 }}>Danger zone</p>
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

