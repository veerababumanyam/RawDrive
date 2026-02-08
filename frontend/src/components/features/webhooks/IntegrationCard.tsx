/**
 * IntegrationCard Component
 *
 * A card component for displaying webhook integration template summaries.
 * Used in the TemplateGallery to show available integrations.
 *
 * Feature: Webhook Integration Templates
 */

import React from 'react';
import {
  Star,
  Zap,
  ArrowRight,
  Sparkles,
  Crown,
  ExternalLink,
  Users,
} from 'lucide-react';
import { Card } from '../../ui/AppCard';
import { AppButton } from '../../ui/AppButton';
import { cn } from '@/lib/utils';
import type {
  WebhookTemplateSummary,
  TemplateCategory,
  IntegrationType,
} from '@/types/webhooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntegrationCardProps {
  /** Template data to display */
  template: WebhookTemplateSummary;
  /** Callback when card is clicked */
  onClick?: (template: WebhookTemplateSummary) => void;
  /** Callback when "Use Template" is clicked */
  onUse?: (template: WebhookTemplateSummary) => void;
  /** Whether the card is selected */
  isSelected?: boolean;
  /** Variant style */
  variant?: 'default' | 'compact' | 'featured';
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get icon component based on integration type and provider
 */
function getProviderIcon(provider?: string, integrationType?: IntegrationType): string {
  // Provider-specific icons (use emoji for simplicity, could be replaced with proper icons)
  const providerIcons: Record<string, string> = {
    slack: '/icons/slack.svg',
    zapier: '/icons/zapier.svg',
    make: '/icons/make.svg',
    asana: '/icons/asana.svg',
    notion: '/icons/notion.svg',
    hubspot: '/icons/hubspot.svg',
    google: '/icons/google-sheets.svg',
    email: '/icons/email.svg',
  };

  if (provider && providerIcons[provider.toLowerCase()]) {
    return providerIcons[provider.toLowerCase()];
  }

  // Fallback based on integration type
  return '';
}

/**
 * Get color scheme based on category
 */
function getCategoryColors(category: TemplateCategory): {
  bg: string;
  text: string;
  border: string;
} {
  const colors: Record<TemplateCategory, { bg: string; text: string; border: string }> = {
    communication: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-700 dark:text-blue-300',
      border: 'border-blue-200 dark:border-blue-800',
    },
    crm: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      text: 'text-purple-700 dark:text-purple-300',
      border: 'border-purple-200 dark:border-purple-800',
    },
    project_management: {
      bg: 'bg-orange-100 dark:bg-orange-900/30',
      text: 'text-orange-700 dark:text-orange-300',
      border: 'border-orange-200 dark:border-orange-800',
    },
    analytics: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-700 dark:text-green-300',
      border: 'border-green-200 dark:border-green-800',
    },
    automation: {
      bg: 'bg-indigo-100 dark:bg-indigo-900/30',
      text: 'text-indigo-700 dark:text-indigo-300',
      border: 'border-indigo-200 dark:border-indigo-800',
    },
    notification: {
      bg: 'bg-pink-100 dark:bg-pink-900/30',
      text: 'text-pink-700 dark:text-pink-300',
      border: 'border-pink-200 dark:border-pink-800',
    },
    developer: {
      bg: 'bg-slate-100 dark:bg-slate-900/30',
      text: 'text-slate-700 dark:text-slate-300',
      border: 'border-slate-200 dark:border-slate-800',
    },
  };

  return colors[category] || colors.developer;
}

/**
 * Get display name for integration type
 */
function getIntegrationTypeLabel(type: IntegrationType): string {
  const labels: Record<IntegrationType, string> = {
    zapier: 'Zapier',
    make: 'Make.com',
    native: 'Native',
    custom: 'Custom',
  };
  return labels[type] || type;
}

/**
 * Format category name for display
 */
function formatCategoryName(category: TemplateCategory): string {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Provider Logo Component
// ---------------------------------------------------------------------------

interface ProviderLogoProps {
  provider?: string;
  logoUrl?: string;
  className?: string;
}

function ProviderLogo({ provider, logoUrl, className }: ProviderLogoProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={provider || 'Integration'}
        className={cn('h-8 w-8 object-contain', className)}
      />
    );
  }

  // Fallback to provider initials
  const initials = provider
    ? provider
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'WH';

  return (
    <div
      className={cn(
        'h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10',
        'flex items-center justify-center text-xs font-semibold text-primary',
        className
      )}
    >
      {initials}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rating Stars Component
// ---------------------------------------------------------------------------

interface RatingStarsProps {
  rating?: number;
  className?: string;
}

function RatingStars({ rating, className }: RatingStarsProps) {
  if (!rating) return null;

  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3 w-3',
            i < fullStars
              ? 'fill-yellow-400 text-yellow-400'
              : i === fullStars && hasHalfStar
                ? 'fill-yellow-400/50 text-yellow-400'
                : 'text-gray-300 dark:text-gray-600'
          )}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{rating.toFixed(1)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event Type Pills Component
// ---------------------------------------------------------------------------

interface EventTypePillsProps {
  eventTypes: string[];
  maxVisible?: number;
  className?: string;
}

function EventTypePills({ eventTypes, maxVisible = 2, className }: EventTypePillsProps) {
  const visibleTypes = eventTypes.slice(0, maxVisible);
  const remainingCount = eventTypes.length - maxVisible;

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {visibleTypes.map((type) => (
        <span
          key={type}
          className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
        >
          {type.split('.').pop()}
        </span>
      ))}
      {remainingCount > 0 && (
        <span className="text-xs text-muted-foreground">+{remainingCount} more</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// IntegrationCard Component
// ---------------------------------------------------------------------------

export function IntegrationCard({
  template,
  onClick,
  onUse,
  isSelected = false,
  variant = 'default',
  className,
}: IntegrationCardProps) {
  const categoryColors = getCategoryColors(template.category);

  const handleClick = () => {
    onClick?.(template);
  };

  const handleUse = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUse?.(template);
  };

  // Compact variant
  if (variant === 'compact') {
    return (
      <Card
        className={cn(
          'cursor-pointer p-3 transition-all hover:shadow-md',
          isSelected && 'ring-2 ring-primary',
          className
        )}
        onClick={handleClick}
      >
        <div className="flex items-center gap-3">
          <ProviderLogo
            provider={template.provider}
            logoUrl={template.provider_logo_url}
          />
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm truncate">{template.name}</h4>
            <p className="text-xs text-muted-foreground truncate">
              {template.short_description}
            </p>
          </div>
          {template.is_featured && (
            <Sparkles className="h-4 w-4 text-yellow-500 flex-shrink-0" />
          )}
        </div>
      </Card>
    );
  }

  // Featured variant
  if (variant === 'featured') {
    return (
      <Card
        className={cn(
          'cursor-pointer overflow-hidden transition-all hover:shadow-lg',
          'bg-gradient-to-br from-primary/5 via-transparent to-primary/10',
          'border-primary/20',
          isSelected && 'ring-2 ring-primary',
          className
        )}
        onClick={handleClick}
      >
        {/* Featured Banner */}
        <div className="bg-primary px-4 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
            <span className="text-xs font-medium text-primary-foreground">Featured</span>
          </div>
          {template.is_premium && (
            <div className="flex items-center gap-1">
              <Crown className="h-3 w-3 text-yellow-400" />
              <span className="text-xs text-primary-foreground">Premium</span>
            </div>
          )}
        </div>

        <div className="p-4">
          {/* Header */}
          <div className="flex items-start gap-3 mb-3">
            <div className="rounded-xl bg-white dark:bg-gray-800 p-2 shadow-sm">
              <ProviderLogo
                provider={template.provider}
                logoUrl={template.provider_logo_url}
                className="h-10 w-10"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg">{template.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                    categoryColors.bg,
                    categoryColors.text
                  )}
                >
                  {formatCategoryName(template.category)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {getIntegrationTypeLabel(template.integration_type)}
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground mb-4">
            {template.short_description}
          </p>

          {/* Stats */}
          <div className="flex items-center justify-between mb-4">
            <RatingStars rating={template.rating} />
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{template.usage_count.toLocaleString()} uses</span>
            </div>
          </div>

          {/* Event Types */}
          <EventTypePills eventTypes={template.trigger_events} className="mb-4" />

          {/* Action Button */}
          <AppButton
            onClick={handleUse}
            className="w-full"
            size="sm"
          >
            <Zap className="h-4 w-4 mr-2" />
            Use This Template
          </AppButton>
        </div>
      </Card>
    );
  }

  // Default variant
  return (
    <Card
      className={cn(
        'cursor-pointer p-4 transition-all hover:shadow-md hover:border-primary/30',
        isSelected && 'ring-2 ring-primary border-primary',
        className
      )}
      onClick={handleClick}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="rounded-lg bg-muted p-2">
          <ProviderLogo
            provider={template.provider}
            logoUrl={template.provider_logo_url}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium truncate">{template.name}</h4>
            {template.is_featured && (
              <Sparkles className="h-4 w-4 text-yellow-500 flex-shrink-0" />
            )}
            {template.is_premium && (
              <Crown className="h-4 w-4 text-purple-500 flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                categoryColors.bg,
                categoryColors.text
              )}
            >
              {formatCategoryName(template.category)}
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
        {template.short_description}
      </p>

      {/* Tags */}
      {template.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {template.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="flex items-center gap-3">
          <RatingStars rating={template.rating} />
          {!template.rating && (
            <span className="text-xs text-muted-foreground">
              {template.usage_count.toLocaleString()} uses
            </span>
          )}
        </div>
        <AppButton
          variant="ghost"
          size="sm"
          onClick={handleUse}
          className="text-primary hover:text-primary"
        >
          Use
          <ArrowRight className="h-3 w-3 ml-1" />
        </AppButton>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// IntegrationCardSkeleton - Loading State
// ---------------------------------------------------------------------------

export function IntegrationCardSkeleton({
  variant = 'default',
  className,
}: {
  variant?: 'default' | 'compact' | 'featured';
  className?: string;
}) {
  if (variant === 'compact') {
    return (
      <Card className={cn('p-3', className)}>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-muted animate-pulse" />
          <div className="flex-1">
            <div className="h-4 w-24 bg-muted rounded animate-pulse mb-1" />
            <div className="h-3 w-32 bg-muted rounded animate-pulse" />
          </div>
        </div>
      </Card>
    );
  }

  if (variant === 'featured') {
    return (
      <Card className={cn('overflow-hidden', className)}>
        <div className="h-8 bg-muted animate-pulse" />
        <div className="p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="h-14 w-14 rounded-xl bg-muted animate-pulse" />
            <div className="flex-1">
              <div className="h-5 w-32 bg-muted rounded animate-pulse mb-2" />
              <div className="h-4 w-20 bg-muted rounded animate-pulse" />
            </div>
          </div>
          <div className="h-4 w-full bg-muted rounded animate-pulse mb-2" />
          <div className="h-4 w-3/4 bg-muted rounded animate-pulse mb-4" />
          <div className="h-8 w-full bg-muted rounded animate-pulse" />
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-start gap-3 mb-3">
        <div className="h-12 w-12 rounded-lg bg-muted animate-pulse" />
        <div className="flex-1">
          <div className="h-5 w-28 bg-muted rounded animate-pulse mb-2" />
          <div className="h-4 w-16 bg-muted rounded animate-pulse" />
        </div>
      </div>
      <div className="h-4 w-full bg-muted rounded animate-pulse mb-2" />
      <div className="h-4 w-2/3 bg-muted rounded animate-pulse mb-3" />
      <div className="flex gap-1 mb-3">
        <div className="h-5 w-12 bg-muted rounded animate-pulse" />
        <div className="h-5 w-14 bg-muted rounded animate-pulse" />
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="h-4 w-20 bg-muted rounded animate-pulse" />
        <div className="h-6 w-16 bg-muted rounded animate-pulse" />
      </div>
    </Card>
  );
}

export default IntegrationCard;
