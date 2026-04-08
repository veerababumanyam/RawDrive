import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Freelancer Marketplace | RawDrive",
  description: "Find the best freelancers for your photography studio in one unified marketplace.",
};

export default function FreelancerMarketplacePage() {
  return (
    <section className="bg-surface px-4 py-20 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
          Freelancer Marketplace
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
          Scale your studio team on demand by finding vetted associates, lead operators, and retouchers tailored to your working style.
        </p>
      </div>
    </section>
  );
}
