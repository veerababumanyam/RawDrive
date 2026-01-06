/**
 * Setup Page
 * Final step of onboarding - workspace setup and completion
 * Feature: Automated Onboarding System
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building, Camera, CheckCircle, ArrowRight, Sparkles } from 'lucide-react';
import { useOnboarding } from '../../contexts/OnboardingContext';

// ============================================================================
// Success Animation Component
// ============================================================================

const SuccessAnimation: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="text-center py-8">
      <div className="relative inline-block">
        {/* Animated circles */}
        <div className="absolute inset-0 animate-ping">
          <div className="w-24 h-24 rounded-full bg-green-200/50 dark:bg-green-800/30" />
        </div>
        <div className="relative w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
          <CheckCircle className="w-12 h-12 text-green-600 animate-bounce" />
        </div>
      </div>

      <h2 className="text-2xl font-bold text-text-primary mt-6 mb-2">
        Welcome to RawDrive!
      </h2>
      <p className="text-text-secondary">
        Your workspace is being set up...
      </p>

      <div className="mt-6 flex items-center justify-center gap-2">
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
};

// ============================================================================
// Main Page Component
// ============================================================================

export const SetupPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    session,
    selectedPlan,
    completeOnboarding,
    isLoading,
    error,
  } = useOnboarding();

  const [workspaceName, setWorkspaceName] = useState(
    session?.registration_data?.business_name ||
    session?.registration_data?.full_name ||
    ''
  );
  const [isCompleting, setIsCompleting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Redirect if prerequisites not met
  useEffect(() => {
    if (!session) {
      navigate('/onboarding/plans');
      return;
    }

    if (session.payment_status !== 'succeeded') {
      navigate('/onboarding/payment');
    }
  }, [session, navigate]);

  const handleComplete = async () => {
    setIsCompleting(true);

    try {
      const result = await completeOnboarding({
        workspace_name: workspaceName.trim() || undefined,
      });

      setShowSuccess(true);

      // Redirect after animation
      setTimeout(() => {
        window.location.href = result.redirect_url;
      }, 3000);
    } catch {
      setIsCompleting(false);
      // Error handled by context
    }
  };

  // Show success animation
  if (showSuccess) {
    return (
      <SuccessAnimation
        onComplete={() => window.location.href = '/workspace'}
      />
    );
  }

  return (
    <div className="max-w-md mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-text-primary mb-2">
          Almost there!
        </h1>
        <p className="text-text-secondary">
          Let's set up your workspace
        </p>
      </div>

      {/* Setup form */}
      <div className="space-y-6">
        {/* Workspace name */}
        <div>
          <label htmlFor="workspace_name" className="block text-sm font-medium text-text-primary mb-1.5">
            Workspace name
          </label>
          <div className="relative">
            <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
            <input
              id="workspace_name"
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-surface text-text-primary placeholder:text-text-tertiary focus:border-primary transition-colors"
              placeholder="My Photography Studio"
            />
          </div>
          <p className="mt-1.5 text-xs text-text-tertiary">
            This will be the name of your workspace. You can change it later.
          </p>
        </div>

        {/* Plan summary */}
        {selectedPlan && (
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Camera className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-text-primary">
                  {selectedPlan.name} Plan
                </p>
                <p className="text-sm text-text-secondary">
                  {session?.billing_interval === 'annual' ? 'Annual' : 'Monthly'} billing
                </p>
              </div>
              <CheckCircle className="w-5 h-5 text-green-500" />
            </div>
          </div>
        )}

        {/* Quick tips */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
          <h3 className="font-medium text-text-primary mb-3">
            What's next?
          </h3>
          <ul className="space-y-2 text-sm text-text-secondary">
            <li className="flex items-center gap-2">
              <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center text-xs text-primary font-medium">
                1
              </div>
              Create your first gallery
            </li>
            <li className="flex items-center gap-2">
              <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center text-xs text-primary font-medium">
                2
              </div>
              Upload your photos
            </li>
            <li className="flex items-center gap-2">
              <div className="w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center text-xs text-primary font-medium">
                3
              </div>
              Share with your clients
            </li>
          </ul>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Complete button */}
        <button
          onClick={handleComplete}
          disabled={isLoading || isCompleting}
          className={`
            w-full py-3 rounded-xl font-semibold text-white
            transition-all duration-200 flex items-center justify-center gap-2
            ${
              isLoading || isCompleting
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-primary hover:bg-primary-hover shadow-lg hover:shadow-xl'
            }
          `}
        >
          {isLoading || isCompleting ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Setting up your workspace...
            </>
          ) : (
            <>
              Get started
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default SetupPage;
