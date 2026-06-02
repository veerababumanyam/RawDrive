import type { ScanFinding } from "./types";

export function visibleUploadWarnings(findings: readonly ScanFinding[] | undefined): ScanFinding[] {
  return (findings ?? []).filter((finding) => {
    if (finding.severity !== "low") return false;
    return !isBenignCameraPreviewFinding(finding);
  });
}

function isBenignCameraPreviewFinding(finding: ScanFinding): boolean {
  return (
    finding.category === "appended_payload" &&
    finding.message.toLowerCase().includes("camera-authored jpeg preview/mpf")
  );
}
