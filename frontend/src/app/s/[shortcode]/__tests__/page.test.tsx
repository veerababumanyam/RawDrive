import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// next/navigation.redirect throws a special error in the App Router. Mock it
// so we can assert the redirect target without crashing the test runner.
const redirectMock = vi.fn((url: string) => {
  const e = new Error(`NEXT_REDIRECT:${url}`);
  (e as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};307;`;
  throw e;
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>(),
}));

const resolveMock = vi.fn();
vi.mock("@/lib/streaming/resolve-shortlink", async () => {
  const actual = await vi.importActual<typeof import("@/lib/streaming/resolve-shortlink")>(
    "@/lib/streaming/resolve-shortlink",
  );
  return {
    ...actual,
    resolveShortlink: (...args: unknown[]) => resolveMock(...args),
  };
});

import ShortlinkPage from "@/app/s/[shortcode]/page";

const STREAM_ID = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  redirectMock.mockClear();
  resolveMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function runPage(
  shortcode: string,
  search: Record<string, string> = {},
): Promise<unknown> {
  const params = Promise.resolve({ shortcode });
  const searchParams = Promise.resolve(search);
  try {
    return await ShortlinkPage({ params, searchParams });
  } catch (err) {
    // next/navigation.redirect throws — that's the success path here.
    return err;
  }
}

describe("/s/[shortcode] page", () => {
  it("redirects to /stream/[id]?src=<normalized> on resolver 200", async () => {
    resolveMock.mockResolvedValueOnce({
      kind: "ok",
      streamId: STREAM_ID,
      src: "wa",
      stream: { stream_title: "Test", protected: false },
    });

    await runPage("abc12345", { src: "wa" });

    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith(`/stream/${STREAM_ID}?src=wa`);
  });

  it("renders a fallback card when the shortlink is revoked (410)", async () => {
    resolveMock.mockResolvedValueOnce({ kind: "revoked" });
    const result = await runPage("revoked01");
    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("renders a fallback card when the shortlink is not found (404)", async () => {
    resolveMock.mockResolvedValueOnce({ kind: "not_found" });
    const result = await runPage("missing01");
    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("renders a fallback card when the resolver errors", async () => {
    resolveMock.mockResolvedValueOnce({ kind: "error" });
    const result = await runPage("broken01");
    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("renders a rate-limited card without redirecting", async () => {
    resolveMock.mockResolvedValueOnce({ kind: "rate_limited" });
    const result = await runPage("toofast0");
    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("rejects a malformed (non-UUID) stream_id from the resolver", async () => {
    resolveMock.mockResolvedValueOnce({
      kind: "ok",
      streamId: "../evil-redirect",
      src: "direct",
      stream: {},
    });
    const result = await runPage("compromsd");
    expect(redirectMock).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});
