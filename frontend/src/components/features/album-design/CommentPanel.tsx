/**
 * CommentPanel Component
 *
 * Panel for viewing and creating comments on album spreads/elements.
 * Supports @mentions for team collaboration.
 */

import React, { useCallback, useRef, useState } from 'react';
import type { AlbumComment, MentionedUser, CommentStatus } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommentPanelProps {
  /** Comments list */
  comments: AlbumComment[];
  /** Currently selected spread ID */
  selectedSpreadId?: string;
  /** Currently selected element ID */
  selectedElementId?: string;
  /** Available users for @mentions */
  availableUsers: MentionedUser[];
  /** Whether comments are loading */
  isLoading: boolean;
  /** Callback to create a comment */
  onCreateComment: (content: string, mentionedUserIds: string[]) => void;
  /** Callback to resolve a comment */
  onResolveComment: (commentId: string) => void;
  /** Callback to delete a comment */
  onDeleteComment: (commentId: string) => void;
  /** Callback when clicking a comment (to navigate to its location) */
  onCommentClick: (comment: AlbumComment) => void;
  /** Callback to close the panel */
  onClose: () => void;
  /** Class name for container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Mention Input Component
// ---------------------------------------------------------------------------

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  availableUsers: MentionedUser[];
  onMention: (user: MentionedUser) => void;
  placeholder?: string;
}

const MentionInput: React.FC<MentionInputProps> = ({
  value,
  onChange,
  availableUsers,
  onMention,
  placeholder,
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;

    onChange(newValue);

    // Check for @ mention trigger
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex >= 0) {
      const query = textBeforeCursor.slice(lastAtIndex + 1);
      // Only show suggestions if there's no space after @
      if (!query.includes(' ') && query.length < 20) {
        setMentionQuery(query.toLowerCase());
        setMentionStartIndex(lastAtIndex);
        setShowSuggestions(true);
        return;
      }
    }

    setShowSuggestions(false);
  };

  const handleSelectUser = (user: MentionedUser) => {
    const before = value.slice(0, mentionStartIndex);
    const after = value.slice((inputRef.current?.selectionStart || 0));
    const newValue = `${before}@${user.name} ${after}`;
    onChange(newValue);
    onMention(user);
    setShowSuggestions(false);

    // Focus back to input
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = mentionStartIndex + user.name.length + 2;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const filteredUsers = availableUsers.filter(
    (user) =>
      user.name.toLowerCase().includes(mentionQuery) ||
      user.email?.toLowerCase().includes(mentionQuery)
  );

  return (
    <div className="relative">
      <textarea
        ref={inputRef}
        value={value}
        onChange={handleInput}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        rows={3}
      />

      {/* Mention Suggestions */}
      {showSuggestions && filteredUsers.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 w-full max-h-40 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
          {filteredUsers.map((user) => (
            <button
              key={user.id}
              onClick={() => handleSelectUser(user)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {user.name}
                </p>
                {user.email && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {user.email}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Comment Item Component
// ---------------------------------------------------------------------------

interface CommentItemProps {
  comment: AlbumComment;
  onResolve: () => void;
  onDelete: () => void;
  onClick: () => void;
}

const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  onResolve,
  onDelete,
  onClick,
}) => {
  const [showActions, setShowActions] = useState(false);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  // Render content with highlighted mentions
  const renderContent = () => {
    const content = comment.content;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    // Find all @mentions and highlight them
    const mentionRegex = /@(\w+)/g;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      // Add text before mention
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }

      // Add highlighted mention
      const mentionedUser = comment.mentioned_users.find(
        (u) => u.name.toLowerCase().replace(/\s+/g, '') === match[1].toLowerCase()
      );

      parts.push(
        <span
          key={match.index}
          className={`font-medium ${
            mentionedUser
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-900 dark:text-gray-100'
          }`}
        >
          @{match[1]}
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }

    return parts;
  };

  const isResolved = comment.status === 'resolved' as CommentStatus;

  return (
    <div
      className={`p-3 rounded-lg border transition-all cursor-pointer ${
        isResolved
          ? 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 opacity-60'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
      onClick={onClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {comment.author_avatar ? (
            <img
              src={comment.author_avatar}
              alt={comment.author_name}
              className="w-6 h-6 rounded-full"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-medium">
              {comment.author_name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {comment.author_name}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatTime(comment.created_at)}
          </span>
        </div>

        {/* Status Badge */}
        {isResolved && (
          <span className="px-1.5 py-0.5 text-xs font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 rounded">
            Resolved
          </span>
        )}
      </div>

      {/* Content */}
      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
        {renderContent()}
      </p>

      {/* Location Badge */}
      {(comment.spread_id || comment.element_id) && (
        <div className="flex items-center gap-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
          </svg>
          {comment.element_id ? 'On element' : 'On spread'}
        </div>
      )}

      {/* Replies Count */}
      {comment.replies_count > 0 && (
        <div className="flex items-center gap-1 mt-2 text-xs text-blue-600 dark:text-blue-400">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          {comment.replies_count} {comment.replies_count === 1 ? 'reply' : 'replies'}
        </div>
      )}

      {/* Actions */}
      {showActions && !isResolved && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onResolve();
            }}
            className="flex-1 px-2 py-1 text-xs font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
          >
            Resolve
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const CommentPanel: React.FC<CommentPanelProps> = ({
  comments,
  selectedSpreadId,
  selectedElementId,
  availableUsers,
  isLoading,
  onCreateComment,
  onResolveComment,
  onDeleteComment,
  onCommentClick,
  onClose,
  className = '',
}) => {
  const [newComment, setNewComment] = useState('');
  const [mentionedUsers, setMentionedUsers] = useState<MentionedUser[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'resolved'>('all');

  const handleSubmit = () => {
    if (!newComment.trim()) return;

    onCreateComment(
      newComment.trim(),
      mentionedUsers.map((u) => u.id)
    );

    setNewComment('');
    setMentionedUsers([]);
  };

  const handleMention = useCallback((user: MentionedUser) => {
    setMentionedUsers((prev) => {
      if (prev.find((u) => u.id === user.id)) return prev;
      return [...prev, user];
    });
  }, []);

  // Filter comments
  const filteredComments = comments.filter((comment) => {
    if (filterStatus === 'open' && comment.status !== 'open') return false;
    if (filterStatus === 'resolved' && comment.status !== 'resolved') return false;
    return true;
  });

  // Separate thread comments from general comments
  const threadComments = filteredComments.filter(
    (c) =>
      (selectedSpreadId && c.spread_id === selectedSpreadId) ||
      (selectedElementId && c.element_id === selectedElementId)
  );
  const generalComments = filteredComments.filter(
    (c) =>
      (!selectedSpreadId || c.spread_id !== selectedSpreadId) &&
      (!selectedElementId || c.element_id !== selectedElementId)
  );

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-900 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Comments</h2>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex px-4 py-2 border-b border-gray-200 dark:border-gray-800 gap-2">
        {(['all', 'open', 'resolved'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              filterStatus === status
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
            {status === 'all' && ` (${comments.length})`}
            {status === 'open' && ` (${comments.filter((c) => c.status === 'open').length})`}
            {status === 'resolved' && ` (${comments.filter((c) => c.status === 'resolved').length})`}
          </button>
        ))}
      </div>

      {/* Comment Input */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <MentionInput
          value={newComment}
          onChange={setNewComment}
          availableUsers={availableUsers}
          onMention={handleMention}
          placeholder="Add a comment... Use @ to mention someone"
        />
        <div className="flex items-center justify-between mt-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {selectedElementId
              ? 'Commenting on selected element'
              : selectedSpreadId
              ? 'Commenting on current spread'
              : 'General comment'}
          </div>
          <button
            onClick={handleSubmit}
            disabled={!newComment.trim()}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            Post
          </button>
        </div>
      </div>

      {/* Comment List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        ) : filteredComments.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 dark:text-gray-600 mb-2">
              <svg
                className="w-12 h-12 mx-auto"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No comments yet
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Be the first to leave feedback
            </p>
          </div>
        ) : (
          <>
            {/* Thread Comments (for selected element/spread) */}
            {threadComments.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  On This {selectedElementId ? 'Element' : 'Spread'}
                </h3>
                <div className="space-y-2">
                  {threadComments.map((comment) => (
                    <CommentItem
                      key={comment.id}
                      comment={comment}
                      onResolve={() => onResolveComment(comment.id)}
                      onDelete={() => onDeleteComment(comment.id)}
                      onClick={() => onCommentClick(comment)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* General Comments */}
            {generalComments.length > 0 && (
              <div>
                {threadComments.length > 0 && (
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 mt-4">
                    Other Comments
                  </h3>
                )}
                <div className="space-y-2">
                  {generalComments.map((comment) => (
                    <CommentItem
                      key={comment.id}
                      comment={comment}
                      onResolve={() => onResolveComment(comment.id)}
                      onDelete={() => onDeleteComment(comment.id)}
                      onClick={() => onCommentClick(comment)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CommentPanel;
