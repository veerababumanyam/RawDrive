/**
 * Email Verification Page
 * Verify email step in the onboarding flow
 * Feature: Automated Onboarding System
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, RefreshCw, CheckCircle } from 'lucide-react';
import { useOnboarding } from '../../contexts/OnboardingContext';

// ============================================================================
// Main Page Component
// ============================================================================

export const EmailVerificationPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    session,
    verifyEmail,
    resendVerification,
    isLoading,
    error,
  } = useOnboarding();

  const [verificationCode, setVerificationCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isVerified, setIsVerified] = useState(false);

  // Get email from session
  const email = session?.registration_data?.email;

  // Redirect if no session or not at correct step
  useEffect(() => {
    if (!session) {
      navigate('/onboarding/plans');
      return;
    }

    // If email already verified, go to payment
    if (session.email_verified) {
      navigate('/onboarding/payment');
    }
  }, [session, navigate]);

  // Handle token from URL (deep link from email)
  useEffect(() => {
    const token = searchParams.get('token');
    if (token && !isVerified) {
      handleVerify(token);
    }
  }, [searchParams]);

  // Cooldown timer for resend
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleVerify = async (token: string) => {
    try {
      await verifyEmail({ token });
      setIsVerified(true);
      // Auto-navigate after short delay
      setTimeout(() => navigate('/onboarding/payment'), 1500);
    } catch {
      // Error handled by context
    }
  };

  const handleResend = async () => {
    try {
      await resendVerification();
      setResendCooldown(60); // 60 second cooldown
    } catch {
      // Error handled by context
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationCode.trim()) {
      handleVerify(verificationCode.trim());
    }
  };

  // Success state
  if (isVerified) {
    return (
      <div className="max-w-md mx-auto text-center">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          Email verified!
        </h1>
        <p className="text-text-secondary mb-6">
          Redirecting you to payment...
        </p>
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Mail className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-text-primary mb-2">
          Check your email
        </h1>
        <p className="text-text-secondary">
          We sent a verification link to
        </p>
        <p className="text-text-primary font-medium mt-1">
          {email || 'your email address'}
        </p>
      </div>

      {/* Instructions */}
      <div className="bg-surface border border-border rounded-xl p-6 mb-6">
        <h2 className="font-medium text-text-primary mb-3">
          Click the link in your email to verify your account
        </h2>
        <ul className="space-y-2 text-sm text-text-secondary">
          <li className="flex items-start gap-2">
            <span className="text-primary">1.</span>
            Open the email from RawDrive
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">2.</span>
            Click the "Verify Email" button
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary">3.</span>
            You'll be automatically redirected back
          </li>
        </ul>
      </div>

      {/* Manual code entry */}
      <form onSubmit={handleSubmit} className="mb-6">
        <p className="text-sm text-text-secondary mb-3">
          Or enter the verification code from the email:
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            placeholder="Enter verification code"
            className="flex-1 px-4 py-3 rounded-xl border border-border bg-surface text-text-primary placeholder:text-text-tertiary focus:border-primary transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !verificationCode.trim()}
            className={`
              px-6 py-3 rounded-xl font-medium text-white
              transition-all duration-200
              ${
                isLoading || !verificationCode.trim()
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-primary hover:bg-primary-hover'
              }
            `}
          >
            {isLoading ? 'Verifying...' : 'Verify'}
          </button>
        </div>
      </form>

      {/* Error message */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl mb-6">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Resend button */}
      <div className="text-center">
        <p className="text-sm text-text-secondary mb-3">
          Didn't receive the email? Check your spam folder or
        </p>
        <button
          onClick={handleResend}
          disabled={isLoading || resendCooldown > 0}
          className={`
            inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            transition-colors
            ${
              resendCooldown > 0
                ? 'text-text-tertiary cursor-not-allowed'
                : 'text-primary hover:bg-primary/10'
            }
          `}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          {resendCooldown > 0
            ? `Resend in ${resendCooldown}s`
            : isLoading
            ? 'Sending...'
            : 'Resend verification email'}
        </button>
      </div>

      {/* Back link */}
      <p className="text-center mt-8 text-sm text-text-secondary">
        <button
          onClick={() => navigate('/onboarding/register')}
          className="text-primary hover:underline"
        >
          &larr; Back to registration
        </button>
      </p>
    </div>
  );
};

export default EmailVerificationPage;
