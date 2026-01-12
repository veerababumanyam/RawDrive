/**
 * SkipLinks - Accessibility skip links for keyboard navigation
 *
 * Provides hidden links that become visible on focus, allowing
 * keyboard users to bypass navigation and jump to main content.
 *
 * WCAG 2.1 SC 2.4.1 - Bypass Blocks
 *
 * Feature: 027-gallery-feature-completion
 * User Story: US4 - Skip Links for Accessibility
 */

import { useTranslation } from 'react-i18next';

interface SkipLink {
  /** Target element ID (without #) */
  targetId: string;
  /** Link label */
  label: string;
}

interface SkipLinksProps {
  /** Custom links to render (defaults to main content link) */
  links?: SkipLink[];
  /** Additional CSS classes */
  className?: string;
}

/**
 * Default skip links for typical page layouts
 */
const DEFAULT_LINKS: SkipLink[] = [
  { targetId: 'main-content', label: 'skipToContent' },
];

/**
 * Gallery-specific skip links for photo viewing pages
 */
export const GALLERY_SKIP_LINKS: SkipLink[] = [
  { targetId: 'main-content', label: 'skipToContent' },
  { targetId: 'gallery-grid', label: 'skipToGallery' },
];

/**
 * Lightbox-specific skip links
 */
export const LIGHTBOX_SKIP_LINKS: SkipLink[] = [
  { targetId: 'lightbox-image', label: 'skipToPhoto' },
  { targetId: 'photo-actions', label: 'skipToPhotoActions' },
];

/**
 * SkipLinks component for keyboard accessibility
 *
 * @example
 * ```tsx
 * // Basic usage (main content only)
 * <SkipLinks />
 *
 * // Gallery page with multiple skip targets
 * <SkipLinks links={GALLERY_SKIP_LINKS} />
 *
 * // Custom links
 * <SkipLinks
 *   links={[
 *     { targetId: 'search', label: 'Skip to search' },
 *     { targetId: 'results', label: 'Skip to results' },
 *   ]}
 * />
 * ```
 */
export function SkipLinks({ links = DEFAULT_LINKS, className = '' }: SkipLinksProps) {
  const { t } = useTranslation('gallery');

  return (
    <nav
      aria-label={t('accessibility.skipNavigation', 'Skip navigation')}
      className={`skip-links ${className}`}
    >
      {links.map((link, index) => (
        <a
          key={link.targetId}
          href={`#${link.targetId}`}
          className="skip-link"
          // Tab order ensures skip links are first focusable elements
          tabIndex={index === 0 ? 0 : undefined}
        >
          {t(`accessibility.${link.label}`, link.label)}
        </a>
      ))}

      {/* CSS for skip links - visually hidden until focused */}
      <style>{`
        .skip-links {
          position: fixed;
          top: 0;
          left: 0;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 4px;
        }

        .skip-link {
          position: absolute;
          left: -9999px;
          top: 0;
          padding: 12px 16px;
          background-color: var(--hc-background, #1a1a2e);
          color: var(--hc-text-primary, #ffffff);
          font-weight: 600;
          font-size: 14px;
          text-decoration: none;
          border: 2px solid var(--hc-focus-ring, #00ffff);
          border-radius: 4px;
          white-space: nowrap;
          transition: none;
        }

        .skip-link:focus {
          position: static;
          left: auto;
          outline: 3px solid var(--hc-focus-ring, #00ffff);
          outline-offset: 2px;
        }

        .skip-link:focus-visible {
          position: static;
          left: auto;
        }

        /* High contrast mode adjustments */
        .high-contrast .skip-link {
          background-color: var(--hc-background);
          color: var(--hc-text-primary);
          border-color: var(--hc-focus-ring);
        }

        .high-contrast .skip-link:focus {
          background-color: var(--hc-text-emphasis, #ffff00);
          color: var(--hc-background);
        }

        /* Dark mode adjustments */
        @media (prefers-color-scheme: dark) {
          .skip-link {
            background-color: #1a1a2e;
            border-color: #00d4ff;
          }
        }

        /* Reduced motion - no transitions */
        @media (prefers-reduced-motion: reduce) {
          .skip-link {
            transition: none;
          }
        }
      `}</style>
    </nav>
  );
}

export default SkipLinks;
