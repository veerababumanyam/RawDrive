/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA/Service Worker for offline caching and performance
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false, // Disable in dev to avoid caching issues
      },
      workbox: {
        // Cache strategies for optimal gallery performance
        runtimeCaching: [
          // Cache-first for media/thumbnails - immutable once created
          {
            urlPattern: /\/api\/v1\/media\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'rawdrive-thumbnails',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Stale-while-revalidate for gallery metadata API
          {
            urlPattern: /\/api\/v1\/workspaces\/.*\/galleries\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'rawdrive-gallery-api',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5, // 5 minutes
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Network-first for auth/user data
          {
            urlPattern: /\/api\/v1\/(auth|users|workspaces\/[^/]+$)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rawdrive-auth',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 10, // 10 minutes
              },
            },
          },
        ],
        // Don't precache - just runtime cache
        globPatterns: [],
      },
      manifest: {
        name: 'RawDrive',
        short_name: 'RawDrive',
        description: 'Professional Photography Platform',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:80', // Traefik
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        /**
         * Manual chunks configuration for optimal code splitting.
         *
         * This configuration creates separate chunks for:
         * 1. Core vendor libraries (React ecosystem)
         * 2. Animation libraries (Framer Motion)
         * 3. UI libraries (Radix UI, Lucide icons)
         * 4. Heavy libraries (face-api.js, charts, editors)
         * 5. Route-based chunks (admin, workspace, public sections)
         *
         * Benefits:
         * - Reduced initial bundle size
         * - Better caching (vendor chunks change less frequently)
         * - On-demand loading of heavy libraries
         * - Route-based code splitting for faster page loads
         */
        manualChunks(id) {
          // Core React vendor libraries - rarely change, cache well
          if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router-dom/') ||
              id.includes('node_modules/react-router/') ||
              id.includes('node_modules/@remix-run/')) {
            return 'react-vendor';
          }

          // React Query - API state management
          if (id.includes('node_modules/@tanstack/')) {
            return 'query-vendor';
          }

          // Animation libraries - Framer Motion is ~100KB
          if (id.includes('node_modules/framer-motion/')) {
            return 'animation-vendor';
          }

          // UI component libraries
          if (id.includes('node_modules/@radix-ui/') ||
              id.includes('node_modules/@headlessui/')) {
            return 'ui-vendor';
          }

          // Icons - Lucide icons can be large
          if (id.includes('node_modules/lucide-react/')) {
            return 'icons-vendor';
          }

          // Internationalization
          if (id.includes('node_modules/i18next/') ||
              id.includes('node_modules/react-i18next/')) {
            return 'i18n-vendor';
          }

          // Heavy libraries - load only when needed
          // face-api.js is ~1.5MB minified - MUST be lazy loaded
          if (id.includes('node_modules/face-api.js/') ||
              id.includes('node_modules/@vladmandic/face-api/') ||
              id.includes('node_modules/@tensorflow/')) {
            return 'face-detection';
          }

          // Chart libraries - only needed for analytics pages
          if (id.includes('node_modules/recharts/') ||
              id.includes('node_modules/chart.js/') ||
              id.includes('node_modules/d3/') ||
              id.includes('node_modules/d3-')) {
            return 'charts-vendor';
          }

          // Rich text editors - only for invitation/comment editing
          if (id.includes('node_modules/tiptap') ||
              id.includes('node_modules/@tiptap/') ||
              id.includes('node_modules/prosemirror') ||
              id.includes('node_modules/@prosemirror/')) {
            return 'editor-vendor';
          }

          // Date/time libraries
          if (id.includes('node_modules/date-fns/') ||
              id.includes('node_modules/dayjs/') ||
              id.includes('node_modules/moment/')) {
            return 'date-vendor';
          }

          // Form validation
          if (id.includes('node_modules/zod/') ||
              id.includes('node_modules/react-hook-form/')) {
            return 'form-vendor';
          }

          // Upload/file handling
          if (id.includes('node_modules/tus-js-client/') ||
              id.includes('node_modules/uppy/') ||
              id.includes('node_modules/@uppy/')) {
            return 'upload-vendor';
          }

          // PDF generation
          if (id.includes('node_modules/jspdf/') ||
              id.includes('node_modules/pdfmake/') ||
              id.includes('node_modules/html2canvas/')) {
            return 'pdf-vendor';
          }

          // Route-based code splitting for pages
          // Admin section pages - only loaded for admin users
          if (id.includes('/src/pages/admin/')) {
            return 'admin-pages';
          }

          // Workspace section pages - main authenticated area
          if (id.includes('/src/pages/workspace/')) {
            return 'workspace-pages';
          }

          // Settings pages
          if (id.includes('/src/pages/settings/')) {
            return 'settings-pages';
          }

          // Onboarding flow pages
          if (id.includes('/src/pages/onboarding/')) {
            return 'onboarding-pages';
          }

          // Public/marketing pages
          if (id.includes('/src/pages/public/')) {
            return 'public-pages';
          }

          // Feature-specific components that are heavy
          if (id.includes('/src/components/features/gallery/')) {
            return 'gallery-components';
          }

          if (id.includes('/src/components/features/upload/')) {
            return 'upload-components';
          }

          if (id.includes('/src/components/features/invitations/')) {
            return 'invitation-components';
          }

          // Landing page components
          if (id.includes('/src/components/landing/')) {
            return 'landing-components';
          }

          // Shared packages
          if (id.includes('packages/shared-')) {
            return 'shared-packages';
          }
        },
      },
    },
    // Increase chunk size warning limit slightly for vendor chunks
    chunkSizeWarningLimit: 600,
  },
  // Optimize dependencies that are pre-bundled
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      'framer-motion',
      'lucide-react',
    ],
    // Exclude heavy libraries that should be lazy loaded
    exclude: [
      'face-api.js',
    ],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
});
