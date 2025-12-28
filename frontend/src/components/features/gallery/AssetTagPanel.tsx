/**
 * AssetTagPanel Component
 * Displays and manages tags for an asset (both AI-generated and manual)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Tag,
  Plus,
  X,
  Loader2,
  Sparkles,
  User,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../ui/Toast';
import { useAssetTags, AssetTag, TagSource } from '../../../hooks/useAssetTags';
import { AppButton } from '../../ui/AppButton';
import { smartTaggingService } from '../../../services/metadataService';

interface AssetTagPanelProps {
  assetId: string;
  onReanalyze?: () => void;
  showReanalyzeButton?: boolean;
  compact?: boolean;
  /** Called after successful reanalyze to refresh parent state */
  onReanalyzeComplete?: () => void;
}

// Tag source colors and icons
const SOURCE_CONFIG: Record<
  TagSource,
  { icon: React.ReactNode; color: string; bgColor: string; label: string }
> = {
  manual: {
    icon: <User className="w-3 h-3" />,
    color: 'text-primary',
    bgColor: 'bg-primary/10 border-primary/20',
    label: 'Manual',
  },
  ai_vision: {
    icon: <Sparkles className="w-3 h-3" />,
    color: 'text-accent',
    bgColor: 'bg-accent/10 border-accent/20',
    label: 'AI Vision',
  },
  ai_gemini: {
    icon: <Sparkles className="w-3 h-3" />,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10 border-purple-500/20',
    label: 'AI Gemini',
  },
  ai_local: {
    icon: <Sparkles className="w-3 h-3" />,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10 border-green-500/20',
    label: 'Local AI',
  },
};

export const AssetTagPanel: React.FC<AssetTagPanelProps> = ({
  assetId,
  onReanalyze,
  showReanalyzeButton = true,
  compact = false,
  onReanalyzeComplete,
}) => {
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [showReanalyzeConfirm, setShowReanalyzeConfirm] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  const {
    tags,
    manualTags,
    aiTags,
    loading,
    error,
    refetch,
    addTag,
    removeTag,
    isAdding,
    isRemoving,
  } = useAssetTags({
    workspaceId: workspace?.workspace_id || '',
    assetId,
  });

  // Focus input when adding new tag
  useEffect(() => {
    if (isAddingNew && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAddingNew]);

  const handleAddTag = useCallback(async () => {
    if (!newTagName.trim()) {
      setIsAddingNew(false);
      return;
    }

    try {
      await addTag(newTagName.trim());
      setNewTagName('');
      setIsAddingNew(false);
      addToast({ message: 'Tag added', variant: 'success' });
    } catch {
      addToast({ message: 'Failed to add tag', variant: 'error' });
    }
  }, [newTagName, addTag, addToast]);

  const handleRemoveTag = useCallback(
    async (tag: AssetTag) => {
      try {
        await removeTag(tag.tag_id);
        addToast({ message: `Removed "${tag.name}"`, variant: 'success' });
      } catch {
        addToast({ message: 'Failed to remove tag', variant: 'error' });
      }
    },
    [removeTag, addToast]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddTag();
    } else if (e.key === 'Escape') {
      setIsAddingNew(false);
      setNewTagName('');
    }
  };

  // Handle reanalyze with confirmation
  const handleReanalyze = useCallback(async () => {
    if (!workspace?.workspace_id) return;

    setIsReanalyzing(true);
    setShowReanalyzeConfirm(false);

    try {
      await smartTaggingService.reanalyzeAsset(workspace.workspace_id, assetId);
      addToast({
        message: 'Asset queued for re-analysis. AI tags will update shortly.',
        variant: 'success',
      });
      // Refetch tags to show cleared AI tags
      refetch();
      // Notify parent
      onReanalyze?.();
      onReanalyzeComplete?.();
    } catch {
      addToast({
        message: 'Failed to queue asset for re-analysis',
        variant: 'error',
      });
    } finally {
      setIsReanalyzing(false);
    }
  }, [workspace?.workspace_id, assetId, addToast, refetch, onReanalyze, onReanalyzeComplete]);

  // Render a single tag chip
  const renderTag = (tag: AssetTag) => {
    const config = SOURCE_CONFIG[tag.source];
    const isBeingRemoved = isRemoving === tag.tag_id;

    return (
      <div
        key={tag.tag_id}
        className={`
          group inline-flex items-center gap-1.5 px-2.5 py-1
          text-sm border rounded-full transition-all
          ${config.bgColor}
          ${isBeingRemoved ? 'opacity-50' : ''}
        `}
        title={`${tag.name} (${config.label})${
          tag.confidence ? ` - ${Math.round(tag.confidence * 100)}% confidence` : ''
        }`}
      >
        <span className={config.color}>{config.icon}</span>
        <span className="text-text-primary">{tag.name}</span>

        {/* Confidence badge for AI tags */}
        {tag.confidence !== undefined && tag.confidence !== null && (
          <span className="text-xs text-text-tertiary">
            {Math.round(tag.confidence * 100)}%
          </span>
        )}

        {/* Remove button (only for manual tags) */}
        {tag.source === 'manual' && (
          <button
            onClick={() => handleRemoveTag(tag)}
            disabled={isBeingRemoved}
            className={`
              opacity-0 group-hover:opacity-100 ml-0.5 p-0.5 rounded-full
              hover:bg-error/20 text-text-tertiary hover:text-error
              transition-all disabled:cursor-not-allowed
            `}
            aria-label={`Remove ${tag.name} tag`}
          >
            {isBeingRemoved ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <X className="w-3 h-3" />
            )}
          </button>
        )}
      </div>
    );
  };

  if (loading && tags.length === 0) {
    return (
      <div className="flex items-center justify-center py-4 text-text-tertiary">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-4 text-error text-sm">
        <AlertCircle className="w-4 h-4" />
        <span>Failed to load tags</span>
        <AppButton variant="ghost" size="sm" onClick={refetch}>
          Retry
        </AppButton>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${compact ? '' : 'p-4'}`}>
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Tags
            {tags.length > 0 && (
              <span className="text-text-tertiary">({tags.length})</span>
            )}
          </h3>
          <div className="flex items-center gap-1">
            {showReanalyzeButton && (
              <AppButton
                variant="ghost"
                size="sm"
                onClick={() => setShowReanalyzeConfirm(true)}
                disabled={isReanalyzing}
                title="Re-analyze with AI"
              >
                {isReanalyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </AppButton>
            )}
          </div>
        </div>
      )}

      {/* Reanalyze Confirmation Dialog */}
      {showReanalyzeConfirm && (
        <div className="mb-3 p-3 bg-warning/10 border border-warning/30 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">
                Re-analyze this photo?
              </p>
              <p className="text-xs text-text-secondary mt-1">
                This will remove all AI-generated tags and queue the photo for fresh analysis.
                Manual tags will be preserved.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <AppButton
                  variant="outline"
                  size="sm"
                  onClick={handleReanalyze}
                  disabled={isReanalyzing}
                >
                  {isReanalyzing ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      Queuing...
                    </>
                  ) : (
                    'Yes, re-analyze'
                  )}
                </AppButton>
                <AppButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowReanalyzeConfirm(false)}
                  disabled={isReanalyzing}
                >
                  Cancel
                </AppButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Tags Section */}
      {aiTags.length > 0 && (
        <div className="space-y-2">
          {!compact && (
            <p className="text-xs text-text-tertiary uppercase tracking-wider">
              AI Generated
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {aiTags.map(renderTag)}
          </div>
        </div>
      )}

      {/* Manual Tags Section */}
      <div className="space-y-2">
        {!compact && manualTags.length > 0 && (
          <p className="text-xs text-text-tertiary uppercase tracking-wider">
            Manual Tags
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {manualTags.map(renderTag)}

          {/* Add tag input/button */}
          {isAddingNew ? (
            <div className="inline-flex items-center gap-1 px-2 py-1 border border-primary rounded-full bg-surface">
              <input
                ref={inputRef}
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                  if (!newTagName.trim()) {
                    setIsAddingNew(false);
                  }
                }}
                placeholder="Tag name..."
                className="w-24 text-sm bg-transparent outline-none placeholder-text-tertiary"
                disabled={isAdding}
              />
              {isAdding ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              ) : (
                <>
                  <button
                    onClick={handleAddTag}
                    disabled={!newTagName.trim()}
                    className="p-0.5 text-primary hover:text-primary-hover disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingNew(false);
                      setNewTagName('');
                    }}
                    className="p-0.5 text-text-tertiary hover:text-text-primary"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={() => setIsAddingNew(true)}
              className="
                inline-flex items-center gap-1 px-2.5 py-1 text-sm
                border border-dashed border-border rounded-full
                text-text-tertiary hover:text-text-primary
                hover:border-primary hover:bg-primary/5
                transition-all
              "
            >
              <Plus className="w-3 h-3" />
              <span>Add Tag</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {tags.length === 0 && !isAddingNew && (
        <div className="text-center py-4 text-text-tertiary text-sm">
          <Tag className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No tags yet</p>
          <p className="text-xs mt-1">
            AI tags will appear after analysis completes
          </p>
        </div>
      )}
    </div>
  );
};

export default AssetTagPanel;
