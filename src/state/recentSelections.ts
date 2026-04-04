/**
 * Tracks recently-used selections for bank/card/HYSA/payment-source dropdowns.
 * Persists to localStorage so ordering survives across sessions.
 *
 * Usage:
 *   sortByRecent(data.banks, b => b.id)    — sort before mapping to <option>
 *   recordSelection(bankId)                — call at save/submit time
 */

const STORAGE_KEY = '__recentSelections';

type SelectionMap = Record<string, number>; // id → last-used timestamp

function load(): SelectionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(map: SelectionMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* quota exceeded — ignore */ }
}

/** Record that an account/source was just selected. Call at save/submit time. */
export function recordSelection(id: string) {
  if (!id) return;
  const map = load();
  map[id] = Date.now();
  save(map);
}

/** Record multiple selections at once (e.g. both paymentSource and paymentTargetId). */
export function recordSelections(...ids: string[]) {
  const map = load();
  const now = Date.now();
  for (const id of ids) {
    if (id) map[id] = now;
  }
  save(map);
}

/**
 * Sort an array by most-recently-used first. Items with no history
 * keep their original relative order after all recently-used items.
 */
export function sortByRecent<T>(items: T[], getId: (item: T) => string): T[] {
  const map = load();
  return [...items].sort((a, b) => {
    const ta = map[getId(a)] || 0;
    const tb = map[getId(b)] || 0;
    return tb - ta; // higher timestamp (more recent) first
  });
}
