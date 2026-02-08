/**
 * CullingWorkflowPage Component
 * Bulk photo culling workflow with AI quality scoring
 *
 * Features:
 * - Grid view with quality score overlays
 * - Smart filtering (faces, sharpness, exposure)
 * - Bulk select/reject actions
 * - Auto-reject low quality photos
 * - Final gallery preview
 */

import React, { useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Scissors, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useGallery } from '../../hooks/useGallery';
import { useCullingWorkflow } from '../../hooks/useCullingWorkflow';
import {
  CullingGrid,
  CullingToolbar,
  CullingBulkActionBar,
  GalleryPreview,
} from '../../components/features/culling';
import { AppButton } from '../../components/ui/AppButton';
import { AppCard } from '../../components/ui/AppCard';
import { useToast } from '../../components/ui/Toast';
import { ConfirmDialog } from '../../components/ui/Modal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AutoRejectConfig = {
  maxSharpnessScore?: number;
  maxOverallScore?: number;
  rejectBlur?: boolean;
  excludeBokeh?: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CullingWorkflowPage: React.FC = () => {
  const { id: galleryId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const { addToast } = useToast();

  const workspaceId = workspace?.id || '';

  // Fetch gallery details
  const { gallery, isLoading: isGalleryLoading, error: galleryError } = useGallery(galleryId!);

  // Culling workflow state
  const {
    photos,
    stats,
    total,
    page,
    pageSize,
    selectedIds,
    filters,
    sortBy,
    sortOrder,
    viewMode,
    setViewMode,
    isLoading,
    isActionLoading,
    error,
    loadPhotos,
    setPage,
    setFilters,
    resetFilters,
    setSortBy,
    setSortOrder,
    toggleSelection,
    selectAll,
    deselectAll,
    selectByQuality,
    bulkSelect,
    bulkReject,
    bulkReset,
    autoReject,
    createSubGallery,
    markAsFavorites,
    previewPhotos,
  } = useCullingWorkflow({
    workspaceId,
    galleryId: galleryId!,
    initialPageSize: 50,
    autoLoadOnFilterChange: true,
  });

  // State for auto-reject confirmation
  const [showAutoRejectConfirm, setShowAutoRejectConfirm] = React.useState(false);
  const [autoRejectConfig, setAutoRejectConfig] = React.useState<AutoRejectConfig>({
    maxSharpnessScore: 50,
    maxOverallScore: 40,
    rejectBlur: true,
    excludeBokeh: true,
  });

  // Columns state
  const [columns, setColumns] = React.useState(4);

  // Handle auto-reject
  const handleAutoReject = useCallback(() => {
    setShowAutoRejectConfirm(true);
  }, []);

  const confirmAutoReject = useCallback(async () => {
    try {
      await autoReject({
        max_sharpness_score: autoRejectConfig.maxSharpnessScore,
        max_overall_score: autoRejectConfig.maxOverallScore,
        reject_blur: autoRejectConfig.rejectBlur,
        exclude_bokeh: autoRejectConfig.excludeBokeh,
      });
      setShowAutoRejectConfirm(false);
      addToast({
        type: 'success',
        title: 'Auto-reject complete',
        message: 'Low quality photos have been rejected',
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Auto-reject failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [autoReject, autoRejectConfig, addToast]);

  // Handle bulk select
  const handleBulkSelect = useCallback(async () => {
    try {
      await bulkSelect();
      addToast({
        type: 'success',
        title: 'Photos selected',
        message: `${selectedIds.size} photos marked as best shots`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Selection failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [bulkSelect, selectedIds.size, addToast]);

  // Handle bulk reject
  const handleBulkReject = useCallback(
    async (reason?: string) => {
      try {
        await bulkReject(reason);
        addToast({
          type: 'success',
          title: 'Photos rejected',
          message: `${selectedIds.size} photos have been rejected`,
        });
      } catch (err) {
        addToast({
          type: 'error',
          title: 'Rejection failed',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
    [bulkReject, selectedIds.size, addToast]
  );

  // Handle bulk reset
  const handleBulkReset = useCallback(async () => {
    try {
      await bulkReset();
      addToast({
        type: 'success',
        title: 'Status reset',
        message: `${selectedIds.size} photos reset to pending`,
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Reset failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [bulkReset, selectedIds.size, addToast]);

  // Handle create sub-gallery
  const handleCreateSubGallery = useCallback(
    async (name: string) => {
      try {
        const subGalleryId = await createSubGallery(name);
        if (subGalleryId) {
          addToast({
            type: 'success',
            title: 'Sub-gallery created',
            message: `"${name}" has been created with your selected photos`,
          });
          return subGalleryId;
        }
      } catch (err) {
        addToast({
          type: 'error',
          title: 'Creation failed',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
    [createSubGallery, addToast]
  );

  // Handle mark as favorites
  const handleMarkAsFavorites = useCallback(async () => {
    try {
      await markAsFavorites();
      addToast({
        type: 'success',
        title: 'Marked as favorites',
        message: 'Selected photos have been marked as favorites',
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [markAsFavorites, addToast]);

  // Preview selection handler
  const handlePreviewSelection = useCallback(() => {
    setViewMode('preview');
  }, [setViewMode]);

  // Error state
  if (galleryError || error) {
    return (
      <div className="p-6">
        <AppCard padding="lg" className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            Failed to load gallery
          </h2>
          <p className="text-sm text-text-secondary mb-4">
            {galleryError || error}
          </p>
          <AppButton variant="primary" onClick={() => loadPhotos()}>
            <RefreshCw size={16} className="mr-2" />
            Retry
          </AppButton>
        </AppCard>
      </div>
    );
  }

  // Loading state
  if (isGalleryLoading && !gallery) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-text-secondary">Loading gallery...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-surface border-b border-border">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left: Back + Title */}
            <div className="flex items-center gap-4">
              <AppButton
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/workspace/galleries/${galleryId}`)}
              >
                <ArrowLeft size={20} className="mr-2" />
                Back to Gallery
              </AppButton>

              <div className="border-l border-border pl-4">
                <h1 className="text-xl font-semibold text-text-primary flex items-center gap-2">
                  <Scissors size={24} />
                  Culling Workflow
                </h1>
                <p className="text-sm text-text-secondary">
                  {gallery?.name || 'Loading...'}
                </p>
              </div>
            </div>

            {/* Right: View Mode Toggle */}
            <div className="flex items-center gap-2">
              <div className="flex bg-surface-secondary rounded-lg p-1">
                <button
                  onClick={() => setViewMode('culling')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'culling'
                      ? 'bg-primary text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Culling
                </button>
                <button
                  onClick={() => setViewMode('preview')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'preview'
                      ? 'bg-primary text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Preview Selection
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {viewMode === 'culling' ? (
          <>
            {/* Toolbar */}
            <CullingToolbar
              filters={filters}
              sortBy={sortBy}
              sortOrder={sortOrder}
              stats={stats}
              onFiltersChange={setFilters}
              onResetFilters={resetFilters}
              onSortChange={setSortBy}
              onSortOrderChange={setSortOrder}
              onAutoReject={handleAutoReject}
              columns={columns}
              onColumnsChange={setColumns}
              isLoading={isLoading || isActionLoading}
              className="mb-6"
            />

            {/* Photo Grid */}
            <CullingGrid
              photos={photos}
              selectedIds={selectedIds}
              onToggleSelection={toggleSelection}
              columns={columns}
              isLoading={isLoading}
              showSelection={true}
              showQualityOverlay={true}
            />

            {/* Pagination */}
            {total > pageSize && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <AppButton
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </AppButton>
                <span className="text-sm text-text-secondary px-4">
                  Page {page} of {Math.ceil(total / pageSize)}
                </span>
                <AppButton
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(total / pageSize)}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </AppButton>
              </div>
            )}

            {/* Bulk Action Bar */}
            <CullingBulkActionBar
              selectedIds={selectedIds}
              photos={photos}
              onClearSelection={deselectAll}
              onSelectAll={selectAll}
              onSelectByQuality={selectByQuality}
              onBulkSelect={handleBulkSelect}
              onBulkReject={handleBulkReject}
              onBulkReset={handleBulkReset}
              onPreviewSelection={handlePreviewSelection}
              isLoading={isActionLoading}
            />
          </>
        ) : (
          /* Preview Mode */
          <GalleryPreview
            photos={previewPhotos}
            stats={stats}
            onBack={() => setViewMode('culling')}
            onCreateSubGallery={handleCreateSubGallery}
            onMarkAsFavorites={handleMarkAsFavorites}
            isLoading={isLoading || isActionLoading}
          />
        )}
      </div>

      {/* Auto-Reject Confirmation Dialog */}
      {showAutoRejectConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowAutoRejectConfirm(false)}
        >
          <AppCard
            padding="lg"
            className="max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">
                    Auto-Reject Low Quality Photos
                  </h3>
                  <p className="text-sm text-text-secondary">
                    Configure rejection criteria
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-text-primary">
                    Max Overall Score (reject below)
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={60}
                    step={5}
                    value={autoRejectConfig.maxOverallScore || 40}
                    onChange={(e) =>
                      setAutoRejectConfig({
                        ...autoRejectConfig,
                        maxOverallScore: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full mt-1"
                  />
                  <div className="text-xs text-text-tertiary text-right">
                    {autoRejectConfig.maxOverallScore}%
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-text-primary">
                    Max Sharpness Score (reject below)
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={70}
                    step={5}
                    value={autoRejectConfig.maxSharpnessScore || 50}
                    onChange={(e) =>
                      setAutoRejectConfig({
                        ...autoRejectConfig,
                        maxSharpnessScore: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full mt-1"
                  />
                  <div className="text-xs text-text-tertiary text-right">
                    {autoRejectConfig.maxSharpnessScore}%
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRejectConfig.rejectBlur}
                    onChange={(e) =>
                      setAutoRejectConfig({
                        ...autoRejectConfig,
                        rejectBlur: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded border-border text-primary"
                  />
                  <span className="text-sm text-text-primary">Reject blurry photos</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer ml-6">
                  <input
                    type="checkbox"
                    checked={autoRejectConfig.excludeBokeh}
                    onChange={(e) =>
                      setAutoRejectConfig({
                        ...autoRejectConfig,
                        excludeBokeh: e.target.checked,
                      })
                    }
                    disabled={!autoRejectConfig.rejectBlur}
                    className="w-4 h-4 rounded border-border text-primary disabled:opacity-50"
                  />
                  <span
                    className={`text-sm ${
                      autoRejectConfig.rejectBlur ? 'text-text-primary' : 'text-text-tertiary'
                    }`}
                  >
                    Exclude intentional bokeh
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
                <AppButton
                  variant="outline"
                  onClick={() => setShowAutoRejectConfirm(false)}
                  disabled={isActionLoading}
                >
                  Cancel
                </AppButton>
                <AppButton
                  variant="destructive"
                  onClick={confirmAutoReject}
                  disabled={isActionLoading}
                >
                  Auto-Reject
                </AppButton>
              </div>
            </div>
          </AppCard>
        </div>
      )}
    </div>
  );
};

export default CullingWorkflowPage;
