/**
 * useUserSettings Hooks
 * Comprehensive hooks for user profile, security, notifications, privacy, and account management.
 */

import { useState, useEffect, useCallback } from 'react';
import { userSettingsService } from '../services/userSettingsService';
import type {
  ExtendedUserProfile,
  UpdateProfileRequest,
  AvatarUploadResponse,
  TwoFactorSetupResponse,
  TwoFactorStatusResponse,
  TwoFactorEnabledResponse,
  BackupCodesResponse,
  SessionItem,
  SessionListResponse,
  NotificationPreferences,
  UpdateNotificationPreferencesRequest,
  PrivacySettings,
  UpdatePrivacySettingsRequest,
  DataExportResponse,
  DeletionStatusResponse,
  MessageResponse,
} from '../types/userSettings';

// ---------------------------------------------------------------------------
// Profile Hook
// ---------------------------------------------------------------------------

interface UseUserProfileOptions {
  autoFetch?: boolean;
}

interface UseUserProfileReturn {
  profile: ExtendedUserProfile | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  updateProfile: (data: UpdateProfileRequest) => Promise<ExtendedUserProfile>;
  uploadAvatar: (
    file: File,
    cropData?: { crop_x?: number; crop_y?: number; crop_scale?: number }
  ) => Promise<AvatarUploadResponse>;
  deleteAvatar: () => Promise<void>;
  requestEmailChange: (newEmail: string, password: string) => Promise<MessageResponse>;
}

export const useUserProfile = ({
  autoFetch = true,
}: UseUserProfileOptions = {}): UseUserProfileReturn => {
  const [profile, setProfile] = useState<ExtendedUserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await userSettingsService.getProfile();
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch profile'));
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchProfile();
    }
  }, [autoFetch, fetchProfile]);

  const updateProfile = useCallback(async (data: UpdateProfileRequest) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await userSettingsService.updateProfile(data);
      setProfile(updated);
      return updated;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update profile');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const uploadAvatar = useCallback(
    async (
      file: File,
      cropData?: { crop_x?: number; crop_y?: number; crop_scale?: number }
    ) => {
      setLoading(true);
      setError(null);
      try {
        const result = await userSettingsService.uploadAvatar(file, cropData);
        // Update profile with new avatar URL
        if (profile) {
          setProfile({ ...profile, avatar_url: result.avatar_url });
        }
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to upload avatar');
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [profile]
  );

  const deleteAvatar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await userSettingsService.deleteAvatar();
      // Clear avatar from profile
      if (profile) {
        setProfile({ ...profile, avatar_url: null });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to delete avatar');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [profile]);

  const requestEmailChange = useCallback(
    async (newEmail: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await userSettingsService.requestEmailChange({
          new_email: newEmail,
          password: password,
        });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to request email change');
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    profile,
    loading,
    error,
    refetch: fetchProfile,
    updateProfile,
    uploadAvatar,
    deleteAvatar,
    requestEmailChange,
  };
};

// ---------------------------------------------------------------------------
// Security / 2FA Hook
// ---------------------------------------------------------------------------

interface UseTwoFactorAuthReturn {
  status: TwoFactorStatusResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  setup2FA: () => Promise<TwoFactorSetupResponse>;
  verify2FA: (code: string) => Promise<TwoFactorEnabledResponse>;
  disable2FA: (password: string, code: string) => Promise<void>;
  regenerateBackupCodes: (password: string) => Promise<BackupCodesResponse>;
}

export const useTwoFactorAuth = (): UseTwoFactorAuthReturn => {
  const [status, setStatus] = useState<TwoFactorStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await userSettingsService.get2FAStatus();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch 2FA status'));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const setup2FA = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await userSettingsService.setup2FA();
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to setup 2FA');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const verify2FA = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await userSettingsService.verify2FA({ code });
      // Update status after successful verification
      setStatus({ enabled: true, enabled_at: new Date().toISOString() });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to verify 2FA code');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const disable2FA = useCallback(async (password: string, code: string) => {
    setLoading(true);
    setError(null);
    try {
      await userSettingsService.disable2FA({ password, code });
      // Update status after disabling
      setStatus({ enabled: false });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to disable 2FA');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const regenerateBackupCodes = useCallback(async (password: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await userSettingsService.regenerateBackupCodes({ password });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to regenerate backup codes');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    status,
    loading,
    error,
    refetch: fetchStatus,
    setup2FA,
    verify2FA,
    disable2FA,
    regenerateBackupCodes,
  };
};

// ---------------------------------------------------------------------------
// Password Change Hook
// ---------------------------------------------------------------------------

interface UsePasswordChangeReturn {
  loading: boolean;
  error: Error | null;
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<MessageResponse>;
}

export const usePasswordChange = (): UsePasswordChangeReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await userSettingsService.changePassword({
          current_password: currentPassword,
          new_password: newPassword,
        });
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to change password');
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    error,
    changePassword,
  };
};

// ---------------------------------------------------------------------------
// Sessions Hook
// ---------------------------------------------------------------------------

interface UseSessionsReturn {
  sessions: SessionItem[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  terminateSession: (sessionId: string) => Promise<void>;
  terminateAllOther: () => Promise<void>;
}

export const useSessions = (): UseSessionsReturn => {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: SessionListResponse = await userSettingsService.listSessions();
      setSessions(data.items);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch sessions'));
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const terminateSession = useCallback(
    async (sessionId: string) => {
      setLoading(true);
      setError(null);
      try {
        await userSettingsService.terminateSession(sessionId);
        // Remove from local state
        setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to terminate session');
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const terminateAllOther = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await userSettingsService.terminateAllOtherSessions();
      // Refetch to get updated list (should only show current session)
      await fetchSessions();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to terminate sessions');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [fetchSessions]);

  return {
    sessions,
    loading,
    error,
    refetch: fetchSessions,
    terminateSession,
    terminateAllOther,
  };
};

// ---------------------------------------------------------------------------
// Notification Preferences Hook
// ---------------------------------------------------------------------------

interface UseNotificationPreferencesReturn {
  preferences: NotificationPreferences | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  updatePreferences: (data: UpdateNotificationPreferencesRequest) => Promise<NotificationPreferences>;
}

export const useNotificationPreferences = (): UseNotificationPreferencesReturn => {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchPreferences = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await userSettingsService.getNotificationPreferences();
      setPreferences(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch notification preferences'));
      setPreferences(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const updatePreferences = useCallback(
    async (data: UpdateNotificationPreferencesRequest) => {
      setLoading(true);
      setError(null);
      try {
        const updated = await userSettingsService.updateNotificationPreferences(data);
        setPreferences(updated);
        return updated;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to update notification preferences');
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    preferences,
    loading,
    error,
    refetch: fetchPreferences,
    updatePreferences,
  };
};

// ---------------------------------------------------------------------------
// Privacy Settings Hook
// ---------------------------------------------------------------------------

interface UsePrivacySettingsReturn {
  settings: PrivacySettings | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  updateSettings: (data: UpdatePrivacySettingsRequest) => Promise<PrivacySettings>;
}

export const usePrivacySettings = (): UsePrivacySettingsReturn => {
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await userSettingsService.getPrivacySettings();
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch privacy settings'));
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(async (data: UpdatePrivacySettingsRequest) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await userSettingsService.updatePrivacySettings(data);
      setSettings(updated);
      return updated;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update privacy settings');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    settings,
    loading,
    error,
    refetch: fetchSettings,
    updateSettings,
  };
};

// ---------------------------------------------------------------------------
// Data Export Hook
// ---------------------------------------------------------------------------

interface UseDataExportReturn {
  exportStatus: DataExportResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  requestExport: () => Promise<DataExportResponse>;
}

export const useDataExport = (): UseDataExportReturn => {
  const [exportStatus, setExportStatus] = useState<DataExportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await userSettingsService.getDataExportStatus();
      // data is null if no export exists
      setExportStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch export status'));
      setExportStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const requestExport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await userSettingsService.requestDataExport();
      setExportStatus(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to request data export');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    exportStatus,
    loading,
    error,
    refetch: fetchStatus,
    requestExport,
  };
};

// ---------------------------------------------------------------------------
// Account Deletion Hook
// ---------------------------------------------------------------------------

interface UseAccountDeletionReturn {
  deletionStatus: DeletionStatusResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  requestDeletion: (password: string, reason?: string) => Promise<void>;
  cancelDeletion: () => Promise<void>;
}

export const useAccountDeletion = (): UseAccountDeletionReturn => {
  const [deletionStatus, setDeletionStatus] = useState<DeletionStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await userSettingsService.getDeletionStatus();
      setDeletionStatus(data);
    } catch (err) {
      // 404 is expected when no deletion request exists
      if ((err as { status?: number })?.status !== 404) {
        setError(err instanceof Error ? err : new Error('Failed to fetch deletion status'));
      }
      setDeletionStatus({ has_pending_deletion: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const requestDeletion = useCallback(
    async (password: string, reason?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await userSettingsService.requestAccountDeletion({
          password,
          reason,
        });
        setDeletionStatus({
          has_pending_deletion: true,
          deletion_id: result.deletion_id,
          scheduled_deletion_at: result.scheduled_deletion_at,
          days_until_deletion: result.days_until_deletion,
          can_cancel: result.can_cancel,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to request account deletion');
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const cancelDeletion = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await userSettingsService.cancelAccountDeletion();
      setDeletionStatus({ has_pending_deletion: false });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to cancel account deletion');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    deletionStatus,
    loading,
    error,
    refetch: fetchStatus,
    requestDeletion,
    cancelDeletion,
  };
};
