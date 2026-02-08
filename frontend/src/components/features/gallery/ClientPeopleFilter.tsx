/**
 * ClientPeopleFilter Component
 *
 * Client-facing people filter for public galleries.
 * Shows detected people as filterable tags when show_people_filter is enabled.
 * Allows clients to filter photos by person without editing capabilities.
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import { X, Users, Search, Loader2, UserCircle } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { faceApiService, FaceGroupWithGalleryStats } from '../../../services/faceApiService';

interface ClientPeopleFilterProps {
  galleryId: string;
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  onFilterByPerson: (groupId: string | null, personName?: string) => void;
  selectedPersonId?: string | null;
}

export const ClientPeopleFilter: React.FC<ClientPeopleFilterProps> = ({
  galleryId,
  workspaceId,
  isOpen,
  onClose,
  onFilterByPerson,
  selectedPersonId,
}) => {
  const [groups, setGroups] = useState<FaceGroupWithGalleryStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch face groups for this gallery
  const fetchGroups = useCallback(async () => {
    if (!workspaceId || !galleryId) return;

    setLoading(true);
    setError(null);
    try {
      const result = await faceApiService.getGalleryFaceGroups(
        workspaceId,
        galleryId,
        { limit: 100 }
      );
      setGroups(result.groups);
    } catch (err) {
      console.error('Failed to fetch people:', err);
      setError('Unable to load people. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, galleryId]);

  useEffect(() => {
    if (isOpen) {
      fetchGroups();
    }
  }, [isOpen, fetchGroups]);

  // Filter groups by search
  const filteredGroups = groups.filter((group) => {
    if (!searchQuery) return true;
    const name = group.person_name || group.name || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Handle person click
  const handlePersonClick = (group: FaceGroupWithGalleryStats) => {
    const personName = group.person_name || group.name;
    onFilterByPerson(group.id, personName || undefined);
    onClose();
  };

  // Clear filter
  const handleClearFilter = () => {
    onFilterByPerson(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="people-filter-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative h-full w-full max-w-sm bg-surface border-l border-border shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <h2 id="people-filter-title" className="text-lg font-semibold">
                Filter by Person
              </h2>
              {groups.length > 0 && (
                <span className="text-sm text-text-secondary">
                  ({groups.length})
                </span>
              )}
            </div>
            <AppButton
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close panel"
            >
              <X className="w-5 h-5" />
            </AppButton>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-surface-hover border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label="Search people"
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Loading people...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
              <p className="text-center text-error mb-4">{error}</p>
              <AppButton variant="outline" size="sm" onClick={fetchGroups}>
                Try Again
              </AppButton>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
              <UserCircle className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-center mb-2">
                {searchQuery ? 'No people match your search' : 'No people detected in this gallery'}
              </p>
              {searchQuery && (
                <AppButton
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchQuery('')}
                >
                  Clear Search
                </AppButton>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {filteredGroups.map((group, index) => (
                <PersonCard
                  key={group.id}
                  group={group}
                  index={index}
                  isSelected={selectedPersonId === group.id}
                  onClick={() => handlePersonClick(group)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-surface/95 backdrop-blur-sm border-t border-border">
          <AppButton
            variant="outline"
            className="w-full"
            onClick={handleClearFilter}
          >
            {selectedPersonId ? 'Clear Filter' : 'Show All Photos'}
          </AppButton>
        </div>
      </div>
    </div>
  );
};

// PersonCard subcomponent
interface PersonCardProps {
  group: FaceGroupWithGalleryStats;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}

const PersonCard: React.FC<PersonCardProps> = memo(({
  group,
  index,
  isSelected,
  onClick,
}) => {
  const displayName = group.person_name || group.name || `Person ${index + 1}`;
  const thumbnailUrl = group.representative_thumbnail_url;
  const isNamed = !!(group.person_name || group.name);
  const photoCount = group.gallery_photo_count ?? group.face_count;

  return (
    <button
      className={`group flex flex-col items-center p-3 rounded-xl border cursor-pointer transition-all duration-200 w-full ${
        isSelected
          ? 'bg-primary/10 border-primary ring-2 ring-primary/30'
          : 'bg-surface-hover hover:bg-surface-active border-border/50 hover:border-primary/30'
      }`}
      onClick={onClick}
      aria-pressed={isSelected}
      aria-label={`Filter by ${displayName}, ${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}`}
    >
      {/* Thumbnail */}
      <div className={`w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 mb-2 ${
        isSelected ? 'ring-2 ring-primary' : ''
      }`}>
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UserCircle className="w-8 h-8 text-text-tertiary" />
          </div>
        )}
      </div>

      {/* Name */}
      <span
        className={`text-xs truncate max-w-full px-1 ${
          isNamed
            ? 'font-medium text-text-primary'
            : 'text-text-tertiary italic'
        }`}
      >
        {displayName}
      </span>

      {/* Photo count */}
      <span className="text-xs text-text-tertiary">
        {photoCount} {photoCount === 1 ? 'photo' : 'photos'}
      </span>
    </button>
  );
});

PersonCard.displayName = 'PersonCard';

export default ClientPeopleFilter;
