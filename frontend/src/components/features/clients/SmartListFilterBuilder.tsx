/**
 * SmartListFilterBuilder Component
 *
 * Visual builder for smart list filter criteria.
 * Requirements: 22.1, 22.2 - Build filter criteria, preview matching clients
 */

import React, { useState, useCallback } from 'react';
import {
  Plus,
  Trash2,
  ChevronDown,
  Filter,
  AlertCircle,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppInput } from '../../ui/AppInput';
import { AppBadge } from '../../ui/AppBadge';
import type {
  SmartListFilterCriteria,
  SmartListFilterCondition,
  SmartListFilterType,
  SmartListOperator,
} from '../../../types/client';

/* =============================================================================
   Constants
   ============================================================================= */

// Available filter fields
const FILTER_FIELDS: { value: string; label: string; type: 'text' | 'select' | 'date' | 'number' }[] = [
  { value: 'status', label: 'Status', type: 'select' },
  { value: 'tag', label: 'Tag', type: 'text' },
  { value: 'has_gallery', label: 'Has Gallery', type: 'select' },
  { value: 'gallery_count', label: 'Gallery Count', type: 'number' },
  { value: 'created_at', label: 'Created Date', type: 'date' },
  { value: 'last_activity', label: 'Last Activity', type: 'date' },
  { value: 'organization', label: 'Organization', type: 'text' },
  { value: 'location', label: 'Location', type: 'text' },
];

// Available operators by field type
const OPERATORS_BY_TYPE: Record<string, { value: SmartListOperator; label: string }[]> = {
  text: [
    { value: 'eq', label: 'equals' },
    { value: 'ne', label: 'not equals' },
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: 'does not contain' },
  ],
  select: [
    { value: 'eq', label: 'is' },
    { value: 'ne', label: 'is not' },
  ],
  date: [
    { value: 'eq', label: 'is' },
    { value: 'gt', label: 'is after' },
    { value: 'gte', label: 'is on or after' },
    { value: 'lt', label: 'is before' },
    { value: 'lte', label: 'is on or before' },
  ],
  number: [
    { value: 'eq', label: 'equals' },
    { value: 'ne', label: 'not equals' },
    { value: 'gt', label: 'greater than' },
    { value: 'gte', label: 'at least' },
    { value: 'lt', label: 'less than' },
    { value: 'lte', label: 'at most' },
  ],
};

// Value options for select fields
const SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  status: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ],
  has_gallery: [
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' },
  ],
};

// Date presets
const DATE_PRESETS: { value: string; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'last_90_days', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_year', label: 'This year' },
];

/* =============================================================================
   SmartListFilterBuilder Component
   ============================================================================= */

interface SmartListFilterBuilderProps {
  /** Current filter criteria */
  value: SmartListFilterCriteria;
  /** Callback when criteria changes */
  onChange: (criteria: SmartListFilterCriteria) => void;
  /** Available tags for autocomplete */
  availableTags?: string[];
}

export const SmartListFilterBuilder: React.FC<SmartListFilterBuilderProps> = ({
  value,
  onChange,
  availableTags = [],
}) => {
  // Get field config
  const getFieldConfig = useCallback((field: string) => {
    return FILTER_FIELDS.find((f) => f.value === field);
  }, []);

  // Get operators for field
  const getOperators = useCallback((field: string) => {
    const config = getFieldConfig(field);
    return OPERATORS_BY_TYPE[config?.type || 'text'] || OPERATORS_BY_TYPE.text;
  }, [getFieldConfig]);

  // Add condition
  const addCondition = useCallback(() => {
    const newCondition: SmartListFilterCondition = {
      field: 'status',
      operator: 'eq',
      value: 'active',
    };
    onChange({
      ...value,
      conditions: [...value.conditions, newCondition],
    });
  }, [value, onChange]);

  // Update condition
  const updateCondition = useCallback(
    (index: number, updates: Partial<SmartListFilterCondition>) => {
      const newConditions = [...value.conditions];
      newConditions[index] = { ...newConditions[index], ...updates };

      // Reset value when field changes
      if (updates.field && updates.field !== value.conditions[index].field) {
        const config = getFieldConfig(updates.field);
        if (config?.type === 'select') {
          const options = SELECT_OPTIONS[updates.field];
          newConditions[index].value = options?.[0]?.value || '';
        } else if (config?.type === 'number') {
          newConditions[index].value = 0;
        } else if (config?.type === 'date') {
          newConditions[index].value = 'last_30_days';
        } else {
          newConditions[index].value = '';
        }
        // Reset operator to first available
        const operators = getOperators(updates.field);
        newConditions[index].operator = operators[0].value;
      }

      onChange({
        ...value,
        conditions: newConditions,
      });
    },
    [value, onChange, getFieldConfig, getOperators]
  );

  // Remove condition
  const removeCondition = useCallback(
    (index: number) => {
      const newConditions = value.conditions.filter((_, i) => i !== index);
      onChange({
        ...value,
        conditions: newConditions,
      });
    },
    [value, onChange]
  );

  // Toggle filter type (AND/OR)
  const toggleFilterType = useCallback(() => {
    onChange({
      ...value,
      type: value.type === 'and' ? 'or' : 'and',
    });
  }, [value, onChange]);

  return (
    <div className="space-y-4">
      {/* Filter Type Toggle */}
      {value.conditions.length > 1 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-surface-hover/50">
          <span className="text-sm text-text-secondary">Match</span>
          <button
            onClick={toggleFilterType}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              value.type === 'and'
                ? 'bg-primary text-white'
                : 'bg-surface-hover text-text-primary hover:bg-surface-hover/80'
            }`}
          >
            ALL
          </button>
          <button
            onClick={toggleFilterType}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              value.type === 'or'
                ? 'bg-primary text-white'
                : 'bg-surface-hover text-text-primary hover:bg-surface-hover/80'
            }`}
          >
            ANY
          </button>
          <span className="text-sm text-text-secondary">of the following:</span>
        </div>
      )}

      {/* Conditions */}
      {value.conditions.length === 0 ? (
        <div className="text-center py-8 rounded-xl bg-surface-hover/30 border-2 border-dashed border-border">
          <Filter size={24} className="text-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-text-tertiary mb-3">
            No filter conditions yet
          </p>
          <AppButton
            variant="outline"
            size="sm"
            leftIcon={<Plus size={14} />}
            onClick={addCondition}
          >
            Add Condition
          </AppButton>
        </div>
      ) : (
        <div className="space-y-2">
          {value.conditions.map((condition, index) => (
            <FilterConditionRow
              key={index}
              condition={condition}
              index={index}
              showConnector={index > 0}
              connectorType={value.type}
              availableTags={availableTags}
              onChange={(updates) => updateCondition(index, updates)}
              onRemove={() => removeCondition(index)}
            />
          ))}
        </div>
      )}

      {/* Add Condition Button */}
      {value.conditions.length > 0 && (
        <AppButton
          variant="ghost"
          size="sm"
          leftIcon={<Plus size={14} />}
          onClick={addCondition}
          className="w-full"
        >
          Add Condition
        </AppButton>
      )}

      {/* Preview Info */}
      {value.conditions.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-info/10 border border-info/20">
          <AlertCircle size={16} className="text-info mt-0.5" />
          <div className="text-sm text-text-secondary">
            <p>
              This list will include clients that match{' '}
              <strong>{value.type === 'and' ? 'all' : 'any'}</strong> of the{' '}
              {value.conditions.length} condition
              {value.conditions.length !== 1 ? 's' : ''} above.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

/* =============================================================================
   FilterConditionRow Component
   ============================================================================= */

interface FilterConditionRowProps {
  condition: SmartListFilterCondition;
  index: number;
  showConnector: boolean;
  connectorType: SmartListFilterType;
  availableTags?: string[];
  onChange: (updates: Partial<SmartListFilterCondition>) => void;
  onRemove: () => void;
}

const FilterConditionRow: React.FC<FilterConditionRowProps> = ({
  condition,
  showConnector,
  connectorType,
  availableTags = [],
  onChange,
  onRemove,
}) => {
  const [fieldMenuOpen, setFieldMenuOpen] = useState(false);
  const [operatorMenuOpen, setOperatorMenuOpen] = useState(false);
  const [valueMenuOpen, setValueMenuOpen] = useState(false);

  const fieldConfig = FILTER_FIELDS.find((f) => f.value === condition.field);
  const operators = OPERATORS_BY_TYPE[fieldConfig?.type || 'text'];
  const currentOperator = operators.find((o) => o.value === condition.operator);

  // Render value input based on field type
  const renderValueInput = () => {
    switch (fieldConfig?.type) {
      case 'select': {
        const options = SELECT_OPTIONS[condition.field] || [];
        return (
          <div className="relative">
            <button
              onClick={() => setValueMenuOpen(!valueMenuOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-hover hover:bg-surface-hover/80 text-sm transition-colors min-w-[100px]"
            >
              <span>
                {options.find((o) => o.value === String(condition.value))?.label ||
                  String(condition.value)}
              </span>
              <ChevronDown size={14} />
            </button>
            {valueMenuOpen && (
              <div className="absolute z-10 top-full left-0 mt-1 py-1 bg-surface rounded-lg shadow-lg border border-border min-w-[120px]">
                {options.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onChange({ value: option.value });
                      setValueMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-surface-hover transition-colors ${
                      String(condition.value) === option.value
                        ? 'text-primary font-medium'
                        : 'text-text-primary'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      }

      case 'date':
        return (
          <div className="relative">
            <button
              onClick={() => setValueMenuOpen(!valueMenuOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-hover hover:bg-surface-hover/80 text-sm transition-colors min-w-[120px]"
            >
              <span>
                {DATE_PRESETS.find((p) => p.value === String(condition.value))
                  ?.label || String(condition.value)}
              </span>
              <ChevronDown size={14} />
            </button>
            {valueMenuOpen && (
              <div className="absolute z-10 top-full left-0 mt-1 py-1 bg-surface rounded-lg shadow-lg border border-border min-w-[150px] max-h-[200px] overflow-y-auto">
                {DATE_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => {
                      onChange({ value: preset.value });
                      setValueMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-surface-hover transition-colors ${
                      String(condition.value) === preset.value
                        ? 'text-primary font-medium'
                        : 'text-text-primary'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );

      case 'number':
        return (
          <AppInput
            type="number"
            value={String(condition.value || 0)}
            onChange={(e) => onChange({ value: parseInt(e.target.value, 10) || 0 })}
            className="w-24"
          />
        );

      default:
        if (condition.field === 'tag' && availableTags.length > 0) {
          return (
            <div className="relative">
              <button
                onClick={() => setValueMenuOpen(!valueMenuOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-hover hover:bg-surface-hover/80 text-sm transition-colors min-w-[120px]"
              >
                <span>{String(condition.value) || 'Select tag...'}</span>
                <ChevronDown size={14} />
              </button>
              {valueMenuOpen && (
                <div className="absolute z-10 top-full left-0 mt-1 py-1 bg-surface rounded-lg shadow-lg border border-border min-w-[150px] max-h-[200px] overflow-y-auto">
                  {availableTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => {
                        onChange({ value: tag });
                        setValueMenuOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-sm text-left hover:bg-surface-hover transition-colors ${
                        String(condition.value) === tag
                          ? 'text-primary font-medium'
                          : 'text-text-primary'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }
        return (
          <AppInput
            type="text"
            value={String(condition.value || '')}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="Enter value..."
            className="w-32"
          />
        );
    }
  };

  return (
    <div className="relative">
      {/* Connector */}
      {showConnector && (
        <div className="absolute -top-1 left-6 z-10">
          <AppBadge
            variant={connectorType === 'and' ? 'primary' : 'accent'}
            size="sm"
          >
            {connectorType.toUpperCase()}
          </AppBadge>
        </div>
      )}

      {/* Condition Row */}
      <div
        className={`flex flex-wrap items-center gap-2 p-3 rounded-lg bg-surface-hover/30 ${
          showConnector ? 'mt-4' : ''
        }`}
      >
        {/* Field Selector */}
        <div className="relative">
          <button
            onClick={() => setFieldMenuOpen(!fieldMenuOpen)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-hover hover:bg-surface-hover/80 text-sm font-medium transition-colors"
          >
            <span>{fieldConfig?.label || condition.field}</span>
            <ChevronDown size={14} />
          </button>
          {fieldMenuOpen && (
            <div className="absolute z-10 top-full left-0 mt-1 py-1 bg-surface rounded-lg shadow-lg border border-border min-w-[150px]">
              {FILTER_FIELDS.map((field) => (
                <button
                  key={field.value}
                  onClick={() => {
                    onChange({ field: field.value });
                    setFieldMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-sm text-left hover:bg-surface-hover transition-colors ${
                    condition.field === field.value
                      ? 'text-primary font-medium'
                      : 'text-text-primary'
                  }`}
                >
                  {field.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Operator Selector */}
        <div className="relative">
          <button
            onClick={() => setOperatorMenuOpen(!operatorMenuOpen)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-hover hover:bg-surface-hover/80 text-sm transition-colors"
          >
            <span>{currentOperator?.label || condition.operator}</span>
            <ChevronDown size={14} />
          </button>
          {operatorMenuOpen && (
            <div className="absolute z-10 top-full left-0 mt-1 py-1 bg-surface rounded-lg shadow-lg border border-border min-w-[140px]">
              {operators.map((op) => (
                <button
                  key={op.value}
                  onClick={() => {
                    onChange({ operator: op.value });
                    setOperatorMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-sm text-left hover:bg-surface-hover transition-colors ${
                    condition.operator === op.value
                      ? 'text-primary font-medium'
                      : 'text-text-primary'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Value Input */}
        {renderValueInput()}

        {/* Remove Button */}
        <button
          onClick={onRemove}
          className="p-2 rounded-lg hover:bg-error/10 text-text-tertiary hover:text-error transition-colors ml-auto"
          aria-label="Remove condition"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
};

export default SmartListFilterBuilder;
