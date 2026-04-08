import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CRM & Contracts | RawDrive",
  description: "Manage your client base, seal the deal with secure electronic contracts, and simplify GST-ready billing.",
};

export default function CRMContractsPage() {
  return (
    <section className="bg-surface px-4 py-20 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
          CRM & Business Documents
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
          Organize your entire business lifecycle: from leads turning into bookings, to electronic contract execution and compliance handling.
        </p>
      </div>
    </section>
  );
}
