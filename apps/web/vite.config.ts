import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { colors } from '@plateguard/design-tokens';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'PlateGuard',
        short_name: 'PlateGuard',
        description: 'Allergen checks per guest, per plate.',
        theme_color: colors.brand,
        background_color: colors.mist,
        display: 'standalone',
        start_url: '/tables',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // The guest menu and the app shell work offline; API calls always go to the network.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/hooks\//],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
