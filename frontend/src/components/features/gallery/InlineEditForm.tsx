import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Lock, Unlock, Key, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppButton } from '../../ui/AppButton';

interface InlineEditFormProps {
  initialTitle?: string;
  initialDescription?: string;
  initialIsPrivate?: boolean;
  /** Whether the asset currently has an access code set */
  hasAccessCode?: boolean;
  onSave: (data: { title: string; description: string; is_private: boolean; access_code?: string | null }) => void;
  onCancel: () => void;
}

export const InlineEditForm: React.FC<InlineEditFormProps> = ({
  initialTitle = '',
  initialDescription = '',
  initialIsPrivate = false,
  hasAccessCode = false,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation('gallery');
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate);
  const [accessCode, setAccessCode] = useState('');
  const [showAccessCodeInput, setShowAccessCodeInput] = useState(false);
  const [removeAccessCode, setRemoveAccessCode] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Focus title on mount
  useEffect(() => {
    if (titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, []);

  // Build save data including access code
  const buildSaveData = () => {
    const data: { title: string; description: string; is_private: boolean; access_code?: string | null } = {
      title,
      description,
      is_private: isPrivate,
    };

    if (removeAccessCode) {
      data.access_code = null; // Signal to remove access code
    } else if (accessCode.trim().length >= 4) {
      data.access_code = accessCode.trim();
    }

    return data;
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(event.target as Node)) {
        onSave(buildSaveData());
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [title, description, isPrivate, accessCode, removeAccessCode, onSave]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(buildSaveData());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div 
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => e.stopPropagation()} // Prevent triggering card clicks
    >
      <div 
        ref={formRef}
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200"
      >
        <form onSubmit={handleSubmit} className="p-4 space-y-4" onKeyDown={handleKeyDown}>
          
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Edit Details</h3>
            <button
              type="button"
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300"
            >
              <X size={16} />
            </button>
          </div>

          {/* Title Input */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Title
            </label>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-slate-100"
              placeholder="Enter title..."
            />
          </div>

          {/* Description Input */}
          <div className="space-y-1">
             <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-slate-100 resize-none"
              rows={3}
              placeholder="Enter description..."
            />
          </div>

          {/* Privacy Toggle */}
          <div
            className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            onClick={() => setIsPrivate(!isPrivate)}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${isPrivate ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-500' : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-500'}`}>
                {isPrivate ? <Lock size={16} /> : <Unlock size={16} />}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {isPrivate ? 'Private Asset' : 'Public Asset'}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {isPrivate ? 'Only visible to you' : 'Visible to gallery visitors'}
                </span>
              </div>
            </div>
            <div className={`w-10 h-6 rounded-full relative transition-colors duration-200 ${isPrivate ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${isPrivate ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
          </div>

          {/* Access Code Section */}
          <div className="space-y-2">
            {hasAccessCode && !removeAccessCode && !showAccessCodeInput ? (
              // Current access code indicator with options
              <div className="flex items-center justify-between p-3 bg-primary-50 dark:bg-primary-900/20 rounded-md border border-primary-200 dark:border-primary-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                    <Key size={16} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {t('accessCode.protected', 'Protected')}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {t('accessCode.enterCodeToView', 'Code required to view')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAccessCodeInput(true)}
                    className="px-2 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded transition-colors"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveAccessCode(true)}
                    className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                    title={t('accessCode.removeAccessCode', 'Remove Access Code')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ) : removeAccessCode ? (
              // Confirm removal indicator
              <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                    <Key size={16} />
                  </div>
                  <span className="text-sm text-red-700 dark:text-red-300">
                    Access code will be removed
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setRemoveAccessCode(false)}
                  className="px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 rounded transition-colors"
                >
                  Undo
                </button>
              </div>
            ) : showAccessCodeInput || (!hasAccessCode && !removeAccessCode) ? (
              // Access code input
              <div
                className="p-3 bg-slate-50 dark:bg-slate-800 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                onClick={(e) => {
                  if (!showAccessCodeInput && !hasAccessCode) {
                    e.stopPropagation();
                    setShowAccessCodeInput(true);
                  }
                }}
              >
                {showAccessCodeInput || accessCode ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Key size={12} />
                        {t('accessCode.setAccessCode', 'Set Access Code')}
                      </label>
                      {showAccessCodeInput && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowAccessCodeInput(false);
                            setAccessCode('');
                          }}
                          className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 dark:text-slate-100"
                      placeholder="Enter 4-32 character code..."
                      minLength={4}
                      maxLength={32}
                      autoComplete="off"
                    />
                    {accessCode && accessCode.length < 4 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {t('accessCode.codeRequired', 'Code must be 4-32 characters')}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                      <Key size={16} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {t('accessCode.setAccessCode', 'Set Access Code')}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Require code to view this photo
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
            >
              Cancel
            </AppButton>
            <AppButton
              type="submit"
              variant="primary"
              size="sm"
              leftIcon={<Check size={16} />}
            >
              Save Changes
            </AppButton>
          </div>

        </form>
      </div>
    </div>
  );
};
