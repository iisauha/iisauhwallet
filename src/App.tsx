import { useMemo, useState } from 'react';
import { SnapshotPage } from './features/snapshot/SnapshotPage';
import { SpendingPage } from './features/spending/SpendingPage';
import { RecurringPage } from './features/recurring/RecurringPage';
import { UpcomingPage } from './features/upcoming/UpcomingPage';
import { SubTrackerPage } from './features/subtracker/SubTrackerPage';
import { InvestingPage } from './features/investing/InvestingPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { DetectedActivityInbox, DetectedActivityButtonLabel } from './features/detected-activity/DetectedActivityInbox';
import { DropdownStateProvider } from './state/DropdownStateContext';
import { DetectedActivityProvider } from './state/DetectedActivityContext';

type TabKey = 'snapshot' | 'spending' | 'recurring' | 'upcoming' | 'subtracker' | 'investing' | 'settings';

export function App() {
  const [tab, setTab] = useState<TabKey>('snapshot');
  const [detectedInboxOpen, setDetectedInboxOpen] = useState(false);

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
    <DropdownStateProvider>
      <DetectedActivityProvider>
        <div style={{ position: 'relative', minHeight: '100%' }}>
          <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.85rem', padding: '6px 12px' }}
              onClick={() => setDetectedInboxOpen(true)}
            >
              <DetectedActivityButtonLabel />
            </button>
          </div>
        {content}
        {detectedInboxOpen ? (
          <DetectedActivityInbox
            onClose={() => setDetectedInboxOpen(false)}
            onLaunchFlow={(_, targetTab) => {
              setTab(targetTab);
              setDetectedInboxOpen(false);
            }}
          />
        ) : null}
        </div>
      </DetectedActivityProvider>
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
    </DropdownStateProvider>
  );
}

