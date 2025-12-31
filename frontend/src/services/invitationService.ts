/**
 * Invitation Service
 *
 * Client-side service for managing digital invitations, RSVPs, and check-ins.
 * Handles both authenticated (workspace owner) and public (guest) operations.
 *
 * Feature: 016-save-the-date
 */

import apiClient from './api';
import type {
  Invitation,
  InvitationListResponse,
  CreateInvitationRequest,
  UpdateInvitationRequest,
  InvitationTemplate,
  TemplateListResponse,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  InvitationGuest,
  GuestListResponse,
  AddGuestRequest,
  UpdateGuestRequest,
  BulkAddGuestsRequest,
  SendInvitationsRequest,
  SendInvitationsResponse,
  InvitationRSVP,
  RSVPListResponse,
  SubmitRSVPRequest,
  UpdateRSVPRequest,
  RSVPSubmitResponse,
  RSVPStats,
  InvitationCheckin,
  CheckinListResponse,
  CheckinRequest,
  CheckinStats,
  QRTokenValidateRequest,
  QRTokenValidateResponse,
  InvitationStats,
  WorkspaceInvitationStats,
  InvitationImage,
  InvitationImagesResponse,
  UploadInvitationImageRequest,
  ReorderImagesRequest,
  PublicInvitation,
  AccessInvitationRequest,
  AccessInvitationResponse,
  GenerateICSRequest,
  ICSResponse,
  InvitationEvent,
  // Check-in scanner types (T118)
  ScanCheckinRequest,
  ManualCheckinRequest,
  CheckinVerifyResponse,
  CheckinResultResponse,
  InvitationEventListResponse,
} from '@/types/invitations';

// ============================================================================
// Template Operations
// ============================================================================

/**
 * List available templates for the workspace.
 * Includes system templates and workspace-specific templates.
 */
export async function listTemplates(params?: {
  category?: string;
  includeSystem?: boolean;
  includePremium?: boolean;
  page?: number;
  limit?: number;
}): Promise<TemplateListResponse> {
  const queryParams = new URLSearchParams();
  if (params?.category) queryParams.set('category', params.category);
  if (params?.includeSystem !== undefined)
    queryParams.set('include_system', String(params.includeSystem));
  if (params?.includePremium !== undefined)
    queryParams.set('include_premium', String(params.includePremium));
  if (params?.page) queryParams.set('page', String(params.page));
  if (params?.limit) queryParams.set('limit', String(params.limit));

  const query = queryParams.toString();
  return apiClient.get(`/v1/invitations/templates${query ? `?${query}` : ''}`);
}

/**
 * Get a specific template by ID.
 */
export async function getTemplate(templateId: string): Promise<InvitationTemplate> {
  return apiClient.get(`/v1/invitations/templates/${templateId}`);
}

/**
 * Create a custom template for the workspace.
 */
export async function createTemplate(
  data: CreateTemplateRequest
): Promise<InvitationTemplate> {
  return apiClient.post('/v1/invitations/templates', data);
}

/**
 * Update a workspace template.
 */
export async function updateTemplate(
  templateId: string,
  data: UpdateTemplateRequest
): Promise<InvitationTemplate> {
  return apiClient.patch(`/v1/invitations/templates/${templateId}`, data);
}

/**
 * Delete a workspace template.
 */
export async function deleteTemplate(templateId: string): Promise<void> {
  return apiClient.delete(`/v1/invitations/templates/${templateId}`);
}

// ============================================================================
// Invitation CRUD Operations
// ============================================================================

/**
 * List invitations for the current workspace.
 */
export async function listInvitations(params?: {
  status?: string;
  eventType?: string;
  upcomingOnly?: boolean;
  page?: number;
  limit?: number;
}): Promise<InvitationListResponse> {
  const queryParams = new URLSearchParams();
  if (params?.status) queryParams.set('status', params.status);
  if (params?.eventType) queryParams.set('event_type', params.eventType);
  if (params?.upcomingOnly) queryParams.set('upcoming_only', 'true');
  if (params?.page) queryParams.set('page', String(params.page));
  if (params?.limit) queryParams.set('limit', String(params.limit));

  const query = queryParams.toString();
  return apiClient.get(`/v1/invitations${query ? `?${query}` : ''}`);
}

/**
 * Get a specific invitation by ID.
 */
export async function getInvitation(invitationId: string): Promise<Invitation> {
  return apiClient.get(`/v1/invitations/${invitationId}`);
}

/**
 * Create a new invitation.
 */
export async function createInvitation(
  data: CreateInvitationRequest
): Promise<Invitation> {
  return apiClient.post('/v1/invitations', data);
}

/**
 * Update an invitation.
 */
export async function updateInvitation(
  invitationId: string,
  data: UpdateInvitationRequest
): Promise<Invitation> {
  return apiClient.patch(`/v1/invitations/${invitationId}`, data);
}

/**
 * Publish an invitation (make it publicly accessible).
 */
export async function publishInvitation(invitationId: string): Promise<Invitation> {
  return apiClient.post(`/v1/invitations/${invitationId}/publish`, {});
}

/**
 * Unpublish an invitation (back to draft).
 */
export async function unpublishInvitation(invitationId: string): Promise<Invitation> {
  return apiClient.post(`/v1/invitations/${invitationId}/unpublish`, {});
}

/**
 * Archive an invitation.
 */
export async function archiveInvitation(invitationId: string): Promise<Invitation> {
  return apiClient.post(`/v1/invitations/${invitationId}/archive`, {});
}

/**
 * Delete an invitation (soft delete).
 */
export async function deleteInvitation(invitationId: string): Promise<void> {
  return apiClient.delete(`/v1/invitations/${invitationId}`);
}

/**
 * Duplicate an invitation.
 * Creates a copy with all content except RSVPs and guests.
 * @param invitationId - The source invitation to duplicate
 * @param title - Optional custom title (defaults to "Copy of <original>")
 */
export async function duplicateInvitation(
  invitationId: string,
  title?: string
): Promise<Invitation> {
  return apiClient.post(`/v1/invitations/${invitationId}/duplicate`, title ? { title } : {});
}

/**
 * Update notification settings for an invitation.
 * @param invitationId - The invitation ID
 * @param notificationPreference - One of 'immediate', 'daily_digest', 'disabled'
 */
export async function updateNotificationSettings(
  invitationId: string,
  notificationPreference: 'immediate' | 'daily_digest' | 'disabled'
): Promise<{ notification_preference: string; message: string }> {
  return apiClient.patch(`/v1/invitations/${invitationId}/notification-settings`, {
    notification_preference: notificationPreference,
  });
}

// ============================================================================
// Invitation Images
// ============================================================================

/**
 * List images for an invitation.
 */
export async function listInvitationImages(
  invitationId: string,
  purpose?: string
): Promise<InvitationImagesResponse> {
  const query = purpose ? `?purpose=${purpose}` : '';
  return apiClient.get(`/v1/invitations/${invitationId}/images${query}`);
}

/**
 * Upload an image to an invitation.
 * Returns presigned URL for direct upload.
 */
export async function createImageUpload(
  invitationId: string,
  data: UploadInvitationImageRequest & {
    filename: string;
    contentType: string;
    size: number;
  }
): Promise<{
  imageId: string;
  uploadUrl: string;
  headers: Record<string, string>;
}> {
  return apiClient.post(`/v1/invitations/${invitationId}/images/upload`, data);
}

/**
 * Commit an image upload after direct upload completes.
 */
export async function commitImageUpload(
  invitationId: string,
  imageId: string
): Promise<InvitationImage> {
  return apiClient.post(`/v1/invitations/${invitationId}/images/${imageId}/commit`, {});
}

/**
 * Delete an image from an invitation.
 */
export async function deleteInvitationImage(
  invitationId: string,
  imageId: string
): Promise<void> {
  return apiClient.delete(`/v1/invitations/${invitationId}/images/${imageId}`);
}

/**
 * Reorder images for an invitation.
 */
export async function reorderInvitationImages(
  invitationId: string,
  data: ReorderImagesRequest
): Promise<void> {
  return apiClient.post(`/v1/invitations/${invitationId}/images/reorder`, data);
}

// ============================================================================
// Guest Management
// ============================================================================

/**
 * List guests for an invitation.
 */
export async function listGuests(
  invitationId: string,
  params?: {
    groupName?: string;
    page?: number;
    limit?: number;
  }
): Promise<GuestListResponse> {
  const queryParams = new URLSearchParams();
  if (params?.groupName) queryParams.set('group_name', params.groupName);
  if (params?.page) queryParams.set('page', String(params.page));
  if (params?.limit) queryParams.set('limit', String(params.limit));

  const query = queryParams.toString();
  return apiClient.get(`/v1/invitations/${invitationId}/guests${query ? `?${query}` : ''}`);
}

/**
 * Add a single guest to the invitation.
 */
export async function addGuest(
  invitationId: string,
  data: AddGuestRequest
): Promise<InvitationGuest> {
  return apiClient.post(`/v1/invitations/${invitationId}/guests`, data);
}

/**
 * Add multiple guests at once.
 */
export async function bulkAddGuests(
  invitationId: string,
  data: BulkAddGuestsRequest
): Promise<{ guests: InvitationGuest[]; addedCount: number }> {
  return apiClient.post(`/v1/invitations/${invitationId}/guests/bulk`, data);
}

/**
 * Update a guest.
 */
export async function updateGuest(
  invitationId: string,
  guestId: string,
  data: UpdateGuestRequest
): Promise<InvitationGuest> {
  return apiClient.patch(`/v1/invitations/${invitationId}/guests/${guestId}`, data);
}

/**
 * Delete a guest from the list.
 */
export async function deleteGuest(invitationId: string, guestId: string): Promise<void> {
  return apiClient.delete(`/v1/invitations/${invitationId}/guests/${guestId}`);
}

/**
 * Send invitations to guests.
 */
export async function sendInvitations(
  invitationId: string,
  data: SendInvitationsRequest
): Promise<SendInvitationsResponse> {
  return apiClient.post(`/v1/invitations/${invitationId}/guests/send`, data);
}

/**
 * Import guests from CSV file.
 */
export async function importGuestsFromCSV(
  invitationId: string,
  file: File
): Promise<{ guests: InvitationGuest[]; addedCount: number; errors: string[] }> {
  const formData = new FormData();
  formData.append('file', file);

  return apiClient.post(`/v1/invitations/${invitationId}/guests/import`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}

/**
 * Export guests to CSV.
 */
export async function exportGuestsToCSV(invitationId: string): Promise<Blob> {
  const response = await apiClient.get(`/v1/invitations/${invitationId}/guests/export`, {
    responseType: 'blob',
  });
  return response;
}

// ============================================================================
// RSVP Management (Owner Side)
// ============================================================================

/**
 * List RSVPs for an invitation.
 */
export async function listRSVPs(
  invitationId: string,
  params?: {
    attending?: boolean;
    status?: string;
    page?: number;
    limit?: number;
  }
): Promise<RSVPListResponse> {
  const queryParams = new URLSearchParams();
  if (params?.attending !== undefined)
    queryParams.set('attending', String(params.attending));
  if (params?.status) queryParams.set('status', params.status);
  if (params?.page) queryParams.set('page', String(params.page));
  if (params?.limit) queryParams.set('limit', String(params.limit));

  const query = queryParams.toString();
  return apiClient.get(`/v1/invitations/${invitationId}/rsvps${query ? `?${query}` : ''}`);
}

/**
 * Get RSVP statistics for an invitation.
 */
export async function getRSVPStats(invitationId: string): Promise<RSVPStats> {
  return apiClient.get(`/v1/invitations/${invitationId}/rsvps/stats`);
}

/**
 * Get a specific RSVP by ID.
 */
export async function getRSVP(invitationId: string, rsvpId: string): Promise<InvitationRSVP> {
  return apiClient.get(`/v1/invitations/${invitationId}/rsvps/${rsvpId}`);
}

/**
 * Update an RSVP (admin action).
 */
export async function updateRSVP(
  invitationId: string,
  rsvpId: string,
  data: UpdateRSVPRequest
): Promise<InvitationRSVP> {
  return apiClient.patch(`/v1/invitations/${invitationId}/rsvps/${rsvpId}`, data);
}

/**
 * Delete an RSVP.
 */
export async function deleteRSVP(invitationId: string, rsvpId: string): Promise<void> {
  return apiClient.delete(`/v1/invitations/${invitationId}/rsvps/${rsvpId}`);
}

/**
 * Export RSVPs to CSV.
 */
export async function exportRSVPsToCSV(invitationId: string): Promise<Blob> {
  const response = await apiClient.get(`/v1/invitations/${invitationId}/rsvps/export`, {
    responseType: 'blob',
  });
  return response;
}

// ============================================================================
// Check-in Management
// ============================================================================

/**
 * List check-ins for an invitation.
 */
export async function listCheckins(
  invitationId: string,
  params?: {
    page?: number;
    limit?: number;
  }
): Promise<CheckinListResponse> {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.set('page', String(params.page));
  if (params?.limit) queryParams.set('limit', String(params.limit));

  const query = queryParams.toString();
  return apiClient.get(
    `/v1/invitations/${invitationId}/checkins${query ? `?${query}` : ''}`
  );
}

/**
 * Get check-in statistics.
 */
export async function getCheckinStats(invitationId: string): Promise<CheckinStats> {
  return apiClient.get(`/v1/invitations/${invitationId}/checkins/stats`);
}

/**
 * Create a check-in record.
 */
export async function createCheckin(
  invitationId: string,
  data: CheckinRequest
): Promise<InvitationCheckin> {
  return apiClient.post(`/v1/invitations/${invitationId}/checkins`, data);
}

/**
 * Validate a QR code token for check-in (verify only, no check-in recorded).
 */
export async function validateQRToken(
  invitationId: string,
  data: QRTokenValidateRequest
): Promise<QRTokenValidateResponse> {
  return apiClient.post(`/v1/invitations/${invitationId}/checkins/validate-qr`, data);
}

/**
 * Verify check-in token and get guest info (T115).
 */
export async function verifyCheckinToken(
  invitationId: string,
  token: string
): Promise<CheckinVerifyResponse> {
  return apiClient.post(`/v1/invitations/${invitationId}/checkins/verify`, { token });
}

/**
 * Scan QR code and record check-in (T116).
 */
export async function scanAndCheckin(
  invitationId: string,
  data: ScanCheckinRequest
): Promise<CheckinResultResponse> {
  return apiClient.post(`/v1/invitations/${invitationId}/checkins`, data);
}

/**
 * Manual check-in by guest name lookup.
 */
export async function manualCheckin(
  invitationId: string,
  data: ManualCheckinRequest
): Promise<CheckinResultResponse> {
  return apiClient.post(`/v1/invitations/${invitationId}/checkins/manual`, data);
}

// ============================================================================
// Statistics & Analytics
// ============================================================================

/**
 * Get comprehensive stats for an invitation.
 */
export async function getInvitationStats(invitationId: string): Promise<InvitationStats> {
  return apiClient.get(`/v1/invitations/${invitationId}/stats`);
}

/**
 * Get workspace-level invitation statistics.
 */
export async function getWorkspaceInvitationStats(): Promise<WorkspaceInvitationStats> {
  return apiClient.get('/v1/invitations/stats');
}

/**
 * List audit events for an invitation.
 */
export async function listInvitationEvents(
  invitationId: string,
  params?: {
    eventType?: string;
    page?: number;
    limit?: number;
  }
): Promise<InvitationEventListResponse> {
  const queryParams = new URLSearchParams();
  if (params?.eventType) queryParams.set('event_type', params.eventType);
  if (params?.page) queryParams.set('page', String(params.page));
  if (params?.limit) queryParams.set('limit', String(params.limit));

  const query = queryParams.toString();
  return apiClient.get(`/v1/invitations/${invitationId}/events${query ? `?${query}` : ''}`);
}

// ============================================================================
// Calendar/ICS Generation
// ============================================================================

/**
 * Generate ICS calendar file for an invitation.
 */
export async function generateICS(
  invitationId: string,
  data?: GenerateICSRequest
): Promise<ICSResponse> {
  return apiClient.post(`/v1/invitations/${invitationId}/ics`, data || {});
}

/**
 * Download ICS file (triggers browser download).
 * Uses the /calendar endpoint for direct binary download.
 */
export async function downloadICS(invitationId: string): Promise<void> {
  try {
    // Try direct binary download first (more efficient)
    const blob = await apiClient.get<Blob>(
      `/v1/invitations/${invitationId}/calendar`,
      { responseType: 'blob' }
    );

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `event-${invitationId}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch {
    // Fallback to JSON endpoint
    const response = await generateICS(invitationId);

    // Create blob and trigger download
    const blob = new Blob([response.ics_content], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = response.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}

// ============================================================================
// Public / Guest Operations (No Auth Required)
// ============================================================================

/**
 * Access a public invitation by slug.
 * May require password/PIN if protected.
 */
export async function accessPublicInvitation(
  slug: string,
  credentials?: AccessInvitationRequest
): Promise<AccessInvitationResponse> {
  if (credentials) {
    return apiClient.post(`/v1/public/invitations/${slug}/access`, credentials);
  }
  return apiClient.get(`/v1/public/invitations/${slug}`);
}

/**
 * Get public invitation by personal guest token.
 */
export async function getPersonalizedInvitation(
  personalToken: string
): Promise<PublicInvitation & { guestName: string; personalMessage?: string }> {
  return apiClient.get(`/v1/public/invitations/guest/${personalToken}`);
}

/**
 * Submit an RSVP response (public, no auth required).
 */
export async function submitPublicRSVP(
  slug: string,
  data: SubmitRSVPRequest
): Promise<RSVPSubmitResponse> {
  return apiClient.post(`/v1/public/invitations/${slug}/rsvp`, data);
}

// ============================================================================
// Turnstile CAPTCHA Configuration (T124)
// ============================================================================

/**
 * Turnstile configuration for public forms.
 */
export interface TurnstileConfig {
  /** Whether Turnstile is enabled (CLOUDFLARE_TURNSTILE_SECRET_KEY is configured) */
  enabled: boolean;
  /** Site key for rendering the Turnstile widget */
  site_key: string | null;
}

/**
 * Get Turnstile CAPTCHA configuration.
 *
 * Returns whether Turnstile is enabled and the site key for rendering.
 * Call this before rendering RSVP forms to determine if CAPTCHA is needed.
 */
export async function getTurnstileConfig(): Promise<TurnstileConfig> {
  return apiClient.get('/v1/public/invitations/config/turnstile');
}

/**
 * Update an RSVP using edit token (public, no auth required).
 */
export async function updateRSVPByToken(
  editToken: string,
  data: UpdateRSVPRequest
): Promise<InvitationRSVP> {
  return apiClient.patch(`/v1/public/rsvp/${editToken}`, data);
}

/**
 * Get RSVP by edit token (to prefill form).
 */
export async function getRSVPByToken(
  editToken: string
): Promise<InvitationRSVP & { invitationTitle: string; eventDatetime: string }> {
  return apiClient.get(`/v1/public/rsvp/${editToken}`);
}

/**
 * Download ICS from public invitation.
 * Uses the /calendar endpoint for direct binary download.
 */
export async function downloadPublicICS(slug: string): Promise<void> {
  try {
    // Try direct binary download first (more efficient)
    const blob = await apiClient.get<Blob>(
      `/v1/public/invitations/${slug}/calendar`,
      { responseType: 'blob' }
    );

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch {
    // Fallback to JSON endpoint
    const response = await apiClient.get<ICSResponse>(
      `/v1/public/invitations/${slug}/ics`
    );

    const blob = new Blob([response.ics_content], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = response.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}

/**
 * Get public calendar download URL for direct linking.
 * Can be used as href for anchor tags.
 */
export function getPublicCalendarUrl(slug: string): string {
  return `/api/v1/public/invitations/${slug}/calendar`;
}

// ============================================================================
// QR Code Generation (Client-Side Utility)
// ============================================================================

/**
 * Generate QR code data URL for an invitation share link.
 * Uses the public URL from the invitation.
 */
export async function generateQRCodeDataURL(
  publicUrl: string,
  options?: {
    size?: number;
    color?: string;
    backgroundColor?: string;
  }
): Promise<string> {
  // This would typically use a library like qrcode
  // For now, return a placeholder - actual implementation would use
  // import QRCode from 'qrcode'
  // return QRCode.toDataURL(publicUrl, options);

  // Placeholder - actual implementation needs qrcode library
  const size = options?.size || 256;
  const encoded = encodeURIComponent(publicUrl);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`;
}

/**
 * Download QR code from backend in specified format.
 */
export async function downloadInvitationQR(
  invitationId: string,
  options?: {
    format?: 'png' | 'svg' | 'pdf';
    size?: number;
    fillColor?: string;
    backColor?: string;
    includeLogo?: boolean;
  }
): Promise<Blob> {
  const queryParams = new URLSearchParams();
  if (options?.format) queryParams.set('format', options.format);
  if (options?.size) queryParams.set('size', String(options.size));
  if (options?.fillColor) queryParams.set('fill_color', options.fillColor);
  if (options?.backColor) queryParams.set('back_color', options.backColor);
  if (options?.includeLogo) queryParams.set('include_logo', 'true');

  const query = queryParams.toString();
  return apiClient.get(`/v1/invitations/${invitationId}/qr${query ? `?${query}` : ''}`, {
    responseType: 'blob',
  });
}

/**
 * Get QR code URL for display (doesn't download, returns URL for img src).
 */
export function getInvitationQRUrl(
  invitationId: string,
  options?: {
    format?: 'png' | 'svg';
    size?: number;
    fillColor?: string;
    backColor?: string;
    includeLogo?: boolean;
  }
): string {
  const queryParams = new URLSearchParams();
  queryParams.set('format', options?.format || 'png');
  if (options?.size) queryParams.set('size', String(options.size));
  if (options?.fillColor) queryParams.set('fill_color', options.fillColor);
  if (options?.backColor) queryParams.set('back_color', options.backColor);
  if (options?.includeLogo) queryParams.set('include_logo', 'true');

  return `/api/v1/invitations/${invitationId}/qr?${queryParams.toString()}`;
}

// ============================================================================
// Draft Management (Phase 10: Save Draft and Auto-Save)
// ============================================================================

/**
 * Draft response from the backend.
 */
export interface InvitationDraft {
  draft_id: string;
  workspace_id: string;
  user_id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Save or create an invitation draft.
 * If draft_id is provided, updates existing draft.
 * If draft_id is null/undefined, creates a new draft.
 */
export async function saveDraft(
  workspaceId: string,
  data: Record<string, unknown>,
  draftId?: string | null
): Promise<{ draft_id: string; message: string }> {
  return apiClient.post(`/v1/workspaces/${workspaceId}/invitations/drafts`, {
    draft_id: draftId || null,
    data,
  });
}

/**
 * List all drafts for the current user.
 */
export async function listDrafts(
  workspaceId: string
): Promise<{ data: InvitationDraft[]; total: number }> {
  return apiClient.get(`/v1/workspaces/${workspaceId}/invitations/drafts`);
}

/**
 * Get a specific draft by ID.
 */
export async function getDraft(
  workspaceId: string,
  draftId: string
): Promise<InvitationDraft> {
  return apiClient.get(`/v1/workspaces/${workspaceId}/invitations/drafts/${draftId}`);
}

/**
 * Delete a draft.
 */
export async function deleteDraft(
  workspaceId: string,
  draftId: string
): Promise<void> {
  return apiClient.delete(`/v1/workspaces/${workspaceId}/invitations/drafts/${draftId}`);
}

// ============================================================================
// Export all functions as named exports (for tree-shaking)
// ============================================================================

export default {
  // Templates
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,

  // Invitations
  listInvitations,
  getInvitation,
  createInvitation,
  updateInvitation,
  publishInvitation,
  unpublishInvitation,
  archiveInvitation,
  deleteInvitation,
  duplicateInvitation,
  updateNotificationSettings,

  // Images
  listInvitationImages,
  createImageUpload,
  commitImageUpload,
  deleteInvitationImage,
  reorderInvitationImages,

  // Guests
  listGuests,
  addGuest,
  bulkAddGuests,
  updateGuest,
  deleteGuest,
  sendInvitations,
  importGuestsFromCSV,
  exportGuestsToCSV,

  // RSVPs
  listRSVPs,
  getRSVPStats,
  getRSVP,
  updateRSVP,
  deleteRSVP,
  exportRSVPsToCSV,

  // Check-ins
  listCheckins,
  getCheckinStats,
  createCheckin,
  validateQRToken,
  verifyCheckinToken,
  scanAndCheckin,
  manualCheckin,

  // Stats & Events
  getInvitationStats,
  getWorkspaceInvitationStats,
  listInvitationEvents,

  // Calendar
  generateICS,
  downloadICS,

  // Public
  accessPublicInvitation,
  getPersonalizedInvitation,
  submitPublicRSVP,
  getTurnstileConfig,
  updateRSVPByToken,
  getRSVPByToken,
  downloadPublicICS,
  getPublicCalendarUrl,

  // Utilities
  generateQRCodeDataURL,
  downloadInvitationQR,
  getInvitationQRUrl,

  // Drafts
  saveDraft,
  listDrafts,
  getDraft,
  deleteDraft,
};
