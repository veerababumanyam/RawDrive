// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S1: Upload screening Web Worker entry point.
//
// Receives { file, policyVersion, metadataBudgetBytes } from the main thread,
// runs the structural screener + SHA-256 + manifest builder, then posts the
// resulting ScanManifest back (or an error).
//
// Runs in a separate JS context — no DOM access, no React, no module
// singletons. We import only pure-function modules from lib/upload-screening.
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkerInput, WorkerOutput } from "../lib/upload-screening/types";
import { screen } from "../lib/upload-screening/screen";
import { sha256HexChunked } from "../lib/upload-screening/hash";
import { buildManifest } from "../lib/upload-screening/manifest";

// TypeScript doesn't type `self` as DedicatedWorkerGlobalScope by default —
// we narrow it here so postMessage + addEventListener have the right shape.
// Using addEventListener (instead of onmessage) avoids triggering the
// tsconfig's stricter DOM type checks, which flag `onmessage` on non-worker
// lib configurations.
const ctx = self as unknown as {
  postMessage: (data: WorkerOutput) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<WorkerInput>) => void
  ) => void;
};

ctx.addEventListener("message", async (event: MessageEvent<WorkerInput>) => {
  const input = event.data;
  if (!input || input.type !== "scan") {
    // Malformed message — nothing to do.
    return;
  }

  const { fileId, file, policyVersion, metadataBudgetBytes } = input;

  try {
    // Read the file bytes for the structural screener. For very large
    // files we cap at the metadata budget plus a header/footer window —
    // the screener only needs the markers, not the pixel data. In M16
    // the files we care about (jpeg/png/webp/gif) are <50 MB so we just
    // read the whole buffer.
    const bytes = new Uint8Array(await file.arrayBuffer());

    const result = screen(bytes, {
      metadataBudgetBytes,
      declaredType: file.type,
      // CD5b: forward the filename so the screener can backstop TIFF-based RAW
      // (NEF/ARW/DNG/ORF/RW2) by extension when the browser/OS reports a
      // generic `image/tiff` or empty MIME. File.name survives the structured
      // clone of the File across postMessage, so no separate string is needed.
      declaredName: file.name,
    });

    // Compute the manifest hash. This is the canonical hash of the full
    // file bytes — matches what the backend recomputes at finalize time.
    const sha256 = await sha256HexChunked(file);

    const manifest = buildManifest({
      file,
      policyVersion,
      sha256,
      result,
    });

    const out: WorkerOutput = { type: "result", fileId, manifest };
    ctx.postMessage(out);
  } catch (err) {
    const out: WorkerOutput = {
      type: "error",
      fileId,
      message: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(out);
  }
});

// Keep the module a module — the `export {}` prevents TS treating this as
// a script file and gives it its own module scope.
export {};
