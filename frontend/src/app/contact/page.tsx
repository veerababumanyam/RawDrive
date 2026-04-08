import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us | RawDrive",
  description: "Get in touch with the RawDrive support and sales teams.",
};

export default function ContactPage() {
  return (
    <section className="bg-surface px-4 py-20 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
          Contact RawDrive
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
          Find out how we can help your studio streamline its operations, or request technical support.
        </p>
      </div>
    </section>
  );
}
