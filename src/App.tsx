import { useMemo, useState, useCallback } from 'react';
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
import { DetectedActivityProvider } from './state/DetectedActivityContext';
import { ThemeProvider } from './theme/ThemeContext';
import { AppearanceProvider } from './theme/AppearanceContext';
import { AdvancedUIColorsProvider } from './theme/AdvancedUIColorsContext';
import { ReminderProvider } from './state/ReminderContext';
import { TAB_ORDER_KEY } from './state/keys';

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
  'upcoming',
  'loans',
  'investing',
  'recurring',
  'subtracker',
  'settings',
];

const TAB_LABELS: Record<TabKey, string> = {
  snapshot: 'Snapshot',
  spending: 'Spending',
  upcoming: 'Upcoming',
  loans: 'Loans',
  investing: 'Investing',
  recurring: 'Recurring',
  subtracker: 'Sign Up Bonus Tracker',
  settings: 'Settings',
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
  } catch (_) {
    // ignore
  }
}

function MainApp() {
  const [tab, setTab] = useState<TabKey>('snapshot');
  const [tabOrder, setTabOrder] = useState<TabKey[]>(() => loadTabOrder());

  const content = useMemo(() => {
    if (tab === 'snapshot') return <SnapshotPage />;
    if (tab === 'spending') return <SpendingPage />;
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
      const next = [...tabOrder];
      const [removed] = next.splice(dragIndex, 1);
      next.splice(dropIndex, 0, removed);
      setTabOrder(next);
      saveTabOrder(next);
    },
    [tabOrder]
  );

  return (
    <>
      <div key={tab} style={{ position: 'relative', minHeight: '100%' }}>{content}</div>
      <nav className="tabs" aria-label="Sections">
        {tabOrder.map((tabKey, index) => (
          <button
            key={tabKey}
            type="button"
            className={tab === tabKey ? 'tab active' : 'tab'}
            onClick={() => setTab(tabKey)}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            style={{
              userSelect: 'none',
              marginLeft: tabKey === 'snapshot' ? 6 : 0,
            }}
          >
            {TAB_LABELS[tabKey]}
          </button>
        ))}
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
              <DetectedActivityProvider>
                <PasscodeGate>
                  <Routes>
                    <Route path="/" element={<MainApp />} />
                    <Route path="/privacy" element={<PrivacyPage />} />
                  </Routes>
                </PasscodeGate>
              </DetectedActivityProvider>
            </DropdownStateProvider>
          </ReminderProvider>
        </AdvancedUIColorsProvider>
      </AppearanceProvider>
    </ThemeProvider>
  );
}
