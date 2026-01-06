/**
 * Compliance Service
 *
 * API client for the Audit & Compliance system operations including:
 * - Audit logs (list, search, export)
 * - Data Subject Requests (GDPR/CCPA/DPDP)
 * - Legal Holds
 * - Security Incidents
 * - Retention Policies
 *
 * @module complianceService
 */

import { apiClient } from './api';
import type {
  // Data Subject Request types
  DataSubjectRequest,
  DataSubjectRequestSummary,
  CreateDataSubjectRequestRequest,
  UpdateDataSubjectRequestRequest,
  ListDataSubjectRequestsQuery,
  DataSubjectRequestsListResponse,
  DSRStats,
  // Legal Hold types
  LegalHold,
  LegalHoldSummary,
  LegalHoldResource,
  CreateLegalHoldRequest,
  UpdateLegalHoldRequest,
  ListLegalHoldsQuery,
  LegalHoldsListResponse,
  LegalHoldStats,
  CustodianInfo,
  // Retention Policy types
  RetentionPolicy,
  RetentionPolicySummary,
  RetentionPolicyExecution,
  CreateRetentionPolicyRequest,
  UpdateRetentionPolicyRequest,
  ListRetentionPoliciesQuery,
  RetentionPoliciesListResponse,
  // Incident types
  Incident,
  IncidentSummary,
  IncidentUpdate,
  IncidentAffectedResource,
  CreateIncidentRequest,
  UpdateIncidentRequest,
  ListIncidentsQuery,
  IncidentsListResponse,
  IncidentStats,
  IncidentTeamMember,
  // Audit Log types
  AuditLogEntry,
  AuditLogSummary,
  AuditExport,
  ListAuditLogsQuery,
  CreateAuditExportRequest,
  AuditLogsListResponse,
  // Dashboard types
  ComplianceDashboardStats,
} from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// API Base Paths
// ---------------------------------------------------------------------------

const API_BASE = '/api/v1';

function workspacePath(workspaceId: string): string {
  return `${API_BASE}/workspaces/${workspaceId}`;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface MessageResponse {
  message: string;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Build query string from params object
 */
function buildQueryString<T extends object>(params: T): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      value.forEach((v) => searchParams.append(key, String(v)));
    } else if (value instanceof Date) {
      searchParams.append(key, value.toISOString());
    } else if (typeof value === 'boolean') {
      searchParams.append(key, value ? 'true' : 'false');
    } else {
      searchParams.append(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

// ---------------------------------------------------------------------------
// Audit Logs Service
// ---------------------------------------------------------------------------

/**
 * List audit logs with filtering and pagination
 */
export async function listAuditLogs(
  workspaceId: string,
  params: ListAuditLogsQuery = {}
): Promise<AuditLogsListResponse> {
  const query = buildQueryString(params);
  const response = await apiClient.get<AuditLogsListResponse>(
    `${workspacePath(workspaceId)}/audit-logs${query}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch audit logs');
  }

  return response.data!;
}

/**
 * Get a single audit log entry
 */
export async function getAuditLogEntry(
  workspaceId: string,
  eventId: string
): Promise<AuditLogEntry> {
  const response = await apiClient.get<AuditLogEntry>(
    `${workspacePath(workspaceId)}/audit-logs/${eventId}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch audit log entry');
  }

  return response.data!;
}

/**
 * Create an audit log export job
 */
export async function createAuditExport(
  workspaceId: string,
  data: CreateAuditExportRequest = {}
): Promise<AuditExport> {
  const response = await apiClient.post<AuditExport>(
    `${workspacePath(workspaceId)}/audit-logs/exports`,
    data
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to create audit export');
  }

  return response.data!;
}

/**
 * Get an audit export by ID
 */
export async function getAuditExport(
  workspaceId: string,
  exportId: string
): Promise<AuditExport> {
  const response = await apiClient.get<AuditExport>(
    `${workspacePath(workspaceId)}/audit-logs/exports/${exportId}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch audit export');
  }

  return response.data!;
}

/**
 * List all audit exports
 */
export async function listAuditExports(
  workspaceId: string,
  params: { page?: number; limit?: number } = {}
): Promise<{ data: AuditExport[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const query = buildQueryString(params);
  const response = await apiClient.get<{ data: AuditExport[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
    `${workspacePath(workspaceId)}/audit-logs/exports${query}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch audit exports');
  }

  return response.data!;
}

/**
 * Download an audit export file
 * Returns the download URL
 */
export async function getAuditExportDownloadUrl(
  workspaceId: string,
  exportId: string
): Promise<{ download_url: string; expires_at: string }> {
  const response = await apiClient.get<{ download_url: string; expires_at: string }>(
    `${workspacePath(workspaceId)}/audit-logs/exports/${exportId}/download`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to get export download URL');
  }

  return response.data!;
}

// ---------------------------------------------------------------------------
// Data Subject Requests Service
// ---------------------------------------------------------------------------

/**
 * List data subject requests with filtering and pagination
 */
export async function listDataSubjectRequests(
  workspaceId: string,
  params: ListDataSubjectRequestsQuery = {}
): Promise<DataSubjectRequestsListResponse> {
  const query = buildQueryString(params);
  const response = await apiClient.get<DataSubjectRequestsListResponse>(
    `${workspacePath(workspaceId)}/compliance/data-subject-requests${query}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch data subject requests');
  }

  return response.data!;
}

/**
 * Get a single data subject request
 */
export async function getDataSubjectRequest(
  workspaceId: string,
  requestId: string
): Promise<DataSubjectRequest> {
  const response = await apiClient.get<DataSubjectRequest>(
    `${workspacePath(workspaceId)}/compliance/data-subject-requests/${requestId}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch data subject request');
  }

  return response.data!;
}

/**
 * Create a new data subject request
 */
export async function createDataSubjectRequest(
  workspaceId: string,
  data: CreateDataSubjectRequestRequest
): Promise<DataSubjectRequest> {
  const response = await apiClient.post<DataSubjectRequest>(
    `${workspacePath(workspaceId)}/compliance/data-subject-requests`,
    data
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to create data subject request');
  }

  return response.data!;
}

/**
 * Update a data subject request
 */
export async function updateDataSubjectRequest(
  workspaceId: string,
  requestId: string,
  data: UpdateDataSubjectRequestRequest
): Promise<DataSubjectRequest> {
  const response = await apiClient.patch<DataSubjectRequest>(
    `${workspacePath(workspaceId)}/compliance/data-subject-requests/${requestId}`,
    data
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to update data subject request');
  }

  return response.data!;
}

/**
 * Acknowledge a data subject request
 */
export async function acknowledgeDataSubjectRequest(
  workspaceId: string,
  requestId: string
): Promise<DataSubjectRequest> {
  const response = await apiClient.post<DataSubjectRequest>(
    `${workspacePath(workspaceId)}/compliance/data-subject-requests/${requestId}/acknowledge`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to acknowledge data subject request');
  }

  return response.data!;
}

/**
 * Start processing a data subject request
 */
export async function startProcessingDataSubjectRequest(
  workspaceId: string,
  requestId: string
): Promise<DataSubjectRequest> {
  const response = await apiClient.post<DataSubjectRequest>(
    `${workspacePath(workspaceId)}/compliance/data-subject-requests/${requestId}/process`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to start processing data subject request');
  }

  return response.data!;
}

/**
 * Complete a data subject request
 */
export async function completeDataSubjectRequest(
  workspaceId: string,
  requestId: string,
  notes?: string
): Promise<DataSubjectRequest> {
  const response = await apiClient.post<DataSubjectRequest>(
    `${workspacePath(workspaceId)}/compliance/data-subject-requests/${requestId}/complete`,
    notes ? { notes } : undefined
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to complete data subject request');
  }

  return response.data!;
}

/**
 * Reject a data subject request
 */
export async function rejectDataSubjectRequest(
  workspaceId: string,
  requestId: string,
  reason: string
): Promise<DataSubjectRequest> {
  const response = await apiClient.post<DataSubjectRequest>(
    `${workspacePath(workspaceId)}/compliance/data-subject-requests/${requestId}/reject`,
    { reason }
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to reject data subject request');
  }

  return response.data!;
}

/**
 * Cancel a data subject request
 */
export async function cancelDataSubjectRequest(
  workspaceId: string,
  requestId: string,
  reason?: string
): Promise<DataSubjectRequest> {
  const response = await apiClient.post<DataSubjectRequest>(
    `${workspacePath(workspaceId)}/compliance/data-subject-requests/${requestId}/cancel`,
    reason ? { reason } : undefined
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to cancel data subject request');
  }

  return response.data!;
}

/**
 * Extend the deadline of a data subject request
 */
export async function extendDataSubjectRequestDeadline(
  workspaceId: string,
  requestId: string,
  extensionDays: number,
  reason: string
): Promise<DataSubjectRequest> {
  const response = await apiClient.post<DataSubjectRequest>(
    `${workspacePath(workspaceId)}/compliance/data-subject-requests/${requestId}/extend`,
    { extension_days: extensionDays, reason }
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to extend data subject request deadline');
  }

  return response.data!;
}

/**
 * Verify the identity of a data subject
 */
export async function verifyDataSubjectIdentity(
  workspaceId: string,
  requestId: string,
  verificationMethod: string
): Promise<DataSubjectRequest> {
  const response = await apiClient.post<DataSubjectRequest>(
    `${workspacePath(workspaceId)}/compliance/data-subject-requests/${requestId}/verify`,
    { verification_method: verificationMethod }
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to verify data subject identity');
  }

  return response.data!;
}

/**
 * Assign a data subject request to a user
 */
export async function assignDataSubjectRequest(
  workspaceId: string,
  requestId: string,
  assigneeUserId: string
): Promise<DataSubjectRequest> {
  const response = await apiClient.post<DataSubjectRequest>(
    `${workspacePath(workspaceId)}/compliance/data-subject-requests/${requestId}/assign`,
    { assignee_user_id: assigneeUserId }
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to assign data subject request');
  }

  return response.data!;
}

/**
 * Get data subject request statistics
 */
export async function getDataSubjectRequestStats(
  workspaceId: string
): Promise<DSRStats> {
  const response = await apiClient.get<DSRStats>(
    `${workspacePath(workspaceId)}/compliance/data-subject-requests/stats`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch DSR statistics');
  }

  return response.data!;
}

/**
 * Download the data export for an access request
 */
export async function getDataSubjectRequestExportUrl(
  workspaceId: string,
  requestId: string
): Promise<{ download_url: string; expires_at: string }> {
  const response = await apiClient.get<{ download_url: string; expires_at: string }>(
    `${workspacePath(workspaceId)}/compliance/data-subject-requests/${requestId}/export`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to get data export URL');
  }

  return response.data!;
}

// ---------------------------------------------------------------------------
// Legal Holds Service
// ---------------------------------------------------------------------------

/**
 * List legal holds with filtering and pagination
 */
export async function listLegalHolds(
  workspaceId: string,
  params: ListLegalHoldsQuery = {}
): Promise<LegalHoldsListResponse> {
  const query = buildQueryString(params);
  const response = await apiClient.get<LegalHoldsListResponse>(
    `${workspacePath(workspaceId)}/legal-holds${query}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch legal holds');
  }

  return response.data!;
}

/**
 * Get a single legal hold
 */
export async function getLegalHold(
  workspaceId: string,
  holdId: string
): Promise<LegalHold> {
  const response = await apiClient.get<LegalHold>(
    `${workspacePath(workspaceId)}/legal-holds/${holdId}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch legal hold');
  }

  return response.data!;
}

/**
 * Create a new legal hold
 */
export async function createLegalHold(
  workspaceId: string,
  data: CreateLegalHoldRequest
): Promise<LegalHold> {
  const response = await apiClient.post<LegalHold>(
    `${workspacePath(workspaceId)}/legal-holds`,
    data
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to create legal hold');
  }

  return response.data!;
}

/**
 * Update a legal hold
 */
export async function updateLegalHold(
  workspaceId: string,
  holdId: string,
  data: UpdateLegalHoldRequest
): Promise<LegalHold> {
  const response = await apiClient.patch<LegalHold>(
    `${workspacePath(workspaceId)}/legal-holds/${holdId}`,
    data
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to update legal hold');
  }

  return response.data!;
}

/**
 * Activate a legal hold
 */
export async function activateLegalHold(
  workspaceId: string,
  holdId: string
): Promise<LegalHold> {
  const response = await apiClient.post<LegalHold>(
    `${workspacePath(workspaceId)}/legal-holds/${holdId}/activate`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to activate legal hold');
  }

  return response.data!;
}

/**
 * Suspend a legal hold
 */
export async function suspendLegalHold(
  workspaceId: string,
  holdId: string,
  reason?: string
): Promise<LegalHold> {
  const response = await apiClient.post<LegalHold>(
    `${workspacePath(workspaceId)}/legal-holds/${holdId}/suspend`,
    reason ? { reason } : undefined
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to suspend legal hold');
  }

  return response.data!;
}

/**
 * Release a legal hold
 */
export async function releaseLegalHold(
  workspaceId: string,
  holdId: string,
  reason: string
): Promise<LegalHold> {
  const response = await apiClient.post<LegalHold>(
    `${workspacePath(workspaceId)}/legal-holds/${holdId}/release`,
    { reason }
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to release legal hold');
  }

  return response.data!;
}

/**
 * Get resources under a legal hold
 */
export async function getLegalHoldResources(
  workspaceId: string,
  holdId: string,
  params: { page?: number; limit?: number } = {}
): Promise<{ data: LegalHoldResource[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const query = buildQueryString(params);
  const response = await apiClient.get<{ data: LegalHoldResource[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
    `${workspacePath(workspaceId)}/legal-holds/${holdId}/resources${query}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch legal hold resources');
  }

  return response.data!;
}

/**
 * Add a resource to a legal hold
 */
export async function addResourceToLegalHold(
  workspaceId: string,
  holdId: string,
  resourceType: string,
  resourceId: string
): Promise<LegalHoldResource> {
  const response = await apiClient.post<LegalHoldResource>(
    `${workspacePath(workspaceId)}/legal-holds/${holdId}/resources`,
    { resource_type: resourceType, resource_id: resourceId }
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to add resource to legal hold');
  }

  return response.data!;
}

/**
 * Remove a resource from a legal hold
 */
export async function removeResourceFromLegalHold(
  workspaceId: string,
  holdId: string,
  resourceId: string
): Promise<MessageResponse> {
  const response = await apiClient.delete<MessageResponse>(
    `${workspacePath(workspaceId)}/legal-holds/${holdId}/resources/${resourceId}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to remove resource from legal hold');
  }

  return response.data!;
}

/**
 * Get custodians for a legal hold
 */
export async function getLegalHoldCustodians(
  workspaceId: string,
  holdId: string
): Promise<{ custodians: CustodianInfo[] }> {
  const response = await apiClient.get<{ custodians: CustodianInfo[] }>(
    `${workspacePath(workspaceId)}/legal-holds/${holdId}/custodians`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch legal hold custodians');
  }

  return response.data!;
}

/**
 * Add a custodian to a legal hold
 */
export async function addCustodianToLegalHold(
  workspaceId: string,
  holdId: string,
  custodian: CustodianInfo
): Promise<CustodianInfo> {
  const response = await apiClient.post<CustodianInfo>(
    `${workspacePath(workspaceId)}/legal-holds/${holdId}/custodians`,
    custodian
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to add custodian to legal hold');
  }

  return response.data!;
}

/**
 * Remove a custodian from a legal hold
 */
export async function removeCustodianFromLegalHold(
  workspaceId: string,
  holdId: string,
  userId: string
): Promise<MessageResponse> {
  const response = await apiClient.delete<MessageResponse>(
    `${workspacePath(workspaceId)}/legal-holds/${holdId}/custodians/${userId}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to remove custodian from legal hold');
  }

  return response.data!;
}

/**
 * Check if a resource is blocked by a legal hold
 */
export async function checkLegalHoldBlock(
  workspaceId: string,
  resourceType: string,
  resourceId: string
): Promise<{ is_blocked: boolean; blocking_holds: LegalHoldSummary[] }> {
  const query = buildQueryString({ resource_type: resourceType, resource_id: resourceId });
  const response = await apiClient.get<{ is_blocked: boolean; blocking_holds: LegalHoldSummary[] }>(
    `${workspacePath(workspaceId)}/legal-holds/check${query}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to check legal hold block');
  }

  return response.data!;
}

/**
 * Get legal hold statistics
 */
export async function getLegalHoldStats(
  workspaceId: string
): Promise<LegalHoldStats> {
  const response = await apiClient.get<LegalHoldStats>(
    `${workspacePath(workspaceId)}/legal-holds/stats`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch legal hold statistics');
  }

  return response.data!;
}

// ---------------------------------------------------------------------------
// Incidents Service
// ---------------------------------------------------------------------------

/**
 * List incidents with filtering and pagination
 */
export async function listIncidents(
  workspaceId: string,
  params: ListIncidentsQuery = {}
): Promise<IncidentsListResponse> {
  const query = buildQueryString(params);
  const response = await apiClient.get<IncidentsListResponse>(
    `${workspacePath(workspaceId)}/incidents${query}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch incidents');
  }

  return response.data!;
}

/**
 * Get a single incident
 */
export async function getIncident(
  workspaceId: string,
  incidentId: string
): Promise<Incident> {
  const response = await apiClient.get<Incident>(
    `${workspacePath(workspaceId)}/incidents/${incidentId}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch incident');
  }

  return response.data!;
}

/**
 * Create a new incident
 */
export async function createIncident(
  workspaceId: string,
  data: CreateIncidentRequest
): Promise<Incident> {
  const response = await apiClient.post<Incident>(
    `${workspacePath(workspaceId)}/incidents`,
    data
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to create incident');
  }

  return response.data!;
}

/**
 * Update an incident
 */
export async function updateIncident(
  workspaceId: string,
  incidentId: string,
  data: UpdateIncidentRequest
): Promise<Incident> {
  const response = await apiClient.patch<Incident>(
    `${workspacePath(workspaceId)}/incidents/${incidentId}`,
    data
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to update incident');
  }

  return response.data!;
}

/**
 * Confirm an incident
 */
export async function confirmIncident(
  workspaceId: string,
  incidentId: string
): Promise<Incident> {
  const response = await apiClient.post<Incident>(
    `${workspacePath(workspaceId)}/incidents/${incidentId}/confirm`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to confirm incident');
  }

  return response.data!;
}

/**
 * Start investigating an incident
 */
export async function startIncidentInvestigation(
  workspaceId: string,
  incidentId: string
): Promise<Incident> {
  const response = await apiClient.post<Incident>(
    `${workspacePath(workspaceId)}/incidents/${incidentId}/investigate`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to start incident investigation');
  }

  return response.data!;
}

/**
 * Contain an incident
 */
export async function containIncident(
  workspaceId: string,
  incidentId: string,
  containmentActions?: string[]
): Promise<Incident> {
  const response = await apiClient.post<Incident>(
    `${workspacePath(workspaceId)}/incidents/${incidentId}/contain`,
    containmentActions ? { containment_actions: containmentActions } : undefined
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to contain incident');
  }

  return response.data!;
}

/**
 * Mark incident as contained
 */
export async function markIncidentContained(
  workspaceId: string,
  incidentId: string
): Promise<Incident> {
  const response = await apiClient.post<Incident>(
    `${workspacePath(workspaceId)}/incidents/${incidentId}/contained`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to mark incident as contained');
  }

  return response.data!;
}

/**
 * Resolve an incident
 */
export async function resolveIncident(
  workspaceId: string,
  incidentId: string,
  resolutionSummary: string,
  resolutionType?: string
): Promise<Incident> {
  const response = await apiClient.post<Incident>(
    `${workspacePath(workspaceId)}/incidents/${incidentId}/resolve`,
    { resolution_summary: resolutionSummary, resolution_type: resolutionType }
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to resolve incident');
  }

  return response.data!;
}

/**
 * Close an incident
 */
export async function closeIncident(
  workspaceId: string,
  incidentId: string,
  lessonsLearned?: string
): Promise<Incident> {
  const response = await apiClient.post<Incident>(
    `${workspacePath(workspaceId)}/incidents/${incidentId}/close`,
    lessonsLearned ? { lessons_learned: lessonsLearned } : undefined
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to close incident');
  }

  return response.data!;
}

/**
 * Add a timeline update to an incident
 */
export async function addIncidentUpdate(
  workspaceId: string,
  incidentId: string,
  content: string,
  updateType?: string,
  isPublic?: boolean
): Promise<IncidentUpdate> {
  const response = await apiClient.post<IncidentUpdate>(
    `${workspacePath(workspaceId)}/incidents/${incidentId}/updates`,
    { content, update_type: updateType, is_public: isPublic }
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to add incident update');
  }

  return response.data!;
}

/**
 * Get incident updates/timeline
 */
export async function getIncidentUpdates(
  workspaceId: string,
  incidentId: string,
  params: { page?: number; limit?: number } = {}
): Promise<{ data: IncidentUpdate[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const query = buildQueryString(params);
  const response = await apiClient.get<{ data: IncidentUpdate[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
    `${workspacePath(workspaceId)}/incidents/${incidentId}/updates${query}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch incident updates');
  }

  return response.data!;
}

/**
 * Get incident team members
 */
export async function getIncidentTeam(
  workspaceId: string,
  incidentId: string
): Promise<{ team_members: IncidentTeamMember[] }> {
  const response = await apiClient.get<{ team_members: IncidentTeamMember[] }>(
    `${workspacePath(workspaceId)}/incidents/${incidentId}/team`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch incident team');
  }

  return response.data!;
}

/**
 * Add a team member to an incident
 */
export async function addIncidentTeamMember(
  workspaceId: string,
  incidentId: string,
  userId: string,
  role: string
): Promise<IncidentTeamMember> {
  const response = await apiClient.post<IncidentTeamMember>(
    `${workspacePath(workspaceId)}/incidents/${incidentId}/team`,
    { user_id: userId, role }
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to add incident team member');
  }

  return response.data!;
}

/**
 * Remove a team member from an incident
 */
export async function removeIncidentTeamMember(
  workspaceId: string,
  incidentId: string,
  userId: string
): Promise<MessageResponse> {
  const response = await apiClient.delete<MessageResponse>(
    `${workspacePath(workspaceId)}/incidents/${incidentId}/team/${userId}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to remove incident team member');
  }

  return response.data!;
}

/**
 * Get affected resources for an incident
 */
export async function getIncidentAffectedResources(
  workspaceId: string,
  incidentId: string,
  params: { page?: number; limit?: number } = {}
): Promise<{ data: IncidentAffectedResource[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const query = buildQueryString(params);
  const response = await apiClient.get<{ data: IncidentAffectedResource[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
    `${workspacePath(workspaceId)}/incidents/${incidentId}/resources${query}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch incident affected resources');
  }

  return response.data!;
}

/**
 * Add an affected resource to an incident
 */
export async function addIncidentAffectedResource(
  workspaceId: string,
  incidentId: string,
  resource: {
    resource_type: string;
    resource_id: string;
    resource_name?: string;
    impact_type: string;
    impact_description?: string;
    contains_pii?: boolean;
    contains_sensitive_data?: boolean;
  }
): Promise<IncidentAffectedResource> {
  const response = await apiClient.post<IncidentAffectedResource>(
    `${workspacePath(workspaceId)}/incidents/${incidentId}/resources`,
    resource
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to add affected resource');
  }

  return response.data!;
}

/**
 * Get incident statistics
 */
export async function getIncidentStats(
  workspaceId: string
): Promise<IncidentStats> {
  const response = await apiClient.get<IncidentStats>(
    `${workspacePath(workspaceId)}/incidents/stats`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch incident statistics');
  }

  return response.data!;
}

// ---------------------------------------------------------------------------
// Retention Policies Service
// ---------------------------------------------------------------------------

/**
 * List retention policies with filtering and pagination
 */
export async function listRetentionPolicies(
  workspaceId: string,
  params: ListRetentionPoliciesQuery = {}
): Promise<RetentionPoliciesListResponse> {
  const query = buildQueryString(params);
  const response = await apiClient.get<RetentionPoliciesListResponse>(
    `${workspacePath(workspaceId)}/compliance/retention-policies${query}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch retention policies');
  }

  return response.data!;
}

/**
 * Get a single retention policy
 */
export async function getRetentionPolicy(
  workspaceId: string,
  policyId: string
): Promise<RetentionPolicy> {
  const response = await apiClient.get<RetentionPolicy>(
    `${workspacePath(workspaceId)}/compliance/retention-policies/${policyId}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch retention policy');
  }

  return response.data!;
}

/**
 * Create a new retention policy
 */
export async function createRetentionPolicy(
  workspaceId: string,
  data: CreateRetentionPolicyRequest
): Promise<RetentionPolicy> {
  const response = await apiClient.post<RetentionPolicy>(
    `${workspacePath(workspaceId)}/compliance/retention-policies`,
    data
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to create retention policy');
  }

  return response.data!;
}

/**
 * Update a retention policy
 */
export async function updateRetentionPolicy(
  workspaceId: string,
  policyId: string,
  data: UpdateRetentionPolicyRequest
): Promise<RetentionPolicy> {
  const response = await apiClient.patch<RetentionPolicy>(
    `${workspacePath(workspaceId)}/compliance/retention-policies/${policyId}`,
    data
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to update retention policy');
  }

  return response.data!;
}

/**
 * Activate a retention policy
 */
export async function activateRetentionPolicy(
  workspaceId: string,
  policyId: string
): Promise<RetentionPolicy> {
  const response = await apiClient.post<RetentionPolicy>(
    `${workspacePath(workspaceId)}/compliance/retention-policies/${policyId}/activate`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to activate retention policy');
  }

  return response.data!;
}

/**
 * Pause a retention policy
 */
export async function pauseRetentionPolicy(
  workspaceId: string,
  policyId: string,
  reason?: string
): Promise<RetentionPolicy> {
  const response = await apiClient.post<RetentionPolicy>(
    `${workspacePath(workspaceId)}/compliance/retention-policies/${policyId}/pause`,
    reason ? { reason } : undefined
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to pause retention policy');
  }

  return response.data!;
}

/**
 * Retire a retention policy
 */
export async function retireRetentionPolicy(
  workspaceId: string,
  policyId: string,
  reason: string
): Promise<RetentionPolicy> {
  const response = await apiClient.post<RetentionPolicy>(
    `${workspacePath(workspaceId)}/compliance/retention-policies/${policyId}/retire`,
    { reason }
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to retire retention policy');
  }

  return response.data!;
}

/**
 * Trigger a retention policy execution
 */
export async function executeRetentionPolicy(
  workspaceId: string,
  policyId: string,
  dryRun: boolean = true
): Promise<RetentionPolicyExecution> {
  const response = await apiClient.post<RetentionPolicyExecution>(
    `${workspacePath(workspaceId)}/compliance/retention-policies/${policyId}/execute`,
    { dry_run: dryRun }
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to execute retention policy');
  }

  return response.data!;
}

/**
 * Get retention policy executions
 */
export async function getRetentionPolicyExecutions(
  workspaceId: string,
  policyId: string,
  params: { page?: number; limit?: number } = {}
): Promise<{ data: RetentionPolicyExecution[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const query = buildQueryString(params);
  const response = await apiClient.get<{ data: RetentionPolicyExecution[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
    `${workspacePath(workspaceId)}/compliance/retention-policies/${policyId}/executions${query}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch retention policy executions');
  }

  return response.data!;
}

/**
 * Get a single retention policy execution
 */
export async function getRetentionPolicyExecution(
  workspaceId: string,
  policyId: string,
  executionId: string
): Promise<RetentionPolicyExecution> {
  const response = await apiClient.get<RetentionPolicyExecution>(
    `${workspacePath(workspaceId)}/compliance/retention-policies/${policyId}/executions/${executionId}`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch retention policy execution');
  }

  return response.data!;
}

// ---------------------------------------------------------------------------
// Compliance Dashboard
// ---------------------------------------------------------------------------

/**
 * Get compliance dashboard statistics
 */
export async function getComplianceDashboard(
  workspaceId: string
): Promise<ComplianceDashboardStats> {
  const response = await apiClient.get<ComplianceDashboardStats>(
    `${workspacePath(workspaceId)}/compliance/dashboard`
  );

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch compliance dashboard');
  }

  return response.data!;
}

// ---------------------------------------------------------------------------
// Export service object
// ---------------------------------------------------------------------------

export const complianceService = {
  // Audit Logs
  listAuditLogs,
  getAuditLogEntry,
  createAuditExport,
  getAuditExport,
  listAuditExports,
  getAuditExportDownloadUrl,

  // Data Subject Requests
  listDataSubjectRequests,
  getDataSubjectRequest,
  createDataSubjectRequest,
  updateDataSubjectRequest,
  acknowledgeDataSubjectRequest,
  startProcessingDataSubjectRequest,
  completeDataSubjectRequest,
  rejectDataSubjectRequest,
  cancelDataSubjectRequest,
  extendDataSubjectRequestDeadline,
  verifyDataSubjectIdentity,
  assignDataSubjectRequest,
  getDataSubjectRequestStats,
  getDataSubjectRequestExportUrl,

  // Legal Holds
  listLegalHolds,
  getLegalHold,
  createLegalHold,
  updateLegalHold,
  activateLegalHold,
  suspendLegalHold,
  releaseLegalHold,
  getLegalHoldResources,
  addResourceToLegalHold,
  removeResourceFromLegalHold,
  getLegalHoldCustodians,
  addCustodianToLegalHold,
  removeCustodianFromLegalHold,
  checkLegalHoldBlock,
  getLegalHoldStats,

  // Incidents
  listIncidents,
  getIncident,
  createIncident,
  updateIncident,
  confirmIncident,
  startIncidentInvestigation,
  containIncident,
  markIncidentContained,
  resolveIncident,
  closeIncident,
  addIncidentUpdate,
  getIncidentUpdates,
  getIncidentTeam,
  addIncidentTeamMember,
  removeIncidentTeamMember,
  getIncidentAffectedResources,
  addIncidentAffectedResource,
  getIncidentStats,

  // Retention Policies
  listRetentionPolicies,
  getRetentionPolicy,
  createRetentionPolicy,
  updateRetentionPolicy,
  activateRetentionPolicy,
  pauseRetentionPolicy,
  retireRetentionPolicy,
  executeRetentionPolicy,
  getRetentionPolicyExecutions,
  getRetentionPolicyExecution,

  // Dashboard
  getComplianceDashboard,
};

export default complianceService;
