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
import { useAuth } from '../../state/AuthContext';
import { stopSync, forceSyncToSupabase, pullFromSupabase, getLastSyncedAt, onSyncChange, listSnapshots, restoreSnapshot, loadSyncPassphrase, type SnapshotEntry } from '../../state/sync';
import { isBiometricAvailable, isBiometricEnabled, disableBiometric, enrollBiometric } from '../../state/biometric';

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

type CsvExportRange = 'this_month' | 'last_3' | 'last_6' | 'last_12' | 'all_time' | string; // string = specific "YYYY-MM"

function getMonthRange(range: CsvExportRange): { startKey: string; endKey: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  const monthKey = (yr: number, mo: number) => `${yr}-${String(mo + 1).padStart(2, '0')}`;
  const startOf = (yr: number, mo: number) => `${monthKey(yr, mo)}-01`;

  if (range === 'all_time') return { startKey: '0000-01-01', endKey: '9999-12-31', label: 'All Time' };

  let startMonth: Date;
  if (range === 'this_month') startMonth = new Date(y, m, 1);
  else if (range === 'last_3') startMonth = new Date(y, m - 2, 1);
  else if (range === 'last_6') startMonth = new Date(y, m - 5, 1);
  else if (range === 'last_12') startMonth = new Date(y, m - 11, 1);
  else {
    // specific month "YYYY-MM"
    const [sy, sm] = range.split('-').map(Number);
    startMonth = new Date(sy, sm - 1, 1);
    const endMonth = new Date(sy, sm, 1);
    return { startKey: startOf(startMonth.getFullYear(), startMonth.getMonth()), endKey: startOf(endMonth.getFullYear(), endMonth.getMonth()), label: startMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
  }
  const endMonth = new Date(y, m + 1, 1);
  const labels: Record<string, string> = { this_month: 'This Month', last_3: 'Last 3 Months', last_6: 'Last 6 Months', last_12: 'Last 12 Months' };
  return { startKey: startOf(startMonth.getFullYear(), startMonth.getMonth()), endKey: startOf(endMonth.getFullYear(), endMonth.getMonth()), label: labels[range] || range };
}

function exportPurchasesSpreadsheet(range: CsvExportRange) {
  const data = useLedgerStore.getState().data;
  const { startKey, endKey, label } = getMonthRange(range);
  const allPurchases = (data.purchases || [])
    .filter((p: { dateISO?: string }) => {
      const d = p.dateISO || '';
      return d >= startKey && d < endKey;
    })
    .sort((a: { dateISO?: string }, b: { dateISO?: string }) => (a.dateISO || '').localeCompare(b.dateISO || ''));

  const cfg = loadCategoryConfig();

  // Group by month
  const byMonth = new Map<string, typeof allPurchases>();
  for (const p of allPurchases) {
    const d = (p as { dateISO?: string }).dateISO || '';
    const mk = d.slice(0, 7); // "YYYY-MM"
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk)!.push(p);
  }

  const sortedMonths = Array.from(byMonth.keys()).sort();
  const rows: string[][] = [];

  for (let mi = 0; mi < sortedMonths.length; mi++) {
    const monthKey = sortedMonths[mi];
    const purchases = byMonth.get(monthKey)!;
    const [yr, mo] = monthKey.split('-').map(Number);
    const monthLabel = new Date(yr, mo - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    // Month header
    if (mi > 0) rows.push([]); // blank separator between months
    rows.push([`--- ${monthLabel} ---`, '', '', '', '', '']);
    rows.push(['Title', 'Date', 'Amount', 'Category', 'Subcategory', 'Notes']);

    for (const p of purchases) {
      const pp = p as { title?: string; dateISO?: string; amountCents?: number; category?: string; subcategory?: string; notes?: string };
      rows.push([
        escapeCsvCell(pp.title ?? ''),
        escapeCsvCell(pp.dateISO ?? ''),
        ((pp.amountCents ?? 0) / 100).toFixed(2),
        escapeCsvCell(getCategoryName(cfg, pp.category ?? 'uncategorized')),
        escapeCsvCell(pp.subcategory ?? ''),
        escapeCsvCell(pp.notes ?? ''),
      ]);
    }

    const total = purchases.reduce((s: number, p: any) => s + ((p.amountCents ?? 0) / 100), 0);
    rows.push(['Total', '', total.toFixed(2), '', '', '']);
  }

  if (!sortedMonths.length) {
    rows.push(['No purchases found for the selected period.']);
  }

  const csv = rows.map((r) => r.join(',')).join('\r\n');
  const now = new Date();
  const filename = `purchases_${label.toLowerCase().replace(/\s+/g, '_')}_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.csv`;
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

/** Get list of months that have purchases for the dropdown */
function getAvailablePurchaseMonths(): string[] {
  const data = useLedgerStore.getState().data;
  const months = new Set<string>();
  for (const p of (data.purchases || [])) {
    const d = (p as { dateISO?: string }).dateISO || '';
    if (d.length >= 7) months.add(d.slice(0, 7));
  }
  return Array.from(months).sort().reverse();
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
  const { signOut, user } = useAuth();
  const contentGuard = useContentGuard();
  const [lastSynced, setLastSynced] = useState(() => getLastSyncedAt());
  const [syncingNow, setSyncingNow] = useState(false);
  const [cloudBackupsOpen, setCloudBackupsOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [biometricOn, setBiometricOn] = useState(() => isBiometricEnabled());
  const [biometricSupported, setBiometricSupported] = useState(false);
  useEffect(() => { isBiometricAvailable().then(setBiometricSupported); }, []);
  useEffect(() => onSyncChange(() => setLastSynced(getLastSyncedAt())), []);
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
  const [passcodePaused, setPasscodePaused] = useState(() => loadPasscodePaused());
  const [autoLockMinutes, setAutoLockMinutes] = useState(() => loadAutoLockMinutes());
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(() => loadShowWelcomeScreen());

  // Unified passcode-challenge modal (export JSON, export CSV, encrypted import)
  const [challenge, setChallenge] = useState<{ mode: 'export' | 'csv' | 'import'; pendingJson?: string; fails: number; delayUntil: number; input: string; error: string } | null>(null);
  const [challengeCountdown, setChallengeCountdown] = useState(0);
  const [csvRangePicker, setCsvRangePicker] = useState(false);
  const [csvRange, setCsvRange] = useState<CsvExportRange>('this_month');

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
      setCsvRange('this_month');
      setCsvRangePicker(true);
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
            {biometricSupported && !passcodePaused ? (
              <SettingsRow
                icon={<IconLock />}
                iconBg="var(--green)"
                label={biometricOn ? 'Disable Face ID / Touch ID' : 'Enable Face ID / Touch ID'}
                sublabel={biometricOn ? 'Biometric unlock is on' : 'Use biometrics instead of typing your passcode'}
                onClick={async () => {
                  if (biometricOn) {
                    disableBiometric();
                    setBiometricOn(false);
                  } else {
                    const pass = await loadSyncPassphrase();
                    if (pass) {
                      const ok = await enrollBiometric(pass, loadUserDisplayName() || undefined);
                      setBiometricOn(ok);
                    } else {
                      showAlert('Enter your passcode first to enable biometrics.');
                    }
                  }
                }}
              />
            ) : null}
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

      {/* Cloud Sync */}
      <p className="settings-group-label">Cloud Sync</p>
      <div className="settings-list">
        <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--ui-border, var(--border-subtle))' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--ui-primary-text, var(--text))' }}>
            {user?.email ? `Signed in as ${user.email}` : 'Signed in'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ui-secondary-text, #999)', marginTop: 2 }}>
            {lastSynced
              ? `Last synced ${new Date(lastSynced).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${new Date(lastSynced).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
              : 'Not synced yet'}
          </div>
        </div>
        <SettingsRow
          icon={<IconRefresh />}
          iconBg="var(--green)"
          label={syncingNow ? 'Syncing...' : 'Sync Now'}
          sublabel="Push your latest data to the cloud"
          onClick={async () => {
            if (syncingNow) return;
            setSyncingNow(true);
            const passcode = await loadSyncPassphrase();
            if (passcode) {
              await forceSyncToSupabase(passcode);
            } else {
              showAlert('No sync passphrase found. Enter your passcode to enable cloud sync.');
            }
            setSyncingNow(false);
          }}
        />
        <SettingsRow
          icon={<IconDatabase />}
          iconBg="var(--accent)"
          label="Cloud Backups"
          sublabel="Browse and restore from previous backups"
          onClick={async () => {
            setCloudBackupsOpen(true);
            setSnapshotsLoading(true);
            const list = await listSnapshots();
            setSnapshots(list);
            setSnapshotsLoading(false);
          }}
        />
        <SettingsRow
          icon={<IconDatabase />}
          iconBg="var(--green)"
          label="Export Purchases Spreadsheet"
          sublabel="Export purchases as a multi-sheet spreadsheet"
          onClick={() => {
            if (hasPasscode) {
              openChallenge('csv');
            } else {
              setCsvRange('this_month');
              setCsvRangePicker(true);
            }
          }}
        />
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

      {/* Preferences */}
      <p className="settings-group-label">Preferences</p>
      <div className="settings-list">
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

      {/* Account */}
      <p className="settings-group-label">Account</p>
      <div className="settings-list">
        <button
          type="button"
          className="settings-row"
          onClick={async () => {
            const ok = await showConfirm('Sign out? Your data is saved in the cloud and will sync back when you sign in again.');
            if (!ok) return;
            stopSync();
            signOut();
          }}
        >
          <span className="settings-row-icon" style={{ background: 'var(--accent, #4a9eff)' }}>
            <IconArrowExchange />
          </span>
          <span className="settings-row-label">Sign Out</span>
        </button>
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
                <button type="button" className="btn btn-primary" onClick={async () => { try { await exportDeviceKeyToStorage(); } catch (_) { /* key export failed — still allow pause */ } disableBiometric(); setBiometricOn(false); savePasscodePaused(true); setPasscodePaused(true); setPausePasscodeStep(0); }}>Pause passcode</button>
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

      {cloudBackupsOpen && (
        <Modal open={true} title="Cloud Backups" onClose={() => setCloudBackupsOpen(false)}>
          {snapshotsLoading ? (
            <p style={{ textAlign: 'center', color: 'var(--ui-secondary-text, #999)', padding: 20 }}>Loading backups...</p>
          ) : snapshots.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <p style={{ color: 'var(--ui-secondary-text, #999)', marginBottom: 16 }}>No saved backups yet. Backups are created automatically once per day when you use the app.</p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  const passcode = await loadSyncPassphrase();
                  if (!passcode) {
                    showAlert('No sync passphrase found. Enter your passcode to enable cloud sync.');
                    return;
                  }
                  const success = await pullFromSupabase(passcode);
                  if (success) {
                    showAlert('Data restored from cloud. The app will now reload.');
                    window.location.reload();
                  } else {
                    showAlert('No cloud data found.');
                  }
                }}
              >
                Restore Latest from Cloud
              </button>
            </div>
          ) : (
            <div>
              <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: 'var(--ui-secondary-text, #999)' }}>
                Tap a backup to restore it. This will replace your current data.
              </p>
              <div className="settings-list">
                {snapshots.map((s) => {
                  const d = new Date(s.created_at);
                  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                  const isRestoring = restoringId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className="settings-row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        cursor: isRestoring ? 'default' : 'pointer',
                        opacity: isRestoring ? 0.6 : 1,
                        textAlign: 'left',
                      }}
                      disabled={isRestoring}
                      onClick={async () => {
                        const ok = await showConfirm(`Restore backup from ${dateStr} at ${timeStr}? This will replace all your current data.`);
                        if (!ok) return;
                        setRestoringId(s.id);
                        const passcode = await loadSyncPassphrase();
                        if (!passcode) {
                          showAlert('Unable to restore — enter your passcode first to enable cloud sync.');
                          setRestoringId(null);
                          return;
                        }
                        const success = await restoreSnapshot(s.id, passcode);
                        setRestoringId(null);
                        if (success) {
                          showAlert('Backup restored. The app will now reload.');
                          window.location.reload();
                        } else {
                          showAlert('Failed to restore this backup. It may have been created with a different passcode.');
                        }
                      }}
                    >
                      <div>
                        <div className="settings-row-label">{dateStr}</div>
                        <div className="settings-row-sublabel">{timeStr}</div>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--accent, #4a9eff)' }}>
                        {isRestoring ? 'Restoring...' : 'Restore'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Modal>
      )}

      {csvRangePicker && (
        <Modal open={true} title="Export Purchases" onClose={() => setCsvRangePicker(false)}>
          <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.4 }}>
            Choose a time range. Each month will be its own sheet in the spreadsheet.
          </p>
          <Select
            value={csvRange}
            onChange={(e) => setCsvRange(e.target.value as CsvExportRange)}
          >
            <option value="this_month">This Month</option>
            <option value="last_3">Last 3 Months</option>
            <option value="last_6">Last 6 Months</option>
            <option value="last_12">Last 12 Months</option>
            <option value="all_time">All Time</option>
            <optgroup label="Specific Month">
              {getAvailablePurchaseMonths().map((m) => {
                const [yr, mo] = m.split('-').map(Number);
                const label = new Date(yr, mo - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
                return <option key={m} value={m}>{label}</option>;
              })}
            </optgroup>
          </Select>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCsvRangePicker(false)}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={() => {
                setCsvRangePicker(false);
                exportPurchasesSpreadsheet(csvRange);
              }}
            >
              Export
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
        <Modal open={true} fullscreen title="About me" onClose={() => setAboutCreatorOpen(false)}>
          <div style={{ fontSize: '0.92rem', lineHeight: 1.7, color: 'var(--ui-primary-text, var(--text))', fontFamily: 'var(--app-font-family)' }}>
            <p style={{ margin: '0 0 14px 0' }}>Hey there! My name is Isaiah. At the time of writing this I'm a senior at Columbia University. Like most college students I've had to figure out budgeting along the way, but honestly I've always just been into personal finance stuff: credit cards, points, tracking my money, all of that.</p>
            <p style={{ margin: '0 0 14px 0' }}>I always wanted one app that could handle everything. Tracking every dollar whether it's in your bank, sitting in Venmo, or somewhere in between. Something that covers sign-up bonuses, loans, spending, all of it in one place. I just could never find something that actually did that well.</p>
            <p style={{ margin: '0 0 14px 0' }}>There are some apps I like that do a lot and sync your bank automatically. But money is personal and complicated, and the way you actually move money around your own system is something these apps don't always get right. Bank sync issues are also just kind of a constant headache. And honestly what really pushed me to build this was seeing apps charge a monthly subscription just to help you budget. I get that it costs money to run an app but it still felt off to me.</p>
            <p style={{ margin: '0 0 14px 0' }}>That's basically why I built this. It's a pretty detailed manual personal finance tracker that lets you see where every dollar is at any given time. It covers things like bank and credit card balance tracking, pending inbound and outbound transfers, recurring income and expenses, a spending log with categories, credit card sign-up bonus tracking, federal and private loan management, investing and retirement projections (including Coast FIRE), and upcoming cash flow forecasting.</p>
            <p style={{ margin: '0 0 14px 0' }}>I built it with Claude over about a month, going back and forth on ideas, cleaning up the UI, and making sure everything felt secure and usable. It was honestly pretty cool to see it all come together.</p>
            <p style={{ margin: '0 0 14px 0' }}>As mentioned in the app guide, please don't enter sensitive info like SSNs or card numbers. I don't have access to your data and there's no financial gain on my end. Hope you find it useful!</p>
            <p style={{ margin: 0 }}>Questions or concerns? Feel free to email me at{' '}
              <span style={{ color: 'var(--ui-add-btn, var(--accent))', fontWeight: 600 }}>iaa2137@columbia.edu</span>
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
