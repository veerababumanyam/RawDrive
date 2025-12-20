/**
 * ClientImportDialog Component
 *
 * Dialog for importing clients from CSV.
 * Requirements: 14.1, 14.3, 14.4, 14.5 - Upload CSV, show validation errors, display summary
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  X,
  Upload,
  FileText,
  Loader2,
  Check,
  AlertCircle,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import { useToast } from '../../ui/Toast';
import { clientService } from '../../../services/clientService';
import type { ImportClientsResponse, ImportErrorDetail } from '../../../types/client';

/* =============================================================================
   ClientImportDialog Component
   ============================================================================= */

interface ClientImportDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback to close the dialog */
  onClose: () => void;
  /** Workspace ID */
  workspaceId: string;
  /** Callback when import is successful */
  onImported?: () => void;
}

type ImportStep = 'upload' | 'options' | 'importing' | 'result';

export const ClientImportDialog: React.FC<ClientImportDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  onImported,
}) => {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [detectDuplicates, setDetectDuplicates] = useState(true);
  const [result, setResult] = useState<ImportClientsResponse | null>(null);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  // Reset state when dialog closes
  const handleClose = useCallback(() => {
    setStep('upload');
    setFile(null);
    setUpdateExisting(false);
    setDetectDuplicates(true);
    setResult(null);
    onClose();
  }, [onClose]);

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        addToast({
          variant: 'error',
          message: 'Please select a CSV file',
        });
        return;
      }
      setFile(selectedFile);
      setStep('options');
    }
  }, [addToast]);

  // Handle drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        if (!droppedFile.name.endsWith('.csv')) {
          addToast({
            variant: 'error',
            message: 'Please drop a CSV file',
          });
          return;
        }
        setFile(droppedFile);
        setStep('options');
      }
    },
    [addToast]
  );

  // Download template
  const handleDownloadTemplate = useCallback(async () => {
    setIsDownloadingTemplate(true);
    try {
      await clientService.downloadImportTemplate(workspaceId);
      addToast({
        variant: 'success',
        message: 'Template downloaded successfully',
      });
    } catch (error) {
      addToast({
        variant: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to download template',
      });
    } finally {
      setIsDownloadingTemplate(false);
    }
  }, [workspaceId, addToast]);

  // Handle import
  const handleImport = useCallback(async () => {
    if (!file) return;

    setStep('importing');
    try {
      const importResult = await clientService.importClients(workspaceId, file, {
        update_existing: updateExisting,
        detect_duplicates: detectDuplicates,
      });
      setResult(importResult);
      setStep('result');
      if (importResult.imported > 0 || importResult.updated > 0) {
        onImported?.();
      }
    } catch (error) {
      addToast({
        variant: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to import clients',
      });
      setStep('options');
    }
  }, [workspaceId, file, updateExisting, detectDuplicates, addToast, onImported]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={handleClose}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

        {/* Dialog */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg max-h-[90vh] bg-surface rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-dialog-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Upload className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2
                  id="import-dialog-title"
                  className="text-lg font-semibold text-text-primary"
                >
                  Import Clients
                </h2>
                <p className="text-sm text-text-secondary">
                  {step === 'upload' && 'Upload a CSV file'}
                  {step === 'options' && 'Configure import options'}
                  {step === 'importing' && 'Processing...'}
                  {step === 'result' && 'Import complete'}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
              aria-label="Close dialog"
            >
              <X size={20} className="text-text-tertiary" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Upload Step */}
            {step === 'upload' && (
              <div className="space-y-4">
                {/* Drop Zone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Upload size={32} className="text-text-tertiary mx-auto mb-3" />
                  <p className="text-text-primary font-medium mb-1">
                    Drop your CSV file here
                  </p>
                  <p className="text-sm text-text-tertiary">
                    or click to browse
                  </p>
                </div>

                {/* Template Download */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-surface-hover/50">
                  <div className="flex items-center gap-2 text-sm text-text-secondary">
                    <FileText size={16} />
                    <span>Need a template?</span>
                  </div>
                  <AppButton
                    variant="ghost"
                    size="sm"
                    leftIcon={
                      isDownloadingTemplate ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )
                    }
                    onClick={handleDownloadTemplate}
                    disabled={isDownloadingTemplate}
                  >
                    Download Template
                  </AppButton>
                </div>

                {/* Instructions */}
                <div className="text-sm text-text-secondary space-y-2">
                  <p className="font-medium text-text-primary">File requirements:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>CSV format with headers in first row</li>
                    <li>Required columns: first_name, last_name</li>
                    <li>Optional: email, phone, organization, notes</li>
                    <li>Maximum 1,000 rows per import</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Options Step */}
            {step === 'options' && file && (
              <div className="space-y-4">
                {/* File Info */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-hover/50">
                  <FileText size={20} className="text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text-primary truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <AppButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFile(null);
                      setStep('upload');
                    }}
                  >
                    Change
                  </AppButton>
                </div>

                {/* Options */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-text-primary">
                    Import Options
                  </label>

                  <ToggleOption
                    label="Update existing clients"
                    description="If a client with the same email exists, update their info"
                    checked={updateExisting}
                    onChange={setUpdateExisting}
                  />

                  <ToggleOption
                    label="Detect duplicates"
                    description="Check for potential duplicates before importing"
                    checked={detectDuplicates}
                    onChange={setDetectDuplicates}
                  />
                </div>
              </div>
            )}

            {/* Importing Step */}
            {step === 'importing' && (
              <div className="text-center py-12">
                <Loader2
                  size={48}
                  className="animate-spin text-primary mx-auto mb-4"
                />
                <p className="text-text-primary font-medium mb-1">
                  Importing clients...
                </p>
                <p className="text-sm text-text-tertiary">
                  This may take a moment
                </p>
              </div>
            )}

            {/* Result Step */}
            {step === 'result' && result && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <ResultStat
                    icon={<CheckCircle2 size={18} />}
                    label="Imported"
                    count={result.imported}
                    color="success"
                  />
                  <ResultStat
                    icon={<Check size={18} />}
                    label="Updated"
                    count={result.updated}
                    color="primary"
                  />
                  <ResultStat
                    icon={<XCircle size={18} />}
                    label="Skipped"
                    count={result.skipped}
                    color="warning"
                  />
                </div>

                {/* Overall Status */}
                <div
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    result.errors_count === 0
                      ? 'bg-success/10 border border-success/20'
                      : 'bg-warning/10 border border-warning/20'
                  }`}
                >
                  {result.errors_count === 0 ? (
                    <CheckCircle2 size={20} className="text-success" />
                  ) : (
                    <AlertTriangle size={20} className="text-warning" />
                  )}
                  <div>
                    <p className="font-medium text-text-primary">
                      {result.errors_count === 0
                        ? 'Import completed successfully!'
                        : `Import completed with ${result.errors_count} errors`}
                    </p>
                    <p className="text-sm text-text-secondary">
                      Processed {result.total_rows} rows from your file
                    </p>
                  </div>
                </div>

                {/* Errors */}
                {result.errors.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
                      <AlertCircle size={14} />
                      Errors ({result.errors.length})
                    </h4>
                    <div className="max-h-[200px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
                      {result.errors.map((error, index) => (
                        <ErrorRow key={index} error={error} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border bg-surface flex-shrink-0">
            {step === 'upload' && (
              <AppButton variant="outline" onClick={handleClose}>
                Cancel
              </AppButton>
            )}

            {step === 'options' && (
              <>
                <AppButton
                  variant="outline"
                  onClick={() => {
                    setFile(null);
                    setStep('upload');
                  }}
                >
                  Back
                </AppButton>
                <AppButton
                  variant="primary"
                  onClick={handleImport}
                  leftIcon={<Upload size={16} />}
                >
                  Import
                </AppButton>
              </>
            )}

            {step === 'result' && (
              <AppButton variant="primary" onClick={handleClose}>
                Done
              </AppButton>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

/* =============================================================================
   ToggleOption Component
   ============================================================================= */

interface ToggleOptionProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleOption: React.FC<ToggleOptionProps> = ({
  label,
  description,
  checked,
  onChange,
}) => {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all ${
        checked
          ? 'bg-primary/10 border border-primary/30'
          : 'bg-surface-hover/50 border border-transparent hover:border-border'
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          checked ? 'border-primary bg-primary text-white' : 'border-text-tertiary'
        }`}
      >
        {checked && <Check size={12} />}
      </div>
      <div className="flex-1">
        <p
          className={`font-medium ${
            checked ? 'text-primary' : 'text-text-primary'
          }`}
        >
          {label}
        </p>
        <p className="text-xs text-text-tertiary">{description}</p>
      </div>
    </button>
  );
};

/* =============================================================================
   ResultStat Component
   ============================================================================= */

interface ResultStatProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: 'success' | 'primary' | 'warning';
}

const ResultStat: React.FC<ResultStatProps> = ({ icon, label, count, color }) => {
  const colorClasses = {
    success: 'bg-success/10 text-success',
    primary: 'bg-primary/10 text-primary',
    warning: 'bg-warning/10 text-warning',
  };

  return (
    <div className="p-3 rounded-lg bg-surface-hover/50 text-center">
      <div
        className={`inline-flex p-2 rounded-lg mb-2 ${colorClasses[color]}`}
      >
        {icon}
      </div>
      <p className="text-2xl font-bold text-text-primary">{count}</p>
      <p className="text-xs text-text-tertiary">{label}</p>
    </div>
  );
};

/* =============================================================================
   ErrorRow Component
   ============================================================================= */

interface ErrorRowProps {
  error: ImportErrorDetail;
}

const ErrorRow: React.FC<ErrorRowProps> = ({ error }) => {
  return (
    <div className="p-3 hover:bg-surface-hover/50">
      <div className="flex items-start gap-2">
        <AlertCircle size={14} className="text-error mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary">
            Row {error.row}: {error.error}
          </p>
          {error.field && (
            <p className="text-xs text-text-tertiary">
              Field: {error.field}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientImportDialog;
