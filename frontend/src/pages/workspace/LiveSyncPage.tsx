import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  RefreshCw,
  Folder,
  Cloud,
  Pause,
  Play,
  Trash2,
  Settings,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '../../components/landing/animations/presets';
import { useAuth } from '../../contexts/AuthContext';
import { AppButton } from '../../components/ui/AppButton';
import { DeleteConfirmationDialog } from '../../components/ui/DeleteConfirmationDialog';
import { useToast } from '../../components/ui/Toast';
import {
  listSyncMappings,
  listActiveSessions,
  pauseSyncMapping,
  resumeSyncMapping,
  deleteSyncMapping,
  formatBytes,
  formatSpeed,
  calculateProgress,
  type SyncMappingResponse,
  type SyncSessionResponse,
} from '../../services/liveSyncService';

/* =============================================================================
   Types
   ============================================================================= */

type ViewTab = 'mappings' | 'sessions';

/* =============================================================================
   SyncStatusBadge Component
   ============================================================================= */

interface SyncStatusBadgeProps {
  status: string;
}

const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({ status }) => {
  const statusConfig: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    active: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-700 dark:text-green-400',
      icon: <CheckCircle size={12} />,
    },
    paused: {
      bg: 'bg-yellow-100 dark:bg-yellow-900/30',
      text: 'text-yellow-700 dark:text-yellow-400',
      icon: <Pause size={12} />,
    },
    error: {
      bg: 'bg-red-100 dark:bg-red-900/30',
      text: 'text-red-700 dark:text-red-400',
      icon: <AlertCircle size={12} />,
    },
    disabled: {
      bg: 'bg-gray-100 dark:bg-gray-800',
      text: 'text-gray-500 dark:text-gray-400',
      icon: <Clock size={12} />,
    },
    syncing: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-700 dark:text-blue-400',
      icon: <RefreshCw size={12} className="animate-spin" />,
    },
    watching: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-700 dark:text-green-400',
      icon: <Zap size={12} />,
    },
  };

  const config = statusConfig[status] || statusConfig.disabled;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
    >
      {config.icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

/* =============================================================================
   SyncMappingCard Component
   ============================================================================= */

interface SyncMappingCardProps {
  mapping: SyncMappingResponse;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  isLoading?: boolean;
}

const SyncMappingCard: React.FC<SyncMappingCardProps> = ({
  mapping,
  onPause,
  onResume,
  onDelete,
  isLoading,
}) => {
  return (
    <motion.div
      variants={staggerItem}
      className="bg-surface rounded-lg border border-border p-4 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Folder className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-medium text-text-primary">
              {mapping.display_name || mapping.folder_path.split(/[/\\]/).pop()}
            </h3>
            <p className="text-sm text-text-secondary truncate max-w-xs">
              {mapping.folder_path}
            </p>
          </div>
        </div>
        <SyncStatusBadge status={mapping.status} />
      </div>

      <div className="flex items-center gap-2 text-sm text-text-secondary mb-3">
        <ChevronRight size={14} />
        <Cloud size={14} className="text-primary" />
        <span className="truncate">{mapping.gallery_name || 'Gallery'}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm mb-4">
        <div>
          <span className="text-text-tertiary">Files synced</span>
          <p className="font-medium text-text-primary">
            {mapping.total_files_synced.toLocaleString()}
          </p>
        </div>
        <div>
          <span className="text-text-tertiary">Data synced</span>
          <p className="font-medium text-text-primary">
            {formatBytes(mapping.total_bytes_synced)}
          </p>
        </div>
      </div>

      {mapping.last_error && (
        <div className="mb-4 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-600 dark:text-red-400">
          {mapping.last_error}
        </div>
      )}

      <div className="flex items-center gap-2 pt-3 border-t border-border">
        {mapping.status === 'active' ? (
          <AppButton
            size="sm"
            variant="outline"
            onClick={onPause}
            disabled={isLoading}
          >
            <Pause size={14} className="mr-1" />
            Pause
          </AppButton>
        ) : mapping.status === 'paused' ? (
          <AppButton
            size="sm"
            variant="outline"
            onClick={onResume}
            disabled={isLoading}
          >
            <Play size={14} className="mr-1" />
            Resume
          </AppButton>
        ) : null}
        <AppButton
          size="sm"
          variant="outline"
          className="text-red-600 hover:bg-red-50"
          onClick={onDelete}
          disabled={isLoading}
        >
          <Trash2 size={14} className="mr-1" />
          Delete
        </AppButton>
      </div>
    </motion.div>
  );
};

/* =============================================================================
   ActiveSessionCard Component
   ============================================================================= */

interface ActiveSessionCardProps {
  session: SyncSessionResponse;
}

const ActiveSessionCard: React.FC<ActiveSessionCardProps> = ({ session }) => {
  const progress = calculateProgress(session);

  return (
    <motion.div
      variants={staggerItem}
      className="bg-surface rounded-lg border border-border p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <SyncStatusBadge status={session.status} />
        <span className="text-sm text-text-secondary">
          {new Date(session.started_at).toLocaleTimeString()}
        </span>
      </div>

      <div className="space-y-3">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-text-secondary">Progress</span>
            <span className="font-medium text-text-primary">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <span className="text-text-tertiary block">Files</span>
            <span className="font-medium text-text-primary">
              {session.files_completed}/{session.files_detected}
            </span>
          </div>
          <div>
            <span className="text-text-tertiary block">Speed</span>
            <span className="font-medium text-text-primary">
              {session.upload_speed_bps ? formatSpeed(session.upload_speed_bps) : '-'}
            </span>
          </div>
          <div>
            <span className="text-text-tertiary block">Uploaded</span>
            <span className="font-medium text-text-primary">
              {formatBytes(session.bytes_uploaded)}
            </span>
          </div>
        </div>

        {session.files_failed > 0 && (
          <div className="text-sm text-red-600 dark:text-red-400">
            {session.files_failed} files failed
          </div>
        )}
      </div>
    </motion.div>
  );
};

/* =============================================================================
   EmptyState Component
   ============================================================================= */

interface EmptyStateProps {
  type: 'mappings' | 'sessions';
  onCreateMapping?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ type, onCreateMapping }) => {
  if (type === 'mappings') {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
          <Folder className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">
          No sync mappings yet
        </h3>
        <p className="text-text-secondary mb-6 max-w-md mx-auto">
          Create a sync mapping to automatically upload photos from a folder on your computer
          to a gallery in the cloud.
        </p>
        <AppButton onClick={onCreateMapping}>
          <Plus size={16} className="mr-2" />
          Create Sync Mapping
        </AppButton>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-medium text-text-primary mb-2">
        No active sync sessions
      </h3>
      <p className="text-text-secondary max-w-md mx-auto">
        When you start syncing from your desktop app, active sessions will appear here.
      </p>
    </div>
  );
};

/* =============================================================================
   LiveSyncPage Component
   ============================================================================= */

const LiveSyncPage: React.FC = () => {
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const { t } = useTranslation(['common']);
  const [activeTab, setActiveTab] = useState<ViewTab>('mappings');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [mappings, setMappings] = useState<SyncMappingResponse[]>([]);
  const [sessions, setSessions] = useState<SyncSessionResponse[]>([]);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mappingToDelete, setMappingToDelete] = useState<SyncMappingResponse | null>(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!workspace?.workspace_id) return;

    setIsLoading(true);
    try {
      const [mappingsRes, sessionsRes] = await Promise.all([
        listSyncMappings(),
        listActiveSessions(),
      ]);

      setMappings(mappingsRes.data);
      setSessions(sessionsRes);
    } catch (error) {
      console.error('Failed to fetch sync data:', error);
      addToast({
        variant: 'error',
        title: 'Error',
        message: 'Failed to load sync data',
      });
    } finally {
      setIsLoading(false);
    }
  }, [workspace?.workspace_id, addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh sessions periodically when there are active sessions
  useEffect(() => {
    if (sessions.length === 0) return;

    const interval = setInterval(async () => {
      try {
        const sessionsRes = await listActiveSessions();
        setSessions(sessionsRes);
      } catch (error) {
        console.error('Failed to refresh sessions:', error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sessions.length]);

  // Handle pause mapping
  const handlePauseMapping = useCallback(async (mapping: SyncMappingResponse) => {
    setActionLoading(mapping.mapping_id);
    try {
      const updated = await pauseSyncMapping(mapping.mapping_id);
      setMappings((prev) =>
        prev.map((m) => (m.mapping_id === mapping.mapping_id ? updated : m))
      );
      addToast({
        variant: 'success',
        title: 'Sync paused',
        message: `Paused sync for ${mapping.display_name || mapping.folder_path}`,
      });
    } catch (error) {
      addToast({
        variant: 'error',
        title: 'Error',
        message: 'Failed to pause sync',
      });
    } finally {
      setActionLoading(null);
    }
  }, [addToast]);

  // Handle resume mapping
  const handleResumeMapping = useCallback(async (mapping: SyncMappingResponse) => {
    setActionLoading(mapping.mapping_id);
    try {
      const updated = await resumeSyncMapping(mapping.mapping_id);
      setMappings((prev) =>
        prev.map((m) => (m.mapping_id === mapping.mapping_id ? updated : m))
      );
      addToast({
        variant: 'success',
        title: 'Sync resumed',
        message: `Resumed sync for ${mapping.display_name || mapping.folder_path}`,
      });
    } catch (error) {
      addToast({
        variant: 'error',
        title: 'Error',
        message: 'Failed to resume sync',
      });
    } finally {
      setActionLoading(null);
    }
  }, [addToast]);

  // Handle delete mapping
  const handleDeleteMapping = useCallback(async () => {
    if (!mappingToDelete) return;

    setActionLoading(mappingToDelete.mapping_id);
    try {
      await deleteSyncMapping(mappingToDelete.mapping_id);
      setMappings((prev) =>
        prev.filter((m) => m.mapping_id !== mappingToDelete.mapping_id)
      );
      addToast({
        variant: 'success',
        title: 'Sync mapping deleted',
        message: `Deleted sync for ${mappingToDelete.display_name || mappingToDelete.folder_path}`,
      });
    } catch (error) {
      addToast({
        variant: 'error',
        title: 'Error',
        message: 'Failed to delete sync mapping',
      });
    } finally {
      setActionLoading(null);
      setDeleteDialogOpen(false);
      setMappingToDelete(null);
    }
  }, [mappingToDelete, addToast]);

  // Filter mappings by search
  const filteredMappings = mappings.filter((m) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      m.folder_path.toLowerCase().includes(query) ||
      m.display_name?.toLowerCase().includes(query) ||
      m.gallery_name?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">LiveSync</h1>
            <p className="text-text-secondary mt-1">
              Automatically sync photos from your folders to cloud galleries
            </p>
          </div>
          <AppButton onClick={() => {/* TODO: Open create mapping modal */}}>
            <Plus size={16} className="mr-2" />
            New Sync Mapping
          </AppButton>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 mb-6 border-b border-border">
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'mappings'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => setActiveTab('mappings')}
          >
            Sync Mappings ({mappings.length})
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'sessions'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => setActiveTab('sessions')}
          >
            Active Sessions ({sessions.length})
          </button>
        </div>

        {/* Search and filters */}
        {activeTab === 'mappings' && mappings.length > 0 && (
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
              />
              <input
                type="text"
                placeholder="Search mappings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-surface text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <AppButton variant="outline" onClick={fetchData}>
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </AppButton>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : activeTab === 'mappings' ? (
          filteredMappings.length === 0 ? (
            <EmptyState type="mappings" />
          ) : (
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {filteredMappings.map((mapping) => (
                <SyncMappingCard
                  key={mapping.mapping_id}
                  mapping={mapping}
                  onPause={() => handlePauseMapping(mapping)}
                  onResume={() => handleResumeMapping(mapping)}
                  onDelete={() => {
                    setMappingToDelete(mapping);
                    setDeleteDialogOpen(true);
                  }}
                  isLoading={actionLoading === mapping.mapping_id}
                />
              ))}
            </motion.div>
          )
        ) : sessions.length === 0 ? (
          <EmptyState type="sessions" />
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {sessions.map((session) => (
              <ActiveSessionCard key={session.session_id} session={session} />
            ))}
          </motion.div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setMappingToDelete(null);
        }}
        onConfirm={handleDeleteMapping}
        deleteType="permanent"
        entityType="gallery"
        entityName={mappingToDelete?.display_name || mappingToDelete?.folder_path || 'Sync Mapping'}
        isLoading={actionLoading === mappingToDelete?.mapping_id}
      />
    </div>
  );
};

export default LiveSyncPage;
