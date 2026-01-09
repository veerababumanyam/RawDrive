import { useState, useEffect, useCallback } from 'react';
import { workspaceSettingsService } from '../services/workspaceSettingsService';
import type {
    WorkspaceAISettings,
    UpdateWorkspaceAISettingsRequest,
    WorkspaceSecuritySettings,
    UpdateWorkspaceSecuritySettingsRequest,
    WorkspaceNotificationSettings,
    UpdateWorkspaceNotificationSettingsRequest,
    WorkspacePrivacySettings,
    UpdateWorkspacePrivacySettingsRequest,
    // WorkspaceDeletionRequest
} from '../types/workspaceSettings';

interface UseSettingsResult<T> {
    settings: T | null;
    loading: boolean;
    error: Error | null;
    update: (data: any) => Promise<T>;
    refresh: () => Promise<void>;
}

export function useWorkspaceAISettings(workspaceId: string): UseSettingsResult<WorkspaceAISettings> {
    const [settings, setSettings] = useState<WorkspaceAISettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchSettings = useCallback(async () => {
        if (!workspaceId) return;
        try {
            setLoading(true);
            const data = await workspaceSettingsService.getAISettings(workspaceId);
            setSettings(data);
            setError(null);
        } catch (err) {
            setError(err as Error);
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const update = async (data: UpdateWorkspaceAISettingsRequest) => {
        setLoading(true);
        try {
            const updated = await workspaceSettingsService.updateAISettings(workspaceId, data);
            setSettings(updated);
            return updated;
        } catch (err) {
            setError(err as Error);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    return { settings, loading, error, update, refresh: fetchSettings };
}

export function useWorkspaceSecuritySettings(workspaceId: string): UseSettingsResult<WorkspaceSecuritySettings> {
    const [settings, setSettings] = useState<WorkspaceSecuritySettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchSettings = useCallback(async () => {
        if (!workspaceId) return;
        try {
            setLoading(true);
            const data = await workspaceSettingsService.getSecuritySettings(workspaceId);
            setSettings(data);
            setError(null);
        } catch (err) {
            setError(err as Error);
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const update = async (data: UpdateWorkspaceSecuritySettingsRequest) => {
        setLoading(true);
        try {
            const updated = await workspaceSettingsService.updateSecuritySettings(workspaceId, data);
            setSettings(updated);
            return updated;
        } catch (err) {
            setError(err as Error);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    return { settings, loading, error, update, refresh: fetchSettings };
}

export function useWorkspaceNotificationSettings(workspaceId: string): UseSettingsResult<WorkspaceNotificationSettings> {
    const [settings, setSettings] = useState<WorkspaceNotificationSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchSettings = useCallback(async () => {
        if (!workspaceId) return;
        try {
            setLoading(true);
            const data = await workspaceSettingsService.getNotificationSettings(workspaceId);
            setSettings(data);
            setError(null);
        } catch (err) {
            setError(err as Error);
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const update = async (data: UpdateWorkspaceNotificationSettingsRequest) => {
        setLoading(true);
        try {
            const updated = await workspaceSettingsService.updateNotificationSettings(workspaceId, data);
            setSettings(updated);
            return updated;
        } catch (err) {
            setError(err as Error);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    return { settings, loading, error, update, refresh: fetchSettings };
}

export function useWorkspacePrivacySettings(workspaceId: string): UseSettingsResult<WorkspacePrivacySettings> {
    const [settings, setSettings] = useState<WorkspacePrivacySettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchSettings = useCallback(async () => {
        if (!workspaceId) return;
        try {
            setLoading(true);
            const data = await workspaceSettingsService.getPrivacySettings(workspaceId);
            setSettings(data);
            setError(null);
        } catch (err) {
            setError(err as Error);
        } finally {
            setLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const update = async (data: UpdateWorkspacePrivacySettingsRequest) => {
        setLoading(true);
        try {
            const updated = await workspaceSettingsService.updatePrivacySettings(workspaceId, data);
            setSettings(updated);
            return updated;
        } catch (err) {
            setError(err as Error);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    return { settings, loading, error, update, refresh: fetchSettings };
}
