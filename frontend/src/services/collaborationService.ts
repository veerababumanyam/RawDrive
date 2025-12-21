/**
 * Collaboration Service
 *
 * Service for managing profile collaboration features including
 * comments, feedback, approval workflows, and team notifications.
 *
 * Requirements: 9.3, 9.5, 9.6, 9.7
 */

import apiClient, { type ApiResponse } from '@/services/api';
import type { PreviewComment } from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested';

export interface ApprovalRequest {
  request_id: string;
  workspace_id: string;
  profile_id: string;
  preview_link_id: string;

  status: ApprovalStatus;
  requested_by: string;
  requested_by_name: string;

  approvers: ApprovalRequestApprover[];

  message?: string;
  due_date?: string;

  approved_at?: string;
  rejected_at?: string;

  created_at: string;
  updated_at: string;
}

export interface ApprovalRequestApprover {
  user_id: string;
  user_name: string;
  user_email: string;
  status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  response_message?: string;
  responded_at?: string;
}

export interface CreateApprovalRequestOptions {
  preview_link_id: string;
  approver_ids: string[];
  message?: string;
  due_date?: string;
}

export interface ApprovalResponse {
  status: 'approved' | 'rejected' | 'changes_requested';
  message?: string;
}

export interface TeamMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
  avatar_url?: string;
}

export interface Notification {
  notification_id: string;
  workspace_id: string;
  user_id: string;

  type: 'comment' | 'approval_request' | 'approval_response' | 'mention';
  title: string;
  message: string;

  resource_type: 'profile' | 'preview_link' | 'comment';
  resource_id: string;

  is_read: boolean;
  read_at?: string;

  created_at: string;
}

export interface FeedbackSummary {
  total_comments: number;
  unresolved_comments: number;
  approval_status: ApprovalStatus | null;
  last_feedback_at?: string;
}

type CommentChangeListener = (comments: PreviewComment[]) => void;
type NotificationListener = (notifications: Notification[]) => void;

// =============================================================================
// Collaboration Service Class
// =============================================================================

class CollaborationService {
  private static instance: CollaborationService;

  private workspaceId: string | null = null;
  private profileId: string | null = null;
  private comments: Map<string, PreviewComment> = new Map();
  private notifications: Notification[] = [];
  private commentListeners: Set<CommentChangeListener> = new Set();
  private notificationListeners: Set<NotificationListener> = new Set();

  private constructor() {}

  public static getInstance(): CollaborationService {
    if (!CollaborationService.instance) {
      CollaborationService.instance = new CollaborationService();
    }
    return CollaborationService.instance;
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize service with workspace and profile context
   */
  initialize(workspaceId: string, profileId: string): void {
    this.workspaceId = workspaceId;
    this.profileId = profileId;
  }

  // ===========================================================================
  // Comment Methods
  // ===========================================================================

  /**
   * Get all comments for the profile
   * Requirement 9.3: Comment and feedback storage
   */
  async listComments(options: {
    preview_link_id?: string;
    include_resolved?: boolean;
  } = {}): Promise<PreviewComment[]> {
    if (!this.workspaceId || !this.profileId) {
      throw new Error('Service not initialized');
    }

    const params = new URLSearchParams();
    params.set('profile_id', this.profileId);

    if (options.preview_link_id) {
      params.set('preview_link_id', options.preview_link_id);
    }
    if (options.include_resolved !== undefined) {
      params.set('include_resolved', options.include_resolved.toString());
    }

    const response = await apiClient.get<PreviewComment[]>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/comments?${params}`
    );

    if (response.data) {
      this.comments.clear();
      for (const comment of response.data) {
        this.comments.set(comment.comment_id, comment);
      }
      this.notifyCommentListeners();
      return response.data;
    }

    return [];
  }

  /**
   * Get a specific comment
   */
  async getComment(commentId: string): Promise<PreviewComment | null> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    if (this.comments.has(commentId)) {
      return this.comments.get(commentId)!;
    }

    const response = await apiClient.get<PreviewComment>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/comments/${commentId}`
    );

    if (response.data) {
      this.comments.set(response.data.comment_id, response.data);
      return response.data;
    }

    return null;
  }

  /**
   * Resolve a comment
   */
  async resolveComment(commentId: string): Promise<void> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    await apiClient.post(
      `/v1/workspaces/${this.workspaceId}/profile-editor/comments/${commentId}/resolve`
    );

    const comment = this.comments.get(commentId);
    if (comment) {
      this.comments.set(commentId, {
        ...comment,
        is_resolved: true,
        resolved_at: new Date().toISOString(),
      });
      this.notifyCommentListeners();
    }
  }

  /**
   * Unresolve a comment
   */
  async unresolveComment(commentId: string): Promise<void> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    await apiClient.post(
      `/v1/workspaces/${this.workspaceId}/profile-editor/comments/${commentId}/unresolve`
    );

    const comment = this.comments.get(commentId);
    if (comment) {
      this.comments.set(commentId, {
        ...comment,
        is_resolved: false,
        resolved_at: undefined,
        resolved_by: undefined,
      });
      this.notifyCommentListeners();
    }
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string): Promise<void> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    await apiClient.delete(
      `/v1/workspaces/${this.workspaceId}/profile-editor/comments/${commentId}`
    );

    this.comments.delete(commentId);
    this.notifyCommentListeners();
  }

  /**
   * Get unresolved comment count
   */
  getUnresolvedCount(): number {
    return Array.from(this.comments.values()).filter(
      (c) => !c.is_resolved
    ).length;
  }

  // ===========================================================================
  // Approval Workflow Methods
  // ===========================================================================

  /**
   * Create an approval request
   * Requirement 9.5: Approval workflow enforcement
   */
  async createApprovalRequest(
    options: CreateApprovalRequestOptions
  ): Promise<ApiResponse<ApprovalRequest>> {
    if (!this.workspaceId || !this.profileId) {
      throw new Error('Service not initialized');
    }

    return apiClient.post<ApprovalRequest>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/approvals`,
      {
        profile_id: this.profileId,
        ...options,
      }
    );
  }

  /**
   * Get approval requests for the profile
   */
  async listApprovalRequests(options: {
    status?: ApprovalStatus;
    limit?: number;
  } = {}): Promise<ApprovalRequest[]> {
    if (!this.workspaceId || !this.profileId) {
      throw new Error('Service not initialized');
    }

    const params = new URLSearchParams();
    params.set('profile_id', this.profileId);

    if (options.status) {
      params.set('status', options.status);
    }
    if (options.limit) {
      params.set('limit', options.limit.toString());
    }

    const response = await apiClient.get<ApprovalRequest[]>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/approvals?${params}`
    );

    return response.data || [];
  }

  /**
   * Get the current approval request (most recent pending)
   */
  async getCurrentApprovalRequest(): Promise<ApprovalRequest | null> {
    const requests = await this.listApprovalRequests({
      status: 'pending',
      limit: 1,
    });
    return requests[0] || null;
  }

  /**
   * Get a specific approval request
   */
  async getApprovalRequest(requestId: string): Promise<ApprovalRequest | null> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    const response = await apiClient.get<ApprovalRequest>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/approvals/${requestId}`
    );

    return response.data || null;
  }

  /**
   * Respond to an approval request (as an approver)
   */
  async respondToApproval(
    requestId: string,
    response: ApprovalResponse
  ): Promise<ApiResponse<ApprovalRequest>> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    return apiClient.post<ApprovalRequest>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/approvals/${requestId}/respond`,
      response
    );
  }

  /**
   * Cancel an approval request
   */
  async cancelApprovalRequest(requestId: string): Promise<void> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    await apiClient.delete(
      `/v1/workspaces/${this.workspaceId}/profile-editor/approvals/${requestId}`
    );
  }

  /**
   * Publish from approved preview
   * Requirement 9.7: Publish from approved preview
   */
  async publishFromApproval(requestId: string): Promise<void> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    await apiClient.post(
      `/v1/workspaces/${this.workspaceId}/profile-editor/approvals/${requestId}/publish`
    );
  }

  // ===========================================================================
  // Team Methods
  // ===========================================================================

  /**
   * Get team members for approval selection
   */
  async getTeamMembers(): Promise<TeamMember[]> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    const response = await apiClient.get<TeamMember[]>(
      `/v1/workspaces/${this.workspaceId}/team`
    );

    return response.data || [];
  }

  /**
   * Get team members who can approve (based on permissions)
   */
  async getApprovers(): Promise<TeamMember[]> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    const response = await apiClient.get<TeamMember[]>(
      `/v1/workspaces/${this.workspaceId}/team?can_approve=true`
    );

    return response.data || [];
  }

  // ===========================================================================
  // Notification Methods
  // ===========================================================================

  /**
   * Get notifications for the current user
   * Requirement 9.6: Feedback notifications
   */
  async listNotifications(options: {
    unread_only?: boolean;
    limit?: number;
  } = {}): Promise<Notification[]> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    const params = new URLSearchParams();

    if (options.unread_only) {
      params.set('unread_only', 'true');
    }
    if (options.limit) {
      params.set('limit', options.limit.toString());
    }

    const queryString = params.toString();
    const url = `/v1/workspaces/${this.workspaceId}/notifications${queryString ? `?${queryString}` : ''}`;

    const response = await apiClient.get<Notification[]>(url);

    if (response.data) {
      this.notifications = response.data;
      this.notifyNotificationListeners();
      return response.data;
    }

    return [];
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    await apiClient.post(
      `/v1/workspaces/${this.workspaceId}/notifications/${notificationId}/read`
    );

    const index = this.notifications.findIndex(
      (n) => n.notification_id === notificationId
    );
    if (index !== -1) {
      this.notifications[index] = {
        ...this.notifications[index],
        is_read: true,
        read_at: new Date().toISOString(),
      };
      this.notifyNotificationListeners();
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<void> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    await apiClient.post(
      `/v1/workspaces/${this.workspaceId}/notifications/read-all`
    );

    const now = new Date().toISOString();
    this.notifications = this.notifications.map((n) => ({
      ...n,
      is_read: true,
      read_at: now,
    }));
    this.notifyNotificationListeners();
  }

  /**
   * Get unread notification count
   */
  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.is_read).length;
  }

  // ===========================================================================
  // Feedback Summary
  // ===========================================================================

  /**
   * Get feedback summary for the profile
   */
  async getFeedbackSummary(): Promise<FeedbackSummary> {
    if (!this.workspaceId || !this.profileId) {
      throw new Error('Service not initialized');
    }

    const response = await apiClient.get<FeedbackSummary>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/${this.profileId}/feedback-summary`
    );

    return (
      response.data || {
        total_comments: 0,
        unresolved_comments: 0,
        approval_status: null,
      }
    );
  }

  // ===========================================================================
  // Subscription Methods
  // ===========================================================================

  /**
   * Subscribe to comment changes
   */
  subscribeToComments(listener: CommentChangeListener): () => void {
    this.commentListeners.add(listener);
    return () => {
      this.commentListeners.delete(listener);
    };
  }

  /**
   * Subscribe to notification changes
   */
  subscribeToNotifications(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  /**
   * Notify comment listeners
   */
  private notifyCommentListeners(): void {
    const comments = Array.from(this.comments.values());
    this.commentListeners.forEach((listener) => {
      try {
        listener(comments);
      } catch (error) {
        console.error('Comment listener error:', error);
      }
    });
  }

  /**
   * Notify notification listeners
   */
  private notifyNotificationListeners(): void {
    this.notificationListeners.forEach((listener) => {
      try {
        listener([...this.notifications]);
      } catch (error) {
        console.error('Notification listener error:', error);
      }
    });
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get approval status label
   */
  getApprovalStatusLabel(status: ApprovalStatus): {
    label: string;
    variant: 'success' | 'warning' | 'error' | 'info';
  } {
    switch (status) {
      case 'approved':
        return { label: 'Approved', variant: 'success' };
      case 'rejected':
        return { label: 'Rejected', variant: 'error' };
      case 'changes_requested':
        return { label: 'Changes Requested', variant: 'warning' };
      default:
        return { label: 'Pending Approval', variant: 'info' };
    }
  }

  /**
   * Get notification type icon name
   */
  getNotificationIcon(type: Notification['type']): string {
    switch (type) {
      case 'comment':
        return 'message-circle';
      case 'approval_request':
        return 'clipboard-check';
      case 'approval_response':
        return 'check-circle';
      case 'mention':
        return 'at-sign';
      default:
        return 'bell';
    }
  }

  /**
   * Format relative time
   */
  formatRelativeTime(dateString: string): string {
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

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }

  /**
   * Get cached comments
   */
  getCachedComments(): PreviewComment[] {
    return Array.from(this.comments.values());
  }

  /**
   * Get cached notifications
   */
  getCachedNotifications(): Notification[] {
    return [...this.notifications];
  }

  /**
   * Reset service state (for testing)
   */
  reset(): void {
    this.comments.clear();
    this.notifications = [];
    this.commentListeners.clear();
    this.notificationListeners.clear();
    this.workspaceId = null;
    this.profileId = null;
  }
}

// =============================================================================
// Export Singleton Instance
// =============================================================================

export const collaborationService = CollaborationService.getInstance();

// Export class for testing
export { CollaborationService };
