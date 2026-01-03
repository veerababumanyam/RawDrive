/**
 * Invitation Service
 *
 * Client-side service for managing digital invitations, RSVPs, and check-ins.
 * Handles both authenticated (workspace owner) and public (guest) operations.
 *
 * Feature: 016-save-the-date
 */

import apiClient, { ApiResponse } from './api';
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
  // Check-in scanner types (T118)
  ScanCheckinRequest,
  ManualCheckinRequest,
  CheckinVerifyResponse,
  CheckinResultResponse,
  InvitationEventListResponse,
  SubEvent,
  InvitationMedia,
  MediaPurpose,
  GenerateContentRequest,
  GenerateContentResponse,
} from '@/types/invitations';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Helper to unwrap API responses and throw on errors
 */
function unwrapResponse<T>(response: ApiResponse<T>, errorMessage: string): T {
  if (response.error) {
    throw new Error(response.error.message || errorMessage);
  }
  return response.data!;
}

// ============================================================================
// Template Operations
// ============================================================================

/**
 * List available templates for the workspace.
 * Includes system templates and workspace-specific templates.
 */
export async function listTemplates(
  workspaceId: string,
  params?: {
    category?: string;
    includeSystem?: boolean;
    includePremium?: boolean;
    page?: number;
    limit?: number;
  }
): Promise<TemplateListResponse> {
  const queryParams = new URLSearchParams();
  if (params?.category) queryParams.set('category', params.category);
  if (params?.includeSystem !== undefined)
    queryParams.set('include_system', String(params.includeSystem));
  if (params?.includePremium !== undefined)
    queryParams.set('include_premium', String(params.includePremium));
  if (params?.page) queryParams.set('page', String(params.page));
  if (params?.limit) queryParams.set('limit', String(params.limit));

  const query = queryParams.toString();
  const response = await apiClient.get<TemplateListResponse>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/templates${query ? `?${query}` : ''}`
  );
  return unwrapResponse(response, 'Failed to fetch templates');
}

/**
 * Get a specific template by ID.
 */
export async function getTemplate(workspaceId: string, templateId: string): Promise<InvitationTemplate> {
  const response = await apiClient.get<InvitationTemplate>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/templates/${templateId}`
  );
  return unwrapResponse(response, 'Failed to fetch template');
}

/**
 * Create a custom template for the workspace.
 */
export async function createTemplate(
  workspaceId: string,
  data: CreateTemplateRequest
): Promise<InvitationTemplate> {
  const response = await apiClient.post<InvitationTemplate>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/templates`,
    data
  );
  return unwrapResponse(response, 'Failed to create template');
}

/**
 * Update a workspace template.
 */
export async function updateTemplate(
  workspaceId: string,
  templateId: string,
  data: UpdateTemplateRequest
): Promise<InvitationTemplate> {
  const response = await apiClient.patch<InvitationTemplate>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/templates/${templateId}`,
    data
  );
  return unwrapResponse(response, 'Failed to update template');
}

/**
 * Delete a workspace template.
 */
export async function deleteTemplate(workspaceId: string, templateId: string): Promise<void> {
  const response = await apiClient.delete<void>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/templates/${templateId}`
  );
  if (response.error) {
    throw new Error(response.error.message || 'Failed to delete template');
  }
}

// ============================================================================
// Invitation CRUD Operations
// ============================================================================

/**
 * List invitations for the current workspace.
 */
export async function listInvitations(
  workspaceId: string,
  params?: {
    status?: string;
    event_type?: string;
    search?: string;
    upcomingOnly?: boolean;
    page?: number;
    limit?: number;
  }
): Promise<InvitationListResponse> {
  const queryParams = new URLSearchParams();
  if (params?.status) queryParams.set('status', params.status);
  if (params?.event_type) queryParams.set('event_type', params.event_type);
  if (params?.search) queryParams.set('search', params.search);
  if (params?.upcomingOnly) queryParams.set('upcoming_only', 'true');
  if (params?.page) queryParams.set('page', String(params.page));
  if (params?.limit) queryParams.set('limit', String(params.limit));

  const query = queryParams.toString();
  const response = await apiClient.get<InvitationListResponse>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations${query ? `?${query}` : ''}`
  );
  return unwrapResponse(response, 'Failed to fetch invitations');
}

/**
 * Get a specific invitation by ID.
 */
export async function getInvitation(workspaceId: string, invitationId: string): Promise<Invitation> {
  const response = await apiClient.get<Invitation>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}`
  );
  return unwrapResponse(response, 'Failed to fetch invitation');
}

/**
 * Create a new invitation.
 */
export async function createInvitation(
  workspaceId: string,
  data: CreateInvitationRequest
): Promise<Invitation> {
  const response = await apiClient.post<Invitation>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations`,
    data
  );
  return unwrapResponse(response, 'Failed to create invitation');
}

/**
 * Update an invitation.
 */
export async function updateInvitation(
  workspaceId: string,
  invitationId: string,
  data: UpdateInvitationRequest
): Promise<Invitation> {
  const response = await apiClient.patch<Invitation>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}`,
    data
  );
  return unwrapResponse(response, 'Failed to update invitation');
}

/**
 * Publish an invitation (make it publicly accessible).
 */
export async function publishInvitation(workspaceId: string, invitationId: string): Promise<Invitation> {
  const response = await apiClient.post<Invitation>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/publish`,
    {}
  );
  return unwrapResponse(response, 'Failed to publish invitation');
}

/**
 * Unpublish an invitation (back to draft).
 */
export async function unpublishInvitation(workspaceId: string, invitationId: string): Promise<Invitation> {
  const response = await apiClient.post<Invitation>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/unpublish`,
    {}
  );
  return unwrapResponse(response, 'Failed to unpublish invitation');
}

/**
 * Archive an invitation.
 */
export async function archiveInvitation(workspaceId: string, invitationId: string): Promise<Invitation> {
  const response = await apiClient.post<Invitation>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/archive`,
    {}
  );
  return unwrapResponse(response, 'Failed to archive invitation');
}

/**
 * Delete an invitation (soft delete).
 */
export async function deleteInvitation(workspaceId: string, invitationId: string): Promise<void> {
  const response = await apiClient.delete<void>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}`
  );
  if (response.error) {
    throw new Error(response.error.message || 'Failed to delete invitation');
  }
}

/**
 * Duplicate an invitation.
 * Creates a copy with all content except RSVPs and guests.
 * @param workspaceId - The workspace ID
 * @param invitationId - The source invitation to duplicate
 * @param title - Optional custom title (defaults to "Copy of <original>")
 */
export async function duplicateInvitation(
  workspaceId: string,
  invitationId: string,
  title?: string
): Promise<Invitation> {
  const response = await apiClient.post<Invitation>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/duplicate`,
    title ? { title } : {}
  );
  return unwrapResponse(response, 'Failed to duplicate invitation');
}

/**
 * Update notification settings for an invitation.
 * @param workspaceId - The workspace ID
 * @param invitationId - The invitation ID
 * @param notificationPreference - One of 'immediate', 'daily_digest', 'disabled'
 */
export async function updateNotificationSettings(
  workspaceId: string,
  invitationId: string,
  notificationPreference: 'immediate' | 'daily_digest' | 'disabled'
): Promise<{ notification_preference: string; message: string }> {
  const response = await apiClient.patch<{ notification_preference: string; message: string }>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/notification-settings`,
    { notification_preference: notificationPreference }
  );
  return unwrapResponse(response, 'Failed to update notification settings');
}

// ============================================================================
// Invitation Images
// ============================================================================

/**
 * List images for an invitation.
 */
export async function listInvitationImages(
  workspaceId: string,
  invitationId: string,
  purpose?: string
): Promise<InvitationImagesResponse> {
  const query = purpose ? `?purpose=${purpose}` : '';
  const response = await apiClient.get<InvitationImagesResponse>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/images${query}`
  );
  return unwrapResponse(response, 'Failed to fetch invitation images');
}

/**
 * Upload an image to an invitation.
 * Returns presigned URL for direct upload.
 */
export async function createImageUpload(
  workspaceId: string,
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
  const response = await apiClient.post<{
    imageId: string;
    uploadUrl: string;
    headers: Record<string, string>;
  }>(`/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/images/upload`, data);
  return unwrapResponse(response, 'Failed to create image upload');
}

/**
 * Commit an image upload after direct upload completes.
 */
export async function commitImageUpload(
  workspaceId: string,
  invitationId: string,
  imageId: string
): Promise<InvitationImage> {
  const response = await apiClient.post<InvitationImage>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/images/${imageId}/commit`,
    {}
  );
  return unwrapResponse(response, 'Failed to commit image upload');
}

/**
 * Delete an image from an invitation.
 */
export async function deleteInvitationImage(
  workspaceId: string,
  invitationId: string,
  imageId: string
): Promise<void> {
  const response = await apiClient.delete<void>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/images/${imageId}`
  );
  if (response.error) {
    throw new Error(response.error.message || 'Failed to delete image');
  }
}

/**
 * Reorder images for an invitation.
 */
export async function reorderInvitationImages(
  workspaceId: string,
  invitationId: string,
  data: ReorderImagesRequest
): Promise<void> {
  const response = await apiClient.post<void>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/images/reorder`,
    data
  );
  if (response.error) {
    throw new Error(response.error.message || 'Failed to reorder images');
  }
}

// ============================================================================
// Guest Management
// ============================================================================

/**
 * List guests for an invitation.
 */
export async function listGuests(
  workspaceId: string,
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
  const response = await apiClient.get<GuestListResponse>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/guests${query ? `?${query}` : ''}`
  );
  return unwrapResponse(response, 'Failed to fetch guests');
}

/**
 * Add a single guest to the invitation.
 */
export async function addGuest(
  workspaceId: string,
  invitationId: string,
  data: AddGuestRequest
): Promise<InvitationGuest> {
  const response = await apiClient.post<InvitationGuest>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/guests`,
    data
  );
  return unwrapResponse(response, 'Failed to add guest');
}

/**
 * Add multiple guests at once.
 */
export async function bulkAddGuests(
  workspaceId: string,
  invitationId: string,
  data: BulkAddGuestsRequest
): Promise<{ guests: InvitationGuest[]; addedCount: number }> {
  const response = await apiClient.post<{ guests: InvitationGuest[]; addedCount: number }>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/guests/bulk`,
    data
  );
  return unwrapResponse(response, 'Failed to add guests');
}

/**
 * Update a guest.
 */
export async function updateGuest(
  workspaceId: string,
  invitationId: string,
  guestId: string,
  data: UpdateGuestRequest
): Promise<InvitationGuest> {
  const response = await apiClient.patch<InvitationGuest>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/guests/${guestId}`,
    data
  );
  return unwrapResponse(response, 'Failed to update guest');
}

/**
 * Delete a guest from the list.
 */
export async function deleteGuest(workspaceId: string, invitationId: string, guestId: string): Promise<void> {
  const response = await apiClient.delete<void>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/guests/${guestId}`
  );
  if (response.error) {
    throw new Error(response.error.message || 'Failed to delete guest');
  }
}

/**
 * Send invitations to guests.
 */
export async function sendInvitations(
  workspaceId: string,
  invitationId: string,
  data: SendInvitationsRequest
): Promise<SendInvitationsResponse> {
  const response = await apiClient.post<SendInvitationsResponse>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/guests/send`,
    data
  );
  return unwrapResponse(response, 'Failed to send invitations');
}

/**
 * Import guests from CSV file.
 */
export async function importGuestsFromCSV(
  workspaceId: string,
  invitationId: string,
  file: File
): Promise<{ guests: InvitationGuest[]; addedCount: number; errors: string[] }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.upload<{ guests: InvitationGuest[]; addedCount: number; errors: string[] }>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/guests/import`,
    formData
  );
  return unwrapResponse(response, 'Failed to import guests');
}

/**
 * Export guests to CSV.
 */
export async function exportGuestsToCSV(workspaceId: string, invitationId: string): Promise<Blob> {
  const response = await apiClient.fetchRaw(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/guests/export`
  );
  if (!response.ok) {
    throw new Error('Failed to export guests');
  }
  return response.blob();
}

// ============================================================================
// RSVP Management (Owner Side)
// ============================================================================

/**
 * List RSVPs for an invitation.
 */
export async function listRSVPs(
  workspaceId: string,
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
  const response = await apiClient.get<RSVPListResponse>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/rsvps${query ? `?${query}` : ''}`
  );
  return unwrapResponse(response, 'Failed to fetch RSVPs');
}

/**
 * Get RSVP statistics for an invitation.
 */
export async function getRSVPStats(workspaceId: string, invitationId: string): Promise<RSVPStats> {
  const response = await apiClient.get<RSVPStats>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/rsvps/stats`
  );
  return unwrapResponse(response, 'Failed to fetch RSVP stats');
}

/**
 * Get a specific RSVP by ID.
 */
export async function getRSVP(workspaceId: string, invitationId: string, rsvpId: string): Promise<InvitationRSVP> {
  const response = await apiClient.get<InvitationRSVP>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/rsvps/${rsvpId}`
  );
  return unwrapResponse(response, 'Failed to fetch RSVP');
}

/**
 * Update an RSVP (admin action).
 */
export async function updateRSVP(
  workspaceId: string,
  invitationId: string,
  rsvpId: string,
  data: UpdateRSVPRequest
): Promise<InvitationRSVP> {
  const response = await apiClient.patch<InvitationRSVP>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/rsvps/${rsvpId}`,
    data
  );
  return unwrapResponse(response, 'Failed to update RSVP');
}

/**
 * Delete an RSVP.
 */
export async function deleteRSVP(workspaceId: string, invitationId: string, rsvpId: string): Promise<void> {
  const response = await apiClient.delete<void>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/rsvps/${rsvpId}`
  );
  if (response.error) {
    throw new Error(response.error.message || 'Failed to delete RSVP');
  }
}

/**
 * Export RSVPs to CSV.
 */
export async function exportRSVPsToCSV(workspaceId: string, invitationId: string): Promise<Blob> {
  const response = await apiClient.fetchRaw(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/rsvps/export`
  );
  if (!response.ok) {
    throw new Error('Failed to export RSVPs');
  }
  return response.blob();
}

// ============================================================================
// Check-in Management
// ============================================================================

/**
 * List check-ins for an invitation.
 */
export async function listCheckins(
  workspaceId: string,
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
  const response = await apiClient.get<CheckinListResponse>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/checkins${query ? `?${query}` : ''}`
  );
  return unwrapResponse(response, 'Failed to fetch check-ins');
}

/**
 * Get check-in statistics.
 */
export async function getCheckinStats(workspaceId: string, invitationId: string): Promise<CheckinStats> {
  const response = await apiClient.get<CheckinStats>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/checkins/stats`
  );
  return unwrapResponse(response, 'Failed to fetch check-in stats');
}

/**
 * Create a check-in record.
 */
export async function createCheckin(
  workspaceId: string,
  invitationId: string,
  data: CheckinRequest
): Promise<InvitationCheckin> {
  const response = await apiClient.post<InvitationCheckin>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/checkins`,
    data
  );
  return unwrapResponse(response, 'Failed to create check-in');
}

/**
 * Validate a QR code token for check-in (verify only, no check-in recorded).
 */
export async function validateQRToken(
  workspaceId: string,
  invitationId: string,
  data: QRTokenValidateRequest
): Promise<QRTokenValidateResponse> {
  const response = await apiClient.post<QRTokenValidateResponse>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/checkins/validate-qr`,
    data
  );
  return unwrapResponse(response, 'Failed to validate QR token');
}

/**
 * Verify check-in token and get guest info (T115).
 */
export async function verifyCheckinToken(
  workspaceId: string,
  invitationId: string,
  token: string
): Promise<CheckinVerifyResponse> {
  const response = await apiClient.post<CheckinVerifyResponse>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/checkins/verify`,
    { token }
  );
  return unwrapResponse(response, 'Failed to verify check-in token');
}

/**
 * Scan QR code and record check-in (T116).
 */
export async function scanAndCheckin(
  workspaceId: string,
  invitationId: string,
  data: ScanCheckinRequest
): Promise<CheckinResultResponse> {
  const response = await apiClient.post<CheckinResultResponse>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/checkins`,
    data
  );
  return unwrapResponse(response, 'Failed to record check-in');
}

/**
 * Manual check-in by guest name lookup.
 */
export async function manualCheckin(
  workspaceId: string,
  invitationId: string,
  data: ManualCheckinRequest
): Promise<CheckinResultResponse> {
  const response = await apiClient.post<CheckinResultResponse>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/checkins/manual`,
    data
  );
  return unwrapResponse(response, 'Failed to record manual check-in');
}

// ============================================================================
// Sub-events (T126)
// ============================================================================

export async function createSubEvent(
  workspaceId: string,
  invitationId: string,
  data: Partial<SubEvent>
): Promise<SubEvent> {
  const response = await apiClient.post<SubEvent>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/sub-events`,
    data
  );
  return unwrapResponse(response, 'Failed to create sub-event');
}

export async function updateSubEvent(
  workspaceId: string,
  invitationId: string,
  subEventId: string,
  data: Partial<SubEvent>
): Promise<SubEvent> {
  const response = await apiClient.patch<SubEvent>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/sub-events/${subEventId}`,
    data
  );
  return unwrapResponse(response, 'Failed to update sub-event');
}

export async function deleteSubEvent(
  workspaceId: string,
  invitationId: string,
  subEventId: string
): Promise<void> {
  const response = await apiClient.delete<void>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/sub-events/${subEventId}`
  );
  if (response.error) {
    throw new Error(response.error.message || 'Failed to delete sub-event');
  }
}

export async function listSubEvents(
  workspaceId: string,
  invitationId: string
): Promise<SubEvent[]> {
  const response = await apiClient.get<SubEvent[]>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/sub-events`
  );
  return unwrapResponse(response, 'Failed to fetch sub-events');
}

export async function reorderSubEvents(
  workspaceId: string,
  invitationId: string,
  subEventIds: string[]
): Promise<void> {
  const response = await apiClient.post<void>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/sub-events/reorder`,
    { sub_event_ids: subEventIds }
  );
  if (response.error) {
    throw new Error(response.error.message || 'Failed to reorder sub-events');
  }
}

// ============================================================================
// Media (Video/Audio)
// ============================================================================

interface InitiateMediaUploadResponse {
  media: InvitationMedia;
  upload_url: string;
}

export async function initiateMediaUpload(
  workspaceId: string,
  invitationId: string,
  file: File,
  purpose: MediaPurpose = 'content'
): Promise<InitiateMediaUploadResponse> {
  const response = await apiClient.post<InitiateMediaUploadResponse>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/media`,
    {
      filename: file.name,
      content_type: file.type,
      size_bytes: file.size,
      media_type: file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('image/') ? 'image' : 'video',
      purpose,
    }
  );

  return unwrapResponse(response, 'Failed to initiate media upload');
}

export async function completeMediaUpload(
  workspaceId: string,
  invitationId: string,
  mediaId: string
): Promise<InvitationMedia> {
  const response = await apiClient.put<InvitationMedia>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/media/${mediaId}/complete`
  );
  const media = unwrapResponse(response, 'Failed to complete media upload');
  // Normalize URL field for downstream consumers
  return {
    ...media,
    url: media.url || media.media_url || media.original_url,
  };
}

export async function uploadMedia(
  workspaceId: string,
  invitationId: string,
  file: File,
  purpose: MediaPurpose = 'content'
): Promise<InvitationMedia> {
  const { media, upload_url } = await initiateMediaUpload(
    workspaceId,
    invitationId,
    file,
    purpose
  );

  // Direct PUT to presigned URL
  await fetch(upload_url, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  return completeMediaUpload(workspaceId, invitationId, media.media_id);
}

export async function deleteMedia(
  workspaceId: string,
  invitationId: string,
  mediaId: string
): Promise<void> {
  const response = await apiClient.delete<void>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/media/${mediaId}`
  );
  if (response.error) {
    throw new Error(response.error.message || 'Failed to delete media');
  }
}

export async function listMedia(
  workspaceId: string,
  invitationId: string
): Promise<InvitationMedia[]> {
  const response = await apiClient.get<InvitationMedia[]>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/media`
  );
  const items = unwrapResponse(response, 'Failed to fetch media');
  return items.map((item) => ({
    ...item,
    url: item.url || item.media_url || item.original_url,
  }));
}

// ============================================================================
// Statistics & Analytics
// ============================================================================

/**
 * Get comprehensive stats for an invitation.
 */
export async function getInvitationStats(workspaceId: string, invitationId: string): Promise<InvitationStats> {
  const response = await apiClient.get<InvitationStats>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/stats`
  );
  return unwrapResponse(response, 'Failed to fetch invitation stats');
}

/**
 * Get workspace-level invitation statistics.
 */
export async function getWorkspaceInvitationStats(workspaceId: string): Promise<WorkspaceInvitationStats> {
  const response = await apiClient.get<WorkspaceInvitationStats>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/stats`
  );
  return unwrapResponse(response, 'Failed to fetch workspace invitation stats');
}

/**
 * List audit events for an invitation.
 */
export async function listInvitationEvents(
  workspaceId: string,
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
  const response = await apiClient.get<InvitationEventListResponse>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/events${query ? `?${query}` : ''}`
  );
  return unwrapResponse(response, 'Failed to fetch invitation events');
}

// ============================================================================
// Calendar/ICS Generation
// ============================================================================

/**
 * Generate ICS calendar file for an invitation.
 */
export async function generateICS(
  workspaceId: string,
  invitationId: string,
  data?: GenerateICSRequest
): Promise<ICSResponse> {
  const response = await apiClient.post<ICSResponse>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/ics`,
    data || {}
  );
  return unwrapResponse(response, 'Failed to generate ICS');
}

/**
 * Download ICS file (triggers browser download).
 * Uses the /calendar endpoint for direct binary download.
 */
export async function downloadICS(workspaceId: string, invitationId: string): Promise<void> {
  try {
    // Try direct binary download first (more efficient)
    const blobResponse = await apiClient.fetchRaw(
      `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/calendar`
    );
    if (!blobResponse.ok) {
      throw new Error('Failed to download ICS');
    }
    const blob = await blobResponse.blob();

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
    const response = await generateICS(workspaceId, invitationId);

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
    const response = await apiClient.post<AccessInvitationResponse>(
      `/api/v1/public/invitations/${slug}/access`,
      credentials
    );
    return unwrapResponse(response, 'Failed to access invitation');
  }
  const response = await apiClient.get<AccessInvitationResponse>(
    `/api/v1/public/invitations/${slug}`
  );
  return unwrapResponse(response, 'Failed to access invitation');
}

/**
 * Access a public invitation by magic link token.
 * Used for /i/{token} URL pattern.
 */
export async function accessPublicInvitationByToken(
  token: string,
  credentials?: AccessInvitationRequest
): Promise<AccessInvitationResponse> {
  if (credentials) {
    // For protected invitations with token, we need to pass credentials
    const response = await apiClient.post<AccessInvitationResponse>(
      `/api/v1/public/invitations/token/${token}/access`,
      credentials
    );
    return unwrapResponse(response, 'Failed to access invitation');
  }
  const response = await apiClient.get<AccessInvitationResponse>(
    `/api/v1/public/invitations/token/${token}`
  );
  return unwrapResponse(response, 'Failed to access invitation');
}

/**
 * Get public invitation by personal guest token.
 */
export async function getPersonalizedInvitation(
  personalToken: string
): Promise<PublicInvitation & { guestName: string; personalMessage?: string }> {
  const response = await apiClient.get<
    PublicInvitation & { guestName: string; personalMessage?: string }
  >(`/api/v1/public/invitations/guest/${personalToken}`);
  return unwrapResponse(response, 'Failed to get personalized invitation');
}

/**
 * Submit an RSVP response (public, no auth required).
 */
export async function submitPublicRSVP(
  slug: string,
  data: SubmitRSVPRequest
): Promise<RSVPSubmitResponse> {
  const response = await apiClient.post<RSVPSubmitResponse>(
    `/api/v1/public/invitations/${slug}/rsvp`,
    data
  );
  return unwrapResponse(response, 'Failed to submit RSVP');
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
  const response = await apiClient.get<TurnstileConfig>(
    '/api/v1/public/invitations/config/turnstile'
  );
  return unwrapResponse(response, 'Failed to get Turnstile config');
}

/**
 * Update an RSVP using edit token (public, no auth required).
 */
export async function updateRSVPByToken(
  editToken: string,
  data: UpdateRSVPRequest
): Promise<InvitationRSVP> {
  const response = await apiClient.patch<InvitationRSVP>(
    `/api/v1/public/rsvp/${editToken}`,
    data
  );
  return unwrapResponse(response, 'Failed to update RSVP');
}

/**
 * Get RSVP by edit token (to prefill form).
 */
export async function getRSVPByToken(
  editToken: string
): Promise<InvitationRSVP & { invitationTitle: string; eventDatetime: string }> {
  const response = await apiClient.get<
    InvitationRSVP & { invitationTitle: string; eventDatetime: string }
  >(`/api/v1/public/rsvp/${editToken}`);
  return unwrapResponse(response, 'Failed to get RSVP');
}

/**
 * Download ICS from public invitation.
 * Uses the /calendar endpoint for direct binary download.
 */
export async function downloadPublicICS(slug: string): Promise<void> {
  try {
    // Try direct binary download first (more efficient)
    const fetchResponse = await apiClient.fetchRaw(
      `/api/v1/public/invitations/${slug}/calendar`
    );

    if (!fetchResponse.ok) {
      throw new Error('Failed to download calendar');
    }

    const blob = await fetchResponse.blob();
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
      `/api/v1/public/invitations/${slug}/ics`
    );
    const data = unwrapResponse(response, 'Failed to get ICS data');

    const blob = new Blob([data.ics_content], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = data.filename;
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

/**
 * Download ICS from invitation using magic link token.
 * Used when invitation is accessed via /i/{token} route.
 */
export async function downloadPublicICSByToken(token: string): Promise<void> {
  try {
    const fetchResponse = await apiClient.fetchRaw(
      `/api/v1/public/invitations/token/${token}/calendar`
    );

    if (!fetchResponse.ok) {
      throw new Error('Failed to download calendar');
    }

    const blob = await fetchResponse.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invitation.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to download calendar:', error);
    throw error;
  }
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
  workspaceId: string,
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
  const fetchResponse = await apiClient.fetchRaw(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/qr${query ? `?${query}` : ''}`
  );

  if (!fetchResponse.ok) {
    throw new Error('Failed to download QR code');
  }

  return fetchResponse.blob();
}

/**
 * Get QR code URL for display (doesn't download, returns URL for img src).
 */
export function getInvitationQRUrl(
  workspaceId: string,
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

  return `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/qr?${queryParams.toString()}`;
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
  const response = await apiClient.post<{ draft_id: string; message: string }>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/drafts`,
    {
      draft_id: draftId || null,
      data,
    }
  );
  return unwrapResponse(response, 'Failed to save draft');
}

/**
 * List all drafts for the current user.
 */
export async function listDrafts(
  workspaceId: string
): Promise<{ data: InvitationDraft[]; total: number }> {
  const response = await apiClient.get<{ data: InvitationDraft[]; total: number }>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/drafts`
  );
  return unwrapResponse(response, 'Failed to list drafts');
}

/**
 * Get a specific draft by ID.
 */
export async function getDraft(
  workspaceId: string,
  draftId: string
): Promise<InvitationDraft> {
  const response = await apiClient.get<InvitationDraft>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/drafts/${draftId}`
  );
  return unwrapResponse(response, 'Failed to get draft');
}

/**
 * Delete a draft.
 */
export async function deleteDraft(
  workspaceId: string,
  draftId: string
): Promise<void> {
  const response = await apiClient.delete<void>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/drafts/${draftId}`
  );
  // For delete operations, we don't need to return data
  if (response.error) {
    throw new Error(response.error.message || 'Failed to delete draft');
  }
}

// ============================================================================
// AI Content (Phase 7)
// ============================================================================

export async function generateAIContent(
  workspaceId: string,
  request: GenerateContentRequest
): Promise<GenerateContentResponse> {
  const response = await apiClient.post<GenerateContentResponse>(
    `/api/v1/workspaces/${workspaceId}/digital-invitations/ai/generate`,
    request
  );
  return unwrapResponse(response, 'Failed to generate content');
}

// ============================================================================
// Export all functions as named exports (for tree-shaking)
// ============================================================================

// Also export as named constant for `import { invitationService }` syntax
export const invitationService = {
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
  accessPublicInvitationByToken,
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

  // AI
  generateAIContent,

  // Custom Fonts
  uploadCustomFont,
  listCustomFonts,
  deleteCustomFont,
  getCustomFont,
};

// ---------------------------------------------------------------------------
// Custom Font Types
// ---------------------------------------------------------------------------

export interface CustomFont {
  font_id: string;
  name: string;
  family: string;
  url: string;
  file_size: number;
  format: string;
  created_at: string;
  workspace_id: string;
}

export interface CustomFontListResponse {
  fonts: CustomFont[];
  total: number;
}

// ---------------------------------------------------------------------------
// Custom Font Functions
// ---------------------------------------------------------------------------

/**
 * Upload a custom font for invitations.
 * Feature: 019-invitation-indian-languages (Font Enhancement)
 */
export async function uploadCustomFont(
  workspaceId: string,
  file: File,
  name: string
): Promise<CustomFont> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name);

  const response = await apiClient.post<ApiResponse<CustomFont>>(
    `/workspaces/${workspaceId}/digital-invitations/fonts`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  if (!response.data?.data) {
    throw new Error('Failed to upload font');
  }
  return response.data.data;
}

/**
 * List all custom fonts for a workspace.
 */
export async function listCustomFonts(workspaceId: string): Promise<CustomFontListResponse> {
  const response = await apiClient.get<ApiResponse<CustomFontListResponse>>(
    `/workspaces/${workspaceId}/digital-invitations/fonts`
  );
  if (!response.data?.data) {
    return { fonts: [], total: 0 };
  }
  return response.data.data;
}

/**
 * Delete a custom font.
 */
export async function deleteCustomFont(workspaceId: string, fontId: string): Promise<void> {
  await apiClient.delete(`/workspaces/${workspaceId}/digital-invitations/fonts/${fontId}`);
}

/**
 * Get a specific custom font.
 */
export async function getCustomFont(workspaceId: string, fontId: string): Promise<CustomFont> {
  const response = await apiClient.get<ApiResponse<CustomFont>>(
    `/workspaces/${workspaceId}/digital-invitations/fonts/${fontId}`
  );
  if (!response.data?.data) {
    throw new Error('Font not found');
  }
  return response.data.data;
}

export default invitationService;
