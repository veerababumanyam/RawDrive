import React, { useState, useEffect } from 'react';
import { X, Folder, Palette } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import type { LibraryFolder } from '../../../services/libraryService';

interface EditFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, color?: string, description?: string) => Promise<void>;
  folder: LibraryFolder;
}

const FOLDER_COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#06B6D4', // cyan
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#6B7280', // gray
];

const EditFolderModal: React.FC<EditFolderModalProps> = ({
  isOpen,
  onClose,
  onSave,
  folder,
}) => {
  const [name, setName] = useState(folder.name);
  const [description, setDescription] = useState(folder.description || '');
  const [color, setColor] = useState<string | undefined>(folder.color || undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when folder changes
  useEffect(() => {
    setName(folder.name);
    setDescription(folder.description || '');
    setColor(folder.color || undefined);
    setError(null);
  }, [folder]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      await onSave(name.trim(), color, description.trim() || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update folder');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      setError(null);
      onClose();
    }
  };

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
                <div 
                  className="p-2.5 rounded-xl"
                  style={{ 
                    backgroundColor: color ? `${color}20` : 'rgba(var(--primary-rgb), 0.2)'
                  }}
                >
                  <Folder 
                    className="w-5 h-5" 
                    style={{ color: color || 'var(--primary)' }}
                  />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Edit Folder</h2>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={isSaving}
                className="p-2 hover:bg-surface-hover rounded-xl transition-colors text-text-tertiary hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <form onSubmit={handleSubmit} className="p-5 space-y-5">
              {/* Folder Name */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Folder Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter folder name..."
                  className="
                    w-full px-4 py-2.5
                    glass-light border border-white/20 dark:border-white/10
                    rounded-xl text-text-primary placeholder:text-text-tertiary
                    focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50
                    hover:border-white/30 dark:hover:border-white/20
                    transition-all duration-200
                  "
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description..."
                  rows={2}
                  className="
                    w-full px-4 py-2.5
                    glass-light border border-white/20 dark:border-white/10
                    rounded-xl text-text-primary placeholder:text-text-tertiary
                    focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50
                    hover:border-white/30 dark:hover:border-white/20
                    transition-all duration-200 resize-none
                  "
                />
              </div>

              {/* Color Selection */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-3">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    <span>Color (optional)</span>
                  </div>
                </label>
                <div className="flex flex-wrap gap-3">
                  {FOLDER_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(color === c ? undefined : c)}
                      className={`
                        w-9 h-9 rounded-full transition-all duration-200
                        hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface
                        ${color === c 
                          ? 'ring-2 ring-offset-2 ring-offset-surface ring-white scale-110 shadow-lg' 
                          : 'hover:shadow-md'
                        }
                      `}
                      style={{ 
                        backgroundColor: c,
                        boxShadow: color === c ? `0 0 20px ${c}50` : undefined
                      }}
                      aria-label={`Select color ${c}`}
                    />
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-error bg-error/10 px-3 py-2 rounded-lg"
                >
                  {error}
                </motion.p>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={handleClose}
                  disabled={isSaving}
                >
                  Cancel
                </AppButton>
                <AppButton
                  type="submit"
                  variant="primary"
                  disabled={!name.trim()}
                  isLoading={isSaving}
                  loadingText="Saving..."
                  shine
                >
                  Save Changes
                </AppButton>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default EditFolderModal;
