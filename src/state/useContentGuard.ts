/**
 * Content guard: checks text input for banned content.
 * Provides both a React hook and a standalone function.
 *
 * If banned content is found:
 * 1. Clears the field immediately
 * 2. Shows a warning (1st, 2nd, 3rd)
 * 3. On 4th offense, wipes ALL data and reloads
 */
import { useCallback } from 'react';
import { checkForBannedContent, getWarningCount, incrementWarnings, getWarningMessage } from './contentFilter';
import { clearDataCache } from './storage';

/**
 * Standalone (non-hook) guard. Call with the current value and a clear callback.
 * Returns true if the value was blocked.
 */
export function enforceContentFilter(value: string, clearFn: () => void): boolean {
  const match = checkForBannedContent(value);
  if (!match) return false;

  // Always clear the field immediately
  clearFn();

  const currentCount = getWarningCount();

  // 4th+ offense: wipe everything
  if (currentCount >= 3) {
    clearDataCache();
    localStorage.clear();
    window.location.reload();
    return true;
  }

  // Increment and show warning
  const newCount = incrementWarnings();
  const message = getWarningMessage(newCount);
  if (message) {
    window.dispatchEvent(new CustomEvent('content-warning', { detail: { message } }));
  }

  return true;
}

/**
 * React hook version. Returns a stable `guard(value, clearFn) => boolean`.
 */
export function useContentGuard() {
  return useCallback((value: string, clearFn: () => void): boolean => {
    return enforceContentFilter(value, clearFn);
  }, []);
}
