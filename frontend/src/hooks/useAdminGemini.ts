/**
 * Admin Gemini Models Hooks
 * React hooks for admin management of the Gemini model catalogue.
 * Feature: 003-user-gemini-settings
 */

import { useState, useCallback, useEffect } from 'react';
import { adminGeminiService } from '../services/adminGeminiService';
import type {
  GeminiModelAdmin,
  CreateGeminiModelRequest,
  UpdateGeminiModelRequest,
  GeminiAdminStats,
} from '../types/geminiSettings';

// ---------------------------------------------------------------------------
// useAdminGeminiModels - List and manage models
// ---------------------------------------------------------------------------

interface UseAdminGeminiModelsReturn {
  models: GeminiModelAdmin[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createModel: (data: CreateGeminiModelRequest) => Promise<GeminiModelAdmin>;
  updateModel: (modelId: string, data: UpdateGeminiModelRequest) => Promise<GeminiModelAdmin>;
  deleteModel: (modelId: string) => Promise<void>;
  setDefaultModel: (modelId: string) => Promise<void>;
  toggleModelActive: (modelId: string, isActive: boolean) => Promise<void>;
  reorderModels: (modelIds: string[]) => Promise<void>;
}

export function useAdminGeminiModels(): UseAdminGeminiModelsReturn {
  const [models, setModels] = useState<GeminiModelAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminGeminiService.listModels(true);
      setModels(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createModel = useCallback(async (data: CreateGeminiModelRequest) => {
    const newModel = await adminGeminiService.createModel(data);
    setModels((prev) => [...prev, newModel].sort((a, b) => a.sort_order - b.sort_order));
    return newModel;
  }, []);

  const updateModel = useCallback(async (modelId: string, data: UpdateGeminiModelRequest) => {
    const updated = await adminGeminiService.updateModel(modelId, data);
    setModels((prev) =>
      prev.map((m) => (m.model_id === modelId ? updated : m))
    );
    return updated;
  }, []);

  const deleteModel = useCallback(async (modelId: string) => {
    await adminGeminiService.deleteModel(modelId);
    setModels((prev) => prev.filter((m) => m.model_id !== modelId));
  }, []);

  const setDefaultModel = useCallback(async (modelId: string) => {
    await adminGeminiService.setDefaultModel(modelId);
    setModels((prev) =>
      prev.map((m) => ({
        ...m,
        is_default: m.model_id === modelId,
      }))
    );
  }, []);

  const toggleModelActive = useCallback(async (modelId: string, isActive: boolean) => {
    const updated = await adminGeminiService.toggleModelActive(modelId, isActive);
    setModels((prev) =>
      prev.map((m) => (m.model_id === modelId ? updated : m))
    );
  }, []);

  const reorderModels = useCallback(async (modelIds: string[]) => {
    const reordered = await adminGeminiService.reorderModels(modelIds);
    setModels(reordered);
  }, []);

  return {
    models,
    isLoading,
    error,
    refresh,
    createModel,
    updateModel,
    deleteModel,
    setDefaultModel,
    toggleModelActive,
    reorderModels,
  };
}

// ---------------------------------------------------------------------------
// useAdminGeminiStats - Statistics dashboard
// ---------------------------------------------------------------------------

interface UseAdminGeminiStatsReturn {
  stats: GeminiAdminStats | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAdminGeminiStats(): UseAdminGeminiStatsReturn {
  const [stats, setStats] = useState<GeminiAdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminGeminiService.getStats();
      setStats(data);
    } catch (err) {
      // Stats endpoint may not exist yet (Phase 8)
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    stats,
    isLoading,
    error,
    refresh,
  };
}

// ---------------------------------------------------------------------------
// useAdminGeminiModel - Single model operations
// ---------------------------------------------------------------------------

interface UseAdminGeminiModelReturn {
  model: GeminiModelAdmin | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  update: (data: UpdateGeminiModelRequest) => Promise<GeminiModelAdmin>;
}

export function useAdminGeminiModel(modelId: string | null): UseAdminGeminiModelReturn {
  const [model, setModel] = useState<GeminiModelAdmin | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!modelId) {
      setModel(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await adminGeminiService.getModel(modelId);
      setModel(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model');
    } finally {
      setIsLoading(false);
    }
  }, [modelId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const update = useCallback(
    async (data: UpdateGeminiModelRequest) => {
      if (!modelId) {
        throw new Error('No model ID provided');
      }
      const updated = await adminGeminiService.updateModel(modelId, data);
      setModel(updated);
      return updated;
    },
    [modelId]
  );

  return {
    model,
    isLoading,
    error,
    refresh,
    update,
  };
}
