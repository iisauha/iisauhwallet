import { useMemo, useState } from 'react';
import { SnapshotPage } from './features/snapshot/SnapshotPage';
import { SpendingPage } from './features/spending/SpendingPage';
import { RecurringPage } from './features/recurring/RecurringPage';
import { UpcomingPage } from './features/upcoming/UpcomingPage';
import { SettingsPage } from './features/settings/SettingsPage';

type TabKey = 'snapshot' | 'spending' | 'recurring' | 'upcoming' | 'settings';

export function App() {
  const [tab, setTab] = useState<TabKey>('snapshot');

  const content = useMemo(() => {
    if (tab === 'snapshot') return <SnapshotPage />;
    if (tab === 'spending') return <SpendingPage />;
    if (tab === 'recurring') return <RecurringPage />;
    if (tab === 'upcoming') return <UpcomingPage />;
    return <SettingsPage />;
  }, [tab]);

  return (
    <>
      {content}
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
        <button type="button" className={tab === 'settings' ? 'tab active' : 'tab'} onClick={() => setTab('settings')}>
          Settings
        </button>
      </nav>
    </>
  );
}

