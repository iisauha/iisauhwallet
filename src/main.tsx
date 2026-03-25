import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { initCrypto } from './state/crypto';
import { loadAppThemeColor, loadAppAccentColor, loadAppFontFamily, loadAppFontScale, loadAdvancedUIColors, DEFAULT_THEME_COLOR } from './state/storage';
import { getFontFamilyStack } from './theme/fontStacks';
import { getThemeColorsFromHex, getAccentColorsFromHex } from './theme/themeUtils';
import './styles.css';
import './theme/theme.css';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '';

const appBackgroundHex = loadAppThemeColor();
const accentHex = loadAppAccentColor();
const defaultThemeColors = getThemeColorsFromHex(DEFAULT_THEME_COLOR);
const accentColors = getAccentColorsFromHex(accentHex);
const root = document.documentElement.style;
root.setProperty('--bg', appBackgroundHex);
root.setProperty('--bg-secondary', defaultThemeColors.bgSecondary);
root.setProperty('--surface', defaultThemeColors.surface);
root.setProperty('--surface-hover', defaultThemeColors.surfaceHover);
root.setProperty('--border', defaultThemeColors.border);
root.setProperty('--border-subtle', defaultThemeColors.borderSubtle);
root.setProperty('--text', defaultThemeColors.text);
root.setProperty('--muted', defaultThemeColors.muted);
root.setProperty('--shadow', defaultThemeColors.shadow);
root.setProperty('--shadow-strong', defaultThemeColors.shadowStrong);
root.setProperty('--accent', accentColors.accent);
root.setProperty('--accent-hover', accentColors.accentHover);
document.documentElement.style.setProperty('--app-font-family', getFontFamilyStack(loadAppFontFamily()));
document.documentElement.style.setProperty('--app-font-scale', String(loadAppFontScale()));
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
  if (v != null && String(v).trim() !== '') document.documentElement.style.setProperty(varName, String(v).trim());
});

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    if (regs.length > 0) regs.forEach((r) => r.unregister());
  });
}

(async () => {
  await initCrypto();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
})();
