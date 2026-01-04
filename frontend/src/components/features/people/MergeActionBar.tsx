/**
 * MergeActionBar Component
 *
 * Fixed bottom action bar that appears when 2+ people are selected.
 * Contains Clear and Merge buttons with animated entrance.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Merge } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';

interface MergeActionBarProps {
  selectedCount: number;
  onClear: () => void;
  onMerge: () => void;
  visible: boolean;
}

export const MergeActionBar: React.FC<MergeActionBarProps> = ({
  selectedCount,
  onClear,
  onMerge,
  visible,
}) => {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none"
        >
          <div className="max-w-4xl mx-auto px-4 pb-6">
            <div className="pointer-events-auto bg-surface/95 backdrop-blur-md border border-border shadow-xl rounded-2xl p-4">
              <div className="flex items-center justify-between gap-4">
                {/* Selection info */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
                    <Merge className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-text-primary">
                      {selectedCount} people selected
                    </p>
                    <p className="text-xs text-text-secondary">
                      Select 2 or more to merge
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <AppButton
                    variant="ghost"
                    size="sm"
                    onClick={onClear}
                    className="text-text-secondary hover:text-text-primary"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Clear ({selectedCount})
                  </AppButton>

                  <AppButton
                    variant="primary"
                    size="md"
                    onClick={onMerge}
                    disabled={selectedCount < 2}
                  >
                    <Merge className="w-4 h-4 mr-2" />
                    Merge {selectedCount} People
                  </AppButton>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MergeActionBar;
