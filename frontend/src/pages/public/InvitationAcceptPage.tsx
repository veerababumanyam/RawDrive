/**
 * InvitationAcceptPage
 *
 * Public page for accepting team/workspace invitations.
 * Handles the complete invitation acceptance flow:
 * 1. Fetches invitation preview by token (public, no auth required)
 * 2. Shows invitation details (workspace name, inviter, roles, expiration)
 * 3. If user is authenticated, allows accepting the invitation
 * 4. If not authenticated, redirects to sign in/up with return URL
 * 5. Handles expired, invalid, and email mismatch errors
 *
 * Route: /invite/:token
 *
 * Uses centralized auth glass utilities from index.css (Section 18.12.3)
 * Requirements: Team Management & Multi-User Workspaces
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users,
  Building2,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  UserPlus,
  Shield,
  Mail,
} from 'lucide-react';

import { SEOHead } from '@/components/landing';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/contexts';
import useTheme from '@/hooks/useTheme';
import {
  useInvitationPreview,
  useAcceptInvitation,
} from '@/hooks/useTeam';
import {
  InvitationErrorFallback,
  getErrorTypeFromError,
} from '@/components/features/invitations/InvitationErrorFallback';

// =============================================================================
// Types
// =============================================================================

type PageState = 'loading' | 'preview' | 'accepting' | 'success' | 'error';

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format expiration date for display
 */
function formatExpirationDate(expiresAt: string): string {
  const date = new Date(expiresAt);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return 'Expired';
  } else if (diffDays === 1) {
    return 'Expires tomorrow';
  } else if (diffDays <= 7) {
    return `Expires in ${diffDays} days`;
  } else {
    return `Expires ${date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
  }
}

/**
 * Format role names for display (e.g., 'admin' -> 'Admin')
 */
function formatRoleName(role: string): string {
  return role
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// =============================================================================
// Component
// =============================================================================

const InvitationAcceptPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { resolvedTheme } = useTheme();

  // Fetch invitation preview (public endpoint, no auth required)
  const {
    invitation,
    isLoading: isPreviewLoading,
    error: previewError,
    isExpired,
    isValid,
    refetch,
  } = useInvitationPreview({ token, enabled: !!token });

  // Accept invitation mutation
  const {
    acceptInvitation,
    isAccepting,
    error: acceptError,
    reset: resetAcceptError,
  } = useAcceptInvitation();

  // Local state
  const [pageState, setPageState] = useState<PageState>('loading');
  const [acceptedWorkspace, setAcceptedWorkspace] = useState<{
    name: string;
    slug: string;
  } | null>(null);

  // Determine if there's an email mismatch
  // Use optional chaining to prevent TypeError when user/invitation email is undefined
  const emailMismatch = useMemo(() => {
    if (!user?.email || !invitation?.email) return false;
    return user.email.toLowerCase() !== invitation.email.toLowerCase();
  }, [user, invitation]);

  // Update page state based on loading and data
  useEffect(() => {
    if (isPreviewLoading || isAuthLoading) {
      setPageState('loading');
    } else if (previewError) {
      setPageState('error');
    } else if (isExpired) {
      setPageState('error');
    } else if (acceptedWorkspace) {
      setPageState('success');
    } else if (isAccepting) {
      setPageState('accepting');
    } else if (invitation) {
      setPageState('preview');
    }
  }, [
    isPreviewLoading,
    isAuthLoading,
    previewError,
    isExpired,
    invitation,
    isAccepting,
    acceptedWorkspace,
  ]);

  // =============================================================================
  // Handlers
  // =============================================================================

  /**
   * Handle accepting the invitation
   */
  const handleAccept = async () => {
    if (!token) return;

    try {
      const result = await acceptInvitation(token);
      setAcceptedWorkspace({
        name: result.workspace_name,
        slug: result.workspace_slug,
      });
      setPageState('success');
    } catch (error) {
      // Error is handled by the mutation's onError callback
      console.error('Failed to accept invitation:', error);
    }
  };

  /**
   * Navigate to workspace after successful acceptance
   */
  const handleGoToWorkspace = () => {
    navigate('/workspace');
  };

  /**
   * Redirect to sign in with return URL
   */
  const handleSignIn = () => {
    navigate(`/signin?redirect=${encodeURIComponent(`/invite/${token}`)}`);
  };

  /**
   * Redirect to sign up with return URL
   */
  const handleSignUp = () => {
    navigate(`/signup?redirect=${encodeURIComponent(`/invite/${token}`)}`);
  };

  /**
   * Retry fetching the invitation
   */
  const handleRetry = () => {
    resetAcceptError();
    refetch();
  };

  // =============================================================================
  // Render States
  // =============================================================================

  // Render loading state
  if (pageState === 'loading') {
    return (
      <PageWrapper resolvedTheme={resolvedTheme}>
        <SEOHead
          title="Loading Invitation"
          description="Loading your team invitation..."
          canonicalUrl={`/invite/${token}`}
          noIndex
        />
        <div className="auth-glass-card p-8 text-center">
          <div className="w-12 h-12 border-3 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="auth-subheading">Loading invitation...</p>
        </div>
      </PageWrapper>
    );
  }

  // Render error state
  if (pageState === 'error') {
    const errorType = isExpired
      ? 'expired'
      : previewError
        ? getErrorTypeFromError(previewError)
        : 'generic';

    return (
      <PageWrapper resolvedTheme={resolvedTheme}>
        <SEOHead
          title="Invitation Error"
          description="There was an issue with your invitation."
          canonicalUrl={`/invite/${token}`}
          noIndex
        />
        <div className="w-full max-w-lg">
          <InvitationErrorFallback
            type={errorType}
            title={isExpired ? 'Invitation Expired' : undefined}
            message={
              isExpired
                ? 'This invitation has expired. Please request a new invitation from the workspace administrator.'
                : undefined
            }
            showRetry={!isExpired}
            isRetrying={isPreviewLoading}
            onRetry={handleRetry}
            showBack={false}
            showHome
          />
        </div>
      </PageWrapper>
    );
  }

  // Render success state
  if (pageState === 'success' && acceptedWorkspace) {
    return (
      <PageWrapper resolvedTheme={resolvedTheme}>
        <SEOHead
          title="Welcome to the Team!"
          description={`You've joined ${acceptedWorkspace.name}`}
          canonicalUrl={`/invite/${token}`}
          noIndex
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="auth-glass-card p-6 sm:p-8 text-center"
        >
          {/* Success Icon */}
          <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>

          {/* Success Message */}
          <h1 className="auth-heading mb-2">Welcome to the Team!</h1>
          <p className="auth-subheading mb-6">
            You've successfully joined{' '}
            <span className="font-semibold text-white">
              {acceptedWorkspace.name}
            </span>
          </p>

          {/* Go to Workspace Button */}
          <AppButton
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleGoToWorkspace}
          >
            Go to Workspace
            <ArrowRight className="w-5 h-5 ml-2" />
          </AppButton>
        </motion.div>
      </PageWrapper>
    );
  }

  // Render preview state (main content)
  if (!invitation) return null;

  return (
    <PageWrapper resolvedTheme={resolvedTheme}>
      <SEOHead
        title={`Join ${invitation.workspace_name}`}
        description={`You've been invited to join ${invitation.workspace_name} on RawDrive.`}
        canonicalUrl={`/invite/${token}`}
        noIndex
      />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="auth-glass-card p-6 sm:p-8"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-7 h-7 text-primary" />
          </div>
          <h1 className="auth-heading">You're Invited!</h1>
          <p className="auth-subheading">
            Join the team at{' '}
            <span className="font-semibold text-white">
              {invitation.workspace_name}
            </span>
          </p>
        </div>

        {/* Invitation Details Card */}
        <div className="bg-surface/50 rounded-xl p-4 mb-6 space-y-3">
          {/* Workspace */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-surface-hover flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-text-secondary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-text-tertiary uppercase tracking-wide">
                Workspace
              </p>
              <p className="text-text-primary font-medium truncate">
                {invitation.workspace_name}
              </p>
            </div>
          </div>

          {/* Invited By */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-surface-hover flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5 text-text-secondary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-text-tertiary uppercase tracking-wide">
                Invited By
              </p>
              <p className="text-text-primary font-medium truncate">
                {invitation.invited_by}
              </p>
            </div>
          </div>

          {/* Roles */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-surface-hover flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-text-secondary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-text-tertiary uppercase tracking-wide">
                Role{invitation.roles.length > 1 ? 's' : ''}
              </p>
              <p className="text-text-primary font-medium">
                {invitation.roles.map(formatRoleName).join(', ')}
              </p>
            </div>
          </div>

          {/* Expiration */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-surface-hover flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-text-secondary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-text-tertiary uppercase tracking-wide">
                Validity
              </p>
              <p className="text-text-primary font-medium">
                {formatExpirationDate(invitation.expires_at)}
              </p>
            </div>
          </div>

          {/* Invited Email */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-surface-hover flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-text-secondary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-text-tertiary uppercase tracking-wide">
                Invited Email
              </p>
              <p className="text-text-primary font-medium truncate">
                {invitation.email}
              </p>
            </div>
          </div>
        </div>

        {/* Accept Error Display */}
        {acceptError && (
          <div className="auth-error mb-4 flex items-center gap-2" role="alert">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{acceptError.message}</span>
          </div>
        )}

        {/* Email Mismatch Warning */}
        {isAuthenticated && emailMismatch && (
          <div
            className="flex items-start gap-3 p-4 bg-warning/10 border border-warning/20 rounded-lg mb-4"
            role="alert"
          >
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">
                Email Mismatch
              </p>
              <p className="text-sm text-text-secondary mt-1">
                This invitation was sent to{' '}
                <span className="font-medium text-text-primary">
                  {invitation.email}
                </span>
                , but you're signed in as{' '}
                <span className="font-medium text-text-primary">
                  {user?.email}
                </span>
                . Please sign in with the correct account.
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        {isAuthenticated ? (
          // User is authenticated
          <>
            {!emailMismatch && (
              <AppButton
                variant="primary"
                size="lg"
                fullWidth
                onClick={handleAccept}
                isLoading={isAccepting}
                loadingText="Joining..."
                disabled={emailMismatch}
              >
                Accept Invitation
                <ArrowRight className="w-5 h-5 ml-2" />
              </AppButton>
            )}

            {emailMismatch && (
              <AppButton
                variant="outline"
                size="lg"
                fullWidth
                onClick={handleSignIn}
              >
                Sign in with Different Account
              </AppButton>
            )}

            {/* Current User Info */}
            <p className="mt-4 text-center text-sm text-text-tertiary">
              Signed in as{' '}
              <span className="text-text-secondary">{user?.email}</span>
            </p>
          </>
        ) : (
          // User is not authenticated
          <>
            <div className="space-y-3">
              <AppButton
                variant="primary"
                size="lg"
                fullWidth
                onClick={handleSignIn}
              >
                Sign In to Accept
                <ArrowRight className="w-5 h-5 ml-2" />
              </AppButton>

              <AppButton
                variant="outline"
                size="lg"
                fullWidth
                onClick={handleSignUp}
              >
                <UserPlus className="w-5 h-5 mr-2" />
                Create Account
              </AppButton>
            </div>

            <p className="mt-4 text-center text-sm text-text-tertiary">
              Sign in or create an account to accept this invitation
            </p>
          </>
        )}

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-sm text-text-tertiary">
            Having trouble?{' '}
            <Link to="/contact" className="auth-link">
              Contact Support
            </Link>
          </p>
        </div>
      </motion.div>
    </PageWrapper>
  );
};

// =============================================================================
// PageWrapper Component
// =============================================================================

interface PageWrapperProps {
  children: React.ReactNode;
  resolvedTheme: string;
}

const PageWrapper: React.FC<PageWrapperProps> = ({ children, resolvedTheme }) => (
  <div
    data-theme={resolvedTheme}
    className="min-h-screen bg-hero-gradient flex items-center justify-center px-4 py-8"
  >
    {/* Background subtle pattern */}
    <div
      className="absolute inset-0 hero-pattern-grid opacity-[0.02]"
      aria-hidden="true"
    />

    <div className="relative w-full max-w-sm">
      {/* Logo */}
      <Link to="/" className="flex items-center justify-center gap-2 mb-8">
        <img
          src="/android-chrome-192x192.png"
          alt="RawDrive"
          className="w-10 h-10 rounded-xl"
        />
        <span className="font-bold text-xl text-white">
          Raw<span className="landing-text-gradient">Drive</span>
        </span>
      </Link>

      {children}
    </div>
  </div>
);

export default InvitationAcceptPage;
