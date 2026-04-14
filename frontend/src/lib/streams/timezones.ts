// Common IANA timezone identifiers used for the stream creation form.
// Kept deliberately short (~30) — covers the vast majority of RawDrive's
// photographer workspaces. Extend as needed.
export const IANA_TIMEZONES: string[] = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Karachi",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Buenos_Aires",
  "Pacific/Auckland",
];

/** Runtime check that a string is a valid IANA zone understood by Intl. */
export function isValidTimezone(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  try {
    // Intl.DateTimeFormat throws RangeError for unknown IANA zones.
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
