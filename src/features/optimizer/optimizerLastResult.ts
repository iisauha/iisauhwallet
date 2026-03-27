import { OPTIMIZER_LAST_RESULT_KEY } from '../../state/keys';
import { loadEncryptedKey, saveEncryptedKey } from '../../state/storage';
import type { OptimizerResult } from './optimize457b';
import type { OptimizerAssumptions } from './optimizerAssumptions';

export type SavedOptimizerResult = {
  result: OptimizerResult;
  assumptions?: OptimizerAssumptions;
  timestamp?: number;
};

/** Shape of the parsed JSON from localStorage (for type-safe guard). */
type ParsedOptimizerLastResult = {
  result?: unknown;
  assumptions?: unknown;
  timestamp?: number;
};

export function loadLastOptimizerResult(): SavedOptimizerResult | null {
  try {
    const raw = loadEncryptedKey(OPTIMIZER_LAST_RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ParsedOptimizerLastResult;
    if (!parsed || !parsed.result) return null;
    return parsed as SavedOptimizerResult;
  } catch {
    return null;
  }
}

export function saveLastOptimizerResult(payload: SavedOptimizerResult): void {
  saveEncryptedKey(OPTIMIZER_LAST_RESULT_KEY, JSON.stringify({ ...payload, timestamp: Date.now() }));
}
