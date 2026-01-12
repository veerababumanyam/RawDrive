/**
 * VersionHistory Component
 * Sidebar listing album versions with rollback option
 *
 * Feature: 026-album-proofing
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { History, ChevronDown, ChevronUp, RotateCcw, Plus, Eye, Loader2 } from 'lucide-react';
import type { AlbumVersion } from '../../../types/album';

interface VersionHistoryProps {
  versions: AlbumVersion[];
  currentVersionNumber: number;
  loading?: boolean;
  onCreateVersion?: (label: string) => Promise<void>;
  onRollback?: (versionId: string, createBackup: boolean) => Promise<void>;
  onPreview?: (versionId: string) => void;
  onCompare?: (fromVersionId: string, toVersionId: string) => void;
  className?: string;
}

export function VersionHistory({
  versions,
  currentVersionNumber,
  loading = false,
  onCreateVersion,
  onRollback,
  onPreview,
  onCompare,
  className = '',
}: VersionHistoryProps) {
  const { t } = useTranslation('album');

  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newVersionLabel, setNewVersionLabel] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [rollbackVersionId, setRollbackVersionId] = useState<string | null>(null);
  const [createBackup, setCreateBackup] = useState(true);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [compareFromId, setCompareFromId] = useState<string | null>(null);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleCreateVersion = async () => {
    if (!onCreateVersion || !newVersionLabel.trim()) return;
    setIsCreating(true);
    try {
      await onCreateVersion(newVersionLabel.trim());
      setNewVersionLabel('');
      setShowCreateForm(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRollback = async (versionId: string) => {
    if (!onRollback) return;
    setIsRollingBack(true);
    try {
      await onRollback(versionId, createBackup);
      setRollbackVersionId(null);
    } finally {
      setIsRollingBack(false);
    }
  };

  const handleCompareSelect = (versionId: string) => {
    if (!compareFromId) {
      setCompareFromId(versionId);
    } else {
      if (onCompare) {
        onCompare(compareFromId, versionId);
      }
      setCompareFromId(null);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-800 ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">
              {t('versions.title')}
            </h2>
          </div>

          {onCreateVersion && (
            <button
              type="button"
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label={t('versions.createNew')}
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Create version form */}
        {showCreateForm && (
          <div className="mt-3 space-y-2">
            <input
              type="text"
              value={newVersionLabel}
              onChange={(e) => setNewVersionLabel(e.target.value)}
              placeholder={t('versions.labelPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="flex-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                {t('versions.cancel')}
              </button>
              <button
                type="button"
                onClick={handleCreateVersion}
                disabled={isCreating || !newVersionLabel.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50"
              >
                {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('versions.create')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Compare mode indicator */}
      {compareFromId && (
        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {t('versions.compareSelectSecond')}
          </p>
          <button
            type="button"
            onClick={() => setCompareFromId(null)}
            className="text-xs text-blue-600 hover:underline mt-1"
          >
            {t('versions.cancelCompare')}
          </button>
        </div>
      )}

      {/* Version list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : versions.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
            <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{t('versions.empty')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {versions.map((version) => {
              const isExpanded = expandedVersionId === version.version_id;
              const isCurrent = version.version_number === currentVersionNumber;
              const isCompareFrom = compareFromId === version.version_id;

              return (
                <div
                  key={version.version_id}
                  className={`${isCompareFrom ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedVersionId(isExpanded ? null : version.version_id)}
                    className="w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                  >
                    {/* Version indicator */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        isCurrent
                          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {version.version_number}
                    </div>

                    {/* Version info */}
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {version.label || t('versions.untitled')}
                        </span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300 rounded-full">
                            {t('versions.current')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(version.created_at)}
                      </p>
                    </div>

                    {/* Expand indicator */}
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </button>

                  {/* Expanded actions */}
                  {isExpanded && (
                    <div className="px-4 pb-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {onPreview && (
                          <button
                            type="button"
                            onClick={() => onPreview(version.version_id)}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
                          >
                            <Eye className="w-4 h-4" />
                            {t('versions.preview')}
                          </button>
                        )}

                        {onCompare && (
                          <button
                            type="button"
                            onClick={() => handleCompareSelect(version.version_id)}
                            className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg ${
                              isCompareFrom
                                ? 'text-blue-700 bg-blue-100 dark:bg-blue-900 dark:text-blue-300'
                                : 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                          >
                            {t('versions.compare')}
                          </button>
                        )}
                      </div>

                      {!isCurrent && onRollback && (
                        <>
                          {rollbackVersionId === version.version_id ? (
                            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg space-y-3">
                              <p className="text-sm text-amber-800 dark:text-amber-200">
                                {t('versions.rollbackConfirm')}
                              </p>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={createBackup}
                                  onChange={(e) => setCreateBackup(e.target.checked)}
                                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm text-amber-700 dark:text-amber-300">
                                  {t('versions.createBackup')}
                                </span>
                              </label>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setRollbackVersionId(null)}
                                  className="flex-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                >
                                  {t('versions.cancel')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRollback(version.version_id)}
                                  disabled={isRollingBack}
                                  className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50"
                                >
                                  {isRollingBack && <Loader2 className="w-4 h-4 animate-spin" />}
                                  {t('versions.rollback')}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setRollbackVersionId(version.version_id)}
                              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-lg"
                            >
                              <RotateCcw className="w-4 h-4" />
                              {t('versions.rollbackTo')}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default VersionHistory;
