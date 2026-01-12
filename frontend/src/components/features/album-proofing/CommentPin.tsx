/**
 * CommentPin Component
 * Visual marker for positioned comments on album spreads
 *
 * Feature: 026-album-proofing
 */

import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Check } from 'lucide-react';
import type { CommentStatus } from '../../../types/album';

interface CommentPinProps {
  id: string;
  x: number;
  y: number;
  status?: CommentStatus;
  authorName?: string;
  isActive?: boolean;
  isNew?: boolean;
  commentCount?: number;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  className?: string;
}

export const CommentPin = forwardRef<HTMLButtonElement, CommentPinProps>(
  (
    {
      id,
      x,
      y,
      status = 'open',
      authorName,
      isActive = false,
      isNew = false,
      commentCount = 1,
      onClick,
      onKeyDown,
      className = '',
    },
    ref
  ) => {
    const { t } = useTranslation('album');

    const isResolved = status === 'resolved';

    // Color scheme based on status
    const getColorClasses = () => {
      if (isResolved) {
        return 'bg-green-500 border-green-600 hover:bg-green-600';
      }
      if (isActive) {
        return 'bg-primary-500 border-primary-600 ring-4 ring-primary-500/30';
      }
      if (isNew) {
        return 'bg-blue-500 border-blue-600 animate-pulse';
      }
      return 'bg-amber-500 border-amber-600 hover:bg-amber-600';
    };

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        onKeyDown={onKeyDown}
        className={`
          absolute w-8 h-8 -ml-4 -mt-4
          flex items-center justify-center
          rounded-full border-2 shadow-lg
          transition-all duration-200
          focus:outline-none focus:ring-4 focus:ring-primary-500/50
          ${getColorClasses()}
          ${isActive ? 'scale-125 z-20' : 'z-10 hover:scale-110'}
          ${className}
        `}
        style={{
          left: `${x}%`,
          top: `${y}%`,
        }}
        aria-label={t('comments.pinLabel', {
          author: authorName || t('comments.anonymous'),
          status: t(`comments.status.${status}`),
        })}
        aria-expanded={isActive}
        role="button"
        tabIndex={0}
      >
        {isResolved ? (
          <Check className="w-4 h-4 text-white" aria-hidden="true" />
        ) : (
          <>
            {commentCount > 1 ? (
              <span className="text-xs font-bold text-white">
                {commentCount > 9 ? '9+' : commentCount}
              </span>
            ) : (
              <MessageCircle className="w-4 h-4 text-white" aria-hidden="true" />
            )}
          </>
        )}

        {/* Tooltip on hover */}
        {authorName && !isActive && (
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            {authorName}
          </span>
        )}
      </button>
    );
  }
);

CommentPin.displayName = 'CommentPin';

export default CommentPin;
