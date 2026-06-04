import type { ProfileCustomLink } from "@/lib/api/photographer-profile";

export function normalizeCustomLinkUrl(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, "");
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("www.")) {
    return `https://${trimmed}`;
  }
  return `https://${trimmed.replace(/^@/, "")}`;
}

export function customLinkHref(value: string): string {
  const normalized = normalizeCustomLinkUrl(value);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
      return "";
    }
    return parsed.href;
  } catch {
    return "";
  }
}

export function displayCustomLinkUrl(value: string): string {
  const href = customLinkHref(value);
  if (!href) return "";
  const parsed = new URL(href);
  return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname}`.replace(
    /\/$/,
    "",
  );
}

export function normalizeCustomLinks(
  links: ProfileCustomLink[] | undefined,
): ProfileCustomLink[] {
  return (Array.isArray(links) ? links : [])
    .map((link) => ({
      label: (link?.label || "").trim(),
      url: normalizeCustomLinkUrl(link?.url || ""),
    }))
    .filter((link) => link.label && customLinkHref(link.url));
}
