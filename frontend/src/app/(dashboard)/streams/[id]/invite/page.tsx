import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { InviteGenerator } from "@/components/streams/InviteGenerator";

export default async function StreamInvitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link
        href={`/streams/${id}`}
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-on-surface transition-colors mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to stream
      </Link>
      <h1 className="mb-6 text-xl font-semibold text-white/90">Invite viewers</h1>
      <InviteGenerator streamId={id} />
    </main>
  );
}
