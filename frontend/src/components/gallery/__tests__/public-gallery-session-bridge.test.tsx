import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PublicGallerySessionBridge } from "../public-gallery-session-bridge";

// PublicGallerySessionBridge persists the server-render-minted gallery session
// into the visitor's browser so a subsequent client navigation (Find Me /
// photo-search, People, Back to gallery, result photo links) carries it. See
// issue #156 — the server-side share-link unlock mints X-Gallery-Session but
// never installed it in the browser.

function clearCookies() {
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0]?.trim();
    if (name) {
      document.cookie = `${name}=; Path=/; Max-Age=0`;
    }
  }
}

describe("PublicGallerySessionBridge", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    clearCookies();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists the minted token to sessionStorage, the cookie, and the upgrade route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PublicGallerySessionBridge
        slug="ravi-and-priya"
        gallerySessionToken="minted-session-token-abc"
      />,
    );

    // current-tab client helpers read sessionStorage[gallery_session_${slug}]
    await waitFor(() => {
      expect(
        window.sessionStorage.getItem("gallery_session_ravi-and-priya"),
      ).toBe("minted-session-token-abc");
    });

    // immediate same-site cookie so the very next navigation carries the session
    expect(document.cookie).toContain(
      "gallery_session=minted-session-token-abc",
    );

    // best-effort HttpOnly upgrade via the same-origin route handler
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/public-gallery-session",
        expect.objectContaining({
          method: "POST",
          credentials: "same-origin",
          body: JSON.stringify({
            slug: "ravi-and-priya",
            token: "minted-session-token-abc",
          }),
        }),
      );
    });
  });

  it("no-ops when no token is provided (cookie session path)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PublicGallerySessionBridge
        slug="ravi-and-priya"
        gallerySessionToken={null}
      />,
    );

    await Promise.resolve();
    expect(
      window.sessionStorage.getItem("gallery_session_ravi-and-priya"),
    ).toBeNull();
    expect(document.cookie).not.toContain("gallery_session=");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("survives a failed upgrade fetch without throwing (cookie already written)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PublicGallerySessionBridge
        slug="ravi-and-priya"
        gallerySessionToken="minted-session-token-abc"
      />,
    );

    await waitFor(() => {
      expect(document.cookie).toContain(
        "gallery_session=minted-session-token-abc",
      );
    });
    // the rejected upgrade must not surface — the immediate cookie already grants access
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
