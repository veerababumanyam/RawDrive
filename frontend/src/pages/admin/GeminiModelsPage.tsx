/**
 * Admin Gemini Models Page
 *
 * Admin interface for managing the Gemini model catalogue.
 * Allows admins to create, edit, delete, reorder models and set defaults.
 * Feature: 003-user-gemini-settings
 */

import React, { useState, useCallback } from 'react';
import {
  Cpu,
  Plus,
  Edit2,
  Trash2,
  Star,
  GripVertical,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  Users,
  ChevronDown,
  ChevronUp,
  Key,
  CheckCircle2,
  XCircle,
  Activity,
  BarChart3,
} from 'lucide-react';
import { AppButton } from '../../components/ui/AppButton';
import { ModelFormModal, DeleteConfirmModal } from '../../components/admin/gemini';
import { useAdminGeminiModels, useAdminGeminiStats } from '../../hooks/useAdminGemini';
import type {
  GeminiModelAdmin,
  GeminiAdminStats,
  CreateGeminiModelRequest,
  UpdateGeminiModelRequest,
} from '../../types/geminiSettings';

// ---------------------------------------------------------------------------
// Model Row Component
// ---------------------------------------------------------------------------

interface ModelRowProps {
  model: GeminiModelAdmin;
  onEdit: (model: GeminiModelAdmin) => void;
  onDelete: (model: GeminiModelAdmin) => void;
  onSetDefault: (modelId: string) => Promise<void>;
  onToggleActive: (modelId: string, isActive: boolean) => Promise<void>;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const ModelRow: React.FC<ModelRowProps> = ({
  model,
  onEdit,
  onDelete,
  onSetDefault,
  onToggleActive,
  isExpanded,
  onToggleExpand,
}) => {
  const [isToggling, setIsToggling] = useState(false);
  const [isSettingDefault, setIsSettingDefault] = useState(false);

  const handleToggleActive = async () => {
    setIsToggling(true);
    try {
      await onToggleActive(model.model_id, !model.is_active);
    } finally {
      setIsToggling(false);
    }
  };

  const handleSetDefault = async () => {
    if (model.is_default) return;
    setIsSettingDefault(true);
    try {
      await onSetDefault(model.model_id);
    } finally {
      setIsSettingDefault(false);
    }
  };

  return (
    <div
      className={`glass-list-item rounded-xl p-4 transition-all ${
        !model.is_active ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-center gap-4">
        {/* Drag Handle */}
        <div className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-surface-hover">
          <GripVertical className="w-5 h-5 text-text-tertiary" />
        </div>

        {/* Model Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-text-primary">{model.display_name}</span>
            {model.is_default && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gold/10 text-gold text-xs font-medium rounded-full">
                <Star className="w-3 h-3" />
                Default
              </span>
            )}
            {!model.is_active && (
              <span className="inline-flex items-center px-2 py-0.5 bg-error/10 text-error text-xs font-medium rounded-full">
                Inactive
              </span>
            )}
          </div>
          <p className="text-sm text-text-secondary font-mono">{model.identifier}</p>
        </div>

        {/* User Count */}
        <div className="flex items-center gap-1.5 text-text-secondary">
          <Users className="w-4 h-4" />
          <span className="text-sm">{model.user_count}</span>
        </div>

        {/* Active Toggle */}
        <button
          onClick={handleToggleActive}
          disabled={isToggling || model.is_default}
          className={`p-2 rounded-lg transition-colors ${
            model.is_default
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:bg-surface-hover'
          }`}
          aria-label={model.is_active ? 'Deactivate model' : 'Activate model'}
          title={model.is_default ? 'Cannot deactivate default model' : undefined}
        >
          {model.is_active ? (
            <ToggleRight className="w-6 h-6 text-success" />
          ) : (
            <ToggleLeft className="w-6 h-6 text-text-tertiary" />
          )}
        </button>

        {/* Set Default Button */}
        {!model.is_default && model.is_active && (
          <button
            onClick={handleSetDefault}
            disabled={isSettingDefault}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
            aria-label="Set as default model"
            title="Set as default"
          >
            <Star className="w-5 h-5 text-text-tertiary hover:text-gold" />
          </button>
        )}

        {/* Edit Button */}
        <button
          onClick={() => onEdit(model)}
          className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
          aria-label="Edit model"
        >
          <Edit2 className="w-5 h-5 text-text-tertiary hover:text-primary" />
        </button>

        {/* Delete Button */}
        <button
          onClick={() => onDelete(model)}
          disabled={model.is_default}
          className={`p-2 rounded-lg transition-colors ${
            model.is_default
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:bg-error/10'
          }`}
          aria-label="Delete model"
          title={model.is_default ? 'Cannot delete default model' : undefined}
        >
          <Trash2
            className={`w-5 h-5 ${
              model.is_default ? 'text-text-tertiary' : 'text-text-tertiary hover:text-error'
            }`}
          />
        </button>

        {/* Expand/Collapse */}
        <button
          onClick={onToggleExpand}
          className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
          aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
        >
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-text-tertiary" />
          ) : (
            <ChevronDown className="w-5 h-5 text-text-tertiary" />
          )}
        </button>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-border space-y-3">
          {model.description && (
            <div>
              <span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
                Description
              </span>
              <p className="text-sm text-text-secondary mt-1">{model.description}</p>
            </div>
          )}

          {model.capabilities && model.capabilities.length > 0 && (
            <div>
              <span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
                Capabilities
              </span>
              <div className="flex flex-wrap gap-2 mt-1">
                {model.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="inline-flex items-center px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-full"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-text-tertiary">Sort Order:</span>{' '}
              <span className="text-text-primary">{model.sort_order}</span>
            </div>
            <div>
              <span className="text-text-tertiary">Created:</span>{' '}
              <span className="text-text-primary">
                {new Date(model.created_at).toLocaleDateString()}
              </span>
            </div>
            <div>
              <span className="text-text-tertiary">Updated:</span>{' '}
              <span className="text-text-primary">
                {new Date(model.updated_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Stats Dashboard Component
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  colorClass?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  subtext,
  colorClass = 'text-primary',
}) => (
  <div className="glass-card rounded-xl p-4">
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg bg-surface-hover ${colorClass}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-text-primary">{value}</p>
        {subtext && <p className="text-xs text-text-secondary truncate">{subtext}</p>}
      </div>
    </div>
  </div>
);

interface StatsDashboardProps {
  stats: GeminiAdminStats | null;
  isLoading: boolean;
  error: string | null;
}

const StatsDashboard: React.FC<StatsDashboardProps> = ({ stats, isLoading, error }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 text-text-secondary">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-sm">Loading statistics...</span>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return null; // Silently hide stats if there's an error
  }

  const configuredPercent =
    stats.total_users > 0
      ? Math.round((stats.users_with_key / stats.total_users) * 100)
      : 0;

  return (
    <div className="glass-card rounded-xl mb-6 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-surface-hover/50 transition-colors"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-accent" />
          <span className="font-medium text-text-primary">User Configuration Statistics</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-text-tertiary" />
        ) : (
          <ChevronDown className="w-5 h-5 text-text-tertiary" />
        )}
      </button>

      {/* Stats Grid */}
      {isExpanded && (
        <div className="p-4 pt-0 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={<Users className="w-5 h-5" />}
              label="Total Users"
              value={stats.total_users}
              subtext="In platform"
              colorClass="text-text-secondary"
            />
            <StatCard
              icon={<Key className="w-5 h-5" />}
              label="Configured"
              value={stats.users_with_key}
              subtext={`${configuredPercent}% of users`}
              colorClass="text-accent"
            />
            <StatCard
              icon={<CheckCircle2 className="w-5 h-5" />}
              label="Connected"
              value={stats.users_connected}
              subtext="Active & validated"
              colorClass="text-success"
            />
            <StatCard
              icon={<XCircle className="w-5 h-5" />}
              label="Failed"
              value={stats.users_failed}
              subtext="Validation errors"
              colorClass="text-error"
            />
          </div>

          {/* AI Usage Stats */}
          {(stats.recent_ai_calls > 0 || stats.ai_success_rate > 0) && (
            <div className="pt-4 border-t border-border">
              <h4 className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-3">
                AI Usage (Last 24h)
              </h4>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-accent" />
                  <span className="text-sm text-text-secondary">
                    <strong className="text-text-primary">{stats.recent_ai_calls}</strong> API calls
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span className="text-sm text-text-secondary">
                    <strong className="text-text-primary">{stats.ai_success_rate.toFixed(1)}%</strong>{' '}
                    success rate
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Model Distribution */}
          {stats.model_distribution.length > 0 && (
            <div className="pt-4 border-t border-border">
              <h4 className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-3">
                Model Distribution
              </h4>
              <div className="space-y-2">
                {stats.model_distribution.map((dist) => {
                  const percent =
                    stats.users_with_key > 0
                      ? Math.round((dist.user_count / stats.users_with_key) * 100)
                      : 0;
                  return (
                    <div key={dist.model_identifier} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-text-primary font-medium truncate">
                            {dist.display_name}
                          </span>
                          <span className="text-text-secondary ml-2">
                            {dist.user_count} user{dist.user_count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-accent to-primary rounded-full transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

const GeminiModelsPage: React.FC = () => {
  const {
    models,
    isLoading,
    error,
    refresh,
    createModel,
    updateModel,
    deleteModel,
    setDefaultModel,
    toggleModelActive,
  } = useAdminGeminiModels();

  const {
    stats,
    isLoading: statsLoading,
    error: statsError,
  } = useAdminGeminiStats();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<GeminiModelAdmin | null>(null);
  const [deletingModel, setDeletingModel] = useState<GeminiModelAdmin | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);

  const handleOpenAdd = useCallback(() => {
    setEditingModel(null);
    setIsFormOpen(true);
  }, []);

  const handleOpenEdit = useCallback((model: GeminiModelAdmin) => {
    setEditingModel(model);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingModel(null);
  }, []);

  const handleSubmitForm = useCallback(
    async (data: CreateGeminiModelRequest | UpdateGeminiModelRequest) => {
      setIsSaving(true);
      try {
        if (editingModel) {
          await updateModel(editingModel.model_id, data);
        } else {
          await createModel(data as CreateGeminiModelRequest);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [editingModel, createModel, updateModel]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingModel) return;
    setIsSaving(true);
    try {
      await deleteModel(deletingModel.model_id);
    } finally {
      setIsSaving(false);
    }
  }, [deletingModel, deleteModel]);

  const handleToggleExpand = useCallback((modelId: string) => {
    setExpandedModelId((prev) => (prev === modelId ? null : modelId));
  }, []);

  // Sort models by sort_order for display
  const sortedModels = [...models].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Page Header */}
      <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gradient flex items-center gap-3">
                <div className="section-header-icon icon-container-accent">
                  <Cpu className="w-5 h-5" />
                </div>
                Gemini Model Catalogue
              </h1>
              <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                Manage available AI models for user selection
              </p>
            </div>
            <AppButton variant="primary" onClick={handleOpenAdd} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Model
            </AppButton>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        {/* Stats Dashboard */}
        <StatsDashboard stats={stats} isLoading={statsLoading} error={statsError} />

        {/* Error State */}
        {error && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-error/10 border border-error/20 rounded-xl text-error">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
            <AppButton variant="outline" size="sm" onClick={refresh} className="ml-auto">
              Retry
            </AppButton>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && models.length === 0 && (
          <div className="text-center py-12 glass-card rounded-2xl">
            <Cpu className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">No models configured</h3>
            <p className="text-text-secondary mb-6">
              Add Gemini models for users to choose from when configuring their AI settings.
            </p>
            <AppButton variant="primary" onClick={handleOpenAdd}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Model
            </AppButton>
          </div>
        )}

        {/* Models List */}
        {!isLoading && sortedModels.length > 0 && (
          <div className="space-y-3">
            {sortedModels.map((model) => (
              <ModelRow
                key={model.model_id}
                model={model}
                onEdit={handleOpenEdit}
                onDelete={setDeletingModel}
                onSetDefault={setDefaultModel}
                onToggleActive={toggleModelActive}
                isExpanded={expandedModelId === model.model_id}
                onToggleExpand={() => handleToggleExpand(model.model_id)}
              />
            ))}
          </div>
        )}

        {/* Stats Summary */}
        {!isLoading && models.length > 0 && (
          <div className="mt-8 p-4 glass-card rounded-xl">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">
                {models.length} model{models.length > 1 ? 's' : ''} total
              </span>
              <span className="text-text-secondary">
                {models.filter((m) => m.is_active).length} active
              </span>
              <span className="text-text-secondary">
                {models.reduce((acc, m) => acc + m.user_count, 0)} users assigned
              </span>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <ModelFormModal
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={handleSubmitForm}
        model={editingModel}
        isLoading={isSaving}
      />

      <DeleteConfirmModal
        isOpen={!!deletingModel}
        onClose={() => setDeletingModel(null)}
        onConfirm={handleDeleteConfirm}
        model={deletingModel}
        isLoading={isSaving}
      />
    </div>
  );
};

export default GeminiModelsPage;
