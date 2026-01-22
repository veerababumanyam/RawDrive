/**
 * Template Library Component
 *
 * Displays reusable Gallery Design Studio templates with:
 * - Grid display (3 columns responsive)
 * - Category filtering (All | Wedding | Portrait | Event | Product | Landscape | Other)
 * - Search by name/tags (debounced 300ms)
 * - Infinite scroll pagination
 * - Template thumbnails with preview
 * - Apply/Edit/Delete actions
 * - System badge for system templates
 *
 * Feature: Enhancement 3 - Custom Templates
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Plus } from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';
import { TemplateThumbnail } from './TemplateThumbnail';
import { debounce } from '../../../../utils/debounce';
import galleryDesignService from '../../../../services/galleryDesignService';

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

interface TemplateLibraryProps {
  galleryId: string;
  onSelectTemplate: (template: Template) => void;
  onCreateNew?: () => void;
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'wedding', label: 'Wedding' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'event', label: 'Event' },
  { id: 'product', label: 'Product' },
  { id: 'landscape', label: 'Landscape' },
  { id: 'other', label: 'Other' },
];

export const TemplateLibrary: React.FC<TemplateLibraryProps> = ({
  galleryId,
  onSelectTemplate,
  onCreateNew,
}) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const observerTarget = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  // Load templates from API
  const loadTemplates = useCallback(async (pageNum: number) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const response = await galleryDesignService.listTemplates({
        page: pageNum,
        limit: 12,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        search: searchQuery,
        include_system: true,
      });

      if (pageNum === 1) {
        setTemplates(response.data);
      } else {
        setTemplates((prev) => [...prev, ...response.data]);
      }

      setHasMore(response.meta.has_next);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load templates:', error);
      setLoading(false);
      setHasMore(false);
    } finally {
      loadingRef.current = false;
    }
  }, [selectedCategory, searchQuery]);

  // Initial load
  useEffect(() => {
    setPage(1);
    loadTemplates(1);
  }, [selectedCategory, searchQuery, loadTemplates]);

  // Infinite scroll observer
  useEffect(() => {
    if (!observerTarget.current || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
          const nextPage = page + 1;
          setPage(nextPage);
          loadTemplates(nextPage);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(observerTarget.current);

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [hasMore, loading, page, loadTemplates]);

  // Debounced search
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      setSearchQuery(query);
      setPage(1);
    }, 300),
    []
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    debouncedSearch(e.target.value);
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-text-primary">Template Library</h2>
          {onCreateNew && (
            <AppButton
              onClick={onCreateNew}
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Save as Template
            </AppButton>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder="Search templates by name or tags..."
            onChange={handleSearchChange}
            className="w-full pl-10 pr-4 py-2 border border-border-default rounded-lg bg-bg-primary text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary"
          />
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id)}
              className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors text-sm font-medium ${
                selectedCategory === cat.id
                  ? 'bg-accent-primary text-white'
                  : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {templates.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-text-secondary mb-2">No templates found</p>
          <p className="text-sm text-text-tertiary">
            {searchQuery
              ? 'Try adjusting your search or filters'
              : 'Create a new template from your current design'}
          </p>
        </div>
      ) : (
        <>
          {/* Templates Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <TemplateThumbnail
                key={template.template_id}
                template={template}
                onSelect={() => onSelectTemplate(template)}
              />
            ))}

            {/* Loading skeletons */}
            {loading && templates.length === 0 && (
              <>
                {[...Array(6)].map((_, i) => (
                  <div
                    key={`skeleton-${i}`}
                    className="aspect-square bg-gradient-to-r from-bg-secondary to-bg-tertiary rounded-lg animate-pulse"
                  />
                ))}
              </>
            )}
          </div>

          {/* Infinite scroll trigger */}
          {hasMore && templates.length > 0 && (
            <div ref={observerTarget} className="h-8 mt-8 flex justify-center">
              {loading && (
                <div className="text-text-tertiary text-sm">Loading more templates...</div>
              )}
            </div>
          )}
        </>
      )}

      {/* Footer info */}
      <div className="text-xs text-text-tertiary text-center pt-4 border-t border-border-default">
        {templates.length} template{templates.length !== 1 ? 's' : ''} available
      </div>
    </div>
  );
};

export default TemplateLibrary;
