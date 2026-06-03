import { describe, expect, it, vi } from "vitest";
import { runScreeningWorker } from "../worker-client";
import type { ScanManifest, WorkerInput, WorkerOutput } from "../types";

class FakeWorker {
  posted?: WorkerInput;
  terminated = false;
  listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(input: WorkerInput) {
    this.posted = input;
  }

  terminate() {
    this.terminated = true;
  }

  emit(output: WorkerOutput) {
    for (const listener of this.listeners.get("message") ?? []) {
      listener(new MessageEvent("message", { data: output }));
    }
  }
}

function minimalManifest(file: File): ScanManifest {
  return {
    policy_version: "test-policy",
    engine: "browser-worker",
    engine_version: "test",
    file_name: file.name,
    declared_type: file.type,
    detected_format: "jpeg",
    sha256: "abc123",
    size_bytes: file.size,
    decision: "pass",
    risk_score: 0,
    findings: [],
  };
}

describe("runScreeningWorker", () => {
  it("posts the scan request to a worker and resolves the correlated result", async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "Wedding (42).jpg", {
      type: "image/jpeg",
    });
    const worker = new FakeWorker();
    const promise = runScreeningWorker(
      file,
      "test-policy",
      512,
      "file-1",
      () => worker as unknown as Worker,
    );

    expect(worker.posted).toMatchObject({
      type: "scan",
      fileId: "file-1",
      file,
      policyVersion: "test-policy",
      metadataBudgetBytes: 512,
    });

    worker.emit({ type: "result", fileId: "other-file", manifest: minimalManifest(file) });
    expect(worker.terminated).toBe(false);

    const manifest = minimalManifest(file);
    worker.emit({ type: "result", fileId: "file-1", manifest });
    await expect(promise).resolves.toEqual(manifest);
    expect(worker.terminated).toBe(true);
  });

  it("forwards the File (including its name) so the worker can screen by extension (CD5b)", () => {
    // CD5b: the screener disambiguates TIFF-based RAW (NEF/ARW/DNG/ORF/RW2) by
    // filename extension. The client posts the whole File — File.name survives
    // the structured clone across postMessage — so no separate name string is
    // needed; the worker reads file.name and passes it as declaredName.
    const file = new File([new Uint8Array([0x49, 0x49, 0x2a, 0x00])], "IMG_1234.nef", {
      type: "image/tiff",
    });
    const worker = new FakeWorker();
    void runScreeningWorker(
      file,
      "test-policy",
      512,
      "raw-1",
      () => worker as unknown as Worker,
    );

    expect(worker.posted?.file).toBe(file);
    expect(worker.posted?.file.name).toBe("IMG_1234.nef");
  });

  it("rejects worker errors with the worker message", async () => {
    const file = new File(["bad"], "bad.jpg", { type: "image/jpeg" });
    const worker = new FakeWorker();
    const promise = runScreeningWorker(file, "test-policy", 512, "file-1", () => worker as unknown as Worker);

    worker.emit({ type: "error", fileId: "file-1", message: "decode failed" });
    await expect(promise).rejects.toThrow("decode failed");
    expect(worker.terminated).toBe(true);
  });

  it("times out and terminates a stalled worker", async () => {
    vi.useFakeTimers();
    const file = new File(["slow"], "slow.jpg", { type: "image/jpeg" });
    const worker = new FakeWorker();
    const promise = runScreeningWorker(file, "test-policy", 512, "file-1", () => worker as unknown as Worker);
    const expectation = expect(promise).rejects.toThrow("upload screening timed out");

    await vi.advanceTimersByTimeAsync(120_000);
    await expectation;
    expect(worker.terminated).toBe(true);
    vi.useRealTimers();
  });
});
