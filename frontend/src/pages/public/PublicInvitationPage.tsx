/**
 * PublicInvitationPage: Guest-facing view of a digital invitation
 *
 * Features:
 * - Public access via magic link slug
 * - Password/PIN protection handling
 * - RSVP form submission
 * - Countdown timer
 * - Add to calendar
 * - Responsive design
 * - Dark/Light theme support with system preference detection
 * - Preview mode support (via iframe + postMessage)
 *
 * Feature: 016-save-the-date, 022-invitation-theme-support
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Loader2,
  AlertTriangle,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { usePublicInvitationTheme } from '@/hooks/usePublicInvitationTheme';
import * as invitationService from '@/services/invitationService';
import type {
  SubmitRSVPRequest,
  RSVPSubmitResponse,
  PublicInvitation,
} from '@/types/invitations';
import {
  PublicInvitationView,
  PasswordForm,
} from '@/components/features/invitations/PublicInvitationView';

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const PublicInvitationPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === 'true';
  const { theme } = usePublicInvitationTheme();

  const [accessData, setAccessData] = useState<{
    password?: string;
    pin?: string;
  }>({});
  const [accessError, setAccessError] = useState<string>();
  const [submitResult, setSubmitResult] = useState<RSVPSubmitResponse>();

  // Local state for preview overrides
  const [previewInvitation, setPreviewInvitation] = useState<PublicInvitation | null>(null);

  // Fetch invitation
  const {
    data: accessResponse,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['public-invitation', slug, accessData],
    queryFn: () =>
      invitationService.accessPublicInvitationByToken(
        slug!,
        accessData.password || accessData.pin ? accessData : undefined
      ),
    enabled: !!slug,
    retry: false,
  });

  // Listen for preview updates via postMessage
  useEffect(() => {
    if (!isPreview) return;

    const handleMessage = (event: MessageEvent) => {
      // Validate origin if needed, but for now allow same origin or development
      // const allowedOrigins = [window.location.origin];

      if (event.data?.type === 'PREVIEW_UPDATE' && event.data.invitation) {
        setPreviewInvitation(event.data.invitation);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isPreview]);

  // Turnstile config
  const { data: turnstileConfig } = useQuery({
    queryKey: ['turnstile-config'],
    queryFn: () => invitationService.getTurnstileConfig(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // RSVP mutation
  const rsvpMutation = useMutation({
    mutationFn: (data: SubmitRSVPRequest) =>
      invitationService.submitPublicRSVP(slug!, data),
    onSuccess: (response) => {
      setSubmitResult(response);
    },
    onError: (error: Error) => {
      setAccessError(error.message || 'Failed to submit RSVP');
    },
  });

  const handleAccessSubmit = useCallback(
    (password?: string, pin?: string) => {
      setAccessData({ password, pin });
      setAccessError(undefined);
    },
    []
  );

  const handleDownloadCalendar = useCallback(async () => {
    try {
      await invitationService.downloadPublicICSByToken(slug!);
    } catch {
      // Silent fail
    }
  }, [slug]);

  // Merge server data with preview overrides
  const invitationToRender = useMemo(() => {
    if (previewInvitation) return previewInvitation;
    return accessResponse?.invitation;
  }, [accessResponse?.invitation, previewInvitation]);

  // Loading state
  if (isLoading && !previewInvitation) {
    return (
      <div
        data-theme={theme}
        className="
          min-h-screen flex flex-col items-center justify-center
          bg-gradient-to-br from-slate-50 via-blue-50/50 to-cyan-50/30
          dark:from-gray-950 dark:via-slate-900 dark:to-gray-900
          transition-colors duration-300
        "
      >
        <div
          role="status"
          aria-label="Loading invitation"
          className="
            flex flex-col items-center gap-4
            p-8 rounded-2xl
            bg-white/60 dark:bg-gray-900/40
            backdrop-blur-xl
            border border-white/50 dark:border-white/10
            shadow-lg dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)]
          "
        >
          <Loader2 className="w-12 h-12 animate-spin text-primary-500" />
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            Loading invitation...
          </p>
        </div>
      </div>
    );
  }

  // Error state (only if not previewing which might override it)
  if ((error || !accessResponse) && !previewInvitation) {
    return (
      <div
        data-theme={theme}
        className="
          min-h-screen flex flex-col items-center justify-center p-4
          bg-gradient-to-br from-slate-50 via-blue-50/50 to-cyan-50/30
          dark:from-gray-950 dark:via-slate-900 dark:to-gray-900
          transition-colors duration-300
        "
      >
        <div
          className="
            max-w-md w-full p-8 text-center rounded-2xl
            bg-white/70 dark:bg-gray-900/50
            backdrop-blur-xl
            border border-white/50 dark:border-white/10
            shadow-xl dark:shadow-[0_12px_40px_rgba(0,0,0,0.3)]
          "
          role="alert"
        >
          <div
            className="
              w-16 h-16 rounded-full mx-auto mb-4
              bg-red-100 dark:bg-red-900/30
              flex items-center justify-center
            "
          >
            <AlertTriangle className="w-8 h-8 text-red-500 dark:text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Invitation Not Found
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            This invitation may have been removed or the link is invalid.
          </p>
          <AppButton
            variant="primary"
            onClick={() => window.location.href = '/'}
            className="min-h-[44px]"
          >
            Go Home
          </AppButton>
        </div>
      </div>
    );
  }

  // Password/PIN required (skip if preview)
  if (
    !isPreview &&
    accessResponse &&
    !accessResponse.access_granted &&
    (accessResponse.requires_password || accessResponse.requires_pin)
  ) {
    return (
      <PasswordForm
        requiresPassword={accessResponse.requires_password}
        requiresPin={accessResponse.requires_pin}
        onSubmit={handleAccessSubmit}
        isLoading={isLoading}
        error={accessResponse.error || accessError}
        theme={theme}
      />
    );
  }

  // Access denied
  if (!isPreview && accessResponse && (!accessResponse.access_granted || !accessResponse.invitation)) {
    return (
      <div
        data-theme={theme}
        className="
          min-h-screen flex flex-col items-center justify-center p-4
          bg-gradient-to-br from-slate-50 via-blue-50/50 to-cyan-50/30
          dark:from-gray-950 dark:via-slate-900 dark:to-gray-900
          transition-colors duration-300
        "
      >
        <div
          className="
            max-w-md w-full p-8 text-center rounded-2xl
            bg-white/70 dark:bg-gray-900/50
            backdrop-blur-xl
            border border-white/50 dark:border-white/10
            shadow-xl
          "
        >
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Access Denied
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {accessResponse.error || 'Unable to access this invitation.'}
          </p>
        </div>
      </div>
    );
  }

  // If we have an invitation to render, render it
  if (invitationToRender) {
    return (
      <PublicInvitationView
        invitation={invitationToRender}
        slug={slug!}
        turnstileConfig={turnstileConfig}
        rsvpMutation={rsvpMutation}
        submitResult={submitResult}
        handleDownloadCalendar={handleDownloadCalendar}
        theme={theme}
        isPreview={isPreview}
      />
    );
  }

  return null;
};

export default PublicInvitationPage;
