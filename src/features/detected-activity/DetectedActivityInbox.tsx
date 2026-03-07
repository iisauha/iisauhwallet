import { formatCents } from '../../state/calc';
import { useDetectedActivity } from '../../state/DetectedActivityContext';
import { getActiveDetectedCount } from '../../state/detectedActivity';
import type { DetectedActivityItem } from '../../state/detectedActivity';
import type { LaunchFlowType } from '../../state/DetectedActivityContext';

type TabKey = 'snapshot' | 'spending' | 'recurring' | 'upcoming' | 'subtracker' | 'investing' | 'settings';

type Props = {
  onClose: () => void;
  onLaunchFlow: (flow: LaunchFlowType, tab: TabKey) => void;
};

export function DetectedActivityInbox({ onClose, onLaunchFlow }: Props) {
  const { items, setLaunchFlow, markIgnored } = useDetectedActivity();
  const activeItems = items.filter((i) => i.status === 'new' || i.status === 'in_progress');

  function handleAction(item: DetectedActivityItem, flow: LaunchFlowType) {
    const tab: TabKey =
      flow === 'add_purchase' ? 'spending' : flow === 'transfer' ? 'investing' : 'snapshot';
    setLaunchFlow({ flow, detectedId: item.id, item });
    onLaunchFlow(flow, tab);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={() => onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Detected Activity</h3>
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ padding: '6px 12px' }}>
            Close
          </button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 0, marginBottom: 16 }}>
          Mock inbox — what do you want to do with each item?
        </p>
        {activeItems.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No items to review.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activeItems.map((item) => (
              <DetectedCard
                key={item.id}
                item={item}
                onAction={handleAction}
                onIgnore={() => markIgnored(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DetectedCard({
  item,
  onAction,
  onIgnore
}: {
  item: DetectedActivityItem;
  onAction: (item: DetectedActivityItem, flow: LaunchFlowType) => void;
  onIgnore: () => void;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 12,
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--surface)'
      }}
    >
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="name" style={{ fontWeight: 600 }}>{item.title}</span>
        <span className="amount" style={{ color: item.amountCents >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {formatCents(item.amountCents)}
        </span>
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 8 }}>
        {item.accountName} · {item.accountType.replace('_', ' ')} · {item.dateISO}
        {item.pending ? ' · Pending' : ' · Posted'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ fontSize: '0.8rem', padding: '6px 10px' }}
          onClick={() => onAction(item, 'add_purchase')}
        >
          Add purchase
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ fontSize: '0.8rem', padding: '6px 10px' }}
          onClick={() => onAction(item, 'pending_in')}
        >
          Pending inbound
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ fontSize: '0.8rem', padding: '6px 10px' }}
          onClick={() => onAction(item, 'pending_out')}
        >
          Pending outbound
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ fontSize: '0.8rem', padding: '6px 10px' }}
          onClick={() => onAction(item, 'transfer')}
        >
          Transfer
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ fontSize: '0.8rem', padding: '6px 10px' }}
          onClick={onIgnore}
        >
          Ignore
        </button>
      </div>
    </div>
  );
}

export function DetectedActivityBadge() {
  const { items } = useDetectedActivity();
  const count = getActiveDetectedCount(items);
  if (count <= 0) return null;
  return (
    <span style={{ marginLeft: 6, background: 'var(--accent)', color: 'var(--bg)', borderRadius: 999, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600 }}>
      {count}
    </span>
  );
}
