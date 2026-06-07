import type { Metadata } from "next";
import Image from "next/image";
import { SafeEmailLink } from "@/components/marketing/SafeEmailLink";
import { RAWDRIVE_CONTACT_EMAILS } from "@/lib/contact-email";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata("legal");

const legalDetails = [
  { label: "Product brand", value: "RawDrive" },
  { label: "Legal operator", value: "Swaz Consultants Pvt. Ltd." },
  { label: "Jurisdiction", value: "India" },
  { label: "Registered region", value: "Andhra Pradesh, India" },
];

const contactChannels = [
  { label: "Product information", email: RAWDRIVE_CONTACT_EMAILS.info },
  { label: "Support", email: RAWDRIVE_CONTACT_EMAILS.support },
  { label: "General contact", email: RAWDRIVE_CONTACT_EMAILS.contactus },
];

export default function LegalPage() {
  return (
    <div className="bg-surface px-4 py-16 text-text-primary lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="surface-panel p-8 lg:p-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex rounded-full bg-accent-subtle px-4 py-2 text-xs font-bold uppercase tracking-wider text-accent">
                Legal Notice
              </span>
              <h1 className="mt-6 font-headline text-4xl font-extrabold text-text-primary md:text-5xl">
                RawDrive legal operator details
              </h1>
              <p className="mt-5 text-base leading-8 text-text-secondary">
                RawDrive is the product and service brand. Legal notices,
                business identity, and operator details for the platform are
                listed here for compliance and reference.
              </p>
            </div>

            <div className="shrink-0 rounded-2xl border border-border bg-surface-elevated p-4">
              <Image
                src="/swaz-consultants-logo.jpg"
                alt="Swaz Consultants logo"
                width={84}
                height={84}
                className="h-20 w-20 rounded-xl object-cover"
              />
            </div>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {legalDetails.map((detail) => (
              <div
                key={detail.label}
                className="rounded-2xl border border-border bg-surface p-5"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">
                  {detail.label}
                </p>
                <p className="mt-2 text-base font-semibold text-text-primary">
                  {detail.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-border bg-surface-elevated p-8">
          <h2 className="font-headline text-2xl font-bold text-text-primary">
            Official Contacts
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {contactChannels.map((channel) => (
              <SafeEmailLink
                key={channel.label}
                localPart={channel.email.localPart}
                domain={channel.email.domain}
                className="rounded-2xl border border-border bg-surface p-5 transition-colors hover:bg-surface-container-high"
                ariaLabel={`Email RawDrive ${channel.label}`}
              >
                {(display) => (
                  <>
                    <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">
                      {channel.label}
                    </p>
                    <p className="mt-2 break-words text-sm font-semibold text-accent">
                      {display}
                    </p>
                  </>
                )}
              </SafeEmailLink>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
