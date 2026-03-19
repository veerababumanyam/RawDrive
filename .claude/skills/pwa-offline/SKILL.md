---
name: pwa-offline
description: "Progressive Web App and offline capability patterns for RawDrive: service worker setup, offline-first architecture, background sync, cache strategies, install prompts, push notifications via PWA, and app manifest configuration. Use this skill when implementing PWA features, configuring service workers, building offline-capable galleries, implementing background sync for uploads, managing cache strategies, or configuring the web app manifest. Also use for workbox configuration, asset precaching, runtime caching, and offline fallback pages. Triggers on: PWA, service worker, offline, cache strategy, background sync, web app manifest, workbox, install prompt, precache, offline-first, progressive web app, cache API, IndexedDB, offline gallery."
---

# PWA & Offline Patterns

RawDrive as a PWA enables photographers to work offline at venue shoots and clients to browse galleries without connectivity.

## PWA Setup (Vite + Workbox)

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'logo.svg'],
      manifest: {
        name: 'RawDrive — Photography Platform',
        short_name: 'RawDrive',
        description: 'Professional photography management',
        theme_color: '#1a1a2e',
        background_color: '#0f0f23',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          // API responses — Network First
          {
            urlPattern: /^https:\/\/api\.rawdrive\.in\/api\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 5,
            },
          },
          // Thumbnails — Cache First (immutable)
          {
            urlPattern: /\/thumbnails\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'thumbnail-cache',
              expiration: { maxEntries: 1000, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          // Full images — Stale While Revalidate
          {
            urlPattern: /\/images\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
});
```

## Cache Strategies

| Content Type | Strategy | Rationale |
|-------------|----------|-----------|
| App shell (HTML/CSS/JS) | Precache | Always available offline |
| API responses | Network First | Fresh data preferred, cached fallback |
| Thumbnails | Cache First | Immutable, save bandwidth |
| Full images | Stale While Revalidate | Show cached, update in background |
| User uploads | Cache then Upload | Offline-first for shoots |
| Fonts/icons | Cache First | Rarely change |

## Offline Gallery Viewing

```typescript
// Pin galleries for offline access
class OfflineGalleryManager {
  private db: IDBDatabase; // IndexedDB for structured data

  async pinGallery(galleryId: string): Promise<void> {
    // 1. Fetch gallery metadata + asset list
    const gallery = await api.get(`/galleries/${galleryId}`);
    const assets = await api.get(`/galleries/${galleryId}/assets`);

    // 2. Store metadata in IndexedDB
    await this.db.put('galleries', { ...gallery, pinnedAt: Date.now() });

    // 3. Cache thumbnails via Cache API
    const cache = await caches.open('offline-galleries');
    const thumbnailUrls = assets.map(a => a.thumbnail_url);
    await cache.addAll(thumbnailUrls);

    // 4. Track storage usage
    const estimate = await navigator.storage.estimate();
    if (estimate.usage! / estimate.quota! > 0.8) {
      // Warn user about storage limits
    }
  }

  async unpinGallery(galleryId: string): Promise<void> {
    // Remove from IndexedDB + clear cached assets
  }

  async getPinnedGalleries(): Promise<Gallery[]> {
    return this.db.getAll('galleries');
  }
}
```

## Background Sync for Uploads

```typescript
// Service worker: handle failed uploads when offline
self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === 'upload-photos') {
    event.waitUntil(retryPendingUploads());
  }
});

async function retryPendingUploads() {
  const pending = await getFromIndexedDB('pending-uploads');
  for (const upload of pending) {
    try {
      await fetch('/api/v1/upload', {
        method: 'POST',
        body: upload.formData,
      });
      await removeFromIndexedDB('pending-uploads', upload.id);
    } catch {
      // Still offline, will retry on next sync
      break;
    }
  }
}

// Register sync when upload fails due to offline
async function uploadPhoto(file: File, galleryId: string) {
  try {
    await api.upload(file, galleryId);
  } catch (error) {
    if (!navigator.onLine) {
      // Store in IndexedDB for background sync
      await saveToIndexedDB('pending-uploads', {
        id: crypto.randomUUID(),
        file,
        galleryId,
        queuedAt: Date.now(),
      });
      // Register background sync
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('upload-photos');
    }
  }
}
```

## Install Prompt

```typescript
// Custom install prompt with better UX than browser default
function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    });
    window.addEventListener('appinstalled', () => setIsInstalled(true));
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome; // 'accepted' or 'dismissed'
  };

  return { canInstall: !!deferredPrompt, isInstalled, install };
}
```

## Offline Status Indicator

```typescript
// Show connectivity status to user
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return { isOnline, pendingCount };
}

// OfflineBanner — shows at top when offline with pending upload count
// SyncIndicator — shows sync progress when reconnecting
```
