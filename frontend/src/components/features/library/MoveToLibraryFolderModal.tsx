import React, { useState } from 'react';
import { X, Folder, FolderInput, Home, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import type { LibraryFolder } from '../../../services/libraryService';

interface MoveToLibraryFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMove: (folderId: string | null) => Promise<void>;
  folders: LibraryFolder[];
  selectedCount: number;
  currentFolderId?: string;
}

const MoveToLibraryFolderModal: React.FC<MoveToLibraryFolderModalProps> = ({
  isOpen,
  onClose,
  onMove,
  folders,
  selectedCount,
  currentFolderId,
}) => {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setIsMoving(true);
    setError(null);

    try {
      await onMove(selectedFolder);
      setSelectedFolder(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move assets');
    } finally {
      setIsMoving(false);
    }
  };

  const handleClose = () => {
    if (!isMoving) {
      setSelectedFolder(null);
      setError(null);
      onClose();
    }
  };

  // Filter out current folder from options
  const availableFolders = folders.filter((f) => f.folder_id !== currentFolderId);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="card-glass rounded-2xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-to-br from-primary/20 to-accent/20 rounded-xl">
                  <FolderInput className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Move to Folder</h2>
                  <p className="text-sm text-text-tertiary">
                    {selectedCount} {selectedCount === 1 ? 'asset' : 'assets'} selected
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={isMoving}
                className="p-2 hover:bg-surface-hover rounded-xl transition-colors text-text-tertiary hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5">
              {/* Folder List */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {/* Root / Library option */}
                <button
                  onClick={() => setSelectedFolder(null)}
                  className={`
                    w-full flex items-center gap-3 p-3 rounded-xl
                    transition-all duration-200 text-left
                    ${selectedFolder === null
                      ? 'bg-gradient-to-r from-primary/10 to-accent/10 border-primary/30'
                      : 'hover:bg-surface-hover border-transparent'
                    }
                    border
                  `}
                >
                  <div className="p-2 bg-surface-hover rounded-lg">
                    <Home className="w-4 h-4 text-text-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-text-primary">Library Root</span>
                    <p className="text-xs text-text-tertiary">Move to top level</p>
                  </div>
                  {selectedFolder === null && (
                    <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-accent" />
                  )}
                </button>

                {/* Folders */}
                {availableFolders.map((folder) => (
                  <button
                    key={folder.folder_id}
                    onClick={() => setSelectedFolder(folder.folder_id)}
                    className={`
                      w-full flex items-center gap-3 p-3 rounded-xl
                      transition-all duration-200 text-left
                      ${selectedFolder === folder.folder_id
                        ? 'bg-gradient-to-r from-primary/10 to-accent/10 border-primary/30'
                        : 'hover:bg-surface-hover border-transparent'
                      }
                      border
                    `}
                  >
                    <div
                      className="p-2 rounded-lg"
                      style={{ backgroundColor: `${folder.color || '#3B82F6'}20` }}
                    >
                      <Folder
                        className="w-4 h-4"
                        style={{ color: folder.color || '#3B82F6' }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-text-primary truncate block">
                        {folder.name}
                      </span>
                      <p className="text-xs text-text-tertiary">
                        {folder.asset_count} assets
                      </p>
                    </div>
                    {selectedFolder === folder.folder_id && (
                      <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-accent" />
                    )}
                  </button>
                ))}

                {availableFolders.length === 0 && currentFolderId && (
                  <p className="text-sm text-text-tertiary text-center py-4">
                    No other folders available
                  </p>
                )}
              </div>

              {/* Error */}
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-error bg-error/10 px-3 py-2 rounded-lg mt-4"
                >
                  {error}
                </motion.p>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 p-5 pt-0">
              <AppButton
                variant="secondary"
                onClick={handleClose}
                disabled={isMoving}
              >
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                onClick={handleSubmit}
                isLoading={isMoving}
                loadingText="Moving..."
                leftIcon={<ChevronRight size={16} />}
                shine
              >
                Move Assets
              </AppButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MoveToLibraryFolderModal;
