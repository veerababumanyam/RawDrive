"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/api/authFetch";
import { ConsoleTabs, type ConsolePayload } from "@/components/streams/ConsoleTabs";
import { BackButton } from "@/components/ui/back-button";

export default function StreamConsolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [payload, setPayload] = useState<ConsolePayload | null>(null);
  const [error, setError] = useState<"forbidden" | "notfound" | "generic" | null>(null);

  useEffect(() => {
    authFetch(`/api/v1/streaming/streams/${id}/console`)
      .then(async (res) => {
        if (res.status === 401) {
          router.replace(`/login?next=/streams/${id}`);
          return;
        }
        if (res.status === 403) { setError("forbidden"); return; }
        if (res.status === 404) { setError("notfound"); return; }
        if (!res.ok) { setError("generic"); return; }
        setPayload(await res.json() as ConsolePayload);
      })
      .catch(() => setError("generic"));
  }, [id, router]);

  if (error === "forbidden") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
          <h1 className="mb-2 text-xl font-semibold">Access denied</h1>
          <p className="text-sm text-white/70">
            You do not have permission to view this stream console. Contact your workspace owner.
          </p>
        </div>
      </main>
    );
  }

  if (error === "notfound") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
          <h1 className="mb-2 text-xl font-semibold">Stream not found</h1>
          <p className="text-sm text-white/70">This stream does not exist or has been deleted.</p>
        </div>
      </main>
    );
  }

  if (error === "generic") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
          <h1 className="mb-2 text-xl font-semibold">Unable to load stream</h1>
          <p className="text-sm text-white/70">Please try again in a moment.</p>
        </div>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="text-white/50 text-sm">Loading stream console…</div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-6">
        <BackButton href="/streams" label="Back to streams" />
      </div>
      <ConsoleTabs payload={payload} />
    </main>
  );
}
