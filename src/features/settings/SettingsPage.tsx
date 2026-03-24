import { useEffect, useRef, useState } from 'react';
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
  const [resetPasscodeOpen, setResetPasscodeOpen] = useState(false);
  const [pausePasscodeStep, setPausePasscodeStep] = useState<0 | 1 | 2>(0);
  const [aboutCreatorOpen, setAboutCreatorOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string>(() => loadUserDisplayName() || '');
  const [profileImage, setProfileImage] = useState<string | null>(() => loadUserProfileImage());
  const [hiddenTabs, setHiddenTabs] = useState<string[]>(() => loadHiddenTabs());
  const [visibleTabsModalOpen, setVisibleTabsModalOpen] = useState(false);

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

      <div className="settings-section" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
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
            width: 72,
            height: 72,
            borderRadius: '50%',
            padding: 0,
            border: 'none',
            background: profileImage ? `url(${profileImage}) center/cover` : 'var(--ui-card-bg, var(--surface))',
            color: 'var(--ui-primary-text, var(--text))',
            fontSize: '1.5rem',
            fontWeight: 600,
            flexShrink: 0,
          }}
          aria-label="Change profile photo"
        >
          {!profileImage && (displayName ? displayName.charAt(0).toUpperCase() : '?')}
        </button>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{
            fontSize: '0.8rem',
            color: 'var(--ui-primary-text, var(--text))',
            opacity: 0.55,
            marginBottom: 3,
            fontWeight: 500,
            letterSpacing: '0.01em',
          }}>
            Welcome back
          </div>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={() => saveUserDisplayName(displayName || null)}
            placeholder="Your name"
            style={{
              width: '100%',
              padding: displayName ? '0' : '8px 12px',
              fontSize: '1.4rem',
              fontWeight: 700,
              border: displayName ? 'none' : '1px solid var(--ui-border, var(--border))',
              borderRadius: 10,
              background: 'transparent',
              color: 'var(--ui-title-text, var(--ui-primary-text, var(--text)))',
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
        <button type="button" className="settings-outline-trigger" onClick={() => setVisibleTabsModalOpen(true)}>
          Choose which tabs appear in the bar…
        </button>
      </div>
      <Modal open={visibleTabsModalOpen} title="Visible tabs" onClose={() => setVisibleTabsModalOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          {HIDEABLE_TAB_KEYS.map((tabKey) => (
            <label
              key={tabKey}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                fontSize: '1rem',
                color: 'var(--ui-primary-text, var(--text))',
                fontFamily: 'var(--app-font-family)',
              }}
            >
              <input
                type="checkbox"
                checked={!hiddenTabs.includes(tabKey)}
                onChange={() => toggleTabHidden(tabKey)}
                style={{ width: 22, height: 22, flexShrink: 0, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <span>{HIDEABLE_TAB_LABELS[tabKey]}</span>
            </label>
          ))}
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => setVisibleTabsModalOpen(false)}>
            Done
          </button>
        </div>
      </Modal>

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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
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
                className="btn btn-secondary btn-outline-neutral"
                style={{ padding: '12px 18px', fontSize: '1rem' }}
                onClick={() => setPausePasscodeStep(1)}
              >
                Pause passcode protection
              </button>
            )}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {hasPasscode && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '12px 18px', fontSize: '1rem' }}
              onClick={() => setResetPasscodeOpen(true)}
            >
              Reset passcode
            </button>
          )}
        </div>
      </div>
      {hasPasscode && (
        <>
          {pausePasscodeStep === 1 ? (
            <Modal open={true} title="Pause passcode?" onClose={() => setPausePasscodeStep(0)}>
              <p style={{ margin: '0 0 16px 0', color: 'var(--ui-primary-text, var(--text))' }}>
                This reduces app security. Anyone with access to this device could open the app without a passcode. Your data will still be stored locally on this device.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setPausePasscodeStep(0)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={() => setPausePasscodeStep(2)}>Continue</button>
              </div>
            </Modal>
          ) : pausePasscodeStep === 2 ? (
            <Modal open={true} title="Confirm pause" onClose={() => setPausePasscodeStep(0)}>
              <p style={{ margin: '0 0 16px 0', color: 'var(--ui-primary-text, var(--text))' }}>
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
                // Only share the JSON file to avoid some platforms creating an extra .txt artifact.
                await nav.share({ files: [file], title: 'Backup' });
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
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 16, marginLeft: 8 }}
          onClick={() => fileRef.current?.click()}
        >
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

      <p className="section-title" style={{ marginTop: 24 }}>About me</p>
      <div className="settings-section" style={{ marginBottom: 24 }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '12px 18px', fontSize: '1rem' }}
          onClick={() => setAboutCreatorOpen(true)}
        >
          About the creator
        </button>
      </div>
      {aboutCreatorOpen && (
        <Modal open={true} title="About me" onClose={() => setAboutCreatorOpen(false)}>
          <div style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--ui-primary-text, var(--text))', fontFamily: 'var(--app-font-family)' }}>
            <p style={{ margin: '0 0 12px 0' }}>
              Hi, my name is Isaiah. I built this app, iisauhwallet, because I am really into credit cards, points, and personal finance tracking.
            </p>
            <p style={{ margin: '0 0 12px 0' }}>
              Recently, I was trying to find an app that could do everything in one place. There are some really good options out there, but each has its drawbacks. From my experience, automatic bank syncing can get frustrating because of repeated login verifications and connection issues. A lot of apps also push subscriptions when they are supposed to help you budget, which feels counterproductive.
            </p>
            <p style={{ margin: '0 0 12px 0' }}>
              Another gap I noticed is that most apps do not properly track money in transit, like when you are moving funds between banks or from Venmo to your account. That is an important part of understanding where your money actually is at any given time.
            </p>
            <p style={{ margin: '0 0 12px 0' }}>
              So I decided to build my own app focused on solving that. The goal is simple: always know exactly where your money is. I also wanted to include features for tracking credit card points and bonuses, loans, investing accounts, and more.
            </p>
            <p style={{ margin: 0 }}>
              I hope you enjoy it.
            </p>
          </div>
        </Modal>
      )}

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

