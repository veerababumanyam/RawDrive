/**
 * Payment Page
 * Payment step in the onboarding flow using Stripe Elements
 * Feature: Automated Onboarding System
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Lock, Shield, Check } from 'lucide-react';
import { useOnboarding } from '../../contexts/OnboardingContext';

// ============================================================================
// Helper Functions
// ============================================================================

function formatCurrency(amount: number, currency: string): string {
  // Amount is in smallest currency unit (cents/paise)
  const displayAmount = amount / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(displayAmount);
}

// ============================================================================
// Order Summary Component
// ============================================================================

interface OrderSummaryProps {
  planName: string;
  billingInterval: 'monthly' | 'annual';
  amount: number;
  currency: string;
}

const OrderSummary: React.FC<OrderSummaryProps> = ({
  planName,
  billingInterval,
  amount,
  currency,
}) => {
  const isAnnual = billingInterval === 'annual';

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <h3 className="text-lg font-semibold text-text-primary mb-4">
        Order Summary
      </h3>

      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-text-secondary">{planName} Plan</span>
          <span className="text-text-primary font-medium">
            {formatCurrency(amount, currency)}
          </span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-text-tertiary">Billing cycle</span>
          <span className="text-text-secondary">
            {isAnnual ? 'Annual' : 'Monthly'}
          </span>
        </div>

        {isAnnual && (
          <div className="flex justify-between text-sm">
            <span className="text-text-tertiary">Monthly equivalent</span>
            <span className="text-text-secondary">
              {formatCurrency(Math.round(amount / 12), currency)}/mo
            </span>
          </div>
        )}

        <div className="border-t border-border pt-3 mt-3">
          <div className="flex justify-between text-lg font-semibold">
            <span className="text-text-primary">Total today</span>
            <span className="text-primary">
              {formatCurrency(amount, currency)}
            </span>
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            You'll be charged {formatCurrency(amount, currency)} every{' '}
            {isAnnual ? 'year' : 'month'}
          </p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Security Badges
// ============================================================================

const SecurityBadges: React.FC = () => (
  <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-text-tertiary">
    <div className="flex items-center gap-1.5">
      <Lock className="w-3.5 h-3.5" />
      <span>SSL Encrypted</span>
    </div>
    <div className="flex items-center gap-1.5">
      <Shield className="w-3.5 h-3.5" />
      <span>PCI Compliant</span>
    </div>
    <div className="flex items-center gap-1.5">
      <CreditCard className="w-3.5 h-3.5" />
      <span>Secure Payments by Stripe</span>
    </div>
  </div>
);

// ============================================================================
// Main Page Component
// ============================================================================

export const PaymentPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    session,
    selectedPlan,
    createPaymentIntent,
    confirmPayment,
    isLoading,
    error,
  } = useOnboarding();

  const [paymentIntent, setPaymentIntent] = useState<{
    client_secret: string;
    payment_intent_id: string;
    amount: number;
    currency: string;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Redirect if prerequisites not met
  useEffect(() => {
    if (!session) {
      navigate('/onboarding/plans');
      return;
    }

    if (!session.email_verified) {
      navigate('/onboarding/verify-email');
      return;
    }

    if (!session.plan_id) {
      navigate('/onboarding/plans');
    }
  }, [session, navigate]);

  // Create payment intent on mount
  useEffect(() => {
    const initPayment = async () => {
      try {
        const intent = await createPaymentIntent();
        setPaymentIntent(intent);
      } catch {
        // Error handled by context
      }
    };

    if (session?.email_verified && session?.plan_id && !paymentIntent) {
      initPayment();
    }
  }, [session, createPaymentIntent, paymentIntent]);

  const handlePayment = async () => {
    if (!paymentIntent) return;

    setIsProcessing(true);
    setPaymentError(null);

    try {
      // In a real implementation, this would use Stripe.js to handle the payment
      // For now, we simulate a successful payment
      // const stripe = await loadStripe(STRIPE_PUBLISHABLE_KEY);
      // const result = await stripe.confirmPayment(...)

      // Confirm payment with backend
      await confirmPayment({
        payment_intent_id: paymentIntent.payment_intent_id,
      });

      navigate('/onboarding/setup');
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!selectedPlan || !session) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-text-primary mb-2">
          Complete your purchase
        </h1>
        <p className="text-text-secondary">
          Enter your payment details to start using RawDrive
        </p>
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        {/* Payment form - takes more space */}
        <div className="md:col-span-3">
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Payment Details
            </h3>

            {/* Stripe Elements would go here */}
            {/* For demo, showing placeholder card form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  Card number
                </label>
                <div className="px-4 py-3 rounded-xl border border-border bg-background text-text-tertiary">
                  4242 4242 4242 4242 (test card)
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">
                    Expiry date
                  </label>
                  <div className="px-4 py-3 rounded-xl border border-border bg-background text-text-tertiary">
                    12/25
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1.5">
                    CVC
                  </label>
                  <div className="px-4 py-3 rounded-xl border border-border bg-background text-text-tertiary">
                    123
                  </div>
                </div>
              </div>
            </div>

            {/* Error message */}
            {(error || paymentError) && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error || paymentError}
                </p>
              </div>
            )}

            {/* Pay button */}
            <button
              onClick={handlePayment}
              disabled={isLoading || isProcessing || !paymentIntent}
              className={`
                w-full mt-6 py-3 rounded-xl font-semibold text-white
                transition-all duration-200 flex items-center justify-center gap-2
                ${
                  isLoading || isProcessing || !paymentIntent
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-primary hover:bg-primary-hover shadow-lg hover:shadow-xl'
                }
              `}
            >
              {isLoading || isProcessing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Pay {paymentIntent ? formatCurrency(paymentIntent.amount, paymentIntent.currency) : '...'}
                </>
              )}
            </button>
          </div>

          {/* Security badges */}
          <div className="mt-4">
            <SecurityBadges />
          </div>
        </div>

        {/* Order summary */}
        <div className="md:col-span-2">
          <OrderSummary
            planName={selectedPlan.name}
            billingInterval={session.billing_interval}
            amount={paymentIntent?.amount || 0}
            currency={paymentIntent?.currency || selectedPlan.currency}
          />

          {/* Plan features preview */}
          <div className="mt-4 bg-surface border border-border rounded-xl p-4">
            <h4 className="text-sm font-medium text-text-primary mb-3">
              What you get
            </h4>
            <ul className="space-y-2">
              {selectedPlan.feature_bullets?.slice(0, 4).map((feature, index) => (
                <li key={index} className="flex items-start gap-2 text-xs">
                  <Check className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-text-secondary">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Money-back guarantee */}
          <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
            <p className="text-sm text-green-800 dark:text-green-200 font-medium">
              30-day money-back guarantee
            </p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              Not satisfied? Get a full refund within 30 days.
            </p>
          </div>
        </div>
      </div>

      {/* Back link */}
      <p className="text-center mt-8 text-sm text-text-secondary">
        <button
          onClick={() => navigate('/onboarding/plans')}
          className="text-primary hover:underline"
        >
          &larr; Change plan
        </button>
      </p>
    </div>
  );
};

export default PaymentPage;
