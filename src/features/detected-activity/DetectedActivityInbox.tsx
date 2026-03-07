import React, { useCallback, useState } from 'react';
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
  getPlaidMode,
  createDetectedActivityRule,
  getDetectedActivityRules,
  updateDetectedActivityRule,
  deleteDetectedActivityRule,
  type DetectedActivityItemFromApi,
  type PlaidMode,
  type DetectedActivityRule,
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
    sourceEnvironment: a.sourceEnvironment,
    sourceMode: a.sourceMode,
    detectedAt: a.detectedAt,
    suggestedFromRule: a.suggestedFromRule,
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
    case 'suggest_ignore': return 'Ignore / likely irrelevant';
    default: return 'Review manually';
  }
}

type InboxFilter = 'new' | 'ignored' | 'resolved' | 'all';
type SourceViewFilter = 'all' | 'sandbox' | 'real_pilot';

type PendingRemember =
  | { type: 'resolve'; item: DetectedActivityItem; flow: LaunchFlowType }
  | { type: 'ignore'; item: DetectedActivityItem }
  | null;

function buildRuleFromItem(item: DetectedActivityItem, actionSuggestion: string) {
  return {
    matchType: 'merchant_contains',
    matchValue: (item.title || '').trim().slice(0, 150),
    accountName: (item.accountName || '').trim() || undefined,
    direction: (item.amountCents ?? 0) >= 0 ? ('inflow' as const) : ('outflow' as const),
    actionSuggestion,
  };
}

function sortByNewestFirst(a: DetectedActivityItem, b: DetectedActivityItem): number {
  const dateA = a.dateISO ? new Date(a.dateISO).getTime() : 0;
  const dateB = b.dateISO ? new Date(b.dateISO).getTime() : 0;
  if (dateB !== dateA) return dateB - dateA;
  return (b.id || '').localeCompare(a.id || '');
}

export function DetectedActivityInbox({ onClose, onLaunchFlow }: Props) {
  const { items, setLaunchFlow, setBackendItems, markIgnored, markReopened } = useDetectedActivity();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'loading' | 'ok'>('idle');
  const [filter, setFilter] = useState<InboxFilter>('new');
  const [sourceView, setSourceView] = useState<SourceViewFilter>('all');
  const [plaidMode, setPlaidMode] = useState<PlaidMode | null>(null);
  const [pendingRemember, setPendingRemember] = useState<PendingRemember>(null);
  const [rememberChecked, setRememberChecked] = useState(false);
  const [rememberSaving, setRememberSaving] = useState(false);
  const apiConfigured = hasApiBase();

  React.useEffect(() => {
    if (!apiConfigured) return;
    getPlaidMode().then(setPlaidMode).catch(() => setPlaidMode('sandbox'));
  }, [apiConfigured]);

  const bySourceView = (list: DetectedActivityItem[]) => {
    if (sourceView === 'all') return list;
    return list.filter((i) => (i.sourceMode || 'sandbox') === sourceView);
  };
  const newItems = items.filter((i) => i.status === 'new' || i.status === 'in_progress');
  const ignoredItems = items.filter((i) => i.status === 'ignored');
  const resolvedItems = items.filter((i) => i.status === 'resolved');
  const filteredItems = (() => {
    const list =
      filter === 'new' ? newItems
      : filter === 'ignored' ? ignoredItems
      : filter === 'resolved' ? resolvedItems
      : items;
    return [...bySourceView(list)].sort(sortByNewestFirst);
  })();
  const sandboxCount = items.filter((i) => (i.sourceMode || 'sandbox') === 'sandbox').length;
  const realPilotCount = items.filter((i) => i.sourceMode === 'real_pilot').length;

  function handleAction(item: DetectedActivityItem, flow: LaunchFlowType) {
    if (apiConfigured) {
      setRememberChecked(false);
      setPendingRemember({ type: 'resolve', item, flow });
      return;
    }
    proceedResolve(item, flow);
  }

  function proceedResolve(item: DetectedActivityItem, flow: LaunchFlowType) {
    const tab: TabKey =
      flow === 'add_purchase' ? 'spending' : flow === 'transfer' ? 'investing' : 'snapshot';
    setLaunchFlow({ flow, detectedId: item.id, item });
    setPendingRemember(null);
    onLaunchFlow(flow, tab);
    onClose();
  }

  async function confirmRememberResolve() {
    if (!pendingRemember || pendingRemember.type !== 'resolve') return;
    const { item, flow } = pendingRemember;
    if (rememberChecked) {
      setRememberSaving(true);
      try {
        await createDetectedActivityRule(buildRuleFromItem(item, flow));
      } catch (_) {}
      setRememberSaving(false);
    }
    proceedResolve(item, flow);
  }

  function handleIgnoreClick(item: DetectedActivityItem) {
    if (apiConfigured) {
      setRememberChecked(false);
      setPendingRemember({ type: 'ignore', item });
      return;
    }
    markIgnored(item.id);
  }

  async function confirmRememberIgnore() {
    if (!pendingRemember || pendingRemember.type !== 'ignore') return;
    const { item } = pendingRemember;
    if (rememberChecked) {
      setRememberSaving(true);
      try {
        await createDetectedActivityRule(buildRuleFromItem(item, 'suggest_ignore'));
      } catch (_) {}
      setRememberSaving(false);
    }
    markIgnored(item.id);
    setPendingRemember(null);
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

  const resolveLabel = pendingRemember?.type === 'resolve'
    ? getSuggestedActionLabel(pendingRemember.flow)
    : '';

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
            {plaidMode != null && (
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 8px 0', fontWeight: 500 }}>
                Plaid Mode: {plaidMode === 'production' ? 'Real Pilot' : 'Sandbox'}
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={handleConnectPlaid}>
                {plaidMode === 'production' ? 'Connect Plaid (1 real account)' : 'Connect Plaid Sandbox'}
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
        {apiConfigured && (sandboxCount > 0 || realPilotCount > 0) ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {(['all', 'sandbox', 'real_pilot'] as const).map((s) => {
              const count = s === 'all' ? items.length : s === 'sandbox' ? sandboxCount : realPilotCount;
              const label = s === 'all' ? 'All' : s === 'sandbox' ? 'Sandbox' : 'Real Pilot';
              return (
                <button
                  key={s}
                  type="button"
                  className={sourceView === s ? 'tab active' : 'tab'}
                  style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                  onClick={() => setSourceView(s)}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>
        ) : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {(['new', 'ignored', 'resolved', 'all'] as const).map((f) => {
            const count = f === 'new' ? newItems.length : f === 'ignored' ? ignoredItems.length : f === 'resolved' ? resolvedItems.length : items.length;
            const label = f === 'new' ? 'New' : f === 'ignored' ? 'Ignored' : f === 'resolved' ? 'Resolved' : 'All';
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                className={active ? 'tab active' : 'tab'}
                style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                onClick={() => setFilter(f)}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 0, marginBottom: 12 }}>
          {apiConfigured ? 'Review items below. What do you want to do with each?' : 'Mock inbox — what do you want to do with each?'}
        </p>
        {apiConfigured ? (
          <div style={{ marginBottom: 12 }}>
            <ManageRulesButton />
          </div>
        ) : null}
        {filteredItems.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem', padding: '24px 0', textAlign: 'center' }}>
            {filter === 'new' && 'No new detected activity.'}
            {filter === 'ignored' && 'No ignored items.'}
            {filter === 'resolved' && 'No resolved items.'}
            {filter === 'all' && 'No detected activity yet.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredItems.map((item) => (
              <DetectedCard
                key={item.id}
                item={item}
                onAction={handleAction}
                onIgnore={() => handleIgnoreClick(item)}
                onReopen={() => markReopened(item.id)}
                showActions={item.status === 'new' || item.status === 'in_progress'}
              />
            ))}
          </div>
        )}
      </div>
      {pendingRemember ? (
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360, position: 'relative', zIndex: 10 }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem' }}>
            {pendingRemember.type === 'resolve' ? `Resolve as ${resolveLabel}?` : 'Ignore this item?'}
          </h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: '0.9rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={rememberChecked}
              onChange={(e) => setRememberChecked(e.target.checked)}
            />
            <span>
              {pendingRemember.type === 'resolve' ? 'Remember this choice next time' : 'Remember: suggest Ignore for similar items'}
            </span>
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setPendingRemember(null); setRememberChecked(false); }}
            >
              Cancel
            </button>
            {pendingRemember.type === 'resolve' ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={rememberSaving}
                onClick={confirmRememberResolve}
              >
                {rememberSaving ? 'Saving…' : 'Continue'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={rememberSaving}
                onClick={confirmRememberIgnore}
              >
                {rememberSaving ? 'Saving…' : 'Ignore'}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Badge({ label, style }: { label: string; style?: React.CSSProperties }) {
  return (
    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: 4, fontWeight: 500, ...style }}>
      {label}
    </span>
  );
}

function rulePatternLabel(r: DetectedActivityRule): string {
  const typeLabels: Record<string, string> = {
    merchant_exact: 'merchant is',
    merchant_contains: 'merchant contains',
    description_contains: 'description contains',
    account_description_contains: 'account + description contains',
    account_merchant: 'account + merchant',
  };
  const t = typeLabels[r.matchType] || r.matchType;
  const v = r.matchValue ? `"${r.matchValue.slice(0, 40)}${r.matchValue.length > 40 ? '…' : ''}"` : '';
  const acc = r.accountName ? ` (account: ${r.accountName.slice(0, 20)}${r.accountName.length > 20 ? '…' : ''})` : '';
  return `${t} ${v}${acc}`;
}

function ManageRulesButton() {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<DetectedActivityRule[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRules = useCallback(async () => {
    if (!hasApiBase()) return;
    setLoading(true);
    try {
      const { rules: list } = await getDetectedActivityRules();
      setRules(list);
    } catch (_) {
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) loadRules();
  }, [open, loadRules]);

  async function toggleEnabled(r: DetectedActivityRule) {
    try {
      await updateDetectedActivityRule(r.id, { enabled: !r.enabled });
      setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)));
    } catch (_) {}
  }

  async function removeRule(id: string) {
    try {
      await deleteDetectedActivityRule(id);
      setRules((prev) => prev.filter((x) => x.id !== id));
    } catch (_) {}
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setOpen(true)}>
        Manage rules
      </button>
    );
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Rules / Memory</span>
        <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '0.8rem', margin: '0 0 10px 0' }}>
        Saved rules improve suggestions for similar items. They never auto-post.
      </p>
      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Loading rules…</p>
      ) : rules.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No rules yet. Use “Remember this choice next time” when resolving or ignoring an item.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.map((r) => (
            <li
              key={r.id}
              style={{
                padding: 8,
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--bg)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ flex: '1 1 200px', fontSize: '0.8rem' }}>{rulePatternLabel(r)}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 500 }}>→ {getSuggestedActionLabel(r.actionSuggestion as DetectedSuggestedAction)}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={r.enabled} onChange={() => toggleEnabled(r)} />
                On
              </label>
              <button type="button" className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => removeRule(r.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DetectedCard({
  item,
  onAction,
  onIgnore,
  onReopen,
  showActions,
}: {
  item: DetectedActivityItem;
  onAction: (item: DetectedActivityItem, flow: LaunchFlowType) => void;
  onIgnore: () => void;
  onReopen: () => void;
  showActions: boolean;
}) {
  const suggestedAction = item.suggestedAction ?? computeSuggestedActionForItem(item);
  const suggestedLabel = getSuggestedActionLabel(suggestedAction);
  const showTransferMatch = !!item.possibleTransferMatchId;
  const statusBadge =
    item.status === 'ignored' ? <Badge label="Ignored" style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }} />
    : item.status === 'resolved' ? <Badge label="Resolved" style={{ background: 'var(--surface)', color: 'var(--green)', border: '1px solid var(--border)' }} />
    : <Badge label="New" style={{ background: 'rgba(14, 165, 233, 0.15)', color: 'var(--accent)', border: '1px solid var(--border)' }} />;
  const pendingPostedBadge = item.pending
    ? <Badge label="Pending" style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }} />
    : <Badge label="Posted" style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }} />;
  return (
    <div
      className="card"
      style={{
        padding: 12,
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--surface)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {statusBadge}
        {pendingPostedBadge}
      </div>
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="name" style={{ fontWeight: 600 }}>{item.title}</span>
        <span className="amount" style={{ color: item.amountCents >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {formatCents(item.amountCents)}
        </span>
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 8 }}>
        {item.accountName} · {item.accountType.replace('_', ' ')} · {item.dateISO}
        {item.updatedFromPending && !item.pending && (
          <span style={{ marginLeft: 4, fontStyle: 'italic' }}>· Updated from pending to posted</span>
        )}
      </div>
      {item.sourceMode === 'real_pilot' && item.detectedAt && (
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 6 }}>
          Detected {new Date(item.detectedAt).toLocaleString()}
        </div>
      )}
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
        {item.suggestedFromRule && (
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontStyle: 'italic' }}>Based on your saved rule</span>
        )}
        {showTransferMatch && (
          <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Possible transfer pair detected</span>
        )}
      </div>
      {showActions ? (
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
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '6px 10px' }}
            onClick={onReopen}
          >
            Move back to New
          </button>
        </div>
      )}
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
