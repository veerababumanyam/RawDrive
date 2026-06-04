"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "@/components/icons";

interface BackButtonProps {
  href?: string;
  label?: string;
}

export function BackButton({ href, label = "Go back" }: BackButtonProps) {
  const router = useRouter();
  const cls =
    "touch-min inline-flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";

  if (href) {
    return (
      <Link href={href} className={cls}>
        <ChevronLeft className="h-4 w-4" />
        {label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => router.back()} className={cls}>
      <ChevronLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
