/**
 * Triggers theme/appearance re-sync from localStorage.
 * Called after a remote sync pull so theme changes from another device
 * take effect without a page reload.
 *
 * Dispatches a 'theme-sync' event that ThemeProvider, AppearanceProvider,
 * and AdvancedUIColorsProvider listen to. Each provider re-reads its own
 * values from localStorage and updates React state + CSS variables.
 */
export function applyThemeFromStorage() {
  window.dispatchEvent(new Event('theme-sync'));
}
