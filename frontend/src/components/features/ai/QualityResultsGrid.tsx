/**
 * QualityResultsGrid Component
 *
 * Displays a filterable grid of photo quality analysis results with
 * tier filtering, sorting, and selection capabilities.
 *
 * Feature: 023-enhanced-smart-curate (US1)
 */

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Filter,
  SortAsc,
  SortDesc,
  Check,
  X,
  Grid,
  List,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { QualityScoreCard } from './QualityScoreCard';
import { QUALITY_TIERS, type QualityTier, getQualityTier } from '@/hooks/useQualityAnalysis';
import type { PhotoQualityResult, QualityAnalysisSummary } from '@/types/curation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortField = 'overall' | 'sharpness' | 'exposure' | 'composition';
type SortOrder = 'asc' | 'desc';
type ViewMode = 'grid' | 'list';

interface QualityResultsGridProps {
  /** Quality analysis results */
  results: PhotoQualityResult[];
  /** Quality summary statistics */
  summary?: QualityAnalysisSummary | null;
  /** Function to get thumbnail URL for an asset */
  getThumbnailUrl?: (assetId: string) => string;
  /** Callback when photos are selected */
  onSelectionChange?: (selectedIds: string[]) => void;
  /** Initial selected photo IDs */
  selectedIds?: string[];
  /** Enable selection mode */
  selectionEnabled?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Summary Card Component
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  summary: QualityAnalysisSummary;
}

function SummaryCard({ summary }: SummaryCardProps) {
  const tierCounts = [
    { tier: 'excellent' as const, count: summary.excellent_count, label: 'Excellent' },
    { tier: 'good' as const, count: summary.good_count, label: 'Good' },
    { tier: 'fair' as const, count: summary.fair_count, label: 'Fair' },
    { tier: 'poor' as const, count: summary.poor_count, label: 'Poor' },
  ];

  const tierColors = {
    excellent: 'bg-emerald-500',
    good: 'bg-blue-500',
    fair: 'bg-amber-500',
    poor: 'bg-red-500',
  };

  return (
    <div className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-2xl font-bold text-white">
            {summary.total_analyzed.toLocaleString()}
          </div>
          <div className="text-sm text-zinc-400">Photos Analyzed</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-blue-400">
            {Math.round(summary.average_score)}
          </div>
          <div className="text-sm text-zinc-400">Average Score</div>
        </div>
        {summary.blur_count > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-amber-400 font-medium">{summary.blur_count}</span>
            <span className="text-zinc-400 text-sm">blurred</span>
          </div>
        )}
      </div>

      {/* Tier distribution bar */}
      <div className="space-y-2">
        <div className="h-3 rounded-full overflow-hidden flex">
          {tierCounts.map(({ tier, count }) => {
            const percent = summary.total_analyzed > 0
              ? (count / summary.total_analyzed) * 100
              : 0;
            if (percent === 0) return null;
            return (
              <div
                key={tier}
                className={cn('transition-all', tierColors[tier])}
                style={{ width: `${percent}%` }}
                title={`${QUALITY_TIERS[tier].label}: ${count}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-zinc-500">
          {tierCounts.map(({ tier, count, label }) => (
            <span key={tier} className="flex items-center gap-1">
              <span className={cn('w-2 h-2 rounded-full', tierColors[tier])} />
              {label}: {count}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter Bar Component
// ---------------------------------------------------------------------------

interface FilterBarProps {
  selectedTier: QualityTier | 'all';
  onTierChange: (tier: QualityTier | 'all') => void;
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField) => void;
  onSortOrderToggle: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  blurFilter: 'all' | 'blur' | 'sharp';
  onBlurFilterChange: (filter: 'all' | 'blur' | 'sharp') => void;
}

function FilterBar({
  selectedTier,
  onTierChange,
  sortField,
  sortOrder,
  onSortChange,
  onSortOrderToggle,
  viewMode,
  onViewModeChange,
  blurFilter,
  onBlurFilterChange,
}: FilterBarProps) {
  const tiers: Array<QualityTier | 'all'> = ['all', 'excellent', 'good', 'fair', 'poor'];
  const tierColors = {
    all: 'bg-zinc-600',
    excellent: 'bg-emerald-500',
    good: 'bg-blue-500',
    fair: 'bg-amber-500',
    poor: 'bg-red-500',
  };

  const sortOptions: Array<{ field: SortField; label: string }> = [
    { field: 'overall', label: 'Overall' },
    { field: 'sharpness', label: 'Sharpness' },
    { field: 'exposure', label: 'Exposure' },
    { field: 'composition', label: 'Composition' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-4 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50">
      {/* Tier filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-zinc-500" />
        <div className="flex rounded-lg overflow-hidden border border-zinc-700">
          {tiers.map((tier) => (
            <button
              key={tier}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                selectedTier === tier
                  ? cn(tierColors[tier], 'text-white')
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              )}
              onClick={() => onTierChange(tier)}
            >
              {tier === 'all' ? 'All' : QUALITY_TIERS[tier].label}
            </button>
          ))}
        </div>
      </div>

      {/* Blur filter */}
      <div className="flex rounded-lg overflow-hidden border border-zinc-700">
        <button
          className={cn(
            'px-3 py-1.5 text-xs font-medium transition-colors',
            blurFilter === 'all'
              ? 'bg-zinc-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          )}
          onClick={() => onBlurFilterChange('all')}
        >
          All
        </button>
        <button
          className={cn(
            'px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1',
            blurFilter === 'blur'
              ? 'bg-amber-500 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          )}
          onClick={() => onBlurFilterChange('blur')}
        >
          <AlertTriangle className="w-3 h-3" />
          Blur
        </button>
        <button
          className={cn(
            'px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1',
            blurFilter === 'sharp'
              ? 'bg-green-500 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          )}
          onClick={() => onBlurFilterChange('sharp')}
        >
          <Sparkles className="w-3 h-3" />
          Sharp
        </button>
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2 ml-auto">
        <select
          className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300"
          value={sortField}
          onChange={(e) => onSortChange(e.target.value as SortField)}
        >
          {sortOptions.map(({ field, label }) => (
            <option key={field} value={field}>
              Sort: {label}
            </option>
          ))}
        </select>
        <button
          className="p-1.5 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700 transition-colors"
          onClick={onSortOrderToggle}
          title={sortOrder === 'desc' ? 'Highest first' : 'Lowest first'}
        >
          {sortOrder === 'desc' ? (
            <SortDesc className="w-4 h-4 text-zinc-400" />
          ) : (
            <SortAsc className="w-4 h-4 text-zinc-400" />
          )}
        </button>
      </div>

      {/* View mode */}
      <div className="flex rounded-lg overflow-hidden border border-zinc-700">
        <button
          className={cn(
            'p-1.5 transition-colors',
            viewMode === 'grid' ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-400'
          )}
          onClick={() => onViewModeChange('grid')}
        >
          <Grid className="w-4 h-4" />
        </button>
        <button
          className={cn(
            'p-1.5 transition-colors',
            viewMode === 'list' ? 'bg-zinc-600 text-white' : 'bg-zinc-800 text-zinc-400'
          )}
          onClick={() => onViewModeChange('list')}
        >
          <List className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quality Results Grid Component
// ---------------------------------------------------------------------------

export function QualityResultsGrid({
  results,
  summary,
  getThumbnailUrl,
  onSelectionChange,
  selectedIds = [],
  selectionEnabled = false,
  isLoading = false,
  className,
}: QualityResultsGridProps) {
  // Filter and sort state
  const [selectedTier, setSelectedTier] = useState<QualityTier | 'all'>('all');
  const [blurFilter, setBlurFilter] = useState<'all' | 'blur' | 'sharp'>('all');
  const [sortField, setSortField] = useState<SortField>('overall');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter and sort results
  const filteredResults = useMemo(() => {
    let filtered = [...results];

    // Apply tier filter
    if (selectedTier !== 'all') {
      filtered = filtered.filter((r) => getQualityTier(r.overall_score) === selectedTier);
    }

    // Apply blur filter
    if (blurFilter === 'blur') {
      filtered = filtered.filter((r) => r.blur_detected);
    } else if (blurFilter === 'sharp') {
      filtered = filtered.filter((r) => !r.blur_detected);
    }

    // Apply sorting
    const sortKey = `${sortField}_score` as keyof PhotoQualityResult;
    filtered.sort((a, b) => {
      const aVal = sortField === 'overall' ? a.overall_score : (a[sortKey] as number) || 0;
      const bVal = sortField === 'overall' ? b.overall_score : (b[sortKey] as number) || 0;
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });

    return filtered;
  }, [results, selectedTier, blurFilter, sortField, sortOrder]);

  // Handlers
  const handleSelect = useCallback(
    (assetId: string) => {
      if (!selectionEnabled) return;

      const newSelected = new Set(selected);
      if (newSelected.has(assetId)) {
        newSelected.delete(assetId);
      } else {
        newSelected.add(assetId);
      }
      setSelected(newSelected);
      onSelectionChange?.(Array.from(newSelected));
    },
    [selected, selectionEnabled, onSelectionChange]
  );

  const handleSelectAll = useCallback(() => {
    if (!selectionEnabled) return;

    const allIds = filteredResults.map((r) => r.asset_id);
    const newSelected = new Set(allIds);
    setSelected(newSelected);
    onSelectionChange?.(allIds);
  }, [filteredResults, selectionEnabled, onSelectionChange]);

  const handleClearSelection = useCallback(() => {
    setSelected(new Set());
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="h-24 bg-zinc-800/50 rounded-xl animate-pulse" />
        <div className="h-12 bg-zinc-800/50 rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square bg-zinc-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (results.length === 0) {
    return (
      <div className={cn('text-center py-12', className)}>
        <Sparkles className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-zinc-300 mb-2">No Quality Analysis Yet</h3>
        <p className="text-sm text-zinc-500">
          Start a curation session to analyze photo quality
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Summary */}
      {summary && <SummaryCard summary={summary} />}

      {/* Filters */}
      <FilterBar
        selectedTier={selectedTier}
        onTierChange={setSelectedTier}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortChange={setSortField}
        onSortOrderToggle={() => setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        blurFilter={blurFilter}
        onBlurFilterChange={setBlurFilter}
      />

      {/* Selection controls */}
      {selectionEnabled && (
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-400">
            {selected.size} of {filteredResults.length} selected
          </span>
          <AppButton variant="ghost" size="sm" onClick={handleSelectAll}>
            Select All
          </AppButton>
          {selected.size > 0 && (
            <AppButton variant="ghost" size="sm" onClick={handleClearSelection}>
              Clear Selection
            </AppButton>
          )}
        </div>
      )}

      {/* Results count */}
      <div className="text-sm text-zinc-500">
        Showing {filteredResults.length} of {results.length} photos
      </div>

      {/* Results grid/list */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredResults.map((result) => (
            <QualityScoreCard
              key={result.asset_id}
              quality={result}
              compact
              thumbnailUrl={getThumbnailUrl?.(result.asset_id)}
              isSelected={selected.has(result.asset_id)}
              onSelect={selectionEnabled ? handleSelect : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredResults.map((result) => (
            <QualityScoreCard
              key={result.asset_id}
              quality={result}
              thumbnailUrl={getThumbnailUrl?.(result.asset_id)}
              isSelected={selected.has(result.asset_id)}
              onSelect={selectionEnabled ? handleSelect : undefined}
              expanded={expandedId === result.asset_id}
              onToggleExpand={() =>
                setExpandedId((id) => (id === result.asset_id ? null : result.asset_id))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default QualityResultsGrid;
