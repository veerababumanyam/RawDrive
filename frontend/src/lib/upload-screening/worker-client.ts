import type { ScanManifest, WorkerInput, WorkerOutput } from "./types";

const WORKER_TIMEOUT_MS = 120_000;

type ScreeningWorker = Pick<Worker, "postMessage" | "terminate"> & {
  addEventListener: Worker["addEventListener"];
  removeEventListener: Worker["removeEventListener"];
};

export type ScreeningWorkerFactory = () => ScreeningWorker;

function defaultWorkerFactory(): ScreeningWorker {
  return new Worker(
    new URL("../../workers/upload-screening.worker.ts", import.meta.url),
    {
      type: "module",
    },
  );
}

export function canUseScreeningWorker(): boolean {
  return typeof Worker !== "undefined";
}

export async function runScreeningWorker(
  file: File,
  policyVersion: string,
  metadataBudgetBytes: number,
  fileId: string,
  createWorker: ScreeningWorkerFactory = defaultWorkerFactory,
): Promise<ScanManifest> {
  if (!canUseScreeningWorker() && createWorker === defaultWorkerFactory) {
    throw new Error("upload screening worker is not available in this browser");
  }

  const bytes = await file.arrayBuffer();
  const worker = createWorker();
  const input: WorkerInput = {
    type: "scan",
    fileId,
    fileName: file.name,
    declaredType: file.type,
    sizeBytes: file.size,
    bytes,
    policyVersion,
    metadataBudgetBytes,
  };

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("upload screening timed out"));
    }, WORKER_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeout);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.terminate();
    };

    const onMessage = (event: MessageEvent<WorkerOutput>) => {
      const output = event.data;
      if (!output || output.fileId !== fileId) return;
      cleanup();
      if (output.type === "result") {
        resolve(output.manifest);
        return;
      }
      reject(new Error(output.message));
    };

    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message || "upload screening worker failed"));
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage(input, [input.bytes]);
  });
}
