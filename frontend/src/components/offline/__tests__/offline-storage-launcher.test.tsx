import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { listSaved, removeGallery } from "@/lib/offline/catalog";
import { OfflineStorageLauncher } from "../offline-storage-launcher";

// jsdom has no navigator.storage / Cache Storage — stub the capabilities the
// launcher probes so the FAB renders. serviceWorker is left undefined; the
// inner ManageOfflineStorage guards on it.
vi.stubGlobal("navigator", {
  ...navigator,
  serviceWorker: undefined,
  storage: {
    estimate: async () => ({ usage: 2 * 1024 * 1024, quota: 500 * 1024 * 1024 }),
  },
  onLine: true,
});
vi.stubGlobal("caches", {
  open: async () => ({ put: async () => {} }),
});

describe("OfflineStorageLauncher", () => {
  beforeEach(async () => {
    for (const m of await listSaved()) await removeGallery(m.slug);
  });

  it("renders the manage-offline-storage FAB when storage is supported", async () => {
    render(<OfflineStorageLauncher />);
    expect(
      await screen.findByRole("button", { name: /Manage offline storage/i }),
    ).toBeInTheDocument();
  });

  it("opens a dialog mounting ManageOfflineStorage when the FAB is clicked", async () => {
    render(<OfflineStorageLauncher />);

    // Panel is closed initially.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const fab = await screen.findByRole("button", { name: /Manage offline storage/i });
    fireEvent.click(fab);

    // The dialog opens and ManageOfflineStorage mounts (its empty-state copy
    // proves the child rendered, not just the shell).
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(
      await screen.findByText(/No galleries saved offline yet/i),
    ).toBeInTheDocument();
  });

  it("closes the dialog via the close button", async () => {
    render(<OfflineStorageLauncher />);
    fireEvent.click(await screen.findByRole("button", { name: /^Manage offline storage$/i }));
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: /Close offline storage manager/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
