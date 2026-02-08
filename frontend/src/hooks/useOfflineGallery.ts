import { useState, useEffect, useCallback, useMemo } from 'react';

/* =============================================================================
   Offline Gallery Hook

   Manages offline caching of galleries for PWA offline support.
   Uses IndexedDB for structured data and Cache API for assets.
   ============================================================================= */

/**
 * Cached gallery metadata
 */
export interface CachedGallery {
  id: string;
  slug: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  thumbnailUrl?: string;
  assetCount: number;
  cachedAt: number;
  lastAccessedAt: number;
  syncedAssets: number;
  totalSize: number;
  workspaceId?: string;
  workspaceName?: string;
}

/**
 * Cached asset metadata
 */
export interface CachedAsset {
  id: string;
  galleryId: string;
  thumbnailUrl: string;
  previewUrl?: string;
  originalUrl?: string;
  filename: string;
  mimeType: string;
  width?: number;
  height?: number;
  cachedAt: number;
  size: number;
}

/**
 * Cache sync status
 */
export interface CacheSyncStatus {
  galleryId: string;
  totalAssets: number;
  cachedAssets: number;
  pendingAssets: number;
  failedAssets: number;
  progress: number;
  status: 'idle' | 'syncing' | 'complete' | 'error';
  error?: string;
}

/**
 * UseOfflineGallery options
 */
export interface UseOfflineGalleryOptions {
  /**
   * Maximum number of galleries to cache
   * @default 10
   */
  maxCachedGalleries?: number;

  /**
   * Maximum cache size in bytes
   * @default 500 * 1024 * 1024 (500MB)
   */
  maxCacheSize?: number;

  /**
   * Cache expiration time in milliseconds
   * @default 7 * 24 * 60 * 60 * 1000 (7 days)
   */
  cacheExpiration?: number;

  /**
   * Auto-clean expired caches on mount
   * @default true
   */
  autoClean?: boolean;
}

/**
 * UseOfflineGallery return type
 */
export interface UseOfflineGalleryReturn {
  /**
   * List of cached galleries
   */
  cachedGalleries: CachedGallery[];

  /**
   * Current cache sync status for each gallery
   */
  syncStatus: Map<string, CacheSyncStatus>;

  /**
   * Total cache size in bytes
   */
  totalCacheSize: number;

  /**
   * Whether cache is available (browser supports required APIs)
   */
  isAvailable: boolean;

  /**
   * Whether currently syncing any gallery
   */
  isSyncing: boolean;

  /**
   * Whether a specific gallery is cached
   */
  isGalleryCached: (galleryId: string) => boolean;

  /**
   * Get cached gallery data
   */
  getCachedGallery: (galleryId: string) => CachedGallery | undefined;

  /**
   * Cache a gallery for offline use
   */
  cacheGallery: (gallery: {
    id: string;
    slug: string;
    name: string;
    description?: string;
    coverImageUrl?: string;
    assets: Array<{
      id: string;
      thumbnailUrl: string;
      previewUrl?: string;
      filename: string;
      mimeType: string;
      width?: number;
      height?: number;
    }>;
  }) => Promise<void>;

  /**
   * Remove a gallery from cache
   */
  removeCachedGallery: (galleryId: string) => Promise<void>;

  /**
   * Clear all cached galleries
   */
  clearAllCaches: () => Promise<void>;

  /**
   * Get cached assets for a gallery
   */
  getCachedAssets: (galleryId: string) => Promise<CachedAsset[]>;

  /**
   * Check if an asset URL is cached
   */
  isAssetCached: (url: string) => Promise<boolean>;

  /**
   * Update gallery access time (for LRU cleanup)
   */
  touchGallery: (galleryId: string) => Promise<void>;

  /**
   * Manually trigger cache cleanup
   */
  cleanup: () => Promise<void>;
}

// IndexedDB database name and version
const DB_NAME = 'rawdrive_offline';
const DB_VERSION = 1;
const GALLERY_STORE = 'galleries';
const ASSET_STORE = 'assets';

// Cache name for service worker
const CACHE_NAME = 'rawdrive-offline-galleries';

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<UseOfflineGalleryOptions> = {
  maxCachedGalleries: 10,
  maxCacheSize: 500 * 1024 * 1024, // 500MB
  cacheExpiration: 7 * 24 * 60 * 60 * 1000, // 7 days
  autoClean: true,
};

/**
 * Open IndexedDB database
 */
async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create galleries store
      if (!db.objectStoreNames.contains(GALLERY_STORE)) {
        const galleryStore = db.createObjectStore(GALLERY_STORE, { keyPath: 'id' });
        galleryStore.createIndex('slug', 'slug', { unique: true });
        galleryStore.createIndex('cachedAt', 'cachedAt', { unique: false });
        galleryStore.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
      }

      // Create assets store
      if (!db.objectStoreNames.contains(ASSET_STORE)) {
        const assetStore = db.createObjectStore(ASSET_STORE, { keyPath: 'id' });
        assetStore.createIndex('galleryId', 'galleryId', { unique: false });
        assetStore.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
    };
  });
}

/**
 * Get all records from a store
 */
async function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Get record by key
 */
async function getByKey<T>(db: IDBDatabase, storeName: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Put record into store
 */
async function putInStore<T>(db: IDBDatabase, storeName: string, data: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(data);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Delete record from store
 */
async function deleteFromStore(db: IDBDatabase, storeName: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Get records by index
 */
async function getByIndex<T>(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  value: IDBValidKey
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Delete records by index
 */
async function deleteByIndex(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  value: IDBValidKey
): Promise<void> {
  const records = await getByIndex<{ id: string }>(db, storeName, indexName, value);
  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);

  for (const record of records) {
    store.delete(record.id);
  }

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Offline Gallery Hook
 */
export function useOfflineGallery(options: UseOfflineGalleryOptions = {}): UseOfflineGalleryReturn {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  // State
  const [cachedGalleries, setCachedGalleries] = useState<CachedGallery[]>([]);
  const [syncStatus, setSyncStatus] = useState<Map<string, CacheSyncStatus>>(new Map());
  const [totalCacheSize, setTotalCacheSize] = useState(0);
  const [isAvailable, setIsAvailable] = useState(false);
  const [db, setDb] = useState<IDBDatabase | null>(null);

  // Check if required APIs are available
  useEffect(() => {
    const available = 'indexedDB' in window && 'caches' in window;
    setIsAvailable(available);

    if (available) {
      openDatabase()
        .then((database) => {
          setDb(database);
        })
        .catch((error) => {
          console.error('[OfflineGallery] Failed to open database:', error);
          setIsAvailable(false);
        });
    }
  }, []);

  // Load cached galleries on mount
  useEffect(() => {
    if (!db) return;

    getAllFromStore<CachedGallery>(db, GALLERY_STORE)
      .then((galleries) => {
        setCachedGalleries(galleries);
        setTotalCacheSize(galleries.reduce((sum, g) => sum + g.totalSize, 0));
      })
      .catch((error) => {
        console.error('[OfflineGallery] Failed to load cached galleries:', error);
      });
  }, [db]);

  // Auto-clean expired caches
  useEffect(() => {
    if (!mergedOptions.autoClean || !db) return;

    const cleanupExpired = async () => {
      const now = Date.now();
      const galleries = await getAllFromStore<CachedGallery>(db, GALLERY_STORE);
      const expired = galleries.filter(g => now - g.cachedAt > mergedOptions.cacheExpiration);

      for (const gallery of expired) {
        await removeCachedGalleryInternal(gallery.id);
      }
    };

    cleanupExpired();
  }, [db, mergedOptions.autoClean, mergedOptions.cacheExpiration]);

  // Check if currently syncing
  const isSyncing = useMemo(() => {
    return Array.from(syncStatus.values()).some(s => s.status === 'syncing');
  }, [syncStatus]);

  // Check if a gallery is cached
  const isGalleryCached = useCallback((galleryId: string) => {
    return cachedGalleries.some(g => g.id === galleryId);
  }, [cachedGalleries]);

  // Get cached gallery
  const getCachedGallery = useCallback((galleryId: string) => {
    return cachedGalleries.find(g => g.id === galleryId);
  }, [cachedGalleries]);

  // Internal remove gallery function
  const removeCachedGalleryInternal = async (galleryId: string) => {
    if (!db) return;

    try {
      // Delete gallery metadata
      await deleteFromStore(db, GALLERY_STORE, galleryId);

      // Delete associated assets
      await deleteByIndex(db, ASSET_STORE, 'galleryId', galleryId);

      // Delete cached asset URLs from Cache API
      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      for (const request of keys) {
        if (request.url.includes(galleryId)) {
          await cache.delete(request);
        }
      }

      // Update state
      setCachedGalleries(prev => prev.filter(g => g.id !== galleryId));
      setSyncStatus(prev => {
        const next = new Map(prev);
        next.delete(galleryId);
        return next;
      });
    } catch (error) {
      console.error('[OfflineGallery] Failed to remove gallery:', error);
    }
  };

  // Cache a gallery
  const cacheGallery = useCallback(async (gallery: {
    id: string;
    slug: string;
    name: string;
    description?: string;
    coverImageUrl?: string;
    assets: Array<{
      id: string;
      thumbnailUrl: string;
      previewUrl?: string;
      filename: string;
      mimeType: string;
      width?: number;
      height?: number;
    }>;
  }) => {
    if (!db || !isAvailable) {
      throw new Error('Offline caching not available');
    }

    const { id, slug, name, description, coverImageUrl, assets } = gallery;

    // Initialize sync status
    setSyncStatus(prev => {
      const next = new Map(prev);
      next.set(id, {
        galleryId: id,
        totalAssets: assets.length,
        cachedAssets: 0,
        pendingAssets: assets.length,
        failedAssets: 0,
        progress: 0,
        status: 'syncing',
      });
      return next;
    });

    try {
      // Check cache limits
      const galleries = await getAllFromStore<CachedGallery>(db, GALLERY_STORE);
      if (galleries.length >= mergedOptions.maxCachedGalleries) {
        // Remove least recently accessed gallery
        const sortedByAccess = [...galleries].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
        await removeCachedGalleryInternal(sortedByAccess[0].id);
      }

      // Open cache
      const cache = await caches.open(CACHE_NAME);

      // Cache cover image
      let cachedCoverUrl: string | undefined;
      if (coverImageUrl) {
        try {
          const response = await fetch(coverImageUrl);
          if (response.ok) {
            await cache.put(coverImageUrl, response.clone());
            cachedCoverUrl = coverImageUrl;
          }
        } catch {
          // Cover image caching is optional
        }
      }

      // Cache assets
      let cachedCount = 0;
      let failedCount = 0;
      let totalSize = 0;

      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];

        try {
          // Cache thumbnail
          const thumbResponse = await fetch(asset.thumbnailUrl);
          if (thumbResponse.ok) {
            const blob = await thumbResponse.blob();
            totalSize += blob.size;
            await cache.put(asset.thumbnailUrl, new Response(blob));

            // Store asset metadata
            const cachedAsset: CachedAsset = {
              id: asset.id,
              galleryId: id,
              thumbnailUrl: asset.thumbnailUrl,
              previewUrl: asset.previewUrl,
              filename: asset.filename,
              mimeType: asset.mimeType,
              width: asset.width,
              height: asset.height,
              cachedAt: Date.now(),
              size: blob.size,
            };

            await putInStore(db, ASSET_STORE, cachedAsset);
            cachedCount++;
          } else {
            failedCount++;
          }
        } catch {
          failedCount++;
        }

        // Update sync status
        setSyncStatus(prev => {
          const next = new Map(prev);
          next.set(id, {
            galleryId: id,
            totalAssets: assets.length,
            cachedAssets: cachedCount,
            pendingAssets: assets.length - i - 1,
            failedAssets: failedCount,
            progress: (i + 1) / assets.length,
            status: 'syncing',
          });
          return next;
        });

        // Check size limit
        if (totalSize > mergedOptions.maxCacheSize) {
          throw new Error('Cache size limit exceeded');
        }
      }

      // Store gallery metadata
      const cachedGallery: CachedGallery = {
        id,
        slug,
        name,
        description,
        coverImageUrl: cachedCoverUrl,
        thumbnailUrl: assets[0]?.thumbnailUrl,
        assetCount: assets.length,
        cachedAt: Date.now(),
        lastAccessedAt: Date.now(),
        syncedAssets: cachedCount,
        totalSize,
      };

      await putInStore(db, GALLERY_STORE, cachedGallery);

      // Update state
      setCachedGalleries(prev => [...prev.filter(g => g.id !== id), cachedGallery]);
      setTotalCacheSize(prev => prev + totalSize);

      setSyncStatus(prev => {
        const next = new Map(prev);
        next.set(id, {
          galleryId: id,
          totalAssets: assets.length,
          cachedAssets: cachedCount,
          pendingAssets: 0,
          failedAssets: failedCount,
          progress: 1,
          status: failedCount > 0 ? 'error' : 'complete',
          error: failedCount > 0 ? `Failed to cache ${failedCount} assets` : undefined,
        });
        return next;
      });

    } catch (error) {
      console.error('[OfflineGallery] Failed to cache gallery:', error);

      setSyncStatus(prev => {
        const next = new Map(prev);
        const current = next.get(id);
        next.set(id, {
          ...current!,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return next;
      });

      throw error;
    }
  }, [db, isAvailable, mergedOptions.maxCachedGalleries, mergedOptions.maxCacheSize]);

  // Remove cached gallery
  const removeCachedGallery = useCallback(async (galleryId: string) => {
    await removeCachedGalleryInternal(galleryId);
  }, [db]);

  // Clear all caches
  const clearAllCaches = useCallback(async () => {
    if (!db) return;

    try {
      // Clear IndexedDB stores
      const transaction = db.transaction([GALLERY_STORE, ASSET_STORE], 'readwrite');
      transaction.objectStore(GALLERY_STORE).clear();
      transaction.objectStore(ASSET_STORE).clear();

      // Clear Cache API
      await caches.delete(CACHE_NAME);

      // Reset state
      setCachedGalleries([]);
      setSyncStatus(new Map());
      setTotalCacheSize(0);

    } catch (error) {
      console.error('[OfflineGallery] Failed to clear caches:', error);
      throw error;
    }
  }, [db]);

  // Get cached assets for a gallery
  const getCachedAssets = useCallback(async (galleryId: string): Promise<CachedAsset[]> => {
    if (!db) return [];
    return getByIndex<CachedAsset>(db, ASSET_STORE, 'galleryId', galleryId);
  }, [db]);

  // Check if asset URL is cached
  const isAssetCached = useCallback(async (url: string): Promise<boolean> => {
    if (!isAvailable) return false;
    try {
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match(url);
      return response !== undefined;
    } catch {
      return false;
    }
  }, [isAvailable]);

  // Update gallery access time
  const touchGallery = useCallback(async (galleryId: string) => {
    if (!db) return;

    const gallery = await getByKey<CachedGallery>(db, GALLERY_STORE, galleryId);
    if (gallery) {
      gallery.lastAccessedAt = Date.now();
      await putInStore(db, GALLERY_STORE, gallery);
      setCachedGalleries(prev => prev.map(g => g.id === galleryId ? gallery : g));
    }
  }, [db]);

  // Manual cleanup
  const cleanup = useCallback(async () => {
    if (!db) return;

    const now = Date.now();
    const galleries = await getAllFromStore<CachedGallery>(db, GALLERY_STORE);

    // Remove expired galleries
    const expired = galleries.filter(g => now - g.cachedAt > mergedOptions.cacheExpiration);
    for (const gallery of expired) {
      await removeCachedGalleryInternal(gallery.id);
    }

    // If still over size limit, remove least recently accessed
    let currentSize = galleries
      .filter(g => !expired.find(e => e.id === g.id))
      .reduce((sum, g) => sum + g.totalSize, 0);

    if (currentSize > mergedOptions.maxCacheSize) {
      const remaining = galleries
        .filter(g => !expired.find(e => e.id === g.id))
        .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

      for (const gallery of remaining) {
        if (currentSize <= mergedOptions.maxCacheSize) break;
        await removeCachedGalleryInternal(gallery.id);
        currentSize -= gallery.totalSize;
      }
    }
  }, [db, mergedOptions.cacheExpiration, mergedOptions.maxCacheSize]);

  return {
    cachedGalleries,
    syncStatus,
    totalCacheSize,
    isAvailable,
    isSyncing,
    isGalleryCached,
    getCachedGallery,
    cacheGallery,
    removeCachedGallery,
    clearAllCaches,
    getCachedAssets,
    isAssetCached,
    touchGallery,
    cleanup,
  };
}

export default useOfflineGallery;
