/**
 * Tracks net cash over time for the Snapshot chart.
 * Records a snapshot after each data mutation (throttled to 1/min).
 * Stores up to 30 days of hourly data points in localStorage.
 */
import { calcFinalNetCashCents } from './calc';
import type { LedgerData } from './models';

const STORAGE_KEY = 'iisauhwallet_net_cash_history_v1';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const THROTTLE_MS = 60_000; // 1 minute minimum between recordings

export interface NetCashSnapshot {
  ts: number;     // Unix timestamp (ms)
  cents: number;  // finalNetCashCents at that moment
}

let _lastRecordedAt = 0;

export function loadNetCashHistory(): NetCashSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as NetCashSnapshot[];
  } catch {
    return [];
  }
}

function saveNetCashHistory(history: NetCashSnapshot[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Quota exceeded — trim older entries and retry
    const trimmed = history.slice(-500);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed)); } catch { /* give up */ }
  }
}

/**
 * Record a net cash snapshot. Throttled: only records if >=1min since last.
 * Call this after every data mutation (via 'data-changed' event).
 */
export function recordNetCashSnapshot(data: LedgerData) {
  const now = Date.now();
  if (now - _lastRecordedAt < THROTTLE_MS) return;
  _lastRecordedAt = now;

  const totals = calcFinalNetCashCents(data);
  const cents = totals.finalNetCashCents;

  let history = loadNetCashHistory();

  // Dedupe: if last entry has same value and is within 5 minutes, skip
  const last = history[history.length - 1];
  if (last && last.cents === cents && now - last.ts < 5 * 60_000) return;

  history.push({ ts: now, cents });

  // Prune entries older than MAX_AGE_MS
  const cutoff = now - MAX_AGE_MS;
  history = history.filter(s => s.ts >= cutoff);

  saveNetCashHistory(history);
}

/**
 * Get history for a specific time range.
 * Returns entries sorted by timestamp.
 */
export function getNetCashHistoryForRange(rangeMs: number): NetCashSnapshot[] {
  const history = loadNetCashHistory();
  const cutoff = Date.now() - rangeMs;
  return history.filter(s => s.ts >= cutoff).sort((a, b) => a.ts - b.ts);
}

/**
 * Ensure there's at least one data point for the current value.
 * Call on app load so the chart always has something to show.
 */
export function ensureCurrentSnapshot(data: LedgerData) {
  const history = loadNetCashHistory();
  const now = Date.now();
  const totals = calcFinalNetCashCents(data);

  // If no entries at all, or last entry is >1hr old, add one
  const last = history[history.length - 1];
  if (!last || now - last.ts > 60 * 60_000) {
    history.push({ ts: now, cents: totals.finalNetCashCents });
    saveNetCashHistory(history);
  }
  _lastRecordedAt = now;
}
