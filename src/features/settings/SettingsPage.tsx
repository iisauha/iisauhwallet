import { useEffect, useRef, useState } from 'react';
import { TAB_ORDER_KEY, LAST_EXPORT_DATE_KEY, BACKUP_LOCATION_LABEL_KEY, BACKUP_REMINDER_DAYS_KEY, UNDO_DURATION_KEY } from '../../state/keys';
import { useLedgerStore } from '../../state/store';
import {
  exportJSON,
  importJSON,
  importJSONDecrypted,
  ENCRYPTED_IMPORT,
  loadCategoryConfig,
  saveCategoryConfig,
  getCategoryName,
  loadPasscodeHash,
  loadPasscodePaused,
  savePasscodePaused,
  loadAutoLockMinutes,
  saveAutoLockMinutes,
  loadShowWelcomeScreen,
  saveShowWelcomeScreen,
  loadUserDisplayName,
  saveUserDisplayName,
  loadUserProfileImage,
  saveUserProfileImage,
  loadHiddenTabs,
  saveHiddenTabs,
  hashPasscode,
  verifyPasscode,
  clearDataCache,
  logActivityEntry,
  estimateStorageUsage,
  archiveOldPurchases,
  saveData,
} from '../../state/storage';
import { useContentGuard } from '../../state/useContentGuard';
import { encryptWithPasscode, exportDeviceKeyToStorage } from '../../state/crypto';
import { useDialog } from '../../ui/DialogProvider';
import { Select } from '../../ui/Select';
import { ManageCategoriesModal } from './ManageCategoriesModal';
import { AppCustomizationModal } from './AppCustomizationModal';
import { EditAccountNamesModal } from './EditAccountNamesModal';
import { ResetPasscodeModal } from './ResetPasscodeModal';
import { FAQModal } from './FAQModal';
import { Modal } from '../../ui/Modal';
import {
  IconBox, IconPalette, IconLayout, IconLock, IconTag, IconDatabase, IconUser,
  IconExport, IconChevronRight, IconTrash, IconRefresh,
  IconHome, IconArrowExchange, IconCalendar, IconBankBuilding,
  IconBarChartTrend, IconRefreshCircle, IconStar, IconQuestionMark, IconInfoCircle,
} from '../../ui/icons';
import { OnboardingGuide } from '../onboarding/OnboardingGuide';

/** Returns export filename: Month_Day_Year.json */
function getExportFileName(): string {
  const d = new Date();
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[d.getMonth()]}_${d.getDate()}_${d.getFullYear()}.json`;
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
    ['Title', 'Date', 'Amount', 'Category', 'Subcategory', 'Notes'],
    ...purchases.map((p: { title?: string; dateISO?: string; amountCents?: number; category?: string; subcategory?: string; notes?: string }) => [
      escapeCsvCell(String(p.title ?? '')),
      escapeCsvCell(p.dateISO ?? ''),
      String((p.amountCents ?? 0) / 100),
      escapeCsvCell(getCategoryName(cfg, p.category ?? 'uncategorized')),
      escapeCsvCell(String(p.subcategory ?? '')),
      escapeCsvCell(String(p.notes ?? '')),
    ]),
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


function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No canvas context')); return; }
      ctx.drawImage(img, 0, 0, size, size);
      try { resolve(canvas.toDataURL('image/jpeg', 0.85)); } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

// Settings row component
function SettingsRow({
  icon,
  iconBg,
  label,
  sublabel,
  value,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  sublabel?: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`settings-row${danger ? ' settings-danger-row' : ''}`}
      onClick={onClick}
    >
      <span className="settings-row-icon" style={{ background: iconBg }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <span className="settings-row-label">{label}</span>
        {sublabel && <div className="settings-row-sublabel">{sublabel}</div>}
      </span>
      {value && <span className="settings-row-value">{value}</span>}
      {!danger && <span className="settings-row-chevron"><IconChevronRight /></span>}
    </button>
  );
}

const TAB_ORDER_ALL = [
  { key: 'snapshot',    label: 'Snapshot',           icon: <IconHome /> },
  { key: 'spending',    label: 'Spending',            icon: <IconArrowExchange /> },
  { key: 'upcoming',   label: 'Upcoming',            icon: <IconCalendar /> },
  { key: 'loans',      label: 'Loans',               icon: <IconBankBuilding /> },
  { key: 'investing',  label: 'Investing',           icon: <IconBarChartTrend /> },
  { key: 'recurring',  label: 'Recurring',           icon: <IconRefreshCircle /> },
  { key: 'subtracker', label: 'Sign-Up Bonuses',     icon: <IconStar /> },
];

function loadTabOrderFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(TAB_ORDER_KEY);
    if (!raw) return TAB_ORDER_ALL.map((t) => t.key);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return TAB_ORDER_ALL.map((t) => t.key);
    const allKeys = TAB_ORDER_ALL.map((t) => t.key);
    const filtered = (parsed as string[]).filter((k) => allKeys.includes(k));
    const missing = allKeys.filter((k) => !filtered.includes(k));
    return [...filtered, ...missing];
  } catch { return TAB_ORDER_ALL.map((t) => t.key); }
}


export function SettingsPage({ onTabOrderChange, exportTrigger = 0 }: { onTabOrderChange?: (order: string[]) => void; exportTrigger?: number } = {}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const profileImageRef = useRef<HTMLInputElement | null>(null);
  const actions = useLedgerStore((s) => s.actions);
  const { showAlert, showConfirm } = useDialog();
  const contentGuard = useContentGuard();
  const [manageOpen, setManageOpen] = useState(false);
  const [appCustomizationOpen, setAppCustomizationOpen] = useState(false);
  const [editAccountNamesOpen, setEditAccountNamesOpen] = useState(false);
  const [resetPasscodeOpen, setResetPasscodeOpen] = useState(false);
  const [pausePasscodeStep, setPausePasscodeStep] = useState<0 | 1 | 2>(0);
  const [aboutCreatorOpen, setAboutCreatorOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string>(() => loadUserDisplayName() || '');
  const [profileImage, setProfileImage] = useState<string | null>(() => loadUserProfileImage());

  // Keep name/pfp in sync: re-read on mount, on profile-updated, and on
  // any data change (covers crypto unlock, import, and cache repopulation).
  const data = useLedgerStore((s) => s.data);
  useEffect(() => {
    const refresh = () => {
      setDisplayName(loadUserDisplayName() || '');
      setProfileImage(loadUserProfileImage());
    };
    // Immediate re-read (catches lazy-load timing gaps)
    refresh();
    // Also re-read at short delays for crypto unlock lag
    const t1 = setTimeout(refresh, 80);
    const t2 = setTimeout(refresh, 500);
    window.addEventListener('profile-updated', refresh);
    return () => { clearTimeout(t1); clearTimeout(t2); window.removeEventListener('profile-updated', refresh); };
  }, [data]);
  const [hiddenTabs, setHiddenTabs] = useState<string[]>(() => loadHiddenTabs());
  const [visibleTabsModalOpen, setVisibleTabsModalOpen] = useState(false);
  const [tabOrder, setTabOrder] = useState<string[]>(() => loadTabOrderFromStorage());
  const [selectedTabKey, setSelectedTabKey] = useState<string | null>(null);

  const [backupLocationLabel, setBackupLocationLabel] = useState<string>(() => localStorage.getItem(BACKUP_LOCATION_LABEL_KEY) || '');
  const [backupReminderDays, setBackupReminderDays] = useState<number>(() => parseInt(localStorage.getItem(BACKUP_REMINDER_DAYS_KEY) || '1', 10) || 1);
  const [undoDuration, setUndoDuration] = useState<number>(() => parseInt(localStorage.getItem(UNDO_DURATION_KEY) || '5', 10) || 5);

  const hasPasscode = loadPasscodeHash() !== null;
  const [passcodePaused, setPasscodePaused] = useState(loadPasscodePaused());
  const [autoLockMinutes, setAutoLockMinutes] = useState(() => loadAutoLockMinutes());
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(() => loadShowWelcomeScreen());

  // Unified passcode-challenge modal (export JSON, export CSV, encrypted import)
  const [challenge, setChallenge] = useState<{ mode: 'export' | 'csv' | 'import'; pendingJson?: string; fails: number; delayUntil: number; input: string; error: string } | null>(null);
  const [challengeCountdown, setChallengeCountdown] = useState(0);

  useEffect(() => {
    if (!challenge || challenge.delayUntil === 0) { setChallengeCountdown(0); return; }
    const tick = () => {
      const rem = Math.ceil((challenge.delayUntil - Date.now()) / 1000);
      if (rem <= 0) { setChallengeCountdown(0); setChallenge((c) => c ? { ...c, delayUntil: 0 } : null); }
      else setChallengeCountdown(rem);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [challenge?.delayUntil]);

  const openChallenge = (mode: 'export' | 'csv' | 'import', pendingJson?: string) => {
    setChallenge({ mode, pendingJson, fails: 0, delayUntil: 0, input: '', error: '' });
    setChallengeCountdown(0);
  };

  const handleChallengeSubmit = async () => {
    if (!challenge) return;
    if (challenge.delayUntil > 0 && Date.now() < challenge.delayUntil) return;
    if (!/^\d{6}$/.test(challenge.input)) {
      setChallenge((c) => c ? { ...c, error: 'Enter 6 digits' } : null);
      return;
    }

    const onFail = () => {
      const nextFails = challenge.fails + 1;
      let delaySec = 0;
      if (nextFails >= 5) delaySec = 300;
      else if (nextFails >= 3) delaySec = 5;
      else if (nextFails >= 2) delaySec = 2;
      setChallenge((c) => c ? { ...c, fails: nextFails, error: `Incorrect passcode.${nextFails >= 5 ? ' Locked for 5 min.' : ''}`, input: '', delayUntil: delaySec > 0 ? Date.now() + delaySec * 1000 : 0 } : null);
    };

    const mode = challenge.mode;
    const pendingJson = challenge.pendingJson;
    const confirmedInput = challenge.input;

    // Import mode: skip local hash check, try decrypting the file directly
    if (mode === 'import' && pendingJson) {
      try {
        await importJSONDecrypted(pendingJson, confirmedInput);
        logActivityEntry({ type: 'backup_import', label: 'Data imported', ts: new Date().toISOString() });
        setChallenge(null);
        setChallengeCountdown(0);
        showAlert('Your data has been successfully restored. The app will now reload.');
        window.location.reload();
      } catch (_) {
        onFail();
      }
      return;
    }

    // Export/CSV mode: verify against local passcode hash
    const storedHash = loadPasscodeHash();
    if (!storedHash) return;
    const valid = await verifyPasscode(confirmedInput, storedHash);
    if (!valid) {
      onFail();
      return;
    }
    setChallenge(null);
    setChallengeCountdown(0);
    if (mode === 'export') {
      const plainText = exportJSON();
      const encrypted = await encryptWithPasscode(plainText, confirmedInput);
      doExportText(encrypted);
    } else if (mode === 'csv') {
      exportMonthlyPurchasesCsv();
    }
  };

  const lastExportTriggerRef = useRef(0);

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    resizeImageToDataUrl(file).then(
      (dataUrl) => { saveUserProfileImage(dataUrl); setProfileImage(dataUrl); window.dispatchEvent(new CustomEvent('profile-updated')); },
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

  const doExportText = async (text: string) => {
    const fileName = getExportFileName();
    const markExported = () => {
      localStorage.setItem(LAST_EXPORT_DATE_KEY, new Date().toISOString());
      logActivityEntry({ type: 'backup_export', label: 'Data exported', ts: new Date().toISOString() });
      window.dispatchEvent(new CustomEvent('backup-completed'));
    };
    try {
      const nav: any = navigator as any;
      if (nav.share) {
        const file = new File([text], fileName, { type: 'application/json' });
        await nav.share({ files: [file] });
        markExported();
        return;
      }
    } catch (_) {}
    try {
      const w = window.open('', '_blank');
      if (w) {
        w.document.open();
        w.document.write('<pre style="white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace;padding:16px;">' + text.replace(/</g, '&lt;') + '</pre>');
        w.document.close();
        markExported();
        return;
      }
    } catch (_) {}
    downloadJsonFile(fileName, text);
    markExported();
  };

  const handleExportJSON = async () => {
    if (hasPasscode) {
      openChallenge('export');
    } else {
      await doExportText(exportJSON());
    }
  };

  // Export trigger from quick-action sheet — must come after handleExportJSON
  useEffect(() => {
    if (exportTrigger !== lastExportTriggerRef.current) {
      lastExportTriggerRef.current = exportTrigger;
      if (exportTrigger > 0) handleExportJSON();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportTrigger]);

  return (
    <div className="tab-panel active" id="settingsContent">
      {/* Profile card */}
      <div
        className="card"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 8, padding: '24px 16px 20px' }}
      >
        <input ref={profileImageRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProfileImageChange} />
        <button
          type="button"
          onClick={() => profileImageRef.current?.click()}
          style={{
            width: 96, height: 96, borderRadius: '50%', padding: 0, border: '2.5px solid var(--ui-border, var(--border))',
            background: profileImage ? `url(${profileImage}) center/cover` : 'var(--ui-card-bg, var(--surface))',
            color: 'var(--accent)', fontSize: '2.2rem', fontWeight: 700, flexShrink: 0, cursor: 'pointer',
          }}
          aria-label="Change profile photo"
        >
          {!profileImage && (displayName ? displayName.charAt(0).toUpperCase() : <span style={{ fontSize: '1.4rem', color: 'var(--muted)' }}>+</span>)}
        </button>
        <div style={{ width: '100%', textAlign: 'center' }}>
          <label htmlFor="settings-display-name" style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
            Your name
          </label>
          <input
            id="settings-display-name"
            type="text"
            value={displayName}
            onChange={(e) => {
              const v = e.target.value;
              if (!contentGuard(v, () => { setDisplayName(''); saveUserDisplayName(null); window.dispatchEvent(new CustomEvent('profile-updated')); })) {
                setDisplayName(v);
              }
            }}
            onBlur={() => {
              saveUserDisplayName(displayName || null);
              window.dispatchEvent(new CustomEvent('profile-updated'));
            }}
            placeholder="Enter your name"
            style={{
              width: '100%', padding: 0, fontSize: '1.6rem', fontWeight: 700, textAlign: 'center',
              border: 'none', background: 'transparent',
              color: 'var(--ui-title-text, var(--ui-primary-text, var(--text)))',
              fontFamily: 'var(--app-font-family)',
            }}
          />
        </div>
      </div>

      {/* Appearance */}
      <p className="settings-group-label">Appearance</p>
      <div className="settings-list">
        <SettingsRow
          icon={<IconPalette />}
          iconBg="var(--accent)"
          label="App Customization"
          sublabel="Theme, colors & typography"
          onClick={() => setAppCustomizationOpen(true)}
        />
        <SettingsRow
          icon={<IconLayout />}
          iconBg="color-mix(in srgb, var(--accent) 80%, #3B82F6)"
          label="Manage Tabs"
          sublabel="Reorder and show/hide navigation tabs"
          onClick={() => setVisibleTabsModalOpen(true)}
        />
        <div className="settings-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="settings-row-icon-wrap" style={{ background: 'var(--accent)' }}>
              <IconHome />
            </span>
            <div>
              <div className="settings-row-label">Show Welcome Screen</div>
              <div className="settings-row-sublabel">Display "Welcome back" when opening the app</div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={showWelcomeScreen}
            onChange={(e) => {
              setShowWelcomeScreen(e.target.checked);
              saveShowWelcomeScreen(e.target.checked);
            }}
            style={{ width: 20, height: 20, accentColor: 'var(--ui-add-btn, var(--accent))', cursor: 'pointer', flexShrink: 0 }}
          />
        </div>
      </div>
      <AppCustomizationModal open={appCustomizationOpen} onClose={() => setAppCustomizationOpen(false)} />

      {/* Accounts */}
      <p className="settings-group-label">Accounts</p>
      <div className="settings-list">
        <SettingsRow
          icon={<IconUser />}
          iconBg="var(--green)"
          label="Edit Account Names"
          sublabel="Rename your bank accounts & cards"
          onClick={() => setEditAccountNamesOpen(true)}
        />
      </div>
      <EditAccountNamesModal open={editAccountNamesOpen} onClose={() => setEditAccountNamesOpen(false)} />

      {/* Categories */}
      <p className="settings-group-label">Categories</p>
      <div className="settings-list">
        <SettingsRow
          icon={<IconTag />}
          iconBg="color-mix(in srgb, var(--accent) 70%, #F59E0B)"
          label="Manage Categories"
          sublabel="Add, rename, or remove spending categories"
          onClick={() => setManageOpen(true)}
        />
      </div>

      {/* Security */}
      {hasPasscode && (
        <>
          <p className="settings-group-label">Security</p>
          <div className="settings-list">
            {passcodePaused ? (
              <SettingsRow
                icon={<IconLock />}
                iconBg="var(--red)"
                label="Resume Passcode Protection"
                sublabel="Passcode is currently paused"
                onClick={() => { savePasscodePaused(false); setPasscodePaused(false); }}
              />
            ) : (
              <SettingsRow
                icon={<IconLock />}
                iconBg="var(--accent)"
                label="Pause Passcode Protection"
                onClick={() => setPausePasscodeStep(1)}
              />
            )}
            <SettingsRow
              icon={<IconLock />}
              iconBg="color-mix(in srgb, var(--accent) 70%, #6366F1)"
              label="Reset Passcode"
              onClick={() => setResetPasscodeOpen(true)}
            />
            <div className="settings-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="settings-row-icon-wrap" style={{ background: 'var(--accent)' }}>
                  <IconLock />
                </span>
                <div>
                  <div className="settings-row-label">Auto-Lock After Inactivity</div>
                  <div className="settings-row-sublabel">Lock app after this many minutes of inactivity</div>
                </div>
              </div>
              <Select
                className="ll-select-compact"
                value={autoLockMinutes}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setAutoLockMinutes(v);
                  saveAutoLockMinutes(v);
                }}
              >
                <option value={1}>1 min</option>
                <option value={2}>2 min</option>
                <option value={5}>5 min</option>
                <option value={10}>10 min</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={0}>Never</option>
              </Select>
            </div>
            <SettingsRow
              icon={<IconQuestionMark />}
              iconBg="var(--green)"
              label="Security FAQ"
              sublabel="Encryption, passcode, and privacy questions"
              onClick={() => setFaqOpen(true)}
            />
          </div>
        </>
      )}

      {/* Backup */}
      <p className="settings-group-label">Backup</p>
      <div className="settings-list">
        <SettingsRow
          icon={<IconExport />}
          iconBg="var(--accent)"
          label="Export Backup"
          sublabel="Download a full backup of all your data"
          onClick={handleExportJSON}
        />
        <SettingsRow
          icon={<IconDatabase />}
          iconBg="var(--green)"
          label="Export Purchases Spreadsheet"
          sublabel="This calendar month's purchases as a spreadsheet file"
          onClick={() => hasPasscode ? openChallenge('csv') : exportMonthlyPurchasesCsv()}
        />
        <SettingsRow
          icon={<IconDatabase />}
          iconBg="var(--muted)"
          label="Import Backup"
          sublabel="Restore all data from a backup file (replaces current data)"
          onClick={() => fileRef.current?.click()}
        />
        <SettingsRow
          icon={<IconRefresh />}
          iconBg="var(--accent)"
          label="Check for Updates"
          sublabel="Clears cached files and reloads. Your data is not affected."
          onClick={async () => {
            if ('serviceWorker' in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              for (const reg of registrations) await reg.unregister();
            }
            if ('caches' in window) {
              const keys = await caches.keys();
              for (const key of keys) await caches.delete(key);
            }
            window.location.reload();
          }}
        />
        {/* Default save location — inside settings-list for consistent border styling */}
        <div style={{ padding: '13px 14px', borderTop: '1px solid var(--ui-border, var(--border-subtle))' }}>
          <label className="settings-row-label" style={{ display: 'block', marginBottom: 4 }}>
            Default save location
          </label>
          <div className="settings-row-sublabel" style={{ marginBottom: 10 }}>
            A personal reminder for yourself. When your backup reminder pops up, it'll show this so you remember where you usually save your backups.
          </div>
          <input
            type="text"
            value={backupLocationLabel}
            onChange={(e) => setBackupLocationLabel(e.target.value)}
            onBlur={() => {
              const trimmed = backupLocationLabel.trim();
              if (trimmed) {
                localStorage.setItem(BACKUP_LOCATION_LABEL_KEY, trimmed);
              } else {
                localStorage.removeItem(BACKUP_LOCATION_LABEL_KEY);
              }
              setBackupLocationLabel(trimmed);
            }}
            placeholder="e.g. iCloud Drive / iisauh Wallet Backups"
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: '0.82rem',
              borderRadius: 8,
              border: '1px solid var(--ui-border, var(--border))',
              background: 'var(--ui-surface-secondary, var(--surface))',
              color: 'var(--ui-primary-text, var(--text))',
              fontFamily: 'var(--app-font-family)',
            }}
          />
        </div>
        <div className="settings-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', gap: 12 }}>
          <div>
            <div className="settings-row-label">Backup reminder</div>
            <div className="settings-row-sublabel">
              {(() => {
                const lastStr = localStorage.getItem(LAST_EXPORT_DATE_KEY);
                if (!lastStr) return 'You haven\'t backed up yet. Reminder will show next time you open the app.';
                const lastDate = new Date(lastStr);
                if (isNaN(lastDate.getTime())) return 'You haven\'t backed up yet.';
                const nextDate = new Date(lastDate.getTime() + backupReminderDays * 24 * 60 * 60 * 1000);
                const now = new Date();
                if (nextDate <= now) return 'Reminder is due now. Back up soon!';
                const fmt = nextDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const time = nextDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                return `Next reminder on ${fmt} at ${time}`;
              })()}
            </div>
          </div>
          <Select
            className="ll-select-compact"
            value={backupReminderDays}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setBackupReminderDays(v);
              localStorage.setItem(BACKUP_REMINDER_DAYS_KEY, String(v));
            }}
          >
            <option value={1}>Every day</option>
            <option value={2}>Every 2 days</option>
            <option value={3}>Every 3 days</option>
            <option value={4}>Every 4 days</option>
            <option value={5}>Every 5 days</option>
            <option value={6}>Every 6 days</option>
            <option value={7}>Every 7 days</option>
          </Select>
        </div>
      </div>
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
            const text = String(r.result || '');
            try {
              importJSON(text);
              logActivityEntry({ type: 'backup_import', label: 'Data imported', ts: new Date().toISOString() });
              showAlert('Your data has been successfully restored. The app will now reload.');
              window.location.reload();
            } catch (err: any) {
              if (err?.message === ENCRYPTED_IMPORT) {
                openChallenge('import', text);
              } else {
                showAlert('This file doesn\'t appear to be a valid backup. Make sure you selected a backup file exported from this app.');
              }
            }
            e.target.value = '';
          };
          r.readAsText(f);
        }}
      />

      {/* Storage */}
      <p className="settings-group-label">Storage</p>
      <div className="settings-list">
        <SettingsRow
          icon={<IconBox />}
          iconBg="var(--accent)"
          label="Storage Usage"
          sublabel={(() => {
            void data;
            const { totalBytes, purchaseCount } = estimateStorageUsage();
            const capBytes = 5 * 1024 * 1024;
            const kb = (totalBytes / 1024).toFixed(0);
            const mb = (totalBytes / (1024 * 1024)).toFixed(2);
            const pct = ((totalBytes / capBytes) * 100).toFixed(1);
            const usageLine = `${Number(kb) > 1024 ? mb + ' MB' : kb + ' KB'} used (~${pct}% of 5 MB) \u2022 ${purchaseCount} purchases`;
            if (purchaseCount < 2) return usageLine;
            // Estimate when storage will fill based on purchase rate
            const purchases = (data.purchases || []) as any[];
            const dates = purchases.map((p: any) => p.dateISO).filter(Boolean).sort();
            if (dates.length < 2) return usageLine;
            const firstDate = new Date(dates[0] + 'T00:00:00');
            const lastDate = new Date(dates[dates.length - 1] + 'T00:00:00');
            const spanDays = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
            const bytesPerDay = totalBytes / spanDays;
            if (bytesPerDay <= 0) return usageLine;
            const daysLeft = Math.floor((capBytes - totalBytes) / bytesPerDay);
            if (daysLeft <= 0) return usageLine + '\nStorage is nearly full.';
            const estDate = new Date(Date.now() + daysLeft * 24 * 60 * 60 * 1000);
            const estLabel = estDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            return `${usageLine}\nEstimated full ~${estLabel} (rough estimate, varies by usage)`;
          })()}
        />
        <SettingsRow
          icon={<IconTrash />}
          iconBg="#f59e0b"
          label="Remove Old Purchases"
          sublabel="Deletes individual purchase records older than 6 months. Your total spending per category per month is still saved so your spending breakdown and charts stay accurate."
          onClick={async () => {
            const ok = await showConfirm('Remove all purchases older than 6 months? Individual records will be deleted, but your total spending per category per month is preserved so charts and category breakdowns remain accurate. This cannot be undone. Consider exporting a backup first.');
            if (!ok) return;
            const current = useLedgerStore.getState().data;
            const result = archiveOldPurchases(current, 6);
            if (result.archivedCount === 0) {
              await showAlert('No purchases older than 6 months found.');
              return;
            }
            saveData(result.data);
            actions.reload();
            await showAlert(`Archived ${result.archivedCount} old purchase${result.archivedCount === 1 ? '' : 's'}.`);
          }}
        />
        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))' }}>Undo popup duration</span>
          <Select
            className="ll-select-compact"
            value={undoDuration}
            onChange={(e) => {
              const v = Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 5));
              setUndoDuration(v);
              localStorage.setItem(UNDO_DURATION_KEY, String(v));
            }}
          >
            {[3, 5, 8, 10, 15].map(s => <option key={s} value={s}>{s}s</option>)}
          </Select>
        </div>
      </div>

      {/* About */}
      <p className="settings-group-label">About</p>
      <div className="settings-list">
        <SettingsRow
          icon={<IconInfoCircle />}
          iconBg="var(--accent)"
          label="App Guide (How this app works)"
          onClick={() => setHowItWorksOpen(true)}
        />
        <SettingsRow
          icon={<IconUser />}
          iconBg="var(--accent)"
          label="About the Creator"
          onClick={() => setAboutCreatorOpen(true)}
        />
      </div>

      {/* Danger zone */}
      <p className="settings-group-label">Danger Zone</p>
      <div className="settings-list">
        <button
          type="button"
          className="settings-row settings-danger-row"
          onClick={async () => {
            const ok = await showConfirm('Permanently delete ALL your data? This will erase every account, transaction, loan, investment, and setting. This cannot be undone. Consider exporting a backup first.');
            if (!ok) return;
            clearDataCache();
            localStorage.clear();
            actions.reload();
          }}
        >
          <span className="settings-row-icon" style={{ background: 'var(--red)' }}>
            <IconTrash />
          </span>
          <span className="settings-row-label" style={{ color: 'var(--red)' }}>Reset All Data</span>
        </button>
      </div>

      {/* Modals */}
      <ManageCategoriesModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        load={() => loadCategoryConfig()}
        save={(cfg) => saveCategoryConfig(cfg)}
      />
      <ResetPasscodeModal open={resetPasscodeOpen} onClose={() => setResetPasscodeOpen(false)} />
      <FAQModal open={faqOpen} onClose={() => setFaqOpen(false)} />

      <Modal open={visibleTabsModalOpen} title="Manage Tabs" onClose={() => { setVisibleTabsModalOpen(false); setSelectedTabKey(null); }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.4 }}>
          Tap a tab to select · tap another to swap positions · toggle to show/hide
        </p>
        {selectedTabKey && (
          <p style={{ fontSize: '0.78rem', color: 'var(--accent)', margin: '0 0 8px', fontWeight: 600 }}>
            &ldquo;{TAB_ORDER_ALL.find(t => t.key === selectedTabKey)?.label}&rdquo; selected. Tap another tab to swap
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {tabOrder.map((key) => {
            const item = TAB_ORDER_ALL.find((t) => t.key === key);
            if (!item) return null;
            const visible = !hiddenTabs.includes(key);
            const isSelected = selectedTabKey === key;
            const isPending = selectedTabKey !== null && !isSelected;
            return (
              <div
                key={key}
                onClick={() => {
                  if (selectedTabKey === null) {
                    setSelectedTabKey(key);
                  } else if (selectedTabKey === key) {
                    setSelectedTabKey(null);
                  } else {
                    const fromIdx = tabOrder.indexOf(selectedTabKey);
                    const toIdx = tabOrder.indexOf(key);
                    if (fromIdx >= 0 && toIdx >= 0) {
                      const next = [...tabOrder];
                      [next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]];
                      setTabOrder(next);
                      localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(next));
                      onTabOrderChange?.(next);
                    }
                    setSelectedTabKey(null);
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  background: isSelected
                    ? 'color-mix(in srgb, var(--accent) 20%, var(--ui-surface-secondary, var(--surface)))'
                    : 'var(--ui-surface-secondary, var(--surface))',
                  border: isSelected ? '1px solid var(--accent)' : isPending ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' : '1px solid transparent',
                  borderRadius: 10, cursor: 'pointer', userSelect: 'none',
                  opacity: visible ? 1 : 0.45,
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                }}
              >
                <span style={{ color: isSelected ? 'var(--accent)' : 'var(--muted)', fontSize: '1rem', flexShrink: 0 }}>⇅</span>
                <span style={{ flex: 1, fontSize: '0.95rem', color: 'var(--ui-primary-text, var(--text))' }}>
                  {item.label}
                </span>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggleTabHidden(key)}
                    style={{ width: 20, height: 20, accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                </label>
              </div>
            );
          })}
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={() => { setVisibleTabsModalOpen(false); setSelectedTabKey(null); }}>Done</button>
        </div>
      </Modal>

      {hasPasscode && (
        <>
          {pausePasscodeStep === 1 ? (
            <Modal open={true} title="Pause passcode?" onClose={() => setPausePasscodeStep(0)}>
              <p style={{ margin: '0 0 16px 0', color: 'var(--ui-primary-text, var(--text))' }}>
                This reduces app security. Anyone with access to this device could open the app without a passcode.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setPausePasscodeStep(0)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={() => setPausePasscodeStep(2)}>Continue</button>
              </div>
            </Modal>
          ) : pausePasscodeStep === 2 ? (
            <Modal open={true} title="Confirm pause" onClose={() => setPausePasscodeStep(0)}>
              <p style={{ margin: '0 0 16px 0', color: 'var(--ui-primary-text, var(--text))' }}>
                Confirm: the passcode will not be required when opening the app until you tap &quot;Resume passcode protection&quot;.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setPausePasscodeStep(0)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={async () => { await exportDeviceKeyToStorage(); savePasscodePaused(true); setPasscodePaused(true); setPausePasscodeStep(0); }}>Pause passcode</button>
              </div>
            </Modal>
          ) : null}
        </>
      )}

      {/* Passcode challenge modal (export JSON / export CSV / encrypted import) */}
      {challenge && (
        <Modal
          open={true}
          title={challenge.mode === 'export' ? 'Confirm export' : challenge.mode === 'csv' ? 'Confirm CSV export' : 'Encrypted backup'}
          onClose={() => { setChallenge(null); setChallengeCountdown(0); }}
        >
          <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.4 }}>
            {challenge.mode === 'import'
              ? 'This backup is encrypted. Enter the passcode that was used when this backup was exported.'
              : 'Enter your passcode to continue.'}
          </p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoComplete="off"
            value={challenge.input}
            onChange={(e) => setChallenge((c) => c ? { ...c, input: e.target.value.replace(/\D/g, '').slice(0, 6), error: '' } : null)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleChallengeSubmit(); }}
            placeholder="••••••"
            style={{ width: '100%', padding: '10px 12px', fontSize: '1.1rem', letterSpacing: '0.2em', borderRadius: 8, border: '1px solid var(--ui-border, var(--border))', background: 'var(--ui-surface-secondary, var(--surface))', color: 'var(--text)', marginBottom: 8, boxSizing: 'border-box' }}
            autoFocus
          />
          {challenge.error && <p style={{ margin: '0 0 10px 0', fontSize: '0.87rem', color: 'var(--red)' }}>{challenge.error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setChallenge(null); setChallengeCountdown(0); }}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleChallengeSubmit}
              disabled={challengeCountdown > 0}
            >
              {challengeCountdown > 0 ? `Try again in ${challengeCountdown}s…` : 'Confirm'}
            </button>
          </div>
        </Modal>
      )}

      {howItWorksOpen && (
        <OnboardingGuide
          canClose
          onClose={() => setHowItWorksOpen(false)}
          onDone={() => setHowItWorksOpen(false)}
        />
      )}

      {aboutCreatorOpen && (
        <Modal open={true} title="About me" onClose={() => setAboutCreatorOpen(false)}>
          <div style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--ui-primary-text, var(--text))', fontFamily: 'var(--app-font-family)' }}>
            <p style={{ margin: '0 0 12px 0' }}>Hi, my name is Isaiah. I built this app, iisauhwallet, because I am really into credit cards, points, and personal finance tracking.</p>
            <p style={{ margin: '0 0 12px 0' }}>I was trying to find an app that could do everything in one place. Automatic bank syncing can be frustrating, and most apps push subscriptions when they should help you budget.</p>
            <p style={{ margin: '0 0 12px 0' }}>Another gap I noticed: most apps don't properly track money in transit, like transfers between banks or Venmo. The goal is simple: always know exactly where your money is.</p>
            <p style={{ margin: 0 }}>I hope you enjoy it.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
