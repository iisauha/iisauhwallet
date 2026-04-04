/**
 * Re-applies theme/appearance CSS variables from localStorage.
 * Called after a remote sync pull so theme changes from another device
 * take effect without a page reload.
 */

import { loadAppThemeColor, loadAppAccentColor, loadAppFontFamily, loadAppFontScale, loadAdvancedUIColors } from './storage';
import { getThemeColorsFromHex, getAccentColorsFromHex } from '../theme/themeUtils';
import { getFontFamilyStack } from '../theme/fontStacks';

export function applyThemeFromStorage() {
  const root = document.documentElement.style;
  const appBg = loadAppThemeColor();
  const accentHex = loadAppAccentColor();
  const themeColors = getThemeColorsFromHex(appBg);
  const accentColors = getAccentColorsFromHex(accentHex);

  root.setProperty('--bg', appBg);
  root.setProperty('--bg-secondary', themeColors.bgSecondary);
  root.setProperty('--surface', themeColors.surface);
  root.setProperty('--surface-hover', themeColors.surfaceHover);
  root.setProperty('--border', themeColors.border);
  root.setProperty('--border-subtle', themeColors.borderSubtle);
  root.setProperty('--text', themeColors.text);
  root.setProperty('--muted', themeColors.muted);
  root.setProperty('--shadow', themeColors.shadow);
  root.setProperty('--shadow-strong', themeColors.shadowStrong);
  root.setProperty('--accent', accentColors.accent);
  root.setProperty('--accent-hover', accentColors.accentHover);
  root.setProperty('--app-font-family', getFontFamilyStack(loadAppFontFamily()));
  root.setProperty('--app-font-scale', String(loadAppFontScale()));

  const uiColors = loadAdvancedUIColors();
  const uiVarMap: [key: string, varName: string][] = [
    ['cardBg', '--ui-card-bg'],
    ['surfaceSecondary', '--ui-surface-secondary'],
    ['sectionBg', '--ui-section-bg'],
    ['modalBg', '--ui-modal-bg'],
    ['tabBarBg', '--ui-tabbar-bg'],
    ['border', '--ui-border'],
  ];
  uiVarMap.forEach(([key, varName]) => {
    const v = uiColors[key as keyof typeof uiColors];
    if (v != null && String(v).trim() !== '') {
      root.setProperty(varName, String(v).trim());
    } else {
      root.removeProperty(varName);
    }
  });
}
