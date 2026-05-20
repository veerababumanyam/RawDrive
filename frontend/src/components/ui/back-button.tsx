"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

interface BackButtonProps {
  href?: string;
  label?: string;
}

export function BackButton({ href, label = "Go back" }: BackButtonProps) {
  const router = useRouter();
  const cls =
    "inline-flex items-center gap-1 text-sm text-text-secondary hover:text-on-surface transition-colors";

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
