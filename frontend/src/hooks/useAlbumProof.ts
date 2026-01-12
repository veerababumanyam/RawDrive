/**
 * useAlbumProof Hook
 * Manages public album proof viewing for clients (unauthenticated)
 *
 * Feature: 026-album-proofing
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { albumService } from '../services/albumService';
import type {
  AlbumProofResponse,
  AlbumComment,
  PublicCommentCreateRequest,
  ApproveAlbumRequest,
  ApproveAlbumResponse,
  DownloadResponse,
} from '../types/album';

interface UseAlbumProofOptions {
  token: string;
  autoFetch?: boolean;
}

interface UseAlbumProofReturn {
  // Album proof data
  proof: AlbumProofResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;

  // Current spread for navigation
  currentSpreadIndex: number;
  setCurrentSpreadIndex: (index: number) => void;
  nextSpread: () => void;
  prevSpread: () => void;
  goToSpread: (pageNumber: number) => void;

  // Comments
  comments: AlbumComment[];
  loadingComments: boolean;
  fetchComments: (spreadId?: string) => Promise<void>;
  addComment: (data: PublicCommentCreateRequest) => Promise<AlbumComment>;

  // Approval
  approving: boolean;
  approvalResult: ApproveAlbumResponse | null;
  approveAlbum: (data: ApproveAlbumRequest) => Promise<ApproveAlbumResponse>;

  // Download
  downloading: boolean;
  downloadUrl: string | null;
  downloadGenerating: boolean;
  getDownloadUrl: () => Promise<DownloadResponse>;
}

export const useAlbumProof = ({
  token,
  autoFetch = true,
}: UseAlbumProofOptions): UseAlbumProofReturn => {
  // Proof state
  const [proof, setProof] = useState<AlbumProofResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Navigation state
  const [currentSpreadIndex, setCurrentSpreadIndex] = useState(0);

  // Comments state
  const [comments, setComments] = useState<AlbumComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  // Approval state
  const [approving, setApproving] = useState(false);
  const [approvalResult, setApprovalResult] = useState<ApproveAlbumResponse | null>(null);

  // Download state
  const [downloading, setDownloading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadGenerating, setDownloadGenerating] = useState(false);

  // Abort controller
  const abortControllerRef = useRef<AbortController | null>(null);

  // =========================================================================
  // PROOF FETCHING
  // =========================================================================

  const fetchProof = useCallback(async () => {
    if (!token) {
      setProof(null);
      return;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);
    try {
      const data = await albumService.getPublicProof(
        token,
        abortControllerRef.current.signal
      );
      setProof(data);
      setLoading(false);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err : new Error('Failed to fetch album proof'));
      setProof(null);
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (autoFetch && token) {
      fetchProof();
    }

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [autoFetch, token, fetchProof]);

  // =========================================================================
  // NAVIGATION
  // =========================================================================

  const nextSpread = useCallback(() => {
    if (!proof) return;
    setCurrentSpreadIndex((prev) =>
      prev < proof.spreads.length - 1 ? prev + 1 : prev
    );
  }, [proof]);

  const prevSpread = useCallback(() => {
    setCurrentSpreadIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const goToSpread = useCallback(
    (pageNumber: number) => {
      if (!proof) return;
      const index = proof.spreads.findIndex((s) => s.page_number === pageNumber);
      if (index >= 0) {
        setCurrentSpreadIndex(index);
      }
    },
    [proof]
  );

  // =========================================================================
  // COMMENTS
  // =========================================================================

  const fetchComments = useCallback(
    async (spreadId?: string) => {
      if (!token) return;
      setLoadingComments(true);
      try {
        const data = await albumService.listPublicComments(token, spreadId);
        setComments(data);
      } catch (err) {
        console.error('Failed to fetch comments:', err);
      } finally {
        setLoadingComments(false);
      }
    },
    [token]
  );

  const addComment = useCallback(
    async (data: PublicCommentCreateRequest): Promise<AlbumComment> => {
      if (!token) throw new Error('Token is required');
      try {
        const comment = await albumService.createPublicComment(token, data);
        setComments((prev) => [...prev, comment]);
        // Refetch proof to update status if changed
        await fetchProof();
        return comment;
      } catch (err) {
        console.error('Failed to add comment:', err);
        throw err;
      }
    },
    [token, fetchProof]
  );

  // =========================================================================
  // APPROVAL
  // =========================================================================

  const approveAlbum = useCallback(
    async (data: ApproveAlbumRequest): Promise<ApproveAlbumResponse> => {
      if (!token) throw new Error('Token is required');
      setApproving(true);
      try {
        const result = await albumService.approveAlbum(token, data);
        setApprovalResult(result);
        // Refetch proof to update status
        await fetchProof();
        return result;
      } catch (err) {
        console.error('Failed to approve album:', err);
        throw err;
      } finally {
        setApproving(false);
      }
    },
    [token, fetchProof]
  );

  // =========================================================================
  // DOWNLOAD
  // =========================================================================

  const getDownloadUrl = useCallback(async (): Promise<DownloadResponse> => {
    if (!token) throw new Error('Token is required');
    setDownloading(true);
    try {
      const response = await albumService.getDownloadUrl(token);
      if ('download_url' in response && response.download_url) {
        setDownloadUrl(response.download_url);
        setDownloadGenerating(false);
      } else if ('status' in response && (response as { status: string }).status === 'generating') {
        setDownloadGenerating(true);
        setDownloadUrl(null);
      }
      return response;
    } catch (err) {
      console.error('Failed to get download URL:', err);
      throw err;
    } finally {
      setDownloading(false);
    }
  }, [token]);

  return {
    // Proof
    proof,
    loading,
    error,
    refetch: fetchProof,

    // Navigation
    currentSpreadIndex,
    setCurrentSpreadIndex,
    nextSpread,
    prevSpread,
    goToSpread,

    // Comments
    comments,
    loadingComments,
    fetchComments,
    addComment,

    // Approval
    approving,
    approvalResult,
    approveAlbum,

    // Download
    downloading,
    downloadUrl,
    downloadGenerating,
    getDownloadUrl,
  };
};

export default useAlbumProof;
