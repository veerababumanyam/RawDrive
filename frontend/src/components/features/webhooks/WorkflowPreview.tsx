/**
 * WorkflowPreview Component
 *
 * A visual preview of workflow steps showing the execution flow.
 * Used for displaying template workflows and existing workflow configurations.
 *
 * Feature: Webhook Integration Templates
 */

import React from 'react';
import {
  Zap,
  ArrowRight,
  ArrowDown,
  Play,
  Settings,
  GitBranch,
  Clock,
  Send,
  Filter,
  CheckCircle2,
  XCircle,
  Pause,
  MoreVertical,
  ChevronRight,
} from 'lucide-react';
import { Card } from '../../ui/AppCard';
import { cn } from '@/lib/utils';
import type {
  WorkflowStepType,
  WorkflowStepDefinition,
  WorkflowStepResponse,
  WorkflowStepResult,
} from '@/types/webhooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowPreviewProps {
  /** Workflow steps to display */
  steps: (WorkflowStepDefinition | WorkflowStepResponse)[];
  /** Optional execution results for each step */
  stepResults?: WorkflowStepResult[];
  /** Layout direction */
  direction?: 'horizontal' | 'vertical';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Whether the workflow is currently executing */
  isExecuting?: boolean;
  /** Index of currently executing step */
  currentStepIndex?: number;
  /** Show step details on hover */
  showDetails?: boolean;
  /** Callback when a step is clicked */
  onStepClick?: (step: WorkflowStepDefinition | WorkflowStepResponse, index: number) => void;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Extract step type from either WorkflowStepDefinition or WorkflowStepResponse
 */
function getStepType(step: WorkflowStepDefinition | WorkflowStepResponse): WorkflowStepType {
  return 'type' in step ? getStepType(step) : step.step_type;
}

/**
 * Get icon component for step type
 */
function getStepIcon(type: WorkflowStepType) {
  const icons: Record<WorkflowStepType, React.ReactNode> = {
    trigger: <Zap className="h-full w-full" />,
    transform: <Settings className="h-full w-full" />,
    condition: <GitBranch className="h-full w-full" />,
    http_request: <Send className="h-full w-full" />,
    delay: <Clock className="h-full w-full" />,
    branch: <Filter className="h-full w-full" />,
  };
  return icons[type] || <Settings className="h-full w-full" />;
}

/**
 * Get colors based on step type
 */
function getStepColors(type: WorkflowStepType): {
  bg: string;
  border: string;
  icon: string;
} {
  const colors: Record<WorkflowStepType, { bg: string; border: string; icon: string }> = {
    trigger: {
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      border: 'border-yellow-300 dark:border-yellow-700',
      icon: 'text-yellow-600 dark:text-yellow-400',
    },
    transform: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      border: 'border-blue-300 dark:border-blue-700',
      icon: 'text-blue-600 dark:text-blue-400',
    },
    condition: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      border: 'border-purple-300 dark:border-purple-700',
      icon: 'text-purple-600 dark:text-purple-400',
    },
    http_request: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      border: 'border-green-300 dark:border-green-700',
      icon: 'text-green-600 dark:text-green-400',
    },
    delay: {
      bg: 'bg-orange-100 dark:bg-orange-900/30',
      border: 'border-orange-300 dark:border-orange-700',
      icon: 'text-orange-600 dark:text-orange-400',
    },
    branch: {
      bg: 'bg-indigo-100 dark:bg-indigo-900/30',
      border: 'border-indigo-300 dark:border-indigo-700',
      icon: 'text-indigo-600 dark:text-indigo-400',
    },
  };
  return colors[type] || colors.transform;
}

/**
 * Get display name for step type
 */
function getStepTypeLabel(type: WorkflowStepType): string {
  const labels: Record<WorkflowStepType, string> = {
    trigger: 'Trigger',
    transform: 'Transform',
    condition: 'Condition',
    http_request: 'HTTP Request',
    delay: 'Delay',
    branch: 'Branch',
  };
  return labels[type] || type;
}

/**
 * Get status indicator for step result
 */
function getStepStatus(result?: WorkflowStepResult): {
  icon: React.ReactNode;
  color: string;
  label: string;
} | null {
  if (!result) return null;

  switch (result.status) {
    case 'success':
      return {
        icon: <CheckCircle2 className="h-4 w-4" />,
        color: 'text-green-500',
        label: 'Completed',
      };
    case 'failed':
      return {
        icon: <XCircle className="h-4 w-4" />,
        color: 'text-red-500',
        label: 'Failed',
      };
    case 'skipped':
      return {
        icon: <Pause className="h-4 w-4" />,
        color: 'text-gray-500',
        label: 'Skipped',
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// StepNode Component
// ---------------------------------------------------------------------------

interface StepNodeProps {
  step: WorkflowStepDefinition | WorkflowStepResponse;
  result?: WorkflowStepResult;
  index: number;
  size: 'sm' | 'md' | 'lg';
  isExecuting?: boolean;
  isCurrent?: boolean;
  showDetails?: boolean;
  onClick?: () => void;
}

function StepNode({
  step,
  result,
  index,
  size,
  isExecuting,
  isCurrent,
  showDetails,
  onClick,
}: StepNodeProps) {
  const colors = getStepColors(getStepType(step));
  const status = getStepStatus(result);

  const sizeClasses = {
    sm: {
      container: 'w-24',
      icon: 'h-8 w-8',
      iconInner: 'h-4 w-4',
      text: 'text-xs',
    },
    md: {
      container: 'w-32',
      icon: 'h-10 w-10',
      iconInner: 'h-5 w-5',
      text: 'text-sm',
    },
    lg: {
      container: 'w-40',
      icon: 'h-12 w-12',
      iconInner: 'h-6 w-6',
      text: 'text-sm',
    },
  };

  const classes = sizeClasses[size];

  return (
    <div
      className={cn(
        'group relative flex flex-col items-center',
        classes.container,
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      {/* Icon Container */}
      <div
        className={cn(
          'relative flex items-center justify-center rounded-xl border-2 transition-all',
          classes.icon,
          colors.bg,
          colors.border,
          isCurrent && isExecuting && 'animate-pulse ring-2 ring-primary ring-offset-2',
          onClick && 'group-hover:ring-2 group-hover:ring-primary/50 group-hover:ring-offset-2'
        )}
      >
        <div className={cn(classes.iconInner, colors.icon)}>
          {getStepIcon(getStepType(step))}
        </div>

        {/* Status Indicator */}
        {status && (
          <div
            className={cn(
              'absolute -top-1 -right-1 rounded-full bg-white dark:bg-gray-900 p-0.5',
              status.color
            )}
          >
            {status.icon}
          </div>
        )}

        {/* Executing Indicator */}
        {isCurrent && isExecuting && (
          <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-75" />
          </div>
        )}
      </div>

      {/* Step Name */}
      <div className={cn('mt-2 text-center', classes.text)}>
        <p className="font-medium truncate max-w-full">{step.name}</p>
        <p className="text-muted-foreground truncate max-w-full">
          {getStepTypeLabel(getStepType(step))}
        </p>
      </div>

      {/* Hover Details */}
      {showDetails && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
          <Card className="p-3 shadow-lg w-48">
            <p className="font-medium text-sm mb-1">{step.name}</p>
            {step.description && (
              <p className="text-xs text-muted-foreground mb-2">{step.description}</p>
            )}
            <div className="flex items-center gap-2 text-xs">
              <span className={cn('px-1.5 py-0.5 rounded', colors.bg, colors.icon)}>
                {getStepTypeLabel(getStepType(step))}
              </span>
              {result?.duration_ms && (
                <span className="text-muted-foreground">
                  {result.duration_ms}ms
                </span>
              )}
            </div>
            {result?.error && (
              <p className="text-xs text-red-500 mt-2 line-clamp-2">{result.error}</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connector Component
// ---------------------------------------------------------------------------

interface ConnectorProps {
  direction: 'horizontal' | 'vertical';
  size: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

function Connector({ direction, size, animated }: ConnectorProps) {
  const lengths = {
    sm: direction === 'horizontal' ? 'w-6' : 'h-6',
    md: direction === 'horizontal' ? 'w-8' : 'h-8',
    lg: direction === 'horizontal' ? 'w-10' : 'h-10',
  };

  if (direction === 'horizontal') {
    return (
      <div className={cn('flex items-center', lengths[size])}>
        <div
          className={cn(
            'h-0.5 flex-1 bg-border',
            animated && 'bg-gradient-to-r from-primary to-border animate-pulse'
          )}
        />
        <ArrowRight
          className={cn(
            'h-4 w-4 text-muted-foreground -ml-1',
            animated && 'text-primary'
          )}
        />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-center', lengths[size])}>
      <div
        className={cn(
          'w-0.5 flex-1 bg-border',
          animated && 'bg-gradient-to-b from-primary to-border animate-pulse'
        )}
      />
      <ArrowDown
        className={cn(
          'h-4 w-4 text-muted-foreground -mt-1',
          animated && 'text-primary'
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkflowPreview Component
// ---------------------------------------------------------------------------

export function WorkflowPreview({
  steps,
  stepResults,
  direction = 'horizontal',
  size = 'md',
  isExecuting = false,
  currentStepIndex,
  showDetails = true,
  onStepClick,
  className,
}: WorkflowPreviewProps) {
  if (steps.length === 0) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No workflow steps defined</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center',
        direction === 'vertical' ? 'flex-col' : 'flex-row flex-wrap justify-center gap-y-4',
        className
      )}
    >
      {steps.map((step, index) => {
        const stepId = 'step_id' in step ? step.step_id : `step-${index}`;
        const result = stepResults?.find(
          (r) =>
            r.step_id === stepId ||
            r.step_name === step.name
        );
        const isCurrent = currentStepIndex === index;

        return (
          <React.Fragment key={stepId}>
            {index > 0 && (
              <Connector
                direction={direction}
                size={size}
                animated={isExecuting && (currentStepIndex ?? -1) >= index}
              />
            )}
            <StepNode
              step={step}
              result={result}
              index={index}
              size={size}
              isExecuting={isExecuting}
              isCurrent={isCurrent}
              showDetails={showDetails}
              onClick={onStepClick ? () => onStepClick(step, index) : undefined}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkflowPreviewCard - Wrapper with title and actions
// ---------------------------------------------------------------------------

export interface WorkflowPreviewCardProps extends Omit<WorkflowPreviewProps, 'className'> {
  /** Title of the workflow */
  title?: string;
  /** Description */
  description?: string;
  /** Action buttons */
  actions?: React.ReactNode;
  /** Additional CSS classes for the card */
  className?: string;
}

export function WorkflowPreviewCard({
  title,
  description,
  actions,
  className,
  ...previewProps
}: WorkflowPreviewCardProps) {
  return (
    <Card className={cn('p-6', className)}>
      {(title || description || actions) && (
        <div className="flex items-start justify-between mb-6">
          <div>
            {title && (
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Play className="h-5 w-5 text-primary" />
                {title}
              </h3>
            )}
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      <div className="overflow-x-auto py-4">
        <WorkflowPreview {...previewProps} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SimpleWorkflowSteps - Compact list view
// ---------------------------------------------------------------------------

export interface SimpleWorkflowStepsProps {
  steps: (WorkflowStepDefinition | WorkflowStepResponse)[];
  className?: string;
}

export function SimpleWorkflowSteps({ steps, className }: SimpleWorkflowStepsProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {steps.map((step, index) => {
        const colors = getStepColors(getStepType(step));
        const stepId = 'step_id' in step ? step.step_id : `step-${index}`;

        return (
          <div
            key={stepId}
            className="flex items-center gap-3 text-sm"
          >
            <div
              className={cn(
                'flex items-center justify-center h-6 w-6 rounded',
                colors.bg,
                colors.icon
              )}
            >
              <div className="h-3 w-3">{getStepIcon(getStepType(step))}</div>
            </div>
            <span className="font-medium">{step.name}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        );
      })}
    </div>
  );
}

export default WorkflowPreview;
