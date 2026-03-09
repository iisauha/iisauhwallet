import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { loadAppTheme, loadAppFontFamily, loadAppFontScale, loadAppAccentCustom } from './state/storage';
import { getFontFamilyStack } from './theme/fontStacks';
import { lightenHex } from './theme/themeUtils';
import './styles.css';
import './theme/theme.css';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '';

const savedTheme = loadAppTheme();
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
if (savedTheme === 'custom') {
  const hex = loadAppAccentCustom();
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent-hover', lightenHex(hex, 1.25));
}
document.documentElement.style.setProperty('--app-font-family', getFontFamilyStack(loadAppFontFamily()));
document.documentElement.style.setProperty('--app-font-scale', String(loadAppFontScale()));

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    if (regs.length > 0) regs.forEach((r) => r.unregister());
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
