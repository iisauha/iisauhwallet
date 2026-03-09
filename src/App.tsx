import { useMemo, useState } from 'react';
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
import { DropdownStateProvider } from './state/DropdownStateContext';
import { DetectedActivityProvider } from './state/DetectedActivityContext';
import { ThemeProvider } from './theme/ThemeContext';
import { AppearanceProvider } from './theme/AppearanceContext';

type TabKey =
  | 'snapshot'
  | 'spending'
  | 'upcoming'
  | 'loans'
  | 'investing'
  | 'recurring'
  | 'subtracker'
  | 'settings';

function MainApp() {
  const [tab, setTab] = useState<TabKey>('snapshot');

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

  return (
    <>
      <div key={tab} style={{ position: 'relative', minHeight: '100%' }}>{content}</div>
      <nav className="tabs" aria-label="Sections">
        <button type="button" className={tab === 'snapshot' ? 'tab active' : 'tab'} onClick={() => setTab('snapshot')}>
          Snapshot
        </button>
        <button type="button" className={tab === 'spending' ? 'tab active' : 'tab'} onClick={() => setTab('spending')}>
          Spending
        </button>
        <button type="button" className={tab === 'upcoming' ? 'tab active' : 'tab'} onClick={() => setTab('upcoming')}>
          Upcoming
        </button>
        <button type="button" className={tab === 'loans' ? 'tab active' : 'tab'} onClick={() => setTab('loans')}>
          Loans
        </button>
        <button type="button" className={tab === 'investing' ? 'tab active' : 'tab'} onClick={() => setTab('investing')}>
          Investing
        </button>
        <button type="button" className={tab === 'recurring' ? 'tab active' : 'tab'} onClick={() => setTab('recurring')}>
          Recurring
        </button>
        <button type="button" className={tab === 'subtracker' ? 'tab active' : 'tab'} onClick={() => setTab('subtracker')}>
          SUB Tracker
        </button>
        <button type="button" className={tab === 'settings' ? 'tab active' : 'tab'} onClick={() => setTab('settings')}>
          Settings
        </button>
      </nav>
    </>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppearanceProvider>
        <DropdownStateProvider>
          <DetectedActivityProvider>
          <Routes>
          <Route path="/" element={<MainApp />} />
          <Route path="/privacy" element={<PrivacyPage />} />
            </Routes>
          </DetectedActivityProvider>
        </DropdownStateProvider>
      </AppearanceProvider>
    </ThemeProvider>
  );
}

