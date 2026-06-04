import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FaceIDGate } from "../faceid-gate";

// Mock the server-side image search client — the accurate path this gate now
// uses. vi.hoisted keeps the spy referenceable inside the hoisted factory.
const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }));
vi.mock("@/lib/api/ai", () => ({
  searchPublicFaceInGallery: searchMock,
}));

// installCameraMocks stubs the camera + media APIs jsdom does not implement.
function installCameraMocks(opts: { deny?: boolean } = {}) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = opts.deny
    ? vi.fn().mockRejectedValue(new Error("denied"))
    : vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  // jsdom leaves these unimplemented; stub so the camera step can render.
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    set: vi.fn(),
    get: () => null,
  });
  return { getUserMedia, track };
}

// installCanvasMocks stubs the capture path (jsdom has no 2d canvas backend).
function installCanvasMocks() {
  HTMLCanvasElement.prototype.getContext = vi
    .fn()
    .mockReturnValue({ drawImage: vi.fn() }) as never;
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
    cb(new Blob(["jpegbytes"], { type: "image/jpeg" }));
  } as typeof HTMLCanvasElement.prototype.toBlob;
}

describe("FaceIDGate", () => {
  afterEach(() => {
    vi.clearAllMocks();
    searchMock.mockReset();
  });

  it("shows an honest unavailable state on encrypted galleries and never runs a match", () => {
    const onFallback = vi.fn();
    const onMatched = vi.fn();
    render(
      <FaceIDGate
        slug="wedding"
        encrypted
        onMatched={onMatched}
        onFallback={onFallback}
      />,
    );

    expect(screen.getByText(/isn.t available here yet/i)).toBeInTheDocument();
    // The encrypted path must not offer the camera/consent flow…
    expect(screen.queryByText(/use camera/i)).not.toBeInTheDocument();
    // …and must never pseudo-match.
    fireEvent.click(screen.getByRole("button", { name: /browse all photos/i }));
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(searchMock).not.toHaveBeenCalled();
    expect(onMatched).not.toHaveBeenCalled();
  });

  it("uses truthful consent copy — selfie goes to the server, with no false on-device/descriptor claims", () => {
    render(
      <FaceIDGate slug="wedding" onMatched={vi.fn()} onFallback={vi.fn()} />,
    );

    expect(screen.getByText(/send it to our server/i)).toBeInTheDocument();
    expect(screen.getByText(/don.t store your selfie/i)).toBeInTheDocument();
    // The previous, factually-false privacy claims must be gone.
    expect(
      screen.queryByText(/never leaves your device/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/fingerprint/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/512-float/i)).not.toBeInTheDocument();
  });

  it("captures a selfie and matches via the server /photo-search client (not a client-side embedding)", async () => {
    installCameraMocks();
    installCanvasMocks();
    searchMock.mockResolvedValue({
      found: true,
      faces_detected: 1,
      asset_ids: ["a1", "a2"],
      count: 2,
    });
    const onMatched = vi.fn();
    render(
      <FaceIDGate slug="wedding" onMatched={onMatched} onFallback={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /use camera/i }));
    const capture = await screen.findByRole("button", {
      name: /capture & find my photos/i,
    });
    fireEvent.click(capture);

    await waitFor(() =>
      expect(onMatched).toHaveBeenCalledWith(["a1", "a2"]),
    );
    // Proves the re-route: the server image client was called with the slug + a Blob.
    expect(searchMock).toHaveBeenCalledTimes(1);
    const [slugArg, blobArg] = searchMock.mock.calls[0];
    expect(slugArg).toBe("wedding");
    expect(blobArg).toBeInstanceOf(Blob);
  });

  it("falls back to browse-all when camera access is denied (GAL-FR-109)", async () => {
    installCameraMocks({ deny: true });
    const onFallback = vi.fn();
    render(
      <FaceIDGate slug="wedding" onMatched={vi.fn()} onFallback={onFallback} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /use camera/i }));
    await screen.findByText(/camera access denied/i);
    fireEvent.click(screen.getByRole("button", { name: /browse all photos/i }));
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(searchMock).not.toHaveBeenCalled();
  });
});
