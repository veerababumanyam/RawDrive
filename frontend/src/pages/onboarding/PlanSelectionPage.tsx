/**
 * Plan Selection Page
 * First step of onboarding - user selects their subscription plan
 * Feature: Automated Onboarding System
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Zap, Crown, Building } from 'lucide-react';
import { useOnboarding } from '../../contexts/OnboardingContext';
import type { OnboardingPlan } from '../../services/onboardingService';

// ============================================================================
// Helper Functions
// ============================================================================

function formatStorage(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1000 ? `${(gb / 1000).toFixed(0)} TB` : `${gb.toFixed(0)} GB`;
}

function formatLimit(value: number): string {
  return value === -1 ? 'Unlimited' : value.toString();
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getPlanIcon(code: string) {
  switch (code) {
    case 'starter':
      return <Zap className="w-6 h-6" />;
    case 'professional':
      return <Crown className="w-6 h-6" />;
    case 'studio':
    case 'enterprise':
      return <Building className="w-6 h-6" />;
    default:
      return <Zap className="w-6 h-6" />;
  }
}

// ============================================================================
// Plan Card Component
// ============================================================================

interface PlanCardProps {
  plan: OnboardingPlan;
  isAnnual: boolean;
  isSelected: boolean;
  onSelect: () => void;
}

const PlanCard: React.FC<PlanCardProps> = ({ plan, isAnnual, isSelected, onSelect }) => {
  const price = isAnnual ? (plan.price_annual || plan.price_monthly * 12) : plan.price_monthly;
  const monthlyEquivalent = isAnnual
    ? Math.round((plan.price_annual || plan.price_monthly * 12) / 12)
    : plan.price_monthly;

  const savings = isAnnual && plan.price_annual
    ? Math.round(((plan.price_monthly * 12 - plan.price_annual) / (plan.price_monthly * 12)) * 100)
    : 0;

  const isHighlighted = !!plan.highlight_label;

  return (
    <div
      className={`
        relative rounded-2xl border-2 p-6 transition-all duration-200 cursor-pointer
        ${
          isSelected
            ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
            : isHighlighted
            ? 'border-primary/50 bg-surface hover:border-primary hover:shadow-lg'
            : 'border-border bg-surface hover:border-primary/30 hover:shadow-lg'
        }
      `}
      onClick={onSelect}
      role="radio"
      aria-checked={isSelected}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
    >
      {/* Highlight badge */}
      {plan.highlight_label && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-3 py-1 bg-primary text-white text-xs font-semibold rounded-full">
            {plan.highlight_label}
          </span>
        </div>
      )}

      {/* Selection indicator */}
      <div
        className={`
          absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center
          ${isSelected ? 'border-primary bg-primary' : 'border-border'}
        `}
      >
        {isSelected && <Check className="w-4 h-4 text-white" />}
      </div>

      {/* Plan header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`
            w-12 h-12 rounded-xl flex items-center justify-center
            ${isSelected ? 'bg-primary text-white' : 'bg-primary/10 text-primary'}
          `}
        >
          {getPlanIcon(plan.code)}
        </div>
        <div>
          <h3 className="text-lg font-semibold text-text-primary">{plan.name}</h3>
          {plan.description && (
            <p className="text-sm text-text-secondary">{plan.description}</p>
          )}
        </div>
      </div>

      {/* Pricing */}
      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-text-primary">
            {formatCurrency(monthlyEquivalent, plan.currency)}
          </span>
          <span className="text-text-secondary">/mo</span>
        </div>
        {isAnnual && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-text-secondary">
              {formatCurrency(price, plan.currency)} billed annually
            </span>
            {savings > 0 && (
              <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                Save {savings}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* Features */}
      <ul className="space-y-3">
        {plan.feature_bullets?.length > 0 ? (
          plan.feature_bullets.map((feature, index) => (
            <li key={index} className="flex items-start gap-2 text-sm">
              <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <span className="text-text-secondary">{feature}</span>
            </li>
          ))
        ) : (
          <>
            <li className="flex items-start gap-2 text-sm">
              <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <span className="text-text-secondary">
                {formatStorage(plan.storage_bytes)} storage
              </span>
            </li>
            <li className="flex items-start gap-2 text-sm">
              <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <span className="text-text-secondary">
                {formatLimit(plan.max_galleries)} galleries
              </span>
            </li>
            <li className="flex items-start gap-2 text-sm">
              <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <span className="text-text-secondary">
                {formatLimit(plan.max_clients)} clients
              </span>
            </li>
            <li className="flex items-start gap-2 text-sm">
              <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <span className="text-text-secondary">
                {plan.ai_credits_monthly} AI credits/mo
              </span>
            </li>
          </>
        )}
      </ul>
    </div>
  );
};

// ============================================================================
// Main Page Component
// ============================================================================

export const PlanSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const { plans, session, selectPlan, startOnboarding, isLoading } = useOnboarding();

  const [isAnnual, setIsAnnual] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    session?.plan_id || null
  );

  // Start session if not exists
  useEffect(() => {
    if (!session) {
      startOnboarding();
    }
  }, [session, startOnboarding]);

  const handleContinue = async () => {
    if (!selectedPlanId) return;

    try {
      await selectPlan({
        plan_id: selectedPlanId,
        billing_interval: isAnnual ? 'annual' : 'monthly',
      });
      navigate('/onboarding/register');
    } catch {
      // Error handled by context
    }
  };

  const activePlans = plans.filter((p) => p.code !== 'free');

  return (
    <div>
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-text-primary mb-2">
          Choose your plan
        </h1>
        <p className="text-lg text-text-secondary">
          Select the perfect plan for your photography business
        </p>
      </div>

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <span
          className={`text-sm font-medium ${!isAnnual ? 'text-text-primary' : 'text-text-secondary'}`}
        >
          Monthly
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isAnnual}
          onClick={() => setIsAnnual(!isAnnual)}
          className={`
            relative w-14 h-7 rounded-full transition-colors duration-200
            ${isAnnual ? 'bg-primary' : 'bg-surface-hover'}
          `}
        >
          <span
            className={`
              absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm
              transition-transform duration-200
              ${isAnnual ? 'translate-x-7' : 'translate-x-0'}
            `}
          />
        </button>
        <span
          className={`text-sm font-medium ${isAnnual ? 'text-text-primary' : 'text-text-secondary'}`}
        >
          Annual
        </span>
        <span className="text-xs text-green-600 font-medium bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full">
          Save up to 20%
        </span>
      </div>

      {/* Plans grid */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {activePlans.map((plan) => (
          <PlanCard
            key={plan.plan_id}
            plan={plan}
            isAnnual={isAnnual}
            isSelected={selectedPlanId === plan.plan_id}
            onSelect={() => setSelectedPlanId(plan.plan_id)}
          />
        ))}
      </div>

      {/* Continue button */}
      <div className="flex justify-center">
        <button
          onClick={handleContinue}
          disabled={!selectedPlanId || isLoading}
          className={`
            px-8 py-3 rounded-xl font-semibold text-white
            transition-all duration-200
            ${
              selectedPlanId && !isLoading
                ? 'bg-primary hover:bg-primary-hover shadow-lg hover:shadow-xl'
                : 'bg-gray-300 cursor-not-allowed'
            }
          `}
        >
          {isLoading ? 'Processing...' : 'Continue'}
        </button>
      </div>

      {/* Features comparison link */}
      <p className="text-center mt-6 text-sm text-text-secondary">
        Need help choosing?{' '}
        <a href="/pricing" className="text-primary hover:underline">
          Compare all features
        </a>
      </p>
    </div>
  );
};

export default PlanSelectionPage;
