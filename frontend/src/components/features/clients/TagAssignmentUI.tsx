/**
 * TagAssignmentUI Component
 *
 * Visual interface for assigning and removing tags from clients.
 * Supports tag selection, creation, and bulk operations.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Tag,
  Plus,
  X,
  ChevronDown,
  Search,
  Loader2,
  Check,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppBadge } from '../../ui/AppBadge';
import { AppInput } from '../../ui/AppInput';
import { useToast } from '../../ui/Toast';
import { clientService } from '../../../services/clientService';
import type { ClientTag } from '../../../types/client';

/* =============================================================================
   Types
   ============================================================================= */

interface TagAssignmentUIProps {
  /** Workspace ID */
  workspaceId: string;
  /** Client ID (single client) */
  clientId?: string;
  /** Client IDs (bulk operation) */
  clientIds?: string[];
  /** Current tags assigned to client(s) */
  currentTags: ClientTag[];
  /** Callback when tags are modified */
  onTagsChanged?: () => void;
  /** Whether the component is read-only */
  readOnly?: boolean;
  /** Compact mode (smaller UI) */
  compact?: boolean;
}

interface WorkspaceTag extends ClientTag {
  isAssigned: boolean;
}

/* =============================================================================
   TagAssignmentUI Component
   ============================================================================= */

export const TagAssignmentUI: React.FC<TagAssignmentUIProps> = ({
  workspaceId,
  clientId,
  clientIds,
  currentTags,
  onTagsChanged,
  readOnly = false,
  compact = false,
}) => {
  const { addToast } = useToast();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // State
  const [workspaceTags, setWorkspaceTags] = useState<WorkspaceTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6'); // Default blue

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
        setCreating(false);
        setNewTagName('');
      }
    };

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  // Fetch workspace tags
  const fetchWorkspaceTags = async () => {
    setLoading(true);

    try {
      const tags = await clientService.getWorkspaceTags(workspaceId);

      // Mark tags as assigned/unassigned
      const tagsWithAssignment: WorkspaceTag[] = tags.map((tag: ClientTag) => ({
        ...tag,
        isAssigned: currentTags.some((ct) => ct.tag_id === tag.tag_id),
      }));

      setWorkspaceTags(tagsWithAssignment);
    } catch (error) {
      addToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Failed to load tags',
      });
    } finally {
      setLoading(false);
    }
  };

  // Load tags on mount
  useEffect(() => {
    if (dropdownOpen && workspaceTags.length === 0) {
      fetchWorkspaceTags();
    }
  }, [dropdownOpen]);

  // Filter tags by search query
  const filteredTags = workspaceTags.filter((tag) =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Add tag handler
  const handleAddTag = async (tagId: string) => {
    try {
      const targetIds = clientIds || (clientId ? [clientId] : []);

      if (targetIds.length === 0) {
        addToast({
          variant: 'error',
          message: 'No client selected',
        });
        return;
      }

      // Add tag to client(s)
      for (const id of targetIds) {
        await clientService.addTags(workspaceId, id, { tag_ids: [tagId] });
      }

      addToast({
        variant: 'success',
        message: targetIds.length === 1 ? 'Tag added' : `Tag added to ${targetIds.length} clients`,
      });

      // Refresh tags
      await fetchWorkspaceTags();
      onTagsChanged?.();
    } catch (error) {
      addToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Failed to add tag',
      });
    }
  };

  // Remove tag handler
  const handleRemoveTag = async (tagId: string) => {
    try {
      const targetIds = clientIds || (clientId ? [clientId] : []);

      if (targetIds.length === 0) {
        return;
      }

      // Remove tag from client(s)
      for (const id of targetIds) {
        await clientService.removeTag(workspaceId, id, tagId);
      }

      addToast({
        variant: 'success',
        message: targetIds.length === 1 ? 'Tag removed' : `Tag removed from ${targetIds.length} clients`,
      });

      // Refresh tags
      await fetchWorkspaceTags();
      onTagsChanged?.();
    } catch (error) {
      addToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Failed to remove tag',
      });
    }
  };

  // Create new tag
  // Note: Tag creation requires separate workspace tags API endpoint
  // For now, we show an informational message
  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      addToast({
        variant: 'error',
        message: 'Please enter a tag name',
      });
      return;
    }

    try {
      // Tag creation is handled at workspace level via admin settings
      // This UI will be updated when workspace tag management is added
      addToast({
        variant: 'info',
        message: 'Tag creation coming soon. Please create tags in workspace settings.',
      });

      // Reset form
      setNewTagName('');
      setNewTagColor('#3B82F6');
      setCreating(false);

      // Refresh tags
      await fetchWorkspaceTags();
    } catch (error) {
      addToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Failed to create tag',
      });
    }
  };

  // Predefined tag colors
  const tagColors = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#F97316', // Orange
    '#6366F1', // Indigo
    '#6B7280', // Gray
  ];

  return (
    <div className={`${compact ? 'space-y-2' : 'space-y-3'}`}>
      {/* Current Tags */}
      {currentTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {currentTags.map((tag) => (
            <AppBadge
              key={tag.tag_id}
              variant="default"
              size={compact ? 'sm' : 'md'}
              style={{ backgroundColor: tag.color || '#3B82F6', color: 'white' }}
              removable={!readOnly}
              onRemove={() => handleRemoveTag(tag.tag_id)}
            >
              {tag.name}
            </AppBadge>
          ))}
        </div>
      )}

      {/* Add Tag Button / Dropdown */}
      {!readOnly && (
        <div className="relative" ref={dropdownRef}>
          <AppButton
            size={compact ? 'sm' : 'md'}
            variant="secondary"
            leftIcon={<Plus className="h-4 w-4" />}
            rightIcon={<ChevronDown className="h-4 w-4" />}
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            {currentTags.length === 0 ? 'Add Tag' : 'Add More'}
          </AppButton>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <div className="absolute z-50 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-hidden">
              {/* Search Bar */}
              <div className="p-3 border-b border-gray-200">
                <AppInput
                  type="text"
                  placeholder="Search tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  leftIcon={<Search className="h-4 w-4" />}
                  className="text-sm"
                />
              </div>

              {/* Tags List */}
              <div className="max-h-64 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                ) : filteredTags.length === 0 ? (
                  <div className="text-center py-6 text-gray-500 text-sm">
                    {searchQuery ? 'No tags found' : 'No tags available'}
                  </div>
                ) : (
                  <div className="py-1">
                    {filteredTags.map((tag) => (
                      <button
                        key={tag.tag_id}
                        onClick={() => {
                          if (tag.isAssigned) {
                            handleRemoveTag(tag.tag_id);
                          } else {
                            handleAddTag(tag.tag_id);
                          }
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors flex items-center justify-between group"
                      >
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: tag.color || '#3B82F6' }}
                          />
                          <span className="text-sm text-gray-900">{tag.name}</span>
                        </div>

                        {tag.isAssigned && (
                          <Check className="h-4 w-4 text-blue-600" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Create New Tag */}
              <div className="border-t border-gray-200 p-3 bg-gray-50">
                {creating ? (
                  <div className="space-y-2">
                    <AppInput
                      type="text"
                      placeholder="Tag name"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      className="text-sm"
                      autoFocus
                    />

                    {/* Color Picker */}
                    <div className="flex items-center space-x-1">
                      {tagColors.map((color) => (
                        <button
                          key={color}
                          onClick={() => setNewTagColor(color)}
                          className={`w-6 h-6 rounded-full transition-transform ${newTagColor === color ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : ''
                            }`}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>

                    <div className="flex space-x-2">
                      <AppButton
                        size="sm"
                        variant="primary"
                        onClick={handleCreateTag}
                        className="flex-1"
                      >
                        Create
                      </AppButton>
                      <AppButton
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setCreating(false);
                          setNewTagName('');
                        }}
                      >
                        Cancel
                      </AppButton>
                    </div>
                  </div>
                ) : (
                  <AppButton
                    size="sm"
                    variant="ghost"
                    leftIcon={<Plus className="h-4 w-4" />}
                    onClick={() => setCreating(true)}
                    className="w-full"
                  >
                    Create New Tag
                  </AppButton>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {currentTags.length === 0 && readOnly && (
        <p className="text-sm text-gray-500 italic">No tags assigned</p>
      )}
    </div>
  );
};
