/**
 * Webhook Templates Service - API client for webhook integration templates and workflows.
 * Communicates with the webhooks-service microservice.
 */

import api from './api';
import { getStoredWorkspace } from './auth';
import type {
  TemplateCategory,
  IntegrationType,
  WorkflowExecutionStatus,
  WebhookTemplate,
  WebhookTemplateSummary,
  TemplateListResponse,
  TemplateCategoryStats,
  TemplateStatsResponse,
  TemplateFilterParams,
  WebhookWorkflow,
  WorkflowSummary,
  WorkflowListResponse,
  CreateWorkflowFromTemplateRequest,
  CreateCustomWorkflowRequest,
  UpdateWorkflowRequest,
  WorkflowExecution,
  WorkflowExecutionSummary,
  WorkflowExecutionListResponse,
  SaveWorkflowBuilderRequest,
  WorkflowValidationResult,
  WorkflowBuilderState,
} from '../types/webhooks';

// Base paths for templates and workflows API
const TEMPLATES_BASE = '/api/v1/webhooks/templates';
const WORKFLOWS_BASE = '/api/v1/webhooks/workflows';

// Helper to handle API response unwrapping
async function unwrap<T>(promise: Promise<{ data?: T; error?: any }>): Promise<T> {
  const response = await promise;
  if (response.error) {
    throw new Error(response.error.message || 'Request failed');
  }
  if (response.data === undefined) {
    throw new Error('No data received from API');
  }
  return response.data;
}

// Helper to get workspace ID header
function getWorkspaceHeader(): Record<string, string> {
  const workspace = getStoredWorkspace();
  if (workspace?.workspace_id) {
    return { 'X-Workspace-ID': workspace.workspace_id };
  }
  return {};
}

// =============================================================================
// Template Management
// =============================================================================

/**
 * List available webhook integration templates with optional filtering.
 */
export async function listTemplates(params?: {
  category?: TemplateCategory;
  integration_type?: IntegrationType;
  provider?: string;
  tags?: string[];
  search?: string;
  event_type?: string;
  featured_only?: boolean;
  page?: number;
  page_size?: number;
}): Promise<TemplateListResponse> {
  const searchParams = new URLSearchParams();

  if (params?.category) searchParams.set('category', params.category);
  if (params?.integration_type) searchParams.set('integration_type', params.integration_type);
  if (params?.provider) searchParams.set('provider', params.provider);
  if (params?.tags) {
    params.tags.forEach(tag => searchParams.append('tags', tag));
  }
  if (params?.search) searchParams.set('search', params.search);
  if (params?.event_type) searchParams.set('event_type', params.event_type);
  if (params?.featured_only) searchParams.set('featured_only', 'true');
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.page_size) searchParams.set('page_size', params.page_size.toString());

  const query = searchParams.toString();
  const url = `${TEMPLATES_BASE}${query ? `?${query}` : ''}`;
  return unwrap(api.get<TemplateListResponse>(url));
}

/**
 * Get featured integration templates.
 */
export async function getFeaturedTemplates(limit = 5): Promise<WebhookTemplateSummary[]> {
  return unwrap(api.get<WebhookTemplateSummary[]>(`${TEMPLATES_BASE}/featured?limit=${limit}`));
}

/**
 * Get all template categories with counts.
 */
export async function getTemplateCategories(): Promise<TemplateCategoryStats[]> {
  return unwrap(api.get<TemplateCategoryStats[]>(`${TEMPLATES_BASE}/categories`));
}

/**
 * Get overall template and workflow statistics for the workspace.
 */
export async function getTemplateStats(): Promise<TemplateStatsResponse> {
  return unwrap(api.get<TemplateStatsResponse>(`${TEMPLATES_BASE}/stats`, { headers: getWorkspaceHeader() }));
}

/**
 * Get a specific template by ID.
 */
export async function getTemplate(templateId: string): Promise<WebhookTemplate> {
  return unwrap(api.get<WebhookTemplate>(`${TEMPLATES_BASE}/${templateId}`, { headers: getWorkspaceHeader() }));
}

/**
 * Get a specific template by slug.
 */
export async function getTemplateBySlug(slug: string): Promise<WebhookTemplate> {
  return unwrap(api.get<WebhookTemplate>(`${TEMPLATES_BASE}/slug/${slug}`, { headers: getWorkspaceHeader() }));
}

/**
 * Rate a template (1-5 stars).
 */
export async function rateTemplate(
  templateId: string,
  rating: number,
  feedback?: string
): Promise<{ message: string }> {
  return unwrap(api.post<{ message: string }>(
    `${TEMPLATES_BASE}/${templateId}/rate`,
    { rating, feedback },
    { headers: getWorkspaceHeader() }
  ));
}

// =============================================================================
// Workflow Management
// =============================================================================

/**
 * List workflows for the current workspace.
 */
export async function listWorkflows(params?: {
  is_active?: boolean;
  template_id?: string;
  page?: number;
  page_size?: number;
}): Promise<WorkflowListResponse> {
  const searchParams = new URLSearchParams();

  if (params?.is_active !== undefined) searchParams.set('is_active', params.is_active.toString());
  if (params?.template_id) searchParams.set('template_id', params.template_id);
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.page_size) searchParams.set('page_size', params.page_size.toString());

  const query = searchParams.toString();
  const url = `${WORKFLOWS_BASE}${query ? `?${query}` : ''}`;
  return unwrap(api.get<WorkflowListResponse>(url, { headers: getWorkspaceHeader() }));
}

/**
 * Create a new workflow from a template.
 */
export async function createWorkflowFromTemplate(
  request: CreateWorkflowFromTemplateRequest
): Promise<WebhookWorkflow> {
  return unwrap(api.post<WebhookWorkflow>(
    `${WORKFLOWS_BASE}/from-template`,
    request,
    { headers: getWorkspaceHeader() }
  ));
}

/**
 * Create a custom workflow.
 */
export async function createCustomWorkflow(
  request: CreateCustomWorkflowRequest
): Promise<WebhookWorkflow> {
  return unwrap(api.post<WebhookWorkflow>(
    `${WORKFLOWS_BASE}/custom`,
    request,
    { headers: getWorkspaceHeader() }
  ));
}

/**
 * Create a workflow from the visual workflow builder.
 */
export async function createWorkflowFromBuilder(
  request: SaveWorkflowBuilderRequest
): Promise<WebhookWorkflow> {
  return unwrap(api.post<WebhookWorkflow>(
    `${WORKFLOWS_BASE}/from-builder`,
    request,
    { headers: getWorkspaceHeader() }
  ));
}

/**
 * Validate a workflow configuration from the visual builder.
 */
export async function validateWorkflow(
  builderState: WorkflowBuilderState
): Promise<WorkflowValidationResult> {
  return unwrap(api.post<WorkflowValidationResult>(
    `${WORKFLOWS_BASE}/validate`,
    { builder_state: builderState }
  ));
}

/**
 * Get a specific workflow by ID.
 */
export async function getWorkflow(workflowId: string): Promise<WebhookWorkflow> {
  return unwrap(api.get<WebhookWorkflow>(`${WORKFLOWS_BASE}/${workflowId}`, { headers: getWorkspaceHeader() }));
}

/**
 * Update a workflow.
 */
export async function updateWorkflow(
  workflowId: string,
  request: UpdateWorkflowRequest
): Promise<WebhookWorkflow> {
  return unwrap(api.patch<WebhookWorkflow>(
    `${WORKFLOWS_BASE}/${workflowId}`,
    request,
    { headers: getWorkspaceHeader() }
  ));
}

/**
 * Delete a workflow.
 */
export async function deleteWorkflow(workflowId: string): Promise<void> {
  await unwrap(api.delete<void>(`${WORKFLOWS_BASE}/${workflowId}`, undefined, { headers: getWorkspaceHeader() }));
}

/**
 * Toggle workflow active status.
 */
export async function toggleWorkflow(
  workflowId: string,
  isActive: boolean
): Promise<WebhookWorkflow> {
  return unwrap(api.post<WebhookWorkflow>(
    `${WORKFLOWS_BASE}/${workflowId}/toggle?is_active=${isActive}`,
    undefined,
    { headers: getWorkspaceHeader() }
  ));
}

// =============================================================================
// Workflow Execution Management
// =============================================================================

/**
 * List executions for a specific workflow.
 */
export async function listWorkflowExecutions(
  workflowId: string,
  params?: {
    status?: WorkflowExecutionStatus;
    page?: number;
    page_size?: number;
  }
): Promise<WorkflowExecutionListResponse> {
  const searchParams = new URLSearchParams();

  if (params?.status) searchParams.set('status', params.status);
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.page_size) searchParams.set('page_size', params.page_size.toString());

  const query = searchParams.toString();
  const url = `${WORKFLOWS_BASE}/${workflowId}/executions${query ? `?${query}` : ''}`;
  return unwrap(api.get<WorkflowExecutionListResponse>(url, { headers: getWorkspaceHeader() }));
}

/**
 * Get details of a specific workflow execution.
 */
export async function getWorkflowExecution(executionId: string): Promise<WorkflowExecution> {
  return unwrap(api.get<WorkflowExecution>(`${WORKFLOWS_BASE}/executions/${executionId}`, { headers: getWorkspaceHeader() }));
}

// =============================================================================
// Helper Functions for Template Categories
// =============================================================================

/**
 * Get templates filtered by category.
 */
export async function getTemplatesByCategory(
  category: TemplateCategory,
  page = 1,
  pageSize = 20
): Promise<TemplateListResponse> {
  return listTemplates({ category, page, page_size: pageSize });
}

/**
 * Get templates filtered by integration type.
 */
export async function getTemplatesByIntegrationType(
  integrationType: IntegrationType,
  page = 1,
  pageSize = 20
): Promise<TemplateListResponse> {
  return listTemplates({ integration_type: integrationType, page, page_size: pageSize });
}

/**
 * Search templates by name or description.
 */
export async function searchTemplates(
  search: string,
  page = 1,
  pageSize = 20
): Promise<TemplateListResponse> {
  return listTemplates({ search, page, page_size: pageSize });
}

/**
 * Get templates that trigger on a specific event type.
 */
export async function getTemplatesByEventType(
  eventType: string,
  page = 1,
  pageSize = 20
): Promise<TemplateListResponse> {
  return listTemplates({ event_type: eventType, page, page_size: pageSize });
}

// Export all functions as a service object
export const webhookTemplatesService = {
  // Templates
  listTemplates,
  getFeaturedTemplates,
  getTemplateCategories,
  getTemplateStats,
  getTemplate,
  getTemplateBySlug,
  rateTemplate,
  getTemplatesByCategory,
  getTemplatesByIntegrationType,
  searchTemplates,
  getTemplatesByEventType,
  // Workflows
  listWorkflows,
  createWorkflowFromTemplate,
  createCustomWorkflow,
  createWorkflowFromBuilder,
  validateWorkflow,
  getWorkflow,
  updateWorkflow,
  deleteWorkflow,
  toggleWorkflow,
  // Workflow Executions
  listWorkflowExecutions,
  getWorkflowExecution,
};

export default webhookTemplatesService;
