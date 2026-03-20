import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { galleryService } from '../services/galleryService';
import { useToast } from '../components/ui/Toast';
import type { PublicGalleryAsset } from '../types/gallery';
import {
  VISITOR_ID_KEY_PREFIX,
} from '../constants/gallery';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Comment on a photo in proofing workflow */
export interface ProofingComment {
  id: string;
  visitor_name: string;
  text: string;
  created_at: string;
}

export interface GalleryInteractionContextValue {
  /** Set of asset IDs favorited by this visitor */
  favorites: Set<string>;
  /** Set of asset IDs selected/picked by this visitor */
  selections: Set<string>;
  /** Toggle favorite on an asset (optimistic update) */
  toggleFavorite: (assetId: string) => Promise<void>;
  /** Toggle selection/pick on an asset (optimistic update) */
  toggleSelection: (assetId: string) => Promise<void>;
  /** Selection limit from gallery config (null = unlimited) */
  selectionLimit: number | null;
  /** Whether the visitor has reached the selection limit */
  isAtSelectionLimit: boolean;
  /** Visitor token/ID for this gallery */
  visitorToken: string | null;
  /** Whether proofing (favorites/selections) is enabled */
  isProofingEnabled: boolean;
  /** Favorite count */
  favoriteCount: number;
  /** Selection count */
  selectionCount: number;
  /** Comments keyed by asset ID */
  comments: Map<string, ProofingComment[]>;
  /** Add a comment to an asset */
  addComment: (assetId: string, text: string) => Promise<void>;
  /** Load comments for an asset from the server */
  loadComments: (assetId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const GalleryInteractionContext = createContext<GalleryInteractionContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ProofingConfig {
  favorites_enabled?: boolean;
  selections_enabled?: boolean;
  selection_limit?: number | null;
}

interface GalleryInteractionProviderProps {
  galleryId: string;
  proofingConfig?: ProofingConfig;
  /** Initial assets to seed favorites/selections from server state */
  initialAssets?: PublicGalleryAsset[];
  children: React.ReactNode;
}

/**
 * Manages visitor favorites and selections with optimistic updates.
 * Reads/stores visitor token from localStorage per gallery.
 */
export const GalleryInteractionProvider: React.FC<GalleryInteractionProviderProps> = ({
  galleryId,
  proofingConfig,
  initialAssets,
  children,
}) => {
  const { addToast } = useToast();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [selections, setSelections] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Map<string, ProofingComment[]>>(new Map());

  // Visitor token from localStorage
  const [visitorToken, setVisitorToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(`${VISITOR_ID_KEY_PREFIX}${galleryId}`);
  });

  // Re-read visitor token when galleryId changes
  useEffect(() => {
    const stored = localStorage.getItem(`${VISITOR_ID_KEY_PREFIX}${galleryId}`);
    setVisitorToken(stored);
  }, [galleryId]);

  // Initialize favorites/selections from initial assets (server state)
  useEffect(() => {
    if (!initialAssets) return;
    const favs = new Set<string>();
    const sels = new Set<string>();
    for (const asset of initialAssets) {
      if (asset.favorites_count && asset.favorites_count > 0) favs.add(asset.asset_id);
      if (asset.is_selected) sels.add(asset.asset_id);
    }
    setFavorites(favs);
    setSelections(sels);
  }, [initialAssets]);

  const selectionLimit = proofingConfig?.selection_limit ?? null;
  const isProofingEnabled =
    (proofingConfig?.favorites_enabled ?? true) || (proofingConfig?.selections_enabled ?? true);

  const isAtSelectionLimit = useMemo(
    () => (selectionLimit !== null ? selections.size >= selectionLimit : false),
    [selections.size, selectionLimit],
  );

  // Optimistic toggle favorite
  const toggleFavorite = useCallback(
    async (assetId: string) => {
      const currentlyFavorited = favorites.has(assetId);
      const newFavorited = !currentlyFavorited;

      // Optimistic update
      setFavorites((prev) => {
        const next = new Set(prev);
        if (newFavorited) next.add(assetId);
        else next.delete(assetId);
        return next;
      });

      try {
        await galleryService.togglePublicFavorite(
          galleryId,
          assetId,
          newFavorited,
          visitorToken || undefined,
        );
      } catch (err) {
        console.error('Failed to toggle favorite:', err);
        addToast({ message: 'Failed to update favorite. Please try again.', variant: 'error' });
        // Revert
        setFavorites((prev) => {
          const next = new Set(prev);
          if (currentlyFavorited) next.add(assetId);
          else next.delete(assetId);
          return next;
        });
      }
    },
    [galleryId, visitorToken, favorites, addToast],
  );

  // Optimistic toggle selection
  const toggleSelection = useCallback(
    async (assetId: string) => {
      const currentlySelected = selections.has(assetId);
      const newSelected = !currentlySelected;

      // Check limit before adding
      if (newSelected && selectionLimit !== null && selections.size >= selectionLimit) {
        addToast({
          message: `Selection limit reached (${selectionLimit}). Please remove a pick first.`,
          variant: 'warning',
        });
        return;
      }

      // Optimistic update
      setSelections((prev) => {
        const next = new Set(prev);
        if (newSelected) next.add(assetId);
        else next.delete(assetId);
        return next;
      });

      try {
        await galleryService.togglePublicSelection(
          galleryId,
          assetId,
          newSelected,
          visitorToken || undefined,
        );
      } catch (err) {
        console.error('Failed to toggle selection:', err);
        addToast({ message: 'Failed to update selection. Please try again.', variant: 'error' });
        // Revert
        setSelections((prev) => {
          const next = new Set(prev);
          if (currentlySelected) next.add(assetId);
          else next.delete(assetId);
          return next;
        });
      }
    },
    [galleryId, visitorToken, selections, selectionLimit, addToast],
  );

  // Load comments for an asset from the proofing API
  const loadComments = useCallback(
    async (assetId: string) => {
      try {
        const response = await galleryService.getProofingComments(galleryId, assetId, visitorToken || undefined);
        setComments((prev) => {
          const next = new Map(prev);
          next.set(assetId, response);
          return next;
        });
      } catch (err) {
        console.error('Failed to load comments:', err);
      }
    },
    [galleryId, visitorToken],
  );

  // Add a comment to an asset (optimistic update)
  const addComment = useCallback(
    async (assetId: string, text: string) => {
      const optimisticComment: ProofingComment = {
        id: `temp-${Date.now()}`,
        visitor_name: 'You',
        text,
        created_at: new Date().toISOString(),
      };

      // Optimistic add
      setComments((prev) => {
        const next = new Map(prev);
        const existing = next.get(assetId) || [];
        next.set(assetId, [...existing, optimisticComment]);
        return next;
      });

      try {
        await galleryService.addProofingComment(
          galleryId,
          assetId,
          text,
          visitorToken || undefined,
        );
      } catch (err) {
        console.error('Failed to add comment:', err);
        addToast({ message: 'Failed to post comment. Please try again.', variant: 'error' });
        // Revert optimistic update
        setComments((prev) => {
          const next = new Map(prev);
          const existing = next.get(assetId) || [];
          next.set(assetId, existing.filter((c) => c.id !== optimisticComment.id));
          return next;
        });
      }
    },
    [galleryId, visitorToken, addToast],
  );

  const value = useMemo<GalleryInteractionContextValue>(
    () => ({
      favorites,
      selections,
      toggleFavorite,
      toggleSelection,
      selectionLimit,
      isAtSelectionLimit,
      visitorToken,
      isProofingEnabled,
      favoriteCount: favorites.size,
      selectionCount: selections.size,
      comments,
      addComment,
      loadComments,
    }),
    [
      favorites,
      selections,
      toggleFavorite,
      toggleSelection,
      selectionLimit,
      isAtSelectionLimit,
      visitorToken,
      isProofingEnabled,
      comments,
      addComment,
      loadComments,
    ],
  );

  return (
    <GalleryInteractionContext.Provider value={value}>
      {children}
    </GalleryInteractionContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Consume gallery interaction context. Must be used within a GalleryInteractionProvider.
 */
export const useGalleryInteraction = (): GalleryInteractionContextValue => {
  const ctx = useContext(GalleryInteractionContext);
  if (!ctx) {
    throw new Error('useGalleryInteraction must be used within a GalleryInteractionProvider');
  }
  return ctx;
};
