import React, { useState, useEffect } from 'react';
import { X, Folder, Palette, Lock, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import type { LibraryFolder } from '../../../services/libraryService';

interface EditFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, color?: string, description?: string, pin?: string | null) => Promise<void>;
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
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [enablePin, setEnablePin] = useState(folder.is_protected || false);
  const [removePin, setRemovePin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when folder changes
  useEffect(() => {
    setName(folder.name);
    setDescription(folder.description || '');
    setColor(folder.color || undefined);
    setPin('');
    setShowPin(false);
    setEnablePin(folder.is_protected || false);
    setRemovePin(false);
    setError(null);
  }, [folder]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Validate PIN if enabling
    if (enablePin && !folder.is_protected && pin.length > 0 && pin.length < 4) {
      setError('PIN must be at least 4 characters');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Determine PIN value to send
      let pinValue: string | null | undefined = undefined;
      if (removePin) {
        pinValue = null; // Remove PIN
      } else if (enablePin && pin.trim()) {
        pinValue = pin.trim(); // Set/update PIN
      }

      await onSave(name.trim(), color, description.trim() || undefined, pinValue);
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
            className="card-glass rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
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

              {/* PIN Protection */}
              <div className="border-t border-white/10 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-500" />
                    <span>PIN Protection</span>
                  </label>
                  {folder.is_protected && !removePin && (
                    <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full">
                      Protected
                    </span>
                  )}
                </div>

                {folder.is_protected ? (
                  // Folder already has PIN - show options to change or remove
                  <div className="space-y-3">
                    {!removePin ? (
                      <>
                        <p className="text-xs text-text-tertiary">
                          This folder is PIN protected. You can change or remove the PIN.
                        </p>
                        <div className="flex gap-2">
                          <AppButton
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEnablePin(true)}
                          >
                            Change PIN
                          </AppButton>
                          <AppButton
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-error border-error/30 hover:bg-error/10"
                            onClick={() => setRemovePin(true)}
                          >
                            Remove PIN
                          </AppButton>
                        </div>
                        {enablePin && (
                          <div className="relative mt-3">
                            <input
                              type={showPin ? 'text' : 'password'}
                              value={pin}
                              onChange={(e) => setPin(e.target.value)}
                              placeholder="Enter new PIN..."
                              className="
                                w-full px-4 py-2.5 pr-12
                                glass-light border border-amber-500/30
                                rounded-xl text-text-primary placeholder:text-text-tertiary
                                focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50
                                transition-all duration-200
                              "
                            />
                            <button
                              type="button"
                              onClick={() => setShowPin(!showPin)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                            >
                              {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="p-3 bg-error/10 border border-error/20 rounded-xl">
                        <p className="text-sm text-error mb-2">
                          PIN protection will be removed. Are you sure?
                        </p>
                        <AppButton
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setRemovePin(false)}
                        >
                          Cancel
                        </AppButton>
                      </div>
                    )}
                  </div>
                ) : (
                  // Folder has no PIN - show option to add
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enablePin}
                        onChange={(e) => {
                          setEnablePin(e.target.checked);
                          if (!e.target.checked) setPin('');
                        }}
                        className="w-4 h-4 rounded border-white/20 text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-sm text-text-secondary">
                        Require PIN to access this folder
                      </span>
                    </label>

                    {enablePin && (
                      <div className="relative">
                        <input
                          type={showPin ? 'text' : 'password'}
                          value={pin}
                          onChange={(e) => setPin(e.target.value)}
                          placeholder="Enter PIN (min 4 characters)..."
                          className="
                            w-full px-4 py-2.5 pr-12
                            glass-light border border-amber-500/30
                            rounded-xl text-text-primary placeholder:text-text-tertiary
                            focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50
                            transition-all duration-200
                          "
                        />
                        <button
                          type="button"
                          onClick={() => setShowPin(!showPin)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                        >
                          {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    )}
                  </div>
                )}
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
