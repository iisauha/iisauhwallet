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

