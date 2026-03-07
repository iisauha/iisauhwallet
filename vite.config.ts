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
  },
  plugins: [
    react(),
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
