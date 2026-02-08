/**
 * WorkflowBuilder Component
 *
 * A visual drag-and-drop workflow builder for creating webhook automation workflows.
 * Photographers can connect webhook events to external tools without writing code.
 *
 * Feature: Webhook Integration Templates
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Save,
  Play,
  Settings,
  Zap,
  GitBranch,
  Clock,
  Send,
  Filter,
  GripVertical,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  MousePointer,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import { Card } from '../../ui/AppCard';
import { AppButton } from '../../ui/AppButton';
import { AppInput } from '../../ui/AppInput';
import { cn } from '@/lib/utils';
import type {
  WorkflowStepType,
  WorkflowStepDefinition,
  WorkflowBuilderNode,
  WorkflowBuilderEdge,
  WorkflowBuilderState,
  WorkflowValidationResult,
} from '../../../types/webhooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowBuilderProps {
  /** Initial workflow state */
  initialState?: WorkflowBuilderState;
  /** Available trigger events */
  availableEvents?: string[];
  /** Callback when workflow changes */
  onChange?: (state: WorkflowBuilderState) => void;
  /** Callback when save is requested */
  onSave?: (state: WorkflowBuilderState) => Promise<void>;
  /** Callback when validation is requested */
  onValidate?: (state: WorkflowBuilderState) => Promise<WorkflowValidationResult>;
  /** Validation result */
  validationResult?: WorkflowValidationResult;
  /** Whether save is in progress */
  isSaving?: boolean;
  /** Whether validation is in progress */
  isValidating?: boolean;
  /** Read-only mode */
  readOnly?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Step Type Configuration
// ---------------------------------------------------------------------------

interface StepTypeConfig {
  type: WorkflowStepType;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: {
    bg: string;
    border: string;
    icon: string;
  };
  defaultConfig: Record<string, unknown>;
}

const STEP_TYPES: StepTypeConfig[] = [
  {
    type: 'trigger',
    label: 'Trigger',
    description: 'Start workflow on event',
    icon: <Zap className="h-4 w-4" />,
    color: {
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      border: 'border-yellow-300 dark:border-yellow-700',
      icon: 'text-yellow-600 dark:text-yellow-400',
    },
    defaultConfig: { event: '' },
  },
  {
    type: 'transform',
    label: 'Transform',
    description: 'Modify data',
    icon: <Settings className="h-4 w-4" />,
    color: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      border: 'border-blue-300 dark:border-blue-700',
      icon: 'text-blue-600 dark:text-blue-400',
    },
    defaultConfig: { mapping: {} },
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch based on rules',
    icon: <GitBranch className="h-4 w-4" />,
    color: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      border: 'border-purple-300 dark:border-purple-700',
      icon: 'text-purple-600 dark:text-purple-400',
    },
    defaultConfig: { condition: '' },
  },
  {
    type: 'http_request',
    label: 'HTTP Request',
    description: 'Call external API',
    icon: <Send className="h-4 w-4" />,
    color: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      border: 'border-green-300 dark:border-green-700',
      icon: 'text-green-600 dark:text-green-400',
    },
    defaultConfig: { url: '', method: 'POST', headers: {}, body: '' },
  },
  {
    type: 'delay',
    label: 'Delay',
    description: 'Wait before continuing',
    icon: <Clock className="h-4 w-4" />,
    color: {
      bg: 'bg-orange-100 dark:bg-orange-900/30',
      border: 'border-orange-300 dark:border-orange-700',
      icon: 'text-orange-600 dark:text-orange-400',
    },
    defaultConfig: { duration_seconds: 60 },
  },
  {
    type: 'branch',
    label: 'Branch',
    description: 'Split workflow path',
    icon: <Filter className="h-4 w-4" />,
    color: {
      bg: 'bg-indigo-100 dark:bg-indigo-900/30',
      border: 'border-indigo-300 dark:border-indigo-700',
      icon: 'text-indigo-600 dark:text-indigo-400',
    },
    defaultConfig: { branches: [] },
  },
];

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function generateId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getStepTypeConfig(type: WorkflowStepType): StepTypeConfig | undefined {
  return STEP_TYPES.find((s) => s.type === type);
}

// ---------------------------------------------------------------------------
// StepPalette Component - Sidebar with available step types
// ---------------------------------------------------------------------------

interface StepPaletteProps {
  onAddStep: (type: WorkflowStepType) => void;
  disabled?: boolean;
}

function StepPalette({ onAddStep, disabled }: StepPaletteProps) {
  return (
    <Card className="p-4 w-64 flex-shrink-0">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Plus className="h-4 w-4" />
        Add Step
      </h3>
      <div className="space-y-2">
        {STEP_TYPES.map((stepType) => (
          <button
            key={stepType.type}
            onClick={() => onAddStep(stepType.type)}
            disabled={disabled}
            className={cn(
              'w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left',
              'hover:border-primary/50 hover:shadow-sm',
              disabled && 'opacity-50 cursor-not-allowed',
              stepType.color.bg,
              stepType.color.border
            )}
          >
            <div className={cn('p-1.5 rounded', stepType.color.icon)}>
              {stepType.icon}
            </div>
            <div>
              <p className="font-medium text-sm">{stepType.label}</p>
              <p className="text-xs text-muted-foreground">{stepType.description}</p>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// WorkflowNode Component - Individual step in the workflow
// ---------------------------------------------------------------------------

interface WorkflowNodeProps {
  node: WorkflowBuilderNode;
  index: number;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<WorkflowBuilderNode>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  readOnly?: boolean;
}

function WorkflowNode({
  node,
  index,
  isSelected,
  isFirst,
  isLast,
  onSelect,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  readOnly,
}: WorkflowNodeProps) {
  const config = getStepTypeConfig(node.type);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!config) return null;

  const name = (node.data.name as string) || config.label;

  return (
    <div
      className={cn(
        'relative group',
        'border-2 rounded-lg p-4 transition-all cursor-pointer',
        config.color.bg,
        isSelected
          ? 'ring-2 ring-primary border-primary'
          : config.color.border + ' hover:border-primary/50'
      )}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        {/* Drag Handle */}
        {!readOnly && (
          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
        )}

        {/* Icon */}
        <div className={cn('p-2 rounded', config.color.bg, config.color.icon)}>
          {config.icon}
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          {readOnly ? (
            <p className="font-medium truncate">{name}</p>
          ) : (
            <input
              type="text"
              value={name}
              onChange={(e) =>
                onUpdate({ data: { ...node.data, name: e.target.value } })
              }
              className={cn(
                'font-medium bg-transparent border-none focus:outline-none focus:ring-0 w-full',
                'placeholder:text-muted-foreground'
              )}
              placeholder={config.label}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <p className="text-xs text-muted-foreground">{config.label}</p>
        </div>

        {/* Actions */}
        {!readOnly && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp();
              }}
              disabled={isFirst}
              className="p-1 hover:bg-black/10 rounded disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown();
              }}
              disabled={isLast}
              className="p-1 hover:bg-black/10 rounded disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Expand Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="p-1 hover:bg-black/10 rounded"
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Expanded Configuration */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-black/10 space-y-3">
          {node.type === 'trigger' && (
            <div>
              <label className="block text-xs font-medium mb-1">Event Type</label>
              <AppInput
                type="text"
                value={(node.data.event as string) || ''}
                onChange={(e) =>
                  onUpdate({ data: { ...node.data, event: e.target.value } })
                }
                placeholder="e.g., gallery.published"
                disabled={readOnly}
                size="sm"
              />
            </div>
          )}

          {node.type === 'http_request' && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1">URL</label>
                <AppInput
                  type="url"
                  value={(node.data.url as string) || ''}
                  onChange={(e) =>
                    onUpdate({ data: { ...node.data, url: e.target.value } })
                  }
                  placeholder="https://api.example.com/webhook"
                  disabled={readOnly}
                  size="sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Method</label>
                <select
                  value={(node.data.method as string) || 'POST'}
                  onChange={(e) =>
                    onUpdate({ data: { ...node.data, method: e.target.value } })
                  }
                  disabled={readOnly}
                  className="w-full text-sm rounded border border-input bg-background px-3 py-1.5"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
            </>
          )}

          {node.type === 'delay' && (
            <div>
              <label className="block text-xs font-medium mb-1">Duration (seconds)</label>
              <AppInput
                type="number"
                value={(node.data.duration_seconds as number) || 60}
                onChange={(e) =>
                  onUpdate({
                    data: {
                      ...node.data,
                      duration_seconds: parseInt(e.target.value, 10) || 60,
                    },
                  })
                }
                min={1}
                disabled={readOnly}
                size="sm"
              />
            </div>
          )}

          {node.type === 'condition' && (
            <div>
              <label className="block text-xs font-medium mb-1">Condition Expression</label>
              <AppInput
                type="text"
                value={(node.data.condition as string) || ''}
                onChange={(e) =>
                  onUpdate({ data: { ...node.data, condition: e.target.value } })
                }
                placeholder='e.g., payload.status == "published"'
                disabled={readOnly}
                size="sm"
              />
            </div>
          )}

          {node.type === 'transform' && (
            <div>
              <label className="block text-xs font-medium mb-1">Data Mapping (JSON)</label>
              <textarea
                value={JSON.stringify(node.data.mapping || {}, null, 2)}
                onChange={(e) => {
                  try {
                    const mapping = JSON.parse(e.target.value);
                    onUpdate({ data: { ...node.data, mapping } });
                  } catch {
                    // Invalid JSON, don't update
                  }
                }}
                disabled={readOnly}
                className="w-full text-sm rounded border border-input bg-background px-3 py-2 font-mono h-24"
                placeholder='{"newField": "{{payload.oldField}}"}'
              />
            </div>
          )}

          {node.data.description !== undefined && (
            <div>
              <label className="block text-xs font-medium mb-1">Description</label>
              <AppInput
                type="text"
                value={(node.data.description as string) || ''}
                onChange={(e) =>
                  onUpdate({ data: { ...node.data, description: e.target.value } })
                }
                placeholder="Optional description"
                disabled={readOnly}
                size="sm"
              />
            </div>
          )}
        </div>
      )}

      {/* Step Number Badge */}
      <div
        className={cn(
          'absolute -left-3 -top-3 h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold',
          'bg-primary text-primary-foreground shadow'
        )}
      >
        {index + 1}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connector Line Component
// ---------------------------------------------------------------------------

function ConnectorLine() {
  return (
    <div className="flex items-center justify-center h-8">
      <div className="h-full w-0.5 bg-border" />
      <ArrowRight className="absolute h-4 w-4 text-muted-foreground rotate-90" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validation Panel Component
// ---------------------------------------------------------------------------

interface ValidationPanelProps {
  result?: WorkflowValidationResult;
  isValidating?: boolean;
  onValidate: () => void;
}

function ValidationPanel({ result, isValidating, onValidate }: ValidationPanelProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2">
          {result?.is_valid ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : result?.errors?.length ? (
            <AlertCircle className="h-4 w-4 text-red-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          )}
          Validation
        </h3>
        <AppButton variant="outline" size="sm" onClick={onValidate} disabled={isValidating}>
          {isValidating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Validate'
          )}
        </AppButton>
      </div>

      {result && (
        <div className="space-y-2">
          {result.is_valid ? (
            <p className="text-sm text-green-600 dark:text-green-400">
              Workflow is valid and ready to save.
            </p>
          ) : (
            <>
              {result.errors.map((error, i) => (
                <p key={i} className="text-sm text-red-500 flex items-start gap-2">
                  <X className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  {error}
                </p>
              ))}
            </>
          )}

          {result.warnings?.map((warning, i) => (
            <p key={i} className="text-sm text-yellow-600 dark:text-yellow-400 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              {warning}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// WorkflowBuilder Component
// ---------------------------------------------------------------------------

export function WorkflowBuilder({
  initialState,
  availableEvents = [],
  onChange,
  onSave,
  onValidate,
  validationResult,
  isSaving = false,
  isValidating = false,
  readOnly = false,
  className,
}: WorkflowBuilderProps) {
  // State
  const [nodes, setNodes] = useState<WorkflowBuilderNode[]>(
    initialState?.nodes || []
  );
  const [edges, setEdges] = useState<WorkflowBuilderEdge[]>(
    initialState?.edges || []
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewport, setViewport] = useState(
    initialState?.viewport || { x: 0, y: 0, zoom: 1 }
  );

  // Compute current state
  const currentState = useMemo<WorkflowBuilderState>(
    () => ({ nodes, edges, viewport }),
    [nodes, edges, viewport]
  );

  // Notify parent of changes
  const notifyChange = useCallback(
    (newNodes: WorkflowBuilderNode[], newEdges: WorkflowBuilderEdge[]) => {
      onChange?.({ nodes: newNodes, edges: newEdges, viewport });
    },
    [onChange, viewport]
  );

  // Add a new step
  const handleAddStep = useCallback(
    (type: WorkflowStepType) => {
      const config = getStepTypeConfig(type);
      if (!config) return;

      const newNode: WorkflowBuilderNode = {
        id: generateId(),
        type,
        position: { x: 100, y: nodes.length * 150 + 50 },
        data: {
          name: config.label,
          ...config.defaultConfig,
        },
        connections: [],
      };

      // Create edge from last node if exists
      const newEdges = [...edges];
      if (nodes.length > 0) {
        const lastNode = nodes[nodes.length - 1];
        newEdges.push({
          id: `edge-${lastNode.id}-${newNode.id}`,
          source: lastNode.id,
          target: newNode.id,
        });
      }

      const newNodes = [...nodes, newNode];
      setNodes(newNodes);
      setEdges(newEdges);
      setSelectedNodeId(newNode.id);
      notifyChange(newNodes, newEdges);
    },
    [nodes, edges, notifyChange]
  );

  // Update a node
  const handleUpdateNode = useCallback(
    (nodeId: string, updates: Partial<WorkflowBuilderNode>) => {
      const newNodes = nodes.map((n) =>
        n.id === nodeId ? { ...n, ...updates } : n
      );
      setNodes(newNodes);
      notifyChange(newNodes, edges);
    },
    [nodes, edges, notifyChange]
  );

  // Delete a node
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const nodeIndex = nodes.findIndex((n) => n.id === nodeId);
      if (nodeIndex === -1) return;

      const newNodes = nodes.filter((n) => n.id !== nodeId);

      // Remove edges connected to this node and reconnect if needed
      let newEdges = edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId
      );

      // Reconnect edges around deleted node
      if (nodeIndex > 0 && nodeIndex < nodes.length - 1) {
        const prevNode = nodes[nodeIndex - 1];
        const nextNode = nodes[nodeIndex + 1];
        newEdges.push({
          id: `edge-${prevNode.id}-${nextNode.id}`,
          source: prevNode.id,
          target: nextNode.id,
        });
      }

      setNodes(newNodes);
      setEdges(newEdges);
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
      notifyChange(newNodes, newEdges);
    },
    [nodes, edges, selectedNodeId, notifyChange]
  );

  // Move node up
  const handleMoveUp = useCallback(
    (nodeId: string) => {
      const nodeIndex = nodes.findIndex((n) => n.id === nodeId);
      if (nodeIndex <= 0) return;

      const newNodes = [...nodes];
      [newNodes[nodeIndex - 1], newNodes[nodeIndex]] = [
        newNodes[nodeIndex],
        newNodes[nodeIndex - 1],
      ];

      // Rebuild edges
      const newEdges: WorkflowBuilderEdge[] = [];
      for (let i = 0; i < newNodes.length - 1; i++) {
        newEdges.push({
          id: `edge-${newNodes[i].id}-${newNodes[i + 1].id}`,
          source: newNodes[i].id,
          target: newNodes[i + 1].id,
        });
      }

      setNodes(newNodes);
      setEdges(newEdges);
      notifyChange(newNodes, newEdges);
    },
    [nodes, notifyChange]
  );

  // Move node down
  const handleMoveDown = useCallback(
    (nodeId: string) => {
      const nodeIndex = nodes.findIndex((n) => n.id === nodeId);
      if (nodeIndex === -1 || nodeIndex >= nodes.length - 1) return;

      const newNodes = [...nodes];
      [newNodes[nodeIndex], newNodes[nodeIndex + 1]] = [
        newNodes[nodeIndex + 1],
        newNodes[nodeIndex],
      ];

      // Rebuild edges
      const newEdges: WorkflowBuilderEdge[] = [];
      for (let i = 0; i < newNodes.length - 1; i++) {
        newEdges.push({
          id: `edge-${newNodes[i].id}-${newNodes[i + 1].id}`,
          source: newNodes[i].id,
          target: newNodes[i + 1].id,
        });
      }

      setNodes(newNodes);
      setEdges(newEdges);
      notifyChange(newNodes, newEdges);
    },
    [nodes, notifyChange]
  );

  // Handle save
  const handleSave = useCallback(async () => {
    if (onSave) {
      await onSave(currentState);
    }
  }, [onSave, currentState]);

  // Handle validate
  const handleValidate = useCallback(async () => {
    if (onValidate) {
      await onValidate(currentState);
    }
  }, [onValidate, currentState]);

  return (
    <div className={cn('flex gap-4', className)}>
      {/* Step Palette */}
      {!readOnly && <StepPalette onAddStep={handleAddStep} disabled={isSaving} />}

      {/* Main Canvas */}
      <div className="flex-1 space-y-4">
        {/* Toolbar */}
        <Card className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {nodes.length} step{nodes.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!readOnly && (
              <>
                <AppButton
                  variant="outline"
                  size="sm"
                  onClick={handleValidate}
                  disabled={isValidating || nodes.length === 0}
                >
                  {isValidating ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Validate
                </AppButton>
                <AppButton
                  size="sm"
                  onClick={handleSave}
                  disabled={
                    isSaving ||
                    nodes.length === 0 ||
                    (validationResult && !validationResult.is_valid)
                  }
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Workflow
                </AppButton>
              </>
            )}
          </div>
        </Card>

        {/* Workflow Canvas */}
        <Card className="p-6 min-h-[400px]">
          {nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <MousePointer className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-2">Start Building</h3>
              <p className="text-muted-foreground max-w-sm">
                {readOnly
                  ? 'This workflow has no steps configured.'
                  : 'Add steps from the palette on the left to build your automation workflow.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {nodes.map((node, index) => (
                <React.Fragment key={node.id}>
                  {index > 0 && <ConnectorLine />}
                  <WorkflowNode
                    node={node}
                    index={index}
                    isSelected={selectedNodeId === node.id}
                    isFirst={index === 0}
                    isLast={index === nodes.length - 1}
                    onSelect={() => setSelectedNodeId(node.id)}
                    onUpdate={(updates) => handleUpdateNode(node.id, updates)}
                    onDelete={() => handleDeleteNode(node.id)}
                    onMoveUp={() => handleMoveUp(node.id)}
                    onMoveDown={() => handleMoveDown(node.id)}
                    readOnly={readOnly}
                  />
                </React.Fragment>
              ))}
            </div>
          )}
        </Card>

        {/* Validation Panel */}
        {!readOnly && (validationResult || isValidating) && (
          <ValidationPanel
            result={validationResult}
            isValidating={isValidating}
            onValidate={handleValidate}
          />
        )}
      </div>
    </div>
  );
}

export default WorkflowBuilder;
