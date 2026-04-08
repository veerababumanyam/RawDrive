import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Partner Dealership Program | RawDrive",
  description: "Become a state dealer to help scale RawDrive's operations and earn passive commissions.",
};

export default function DealershipPage() {
  return (
    <section className="bg-surface px-4 py-20 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
          Statewide Dealership Program
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
          Own a territory. Generate leads, facilitate onboarding, and run community events while earning robust, automated margin-sharing.
        </p>
      </div>
    </section>
  );
}
