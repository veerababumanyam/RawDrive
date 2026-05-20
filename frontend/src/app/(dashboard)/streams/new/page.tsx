"use client";

import { CreateStreamForm } from "@/components/streams/CreateStreamForm";
import { BackButton } from "@/components/ui/back-button";

export default function NewStreamPage() {
  return (
    <div className="px-4 py-8">
      <div className="max-w-2xl mx-auto mb-4">
        <BackButton href="/streams" label="Back to streams" />
      </div>
      <h1 className="max-w-2xl mx-auto text-2xl font-semibold text-text-primary mb-6">
        Create live stream
      </h1>
      <CreateStreamForm />
    </div>
  );
}
