/**
 * ExportDialog: Dialog for exporting invitations
 *
 * Allows users to export invitations as PDF or high-resolution images.
 * Shows export progress and provides download links.
 *
 * Feature: 016-save-the-date Phase 11
 */

import React, { useState, useEffect } from 'react';
import {
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Check,
  X,
  RefreshCw,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { RadioGroup, Radio } from '@/components/ui/FormControls';
import { AppCard } from '@/components/ui/AppCard';
import { useToast } from '@/hooks/useToast';
import { apiClient } from '@/services/api';

type ExportFormat = 'pdf' | 'png' | 'jpeg';

interface ExportJob {
  export_id: string;
  format: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  file_url?: string;
  file_size_bytes?: number;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  invitationId: string;
  invitationTitle: string;
}

const FORMAT_OPTIONS = [
  {
    value: 'pdf',
    label: 'PDF Document',
    description: 'Print-ready, multi-page document',
    icon: <FileText className="w-5 h-5" />,
  },
  {
    value: 'png',
    label: 'PNG Image',
    description: 'High-quality, lossless image',
    icon: <ImageIcon className="w-5 h-5" />,
  },
  {
    value: 'jpeg',
    label: 'JPEG Image',
    description: 'Compressed, smaller file size',
    icon: <ImageIcon className="w-5 h-5" />,
  },
];

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  invitationId,
  invitationTitle,
}) => {
  const { showToast } = useToast();

  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [isExporting, setIsExporting] = useState(false);
  const [currentJob, setCurrentJob] = useState<ExportJob | null>(null);
  const [recentExports, setRecentExports] = useState<ExportJob[]>([]);

  // Fetch recent exports when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchRecentExports();
    }
  }, [isOpen, workspaceId, invitationId]);

  // Poll for job status while processing
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (currentJob && (currentJob.status === 'pending' || currentJob.status === 'processing')) {
      interval = setInterval(async () => {
        try {
          const response = await apiClient.get<ExportJob>(
            `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/exports/${currentJob.export_id}`
          );
          if (response.data) {
            setCurrentJob(response.data);
            
            if (response.data.status === 'completed') {
              showToast('Export completed!', 'success');
              fetchRecentExports();
            } else if (response.data.status === 'failed') {
              showToast('Export failed: ' + (response.data.error_message || 'Unknown error'), 'error');
            }
          }
        } catch (error) {
          console.error('Failed to poll export status:', error);
        }
      }, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentJob]);

  const fetchRecentExports = async () => {
    try {
      const response = await apiClient.get<ExportJob[]>(
        `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/exports`
      );
      if (response.data) {
        setRecentExports(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch exports:', error);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const response = await apiClient.post<ExportJob>(
        `/api/v1/workspaces/${workspaceId}/digital-invitations/${invitationId}/exports`,
        {
          format: selectedFormat,
        }
      );

      if (response.data) {
        setCurrentJob(response.data);
        showToast('Export started...', 'info');
      }
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to start export';
      showToast(message, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = (job: ExportJob) => {
    if (job.file_url) {
      window.open(job.file_url, '_blank');
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleString();
  };

  const getStatusIcon = (status: ExportJob['status']) => {
    switch (status) {
      case 'pending':
      case 'processing':
        return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case 'completed':
        return <Check className="w-4 h-4 text-success" />;
      case 'failed':
        return <X className="w-4 h-4 text-error" />;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalHeader>
        <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
          <Download className="w-5 h-5 text-primary" />
          Export Invitation
        </h2>
      </ModalHeader>

      <ModalBody className="space-y-6">
        <p className="text-sm text-text-secondary">
          Export "{invitationTitle}" as a downloadable file.
        </p>

        {/* Format Selection */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-text-primary">
            Export Format
          </label>
          <div className="space-y-2">
            {FORMAT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setSelectedFormat(option.value as ExportFormat)}
                className={`w-full p-4 rounded-lg border-2 text-left transition-all flex items-center gap-4 ${
                  selectedFormat === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className={`${selectedFormat === option.value ? 'text-primary' : 'text-text-tertiary'}`}>
                  {option.icon}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-text-primary">{option.label}</div>
                  <div className="text-xs text-text-tertiary">{option.description}</div>
                </div>
                <Radio
                  value={option.value}
                  checked={selectedFormat === option.value}
                  onChange={() => setSelectedFormat(option.value as ExportFormat)}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Current Export Progress */}
        {currentJob && (currentJob.status === 'pending' || currentJob.status === 'processing') && (
          <AppCard className="p-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <div className="flex-1">
                <div className="font-medium text-text-primary">
                  {currentJob.status === 'pending' ? 'Preparing export...' : 'Generating export...'}
                </div>
                <div className="text-xs text-text-tertiary">
                  {currentJob.format.toUpperCase()} • Started {formatDate(currentJob.created_at)}
                </div>
              </div>
            </div>
          </AppCard>
        )}

        {/* Completed Export */}
        {currentJob?.status === 'completed' && (
          <AppCard className="p-4 bg-success/5 border-success/20">
            <div className="flex items-center gap-3">
              <Check className="w-5 h-5 text-success" />
              <div className="flex-1">
                <div className="font-medium text-text-primary">Export Ready!</div>
                <div className="text-xs text-text-secondary">
                  {currentJob.format.toUpperCase()} • {formatFileSize(currentJob.file_size_bytes)}
                </div>
              </div>
              <AppButton
                variant="primary"
                size="sm"
                onClick={() => handleDownload(currentJob)}
                leftIcon={<Download className="w-4 h-4" />}
              >
                Download
              </AppButton>
            </div>
          </AppCard>
        )}

        {/* Failed Export */}
        {currentJob?.status === 'failed' && (
          <AppCard className="p-4 bg-error/5 border-error/20">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-error mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-error">Export Failed</div>
                <div className="text-xs text-error/80">
                  {currentJob.error_message || 'An unknown error occurred'}
                </div>
              </div>
              <AppButton
                variant="outline"
                size="sm"
                onClick={() => setCurrentJob(null)}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Retry
              </AppButton>
            </div>
          </AppCard>
        )}

        {/* Recent Exports */}
        {recentExports.length > 0 && !currentJob && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-text-primary flex items-center gap-2">
              <Clock className="w-4 h-4 text-text-tertiary" />
              Recent Exports
            </label>
            <div className="space-y-2">
              {recentExports.slice(0, 3).map((job) => (
                <div
                  key={job.export_id}
                  className="flex items-center gap-3 p-3 bg-surface-alt rounded-lg"
                >
                  {getStatusIcon(job.status)}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary">
                      {job.format.toUpperCase()}
                    </div>
                    <div className="text-xs text-text-tertiary truncate">
                      {formatDate(job.created_at)}
                      {job.file_size_bytes && ` • ${formatFileSize(job.file_size_bytes)}`}
                    </div>
                  </div>
                  {job.status === 'completed' && job.file_url && (
                    <AppButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(job)}
                    >
                      <Download className="w-4 h-4" />
                    </AppButton>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <div className="flex justify-end gap-3">
          <AppButton variant="ghost" onClick={onClose}>
            Close
          </AppButton>
          <AppButton
            variant="primary"
            onClick={handleExport}
            isLoading={isExporting}
            disabled={isExporting || (currentJob?.status === 'pending') || (currentJob?.status === 'processing')}
            leftIcon={!isExporting && <Download className="w-4 h-4" />}
          >
            Export {selectedFormat.toUpperCase()}
          </AppButton>
        </div>
      </ModalFooter>
    </Modal>
  );
};

export default ExportDialog;
