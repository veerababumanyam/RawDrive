/**
 * CommentPinPopover Component
 * Popover for creating new comments at a position
 *
 * Feature: 026-album-proofing
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Send, Loader2 } from 'lucide-react';

interface CommentPinPopoverProps {
  x: number;
  y: number;
  spreadId: string;
  onSubmit: (data: {
    body: string;
    authorName: string;
    authorEmail?: string;
    spreadId: string;
    positionX: number;
    positionY: number;
  }) => Promise<void>;
  onCancel: () => void;
  className?: string;
}

export function CommentPinPopover({
  x,
  y,
  spreadId,
  onSubmit,
  onCancel,
  className = '',
}: CommentPinPopoverProps) {
  const { t } = useTranslation('album');
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [body, setBody] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onCancel]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();

      if (!body.trim()) {
        setError(t('comments.errors.bodyRequired'));
        return;
      }

      if (!authorName.trim()) {
        setError(t('comments.errors.nameRequired'));
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        await onSubmit({
          body: body.trim(),
          authorName: authorName.trim(),
          authorEmail: authorEmail.trim() || undefined,
          spreadId,
          positionX: x,
          positionY: y,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : t('comments.errors.submitFailed'));
        setIsSubmitting(false);
      }
    },
    [body, authorName, authorEmail, spreadId, x, y, onSubmit, t]
  );

  // Handle Cmd/Ctrl+Enter to submit
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  // Calculate position to keep popover in view
  const getPositionStyle = () => {
    const style: React.CSSProperties = {
      position: 'absolute',
    };

    // If pin is in right half, show popover to the left
    if (x > 50) {
      style.right = `${100 - x}%`;
      style.marginRight = '1rem';
    } else {
      style.left = `${x}%`;
      style.marginLeft = '1rem';
    }

    // If pin is in bottom half, show popover above
    if (y > 60) {
      style.bottom = `${100 - y}%`;
      style.marginBottom = '1rem';
    } else {
      style.top = `${y}%`;
      style.marginTop = '1rem';
    }

    return style;
  };

  return (
    <div
      ref={popoverRef}
      className={`w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-30 ${className}`}
      style={getPositionStyle()}
      role="dialog"
      aria-label={t('comments.addComment')}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-medium text-gray-900 dark:text-white">
          {t('comments.addComment')}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label={t('comments.cancel')}
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* Comment body */}
        <div>
          <label htmlFor="comment-body" className="sr-only">
            {t('comments.placeholder')}
          </label>
          <textarea
            ref={textareaRef}
            id="comment-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('comments.placeholder')}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            disabled={isSubmitting}
          />
        </div>

        {/* Author name */}
        <div>
          <label
            htmlFor="author-name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            {t('comments.yourName')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="author-name"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            disabled={isSubmitting}
          />
        </div>

        {/* Author email (optional) */}
        <div>
          <label
            htmlFor="author-email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            {t('comments.yourEmail')} <span className="text-gray-400">({t('comments.optional')})</span>
          </label>
          <input
            type="email"
            id="author-email"
            value={authorEmail}
            onChange={(e) => setAuthorEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            disabled={isSubmitting}
          />
        </div>

        {/* Error message */}
        {error && (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('comments.submitHint')}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {t('comments.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !body.trim() || !authorName.trim()}
              className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {t('comments.submit')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default CommentPinPopover;
