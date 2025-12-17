import React from 'react';

/* =============================================================================
   VisuallyHidden Component

   Hides content visually while keeping it accessible to screen readers.
   Use for providing additional context to assistive technologies.
   ============================================================================= */

interface VisuallyHiddenProps {
  /** Content to be visually hidden */
  children: React.ReactNode;
  /** Render as a different element */
  as?: keyof JSX.IntrinsicElements;
}

export const VisuallyHidden: React.FC<VisuallyHiddenProps> = ({
  children,
  as: Component = 'span',
}) => {
  return (
    <Component className="sr-only">
      {children}
    </Component>
  );
};

export default VisuallyHidden;
