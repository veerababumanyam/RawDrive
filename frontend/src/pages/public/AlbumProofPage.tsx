/**
 * AlbumProofPage
 * Public page for client album proof viewing
 *
 * Extracts token from URL, fetches album proof, renders AlbumProofViewer
 *
 * Feature: 026-album-proofing
 */

import { useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useAlbumProof } from '../../hooks/useAlbumProof';
import { AlbumProofViewer } from '../../components/features/album-proofing/AlbumProofViewer';
import { AlbumStatus } from '../../types/album';

export function AlbumProofPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation('album');

  const [showComments, setShowComments] = useState(true);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  const {
    proof,
    loading,
    error,
    refetch,
    currentSpreadIndex,
    setCurrentSpreadIndex,
    comments,
    fetchComments,
    addComment,
  } = useAlbumProof({
    token: token || '',
    autoFetch: !!token,
  });

  // Transform comments into pins for overlay
  const commentPins = useMemo(() => {
    if (!proof) return [];
    return comments.map((comment) => ({
      spread_id: comment.spread_id,
      comment_id: comment.comment_id,
      x: comment.position_x,
      y: comment.position_y,
      isActive: comment.comment_id === activeCommentId,
    }));
  }, [comments, activeCommentId, proof]);

  // Handle pin click for new comment
  const handlePinClick = useCallback(
    async (spreadId: string, x: number, y: number) => {
      // In a full implementation, this would open a comment creation dialog
      console.log('Pin click:', { spreadId, x, y });
      // For now, we'll just log the position
      // The CommentPinPopover component (Phase 4) will handle the actual creation
    },
    []
  );

  // Handle pin selection
  const handlePinSelect = useCallback((commentId: string) => {
    setActiveCommentId((prev) => (prev === commentId ? null : commentId));
  }, []);

  // Handle spread change
  const handleSpreadChange = useCallback(
    (index: number) => {
      setCurrentSpreadIndex(index);
      setActiveCommentId(null);
      // Optionally load comments for the new spread
      if (proof?.spreads[index]) {
        fetchComments(proof.spreads[index].spread_id);
      }
    },
    [setCurrentSpreadIndex, fetchComments, proof?.spreads]
  );

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">{t('viewer.loading')}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {t('errors.loadFailed')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {error.message || t('errors.generic')}
          </p>
          <button
            type="button"
            onClick={refetch}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {t('errors.retry')}
          </button>
        </div>
      </div>
    );
  }

  // No proof found
  if (!proof) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <AlertTriangle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {t('errors.notFound')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t('errors.linkInvalid')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: proof.branding.theme === 'dark' ? '#111827' : '#f9fafb',
      }}
    >
      {/* Status banner for approved albums */}
      {proof.status === AlbumStatus.APPROVED && (
        <div className="bg-green-500 text-white px-4 py-2 text-center text-sm font-medium">
          {t('status.approvedBanner')}
        </div>
      )}

      {/* Main viewer */}
      <AlbumProofViewer
        proof={proof}
        initialSpreadIndex={currentSpreadIndex}
        onSpreadChange={handleSpreadChange}
        onPinClick={handlePinClick}
        onPinSelect={handlePinSelect}
        commentPins={commentPins}
        showComments={showComments}
        onToggleComments={() => setShowComments((prev) => !prev)}
        className="h-screen"
      >
        {/* Comment sidebar - will be implemented in Phase 4 */}
        {showComments && (
          <div className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('comments.title')}
            </h2>
            {comments.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('comments.empty')}
              </p>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <div
                    key={comment.comment_id}
                    className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                      comment.comment_id === activeCommentId
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                    onClick={() => handlePinSelect(comment.comment_id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handlePinSelect(comment.comment_id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900 dark:text-white text-sm">
                        {comment.author_name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(comment.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {comment.body}
                    </p>
                    {comment.status === 'resolved' && (
                      <span className="inline-flex items-center mt-2 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full">
                        {t('comments.resolved')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </AlbumProofViewer>
    </div>
  );
}

export default AlbumProofPage;
