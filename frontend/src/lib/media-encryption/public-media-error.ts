import {
  MEDIA_KEY_MISMATCH_MESSAGE,
  MEDIA_KEY_UNAVAILABLE_MESSAGE,
} from "./media-key-store";

const SECURE_LINK_REQUIRED =
  "Encrypted photo locked. Open the secure gallery link from the photographer.";
const SECURE_LINK_MISMATCH =
  "This secure gallery link does not match the encrypted photo.";
const SECURE_MEDIA_UNAVAILABLE =
  "Encrypted photo preview could not load. Refresh or ask the photographer for a new link.";

export function publicMediaErrorMessage(error: string | null | undefined): string | null {
  if (!error) return null;
  if (error === MEDIA_KEY_UNAVAILABLE_MESSAGE) return SECURE_LINK_REQUIRED;
  if (error === MEDIA_KEY_MISMATCH_MESSAGE) return SECURE_LINK_MISMATCH;
  if (error.includes("Encrypted media fetch failed: 401")) return SECURE_LINK_REQUIRED;
  if (error.startsWith("Encrypted media fetch failed:")) return SECURE_MEDIA_UNAVAILABLE;
  if (error === "Encrypted media decrypt failed" || error === "Missing encrypted media manifest") {
    return SECURE_MEDIA_UNAVAILABLE;
  }
  return error;
}
