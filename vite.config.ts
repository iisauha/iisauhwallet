import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Dev-only CSP: Plaid Link + reCAPTCHA (VERIFY_PHONE). Wildcards cover ssl.gstatic.com etc.
const devCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.plaid.com https://*.plaid.com https://www.google.com https://*.google.com https://www.gstatic.com https://*.gstatic.com",
  "connect-src 'self' https://cdn.plaid.com https://*.plaid.com https://www.google.com https://*.google.com https://www.gstatic.com https://*.gstatic.com https://recaptcha.google.com https://www.recaptcha.net http://localhost:* https://localhost:* wss://localhost:* blob:",
  "frame-src 'self' https://cdn.plaid.com https://*.plaid.com https://www.google.com https://*.google.com https://www.recaptcha.net https://recaptcha.google.com https://www.gstatic.com https://*.gstatic.com blob:",
  "img-src 'self' data: blob: https://www.gstatic.com https://*.gstatic.com https://www.google.com https://*.google.com https://cdn.plaid.com https://*.plaid.com",
  "style-src 'self' 'unsafe-inline' https://www.gstatic.com https://*.gstatic.com https://fonts.googleapis.com https://*.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com https://www.gstatic.com https://*.gstatic.com",
].join('; ');

export default defineConfig({
  base: '/ledgerlite-copy/',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
    headers: {
      'Content-Security-Policy': devCsp,
    },
  },
  plugins: [
    react(),
    // Dev only: remove CSP meta so server's permissive CSP (Plaid + reCAPTCHA) is the only one applied
    {
      name: 'strip-csp-meta-in-dev',
      apply: 'serve',
      transformIndexHtml(html) {
        return html.replace(
          /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*"\s*\/?>\s*/i,
          ''
        );
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.png'],
      manifest: {
        name: 'iisauhwallet',
        short_name: 'iisauh',
        start_url: '.',
        display: 'standalone',
        background_color: '#0b0b0f',
        theme_color: '#0b0b0f',
        icons: [{ src: './icon.png', sizes: '512x512', type: 'image/png' }]
      },
      workbox: {
        // Avoid flaky SW minification (terser) during build.
        mode: 'development',
        navigateFallback: '/ledgerlite-copy/index.html'
      }
    })
  ]
});
