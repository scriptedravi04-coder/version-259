import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

function sanitizeSupabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const match = rawUrl.trim().match(/^(https?:\/\/[a-zA-Z0-9-]+\.supabase\.co)/i);
  return match ? match[1] : rawUrl.trim();
}

if (process.env.VITE_SUPABASE_URL) {
  process.env.VITE_SUPABASE_URL = sanitizeSupabaseUrl(process.env.VITE_SUPABASE_URL);
}
if (process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = sanitizeSupabaseUrl(process.env.SUPABASE_URL);
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
      // Session 41: the manifest is public/manifest.json (linked in index.html, served by server.ts).
      // A second generated manifest.webmanifest would give the browser two different manifests.
      manifest: false,
      workbox: {
        // Session 41: push notification handlers (public/push-sw.js).
        importScripts: ['/push-sw.js'],
        // Never answer API / socket / file links with the cached app page: an "Open" link to
        // /api/media (KYC PDF) must reach the server, not index.html.
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io/, /^\/\.well-known\//, /^\/uploads\//],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Session 43: iPhone launch images are read by iOS only when the app is added — keep them out
        // of the offline download so the service worker is ready sooner.
        globIgnores: ['splash/**'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: 'all',
    hmr: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    entries: [
      'index.html',
      'src/**/*.{js,jsx,ts,tsx}',
    ],
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-router-dom',
      '@tanstack/react-query',
      'framer-motion',
      'lucide-react',
      'sonner',
      'axios',
      'clsx',
      'tailwind-merge',
      'class-variance-authority',
      'date-fns',
      'recharts',
      'driver.js',
      'canvas-confetti',
      'qrcode.react',
      '@radix-ui/react-popover',
      '@radix-ui/react-slot',
      'react-day-picker',
      'zustand',
      'gsap',
      'marked',
      'papaparse',
      'jspdf',
      'socket.io-client',
      '@supabase/supabase-js',
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@tiptap/extension-image',
      '@tiptap/extension-link',
      '@tiptap/extension-placeholder',
      'd3',
    ],
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: false,
  },
});
