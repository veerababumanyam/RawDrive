import { useCallback, useEffect, useMemo, useState } from 'react';
import { aiFilterService } from '../services/aiFilterService';
import { useDebounce } from './useDebounce';
import type {
  AIFilterState,
  AppliedAIFilterResult,
  AIFilterParams,
  CurationPreset,
} from '../types/aiFilter';

const DEFAULT_FILTERS: AIFilterState = {
  // US1-2: Quality filters
  qualityTier: 'all',
  qualityMin: undefined,
  blurHide: false,
  blurShowBokeh: true,
  minSharpness: undefined,
  minExposure: undefined,
  minComposition: undefined,
  // US4: Content/context filters
  includeTags: undefined,
  excludeTags: undefined,
  hasFaces: undefined,
  minFaces: undefined,
  maxFaces: undefined,
  // US5: Similarity filters
  hideSimilar: undefined,
  similarityThreshold: undefined,
  showOnlyBestShots: undefined,
};

const STORAGE_KEY = (workspaceId: string, galleryId: string) => `aiFilters:${workspaceId}:${galleryId}`;

const parseNumberParam = (value: string | null | undefined): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const parseStringArrayParam = (value: string | null | undefined): string[] | undefined => {
  if (!value) return undefined;
  const arr = value.split(',').filter(Boolean);
  return arr.length > 0 ? arr : undefined;
};

const parseBooleanParam = (value: string | null | undefined): boolean | undefined => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
};

const loadFromUrl = (): Partial<AIFilterState> => {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);

  // Only include values that are actually set in URL (avoid undefined overriding defaults)
  const result: Partial<AIFilterState> = {};

  // US1-2: Quality filters
  const qualityTier = params.get('quality_tier');
  if (qualityTier) result.qualityTier = qualityTier as AIFilterState['qualityTier'];

  const qualityMin = parseNumberParam(params.get('quality_min'));
  if (qualityMin !== undefined) result.qualityMin = qualityMin;

  if (params.has('blur_hide')) result.blurHide = params.get('blur_hide') === 'true';
  if (params.has('blur_show_bokeh')) result.blurShowBokeh = params.get('blur_show_bokeh') !== 'false';

  const minSharpness = parseNumberParam(params.get('min_sharpness'));
  if (minSharpness !== undefined) result.minSharpness = minSharpness;

  const minExposure = parseNumberParam(params.get('min_exposure'));
  if (minExposure !== undefined) result.minExposure = minExposure;

  const minComposition = parseNumberParam(params.get('min_composition'));
  if (minComposition !== undefined) result.minComposition = minComposition;

  // US4: Content/context filters
  const includeTags = parseStringArrayParam(params.get('include_tags'));
  if (includeTags) result.includeTags = includeTags;

  const excludeTags = parseStringArrayParam(params.get('exclude_tags'));
  if (excludeTags) result.excludeTags = excludeTags;

  const hasFaces = parseBooleanParam(params.get('has_faces'));
  if (hasFaces !== undefined) result.hasFaces = hasFaces;

  const minFaces = parseNumberParam(params.get('min_faces'));
  if (minFaces !== undefined) result.minFaces = minFaces;

  const maxFaces = parseNumberParam(params.get('max_faces'));
  if (maxFaces !== undefined) result.maxFaces = maxFaces;

  // US5: Similarity filters
  const hideSimilar = parseBooleanParam(params.get('hide_similar'));
  if (hideSimilar !== undefined) result.hideSimilar = hideSimilar;

  const similarityThreshold = parseNumberParam(params.get('similarity_threshold'));
  if (similarityThreshold !== undefined) result.similarityThreshold = similarityThreshold;

  const showOnlyBestShots = parseBooleanParam(params.get('show_only_best_shots'));
  if (showOnlyBestShots !== undefined) result.showOnlyBestShots = showOnlyBestShots;

  return result;
};

export interface UseAIFiltersOptions {
  workspaceId?: string;
  galleryId?: string;
  /** Fetch match count automatically when filters change */
  autoCount?: boolean;
  /** Debounce duration for match count */
  countDebounceMs?: number;
}

export interface UseAIFiltersReturn {
  filters: AIFilterState;
  setFilters: (updater: (prev: AIFilterState) => AIFilterState) => void;
  updateFilter: (partial: Partial<AIFilterState>) => void;
  resetFilters: () => void;
  applyFilters: (override?: Partial<AIFilterParams>) => Promise<AppliedAIFilterResult | null>;
  applyPreset: (preset: CurationPreset) => void;
  matchCount: number | null;
  countLoading: boolean;
  applyLoading: boolean;
  lastApplied?: AppliedAIFilterResult;
}

export const useAIFilters = ({
  workspaceId,
  galleryId,
  autoCount = true,
  countDebounceMs = 300,
}: UseAIFiltersOptions): UseAIFiltersReturn => {
  const [filters, setFiltersState] = useState<AIFilterState>(() => {
    const fromUrl = loadFromUrl();
    return {
      ...DEFAULT_FILTERS,
      ...fromUrl,
    };
  });
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [lastApplied, setLastApplied] = useState<AppliedAIFilterResult | undefined>(undefined);

  const storageKey = useMemo(() => {
    if (!workspaceId || !galleryId) return null;
    return STORAGE_KEY(workspaceId, galleryId);
  }, [workspaceId, galleryId]);

  // Load from sessionStorage (takes precedence over URL)
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as AIFilterState;
        setFiltersState({ ...DEFAULT_FILTERS, ...parsed });
      }
    } catch (err) {
      console.warn('Failed to load AI filters from sessionStorage', err);
    }
  }, [storageKey]);

  const persistState = useCallback(
    (next: AIFilterState) => {
      if (storageKey) {
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(next));
        } catch (err) {
          console.warn('Failed to persist AI filters', err);
        }
      }

      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        const setOrDelete = (key: string, value: string | undefined) => {
          if (value === undefined || value === '') {
            url.searchParams.delete(key);
          } else {
            url.searchParams.set(key, value);
          }
        };

        // US1-2: Quality filters
        setOrDelete('quality_tier', next.qualityTier !== DEFAULT_FILTERS.qualityTier ? next.qualityTier : undefined);
        setOrDelete('quality_min', next.qualityMin !== undefined ? String(next.qualityMin) : undefined);
        setOrDelete('blur_hide', next.blurHide ? 'true' : undefined);
        setOrDelete('blur_show_bokeh', next.blurShowBokeh === false ? 'false' : undefined);
        setOrDelete('min_sharpness', next.minSharpness !== undefined ? String(next.minSharpness) : undefined);
        setOrDelete('min_exposure', next.minExposure !== undefined ? String(next.minExposure) : undefined);
        setOrDelete('min_composition', next.minComposition !== undefined ? String(next.minComposition) : undefined);
        // US4: Content/context filters
        setOrDelete('include_tags', next.includeTags?.length ? next.includeTags.join(',') : undefined);
        setOrDelete('exclude_tags', next.excludeTags?.length ? next.excludeTags.join(',') : undefined);
        setOrDelete('has_faces', next.hasFaces !== undefined ? String(next.hasFaces) : undefined);
        setOrDelete('min_faces', next.minFaces !== undefined ? String(next.minFaces) : undefined);
        setOrDelete('max_faces', next.maxFaces !== undefined ? String(next.maxFaces) : undefined);
        // US5: Similarity filters
        setOrDelete('hide_similar', next.hideSimilar ? 'true' : undefined);
        setOrDelete('similarity_threshold', next.similarityThreshold !== undefined ? String(next.similarityThreshold) : undefined);
        setOrDelete('show_only_best_shots', next.showOnlyBestShots ? 'true' : undefined);

        window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`);
      }
    },
    [storageKey]
  );

  const setFilters = useCallback(
    (updater: (prev: AIFilterState) => AIFilterState) => {
      setFiltersState((prev) => {
        const next = updater(prev);
        persistState(next);
        return next;
      });
    },
    [persistState]
  );

  const updateFilter = useCallback(
    (partial: Partial<AIFilterState>) => {
      setFilters((prev) => ({ ...prev, ...partial }));
    },
    [setFilters]
  );

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    persistState(DEFAULT_FILTERS);
    setMatchCount(null);
    setLastApplied(undefined);
  }, [persistState]);

  const debouncedFilters = useDebounce(filters, countDebounceMs);

  useEffect(() => {
    const shouldCount = autoCount && workspaceId && galleryId;
    if (!shouldCount) return;

    const fetchCount = async () => {
      try {
        setCountLoading(true);
        const result = await aiFilterService.getFilterMatchCount(workspaceId!, galleryId!, {
          ...debouncedFilters,
        });
        setMatchCount(result.count);
      } catch (err) {
        console.warn('Failed to fetch AI filter count', err);
      } finally {
        setCountLoading(false);
      }
    };

    fetchCount();
  }, [debouncedFilters, autoCount, workspaceId, galleryId]);

  const applyFilters = useCallback(
    async (override?: Partial<AIFilterParams>) => {
      if (!workspaceId || !galleryId) return null;
      try {
        setApplyLoading(true);
        const params: AIFilterParams = {
          ...filters,
          ...override,
        };
        const result = await aiFilterService.getFilteredAssets(workspaceId, galleryId, params);
        setLastApplied(result);
        return result;
      } catch (err) {
        console.error('Failed to apply AI filters', err);
        throw err;
      } finally {
        setApplyLoading(false);
      }
    },
    [workspaceId, galleryId, filters]
  );

  const applyPreset = useCallback((preset: CurationPreset) => {
    setFiltersState((prev) => ({
      ...prev,
      qualityMin: Math.round(preset.quality_threshold * 100),
      qualityTier: 'all',
      blurHide: true,
      blurShowBokeh: true,
    }));
  }, []);

  return {
    filters,
    setFilters: setFiltersState,
    updateFilter,
    resetFilters,
    applyFilters,
    applyPreset,
    matchCount,
    countLoading,
    applyLoading,
    lastApplied,
  };
};
