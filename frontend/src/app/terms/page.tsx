import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "RawDrive Terms of Service — governing use of the RawDrive platform.",
};

const sections = [
  {
    title: "1. Acceptance of Terms",
    content:
      "By accessing or using RawDrive (\"the Platform\"), you agree to be bound by these Terms of Service (\"Terms\"). If you do not agree, do not use the Platform. These Terms constitute a legally binding agreement between you and RawDrive.",
  },
  {
    title: "2. Eligibility",
    content:
      "You must be at least 18 years old and capable of forming a binding contract under Indian law to use RawDrive. By registering, you represent that you meet these requirements. Business accounts must be registered by authorized representatives.",
  },
  {
    title: "3. Account Registration",
    content:
      "You must provide accurate, complete information during registration. You are responsible for maintaining the confidentiality of your credentials and for all activity under your account. Notify us immediately of unauthorized access at support@rawdrive.in.",
  },
  {
    title: "4. Service Description",
    content:
      "RawDrive provides photography business management tools including gallery delivery, client proofing, AI-assisted photo culling, CRM, booking management, live streaming, and marketplace features. Features vary by subscription plan. We reserve the right to modify, suspend, or discontinue features with reasonable notice.",
  },
  {
    title: "5. Subscription and Payments",
    content:
      "Paid plans are billed monthly or annually as selected. Prices are in Indian Rupees (INR) and exclusive of GST (18%). Payments are processed via Razorpay. Failed payments may result in service suspension. Plan upgrades take effect immediately; downgrades take effect at the next billing cycle.",
  },
  {
    title: "6. User Content and Intellectual Property",
    content:
      "You retain all rights to photographs and content you upload. By uploading, you grant RawDrive a limited license to store, process, and display your content solely for service provision. We do not claim ownership of your work. You are responsible for ensuring you have rights to all content you upload.",
  },
  {
    title: "7. Acceptable Use",
    content:
      "You must not: upload illegal, defamatory, or infringing content; use the platform for unauthorized commercial purposes; attempt to reverse-engineer or hack the platform; impersonate others; distribute malware; or violate any applicable Indian or international law. We reserve the right to terminate accounts violating these terms.",
  },
  {
    title: "8. Marketplace Disclaimers",
    content:
      "The RawDrive marketplace connects photographers with potential clients. RawDrive acts as a platform facilitator and is not a party to any agreement between photographers and clients. We do not guarantee bookings, revenue, or client quality. Marketplace listings are subject to our content guidelines and quality standards. Disputes between photographers and clients must be resolved directly between the parties.",
  },
  {
    title: "9. AI Culling Disclaimer",
    content:
      "AI culling features use automated algorithms to score and categorize photographs. Results are suggestions only and should be reviewed by a professional. RawDrive is not responsible for any photos incorrectly categorized or deleted through AI culling. Always maintain backup copies of your original photographs.",
  },
  {
    title: "10. Limitation of Liability",
    content:
      "To the maximum extent permitted by Indian law, RawDrive shall not be liable for indirect, incidental, special, or consequential damages, including loss of revenue, data, or business opportunities. Our total liability shall not exceed the amount paid by you in the 12 months preceding the claim.",
  },
  {
    title: "11. Indemnification",
    content:
      "You agree to indemnify and hold harmless RawDrive, its officers, employees, and partners from any claims, damages, or expenses arising from your use of the platform, violation of these Terms, or infringement of third-party rights.",
  },
  {
    title: "12. Governing Law and Dispute Resolution",
    content:
      "These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Bangalore, Karnataka. Before initiating legal proceedings, parties agree to attempt resolution through mediation.",
  },
  {
    title: "13. Changes to Terms",
    content:
      "We may update these Terms from time to time. Material changes will be notified via email or prominent platform notice at least 30 days in advance. Continued use after changes constitutes acceptance. Last updated: April 2026.",
  },
];

export default function TermsPage() {
  return (
    <div className="bg-surface px-4 py-16 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-text-primary">Terms of Service</h1>
        <p className="mt-2 text-sm text-text-tertiary">
          Last updated: April 2026 | Effective: April 2026
        </p>
        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold text-text-primary">{section.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                {section.content}
              </p>
            </section>
          ))}
        </div>
        <div className="mt-12 rounded-xl border border-border bg-surface-elevated p-6">
          <p className="text-sm text-text-secondary">
            Questions about these terms? Contact us at{" "}
            <a href="mailto:legal@rawdrive.in" className="text-accent hover:text-accent-hover">
              legal@rawdrive.in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
