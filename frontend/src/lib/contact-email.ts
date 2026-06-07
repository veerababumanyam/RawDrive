export const RAWDRIVE_EMAIL_DOMAIN = "rawdrive.in";

export type RawDriveContactEmail = {
  localPart: "info" | "support" | "contactus";
  domain?: string;
};

export const RAWDRIVE_CONTACT_EMAILS = {
  info: { localPart: "info", domain: RAWDRIVE_EMAIL_DOMAIN },
  support: { localPart: "support", domain: RAWDRIVE_EMAIL_DOMAIN },
  contactus: { localPart: "contactus", domain: RAWDRIVE_EMAIL_DOMAIN },
} as const satisfies Record<string, RawDriveContactEmail>;

export function emailAddress({
  localPart,
  domain = RAWDRIVE_EMAIL_DOMAIN,
}: RawDriveContactEmail): string {
  return `${localPart}@${domain}`;
}

export function safeEmailDisplay({
  localPart,
  domain = RAWDRIVE_EMAIL_DOMAIN,
}: RawDriveContactEmail): string {
  return `${localPart} [at] ${domain}`;
}

export function safeEmailAriaLabel({
  localPart,
  domain = RAWDRIVE_EMAIL_DOMAIN,
}: RawDriveContactEmail): string {
  return `Email ${localPart} at ${domain}`;
}

export function mailtoHref(
  contact: RawDriveContactEmail,
  subject?: string,
): string {
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : "";
  return `mailto:${emailAddress(contact)}${query}`;
}
