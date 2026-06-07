import type { Metadata } from "next";
import { SafeEmailLink } from "@/components/marketing/SafeEmailLink";
import { RAWDRIVE_CONTACT_EMAILS, safeEmailDisplay } from "@/lib/contact-email";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("refund");

// Single source for the policy date so the header line and the in-body
// "Last updated" reference never drift apart. Bump these when the policy text
// actually changes — do not derive from the render time, which would falsely
// imply the policy was revised on every page view.
const LAST_UPDATED = "April 2026";
const EFFECTIVE_DATE = "April 2026";
const SUPPORT_EMAIL = RAWDRIVE_CONTACT_EMAILS.support;
const CONTACTUS_EMAIL = RAWDRIVE_CONTACT_EMAILS.contactus;
const SUPPORT_DISPLAY = safeEmailDisplay(SUPPORT_EMAIL);
const CONTACTUS_DISPLAY = safeEmailDisplay(CONTACTUS_EMAIL);

const sections = [
  {
    title: "1. Overview",
    content:
      "RawDrive offers a fair refund policy to ensure customer satisfaction. This policy applies to all paid subscriptions and add-on purchases made through the RawDrive platform at rawdrive.in.",
  },
  {
    title: "2. 7-Day Refund Guarantee",
    content:
      "If you are not satisfied with your paid subscription, you may request a full refund within 7 days of your initial purchase. This applies to first-time purchases of any recurring paid plan (Creator, Pro Photographer, Studio). The refund guarantee does not apply to renewals or plan changes.",
  },
  {
    title: "3. Eligible Refunds",
    content:
      "Refunds are available for: first-time subscription purchases within 7 days, billing errors or duplicate charges, service unavailability exceeding our SLA commitments, and unauthorized transactions reported within 48 hours. Storage booster packs and streaming session packs are refundable if unused within 7 days of purchase.",
  },
  {
    title: "4. Non-Refundable Items",
    content:
      "The following are not eligible for refunds: subscription renewals (monthly or annual), partially used streaming session packs, custom Elite Studio plan fees after onboarding begins, add-ons after 7 days of purchase, and accounts terminated for Terms of Service violations.",
  },
  {
    title: "5. How to Request a Refund",
    content: `To request a refund, email ${SUPPORT_DISPLAY} with your account email, transaction ID, and reason for the refund. You may also submit a request through your account dashboard under Settings > Billing > Request Refund. We aim to acknowledge all refund requests within 24 hours.`,
  },
  {
    title: "6. Refund Processing",
    content:
      "Approved refunds are processed within 5-7 business days. Refunds are credited to the original payment method (UPI, card, or bank account). You will receive an email confirmation once the refund is processed. GST paid on the original transaction will also be refunded.",
  },
  {
    title: "7. Account Status After Refund",
    content:
      "Upon refund approval, your account will be downgraded to the Starter plan. Your data will be preserved but access to paid features will be restricted. If you exceed Starter limits, you will need to manage your content within the plan's storage and gallery limits within 30 days.",
  },
  {
    title: "8. Contact Information",
    content: `For refund inquiries, contact our support team at ${SUPPORT_DISPLAY}. For escalations, contact our Customer Success team at ${CONTACTUS_DISPLAY}. Last updated: ${LAST_UPDATED}.`,
  },
];

export default function RefundPage() {
  return (
    <div className="bg-surface px-4 py-16 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-text-primary">Refund Policy</h1>
        <p className="mt-2 text-sm text-text-tertiary">
          Last updated: {LAST_UPDATED} | Effective: {EFFECTIVE_DATE}
        </p>
        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold text-text-primary">
                {section.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                {section.content}
              </p>
            </section>
          ))}
        </div>
        <div className="mt-12 rounded-xl border border-border bg-surface-elevated p-6">
          <p className="text-sm text-text-secondary">
            Need help with a refund? Contact{" "}
            <SafeEmailLink
              localPart={SUPPORT_EMAIL.localPart}
              domain={SUPPORT_EMAIL.domain}
              className="text-accent hover:text-accent-hover"
              ariaLabel="Email RawDrive support"
            >
              {(display) => display}
            </SafeEmailLink>
          </p>
        </div>
      </div>
    </div>
  );
}
