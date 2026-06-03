import type { MediaEncryptionManifest } from "@/lib/media-encryption/asset-media";

export type SavedAsset = {
  id: string;
  filename: string;
  displayKey: string;                 // storage key of display_webp(.enc)
  thumbnailUrls: Record<string, string>;
  manifest: MediaEncryptionManifest | null; // null for non-encrypted
  width?: number;
  height?: number;
  blurhash?: string;
};

export type SavedGalleryMeta = {
  slug: string;                       // primary key
  galleryId: string;                  // Cache Storage bucket: rawdrive-offline-<galleryId>
  ws: string | null;                  // ?ws= workspace scope
  title: string;
  isEncrypted: boolean;
  keyId: string | null;               // media-key-store keyId, for decrypt-on-view
  assets: SavedAsset[];
  gallerySettings: Record<string, unknown>;
  etag: string | null;
  expiresAt: string | null;
  lastViewedAt: number;               // epoch ms
  lastValidatedAt: number;            // epoch ms
  approxBytes: number;
};
