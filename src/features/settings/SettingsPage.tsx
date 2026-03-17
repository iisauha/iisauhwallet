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
  loadPasscodePaused,
  savePasscodePaused,
  loadUserDisplayName,
  saveUserDisplayName,
  loadUserProfileImage,
  saveUserProfileImage,
  loadHiddenTabs,
  saveHiddenTabs,
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

const HIDEABLE_TAB_KEYS = ['snapshot', 'spending', 'upcoming', 'loans', 'investing', 'recurring', 'subtracker'] as const;
const HIDEABLE_TAB_LABELS: Record<string, string> = {
  snapshot: 'Snapshot',
  spending: 'Spending',
  upcoming: 'Upcoming',
  loans: 'Loans',
  investing: 'Investing',
  recurring: 'Recurring',
  subtracker: 'Sign Up Bonus Tracker',
};

/** Resize image to max 200x200 and return as data URL to keep localStorage small. */
function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
    img.src = url;
  });
}

export function SettingsPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const profileImageRef = useRef<HTMLInputElement | null>(null);
  const actions = useLedgerStore((s) => s.actions);
  const [manageOpen, setManageOpen] = useState(false);
  const [birthdate, setBirthdate] = useState<string>(() => loadBirthdateISO() || '');
  const [appCustomizationOpen, setAppCustomizationOpen] = useState(false);
  const [editAccountNamesOpen, setEditAccountNamesOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [appGuideOpen, setAppGuideOpen] = useState(false);
  const [resetPasscodeOpen, setResetPasscodeOpen] = useState(false);
  const [pausePasscodeStep, setPausePasscodeStep] = useState<0 | 1 | 2>(0);
  const [aboutCreatorOpen, setAboutCreatorOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string>(() => loadUserDisplayName() || '');
  const [profileImage, setProfileImage] = useState<string | null>(() => loadUserProfileImage());
  const [hiddenTabs, setHiddenTabs] = useState<string[]>(() => loadHiddenTabs());

  const hasPasscode = loadPasscodeHash() !== null;
  const passcodePaused = loadPasscodePaused();

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    resizeImageToDataUrl(file).then(
      (dataUrl) => {
        saveUserProfileImage(dataUrl);
        setProfileImage(dataUrl);
      },
      () => {}
    );
    e.target.value = '';
  };

  const toggleTabHidden = (tabKey: string) => {
    const next = hiddenTabs.includes(tabKey)
      ? hiddenTabs.filter((k) => k !== tabKey)
      : [...hiddenTabs, tabKey];
    setHiddenTabs(next);
    saveHiddenTabs(next);
  };

  return (
    <div className="tab-panel active" id="settingsContent">
      <p className="section-title page-title">Settings</p>

      <div className="settings-section" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <input
          ref={profileImageRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleProfileImageChange}
        />
        <button
          type="button"
          onClick={() => profileImageRef.current?.click()}
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            padding: 0,
            border: '2px solid var(--border)',
            background: profileImage ? `url(${profileImage}) center/cover` : 'var(--surface)',
            color: 'var(--muted)',
            fontSize: '1.25rem',
            fontWeight: 600,
            flexShrink: 0,
          }}
          aria-label="Change profile photo"
        >
          {!profileImage && (displayName ? displayName.charAt(0).toUpperCase() : '?')}
        </button>
        <div style={{ flex: 1, minWidth: 120 }}>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={() => saveUserDisplayName(displayName || null)}
            placeholder="Your name"
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '1.05rem',
              fontWeight: 600,
              border: '1px solid var(--border)',
              borderRadius: 10,
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          />
        </div>
      </div>

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
      </div>
      <AppCustomizationModal open={appCustomizationOpen} onClose={() => setAppCustomizationOpen(false)} />

      <p className="section-title" style={{ marginTop: 24 }}>Visible tabs</p>
      <div className="settings-section" style={{ marginBottom: 24 }}>
        <p style={{ fontSize: '0.9rem', color: 'var(--muted)', margin: '0 0 10px 0' }}>
          Hide tabs you don’t use from the bottom bar. Settings is always visible.
        </p>
        {HIDEABLE_TAB_KEYS.map((tabKey) => (
          <label
            key={tabKey}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 8,
              cursor: 'pointer',
              fontSize: '0.95rem',
            }}
          >
            <input
              type="checkbox"
              checked={!hiddenTabs.includes(tabKey)}
              onChange={() => toggleTabHidden(tabKey)}
            />
            <span>{HIDEABLE_TAB_LABELS[tabKey]}</span>
          </label>
        ))}
      </div>

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
      </div>
      <EditAccountNamesModal open={editAccountNamesOpen} onClose={() => setEditAccountNamesOpen(false)} />

      <p className="section-title" style={{ marginTop: 24 }}>Security &amp; privacy</p>
      <div className="settings-section" style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {hasPasscode && (
          <>
            {passcodePaused ? (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '12px 18px', fontSize: '1rem' }}
                onClick={() => savePasscodePaused(false)}
              >
                Resume passcode protection
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '12px 18px', fontSize: '1rem' }}
                onClick={() => setPausePasscodeStep(1)}
              >
                Pause passcode protection
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '12px 18px', fontSize: '1rem' }}
              onClick={() => setResetPasscodeOpen(true)}
            >
              Reset passcode
            </button>
          </>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
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
      </div>
      {hasPasscode && (
        <>
          {pausePasscodeStep === 1 ? (
            <Modal open={true} title="Pause passcode?" onClose={() => setPausePasscodeStep(0)}>
              <p style={{ margin: '0 0 16px 0', color: 'var(--muted)' }}>
                This reduces app security. Anyone with access to this device could open the app without a passcode. Your data will still be stored locally on this device.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setPausePasscodeStep(0)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={() => setPausePasscodeStep(2)}>Continue</button>
              </div>
            </Modal>
          ) : pausePasscodeStep === 2 ? (
            <Modal open={true} title="Confirm pause" onClose={() => setPausePasscodeStep(0)}>
              <p style={{ margin: '0 0 16px 0', color: 'var(--muted)' }}>
                Confirm again: the passcode will not be required when opening the app until you tap &quot;Resume passcode protection&quot; in Settings.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setPausePasscodeStep(0)}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    savePasscodePaused(true);
                    setPausePasscodeStep(0);
                  }}
                >
                  Pause passcode
                </button>
              </div>
            </Modal>
          ) : null}
          <ResetPasscodeModal open={resetPasscodeOpen} onClose={() => setResetPasscodeOpen(false)} />
        </>
      )}
      <AppGuideModal open={appGuideOpen} onClose={() => setAppGuideOpen(false)} />
      <FAQModal open={faqOpen} onClose={() => setFaqOpen(false)} />

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

