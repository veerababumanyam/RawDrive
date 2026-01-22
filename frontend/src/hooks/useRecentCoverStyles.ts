/**
 * useRecentCoverStyles Hook
 * Tracks recently used cover styles in localStorage
 *
 * Features:
 * - Persistent storage across sessions
 * - Maintains ordered list (most recent first)
 * - Configurable history limit (default: 5)
 * - Prevents duplicates
 */

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'cover_styles_recent';
const DEFAULT_LIMIT = 5;

export interface RecentStyle {
  id: string;
  timestamp: number;
}

export const useRecentCoverStyles = (limit: number = DEFAULT_LIMIT) => {
  const [recentStyles, setRecentStyles] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as RecentStyle[];
        // Sort by timestamp (newest first) and extract IDs
        const styleIds = parsed
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, limit)
          .map(item => item.id);
        setRecentStyles(styleIds);
      } catch (err) {
        console.error('Failed to parse recent styles:', err);
      }
    }
    setIsLoaded(true);
  }, [limit]);

  // Add or update a style
  const addRecentStyle = useCallback((styleId: string) => {
    const stored = localStorage.getItem(STORAGE_KEY);
    let recentItems: RecentStyle[] = [];

    if (stored) {
      try {
        recentItems = JSON.parse(stored);
      } catch (err) {
        console.error('Failed to parse recent styles:', err);
      }
    }

    // Remove if already exists (to move it to top)
    recentItems = recentItems.filter(item => item.id !== styleId);

    // Add new item at top
    recentItems.unshift({
      id: styleId,
      timestamp: Date.now(),
    });

    // Keep only the limit
    recentItems = recentItems.slice(0, limit);

    // Save back to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recentItems));

    // Update state
    setRecentStyles(recentItems.map(item => item.id));
  }, [limit]);

  // Clear history
  const clearHistory = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setRecentStyles([]);
  }, []);

  return {
    recentStyles,
    addRecentStyle,
    clearHistory,
    isLoaded,
  };
};

export default useRecentCoverStyles;
