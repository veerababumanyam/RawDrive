import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";

import { ConsoleTabs, type ConsolePayload } from "@/components/streams/ConsoleTabs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

async function fetchConsole(id: string, cookieHeader: string): Promise<Response> {
  return fetch(`${API_BASE}/api/v1/streaming/streams/${id}/console`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Cookie: cookieHeader,
    },
    credentials: "include",
    cache: "no-store",
  });
}

export default async function StreamConsolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  let res: Response;
  try {
    res = await fetchConsole(id, cookieHeader);
  } catch {
    notFound();
  }

  if (res.status === 401) {
    redirect(`/login?next=/streams/${id}`);
  }
  if (res.status === 404) {
    notFound();
  }
  if (res.status === 403) {
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
  if (!res.ok) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/80">
          <h1 className="mb-2 text-xl font-semibold">Unable to load stream</h1>
          <p className="text-sm text-white/70">Please try again in a moment.</p>
        </div>
      </main>
    );
  }

  const payload = (await res.json()) as ConsolePayload;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <ConsoleTabs payload={payload} />
    </main>
  );
}
