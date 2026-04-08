import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us | RawDrive",
  description: "Learn more about RawDrive and our mission to transform photography business operations.",
};

export default function AboutPage() {
  return (
    <section className="bg-surface px-4 py-20 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
          Our Team
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
          Meet the team dedicated to building out India's most capable operating system for the photography industry.
        </p>
      </div>
    </section>
  );
}
