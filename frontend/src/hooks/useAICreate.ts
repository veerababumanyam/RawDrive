/**
 * useAICreate Hook
 *
 * Handles AI content generation for stories, captions, and hashtags (US6).
 * Manages generation state and history.
 *
 * Feature: 025-ai-filter-simplify
 */

import { useState, useCallback } from 'react';
import { aiFilterService } from '../services/aiFilterService';
import type { AICreateMode, AICreateRequest, AICreateResult } from '../types/aiFilter';

export interface UseAICreateOptions {
  workspaceId?: string;
  galleryId?: string;
}

export interface GenerationHistoryItem {
  id: string;
  request: AICreateRequest;
  result: AICreateResult;
  timestamp: Date;
}

export interface UseAICreateReturn {
  generate: (request: AICreateRequest) => Promise<AICreateResult>;
  isGenerating: boolean;
  lastResult: AICreateResult | null;
  error: Error | null;
  history: GenerationHistoryItem[];
  clearHistory: () => void;
}

export const useAICreate = ({
  workspaceId,
  galleryId,
}: UseAICreateOptions): UseAICreateReturn => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<AICreateResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);

  const generate = useCallback(
    async (request: AICreateRequest): Promise<AICreateResult> => {
      if (!workspaceId || !galleryId) {
        throw new Error('Workspace and gallery IDs are required');
      }

      if (request.asset_ids.length === 0) {
        throw new Error('At least one photo must be selected');
      }

      setIsGenerating(true);
      setError(null);

      try {
        const result = await aiFilterService.generateContent(
          workspaceId,
          galleryId,
          request
        );
        setLastResult(result);

        // Add to history
        const historyItem: GenerationHistoryItem = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          request,
          result,
          timestamp: new Date(),
        };
        setHistory((prev) => [historyItem, ...prev.slice(0, 9)]); // Keep last 10

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Generation failed');
        setError(error);
        throw error;
      } finally {
        setIsGenerating(false);
      }
    },
    [workspaceId, galleryId]
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    setLastResult(null);
  }, []);

  return {
    generate,
    isGenerating,
    lastResult,
    error,
    history,
    clearHistory,
  };
};

/**
 * Get default settings for an AI create mode
 */
export const getDefaultCreateSettings = (mode: AICreateMode) => {
  switch (mode) {
    case 'story':
      return {
        style: 'professional',
        tone: 'warm',
        max_length: 2000,
      };
    case 'caption':
      return {
        style: 'casual',
        tone: 'playful',
        max_length: 500,
      };
    case 'hashtags':
      return {
        style: 'professional',
        tone: undefined,
        max_length: undefined,
      };
    default:
      return {
        style: 'professional',
        tone: 'warm',
        max_length: undefined,
      };
  }
};
