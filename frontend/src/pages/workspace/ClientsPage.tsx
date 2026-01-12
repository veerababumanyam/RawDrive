import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  Filter,
  Grid,
  List,
  MoreVertical,
  Mail,
  Phone,
  Edit,
  Trash2,
  ChevronDown,
  Loader2,
  UserPlus,
  Building2,
  Users,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  Tag,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '../../components/landing/animations/presets';
import { useAuth } from '../../contexts/AuthContext';
import { AppButton } from '../../components/ui/AppButton';
import { AppBadge, StatusBadge } from '../../components/ui/AppBadge';
import { DeleteConfirmationDialog } from '../../components/ui/DeleteConfirmationDialog';
import { useToast } from '../../components/ui/Toast';
import { clientService } from '../../services/clientService';
import { ClientExportDialog, ClientImportDialog } from '../../components/features/clients';
import type {
  ClientListItem,
  ClientListMeta,
  ClientStatus,
  ClientTag,
} from '../../types/client';
import { useClientAvatars } from '../../hooks/useClientAvatars';

/* =============================================================================
   ClientsPage Component

   Client listing page with search, filter, tags, and view toggle.
   ============================================================================= */

type ViewMode = 'grid' | 'list';
type SortOption = 'full_name' | 'created_at' | 'updated_at';

const ClientsPage: React.FC = () => {
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const { t } = useTranslation(['common']);

  // View and filter state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('created_at');
  const [filterStatus, setFilterStatus] = useState<ClientStatus | 'all'>('all');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  // Data state
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [meta, setMeta] = useState<ClientListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [availableTags, setAvailableTags] = useState<ClientTag[]>([]);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<ClientListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Export/Import dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Fetch clients
  const fetchClients = useCallback(async () => {
    if (!workspace?.workspace_id) return;

    setLoading(true);
    setError(null);

    try {
      const response = await clientService.listClients(workspace.workspace_id, {
        page,
        limit,
        status: filterStatus === 'all' ? undefined : filterStatus,
        search: searchQuery || undefined,
        tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        sort_by: sortBy,
        sort_order: 'desc',
      });

      setClients(response.clients);
      setMeta(response.meta);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch clients'));
    } finally {
      setLoading(false);
    }
  }, [workspace?.workspace_id, page, limit, filterStatus, searchQuery, selectedTagIds, sortBy]);

  // Fetch tags
  const fetchTags = useCallback(async () => {
    if (!workspace?.workspace_id) return;

    try {
      const tags = await clientService.getWorkspaceTags(workspace.workspace_id);
      setAvailableTags(tags);
    } catch (err) {
      console.error('Failed to fetch tags:', err);
    }
  }, [workspace?.workspace_id]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Use the new hook to manage avatar blob URLs
  const { avatarBlobUrls } = useClientAvatars(workspace?.workspace_id, clients, 256);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filterStatus, searchQuery, selectedTagIds]);

  // Handlers
  const handleCreateClient = () => {
    navigate('/workspace/clients/new');
  };

  const handleClientClick = (clientId: string) => {
    navigate(`/workspace/clients/${clientId}`);
  };

  const handleClientEdit = (clientId: string) => {
    navigate(`/workspace/clients/${clientId}/edit`);
  };

  const handleDeleteClick = useCallback((client: ClientListItem) => {
    setClientToDelete(client);
    setDeleteDialogOpen(true);
    setActiveMenu(null);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!clientToDelete || !workspace?.workspace_id) return;

    setIsDeleting(true);
    try {
      await clientService.deleteClient(workspace.workspace_id, clientToDelete.client_id);

      addToast({
        variant: 'success',
        message: `"${clientToDelete.full_name}" has been deleted`,
      });

      setDeleteDialogOpen(false);
      setClientToDelete(null);
      fetchClients();
    } catch (err) {
      addToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete client',
      });
    } finally {
      setIsDeleting(false);
    }
  }, [clientToDelete, workspace?.workspace_id, addToast, fetchClients]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteDialogOpen(false);
    setClientToDelete(null);
  }, []);

  const handleExport = () => {
    setExportDialogOpen(true);
  };

  const handleExportComplete = () => {
    setExportDialogOpen(false);
    addToast({
      variant: 'success',
      message: 'Clients exported successfully',
    });
  };

  const handleImport = () => {
    setImportDialogOpen(true);
  };

  const handleImportComplete = () => {
    setImportDialogOpen(false);
    fetchClients();
    addToast({
      variant: 'success',
      message: 'Clients imported successfully',
    });
  };

  const handleTagToggle = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const clearTagFilters = () => {
    setSelectedTagIds([]);
    setShowTagFilter(false);
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Client Avatar component - uses blob URLs for authenticated image fetching
  const ClientAvatar: React.FC<{ client: ClientListItem; size?: 'sm' | 'md' | 'lg' }> = ({
    client,
    size = 'md',
  }) => {
    const sizeClasses = {
      sm: 'w-8 h-8 text-xs',
      md: 'w-10 h-10 text-sm',
      lg: 'w-12 h-12 text-base',
    };

    const avatarBlobUrl = avatarBlobUrls[client.client_id];

    if (avatarBlobUrl) {
      return (
        <img
          src={avatarBlobUrl}
          alt={client.full_name}
          className={`${sizeClasses[size]} rounded-full object-cover ring-2 ring-white/20`}
        />
      );
    }

    return (
      <div
        className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center font-semibold text-primary ring-2 ring-white/10`}
      >
        {client.initials || client.full_name.charAt(0).toUpperCase()}
      </div>
    );
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-6"
    >
      {/* Page Header */}
      <motion.div
        variants={staggerItem}
        className="glass-adaptive rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-gradient">{t('nav.clients')}</h1>
          <p className="text-text-secondary mt-1">
            {loading ? (
              t('status.loading')
            ) : error ? (
              t('errors.generic')
            ) : (
              <>
                {clients.length} {clients.length === 1 ? t('labels.client_one', { defaultValue: 'client' }) : t('labels.client_other', { defaultValue: 'clients' })}
                {meta && ` ${t('labels.of', { defaultValue: 'of' })} ${meta.total}`}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center glass-adaptive-subtle rounded-xl overflow-hidden p-1 shadow-inner">
            <button
              onClick={handleExport}
              className="px-3 py-2 text-sm font-medium text-text-secondary hover:text-primary hover:bg-white/50 dark:hover:bg-white/10 rounded-lg transition-all flex items-center gap-2"
              title="Export clients to CSV/vCard"
            >
              <Download size={16} />
              <span>Export</span>
            </button>
            <div className="w-px h-6 bg-white/20 dark:bg-white/10 mx-1" />
            <button
              onClick={handleImport}
              className="px-3 py-2 text-sm font-medium text-text-secondary hover:text-primary hover:bg-white/50 dark:hover:bg-white/10 rounded-lg transition-all flex items-center gap-2"
              title="Import clients from CSV/vCard"
            >
              <Upload size={16} />
              <span>Import</span>
            </button>
          </div>
          <AppButton
            onClick={handleCreateClient}
            variant="primary"
            leftIcon={<Plus size={20} />}
            shine
            className="hover:-translate-y-0.5 active:scale-95 transition-all px-6 py-2.5 rounded-xl shadow-lg shadow-primary/20"
          >
            {t('actions.create')} {t('labels.client_one', { defaultValue: 'Client' })}
          </AppButton>
        </div>
      </motion.div>

      {/* Search and Filters */}
      <motion.div
        variants={staggerItem}
        className="glass-adaptive rounded-2xl p-4 flex flex-col sm:flex-row gap-4"
      >
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
            placeholder={t('actions.search') + ' ' + t('nav.clients').toLowerCase() + '...'}
            className="
              w-full pl-10 pr-4 py-2.5
              glass-adaptive-subtle
              rounded-xl text-text-primary placeholder:text-text-tertiary
              focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50
              transition-all duration-200
              min-h-[44px]
            "
          />
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="
                flex items-center gap-2
                px-4 py-2.5
                glass-interactive
                rounded-xl text-text-secondary hover:text-text-primary
                transition-all duration-200
                min-h-[44px]
              "
            >
              <Filter size={18} />
              <span className="hidden sm:inline">Status</span>
              {filterStatus !== 'all' && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center border-2 border-background font-bold">1</span>
              )}
            </button>
            {showFilters && (
              <div className="absolute top-full mt-2 right-0 w-48 glass-adaptive-elevated rounded-xl shadow-xl z-10 overflow-hidden">
                <div className="p-2">
                  <p className="px-3 py-2 text-xs font-semibold text-text-tertiary uppercase">
                    Status
                  </p>
                  {(['all', 'active', 'inactive'] as const).map((status) => (
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

          {/* Tag Filter */}
          <div className="relative">
            <button
              onClick={() => setShowTagFilter(!showTagFilter)}
              className="
                flex items-center gap-2
                px-4 py-2.5
                glass-interactive
                rounded-xl text-text-secondary hover:text-text-primary
                transition-all duration-200
                min-h-[44px]
              "
            >
              <Tag size={18} />
              <span className="hidden sm:inline">Tags</span>
              {selectedTagIds.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center border-2 border-background font-bold">
                  {selectedTagIds.length}
                </span>
              )}
            </button>
            {showTagFilter && (
              <div className="absolute top-full mt-2 right-0 w-64 glass-adaptive-elevated rounded-xl shadow-xl z-10 overflow-hidden">
                <div className="p-2">
                  <div className="flex items-center justify-between px-3 py-2">
                    <p className="text-xs font-semibold text-text-tertiary uppercase">Tags</p>
                    {selectedTagIds.length > 0 && (
                      <button
                        onClick={clearTagFilters}
                        className="text-xs text-primary hover:text-primary-600"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  {availableTags.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-text-tertiary">No tags available</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {availableTags.map((tag) => (
                        <button
                          key={tag.tag_id}
                          onClick={() => handleTagToggle(tag.tag_id)}
                          className={`
                            w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all
                            ${selectedTagIds.includes(tag.tag_id) ? 'bg-primary/10 text-primary' : 'hover:bg-surface-hover/50 text-text-secondary'}
                          `}
                        >
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: tag.color || '#6B7280' }}
                          />
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  )}
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
                glass-interactive
                rounded-xl text-text-secondary
                focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50
                cursor-pointer transition-all duration-200
                min-h-[44px]
              "
            >
              <option value="created_at">Newest</option>
              <option value="full_name">Name</option>
              <option value="updated_at">Recently Updated</option>
            </select>
            <ChevronDown
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
            />
          </div>

          {/* View Toggle */}
          <div className="hidden sm:flex items-center glass-adaptive-subtle rounded-xl overflow-hidden">
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

      {/* Active Tag Filters */}
      {selectedTagIds.length > 0 && (
        <motion.div variants={staggerItem} className="flex flex-wrap gap-2">
          {selectedTagIds.map((tagId) => {
            const tag = availableTags.find((t) => t.tag_id === tagId);
            if (!tag) return null;
            return (
              <AppBadge
                key={tagId}
                variant="primary"
                removable
                onRemove={() => handleTagToggle(tagId)}
                icon={
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: tag.color || '#6B7280' }}
                  />
                }
              >
                {tag.name}
              </AppBadge>
            );
          })}
          <button
            onClick={clearTagFilters}
            className="text-sm text-text-tertiary hover:text-text-primary transition-colors"
          >
            Clear all
          </button>
        </motion.div>
      )}

      {/* Client Grid/List */}
      {loading ? (
        <motion.div variants={staggerItem} className="flex items-center justify-center py-16">
          <Loader2 size={32} className="text-primary animate-spin" />
        </motion.div>
      ) : error ? (
        <motion.div variants={staggerItem} className="text-center py-16">
          <p className="text-error mb-4">{error.message}</p>
          <AppButton onClick={fetchClients} variant="outline">
            {t('actions.retry')}
          </AppButton>
        </motion.div>
      ) : clients.length === 0 ? (
        <motion.div variants={staggerItem}>
          <ClientEmptyState
            hasFilters={!!searchQuery || filterStatus !== 'all' || selectedTagIds.length > 0}
            onCreateClient={handleCreateClient}
          />
        </motion.div>
      ) : viewMode === 'grid' ? (
        <motion.div
          variants={staggerItem}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {clients.map((client) => (
            <ClientCard
              key={client.client_id}
              client={client}
              avatarBlobUrl={avatarBlobUrls[client.client_id]}
              onClick={() => handleClientClick(client.client_id)}
              onEdit={() => handleClientEdit(client.client_id)}
              onDelete={() => handleDeleteClick(client)}
            />
          ))}
        </motion.div>
      ) : (
        <motion.div variants={staggerItem} className="glass-adaptive rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-hover/30 backdrop-blur-sm border-b border-border/30">
              <tr>
                <th className="px-4 py-4 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                  Client
                </th>
                <th className="hidden md:table-cell px-4 py-4 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                  Organization
                </th>
                <th className="hidden lg:table-cell px-4 py-4 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                  Contact
                </th>
                <th className="hidden sm:table-cell px-4 py-4 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                  Galleries
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                  Status
                </th>
                <th className="hidden md:table-cell px-4 py-4 text-left text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                  Created
                </th>
                <th className="px-4 py-4 text-right text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {clients.map((client) => (
                <tr
                  key={client.client_id}
                  className="group hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5 transition-all duration-300 cursor-pointer"
                  onClick={() => handleClientClick(client.client_id)}
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <ClientAvatar client={client} />
                      <div className="min-w-0">
                        <span className="font-medium text-text-primary truncate block group-hover:text-primary transition-colors duration-200">
                          {client.full_name}
                        </span>
                        {client.tags && client.tags.length > 0 && (
                          <div className="flex gap-1 mt-1.5">
                            {client.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag.tag_id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md bg-surface-hover/70 border border-border/30"
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: tag.color || '#6B7280' }}
                                />
                                {tag.name}
                              </span>
                            ))}
                            {client.tags.length > 2 && (
                              <span className="text-[10px] text-text-tertiary px-1">
                                +{client.tags.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-4 py-4 text-sm text-text-secondary truncate">
                    {client.organization || '-'}
                  </td>
                  <td className="hidden lg:table-cell px-4 py-4">
                    <div className="space-y-1.5">
                      {client.primary_email && (
                        <div className="flex items-center gap-2 text-sm text-text-secondary">
                          <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Mail size={10} className="text-primary" />
                          </div>
                          <span className="truncate max-w-[180px]">{client.primary_email}</span>
                        </div>
                      )}
                      {client.primary_phone && (
                        <div className="flex items-center gap-2 text-sm text-text-secondary">
                          <div className="w-5 h-5 rounded bg-success/10 flex items-center justify-center flex-shrink-0">
                            <Phone size={10} className="text-success" />
                          </div>
                          <span>{client.primary_phone}</span>
                        </div>
                      )}
                      {!client.primary_email && !client.primary_phone && (
                        <span className="text-sm text-text-tertiary">-</span>
                      )}
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded bg-accent/10 flex items-center justify-center">
                        <Users size={10} className="text-accent" />
                      </div>
                      <span className="text-sm text-text-secondary">{client.linked_galleries_count}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={client.status} size="sm" />
                  </td>
                  <td className="hidden md:table-cell px-4 py-4 text-sm text-text-tertiary">
                    {formatDate(client.created_at)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClientEdit(client.client_id);
                        }}
                        className="p-2.5 rounded-xl hover:bg-primary/10 text-text-tertiary hover:text-primary transition-all duration-200 hover:scale-110 hover:shadow-sm"
                        aria-label="Edit client"
                        title="Edit client"
                      >
                        <Edit size={16} />
                      </button>
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenu(activeMenu === client.client_id ? null : client.client_id);
                          }}
                          className="p-2.5 rounded-xl hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-all duration-200 hover:scale-110 hover:shadow-sm"
                          aria-label="More options"
                          title="More options"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {activeMenu === client.client_id && (
                          <div className="absolute right-0 top-full mt-2 w-44 glass-adaptive-elevated rounded-xl shadow-2xl z-50 overflow-hidden">
                            <button
                              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-error hover:bg-error/10 transition-all duration-200"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(client);
                              }}
                              title="Delete client"
                            >
                              <Trash2 size={16} />
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

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <motion.div
          variants={staggerItem}
          className="flex items-center justify-between glass-adaptive rounded-xl px-4 py-3"
        >
          <p className="text-sm text-text-tertiary">
            Showing {(page - 1) * limit + 1} to {Math.min(page * limit, meta.total)} of{' '}
            {meta.total} clients
          </p>
          <div className="flex items-center gap-2">
            <AppButton
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              leftIcon={<ChevronLeft size={16} />}
            >
              Previous
            </AppButton>
            <span className="px-3 py-1 text-sm text-text-secondary">
              Page {page} of {meta.total_pages}
            </span>
            <AppButton
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(meta.total_pages, p + 1))}
              disabled={page === meta.total_pages}
              rightIcon={<ChevronRight size={16} />}
            >
              Next
            </AppButton>
          </div>
        </motion.div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        deleteType="hard"
        entityType="client"
        entityName={clientToDelete?.full_name || ''}
        isLoading={isDeleting}
      />

      {/* Export Dialog */}
      {workspace?.workspace_id && (
        <ClientExportDialog
          isOpen={exportDialogOpen}
          onClose={() => setExportDialogOpen(false)}
          workspaceId={workspace.workspace_id}
          onExportComplete={handleExportComplete}
        />
      )}

      {/* Import Dialog */}
      {workspace?.workspace_id && (
        <ClientImportDialog
          isOpen={importDialogOpen}
          onClose={() => setImportDialogOpen(false)}
          workspaceId={workspace.workspace_id}
          onImported={handleImportComplete}
        />
      )}
    </motion.div>
  );
};

/* =============================================================================
   Client Card Component
   ============================================================================= */

interface ClientCardProps {
  client: ClientListItem;
  avatarBlobUrl?: string;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const ClientCard: React.FC<ClientCardProps> = ({ client, avatarBlobUrl, onClick, onEdit, onDelete }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      className="client-card card-glass rounded-2xl p-4 hover:shadow-xl hover:shadow-primary/5 hover:ring-1 hover:ring-primary/20 transition-all duration-300 cursor-pointer group relative overflow-hidden"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setShowMenu(false); }}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ duration: 0.2 }}
    >
      {/* Hover gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {avatarBlobUrl ? (
              <img
                src={avatarBlobUrl}
                alt={client.full_name}
                className="w-12 h-12 rounded-full object-cover ring-2 ring-white/20 group-hover:ring-primary/40 group-hover:shadow-lg group-hover:shadow-primary/20 transition-all duration-300"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-lg font-semibold text-primary ring-2 ring-white/10 group-hover:ring-primary/40 group-hover:shadow-lg group-hover:shadow-primary/20 transition-all duration-300">
                {client.initials || client.full_name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-semibold text-text-primary truncate group-hover:text-primary transition-colors duration-200">
                {client.full_name}
              </h3>
              {client.organization && (
                <p className="text-sm text-text-tertiary truncate flex items-center gap-1">
                  <Building2 size={12} />
                  {client.organization}
                </p>
              )}
            </div>
          </div>
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className={`
                client-card-menu-btn p-2 rounded-xl
                ${showMenu ? 'bg-surface-hover text-text-primary' : 'text-text-tertiary'}
                hover:bg-surface-hover/80 hover:text-text-primary hover:shadow-sm
                transition-all duration-200
                ${isHovered ? 'opacity-100' : 'opacity-0'}
              `}
              aria-label="More options"
              title="More options"
            >
              <MoreVertical size={16} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-2 w-40 bg-surface/95 backdrop-blur-xl rounded-xl shadow-2xl shadow-black/20 z-50 overflow-hidden border border-border/50">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-secondary hover:bg-primary/10 hover:text-primary transition-all duration-200"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                  title="Edit client"
                >
                  <Edit size={16} />
                  Edit
                </button>
                <div className="h-px bg-border/50" />
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-error hover:bg-error/10 transition-all duration-200"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  title="Delete client"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Contact Info */}
        <div className="space-y-2 mb-3">
          {client.primary_email && (
            <div className="flex items-center gap-2 text-sm text-text-secondary group-hover:text-text-primary transition-colors duration-200">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Mail size={14} className="text-primary" />
              </div>
              <span className="truncate">{client.primary_email}</span>
            </div>
          )}
          {client.primary_phone && (
            <div className="flex items-center gap-2 text-sm text-text-secondary group-hover:text-text-primary transition-colors duration-200">
              <div className="w-7 h-7 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
                <Phone size={14} className="text-success" />
              </div>
              <span>{client.primary_phone}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border/30">
          <div className="flex items-center gap-2 text-sm text-text-tertiary">
            <div className="w-6 h-6 rounded-md bg-accent/10 flex items-center justify-center">
              <Users size={12} className="text-accent" />
            </div>
            <span>{client.linked_galleries_count} galleries</span>
          </div>
          <StatusBadge status={client.status} size="sm" />
        </div>

        {/* Tags */}
        {client.tags && client.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {client.tags.slice(0, 3).map((tag) => (
              <span
                key={tag.tag_id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-surface-hover/70 backdrop-blur-sm border border-border/30 hover:border-border/50 transition-colors"
              >
                <span
                  className="w-2 h-2 rounded-full shadow-sm"
                  style={{ backgroundColor: tag.color || '#6B7280' }}
                />
                {tag.name}
              </span>
            ))}
            {client.tags.length > 3 && (
              <span className="text-[11px] text-text-tertiary px-2 py-1">+{client.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

/* =============================================================================
   Empty State Component
   ============================================================================= */

interface ClientEmptyStateProps {
  hasFilters: boolean;
  onCreateClient: () => void;
}

const ClientEmptyState: React.FC<ClientEmptyStateProps> = ({ hasFilters, onCreateClient }) => {
  return (
    <div className="card-glass rounded-2xl p-12 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
        <UserPlus size={32} className="text-primary" />
      </div>
      <h3 className="text-xl font-semibold text-text-primary mb-2">
        {hasFilters ? 'No clients found' : 'No clients yet'}
      </h3>
      <p className="text-text-secondary mb-6 max-w-md mx-auto">
        {hasFilters
          ? 'Try adjusting your search or filter criteria to find what you\'re looking for.'
          : 'Start building your client relationships by adding your first client.'}
      </p>
      {!hasFilters && (
        <AppButton onClick={onCreateClient} variant="primary" leftIcon={<Plus size={20} />} shine className="px-8">
          Get Started
        </AppButton>
      )}
    </div>
  );
};

export default ClientsPage;
