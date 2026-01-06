/**
 * Data Subject Requests Page
 *
 * Admin interface for managing GDPR/CCPA/DPDP data subject requests.
 * Provides functionality to view, filter, create, and manage DSRs
 * including access, erasure, rectification, and portability requests.
 *
 * Part of the Audit & Compliance system implementation.
 *
 * @module DataSubjectRequestsPage
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  UserX,
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
  Mail,
  Eye,
  Trash2,
  Download,
  Edit3,
  Shield,
  AlertTriangle,
  Calendar,
  User,
  Play,
  Pause,
  Ban,
} from 'lucide-react';
import { AppButton } from '../../components/ui/AppButton';
import { DataTable, TablePagination, type Column } from '../../components/ui/DataTable';
import { DatePicker } from '../../components/ui/DatePicker';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui';
import {
  listDataSubjectRequests,
  getDataSubjectRequest,
  createDataSubjectRequest,
  acknowledgeDataSubjectRequest,
  startProcessingDataSubjectRequest,
  completeDataSubjectRequest,
  rejectDataSubjectRequest,
  cancelDataSubjectRequest,
  getDataSubjectRequestStats,
} from '../../services/complianceService';
import type {
  DataSubjectRequest,
  DataSubjectRequestSummary,
  CreateDataSubjectRequestRequest,
  ListDataSubjectRequestsQuery,
  DSRRequestType,
  DSRStatus,
  DSRPriority,
  DSRStats,
} from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FilterState {
  search: string;
  request_type: string;
  status: string;
  priority: string;
  start_date: string;
  end_date: string;
}

const initialFilters: FilterState = {
  search: '',
  request_type: '',
  status: '',
  priority: '',
  start_date: '',
  end_date: '',
};

// ---------------------------------------------------------------------------
// Constants for filter options
// ---------------------------------------------------------------------------

const REQUEST_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'access', label: 'Access (Art. 15)' },
  { value: 'rectification', label: 'Rectification (Art. 16)' },
  { value: 'erasure', label: 'Erasure (Art. 17)' },
  { value: 'portability', label: 'Portability (Art. 20)' },
  { value: 'restriction', label: 'Restriction (Art. 18)' },
  { value: 'objection', label: 'Objection (Art. 21)' },
  { value: 'opt_out_sale', label: 'Opt-out of Sale (CCPA)' },
  { value: 'disclosure', label: 'Disclosure (CCPA)' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'identity_verification', label: 'Identity Verification' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'awaiting_approval', label: 'Awaiting Approval' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'completed', label: 'Completed' },
  { value: 'partially_completed', label: 'Partially Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'urgent', label: 'Urgent' },
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
            {/* Request Type */}
            <div>
              <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
                Request Type
              </label>
              <select
                value={filters.request_type}
                onChange={(e) => onFiltersChange({ ...filters, request_type: e.target.value })}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {REQUEST_TYPES.map((opt) => (
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
              label="Start Date"
              value={filters.start_date}
              onChange={(date) => onFiltersChange({ ...filters, start_date: date })}
              placeholder="From date"
            />
            <DatePicker
              label="End Date"
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
      case 'completed':
        return 'bg-success/10 text-success';
      case 'in_progress':
      case 'acknowledged':
        return 'bg-accent/10 text-accent';
      case 'pending':
      case 'identity_verification':
      case 'awaiting_approval':
        return 'bg-gold/10 text-gold';
      case 'blocked':
      case 'rejected':
      case 'expired':
        return 'bg-error/10 text-error';
      case 'cancelled':
        return 'bg-text-tertiary/10 text-text-tertiary';
      case 'partially_completed':
        return 'bg-orange-500/10 text-orange-500';
      default:
        return 'bg-text-tertiary/10 text-text-tertiary';
    }
  };

  const getStatusIcon = () => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <CheckCircle2 className="w-3 h-3" />;
      case 'in_progress':
        return <Play className="w-3 h-3" />;
      case 'pending':
      case 'awaiting_approval':
        return <Clock className="w-3 h-3" />;
      case 'blocked':
        return <Pause className="w-3 h-3" />;
      case 'rejected':
      case 'expired':
        return <XCircle className="w-3 h-3" />;
      case 'cancelled':
        return <Ban className="w-3 h-3" />;
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
      case 'urgent':
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
// Request Type Icon Component
// ---------------------------------------------------------------------------

interface RequestTypeIconProps {
  type: string;
}

const RequestTypeIcon: React.FC<RequestTypeIconProps> = ({ type }) => {
  const getIcon = () => {
    switch (type.toLowerCase()) {
      case 'access':
        return <Eye className="w-4 h-4" />;
      case 'erasure':
        return <Trash2 className="w-4 h-4" />;
      case 'rectification':
        return <Edit3 className="w-4 h-4" />;
      case 'portability':
        return <Download className="w-4 h-4" />;
      case 'restriction':
        return <Pause className="w-4 h-4" />;
      case 'objection':
        return <Ban className="w-4 h-4" />;
      case 'opt_out_sale':
        return <Shield className="w-4 h-4" />;
      case 'disclosure':
        return <Mail className="w-4 h-4" />;
      default:
        return <UserX className="w-4 h-4" />;
    }
  };

  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-primary">
      {getIcon()}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Days Until Deadline Badge Component
// ---------------------------------------------------------------------------

interface DeadlineBadgeProps {
  daysUntilDeadline: number;
}

const DeadlineBadge: React.FC<DeadlineBadgeProps> = ({ daysUntilDeadline }) => {
  const getDeadlineStyle = () => {
    if (daysUntilDeadline < 0) {
      return 'bg-error/10 text-error';
    }
    if (daysUntilDeadline <= 3) {
      return 'bg-error/10 text-error';
    }
    if (daysUntilDeadline <= 7) {
      return 'bg-orange-500/10 text-orange-500';
    }
    if (daysUntilDeadline <= 14) {
      return 'bg-gold/10 text-gold';
    }
    return 'bg-success/10 text-success';
  };

  const getDeadlineText = () => {
    if (daysUntilDeadline < 0) {
      return `${Math.abs(daysUntilDeadline)}d overdue`;
    }
    if (daysUntilDeadline === 0) {
      return 'Due today';
    }
    return `${daysUntilDeadline}d left`;
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${getDeadlineStyle()}`}
    >
      <Calendar className="w-3 h-3" />
      {getDeadlineText()}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Create Request Modal Component
// ---------------------------------------------------------------------------

interface CreateRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: CreateDataSubjectRequestRequest) => Promise<void>;
  isCreating: boolean;
}

const CreateRequestModal: React.FC<CreateRequestModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  isCreating,
}) => {
  const [formData, setFormData] = useState<CreateDataSubjectRequestRequest>({
    subject_email: '',
    subject_name: '',
    request_type: 'access' as DSRRequestType,
    description: '',
    priority: 'normal' as DSRPriority,
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
          <h3 className="text-lg font-semibold text-text-primary">Create Data Subject Request</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-text-tertiary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Subject Email */}
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Subject Email *
            </label>
            <input
              type="email"
              value={formData.subject_email}
              onChange={(e) => setFormData({ ...formData, subject_email: e.target.value })}
              required
              placeholder="user@example.com"
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Subject Name */}
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Subject Name
            </label>
            <input
              type="text"
              value={formData.subject_name || ''}
              onChange={(e) => setFormData({ ...formData, subject_name: e.target.value })}
              placeholder="John Doe"
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Request Type */}
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Request Type *
            </label>
            <select
              value={formData.request_type}
              onChange={(e) => setFormData({ ...formData, request_type: e.target.value as DSRRequestType })}
              required
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {REQUEST_TYPES.filter((t) => t.value !== '').map((opt) => (
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
              onChange={(e) => setFormData({ ...formData, priority: e.target.value as DSRPriority })}
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {PRIORITY_OPTIONS.filter((p) => p.value !== '').map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
              placeholder="Additional details about the request..."
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
              disabled={isCreating || !formData.subject_email}
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
                  Create Request
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
// Request Detail Modal Component
// ---------------------------------------------------------------------------

interface RequestDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: DataSubjectRequest | null;
  onAcknowledge: () => Promise<void>;
  onStartProcessing: () => Promise<void>;
  onComplete: () => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onCancel: (reason: string) => Promise<void>;
  isLoading: boolean;
}

const RequestDetailModal: React.FC<RequestDetailModalProps> = ({
  isOpen,
  onClose,
  request,
  onAcknowledge,
  onStartProcessing,
  onComplete,
  onReject,
  onCancel,
  isLoading,
}) => {
  const [rejectReason, setRejectReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);

  if (!isOpen || !request) return null;

  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const formatRequestType = (type: string): string => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const canAcknowledge = request.status === 'pending' || request.status === 'identity_verification';
  const canStartProcessing = request.status === 'acknowledged';
  const canComplete = request.status === 'in_progress';
  const canReject = ['pending', 'identity_verification', 'acknowledged', 'in_progress'].includes(request.status);
  const canCancel = ['pending', 'identity_verification', 'acknowledged'].includes(request.status);

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
              Request #{request.request_number}
            </h3>
            <p className="text-sm text-text-secondary">
              {formatRequestType(request.request_type)} Request
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
          <StatusBadge status={request.status} />
          <PriorityBadge priority={request.priority} />
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Subject Email</span>
            <p className="text-sm text-text-primary font-medium">{request.subject_email}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Subject Name</span>
            <p className="text-sm text-text-primary">{request.subject_name || '-'}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Submitted</span>
            <p className="text-sm text-text-primary">{formatDate(request.submitted_at)}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Deadline</span>
            <p className="text-sm text-text-primary">{formatDate(request.deadline_at)}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Verification Status</span>
            <p className="text-sm text-text-primary capitalize">{request.verification_status.replace(/_/g, ' ')}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Subject Type</span>
            <p className="text-sm text-text-primary capitalize">{request.subject_type}</p>
          </div>
        </div>

        {/* Description */}
        {request.description && (
          <div className="mb-6">
            <span className="text-xs text-text-tertiary uppercase tracking-wide block mb-1">Description</span>
            <p className="text-sm text-text-primary bg-surface-hover rounded-lg p-3">
              {request.description}
            </p>
          </div>
        )}

        {/* Blocked Warning */}
        {request.status === 'blocked' && request.blocked_reason && (
          <div className="mb-6 flex items-start gap-3 p-4 bg-error/10 border border-error/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-error">Request Blocked</p>
              <p className="text-sm text-error/80">{request.blocked_reason}</p>
            </div>
          </div>
        )}

        {/* Reject Form */}
        {showRejectForm && (
          <div className="mb-6 p-4 bg-surface-hover rounded-lg">
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Rejection Reason *
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
              placeholder="Provide a reason for rejecting this request..."
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none mb-3"
            />
            <div className="flex justify-end gap-2">
              <AppButton variant="secondary" size="sm" onClick={() => setShowRejectForm(false)}>
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                size="sm"
                onClick={() => {
                  onReject(rejectReason);
                  setShowRejectForm(false);
                  setRejectReason('');
                }}
                disabled={!rejectReason.trim() || isLoading}
                className="bg-error hover:bg-error/90"
              >
                Confirm Reject
              </AppButton>
            </div>
          </div>
        )}

        {/* Cancel Form */}
        {showCancelForm && (
          <div className="mb-6 p-4 bg-surface-hover rounded-lg">
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Cancellation Reason
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
              placeholder="Provide a reason for cancelling this request..."
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none mb-3"
            />
            <div className="flex justify-end gap-2">
              <AppButton variant="secondary" size="sm" onClick={() => setShowCancelForm(false)}>
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                size="sm"
                onClick={() => {
                  onCancel(cancelReason);
                  setShowCancelForm(false);
                  setCancelReason('');
                }}
                disabled={isLoading}
              >
                Confirm Cancel
              </AppButton>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
          {canAcknowledge && (
            <AppButton
              variant="primary"
              onClick={onAcknowledge}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Acknowledge
            </AppButton>
          )}
          {canStartProcessing && (
            <AppButton
              variant="primary"
              onClick={onStartProcessing}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Start Processing
            </AppButton>
          )}
          {canComplete && (
            <AppButton
              variant="primary"
              onClick={onComplete}
              disabled={isLoading}
              className="flex items-center gap-2 bg-success hover:bg-success/90"
            >
              <CheckCircle2 className="w-4 h-4" />
              Mark Complete
            </AppButton>
          )}
          {canReject && !showRejectForm && (
            <AppButton
              variant="secondary"
              onClick={() => setShowRejectForm(true)}
              disabled={isLoading}
              className="flex items-center gap-2 text-error hover:bg-error/10"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </AppButton>
          )}
          {canCancel && !showCancelForm && (
            <AppButton
              variant="secondary"
              onClick={() => setShowCancelForm(true)}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <Ban className="w-4 h-4" />
              Cancel
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

const DataSubjectRequestsPage: React.FC = () => {
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const workspaceId = workspace?.workspace_id;

  // Filter state
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Data state
  const [requests, setRequests] = useState<DataSubjectRequestSummary[]>([]);
  const [meta, setMeta] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } | null>(null);
  const [stats, setStats] = useState<DSRStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState(1);

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<DataSubjectRequest | null>(null);
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

  // Fetch requests
  const fetchRequests = useCallback(async () => {
    if (!workspaceId) {
      setIsLoading(false);
      return;
    }

    setIsFetching(true);
    setError(null);

    try {
      const query: ListDataSubjectRequestsQuery = {
        page,
        limit: 25,
        subject_email: debouncedSearch || undefined,
        request_type: filters.request_type as DSRRequestType || undefined,
        status: filters.status as DSRStatus || undefined,
        priority: filters.priority as DSRPriority || undefined,
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
      };

      const response = await listDataSubjectRequests(workspaceId, query);

      if (isMountedRef.current) {
        setRequests(response.data);
        setMeta(response.meta);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error('Failed to fetch requests'));
        setRequests([]);
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
      const statsData = await getDataSubjectRequestStats(workspaceId);
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
    fetchRequests();
    fetchStats();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchRequests, fetchStats]);

  // Handlers
  const handleClearFilters = useCallback(() => {
    setFilters(initialFilters);
    setSearchQuery('');
    setPage(1);
  }, []);

  const handleCreateRequest = useCallback(async (data: CreateDataSubjectRequestRequest) => {
    if (!workspaceId) return;

    setIsCreating(true);
    try {
      await createDataSubjectRequest(workspaceId, data);
      addToast({
        variant: 'success',
        title: 'Request Created',
        message: 'Data subject request has been created successfully.',
        duration: 5000,
      });
      setIsCreateModalOpen(false);
      fetchRequests();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Creation Failed',
        message: err instanceof Error ? err.message : 'Failed to create request',
        duration: 5000,
      });
    } finally {
      setIsCreating(false);
    }
  }, [workspaceId, addToast, fetchRequests, fetchStats]);

  const handleRowClick = useCallback(async (row: DataSubjectRequestSummary) => {
    if (!workspaceId) return;

    setSelectedRequestId(row.request_id);
    setIsDetailModalOpen(true);

    try {
      const fullRequest = await getDataSubjectRequest(workspaceId, row.request_id);
      if (isMountedRef.current) {
        setSelectedRequest(fullRequest);
      }
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Error',
        message: 'Failed to load request details',
        duration: 5000,
      });
      setIsDetailModalOpen(false);
    }
  }, [workspaceId, addToast]);

  const handleAcknowledge = useCallback(async () => {
    if (!workspaceId || !selectedRequestId) return;

    setIsActionLoading(true);
    try {
      const updated = await acknowledgeDataSubjectRequest(workspaceId, selectedRequestId);
      setSelectedRequest(updated);
      addToast({
        variant: 'success',
        title: 'Request Acknowledged',
        message: 'The request has been acknowledged.',
        duration: 3000,
      });
      fetchRequests();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Failed to acknowledge request',
        duration: 5000,
      });
    } finally {
      setIsActionLoading(false);
    }
  }, [workspaceId, selectedRequestId, addToast, fetchRequests, fetchStats]);

  const handleStartProcessing = useCallback(async () => {
    if (!workspaceId || !selectedRequestId) return;

    setIsActionLoading(true);
    try {
      const updated = await startProcessingDataSubjectRequest(workspaceId, selectedRequestId);
      setSelectedRequest(updated);
      addToast({
        variant: 'success',
        title: 'Processing Started',
        message: 'The request is now being processed.',
        duration: 3000,
      });
      fetchRequests();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Failed to start processing',
        duration: 5000,
      });
    } finally {
      setIsActionLoading(false);
    }
  }, [workspaceId, selectedRequestId, addToast, fetchRequests, fetchStats]);

  const handleComplete = useCallback(async () => {
    if (!workspaceId || !selectedRequestId) return;

    setIsActionLoading(true);
    try {
      const updated = await completeDataSubjectRequest(workspaceId, selectedRequestId);
      setSelectedRequest(updated);
      addToast({
        variant: 'success',
        title: 'Request Completed',
        message: 'The request has been marked as completed.',
        duration: 3000,
      });
      fetchRequests();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Failed to complete request',
        duration: 5000,
      });
    } finally {
      setIsActionLoading(false);
    }
  }, [workspaceId, selectedRequestId, addToast, fetchRequests, fetchStats]);

  const handleReject = useCallback(async (reason: string) => {
    if (!workspaceId || !selectedRequestId) return;

    setIsActionLoading(true);
    try {
      const updated = await rejectDataSubjectRequest(workspaceId, selectedRequestId, reason);
      setSelectedRequest(updated);
      addToast({
        variant: 'success',
        title: 'Request Rejected',
        message: 'The request has been rejected.',
        duration: 3000,
      });
      fetchRequests();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Failed to reject request',
        duration: 5000,
      });
    } finally {
      setIsActionLoading(false);
    }
  }, [workspaceId, selectedRequestId, addToast, fetchRequests, fetchStats]);

  const handleCancel = useCallback(async (reason: string) => {
    if (!workspaceId || !selectedRequestId) return;

    setIsActionLoading(true);
    try {
      const updated = await cancelDataSubjectRequest(workspaceId, selectedRequestId, reason);
      setSelectedRequest(updated);
      addToast({
        variant: 'success',
        title: 'Request Cancelled',
        message: 'The request has been cancelled.',
        duration: 3000,
      });
      fetchRequests();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Failed to cancel request',
        duration: 5000,
      });
    } finally {
      setIsActionLoading(false);
    }
  }, [workspaceId, selectedRequestId, addToast, fetchRequests, fetchStats]);

  const handleCloseDetailModal = useCallback(() => {
    setIsDetailModalOpen(false);
    setSelectedRequest(null);
    setSelectedRequestId(null);
  }, []);

  // Table columns
  const columns: Column<DataSubjectRequestSummary>[] = useMemo(() => [
    {
      id: 'request_number',
      header: 'Request',
      accessor: 'request_number',
      width: '140px',
      cell: (value, row) => (
        <div className="flex items-center gap-2">
          <RequestTypeIcon type={row.request_type} />
          <div>
            <div className="font-medium text-text-primary text-xs">{String(value)}</div>
            <div className="text-xs text-text-tertiary capitalize">
              {row.request_type.replace(/_/g, ' ')}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'subject_email',
      header: 'Subject',
      accessor: 'subject_email',
      cell: (value) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-primary" />
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
      id: 'deadline',
      header: 'Deadline',
      accessor: 'days_until_deadline',
      width: '110px',
      hideOnMobile: true,
      cell: (value, row) => {
        const isTerminal = ['completed', 'rejected', 'cancelled', 'expired'].includes(row.status);
        if (isTerminal) {
          return <span className="text-xs text-text-tertiary">-</span>;
        }
        return <DeadlineBadge daysUntilDeadline={value as number} />;
      },
    },
    {
      id: 'submitted_at',
      header: 'Submitted',
      accessor: 'submitted_at',
      width: '120px',
      hideOnMobile: true,
      cell: (value) => {
        const date = new Date(String(value));
        return (
          <div className="text-xs">
            <div className="text-text-primary">{date.toLocaleDateString()}</div>
            <div className="text-text-tertiary">{date.toLocaleTimeString()}</div>
          </div>
        );
      },
    },
  ], []);

  // Calculate stats display values
  const pendingCount = stats?.by_status?.pending ?? 0;
  const inProgressCount = stats?.by_status?.in_progress ?? 0;
  const completedCount = stats?.by_status?.completed ?? 0;
  const overdueCount = stats?.overdue_count ?? 0;

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Page Header */}
      <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gradient flex items-center gap-3">
                <div className="section-header-icon icon-container-accent">
                  <UserX className="w-5 h-5" />
                </div>
                Data Subject Requests
              </h1>
              <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                Manage GDPR/CCPA/DPDP data subject requests
              </p>
            </div>
            <div className="flex items-center gap-3">
              <AppButton
                variant="secondary"
                onClick={() => {
                  fetchRequests();
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
                <span className="hidden sm:inline">New Request</span>
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
              onClick={fetchRequests}
              className="ml-auto p-1 hover:bg-error/10 rounded"
            >
              <RefreshCcw className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Pending"
            value={pendingCount}
            subtext="Awaiting review"
            colorClass="text-gold"
          />
          <StatCard
            icon={<Play className="w-5 h-5" />}
            label="In Progress"
            value={inProgressCount}
            subtext="Being processed"
            colorClass="text-accent"
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5" />}
            label="Completed"
            value={completedCount}
            subtext="Successfully fulfilled"
            colorClass="text-success"
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5" />}
            label="Overdue"
            value={overdueCount}
            subtext="Past deadline"
            colorClass="text-error"
          />
        </div>

        {/* Search Bar */}
        <div className="glass-card rounded-xl p-4 mb-4">
          <div className="relative">
            <Search className="w-5 h-5 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by subject email..."
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

        {/* Requests Table */}
        <div className="glass-card rounded-xl overflow-hidden">
          <DataTable
            data={requests}
            columns={columns}
            keyAccessor="request_id"
            isLoading={isLoading}
            emptyMessage="No data subject requests found"
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
        {!isLoading && requests.length > 0 && (
          <div className="mt-4 text-center text-sm text-text-tertiary">
            Showing {requests.length} of {meta?.total || 0} data subject requests
          </div>
        )}
      </main>

      {/* Create Request Modal */}
      <CreateRequestModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateRequest}
        isCreating={isCreating}
      />

      {/* Request Detail Modal */}
      <RequestDetailModal
        isOpen={isDetailModalOpen}
        onClose={handleCloseDetailModal}
        request={selectedRequest}
        onAcknowledge={handleAcknowledge}
        onStartProcessing={handleStartProcessing}
        onComplete={handleComplete}
        onReject={handleReject}
        onCancel={handleCancel}
        isLoading={isActionLoading}
      />
    </div>
  );
};

export default DataSubjectRequestsPage;
