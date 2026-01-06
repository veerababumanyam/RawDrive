/**
 * Onboarding Layout Component
 * Provides the wrapper layout for all onboarding pages with progress indicator
 * Feature: Automated Onboarding System
 */

import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Check, Camera } from 'lucide-react';
import { useOnboarding, OnboardingProvider } from '../../contexts/OnboardingContext';
import type { OnboardingStep } from '../../services/onboardingService';

// ============================================================================
// Step Configuration
// ============================================================================

interface StepConfig {
  id: OnboardingStep;
  label: string;
  path: string;
}

const STEPS: StepConfig[] = [
  { id: 'plan_selection', label: 'Choose Plan', path: '/onboarding/plans' },
  { id: 'registration', label: 'Create Account', path: '/onboarding/register' },
  { id: 'email_verification', label: 'Verify Email', path: '/onboarding/verify-email' },
  { id: 'payment', label: 'Payment', path: '/onboarding/payment' },
  { id: 'workspace_setup', label: 'Setup', path: '/onboarding/setup' },
];

// ============================================================================
// Progress Steps Component
// ============================================================================

interface ProgressStepsProps {
  currentStep: OnboardingStep;
  stepsCompleted: Record<OnboardingStep, boolean>;
}

const ProgressSteps: React.FC<ProgressStepsProps> = ({ currentStep, stepsCompleted }) => {
  const location = useLocation();

  const getStepStatus = (step: StepConfig): 'completed' | 'current' | 'upcoming' => {
    if (stepsCompleted[step.id]) return 'completed';
    if (currentStep === step.id || location.pathname === step.path) return 'current';
    return 'upcoming';
  };

  return (
    <nav aria-label="Onboarding progress" className="mb-8">
      <ol className="flex items-center justify-center">
        {STEPS.map((step, index) => {
          const status = getStepStatus(step);
          const isLast = index === STEPS.length - 1;

          return (
            <li key={step.id} className="flex items-center">
              {/* Step circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm
                    transition-all duration-200
                    ${
                      status === 'completed'
                        ? 'bg-primary text-white'
                        : status === 'current'
                        ? 'bg-primary/10 border-2 border-primary text-primary'
                        : 'bg-surface-hover text-text-tertiary'
                    }
                  `}
                >
                  {status === 'completed' ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`
                    mt-2 text-xs font-medium hidden sm:block
                    ${status === 'current' ? 'text-primary' : 'text-text-secondary'}
                  `}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={`
                    w-12 sm:w-20 h-0.5 mx-2
                    ${stepsCompleted[step.id] ? 'bg-primary' : 'bg-surface-hover'}
                  `}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

// ============================================================================
// Layout Content
// ============================================================================

const OnboardingLayoutContent: React.FC = () => {
  const { session, currentStep, isLoading, error, clearError } = useOnboarding();

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface to-background">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-text-primary">RawDrive</span>
          </Link>

          <Link
            to="/signin"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </header>

      {/* Progress indicator */}
      {session && (
        <div className="max-w-3xl mx-auto px-4 pt-8">
          <ProgressSteps
            currentStep={currentStep}
            stepsCompleted={session.steps_completed}
          />
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="max-w-3xl mx-auto px-4 mb-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start justify-between">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            <button
              onClick={clearError}
              className="text-red-600 hover:text-red-800 ml-4"
              aria-label="Dismiss error"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-4 py-8 pb-24">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-surface/50 py-6">
        <div className="max-w-5xl mx-auto px-4 text-center text-sm text-text-tertiary">
          <p>
            By continuing, you agree to our{' '}
            <Link to="/legal/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/legal/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
};

// ============================================================================
// Main Layout with Provider
// ============================================================================

export const OnboardingLayout: React.FC = () => {
  return (
    <OnboardingProvider>
      <OnboardingLayoutContent />
    </OnboardingProvider>
  );
};

export default OnboardingLayout;
