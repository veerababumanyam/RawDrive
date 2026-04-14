import { InviteGenerator } from "@/components/streams/InviteGenerator";

export default async function StreamInvitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-xl font-semibold text-white/90">Invite viewers</h1>
      <InviteGenerator streamId={id} />
    </main>
  );
}
