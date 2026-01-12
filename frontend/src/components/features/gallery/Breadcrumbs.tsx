/**
 * Breadcrumbs - Navigation component for nested sub-gallery hierarchy
 *
 * Shows current location in gallery structure with clickable path segments.
 * Supports up to 3 levels of nesting.
 *
 * Feature: 027-gallery-feature-completion
 * User Story: US6 - Breadcrumb Navigation
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Type of item */
  type: 'gallery' | 'sub_gallery';
  /** Navigation path (optional - if not provided, item is not clickable) */
  path?: string;
}

interface BreadcrumbsProps {
  /** List of breadcrumb items from root to current */
  items: BreadcrumbItem[];
  /** Gallery ID for constructing paths */
  galleryId: string;
  /** Optional className for styling */
  className?: string;
  /** Whether to show home icon for gallery root */
  showHomeIcon?: boolean;
  /** Callback when a breadcrumb is clicked */
  onNavigate?: (item: BreadcrumbItem) => void;
}

/**
 * Breadcrumb navigation for nested sub-galleries
 *
 * @example
 * ```tsx
 * <Breadcrumbs
 *   galleryId="gallery-uuid"
 *   items={[
 *     { id: 'gallery-uuid', name: 'Wedding Gallery', type: 'gallery' },
 *     { id: 'sub-1', name: 'Day 1', type: 'sub_gallery' },
 *     { id: 'sub-2', name: 'Ceremony', type: 'sub_gallery' },
 *   ]}
 * />
 * ```
 */
export function Breadcrumbs({
  items,
  galleryId,
  className = '',
  showHomeIcon = true,
  onNavigate,
}: BreadcrumbsProps) {
  const { t } = useTranslation('gallery');

  // Build paths for each breadcrumb item
  const itemsWithPaths = useMemo(() => {
    return items.map((item, index) => {
      let path: string;

      if (item.type === 'gallery') {
        path = `/g/${galleryId}`;
      } else {
        // Sub-gallery path includes the sub-gallery ID
        path = `/g/${galleryId}?folder=${item.id}`;
      }

      return { ...item, path };
    });
  }, [items, galleryId]);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label={t('accessibility.breadcrumb', 'Breadcrumb')}
      className={`breadcrumbs ${className}`}
    >
      <ol className="flex items-center flex-wrap gap-1 text-sm">
        {itemsWithPaths.map((item, index) => {
          const isLast = index === itemsWithPaths.length - 1;
          const isFirst = index === 0;

          return (
            <li key={item.id} className="flex items-center">
              {/* Separator (except for first item) */}
              {!isFirst && (
                <ChevronRight
                  className="w-4 h-4 mx-1 text-gray-400 dark:text-gray-500 flex-shrink-0"
                  aria-hidden="true"
                />
              )}

              {isLast ? (
                // Current page - not a link
                <span
                  className="font-medium text-gray-900 dark:text-white"
                  aria-current="page"
                >
                  {isFirst && showHomeIcon && (
                    <Home
                      className="w-4 h-4 inline-block mr-1 -mt-0.5"
                      aria-hidden="true"
                    />
                  )}
                  {item.name}
                </span>
              ) : (
                // Clickable breadcrumb
                <Link
                  to={item.path!}
                  onClick={(e) => {
                    if (onNavigate) {
                      e.preventDefault();
                      onNavigate(item);
                    }
                  }}
                  className="text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 hover:underline transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded"
                >
                  {isFirst && showHomeIcon && (
                    <Home
                      className="w-4 h-4 inline-block mr-1 -mt-0.5"
                      aria-hidden="true"
                    />
                  )}
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {/* Schema.org BreadcrumbList structured data for SEO */}
      <script type="application/ld+json">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: itemsWithPaths.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.name,
            item: item.path ? `${window.location.origin}${item.path}` : undefined,
          })),
        })}
      </script>
    </nav>
  );
}

/**
 * Hook to fetch breadcrumb data from API
 */
export function useBreadcrumbs(galleryId: string, subGalleryId?: string) {
  // This would typically use React Query or SWR
  // For now, return a placeholder that can be implemented with actual API call

  return {
    data: [] as BreadcrumbItem[],
    isLoading: false,
    error: null,
  };
}

export default Breadcrumbs;
