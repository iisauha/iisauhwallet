import { useMemo, useState, useCallback, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { SnapshotPage } from './features/snapshot/SnapshotPage';
import { SpendingPage } from './features/spending/SpendingPage';
import { UpcomingPage } from './features/upcoming/UpcomingPage';
import { LoansPage } from './features/loans/LoansPage';
import { InvestingPage } from './features/investing/InvestingPage';
import { RecurringPage } from './features/recurring/RecurringPage';
import { SubTrackerPage } from './features/subtracker/SubTrackerPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { PrivacyPage } from './features/privacy/PrivacyPage';
import { PasscodeGate } from './features/passcode/PasscodeGate';
import { DropdownStateProvider } from './state/DropdownStateContext';
import { ThemeProvider } from './theme/ThemeContext';
import { AppearanceProvider } from './theme/AppearanceContext';
import { AdvancedUIColorsProvider } from './theme/AdvancedUIColorsContext';
import { ReminderProvider } from './state/ReminderContext';
import { TAB_ORDER_KEY } from './state/keys';
import { loadHiddenTabs, loadUserDisplayName, loadUserProfileImage } from './state/storage';
import { useLedgerStore } from './state/store';
import {
  IconHome, IconArrowExchange, IconCalendar, IconRefreshCircle,
  IconBankBuilding, IconBarChartTrend, IconStar,
  IconBell, IconFlame, IconPlusCircle,
  IconVault, IconArrowUpRight,
  IconArrowDownRight, IconRefresh, IconGiftBox, IconExport,
  IconChevronRight, IconPlus,
} from './ui/icons';

export type TabKey =
  | 'snapshot'
  | 'spending'
  | 'upcoming'
  | 'loans'
  | 'investing'
  | 'recurring'
  | 'subtracker'
  | 'settings';

const DEFAULT_TAB_ORDER: TabKey[] = [
  'snapshot',
  'spending',
  'upcoming'  ,
  'loans',
  'investing',
  'recurring',
  'subtracker',
  'settings',
];

// Only these 7 appear in the tab bar; settings accessed via header avatar
const NAV_TABS: TabKey[] = [
  'snapshot',
  'spending',
  'upcoming',
  'recurring',
  'loans',
  'investing',
  'subtracker',
];

const TAB_LABELS: Record<TabKey, string> = {
  snapshot: 'Snapshot',
  spending: 'Spending',
  upcoming: 'Upcoming',
  loans: 'Loans',
  investing: 'Investing',
  recurring: 'Recurring',
  subtracker: 'Bonuses',
  settings: 'Profile',
};

const TAB_ICONS: Record<TabKey, React.ReactNode> = {
  snapshot: <IconHome />,
  spending: <IconArrowExchange />,
  upcoming: <IconCalendar />,
  loans: <IconBankBuilding />,
  investing: <IconBarChartTrend />,
  recurring: <IconRefreshCircle />,
  subtracker: <IconStar />,
  settings: null,
};

const VALID_TAB_KEYS = new Set<TabKey>(DEFAULT_TAB_ORDER);

function loadTabOrder(): TabKey[] {
  try {
    const raw = localStorage.getItem(TAB_ORDER_KEY);
    if (!raw) return [...DEFAULT_TAB_ORDER];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_TAB_ORDER];
    const filtered = parsed.filter((k): k is TabKey => typeof k === 'string' && VALID_TAB_KEYS.has(k as TabKey));
    const missing = DEFAULT_TAB_ORDER.filter((k) => !filtered.includes(k));
    return [...filtered, ...missing];
  } catch {
    return [...DEFAULT_TAB_ORDER];
  }
}

function saveTabOrder(order: TabKey[]): void {
  try {
    localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(order));
  } catch (_) {}
}

function computeStreak(data: { purchases?: { dateISO?: string }[] }): number {
  try {
    const purchases = data?.purchases || [];
    if (!purchases.length) return 0;
    const dateSet = new Set(purchases.map((p) => (p.dateISO || '').slice(0, 10)));
    let count = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (dateSet.has(key)) {
        count++;
      } else if (i > 0) {
        break;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

interface GlobalHeaderProps {
  onAvatarClick: () => void;
  streak: number;
}

function GlobalHeader({ onAvatarClick, streak }: GlobalHeaderProps) {
  const displayName = loadUserDisplayName();
  const profileImage = loadUserProfileImage();

  return (
    <header className="app-header">
      <button
        type="button"
        className="app-header-left"
        onClick={onAvatarClick}
        aria-label="Open settings"
        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit' }}
      >
        {profileImage ? (
          <img src={profileImage} className="app-header-avatar" alt="" />
        ) : (
          <div className="app-header-avatar-placeholder">
            {displayName ? displayName.charAt(0).toUpperCase() : '?'}
          </div>
        )}
        <div className="app-header-text">
          <span className="app-header-greeting">Welcome back</span>
          <span className="app-header-name">{displayName || 'there'}</span>
        </div>
      </button>

      <div className="app-header-right">
        <button type="button" className="app-header-bell" aria-label="Notifications">
          <IconBell />
        </button>
        {streak > 0 && (
          <div className="streak-chip">
            <IconFlame />
            <span>{streak}</span>
          </div>
        )}
      </div>
    </header>
  );
}

interface QuickSheetProps {
  onClose: () => void;
  onNavigate: (tab: TabKey) => void;
}

function QuickActionSheet({ onClose, onNavigate }: QuickSheetProps) {
  const items = [
    { icon: <IconPlusCircle />, label: 'Log a purchase', tab: 'spending' as TabKey },
    { icon: <IconArrowDownRight />, label: 'Add pending outbound', tab: 'snapshot' as TabKey },
    { icon: <IconArrowUpRight />, label: 'Add pending inbound', tab: 'snapshot' as TabKey },
    { icon: <IconRefresh />, label: 'Add recurring item', tab: 'recurring' as TabKey },
    { icon: <IconVault />, label: 'Update a balance', tab: 'snapshot' as TabKey },
    { icon: <IconGiftBox />, label: 'Add a bonus card', tab: 'subtracker' as TabKey },
    { icon: <IconExport />, label: 'Export backup', tab: 'settings' as TabKey },
  ];

  return (
    <>
      <div className="quick-sheet-overlay" onClick={onClose} />
      <div className="quick-sheet" role="dialog" aria-label="Quick actions">
        <div className="quick-sheet-handle" />
        <p className="quick-sheet-title">What do you want to do?</p>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className="quick-sheet-item"
            onClick={() => {
              onNavigate(item.tab);
              onClose();
            }}
          >
            <span className="quick-sheet-icon">{item.icon}</span>
            <span>{item.label}</span>
            <span className="quick-sheet-chevron"><IconChevronRight /></span>
          </button>
        ))}
      </div>
    </>
  );
}

function MainApp() {
  const [tab, setTab] = useState<TabKey>('snapshot');
  const [spendingVisited, setSpendingVisited] = useState(false);
  const [tabOrder, setTabOrder] = useState<TabKey[]>(() => loadTabOrder());
  const [sheetOpen, setSheetOpen] = useState(false);
  const data = useLedgerStore((s) => s.data);

  useEffect(() => {
    if (tab === 'spending') setSpendingVisited(true);
  }, [tab]);

  const hiddenSet = useMemo(() => new Set(loadHiddenTabs()), [tab]);
  const visibleNavOrder = useMemo(
    () => tabOrder.filter((k) => NAV_TABS.includes(k) && !hiddenSet.has(k)),
    [tabOrder, hiddenSet]
  );

  useEffect(() => {
    const allVisible = [...visibleNavOrder, 'settings' as TabKey];
    if (allVisible.length > 0 && !allVisible.includes(tab)) {
      setTab(visibleNavOrder[0] ?? 'snapshot');
    }
  }, [tab, visibleNavOrder]);

  const streak = useMemo(() => computeStreak(data), [data]);

  const otherTabContent = useMemo(() => {
    if (tab === 'spending') return null;
    if (tab === 'snapshot') return <SnapshotPage onSwitchTab={(t) => setTab(t as TabKey)} />;
    if (tab === 'upcoming') return <UpcomingPage />;
    if (tab === 'loans') return <LoansPage />;
    if (tab === 'investing') return <InvestingPage />;
    if (tab === 'recurring') return <RecurringPage />;
    if (tab === 'subtracker') return <SubTrackerPage />;
    return <SettingsPage />;
  }, [tab]);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      const dragIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!Number.isFinite(dragIndex) || dragIndex === dropIndex) return;
      const draggedKey = visibleNavOrder[dragIndex];
      const dropKey = visibleNavOrder[dropIndex];
      if (!draggedKey || !dropKey || draggedKey === dropKey) return;
      const next = [...tabOrder];
      const fromIdx = next.indexOf(draggedKey);
      const toIdx = next.indexOf(dropKey);
      if (fromIdx === -1 || toIdx === -1) return;
      next.splice(fromIdx, 1);
      const insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
      next.splice(insertIdx, 0, draggedKey);
      setTabOrder(next);
      saveTabOrder(next);
    },
    [tabOrder, visibleNavOrder]
  );

  return (
    <>
      <GlobalHeader onAvatarClick={() => setTab('settings')} streak={streak} />

      {(spendingVisited || tab === 'spending') && (
        <div
          style={{ display: tab === 'spending' ? 'block' : 'none', position: 'relative', minHeight: '100%' }}
          aria-hidden={tab !== 'spending'}
        >
          <SpendingPage tabVisible={tab === 'spending'} />
        </div>
      )}
      {tab !== 'spending' && (
        <div key={tab} style={{ position: 'relative', minHeight: '100%' }}>
          {otherTabContent}
        </div>
      )}

      {/* Floating Action Button */}
      <button
        type="button"
        className={`fab${sheetOpen ? ' fab-open' : ''}`}
        aria-label="Quick actions"
        onClick={() => setSheetOpen((v) => !v)}
      >
        <IconPlus />
      </button>

      {/* Quick-Action Sheet */}
      {sheetOpen && (
        <QuickActionSheet
          onClose={() => setSheetOpen(false)}
          onNavigate={(t) => setTab(t)}
        />
      )}

      {/* Tab Bar */}
      <nav className="tabs" aria-label="Sections">
        {visibleNavOrder.map((tabKey, index) => {
          const isActive = tab === tabKey;
          return (
            <button
              key={tabKey}
              type="button"
              className={isActive ? 'tab active' : 'tab'}
              onClick={() => setTab(tabKey)}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              style={{ userSelect: 'none' }}
              aria-label={TAB_LABELS[tabKey]}
              title={TAB_LABELS[tabKey]}
            >
              {isActive ? (
                <span className="tab-active-pill">
                  {TAB_ICONS[tabKey]}
                  <span className="tab-label">{TAB_LABELS[tabKey]}</span>
                </span>
              ) : (
                <span className="tab-icon-wrap">
                  {TAB_ICONS[tabKey]}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppearanceProvider>
        <AdvancedUIColorsProvider>
          <ReminderProvider>
            <DropdownStateProvider>
              <PasscodeGate>
                <Routes>
                  <Route path="/" element={<MainApp />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                </Routes>
              </PasscodeGate>
            </DropdownStateProvider>
          </ReminderProvider>
        </AdvancedUIColorsProvider>
      </AppearanceProvider>
    </ThemeProvider>
  );
}
