import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// POS runs on tablets at the counter where wifi can drop mid-shift, so this
// is configured as an installable PWA with a service worker that caches the
// app shell. It does NOT queue offline order writes yet (see docs/ROADMAP)
// -- that's a deliberate next step, not an oversight, because syncing
// offline-created orders safely needs conflict handling on the API side too.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'F&B POS Kasir',
        short_name: 'POS Kasir',
        description: 'Aplikasi kasir internal F&B',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
