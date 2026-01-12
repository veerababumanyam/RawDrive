/**
 * CommentThread Component
 * Displays a comment with its replies and actions
 *
 * Feature: 026-album-proofing
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  RotateCcw,
  Reply,
  MoreHorizontal,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Send,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { AlbumComment, CommentStatus } from '../../../types/album';

interface CommentThreadProps {
  comment: AlbumComment;
  isActive?: boolean;
  canResolve?: boolean;
  canDelete?: boolean;
  onResolve?: (commentId: string) => Promise<void>;
  onReopen?: (commentId: string) => Promise<void>;
  onDelete?: (commentId: string) => Promise<void>;
  onReply?: (commentId: string, body: string, authorName: string) => Promise<void>;
  onClick?: () => void;
  className?: string;
}

export function CommentThread({
  comment,
  isActive = false,
  canResolve = true,
  canDelete = true,
  onResolve,
  onReopen,
  onDelete,
  onReply,
  onClick,
  className = '',
}: CommentThreadProps) {
  const { t } = useTranslation('album');

  const [showReplies, setShowReplies] = useState(true);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyAuthor, setReplyAuthor] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const isResolved = comment.status === 'resolved';
  const hasReplies = comment.replies && comment.replies.length > 0;

  const handleResolve = useCallback(async () => {
    if (!onResolve) return;
    setIsResolving(true);
    try {
      await onResolve(comment.comment_id);
    } finally {
      setIsResolving(false);
    }
  }, [onResolve, comment.comment_id]);

  const handleReopen = useCallback(async () => {
    if (!onReopen) return;
    setIsResolving(true);
    try {
      await onReopen(comment.comment_id);
    } finally {
      setIsResolving(false);
    }
  }, [onReopen, comment.comment_id]);

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    if (!window.confirm(t('comments.confirmDelete'))) return;
    setIsDeleting(true);
    try {
      await onDelete(comment.comment_id);
    } finally {
      setIsDeleting(false);
    }
  }, [onDelete, comment.comment_id, t]);

  const handleReply = useCallback(async () => {
    if (!onReply || !replyBody.trim() || !replyAuthor.trim()) return;
    setIsReplying(true);
    try {
      await onReply(comment.comment_id, replyBody.trim(), replyAuthor.trim());
      setReplyBody('');
      setShowReplyInput(false);
    } finally {
      setIsReplying(false);
    }
  }, [onReply, comment.comment_id, replyBody, replyAuthor]);

  const getStatusColor = (status: CommentStatus) => {
    switch (status) {
      case 'resolved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      default:
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    }
  };

  return (
    <div
      className={`
        rounded-lg border transition-colors
        ${isActive
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
        }
        ${className}
      `}
    >
      {/* Main comment */}
      <div
        className="p-4 cursor-pointer"
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
          }
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white">
              {comment.author_name}
            </span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(comment.status)}`}>
              {t(`comments.status.${comment.status}`)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatDistanceToNow(new Date(comment.created_at))}
            </span>

            {/* Actions menu */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowActions(!showActions);
                }}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label={t('comments.actions')}
              >
                <MoreHorizontal className="w-4 h-4 text-gray-500" />
              </button>

              {showActions && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                  {canResolve && !isResolved && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResolve();
                        setShowActions(false);
                      }}
                      disabled={isResolving}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {isResolving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                      {t('comments.resolve')}
                    </button>
                  )}

                  {canResolve && isResolved && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReopen();
                        setShowActions(false);
                      }}
                      disabled={isResolving}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {isResolving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4 text-amber-500" />
                      )}
                      {t('comments.reopen')}
                    </button>
                  )}

                  {onReply && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowReplyInput(true);
                        setShowActions(false);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <Reply className="w-4 h-4" />
                      {t('comments.reply')}
                    </button>
                  )}

                  {canDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete();
                        setShowActions(false);
                      }}
                      disabled={isDeleting}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      {t('comments.delete')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
          {comment.body}
        </p>

        {/* Position indicator */}
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {t('comments.pagePosition', { page: comment.spread_id.slice(0, 8) })}
        </p>
      </div>

      {/* Replies section */}
      {hasReplies && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowReplies(!showReplies);
            }}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {showReplies ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            {t('comments.replies', { count: comment.replies?.length || 0 })}
          </button>

          {showReplies && (
            <div className="px-4 pb-4 space-y-3">
              {comment.replies?.map((reply) => (
                <div
                  key={reply.comment_id}
                  className="pl-4 border-l-2 border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-gray-900 dark:text-white">
                      {reply.author_name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDistanceToNow(new Date(reply.created_at))}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {reply.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reply input */}
      {showReplyInput && (
        <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700">
          <div className="mt-4 space-y-3">
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder={t('comments.replyPlaceholder')}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            />
            <input
              type="text"
              value={replyAuthor}
              onChange={(e) => setReplyAuthor(e.target.value)}
              placeholder={t('comments.yourName')}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowReplyInput(false);
                  setReplyBody('');
                }}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                {t('comments.cancel')}
              </button>
              <button
                type="button"
                onClick={handleReply}
                disabled={isReplying || !replyBody.trim() || !replyAuthor.trim()}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
              >
                {isReplying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {t('comments.reply')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CommentThread;
