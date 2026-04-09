"use client";

import { Download } from "lucide-react";

export default function DownloadsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight text-text-primary">
          Downloads
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Approved photos ready for download.
        </p>
      </div>
      <div className="glass-card flex flex-col items-center gap-4 rounded-2xl p-12 text-center">
        <Download className="h-12 w-12 text-text-tertiary" />
        <p className="text-sm text-text-tertiary">
          Your approved and downloadable photos will appear here.
        </p>
      </div>
    </div>
  );
}
