import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  Filter,
  Grid,
  List,
  Eye,
  Image,
  Clock,
  MoreVertical,
  Share2,
  Edit,
  Trash2,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { WorkspaceLayout } from '../../components/workspace';
import { staggerContainer, staggerItem } from '../../components/landing/animations/presets';

/* =============================================================================
   GalleriesPage Component

   Gallery listing page with search, filter, and view toggle.
   ============================================================================= */

// Mock data - replace with actual API calls
const mockGalleries = [
  {
    id: '1',
    name: 'Johnson Wedding',
    client: 'Sarah & Mike Johnson',
    photoCount: 342,
    coverUrl: 'https://picsum.photos/seed/gal1/400/300',
    status: 'published',
    views: 128,
    downloads: 45,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },
  {
    id: '2',
    name: 'Corporate Headshots',
    client: 'Tech Corp Inc.',
    photoCount: 45,
    coverUrl: 'https://picsum.photos/seed/gal2/400/300',
    status: 'draft',
    views: 0,
    downloads: 0,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
  {
    id: '3',
    name: 'Smith Family Portrait',
    client: 'The Smith Family',
    photoCount: 87,
    coverUrl: 'https://picsum.photos/seed/gal3/400/300',
    status: 'published',
    views: 56,
    downloads: 12,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
  },
  {
    id: '4',
    name: 'Product Photography',
    client: 'Fashion Brand Co.',
    photoCount: 156,
    coverUrl: 'https://picsum.photos/seed/gal4/400/300',
    status: 'published',
    views: 234,
    downloads: 89,
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  },
  {
    id: '5',
    name: 'Real Estate Shoot',
    client: 'Luxury Homes Realty',
    photoCount: 78,
    coverUrl: 'https://picsum.photos/seed/gal5/400/300',
    status: 'published',
    views: 412,
    downloads: 156,
    createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000),
  },
  {
    id: '6',
    name: 'Baby Shower',
    client: 'Emma Williams',
    photoCount: 124,
    coverUrl: 'https://picsum.photos/seed/gal6/400/300',
    status: 'draft',
    views: 0,
    downloads: 0,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },
];

type ViewMode = 'grid' | 'list';
type SortOption = 'newest' | 'oldest' | 'name' | 'views';
type FilterStatus = 'all' | 'published' | 'draft';

const GalleriesPage: React.FC = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Filter and sort galleries
  const filteredGalleries = mockGalleries
    .filter((gallery) => {
      const matchesSearch =
        gallery.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        gallery.client.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        filterStatus === 'all' || gallery.status === filterStatus;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return b.createdAt.getTime() - a.createdAt.getTime();
        case 'oldest':
          return a.createdAt.getTime() - b.createdAt.getTime();
        case 'name':
          return a.name.localeCompare(b.name);
        case 'views':
          return b.views - a.views;
        default:
          return 0;
      }
    });

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400';
      case 'draft':
        return 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  return (
    <WorkspaceLayout>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="space-y-6"
      >
        {/* Page Header */}
        <motion.div variants={staggerItem} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Galleries</h1>
            <p className="text-text-secondary mt-1">
              {filteredGalleries.length} {filteredGalleries.length === 1 ? 'gallery' : 'galleries'}
            </p>
          </div>
          <button
            onClick={() => navigate('/workspace/galleries/new')}
            className="
              flex items-center justify-center gap-2
              px-4 py-2.5
              bg-primary hover:bg-primary-hover
              text-white font-medium
              rounded-lg
              transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
              min-h-[44px]
              w-full sm:w-auto
            "
          >
            <Plus size={20} />
            New Gallery
          </button>
        </motion.div>

        {/* Search and Filters */}
        <motion.div variants={staggerItem} className="flex flex-col sm:flex-row gap-4">
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
              placeholder="Search galleries..."
              className="
                w-full pl-10 pr-4 py-2.5
                bg-surface border border-border
                rounded-lg text-text-primary placeholder:text-text-tertiary
                focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
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
                  bg-surface border border-border
                  rounded-lg text-text-secondary hover:text-text-primary hover:border-text-tertiary
                  transition-colors
                  min-h-[44px]
                "
              >
                <Filter size={18} />
                <span className="hidden sm:inline">Filter</span>
                {filterStatus !== 'all' && (
                  <span className="w-2 h-2 rounded-full bg-primary" />
                )}
              </button>
              {showFilters && (
                <div className="absolute top-full mt-2 right-0 w-48 bg-surface border border-border rounded-lg shadow-lg z-10 overflow-hidden">
                  <div className="p-2">
                    <p className="px-3 py-2 text-xs font-semibold text-text-tertiary uppercase">
                      Status
                    </p>
                    {(['all', 'published', 'draft'] as FilterStatus[]).map((status) => (
                      <button
                        key={status}
                        onClick={() => {
                          setFilterStatus(status);
                          setShowFilters(false);
                        }}
                        className={`
                          w-full flex items-center justify-between
                          px-3 py-2 rounded-md text-sm
                          ${filterStatus === status ? 'bg-primary-100 text-primary dark:bg-primary-900/30' : 'hover:bg-surface-hover text-text-secondary'}
                        `}
                      >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                        {filterStatus === status && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
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
                  bg-surface border border-border
                  rounded-lg text-text-secondary
                  focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
                  cursor-pointer
                  min-h-[44px]
                "
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name</option>
                <option value="views">Most Views</option>
              </select>
              <ChevronDown
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
              />
            </div>

            {/* View Toggle */}
            <div className="hidden sm:flex items-center border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`
                  p-2.5
                  ${viewMode === 'grid' ? 'bg-primary text-white' : 'bg-surface text-text-tertiary hover:bg-surface-hover'}
                  transition-colors
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
                  ${viewMode === 'list' ? 'bg-primary text-white' : 'bg-surface text-text-tertiary hover:bg-surface-hover'}
                  transition-colors
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
        {filteredGalleries.length === 0 ? (
          <motion.div variants={staggerItem} className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-hover flex items-center justify-center">
              <Image size={32} className="text-text-tertiary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              No galleries found
            </h3>
            <p className="text-text-secondary mb-6">
              {searchQuery || filterStatus !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Create your first gallery to get started'}
            </p>
            <button
              onClick={() => navigate('/workspace/galleries/new')}
              className="
                inline-flex items-center gap-2
                px-4 py-2.5
                bg-primary hover:bg-primary-hover
                text-white font-medium
                rounded-lg
                transition-colors
              "
            >
              <Plus size={20} />
              Create Gallery
            </button>
          </motion.div>
        ) : viewMode === 'grid' ? (
          <motion.div
            variants={staggerItem}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            {filteredGalleries.map((gallery) => (
              <div
                key={gallery.id}
                className="bg-surface border border-border rounded-xl overflow-hidden hover:shadow-lg transition-shadow group"
              >
                {/* Cover Image */}
                <div className="relative aspect-[4/3] bg-surface-hover">
                  <img
                    src={gallery.coverUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                        gallery.status
                      )}`}
                    >
                      {gallery.status}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/workspace/galleries/${gallery.id}`)}
                        className="p-1.5 rounded-full bg-white/90 hover:bg-white text-gray-700 transition-colors"
                        aria-label="Edit gallery"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        className="p-1.5 rounded-full bg-white/90 hover:bg-white text-gray-700 transition-colors"
                        aria-label="Share gallery"
                      >
                        <Share2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-medium text-text-primary truncate">
                    {gallery.name}
                  </h3>
                  <p className="text-sm text-text-tertiary truncate mt-0.5">
                    {gallery.client}
                  </p>
                  <div className="flex items-center justify-between mt-3 text-xs text-text-tertiary">
                    <span className="flex items-center gap-1">
                      <Image size={12} />
                      {gallery.photoCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye size={12} />
                      {gallery.views}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {formatDate(gallery.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div variants={staggerItem} className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-surface-hover border-b border-border">
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
                  <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">
                    Views
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">
                    Status
                  </th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-text-tertiary uppercase">
                    Created
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-text-tertiary uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredGalleries.map((gallery) => (
                  <tr key={gallery.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-9 rounded-lg overflow-hidden flex-shrink-0">
                          <img
                            src={gallery.coverUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="font-medium text-text-primary truncate">
                          {gallery.name}
                        </span>
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm text-text-secondary truncate">
                      {gallery.client}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm text-text-secondary">
                      {gallery.photoCount}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-sm text-text-secondary">
                      {gallery.views}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                          gallery.status
                        )}`}
                      >
                        {gallery.status}
                      </span>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm text-text-tertiary">
                      {formatDate(gallery.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/workspace/galleries/${gallery.id}`)}
                          className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
                          aria-label="Edit gallery"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
                          aria-label="Share gallery"
                        >
                          <Share2 size={16} />
                        </button>
                        <div className="relative">
                          <button
                            onClick={() =>
                              setActiveMenu(activeMenu === gallery.id ? null : gallery.id)
                            }
                            className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
                            aria-label="More options"
                          >
                            <MoreVertical size={16} />
                          </button>
                          {activeMenu === gallery.id && (
                            <div className="absolute right-0 top-full mt-1 w-40 bg-surface border border-border rounded-lg shadow-lg z-10 overflow-hidden">
                              {gallery.status === 'published' && (
                                <a
                                  href={`/g/${gallery.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover"
                                >
                                  <ExternalLink size={14} />
                                  View Public
                                </a>
                              )}
                              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error-50 dark:hover:bg-error-900/10">
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </motion.div>
    </WorkspaceLayout>
  );
};

export default GalleriesPage;
