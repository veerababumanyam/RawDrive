import type { SavedGalleryMeta } from "./types";
import { listSaved, removeGallery } from "./catalog";

// Default cap: lesser of 2GB or 50% of the device quota (resolved at runtime).
const DEFAULT_CAP_BYTES = 2 * 1024 * 1024 * 1024;

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  if (await (navigator.storage as StorageManager & { persisted?: () => Promise<boolean> }).persisted?.()) return true;
  return navigator.storage.persist();
}

export async function resolveCapBytes(): Promise<number> {
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    const { quota } = await navigator.storage.estimate();
    if (quota && quota > 0) return Math.min(DEFAULT_CAP_BYTES, Math.floor(quota * 0.5));
  }
  return DEFAULT_CAP_BYTES;
}

// Pure: pick least-recently-viewed WHOLE galleries to evict until total <= cap.
export function selectGalleriesToEvict(saved: SavedGalleryMeta[], capBytes: number): string[] {
  let total = saved.reduce((sum, m) => sum + m.approxBytes, 0);
  if (total <= capBytes) return [];
  const byOldest = [...saved].sort((a, b) => a.lastViewedAt - b.lastViewedAt);
  const evict: string[] = [];
  for (const m of byOldest) {
    if (total <= capBytes) break;
    evict.push(m.slug);
    total -= m.approxBytes;
  }
  return evict;
}

// Side-effecting: enforce the cap by deleting catalog entries + cache buckets.
export async function enforceQuota(deleteBucket: (galleryId: string) => Promise<void>): Promise<void> {
  const saved = await listSaved();
  const cap = await resolveCapBytes();
  for (const slug of selectGalleriesToEvict(saved, cap)) {
    const meta = saved.find((m) => m.slug === slug);
    if (meta) await deleteBucket(meta.galleryId);
    await removeGallery(slug);
  }
}
