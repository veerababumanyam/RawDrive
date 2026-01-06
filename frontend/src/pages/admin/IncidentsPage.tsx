/**
 * Incidents Page
 *
 * Admin interface for managing security and compliance incidents.
 * Provides functionality to view, filter, create, and manage incidents
 * including data breaches, security incidents, policy violations, etc.
 *
 * Part of the Audit & Compliance system implementation.
 *
 * @module IncidentsPage
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  AlertTriangle,
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
  Shield,
  Bug,
  Lock,
  Zap,
  Server,
  Eye,
  Play,
  Pause,
  FileText,
  Users,
  Target,
  Activity,
  ShieldAlert,
  ShieldOff,
  ShieldCheck,
  Flame,
} from 'lucide-react';
import { AppButton } from '../../components/ui/AppButton';
import { DataTable, TablePagination, type Column } from '../../components/ui/DataTable';
import { DatePicker } from '../../components/ui/DatePicker';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui';
import {
  listIncidents,
  getIncident,
  createIncident,
  confirmIncident,
  startIncidentInvestigation,
  containIncident,
  markIncidentContained,
  resolveIncident,
  closeIncident,
  getIncidentStats,
} from '../../services/complianceService';
import type {
  Incident,
  IncidentSummary,
  CreateIncidentRequest,
  ListIncidentsQuery,
  IncidentType,
  IncidentCategory,
  IncidentSeverity,
  IncidentPriority,
  IncidentStatus,
  IncidentStats,
} from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FilterState {
  search: string;
  incident_type: string;
  category: string;
  severity: string;
  priority: string;
  status: string;
  is_data_breach: string;
  start_date: string;
  end_date: string;
}

const initialFilters: FilterState = {
  search: '',
  incident_type: '',
  category: '',
  severity: '',
  priority: '',
  status: '',
  is_data_breach: '',
  start_date: '',
  end_date: '',
};

// ---------------------------------------------------------------------------
// Constants for filter options
// ---------------------------------------------------------------------------

const INCIDENT_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'data_breach', label: 'Data Breach' },
  { value: 'security_breach', label: 'Security Breach' },
  { value: 'unauthorized_access', label: 'Unauthorized Access' },
  { value: 'malware', label: 'Malware' },
  { value: 'phishing', label: 'Phishing' },
  { value: 'ddos', label: 'DDoS Attack' },
  { value: 'data_loss', label: 'Data Loss' },
  { value: 'data_corruption', label: 'Data Corruption' },
  { value: 'system_failure', label: 'System Failure' },
  { value: 'policy_violation', label: 'Policy Violation' },
  { value: 'compliance_failure', label: 'Compliance Failure' },
  { value: 'third_party', label: 'Third Party' },
  { value: 'insider_threat', label: 'Insider Threat' },
  { value: 'physical_security', label: 'Physical Security' },
  { value: 'social_engineering', label: 'Social Engineering' },
  { value: 'misconfiguration', label: 'Misconfiguration' },
  { value: 'vulnerability', label: 'Vulnerability' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'security', label: 'Security' },
  { value: 'privacy', label: 'Privacy' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'operational', label: 'Operational' },
  { value: 'legal', label: 'Legal' },
  { value: 'reputational', label: 'Reputational' },
  { value: 'financial', label: 'Financial' },
];

const SEVERITY_OPTIONS = [
  { value: '', label: 'All Severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'informational', label: 'Informational' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'critical', label: 'P1 - Critical' },
  { value: 'high', label: 'P2 - High' },
  { value: 'medium', label: 'P3 - Medium' },
  { value: 'low', label: 'P4 - Low' },
  { value: 'deferred', label: 'P5 - Deferred' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'detected', label: 'Detected' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'containing', label: 'Containing' },
  { value: 'contained', label: 'Contained' },
  { value: 'eradicating', label: 'Eradicating' },
  { value: 'eradicated', label: 'Eradicated' },
  { value: 'recovering', label: 'Recovering' },
  { value: 'recovered', label: 'Recovered' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'post_incident_review', label: 'Post-Incident Review' },
  { value: 'false_positive', label: 'False Positive' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'escalated', label: 'Escalated' },
];

const DATA_BREACH_OPTIONS = [
  { value: '', label: 'All Incidents' },
  { value: 'true', label: 'Data Breaches Only' },
  { value: 'false', label: 'Non-Data Breaches' },
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
            {/* Incident Type */}
            <div>
              <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
                Incident Type
              </label>
              <select
                value={filters.incident_type}
                onChange={(e) => onFiltersChange({ ...filters, incident_type: e.target.value })}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {INCIDENT_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
                Category
              </label>
              <select
                value={filters.category}
                onChange={(e) => onFiltersChange({ ...filters, category: e.target.value })}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Severity */}
            <div>
              <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
                Severity
              </label>
              <select
                value={filters.severity}
                onChange={(e) => onFiltersChange({ ...filters, severity: e.target.value })}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {SEVERITY_OPTIONS.map((opt) => (
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

            {/* Data Breach */}
            <div>
              <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
                Data Breach
              </label>
              <select
                value={filters.is_data_breach}
                onChange={(e) => onFiltersChange({ ...filters, is_data_breach: e.target.value })}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {DATA_BREACH_OPTIONS.map((opt) => (
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
              label="Detected From"
              value={filters.start_date}
              onChange={(date) => onFiltersChange({ ...filters, start_date: date })}
              placeholder="From date"
            />
            <DatePicker
              label="Detected Until"
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
      case 'resolved':
      case 'closed':
        return 'bg-success/10 text-success';
      case 'investigating':
      case 'containing':
      case 'eradicating':
      case 'recovering':
        return 'bg-accent/10 text-accent';
      case 'detected':
      case 'confirmed':
        return 'bg-gold/10 text-gold';
      case 'contained':
      case 'eradicated':
      case 'recovered':
        return 'bg-teal-500/10 text-teal-500';
      case 'escalated':
        return 'bg-error/10 text-error';
      case 'false_positive':
      case 'duplicate':
        return 'bg-text-tertiary/10 text-text-tertiary';
      case 'post_incident_review':
        return 'bg-purple-500/10 text-purple-500';
      default:
        return 'bg-text-tertiary/10 text-text-tertiary';
    }
  };

  const getStatusIcon = () => {
    switch (status.toLowerCase()) {
      case 'resolved':
      case 'closed':
        return <CheckCircle2 className="w-3 h-3" />;
      case 'investigating':
        return <Eye className="w-3 h-3" />;
      case 'containing':
      case 'eradicating':
        return <Shield className="w-3 h-3" />;
      case 'detected':
        return <AlertTriangle className="w-3 h-3" />;
      case 'confirmed':
        return <Target className="w-3 h-3" />;
      case 'contained':
      case 'eradicated':
        return <ShieldCheck className="w-3 h-3" />;
      case 'recovering':
      case 'recovered':
        return <Activity className="w-3 h-3" />;
      case 'escalated':
        return <Flame className="w-3 h-3" />;
      case 'false_positive':
        return <XCircle className="w-3 h-3" />;
      case 'post_incident_review':
        return <FileText className="w-3 h-3" />;
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
// Severity Badge Component
// ---------------------------------------------------------------------------

interface SeverityBadgeProps {
  severity: string;
}

const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity }) => {
  const getSeverityStyle = () => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'bg-error/10 text-error border-error/20';
      case 'high':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'medium':
        return 'bg-gold/10 text-gold border-gold/20';
      case 'low':
        return 'bg-accent/10 text-accent border-accent/20';
      case 'informational':
        return 'bg-text-tertiary/10 text-text-tertiary border-text-tertiary/20';
      default:
        return 'bg-text-tertiary/10 text-text-tertiary border-text-tertiary/20';
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${getSeverityStyle()}`}
    >
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
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
        return 'bg-error text-white';
      case 'high':
        return 'bg-orange-500 text-white';
      case 'medium':
        return 'bg-gold text-white';
      case 'low':
        return 'bg-accent text-white';
      case 'deferred':
        return 'bg-text-tertiary text-white';
      default:
        return 'bg-text-tertiary text-white';
    }
  };

  const getPriorityLabel = () => {
    switch (priority.toLowerCase()) {
      case 'critical':
        return 'P1';
      case 'high':
        return 'P2';
      case 'medium':
        return 'P3';
      case 'low':
        return 'P4';
      case 'deferred':
        return 'P5';
      default:
        return priority.charAt(0).toUpperCase();
    }
  };

  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-5 text-xs font-bold rounded ${getPriorityStyle()}`}
    >
      {getPriorityLabel()}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Incident Type Icon Component
// ---------------------------------------------------------------------------

interface IncidentTypeIconProps {
  type: string;
  isDataBreach?: boolean;
}

const IncidentTypeIcon: React.FC<IncidentTypeIconProps> = ({ type, isDataBreach }) => {
  const getIcon = () => {
    if (isDataBreach) {
      return <ShieldOff className="w-4 h-4" />;
    }
    switch (type.toLowerCase()) {
      case 'data_breach':
        return <ShieldOff className="w-4 h-4" />;
      case 'security_breach':
        return <ShieldAlert className="w-4 h-4" />;
      case 'unauthorized_access':
        return <Lock className="w-4 h-4" />;
      case 'malware':
        return <Bug className="w-4 h-4" />;
      case 'phishing':
        return <AlertTriangle className="w-4 h-4" />;
      case 'ddos':
        return <Zap className="w-4 h-4" />;
      case 'system_failure':
        return <Server className="w-4 h-4" />;
      case 'policy_violation':
      case 'compliance_failure':
        return <FileText className="w-4 h-4" />;
      case 'insider_threat':
        return <Users className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getIconColor = () => {
    if (isDataBreach) return 'text-error';
    return 'text-primary';
  };

  return (
    <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center ${getIconColor()}`}>
      {getIcon()}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Create Incident Modal Component
// ---------------------------------------------------------------------------

interface CreateIncidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: CreateIncidentRequest) => Promise<void>;
  isCreating: boolean;
}

const CreateIncidentModal: React.FC<CreateIncidentModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  isCreating,
}) => {
  const [formData, setFormData] = useState<CreateIncidentRequest>({
    title: '',
    description: '',
    incident_type: 'security_breach' as IncidentType,
    category: 'security' as IncidentCategory,
    severity: 'medium' as IncidentSeverity,
    is_data_breach: false,
    personal_data_involved: false,
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
          <h3 className="text-lg font-semibold text-text-primary">Report Incident</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-text-tertiary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Incident Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              placeholder="e.g., Unauthorized access attempt detected"
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Incident Type */}
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Incident Type *
            </label>
            <select
              value={formData.incident_type}
              onChange={(e) => setFormData({ ...formData, incident_type: e.target.value as IncidentType })}
              required
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {INCIDENT_TYPES.filter((t) => t.value !== '').map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Category
            </label>
            <select
              value={formData.category || 'security'}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as IncidentCategory })}
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {CATEGORY_OPTIONS.filter((c) => c.value !== '').map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Severity
            </label>
            <select
              value={formData.severity || 'medium'}
              onChange={(e) => setFormData({ ...formData, severity: e.target.value as IncidentSeverity })}
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {SEVERITY_OPTIONS.filter((s) => s.value !== '').map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Data Breach Checkboxes */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_data_breach || false}
                onChange={(e) => setFormData({ ...formData, is_data_breach: e.target.checked })}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
              />
              <span className="text-sm text-text-primary">This is a data breach</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.personal_data_involved || false}
                onChange={(e) => setFormData({ ...formData, personal_data_involved: e.target.checked })}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
              />
              <span className="text-sm text-text-primary">Personal data involved</span>
            </label>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Description *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              rows={4}
              placeholder="Describe what happened, when it was discovered, and initial observations..."
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
              disabled={isCreating || !formData.title || !formData.description}
              className="flex items-center gap-2 bg-error hover:bg-error/90"
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Reporting...
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  Report Incident
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
// Incident Detail Modal Component
// ---------------------------------------------------------------------------

interface IncidentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  incident: Incident | null;
  onConfirm: () => Promise<void>;
  onInvestigate: () => Promise<void>;
  onContain: () => Promise<void>;
  onMarkContained: () => Promise<void>;
  onResolve: (summary: string) => Promise<void>;
  onCloseIncident: (lessonsLearned?: string) => Promise<void>;
  isLoading: boolean;
}

const IncidentDetailModal: React.FC<IncidentDetailModalProps> = ({
  isOpen,
  onClose,
  incident,
  onConfirm,
  onInvestigate,
  onContain,
  onMarkContained,
  onResolve,
  onCloseIncident,
  isLoading,
}) => {
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [lessonsLearned, setLessonsLearned] = useState('');
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);

  if (!isOpen || !incident) return null;

  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const formatIncidentType = (type: string): string => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Determine available actions based on current status
  const canConfirm = incident.status === 'detected';
  const canInvestigate = incident.status === 'confirmed';
  const canContain = incident.status === 'investigating';
  const canMarkContained = incident.status === 'containing';
  const canResolve = ['contained', 'eradicated', 'recovered'].includes(incident.status);
  const canClose = incident.status === 'resolved';

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
              Incident #{incident.incident_number}
            </h3>
            <p className="text-sm text-text-secondary">
              {formatIncidentType(incident.incident_type)}
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

        {/* Status, Severity, Priority */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <StatusBadge status={incident.status} />
          <SeverityBadge severity={incident.severity} />
          <PriorityBadge priority={incident.priority} />
          {incident.is_data_breach && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-error/10 text-error text-xs font-medium rounded-full">
              <ShieldOff className="w-3 h-3" />
              Data Breach
            </span>
          )}
          {incident.requires_notification && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gold/10 text-gold text-xs font-medium rounded-full">
              <AlertCircle className="w-3 h-3" />
              Notification Required
            </span>
          )}
        </div>

        {/* Title */}
        <div className="mb-6">
          <h4 className="text-lg font-medium text-text-primary">{incident.title}</h4>
          <p className="text-sm text-text-secondary mt-2">{incident.description}</p>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Category</span>
            <p className="text-sm text-text-primary font-medium capitalize">{incident.category}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Detection Method</span>
            <p className="text-sm text-text-primary">{incident.detection_method || '-'}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Detected At</span>
            <p className="text-sm text-text-primary">{formatDate(incident.detected_at)}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Impact</span>
            <p className="text-sm text-text-primary">{incident.impact || '-'}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Affected Users</span>
            <p className="text-sm text-text-primary">{incident.affected_users_count}</p>
          </div>
          <div>
            <span className="text-xs text-text-tertiary uppercase tracking-wide">Affected Resources</span>
            <p className="text-sm text-text-primary">{incident.affected_resources_count}</p>
          </div>
        </div>

        {/* Data Breach Info */}
        {incident.is_data_breach && (
          <div className="mb-6 p-4 bg-error/10 border border-error/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <ShieldOff className="w-5 h-5 text-error" />
              <p className="text-sm font-medium text-error">Data Breach Details</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-error/70">Data Subjects:</span>{' '}
                <span className="text-error">{incident.data_subjects_count ?? 'Unknown'}</span>
              </div>
              <div>
                <span className="text-error/70">Breach Type:</span>{' '}
                <span className="text-error">{incident.breach_type || 'Unknown'}</span>
              </div>
              {incident.notification_deadline_at && (
                <div className="col-span-2">
                  <span className="text-error/70">Notification Deadline:</span>{' '}
                  <span className="text-error">{formatDate(incident.notification_deadline_at)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Root Cause */}
        {incident.root_cause && (
          <div className="mb-6">
            <span className="text-xs text-text-tertiary uppercase tracking-wide block mb-1">Root Cause</span>
            <p className="text-sm text-text-primary bg-surface-hover rounded-lg p-3">
              {incident.root_cause}
            </p>
          </div>
        )}

        {/* Resolution Summary */}
        {incident.resolution_summary && (
          <div className="mb-6">
            <span className="text-xs text-text-tertiary uppercase tracking-wide block mb-1">Resolution</span>
            <p className="text-sm text-text-primary bg-success/10 border border-success/20 rounded-lg p-3">
              {incident.resolution_summary}
            </p>
          </div>
        )}

        {/* Lessons Learned */}
        {incident.lessons_learned && (
          <div className="mb-6">
            <span className="text-xs text-text-tertiary uppercase tracking-wide block mb-1">Lessons Learned</span>
            <p className="text-sm text-text-primary bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
              {incident.lessons_learned}
            </p>
          </div>
        )}

        {/* Resolve Form */}
        {showResolveForm && (
          <div className="mb-6 p-4 bg-surface-hover rounded-lg">
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Resolution Summary *
            </label>
            <textarea
              value={resolutionSummary}
              onChange={(e) => setResolutionSummary(e.target.value)}
              rows={3}
              placeholder="Describe how the incident was resolved..."
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none mb-3"
            />
            <div className="flex justify-end gap-2">
              <AppButton variant="secondary" size="sm" onClick={() => setShowResolveForm(false)}>
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                size="sm"
                onClick={() => {
                  onResolve(resolutionSummary);
                  setShowResolveForm(false);
                  setResolutionSummary('');
                }}
                disabled={!resolutionSummary.trim() || isLoading}
                className="bg-success hover:bg-success/90"
              >
                Mark Resolved
              </AppButton>
            </div>
          </div>
        )}

        {/* Close Form */}
        {showCloseForm && (
          <div className="mb-6 p-4 bg-surface-hover rounded-lg">
            <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1.5">
              Lessons Learned (Optional)
            </label>
            <textarea
              value={lessonsLearned}
              onChange={(e) => setLessonsLearned(e.target.value)}
              rows={3}
              placeholder="What lessons were learned from this incident?"
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none mb-3"
            />
            <div className="flex justify-end gap-2">
              <AppButton variant="secondary" size="sm" onClick={() => setShowCloseForm(false)}>
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                size="sm"
                onClick={() => {
                  onCloseIncident(lessonsLearned || undefined);
                  setShowCloseForm(false);
                  setLessonsLearned('');
                }}
                disabled={isLoading}
              >
                Close Incident
              </AppButton>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
          {canConfirm && (
            <AppButton
              variant="primary"
              onClick={onConfirm}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <Target className="w-4 h-4" />
              Confirm Incident
            </AppButton>
          )}
          {canInvestigate && (
            <AppButton
              variant="primary"
              onClick={onInvestigate}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              Start Investigation
            </AppButton>
          )}
          {canContain && (
            <AppButton
              variant="primary"
              onClick={onContain}
              disabled={isLoading}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-500/90"
            >
              <Shield className="w-4 h-4" />
              Start Containment
            </AppButton>
          )}
          {canMarkContained && (
            <AppButton
              variant="primary"
              onClick={onMarkContained}
              disabled={isLoading}
              className="flex items-center gap-2 bg-teal-500 hover:bg-teal-500/90"
            >
              <ShieldCheck className="w-4 h-4" />
              Mark Contained
            </AppButton>
          )}
          {canResolve && !showResolveForm && (
            <AppButton
              variant="primary"
              onClick={() => setShowResolveForm(true)}
              disabled={isLoading}
              className="flex items-center gap-2 bg-success hover:bg-success/90"
            >
              <CheckCircle2 className="w-4 h-4" />
              Resolve
            </AppButton>
          )}
          {canClose && !showCloseForm && (
            <AppButton
              variant="secondary"
              onClick={() => setShowCloseForm(true)}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Close
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

const IncidentsPage: React.FC = () => {
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const workspaceId = workspace?.workspace_id;

  // Filter state
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Data state
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [meta, setMeta] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } | null>(null);
  const [stats, setStats] = useState<IncidentStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState(1);

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
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

  // Fetch incidents
  const fetchIncidents = useCallback(async () => {
    if (!workspaceId) {
      setIsLoading(false);
      return;
    }

    setIsFetching(true);
    setError(null);

    try {
      const query: ListIncidentsQuery = {
        page,
        limit: 25,
        incident_type: filters.incident_type as IncidentType || undefined,
        category: filters.category as IncidentCategory || undefined,
        severity: filters.severity as IncidentSeverity || undefined,
        priority: filters.priority as IncidentPriority || undefined,
        status: filters.status as IncidentStatus || undefined,
        is_data_breach: filters.is_data_breach ? filters.is_data_breach === 'true' : undefined,
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
      };

      const response = await listIncidents(workspaceId, query);

      if (isMountedRef.current) {
        // Filter by search query client-side
        let filteredData = response.data;
        if (debouncedSearch) {
          const searchLower = debouncedSearch.toLowerCase();
          filteredData = response.data.filter(
            (incident) =>
              incident.title.toLowerCase().includes(searchLower) ||
              incident.incident_number.toLowerCase().includes(searchLower)
          );
        }
        setIncidents(filteredData);
        setMeta(response.meta);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error('Failed to fetch incidents'));
        setIncidents([]);
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
      const statsData = await getIncidentStats(workspaceId);
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
    fetchIncidents();
    fetchStats();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchIncidents, fetchStats]);

  // Handlers
  const handleClearFilters = useCallback(() => {
    setFilters(initialFilters);
    setSearchQuery('');
    setPage(1);
  }, []);

  const handleCreateIncident = useCallback(async (data: CreateIncidentRequest) => {
    if (!workspaceId) return;

    setIsCreating(true);
    try {
      await createIncident(workspaceId, data);
      addToast({
        variant: 'success',
        title: 'Incident Reported',
        message: 'The incident has been logged successfully.',
        duration: 5000,
      });
      setIsCreateModalOpen(false);
      fetchIncidents();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Report Failed',
        message: err instanceof Error ? err.message : 'Failed to report incident',
        duration: 5000,
      });
    } finally {
      setIsCreating(false);
    }
  }, [workspaceId, addToast, fetchIncidents, fetchStats]);

  const handleRowClick = useCallback(async (row: IncidentSummary) => {
    if (!workspaceId) return;

    setSelectedIncidentId(row.incident_id);
    setIsDetailModalOpen(true);

    try {
      const fullIncident = await getIncident(workspaceId, row.incident_id);
      if (isMountedRef.current) {
        setSelectedIncident(fullIncident);
      }
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Error',
        message: 'Failed to load incident details',
        duration: 5000,
      });
      setIsDetailModalOpen(false);
    }
  }, [workspaceId, addToast]);

  const handleConfirm = useCallback(async () => {
    if (!workspaceId || !selectedIncidentId) return;

    setIsActionLoading(true);
    try {
      const updated = await confirmIncident(workspaceId, selectedIncidentId);
      setSelectedIncident(updated);
      addToast({
        variant: 'success',
        title: 'Incident Confirmed',
        message: 'The incident has been confirmed.',
        duration: 3000,
      });
      fetchIncidents();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Failed to confirm incident',
        duration: 5000,
      });
    } finally {
      setIsActionLoading(false);
    }
  }, [workspaceId, selectedIncidentId, addToast, fetchIncidents, fetchStats]);

  const handleInvestigate = useCallback(async () => {
    if (!workspaceId || !selectedIncidentId) return;

    setIsActionLoading(true);
    try {
      const updated = await startIncidentInvestigation(workspaceId, selectedIncidentId);
      setSelectedIncident(updated);
      addToast({
        variant: 'success',
        title: 'Investigation Started',
        message: 'The incident is now under investigation.',
        duration: 3000,
      });
      fetchIncidents();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Failed to start investigation',
        duration: 5000,
      });
    } finally {
      setIsActionLoading(false);
    }
  }, [workspaceId, selectedIncidentId, addToast, fetchIncidents, fetchStats]);

  const handleContain = useCallback(async () => {
    if (!workspaceId || !selectedIncidentId) return;

    setIsActionLoading(true);
    try {
      const updated = await containIncident(workspaceId, selectedIncidentId);
      setSelectedIncident(updated);
      addToast({
        variant: 'success',
        title: 'Containment Started',
        message: 'Containment actions are in progress.',
        duration: 3000,
      });
      fetchIncidents();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Failed to start containment',
        duration: 5000,
      });
    } finally {
      setIsActionLoading(false);
    }
  }, [workspaceId, selectedIncidentId, addToast, fetchIncidents, fetchStats]);

  const handleMarkContained = useCallback(async () => {
    if (!workspaceId || !selectedIncidentId) return;

    setIsActionLoading(true);
    try {
      const updated = await markIncidentContained(workspaceId, selectedIncidentId);
      setSelectedIncident(updated);
      addToast({
        variant: 'success',
        title: 'Incident Contained',
        message: 'The incident has been contained.',
        duration: 3000,
      });
      fetchIncidents();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Failed to mark as contained',
        duration: 5000,
      });
    } finally {
      setIsActionLoading(false);
    }
  }, [workspaceId, selectedIncidentId, addToast, fetchIncidents, fetchStats]);

  const handleResolve = useCallback(async (summary: string) => {
    if (!workspaceId || !selectedIncidentId) return;

    setIsActionLoading(true);
    try {
      const updated = await resolveIncident(workspaceId, selectedIncidentId, summary);
      setSelectedIncident(updated);
      addToast({
        variant: 'success',
        title: 'Incident Resolved',
        message: 'The incident has been resolved.',
        duration: 3000,
      });
      fetchIncidents();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Failed to resolve incident',
        duration: 5000,
      });
    } finally {
      setIsActionLoading(false);
    }
  }, [workspaceId, selectedIncidentId, addToast, fetchIncidents, fetchStats]);

  const handleCloseIncident = useCallback(async (lessonsLearned?: string) => {
    if (!workspaceId || !selectedIncidentId) return;

    setIsActionLoading(true);
    try {
      const updated = await closeIncident(workspaceId, selectedIncidentId, lessonsLearned);
      setSelectedIncident(updated);
      addToast({
        variant: 'success',
        title: 'Incident Closed',
        message: 'The incident has been closed.',
        duration: 3000,
      });
      fetchIncidents();
      fetchStats();
    } catch (err) {
      addToast({
        variant: 'error',
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Failed to close incident',
        duration: 5000,
      });
    } finally {
      setIsActionLoading(false);
    }
  }, [workspaceId, selectedIncidentId, addToast, fetchIncidents, fetchStats]);

  const handleCloseDetailModal = useCallback(() => {
    setIsDetailModalOpen(false);
    setSelectedIncident(null);
    setSelectedIncidentId(null);
  }, []);

  // Table columns
  const columns: Column<IncidentSummary>[] = useMemo(() => [
    {
      id: 'incident_number',
      header: 'Incident',
      accessor: 'incident_number',
      width: '140px',
      cell: (value, row) => (
        <div className="flex items-center gap-2">
          <IncidentTypeIcon type={row.incident_type} isDataBreach={row.is_data_breach} />
          <div>
            <div className="font-medium text-text-primary text-xs">{String(value)}</div>
            <div className="text-xs text-text-tertiary capitalize">
              {row.incident_type.replace(/_/g, ' ')}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'title',
      header: 'Title',
      accessor: 'title',
      cell: (value, row) => (
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-primary truncate max-w-[200px]">{String(value)}</span>
          {row.is_data_breach && (
            <ShieldOff className="w-4 h-4 text-error flex-shrink-0" />
          )}
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
      id: 'severity',
      header: 'Severity',
      accessor: 'severity',
      width: '100px',
      hideOnMobile: true,
      cell: (value) => <SeverityBadge severity={String(value)} />,
    },
    {
      id: 'priority',
      header: 'Priority',
      accessor: 'priority',
      width: '70px',
      hideOnMobile: true,
      cell: (value) => <PriorityBadge priority={String(value)} />,
    },
    {
      id: 'detected_at',
      header: 'Detected',
      accessor: 'detected_at',
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
  const totalIncidents = stats?.total_incidents ?? 0;
  const openIncidents = (stats?.by_status?.detected ?? 0) +
    (stats?.by_status?.confirmed ?? 0) +
    (stats?.by_status?.investigating ?? 0) +
    (stats?.by_status?.containing ?? 0) +
    (stats?.by_status?.contained ?? 0);
  const criticalIncidents = stats?.by_severity?.critical ?? 0;
  const dataBreaches = stats?.data_breaches_count ?? 0;

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Page Header */}
      <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gradient flex items-center gap-3">
                <div className="section-header-icon icon-container-accent">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                Security Incidents
              </h1>
              <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                Track and manage security and compliance incidents
              </p>
            </div>
            <div className="flex items-center gap-3">
              <AppButton
                variant="secondary"
                onClick={() => {
                  fetchIncidents();
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
                className="flex items-center gap-2 bg-error hover:bg-error/90"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Report Incident</span>
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
              onClick={fetchIncidents}
              className="ml-auto p-1 hover:bg-error/10 rounded"
            >
              <RefreshCcw className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={<AlertTriangle className="w-5 h-5" />}
            label="Total Incidents"
            value={totalIncidents}
            subtext="All time"
            colorClass="text-primary"
          />
          <StatCard
            icon={<Activity className="w-5 h-5" />}
            label="Open"
            value={openIncidents}
            subtext="Active incidents"
            colorClass="text-gold"
          />
          <StatCard
            icon={<Flame className="w-5 h-5" />}
            label="Critical"
            value={criticalIncidents}
            subtext="Severity: Critical"
            colorClass="text-error"
          />
          <StatCard
            icon={<ShieldOff className="w-5 h-5" />}
            label="Data Breaches"
            value={dataBreaches}
            subtext="Requiring notification"
            colorClass="text-error"
          />
        </div>

        {/* Search Bar */}
        <div className="glass-card rounded-xl p-4 mb-4">
          <div className="relative">
            <Search className="w-5 h-5 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by incident title or number..."
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

        {/* Incidents Table */}
        <div className="glass-card rounded-xl overflow-hidden">
          <DataTable
            data={incidents}
            columns={columns}
            keyAccessor="incident_id"
            isLoading={isLoading}
            emptyMessage="No incidents found"
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
        {!isLoading && incidents.length > 0 && (
          <div className="mt-4 text-center text-sm text-text-tertiary">
            Showing {incidents.length} of {meta?.total || 0} incidents
          </div>
        )}
      </main>

      {/* Create Incident Modal */}
      <CreateIncidentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateIncident}
        isCreating={isCreating}
      />

      {/* Incident Detail Modal */}
      <IncidentDetailModal
        isOpen={isDetailModalOpen}
        onClose={handleCloseDetailModal}
        incident={selectedIncident}
        onConfirm={handleConfirm}
        onInvestigate={handleInvestigate}
        onContain={handleContain}
        onMarkContained={handleMarkContained}
        onResolve={handleResolve}
        onCloseIncident={handleCloseIncident}
        isLoading={isActionLoading}
      />
    </div>
  );
};

export default IncidentsPage;
