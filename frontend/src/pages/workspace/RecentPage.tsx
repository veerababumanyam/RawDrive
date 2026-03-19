import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Search,
  Grid,
  List,
  Loader2,
  Clock,
  ChevronDown,
  Image,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '../../components/landing/animations/presets';
import { useAuth } from '../../contexts/AuthContext';
import { useGalleryList } from '../../hooks/useGallery';
import { GalleryCard, GalleryStatusBadge } from '../../components/features/gallery';
import { AppButton } from '../../components/ui/AppButton';
import { useToast } from '../../components/ui/Toast';
import { galleryService } from '../../services/galleryService';
import type { GalleryListItem } from '../../types/gallery';

/* =============================================================================
   GalleryListThumbnail Component (Reusable)
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
   RecentPage Component
   ============================================================================= */

type ViewMode = 'grid' | 'list';
type SortOption = 'last_accessed_at' | 'created_at' | 'title' | 'status' | 'shoot_date';

const RecentPage: React.FC = () => {
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const { t } = useTranslation(['gallery', 'common']);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('last_accessed_at');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch recent galleries
  const {
    galleries,
    loading,
    error,
    refetch,
  } = useGalleryList({
    workspaceId: workspace?.workspace_id || '',
    page: 1,
    limit: 50,
    sort: sortBy,
    search: debouncedSearch || undefined,
    recentOnly: true,
    autoFetch: !!workspace?.workspace_id,
  });

  const handleGalleryClick = (galleryId: string) => {
    navigate(`/workspace/galleries/${galleryId}`);
  };

  const handleTogglePin = async (gallery: GalleryListItem) => {
     if (!workspace?.workspace_id) return;
     try {
         if (gallery.is_pinned) {
             await galleryService.unpinGallery(workspace.workspace_id, gallery.gallery_id);
             addToast({ variant: 'success', message: `Unpinned "${gallery.title}"` });
         } else {
             await galleryService.pinGallery(workspace.workspace_id, gallery.gallery_id);
             addToast({ variant: 'success', message: `Pinned "${gallery.title}" to favorites` });
         }
         refetch();
     } catch (err) {
         addToast({ variant: 'error', message: 'Failed to update pin status' });
     }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-6"
    >
      {/* Page Header */}
      <motion.div variants={staggerItem} className="card-glass rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
             <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <Clock size={24} className="stroke-current" />
             </div>
             <h1 className="text-2xl font-bold text-gradient">Recently Accessed</h1>
          </div>
          <p className="text-text-secondary mt-1 ml-11">
            {loading ? (
              t('common:status.loading')
            ) : error ? (
              t('list.errorLoading')
            ) : (
              <>
                {t('list.recentItems', { count: galleries.length })}
              </>
            )}
          </p>
        </div>
      </motion.div>

      {/* Search & Sort */}
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
            placeholder={t('list.searchPlaceholder')}
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
              <option value="last_accessed_at">Recently Accessed</option>
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

        {/* View Toggle */}
          <div className="hidden sm:flex items-center glass-light border border-white/20 dark:border-white/10 rounded-xl overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`
                  p-2.5
                  ${viewMode === 'grid' ? 'bg-gradient-to-r from-primary to-accent text-white shadow-lg' : 'text-text-tertiary hover:bg-surface-hover/50 hover:text-text-primary'}
                  transition-all duration-200
                  min-w-[44px] min-h-[44px] flex items-center justify-center
                `}
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
            >
              <List size={18} />
            </button>
          </div>
      </motion.div>

      {/* Grid/List */}
      {loading ? (
        <motion.div variants={staggerItem} className="flex items-center justify-center py-16">
          <Loader2 size={32} className="text-primary animate-spin" />
        </motion.div>
      ) : galleries.length === 0 ? (
        <motion.div variants={staggerItem} className="text-center py-20 card-glass rounded-3xl border border-white/10">
             <div className="w-16 h-16 rounded-2xl bg-surface-hover mx-auto flex items-center justify-center mb-4">
               <Clock size={32} className="text-text-tertiary" />
             </div>
             <h3 className="text-lg font-medium text-text-primary">No recent activity</h3>
             <p className="text-text-secondary mt-2 max-w-sm mx-auto">
               Galleries you view or edit will appear here for quick access.
             </p>
             <AppButton 
                className="mt-6"
                variant="outline"
                onClick={() => navigate('/workspace/galleries')}
             >
                Browse Galleries
             </AppButton>
        </motion.div>
      ) : viewMode === 'grid' ? (
        <motion.div
           variants={staggerItem}
           className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {galleries.map((gallery) => (
             <GalleryCard
               key={gallery.gallery_id}
               gallery={gallery}
               onClick={() => handleGalleryClick(gallery.gallery_id)}
               onTogglePin={handleTogglePin}
               selectable={false}
             />
          ))}
        </motion.div>
      ) : (
          <motion.div variants={staggerItem} className="card-glass rounded-2xl overflow-hidden">
             {/* List View Implementation (Simplified) */}
              <table className="w-full">
                <thead className="bg-surface-hover/50 border-b border-white/10 dark:border-white/5">
                   <tr>
                     <th className="px-4 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">Gallery</th>
                     <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">Client</th>
                     <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">Photos</th>
                     <th className="px-4 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">Status</th>
                     <th className="px-4 py-3 text-right text-xs font-semibold text-text-tertiary uppercase">Last Accessed</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {galleries.map((gallery) => (
                    <tr
                       key={gallery.gallery_id}
                       className="group hover:bg-surface-hover/50 transition-all duration-200 cursor-pointer"
                       onClick={() => handleGalleryClick(gallery.gallery_id)}
                    >
                       <td className="px-4 py-3">
                           <div className="flex items-center gap-3">
                               <div className="w-12 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-surface-hover/50 ring-1 ring-white/10">
                                  <GalleryListThumbnail gallery={gallery} workspaceId={workspace?.workspace_id || ''} />
                               </div>
                               <span className="font-medium text-text-primary truncate">{gallery.title}</span>
                           </div>
                       </td>
                       <td className="hidden md:table-cell px-4 py-3 text-sm text-text-secondary">{gallery.client_name || '-'}</td>
                       <td className="hidden sm:table-cell px-4 py-3 text-sm text-text-secondary">{gallery.photo_count}</td>
                       <td className="px-4 py-3"><GalleryStatusBadge status={gallery.status} size="sm" /></td>
                       <td className="px-4 py-3 text-right text-sm text-text-tertiary">
                          {gallery.last_accessed_at ? new Date(gallery.last_accessed_at).toLocaleDateString() : '-'}
                       </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </motion.div>
      )}
    </motion.div>
  );
};

export default RecentPage;
