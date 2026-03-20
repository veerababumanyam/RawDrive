/**
 * CommentPanel
 * Slide-from-right panel for per-photo comments in the GalleryPlayer.
 * Loads existing comments, supports optimistic submission.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send } from 'lucide-react';
import { useGalleryInteraction } from '../../../../contexts/GalleryInteractionContext';

export interface CommentPanelProps {
  assetId: string;
  isOpen: boolean;
  onClose: () => void;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export const CommentPanel: React.FC<CommentPanelProps> = ({
  assetId,
  isOpen,
  onClose,
}) => {
  const { comments, addComment, loadComments } = useGalleryInteraction();
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const assetComments = comments.get(assetId) || [];

  // Load comments when panel opens
  useEffect(() => {
    if (isOpen) {
      loadComments(assetId);
    }
  }, [isOpen, assetId, loadComments]);

  // Scroll to bottom when comments change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [assetComments.length]);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    setText('');
    try {
      await addComment(assetId, trimmed);
    } finally {
      setIsSubmitting(false);
    }
  }, [text, isSubmitting, assetId, addComment]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-[101] md:hidden"
        onClick={onClose}
      />

      <AnimatePresence>
        {isOpen && (
          <motion.div
            data-testid="comment-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full md:w-80 bg-white dark:bg-gray-900 z-[102] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Comments
              </h3>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close comments"
              >
                <X size={18} className="text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Comment list */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-4"
            >
              {assetComments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 dark:text-gray-500 py-12">
                  <p className="text-sm">No comments yet</p>
                  <p className="text-xs mt-1">Be the first to share your thoughts</p>
                </div>
              ) : (
                assetComments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    {/* Avatar placeholder */}
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                        {(comment.visitor_name || 'A').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {comment.visitor_name || 'Anonymous'}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                          {formatRelativeTime(comment.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 break-words">
                        {comment.text}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input area */}
            <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add a comment..."
                  rows={1}
                  className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
                <button
                  onClick={handleSubmit}
                  disabled={!text.trim() || isSubmitting}
                  className="p-2 rounded-lg bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors flex-shrink-0"
                  aria-label="Send comment"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
