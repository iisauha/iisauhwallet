import React, { useCallback, useMemo, useState } from 'react';
import { formatCents, parseCents } from '../../state/calc';
import { useDetectedActivity } from '../../state/DetectedActivityContext';
import { getActiveDetectedCount, uid, type DetectedActivityItem, type DetectedSuggestedAction } from '../../state/detectedActivity';
import type { LaunchFlowType } from '../../state/DetectedActivityContext';
import { useLedgerStore } from '../../state/store';
import type { Purchase } from '../../state/models';
import {
  hasApiBase,
  createLinkToken,
  exchangePublicToken,
  getDetectedActivity,
  syncAndGetDetectedActivity,
  enrichTestItem,
  getPlaidMode,
  getPilotStatus,
  pilotClearSandboxDetected,
  pilotClearResolvedSandbox,
  pilotResync,
  pilotRebuildQueue,
  resetDetectedItem,
  createDetectedActivityRule,
  getDetectedActivityRules,
  updateDetectedActivityRule,
  deleteDetectedActivityRule,
  type DetectedActivityItemFromApi,
  type PlaidMode,
  type PilotStatus,
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
    source: (a as { source?: 'plaid' | 'test' }).source ?? 'plaid',
    plaidTransactionId: a.plaidTransactionId,
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
    likelyRefund: a.likelyRefund,
    likelyReversal: a.likelyReversal,
    linkedPurchaseId: a.linkedPurchaseId,
    linkedPurchaseTitle: a.linkedPurchaseTitle,
    linkedPurchaseDateISO: a.linkedPurchaseDateISO,
    linkedPurchaseAmountCents: a.linkedPurchaseAmountCents,
    suggestionSource: a.suggestionSource as DetectedActivityItem['suggestionSource'],
    suggestionReason: a.suggestionReason,
    firstSeenAt: a.firstSeenAt,
    lastUpdatedAt: a.lastUpdatedAt,
    resolvedAs: a.resolvedAs,
    resolvedAt: a.resolvedAt,
    matchedRuleId: a.matchedRuleId,
    matchedRuleSummary: a.matchedRuleSummary,
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

function getSuggestedActionLabel(action: DetectedSuggestedAction | string): string {
  switch (action) {
    case 'add_purchase': return 'Add purchase';
    case 'pending_in': return 'Pending inbound';
    case 'pending_out': return 'Pending outbound';
    case 'transfer': return 'Transfer between cash and investing';
    case 'review_manually': return 'Review manually';
    case 'suggest_ignore': return 'Ignore / likely irrelevant';
    case 'refund_linked': return 'Linked refund to purchase';
    default: return typeof action === 'string' && action ? action.replace(/_/g, ' ') : 'Review manually';
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
  const { items, setItems, setLaunchFlow, setBackendItems, markResolved, markIgnored, markReopened } = useDetectedActivity();
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
  const [linkToPurchaseForItem, setLinkToPurchaseForItem] = useState<DetectedActivityItem | null>(null);
  const [detailsItem, setDetailsItem] = useState<DetectedActivityItem | null>(null);
  const [pilotStatus, setPilotStatus] = useState<PilotStatus | null>(null);
  const [pilotMaintenanceBusy, setPilotMaintenanceBusy] = useState(false);
  const [pilotMaintenanceError, setPilotMaintenanceError] = useState<string | null>(null);
  const [addTestOpen, setAddTestOpen] = useState(false);
  const [addTestSaving, setAddTestSaving] = useState(false);
  const apiConfigured = hasApiBase();
  const data = useLedgerStore((s) => s.data);

  const loadPilotStatus = useCallback(async () => {
    if (!apiConfigured) return;
    try {
      const status = await getPilotStatus();
      setPilotStatus(status);
    } catch (_) {
      setPilotStatus(null);
    }
  }, [apiConfigured]);

  React.useEffect(() => {
    if (!apiConfigured) return;
    getPlaidMode().then(setPlaidMode).catch(() => setPlaidMode('sandbox'));
  }, [apiConfigured]);

  React.useEffect(() => {
    loadPilotStatus();
  }, [loadPilotStatus, syncStatus, refreshStatus]);

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
            const list = await syncAndGetDetectedActivity();
            setBackendItems(list.map(toDetectedItem));
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
      setSyncMessage(`Loaded ${list.length} detected item(s).`);
      await loadPilotStatus();
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
      await loadPilotStatus();
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
            {pilotStatus ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: '0.8rem',
                  color: 'var(--muted)',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Pilot status</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 16px' }}>
                  <span>Mode: {pilotStatus.plaidMode === 'production' ? 'Real Pilot' : 'Sandbox'}</span>
                  <span>Last manual sync: {pilotStatus.lastManualSyncAt ? new Date(pilotStatus.lastManualSyncAt).toLocaleString() : '—'}</span>
                  <span>Last webhook sync: {pilotStatus.lastWebhookSyncAt ? new Date(pilotStatus.lastWebhookSyncAt).toLocaleString() : '—'}</span>
                </div>
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '12px 16px' }}>
                  <span>New: {pilotStatus.counts.new}</span>
                  <span>Ignored: {pilotStatus.counts.ignored}</span>
                  <span>Resolved: {pilotStatus.counts.resolved}</span>
                </div>
                <div style={{ marginTop: 6, display: 'flex', gap: 12 }}>
                  <span>Sandbox — new: {pilotStatus.bySource.sandbox.new}, ignored: {pilotStatus.bySource.sandbox.ignored}, resolved: {pilotStatus.bySource.sandbox.resolved}</span>
                  <span>Real pilot — new: {pilotStatus.bySource.real_pilot.new}, ignored: {pilotStatus.bySource.real_pilot.ignored}, resolved: {pilotStatus.bySource.real_pilot.resolved}</span>
                </div>
              </div>
            ) : plaidMode != null ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 8px 0', fontWeight: 500 }}>
                Plaid Mode: {plaidMode === 'production' ? 'Real Pilot' : 'Sandbox'}
              </p>
            ) : null}
            {plaidMode === 'production' ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 8px 0' }}>
                Pilot: one real account only. To link another, disconnect the current one first.
              </p>
            ) : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={handleConnectPlaid}>
                Connect Bank{plaidMode === 'production' ? ' (1 real account)' : ''}
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

            <PilotMaintenance
              pilotMaintenanceBusy={pilotMaintenanceBusy}
              pilotMaintenanceError={pilotMaintenanceError}
              setPilotMaintenanceBusy={setPilotMaintenanceBusy}
              setPilotMaintenanceError={setPilotMaintenanceError}
              loadPilotStatus={loadPilotStatus}
              setBackendItems={setBackendItems}
              toDetectedItem={toDetectedItem}
            />
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
          {apiConfigured ? 'Review items below. What do you want to do with each?' : 'Add test items to try the classification flow and rules.'}
        </p>
        {apiConfigured ? (
          <div style={{ marginBottom: 12 }}>
            <ManageRulesButton />
          </div>
        ) : null}
        <div style={{ marginBottom: 12 }}>
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={() => setAddTestOpen(true)}>
            Add Test Detected Activity
          </button>
        </div>
        {items.some((i) => i.source === 'test') ? (
          <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: '0.8rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Test items cleanup</div>
            <p style={{ color: 'var(--muted)', margin: '0 0 8px 0', fontSize: '0.85rem' }}>Only removes test items. Real Plaid items are not affected.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setItems((prev) => prev.filter((i) => i.source !== 'test'))}>
                Clear all test items
              </button>
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setItems((prev) => prev.filter((i) => !(i.source === 'test' && i.status === 'resolved')))}>
                Clear resolved test items
              </button>
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setItems((prev) => prev.filter((i) => !(i.source === 'test' && i.status === 'ignored')))}>
                Clear ignored test items
              </button>
            </div>
          </div>
        ) : null}
        {filteredItems.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '0.9rem', padding: '24px 0', textAlign: 'center' }}>
            {filter === 'new' && (items.length === 0 ? 'No detected activity yet. Add a test item or wait for Plaid detection.' : 'No new detected activity.')}
            {filter === 'ignored' && 'No ignored items.'}
            {filter === 'resolved' && 'No resolved items.'}
            {filter === 'all' && (items.length === 0 ? 'No detected activity yet. Add a test item or wait for Plaid detection.' : 'No detected activity.')}
            {items.length === 0 && (
              <div style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setAddTestOpen(true)}>
                  Add Test Detected Activity
                </button>
              </div>
            )}
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
                onLinkToPurchase={item.likelyRefund || item.likelyReversal ? () => setLinkToPurchaseForItem(item) : undefined}
                onShowDetails={() => setDetailsItem(item)}
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
      {detailsItem ? (
        <DetailsModal
          item={detailsItem}
          onClose={() => setDetailsItem(null)}
          onReopen={detailsItem.id.startsWith('plaid_') ? () => { markReopened(detailsItem.id); setDetailsItem(null); loadPilotStatus(); } : undefined}
          onRerunSuggestion={detailsItem.id.startsWith('plaid_') ? async () => { await resetDetectedItem(detailsItem.id); const { items: list } = await getDetectedActivity(); setBackendItems(list.map(toDetectedItem)); loadPilotStatus(); } : undefined}
        />
      ) : null}
      {addTestOpen ? (
        <AddTestModal
          onClose={() => setAddTestOpen(false)}
          onSaved={() => setAddTestOpen(false)}
          setSaving={setAddTestSaving}
          setItems={setItems}
          hasApiBase={apiConfigured}
          enrichTestItem={enrichTestItem}
          toDetectedItem={toDetectedItem}
          computeSuggestedActionForItem={computeSuggestedActionForItem}
        />
      ) : null}
      {linkToPurchaseForItem ? (
        <LinkToPurchaseModal
          detectedItem={linkToPurchaseForItem}
          onClose={() => setLinkToPurchaseForItem(null)}
          onSelect={(p) => {
            markResolved(linkToPurchaseForItem.id, 'refund_linked', {
              linkedPurchaseId: p.id,
              linkedPurchaseTitle: p.title,
              linkedPurchaseDateISO: p.dateISO,
              linkedPurchaseAmountCents: p.amountCents,
            });
            setLinkToPurchaseForItem(null);
          }}
          purchases={data.purchases || []}
        />
      ) : null}
    </div>
  );
}

function LinkToPurchaseModal({
  detectedItem,
  onClose,
  onSelect,
  purchases,
}: {
  detectedItem: DetectedActivityItem;
  onClose: () => void;
  onSelect: (p: Purchase) => void;
  purchases: Purchase[];
}) {
  const [search, setSearch] = useState('');
  const refundAmount = Math.abs(detectedItem.amountCents ?? 0);
  const titleLower = (detectedItem.title || '').toLowerCase();
  const words = titleLower.split(/\s+/).filter(Boolean);

  const sorted = useMemo(() => {
    let list = [...purchases];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          (p.title || '').toLowerCase().includes(q) ||
          (p.dateISO || '').includes(q)
      );
    }
    return list.sort((a, b) => {
      const aAmt = Math.abs(a.amountCents ?? 0);
      const bAmt = Math.abs(b.amountCents ?? 0);
      const aDiff = Math.abs(aAmt - refundAmount);
      const bDiff = Math.abs(bAmt - refundAmount);
      if (aDiff !== bDiff) return aDiff - bDiff;
      const aTitle = (a.title || '').toLowerCase();
      const bTitle = (b.title || '').toLowerCase();
      const aScore = words.filter((w) => w.length > 2 && aTitle.includes(w)).length;
      const bScore = words.filter((w) => w.length > 2 && bTitle.includes(w)).length;
      if (bScore !== aScore) return bScore - aScore;
      const aDate = a.dateISO ? new Date(a.dateISO).getTime() : 0;
      const bDate = b.dateISO ? new Date(b.dateISO).getTime() : 0;
      return bDate - aDate;
    });
  }, [purchases, search, refundAmount, words]);

  return (
    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, position: 'relative', zIndex: 10 }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>Link to original purchase</h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 10px 0' }}>
        Refund: {detectedItem.title} · {formatCents(refundAmount)}
      </p>
      <input
        type="text"
        placeholder="Search purchases…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 10px',
          marginBottom: 10,
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text)',
        }}
      />
      <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No purchases to show. Add purchases in Spending first.</p>
        ) : (
          sorted.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn btn-secondary"
              style={{ textAlign: 'left', justifyContent: 'flex-start', padding: 10 }}
              onClick={() => onSelect(p)}
            >
              <span style={{ fontWeight: 600 }}>{p.title}</span>
              <span style={{ color: 'var(--muted)', fontSize: '0.85rem', marginLeft: 8 }}>
                {p.dateISO} · {formatCents(p.amountCents)}
              </span>
            </button>
          ))
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function suggestionSourceLabel(source?: string): string {
  switch (source) {
    case 'rule': return 'Saved rule';
    case 'transfer_match': return 'Transfer matching';
    case 'heuristic': return 'Default heuristic';
    case 'manual_only': return 'Manual only';
    default: return source || '—';
  }
}

function PilotMaintenance({
  pilotMaintenanceBusy,
  pilotMaintenanceError,
  setPilotMaintenanceBusy,
  setPilotMaintenanceError,
  loadPilotStatus,
  setBackendItems,
  toDetectedItem,
}: {
  pilotMaintenanceBusy: boolean;
  pilotMaintenanceError: string | null;
  setPilotMaintenanceBusy: (v: boolean) => void;
  setPilotMaintenanceError: (v: string | null) => void;
  loadPilotStatus: () => Promise<void>;
  setBackendItems: (updater: DetectedActivityItem[] | ((prev: DetectedActivityItem[]) => DetectedActivityItem[])) => void;
  toDetectedItem: (a: DetectedActivityItemFromApi) => DetectedActivityItem;
}) {
  const refreshList = useCallback(async () => {
    const { items: list } = await getDetectedActivity();
    setBackendItems(list.map(toDetectedItem));
    await loadPilotStatus();
  }, [setBackendItems, toDetectedItem, loadPilotStatus]);

  async function run(op: () => Promise<unknown>) {
    setPilotMaintenanceError(null);
    setPilotMaintenanceBusy(true);
    try {
      await op();
      await refreshList();
    } catch (e) {
      setPilotMaintenanceError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setPilotMaintenanceBusy(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 12,
        padding: 10,
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--bg)',
        fontSize: '0.8rem',
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Pilot maintenance (queue only)</div>
      {pilotMaintenanceError ? <p style={{ color: 'var(--red)', margin: '0 0 8px 0' }}>{pilotMaintenanceError}</p> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Sandbox</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }} disabled={pilotMaintenanceBusy} onClick={() => run(() => pilotClearSandboxDetected())}>
              Clear sandbox detected items
            </button>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }} disabled={pilotMaintenanceBusy} onClick={() => run(() => pilotClearResolvedSandbox())}>
              Clear resolved sandbox items
            </button>
          </div>
        </div>
        <div>
          <div style={{ color: 'var(--muted)', marginBottom: 4 }}>Real pilot</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }} disabled={pilotMaintenanceBusy} onClick={() => run(() => pilotResync())}>
              Re-sync (manual sync)
            </button>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }} disabled={pilotMaintenanceBusy} onClick={() => run(() => pilotRebuildQueue())}>
              Rebuild queue from backend
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type AddTestModalProps = {
  onClose: () => void;
  onSaved: () => void;
  setSaving: (v: boolean) => void;
  setItems: (updater: DetectedActivityItem[] | ((prev: DetectedActivityItem[]) => DetectedActivityItem[])) => void;
  hasApiBase: boolean;
  enrichTestItem: (item: { id?: string; title: string; amountCents: number; dateISO: string; accountName: string; accountType: string; pending: boolean; source?: string }) => Promise<DetectedActivityItemFromApi>;
  toDetectedItem: (a: DetectedActivityItemFromApi) => DetectedActivityItem;
  computeSuggestedActionForItem: (item: DetectedActivityItem) => DetectedSuggestedAction;
};

function AddTestModal({
  onClose,
  onSaved,
  setSaving,
  setItems,
  hasApiBase,
  enrichTestItem,
  toDetectedItem,
  computeSuggestedActionForItem,
}: AddTestModalProps) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dateISO, setDateISO] = useState(todayISO());
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<'credit_card' | 'checking' | 'investing'>('checking');
  const [direction, setDirection] = useState<'inflow' | 'outflow'>('outflow');
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSavingLocal] = useState(false);

  async function handleSave() {
    const trimmed = (description || '').trim();
    if (!trimmed) {
      setError('Description is required');
      return;
    }
    const amountCentsRaw = parseCents(amount);
    if (amountCentsRaw <= 0) {
      setError('Amount must be greater than 0');
      return;
    }
    const amountCents = direction === 'outflow' ? -amountCentsRaw : amountCentsRaw;
    const dateStr = (dateISO || todayISO()).slice(0, 10);
    const account = (accountName || '').trim() || 'Test account';
    const nowIso = new Date().toISOString();
    setError(null);
    setSaving(true);
    setSavingLocal(true);
    try {
      const rawItem = {
        id: uid(),
        title: trimmed,
        amountCents,
        dateISO: dateStr,
        accountName: account,
        accountType: accountType === 'credit_card' ? 'credit_card' : accountType === 'investing' ? 'investment' : 'checking',
        pending,
        status: 'new' as const,
        source: 'test' as const,
      };
      let newItem: DetectedActivityItem;
      if (hasApiBase) {
        const enriched = await enrichTestItem({
          id: rawItem.id,
          title: rawItem.title,
          amountCents: rawItem.amountCents,
          dateISO: rawItem.dateISO,
          accountName: rawItem.accountName,
          accountType: rawItem.accountType,
          pending: rawItem.pending,
          source: 'test',
        });
        newItem = toDetectedItem(enriched);
        newItem.source = 'test';
        newItem.firstSeenAt = nowIso;
        newItem.lastUpdatedAt = nowIso;
        newItem.detectedAt = nowIso;
      } else {
        newItem = {
          ...rawItem,
          suggestedAction: computeSuggestedActionForItem(rawItem),
          firstSeenAt: nowIso,
          lastUpdatedAt: nowIso,
          detectedAt: nowIso,
        };
      }
      setItems((prev) => [...prev, newItem]);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add test item');
    } finally {
      setSaving(false);
      setSavingLocal(false);
    }
  }

  return (
    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400, position: 'relative', zIndex: 10 }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem' }}>Add Test Detected Activity</h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 12px 0' }}>Test items use the same suggestion and rules flow as real items.</p>
      {error ? <p style={{ color: 'var(--red)', fontSize: '0.85rem', margin: '0 0 8px 0' }}>{error}</p> : null}
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Description / merchant</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Coffee shop"
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        />
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Amount ($)</label>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        />
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Direction</label>
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as 'inflow' | 'outflow')}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        >
          <option value="inflow">Inflow</option>
          <option value="outflow">Outflow</option>
        </select>
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Date</label>
        <input
          type="date"
          value={dateISO}
          onChange={(e) => setDateISO(e.target.value.slice(0, 10))}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        />
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Account name</label>
        <input
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="e.g. Chase Checking"
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        />
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label>Account type</label>
        <select
          value={accountType}
          onChange={(e) => setAccountType(e.target.value as 'credit_card' | 'checking' | 'investing')}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        >
          <option value="credit_card">Credit card</option>
          <option value="checking">Checking / bank</option>
          <option value="investing">Investing</option>
        </select>
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label>Status</label>
        <select
          value={pending ? 'pending' : 'posted'}
          onChange={(e) => setPending(e.target.value === 'pending')}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        >
          <option value="pending">Pending</option>
          <option value="posted">Posted</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>
  );
}

type DetailsModalProps = {
  item: DetectedActivityItem;
  onClose: () => void;
  onReopen?: () => void;
  onRerunSuggestion?: () => void | Promise<void>;
};

function DetailsModal({ item, onClose, onReopen, onRerunSuggestion }: DetailsModalProps) {
  const [rerunBusy, setRerunBusy] = useState(false);
  const suggestedAction = item.suggestedAction ?? computeSuggestedActionForItem(item);
  const suggestedLabel = getSuggestedActionLabel(suggestedAction);
  const firstSeen = item.firstSeenAt || item.detectedAt;
  const lastUpdated = item.lastUpdatedAt;
  const isPlaidItem = item.id.startsWith('plaid_');

  return (
    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400, position: 'relative', zIndex: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Details · Why?</h3>
        <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={onClose}>Close</button>
      </div>
      <div style={{ fontSize: '0.9rem', marginBottom: 8, fontWeight: 600 }}>{item.title}</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 12 }}>{item.accountName} · {formatCents(item.amountCents)} · {item.dateISO}</div>

      <section style={{ marginBottom: 12 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>Suggested action</div>
        <div style={{ fontSize: '0.9rem' }}>{suggestedLabel}</div>
      </section>

      <section style={{ marginBottom: 12 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>Source</div>
        <div style={{ fontSize: '0.85rem' }}>{suggestionSourceLabel(item.suggestionSource)}</div>
      </section>

      {item.suggestionReason ? (
        <section style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>Why</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{item.suggestionReason}</div>
        </section>
      ) : null}

      {item.matchedRuleSummary ? (
        <section style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>Matched rule</div>
          <div style={{ fontSize: '0.85rem' }}>{item.matchedRuleSummary}</div>
        </section>
      ) : null}

      <section style={{ marginBottom: 12 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>State</div>
        <div style={{ fontSize: '0.85rem' }}>{item.pending ? 'Pending' : 'Posted'}</div>
      </section>

      {item.updatedFromPending ? (
        <section style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>Pending → Posted</div>
          <div style={{ fontSize: '0.85rem' }}>Originally detected as pending.</div>
          {lastUpdated ? <div style={{ fontSize: '0.85rem' }}>Updated to posted on {new Date(lastUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}.</div> : null}
        </section>
      ) : null}

      {firstSeen ? (
        <section style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>First seen</div>
          <div style={{ fontSize: '0.85rem' }}>{new Date(firstSeen).toLocaleString()}</div>
        </section>
      ) : null}

      {lastUpdated ? (
        <section style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>Last updated</div>
          <div style={{ fontSize: '0.85rem' }}>{new Date(lastUpdated).toLocaleString()}</div>
        </section>
      ) : null}

      {item.status === 'resolved' && item.resolvedAs ? (
        <section style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>Resolved as</div>
          <div style={{ fontSize: '0.85rem' }}>{getSuggestedActionLabel(item.resolvedAs as DetectedSuggestedAction) || item.resolvedAs}</div>
          {item.resolvedAt ? <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>{new Date(item.resolvedAt).toLocaleString()}</div> : null}
        </section>
      ) : null}

      <section style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 6 }}>Debug (pilot)</div>
        <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div>Plaid transaction id: {item.plaidTransactionId || (item.id.startsWith('plaid_') ? item.id : '—')}</div>
          <div>Account: {item.accountName}</div>
          <div>Pending / Posted: {item.pending ? 'Pending' : 'Posted'}</div>
          <div>First seen: {firstSeen ? new Date(firstSeen).toLocaleString() : '—'}</div>
          <div>Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleString() : '—'}</div>
          <div>Suggestion source: {suggestionSourceLabel(item.suggestionSource)}</div>
          <div>Status: {item.status}</div>
          {item.resolvedAs ? <div>Resolved as: {item.resolvedAs}</div> : null}
          {item.linkedPurchaseId ? <div>Linked item id: {item.linkedPurchaseId}</div> : null}
        </div>
      </section>

      {isPlaidItem && (onReopen || onRerunSuggestion) ? (
        <section style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 6 }}>Recovery (queue only)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {onReopen ? (
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => { onReopen(); onClose(); }}>
                Reopen (move back to New)
              </button>
            ) : null}
            {onRerunSuggestion ? (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem' }}
                disabled={rerunBusy}
                onClick={async () => {
                  setRerunBusy(true);
                  try {
                    await onRerunSuggestion();
                    onClose();
                  } finally {
                    setRerunBusy(false);
                  }
                }}
              >
                {rerunBusy ? 'Re-running…' : 'Re-run suggestion'}
              </button>
            ) : null}
          </div>
        </section>
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
  onLinkToPurchase,
  onShowDetails,
  showActions,
}: {
  item: DetectedActivityItem;
  onAction: (item: DetectedActivityItem, flow: LaunchFlowType) => void;
  onIgnore: () => void;
  onReopen: () => void;
  onLinkToPurchase?: () => void;
  onShowDetails?: () => void;
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
  const refundReversalBadge =
    item.likelyReversal ? <Badge label="Possible reversal" style={{ background: 'rgba(234, 179, 8, 0.2)', color: 'var(--yellow, #eab308)', border: '1px solid var(--border)' }} />
    : item.likelyRefund ? <Badge label="Possible refund" style={{ background: 'rgba(34, 197, 94, 0.15)', color: 'var(--green)', border: '1px solid var(--border)' }} />
    : null;
  const testBadge = item.source === 'test' ? (
    <Badge label="Test" style={{ background: 'rgba(148, 163, 184, 0.2)', color: 'var(--muted)', border: '1px solid var(--border)' }} />
  ) : null;
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
        {testBadge}
        {refundReversalBadge}
        {onShowDetails ? (
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.7rem', padding: '2px 8px', marginLeft: 'auto' }} onClick={onShowDetails}>
            Why?
          </button>
        ) : null}
      </div>
      {item.status === 'resolved' && item.linkedPurchaseId && (item.linkedPurchaseTitle != null || item.linkedPurchaseDateISO != null || item.linkedPurchaseAmountCents != null) ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 6 }}>
          Linked refund to purchase: {item.linkedPurchaseTitle ?? 'Purchase'} {item.linkedPurchaseDateISO ? ` · ${item.linkedPurchaseDateISO}` : ''} {item.linkedPurchaseAmountCents != null ? ` · ${formatCents(item.linkedPurchaseAmountCents)}` : ''}
        </div>
      ) : null}
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="name" style={{ fontWeight: 600 }}>{item.title}</span>
        <span className="amount" style={{ color: item.amountCents >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {formatCents(item.amountCents)}
        </span>
      </div>
      {item.source === 'test' ? (
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>Test detected activity</div>
      ) : null}
      <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 8 }}>
        {item.accountName} · {item.accountType.replace(/_/g, ' ')} · {item.dateISO}
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
          {onLinkToPurchase ? (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '6px 10px' }}
              onClick={onLinkToPurchase}
            >
              Link to original purchase
            </button>
          ) : null}
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
            Transfer between cash and investing
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

/** Button label: "Detected Activity" or "Detected Activity (N)" when there are unresolved items. */
export function DetectedActivityButtonLabel() {
  const { items } = useDetectedActivity();
  const count = getActiveDetectedCount(items);
  return (
    <>
      Detected Activity{count > 0 ? ` (${count})` : ''}
    </>
  );
}
