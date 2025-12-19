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
          <Trash2 size={48} className="mx-auto text-text-tertiary mb-4" />
          <p className="text-text-secondary">Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-6"
    >
      {/* Page Header */}
      <motion.div
        variants={staggerItem}
        className="card-glass rounded-2xl p-4 sm:p-6"
      >
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-error/10">
            <Trash2 size={24} className="text-error" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gradient">Recycle Bin</h1>
            <p className="text-text-secondary mt-1">
              Deleted galleries and photos are kept for 30 days before permanent removal
            </p>
          </div>
        </div>
      </motion.div>

      {/* Recycle Bin Content */}
      <motion.div variants={staggerItem}>
        <RecycleBinView
          workspaceId={workspace.workspace_id}
          retentionDays={30}
        />
      </motion.div>
    </motion.div>
  );
};

export default RecycleBinPage;
