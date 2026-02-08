import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  Filter,
  Grid,
  List,
  MoreVertical,
  Share2,
  Edit,
  Trash2,
  ExternalLink,
  ChevronDown,
  Loader2,
  Image,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '../../components/landing/animations/presets';
import { useAuth } from '../../contexts/AuthContext';
import { useGalleryList } from '../../hooks/useGallery';
import { GalleryCard, GalleryEmptyState, GalleryStatusBadge } from '../../components/features/gallery';
import { AppButton } from '../../components/ui/AppButton';
import { DeleteConfirmationDialog } from '../../components/ui/DeleteConfirmationDialog';
import { useToast } from '../../components/ui/Toast';
import { galleryService } from '../../services/galleryService';
import type { GalleryStatus, GalleryListItem } from '../../types/gallery';

/* =============================================================================
   GalleryListThumbnail Component
   
   Handles fetching signed URL for gallery cover in list view.
   ============================================================================= */
interface GalleryListThumbnailProps {
  gallery: GalleryListItem;
  workspaceId: string;
}

const GalleryListThumbnail: React.FC<GalleryListThumbnailProps> = ({ gallery, workspaceId }) => {
  const [coverUrl, setCoverUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    if (gallery.cover_asset_id && workspaceId && !coverUrl && !error) {
      galleryService
        .getSignedUrl(workspaceId, gallery.cover_asset_id, 'thumbnail')
        .then((url) => setCoverUrl(url))
        .catch(() => setError(true));
    }
  }, [gallery.cover_asset_id, workspaceId, coverUrl, error]);

  if (coverUrl && !error) {
    return (
      <img
        src={coverUrl}
        alt={gallery.title}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        loading="lazy"
        onError={() => setError(true)}
      />
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      <Image size={16} className="text-text-tertiary" />
    </div>
  );
};

/* =============================================================================
   GalleriesPage Component

   Gallery listing page with search, filter, and view toggle.
   ============================================================================= */

type ViewMode = 'grid' | 'list';
type SortOption = 'created_at' | 'title' | 'status' | 'shoot_date';
type FilterStatus = 'all' | GalleryStatus;

const GalleriesPage: React.FC = () => {
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const { t } = useTranslation(['gallery', 'common']);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('created_at');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [selectedGalleryIds, setSelectedGalleryIds] = useState<Set<string>>(new Set());

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [galleryToDelete, setGalleryToDelete] = useState<GalleryListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Handle person filter from PeoplePage navigation
  const [searchParams] = useSearchParams();
  const personGroupId = searchParams.get('person');

  useEffect(() => {
    // When a person filter is in the URL, navigate to the first gallery with that filter
    if (personGroupId && galleries && galleries.length > 0 && !loading) {
      // Navigate to the first gallery with the person filter
      navigate(`/workspace/galleries/${galleries[0].gallery_id}?person=${personGroupId}`, { replace: true });
    }
  }, [personGroupId, galleries, loading, navigate]);

  // Fetch galleries with server-side search and filtering
  const {
    galleries,
    meta,
    loading,
    error,
    refetch,
  } = useGalleryList({
    workspaceId: workspace?.workspace_id || '',
    page: 1,
    limit: 50,
    sort: sortBy,
    status: filterStatus === 'all' ? undefined : filterStatus,
    search: debouncedSearch || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    autoFetch: !!workspace?.workspace_id,
  });

  const handleCreateGallery = () => {
    navigate('/workspace/galleries/new');
  };

  const handleGalleryClick = (galleryId: string) => {
    navigate(`/workspace/galleries/${galleryId}`);
  };

  const handleGalleryEdit = (galleryId: string) => {
    navigate(`/workspace/galleries/${galleryId}`);
  };

  const handleGalleryShare = (galleryId: string) => {
    // TODO: Implement share functionality
    console.log('Share gallery:', galleryId);
  };

  const handleGallerySelect = (galleryId: string) => {
    setSelectedGalleryIds((prev) => {
      const next = new Set(prev);
      if (next.has(galleryId)) {
        next.delete(galleryId);
      } else {
        next.add(galleryId);
      }
      return next;
    });
  };

  // Delete handlers
  const handleDeleteClick = useCallback((gallery: GalleryListItem) => {
    setGalleryToDelete(gallery);
    setDeleteDialogOpen(true);
    setActiveMenu(null);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!galleryToDelete || !workspace?.workspace_id) return;

    setIsDeleting(true);
    try {
      await galleryService.deleteGallery(workspace.workspace_id, galleryToDelete.gallery_id);

      addToast({
        variant: 'success',
        message: `"${galleryToDelete.title}" moved to Recycle Bin`,
        duration: 8000,
        action: {
          label: 'View Trash',
          onClick: () => navigate('/workspace/trash'),
        },
      });

      setDeleteDialogOpen(false);
      setGalleryToDelete(null);
      refetch();
    } catch (err) {
      addToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete gallery',
      });
    } finally {
      setIsDeleting(false);
    }
  }, [galleryToDelete, workspace?.workspace_id, addToast, navigate, refetch]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteDialogOpen(false);
    setGalleryToDelete(null);
  }, []);

  const handleTogglePin = async (gallery: GalleryListItem) => {
    if (!workspace?.workspace_id) return;
    try {
      if (gallery.is_pinned) {
        await galleryService.unpinGallery(workspace.workspace_id, gallery.gallery_id);
        addToast({
          variant: 'success',
          message: `Unpinned "${gallery.title}"`,
        });
      } else {
        await galleryService.pinGallery(workspace.workspace_id, gallery.gallery_id);
        addToast({
          variant: 'success',
          message: `Pinned "${gallery.title}" to favorites`,
        });
      }
      refetch();
    } catch (err) {
      addToast({
        variant: 'error',
        message: 'Failed to update pin status',
      });
    }
  };


  // NOTE: This page is rendered inside WorkspaceLayout via routes.tsx
  // Do NOT wrap in WorkspaceLayout here - it's already provided by the router
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-6"
    >
      {/* Page Header - Enhanced with glass effect */}
      <motion.div variants={staggerItem} className="card-glass rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gradient">{t('common:nav.galleries')}</h1>
          <div className="text-text-secondary mt-1">
            {loading ? (
              t('common:status.loading')
            ) : error ? (
              t('list.errorLoading')
            ) : (galleries?.length ?? 0) === 0 && !debouncedSearch && filterStatus === 'all' && !startDate && !endDate ? (
              t('list.emptyState', { defaultValue: "No galleries yet. Let's create your first one!" })
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-text-primary">
                  {meta?.total ?? (galleries?.length ?? 0)}
                </span>
                <span>
                  {(meta?.total ?? (galleries?.length ?? 0)) === 1 ? t('list.galleryCount_one') : t('list.galleryCount_other')}
                </span>
                {(searchQuery || filterStatus !== 'all' || startDate || endDate) && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Filtered</span>
                )}
              </div>
            )}
          </div>
        </div>
        <AppButton
          onClick={handleCreateGallery}
          variant="primary"
          leftIcon={<Plus size={20} />}
          shine
          className="w-full sm:w-auto hover:-translate-y-0.5 active:scale-95 transition-all"
        >
          {t('common:nav.newGallery')}
        </AppButton>
      </motion.div>

      {/* Search and Filters - Enhanced with glass effect */}
      <motion.div variants={staggerItem} className="card-glass rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('list.searchPlaceholder', { defaultValue: 'Search by title, client, or event...' })}
            className="
                w-full pl-10 pr-4 py-2.5
                glass-light border border-white/20 dark:border-white/10
                rounded-xl text-text-primary placeholder:text-text-tertiary
                focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50
                hover:border-white/30 dark:hover:border-white/20
                transition-all duration-200
                min-h-[44px]
              "
          />
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="
                  flex items-center gap-2
                  px-4 py-2.5
                  glass-light border border-white/20 dark:border-white/10
                  rounded-xl text-text-secondary hover:text-text-primary hover:border-white/30
                  hover:shadow-md
                  transition-all duration-200
                  min-h-[44px]
                "
            >
              <Filter size={18} />
              <span className="hidden sm:inline">{t('common:actions.filter')}</span>
              {filterStatus !== 'all' && (
                <span className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-accent animate-pulse" />
              )}
            </button>
            {showFilters && (
              <div className="absolute top-full mt-2 right-0 w-48 card-glass rounded-xl shadow-xl z-10 overflow-hidden">
                <div className="p-2">
                  <p className="px-3 py-2 text-xs font-semibold text-text-tertiary uppercase">
                    Status
                  </p>
                  {(['all', 'draft', 'published', 'archived'] as FilterStatus[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        setFilterStatus(status);
                        setShowFilters(false);
                      }}
                      className={`
                          w-full flex items-center justify-between
                          px-3 py-2 rounded-lg text-sm transition-all duration-200
                          ${filterStatus === status ? 'bg-gradient-to-r from-primary/10 to-accent/10 text-primary dark:text-primary-300' : 'hover:bg-surface-hover/50 text-text-secondary'}
                        `}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                      {filterStatus === status && (
                        <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-primary to-accent" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="relative">
                <span className="absolute -top-2 left-3 px-1 bg-white dark:bg-slate-900 text-[10px] text-text-tertiary font-medium">From</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="
                    px-3 py-2.5
                    glass-light border border-white/20 dark:border-white/10
                    rounded-xl text-text-secondary text-sm
                    focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50
                    hover:border-white/30
                    transition-all duration-200
                    min-h-[44px]
                  "
                />
              </div>
              <span className="hidden sm:inline text-text-tertiary">-</span>
              <div className="relative">
                <span className="absolute -top-2 left-3 px-1 bg-white dark:bg-slate-900 text-[10px] text-text-tertiary font-medium">To</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="
                    px-3 py-2.5
                    glass-light border border-white/20 dark:border-white/10
                    rounded-xl text-text-secondary text-sm
                    focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50
                    hover:border-white/30
                    transition-all duration-200
                    min-h-[44px]
                  "
                />
              </div>
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-text-tertiary hover:text-text-primary p-2"
                title="Clear dates"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="
                  appearance-none
                  px-4 py-2.5 pr-10
                  glass-light border border-white/20 dark:border-white/10
                  rounded-xl text-text-secondary
                  focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50
                  hover:border-white/30 hover:shadow-md
                  cursor-pointer transition-all duration-200
                  min-h-[44px]
                "
            >
              <option value="created_at">Newest</option>
              <option value="title">Name</option>
              <option value="status">Status</option>
              <option value="shoot_date">Shoot Date</option>
            </select>
            <ChevronDown
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
            />
          </div>

          {/* View Toggle - Enhanced with glass effect */}
          <div className="hidden sm:flex items-center glass-light border border-white/20 dark:border-white/10 rounded-xl overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`
                  p-2.5
                  ${viewMode === 'grid' ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg' : 'text-text-tertiary hover:bg-surface-hover/50 hover:text-text-primary'}
                  transition-all duration-200
                  min-w-[44px] min-h-[44px] flex items-center justify-center
                `}
              aria-label="Grid view"
            >
              <Grid size={18} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`
                  p-2.5
                  ${viewMode === 'list' ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg' : 'text-text-tertiary hover:bg-surface-hover/50 hover:text-text-primary'}
                  transition-all duration-200
                  min-w-[44px] min-h-[44px] flex items-center justify-center
                `}
              aria-label="List view"
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Gallery Grid/List */}
      {loading ? (
        <motion.div variants={staggerItem} className="flex items-center justify-center py-16">
          <Loader2 size={32} className="text-primary animate-spin" />
        </motion.div>
      ) : error ? (
        <motion.div variants={staggerItem} className="text-center py-16">
          <p className="text-error mb-4">{error.message}</p>
          <AppButton onClick={refetch} variant="outline">
            {t('common:actions.retry')}
          </AppButton>
        </motion.div>
      ) : (galleries?.length ?? 0) === 0 ? (
        <motion.div variants={staggerItem}>
          <GalleryEmptyState
            hasFilters={!!searchQuery || filterStatus !== 'all'}
            onCreateGallery={handleCreateGallery}
          />
        </motion.div>
      ) : viewMode === 'grid' ? (
        <motion.div
          variants={staggerItem}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {(galleries ?? []).map((gallery) => (
            <GalleryCard
              key={gallery.gallery_id}
              gallery={gallery}
              onClick={() => handleGalleryClick(gallery.gallery_id)}
              onEdit={() => handleGalleryEdit(gallery.gallery_id)}
              onShare={() => handleGalleryShare(gallery.gallery_id)}
              onDelete={() => handleDeleteClick(gallery)}
              onTogglePin={handleTogglePin}
              selectable={true}
              isSelected={selectedGalleryIds.has(gallery.gallery_id)}
              onSelect={handleGallerySelect}
            />
          ))}
        </motion.div>
      ) : (
        <motion.div variants={staggerItem} className="card-glass rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-hover/50 border-b border-white/10 dark:border-white/5">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">
                  Gallery
                </th>
                <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">
                  Client
                </th>
                <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">
                  Photos
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">
                  Status
                </th>
                <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">
                  Date
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-text-tertiary uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(galleries ?? []).map((gallery) => {
                const formatDate = (dateString: string): string => {
                  const date = new Date(dateString);
                  return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                };

                return (
                  <tr
                    key={gallery.gallery_id}
                    className="group hover:bg-surface-hover/50 transition-all duration-200 cursor-pointer"
                    onClick={() => handleGalleryClick(gallery.gallery_id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-surface-hover/50 ring-1 ring-white/10 group-hover:ring-primary/30 transition-all duration-200">
                          <GalleryListThumbnail
                            gallery={gallery}
                            workspaceId={workspace?.workspace_id || ''}
                          />
                        </div>
                        <span className="font-medium text-text-primary truncate group-hover:text-primary transition-colors">
                          {gallery.title}
                        </span>
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm text-text-secondary truncate">
                      {gallery.client_name || '-'}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm text-text-secondary">
                      {gallery.photo_count}
                    </td>
                    <td className="px-4 py-3">
                      <GalleryStatusBadge status={gallery.status} size="sm" />
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm text-text-tertiary">
                      {formatDate(gallery.shoot_date || gallery.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGalleryEdit(gallery.gallery_id);
                          }}
                          className="p-2 rounded-lg hover:bg-primary/10 text-text-tertiary hover:text-primary transition-all duration-200 hover:scale-110"
                          aria-label="Edit gallery"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGalleryShare(gallery.gallery_id);
                          }}
                          className="p-2 rounded-lg hover:bg-accent/10 text-text-tertiary hover:text-accent transition-all duration-200 hover:scale-110"
                          aria-label="Share gallery"
                        >
                          <Share2 size={16} />
                        </button>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenu(activeMenu === gallery.gallery_id ? null : gallery.gallery_id);
                            }}
                            className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-all duration-200 hover:scale-110"
                            aria-label="More options"
                          >
                            <MoreVertical size={16} />
                          </button>
                          {activeMenu === gallery.gallery_id && (
                            <div className="absolute right-0 top-full mt-1 w-40 card-glass rounded-xl shadow-xl z-10 overflow-hidden">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Navigate to authenticated preview - works even if not published
                                  window.open(`/workspace/galleries/${gallery.gallery_id}/preview`, '_blank');
                                }}
                                className="flex items-center gap-2 px-3 py-2.5 text-sm text-text-secondary hover:bg-surface-hover/50 hover:text-text-primary transition-colors w-full text-left"
                              >
                                <ExternalLink size={14} />
                                View as Client
                              </button>
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-error hover:bg-error/10 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteClick(gallery);
                                }}
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </motion.div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        deleteType="soft"
        entityType="gallery"
        entityName={galleryToDelete?.title || ''}
        photoCount={galleryToDelete?.photo_count || 0}
        retentionDays={30}
        isLoading={isDeleting}
      />
    </motion.div>
  );
};

export default GalleriesPage;
