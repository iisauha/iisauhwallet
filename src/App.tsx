import { useEffect, useMemo, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { SnapshotPage } from './features/snapshot/SnapshotPage';
import { SpendingPage } from './features/spending/SpendingPage';
import { RecurringPage } from './features/recurring/RecurringPage';
import { UpcomingPage } from './features/upcoming/UpcomingPage';
import { SubTrackerPage } from './features/subtracker/SubTrackerPage';
import { InvestingPage } from './features/investing/InvestingPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { PrivacyPage } from './features/privacy/PrivacyPage';
import { DropdownStateProvider } from './state/DropdownStateContext';
import { DetectedActivityProvider } from './state/DetectedActivityContext';

type TabKey = 'snapshot' | 'spending' | 'recurring' | 'upcoming' | 'subtracker' | 'investing' | 'settings';

function MainApp() {
  const [tab, setTab] = useState<TabKey>('snapshot');

  useEffect(() => {
    const isDev = import.meta.env.DEV;
    const mode = isDev ? 'local/dev' : 'public/deployed';
    const host = typeof window !== 'undefined' ? window.location.host : '';
    // Debug-only: report how the app is classifying its mode.
    console.log(`App mode: ${mode}`, { dev: isDev, host });
    // #region agent log
    if (typeof fetch !== 'undefined') {
      fetch('http://127.0.0.1:7458/ingest/27b509c0-59e8-4a4f-9012-8a8e58914640', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': 'e20ffd',
        },
        body: JSON.stringify({
          sessionId: 'e20ffd',
          runId: 'pre-fix',
          hypothesisId: 'H1',
          location: 'src/App.tsx:19-25',
          message: 'App mode classification',
          data: { dev: isDev, host, mode },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    }
    // #endregion
  }, []);

  const content = useMemo(() => {
    if (tab === 'snapshot') return <SnapshotPage />;
    if (tab === 'spending') return <SpendingPage />;
    if (tab === 'recurring') return <RecurringPage />;
    if (tab === 'upcoming') return <UpcomingPage />;
    if (tab === 'subtracker') return <SubTrackerPage />;
    if (tab === 'investing') return <InvestingPage />;
    return <SettingsPage />;
  }, [tab]);

  return (
    <>
      <div style={{ position: 'relative', minHeight: '100%' }}>{content}</div>
      <nav className="tabs" aria-label="Sections">
        <button type="button" className={tab === 'snapshot' ? 'tab active' : 'tab'} onClick={() => setTab('snapshot')}>
          Snapshot
        </button>
        <button type="button" className={tab === 'spending' ? 'tab active' : 'tab'} onClick={() => setTab('spending')}>
          Spending
        </button>
        <button type="button" className={tab === 'recurring' ? 'tab active' : 'tab'} onClick={() => setTab('recurring')}>
          Recurring
        </button>
        <button type="button" className={tab === 'upcoming' ? 'tab active' : 'tab'} onClick={() => setTab('upcoming')}>
          Upcoming
        </button>
        <button type="button" className={tab === 'subtracker' ? 'tab active' : 'tab'} onClick={() => setTab('subtracker')}>
          SUB Tracker
        </button>
        <button type="button" className={tab === 'investing' ? 'tab active' : 'tab'} onClick={() => setTab('investing')}>
          Investing
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
    <DropdownStateProvider>
      <DetectedActivityProvider>
        <Routes>
          <Route path="/" element={<MainApp />} />
          <Route path="/privacy" element={<PrivacyPage />} />
        </Routes>
      </DetectedActivityProvider>
    </DropdownStateProvider>
  );
}

