import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Lock, Unlock } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';

interface InlineEditFormProps {
  initialTitle?: string;
  initialDescription?: string;
  initialIsPrivate?: boolean;
  onSave: (data: { title: string; description: string; is_private: boolean }) => void;
  onCancel: () => void;
}

export const InlineEditForm: React.FC<InlineEditFormProps> = ({
  initialTitle = '',
  initialDescription = '',
  initialIsPrivate = false,
  onSave,
  onCancel,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate);
  const formRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Focus title on mount
  useEffect(() => {
    if (titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, []);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(event.target as Node)) {
        onSave({ title, description, is_private: isPrivate });
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [title, description, isPrivate, onSave]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ title, description, is_private: isPrivate });
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
