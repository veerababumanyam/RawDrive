/**
 * Utility functions
 *
 * Common utilities for the frontend application.
 */

/**
 * Concatenate class names, filtering out falsy values.
 * Simple alternative to clsx/classnames when we don't need tailwind-merge.
 *
 * @example
 * cn('base', isActive && 'active', isDisabled && 'disabled')
 * // => "base active" when isActive=true, isDisabled=false
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
