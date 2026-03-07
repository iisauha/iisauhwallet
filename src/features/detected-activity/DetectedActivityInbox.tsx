import { useState } from 'react';
import { formatCents } from '../../state/calc';
import { useDetectedActivity } from '../../state/DetectedActivityContext';
import { getActiveDetectedCount, type DetectedActivityItem, type DetectedSuggestedAction } from '../../state/detectedActivity';
import type { LaunchFlowType } from '../../state/DetectedActivityContext';
import {
  hasApiBase,
  createLinkToken,
  exchangePublicToken,
  getDetectedActivity,
  syncAndGetDetectedActivity,
  type DetectedActivityItemFromApi
} from '../../api/detectedActivityApi';

type TabKey = 'snapshot' | 'spending' | 'recurring' | 'upcoming' | 'subtracker' | 'investing' | 'settings';

type Props = {
  onClose: () => void;
  onLaunchFlow: (flow: LaunchFlowType, tab: TabKey) => void;
};

function toDetectedItem(a: DetectedActivityItemFromApi): DetectedActivityItem {
  return {
    id: a.id,
    title: a.title,
    amountCents: a.amountCents,
    dateISO: a.dateISO,
    accountName: a.accountName,
    accountType: a.accountType,
    pending: a.pending,
    status: (a.status as DetectedActivityItem['status']) || 'new',
    suggestedAction: a.suggestedAction as DetectedSuggestedAction | undefined,
    possibleTransferMatchId: a.possibleTransferMatchId,
    updatedFromPending: a.updatedFromPending,
  };
}

/** Best-effort suggestion for local/mock items when API did not provide one. */
function computeSuggestedActionForItem(item: DetectedActivityItem): DetectedSuggestedAction {
  const title = (item.title || '').toLowerCase();
  const accountType = (item.accountType || '').toLowerCase();
  const isInbound = (item.amountCents || 0) > 0;
  const incoming = ['venmo', 'zelle', 'paypal', 'ach', 'transfer', 'deposit'].some((k) => title.includes(k));
  const outgoing = ['ach', 'transfer', 'payment', 'withdrawal'].some((k) => title.includes(k));
  const isCredit = accountType.includes('credit');
  const isBank = accountType.includes('depository') || accountType.includes('checking') || accountType.includes('savings') || accountType === 'bank';
  if (isCredit) return 'add_purchase';
  if (isInbound && incoming) return 'pending_in';
  if (!isInbound && isBank && outgoing) return 'pending_out';
  return 'review_manually';
}

function getSuggestedActionLabel(action: DetectedSuggestedAction): string {
  switch (action) {
    case 'add_purchase': return 'Add purchase';
    case 'pending_in': return 'Pending inbound';
    case 'pending_out': return 'Pending outbound';
    case 'transfer': return 'Transfer between cash and investing';
    case 'review_manually': return 'Review manually';
    default: return 'Review manually';
  }
}

export function DetectedActivityInbox({ onClose, onLaunchFlow }: Props) {
  const { items, setLaunchFlow, setBackendItems, markIgnored, loadBackendItems } = useDetectedActivity();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'loading' | 'ok'>('idle');
  const activeItems = items.filter((i) => i.status === 'new' || i.status === 'in_progress');
  const apiConfigured = hasApiBase();

  function handleAction(item: DetectedActivityItem, flow: LaunchFlowType) {
    const tab: TabKey =
      flow === 'add_purchase' ? 'spending' : flow === 'transfer' ? 'investing' : 'snapshot';
    setLaunchFlow({ flow, detectedId: item.id, item });
    onLaunchFlow(flow, tab);
    onClose();
  }

  async function handleConnectPlaid() {
    setLinkError(null);
    try {
      const { link_token } = await createLinkToken();
      const Plaid = (window as any).Plaid;
      if (!Plaid) {
        setLinkError('Plaid Link not loaded. Refresh and try again.');
        return;
      }
      Plaid.create({
        token: link_token,
        onSuccess: async (public_token: string) => {
          try {
            await exchangePublicToken(public_token);
            setLinkError(null);
          } catch (e) {
            setLinkError(e instanceof Error ? e.message : 'Exchange failed');
          }
        },
        onExit: () => {},
      }).open();
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : 'Failed to create link token');
    }
  }

  async function handleSync() {
    setSyncStatus('loading');
    setSyncMessage(null);
    try {
      const list = await syncAndGetDetectedActivity();
      setBackendItems(list.map(toDetectedItem));
      setSyncStatus('ok');
      setSyncMessage(`Loaded ${list.length} item(s) from Plaid sandbox.`);
    } catch (e) {
      setSyncStatus('error');
      setSyncMessage(e instanceof Error ? e.message : 'Sync failed');
    }
  }

  async function handleRefresh() {
    setRefreshStatus('loading');
    try {
      const { items: list } = await getDetectedActivity();
      setBackendItems(list.map(toDetectedItem));
      setRefreshStatus('ok');
    } catch (_) {
      setRefreshStatus('idle');
    }
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
        {apiConfigured ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={handleConnectPlaid}>
                Connect Plaid Sandbox
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem' }}
                onClick={handleSync}
                disabled={syncStatus === 'loading'}
              >
                {syncStatus === 'loading' ? 'Syncing…' : 'Sync Detected Activity'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem' }}
                onClick={handleRefresh}
                disabled={refreshStatus === 'loading'}
                title="Reload queue from server (e.g. after webhook updates)"
              >
                {refreshStatus === 'loading' ? 'Refreshing…' : refreshStatus === 'ok' ? 'Refreshed' : 'Refresh'}
              </button>
            </div>
            {linkError ? <p style={{ color: 'var(--red)', fontSize: '0.85rem', margin: '0 0 8px 0' }}>{linkError}</p> : null}
            {syncMessage ? (
              <p style={{ color: syncStatus === 'error' ? 'var(--red)' : 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
                {syncMessage}
              </p>
            ) : null}
          </div>
        ) : null}
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 0, marginBottom: 16 }}>
          {apiConfigured ? 'Review items below. What do you want to do with each?' : 'Mock inbox — what do you want to do with each item?'}
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
  const suggestedAction = item.suggestedAction ?? computeSuggestedActionForItem(item);
  const suggestedLabel = getSuggestedActionLabel(suggestedAction);
  const showTransferMatch = !!item.possibleTransferMatchId;
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
        {item.updatedFromPending && !item.pending && (
          <span style={{ marginLeft: 4, fontStyle: 'italic' }}>· Updated from pending to posted</span>
        )}
      </div>
      <div style={{ fontSize: '0.75rem', marginBottom: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            color: 'var(--accent)',
            fontWeight: 500,
            padding: '2px 8px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          Suggested: {suggestedLabel}
        </span>
        {showTransferMatch && (
          <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Possible transfer pair detected</span>
        )}
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
