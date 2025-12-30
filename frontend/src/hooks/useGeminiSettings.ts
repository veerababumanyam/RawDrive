/**
 * useGeminiSettings Hooks
 * Hooks for user Gemini API key and model configuration.
 * Feature: 003-user-gemini-settings
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { geminiSettingsService } from '../services/geminiSettingsService';
import type {
  UserGeminiSettings,
  UpdateGeminiSettingsRequest,
  KeyValidationResult,
  GeminiModel,
  AIFeatureToggles,
  AIFeatureTogglesResponse,
  UpdateAIFeatureTogglesRequest,
} from '../types/geminiSettings';

// ---------------------------------------------------------------------------
// Gemini Settings Hook
// ---------------------------------------------------------------------------

interface UseGeminiSettingsOptions {
  /** Auto-fetch settings on mount (default: true) */
  autoFetch?: boolean;
}

interface UseGeminiSettingsReturn {
  /** Current user settings */
  settings: UserGeminiSettings | null;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch settings */
  refetch: () => Promise<void>;
  /** Update settings (API key and/or model) */
  updateSettings: (data: UpdateGeminiSettingsRequest) => Promise<UserGeminiSettings>;
  /** Validate API key without saving */
  validateKey: (apiKey: string) => Promise<KeyValidationResult>;
  /** Revoke the stored API key */
  revokeKey: () => Promise<UserGeminiSettings>;
  /** Update model selection only */
  updateModelSelection: (modelId: string | null) => Promise<UserGeminiSettings>;
}

export const useGeminiSettings = ({
  autoFetch = true,
}: UseGeminiSettingsOptions = {}): UseGeminiSettingsReturn => {
  const [settings, setSettings] = useState<UserGeminiSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await geminiSettingsService.getSettings();
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch Gemini settings'));
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchSettings();
    }
  }, [autoFetch, fetchSettings]);

  const updateSettings = useCallback(async (data: UpdateGeminiSettingsRequest) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await geminiSettingsService.updateSettings(data);
      setSettings(updated);
      return updated;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update settings');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const validateKey = useCallback(async (apiKey: string) => {
    setLoading(true);
    setError(null);
    try {
      return await geminiSettingsService.validateKey(apiKey);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to validate API key');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const revokeKey = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const updated = await geminiSettingsService.revokeKey();
      setSettings(updated);
      return updated;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to revoke API key');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateModelSelection = useCallback(async (modelId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await geminiSettingsService.updateModelSelection(modelId);
      setSettings(updated);
      return updated;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update model selection');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    settings,
    loading,
    error,
    refetch: fetchSettings,
    updateSettings,
    validateKey,
    revokeKey,
    updateModelSelection,
  };
};

// ---------------------------------------------------------------------------
// Gemini Models Hook
// ---------------------------------------------------------------------------

interface UseGeminiModelsOptions {
  /** Auto-fetch models on mount (default: true) */
  autoFetch?: boolean;
}

interface UseGeminiModelsReturn {
  /** Available Gemini models */
  models: GeminiModel[];
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch models */
  refetch: () => Promise<void>;
  /** Get model by ID */
  getModelById: (modelId: string) => GeminiModel | undefined;
  /** Get the default model */
  defaultModel: GeminiModel | undefined;
}

export const useGeminiModels = ({
  autoFetch = true,
}: UseGeminiModelsOptions = {}): UseGeminiModelsReturn => {
  const [models, setModels] = useState<GeminiModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await geminiSettingsService.listModels();
      setModels(data.models);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch Gemini models'));
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchModels();
    }
  }, [autoFetch, fetchModels]);

  const getModelById = useCallback(
    (modelId: string) => models.find((m) => m.model_id === modelId),
    [models]
  );

  const defaultModel = useMemo(
    () => models.find((m) => m.is_default),
    [models]
  );

  return {
    models,
    loading,
    error,
    refetch: fetchModels,
    getModelById,
    defaultModel,
  };
};

// ---------------------------------------------------------------------------
// Combined Settings Page Hook
// ---------------------------------------------------------------------------

interface UseGeminiSettingsPageOptions {
  /** Auto-fetch on mount (default: true) */
  autoFetch?: boolean;
}

interface UseGeminiSettingsPageReturn {
  /** User settings */
  settings: UserGeminiSettings | null;
  /** Available models */
  models: GeminiModel[];
  /** Loading state for settings */
  settingsLoading: boolean;
  /** Loading state for models */
  modelsLoading: boolean;
  /** Combined loading state */
  loading: boolean;
  /** Settings error */
  settingsError: Error | null;
  /** Models error */
  modelsError: Error | null;
  /** Update settings */
  updateSettings: (data: UpdateGeminiSettingsRequest) => Promise<UserGeminiSettings>;
  /** Validate API key */
  validateKey: (apiKey: string) => Promise<KeyValidationResult>;
  /** Revoke API key */
  revokeKey: () => Promise<UserGeminiSettings>;
  /** Update model selection */
  updateModelSelection: (modelId: string | null) => Promise<UserGeminiSettings>;
  /** Refetch both settings and models */
  refetchAll: () => Promise<void>;
}

export const useGeminiSettingsPage = ({
  autoFetch = true,
}: UseGeminiSettingsPageOptions = {}): UseGeminiSettingsPageReturn => {
  const {
    settings,
    loading: settingsLoading,
    error: settingsError,
    refetch: refetchSettings,
    updateSettings,
    validateKey,
    revokeKey,
    updateModelSelection,
  } = useGeminiSettings({ autoFetch });

  const {
    models,
    loading: modelsLoading,
    error: modelsError,
    refetch: refetchModels,
  } = useGeminiModels({ autoFetch });

  const loading = settingsLoading || modelsLoading;

  const refetchAll = useCallback(async () => {
    await Promise.all([refetchSettings(), refetchModels()]);
  }, [refetchSettings, refetchModels]);

  return {
    settings,
    models,
    settingsLoading,
    modelsLoading,
    loading,
    settingsError,
    modelsError,
    updateSettings,
    validateKey,
    revokeKey,
    updateModelSelection,
    refetchAll,
  };
};

// ---------------------------------------------------------------------------
// AI Feature Toggles Hook (T080)
// ---------------------------------------------------------------------------

interface UseAIFeatureTogglesOptions {
  /** Auto-fetch on mount (default: true) */
  autoFetch?: boolean;
}

interface UseAIFeatureTogglesReturn {
  /** Feature toggle response */
  featureToggles: AIFeatureTogglesResponse | null;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch feature toggles */
  refetch: () => Promise<void>;
  /** Update feature toggles */
  updateToggles: (updates: UpdateAIFeatureTogglesRequest) => Promise<AIFeatureTogglesResponse>;
  /** Toggle a single feature */
  toggleFeature: (feature: keyof AIFeatureToggles) => Promise<AIFeatureTogglesResponse>;
  /** Check if a feature is enabled */
  isFeatureEnabled: (feature: keyof AIFeatureToggles) => boolean;
}

export const useAIFeatureToggles = ({
  autoFetch = true,
}: UseAIFeatureTogglesOptions = {}): UseAIFeatureTogglesReturn => {
  const [featureToggles, setFeatureToggles] = useState<AIFeatureTogglesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchToggles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await geminiSettingsService.getFeatureToggles();
      setFeatureToggles(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch feature toggles'));
      setFeatureToggles(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchToggles();
    }
  }, [autoFetch, fetchToggles]);

  const updateToggles = useCallback(async (updates: UpdateAIFeatureTogglesRequest) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await geminiSettingsService.updateFeatureToggles(updates);
      setFeatureToggles(updated);
      return updated;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update feature toggles');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleFeature = useCallback(
    async (feature: keyof AIFeatureToggles) => {
      if (!featureToggles) {
        throw new Error('Feature toggles not loaded');
      }
      const currentValue = featureToggles.toggles[feature];
      return updateToggles({ [feature]: !currentValue });
    },
    [featureToggles, updateToggles]
  );

  const isFeatureEnabled = useCallback(
    (feature: keyof AIFeatureToggles): boolean => {
      if (!featureToggles) {
        return true; // Default to enabled if not loaded
      }
      return featureToggles.toggles[feature];
    },
    [featureToggles]
  );

  return {
    featureToggles,
    loading,
    error,
    refetch: fetchToggles,
    updateToggles,
    toggleFeature,
    isFeatureEnabled,
  };
};
