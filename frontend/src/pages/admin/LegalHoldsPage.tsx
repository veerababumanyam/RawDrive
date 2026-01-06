/**
 * Legal Holds Page
 *
 * Admin interface for managing legal holds for litigation,
 * regulatory compliance, and data preservation requirements.
 * Provides functionality to view, filter, create, and manage legal holds.
 *
 * Part of the Audit & Compliance system implementation.
 *
 * @module LegalHoldsPage
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Shield,
  Search,
  RefreshCcw,
  Plus,
  Filter,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  X,
  Play,
  Pause,
  Lock,
  Unlock,
  Calendar,
  FileText,
  Users,
  Database,
  AlertTriangle,
  Briefcase,
  Scale,
  Building,
  Eye,
} from 'lucide-react';
import { AppButton } from '../../components/ui/AppButton';
import { DataTable, TablePagination, type Column } from '../../components/ui/DataTable';
import { DatePicker } from '../../components/ui/DatePicker';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui';
import {
  listLegalHolds,
  getLegalHold,
  createLegalHold,
  activateLegalHold,
  suspendLegalHold,
  releaseLegalHold,
  getLegalHoldStats,
} from '../../services/complianceService';
import type {
  LegalHold,
  LegalHoldSummary,
  CreateLegalHoldRequest,
  ListLegalHoldsQuery,
  LegalHoldType,
  LegalHoldStatus,
  LegalHoldPriority,
  LegalHoldStats,
} from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FilterState {
  search: string;
  hold_type: string;
  status: string;
  priority: string;
  start_date: string;
  end_date: string;
}

const initialFilters: FilterState = {
  search: '',
  hold_type: '',
  status: '',
  priority: '',
  start_date: '',
  end_date: '',
};

// ---------------------------------------------------------------------------
// Constants for filter options
// ---------------------------------------------------------------------------

const HOLD_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'litigation', label: 'Litigation' },
  { value: 'regulatory', label: 'Regulatory' },
  { value: 'internal_audit', label: 'Internal Audit' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'preservation', label: 'Preservation' },
  { value: 'subpoena', label: 'Subpoena' },
  { value: 'government', label: 'Government' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'released', label: 'Released' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

// ---------------------------------------------------------------------------
// Stat Card Component
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
  <div className="glass-card rounded-xl p-4 hover:shadow-lg transition-shadow">
    <div className="flex items-center gap-3">
      <div className={`p-2.5 rounded-lg bg-surface-hover ${colorClass}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-text-primary">{value}</p>
        {subtext && <p className="text-xs text-text-secondary truncate">{subtext}</p>}
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Filter Panel Component
// ---------------------------------------------------------------------------

interface FilterPanelProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClearFilters: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onFiltersChange,
  onClearFilters,
  isExpanded,
  onToggleExpand,
}) => {
  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (key === 'search') return false;
    return value !== '';
  });

  return (
    <div className="glass-card rounded-xl overflow-hidden mb-6">
      {/* Filter Header */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between p-4 hover:bg-surface-hover/50 transition-colors"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-accent" />
          <span className="font-medium text-text-primary">Filters</span>
          {hasActiveFilters && (
            <span className="inline-flex items-center px-2 py-0.5 bg-accent/10 text-accent text-xs font-medium rounded-full">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClearFilters();
              }}
              className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-text-tertiary" />
          ) : (
            <ChevronDown className="w-5 h-5 text-text-tertiary" />
          )}
        </div>
      </button>

      {/* Filter Content */}
      {isExpanded && (
        <div className="p-4 pt-0 border-t border-border space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Hold Type */}
            <div>
              <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
                Hold Type
              </label>
              <select
                value={filters.hold_type}
                onChange={(e) => onFiltersChange({ ...filters, hold_type: e.target.value })}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {HOLD_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
                Priority
              </label>
              <select
                value={filters.priority}
                onChange={(e) => onFiltersChange({ ...filters, priority: e.target.value })}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DatePicker
              label="Effective From"
              value={filters.start_date}
              onChange={(date) => onFiltersChange({ ...filters, start_date: date })}
              placeholder="From date"
            />
            <DatePicker
              label="Effective Until"
              value={filters.end_date}
              onChange={(date) => onFiltersChange({ ...filters, end_date: date })}
              placeholder="To date"
              minDate={filters.start_date ? new Date(filters.start_date) : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Status Badge Component
// ---------------------------------------------------------------------------

interface StatusBadgeProps {
  status: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getStatusStyle = () => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-success/10 text-success';
      case 'draft':
      case 'pending_approval':
        return 'bg-gold/10 text-gold';
      case 'suspended':
        return 'bg-orange-500/10 text-orange-500';
      case 'released':
        return 'bg-accent/10 text-accent';
      case 'expired':
      case 'cancelled':
        return 'bg-text-tertiary/10 text-text-tertiary';
      default:
        return 'bg-text-tertiary/10 text-text-tertiary';
    }
  };

  const getStatusIcon = () => {
    switch (status.toLowerCase()) {
      case 'active':
        return <Lock className="w-3 h-3" />;
      case 'draft':
        return <FileText className="w-3 h-3" />;
      case 'pending_approval':
        return <Clock className="w-3 h-3" />;
      case 'suspended':
        return <Pause className="w-3 h-3" />;
      case 'released':
        return <Unlock className="w-3 h-3" />;
      case 'expired':
        return <XCircle className="w-3 h-3" />;
      case 'cancelled':
        return <XCircle className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const formatStatus = (s: string) => {
    return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${getStatusStyle()}`}
    >
      {getStatusIcon()}
      {formatStatus(status)}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Priority Badge Component
// ---------------------------------------------------------------------------

interface PriorityBadgeProps {
  priority: string;
}

const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority }) => {
  const getPriorityStyle = () => {
    switch (priority.toLowerCase()) {
      case 'critical':
        return 'bg-error/10 text-error border-error/20';
      case 'high':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'normal':
        return 'bg-accent/10 text-accent border-accent/20';
      case 'low':
        return 'bg-text-tertiary/10 text-text-tertiary border-text-tertiary/20';
      default:
        return 'bg-text-tertiary/10 text-text-tertiary border-text-tertiary/20';
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${getPriorityStyle()}`}
    >
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Hold Type Icon Component
// ---------------------------------------------------------------------------

interface HoldTypeIconProps {
  type: string;
}

const HoldTypeIcon: React.FC<HoldTypeIconProps> = ({ type }) => {
  const getIcon = () => {
    switch (type.toLowerCase()) {
      case 'litigation':
        return <Scale className="w-4 h-4" />;
      case 'regulatory':
        return <Building className="w-4 h-4" />;
      case 'internal_audit':
        return <Eye className="w-4 h-4" />;
      case 'compliance':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'preservation':
        return <Database className="w-4 h-4" />;
      case 'subpoena':
        return <FileText className="w-4 h-4" />;
      case 'government':
        return <Building className="w-4 h-4" />;
      default:
        return <Shield className="w-4 h-4" />;
    }
  };

  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-primary">
      {getIcon()}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Create Hold Modal Component
// ---------------------------------------------------------------------------

interface CreateHoldModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: CreateLegalHoldRequest) => Promise<void>;
  isCreating: boolean;
}

const CreateHoldModal: React.FC<CreateHoldModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  isCreating,
}) => {
  const [formData, setFormData] = useState<CreateLegalHoldRequest>({
    name: '',
    description: '',
    hold_type: 'litigation' as LegalHoldType,
    priority: 'normal' as LegalHoldPriority,
    matter_name: '',
    legal_counsel: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreate(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative glass-card rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Create Legal Hold</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-text-tertiary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Hold Name */}
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Hold Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="e.g., Smith v. Company Litigation"
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Hold Type */}
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Hold Type *
            </label>
            <select
              value={formData.hold_type}
              onChange={(e) => setFormData({ ...formData, hold_type: e.target.value as LegalHoldType })}
              required
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {HOLD_TYPES.filter((t) => t.value !== '').map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Priority
            </label>
            <select
              value={formData.priority || 'normal'}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value as LegalHoldPriority })}
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {PRIORITY_OPTIONS.filter((p) => p.value !== '').map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Matter Name */}
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Matter/Case Name
            </label>
            <input
              type="text"
              value={formData.matter_name || ''}
              onChange={(e) => setFormData({ ...formData, matter_name: e.target.value })}
              placeholder="e.g., Case No. 2024-CV-1234"
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Legal Counsel */}
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Legal Counsel
            </label>
            <input
              type="text"
              value={formData.legal_counsel || ''}
              onChange={(e) => setFormData({ ...formData, legal_counsel: e.target.value })}
              placeholder="e.g., Jane Smith, Esq."
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Description
            </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="Additional details about the legal hold..."
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <AppButton variant="secondary" onClick={onClose} disabled={isCreating}>
              Cancel
            </AppButton>
            <AppButton
              type="submit"
              variant="primary"
              disabled={isCreating || !formData.name}
              className="flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create Hold
                </>
              )}
            </AppButton>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Hold Detail Modal Component
// ---------------------------------------------------------------------------

interface HoldDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  hold: LegalHold | null;
  onActivate: () => Promise<void>;
  onSuspend: (reason?: string) => Promise<void>;
  onRelease: (reason: string) => Promise<void>;
  isLoading: boolean;
}

const HoldDetailModal: React.FC<HoldDetailModalProps> = ({
  isOpen,
  onClose,
  hold,
  onActivate,
  onSuspend,
  onRelease,
  isLoading,
}) => {
  const [releaseReason, setReleaseReason] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [showReleaseForm, setShowReleaseForm] = useState(false);
  const [showSuspendForm, setShowSuspendForm] = useState(false);

  if (!isOpen || !hold) return null;

  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const formatHoldType = (type: string): string => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const canActivate = hold.status === 'draft' || hold.status === 'pending_approval' || hold.status === 'suspended';
  const canSuspend = hold.status === 'active';
  const canRelease = hold.status === 'active' || hold.status === 'suspended';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative glass-card rounded-xl p-6 max-w-2xl w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">
              Hold #{hold.hold_number}
            </h3>
            <p className="text-sm text-text-secondary">
              {formatHoldType(hold.hold_type)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-text-tertiary" />
          </button>
        </div>

        {/* Status and Priority */}
        <div className="flex items-center gap-3 mb-6">
          <StatusBadge status={hold.status} />
          <PriorityBadge priority={hold.priority} />
        </div>

        {/* Hold Name */}
        <div className="mb-6">
          <h4 className="text-lg font-medium text-text-primary">{hold.name}</h4>
          {hold.description && (
            <p className="text-sm text-text-secondary mt-2">{hold.description}</p>
          )}
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Matter Name</span>
            <p className="text-sm text-text-primary font-medium">{hold.matter_name || '-'}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Legal Counsel</span>
            <p className="text-sm text-text-primary">{hold.legal_counsel || '-'}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Law Firm</span>
            <p className="text-sm text-text-primary">{hold.law_firm || '-'}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">External Reference</span>
            <p className="text-sm text-text-primary">{hold.external_reference || '-'}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Effective From</span>
            <p className="text-sm text-text-primary">{formatDate(hold.effective_from)}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Effective Until</span>
            <p className="text-sm text-text-primary">{hold.effective_until ? formatDate(hold.effective_until) : 'Indefinite'}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Issued At</span>
            <p className="text-sm text-text-primary">{formatDate(hold.issued_at)}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Scope Type</span>
            <p className="text-sm text-text-primary capitalize">{hold.scope_type.replace(/_/g, ' ')}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-3 bg-surface-hover rounded-lg text-center">
            <p className="text-2xl font-bold text-primary">{hold.affected_users_count}</p>
            <p className="text-xs text-text-tertiary">Affected Users</p>
          </div>
          <div className="p-3 bg-surface-hover rounded-lg text-center">
            <p className="text-2xl font-bold text-accent">{hold.affected_resources_count}</p>
            <p className="text-xs text-text-tertiary">Resources Held</p>
          </div>
          <div className="p-3 bg-surface-hover rounded-lg text-center">
            <p className="text-2xl font-bold text-error">{hold.blocked_deletions_count}</p>
            <p className="text-xs text-text-tertiary">Blocked Deletions</p>
          </div>
        </div>

        {/* Release Warning */}
        {hold.status === 'released' && hold.release_reason && (
          <div className="mb-6 flex items-start gap-3 p-4 bg-accent/10 border border-accent/20 rounded-lg">
            <Unlock className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-accent">Hold Released</p>
              <p className="text-sm text-accent/80">{hold.release_reason}</p>
              {hold.released_at && (
                <p className="text-xs text-accent/60 mt-1">Released on {formatDate(hold.released_at)}</p>
              )}
            </div>
          </div>
        )}

        {/* Suspended Warning */}
        {hold.status === 'suspended' && hold.status_reason && (
          <div className="mb-6 flex items-start gap-3 p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
            <Pause className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-orange-500">Hold Suspended</p>
              <p className="text-sm text-orange-500/80">{hold.status_reason}</p>
            </div>
          </div>
        )}

        {/* Release Form */}
        {showReleaseForm && (
          <div className="mb-6 p-4 bg-surface-hover rounded-lg">
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Release Reason *
            </label>
            <textarea
              value={releaseReason}
              onChange={(e) => setReleaseReason(e.target.value)}
              rows={2}
              placeholder="Provide a reason for releasing this hold..."
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none mb-3"
            />
            <div className="flex justify-end gap-2">
              <AppButton variant="secondary" size="sm" onClick={() => setShowReleaseForm(false)}>
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                size="sm"
                onClick={() => {
                  onRelease(releaseReason);
                  setShowReleaseForm(false);
                  setReleaseReason('');
                }}
                disabled={!releaseReason.trim() || isLoading}
                className="bg-accent hover:bg-accent/90"
              >
                Confirm Release
              </AppButton>
            </div>
          </div>
        )}

        {/* Suspend Form */}
        {showSuspendForm && (
          <div className="mb-6 p-4 bg-surface-hover rounded-lg">
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Suspension Reason
            </label>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              rows={2}
              placeholder="Provide a reason for suspending this hold..."
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none mb-3"
            />
            <div className="flex justify-end gap-2">
              <AppButton variant="secondary" size="sm" onClick={() => setShowSuspendForm(false)}>
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                size="sm"
                onClick={() => {
                  onSuspend(suspendReason || undefined);
                  setShowSuspendForm(false);
                  setSuspendReason('');
                }}
                disabled={isLoading}
                className="bg-orange-500 hover:bg-orange-500/90"
              >
                Confirm Suspend
              </AppButton>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
          {canActivate && (
            <AppButton
              variant="primary"
              onClick={onActivate}
              disabled={isLoading}
              className="flex items-center gap-2 bg-success hover:bg-success/90"
            >
              <Play className="w-4 h-4" />
              Activate
            </AppButton>
          )}
          {canSuspend && !showSuspendForm && (
            <AppButton
              variant="secondary"
              onClick={() => setShowSuspendForm(true)}
              disabled={isLoading}
              className="flex items-center gap-2 text-orange-500 hover:bg-orange-500/10"
            >
              <Pause className="w-4 h-4" />
              Suspend
            </AppButton>
          )}
          {canRelease && !showReleaseForm && (
            <AppButton
              variant="secondary"
              onClick={() => setShowReleaseForm(true)}
              disabled={isLoading}
              className="flex items-center gap-2 text-accent hover:bg-accent/10"
            >
              <Unlock className="w-4 h-4" />
              Release
            </AppButton>
          )}
          <AppButton variant="secondary" onClick={onClose} className="ml-auto">
            Close
          </AppButton>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

const LegalHoldsPage: React.FC = () => {
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const workspaceId = workspace?.workspace_id;

  // Filter state
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Data state
  const [holds, setHolds] = useState<LegalHoldSummary[]>([]);
  const [meta, setMeta] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } | null>(null);
  const [stats, setStats] = useState<LegalHoldStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState(1);

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedHoldId, setSelectedHoldId] = useState<string | null>(null);
  const [selectedHold, setSelectedHold] = useState<LegalHold | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Track mounted state
  const isMountedRef = useRef(true);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch holds
  const fetchHolds = useCallback(async () => {
    if (!workspaceId) {
      setIsLoading(false);
      return;
    }

    setIsFetching(true);
    setError(null);

    try {
      const query: ListLegalHoldsQuery = {
        page,
        limit: 25,
        hold_type: filters.hold_type as LegalHoldType || undefined,
        status: filters.status as LegalHoldStatus || undefined,
        priority: filters.priority as LegalHoldPriority || undefined,
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
      };

      const response = await listLegalHolds(workspaceId, query);

      if (isMountedRef.current) {
        // Filter by search query client-side (since API may not support text search)
        let filteredData = response.data;
        if (debouncedSearch) {
          const searchLower = debouncedSearch.toLowerCase();
          filteredData = response.data.filter(
            (hold) =>
              hold.name.toLowerCase().includes(searchLower) ||
              hold.hold_number.toLowerCase().includes(searchLower)
          );
        }
        setHolds(filteredData);
        setMeta(response.meta);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error('Failed to fetch legal holds'));
        setHolds([]);
        setMeta(null);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsFetching(false);
      }
    }
  }, [workspaceId, page, debouncedSearch, filters]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!workspaceId) return;

    try {
      const statsData = await getLegalHoldStats(workspaceId);
      if (isMountedRef.current) {
        setStats(statsData);
      }
    } catch {
      // Stats failure is non-critical
    }
  }, [workspaceId]);

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchHolds();
    fetchStats();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchHolds, fetchStats]);

  // Handlers
  const handleClearFilters = useCallback(() => {
    setFilters(initialFilters);
    setSearchQuery('');
    setPage(1);
  }, []);

  const handleCreateHold = useCallback(async (data: CreateLegalHoldRequest) => {
    if (!workspaceId) return;

    setIsCreating(true);
    try {
      await createLegalHold(workspaceId, data);
      addToast({
        variant: 'success',
        title: 'Legal Hold Created',
        message: 'Legal hold has been created successfully.',
        duration: 5000,
      });
      setIsCreateModalOpen(false);
      fetchHolds();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Creation Failed',
        message: err instanceof Error ? err.message : 'Failed to create legal hold',
        duration: 5000,
      });
    } finally {
      setIsCreating(false);
    }
  }, [workspaceId, addToast, fetchHolds, fetchStats]);

  const handleRowClick = useCallback(async (row: LegalHoldSummary) => {
    if (!workspaceId) return;

    setSelectedHoldId(row.hold_id);
    setIsDetailModalOpen(true);

    try {
      const fullHold = await getLegalHold(workspaceId, row.hold_id);
      if (isMountedRef.current) {
        setSelectedHold(fullHold);
      }
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Error',
        message: 'Failed to load hold details',
        duration: 5000,
      });
      setIsDetailModalOpen(false);
    }
  }, [workspaceId, addToast]);

  const handleActivate = useCallback(async () => {
    if (!workspaceId || !selectedHoldId) return;

    setIsActionLoading(true);
    try {
      const updated = await activateLegalHold(workspaceId, selectedHoldId);
      setSelectedHold(updated);
      addToast({
        variant: 'success',
        title: 'Hold Activated',
        message: 'The legal hold is now active.',
        duration: 3000,
      });
      fetchHolds();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Failed to activate hold',
        duration: 5000,
      });
    } finally {
      setIsActionLoading(false);
    }
  }, [workspaceId, selectedHoldId, addToast, fetchHolds, fetchStats]);

  const handleSuspend = useCallback(async (reason?: string) => {
    if (!workspaceId || !selectedHoldId) return;

    setIsActionLoading(true);
    try {
      const updated = await suspendLegalHold(workspaceId, selectedHoldId, reason);
      setSelectedHold(updated);
      addToast({
        variant: 'success',
        title: 'Hold Suspended',
        message: 'The legal hold has been suspended.',
        duration: 3000,
      });
      fetchHolds();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Failed to suspend hold',
        duration: 5000,
      });
    } finally {
      setIsActionLoading(false);
    }
  }, [workspaceId, selectedHoldId, addToast, fetchHolds, fetchStats]);

  const handleRelease = useCallback(async (reason: string) => {
    if (!workspaceId || !selectedHoldId) return;

    setIsActionLoading(true);
    try {
      const updated = await releaseLegalHold(workspaceId, selectedHoldId, reason);
      setSelectedHold(updated);
      addToast({
        variant: 'success',
        title: 'Hold Released',
        message: 'The legal hold has been released.',
        duration: 3000,
      });
      fetchHolds();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Failed to release hold',
        duration: 5000,
      });
    } finally {
      setIsActionLoading(false);
    }
  }, [workspaceId, selectedHoldId, addToast, fetchHolds, fetchStats]);

  const handleCloseDetailModal = useCallback(() => {
    setIsDetailModalOpen(false);
    setSelectedHold(null);
    setSelectedHoldId(null);
  }, []);

  // Table columns
  const columns: Column<LegalHoldSummary>[] = useMemo(() => [
    {
      id: 'hold_number',
      header: 'Hold',
      accessor: 'hold_number',
      width: '140px',
      cell: (value, row) => (
        <div className="flex items-center gap-2">
          <HoldTypeIcon type={row.hold_type} />
          <div>
            <div className="font-medium text-text-primary text-xs">{String(value)}</div>
            <div className="text-xs text-text-tertiary capitalize">
              {row.hold_type.replace(/_/g, ' ')}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'name',
      header: 'Name',
      accessor: 'name',
      cell: (value) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <Briefcase className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm text-text-primary truncate max-w-[180px]">{String(value)}</span>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessor: 'status',
      width: '140px',
      cell: (value) => <StatusBadge status={String(value)} />,
    },
    {
      id: 'priority',
      header: 'Priority',
      accessor: 'priority',
      width: '100px',
      hideOnMobile: true,
      cell: (value) => <PriorityBadge priority={String(value)} />,
    },
    {
      id: 'affected_resources_count',
      header: 'Resources',
      accessor: 'affected_resources_count',
      width: '100px',
      hideOnMobile: true,
      cell: (value) => (
        <div className="flex items-center gap-1">
          <Database className="w-3.5 h-3.5 text-text-tertiary" />
          <span className="text-sm text-text-primary">{String(value)}</span>
        </div>
      ),
    },
    {
      id: 'effective_from',
      header: 'Effective',
      accessor: 'effective_from',
      width: '120px',
      hideOnMobile: true,
      cell: (value, row) => {
        const fromDate = new Date(String(value));
        return (
          <div className="text-xs">
            <div className="text-text-primary">{fromDate.toLocaleDateString()}</div>
            <div className="text-text-tertiary">
              {row.effective_until ? `Until ${new Date(row.effective_until).toLocaleDateString()}` : 'Indefinite'}
            </div>
          </div>
        );
      },
    },
  ], []);

  // Calculate stats display values
  const totalHolds = stats?.total_holds ?? 0;
  const activeHolds = stats?.by_status?.active ?? 0;
  const resourcesHeld = stats?.total_resources_held ?? 0;
  const blockedDeletions = stats?.total_blocked_deletions ?? 0;

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Page Header */}
      <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gradient flex items-center gap-3">
                <div className="section-header-icon icon-container-accent">
                  <Shield className="w-5 h-5" />
                </div>
                Legal Holds
              </h1>
              <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                Manage litigation holds and data preservation requirements
              </p>
            </div>
            <div className="flex items-center gap-3">
              <AppButton
                variant="secondary"
                onClick={() => {
                  fetchHolds();
                  fetchStats();
                }}
                disabled={isFetching}
                className="flex items-center gap-2"
              >
                <RefreshCcw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </AppButton>
              <AppButton
                variant="primary"
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Hold</span>
              </AppButton>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-error/10 border border-error/20 rounded-xl text-error">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error.message}</span>
            <button
              onClick={fetchHolds}
              className="ml-auto p-1 hover:bg-error/10 rounded"
            >
              <RefreshCcw className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={<Shield className="w-5 h-5" />}
            label="Total Holds"
            value={totalHolds}
            subtext="All legal holds"
            colorClass="text-primary"
          />
          <StatCard
            icon={<Lock className="w-5 h-5" />}
            label="Active"
            value={activeHolds}
            subtext="Currently enforced"
            colorClass="text-success"
          />
          <StatCard
            icon={<Database className="w-5 h-5" />}
            label="Resources Held"
            value={resourcesHeld}
            subtext="Under preservation"
            colorClass="text-accent"
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5" />}
            label="Blocked Deletions"
            value={blockedDeletions}
            subtext="Deletion attempts blocked"
            colorClass="text-error"
          />
        </div>

        {/* Search Bar */}
        <div className="glass-card rounded-xl p-4 mb-4">
          <div className="relative">
            <Search className="w-5 h-5 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by hold name or number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-surface-hover rounded"
              >
                <X className="w-4 h-4 text-text-tertiary" />
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <FilterPanel
          filters={filters}
          onFiltersChange={(newFilters) => {
            setFilters(newFilters);
            setPage(1);
          }}
          onClearFilters={handleClearFilters}
          isExpanded={isFilterExpanded}
          onToggleExpand={() => setIsFilterExpanded(!isFilterExpanded)}
        />

        {/* Legal Holds Table */}
        <div className="glass-card rounded-xl overflow-hidden">
          <DataTable
            data={holds}
            columns={columns}
            keyAccessor="hold_id"
            isLoading={isLoading}
            emptyMessage="No legal holds found"
            hoverable
            stickyHeader
            maxHeight="500px"
            onRowClick={handleRowClick}
          />

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <TablePagination
              page={meta.page}
              totalPages={meta.totalPages}
              totalItems={meta.total}
              pageSize={meta.limit}
              onPageChange={setPage}
            />
          )}
        </div>

        {/* Summary Footer */}
        {!isLoading && holds.length > 0 && (
          <div className="mt-4 text-center text-sm text-text-tertiary">
            Showing {holds.length} of {meta?.total || 0} legal holds
          </div>
        )}
      </main>

      {/* Create Hold Modal */}
      <CreateHoldModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateHold}
        isCreating={isCreating}
      />

      {/* Hold Detail Modal */}
      <HoldDetailModal
        isOpen={isDetailModalOpen}
        onClose={handleCloseDetailModal}
        hold={selectedHold}
        onActivate={handleActivate}
        onSuspend={handleSuspend}
        onRelease={handleRelease}
        isLoading={isActionLoading}
      />
    </div>
  );
};

export default LegalHoldsPage;
