import { useEffect, useRef, useState } from 'react';
import { TAB_ORDER_KEY } from '../../state/keys';
import { useLedgerStore } from '../../state/store';
import {
  exportJSON,
  importJSON,
  loadCategoryConfig,
  saveCategoryConfig,
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
import {
  IconPalette, IconLayout, IconLock, IconTag, IconDatabase, IconUser,
  IconExport, IconChevronRight, IconTrash,
  IconHome, IconArrowExchange, IconCalendar, IconBankBuilding,
  IconBarChartTrend, IconRefreshCircle, IconStar,
} from '../../ui/icons';

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
    ['Title', 'Date', 'Amount', 'Category', 'Subcategory'],
    ...purchases.map((p: { title?: string; dateISO?: string; amountCents?: number; category?: string; subcategory?: string }) => [
      escapeCsvCell(String(p.title ?? '')),
      escapeCsvCell(p.dateISO ?? ''),
      String((p.amountCents ?? 0) / 100),
      escapeCsvCell(getCategoryName(cfg, p.category ?? 'uncategorized')),
      escapeCsvCell(String(p.subcategory ?? '')),
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

const HIDEABLE_TAB_KEYS = ['snapshot', 'spending', 'upcoming', 'loans', 'investing', 'recurring', 'subtracker'] as const;
const HIDEABLE_TAB_LABELS: Record<string, string> = {
  snapshot: 'Snapshot',
  spending: 'Spending',
  upcoming: 'Upcoming',
  loans: 'Loans',
  investing: 'Investing',
  recurring: 'Recurring',
  subtracker: 'Sign-Up Bonus Tracker',
};

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

const GripIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="7" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="17" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="7" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="17" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export function SettingsPage({ onTabOrderChange }: { onTabOrderChange?: (order: string[]) => void } = {}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const profileImageRef = useRef<HTMLInputElement | null>(null);
  const actions = useLedgerStore((s) => s.actions);
  const [manageOpen, setManageOpen] = useState(false);
  const [appCustomizationOpen, setAppCustomizationOpen] = useState(false);
  const [editAccountNamesOpen, setEditAccountNamesOpen] = useState(false);
  const [resetPasscodeOpen, setResetPasscodeOpen] = useState(false);
  const [pausePasscodeStep, setPausePasscodeStep] = useState<0 | 1 | 2>(0);
  const [aboutCreatorOpen, setAboutCreatorOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string>(() => loadUserDisplayName() || '');
  const [profileImage, setProfileImage] = useState<string | null>(() => loadUserProfileImage());
  const [hiddenTabs, setHiddenTabs] = useState<string[]>(() => loadHiddenTabs());
  const [visibleTabsModalOpen, setVisibleTabsModalOpen] = useState(false);
  const [tabOrder, setTabOrder] = useState<string[]>(() => loadTabOrderFromStorage());
  const dragIndexRef = useRef<number | null>(null);

  const hasPasscode = loadPasscodeHash() !== null;
  const passcodePaused = loadPasscodePaused();

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    resizeImageToDataUrl(file).then(
      (dataUrl) => { saveUserProfileImage(dataUrl); setProfileImage(dataUrl); },
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

  const handleExportJSON = async () => {
    const text = exportJSON();
    const fileName = getExportFileName();
    try {
      const nav: any = navigator as any;
      if (nav.share) {
        const file = new File([text], fileName, { type: 'application/json' });
        await nav.share({ files: [file], title: 'Backup' });
        return;
      }
    } catch (_) {}
    try {
      const w = window.open('', '_blank');
      if (w) {
        w.document.open();
        w.document.write('<pre style="white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace;padding:16px;">' + text.replace(/</g, '&lt;') + '</pre>');
        w.document.close();
        return;
      }
    } catch (_) {}
    downloadJsonFile(fileName, text);
  };

  return (
    <div className="tab-panel active" id="settingsContent">
      {/* Profile card */}
      <div
        className="card"
        style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, padding: '16px 16px' }}
      >
        <input ref={profileImageRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProfileImageChange} />
        <button
          type="button"
          onClick={() => profileImageRef.current?.click()}
          style={{
            width: 64, height: 64, borderRadius: '50%', padding: 0, border: '2px solid var(--ui-border, var(--border))',
            background: profileImage ? `url(${profileImage}) center/cover` : 'var(--ui-card-bg, var(--surface))',
            color: 'var(--accent)', fontSize: '1.4rem', fontWeight: 700, flexShrink: 0, cursor: 'pointer',
          }}
          aria-label="Change profile photo"
        >
          {!profileImage && (displayName ? displayName.charAt(0).toUpperCase() : <span style={{ fontSize: '1rem', color: 'var(--muted)' }}>+</span>)}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>
            Your name
          </div>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={() => saveUserDisplayName(displayName || null)}
            placeholder="Enter your name"
            style={{
              width: '100%', padding: 0, fontSize: '1.15rem', fontWeight: 700,
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
          iconBg="#8B5CF6"
          label="App Customization"
          sublabel="Theme, colors & typography"
          onClick={() => setAppCustomizationOpen(true)}
        />
        <SettingsRow
          icon={<IconLayout />}
          iconBg="#3B82F6"
          label="Visible Tabs"
          sublabel="Choose which tabs appear in the bar"
          onClick={() => setVisibleTabsModalOpen(true)}
        />
      </div>
      <AppCustomizationModal open={appCustomizationOpen} onClose={() => setAppCustomizationOpen(false)} />

      {/* Tab Order */}
      <p className="settings-group-label">Tab Order</p>
      <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '-4px 16px 10px', lineHeight: 1.4 }}>
        Drag to reorder your navigation tabs
      </p>
      <div className="settings-list" style={{ gap: 2 }}>
        {tabOrder.map((key, index) => {
          const item = TAB_ORDER_ALL.find((t) => t.key === key);
          if (!item) return null;
          return (
            <div
              key={key}
              draggable
              onDragStart={(e) => {
                dragIndexRef.current = index;
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDrop={(e) => {
                e.preventDefault();
                const fromIdx = dragIndexRef.current;
                if (fromIdx === null || fromIdx === index) return;
                const next = [...tabOrder];
                const [dragged] = next.splice(fromIdx, 1);
                next.splice(index, 0, dragged);
                dragIndexRef.current = null;
                setTabOrder(next);
                localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(next));
                onTabOrderChange?.(next);
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                background: 'var(--ui-card-bg, var(--surface))',
                borderRadius: 12, cursor: 'grab', userSelect: 'none',
              }}
            >
              <span
                className="settings-row-icon"
                style={{ background: '#374151', flexShrink: 0, width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}
              >
                {item.icon}
              </span>
              <span style={{ flex: 1, fontSize: '1rem', color: 'var(--ui-primary-text, var(--text))' }}>
                {item.label}
              </span>
              <span style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>
                <GripIcon />
              </span>
            </div>
          );
        })}
      </div>

      {/* Accounts */}
      <p className="settings-group-label">Accounts</p>
      <div className="settings-list">
        <SettingsRow
          icon={<IconUser />}
          iconBg="#10B981"
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
          iconBg="#F59E0B"
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
                iconBg="#EF4444"
                label="Resume Passcode Protection"
                sublabel="Passcode is currently paused"
                onClick={() => savePasscodePaused(false)}
              />
            ) : (
              <SettingsRow
                icon={<IconLock />}
                iconBg="#F97316"
                label="Pause Passcode Protection"
                onClick={() => setPausePasscodeStep(1)}
              />
            )}
            <SettingsRow
              icon={<IconLock />}
              iconBg="#6366F1"
              label="Reset Passcode"
              onClick={() => setResetPasscodeOpen(true)}
            />
          </div>
        </>
      )}

      {/* Backup */}
      <p className="settings-group-label">Backup</p>
      <div className="settings-list">
        <SettingsRow
          icon={<IconExport />}
          iconBg="#0EA5E9"
          label="Export JSON"
          sublabel="Full backup of all your data"
          onClick={handleExportJSON}
        />
        <SettingsRow
          icon={<IconDatabase />}
          iconBg="#14B8A6"
          label="Export Purchases CSV"
          sublabel="Current month's purchases"
          onClick={() => exportMonthlyPurchasesCsv()}
        />
        <SettingsRow
          icon={<IconDatabase />}
          iconBg="#64748B"
          label="Import JSON"
          sublabel="Restore from a backup file"
          onClick={() => fileRef.current?.click()}
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

      {/* About */}
      <p className="settings-group-label">About</p>
      <div className="settings-list">
        <SettingsRow
          icon={<IconUser />}
          iconBg="#8B5CF6"
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
          onClick={() => {
            if (!confirm('Reset all data? This will clear localStorage for this site.')) return;
            localStorage.clear();
            actions.reload();
          }}
        >
          <span className="settings-row-icon" style={{ background: '#EF4444' }}>
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

      <Modal open={visibleTabsModalOpen} title="Visible tabs" onClose={() => setVisibleTabsModalOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          {HIDEABLE_TAB_KEYS.map((tabKey) => (
            <label key={tabKey} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: '1rem', color: 'var(--ui-primary-text, var(--text))', fontFamily: 'var(--app-font-family)' }}>
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
          <button type="button" className="btn btn-secondary" onClick={() => setVisibleTabsModalOpen(false)}>Done</button>
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
                <button type="button" className="btn btn-primary" onClick={() => { savePasscodePaused(true); setPausePasscodeStep(0); }}>Pause passcode</button>
              </div>
            </Modal>
          ) : null}
        </>
      )}

      {aboutCreatorOpen && (
        <Modal open={true} title="About me" onClose={() => setAboutCreatorOpen(false)}>
          <div style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--ui-primary-text, var(--text))', fontFamily: 'var(--app-font-family)' }}>
            <p style={{ margin: '0 0 12px 0' }}>Hi, my name is Isaiah. I built this app, iisauhwallet, because I am really into credit cards, points, and personal finance tracking.</p>
            <p style={{ margin: '0 0 12px 0' }}>I was trying to find an app that could do everything in one place — automatic bank syncing can be frustrating, and most apps push subscriptions when they should help you budget.</p>
            <p style={{ margin: '0 0 12px 0' }}>Another gap: most apps don't properly track money in transit — between banks, Venmo, etc. The goal is simple: always know exactly where your money is.</p>
            <p style={{ margin: 0 }}>I hope you enjoy it.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
