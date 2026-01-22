/**
 * Asset Picker Modal - Select cover photo from gallery
 *
 * Features:
 * - Grid display (4 columns desktop, 2 tablet, 1 mobile)
 * - Infinite scroll with Intersection Observer
 * - Thumbnail lazy loading
 * - Selected asset highlight (blue border, checkmark)
 * - Empty state handling
 * - Loading skeletons
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { galleryDesignService } from '../../../../services/galleryDesignService';
import { AppButton } from '../../../ui/AppButton';
import { X, Check } from 'lucide-react';

interface Asset {
  asset_id: string;
  gallery_asset_id: string;
  visible: boolean;
  asset: {
    filename: string;
    type: string;
    width?: number;
    height?: number;
    thumbnail_url?: string;
    preview_url?: string;
    date_taken?: string;
  };
}

interface AssetPickerModalProps {
  galleryId: string;
  onSelect: (asset: Asset) => void;
  onClose: () => void;
  selectedAssetId?: string;
}

const AssetThumbnail: React.FC<{
  asset: Asset;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ asset, isSelected, onSelect }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const thumbnailUrl = asset.asset.preview_url || asset.asset.thumbnail_url;

  return (
    <button
      onClick={onSelect}
      className={`relative group overflow-hidden rounded-lg transition-all ${
        isSelected
          ? 'ring-2 ring-accent-primary shadow-lg'
          : 'hover:shadow-md border border-border-default'
      }`}
      title={asset.asset.filename}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square bg-bg-secondary overflow-hidden">
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gradient-to-r from-bg-secondary to-bg-tertiary animate-pulse" />
        )}

        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={asset.asset.filename}
            className="w-full h-full object-cover"
            onLoad={() => setImageLoaded(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-tertiary text-2xl">
            📷
          </div>
        )}

        {/* Overlay on hover */}
        {!isSelected && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-10 h-10 rounded-full border-2 border-white" />
          </div>
        )}

        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute inset-0 bg-accent-primary/20" />
        )}
      </div>

      {/* Checkmark for selected */}
      {isSelected && (
        <div className="absolute top-2 right-2 bg-accent-primary rounded-full p-1 shadow-lg">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}

      {/* Filename on hover */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 translate-y-full group-hover:translate-y-0 transition-transform">
        <p className="text-xs text-white truncate">{asset.asset.filename}</p>
      </div>
    </button>
  );
};

export const AssetPickerModal: React.FC<AssetPickerModalProps> = ({
  galleryId,
  onSelect,
  onClose,
  selectedAssetId,
}) => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const observerTarget = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  // Load assets
  const loadAssets = useCallback(
    async (pageNum: number) => {
      if (loadingRef.current) return;
      loadingRef.current = true;

      try {
        const response = await galleryDesignService.getGalleryAssets(
          galleryId,
          pageNum,
          24
        );

        if (pageNum === 1) {
          setAssets(response.data);
        } else {
          setAssets((prev) => [...prev, ...response.data]);
        }

        setHasMore(response.data.length === 24);
        setLoading(false);
      } catch (error) {
        console.error('Failed to load assets:', error);
        setLoading(false);
      } finally {
        loadingRef.current = false;
      }
    },
    [galleryId]
  );

  // Initial load
  useEffect(() => {
    loadAssets(1);
  }, [loadAssets]);

  // Infinite scroll observer
  useEffect(() => {
    if (!observerTarget.current || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
          const nextPage = page + 1;
          setPage(nextPage);
          loadAssets(nextPage);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(observerTarget.current);

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [hasMore, loading, page, loadAssets]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-default">
          <h2 className="text-xl font-semibold text-text-primary">
            Select Cover Photo
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-bg-secondary rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6 text-text-secondary" />
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {assets.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-5xl mb-4">📷</div>
              <p className="text-text-secondary">
                No photos in this gallery yet
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {assets.map((asset) => (
                <AssetThumbnail
                  key={asset.asset_id}
                  asset={asset}
                  isSelected={selectedAssetId === asset.asset_id}
                  onSelect={() => onSelect(asset)}
                />
              ))}

              {/* Loading skeletons */}
              {loading && assets.length === 0 && (
                <>
                  {[...Array(8)].map((_, i) => (
                    <div
                      key={`skeleton-${i}`}
                      className="aspect-square bg-gradient-to-r from-bg-secondary to-bg-tertiary rounded-lg animate-pulse"
                    />
                  ))}
                </>
              )}
            </div>
          )}

          {/* Intersection observer target for infinite scroll */}
          {hasMore && assets.length > 0 && (
            <div ref={observerTarget} className="h-8 mt-8 flex justify-center">
              {loading && (
                <div className="text-text-tertiary text-sm">Loading...</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border-default bg-bg-secondary">
          <AppButton variant="secondary" onClick={onClose}>
            Cancel
          </AppButton>
          <p className="text-xs text-text-tertiary ml-auto">
            {assets.length} photos loaded
          </p>
        </div>
      </div>
    </div>
  );
};

export default AssetPickerModal;
