import { Suspense } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PublicPhotoSearchPage from "../page";

// GAL-FR-107 (slice 3c): the standalone public Find-Me page must present an
// affirmative consent control that the guest MUST accept before the
// camera/selfie capture step proceeds, and must send `consentGiven: true` to
// the (now consent-aware, slice 3b) backend so the search is GAL-FR-107
// compliant instead of 403 `biometric_consent_required`.

// Mock the server-side image search client and the scope helper. vi.hoisted
// keeps the spies referenceable inside the hoisted factory.
const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }));
vi.mock("@/lib/api/ai", () => ({
  searchPublicFaceInGallery: searchMock,
  withPublicScope: (path: string) => path,
}));

// The result grid renders DecryptedThumb — stub it so the test does not pull in
// the decryption stack (not exercised by the consent-gate assertions).
vi.mock("@/components/gallery/decrypted-thumb", () => ({
  DecryptedThumb: () => null,
}));

// App-Router navigation hooks the page reads. No share scope in this test.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Camera + canvas APIs jsdom does not implement (mirrors the FaceIDGate test).
function installCameraMocks() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    set: vi.fn(),
    get: () => null,
  });
  // The page reads videoWidth/Height to know the frame is warm.
  Object.defineProperty(HTMLMediaElement.prototype, "videoWidth", {
    configurable: true,
    get: () => 640,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "videoHeight", {
    configurable: true,
    get: () => 480,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
    configurable: true,
    get: () => 4,
  });
  return { getUserMedia, track };
}

function installCanvasMocks() {
  HTMLCanvasElement.prototype.getContext = vi
    .fn()
    .mockReturnValue({ drawImage: vi.fn() }) as never;
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
    cb(new Blob(["jpegbytes"], { type: "image/jpeg" }));
  } as typeof HTMLCanvasElement.prototype.toBlob;
}

async function renderPage() {
  // The page unwraps `params` with React.use(), which suspends until the promise
  // resolves — wrap in a Suspense boundary (App Router supplies one at runtime)
  // and flush the resolution so the consent UI is mounted before assertions.
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(
      <Suspense fallback={null}>
        <PublicPhotoSearchPage params={Promise.resolve({ slug: "wedding" })} />
      </Suspense>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return utils;
}

describe("standalone Find-Me consent gate (GAL-FR-107, slice 3c)", () => {
  beforeEach(() => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    searchMock.mockReset();
  });

  it("renders an affirmative consent control before capture", async () => {
    installCameraMocks();
    await renderPage();

    const consent = await screen.findByRole("checkbox");
    expect(consent).not.toBeChecked();

    // The consent affordance carries the biometric-matching contract copy.
    expect(
      screen.getByText(/matched against the people in this gallery/i),
    ).toBeInTheDocument();
  });

  it("keeps the camera trigger disabled until consent is accepted", async () => {
    const { getUserMedia } = installCameraMocks();
    await renderPage();

    const startBtn = await screen.findByRole("button", {
      name: /start camera/i,
    });
    expect(startBtn).toBeDisabled();

    // Clicking while disabled / un-consented must NOT open the camera.
    fireEvent.click(startBtn);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("gates the capture step on consent acceptance and sends consent_given:true", async () => {
    const { getUserMedia } = installCameraMocks();
    installCanvasMocks();
    searchMock.mockResolvedValue({
      found: false,
      faces_detected: 0,
      asset_ids: [],
      count: 0,
    });

    await renderPage();

    // Accept consent → camera trigger enables.
    const consent = await screen.findByRole("checkbox");
    fireEvent.click(consent);
    expect(consent).toBeChecked();

    const startBtn = screen.getByRole("button", { name: /start camera/i });
    expect(startBtn).toBeEnabled();
    fireEvent.click(startBtn);

    // Camera opens only now (post-consent).
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));

    // The <video> mounts in the preview stage. jsdom reports videoWidth/Height
    // as 0 and never emits loadedmetadata, so stamp non-zero dimensions on the
    // element and fire the event — the page reads them to flip videoReady=true
    // and enable/relabel the capture button.
    const video = document.querySelector("video");
    if (!video) throw new Error("camera preview video did not mount");
    Object.defineProperty(video, "videoWidth", {
      configurable: true,
      get: () => 640,
    });
    Object.defineProperty(video, "videoHeight", {
      configurable: true,
      get: () => 480,
    });
    Object.defineProperty(video, "readyState", {
      configurable: true,
      get: () => 4,
    });
    await act(async () => {
      video.dispatchEvent(new Event("loadedmetadata"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Capture → the search runs with affirmative consent threaded through.
    const captureBtn = await screen.findByRole("button", {
      name: /capture & search/i,
    });
    await waitFor(() => expect(captureBtn).toBeEnabled());
    fireEvent.click(captureBtn);

    await waitFor(() => expect(searchMock).toHaveBeenCalledTimes(1));
    const [calledSlug, , opts] = searchMock.mock.calls[0];
    expect(calledSlug).toBe("wedding");
    expect(opts).toMatchObject({ consentGiven: true });
  });
});
