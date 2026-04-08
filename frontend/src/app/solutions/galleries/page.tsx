import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client Galleries & Portfolios | RawDrive",
  description: "Deliver stunning, branded galleries directly to your clients with PWAs.",
};

export default function ClientGalleriesPage() {
  return (
    <section className="bg-surface px-4 py-20 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
          Client Galleries & Portfolios
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
          Deliver stunning, branded galleries to your clients. Our Progressive Web App (PWA) client experience sets the standard for modern delivery.
        </p>
      </div>
    </section>
  );
}
