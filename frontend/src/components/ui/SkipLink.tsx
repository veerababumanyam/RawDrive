import React from 'react';

/* =============================================================================
   SkipLink Component

   Provides keyboard users a way to skip directly to main content.
   Visible only when focused (tab key navigation).
   ============================================================================= */

interface SkipLinkProps {
  /** ID of the main content element */
  targetId?: string;
  /** Custom skip link text */
  children?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

export const SkipLink: React.FC<SkipLinkProps> = ({
  targetId = 'main-content',
  children = 'Skip to main content',
  className = '',
}) => {
  return (
    <a
      href={`#${targetId}`}
      className={`
        sr-only
        focus:not-sr-only
        focus:absolute
        focus:top-4
        focus:left-4
        focus:z-[100]
        focus:px-4
        focus:py-2
        focus:bg-primary
        focus:text-white
        focus:rounded-lg
        focus:outline-none
        focus:ring-2
        focus:ring-white
        focus:ring-offset-2
        focus:ring-offset-primary
        font-medium
        ${className}
      `}
    >
      {children}
    </a>
  );
};

export default SkipLink;
