/**
 * GalleryThemeToggle - Dark/light mode toggle for public gallery pages.
 *
 * Reads initial preference from localStorage (key: "gallery-theme"),
 * falls back to system preference via prefers-color-scheme media query.
 * Sets data-theme attribute on document.documentElement and persists choice.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Sun, Moon } from 'lucide-react';

const STORAGE_KEY = 'gallery-theme';

function getInitialTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // localStorage unavailable
  }

  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export const GalleryThemeToggle: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);

  // Apply theme to DOM on mount and changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // localStorage unavailable
      }
      document.documentElement.setAttribute('data-theme', next);
      return next;
    });
  }, []);

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label={`Toggle theme to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
};

export default GalleryThemeToggle;
