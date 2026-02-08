/**
 * useAlbumComments Hook
 *
 * Manages album comments with real-time updates via WebSocket.
 * Handles CRUD operations, @mentions, and comment resolution.
 */

import { useCallback, useEffect, useState } from 'react';
import type { AlbumComment, MentionedUser, CommentStatus } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseAlbumCommentsOptions {
  /** Album ID */
  albumId: string;
  /** Workspace ID */
  workspaceId: string;
  /** Auto-fetch comments on mount */
  autoFetch?: boolean;
}

interface UseAlbumCommentsReturn {
  /** All comments */
  comments: AlbumComment[];
  /** Open (unresolved) comments */
  openComments: AlbumComment[];
  /** Resolved comments */
  resolvedComments: AlbumComment[];
  /** Whether comments are loading */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Refresh comments from API */
  refreshComments: () => Promise<void>;
  /** Create a new comment */
  createComment: (
    content: string,
    options: {
      spreadId?: string;
      elementId?: string;
      positionX?: number;
      positionY?: number;
      mentionedUserIds?: string[];
      parentCommentId?: string;
    }
  ) => Promise<AlbumComment | null>;
  /** Update a comment */
  updateComment: (commentId: string, content: string) => Promise<boolean>;
  /** Delete a comment */
  deleteComment: (commentId: string) => Promise<boolean>;
  /** Resolve a comment */
  resolveComment: (commentId: string) => Promise<boolean>;
  /** Reopen a resolved comment */
  reopenComment: (commentId: string) => Promise<boolean>;
  /** Get comments for a specific spread */
  getCommentsForSpread: (spreadId: string) => AlbumComment[];
  /** Get comments for a specific element */
  getCommentsForElement: (elementId: string) => AlbumComment[];
  /** Available users for @mentions */
  availableUsers: MentionedUser[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAlbumComments({
  albumId,
  workspaceId,
  autoFetch = true,
}: UseAlbumCommentsOptions): UseAlbumCommentsReturn {
  const [comments, setComments] = useState<AlbumComment[]>([]);
  const [availableUsers, setAvailableUsers] = useState<MentionedUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch comments from API
  const fetchComments = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/albums/${albumId}/comments`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch comments');
      }

      const data = await response.json();
      setComments(data.comments || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch comments';
      setError(message);
      console.error('Error fetching album comments:', err);
    } finally {
      setIsLoading(false);
    }
  }, [albumId, workspaceId]);

  // Fetch available users for @mentions
  const fetchAvailableUsers = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/members`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) return;

      const data = await response.json();
      const users: MentionedUser[] = (data.members || []).map((member: {
        id: string;
        user: { display_name: string; avatar_url?: string };
      }) => ({
        id: member.id,
        display_name: member.user?.display_name || 'Unknown',
        avatar_url: member.user?.avatar_url,
      }));
      setAvailableUsers(users);
    } catch (err) {
      console.error('Error fetching workspace members:', err);
    }
  }, [workspaceId]);

  // Create a new comment
  const createComment = useCallback(
    async (
      content: string,
      options: {
        spreadId?: string;
        elementId?: string;
        positionX?: number;
        positionY?: number;
        mentionedUserIds?: string[];
        parentCommentId?: string;
      }
    ): Promise<AlbumComment | null> => {
      try {
        const response = await fetch(
          `/api/v1/workspaces/${workspaceId}/albums/${albumId}/comments`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content,
              spread_id: options.spreadId,
              element_id: options.elementId,
              position_x: options.positionX,
              position_y: options.positionY,
              mentioned_user_ids: options.mentionedUserIds || [],
              parent_comment_id: options.parentCommentId,
            }),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to create comment');
        }

        const newComment = await response.json();
        setComments((prev) => [...prev, newComment]);
        return newComment;
      } catch (err) {
        console.error('Error creating comment:', err);
        return null;
      }
    },
    [albumId, workspaceId]
  );

  // Update a comment
  const updateComment = useCallback(
    async (commentId: string, content: string): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/v1/workspaces/${workspaceId}/albums/${albumId}/comments/${commentId}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content }),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to update comment');
        }

        const updatedComment = await response.json();
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? updatedComment : c))
        );
        return true;
      } catch (err) {
        console.error('Error updating comment:', err);
        return false;
      }
    },
    [albumId, workspaceId]
  );

  // Delete a comment
  const deleteComment = useCallback(
    async (commentId: string): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/v1/workspaces/${workspaceId}/albums/${albumId}/comments/${commentId}`,
          {
            method: 'DELETE',
          }
        );

        if (!response.ok) {
          throw new Error('Failed to delete comment');
        }

        setComments((prev) => prev.filter((c) => c.id !== commentId));
        return true;
      } catch (err) {
        console.error('Error deleting comment:', err);
        return false;
      }
    },
    [albumId, workspaceId]
  );

  // Resolve a comment
  const resolveComment = useCallback(
    async (commentId: string): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/v1/workspaces/${workspaceId}/albums/${albumId}/comments/${commentId}/resolve`,
          {
            method: 'POST',
          }
        );

        if (!response.ok) {
          throw new Error('Failed to resolve comment');
        }

        const resolvedComment = await response.json();
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? resolvedComment : c))
        );
        return true;
      } catch (err) {
        console.error('Error resolving comment:', err);
        return false;
      }
    },
    [albumId, workspaceId]
  );

  // Reopen a resolved comment
  const reopenComment = useCallback(
    async (commentId: string): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/v1/workspaces/${workspaceId}/albums/${albumId}/comments/${commentId}/reopen`,
          {
            method: 'POST',
          }
        );

        if (!response.ok) {
          throw new Error('Failed to reopen comment');
        }

        const reopenedComment = await response.json();
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? reopenedComment : c))
        );
        return true;
      } catch (err) {
        console.error('Error reopening comment:', err);
        return false;
      }
    },
    [albumId, workspaceId]
  );

  // Get comments for a specific spread
  const getCommentsForSpread = useCallback(
    (spreadId: string): AlbumComment[] => {
      return comments.filter((c) => c.spread_id === spreadId);
    },
    [comments]
  );

  // Get comments for a specific element
  const getCommentsForElement = useCallback(
    (elementId: string): AlbumComment[] => {
      return comments.filter((c) => c.element_id === elementId);
    },
    [comments]
  );

  // Filter comments by status
  const openComments = comments.filter((c) => c.status === 'open');
  const resolvedComments = comments.filter((c) => c.status === 'resolved');

  // Listen for WebSocket comment events
  useEffect(() => {
    const handleCommentEvent = (event: CustomEvent) => {
      const { type, comment } = event.detail;

      switch (type) {
        case 'album:comment_added':
          setComments((prev) => {
            // Avoid duplicates
            if (prev.some((c) => c.id === comment.id)) return prev;
            return [...prev, comment];
          });
          break;

        case 'album:comment_resolved':
          setComments((prev) =>
            prev.map((c) => (c.id === comment.id ? { ...c, status: 'resolved' as CommentStatus } : c))
          );
          break;

        case 'album:comment_deleted':
          setComments((prev) => prev.filter((c) => c.id !== comment.id));
          break;
      }
    };

    window.addEventListener('album:comment', handleCommentEvent as EventListener);
    return () => {
      window.removeEventListener('album:comment', handleCommentEvent as EventListener);
    };
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchComments();
      fetchAvailableUsers();
    }
  }, [autoFetch, fetchComments, fetchAvailableUsers]);

  return {
    comments,
    openComments,
    resolvedComments,
    isLoading,
    error,
    refreshComments: fetchComments,
    createComment,
    updateComment,
    deleteComment,
    resolveComment,
    reopenComment,
    getCommentsForSpread,
    getCommentsForElement,
    availableUsers,
  };
}

export default useAlbumComments;
