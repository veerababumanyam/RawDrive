/**
 * CullingToolbar Component
 * Smart filtering controls for bulk photo culling workflow
 */

import React, { useState, useCallback } from 'react';
import {
  SlidersHorizontal,
  Users,
  Sparkles,
  Focus,
  Sun,
  Grid,
  LayoutGrid,
  ArrowUpDown,
  RotateCcw,
  ChevronDown,
  Zap,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import type { CullingFilters, CullingStats } from '../../../services/cullingWorkflowService';
import type { CullingSortBy } from '../../../hooks/useCullingWorkflow';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CullingToolbarProps {
  /** Current filters */
  filters: CullingFilters;
  /** Current sort field */
  sortBy: CullingSortBy;
  /** Current sort order */
  sortOrder: 'asc' | 'desc';
  /** Statistics for display */
  stats: CullingStats | null;
  /** Callback to update filters */
  onFiltersChange: (filters: Partial<CullingFilters>) => void;
  /** Callback to reset filters */
  onResetFilters: () => void;
  /** Callback to change sort */
  onSortChange: (sortBy: CullingSortBy) => void;
  /** Callback to change sort order */
  onSortOrderChange: (order: 'asc' | 'desc') => void;
  /** Callback for auto-reject action */
  onAutoReject?: () => void;
  /** Number of grid columns */
  columns: number;
  /** Callback to change columns */
  onColumnsChange: (columns: number) => void;
  /** Whether actions are loading */
  isLoading?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Filter Presets
// ---------------------------------------------------------------------------

interface FilterPreset {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  filters: Partial<CullingFilters>;
}

const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'best-shots',
    name: 'Best Shots',
    description: 'High quality, sharp, well-exposed',
    icon: <Sparkles size={16} />,
    filters: {
      minOverallScore: 80,
      minSharpness: 80,
      hideBlur: true,
      showBokeh: true,
    },
  },
  {
    id: 'sharp-focus',
    name: 'Sharp Focus',
    description: 'Sharpness > 80%',
    icon: <Focus size={16} />,
    filters: {
      minSharpness: 80,
      hideBlur: true,
    },
  },
  {
    id: 'optimal-exposure',
    name: 'Optimal Exposure',
    description: 'Exposure in optimal range',
    icon: <Sun size={16} />,
    filters: {
      exposureOptimal: true,
    },
  },
  {
    id: 'with-faces',
    name: 'With Faces',
    description: 'Photos containing people',
    icon: <Users size={16} />,
    filters: {
      hasFaces: true,
    },
  },
];

// ---------------------------------------------------------------------------
// Slider Component
// ---------------------------------------------------------------------------

interface SliderProps {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  showValue?: boolean;
}

const Slider: React.FC<SliderProps> = ({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 5,
  showValue = true,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10);
    onChange(newValue === min ? undefined : newValue);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-text-secondary">{label}</label>
        {showValue && (
          <span className="text-xs text-text-tertiary">
            {value !== undefined ? `${value}%` : 'Any'}
          </span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? min}
        onChange={handleChange}
        className="w-full h-2 bg-surface-secondary rounded-lg appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const CullingToolbar: React.FC<CullingToolbarProps> = ({
  filters,
  sortBy,
  sortOrder,
  stats,
  onFiltersChange,
  onResetFilters,
  onSortChange,
  onSortOrderChange,
  onAutoReject,
  columns,
  onColumnsChange,
  isLoading = false,
  className = '',
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Check if any filters are active
  const hasActiveFilters =
    filters.minOverallScore !== undefined ||
    filters.minSharpness !== undefined ||
    filters.minExposure !== undefined ||
    filters.maxExposure !== undefined ||
    filters.hasFaces !== undefined ||
    filters.minFaces !== undefined ||
    filters.hideBlur ||
    filters.exposureOptimal;

  const handlePresetClick = useCallback(
    (preset: FilterPreset) => {
      onFiltersChange(preset.filters);
    },
    [onFiltersChange]
  );

  const sortOptions: { value: CullingSortBy; label: string }[] = [
    { value: 'overall_score', label: 'Quality Score' },
    { value: 'sharpness_score', label: 'Sharpness' },
    { value: 'exposure_score', label: 'Exposure' },
    { value: 'composition_score', label: 'Composition' },
    { value: 'face_count', label: 'Face Count' },
    { value: 'filename', label: 'Filename' },
  ];

  const currentSortLabel = sortOptions.find((opt) => opt.value === sortBy)?.label || 'Sort';

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Stats Row */}
      {stats && (
        <div className="flex items-center gap-4 text-sm">
          <span className="text-text-secondary">
            <span className="font-medium text-text-primary">{stats.total_photos}</span> photos
          </span>
          <span className="text-green-500">
            {stats.excellent_count} excellent
          </span>
          <span className="text-blue-500">
            {stats.good_count} good
          </span>
          <span className="text-yellow-500">
            {stats.fair_count} fair
          </span>
          <span className="text-red-500">
            {stats.poor_count} poor
          </span>
          {stats.blur_detected_count > 0 && (
            <span className="text-orange-500">
              {stats.blur_detected_count} blurry
            </span>
          )}
        </div>
      )}

      {/* Main Controls Row */}
      <div className="flex items-center justify-between gap-4">
        {/* Left: Filter Presets */}
        <div className="flex items-center gap-2">
          {FILTER_PRESETS.map((preset) => (
            <AppButton
              key={preset.id}
              variant="outline"
              size="sm"
              leftIcon={preset.icon}
              onClick={() => handlePresetClick(preset)}
              title={preset.description}
              disabled={isLoading}
            >
              {preset.name}
            </AppButton>
          ))}

          <AppButton
            variant="outline"
            size="sm"
            leftIcon={<SlidersHorizontal size={16} />}
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={showAdvanced ? 'bg-primary/10' : ''}
          >
            Advanced
            <ChevronDown
              size={14}
              className={`ml-1 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            />
          </AppButton>

          {hasActiveFilters && (
            <AppButton
              variant="ghost"
              size="sm"
              leftIcon={<RotateCcw size={16} />}
              onClick={onResetFilters}
              className="text-text-tertiary hover:text-text-primary"
            >
              Reset
            </AppButton>
          )}
        </div>

        {/* Right: Actions & View Controls */}
        <div className="flex items-center gap-2">
          {/* Auto-reject button */}
          {onAutoReject && (
            <AppButton
              variant="outline"
              size="sm"
              leftIcon={<Zap size={16} />}
              onClick={onAutoReject}
              disabled={isLoading}
              className="text-red-500 border-red-500/30 hover:bg-red-500/10"
            >
              Auto-Reject
            </AppButton>
          )}

          {/* Sort dropdown */}
          <div className="relative">
            <AppButton
              variant="ghost"
              size="sm"
              leftIcon={<ArrowUpDown size={16} />}
              onClick={() => setShowSortMenu(!showSortMenu)}
            >
              {currentSortLabel}
              <ChevronDown
                size={14}
                className={`ml-1 transition-transform ${showSortMenu ? 'rotate-180' : ''}`}
              />
            </AppButton>

            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-lg py-1 z-10 min-w-[160px]">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onSortChange(option.value);
                      setShowSortMenu(false);
                    }}
                    className={`
                      w-full px-3 py-2 text-left text-sm
                      hover:bg-surface-secondary transition-colors
                      ${sortBy === option.value ? 'text-primary font-medium' : 'text-text-primary'}
                    `}
                  >
                    {option.label}
                  </button>
                ))}
                <hr className="my-1 border-border" />
                <button
                  onClick={() => {
                    onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc');
                    setShowSortMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-surface-secondary"
                >
                  {sortOrder === 'desc' ? 'Ascending' : 'Descending'}
                </button>
              </div>
            )}
          </div>

          {/* Column controls */}
          <div className="flex items-center gap-1 border border-border rounded-lg p-1">
            {[3, 4, 5, 6].map((cols) => (
              <button
                key={cols}
                onClick={() => onColumnsChange(cols)}
                className={`
                  p-1 rounded transition-colors
                  ${columns === cols
                    ? 'bg-primary text-white'
                    : 'hover:bg-surface-secondary text-text-secondary'
                  }
                `}
                aria-label={`${cols} columns`}
              >
                {cols === 3 && <Grid size={16} />}
                {cols === 4 && <LayoutGrid size={16} />}
                {cols === 5 && <LayoutGrid size={16} />}
                {cols === 6 && <LayoutGrid size={16} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Advanced Filters Panel */}
      {showAdvanced && (
        <div className="bg-surface-secondary rounded-lg p-4 space-y-4">
          <h4 className="text-sm font-medium text-text-primary mb-3">Advanced Filters</h4>

          <div className="grid grid-cols-4 gap-6">
            {/* Quality Score */}
            <div>
              <Slider
                label="Min Quality Score"
                value={filters.minOverallScore}
                onChange={(value) => onFiltersChange({ minOverallScore: value })}
              />
            </div>

            {/* Sharpness */}
            <div>
              <Slider
                label="Min Sharpness"
                value={filters.minSharpness}
                onChange={(value) => onFiltersChange({ minSharpness: value })}
              />
            </div>

            {/* Exposure */}
            <div className="space-y-2">
              <Slider
                label="Min Exposure"
                value={filters.minExposure}
                onChange={(value) => onFiltersChange({ minExposure: value })}
              />
              <Slider
                label="Max Exposure"
                value={filters.maxExposure}
                onChange={(value) => onFiltersChange({ maxExposure: value })}
              />
            </div>

            {/* Toggle Options */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.hideBlur || false}
                  onChange={(e) => onFiltersChange({ hideBlur: e.target.checked })}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-text-primary">Hide Blurry</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.showBokeh !== false}
                  onChange={(e) => onFiltersChange({ showBokeh: e.target.checked })}
                  disabled={!filters.hideBlur}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary disabled:opacity-50"
                />
                <span className={`text-sm ${filters.hideBlur ? 'text-text-primary' : 'text-text-tertiary'}`}>
                  Show Bokeh
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.hasFaces || false}
                  onChange={(e) =>
                    onFiltersChange({ hasFaces: e.target.checked || undefined })
                  }
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-text-primary">With Faces Only</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.exposureOptimal || false}
                  onChange={(e) => onFiltersChange({ exposureOptimal: e.target.checked })}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-text-primary">Optimal Exposure</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CullingToolbar;
