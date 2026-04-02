/**
 * Storage compaction: minify purchase keys and strip default/falsy values.
 * Reduces JSON size ~40-50% for the purchases array.
 * Applied before serialization (compact), reversed after parsing (expand).
 */
import type { LedgerData } from './models';

const PURCHASE_KEY_MAP: Record<string, string> = {
  id: '_i', title: '_t', amountCents: '_a', dateISO: '_d', category: '_c',
  subcategory: '_sc', notes: '_n', isSplit: '_sp', splitTotalCents: '_st',
  splitMyPortionCents: '_sm', splitInboundCents: '_si', splitPendingId: '_pid',
  originalTotal: '_ot', applyToSnapshot: '_as', paymentSource: '_ps',
  paymentTargetId: '_pt', hysaSubBucket: '_hb', fullReimbursementExpected: '_fr',
  estimatedRewardCashbackCents: '_rc', estimatedRewardPoints: '_rp',
  estimatedRewardMiles: '_rm', recurringId: '_ri', recurringDateKey: '_rk',
  createdAt: '_cr', splitSnapshot: '_ss',
};

const PURCHASE_KEY_REVERSE: Record<string, string> = {};
for (const [long, short] of Object.entries(PURCHASE_KEY_MAP)) PURCHASE_KEY_REVERSE[short] = long;

// Required fields that must always be kept even when falsy
const PURCHASE_REQUIRED = new Set(['id', 'title', 'amountCents', 'dateISO']);

function compactPurchase(p: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(p)) {
    // Skip falsy values except for required fields
    if (v === undefined || v === null || v === false || v === '' || v === 0) {
      if (!PURCHASE_REQUIRED.has(k)) continue;
    }
    out[PURCHASE_KEY_MAP[k] || k] = v;
  }
  return out;
}

function expandPurchase(p: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(p)) {
    // Map known short keys back to full names; drop unknown _-prefixed keys
    if (PURCHASE_KEY_REVERSE[k]) {
      out[PURCHASE_KEY_REVERSE[k]] = v;
    } else if (!k.startsWith('_')) {
      out[k] = v; // pass through normal keys unchanged
    }
  }
  return out;
}

/** Compact LedgerData for storage: minify purchase keys, strip defaults. */
export function compactForStorage(data: LedgerData): any {
  const d = { ...data } as any;
  if (Array.isArray(d.purchases) && d.purchases.length > 0) {
    d.purchases = d.purchases.map(compactPurchase);
    d._compacted = true;
  }
  return d;
}

/** Expand compacted data back to full key names. */
export function expandFromStorage(d: any): LedgerData {
  if (d._compacted && Array.isArray(d.purchases)) {
    d.purchases = d.purchases.map(expandPurchase);
    delete d._compacted;
  }
  return d as LedgerData;
}
