/**
 * AI-Powered Cover Style Recommendations Hook - Phase 2.3
 *
 * Analyzes user preferences and provides personalized style recommendations
 *
 * Algorithm:
 * 1. Tracks user selection history (category preferences)
 * 2. Weights recent selections higher
 * 3. Considers premium availability
 * 4. Boosts trending and new styles
 * 5. Filters out already selected styles
 *
 * Returns: Array of style IDs ranked by recommendation score
 */

import { useState, useEffect, useCallback } from 'react';

interface SelectionRecord {
  styleId: string;
  timestamp: number;
  category: string;
}

interface RecommendationScore {
  styleId: string;
  score: number;
  reasons: string[];
}

const STORAGE_KEY = 'cover_styles_recommendations_history';
const DEFAULT_HISTORY_LIMIT = 50;
const RECOMMENDATION_COUNT = 5;

export const useAICoverRecommendations = () => {
  const [selectionHistory, setSelectionHistory] = useState<SelectionRecord[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load selection history from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as SelectionRecord[];
        setSelectionHistory(parsed);
      } catch (err) {
        console.error('Failed to parse selection history:', err);
      }
    }
    setIsLoaded(true);
  }, []);

  // Add selection to history
  const recordSelection = useCallback((styleId: string, category: string) => {
    setSelectionHistory(prev => {
      const updated = [
        ...prev,
        { styleId, timestamp: Date.now(), category }
      ];
      // Keep only last N selections
      const trimmed = updated.slice(-DEFAULT_HISTORY_LIMIT);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      return trimmed;
    });
  }, []);

  // Calculate category preferences from history
  const getCategoryPreferences = useCallback(() => {
    const preferences: Record<string, number> = {};
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000; // Last 7 days

    selectionHistory.forEach(record => {
      // Weight recent selections higher (exponential decay)
      const ageInDays = (now - record.timestamp) / (24 * 60 * 60 * 1000);
      const recencyScore = Math.exp(-ageInDays / 3); // Half-life of 3 days

      preferences[record.category] = (preferences[record.category] || 0) + recencyScore;
    });

    return preferences;
  }, [selectionHistory]);

  // Get unique selected categories
  const getSelectedCategories = useCallback(() => {
    const categories = new Set(selectionHistory.map(r => r.category));
    return Array.from(categories);
  }, [selectionHistory]);

  // Calculate recommendation scores for all styles
  const getRecommendationScores = useCallback(
    (allStyles: any[], selectedStyleId: string, isPremiumUser: boolean, trendingStyles: string[] = [], newStyles: string[] = []) => {
      const categoryPrefs = getCategoryPreferences();
      const selectedCategories = getSelectedCategories();
      const totalSelections = selectionHistory.length;

      const scores: RecommendationScore[] = allStyles
        .filter(style => style.id !== selectedStyleId) // Exclude current selection
        .map(style => {
          let score = 0;
          const reasons: string[] = [];

          // 1. Category preference scoring (0-40 points)
          const categoryScore = categoryPrefs[style.category] || 0;
          const maxCategoryScore = Math.max(...Object.values(categoryPrefs), 1);
          score += (categoryScore / maxCategoryScore) * 40;

          if (categoryScore > 0) {
            reasons.push('matches_preference');
          }

          // 2. Diversity bonus (0-15 points) - Recommend different categories if few selections
          if (totalSelections < 5 || !selectedCategories.includes(style.category)) {
            const diversityBonus = Math.min(15, (5 - selectedCategories.length) * 3);
            score += diversityBonus;
            if (diversityBonus > 0) {
              reasons.push('diversity_bonus');
            }
          }

          // 3. Trending bonus (15 points)
          if (trendingStyles.includes(style.id)) {
            score += 15;
            reasons.push('trending');
          }

          // 4. New style promotion (20 points) - More weight to new styles
          if (newStyles.includes(style.id)) {
            score += 20;
            reasons.push('new_style');
          }

          // 5. Premium penalty for non-premium users (-100 points)
          if (style.premium && !isPremiumUser) {
            score -= 100;
            reasons.push('premium_locked');
          }

          // 6. Recent similar pattern bonus (10 points)
          // If user recently selected styles from same category, boost similar ones
          const recentSelections = selectionHistory.slice(-5);
          const recentCategories = recentSelections.map(r => r.category);
          if (recentCategories.includes(style.category)) {
            score += 10;
            reasons.push('recent_pattern');
          }

          return {
            styleId: style.id,
            score: Math.max(0, score), // Ensure non-negative scores
            reasons
          };
        })
        .filter(item => item.score > 0) // Filter out negative scoring items (locked premium)
        .sort((a, b) => b.score - a.score);

      return scores;
    },
    [getCategoryPreferences, getSelectedCategories, selectionHistory]
  );

  // Get top N recommendations
  const getRecommendations = useCallback(
    (allStyles: any[], selectedStyleId: string, isPremiumUser: boolean, limit: number = RECOMMENDATION_COUNT, trendingStyles: string[] = [], newStyles: string[] = []) => {
      const scores = getRecommendationScores(allStyles, selectedStyleId, isPremiumUser, trendingStyles, newStyles);
      return scores.slice(0, limit).map(item => item.styleId);
    },
    [getRecommendationScores]
  );

  // Clear recommendation history
  const clearHistory = useCallback(() => {
    setSelectionHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    recordSelection,
    getRecommendations,
    getCategoryPreferences,
    getSelectedCategories,
    clearHistory,
    isLoaded,
    historyLength: selectionHistory.length
  };
};

export default useAICoverRecommendations;
