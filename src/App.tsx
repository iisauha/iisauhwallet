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
import { DialogProvider } from './ui/DialogProvider';
import { TAB_ORDER_KEY } from './state/keys';
import { loadHiddenTabs, loadUserDisplayName, loadUserProfileImage } from './state/storage';
import {
  IconSnapshot, IconArrowExchange, IconCalendar, IconRefreshCircle,
  IconBankBuilding, IconBarChartTrend, IconStar,
  IconExport,
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
  snapshot: <IconSnapshot />,
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


function GlobalHeader({ onAvatarClick }: { onAvatarClick: () => void }) {
  const [displayName, setDisplayName] = useState<string | null>(() => loadUserDisplayName());
  const [profileImage, setProfileImage] = useState<string | null>(() => loadUserProfileImage());

  useEffect(() => {
    // Re-read after crypto may have initialized
    const timer = setTimeout(() => {
      setDisplayName(loadUserDisplayName());
      setProfileImage(loadUserProfileImage());
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <header className="app-header">
      <button
        type="button"
        className="app-header-left"
        onClick={onAvatarClick}
        aria-label="Open settings"
        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', display: 'flex', alignItems: 'center', gap: 10 }}
      >
        {profileImage ? (
          <img src={profileImage} className="app-header-avatar" alt="" />
        ) : (
          <div className="app-header-avatar-placeholder">
            {displayName ? displayName.charAt(0).toUpperCase() : ''}
          </div>
        )}
        <span className="app-header-name" style={{ fontWeight: 600, color: 'var(--ui-title-text, var(--text))' }}>
          {displayName || 'iisauh Wallet'}
        </span>
      </button>
    </header>
  );
}

interface QuickSheetProps {
  onClose: () => void;
  onAction: (action: QuickAction) => void;
}

export type QuickAction =
  | 'log-purchase'
  | 'add-reimbursable'
  | 'add-pending-out'
  | 'add-pending-in'
  | 'add-recurring-expense'
  | 'add-recurring-income'
  | 'update-balance'
  | 'add-bonus'
  | 'export'
  | 'transfer-investing'
  | 'adjust-hysa-alloc';

const QUICK_ACTION_FREQ_KEY = 'iisauhwallet_quick_action_freq_v1';

function loadActionFreq(): Record<string, number> {
  try {
    const raw = localStorage.getItem(QUICK_ACTION_FREQ_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
    return {};
  } catch {
    return {};
  }
}

function incrementActionFreq(action: QuickAction): void {
  try {
    const freq = loadActionFreq();
    freq[action] = (freq[action] ?? 0) + 1;
    localStorage.setItem(QUICK_ACTION_FREQ_KEY, JSON.stringify(freq));
  } catch (_) {}
}

function QuickActionSheet({ onClose, onAction }: QuickSheetProps) {
  const allItems: { icon: React.ReactNode; label: string; action: QuickAction }[] = [
    { icon: <IconArrowExchange />, label: 'Add a purchase', action: 'log-purchase' },
    { icon: <IconArrowExchange />, label: 'Add a Purchase (Full Reimbursement Expected)', action: 'add-reimbursable' },
    { icon: <IconSnapshot />, label: 'Add pending outbound', action: 'add-pending-out' },
    { icon: <IconSnapshot />, label: 'Add pending inbound', action: 'add-pending-in' },
    { icon: <IconRefreshCircle />, label: 'Add recurring expense', action: 'add-recurring-expense' },
    { icon: <IconRefreshCircle />, label: 'Add recurring income', action: 'add-recurring-income' },
    { icon: <IconSnapshot />, label: 'Update a balance', action: 'update-balance' },
    { icon: <IconBarChartTrend />, label: 'Transfer to Investing', action: 'transfer-investing' },
    { icon: <IconBarChartTrend />, label: 'Adjust HYSA Allocation', action: 'adjust-hysa-alloc' },
    { icon: <IconStar />, label: 'Add a bonus card', action: 'add-bonus' },
    { icon: <IconExport />, label: 'Export backup', action: 'export' },
  ];

  const [showAll, setShowAll] = useState(false);

  const freq = loadActionFreq();
  const hasFreqData = Object.keys(freq).length > 0;

  // Sort by frequency descending if we have data, otherwise keep default order
  const sortedItems = hasFreqData
    ? [...allItems].sort((a, b) => (freq[b.action] ?? 0) - (freq[a.action] ?? 0))
    : allItems;

  const VISIBLE_COUNT = 5;
  const items = (showAll || !hasFreqData || allItems.length <= VISIBLE_COUNT)
    ? sortedItems
    : sortedItems.slice(0, VISIBLE_COUNT);
  const hasMore = hasFreqData && !showAll && allItems.length > VISIBLE_COUNT;

  return (
    <>
      <div className="quick-sheet-overlay" onClick={onClose} />
      <div className="quick-sheet" role="dialog" aria-label="Quick actions">
        <div className="quick-sheet-handle" />
        <p className="quick-sheet-title">What do you want to do?</p>
        {items.map((item) => (
          <button
            key={item.action}
            type="button"
            className="quick-sheet-item"
            onClick={() => {
              incrementActionFreq(item.action);
              onAction(item.action);
              onClose();
            }}
          >
            <span className="quick-sheet-icon">{item.icon}</span>
            <span>{item.label}</span>
            <span className="quick-sheet-chevron"><IconChevronRight /></span>
          </button>
        ))}
        {hasMore && (
          <button
            type="button"
            className="quick-sheet-item"
            onClick={() => setShowAll(true)}
          >
            <span className="quick-sheet-icon"><IconChevronRight /></span>
            <span>See all actions</span>
            <span className="quick-sheet-chevron"><IconChevronRight /></span>
          </button>
        )}
      </div>
    </>
  );
}

function MainApp() {
  const [tab, setTab] = useState<TabKey>('snapshot');
  const [prevTab, setPrevTab] = useState<TabKey>('snapshot');
  const [spendingVisited, setSpendingVisited] = useState(false);
  const [tabOrder, setTabOrder] = useState<TabKey[]>(() => loadTabOrder());
  const [sheetOpen, setSheetOpen] = useState(false);
  // Trigger counters — increment to open add modal in respective tab
  const [spendingAddTrigger, setSpendingAddTrigger] = useState(0);
  const [spendingReimburseAddTrigger, setSpendingReimburseAddTrigger] = useState(0);
  const [snapshotPendingInTrigger, setSnapshotPendingInTrigger] = useState(0);
  const [snapshotPendingOutTrigger, setSnapshotPendingOutTrigger] = useState(0);
  const [recurringAddExpenseTrigger, setRecurringAddExpenseTrigger] = useState(0);
  const [recurringAddIncomeTrigger, setRecurringAddIncomeTrigger] = useState(0);
  const [subtrackerAddTrigger, setSubtrackerAddTrigger] = useState(0);
  const [exportTrigger, setExportTrigger] = useState(0);
  const [investingTransferTrigger, setInvestingTransferTrigger] = useState(0);
  const [investingHysaAllocTrigger, setInvestingHysaAllocTrigger] = useState(0);
  const [investingHysaAllocAccountId, setInvestingHysaAllocAccountId] = useState<string | null>(null);

  // Random animation start offsets so blobs begin at a different point each refresh
  const blobDelays = useMemo(() => {
    const durations = [150, 150, 150, 150, 150, 150, 150];
    return durations.map((d) => `-${(Math.random() * d).toFixed(2)}s`);
  }, []);

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

  const handleQuickAction = useCallback((action: QuickAction) => {
    // First close the sheet (140ms), then navigate. For cross-tab triggers, fire
    // the modal trigger in a nested setTimeout so the target tab mounts first.
    setTimeout(() => {
      const afterMount = (fn: () => void) => setTimeout(fn, 30);
      switch (action) {
        case 'log-purchase':
          setTab('spending');
          afterMount(() => setSpendingAddTrigger((n) => n + 1));
          break;
        case 'add-reimbursable':
          setTab('spending');
          afterMount(() => setSpendingReimburseAddTrigger((n) => n + 1));
          break;
        case 'add-pending-in':
          setTab('snapshot');
          afterMount(() => setSnapshotPendingInTrigger((n) => n + 1));
          break;
        case 'add-pending-out':
          setTab('snapshot');
          afterMount(() => setSnapshotPendingOutTrigger((n) => n + 1));
          break;
        case 'add-recurring-expense':
          setTab('recurring');
          afterMount(() => setRecurringAddExpenseTrigger((n) => n + 1));
          break;
        case 'add-recurring-income':
          setTab('recurring');
          afterMount(() => setRecurringAddIncomeTrigger((n) => n + 1));
          break;
        case 'update-balance':
          setTab('snapshot');
          break;
        case 'add-bonus':
          setTab('subtracker');
          afterMount(() => setSubtrackerAddTrigger((n) => n + 1));
          break;
        case 'export':
          setTab('settings');
          afterMount(() => setExportTrigger((n) => n + 1));
          break;
        case 'transfer-investing':
          setTab('investing');
          afterMount(() => setInvestingTransferTrigger((n) => n + 1));
          break;
        case 'adjust-hysa-alloc':
          setTab('investing');
          afterMount(() => setInvestingHysaAllocTrigger((n) => n + 1));
          break;
      }
    }, 140);
  }, []);

  const otherTabContent = useMemo(() => {
    if (tab === 'spending') return null;
    if (tab === 'snapshot') return (
      <SnapshotPage
        onSwitchTab={(t) => setTab(t as TabKey)}
        onLogTransaction={() => { setTab('spending'); setSpendingAddTrigger((n) => n + 1); }}
        onReimbursable={() => { setTab('spending'); setSpendingReimburseAddTrigger((n) => n + 1); }}
        onAddRecurring={() => { setTab('recurring'); setRecurringAddExpenseTrigger((n) => n + 1); }}
        onAddBonus={() => { setTab('subtracker'); setSubtrackerAddTrigger((n) => n + 1); }}
        onAdjustHysaAllocForAccount={(hysaId) => {
          setInvestingHysaAllocAccountId(hysaId);
          setTab('investing');
          setTimeout(() => setInvestingHysaAllocTrigger((n) => n + 1), 30);
        }}
        pendingInTrigger={snapshotPendingInTrigger}
        pendingOutTrigger={snapshotPendingOutTrigger}
      />
    );
    if (tab === 'upcoming') return <UpcomingPage />;
    if (tab === 'loans') return <LoansPage />;
    if (tab === 'investing') return <InvestingPage openTransferTrigger={investingTransferTrigger} openHysaAllocTrigger={investingHysaAllocTrigger} openHysaAllocAccountId={investingHysaAllocAccountId} />;
    if (tab === 'recurring') return <RecurringPage addExpenseTrigger={recurringAddExpenseTrigger} addIncomeTrigger={recurringAddIncomeTrigger} />;
    if (tab === 'subtracker') return <SubTrackerPage addTrigger={subtrackerAddTrigger} />;
    return <SettingsPage exportTrigger={exportTrigger} onTabOrderChange={(order) => { setTabOrder(order as TabKey[]); saveTabOrder(order as TabKey[]); }} />;
  }, [tab, snapshotPendingInTrigger, snapshotPendingOutTrigger, recurringAddExpenseTrigger, recurringAddIncomeTrigger, subtrackerAddTrigger, exportTrigger, investingTransferTrigger, investingHysaAllocTrigger, investingHysaAllocAccountId]);

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
      {/* Lava-lamp: 1 large base blob + 3 satellites, randomized start per refresh */}
      {blobDelays.map((delay, i) => (
        <div
          key={i}
          className={`bg-blob bg-blob-${i + 1}`}
          aria-hidden="true"
          style={{ animationDelay: delay }}
        />
      ))}

      <GlobalHeader onAvatarClick={() => {
        if (tab === 'settings') {
          setTab(prevTab);
        } else {
          setPrevTab(tab);
          setTab('settings');
        }
      }} />

      {(spendingVisited || tab === 'spending') && (
        <div
          style={{ display: tab === 'spending' ? 'block' : 'none', position: 'relative', zIndex: 1, minHeight: '100%' }}
          aria-hidden={tab !== 'spending'}
        >
          <SpendingPage tabVisible={tab === 'spending'} addTrigger={spendingAddTrigger} reimburseAddTrigger={spendingReimburseAddTrigger} />
        </div>
      )}
      {tab !== 'spending' && (
        <div key={tab} style={{ position: 'relative', zIndex: 1, minHeight: '100%' }}>
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
          onAction={handleQuickAction}
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
            <DialogProvider>
            <DropdownStateProvider>
              <PasscodeGate>
                <Routes>
                  <Route path="/" element={<MainApp />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                </Routes>
              </PasscodeGate>
            </DropdownStateProvider>
            </DialogProvider>
          </ReminderProvider>
        </AdvancedUIColorsProvider>
      </AppearanceProvider>
    </ThemeProvider>
  );
}
