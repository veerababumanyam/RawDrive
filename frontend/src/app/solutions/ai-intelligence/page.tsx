import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Intelligence & FaceID | RawDrive",
  description: "Smart culling, Face recognition, and AI-assisted workflows for professional photographers.",
};

export default function AIIngelligencePage() {
  return (
    <section className="bg-surface px-4 py-20 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
          AI Culling & FaceID Verification
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
          Leverage the power of FaceID to instantly find subjects and use advanced AI models to quickly cull thousands of raw files, picking only the best.
        </p>
      </div>
    </section>
  );
}
