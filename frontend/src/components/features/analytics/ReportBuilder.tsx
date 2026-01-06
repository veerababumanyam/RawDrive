/**
 * ReportBuilder Component
 *
 * A comprehensive form component for creating and editing custom analytics reports.
 * Allows users to configure report type, metrics, date ranges, filters,
 * export settings, and scheduling options.
 *
 * Feature: Analytics & Reporting
 * Task: T035 - Create ReportBuilder component
 */

import React, { useState, useMemo, useCallback, useEffect, ComponentType } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/AppCard';
import { Tabs, TabItem } from '@/components/ui/Tabs';
import AppInput from '@/components/ui/AppInput';
import AppButton from '@/components/ui/AppButton';
import { Checkbox, Toggle, Select, RadioGroup, Radio } from '@/components/ui/FormControls';
import {
  FileText,
  Settings,
  Calendar,
  Filter,
  Download,
  Clock,
  Users,
  BarChart3,
  PieChart,
  TrendingUp,
  DollarSign,
  Eye,
  Heart,
  MessageSquare,
  Activity,
  Plus,
  X,
  AlertCircle,
  Save,
  Play,
  Mail,
  Info,
  LucideIcon,
} from 'lucide-react';
import {
  ReportType,
  DateRangeType,
  ReportExportFormat,
} from '@rawdrive/shared-types';
import {
  REPORT_METRICS,
  DATE_RANGE_CONFIG,
  REPORT_RATE_LIMITS,
  DEFAULT_REPORT_CONFIG,
} from '@rawdrive/shared-constants';
import type {
  CreateReportRequest,
  UpdateReportRequest,
  ReportDetails,
  ReportRecipient,
} from '@/services/analyticsService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Type alias for tab icons compatible with the Tabs component */
type TabIconType = ComponentType<{ size?: number; className?: string }>;

export type ReportBuilderTab =
  | 'basics'
  | 'metrics'
  | 'dateRange'
  | 'filters'
  | 'export'
  | 'schedule';

export interface ReportBuilderProps {
  /** Existing report to edit (undefined for new report) */
  existingReport?: ReportDetails;
  /** Mode - create or edit */
  mode?: 'create' | 'edit';
  /** Callback when form is submitted */
  onSubmit: (data: CreateReportRequest | UpdateReportRequest) => Promise<void>;
  /** Callback when cancel is clicked */
  onCancel?: () => void;
  /** Whether submit is in progress */
  isSubmitting?: boolean;
  /** Initial tab to show */
  initialTab?: ReportBuilderTab;
  /** Show compact layout */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

interface FormErrors {
  name?: string;
  reportType?: string;
  metrics?: string;
  dateRange?: string;
  customDates?: string;
  exportFormat?: string;
  schedule?: string;
  recipients?: string;
}

interface FilterEntry {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface RecipientEntry {
  id: string;
  email: string;
  name?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPORT_TYPE_OPTIONS = [
  {
    value: ReportType.DASHBOARD_SUMMARY,
    label: 'Dashboard Summary',
    description: 'Overview of all workspace metrics',
    icon: BarChart3,
  },
  {
    value: ReportType.GALLERY_PERFORMANCE,
    label: 'Gallery Performance',
    description: 'Views, engagement, and downloads by gallery',
    icon: PieChart,
  },
  {
    value: ReportType.CLIENT_ENGAGEMENT,
    label: 'Client Engagement',
    description: 'Client activity, scores, and lifetime value',
    icon: Users,
  },
  {
    value: ReportType.REVENUE_REPORT,
    label: 'Revenue Report',
    description: 'Revenue metrics and trends',
    icon: DollarSign,
  },
  {
    value: ReportType.DOWNLOAD_REPORT,
    label: 'Download Report',
    description: 'Download activity and statistics',
    icon: Download,
  },
  {
    value: ReportType.CUSTOM,
    label: 'Custom Report',
    description: 'Build a custom report with selected metrics',
    icon: Settings,
  },
];

interface MetricItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface MetricCategory {
  label: string;
  icon: LucideIcon;
  metrics: MetricItem[];
}

const METRIC_CATEGORIES: Record<string, MetricCategory> = {
  gallery: {
    label: 'Gallery Metrics',
    icon: PieChart,
    metrics: [
      { id: REPORT_METRICS.GALLERY_VIEWS, label: 'Gallery Views', icon: Eye },
      { id: REPORT_METRICS.GALLERY_UNIQUE_VISITORS, label: 'Unique Visitors', icon: Users },
      { id: REPORT_METRICS.GALLERY_DOWNLOADS, label: 'Gallery Downloads', icon: Download },
      { id: REPORT_METRICS.GALLERY_FAVORITES, label: 'Favorites', icon: Heart },
      { id: REPORT_METRICS.GALLERY_COMMENTS, label: 'Comments', icon: MessageSquare },
      { id: REPORT_METRICS.GALLERY_ENGAGEMENT_SCORE, label: 'Engagement Score', icon: Activity },
    ],
  },
  client: {
    label: 'Client Metrics',
    icon: Users,
    metrics: [
      { id: REPORT_METRICS.CLIENT_TOTAL_VIEWS, label: 'Total Views', icon: Eye },
      { id: REPORT_METRICS.CLIENT_TOTAL_DOWNLOADS, label: 'Total Downloads', icon: Download },
      { id: REPORT_METRICS.CLIENT_ENGAGEMENT_SCORE, label: 'Engagement Score', icon: Activity },
      { id: REPORT_METRICS.CLIENT_LIFETIME_VALUE, label: 'Lifetime Value', icon: DollarSign },
      { id: REPORT_METRICS.CLIENT_CHURN_RISK, label: 'Churn Risk', icon: TrendingUp },
    ],
  },
  session: {
    label: 'Session Metrics',
    icon: Activity,
    metrics: [
      { id: REPORT_METRICS.SESSION_COUNT, label: 'Session Count', icon: Activity },
      { id: REPORT_METRICS.SESSION_DURATION_AVG, label: 'Avg. Session Duration', icon: Clock },
      { id: REPORT_METRICS.BOUNCE_RATE, label: 'Bounce Rate', icon: TrendingUp },
    ],
  },
  revenue: {
    label: 'Revenue Metrics',
    icon: DollarSign,
    metrics: [
      { id: REPORT_METRICS.REVENUE_TOTAL, label: 'Total Revenue', icon: DollarSign },
      { id: REPORT_METRICS.REVENUE_AVERAGE, label: 'Average Revenue', icon: DollarSign },
    ],
  },
};

const DATE_RANGE_OPTIONS = Object.entries(DATE_RANGE_CONFIG).map(([key, config]) => ({
  value: key,
  label: config.label,
}));

const EXPORT_FORMAT_OPTIONS = [
  { value: ReportExportFormat.CSV, label: 'CSV', description: 'Comma-separated values (spreadsheet compatible)' },
  { value: ReportExportFormat.XLSX, label: 'Excel (XLSX)', description: 'Microsoft Excel format' },
  { value: ReportExportFormat.PDF, label: 'PDF', description: 'Portable document format' },
];

const FILTER_FIELD_OPTIONS = [
  { value: 'gallery_id', label: 'Gallery' },
  { value: 'client_id', label: 'Client' },
  { value: 'device_type', label: 'Device Type' },
  { value: 'country_code', label: 'Country' },
  { value: 'event_type', label: 'Event Type' },
];

const FILTER_OPERATOR_OPTIONS = [
  { value: 'eq', label: 'Equals' },
  { value: 'ne', label: 'Not Equals' },
  { value: 'gt', label: 'Greater Than' },
  { value: 'lt', label: 'Less Than' },
  { value: 'gte', label: 'Greater or Equal' },
  { value: 'lte', label: 'Less or Equal' },
  { value: 'in', label: 'In List' },
  { value: 'contains', label: 'Contains' },
];

const SCHEDULE_OPTIONS = [
  { value: 'daily', label: 'Daily', cron: '0 9 * * *' },
  { value: 'weekly', label: 'Weekly (Monday)', cron: '0 9 * * 1' },
  { value: 'monthly', label: 'Monthly (1st)', cron: '0 9 1 * *' },
  { value: 'custom', label: 'Custom', cron: '' },
];

const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
];

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateCron(cron: string): boolean {
  // Basic cron validation (5 fields)
  const cronRegex = /^(\*|([0-5]?\d)) (\*|([01]?\d|2[0-3])) (\*|([12]?\d|3[01])) (\*|([1-9]|1[0-2])) (\*|([0-6]))$/;
  return cronRegex.test(cron.trim());
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

/**
 * Loading skeleton for the builder
 */
function BuilderSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-10 w-full bg-zinc-700 rounded" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-zinc-700/50 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * Info tooltip component
 */
function InfoTooltip({ text }: { text: string }) {
  return (
    <div className="relative group inline-flex ml-1">
      <Info className="w-4 h-4 text-text-tertiary cursor-help" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-surface-elevated border border-border rounded-lg text-xs text-text-secondary max-w-xs opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg whitespace-normal">
        {text}
      </div>
    </div>
  );
}

/**
 * Section header component
 */
interface SectionHeaderProps {
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  title: string;
  description?: string;
}

function SectionHeader({
  icon: Icon,
  iconColor = 'text-blue-500',
  iconBgColor = 'bg-blue-500/10',
  title,
  description,
}: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={cn('flex items-center justify-center w-10 h-10 rounded-xl shrink-0', iconBgColor)}>
        <Icon className={cn('w-5 h-5', iconColor)} />
      </div>
      <div>
        <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        {description && (
          <p className="text-sm text-text-tertiary">{description}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Report type selector card
 */
interface ReportTypeCardProps {
  value: string;
  label: string;
  description: string;
  icon: LucideIcon;
  isSelected: boolean;
  onClick: () => void;
}

function ReportTypeCard({
  label,
  description,
  icon: Icon,
  isSelected,
  onClick,
}: ReportTypeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border transition-all text-left',
        isSelected
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : 'border-border hover:border-primary/50 hover:bg-surface-elevated'
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center w-10 h-10 rounded-lg shrink-0 transition-colors',
          isSelected ? 'bg-primary/10' : 'bg-surface-elevated'
        )}
      >
        <Icon
          className={cn(
            'w-5 h-5 transition-colors',
            isSelected ? 'text-primary' : 'text-text-secondary'
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-medium',
          isSelected ? 'text-primary' : 'text-text-primary'
        )}>
          {label}
        </p>
        <p className="text-xs text-text-tertiary mt-0.5">{description}</p>
      </div>
    </button>
  );
}

/**
 * Metric checkbox component
 */
interface MetricCheckboxProps {
  id: string;
  label: string;
  icon: LucideIcon;
  isSelected: boolean;
  onChange: (checked: boolean) => void;
}

function MetricCheckbox({
  id,
  label,
  icon: Icon,
  isSelected,
  onChange,
}: MetricCheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50'
      )}
    >
      <Checkbox
        id={id}
        checked={isSelected}
        onChange={(e) => onChange(e.target.checked)}
        className="hidden"
      />
      <div
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-lg shrink-0',
          isSelected ? 'bg-primary/10' : 'bg-surface-elevated'
        )}
      >
        <Icon
          className={cn(
            'w-4 h-4',
            isSelected ? 'text-primary' : 'text-text-tertiary'
          )}
        />
      </div>
      <span
        className={cn(
          'text-sm font-medium',
          isSelected ? 'text-primary' : 'text-text-primary'
        )}
      >
        {label}
      </span>
      <div className="ml-auto">
        <div
          className={cn(
            'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
            isSelected ? 'bg-primary border-primary' : 'border-border'
          )}
        >
          {isSelected && (
            <svg
              className="w-3 h-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
    </label>
  );
}

/**
 * Filter row component
 */
interface FilterRowProps {
  filter: FilterEntry;
  onUpdate: (filter: FilterEntry) => void;
  onRemove: () => void;
}

function FilterRow({ filter, onUpdate, onRemove }: FilterRowProps) {
  return (
    <div className="flex items-center gap-2">
      <Select
        options={FILTER_FIELD_OPTIONS}
        value={filter.field}
        onChange={(e) => onUpdate({ ...filter, field: e.target.value })}
        selectSize="sm"
        fullWidth={false}
        className="min-w-[120px]"
      />
      <Select
        options={FILTER_OPERATOR_OPTIONS}
        value={filter.operator}
        onChange={(e) => onUpdate({ ...filter, operator: e.target.value })}
        selectSize="sm"
        fullWidth={false}
        className="min-w-[130px]"
      />
      <AppInput
        value={filter.value}
        onChange={(e) => onUpdate({ ...filter, value: e.target.value })}
        placeholder="Value"
        className="flex-1"
        inputSize="sm"
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-2 rounded-lg text-text-tertiary hover:text-red-500 hover:bg-red-500/10 transition-colors"
        title="Remove filter"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * Recipient row component
 */
interface RecipientRowProps {
  recipient: RecipientEntry;
  onUpdate: (recipient: RecipientEntry) => void;
  onRemove: () => void;
  error?: boolean;
}

function RecipientRow({ recipient, onUpdate, onRemove, error }: RecipientRowProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 grid grid-cols-2 gap-2">
        <AppInput
          value={recipient.email}
          onChange={(e) => onUpdate({ ...recipient, email: e.target.value })}
          placeholder="email@example.com"
          type="email"
          error={error ? 'Invalid email address' : undefined}
          inputSize="sm"
        />
        <AppInput
          value={recipient.name || ''}
          onChange={(e) => onUpdate({ ...recipient, name: e.target.value })}
          placeholder="Name (optional)"
          inputSize="sm"
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="p-2 rounded-lg text-text-tertiary hover:text-red-500 hover:bg-red-500/10 transition-colors"
        title="Remove recipient"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Content Components
// ---------------------------------------------------------------------------

/**
 * Basics tab - report name, description, and type
 */
interface BasicsTabProps {
  name: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  reportType: string;
  onReportTypeChange: (value: string) => void;
  errors: FormErrors;
}

function BasicsTab({
  name,
  onNameChange,
  description,
  onDescriptionChange,
  reportType,
  onReportTypeChange,
  errors,
}: BasicsTabProps) {
  return (
    <div className="space-y-6">
      <SectionHeader
        icon={FileText}
        iconColor="text-blue-500"
        iconBgColor="bg-blue-500/10"
        title="Report Details"
        description="Give your report a name and choose a type"
      />

      <div className="space-y-4">
        <AppInput
          label="Report Name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g., Weekly Gallery Performance"
          error={errors.name}
          isRequired
        />

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Description
            <span className="text-text-tertiary font-normal"> (optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Describe what this report tracks..."
            rows={3}
            className="w-full px-3 py-2.5 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
          />
        </div>
      </div>

      <div className="pt-4">
        <SectionHeader
          icon={Settings}
          iconColor="text-purple-500"
          iconBgColor="bg-purple-500/10"
          title="Report Type"
          description="Select the type of report to generate"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {REPORT_TYPE_OPTIONS.map((option) => (
            <ReportTypeCard
              key={option.value}
              value={option.value}
              label={option.label}
              description={option.description}
              icon={option.icon}
              isSelected={reportType === option.value}
              onClick={() => onReportTypeChange(option.value)}
            />
          ))}
        </div>
        {errors.reportType && (
          <p className="mt-2 text-xs text-error" role="alert">
            {errors.reportType}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Metrics tab - select metrics to include
 */
interface MetricsTabProps {
  selectedMetrics: string[];
  onMetricsChange: (metrics: string[]) => void;
  reportType: string;
  errors: FormErrors;
}

function MetricsTab({
  selectedMetrics,
  onMetricsChange,
  reportType,
  errors,
}: MetricsTabProps) {
  const handleMetricToggle = useCallback(
    (metricId: string, checked: boolean) => {
      if (checked) {
        onMetricsChange([...selectedMetrics, metricId]);
      } else {
        onMetricsChange(selectedMetrics.filter((m) => m !== metricId));
      }
    },
    [selectedMetrics, onMetricsChange]
  );

  const handleSelectAll = useCallback(
    (categoryMetrics: { id: string }[]) => {
      const categoryIds = categoryMetrics.map((m) => m.id);
      const allSelected = categoryIds.every((id) => selectedMetrics.includes(id));

      if (allSelected) {
        onMetricsChange(selectedMetrics.filter((m) => !categoryIds.includes(m)));
      } else {
        const newMetrics = [...selectedMetrics, ...categoryIds.filter((id) => !selectedMetrics.includes(id))];
        onMetricsChange(newMetrics);
      }
    },
    [selectedMetrics, onMetricsChange]
  );

  // Filter categories based on report type
  const visibleCategories = useMemo(() => {
    if (reportType === ReportType.GALLERY_PERFORMANCE) {
      return { gallery: METRIC_CATEGORIES.gallery, session: METRIC_CATEGORIES.session };
    }
    if (reportType === ReportType.CLIENT_ENGAGEMENT) {
      return { client: METRIC_CATEGORIES.client, session: METRIC_CATEGORIES.session };
    }
    if (reportType === ReportType.REVENUE_REPORT) {
      return { revenue: METRIC_CATEGORIES.revenue, client: METRIC_CATEGORIES.client };
    }
    if (reportType === ReportType.DOWNLOAD_REPORT) {
      return { gallery: METRIC_CATEGORIES.gallery };
    }
    return METRIC_CATEGORIES;
  }, [reportType]);

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={BarChart3}
        iconColor="text-green-500"
        iconBgColor="bg-green-500/10"
        title="Select Metrics"
        description="Choose which metrics to include in your report"
      />

      <div className="flex items-center justify-between text-sm">
        <span className="text-text-secondary">
          {selectedMetrics.length} metric{selectedMetrics.length !== 1 ? 's' : ''} selected
        </span>
        <button
          type="button"
          onClick={() => onMetricsChange([])}
          className="text-text-tertiary hover:text-text-primary transition-colors"
          disabled={selectedMetrics.length === 0}
        >
          Clear all
        </button>
      </div>

      <div className="space-y-6">
        {Object.entries(visibleCategories).map(([key, category]) => {
          const CategoryIcon = category.icon;
          const categoryMetrics = category.metrics;
          const selectedInCategory = categoryMetrics.filter((m) => selectedMetrics.includes(m.id)).length;

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CategoryIcon className="w-4 h-4 text-text-secondary" />
                  <h4 className="text-sm font-medium text-text-primary">{category.label}</h4>
                  <span className="text-xs text-text-tertiary">
                    ({selectedInCategory}/{categoryMetrics.length})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectAll(categoryMetrics)}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  {selectedInCategory === categoryMetrics.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {categoryMetrics.map((metric) => (
                  <MetricCheckbox
                    key={metric.id}
                    id={metric.id}
                    label={metric.label}
                    icon={metric.icon}
                    isSelected={selectedMetrics.includes(metric.id)}
                    onChange={(checked) => handleMetricToggle(metric.id, checked)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {errors.metrics && (
        <p className="text-xs text-error" role="alert">
          {errors.metrics}
        </p>
      )}
    </div>
  );
}

/**
 * Date Range tab
 */
interface DateRangeTabProps {
  dateRangeType: string;
  onDateRangeTypeChange: (value: string) => void;
  customStartDate: string;
  onCustomStartDateChange: (value: string) => void;
  customEndDate: string;
  onCustomEndDateChange: (value: string) => void;
  errors: FormErrors;
}

function DateRangeTab({
  dateRangeType,
  onDateRangeTypeChange,
  customStartDate,
  onCustomStartDateChange,
  customEndDate,
  onCustomEndDateChange,
  errors,
}: DateRangeTabProps) {
  const showCustomDates = dateRangeType === DateRangeType.CUSTOM;

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Calendar}
        iconColor="text-orange-500"
        iconBgColor="bg-orange-500/10"
        title="Date Range"
        description="Select the time period for this report"
      />

      <RadioGroup
        name="dateRange"
        value={dateRangeType}
        onChange={onDateRangeTypeChange}
        direction="vertical"
      >
        {DATE_RANGE_OPTIONS.map((option) => (
          <Radio
            key={option.value}
            value={option.value}
            label={option.label}
          />
        ))}
      </RadioGroup>

      {showCustomDates && (
        <div className="mt-4 p-4 bg-surface-elevated rounded-lg border border-border">
          <h4 className="text-sm font-medium text-text-primary mb-3">Custom Date Range</h4>
          <div className="grid grid-cols-2 gap-4">
            <AppInput
              label="Start Date"
              type="date"
              value={customStartDate}
              onChange={(e) => onCustomStartDateChange(e.target.value)}
              error={errors.customDates?.includes('start') ? 'Invalid start date' : undefined}
            />
            <AppInput
              label="End Date"
              type="date"
              value={customEndDate}
              onChange={(e) => onCustomEndDateChange(e.target.value)}
              error={errors.customDates?.includes('end') ? 'Invalid end date' : undefined}
            />
          </div>
          {errors.customDates && !errors.customDates.includes('start') && !errors.customDates.includes('end') && (
            <p className="mt-2 text-xs text-error" role="alert">
              {errors.customDates}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Filters tab
 */
interface FiltersTabProps {
  filters: FilterEntry[];
  onFiltersChange: (filters: FilterEntry[]) => void;
  grouping: string[];
  onGroupingChange: (grouping: string[]) => void;
}

function FiltersTab({
  filters,
  onFiltersChange,
  grouping,
  onGroupingChange,
}: FiltersTabProps) {
  const handleAddFilter = useCallback(() => {
    onFiltersChange([
      ...filters,
      { id: generateId(), field: 'gallery_id', operator: 'eq', value: '' },
    ]);
  }, [filters, onFiltersChange]);

  const handleUpdateFilter = useCallback(
    (index: number, filter: FilterEntry) => {
      const newFilters = [...filters];
      newFilters[index] = filter;
      onFiltersChange(newFilters);
    },
    [filters, onFiltersChange]
  );

  const handleRemoveFilter = useCallback(
    (index: number) => {
      onFiltersChange(filters.filter((_, i) => i !== index));
    },
    [filters, onFiltersChange]
  );

  const handleGroupingToggle = useCallback(
    (field: string, checked: boolean) => {
      if (checked) {
        onGroupingChange([...grouping, field]);
      } else {
        onGroupingChange(grouping.filter((g) => g !== field));
      }
    },
    [grouping, onGroupingChange]
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Filter}
        iconColor="text-purple-500"
        iconBgColor="bg-purple-500/10"
        title="Filters"
        description="Add filters to narrow down report data"
      />

      <div className="space-y-3">
        {filters.length === 0 ? (
          <p className="text-sm text-text-tertiary py-4 text-center">
            No filters added. Click below to add a filter.
          </p>
        ) : (
          filters.map((filter, index) => (
            <FilterRow
              key={filter.id}
              filter={filter}
              onUpdate={(f) => handleUpdateFilter(index, f)}
              onRemove={() => handleRemoveFilter(index)}
            />
          ))
        )}
        <button
          type="button"
          onClick={handleAddFilter}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary hover:text-primary/80 hover:bg-primary/5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Filter</span>
        </button>
      </div>

      <div className="pt-4">
        <SectionHeader
          icon={BarChart3}
          iconColor="text-teal-500"
          iconBgColor="bg-teal-500/10"
          title="Grouping"
          description="Group results by specific fields"
        />

        <div className="space-y-2">
          {FILTER_FIELD_OPTIONS.map((option) => (
            <Checkbox
              key={option.value}
              id={`grouping-${option.value}`}
              label={option.label}
              checked={grouping.includes(option.value)}
              onChange={(e) => handleGroupingToggle(option.value, e.target.checked)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Export tab
 */
interface ExportTabProps {
  exportFormat: string;
  onExportFormatChange: (value: string) => void;
  errors: FormErrors;
}

function ExportTab({
  exportFormat,
  onExportFormatChange,
  errors,
}: ExportTabProps) {
  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Download}
        iconColor="text-emerald-500"
        iconBgColor="bg-emerald-500/10"
        title="Export Format"
        description="Choose how to export your report"
      />

      <div className="space-y-3">
        {EXPORT_FORMAT_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all',
              exportFormat === option.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            )}
          >
            <Radio
              name="exportFormat"
              value={option.value}
              checked={exportFormat === option.value}
              onChange={(e) => onExportFormatChange(e.target.value)}
            />
            <div className="flex-1">
              <p className={cn(
                'text-sm font-medium',
                exportFormat === option.value ? 'text-primary' : 'text-text-primary'
              )}>
                {option.label}
              </p>
              <p className="text-xs text-text-tertiary mt-0.5">{option.description}</p>
            </div>
          </label>
        ))}
      </div>

      {errors.exportFormat && (
        <p className="text-xs text-error" role="alert">
          {errors.exportFormat}
        </p>
      )}
    </div>
  );
}

/**
 * Schedule tab
 */
interface ScheduleTabProps {
  isScheduled: boolean;
  onIsScheduledChange: (value: boolean) => void;
  scheduleType: string;
  onScheduleTypeChange: (value: string) => void;
  customCron: string;
  onCustomCronChange: (value: string) => void;
  timezone: string;
  onTimezoneChange: (value: string) => void;
  recipients: RecipientEntry[];
  onRecipientsChange: (recipients: RecipientEntry[]) => void;
  errors: FormErrors;
}

function ScheduleTab({
  isScheduled,
  onIsScheduledChange,
  scheduleType,
  onScheduleTypeChange,
  customCron,
  onCustomCronChange,
  timezone,
  onTimezoneChange,
  recipients,
  onRecipientsChange,
  errors,
}: ScheduleTabProps) {
  const handleAddRecipient = useCallback(() => {
    onRecipientsChange([
      ...recipients,
      { id: generateId(), email: '', name: '' },
    ]);
  }, [recipients, onRecipientsChange]);

  const handleUpdateRecipient = useCallback(
    (index: number, recipient: RecipientEntry) => {
      const newRecipients = [...recipients];
      newRecipients[index] = recipient;
      onRecipientsChange(newRecipients);
    },
    [recipients, onRecipientsChange]
  );

  const handleRemoveRecipient = useCallback(
    (index: number) => {
      onRecipientsChange(recipients.filter((_, i) => i !== index));
    },
    [recipients, onRecipientsChange]
  );

  const invalidRecipientIndices = useMemo(() => {
    return recipients
      .map((r, i) => (r.email && !validateEmail(r.email) ? i : -1))
      .filter((i) => i !== -1);
  }, [recipients]);

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Clock}
        iconColor="text-amber-500"
        iconBgColor="bg-amber-500/10"
        title="Report Schedule"
        description="Automatically run this report on a schedule"
      />

      <Toggle
        label="Enable Scheduling"
        description="Automatically generate and send this report"
        checked={isScheduled}
        onChange={(e) => onIsScheduledChange(e.target.checked)}
      />

      {isScheduled && (
        <div className="space-y-6 pt-4">
          {/* Schedule frequency */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-3">
              Frequency
            </label>
            <RadioGroup
              name="scheduleType"
              value={scheduleType}
              onChange={onScheduleTypeChange}
              direction="horizontal"
            >
              {SCHEDULE_OPTIONS.map((option) => (
                <Radio
                  key={option.value}
                  value={option.value}
                  label={option.label}
                />
              ))}
            </RadioGroup>

            {scheduleType === 'custom' && (
              <div className="mt-4">
                <div className="flex items-center gap-1 mb-1.5">
                  <label className="text-sm font-medium text-text-primary">Cron Expression</label>
                  <InfoTooltip text="Format: minute hour day-of-month month day-of-week. Example: 0 9 * * 1 runs every Monday at 9 AM." />
                </div>
                <AppInput
                  value={customCron}
                  onChange={(e) => onCustomCronChange(e.target.value)}
                  placeholder="0 9 * * *"
                  error={errors.schedule}
                />
              </div>
            )}
          </div>

          {/* Timezone */}
          <Select
            label="Timezone"
            options={TIMEZONE_OPTIONS}
            value={timezone}
            onChange={(e) => onTimezoneChange(e.target.value)}
          />

          {/* Recipients */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Mail className="w-4 h-4 text-text-secondary" />
              <h4 className="text-sm font-medium text-text-primary">Email Recipients</h4>
              <span className="text-xs text-text-tertiary">
                (max {REPORT_RATE_LIMITS.MAX_SCHEDULED_REPORTS})
              </span>
            </div>

            <div className="space-y-2">
              {recipients.length === 0 ? (
                <p className="text-sm text-text-tertiary py-2">
                  No recipients added. Add email addresses to receive scheduled reports.
                </p>
              ) : (
                recipients.map((recipient, index) => (
                  <RecipientRow
                    key={recipient.id}
                    recipient={recipient}
                    onUpdate={(r) => handleUpdateRecipient(index, r)}
                    onRemove={() => handleRemoveRecipient(index)}
                    error={invalidRecipientIndices.includes(index)}
                  />
                ))
              )}
              <button
                type="button"
                onClick={handleAddRecipient}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary hover:text-primary/80 hover:bg-primary/5 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add Recipient</span>
              </button>
            </div>

            {errors.recipients && (
              <p className="mt-2 text-xs text-error" role="alert">
                {errors.recipients}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ReportBuilder({
  existingReport,
  mode = 'create',
  onSubmit,
  onCancel,
  isSubmitting = false,
  initialTab = 'basics',
  compact = false,
  className,
}: ReportBuilderProps) {
  // Active tab state
  const [activeTab, setActiveTab] = useState<ReportBuilderTab>(initialTab);

  // Form state
  const [name, setName] = useState(existingReport?.name || '');
  const [description, setDescription] = useState(existingReport?.description || '');
  const [reportType, setReportType] = useState(existingReport?.reportType || ReportType.DASHBOARD_SUMMARY);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(existingReport?.metrics || []);
  const [dateRangeType, setDateRangeType] = useState(existingReport?.dateRangeType || DEFAULT_REPORT_CONFIG.dateRangeType);
  const [customStartDate, setCustomStartDate] = useState(existingReport?.customStartDate || '');
  const [customEndDate, setCustomEndDate] = useState(existingReport?.customEndDate || '');
  const [filters, setFilters] = useState<FilterEntry[]>([]);
  const [grouping, setGrouping] = useState<string[]>(existingReport?.grouping || []);
  const [exportFormat, setExportFormat] = useState(existingReport?.exportFormat || DEFAULT_REPORT_CONFIG.exportFormat);
  const [isScheduled, setIsScheduled] = useState(existingReport?.isScheduled || false);
  const [scheduleType, setScheduleType] = useState('weekly');
  const [customCron, setCustomCron] = useState(existingReport?.scheduleCron || '');
  const [timezone, setTimezone] = useState(existingReport?.scheduleTimezone || DEFAULT_REPORT_CONFIG.timezone);
  const [recipients, setRecipients] = useState<RecipientEntry[]>([]);

  // Error state
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Initialize filters and recipients from existing report
  useEffect(() => {
    if (existingReport?.filters) {
      const filterEntries: FilterEntry[] = Object.entries(existingReport.filters).map(([field, config]) => ({
        id: generateId(),
        field,
        operator: (config as { operator: string })?.operator || 'eq',
        value: String((config as { value: unknown })?.value || ''),
      }));
      setFilters(filterEntries);
    }

    if (existingReport?.recipients) {
      const recipientEntries: RecipientEntry[] = existingReport.recipients.map((r) => ({
        id: generateId(),
        email: r.email,
        name: r.name,
      }));
      setRecipients(recipientEntries);
    }

    // Determine schedule type from cron
    if (existingReport?.scheduleCron) {
      const matchingSchedule = SCHEDULE_OPTIONS.find((s) => s.cron === existingReport.scheduleCron);
      setScheduleType(matchingSchedule?.value || 'custom');
      if (!matchingSchedule) {
        setCustomCron(existingReport.scheduleCron);
      }
    }
  }, [existingReport]);

  // Tab configuration
  const tabs = useMemo<TabItem<ReportBuilderTab>[]>(
    () => [
      { id: 'basics', label: 'Basics', icon: FileText as TabIconType },
      { id: 'metrics', label: 'Metrics', icon: BarChart3 as TabIconType },
      { id: 'dateRange', label: 'Date Range', icon: Calendar as TabIconType },
      { id: 'filters', label: 'Filters', icon: Filter as TabIconType },
      { id: 'export', label: 'Export', icon: Download as TabIconType },
      { id: 'schedule', label: 'Schedule', icon: Clock as TabIconType },
    ],
    []
  );

  // Validation
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    // Validate name
    if (!name.trim()) {
      newErrors.name = 'Report name is required';
    } else if (name.trim().length > 255) {
      newErrors.name = 'Name must be 255 characters or less';
    }

    // Validate report type
    if (!reportType) {
      newErrors.reportType = 'Please select a report type';
    }

    // Validate metrics (only for custom reports)
    if (reportType === ReportType.CUSTOM && selectedMetrics.length === 0) {
      newErrors.metrics = 'Please select at least one metric';
    }

    // Validate custom date range
    if (dateRangeType === DateRangeType.CUSTOM) {
      if (!customStartDate) {
        newErrors.customDates = 'Start date is required';
      } else if (!customEndDate) {
        newErrors.customDates = 'End date is required';
      } else if (new Date(customStartDate) > new Date(customEndDate)) {
        newErrors.customDates = 'Start date must be before end date';
      }
    }

    // Validate schedule
    if (isScheduled) {
      if (scheduleType === 'custom' && customCron && !validateCron(customCron)) {
        newErrors.schedule = 'Invalid cron expression';
      }

      // Validate recipients
      const validRecipients = recipients.filter((r) => r.email.trim());
      const invalidEmails = validRecipients.filter((r) => !validateEmail(r.email));
      if (invalidEmails.length > 0) {
        newErrors.recipients = 'Please enter valid email addresses';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, reportType, selectedMetrics, dateRangeType, customStartDate, customEndDate, isScheduled, scheduleType, customCron, recipients]);

  // Handle submit
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(null);

      if (!validateForm()) {
        // Navigate to first tab with error
        if (errors.name || errors.reportType) setActiveTab('basics');
        else if (errors.metrics) setActiveTab('metrics');
        else if (errors.dateRange || errors.customDates) setActiveTab('dateRange');
        else if (errors.exportFormat) setActiveTab('export');
        else if (errors.schedule || errors.recipients) setActiveTab('schedule');
        return;
      }

      // Build filters object
      const filtersObj: Record<string, { operator: string; value: string }> = {};
      filters.forEach((f) => {
        if (f.field && f.value) {
          filtersObj[f.field] = { operator: f.operator, value: f.value };
        }
      });

      // Build recipients array
      const recipientsArr: ReportRecipient[] = recipients
        .filter((r) => r.email.trim())
        .map((r) => ({
          email: r.email.trim(),
          name: r.name?.trim() || undefined,
          recipientType: 'email' as const,
        }));

      // Get cron expression
      let scheduleCron = '';
      if (isScheduled) {
        if (scheduleType === 'custom') {
          scheduleCron = customCron;
        } else {
          scheduleCron = SCHEDULE_OPTIONS.find((s) => s.value === scheduleType)?.cron || '';
        }
      }

      const data: CreateReportRequest | UpdateReportRequest = {
        name: name.trim(),
        reportType,
        description: description.trim() || undefined,
        metrics: selectedMetrics.length > 0 ? selectedMetrics : undefined,
        filters: Object.keys(filtersObj).length > 0 ? filtersObj : undefined,
        grouping: grouping.length > 0 ? grouping : undefined,
        dateRangeType,
        customStartDate: dateRangeType === DateRangeType.CUSTOM ? customStartDate : undefined,
        customEndDate: dateRangeType === DateRangeType.CUSTOM ? customEndDate : undefined,
        exportFormat: exportFormat as 'csv' | 'xlsx' | 'pdf',
        isScheduled,
        scheduleCron: isScheduled ? scheduleCron : undefined,
        scheduleTimezone: isScheduled ? timezone : undefined,
        recipients: isScheduled && recipientsArr.length > 0 ? recipientsArr : undefined,
      };

      try {
        await onSubmit(data);
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : 'Failed to save report');
      }
    },
    [
      validateForm,
      errors,
      name,
      reportType,
      description,
      selectedMetrics,
      filters,
      grouping,
      dateRangeType,
      customStartDate,
      customEndDate,
      exportFormat,
      isScheduled,
      scheduleType,
      customCron,
      timezone,
      recipients,
      onSubmit,
    ]
  );

  // Render active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'basics':
        return (
          <BasicsTab
            name={name}
            onNameChange={setName}
            description={description}
            onDescriptionChange={setDescription}
            reportType={reportType}
            onReportTypeChange={setReportType}
            errors={errors}
          />
        );
      case 'metrics':
        return (
          <MetricsTab
            selectedMetrics={selectedMetrics}
            onMetricsChange={setSelectedMetrics}
            reportType={reportType}
            errors={errors}
          />
        );
      case 'dateRange':
        return (
          <DateRangeTab
            dateRangeType={dateRangeType}
            onDateRangeTypeChange={setDateRangeType}
            customStartDate={customStartDate}
            onCustomStartDateChange={setCustomStartDate}
            customEndDate={customEndDate}
            onCustomEndDateChange={setCustomEndDate}
            errors={errors}
          />
        );
      case 'filters':
        return (
          <FiltersTab
            filters={filters}
            onFiltersChange={setFilters}
            grouping={grouping}
            onGroupingChange={setGrouping}
          />
        );
      case 'export':
        return (
          <ExportTab
            exportFormat={exportFormat}
            onExportFormatChange={setExportFormat}
            errors={errors}
          />
        );
      case 'schedule':
        return (
          <ScheduleTab
            isScheduled={isScheduled}
            onIsScheduledChange={setIsScheduled}
            scheduleType={scheduleType}
            onScheduleTypeChange={setScheduleType}
            customCron={customCron}
            onCustomCronChange={setCustomCron}
            timezone={timezone}
            onTimezoneChange={setTimezone}
            recipients={recipients}
            onRecipientsChange={setRecipients}
            errors={errors}
          />
        );
      default:
        return null;
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 shrink-0">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {mode === 'create' ? 'Create Report' : 'Edit Report'}
          </h2>
          <p className="text-sm text-text-tertiary">
            {mode === 'create'
              ? 'Configure a new custom analytics report'
              : `Editing "${existingReport?.name}"`}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        ariaLabel="Report builder sections"
        size="sm"
        iconsOnlyMobile
      />

      {/* Tab Content */}
      <Card variant="elevated" className="p-6">
        {renderTabContent()}
      </Card>

      {/* Submit Error */}
      {submitError && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-500">{submitError}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-4 pt-4 border-t border-border">
        <div className="flex items-center gap-2 text-sm text-text-tertiary">
          <Info className="w-4 h-4" />
          <span>All fields marked with * are required</span>
        </div>
        <div className="flex items-center gap-3">
          {onCancel && (
            <AppButton
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </AppButton>
          )}
          <AppButton
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
            leftIcon={mode === 'create' ? <Plus className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          >
            {mode === 'create' ? 'Create Report' : 'Save Changes'}
          </AppButton>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Convenience Components
// ---------------------------------------------------------------------------

export interface QuickReportBuilderProps {
  /** Report type to create */
  reportType: string;
  /** Callback when form is submitted */
  onSubmit: (data: CreateReportRequest) => Promise<void>;
  /** Callback when cancel is clicked */
  onCancel?: () => void;
  /** Whether submit is in progress */
  isSubmitting?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Simplified report builder for quick report creation
 */
export function QuickReportBuilder({
  reportType,
  onSubmit,
  onCancel,
  isSubmitting = false,
  className,
}: QuickReportBuilderProps) {
  const [name, setName] = useState('');
  const [dateRangeType, setDateRangeType] = useState<string>(DEFAULT_REPORT_CONFIG.dateRangeType);
  const [exportFormat, setExportFormat] = useState<string>(DEFAULT_REPORT_CONFIG.exportFormat);
  const [error, setError] = useState<string | null>(null);

  const reportTypeConfig = REPORT_TYPE_OPTIONS.find((r) => r.value === reportType);
  const ReportIcon = reportTypeConfig?.icon || FileText;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Report name is required');
      return;
    }

    try {
      await onSubmit({
        name: name.trim(),
        reportType,
        dateRangeType,
        exportFormat: exportFormat as 'csv' | 'xlsx' | 'pdf',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create report');
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 shrink-0">
          <ReportIcon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-text-primary">
            Quick {reportTypeConfig?.label || 'Report'}
          </h3>
          <p className="text-sm text-text-tertiary">
            {reportTypeConfig?.description || 'Create a new report'}
          </p>
        </div>
      </div>

      <AppInput
        label="Report Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g., Weekly Summary"
        error={error && !name.trim() ? 'Report name is required' : undefined}
        isRequired
      />

      <Select
        label="Date Range"
        options={DATE_RANGE_OPTIONS}
        value={dateRangeType}
        onChange={(e) => setDateRangeType(e.target.value)}
      />

      <Select
        label="Export Format"
        options={EXPORT_FORMAT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        value={exportFormat}
        onChange={(e) => setExportFormat(e.target.value)}
      />

      {error && name.trim() && (
        <div className="flex items-center gap-2 text-sm text-error">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        {onCancel && (
          <AppButton
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </AppButton>
        )}
        <AppButton
          type="submit"
          variant="primary"
          isLoading={isSubmitting}
          leftIcon={<Play className="w-4 h-4" />}
        >
          Generate Report
        </AppButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Default Export
// ---------------------------------------------------------------------------

export default ReportBuilder;
