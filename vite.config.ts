import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/ledgerlite-copy/',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
    // No CSP header in dev — CSP meta is stripped below so Plaid Link + reCAPTCHA are not blocked
  },
  plugins: [
    react(),
    // Dev only: remove CSP meta tag so no CSP is applied (Plaid Link + reCAPTCHA need external resources)
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
