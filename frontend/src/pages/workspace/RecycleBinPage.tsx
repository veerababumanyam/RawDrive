/**
 * RecycleBinPage Component
 *
 * Workspace page for managing deleted galleries and photos.
 * Displays items in the recycle bin with options to restore or permanently delete.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { staggerContainer, staggerItem } from '../../components/landing/animations/presets';
import { useAuth } from '../../contexts/AuthContext';
import { RecycleBinView } from '../../components/features/recycle-bin/RecycleBinView';

const RecycleBinPage: React.FC = () => {
  const { workspace } = useAuth();

  if (!workspace?.workspace_id) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="empty-state-icon mx-auto mb-4">
            <Trash2 size={32} />
          </div>
          <p className="text-text-secondary">Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Page Header */}
      <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gradient flex items-center gap-3">
                <div className="section-header-icon icon-container-error">
                  <Trash2 className="w-5 h-5" />
                </div>
                Recycle Bin
              </h1>
              <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                Deleted galleries and photos are kept for 30 days before permanent removal
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recycle Bin Content */}
      <motion.main
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8"
      >
        <motion.div variants={staggerItem}>
          <RecycleBinView
            workspaceId={workspace.workspace_id}
            retentionDays={30}
          />
        </motion.div>
      </motion.main>
    </div>
  );
};

export default RecycleBinPage;
