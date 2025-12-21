/**
 * Collaboration Panel Component
 *
 * UI for managing profile collaboration including comments,
 * approval workflows, and team notifications.
 *
 * Requirements: 9.3, 9.5, 9.6, 9.7
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageCircle,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  Trash2,
  Check,
  AlertCircle,
  Users,
  Bell,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AtSign,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import {
  collaborationService,
  type ApprovalRequest,
  type TeamMember,
  type Notification,
} from '@/services/collaborationService';
import type { PreviewComment } from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

interface CollaborationPanelProps {
  workspaceId: string;
  profileId: string;
  previewLinkId?: string;
  onError?: (error: string) => void;
}

// =============================================================================
// Comments Section Component
// =============================================================================

interface CommentsSectionProps {
  comments: PreviewComment[];
  onResolve: (commentId: string) => void;
  onUnresolve: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  isLoading: boolean;
}

const CommentsSection: React.FC<CommentsSectionProps> = ({
  comments,
  onResolve,
  onUnresolve,
  onDelete,
  isLoading,
}) => {
  const [showResolved, setShowResolved] = useState(false);

  const unresolvedComments = comments.filter((c) => !c.is_resolved);
  const resolvedComments = comments.filter((c) => c.is_resolved);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 bg-surface-hover rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="text-center py-6">
        <MessageCircle className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
        <p className="text-sm text-text-secondary">No comments yet</p>
        <p className="text-xs text-text-tertiary mt-1">
          Feedback from reviewers will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Unresolved Comments */}
      {unresolvedComments.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
            Open ({unresolvedComments.length})
          </h4>
          {unresolvedComments.map((comment) => (
            <CommentCard
              key={comment.comment_id}
              comment={comment}
              onResolve={() => onResolve(comment.comment_id)}
              onDelete={() => onDelete(comment.comment_id)}
            />
          ))}
        </div>
      )}

      {/* Resolved Comments */}
      {resolvedComments.length > 0 && (
        <div>
          <button
            onClick={() => setShowResolved(!showResolved)}
            className="flex items-center gap-1 text-xs font-medium text-text-tertiary hover:text-text-secondary transition-colors"
          >
            {showResolved ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Resolved ({resolvedComments.length})
          </button>
          {showResolved && (
            <div className="space-y-2 mt-2">
              {resolvedComments.map((comment) => (
                <CommentCard
                  key={comment.comment_id}
                  comment={comment}
                  onUnresolve={() => onUnresolve(comment.comment_id)}
                  onDelete={() => onDelete(comment.comment_id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Comment Card Component
// =============================================================================

interface CommentCardProps {
  comment: PreviewComment;
  onResolve?: () => void;
  onUnresolve?: () => void;
  onDelete: () => void;
}

const CommentCard: React.FC<CommentCardProps> = ({
  comment,
  onResolve,
  onUnresolve,
  onDelete,
}) => {
  return (
    <div
      className={`border rounded-lg p-3 ${
        comment.is_resolved
          ? 'border-border bg-surface-hover/50'
          : 'border-border bg-surface'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center">
            <span className="text-xs font-medium text-accent">
              {(comment.commenter_name || 'A')[0].toUpperCase()}
            </span>
          </div>
          <div>
            <span className="text-sm font-medium text-text-primary">
              {comment.commenter_name || 'Anonymous'}
            </span>
            <span className="text-xs text-text-tertiary ml-2">
              {collaborationService.formatRelativeTime(comment.created_at)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {comment.is_resolved ? (
            onUnresolve && (
              <button
                onClick={onUnresolve}
                className="p-1 text-text-tertiary hover:text-warning transition-colors"
                title="Reopen"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )
          ) : (
            onResolve && (
              <button
                onClick={onResolve}
                className="p-1 text-text-tertiary hover:text-success transition-colors"
                title="Resolve"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            )
          )}
          <button
            onClick={onDelete}
            className="p-1 text-text-tertiary hover:text-error transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-text-primary">{comment.content}</p>

      {/* Resolved Badge */}
      {comment.is_resolved && (
        <div className="flex items-center gap-1 mt-2 text-xs text-success">
          <CheckCircle className="w-3 h-3" />
          <span>Resolved</span>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Approval Section Component
// =============================================================================

interface ApprovalSectionProps {
  approvalRequest: ApprovalRequest | null;
  teamMembers: TeamMember[];
  previewLinkId?: string;
  onCreateRequest: (approverIds: string[], message?: string) => void;
  onRespond: (status: 'approved' | 'rejected' | 'changes_requested', message?: string) => void;
  onPublish: () => void;
  onCancel: () => void;
  isLoading: boolean;
  currentUserId?: string;
}

const ApprovalSection: React.FC<ApprovalSectionProps> = ({
  approvalRequest,
  teamMembers,
  previewLinkId,
  onCreateRequest,
  onRespond,
  onPublish,
  onCancel,
  isLoading,
  currentUserId,
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [responseMessage, setResponseMessage] = useState('');

  // Check if current user is an approver
  const currentUserApprover = approvalRequest?.approvers.find(
    (a) => a.user_id === currentUserId
  );
  const canRespond =
    currentUserApprover && currentUserApprover.status === 'pending';

  // Get approval status
  const statusInfo = approvalRequest
    ? collaborationService.getApprovalStatusLabel(approvalRequest.status)
    : null;

  const handleCreateRequest = () => {
    onCreateRequest(selectedApprovers, message || undefined);
    setShowCreateForm(false);
    setSelectedApprovers([]);
    setMessage('');
  };

  const handleRespond = (status: 'approved' | 'rejected' | 'changes_requested') => {
    onRespond(status, responseMessage || undefined);
    setResponseMessage('');
  };

  if (isLoading) {
    return <div className="h-24 bg-surface-hover rounded-lg animate-pulse" />;
  }

  // No active approval request
  if (!approvalRequest) {
    if (!previewLinkId) {
      return (
        <div className="text-center py-6">
          <Users className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-text-secondary">
            Create a preview link to request approval
          </p>
        </div>
      );
    }

    if (showCreateForm) {
      return (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">
            Request Approval
          </h4>

          {/* Approver Selection */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Select Approvers
            </label>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {teamMembers.map((member) => (
                <label
                  key={member.user_id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedApprovers.includes(member.user_id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedApprovers([...selectedApprovers, member.user_id]);
                      } else {
                        setSelectedApprovers(
                          selectedApprovers.filter((id) => id !== member.user_id)
                        );
                      }
                    }}
                    className="rounded border-border text-accent focus:ring-accent"
                  />
                  <span className="text-sm text-text-primary">{member.name}</span>
                  <span className="text-xs text-text-tertiary">{member.role}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Message (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message for reviewers..."
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <AppButton
              variant="ghost"
              size="sm"
              onClick={() => setShowCreateForm(false)}
            >
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              size="sm"
              onClick={handleCreateRequest}
              disabled={selectedApprovers.length === 0}
            >
              <Send className="w-3.5 h-3.5 mr-1" />
              Send Request
            </AppButton>
          </div>
        </div>
      );
    }

    return (
      <div className="text-center py-6">
        <Users className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
        <p className="text-sm text-text-secondary mb-3">
          Get team approval before publishing
        </p>
        <AppButton
          variant="outline"
          size="sm"
          onClick={() => setShowCreateForm(true)}
        >
          Request Approval
        </AppButton>
      </div>
    );
  }

  // Active approval request
  return (
    <div className="space-y-3">
      {/* Status */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-text-primary">
          Approval Request
        </h4>
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
            statusInfo?.variant === 'success'
              ? 'bg-success/10 text-success'
              : statusInfo?.variant === 'warning'
              ? 'bg-warning/10 text-warning'
              : statusInfo?.variant === 'error'
              ? 'bg-error/10 text-error'
              : 'bg-info/10 text-info'
          }`}
        >
          {statusInfo?.label}
        </span>
      </div>

      {/* Approvers */}
      <div className="space-y-1">
        {approvalRequest.approvers.map((approver) => (
          <div
            key={approver.user_id}
            className="flex items-center justify-between p-2 bg-surface-hover rounded-lg"
          >
            <span className="text-sm text-text-primary">{approver.user_name}</span>
            <span
              className={`flex items-center gap-1 text-xs ${
                approver.status === 'approved'
                  ? 'text-success'
                  : approver.status === 'rejected'
                  ? 'text-error'
                  : approver.status === 'changes_requested'
                  ? 'text-warning'
                  : 'text-text-tertiary'
              }`}
            >
              {approver.status === 'approved' && <CheckCircle className="w-3 h-3" />}
              {approver.status === 'rejected' && <XCircle className="w-3 h-3" />}
              {approver.status === 'changes_requested' && (
                <AlertCircle className="w-3 h-3" />
              )}
              {approver.status === 'pending' && <Clock className="w-3 h-3" />}
              {approver.status.replace('_', ' ')}
            </span>
          </div>
        ))}
      </div>

      {/* Response Form (for approvers) */}
      {canRespond && (
        <div className="border-t border-border pt-3 space-y-2">
          <textarea
            value={responseMessage}
            onChange={(e) => setResponseMessage(e.target.value)}
            placeholder="Add feedback (optional)..."
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            rows={2}
          />
          <div className="flex gap-2">
            <AppButton
              variant="primary"
              size="sm"
              onClick={() => handleRespond('approved')}
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1" />
              Approve
            </AppButton>
            <AppButton
              variant="outline"
              size="sm"
              onClick={() => handleRespond('changes_requested')}
            >
              Request Changes
            </AppButton>
            <AppButton
              variant="ghost"
              size="sm"
              onClick={() => handleRespond('rejected')}
            >
              Reject
            </AppButton>
          </div>
        </div>
      )}

      {/* Publish from Approved */}
      {approvalRequest.status === 'approved' && (
        <div className="border-t border-border pt-3">
          <AppButton
            variant="primary"
            size="sm"
            onClick={onPublish}
            className="w-full"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Publish Approved Version
          </AppButton>
        </div>
      )}

      {/* Cancel Request */}
      {approvalRequest.status === 'pending' && (
        <AppButton
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="w-full text-text-tertiary"
        >
          Cancel Request
        </AppButton>
      )}
    </div>
  );
};

// =============================================================================
// Notifications Section Component
// =============================================================================

interface NotificationsSectionProps {
  notifications: Notification[];
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
  isLoading: boolean;
}

const NotificationsSection: React.FC<NotificationsSectionProps> = ({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  isLoading,
}) => {
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-12 bg-surface-hover rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="text-center py-6">
        <Bell className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
        <p className="text-sm text-text-secondary">No notifications</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Mark All as Read */}
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <button
            onClick={onMarkAllAsRead}
            className="text-xs text-accent hover:text-accent-hover transition-colors"
          >
            Mark all as read
          </button>
        </div>
      )}

      {/* Notification List */}
      {notifications.slice(0, 5).map((notification) => (
        <button
          key={notification.notification_id}
          onClick={() => !notification.is_read && onMarkAsRead(notification.notification_id)}
          className={`w-full text-left p-3 rounded-lg border transition-colors ${
            notification.is_read
              ? 'border-border bg-surface'
              : 'border-accent/20 bg-accent/5 hover:bg-accent/10'
          }`}
        >
          <div className="flex items-start gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                notification.type === 'approval_response'
                  ? 'bg-success/10 text-success'
                  : notification.type === 'comment'
                  ? 'bg-accent/10 text-accent'
                  : 'bg-text-tertiary/10 text-text-tertiary'
              }`}
            >
              {notification.type === 'comment' && <MessageCircle className="w-3 h-3" />}
              {notification.type === 'approval_request' && <Users className="w-3 h-3" />}
              {notification.type === 'approval_response' && <CheckCircle className="w-3 h-3" />}
              {notification.type === 'mention' && <AtSign className="w-3 h-3" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {notification.title}
              </p>
              <p className="text-xs text-text-tertiary truncate">
                {notification.message}
              </p>
            </div>
            <span className="text-xs text-text-tertiary flex-shrink-0">
              {collaborationService.formatRelativeTime(notification.created_at)}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
};

// =============================================================================
// Main Component
// =============================================================================

export const CollaborationPanel: React.FC<CollaborationPanelProps> = ({
  workspaceId,
  profileId,
  previewLinkId,
  onError,
}) => {
  // State
  const [activeTab, setActiveTab] = useState<'comments' | 'approval' | 'notifications'>('comments');
  const [comments, setComments] = useState<PreviewComment[]>([]);
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [isLoadingApproval, setIsLoadingApproval] = useState(true);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);

  // Initialize service
  useEffect(() => {
    collaborationService.initialize(workspaceId, profileId);
  }, [workspaceId, profileId]);

  // Fetch data
  useEffect(() => {
    const fetchComments = async () => {
      setIsLoadingComments(true);
      try {
        const data = await collaborationService.listComments({
          preview_link_id: previewLinkId,
          include_resolved: true,
        });
        setComments(data);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to load comments');
      } finally {
        setIsLoadingComments(false);
      }
    };

    const fetchApproval = async () => {
      setIsLoadingApproval(true);
      try {
        const [request, members] = await Promise.all([
          collaborationService.getCurrentApprovalRequest(),
          collaborationService.getApprovers(),
        ]);
        setApprovalRequest(request);
        setTeamMembers(members);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to load approval data');
      } finally {
        setIsLoadingApproval(false);
      }
    };

    const fetchNotifications = async () => {
      setIsLoadingNotifications(true);
      try {
        const data = await collaborationService.listNotifications({ limit: 10 });
        setNotifications(data);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to load notifications');
      } finally {
        setIsLoadingNotifications(false);
      }
    };

    fetchComments();
    fetchApproval();
    fetchNotifications();

    // Subscribe to changes
    const unsubscribeComments = collaborationService.subscribeToComments(setComments);
    const unsubscribeNotifications = collaborationService.subscribeToNotifications(setNotifications);

    return () => {
      unsubscribeComments();
      unsubscribeNotifications();
    };
  }, [workspaceId, profileId, previewLinkId, onError]);

  // Handlers
  const handleResolveComment = useCallback(
    async (commentId: string) => {
      try {
        await collaborationService.resolveComment(commentId);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to resolve comment');
      }
    },
    [onError]
  );

  const handleUnresolveComment = useCallback(
    async (commentId: string) => {
      try {
        await collaborationService.unresolveComment(commentId);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to reopen comment');
      }
    },
    [onError]
  );

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      try {
        await collaborationService.deleteComment(commentId);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to delete comment');
      }
    },
    [onError]
  );

  const handleCreateApprovalRequest = useCallback(
    async (approverIds: string[], message?: string) => {
      if (!previewLinkId) return;
      try {
        const response = await collaborationService.createApprovalRequest({
          preview_link_id: previewLinkId,
          approver_ids: approverIds,
          message,
        });
        if (response.data) {
          setApprovalRequest(response.data);
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to create approval request');
      }
    },
    [previewLinkId, onError]
  );

  const handleRespondToApproval = useCallback(
    async (status: 'approved' | 'rejected' | 'changes_requested', message?: string) => {
      if (!approvalRequest) return;
      try {
        const response = await collaborationService.respondToApproval(
          approvalRequest.request_id,
          { status, message }
        );
        if (response.data) {
          setApprovalRequest(response.data);
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to respond to approval');
      }
    },
    [approvalRequest, onError]
  );

  const handlePublishFromApproval = useCallback(async () => {
    if (!approvalRequest) return;
    try {
      await collaborationService.publishFromApproval(approvalRequest.request_id);
      setApprovalRequest(null);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to publish');
    }
  }, [approvalRequest, onError]);

  const handleCancelApproval = useCallback(async () => {
    if (!approvalRequest) return;
    try {
      await collaborationService.cancelApprovalRequest(approvalRequest.request_id);
      setApprovalRequest(null);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to cancel approval');
    }
  }, [approvalRequest, onError]);

  const handleMarkAsRead = useCallback(
    async (notificationId: string) => {
      try {
        await collaborationService.markAsRead(notificationId);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to mark as read');
      }
    },
    [onError]
  );

  const handleMarkAllAsRead = useCallback(async () => {
    try {
      await collaborationService.markAllAsRead();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to mark all as read');
    }
  }, [onError]);

  // Counts for tabs
  const unresolvedCount = comments.filter((c) => !c.is_resolved).length;
  const unreadNotifications = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('comments')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'comments'
              ? 'text-accent border-b-2 border-accent'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          Comments
          {unresolvedCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-accent text-white rounded-full">
              {unresolvedCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('approval')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'approval'
              ? 'text-accent border-b-2 border-accent'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Users className="w-4 h-4" />
          Approval
          {approvalRequest?.status === 'pending' && (
            <span className="w-2 h-2 bg-warning rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'notifications'
              ? 'text-accent border-b-2 border-accent'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Bell className="w-4 h-4" />
          Activity
          {unreadNotifications > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-accent text-white rounded-full">
              {unreadNotifications}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'comments' && (
          <CommentsSection
            comments={comments}
            onResolve={handleResolveComment}
            onUnresolve={handleUnresolveComment}
            onDelete={handleDeleteComment}
            isLoading={isLoadingComments}
          />
        )}
        {activeTab === 'approval' && (
          <ApprovalSection
            approvalRequest={approvalRequest}
            teamMembers={teamMembers}
            previewLinkId={previewLinkId}
            onCreateRequest={handleCreateApprovalRequest}
            onRespond={handleRespondToApproval}
            onPublish={handlePublishFromApproval}
            onCancel={handleCancelApproval}
            isLoading={isLoadingApproval}
          />
        )}
        {activeTab === 'notifications' && (
          <NotificationsSection
            notifications={notifications}
            onMarkAsRead={handleMarkAsRead}
            onMarkAllAsRead={handleMarkAllAsRead}
            isLoading={isLoadingNotifications}
          />
        )}
      </div>
    </div>
  );
};

export default CollaborationPanel;
