/**
 * useAlbum Hook
 * Manages album data fetching and state for authenticated users (photographers)
 *
 * Feature: 026-album-proofing
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { albumService } from '../services/albumService';
import type {
  Album,
  AlbumDetailResponse,
  AlbumUpdateRequest,
  SendProofRequest,
  SendProofResponse,
  AlbumComment,
  CommentSummary,
  AlbumVersion,
  AlbumVersionCreateRequest,
  RollbackRequest,
  RollbackResponse,
  AlbumRender,
  AlbumRenderCreateRequest,
} from '../types/album';

interface UseAlbumOptions {
  workspaceId: string;
  albumId?: string;
  autoFetch?: boolean;
}

interface UseAlbumReturn {
  // Album data
  album: AlbumDetailResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;

  // Album mutations
  updateAlbum: (data: AlbumUpdateRequest) => Promise<void>;
  deleteAlbum: () => Promise<void>;
  sendProof: (data: SendProofRequest) => Promise<SendProofResponse>;

  // Comments
  comments: AlbumComment[];
  commentSummary: CommentSummary | null;
  loadingComments: boolean;
  fetchComments: (options?: { spreadId?: string; status?: string }) => Promise<void>;
  resolveComment: (commentId: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;

  // Versions
  versions: AlbumVersion[];
  loadingVersions: boolean;
  fetchVersions: () => Promise<void>;
  createVersion: (data: AlbumVersionCreateRequest) => Promise<AlbumVersion>;
  rollbackVersion: (versionId: string, data: RollbackRequest) => Promise<RollbackResponse>;

  // Renders
  renders: AlbumRender[];
  loadingRenders: boolean;
  fetchRenders: () => Promise<void>;
  createRender: (data: AlbumRenderCreateRequest) => Promise<AlbumRender>;
  getRender: (renderId: string) => Promise<AlbumRender>;
}

export const useAlbum = ({
  workspaceId,
  albumId,
  autoFetch = true,
}: UseAlbumOptions): UseAlbumReturn => {
  // Album state
  const [album, setAlbum] = useState<AlbumDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Comments state
  const [comments, setComments] = useState<AlbumComment[]>([]);
  const [commentSummary, setCommentSummary] = useState<CommentSummary | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);

  // Versions state
  const [versions, setVersions] = useState<AlbumVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Renders state
  const [renders, setRenders] = useState<AlbumRender[]>([]);
  const [loadingRenders, setLoadingRenders] = useState(false);

  // Abort controller for cancelling requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // =========================================================================
  // ALBUM FETCHING
  // =========================================================================

  const fetchAlbum = useCallback(async () => {
    if (!albumId) {
      setAlbum(null);
      return;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);
    try {
      const data = await albumService.getAlbum(
        workspaceId,
        albumId,
        abortControllerRef.current.signal
      );
      setAlbum(data);
      setLoading(false);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err : new Error('Failed to fetch album'));
      setAlbum(null);
      setLoading(false);
    }
  }, [workspaceId, albumId]);

  useEffect(() => {
    if (autoFetch && albumId) {
      fetchAlbum();
    }

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [autoFetch, albumId, fetchAlbum]);

  // =========================================================================
  // ALBUM MUTATIONS
  // =========================================================================

  const updateAlbum = useCallback(
    async (data: AlbumUpdateRequest) => {
      if (!albumId) return;
      setLoading(true);
      setError(null);
      try {
        const updated = await albumService.updateAlbum(workspaceId, albumId, data);
        setAlbum((prev: AlbumDetailResponse | null) => (prev ? { ...prev, ...updated } : null));
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update album'));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, albumId]
  );

  const deleteAlbum = useCallback(async () => {
    if (!albumId) return;
    setLoading(true);
    setError(null);
    try {
      await albumService.deleteAlbum(workspaceId, albumId);
      setAlbum(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to delete album'));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [workspaceId, albumId]);

  const sendProof = useCallback(
    async (data: SendProofRequest): Promise<SendProofResponse> => {
      if (!albumId) throw new Error('Album ID is required');
      setLoading(true);
      setError(null);
      try {
        const response = await albumService.sendProof(workspaceId, albumId, data);
        // Refetch to get updated status
        await fetchAlbum();
        return response;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to send proof'));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, albumId, fetchAlbum]
  );

  // =========================================================================
  // COMMENTS
  // =========================================================================

  const fetchComments = useCallback(
    async (options?: { spreadId?: string; status?: string }) => {
      if (!albumId) return;
      setLoadingComments(true);
      try {
        const result = await albumService.listComments(workspaceId, albumId, options);
        setComments(result.comments);
        setCommentSummary(result.summary);
      } catch (err) {
        console.error('Failed to fetch comments:', err);
      } finally {
        setLoadingComments(false);
      }
    },
    [workspaceId, albumId]
  );

  const resolveComment = useCallback(
    async (commentId: string) => {
      if (!albumId) return;
      try {
        const updated = await albumService.resolveComment(workspaceId, albumId, commentId);
        setComments((prev) =>
          prev.map((c) => (c.comment_id === commentId ? updated : c))
        );
        // Update summary
        setCommentSummary((prev) =>
          prev
            ? {
                ...prev,
                open: prev.open - 1,
                resolved: prev.resolved + 1,
              }
            : null
        );
      } catch (err) {
        console.error('Failed to resolve comment:', err);
        throw err;
      }
    },
    [workspaceId, albumId]
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      if (!albumId) return;
      try {
        await albumService.deleteComment(workspaceId, albumId, commentId);
        setComments((prev) => prev.filter((c) => c.comment_id !== commentId));
        // Update summary
        setCommentSummary((prev) =>
          prev ? { ...prev, total: prev.total - 1 } : null
        );
      } catch (err) {
        console.error('Failed to delete comment:', err);
        throw err;
      }
    },
    [workspaceId, albumId]
  );

  // =========================================================================
  // VERSIONS
  // =========================================================================

  const fetchVersions = useCallback(async () => {
    if (!albumId) return;
    setLoadingVersions(true);
    try {
      const data = await albumService.listVersions(workspaceId, albumId);
      setVersions(data);
    } catch (err) {
      console.error('Failed to fetch versions:', err);
    } finally {
      setLoadingVersions(false);
    }
  }, [workspaceId, albumId]);

  const createVersion = useCallback(
    async (data: AlbumVersionCreateRequest): Promise<AlbumVersion> => {
      if (!albumId) throw new Error('Album ID is required');
      try {
        const version = await albumService.createVersion(workspaceId, albumId, data);
        setVersions((prev) => [version, ...prev]);
        return version;
      } catch (err) {
        console.error('Failed to create version:', err);
        throw err;
      }
    },
    [workspaceId, albumId]
  );

  const rollbackVersion = useCallback(
    async (versionId: string, data: RollbackRequest): Promise<RollbackResponse> => {
      if (!albumId) throw new Error('Album ID is required');
      try {
        const response = await albumService.rollbackVersion(
          workspaceId,
          albumId,
          versionId,
          data
        );
        // Refetch album to get updated state
        await fetchAlbum();
        return response;
      } catch (err) {
        console.error('Failed to rollback version:', err);
        throw err;
      }
    },
    [workspaceId, albumId, fetchAlbum]
  );

  // =========================================================================
  // RENDERS
  // =========================================================================

  const fetchRenders = useCallback(async () => {
    if (!albumId) return;
    setLoadingRenders(true);
    try {
      const data = await albumService.listRenders(workspaceId, albumId);
      setRenders(data);
    } catch (err) {
      console.error('Failed to fetch renders:', err);
    } finally {
      setLoadingRenders(false);
    }
  }, [workspaceId, albumId]);

  const createRender = useCallback(
    async (data: AlbumRenderCreateRequest): Promise<AlbumRender> => {
      if (!albumId) throw new Error('Album ID is required');
      try {
        const render = await albumService.createRender(workspaceId, albumId, data);
        setRenders((prev) => [render, ...prev]);
        return render;
      } catch (err) {
        console.error('Failed to create render:', err);
        throw err;
      }
    },
    [workspaceId, albumId]
  );

  const getRender = useCallback(
    async (renderId: string): Promise<AlbumRender> => {
      if (!albumId) throw new Error('Album ID is required');
      const render = await albumService.getRender(workspaceId, albumId, renderId);
      // Update in renders list
      setRenders((prev) =>
        prev.map((r) => (r.render_id === renderId ? render : r))
      );
      return render;
    },
    [workspaceId, albumId]
  );

  return {
    // Album
    album,
    loading,
    error,
    refetch: fetchAlbum,
    updateAlbum,
    deleteAlbum,
    sendProof,

    // Comments
    comments,
    commentSummary,
    loadingComments,
    fetchComments,
    resolveComment,
    deleteComment,

    // Versions
    versions,
    loadingVersions,
    fetchVersions,
    createVersion,
    rollbackVersion,

    // Renders
    renders,
    loadingRenders,
    fetchRenders,
    createRender,
    getRender,
  };
};

export default useAlbum;
