import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles.css';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '';

if (import.meta.env.DEV) {
  const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  const cspContent = cspMeta?.getAttribute('content') ?? null;
  console.log('[Plaid dev] Active CSP meta tag:', cspContent != null ? cspContent : '(none — relaxed)');
  console.log('[Plaid dev] CSP from headers cannot be read from same-origin JS; server sends permissive CSP in dev.');
  console.log('Plaid debug mode: dev CSP relaxed');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      if (regs.length > 0) {
        console.log('[Plaid dev] Unregistering', regs.length, 'service worker(s) to avoid stale cached HTML/CSP');
        regs.forEach((r) => r.unregister());
      }
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
