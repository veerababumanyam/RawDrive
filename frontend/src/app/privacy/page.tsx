import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("privacy");

// Single source for the policy date so the header line and the in-body
// "Last updated" reference never drift apart. Bump these when the policy text
// actually changes — do not derive from the render time, which would falsely
// imply the policy was revised on every page view.
const LAST_UPDATED = "April 2026";
const EFFECTIVE_DATE = "April 2026";

const sections = [
  {
    title: "1. Introduction",
    content:
      'RawDrive ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform at rawdrive.in. This policy complies with the Digital Personal Data Protection Act, 2023 (DPDPA) of India and the General Data Protection Regulation (GDPR) of the European Union.',
  },
  {
    title: "2. Information We Collect",
    content:
      "We collect information you provide directly: name, email address, phone number, business details, payment information, and photographs uploaded to our platform. We also collect usage data automatically: IP address, device type, browser information, pages visited, and interaction patterns through cookies and similar technologies.",
  },
  {
    title: "3. How We Use Your Information",
    content:
      "We use your information to: provide and maintain our services, process transactions and payments, send service-related communications, improve our platform and user experience, provide customer support, comply with legal obligations, and detect and prevent fraud or abuse.",
  },
  {
    title: "4. Legal Basis for Processing (GDPR)",
    content:
      "Under GDPR, we process your data based on: consent (for marketing communications), contractual necessity (to provide our services), legitimate interests (to improve our platform), and legal obligations (tax and regulatory compliance). You may withdraw consent at any time without affecting the lawfulness of prior processing.",
  },
  {
    title: "5. Purpose Limitation (DPDPA)",
    content:
      "Under the DPDPA, we process your digital personal data only for the specific purposes stated in this policy. We will not process your data for purposes beyond what is necessary to provide our services unless we obtain your explicit consent.",
  },
  {
    title: "6. Data Storage and Security",
    content:
      "All data is stored in Indian data centers (Mumbai region) using encrypted storage. We implement industry-standard security measures including TLS encryption in transit, AES-256 encryption at rest, regular security audits, and access controls. We retain your data for as long as your account is active or as needed to provide services.",
  },
  {
    title: "7. Data Sharing and Disclosure",
    content:
      "We do not sell your personal data. We may share data with: payment processors (Razorpay) to process transactions, cloud infrastructure providers for hosting, analytics services (anonymized data only), and law enforcement when required by Indian law. All third-party processors are bound by data processing agreements.",
  },
  {
    title: "8. Your Rights (DPDPA)",
    content:
      "Under the DPDPA, you have the right to: access your personal data, correct inaccurate data, erase your data (right to be forgotten), withdraw consent, and file grievances with our Data Protection Officer. To exercise these rights, contact our DPO at contactus@rawdrive.in.",
  },
  {
    title: "9. Your Rights (GDPR)",
    content:
      "Under the GDPR, you additionally have the right to: data portability, restrict processing, object to processing, and lodge complaints with a supervisory authority. We will respond to all rights requests within 30 days.",
  },
  {
    title: "10. Cookies and Tracking",
    content:
      "We use essential cookies for platform functionality and optional analytics cookies to improve our services. You can manage cookie preferences through your browser settings. Essential cookies cannot be disabled as they are necessary for the platform to function.",
  },
  {
    title: "11. Children's Privacy",
    content:
      "RawDrive is not intended for individuals under 18 years of age. We do not knowingly collect personal data from minors. If you believe we have collected data from a minor, please contact us immediately at contactus@rawdrive.in.",
  },
  {
    title: "12. Changes to This Policy",
    content:
      `We may update this Privacy Policy from time to time. We will notify you of material changes via email or through a prominent notice on our platform. Continued use of our services after changes constitutes acceptance of the updated policy. Last updated: ${LAST_UPDATED}.`,
  },
];

export default function PrivacyPage() {
  return (
    <div className="bg-surface px-4 py-16 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-text-primary">Privacy Policy</h1>
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
          <h2 className="text-lg font-semibold text-text-primary">
            Data Protection Officer
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            For any privacy-related inquiries, contact our DPO at{" "}
            <a
              href="mailto:contactus@rawdrive.in"
              className="text-accent hover:text-accent-hover"
            >
              contactus@rawdrive.in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
