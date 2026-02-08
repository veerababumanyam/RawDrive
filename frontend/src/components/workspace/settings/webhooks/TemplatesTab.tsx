/**
 * TemplatesTab - Integration templates browsing and workflow management.
 * Part of the WebhooksSettingsPanel, allows users to browse pre-built
 * integrations and create workflows from templates.
 */

import React, { useState, useCallback } from 'react';
import {
  ArrowLeft,
  Loader2,
  Plus,
  Zap,
  Workflow as WorkflowIcon,
  Settings,
  Play,
  Pause,
  Trash2,
  Eye,
  ExternalLink,
} from 'lucide-react';
import { AppButton } from '../../../ui/AppButton';
import { Card } from '../../../ui/AppCard';
import { AppInput } from '../../../ui/AppInput';
import { cn } from '@/lib/utils';

// Import template components
import {
  TemplateGallery,
  WorkflowBuilder,
  WorkflowPreviewCard,
  IntegrationCard,
} from '../../../features/webhooks';

// Import hooks
import {
  useWebhookTemplate,
  useWebhookWorkflows,
  useTemplateSetup,
  useWorkflowBuilder,
} from '../../../../hooks/useWebhookTemplates';

import type {
  WebhookTemplateSummary,
  WebhookWorkflow,
} from '../../../../types/webhooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplatesTabProps {
  workspaceId: string;
}

type ViewMode = 'gallery' | 'template-detail' | 'workflow-builder' | 'workflow-list';

// ---------------------------------------------------------------------------
// WorkflowListItem Component
// ---------------------------------------------------------------------------

interface WorkflowListItemProps {
  workflow: WebhookWorkflow | {
    workflow_id: string;
    name: string;
    description?: string;
    is_active: boolean;
    trigger_events: string[];
    execution_count: number;
    success_count: number;
    failure_count: number;
    last_executed_at?: string;
  };
  onView: () => void;
  onToggle: () => void;
  onDelete: () => void;
  isToggling?: boolean;
  isDeleting?: boolean;
}

function WorkflowListItem({
  workflow,
  onView,
  onToggle,
  onDelete,
  isToggling,
  isDeleting,
}: WorkflowListItemProps) {
  const successRate =
    workflow.execution_count > 0
      ? Math.round((workflow.success_count / workflow.execution_count) * 100)
      : 0;

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              'p-2 rounded-lg',
              workflow.is_active
                ? 'bg-green-100 dark:bg-green-900/30'
                : 'bg-gray-100 dark:bg-gray-800'
            )}
          >
            <WorkflowIcon
              className={cn(
                'h-5 w-5',
                workflow.is_active
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-500'
              )}
            />
          </div>
          <div className="min-w-0">
            <h4 className="font-medium truncate">{workflow.name}</h4>
            {workflow.description && (
              <p className="text-sm text-muted-foreground truncate">
                {workflow.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {workflow.trigger_events.length} trigger
                {workflow.trigger_events.length !== 1 ? 's' : ''}
              </span>
              <span>
                {workflow.execution_count} run{workflow.execution_count !== 1 ? 's' : ''}
              </span>
              {workflow.execution_count > 0 && (
                <span
                  className={cn(
                    successRate >= 90
                      ? 'text-green-600'
                      : successRate >= 70
                        ? 'text-yellow-600'
                        : 'text-red-600'
                  )}
                >
                  {successRate}% success
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AppButton variant="ghost" size="sm" onClick={onView}>
            <Eye className="h-4 w-4" />
          </AppButton>
          <AppButton
            variant="ghost"
            size="sm"
            onClick={onToggle}
            disabled={isToggling}
          >
            {isToggling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : workflow.is_active ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </AppButton>
          <AppButton
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isDeleting}
            className="text-red-500 hover:text-red-600"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </AppButton>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TemplateSetupPanel Component - Configure a template before creating workflow
// ---------------------------------------------------------------------------

interface TemplateSetupPanelProps {
  templateId: string;
  onBack: () => void;
  onSuccess: (workflow: WebhookWorkflow) => void;
}

function TemplateSetupPanel({ templateId, onBack, onSuccess }: TemplateSetupPanelProps) {
  const {
    template,
    loading,
    error,
    configuration,
    setConfiguration,
    isValid,
    missingFields,
    createWorkflow,
    creating,
  } = useTemplateSetup(templateId);

  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');

  const handleCreate = async () => {
    try {
      const workflow = await createWorkflow(
        workflowName || template?.name || 'New Workflow',
        workflowDescription || undefined,
        true // Activate by default
      );
      onSuccess(workflow);
    } catch (err) {
      console.error('Failed to create workflow:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !template) {
    return (
      <Card className="p-6 text-center">
        <p className="text-red-500">Failed to load template</p>
        <AppButton variant="outline" onClick={onBack} className="mt-4">
          Go Back
        </AppButton>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <AppButton variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </AppButton>
        <div>
          <h2 className="text-xl font-semibold">Set Up Integration</h2>
          <p className="text-muted-foreground">Configure {template.name}</p>
        </div>
      </div>

      {/* Template Info */}
      <IntegrationCard template={template as WebhookTemplateSummary} variant="featured" />

      {/* Workflow Details */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Workflow Details</h3>

        <div>
          <label className="block text-sm font-medium mb-1">Workflow Name</label>
          <AppInput
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            placeholder={template.name}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description (optional)</label>
          <AppInput
            value={workflowDescription}
            onChange={(e) => setWorkflowDescription(e.target.value)}
            placeholder="Add a description for this workflow"
          />
        </div>
      </Card>

      {/* Configuration */}
      {template.required_fields.length > 0 && (
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold">Configuration</h3>
          <p className="text-sm text-muted-foreground">
            Fill in the required fields to set up this integration.
          </p>

          {template.required_fields.map((field) => (
            <div key={field}>
              <label className="block text-sm font-medium mb-1 capitalize">
                {field.replace(/_/g, ' ')}
                {missingFields.includes(field) && (
                  <span className="text-red-500 ml-1">*</span>
                )}
              </label>
              <AppInput
                value={(configuration[field] as string) || ''}
                onChange={(e) => setConfiguration(field, e.target.value)}
                placeholder={`Enter ${field.replace(/_/g, ' ')}`}
              />
            </div>
          ))}
        </Card>
      )}

      {/* Workflow Preview */}
      {template.workflow_steps && template.workflow_steps.length > 0 && (
        <WorkflowPreviewCard
          title="Workflow Steps"
          description="This integration will execute the following steps"
          steps={template.workflow_steps}
          size="sm"
        />
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <AppButton variant="outline" onClick={onBack}>
          Cancel
        </AppButton>
        <AppButton
          onClick={handleCreate}
          disabled={!isValid || creating}
        >
          {creating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Creating...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Create Workflow
            </>
          )}
        </AppButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TemplatesTab Component
// ---------------------------------------------------------------------------

export function TemplatesTab({ workspaceId }: TemplatesTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Workflows management
  const {
    workflows,
    loading: workflowsLoading,
    refresh: refreshWorkflows,
    deleteWorkflow,
    toggleWorkflow,
  } = useWebhookWorkflows({ pageSize: 10 });

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Handlers
  const handleSelectTemplate = useCallback((template: WebhookTemplateSummary) => {
    setSelectedTemplateId(template.template_id);
  }, []);

  const handleUseTemplate = useCallback((template: WebhookTemplateSummary) => {
    setSelectedTemplateId(template.template_id);
    setViewMode('template-detail');
  }, []);

  const handleWorkflowCreated = useCallback(
    (_workflow: WebhookWorkflow) => {
      refreshWorkflows();
      setViewMode('workflow-list');
      setSelectedTemplateId(null);
    },
    [refreshWorkflows]
  );

  const handleToggleWorkflow = async (workflowId: string, isActive: boolean) => {
    setTogglingId(workflowId);
    try {
      await toggleWorkflow(workflowId, !isActive);
    } catch (err) {
      console.error('Failed to toggle workflow:', err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteWorkflow = async (workflowId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    setDeletingId(workflowId);
    try {
      await deleteWorkflow(workflowId);
    } catch (err) {
      console.error('Failed to delete workflow:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // Render based on view mode
  if (viewMode === 'template-detail' && selectedTemplateId) {
    return (
      <TemplateSetupPanel
        templateId={selectedTemplateId}
        onBack={() => {
          setViewMode('gallery');
          setSelectedTemplateId(null);
        }}
        onSuccess={handleWorkflowCreated}
      />
    );
  }

  if (viewMode === 'workflow-builder') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <AppButton variant="ghost" onClick={() => setViewMode('gallery')}>
            <ArrowLeft className="h-4 w-4" />
          </AppButton>
          <div>
            <h2 className="text-xl font-semibold">Custom Workflow Builder</h2>
            <p className="text-muted-foreground">Build a workflow from scratch</p>
          </div>
        </div>
        <WorkflowBuilder
          onSave={async (_state) => {
            // Handle save
            refreshWorkflows();
            setViewMode('workflow-list');
          }}
        />
      </div>
    );
  }

  if (viewMode === 'workflow-list') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <AppButton variant="ghost" onClick={() => setViewMode('gallery')}>
              <ArrowLeft className="h-4 w-4" />
            </AppButton>
            <div>
              <h2 className="text-xl font-semibold">My Workflows</h2>
              <p className="text-muted-foreground">
                Manage your automation workflows
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <AppButton
              variant="outline"
              onClick={() => setViewMode('workflow-builder')}
            >
              <Settings className="h-4 w-4 mr-2" />
              Build Custom
            </AppButton>
            <AppButton onClick={() => setViewMode('gallery')}>
              <Plus className="h-4 w-4 mr-2" />
              From Template
            </AppButton>
          </div>
        </div>

        {/* Workflows List */}
        {workflowsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : workflows.length === 0 ? (
          <Card className="p-12 text-center">
            <WorkflowIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">No Workflows Yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first automation workflow from a template or build one from scratch.
            </p>
            <div className="flex gap-2 justify-center">
              <AppButton variant="outline" onClick={() => setViewMode('workflow-builder')}>
                Build Custom
              </AppButton>
              <AppButton onClick={() => setViewMode('gallery')}>
                Browse Templates
              </AppButton>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {workflows.map((workflow) => (
              <WorkflowListItem
                key={workflow.workflow_id}
                workflow={workflow}
                onView={() => {
                  // Could open workflow detail view
                  console.log('View workflow:', workflow.workflow_id);
                }}
                onToggle={() => handleToggleWorkflow(workflow.workflow_id, workflow.is_active)}
                onDelete={() => handleDeleteWorkflow(workflow.workflow_id, workflow.name)}
                isToggling={togglingId === workflow.workflow_id}
                isDeleting={deletingId === workflow.workflow_id}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Default: Gallery view
  return (
    <div className="space-y-6">
      {/* Quick Access Bar */}
      <Card className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <WorkflowIcon className="h-5 w-5 text-primary" />
          <span className="font-medium">
            {workflows.length} Active Workflow{workflows.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex gap-2">
          <AppButton
            variant="outline"
            size="sm"
            onClick={() => setViewMode('workflow-list')}
          >
            <Eye className="h-4 w-4 mr-2" />
            View Workflows
          </AppButton>
          <AppButton
            variant="outline"
            size="sm"
            onClick={() => setViewMode('workflow-builder')}
          >
            <Settings className="h-4 w-4 mr-2" />
            Build Custom
          </AppButton>
        </div>
      </Card>

      {/* Template Gallery */}
      <TemplateGallery
        selectedTemplateId={selectedTemplateId || undefined}
        onSelectTemplate={handleSelectTemplate}
        onUseTemplate={handleUseTemplate}
        showFeatured
        pageSize={12}
      />
    </div>
  );
}

export default TemplatesTab;
