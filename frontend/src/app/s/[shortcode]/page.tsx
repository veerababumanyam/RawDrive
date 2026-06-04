import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import {
  resolveShortlink,
  isUuid,
  type ResolvedShortlink,
} from "@/lib/streaming/resolve-shortlink";
import { createNoIndexMetadata } from "@/lib/seo";

export const metadata: Metadata = createNoIndexMetadata(
  "RawDrive short link",
  "Private RawDrive short link redirect.",
);

interface Props {
  params: Promise<{ shortcode: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function pickSrc(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function FallbackCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div
        className={[
          "w-full max-w-sm rounded-2xl p-8 text-center",
          "bg-surface-overlay/10 glass-blur-full",
          "border border-text-media/20",
          "shadow-[0_8px_32px_-4px_hsla(0,0%,0%,0.18)]",
        ].join(" ")}
      >
        <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
        <p className="mt-2 text-sm text-text-secondary">{body}</p>
        <div className="mt-6 flex justify-center">
          <Link href="/" aria-label="Back to home">
            <GlassIconButton label="Back to home" size="md" variant="glass">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 12l9-9 9 9M5 10v10h14V10"
                />
              </svg>
            </GlassIconButton>
          </Link>
        </div>
      </div>
    </div>
  );
}

function renderFallback(kind: ResolvedShortlink["kind"]) {
  switch (kind) {
    case "revoked":
      return (
        <FallbackCard
          title="Link revoked"
          body="This share link has been disabled by the host."
        />
      );
    case "not_found":
      return (
        <FallbackCard
          title="Link not found"
          body="We couldn't find a stream for this link. Check the URL and try again."
        />
      );
    case "rate_limited":
      return (
        <FallbackCard
          title="Slow down a moment"
          body="Too many requests from your network. Please retry in a minute."
        />
      );
    default:
      return (
        <FallbackCard
          title="Something went wrong"
          body="We couldn't open this link right now. Please try again shortly."
        />
      );
  }
}

export default async function ShortlinkPage({ params, searchParams }: Props) {
  const { shortcode } = await params;
  const sp = (await searchParams) ?? {};
  const src = pickSrc(sp.src);

  let forwardedFor: string | null = null;
  try {
    const h = await headers();
    forwardedFor =
      (h as unknown as { get?: (k: string) => string | null }).get?.(
        "x-forwarded-for",
      ) ?? null;
  } catch {
    forwardedFor = null;
  }

  const result = await resolveShortlink(shortcode, src, forwardedFor);

  if (result.kind === "ok") {
    if (!isUuid(result.streamId)) {
      return renderFallback("error");
    }
    redirect(`/stream/${result.streamId}?src=${result.src}`);
  }

  return renderFallback(result.kind);
}
