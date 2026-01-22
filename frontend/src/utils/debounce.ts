/**
 * Debounce utility function
 *
 * Delays function execution until after a specified time has elapsed
 * without the function being called again.
 *
 * Usage:
 * const debouncedSearch = debounce((query) => {
 *   // Perform search
 * }, 300);
 *
 * @param func - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function (...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  };
}
