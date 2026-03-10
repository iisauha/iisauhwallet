import { OPTIMIZER_LAST_RESULT_KEY } from '../../state/keys';
import type { OptimizerResult } from './optimize457b';
import type { OptimizerAssumptions } from './optimizerAssumptions';

export type SavedOptimizerResult = {
  result: OptimizerResult;
  assumptions?: OptimizerAssumptions;
  timestamp?: number;
};

export function loadLastOptimizerResult(): SavedOptimizerResult | null {
  try {
    const raw = localStorage.getItem(OPTIMIZER_LAST_RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || !parsed.result) return null;
    return parsed as SavedOptimizerResult;
  } catch {
    return null;
  }
}

export function saveLastOptimizerResult(payload: SavedOptimizerResult): void {
  localStorage.setItem(OPTIMIZER_LAST_RESULT_KEY, JSON.stringify({ ...payload, timestamp: Date.now() }));
}
