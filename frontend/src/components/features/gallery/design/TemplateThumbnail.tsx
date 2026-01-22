/**
 * Template Thumbnail Component
 *
 * Displays individual template card with:
 * - Thumbnail preview (or placeholder)
 * - Template name and category
 * - System/Custom badge
 * - Apply, Edit, Delete buttons
 *
 * Feature: Enhancement 3 - Custom Templates
 */

import React, { useState } from 'react';
import { Trash2, Edit2, Play } from 'lucide-react';

interface Template {
  template_id: string;
  workspace_id: string | null;
  name: string;
  description?: string;
  category: string;
  tags: string[];
  design_config: any;
  thumbnail_url?: string;
  is_system: boolean;
  created_at: string;
}

interface TemplateThumbnailProps {
  template: Template;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const TemplateThumbnail: React.FC<TemplateThumbnailProps> = ({
  template,
  onSelect,
  onEdit,
  onDelete,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);

  const categoryLabel = template.category.charAt(0).toUpperCase() + template.category.slice(1);

  return (
    <div className="relative group rounded-lg border border-border-default overflow-hidden bg-bg-secondary hover:shadow-lg hover:border-accent-primary transition-all">
      {/* Thumbnail */}
      <div className="relative aspect-square bg-bg-tertiary overflow-hidden">
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gradient-to-r from-bg-secondary to-bg-tertiary animate-pulse" />
        )}

        {template.thumbnail_url ? (
          <img
            src={template.thumbnail_url}
            alt={template.name}
            className="w-full h-full object-cover"
            onLoad={() => setImageLoaded(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-tertiary text-4xl">
            🎨
          </div>
        )}

        {/* Overlay with buttons */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-3">
          <button
            onClick={onSelect}
            className="w-full px-3 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
          >
            <Play className="w-4 h-4" />
            Apply
          </button>

          <div className="flex gap-2 w-full">
            {onEdit && !template.is_system && (
              <button
                onClick={onEdit}
                className="flex-1 px-2 py-2 bg-bg-secondary text-text-primary rounded hover:bg-bg-tertiary transition-colors flex items-center justify-center"
                title="Edit template"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}

            {onDelete && !template.is_system && (
              <button
                onClick={onDelete}
                className="flex-1 px-2 py-2 bg-bg-secondary text-red-500 rounded hover:bg-red-500/10 transition-colors flex items-center justify-center"
                title="Delete template"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* System Badge */}
        {template.is_system && (
          <div className="absolute top-2 right-2 bg-accent-primary text-white px-2 py-1 rounded text-xs font-medium">
            System
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="p-3 space-y-2">
        {/* Name and Category */}
        <div>
          <h3 className="font-medium text-sm text-text-primary truncate">{template.name}</h3>
          <p className="text-xs text-text-secondary">{categoryLabel}</p>
        </div>

        {/* Description */}
        {template.description && (
          <p className="text-xs text-text-tertiary line-clamp-2">{template.description}</p>
        )}

        {/* Tags */}
        {template.tags && template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {template.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 bg-bg-tertiary text-text-secondary rounded"
              >
                #{tag}
              </span>
            ))}
            {template.tags.length > 2 && (
              <span className="text-xs px-2 py-0.5 text-text-tertiary">
                +{template.tags.length - 2} more
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateThumbnail;
