/**
 * useCurationSession Hook
 *
 * React hook for managing curation session state in the Smart Curate feature.
 * Handles session lifecycle, progress polling, and WebSocket updates.
 *
 * Feature: 023-enhanced-smart-curate
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { curationService } from '@/services/curationService';
import type {
  CurationSession,
  CurationSessionCreateRequest,
  CurationSessionUpdateRequest,
  CurationStatus,
} from '@/types/curation';

// Query keys
const CURATION_KEYS = {
  session: (workspaceId: string, galleryId: string, sessionId: string) =>
    ['curation', 'session', workspaceId, galleryId, sessionId] as const,
  sessions: (workspaceId: string, galleryId: string) =>
    ['curation', 'sessions', workspaceId, galleryId] as const,
  active: (workspaceId: string, galleryId: string) =>
    ['curation', 'active', workspaceId, galleryId] as const,
};

// Polling interval for active sessions
const POLLING_INTERVAL_MS = 2000;

// Status helpers
const isActiveStatus = (status: CurationStatus): boolean =>
  ['pending', 'analyzing', 'grouping', 'curating'].includes(status);

const isTerminalStatus = (status: CurationStatus): boolean =>
  ['completed', 'failed'].includes(status);

interface UseCurationSessionOptions {
  /** Workspace ID */
  workspaceId: string;
  /** Gallery ID */
  galleryId: string;
  /** Enable polling for active sessions */
  enablePolling?: boolean;
  /** Callback when session completes */
  onComplete?: (session: CurationSession) => void;
  /** Callback when session fails */
  onError?: (session: CurationSession, error: string) => void;
}

interface UseCurationSessionResult {
  // Session data
  activeSession: CurationSession | null;
  sessions: CurationSession[];
  isLoading: boolean;
  error: Error | null;

  // Session actions
  createSession: (request: CurationSessionCreateRequest) => Promise<CurationSession>;
  startSession: (sessionId: string, resumeFromStep?: string) => Promise<CurationSession>;
  pauseSession: (sessionId: string) => Promise<CurationSession>;
  deleteSession: (sessionId: string) => Promise<void>;
  updateSession: (sessionId: string, updates: CurationSessionUpdateRequest) => Promise<CurationSession>;

  // State helpers
  isCreating: boolean;
  isStarting: boolean;
  isPausing: boolean;
  hasActiveSession: boolean;
  canStart: boolean;
  canPause: boolean;
}

/**
 * Hook for managing curation sessions in the Smart Curate feature.
 *
 * @example
 * ```tsx
 * const {
 *   activeSession,
 *   createSession,
 *   startSession,
 *   hasActiveSession,
 * } = useCurationSession({
 *   workspaceId: '...',
 *   galleryId: '...',
 *   onComplete: (session) => toast.success('Curation complete!'),
 * });
 *
 * // Create and start a session
 * const session = await createSession({
 *   target_count: 100,
 *   auto_start: true,
 * });
 * ```
 */
export function useCurationSession({
  workspaceId,
  galleryId,
  enablePolling = true,
  onComplete,
  onError,
}: UseCurationSessionOptions): UseCurationSessionResult {
  const queryClient = useQueryClient();
  const prevStatusRef = useRef<CurationStatus | null>(null);

  // Fetch active session
  const {
    data: activeSession,
    isLoading: isLoadingActive,
    error: activeError,
    refetch: refetchActive,
  } = useQuery({
    queryKey: CURATION_KEYS.active(workspaceId, galleryId),
    queryFn: () => curationService.getActiveSession(workspaceId, galleryId),
    enabled: !!workspaceId && !!galleryId,
    refetchInterval: (data) => {
      // Poll while session is active
      if (enablePolling && data && isActiveStatus(data.status)) {
        return POLLING_INTERVAL_MS;
      }
      return false;
    },
  });

  // Fetch session history
  const {
    data: sessionsData,
    isLoading: isLoadingSessions,
    error: sessionsError,
  } = useQuery({
    queryKey: CURATION_KEYS.sessions(workspaceId, galleryId),
    queryFn: () => curationService.listSessions(workspaceId, galleryId, { limit: 10 }),
    enabled: !!workspaceId && !!galleryId,
  });

  // Handle status transitions
  useEffect(() => {
    if (!activeSession) return;

    const prevStatus = prevStatusRef.current;
    const newStatus = activeSession.status;

    // Check for completion
    if (prevStatus && isActiveStatus(prevStatus) && newStatus === 'completed') {
      onComplete?.(activeSession);
    }

    // Check for failure
    if (prevStatus && isActiveStatus(prevStatus) && newStatus === 'failed') {
      onError?.(activeSession, activeSession.error_message || 'Unknown error');
    }

    prevStatusRef.current = newStatus;
  }, [activeSession, onComplete, onError]);

  // Create session mutation
  const createMutation = useMutation({
    mutationFn: (request: CurationSessionCreateRequest) =>
      curationService.createSession(workspaceId, galleryId, request),
    onSuccess: (session) => {
      queryClient.setQueryData(CURATION_KEYS.active(workspaceId, galleryId), session);
      queryClient.invalidateQueries({
        queryKey: CURATION_KEYS.sessions(workspaceId, galleryId),
      });
    },
  });

  // Start session mutation
  const startMutation = useMutation({
    mutationFn: ({ sessionId, resumeFromStep }: { sessionId: string; resumeFromStep?: string }) =>
      curationService.startSession(workspaceId, galleryId, sessionId, { resume_from_step: resumeFromStep }),
    onSuccess: (session) => {
      queryClient.setQueryData(CURATION_KEYS.active(workspaceId, galleryId), session);
    },
  });

  // Pause session mutation
  const pauseMutation = useMutation({
    mutationFn: (sessionId: string) =>
      curationService.pauseSession(workspaceId, galleryId, sessionId),
    onSuccess: (session) => {
      queryClient.setQueryData(CURATION_KEYS.active(workspaceId, galleryId), session);
    },
  });

  // Delete session mutation
  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) =>
      curationService.deleteSession(workspaceId, galleryId, sessionId),
    onSuccess: () => {
      queryClient.setQueryData(CURATION_KEYS.active(workspaceId, galleryId), null);
      queryClient.invalidateQueries({
        queryKey: CURATION_KEYS.sessions(workspaceId, galleryId),
      });
    },
  });

  // Update session mutation
  const updateMutation = useMutation({
    mutationFn: ({ sessionId, updates }: { sessionId: string; updates: CurationSessionUpdateRequest }) =>
      curationService.updateSession(workspaceId, galleryId, sessionId, updates),
    onSuccess: (session) => {
      queryClient.setQueryData(CURATION_KEYS.active(workspaceId, galleryId), session);
    },
  });

  // Action handlers
  const createSession = useCallback(
    (request: CurationSessionCreateRequest) => createMutation.mutateAsync(request),
    [createMutation]
  );

  const startSession = useCallback(
    (sessionId: string, resumeFromStep?: string) =>
      startMutation.mutateAsync({ sessionId, resumeFromStep }),
    [startMutation]
  );

  const pauseSession = useCallback(
    (sessionId: string) => pauseMutation.mutateAsync(sessionId),
    [pauseMutation]
  );

  const deleteSession = useCallback(
    (sessionId: string) => deleteMutation.mutateAsync(sessionId),
    [deleteMutation]
  );

  const updateSession = useCallback(
    (sessionId: string, updates: CurationSessionUpdateRequest) =>
      updateMutation.mutateAsync({ sessionId, updates }),
    [updateMutation]
  );

  // Computed state
  const hasActiveSession = !!activeSession && isActiveStatus(activeSession.status);
  const canStart = !!activeSession && activeSession.status === 'pending';
  const canPause = !!activeSession && ['analyzing', 'grouping', 'curating'].includes(activeSession.status);

  return {
    // Session data
    activeSession: activeSession ?? null,
    sessions: sessionsData?.sessions ?? [],
    isLoading: isLoadingActive || isLoadingSessions,
    error: activeError || sessionsError,

    // Session actions
    createSession,
    startSession,
    pauseSession,
    deleteSession,
    updateSession,

    // State helpers
    isCreating: createMutation.isPending,
    isStarting: startMutation.isPending,
    isPausing: pauseMutation.isPending,
    hasActiveSession,
    canStart,
    canPause,
  };
}

/**
 * Hook for fetching a single session by ID.
 * Use this when navigating to a specific session detail view.
 */
export function useCurationSessionById(
  workspaceId: string,
  galleryId: string,
  sessionId: string
) {
  return useQuery({
    queryKey: CURATION_KEYS.session(workspaceId, galleryId, sessionId),
    queryFn: () => curationService.getSession(workspaceId, galleryId, sessionId),
    enabled: !!workspaceId && !!galleryId && !!sessionId,
  });
}

export default useCurationSession;
