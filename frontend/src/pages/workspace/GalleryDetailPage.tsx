/**
 * GalleryDetailPage Component
 * Main gallery detail page with photo grid, upload, and management features
 * Redesigned with clean, professional layout
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useGallery } from '../../hooks/useGallery';
import { useGalleryAssets } from '../../hooks/useGalleryAssets';
import { useSocket } from '../../hooks/useSocket';
import {
  PhotoGrid,
  PhotoListView,
  GalleryUpload,
  GalleryHeader,
  GalleryToolbar,
  SubGalleryTabs,
  GalleryStats,
  GalleryActionBar,
  Lightbox,
  BulkActionBar,
  GallerySettingsPanel,
} from '../../components/features/gallery';
import { AppButton } from '../../components/ui/AppButton';
import { AppCard } from '../../components/ui/AppCard';
import { AppInput } from '../../components/ui/AppInput';
import Modal, { ModalBody, ModalFooter } from '../../components/ui/Modal';
import { DeleteConfirmationDialog } from '../../components/ui/DeleteConfirmationDialog';
import { useToast } from '../../components/ui/Toast';
import { useSearch } from '../../contexts/SearchContext';
import { galleryService } from '../../services/galleryService';
import type { GalleryAssetItem, ViewMode, FilterType } from '../../types/gallery';

const GalleryDetailPage: React.FC = () => {
  const { id: galleryId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { workspace } = useAuth();
  const { addToast } = useToast();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<{
    picks?: boolean;
    favorites?: boolean;
    selections?: boolean;
  }>({});
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [activeSubGalleryId, setActiveSubGalleryId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateSubGallery, setShowCreateSubGallery] = useState(false);
  const [newSubGalleryName, setNewSubGalleryName] = useState('');
  const [renameSubGallery, setRenameSubGallery] = useState<{ id: string; name: string } | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Register search handler
  const { registerHandler, unregisterHandler } = useSearch();
  React.useEffect(() => {
    registerHandler((query: string) => {
      setSearchQuery(query);
    });
    return () => unregisterHandler();
  }, [registerHandler, unregisterHandler]);

  // Check for action query param (e.g. ?action=upload)
  React.useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'upload') {
      setShowUpload(true);
      // Optional: Clear the param so it doesn't reopen on refresh?
      // But keeping it state-driven is often simpler. 
      // We can leave it for now, or user can click cancel to close.
    }
  }, [searchParams]);

  // Fetch gallery details
  const {
    gallery,
    loading: galleryLoading,
    error: galleryError,
    refetch: refetchGallery,
  } = useGallery({
    workspaceId: workspace?.workspace_id || '',
    galleryId: galleryId || '',
    autoFetch: !!galleryId && !!workspace?.workspace_id,
  });

  // Fetch gallery assets
  const {
    assets,
    meta,
    loading: assetsLoading,
    error: assetsError,
    refetch: refetchAssets,
    loadMore,
    hasMore,
  } = useGalleryAssets({
    workspaceId: workspace?.workspace_id || '',
    galleryId: galleryId || '',
    subGalleryId: activeSubGalleryId,
    picksOnly: activeFilters.picks || false,
    favoritesOnly: activeFilters.favorites || false,
    selectionsOnly: activeFilters.selections || false,
    searchQuery: searchQuery,
    autoFetch: !!galleryId && !!workspace?.workspace_id,
  });

  // Compute filtered stats from currently loaded assets (sub-gallery-specific)
  // This provides accurate counts for the currently selected tab
  const filteredStats = useMemo(() => {
    // Use meta.total for accurate total count (includes pagination)
    const totalItems = meta?.total ?? assets.length;
    // Count favorites from loaded assets
    const favoritesCount = assets.filter((a) => a.is_favorited).length;
    // Count selections from loaded assets
    const selectionsCount = assets.filter((a) => a.is_selected).length;

    return {
      totalItems,
      favoritesCount,
      selectionsCount,
    };
  }, [assets, meta?.total]);

  // WebSocket for real-time updates
  useSocket({
    autoConnect: !!workspace?.workspace_id,
    onEvent: (event) => {
      // Handle asset events for current gallery
      if (
        event.gallery_id === galleryId &&
        (event.type === 'asset:created' || event.type === 'asset:processed')
      ) {
        // Refetch assets to show new thumbnail
        refetchAssets();
      }
    },
  });

  // Handle asset selection
  const handleAssetSelect = useCallback((assetId: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }, []);

  // Handle asset click (open lightbox)
  const handleAssetClick = useCallback((_asset: GalleryAssetItem, index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  // Handle lightbox navigation
  const handleLightboxNavigate = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  // Handle lightbox close
  const handleLightboxClose = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  // Handle favorite toggle
  // Handle asset favorite toggle
  const handleAssetFavorite = useCallback(
    async (assetId: string, favorited: boolean) => {
      if (!workspace?.workspace_id || !galleryId) return;
      try {
        await galleryService.toggleFavorite(workspace.workspace_id, galleryId, [assetId], favorited);
        await refetchAssets();
        addToast({
          message: favorited ? 'Photo favorited' : 'Photo unfavorited',
          variant: 'success',
        });
      } catch (error) {
        addToast({ message: 'Failed to update favorite', variant: 'error' });
      }
    },
    [workspace?.workspace_id, galleryId, refetchAssets, addToast]
  );

  // Handle asset selection toggle (for picks)
  const handleAssetSelection = useCallback(
    async (assetId: string, selected: boolean) => {
      if (!workspace?.workspace_id || !galleryId) return;
      try {
        await galleryService.toggleSelection(workspace.workspace_id, galleryId, [assetId], selected);
        await refetchAssets();
        addToast({
          message: selected ? 'Photo selected' : 'Photo deselected',
          variant: 'success',
        });
      } catch (error) {
        addToast({ message: 'Failed to update selection', variant: 'error' });
      }
    },
    [workspace?.workspace_id, galleryId, refetchAssets, addToast]
  );

  // Handle single asset deletion
  const handleDeleteAsset = useCallback(
    async (assetId: string) => {
      if (!workspace?.workspace_id || !galleryId) return;

      // Use window.confirm for now as a simple safeguard
      if (!window.confirm('Are you sure you want to delete this photo?')) return;

      try {
        await galleryService.deleteAssets(workspace.workspace_id, galleryId, [assetId]);
        addToast({
          message: 'Photo deleted',
          variant: 'success',
          duration: 8000, // 8 seconds for undo
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                await galleryService.restoreAssets(workspace.workspace_id, galleryId, [assetId]);
                await refetchAssets();
                addToast({ message: 'Photo restored', variant: 'success' });
              } catch (error) {
                addToast({ message: 'Failed to restore photo', variant: 'error' });
              }
            },
          },
        });
        await refetchAssets();
      } catch (error) {
        addToast({ message: 'Failed to delete photo', variant: 'error' });
      }
    },
    [workspace?.workspace_id, galleryId, refetchAssets, addToast]
  );

  // Handle download
  const handleAssetDownload = useCallback(async (assetId: string) => {
    try {
      if (!workspace?.workspace_id || !galleryId) return;

      const asset = assets.find(a => a.asset_id === assetId);
      if (!asset) return;

      // Import file utilities
      const { isRawAsset, getRawDownloadVariant } = await import('../../utils/fileUtils');

      // Determine download variant based on file type and policy
      let variant: 'original' | 'preview' | null = null;
      const downloadPolicy = gallery?.download_policy || 'view_only';

      if (isRawAsset(asset.asset.filename, asset.asset.mime_type)) {
        // RAW files: use special handling
        variant = getRawDownloadVariant(downloadPolicy);
        if (!variant) {
          addToast({ message: 'Downloads not allowed for this gallery', variant: 'error' });
          return;
        }
        // Note: For RAW files with web_only/watermarked_only policy,
        // backend should convert RAW to JPEG on-the-fly when variant='preview'
      } else {
        // Regular images/videos: standard handling
        variant = downloadPolicy === 'original_allowed' ? 'original' : 'preview';
        if (downloadPolicy === 'view_only') {
          addToast({ message: 'Downloads not allowed for this gallery', variant: 'error' });
          return;
        }
      }

      const signedUrl = await galleryService.getSignedUrl(workspace.workspace_id, assetId, variant, true);

      // Determine filename - for RAW files downloaded as JPEG, change extension
      let filename = asset.asset.filename || 'download';
      if (isRawAsset(asset.asset.filename, asset.asset.mime_type) && variant === 'preview') {
        // Change extension to .jpg for converted RAW files
        const baseName = filename.replace(/\.[^.]+$/, '');
        filename = `${baseName}.jpg`;
      }

      // Trigger download
      const link = document.createElement('a');
      link.href = signedUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      addToast({ message: 'Download started', variant: 'success' });
    } catch (error) {
      console.error('Download error:', error);
      addToast({ message: 'Failed to download', variant: 'error' });
    }
  }, [workspace?.workspace_id, galleryId, gallery?.download_policy, assets]);

  // Handle upload complete
  const handleUploadComplete = useCallback(
    async (_assetId: string) => {
      addToast({ message: 'Photo uploaded successfully', variant: 'success' });
      await refetchAssets();
      await refetchGallery();
      setShowUpload(false);
    },
    [refetchAssets, refetchGallery, addToast]
  );

  // Handle upload error
  const handleUploadError = useCallback((error: Error) => {
    addToast({ message: error.message || 'Upload failed', variant: 'error' });
  }, [addToast]);

  // Handle sub-gallery change
  const handleSubGalleryChange = useCallback((subGalleryId: string | null) => {
    setActiveSubGalleryId(subGalleryId);
    setSelectedAssetIds(new Set()); // Clear selection when switching tabs
  }, []);

  // Handle create sub-gallery
  const handleCreateSubGallery = useCallback(async () => {
    if (!workspace?.workspace_id || !galleryId || !newSubGalleryName.trim()) return;

    try {
      await galleryService.createSubGallery(
        workspace.workspace_id,
        galleryId,
        { name: newSubGalleryName.trim() }
      );
      addToast({
        variant: 'success',
        title: 'Sub-gallery created',
        message: `"${newSubGalleryName.trim()}" has been created`,
      });
      setShowCreateSubGallery(false);
      setNewSubGalleryName('');
      await refetchGallery(); // Refresh gallery to show new sub-gallery
    } catch (error) {
      addToast({
        variant: 'error',
        title: 'Failed to create sub-gallery',
        message: error instanceof Error ? error.message : 'An error occurred',
      });
    }
  }, [workspace?.workspace_id, galleryId, newSubGalleryName, refetchGallery, addToast]);

  // Handle rename sub-gallery
  const handleRenameSubGallery = useCallback(async (subGalleryId: string, newName: string) => {
    if (!workspace?.workspace_id || !galleryId || !newName.trim()) return;

    try {
      await galleryService.updateSubGallery(workspace.workspace_id, galleryId, subGalleryId, {
        name: newName.trim(),
      });
      addToast({
        variant: 'success',
        title: 'Sub-gallery renamed',
        message: `Renamed to "${newName.trim()}"`,
      });
      setRenameSubGallery(null);
      await refetchGallery();
    } catch (error) {
      addToast({
        variant: 'error',
        title: 'Failed to rename sub-gallery',
        message: error instanceof Error ? error.message : 'An error occurred',
      });
    }
  }, [workspace?.workspace_id, galleryId, refetchGallery, addToast]);

  // Handle delete sub-gallery
  const handleDeleteSubGallery = useCallback(async (subGalleryId: string) => {
    if (!workspace?.workspace_id || !galleryId) return;

    const subGallery = gallery?.sub_galleries.find((sg) => sg.sub_gallery_id === subGalleryId);
    const subGalleryName = subGallery?.name || 'sub-gallery';

    try {
      await galleryService.deleteSubGallery(workspace.workspace_id, galleryId, subGalleryId);
      addToast({
        variant: 'success',
        title: 'Sub-gallery deleted',
        message: `"${subGalleryName}" has been deleted`,
      });
      // Switch to root gallery if deleted sub-gallery was active
      if (activeSubGalleryId === subGalleryId) {
        setActiveSubGalleryId(null);
      }
      await refetchGallery();
    } catch (error) {
      addToast({
        variant: 'error',
        title: 'Failed to delete sub-gallery',
        message: error instanceof Error ? error.message : 'An error occurred',
      });
    }
  }, [workspace?.workspace_id, galleryId, gallery?.sub_galleries, activeSubGalleryId, refetchGallery, addToast]);

  // Handle gallery delete
  const handleDeleteGallery = useCallback(async () => {
    if (!workspace?.workspace_id || !galleryId) return;

    setIsDeleting(true);
    try {
      await galleryService.deleteGallery(workspace.workspace_id, galleryId);
      addToast({
        variant: 'success',
        message: `"${gallery?.title}" moved to Recycle Bin`,
        duration: 8000,
        action: {
          label: 'View Trash',
          onClick: () => navigate('/workspace/trash'),
        },
      });
      navigate('/workspace/galleries');
    } catch (error) {
      addToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete gallery',
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }, [workspace?.workspace_id, galleryId, gallery?.title, navigate, addToast]);

  // Handle toggle visibility
  const handleToggleVisibility = useCallback(async (subGalleryId: string, visible: boolean) => {
    if (!workspace?.workspace_id || !galleryId) return;

    try {
      await galleryService.updateSubGallery(workspace.workspace_id, galleryId, subGalleryId, {
        visible,
      });
      addToast({
        variant: 'success',
        title: visible ? 'Sub-gallery shown' : 'Sub-gallery hidden',
        message: `Sub-gallery is now ${visible ? 'visible' : 'hidden'}`,
      });
      await refetchGallery();
    } catch (error) {
      addToast({
        variant: 'error',
        title: 'Failed to update visibility',
        message: error instanceof Error ? error.message : 'An error occurred',
      });
    }
  }, [workspace?.workspace_id, galleryId, refetchGallery, addToast]);

  // Handle set gallery cover
  const handleSetGalleryCover = useCallback(async (assetId: string) => {
    if (!workspace?.workspace_id || !galleryId) return;

    try {
      if (activeSubGalleryId) {
        // Set sub-gallery cover
        await galleryService.updateSubGallery(
          workspace.workspace_id,
          galleryId,
          activeSubGalleryId,
          { cover_asset_id: assetId }
        );
        addToast({
          variant: 'success',
          title: 'Cover Updated',
          message: 'This photo has been set as the sub-gallery cover',
        });
      } else {
        // Set root gallery cover
        await galleryService.updateGallery(workspace.workspace_id, galleryId, {
          cover_asset_id: assetId
        });
        addToast({
          variant: 'success',
          title: 'Cover Updated',
          message: 'This photo has been set as the gallery cover',
        });
      }
      await refetchGallery();
    } catch (error) {
      addToast({
        variant: 'error',
        title: 'Failed to update cover',
        message: error instanceof Error ? error.message : 'An error occurred',
      });
    }
  }, [workspace?.workspace_id, galleryId, activeSubGalleryId, refetchGallery, addToast]);

  // Loading state - Enhanced with glass effect
  if (galleryLoading && !gallery) {
    return (
      <div className="card-glass rounded-2xl flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-accent opacity-30 blur-md animate-pulse"></div>
            <div className="relative animate-spin rounded-full h-12 w-12 border-2 border-transparent border-t-primary border-r-accent"></div>
          </div>
          <p className="text-text-secondary">Loading gallery...</p>
        </div>
      </div>
    );
  }

  // Error state - Enhanced with glass effect
  if (galleryError || !gallery) {
    return (
      <div className="card-glass rounded-2xl flex flex-col items-center justify-center min-h-[400px] gap-4 p-8">
        <p className="text-text-secondary">
          {galleryError?.message || 'Gallery not found'}
        </p>
        <AppButton variant="outline" shine onClick={() => navigate('/workspace/galleries')}>
          <ArrowLeft size={16} className="mr-2" />
          Back to Galleries
        </AppButton>
      </div>
    );
  }


  return (
    <div className="gallery-detail-page space-y-4 sm:space-y-5">
      {/* Header with Title and Meta */}
      <GalleryHeader
        gallery={gallery}
        onTitleUpdate={async (newTitle: string) => {
          if (!workspace?.workspace_id || !galleryId) return;
          await galleryService.updateGallery(workspace.workspace_id, galleryId, { title: newTitle });
          await refetchGallery();
          addToast({ message: 'Gallery title updated', variant: 'success' });
        }}
      />

      {/* Sub-Gallery Tabs */}
      <SubGalleryTabs
        subGalleries={gallery.sub_galleries}
        activeSubGalleryId={activeSubGalleryId}
        onTabSelect={handleSubGalleryChange}
        onCreateSubGallery={() => setShowCreateSubGallery(true)}
        onSortOrderChange={async (subGalleryIds) => {
          if (!workspace?.workspace_id || !galleryId) return;
          try {
            await galleryService.updateSubGalleriesSortOrder(
              workspace.workspace_id,
              galleryId,
              subGalleryIds
            );
            await refetchGallery();
            addToast({ message: 'Tab order updated', variant: 'success' });
          } catch (error) {
            addToast({ message: 'Failed to update tab order', variant: 'error' });
          }
        }}
        onRename={(subGalleryId, currentName) => {
          setRenameSubGallery({ id: subGalleryId, name: currentName });
        }}
        onDelete={handleDeleteSubGallery}
        onToggleVisibility={handleToggleVisibility}
        droppable={true}
        sortable={true}
      />

      {/* Unified Action Bar - Color-coded buttons */}
      <GalleryActionBar
        isPublished={gallery.status === 'published'}
        hasPhotos={(gallery.stats?.total_items || 0) > 0}
        onViewAsClient={() => window.open(`/g/${gallery.gallery_id}`, '_blank')}
        onFindPeople={() => addToast({ message: 'Find People - Coming soon', variant: 'info' })}
        onAIStory={() => addToast({ message: 'AI Story - Coming soon', variant: 'info' })}
        onShare={() => addToast({ message: 'Share - Coming soon', variant: 'info' })}
        onSettings={() => setShowSettings(true)}
        onUpload={() => setShowUpload(!showUpload)}
        onDelete={() => setShowDeleteDialog(true)}
        onPublishToggle={async () => {
          if (!workspace?.workspace_id || !galleryId) return;
          try {
            if (gallery.status === 'published') {
              await galleryService.unpublishGallery(workspace.workspace_id, galleryId);
              addToast({ message: 'Gallery unpublished', variant: 'success' });
            } else {
              await galleryService.publishGallery(workspace.workspace_id, galleryId);
              addToast({ message: 'Gallery published', variant: 'success' });
            }
            await refetchGallery();
          } catch (error) {
            addToast({ message: 'Failed to update gallery status', variant: 'error' });
          }
        }}
        uploadOpen={showUpload}
      />

      {/* Stats and Toolbar Row */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Stats - Left */}
        <GalleryStats gallery={gallery} filteredStats={filteredStats} />

        {/* Toolbar - Right (on desktop) */}
        <GalleryToolbar
          viewMode={viewMode}
          filter={filter}
          searchQuery={searchQuery}
          selectedCount={selectedAssetIds.size}
          onViewModeChange={setViewMode}
          onFilterChange={setFilter}
          onSearchChange={setSearchQuery}
          activeFilters={activeFilters}
          onFiltersChange={setActiveFilters}
          selectAll={selectedAssetIds.size === assets.length && assets.length > 0}
          onSelectAllChange={(selected) => {
            if (selected) {
              setSelectedAssetIds(new Set(assets.map((a) => a.asset_id)));
            } else {
              setSelectedAssetIds(new Set());
            }
          }}
          className="lg:flex-1 lg:max-w-3xl"
        />
      </div>

      {/* Upload Section - Collapsible */}
      {showUpload && (
        <AppCard padding="md" variant="glass" className="border border-border/50 animate-in slide-in-from-top-2 duration-300">
          <GalleryUpload
            galleryId={gallery.gallery_id}
            subGalleryId={activeSubGalleryId}
            onUploadComplete={handleUploadComplete}
            onUploadError={handleUploadError}
          />
        </AppCard>
      )}

      {/* Bulk Action Bar - Shows when items selected */}
      {selectedAssetIds.size > 0 && (
        <BulkActionBar
          selectedAssetIds={selectedAssetIds}
          assets={assets}
          onClearSelection={() => setSelectedAssetIds(new Set())}
          subGalleries={gallery?.sub_galleries || []}
          onBulkMove={async (assetIds, subGalleryId) => {
            if (!workspace?.workspace_id || !galleryId) return;
            try {
              await galleryService.moveAssets(workspace.workspace_id, galleryId, assetIds, subGalleryId);
              setSelectedAssetIds(new Set());
              await refetchAssets();
              addToast({
                message: `Moved ${assetIds.length} ${assetIds.length === 1 ? 'photo' : 'photos'} successfully`,
                variant: 'success',
              });
            } catch (error) {
              addToast({ message: 'Failed to move photos', variant: 'error' });
            }
          }}
          onBulkDelete={async (assetIds) => {
            if (!workspace?.workspace_id || !galleryId) return;
            try {
              await galleryService.deleteAssets(workspace.workspace_id, galleryId, assetIds);
              setSelectedAssetIds(new Set());

              addToast({
                message: `Deleted ${assetIds.length} ${assetIds.length === 1 ? 'photo' : 'photos'}`,
                variant: 'success',
                duration: 8000,
                action: {
                  label: 'Undo',
                  onClick: async () => {
                    try {
                      await galleryService.restoreAssets(workspace.workspace_id, galleryId, assetIds);
                      await refetchAssets();
                      addToast({ message: 'Photos restored', variant: 'success' });
                    } catch (error) {
                      addToast({ message: 'Failed to restore photos', variant: 'error' });
                    }
                  },
                },
              });

              await refetchAssets();
            } catch (error) {
              addToast({ message: 'Failed to delete photos', variant: 'error' });
            }
          }}
          onBulkDownload={async (assetIds) => {
            addToast({ message: `Download ${assetIds.length} photos - Coming soon`, variant: 'info' });
          }}
        />
      )}

      {/* Photo Section with Section Headers */}
      <div className="space-y-6">

        {/* Photo Grid or List */}
        {assetsError ? (
          <AppCard padding="md" variant="glass" className="card-glass">
            <div className="text-center py-8">
              <p className="text-error mb-4">{assetsError.message}</p>
              <AppButton variant="outline" shine onClick={() => refetchAssets()}>
                Try Again
              </AppButton>
            </div>
          </AppCard>
        ) : viewMode === 'grid' ? (
          <PhotoGrid
            assets={assets}
            selectedAssetIds={selectedAssetIds}
            selectable={true}
            coverAssetId={
              activeSubGalleryId
                ? gallery?.sub_galleries.find((sg) => sg.sub_gallery_id === activeSubGalleryId)?.cover_asset_id
                : gallery?.cover_asset_id
            }
            onAssetSelect={handleAssetSelect}
            onAssetClick={handleAssetClick}
            onAssetFavorite={handleAssetFavorite}
            onAssetSelection={handleAssetSelection}
            onAssetDownload={handleAssetDownload}
            onAssetDelete={handleDeleteAsset}
            onSetCover={async (assetId) => {
              if (!workspace?.workspace_id || !galleryId) return;
              try {
                if (activeSubGalleryId) {
                  // Set sub-gallery cover
                  await galleryService.updateSubGallery(
                    workspace.workspace_id,
                    galleryId,
                    activeSubGalleryId,
                    { cover_asset_id: assetId }
                  );
                  addToast({
                    variant: 'success',
                    message: 'Sub-gallery cover updated',
                  });
                } else {
                  // Set gallery cover
                  await galleryService.updateGallery(workspace.workspace_id, galleryId, {
                    cover_asset_id: assetId
                  });
                  addToast({
                    variant: 'success',
                    message: 'Gallery cover updated',
                  });
                }
                await refetchGallery();
              } catch (error) {
                addToast({
                  variant: 'error',
                  message: 'Failed to update cover',
                });
              }
            }}
            onSortOrderChange={async (assetIds) => {
              if (!workspace?.workspace_id || !galleryId) return;
              try {
                await galleryService.updateSortOrder(workspace.workspace_id, galleryId, assetIds);
                await refetchAssets();
                addToast({ message: 'Photo order updated', variant: 'success' });
              } catch (error) {
                addToast({ message: 'Failed to update photo order', variant: 'error' });
              }
            }}
            onMoveToSubGallery={async (assetId, subGalleryId) => {
              if (!workspace?.workspace_id || !galleryId) return;
              try {
                await galleryService.moveAssets(workspace.workspace_id, galleryId, [assetId], subGalleryId);
                await refetchAssets();
                const subGalleryName = subGalleryId
                  ? gallery?.sub_galleries.find((sg) => sg.sub_gallery_id === subGalleryId)?.name || 'sub-gallery'
                  : 'Root Gallery';
                addToast({
                  message: `Photo moved to ${subGalleryName}`,
                  variant: 'success',
                });
              } catch (error) {
                addToast({ message: 'Failed to move photo', variant: 'error' });
              }
            }}
            sortable={true}
            isLoading={assetsLoading}
          />
        ) : (
          <PhotoListView
            assets={assets}
            selectedAssetIds={selectedAssetIds}
            onAssetSelect={handleAssetSelect}
            onAssetClick={handleAssetClick}
            onAssetFavorite={handleAssetFavorite}
            onAssetDownload={handleAssetDownload}
            onAssetDelete={handleDeleteAsset} // refreshed
            isLoading={assetsLoading}
          />
        )}

        {/* Load More - Enhanced with glass effect */}
        {hasMore && !assetsLoading && (
          <div className="flex justify-center">
            <AppButton variant="outline" shine onClick={loadMore} className="hover:-translate-y-0.5 transition-all">
              Load More
            </AppButton>
          </div>
        )}

        {/* Lightbox */}
        {lightboxOpen && assets[lightboxIndex] && (
          <Lightbox
            isOpen={lightboxOpen}
            onClose={handleLightboxClose}
            currentAsset={assets[lightboxIndex]}
            assets={assets}
            currentIndex={lightboxIndex}
            onNavigate={handleLightboxNavigate}
            onFavorite={handleAssetFavorite}
            onSelect={handleAssetSelect}
            onDownload={handleAssetDownload}
            onDelete={handleDeleteAsset}
            exifVisible={gallery.exif_visible}
            downloadPolicy={gallery.download_policy}
            galleryId={gallery.gallery_id}
            onSetCover={handleSetGalleryCover}
          />
        )}

        {/* Settings Panel */}
        <GallerySettingsPanel
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          gallery={gallery}
          onSave={async (updates: Parameters<typeof galleryService.updateGallery>[2]) => {
            if (!workspace?.workspace_id || !galleryId) return;
            await galleryService.updateGallery(workspace.workspace_id, galleryId, updates);
            await refetchGallery();
          }}
        />

        {/* Create Sub-Gallery Dialog */}
        <Modal
          isOpen={showCreateSubGallery}
          onClose={() => {
            setShowCreateSubGallery(false);
            setNewSubGalleryName('');
          }}
          title="Create New Sub-Gallery"
          size="sm"
        >
          <ModalBody padding="lg">
            <div className="space-y-4">
              <AppInput
                label="Sub-Gallery Name"
                value={newSubGalleryName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewSubGalleryName(e.target.value)}
                placeholder="e.g., Ceremony, Reception, Getting Ready"
                isRequired
                autoFocus
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter' && newSubGalleryName.trim()) {
                    handleCreateSubGallery();
                  }
                }}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <AppButton
              variant="outline"
              onClick={() => {
                setShowCreateSubGallery(false);
                setNewSubGalleryName('');
              }}
            >
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              onClick={handleCreateSubGallery}
              disabled={!newSubGalleryName.trim()}
            >
              Create
            </AppButton>
          </ModalFooter>
        </Modal>

        {/* Rename Sub-Gallery Dialog */}
        <Modal
          isOpen={!!renameSubGallery}
          onClose={() => setRenameSubGallery(null)}
          title="Rename Sub-Gallery"
          size="sm"
        >
          <ModalBody padding="lg">
            <div className="space-y-4">
              <AppInput
                label="Sub-Gallery Name"
                value={renameSubGallery?.name || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  if (renameSubGallery) {
                    setRenameSubGallery({ ...renameSubGallery, name: e.target.value });
                  }
                }}
                placeholder="e.g., Ceremony, Reception, Getting Ready"
                isRequired
                autoFocus
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter' && renameSubGallery?.name.trim() && renameSubGallery?.id) {
                    handleRenameSubGallery(renameSubGallery.id, renameSubGallery.name);
                  }
                }}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <AppButton
              variant="outline"
              onClick={() => setRenameSubGallery(null)}
            >
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              onClick={() => {
                if (renameSubGallery?.id && renameSubGallery?.name.trim()) {
                  handleRenameSubGallery(renameSubGallery.id, renameSubGallery.name);
                }
              }}
              disabled={!renameSubGallery?.name.trim()}
            >
              Save
            </AppButton>
          </ModalFooter>
        </Modal>

        {/* Delete Gallery Confirmation Dialog */}
        <DeleteConfirmationDialog
          isOpen={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          onConfirm={handleDeleteGallery}
          deleteType="soft"
          entityType="gallery"
          entityName={gallery.title}
          photoCount={gallery.stats.total_photos}
          retentionDays={30}
          isLoading={isDeleting}
        />
      </div>
      {/* End Photo Section */}
    </div>
  );
};

export default GalleryDetailPage;


