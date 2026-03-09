import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { loadAppTheme } from './state/storage';
import './styles.css';
import './theme/theme.css';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '';

const savedTheme = loadAppTheme();
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

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
