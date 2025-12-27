import { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import LegalPageLayout from '../../../components/legal/LegalPageLayout';
import { AppButton } from '../../../components/ui/AppButton';
import policies from '../../../data/policies/terms';

export default function AcceptancePage() {
  const [accepted, setAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAccept = async () => {
    if (!accepted || submitted) return;

    setIsSubmitting(true);

    // Simulate API call - TODO: Integrate with backend to record acceptance
    await new Promise(resolve => setTimeout(resolve, 500));

    setSubmitted(true);
    setIsSubmitting(false);
  };

  return (
    <LegalPageLayout policy={policies}>
      <div className="max-w-xl mx-auto my-8 p-6 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-white/10 shadow-lg">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
          Accept Terms and Conditions
        </h2>
        <p className="text-slate-700 dark:text-slate-300 mb-6">
          Please review and accept the latest Terms and Conditions to continue using RawDrive.
        </p>

        {/* Checkbox with proper touch target */}
        <div className="flex items-start mb-6">
          <div className="flex items-center h-6">
            <input
              id="accept-terms"
              name="accept-terms"
              type="checkbox"
              checked={accepted}
              onChange={e => setAccepted(e.target.checked)}
              disabled={submitted}
              aria-describedby="terms-description"
              className="
                w-5 h-5 rounded border-2 border-slate-300 dark:border-slate-600
                text-primary-600
                focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
                cursor-pointer
              "
            />
          </div>
          <label
            htmlFor="accept-terms"
            className="ml-3 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none min-h-[44px] flex items-center"
          >
            I have read and accept the Terms and Conditions
          </label>
        </div>
        <p id="terms-description" className="sr-only">
          By checking this box, you agree to be bound by our Terms and Conditions.
        </p>

        {/* Button using design system */}
        <AppButton
          variant="primary"
          size="lg"
          onClick={handleAccept}
          disabled={!accepted || submitted || isSubmitting}
          aria-busy={isSubmitting}
          className="w-full sm:w-auto min-w-[160px]"
        >
          {isSubmitting ? (
            <>
              <span className="animate-spin mr-2">⏳</span>
              Processing...
            </>
          ) : submitted ? (
            <>
              <CheckCircle className="w-5 h-5 mr-2" aria-hidden="true" />
              Accepted
            </>
          ) : (
            'Accept Terms'
          )}
        </AppButton>

        {/* Success message with ARIA live region */}
        {submitted && (
          <div
            role="status"
            aria-live="polite"
            className="mt-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-3"
          >
            <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" aria-hidden="true" />
            <p className="text-emerald-700 dark:text-emerald-300 text-sm">
              Thank you for accepting the Terms and Conditions. You can now continue using RawDrive.
            </p>
          </div>
        )}
      </div>
    </LegalPageLayout>
  );
}
