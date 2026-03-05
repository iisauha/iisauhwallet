import { useMemo, useState } from 'react';

type TabKey = 'snapshot' | 'spending' | 'recurring' | 'upcoming' | 'settings';

export function App() {
  const [tab, setTab] = useState<TabKey>('snapshot');

  const content = useMemo(() => {
    if (tab === 'snapshot') return <div className="tab-panel active">Snapshot (milestone B)</div>;
    if (tab === 'spending') return <div className="tab-panel active">Spending (coming next)</div>;
    if (tab === 'recurring') return <div className="tab-panel active">Recurring (coming next)</div>;
    if (tab === 'upcoming') return <div className="tab-panel active">Upcoming (coming next)</div>;
    return <div className="tab-panel active">Settings (coming next)</div>;
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

