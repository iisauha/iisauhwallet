/**
 * Mock/prototype "Detected Activity" inbox only.
 * No Plaid or real API; UI-only for testing the feature.
 */

import { DETECTED_ACTIVITY_KEY } from './keys';

export type DetectedActivityStatus = 'new' | 'in_progress' | 'resolved' | 'ignored';

/** Suggested action for UX only; user still chooses manually. */
export type DetectedSuggestedAction =
  | 'add_purchase'
  | 'pending_in'
  | 'pending_out'
  | 'transfer'
  | 'review_manually'
  | 'suggest_ignore';

/** Sandbox vs real pilot; used to keep items separate in UI. */
export type DetectedSourceMode = 'sandbox' | 'real_pilot';

/** Item origin: plaid (backend) or test (manually added for testing). */
export type DetectedSource = 'plaid' | 'test';

export type DetectedActivityItem = {
  id: string;
  /** Item origin: plaid or test. Test items are manually added for classification testing. */
  source?: DetectedSource;
  /** Plaid transaction id (backend items only). */
  plaidTransactionId?: string;
  title: string;
  amountCents: number;
  dateISO: string;
  accountName: string;
  accountType: string;
  pending: boolean;
  status: DetectedActivityStatus;
  /** Best-effort suggestion; no auto-resolve. */
  suggestedAction?: DetectedSuggestedAction;
  /** If set, this item is part of a likely transfer pair with the given id. */
  possibleTransferMatchId?: string;
  /** True when this item was reconciled from pending to posted (single queue item). */
  updatedFromPending?: boolean;
  /** Plaid environment (sandbox vs production). */
  sourceEnvironment?: 'sandbox' | 'production';
  /** UI-facing mode: sandbox vs real_pilot. */
  sourceMode?: DetectedSourceMode;
  /** When this item was first detected (real pilot debug). */
  detectedAt?: string;
  /** True when suggestedAction came from a saved rule. */
  suggestedFromRule?: boolean;
  /** Best-effort: likely refund (inbound with refund/credit keywords or positive on credit card). */
  likelyRefund?: boolean;
  /** Best-effort: likely reversal (description contains reversal). */
  likelyReversal?: boolean;
  /** When resolved as refund linked to a purchase. */
  linkedPurchaseId?: string;
  linkedPurchaseTitle?: string;
  linkedPurchaseDateISO?: string;
  linkedPurchaseAmountCents?: number;
  /** Audit: why this suggestion (rule | transfer_match | heuristic). */
  suggestionSource?: 'rule' | 'transfer_match' | 'heuristic' | 'manual_only';
  /** Audit: human-readable reason for suggestion. */
  suggestionReason?: string;
  /** Audit: when first detected. */
  firstSeenAt?: string;
  /** Audit: when last updated (sync or resolve/ignore). */
  lastUpdatedAt?: string;
  /** What the user resolved this item as (e.g. add_purchase, refund_linked). */
  resolvedAs?: string;
  /** Audit: when resolved (if resolved). */
  resolvedAt?: string;
  /** Audit: rule that matched (if suggestion from rule). */
  matchedRuleId?: string;
  matchedRuleSummary?: string;
};

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function loadDetectedActivity(): DetectedActivityItem[] {
  try {
    const raw = localStorage.getItem(DETECTED_ACTIVITY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as DetectedActivityItem[];
  } catch {
    return [];
  }
}

export function saveDetectedActivity(items: DetectedActivityItem[]): void {
  try {
    localStorage.setItem(DETECTED_ACTIVITY_KEY, JSON.stringify(items));
  } catch (_) {}
}

export function getActiveDetectedCount(items: DetectedActivityItem[]): number {
  return items.filter((i) => i.status === 'new' || i.status === 'in_progress').length;
}
