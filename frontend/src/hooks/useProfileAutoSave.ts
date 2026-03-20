/**
 * useProfileAutoSave
 *
 * Debounced auto-save hook for profile editor.
 * Fires a PATCH request 2 seconds after last change using TanStack Query mutation.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ProfileType } from '@/components/features/profile/shared/SectionRegistry';
import { personalProfileService } from '@/services/personalProfileService';
import { companyProfileService } from '@/services/companyProfileService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/useToast';

const AUTO_SAVE_DELAY = 2000;

interface UseProfileAutoSaveOptions {
  profileType: ProfileType;
  profileData: Record<string, unknown>;
  isDirty: boolean;
  onSaved: () => void;
}

interface UseProfileAutoSaveReturn {
  isSaving: boolean;
  lastSavedAt: string | null;
  saveNow: () => void;
}

export function useProfileAutoSave({
  profileType,
  profileData,
  isDirty,
  onSaved,
}: UseProfileAutoSaveOptions): UseProfileAutoSaveReturn {
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Store latest values in refs so the timer callback always uses current data
  const latestDataRef = useRef(profileData);
  const profileTypeRef = useRef(profileType);
  const workspaceRef = useRef(workspace);
  const onSavedRef = useRef(onSaved);
  const addToastRef = useRef(addToast);

  latestDataRef.current = profileData;
  profileTypeRef.current = profileType;
  workspaceRef.current = workspace;
  onSavedRef.current = onSaved;
  addToastRef.current = addToast;

  const mutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const workspaceId = workspaceRef.current?.workspace_id;
      if (!workspaceId) {
        throw new Error('No workspace selected');
      }

      if (profileTypeRef.current === 'personal') {
        return personalProfileService.updateProfile(workspaceId, data as any);
      } else {
        return companyProfileService.updateProfile(workspaceId, data as any);
      }
    },
    onSuccess: () => {
      setLastSavedAt(new Date().toISOString());
      onSavedRef.current();
    },
    onError: (error: Error) => {
      addToastRef.current({
        message: `Auto-save failed: ${error.message}`,
        variant: 'error',
      });
    },
  });

  const mutateRef = useRef(mutation.mutate);
  mutateRef.current = mutation.mutate;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      mutateRef.current(latestDataRef.current);
    }, AUTO_SAVE_DELAY);
  }, [clearTimer]);

  // When isDirty becomes true or profileData changes while dirty, (re)start the timer
  useEffect(() => {
    if (!isDirty) {
      clearTimer();
      return;
    }

    startTimer();

    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, profileData]);

  const executeSave = useCallback(() => {
    clearTimer();
    mutateRef.current(latestDataRef.current);
  }, [clearTimer]);

  return {
    isSaving: mutation.isPending,
    lastSavedAt,
    saveNow: executeSave,
  };
}
