import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Search,
  Grid,
  List,
  MoreVertical,
  Edit,
  Trash2,
  Loader2,
  UserCircle,
  Users2,
  ImageIcon,
  RefreshCw,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '../../components/landing/animations/presets';
import { useAuth } from '../../contexts/AuthContext';
import { AppButton } from '../../components/ui/AppButton';
import { DeleteConfirmationDialog } from '../../components/ui/DeleteConfirmationDialog';
import { useToast } from '../../components/ui/Toast';
import { faceApiService, FaceGroup } from '../../services/faceApiService';

/* =============================================================================
   PeoplePage Component

   Displays all detected people (face groups) in the workspace with thumbnails.
   Clicking a person navigates to a filtered view showing all their photos.
   ============================================================================= */

type ViewMode = 'grid' | 'list';

const PeoplePage: React.FC = () => {
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const { t } = useTranslation(['common']);

  // View and filter state
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Data state
  const [groups, setGroups] = useState<FaceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [total, setTotal] = useState(0);

  // Edit state
  const [editingName, setEditingName] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<FaceGroup | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch face groups
  const fetchGroups = useCallback(async (showRefreshSpinner = false) => {
    if (!workspace?.workspace_id) return;

    if (showRefreshSpinner) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const result = await faceApiService.getFaceGroups(workspace.workspace_id, {
        minFaces: 1,
        limit: 100,
      });
      setGroups(result.groups);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to fetch people:', err);
      addToast({
        message: 'Failed to load people. Please try again.',
        variant: 'error',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspace?.workspace_id, addToast]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Filter groups by search - uses person_name (canonical) or legacy name field
  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groups;
    const query = searchQuery.toLowerCase();
    return groups.filter((group, index) => {
      const name = group.person_name || group.name || `Person ${index + 1}`;
      return name.toLowerCase().includes(query);
    });
  }, [groups, searchQuery]);

  // Handlers
  const handlePersonClick = (groupId: string) => {
    // Navigate to libraries page with person filter
    navigate(`/workspace/libraries?person=${groupId}`);
  };

  const handleRename = async (groupId: string) => {
    if (!workspace?.workspace_id || !newName.trim()) return;

    try {
      // Use the new person naming API which creates/updates person entity
      await faceApiService.namePerson(
        workspace.workspace_id,
        groupId,
        newName.trim()
      );
      addToast({ message: 'Person named successfully', variant: 'success' });
      setEditingName(null);
      setNewName('');
      fetchGroups();
    } catch (err) {
      console.error('Failed to name person:', err);
      addToast({ message: 'Failed to name person', variant: 'error' });
    }
  };

  const handleDeleteClick = (group: FaceGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    setGroupToDelete(group);
    setDeleteDialogOpen(true);
    setActiveMenu(null);
  };

  const handleDeleteConfirm = async () => {
    if (!workspace?.workspace_id || !groupToDelete) return;

    setIsDeleting(true);
    try {
      await faceApiService.deleteFaceGroup(workspace.workspace_id, groupToDelete.id);
      addToast({ message: 'Person deleted successfully', variant: 'success' });
      setDeleteDialogOpen(false);
      setGroupToDelete(null);
      fetchGroups();
    } catch (err) {
      addToast({ message: 'Failed to delete person', variant: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenu(null);
    if (activeMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [activeMenu]);

  return (
    <div className="min-h-full bg-background">
      {/* Page Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Users2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-text-primary">
                  {t('nav.people', 'People')}
                </h1>
                <p className="text-sm text-text-secondary">
                  {total} {total === 1 ? 'person' : 'people'} detected in your photos
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Refresh button */}
              <AppButton
                variant="ghost"
                size="sm"
                onClick={() => fetchGroups(true)}
                disabled={refreshing}
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </AppButton>

              {/* View toggle */}
              <div className="flex items-center gap-1 p-1 bg-surface-hover rounded-lg">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-surface text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                  title="Grid view"
                >
                  <Grid size={18} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'list'
                      ? 'bg-surface text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                  title="List view"
                >
                  <List size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-text-secondary">
            <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary" />
            <p>Loading people...</p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-text-secondary">
            <div className="w-24 h-24 rounded-full bg-surface-hover flex items-center justify-center mb-6">
              <UserCircle className="w-12 h-12 opacity-50" />
            </div>
            {searchQuery ? (
              <>
                <h3 className="text-lg font-medium text-text-primary mb-2">
                  No people match your search
                </h3>
                <p className="text-center max-w-md">
                  Try adjusting your search terms or clear the search to see all detected people.
                </p>
                <AppButton
                  variant="outline"
                  className="mt-4"
                  onClick={() => setSearchQuery('')}
                >
                  Clear Search
                </AppButton>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium text-text-primary mb-2">
                  No people detected yet
                </h3>
                <p className="text-center max-w-md">
                  Face detection runs automatically when photos are uploaded.
                  Upload some photos with faces to see them appear here.
                </p>
                <AppButton
                  variant="primary"
                  className="mt-4"
                  onClick={() => navigate('/workspace/libraries')}
                >
                  Go to Library
                </AppButton>
              </>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4"
          >
            {filteredGroups.map((group, index) => (
              <PersonCard
                key={group.id}
                group={group}
                index={index}
                isEditing={editingName === group.id}
                editName={newName}
                onEditNameChange={setNewName}
                onStartEdit={(id, currentName) => {
                  setEditingName(id);
                  setNewName(currentName);
                }}
                onSaveEdit={() => handleRename(group.id)}
                onCancelEdit={() => {
                  setEditingName(null);
                  setNewName('');
                }}
                onClick={() => handlePersonClick(group.id)}
                onDelete={(e) => handleDeleteClick(group, e)}
                activeMenu={activeMenu}
                onMenuToggle={(id) => setActiveMenu(activeMenu === id ? null : id)}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-2"
          >
            {filteredGroups.map((group, index) => (
              <PersonListItem
                key={group.id}
                group={group}
                index={index}
                isEditing={editingName === group.id}
                editName={newName}
                onEditNameChange={setNewName}
                onStartEdit={(id, currentName) => {
                  setEditingName(id);
                  setNewName(currentName);
                }}
                onSaveEdit={() => handleRename(group.id)}
                onCancelEdit={() => {
                  setEditingName(null);
                  setNewName('');
                }}
                onClick={() => handlePersonClick(group.id)}
                onDelete={(e) => handleDeleteClick(group, e)}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        deleteType="soft"
        entityType="gallery"
        entityName={groupToDelete?.name || 'this person'}
        isLoading={isDeleting}
      />
    </div>
  );
};

/* =============================================================================
   PersonCard Component - Grid View
   ============================================================================= */

interface PersonCardProps {
  group: FaceGroup;
  index: number;
  isEditing: boolean;
  editName: string;
  onEditNameChange: (name: string) => void;
  onStartEdit: (id: string, currentName: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  activeMenu: string | null;
  onMenuToggle: (id: string) => void;
}

const PersonCard: React.FC<PersonCardProps> = ({
  group,
  index,
  isEditing,
  editName,
  onEditNameChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onClick,
  onDelete,
  activeMenu,
  onMenuToggle,
}) => {
  // Prefer person_name (from people table) over legacy name field
  const displayName = group.person_name || group.name || `Person ${index + 1}`;
  const thumbnailUrl = group.representative_thumbnail_url;
  const isNamed = !!(group.person_name || group.name);

  return (
    <motion.div
      variants={staggerItem}
      className="group relative flex flex-col items-center p-4 bg-surface hover:bg-surface-hover rounded-2xl border border-border/50 hover:border-primary/30 cursor-pointer transition-all duration-200 hover:shadow-lg"
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 mb-3 ring-2 ring-border/30 group-hover:ring-primary/30 transition-all">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={displayName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UserCircle className="w-12 h-12 md:w-14 md:h-14 text-text-tertiary" />
          </div>
        )}
      </div>

      {/* Name */}
      {isEditing ? (
        <div className="w-full" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="w-full px-3 py-1.5 text-sm text-center bg-surface border border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            autoFocus
          />
          <div className="flex justify-center gap-2 mt-2">
            <button
              onClick={onSaveEdit}
              className="text-xs text-primary hover:underline"
            >
              Save
            </button>
            <button
              onClick={onCancelEdit}
              className="text-xs text-text-tertiary hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <span
          className={`text-sm truncate max-w-full px-2 text-center ${
            isNamed
              ? 'font-medium text-text-primary'
              : 'text-text-tertiary italic'
          }`}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onStartEdit(group.id, isNamed ? displayName : '');
          }}
          title={isNamed ? displayName : 'Double-click to name this person'}
        >
          {displayName}
        </span>
      )}

      {/* Photo count */}
      <span className="text-xs text-text-tertiary mt-1 flex items-center gap-1">
        <ImageIcon className="w-3 h-3" />
        {group.face_count} {group.face_count === 1 ? 'photo' : 'photos'}
      </span>

      {/* Menu button */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMenuToggle(group.id);
          }}
          className="p-1.5 rounded-lg bg-surface/80 hover:bg-surface text-text-secondary hover:text-text-primary shadow-sm"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {/* Dropdown menu */}
        {activeMenu === group.id && (
          <div className="absolute right-0 mt-1 w-36 bg-surface rounded-lg shadow-lg border border-border py-1 z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartEdit(group.id, displayName);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <Edit className="w-4 h-4" />
              Rename
            </button>
            <button
              onClick={onDelete}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error/10"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

/* =============================================================================
   PersonListItem Component - List View
   ============================================================================= */

interface PersonListItemProps {
  group: FaceGroup;
  index: number;
  isEditing: boolean;
  editName: string;
  onEditNameChange: (name: string) => void;
  onStartEdit: (id: string, currentName: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

const PersonListItem: React.FC<PersonListItemProps> = ({
  group,
  index,
  isEditing,
  editName,
  onEditNameChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onClick,
  onDelete,
}) => {
  // Prefer person_name (from people table) over legacy name field
  const displayName = group.person_name || group.name || `Person ${index + 1}`;
  const thumbnailUrl = group.representative_thumbnail_url;
  const isNamed = !!(group.person_name || group.name);

  return (
    <motion.div
      variants={staggerItem}
      className="group flex items-center gap-4 p-4 bg-surface hover:bg-surface-hover rounded-xl border border-border/50 hover:border-primary/30 cursor-pointer transition-all duration-200"
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="flex-shrink-0 w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 ring-2 ring-border/30 group-hover:ring-primary/30 transition-all">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={displayName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UserCircle className="w-8 h-8 text-text-tertiary" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={editName}
              onChange={(e) => onEditNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
              className="w-full max-w-xs px-3 py-1.5 text-sm bg-surface border border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
            <div className="flex gap-2 mt-1">
              <button
                onClick={onSaveEdit}
                className="text-xs text-primary hover:underline"
              >
                Save
              </button>
              <button
                onClick={onCancelEdit}
                className="text-xs text-text-tertiary hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3
              className={`truncate ${
                isNamed
                  ? 'font-medium text-text-primary'
                  : 'text-text-tertiary italic'
              }`}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onStartEdit(group.id, isNamed ? displayName : '');
              }}
              title={isNamed ? displayName : 'Double-click to name this person'}
            >
              {displayName}
            </h3>
            <p className="text-sm text-text-tertiary flex items-center gap-1">
              <ImageIcon className="w-3 h-3" />
              {group.face_count} {group.face_count === 1 ? 'photo' : 'photos'}
            </p>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStartEdit(group.id, displayName);
          }}
          className="p-2 rounded-lg hover:bg-surface text-text-secondary hover:text-text-primary"
          title="Rename"
        >
          <Edit className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg hover:bg-error/10 text-text-secondary hover:text-error"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};

export default PeoplePage;
