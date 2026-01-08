/**
 * useUnifiedAI Hook
 *
 * Centralized state management for all AI operations.
 * Tracks active analyses, curations, generations, and manages filter state.
 * Coordinates with multiple AI microservices.
 *
 * Feature: AI Services Consolidation
 */

import { useState, useCallback, useMemo } from 'react';
import type {
  PhotoQualityResult,
  QualityAnalysisSummary,
  CurationSession,
} from '@/types/curation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AIOperationType = 'analysis' | 'curation' | 'caption' | 'hashtag' | 'story' | 'face' | 'similarity';

export interface AIOperation {
  id: string;
  type: AIOperationType;
  status: 'pending' | 'active' | 'completed' | 'error';
  progress?: number;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface UnifiedAIState {
  /** Active AI operations */
  operations: AIOperation[];
  /** Quality analysis results */
  qualityResults: PhotoQualityResult[];
  qualitySummary: QualityAnalysisSummary | null;
  /** Active curation session */
  curationSession: CurationSession | null;
  /** Filter state */
  filters: {
    qualityTier?: string;
    qualityMin?: number;
    blurHide?: boolean;
    blurShowBokeh?: boolean;
    minSharpness?: number;
    minExposure?: number;
    minComposition?: number;
  };
}

export interface UseUnifiedAIOptions {
  workspaceId: string;
  galleryId: string;
  /** Callback when any operation completes */
  onOperationComplete?: (operation: AIOperation) => void;
  /** Callback when any operation fails */
  onOperationError?: (operation: AIOperation) => void;
}

export interface UseUnifiedAIResult {
  /** Current state */
  state: UnifiedAIState;
  /** Active operations count */
  activeOperationsCount: number;
  /** Check if any operation is active */
  hasActiveOperations: boolean;
  /** Add a new operation */
  addOperation: (operation: Omit<AIOperation, 'id' | 'startedAt'>) => string;
  /** Update an operation */
  updateOperation: (id: string, updates: Partial<AIOperation>) => void;
  /** Remove an operation */
  removeOperation: (id: string) => void;
  /** Set quality results */
  setQualityResults: (results: PhotoQualityResult[], summary: QualityAnalysisSummary | null) => void;
  /** Set curation session */
  setCurationSession: (session: CurationSession | null) => void;
  /** Update filters */
  updateFilters: (filters: Partial<UnifiedAIState['filters']>) => void;
  /** Reset filters */
  resetFilters: () => void;
  /** Get operation by type */
  getOperationByType: (type: AIOperationType) => AIOperation | undefined;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useUnifiedAI({
  workspaceId,
  galleryId,
  onOperationComplete,
  onOperationError,
}: UseUnifiedAIOptions): UseUnifiedAIResult {
  const [operations, setOperations] = useState<AIOperation[]>([]);
  const [qualityResults, setQualityResults] = useState<PhotoQualityResult[]>([]);
  const [qualitySummary, setQualitySummary] = useState<QualityAnalysisSummary | null>(null);
  const [curationSession, setCurationSession] = useState<CurationSession | null>(null);
  const [filters, setFilters] = useState<UnifiedAIState['filters']>({});

  // Generate unique operation ID
  const generateOperationId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Add operation
  const addOperation = useCallback(
    (operation: Omit<AIOperation, 'id' | 'startedAt'>): string => {
      const id = generateOperationId();
      const newOperation: AIOperation = {
        ...operation,
        id,
        startedAt: new Date(),
      };

      setOperations((prev) => [...prev, newOperation]);

      return id;
    },
    [generateOperationId]
  );

  // Update operation
  const updateOperation = useCallback((id: string, updates: Partial<AIOperation>) => {
    setOperations((prev) => {
      const updated = prev.map((op) => {
        if (op.id === id) {
          const updatedOp = { ...op, ...updates };
          
          // Handle completion
          if (updates.status === 'completed') {
            updatedOp.completedAt = new Date();
            onOperationComplete?.(updatedOp);
          }
          
          // Handle errors
          if (updates.status === 'error') {
            updatedOp.completedAt = new Date();
            onOperationError?.(updatedOp);
          }
          
          return updatedOp;
        }
        return op;
      });
      return updated;
    });
  }, [onOperationComplete, onOperationError]);

  // Remove operation
  const removeOperation = useCallback((id: string) => {
    setOperations((prev) => prev.filter((op) => op.id !== id));
  }, []);

  // Set quality results
  const handleSetQualityResults = useCallback(
    (results: PhotoQualityResult[], summary: QualityAnalysisSummary | null) => {
      setQualityResults(results);
      setQualitySummary(summary);
    },
    []
  );

  // Update filters
  const handleUpdateFilters = useCallback((newFilters: Partial<UnifiedAIState['filters']>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  // Reset filters
  const handleResetFilters = useCallback(() => {
    setFilters({});
  }, []);

  // Get operation by type
  const getOperationByType = useCallback(
    (type: AIOperationType) => {
      return operations.find((op) => op.type === type && op.status === 'active');
    },
    [operations]
  );

  // Computed values
  const activeOperationsCount = useMemo(() => {
    return operations.filter((op) => op.status === 'active' || op.status === 'pending').length;
  }, [operations]);

  const hasActiveOperations = useMemo(() => {
    return activeOperationsCount > 0;
  }, [activeOperationsCount]);

  const state: UnifiedAIState = useMemo(
    () => ({
      operations,
      qualityResults,
      qualitySummary,
      curationSession,
      filters,
    }),
    [operations, qualityResults, qualitySummary, curationSession, filters]
  );

  return {
    state,
    activeOperationsCount,
    hasActiveOperations,
    addOperation,
    updateOperation,
    removeOperation,
    setQualityResults: handleSetQualityResults,
    setCurationSession,
    updateFilters: handleUpdateFilters,
    resetFilters: handleResetFilters,
    getOperationByType,
  };
}
