/**
 * RSVPExport: Export RSVP data in various formats (CSV, PDF)
 *
 * Features:
 * - Export format selection (CSV, PDF)
 * - Include/exclude fields toggle
 * - Download progress indicator
 * - Print-friendly option
 *
 * Feature: 016-save-the-date
 * Task: T055
 */

import React, { useState, useCallback } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Check,
  Loader2,
  Settings2,
  ChevronDown,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { invitationService } from '@/services/invitationService';
import { useToast } from '@/hooks/useToast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RSVPExportProps {
  invitationId: string;
  invitationTitle?: string;
  className?: string;
  variant?: 'button' | 'dropdown' | 'card';
}

type ExportFormat = 'csv' | 'pdf';

interface ExportField {
  key: string;
  label: string;
  included: boolean;
}

const DEFAULT_FIELDS: ExportField[] = [
  { key: 'guest_name', label: 'Guest Name', included: true },
  { key: 'guest_email', label: 'Email', included: true },
  { key: 'guest_phone', label: 'Phone', included: true },
  { key: 'attending', label: 'Attendance Status', included: true },
  { key: 'party_size', label: 'Party Size', included: true },
  { key: 'party_names', label: 'Party Names', included: true },
  { key: 'dietary_preferences', label: 'Dietary Preferences', included: true },
  { key: 'message', label: 'Message', included: true },
  { key: 'created_at', label: 'RSVP Date', included: true },
];

// ---------------------------------------------------------------------------
// Export Button (Simple Dropdown)
// ---------------------------------------------------------------------------

const ExportDropdown: React.FC<{
  onExport: (format: ExportFormat) => void;
  isExporting: boolean;
  exportingFormat: ExportFormat | null;
}> = ({ onExport, isExporting, exportingFormat }) => {
  const [isOpen, setIsOpen] = useState(false);

  // T122: Keyboard navigation - close on Escape
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div className="relative">
      <AppButton
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="export-dropdown-menu"
      >
        {isExporting ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="w-4 h-4 mr-2" aria-hidden="true" />
        )}
        Export
        <ChevronDown className="w-4 h-4 ml-1" aria-hidden="true" />
      </AppButton>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div
            id="export-dropdown-menu"
            role="menu"
            aria-label="Export options"
            className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-lg z-20 min-w-[160px] overflow-hidden"
          >
            <button
              onClick={() => {
                onExport('csv');
                setIsOpen(false);
              }}
              disabled={isExporting}
              role="menuitem"
              className="w-full px-4 py-2.5 text-sm text-left hover:bg-surface-hover transition-colors flex items-center gap-2 disabled:opacity-50 focus-visible:bg-surface-hover focus-visible:outline-none"
            >
              <FileSpreadsheet className="w-4 h-4 text-success" aria-hidden="true" />
              Export as CSV
              {exportingFormat === 'csv' && (
                <Loader2 className="w-3 h-3 ml-auto animate-spin" aria-hidden="true" />
              )}
            </button>
            <button
              onClick={() => {
                onExport('pdf');
                setIsOpen(false);
              }}
              disabled={isExporting}
              role="menuitem"
              className="w-full px-4 py-2.5 text-sm text-left hover:bg-surface-hover transition-colors flex items-center gap-2 disabled:opacity-50 focus-visible:bg-surface-hover focus-visible:outline-none"
            >
              <FileText className="w-4 h-4 text-error" aria-hidden="true" />
              Export as PDF
              {exportingFormat === 'pdf' && (
                <Loader2 className="w-3 h-3 ml-auto animate-spin" aria-hidden="true" />
              )}
            </button>
            <div className="border-t border-border" role="separator" />
            <button
              onClick={() => {
                window.print();
                setIsOpen(false);
              }}
              role="menuitem"
              className="w-full px-4 py-2.5 text-sm text-left hover:bg-surface-hover transition-colors flex items-center gap-2 focus-visible:bg-surface-hover focus-visible:outline-none"
            >
              <Printer className="w-4 h-4 text-text-secondary" aria-hidden="true" />
              Print
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Export Card (Full Featured)
// ---------------------------------------------------------------------------

const ExportCard: React.FC<{
  invitationId: string;
  invitationTitle?: string;
  onExport: (format: ExportFormat, fields?: string[]) => void;
  isExporting: boolean;
  exportingFormat: ExportFormat | null;
}> = ({ invitationId, invitationTitle, onExport, isExporting, exportingFormat }) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('csv');
  const [showFieldOptions, setShowFieldOptions] = useState(false);
  const [fields, setFields] = useState<ExportField[]>(DEFAULT_FIELDS);

  const toggleField = (key: string) => {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, included: !f.included } : f))
    );
  };

  const selectAll = () => {
    setFields((prev) => prev.map((f) => ({ ...f, included: true })));
  };

  const selectNone = () => {
    setFields((prev) => prev.map((f) => ({ ...f, included: false })));
  };

  const handleExport = () => {
    const includedFields = fields.filter((f) => f.included).map((f) => f.key);
    onExport(selectedFormat, includedFields);
  };

  return (
    <AppCard className="p-6">
      <h3 className="text-lg font-semibold text-text-primary mb-4">
        Export RSVP Data
      </h3>

      {/* Format Selection */}
      <fieldset className="mb-6">
        <legend className="text-sm font-medium text-text-secondary mb-2 block">
          Export Format
        </legend>
        <div className="flex gap-3" role="radiogroup" aria-label="Export format selection">
          <button
            onClick={() => setSelectedFormat('csv')}
            role="radio"
            aria-checked={selectedFormat === 'csv'}
            className={`
              flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-all
              focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none
              ${selectedFormat === 'csv'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border hover:border-primary/50 text-text-secondary'
              }
            `}
          >
            <FileSpreadsheet className="w-5 h-5" aria-hidden="true" />
            <span className="font-medium">CSV</span>
            {selectedFormat === 'csv' && <Check className="w-4 h-4 ml-auto" aria-hidden="true" />}
          </button>
          <button
            onClick={() => setSelectedFormat('pdf')}
            role="radio"
            aria-checked={selectedFormat === 'pdf'}
            className={`
              flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-all
              focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none
              ${selectedFormat === 'pdf'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border hover:border-primary/50 text-text-secondary'
              }
            `}
          >
            <FileText className="w-5 h-5" aria-hidden="true" />
            <span className="font-medium">PDF</span>
            {selectedFormat === 'pdf' && <Check className="w-4 h-4 ml-auto" aria-hidden="true" />}
          </button>
        </div>
      </fieldset>

      {/* Field Selection Toggle */}
      <button
        onClick={() => setShowFieldOptions(!showFieldOptions)}
        className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 transition-colors mb-4 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        aria-expanded={showFieldOptions}
        aria-controls="field-options-panel"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-text-secondary" aria-hidden="true" />
          <span className="text-sm text-text-primary">Customize Fields</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-text-tertiary transition-transform ${
            showFieldOptions ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Field Options */}
      {showFieldOptions && (
        <div id="field-options-panel" className="mb-6 p-4 bg-surface-hover rounded-lg">
          <div className="flex justify-between items-center mb-3">
            <span id="field-selection-label" className="text-sm font-medium text-text-secondary">
              Select Fields to Include
            </span>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="text-xs text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded"
              >
                Select All
              </button>
              <span className="text-text-tertiary" aria-hidden="true">|</span>
              <button
                onClick={selectNone}
                className="text-xs text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="field-selection-label">
            {fields.map((field) => (
              <label
                key={field.key}
                className="flex items-center gap-2 p-2 rounded hover:bg-surface cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={field.included}
                  onChange={() => toggleField(field.key)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                  aria-label={`Include ${field.label} field`}
                />
                <span className="text-sm text-text-primary">{field.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Export Button */}
      <AppButton
        variant="primary"
        className="w-full"
        onClick={handleExport}
        disabled={isExporting || fields.filter((f) => f.included).length === 0}
      >
        {isExporting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Exporting...
          </>
        ) : (
          <>
            <Download className="w-4 h-4 mr-2" />
            Export {selectedFormat.toUpperCase()}
          </>
        )}
      </AppButton>

      {fields.filter((f) => f.included).length === 0 && (
        <p className="text-xs text-error mt-2 text-center">
          Please select at least one field to export
        </p>
      )}
    </AppCard>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const RSVPExport: React.FC<RSVPExportProps> = ({
  invitationId,
  invitationTitle,
  className = '',
  variant = 'dropdown',
}) => {
  const { showToast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);

  const handleExport = useCallback(
    async (format: ExportFormat, fields?: string[]) => {
      setIsExporting(true);
      setExportingFormat(format);

      try {
        let blob: Blob;
        let filename: string;

        if (format === 'csv') {
          blob = await invitationService.exportRSVPsToCSV(invitationId);
          filename = `rsvps-${invitationTitle || invitationId}.csv`;
        } else {
          // PDF export - call the PDF endpoint
          const response = await fetch(
            `/api/v1/invitations/${invitationId}/rsvps/export?format=pdf`,
            {
              method: 'GET',
              headers: {
                Accept: 'application/pdf',
              },
            }
          );

          if (!response.ok) {
            if (response.status === 501) {
              showToast('PDF export coming soon', 'info');
              return;
            }
            throw new Error('Failed to export PDF');
          }

          blob = await response.blob();
          filename = `rsvps-${invitationTitle || invitationId}.pdf`;
        }

        // Trigger download
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast(`${format.toUpperCase()} exported successfully`, 'success');
      } catch (error) {
        console.error('Export failed:', error);
        showToast(`Failed to export ${format.toUpperCase()}`, 'error');
      } finally {
        setIsExporting(false);
        setExportingFormat(null);
      }
    },
    [invitationId, invitationTitle, showToast]
  );

  // Render based on variant
  if (variant === 'card') {
    return (
      <div className={className}>
        <ExportCard
          invitationId={invitationId}
          invitationTitle={invitationTitle}
          onExport={handleExport}
          isExporting={isExporting}
          exportingFormat={exportingFormat}
        />
      </div>
    );
  }

  if (variant === 'button') {
    return (
      <div className={`flex gap-2 ${className}`}>
        <AppButton
          variant="outline"
          size="sm"
          onClick={() => handleExport('csv')}
          disabled={isExporting}
        >
          {exportingFormat === 'csv' ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FileSpreadsheet className="w-4 h-4 mr-2" />
          )}
          CSV
        </AppButton>
        <AppButton
          variant="outline"
          size="sm"
          onClick={() => handleExport('pdf')}
          disabled={isExporting}
        >
          {exportingFormat === 'pdf' ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <FileText className="w-4 h-4 mr-2" />
          )}
          PDF
        </AppButton>
      </div>
    );
  }

  // Default: dropdown
  return (
    <div className={className}>
      <ExportDropdown
        onExport={handleExport}
        isExporting={isExporting}
        exportingFormat={exportingFormat}
      />
    </div>
  );
};

export default RSVPExport;
