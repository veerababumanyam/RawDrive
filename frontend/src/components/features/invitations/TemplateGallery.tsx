/**
 * TemplateGallery: Grid view for browsing and selecting invitation templates
 *
 * Features:
 * - Category filtering
 * - Premium template badges
 * - Visual template previews
 * - Selection state management
 *
 * Feature: 016-save-the-date
 */

import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Check, Crown, Search } from 'lucide-react';

import { AppInput } from '@/components/ui/AppInput';
import * as invitationService from '@/services/invitationService';
import type { InvitationTemplate, TemplateCategory } from '@/types/invitations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplateGalleryProps {
  /** Currently selected template ID */
  selectedTemplateId?: string;
  /** Callback when a template is selected */
  onSelect: (template: InvitationTemplate) => void;
  /** Initial category filter */
  initialCategory?: TemplateCategory;
  /** Whether to show premium templates */
  showPremium?: boolean;
  /** Optional className for container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES: Array<{ value: TemplateCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All Templates' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'anniversary', label: 'Anniversary' },
  { value: 'baby_shower', label: 'Baby Shower' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'festival', label: 'Festival' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'other', label: 'Other' },
];

// ---------------------------------------------------------------------------
// Template Card Component
// ---------------------------------------------------------------------------

interface TemplateCardProps {
  template: InvitationTemplate;
  isSelected: boolean;
  onSelect: () => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  isSelected,
  onSelect,
}) => {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        relative group rounded-lg overflow-hidden border-2 transition-all duration-200
        focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none
        ${
          isSelected
            ? 'border-primary ring-2 ring-primary/20 scale-[1.02]'
            : 'border-border hover:border-primary/50 hover:shadow-lg'
        }
      `}
      aria-pressed={isSelected}
      aria-label={`Select ${template.name} template`}
    >
      {/* Thumbnail */}
      <div className="aspect-[3/4] bg-surface-hover relative overflow-hidden">
        {template.thumbnail_url ? (
          <img
            src={template.thumbnail_url}
            alt={template.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center transition-transform duration-300 group-hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${
                template.layout.colors?.primary || '#6366f1'
              }, ${template.layout.colors?.secondary || '#8b5cf6'})`,
            }}
          >
            <span className="text-white text-5xl font-serif drop-shadow-lg">
              {template.name.charAt(0)}
            </span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200" />
      </div>

      {/* Info */}
      <div className="p-3 bg-surface">
        <p className="text-sm font-medium text-text-primary truncate">
          {template.name}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-text-tertiary capitalize">
            {template.category}
          </span>
          {template.is_premium && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gold/10 text-gold text-xs rounded-full">
              <Crown className="w-3 h-3" />
              Premium
            </span>
          )}
        </div>
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2 w-7 h-7 bg-primary rounded-full flex items-center justify-center shadow-lg">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({
  selectedTemplateId,
  onSelect,
  initialCategory,
  showPremium = true,
  className = '',
}) => {
  const [category, setCategory] = useState<TemplateCategory | 'all'>(
    initialCategory || 'all'
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch templates
  const { data: templatesData, isLoading, error } = useQuery({
    queryKey: ['templates', category === 'all' ? undefined : category],
    queryFn: () =>
      invitationService.listTemplates({
        category: category === 'all' ? undefined : category,
        includeSystem: true,
        includePremium: showPremium,
        limit: 100,
      }),
  });

  // Filter templates by search
  const filteredTemplates = (templatesData?.data || []).filter((template) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      template.name.toLowerCase().includes(query) ||
      template.description?.toLowerCase().includes(query) ||
      template.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  const handleSelect = useCallback(
    (template: InvitationTemplate) => {
      onSelect(template);
    },
    [onSelect]
  );

  return (
    <div className={className}>
      {/* Filters */}
      <div className="mb-6 space-y-4">
        {/* Search */}
        <AppInput
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search className="w-4 h-4 text-text-tertiary" />}
        />

        {/* Category chips */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={`
                px-4 py-2 rounded-full text-sm font-medium transition-colors
                ${
                  category === cat.value
                    ? 'bg-primary text-white'
                    : 'bg-surface-hover text-text-secondary hover:bg-surface-hover/80'
                }
              `}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-error">Failed to load templates. Please try again.</p>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-16 text-text-secondary">
          <p className="text-lg mb-2">No templates found</p>
          <p className="text-sm">Try adjusting your search or category filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.template_id}
              template={template}
              isSelected={selectedTemplateId === template.template_id}
              onSelect={() => handleSelect(template)}
            />
          ))}
        </div>
      )}

      {/* Results count */}
      {!isLoading && !error && filteredTemplates.length > 0 && (
        <p className="mt-4 text-sm text-text-tertiary text-center">
          Showing {filteredTemplates.length} template
          {filteredTemplates.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
};

export default TemplateGallery;
