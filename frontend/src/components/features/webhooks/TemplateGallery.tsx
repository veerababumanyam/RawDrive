/**
 * TemplateGallery Component
 *
 * A gallery view for browsing and selecting webhook integration templates.
 * Supports filtering by category, integration type, and search.
 *
 * Feature: Webhook Integration Templates
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Search,
  Filter,
  LayoutGrid,
  List,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  AlertCircle,
  Zap,
  Workflow,
  RefreshCw,
} from 'lucide-react';
import { Card } from '../../ui/AppCard';
import { AppButton } from '../../ui/AppButton';
import { AppInput } from '../../ui/AppInput';
import { cn } from '@/lib/utils';
import {
  IntegrationCard,
  IntegrationCardSkeleton,
} from './IntegrationCard';
import {
  useWebhookTemplates,
  useFeaturedTemplates,
  useTemplateCategories,
} from '@/hooks/useWebhookTemplates';
import type {
  WebhookTemplateSummary,
  TemplateCategory,
  IntegrationType,
} from '@/types/webhooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateGalleryProps {
  /** Callback when a template is selected */
  onSelectTemplate?: (template: WebhookTemplateSummary) => void;
  /** Callback when "Use Template" is clicked */
  onUseTemplate?: (template: WebhookTemplateSummary) => void;
  /** Currently selected template ID */
  selectedTemplateId?: string;
  /** Whether to show featured section */
  showFeatured?: boolean;
  /** Initial category filter */
  initialCategory?: TemplateCategory;
  /** Maximum items per page */
  pageSize?: number;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Category Filter Component
// ---------------------------------------------------------------------------

interface CategoryFilterProps {
  categories: { category: TemplateCategory; total_templates: number }[];
  selectedCategory?: TemplateCategory;
  onSelect: (category: TemplateCategory | undefined) => void;
  isLoading?: boolean;
}

function CategoryFilter({
  categories,
  selectedCategory,
  onSelect,
  isLoading,
}: CategoryFilterProps) {
  const categoryLabels: Record<TemplateCategory, { label: string; icon: string }> = {
    communication: { label: 'Communication', icon: '💬' },
    crm: { label: 'CRM', icon: '👥' },
    project_management: { label: 'Project Management', icon: '📋' },
    analytics: { label: 'Analytics', icon: '📊' },
    automation: { label: 'Automation', icon: '⚡' },
    notification: { label: 'Notifications', icon: '🔔' },
    developer: { label: 'Developer', icon: '🛠️' },
  };

  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-9 w-24 rounded-full bg-muted animate-pulse flex-shrink-0"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      <button
        onClick={() => onSelect(undefined)}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
          !selectedCategory
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted hover:bg-muted/80 text-foreground'
        )}
      >
        All Templates
      </button>
      {categories.map(({ category, total_templates }) => {
        const { label, icon } = categoryLabels[category] || {
          label: category,
          icon: '📦',
        };
        return (
          <button
            key={category}
            onClick={() => onSelect(category)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
              selectedCategory === category
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-foreground'
            )}
          >
            <span>{icon}</span>
            {label}
            <span className="text-xs opacity-70">({total_templates})</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integration Type Filter Component
// ---------------------------------------------------------------------------

interface IntegrationTypeFilterProps {
  selected?: IntegrationType;
  onSelect: (type: IntegrationType | undefined) => void;
}

function IntegrationTypeFilter({ selected, onSelect }: IntegrationTypeFilterProps) {
  const types: { value: IntegrationType; label: string }[] = [
    { value: 'zapier', label: 'Zapier' },
    { value: 'make', label: 'Make.com' },
    { value: 'native', label: 'Native' },
    { value: 'custom', label: 'Custom' },
  ];

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Type:</span>
      <div className="flex gap-1">
        <button
          onClick={() => onSelect(undefined)}
          className={cn(
            'px-3 py-1 rounded text-sm transition-colors',
            !selected
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-muted text-muted-foreground'
          )}
        >
          All
        </button>
        {types.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onSelect(value)}
            className={cn(
              'px-3 py-1 rounded text-sm transition-colors',
              selected === value
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted text-muted-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Featured Templates Section Component
// ---------------------------------------------------------------------------

interface FeaturedSectionProps {
  templates: WebhookTemplateSummary[];
  isLoading?: boolean;
  onSelect: (template: WebhookTemplateSummary) => void;
  onUse: (template: WebhookTemplateSummary) => void;
  selectedId?: string;
}

function FeaturedSection({
  templates,
  isLoading,
  onSelect,
  onUse,
  selectedId,
}: FeaturedSectionProps) {
  if (isLoading) {
    return (
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-yellow-500" />
          <h2 className="text-lg font-semibold">Featured Integrations</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <IntegrationCardSkeleton key={i} variant="featured" />
          ))}
        </div>
      </section>
    );
  }

  if (templates.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-yellow-500" />
        <h2 className="text-lg font-semibold">Featured Integrations</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => (
          <IntegrationCard
            key={template.template_id}
            template={template}
            variant="featured"
            isSelected={selectedId === template.template_id}
            onClick={onSelect}
            onUse={onUse}
          />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pagination Component
// ---------------------------------------------------------------------------

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = useMemo(() => {
    const result: (number | 'ellipsis')[] = [];
    const showEllipsis = totalPages > 7;

    if (!showEllipsis) {
      for (let i = 1; i <= totalPages; i++) {
        result.push(i);
      }
    } else {
      result.push(1);

      if (page > 3) {
        result.push('ellipsis');
      }

      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        if (!result.includes(i)) {
          result.push(i);
        }
      }

      if (page < totalPages - 2) {
        result.push('ellipsis');
      }

      if (!result.includes(totalPages)) {
        result.push(totalPages);
      }
    }

    return result;
  }, [page, totalPages]);

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <AppButton
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
      >
        <ChevronLeft className="h-4 w-4" />
      </AppButton>

      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground">
            ...
          </span>
        ) : (
          <AppButton
            key={p}
            variant={page === p ? undefined : 'ghost'}
            size="sm"
            onClick={() => onPageChange(p)}
            className="min-w-[36px]"
          >
            {p}
          </AppButton>
        )
      )}

      <AppButton
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
      >
        <ChevronRight className="h-4 w-4" />
      </AppButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State Component
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  hasFilters: boolean;
  onClearFilters: () => void;
}

function EmptyState({ hasFilters, onClearFilters }: EmptyStateProps) {
  return (
    <Card className="p-12 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Workflow className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No templates found</h3>
      <p className="text-muted-foreground mb-4">
        {hasFilters
          ? "We couldn't find any templates matching your filters."
          : 'No integration templates are available yet.'}
      </p>
      {hasFilters && (
        <AppButton variant="outline" onClick={onClearFilters}>
          <X className="h-4 w-4 mr-2" />
          Clear Filters
        </AppButton>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Error State Component
// ---------------------------------------------------------------------------

interface ErrorStateProps {
  error: Error;
  onRetry: () => void;
}

function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <Card className="p-12 text-center border-destructive/50">
      <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Failed to load templates</h3>
      <p className="text-muted-foreground mb-4">{error.message}</p>
      <AppButton onClick={onRetry}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Try Again
      </AppButton>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TemplateGallery Component
// ---------------------------------------------------------------------------

export function TemplateGallery({
  onSelectTemplate,
  onUseTemplate,
  selectedTemplateId,
  showFeatured = true,
  initialCategory,
  pageSize = 12,
  className,
}: TemplateGalleryProps) {
  // State
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchInput, setSearchInput] = useState('');
  const [integrationType, setIntegrationType] = useState<IntegrationType | undefined>();

  // Hooks
  const {
    templates,
    loading,
    error,
    page,
    totalPages,
    total,
    setPage,
    setCategory,
    setSearch,
    setIntegrationType: setTypeFilter,
    refresh,
    filters,
  } = useWebhookTemplates({
    pageSize,
    initialCategory,
  });

  const {
    templates: featuredTemplates,
    loading: featuredLoading,
  } = useFeaturedTemplates(3);

  const {
    categories,
    loading: categoriesLoading,
  } = useTemplateCategories();

  // Handlers
  const handleSearch = useCallback(() => {
    setSearch(searchInput);
  }, [searchInput, setSearch]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    },
    [handleSearch]
  );

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    setSearch('');
  }, [setSearch]);

  const handleIntegrationTypeChange = useCallback(
    (type: IntegrationType | undefined) => {
      setIntegrationType(type);
      setTypeFilter(type);
    },
    [setTypeFilter]
  );

  const handleClearFilters = useCallback(() => {
    setCategory(undefined);
    setSearch('');
    setSearchInput('');
    setIntegrationType(undefined);
    setTypeFilter(undefined);
  }, [setCategory, setSearch, setTypeFilter]);

  const handleSelectTemplate = useCallback(
    (template: WebhookTemplateSummary) => {
      onSelectTemplate?.(template);
    },
    [onSelectTemplate]
  );

  const handleUseTemplate = useCallback(
    (template: WebhookTemplateSummary) => {
      onUseTemplate?.(template);
    },
    [onUseTemplate]
  );

  // Check if any filters are active
  const hasFilters = !!(
    filters.category ||
    filters.search ||
    filters.integration_type ||
    filters.featured_only
  );

  // Render
  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            Integration Templates
          </h1>
          <p className="text-muted-foreground mt-1">
            Pre-built workflows to connect your webhooks with popular tools
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AppButton
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="h-4 w-4" />
          </AppButton>
          <AppButton
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </AppButton>
        </div>
      </div>

      {/* Search and Filters */}
      <Card className="p-4">
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <AppInput
                type="text"
                placeholder="Search templates..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="pl-10"
              />
              {searchInput && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <AppButton onClick={handleSearch}>
              Search
            </AppButton>
          </div>

          {/* Category Filter */}
          <CategoryFilter
            categories={categories}
            selectedCategory={filters.category}
            onSelect={setCategory}
            isLoading={categoriesLoading}
          />

          {/* Integration Type Filter */}
          <div className="flex items-center justify-between">
            <IntegrationTypeFilter
              selected={integrationType}
              onSelect={handleIntegrationTypeChange}
            />

            {hasFilters && (
              <AppButton
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="text-muted-foreground"
              >
                <X className="h-4 w-4 mr-1" />
                Clear filters
              </AppButton>
            )}
          </div>
        </div>
      </Card>

      {/* Featured Section */}
      {showFeatured && !hasFilters && (
        <FeaturedSection
          templates={featuredTemplates}
          isLoading={featuredLoading}
          onSelect={handleSelectTemplate}
          onUse={handleUseTemplate}
          selectedId={selectedTemplateId}
        />
      )}

      {/* Results Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {hasFilters ? `${total} Results` : 'All Templates'}
        </h2>
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Error State */}
      {error && (
        <ErrorState error={error} onRetry={refresh} />
      )}

      {/* Loading State */}
      {loading && !error && (
        <div
          className={cn(
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
              : 'space-y-3'
          )}
        >
          {[...Array(pageSize)].map((_, i) => (
            <IntegrationCardSkeleton
              key={i}
              variant={viewMode === 'list' ? 'compact' : 'default'}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && templates.length === 0 && (
        <EmptyState hasFilters={hasFilters} onClearFilters={handleClearFilters} />
      )}

      {/* Templates Grid/List */}
      {!loading && !error && templates.length > 0 && (
        <>
          <div
            className={cn(
              viewMode === 'grid'
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                : 'space-y-3'
            )}
          >
            {templates.map((template) => (
              <IntegrationCard
                key={template.template_id}
                template={template}
                variant={viewMode === 'list' ? 'compact' : 'default'}
                isSelected={selectedTemplateId === template.template_id}
                onClick={handleSelectTemplate}
                onUse={handleUseTemplate}
              />
            ))}
          </div>

          {/* Pagination */}
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

export default TemplateGallery;
