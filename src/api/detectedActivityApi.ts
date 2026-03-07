/**
 * API client for the LedgerLite backend (Plaid sandbox).
 * Only used when VITE_API_BASE_URL is set. No secrets are sent or stored in the frontend.
 */

const BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL) || '';

export type DetectedActivityItemFromApi = {
  id: string;
  plaidTransactionId?: string;
  title: string;
  amountCents: number;
  dateISO: string;
  accountName: string;
  accountType: string;
  pending: boolean;
  status: string;
  source?: string;
  resolvedAs?: string;
  suggestedAction?: string;
  possibleTransferMatchId?: string;
  updatedFromPending?: boolean;
  sourceEnvironment?: 'sandbox' | 'production';
  sourceMode?: 'sandbox' | 'real_pilot';
  detectedAt?: string;
  suggestedFromRule?: boolean;
  likelyRefund?: boolean;
  likelyReversal?: boolean;
  linkedPurchaseId?: string;
  linkedPurchaseTitle?: string;
  linkedPurchaseDateISO?: string;
  linkedPurchaseAmountCents?: number;
  suggestionSource?: string;
  suggestionReason?: string;
  firstSeenAt?: string;
  lastUpdatedAt?: string;
  resolvedAt?: string;
  matchedRuleId?: string;
  matchedRuleSummary?: string;
};

export type DetectedActivityRule = {
  id: string;
  enabled: boolean;
  matchType: string;
  matchValue: string;
  accountName?: string;
  direction?: 'inflow' | 'outflow' | 'any';
  actionSuggestion: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
};

export function hasApiBase(): boolean {
  return typeof BASE === 'string' && BASE.length > 0;
}

export type PlaidMode = 'sandbox' | 'production';

export async function getPlaidMode(): Promise<PlaidMode> {
  const res = await fetchApi('/api/health');
  if (!res.ok) return 'sandbox';
  const data = await res.json().catch(() => ({}));
  const env = (data.env ?? data.plaid_env ?? 'sandbox').toLowerCase();
  return env === 'production' ? 'production' : 'sandbox';
}

async function fetchApi(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${BASE.replace(/\/$/, '')}${path}`;
  return fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
}

export async function createLinkToken(): Promise<{ link_token: string }> {
  const res = await fetchApi('/api/plaid/create_link_token', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || 'Failed to create link token');
  }
  return res.json();
}

export async function exchangePublicToken(publicToken: string): Promise<{ ok: boolean }> {
  const res = await fetchApi('/api/plaid/exchange_public_token', {
    method: 'POST',
    body: JSON.stringify({ public_token: publicToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { error?: string }).error || res.statusText || 'Exchange failed';
    throw new Error(msg);
  }
  return res.json();
}

export async function syncTransactions(): Promise<{ synced: number; total: number }> {
  const res = await fetchApi('/api/plaid/sync_transactions', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || 'Sync failed');
  }
  return res.json();
}

export async function getDetectedActivity(): Promise<{ items: DetectedActivityItemFromApi[] }> {
  const res = await fetchApi('/api/detected-activity');
  if (!res.ok) throw new Error('Failed to load detected activity');
  return res.json();
}

/** Run a single test item through backend suggestion/rules logic. Returns enriched item (no persistence). */
export async function enrichTestItem(item: {
  id?: string;
  title: string;
  amountCents: number;
  dateISO: string;
  accountName: string;
  accountType: string;
  pending: boolean;
  source?: string;
}): Promise<DetectedActivityItemFromApi> {
  const res = await fetchApi('/api/detected-activity/enrich-item', {
    method: 'POST',
    body: JSON.stringify({ ...item, source: 'test' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Enrich failed');
  }
  const data = await res.json();
  return data.item;
}

export async function ignoreDetectedItem(id: string): Promise<void> {
  const res = await fetchApi(`/api/detected-activity/${encodeURIComponent(id)}/ignore`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to ignore item');
}

export type ResolveLinkPayload = {
  linkedPurchaseId: string;
  linkedPurchaseTitle?: string;
  linkedPurchaseDateISO?: string;
  linkedPurchaseAmountCents?: number;
};

export async function resolveDetectedItem(
  id: string,
  resolvedAs?: string,
  linkPayload?: ResolveLinkPayload
): Promise<void> {
  const body: Record<string, unknown> = resolvedAs != null ? { resolvedAs } : {};
  if (linkPayload) {
    body.linkedPurchaseId = linkPayload.linkedPurchaseId;
    body.linkedPurchaseTitle = linkPayload.linkedPurchaseTitle;
    body.linkedPurchaseDateISO = linkPayload.linkedPurchaseDateISO;
    body.linkedPurchaseAmountCents = linkPayload.linkedPurchaseAmountCents;
    if (resolvedAs == null) body.resolvedAs = 'refund_linked';
  }
  const res = await fetchApi(`/api/detected-activity/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to resolve item');
}

export async function resetDetectedItem(id: string): Promise<void> {
  const res = await fetchApi(`/api/detected-activity/${encodeURIComponent(id)}/reset`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to reset item');
}

/** Sync transactions from Plaid then return normalized detected-activity items. */
export async function syncAndGetDetectedActivity(): Promise<DetectedActivityItemFromApi[]> {
  await syncTransactions();
  const { items } = await getDetectedActivity();
  return items;
}

// --- Detected activity rules ---
export async function getDetectedActivityRules(): Promise<{ rules: DetectedActivityRule[] }> {
  const res = await fetchApi('/api/detected-activity/rules');
  if (!res.ok) throw new Error('Failed to load rules');
  return res.json();
}

export async function createDetectedActivityRule(rule: {
  matchType: string;
  matchValue: string;
  accountName?: string;
  direction?: 'inflow' | 'outflow' | 'any';
  actionSuggestion: string;
  priority?: number;
}): Promise<{ rule: DetectedActivityRule }> {
  const res = await fetchApi('/api/detected-activity/rules', {
    method: 'POST',
    body: JSON.stringify(rule),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to create rule');
  }
  return res.json();
}

export async function updateDetectedActivityRule(
  id: string,
  patch: { enabled?: boolean; matchType?: string; matchValue?: string; accountName?: string; direction?: string; actionSuggestion?: string; priority?: number }
): Promise<{ rule: DetectedActivityRule }> {
  const res = await fetchApi(`/api/detected-activity/rules/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Failed to update rule');
  return res.json();
}

export async function deleteDetectedActivityRule(id: string): Promise<void> {
  const res = await fetchApi(`/api/detected-activity/rules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete rule');
}

// --- Plaid pilot diagnostics and recovery (queue only; no ledger) ---
export type PilotStatus = {
  plaidMode: 'sandbox' | 'production';
  lastManualSyncAt: string | null;
  lastWebhookSyncAt: string | null;
  counts: { new: number; ignored: number; resolved: number };
  bySource: {
    sandbox: { new: number; ignored: number; resolved: number };
    real_pilot: { new: number; ignored: number; resolved: number };
  };
};

export async function getPilotStatus(): Promise<PilotStatus> {
  const res = await fetchApi('/api/plaid/pilot-status');
  if (!res.ok) throw new Error('Failed to load pilot status');
  return res.json();
}

export async function pilotClearSandboxDetected(): Promise<{ removed: number }> {
  const res = await fetchApi('/api/plaid/pilot/clear-sandbox-detected', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to clear sandbox detected items');
  }
  return res.json();
}

export async function pilotClearResolvedSandbox(): Promise<{ removed: number }> {
  const res = await fetchApi('/api/plaid/pilot/clear-resolved-sandbox', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to clear resolved sandbox items');
  }
  return res.json();
}

export async function pilotResync(itemId?: string): Promise<void> {
  const res = await fetchApi('/api/plaid/pilot/resync', {
    method: 'POST',
    body: JSON.stringify(itemId != null ? { itemId } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Resync failed');
  }
}

export async function pilotRebuildQueue(): Promise<void> {
  const res = await fetchApi('/api/plaid/pilot/rebuild-queue', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Rebuild failed');
  }
}
