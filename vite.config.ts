import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Local dev: permissive CSP for third-party scripts
const devCspPermissive = [
  "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
  "script-src * 'unsafe-inline' 'unsafe-eval' blob:",
  "connect-src * data: blob: ws: wss:",
  "frame-src * data: blob:",
  "img-src * data: blob:",
  "style-src * 'unsafe-inline'",
  "font-src * data:",
].join('; ');

export default defineConfig({
  base: '/',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
    headers: {
      'Content-Security-Policy': devCspPermissive,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  },
  plugins: [
    react(),
    // Dev only: remove CSP meta tag so only the permissive server CSP applies (no restrictive meta)
    {
      name: 'strip-csp-meta-in-dev',
      apply: 'serve',
      transformIndexHtml(html) {
        return html.replace(
          /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*"\s*\/?>\s*/gi,
          ''
        );
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.png', 'icon-solid.png'],
      devOptions: { enabled: false },
      manifest: {
        id: '/',
        name: 'alenjo',
        short_name: 'alenjo',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0b0b0f',
        theme_color: '#0b0b0f',
        icons: [{ src: './icon-solid.png', sizes: '512x512', type: 'image/png' }]
      },
      workbox: {
        mode: 'development',
        navigateFallback: '/index.html'
      }
    })
  ]
});
