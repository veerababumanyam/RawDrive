"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import {
  emailAddress,
  mailtoHref,
  safeEmailAriaLabel,
  safeEmailDisplay,
  type RawDriveContactEmail,
} from "@/lib/contact-email";

type SafeEmailLinkChildren =
  | ReactNode
  | ((display: string, hydrated: boolean) => ReactNode);

type SafeEmailLinkProps = RawDriveContactEmail & {
  ariaLabel?: string;
  children?: SafeEmailLinkChildren;
  className?: string;
  fallbackHref?: string;
  subject?: string;
};

export function SafeEmailLink({
  ariaLabel,
  children,
  className,
  domain,
  fallbackHref = "/contact",
  localPart,
  subject,
}: SafeEmailLinkProps) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const contact = { localPart, domain };
  const display = hydrated ? emailAddress(contact) : safeEmailDisplay(contact);
  const content =
    typeof children === "function"
      ? children(display, hydrated)
      : (children ?? display);

  return (
    <a
      aria-label={ariaLabel ?? safeEmailAriaLabel(contact)}
      className={className}
      href={hydrated ? mailtoHref(contact, subject) : fallbackHref}
    >
      {content}
    </a>
  );
}

function subscribeToHydration(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const timer = window.setTimeout(onStoreChange, 0);
  return () => window.clearTimeout(timer);
}

function getClientHydrationSnapshot() {
  return true;
}

function getServerHydrationSnapshot() {
  return false;
}
