/**
 * React hooks for webhook integration templates and workflows.
 * Provides state management and API integration for templates UI.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { webhookTemplatesService } from '../services/webhookTemplatesService';
import type {
  TemplateCategory,
  IntegrationType,
  WorkflowExecutionStatus,
  WebhookTemplate,
  WebhookTemplateSummary,
  TemplateCategoryStats,
  TemplateStatsResponse,
  WebhookWorkflow,
  WorkflowSummary,
  CreateWorkflowFromTemplateRequest,
  CreateCustomWorkflowRequest,
  UpdateWorkflowRequest,
  WorkflowExecution,
  WorkflowExecutionSummary,
  WorkflowBuilderState,
  WorkflowValidationResult,
  SaveWorkflowBuilderRequest,
} from '../types/webhooks';

// =============================================================================
// useWebhookTemplates Hook - List and filter templates
// =============================================================================

interface UseWebhookTemplatesResult {
  templates: WebhookTemplateSummary[];
  loading: boolean;
  error: Error | null;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  setPage: (page: number) => void;
  setCategory: (category: TemplateCategory | undefined) => void;
  setIntegrationType: (type: IntegrationType | undefined) => void;
  setSearch: (search: string) => void;
  setEventType: (eventType: string | undefined) => void;
  setFeaturedOnly: (featured: boolean) => void;
  refresh: () => Promise<void>;
  filters: {
    category?: TemplateCategory;
    integration_type?: IntegrationType;
    search?: string;
    event_type?: string;
    featured_only?: boolean;
  };
}

export function useWebhookTemplates(options?: {
  pageSize?: number;
  initialCategory?: TemplateCategory;
  initialIntegrationType?: IntegrationType;
  featuredOnly?: boolean;
}): UseWebhookTemplatesResult {
  const [templates, setTemplates] = useState<WebhookTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: options?.pageSize || 12,
    totalPages: 0,
  });
  const [filters, setFilters] = useState<{
    category?: TemplateCategory;
    integration_type?: IntegrationType;
    search?: string;
    event_type?: string;
    featured_only?: boolean;
  }>({
    category: options?.initialCategory,
    integration_type: options?.initialIntegrationType,
    featured_only: options?.featuredOnly,
  });

  const fetchTemplates = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const response = await webhookTemplatesService.listTemplates({
        ...filters,
        page,
        page_size: pagination.pageSize,
      });
      setTemplates(response.templates);
      setPagination({
        total: response.total,
        page: response.page,
        pageSize: response.page_size,
        totalPages: response.total_pages,
      });
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, filters]);

  useEffect(() => {
    fetchTemplates(pagination.page);
  }, [fetchTemplates, pagination.page]);

  const setPage = (page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  const setCategory = (category: TemplateCategory | undefined) => {
    setFilters((prev) => ({ ...prev, category }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const setIntegrationType = (type: IntegrationType | undefined) => {
    setFilters((prev) => ({ ...prev, integration_type: type }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const setSearch = (search: string) => {
    setFilters((prev) => ({ ...prev, search: search || undefined }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const setEventType = (eventType: string | undefined) => {
    setFilters((prev) => ({ ...prev, event_type: eventType }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const setFeaturedOnly = (featured: boolean) => {
    setFilters((prev) => ({ ...prev, featured_only: featured || undefined }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  return {
    templates,
    loading,
    error,
    total: pagination.total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: pagination.totalPages,
    setPage,
    setCategory,
    setIntegrationType,
    setSearch,
    setEventType,
    setFeaturedOnly,
    refresh: () => fetchTemplates(pagination.page),
    filters,
  };
}

// =============================================================================
// useWebhookTemplate Hook - Single template details
// =============================================================================

interface UseWebhookTemplateResult {
  template: WebhookTemplate | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  rate: (rating: number, feedback?: string) => Promise<void>;
}

export function useWebhookTemplate(templateId: string | null): UseWebhookTemplateResult {
  const [template, setTemplate] = useState<WebhookTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTemplate = useCallback(async () => {
    if (!templateId) {
      setTemplate(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await webhookTemplatesService.getTemplate(templateId);
      setTemplate(data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  const rate = async (rating: number, feedback?: string) => {
    if (!templateId) return;
    await webhookTemplatesService.rateTemplate(templateId, rating, feedback);
    await fetchTemplate(); // Refresh to get updated rating
  };

  return {
    template,
    loading,
    error,
    refresh: fetchTemplate,
    rate,
  };
}

// =============================================================================
// useFeaturedTemplates Hook - Featured templates for quick access
// =============================================================================

interface UseFeaturedTemplatesResult {
  templates: WebhookTemplateSummary[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useFeaturedTemplates(limit = 5): UseFeaturedTemplatesResult {
  const [templates, setTemplates] = useState<WebhookTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchFeatured = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await webhookTemplatesService.getFeaturedTemplates(limit);
      setTemplates(data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchFeatured();
  }, [fetchFeatured]);

  return {
    templates,
    loading,
    error,
    refresh: fetchFeatured,
  };
}

// =============================================================================
// useTemplateCategories Hook - Template categories with counts
// =============================================================================

interface UseTemplateCategoriesResult {
  categories: TemplateCategoryStats[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useTemplateCategories(): UseTemplateCategoriesResult {
  const [categories, setCategories] = useState<TemplateCategoryStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await webhookTemplatesService.getTemplateCategories();
      setCategories(data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    loading,
    error,
    refresh: fetchCategories,
  };
}

// =============================================================================
// useTemplateStats Hook - Overall template and workflow statistics
// =============================================================================

interface UseTemplateStatsResult {
  stats: TemplateStatsResponse | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useTemplateStats(): UseTemplateStatsResult {
  const [stats, setStats] = useState<TemplateStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await webhookTemplatesService.getTemplateStats();
      setStats(data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refresh: fetchStats,
  };
}

// =============================================================================
// useWebhookWorkflows Hook - List and manage workflows
// =============================================================================

interface UseWebhookWorkflowsResult {
  workflows: WorkflowSummary[];
  loading: boolean;
  error: Error | null;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  setPage: (page: number) => void;
  setActiveFilter: (isActive: boolean | undefined) => void;
  setTemplateFilter: (templateId: string | undefined) => void;
  refresh: () => Promise<void>;
  createFromTemplate: (request: CreateWorkflowFromTemplateRequest) => Promise<WebhookWorkflow>;
  createCustom: (request: CreateCustomWorkflowRequest) => Promise<WebhookWorkflow>;
  deleteWorkflow: (workflowId: string) => Promise<void>;
  toggleWorkflow: (workflowId: string, isActive: boolean) => Promise<WebhookWorkflow>;
}

export function useWebhookWorkflows(options?: {
  pageSize?: number;
  initialActiveFilter?: boolean;
  templateId?: string;
}): UseWebhookWorkflowsResult {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: options?.pageSize || 10,
    totalPages: 0,
  });
  const [filters, setFilters] = useState<{
    is_active?: boolean;
    template_id?: string;
  }>({
    is_active: options?.initialActiveFilter,
    template_id: options?.templateId,
  });

  const fetchWorkflows = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const response = await webhookTemplatesService.listWorkflows({
        ...filters,
        page,
        page_size: pagination.pageSize,
      });
      setWorkflows(response.workflows);
      setPagination({
        total: response.total,
        page: response.page,
        pageSize: response.page_size,
        totalPages: response.total_pages,
      });
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, filters]);

  useEffect(() => {
    fetchWorkflows(pagination.page);
  }, [fetchWorkflows, pagination.page]);

  const setPage = (page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  const setActiveFilter = (isActive: boolean | undefined) => {
    setFilters((prev) => ({ ...prev, is_active: isActive }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const setTemplateFilter = (templateId: string | undefined) => {
    setFilters((prev) => ({ ...prev, template_id: templateId }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const createFromTemplate = async (request: CreateWorkflowFromTemplateRequest) => {
    const workflow = await webhookTemplatesService.createWorkflowFromTemplate(request);
    await fetchWorkflows(pagination.page);
    return workflow;
  };

  const createCustom = async (request: CreateCustomWorkflowRequest) => {
    const workflow = await webhookTemplatesService.createCustomWorkflow(request);
    await fetchWorkflows(pagination.page);
    return workflow;
  };

  const deleteWorkflowHandler = async (workflowId: string) => {
    await webhookTemplatesService.deleteWorkflow(workflowId);
    await fetchWorkflows(pagination.page);
  };

  const toggleWorkflowHandler = async (workflowId: string, isActive: boolean) => {
    const workflow = await webhookTemplatesService.toggleWorkflow(workflowId, isActive);
    setWorkflows((prev) =>
      prev.map((w) =>
        w.workflow_id === workflowId ? { ...w, is_active: isActive } : w
      )
    );
    return workflow;
  };

  return {
    workflows,
    loading,
    error,
    total: pagination.total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: pagination.totalPages,
    setPage,
    setActiveFilter,
    setTemplateFilter,
    refresh: () => fetchWorkflows(pagination.page),
    createFromTemplate,
    createCustom,
    deleteWorkflow: deleteWorkflowHandler,
    toggleWorkflow: toggleWorkflowHandler,
  };
}

// =============================================================================
// useWebhookWorkflow Hook - Single workflow details
// =============================================================================

interface UseWebhookWorkflowResult {
  workflow: WebhookWorkflow | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  update: (request: UpdateWorkflowRequest) => Promise<WebhookWorkflow>;
  toggle: (isActive: boolean) => Promise<WebhookWorkflow>;
  remove: () => Promise<void>;
}

export function useWebhookWorkflow(workflowId: string | null): UseWebhookWorkflowResult {
  const [workflow, setWorkflow] = useState<WebhookWorkflow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchWorkflow = useCallback(async () => {
    if (!workflowId) {
      setWorkflow(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await webhookTemplatesService.getWorkflow(workflowId);
      setWorkflow(data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  const update = async (request: UpdateWorkflowRequest) => {
    if (!workflowId) throw new Error('No workflow ID');
    const updated = await webhookTemplatesService.updateWorkflow(workflowId, request);
    setWorkflow(updated);
    return updated;
  };

  const toggle = async (isActive: boolean) => {
    if (!workflowId) throw new Error('No workflow ID');
    const updated = await webhookTemplatesService.toggleWorkflow(workflowId, isActive);
    setWorkflow(updated);
    return updated;
  };

  const remove = async () => {
    if (!workflowId) throw new Error('No workflow ID');
    await webhookTemplatesService.deleteWorkflow(workflowId);
    setWorkflow(null);
  };

  return {
    workflow,
    loading,
    error,
    refresh: fetchWorkflow,
    update,
    toggle,
    remove,
  };
}

// =============================================================================
// useWorkflowExecutions Hook - Workflow execution history
// =============================================================================

interface UseWorkflowExecutionsResult {
  executions: WorkflowExecutionSummary[];
  loading: boolean;
  error: Error | null;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  setPage: (page: number) => void;
  setStatusFilter: (status: WorkflowExecutionStatus | undefined) => void;
  refresh: () => Promise<void>;
}

export function useWorkflowExecutions(
  workflowId: string | null,
  options?: { pageSize?: number }
): UseWorkflowExecutionsResult {
  const [executions, setExecutions] = useState<WorkflowExecutionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: options?.pageSize || 10,
    totalPages: 0,
  });
  const [statusFilter, setStatusFilter] = useState<WorkflowExecutionStatus | undefined>();

  const fetchExecutions = useCallback(async (page = 1) => {
    if (!workflowId) {
      setExecutions([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const response = await webhookTemplatesService.listWorkflowExecutions(workflowId, {
        status: statusFilter,
        page,
        page_size: pagination.pageSize,
      });
      setExecutions(response.executions);
      setPagination({
        total: response.total,
        page: response.page,
        pageSize: response.page_size,
        totalPages: response.total_pages,
      });
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [workflowId, pagination.pageSize, statusFilter]);

  useEffect(() => {
    fetchExecutions(pagination.page);
  }, [fetchExecutions, pagination.page]);

  const setPage = (page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  const setStatus = (status: WorkflowExecutionStatus | undefined) => {
    setStatusFilter(status);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  return {
    executions,
    loading,
    error,
    total: pagination.total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: pagination.totalPages,
    setPage,
    setStatusFilter: setStatus,
    refresh: () => fetchExecutions(pagination.page),
  };
}

// =============================================================================
// useWorkflowExecution Hook - Single execution details
// =============================================================================

interface UseWorkflowExecutionResult {
  execution: WorkflowExecution | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useWorkflowExecution(executionId: string | null): UseWorkflowExecutionResult {
  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchExecution = useCallback(async () => {
    if (!executionId) {
      setExecution(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await webhookTemplatesService.getWorkflowExecution(executionId);
      setExecution(data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [executionId]);

  useEffect(() => {
    fetchExecution();
  }, [fetchExecution]);

  return {
    execution,
    loading,
    error,
    refresh: fetchExecution,
  };
}

// =============================================================================
// useWorkflowBuilder Hook - Visual workflow builder state management
// =============================================================================

interface UseWorkflowBuilderResult {
  builderState: WorkflowBuilderState;
  validation: WorkflowValidationResult | null;
  validating: boolean;
  saving: boolean;
  error: Error | null;
  // Node operations
  addNode: (node: WorkflowBuilderState['nodes'][0]) => void;
  updateNode: (nodeId: string, updates: Partial<WorkflowBuilderState['nodes'][0]>) => void;
  removeNode: (nodeId: string) => void;
  // Edge operations
  addEdge: (edge: WorkflowBuilderState['edges'][0]) => void;
  removeEdge: (edgeId: string) => void;
  // Viewport operations
  setViewport: (viewport: WorkflowBuilderState['viewport']) => void;
  // Validation
  validate: () => Promise<WorkflowValidationResult>;
  // Save
  save: (name: string, description?: string, isActive?: boolean) => Promise<WebhookWorkflow>;
  // Reset
  reset: () => void;
  // Load from existing workflow
  loadFromWorkflow: (workflow: WebhookWorkflow) => void;
}

const initialBuilderState: WorkflowBuilderState = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

export function useWorkflowBuilder(initialState?: WorkflowBuilderState): UseWorkflowBuilderResult {
  const [builderState, setBuilderState] = useState<WorkflowBuilderState>(
    initialState || initialBuilderState
  );
  const [validation, setValidation] = useState<WorkflowValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Node operations
  const addNode = useCallback((node: WorkflowBuilderState['nodes'][0]) => {
    setBuilderState((prev) => ({
      ...prev,
      nodes: [...prev.nodes, node],
    }));
    setValidation(null); // Clear validation on change
  }, []);

  const updateNode = useCallback((nodeId: string, updates: Partial<WorkflowBuilderState['nodes'][0]>) => {
    setBuilderState((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === nodeId ? { ...n, ...updates } : n
      ),
    }));
    setValidation(null);
  }, []);

  const removeNode = useCallback((nodeId: string) => {
    setBuilderState((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== nodeId),
      edges: prev.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }));
    setValidation(null);
  }, []);

  // Edge operations
  const addEdge = useCallback((edge: WorkflowBuilderState['edges'][0]) => {
    setBuilderState((prev) => ({
      ...prev,
      edges: [...prev.edges, edge],
    }));
    setValidation(null);
  }, []);

  const removeEdge = useCallback((edgeId: string) => {
    setBuilderState((prev) => ({
      ...prev,
      edges: prev.edges.filter((e) => e.id !== edgeId),
    }));
    setValidation(null);
  }, []);

  // Viewport operations
  const setViewport = useCallback((viewport: WorkflowBuilderState['viewport']) => {
    setBuilderState((prev) => ({
      ...prev,
      viewport,
    }));
  }, []);

  // Validation
  const validate = useCallback(async () => {
    try {
      setValidating(true);
      setError(null);
      const result = await webhookTemplatesService.validateWorkflow(builderState);
      setValidation(result);
      return result;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setValidating(false);
    }
  }, [builderState]);

  // Save workflow
  const save = useCallback(async (
    name: string,
    description?: string,
    isActive = false
  ) => {
    try {
      setSaving(true);
      setError(null);

      // Validate first
      const validationResult = await validate();
      if (!validationResult.is_valid) {
        throw new Error(`Workflow validation failed: ${validationResult.errors.join(', ')}`);
      }

      const request: SaveWorkflowBuilderRequest = {
        name,
        description,
        builder_state: builderState,
        is_active: isActive,
      };

      const workflow = await webhookTemplatesService.createWorkflowFromBuilder(request);
      return workflow;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [builderState, validate]);

  // Reset to initial state
  const reset = useCallback(() => {
    setBuilderState(initialState || initialBuilderState);
    setValidation(null);
    setError(null);
  }, [initialState]);

  // Load from existing workflow
  const loadFromWorkflow = useCallback((workflow: WebhookWorkflow) => {
    // Convert workflow steps to builder nodes
    const nodes: WorkflowBuilderState['nodes'] = workflow.workflow_steps.map((step, index) => ({
      id: step.step_id,
      type: step.step_type,
      position: { x: 100 + index * 200, y: 100 },
      data: {
        name: step.name,
        description: step.description,
        configuration: step.configuration,
        input_mapping: step.input_mapping,
        output_mapping: step.output_mapping,
        condition: step.condition,
      },
      connections: [],
    }));

    // Create edges based on step order
    const edges: WorkflowBuilderState['edges'] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        id: `edge-${nodes[i].id}-${nodes[i + 1].id}`,
        source: nodes[i].id,
        target: nodes[i + 1].id,
      });
    }

    setBuilderState({
      nodes,
      edges,
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    setValidation(null);
    setError(null);
  }, []);

  return {
    builderState,
    validation,
    validating,
    saving,
    error,
    addNode,
    updateNode,
    removeNode,
    addEdge,
    removeEdge,
    setViewport,
    validate,
    save,
    reset,
    loadFromWorkflow,
  };
}

// =============================================================================
// useTemplateSetup Hook - Simplified workflow creation from template
// =============================================================================

interface UseTemplateSetupResult {
  template: WebhookTemplate | null;
  loading: boolean;
  error: Error | null;
  configuration: Record<string, unknown>;
  setConfiguration: (key: string, value: unknown) => void;
  setConfigurationBulk: (config: Record<string, unknown>) => void;
  isValid: boolean;
  missingFields: string[];
  createWorkflow: (name: string, description?: string, isActive?: boolean) => Promise<WebhookWorkflow>;
  creating: boolean;
}

export function useTemplateSetup(templateId: string | null): UseTemplateSetupResult {
  const { template, loading, error } = useWebhookTemplate(templateId);
  const [configuration, setConfigurationState] = useState<Record<string, unknown>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<Error | null>(null);

  // Initialize configuration from template defaults
  useEffect(() => {
    if (template?.default_config) {
      setConfigurationState(template.default_config);
    }
  }, [template]);

  const setConfiguration = useCallback((key: string, value: unknown) => {
    setConfigurationState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setConfigurationBulk = useCallback((config: Record<string, unknown>) => {
    setConfigurationState((prev) => ({ ...prev, ...config }));
  }, []);

  // Validate required fields
  const requiredFields = template?.required_fields || [];
  const missingFields = useMemo(() => {
    return requiredFields.filter((field) => {
      const value = configuration[field];
      return value === undefined || value === null || value === '';
    });
  }, [requiredFields, configuration]);

  const isValid = missingFields.length === 0;

  const createWorkflow = useCallback(async (
    name: string,
    description?: string,
    isActive = false
  ) => {
    if (!templateId || !isValid) {
      throw new Error('Cannot create workflow: template not selected or configuration incomplete');
    }

    try {
      setCreating(true);
      setCreateError(null);

      const request: CreateWorkflowFromTemplateRequest = {
        template_id: templateId,
        name,
        description,
        configuration,
        is_active: isActive,
      };

      const workflow = await webhookTemplatesService.createWorkflowFromTemplate(request);
      return workflow;
    } catch (err) {
      setCreateError(err as Error);
      throw err;
    } finally {
      setCreating(false);
    }
  }, [templateId, isValid, configuration]);

  return {
    template,
    loading,
    error: error || createError,
    configuration,
    setConfiguration,
    setConfigurationBulk,
    isValid,
    missingFields,
    createWorkflow,
    creating,
  };
}
