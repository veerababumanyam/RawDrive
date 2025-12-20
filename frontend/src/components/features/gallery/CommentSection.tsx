/**
 * CommentSection Component
 * Displays and allows adding comments on an asset or gallery
 */

import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Loader2, MoreVertical, Check, Edit2, Trash2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { commentService, type Comment } from '../../../services/metadataService';

interface CommentSectionProps {
    /** Gallery ID (required) */
    galleryId: string;
    /** Asset ID (optional, for asset-specific comments) */
    assetId?: string;
    /** Whether to show internal notes toggle */
    showInternalToggle?: boolean;
    /** Maximum height of comment list */
    maxHeight?: string;
    /** Optional class name */
    className?: string;
}

// Format relative time
const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
};

export const CommentSection: React.FC<CommentSectionProps> = ({
    galleryId,
    assetId,
    showInternalToggle = true,
    maxHeight = '400px',
    className = '',
}) => {
    const { workspace, user } = useAuth();
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [isInternal, setIsInternal] = useState(false);
    const [showInternal, setShowInternal] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Fetch comments
    useEffect(() => {
        if (!workspace?.workspace_id) return;

        const fetchComments = async () => {
            setLoading(true);
            try {
                const result = assetId
                    ? await commentService.getAssetComments(workspace.workspace_id, assetId, {
                        includeInternal: showInternal,
                    })
                    : await commentService.getGalleryComments(workspace.workspace_id, galleryId, {
                        includeInternal: showInternal,
                    });
                setComments(result.data);
            } catch (error) {
                console.error('Failed to fetch comments:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchComments();
    }, [workspace?.workspace_id, galleryId, assetId, showInternal]);

    // Auto-resize textarea
    const adjustTextareaHeight = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    };

    const handleSubmit = async () => {
        if (!workspace?.workspace_id || !newComment.trim() || submitting) return;

        setSubmitting(true);
        try {
            const comment = await commentService.createComment(workspace.workspace_id, {
                gallery_id: galleryId,
                body: newComment.trim(),
                asset_id: assetId,
                is_internal: isInternal,
            });
            setComments([comment, ...comments]);
            setNewComment('');
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        } catch (error) {
            console.error('Failed to create comment:', error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = async (commentId: string) => {
        if (!workspace?.workspace_id || !editText.trim() || submitting) return;

        setSubmitting(true);
        try {
            const updated = await commentService.updateComment(workspace.workspace_id, commentId, {
                body: editText.trim(),
            });
            setComments(comments.map((c) => (c.comment_id === commentId ? updated : c)));
            setEditingId(null);
            setEditText('');
        } catch (error) {
            console.error('Failed to update comment:', error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (commentId: string) => {
        if (!workspace?.workspace_id) return;

        try {
            await commentService.deleteComment(workspace.workspace_id, commentId);
            setComments(comments.filter((c) => c.comment_id !== commentId));
        } catch (error) {
            console.error('Failed to delete comment:', error);
        }
        setOpenMenuId(null);
    };

    const handleResolve = async (commentId: string, resolved: boolean) => {
        if (!workspace?.workspace_id) return;

        try {
            const updated = await commentService.resolveComment(
                workspace.workspace_id,
                commentId,
                resolved
            );
            setComments(comments.map((c) => (c.comment_id === commentId ? updated : c)));
        } catch (error) {
            console.error('Failed to resolve comment:', error);
        }
        setOpenMenuId(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const isOwnComment = (comment: Comment) => {
        return comment.author?.user_id === user?.id;
    };

    return (
        <div className={`flex flex-col ${className}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                    <MessageSquare size={16} className="text-muted-foreground" />
                    <span className="text-sm font-medium">Comments</span>
                    {comments.length > 0 && (
                        <span className="text-xs text-muted-foreground">({comments.length})</span>
                    )}
                </div>
                {showInternalToggle && (
                    <button
                        onClick={() => setShowInternal(!showInternal)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        title={showInternal ? 'Hide internal notes' : 'Show internal notes'}
                    >
                        {showInternal ? <Eye size={14} /> : <EyeOff size={14} />}
                        Internal
                    </button>
                )}
            </div>

            {/* Comment List */}
            <div
                ref={listRef}
                className="flex-1 overflow-y-auto space-y-3 mb-3"
                style={{ maxHeight }}
            >
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 size={20} className="animate-spin text-muted-foreground" />
                    </div>
                ) : comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No comments yet</p>
                ) : (
                    comments.map((comment) => (
                        <div
                            key={comment.comment_id}
                            className={`p-3 rounded-lg border ${comment.is_internal
                                    ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'
                                    : 'bg-muted/50 border-border'
                                } ${comment.status === 'resolved' ? 'opacity-60' : ''}`}
                        >
                            {/* Comment Header */}
                            <div className="flex items-start justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{comment.author?.name || 'Anonymous'}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {formatRelativeTime(comment.created_at)}
                                    </span>
                                    {comment.is_internal && (
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200">
                                            Internal
                                        </span>
                                    )}
                                    {comment.status === 'resolved' && (
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 flex items-center gap-0.5">
                                            <Check size={10} />
                                            Resolved
                                        </span>
                                    )}
                                </div>

                                {/* Actions Menu */}
                                <div className="relative">
                                    <button
                                        onClick={() => setOpenMenuId(openMenuId === comment.comment_id ? null : comment.comment_id)}
                                        className="p-1 rounded hover:bg-accent"
                                    >
                                        <MoreVertical size={14} />
                                    </button>
                                    {openMenuId === comment.comment_id && (
                                        <div className="absolute right-0 top-6 z-10 bg-popover border border-border rounded-md shadow-lg py-1 min-w-32">
                                            {comment.status === 'open' ? (
                                                <button
                                                    onClick={() => handleResolve(comment.comment_id, true)}
                                                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent flex items-center gap-2"
                                                >
                                                    <Check size={14} />
                                                    Mark Resolved
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleResolve(comment.comment_id, false)}
                                                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent flex items-center gap-2"
                                                >
                                                    Reopen
                                                </button>
                                            )}
                                            {isOwnComment(comment) && (
                                                <>
                                                    <button
                                                        onClick={() => {
                                                            setEditingId(comment.comment_id);
                                                            setEditText(comment.body);
                                                            setOpenMenuId(null);
                                                        }}
                                                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent flex items-center gap-2"
                                                    >
                                                        <Edit2 size={14} />
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(comment.comment_id)}
                                                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent text-red-600 flex items-center gap-2"
                                                    >
                                                        <Trash2 size={14} />
                                                        Delete
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Comment Body */}
                            {editingId === comment.comment_id ? (
                                <div className="space-y-2">
                                    <textarea
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                        className="w-full px-2 py-1.5 text-sm bg-background border border-input rounded resize-none"
                                        rows={3}
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => {
                                                setEditingId(null);
                                                setEditText('');
                                            }}
                                            className="px-2 py-1 text-xs hover:bg-accent rounded"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => handleEdit(comment.comment_id)}
                                            disabled={submitting || !editText.trim()}
                                            className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* New Comment Input */}
            <div className="border-t border-border pt-3">
                <div className="flex gap-2">
                    <div className="flex-1">
                        <textarea
                            ref={textareaRef}
                            value={newComment}
                            onChange={(e) => {
                                setNewComment(e.target.value);
                                adjustTextareaHeight();
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="Add a comment..."
                            disabled={submitting}
                            rows={1}
                            className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                        />
                        {showInternalToggle && (
                            <label className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isInternal}
                                    onChange={(e) => setIsInternal(e.target.checked)}
                                    className="w-3.5 h-3.5 rounded border-input"
                                />
                                Internal note (not visible to clients)
                            </label>
                        )}
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || !newComment.trim()}
                        className="self-start p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Send comment"
                    >
                        {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CommentSection;
