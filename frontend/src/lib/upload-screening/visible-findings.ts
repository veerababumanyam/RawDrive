import type { ScanFinding } from "./types";

export function visibleUploadWarnings(findings: readonly ScanFinding[] | undefined): ScanFinding[] {
  return (findings ?? []).filter((finding) => {
    if (finding.severity !== "low") return false;
    return !isBenignJpegTrailerFinding(finding);
  });
}

function isBenignJpegTrailerFinding(finding: ScanFinding): boolean {
  if (finding.category !== "appended_payload") return false;
  const message = finding.message.toLowerCase();
  return (
    message.includes("camera-authored jpeg preview/mpf") ||
    message.includes("camera-authored trailer data after the primary jpeg image") ||
    (message.includes("trailing data past jpeg eoi") && message.includes("allowed"))
  );
}
