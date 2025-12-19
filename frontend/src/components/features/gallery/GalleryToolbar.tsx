/**
 * GalleryToolbar Component
 * Toolbar with actions, view toggles, and filters
 */

import React from 'react';
import { Grid, List } from 'lucide-react';
import { Checkbox } from '../../ui/FormControls';

export type ViewMode = 'grid' | 'list';
export type FilterType = 'all' | 'picks' | 'favorites' | 'selections';

export interface GalleryToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  filter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onViewAsClient?: () => void;
  onFindPeople?: () => void;
  onAIStory?: () => void;
  onShare?: () => void;
  onSettings?: () => void;
  onUpload?: () => void;
  selectAll?: boolean;
  onSelectAllChange?: (selected: boolean) => void;
  selectedCount?: number;
}

export const GalleryToolbar: React.FC<GalleryToolbarProps> = ({
  viewMode,
  onViewModeChange,
  selectAll = false,
  onSelectAllChange,
  selectedCount = 0,
}) => {
  return (
    <div className="space-y-4">
      {/* Main Row: View Mode and Select All */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: View Mode Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-surface rounded-lg border border-border">
            <button
              onClick={() => onViewModeChange('grid')}
              className={`
                p-1.5 rounded transition-colors
                ${viewMode === 'grid'
                  ? 'bg-primary text-white'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
                }
              `}
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
            >
              <Grid size={18} />
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={`
                p-1.5 rounded transition-colors
                ${viewMode === 'list'
                  ? 'bg-primary text-white'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
                }
              `}
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
            >
              <List size={18} />
            </button>
          </div>

          {/* Select All */}
          {onSelectAllChange && (
            <div className="flex items-center gap-2 ml-4 pl-4 border-l border-border">
              <Checkbox
                checked={selectAll}
                onChange={(e) => onSelectAllChange(e.target.checked)}
                label="Select All"
              />
              {selectedCount > 0 && (
                <span className="text-sm text-text-secondary">
                  {selectedCount} selected
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
