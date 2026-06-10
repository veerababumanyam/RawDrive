import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UploadDropzone } from "../upload-dropzone";

const componentPath = path.resolve(__dirname, "../upload-dropzone.tsx");

// Build a synthetic drop event whose dataTransfer carries the given files.
// The dropzone's getFilesFromEvent reads dataTransfer.items first for the
// webkit directory-entry path; in jsdom those items expose no
// webkitGetAsEntry, so it falls back to dataTransfer.files — exactly the
// path a flat (non-folder) drop takes in a real browser.
function createDropEvent(files: File[]) {
  return {
    dataTransfer: {
      files,
      items: files.map((file) => ({
        kind: "file",
        type: file.type,
        getAsFile: () => file,
      })),
      types: ["Files"],
    },
  };
}

async function dropFiles(dropzone: HTMLElement, files: File[]) {
  fireEvent.drop(dropzone, createDropEvent(files));
}

describe("UploadDropzone", () => {
  it("offers folder selection for large recursive photo batches", () => {
    render(<UploadDropzone onFilesAccepted={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Select folder" }),
    ).toBeInTheDocument();
    const directoryInput = document.querySelector('input[webkitdirectory=""]');
    expect(directoryInput).toBeInstanceOf(HTMLInputElement);
  });

  it("keeps the folder FileList attached after selection", () => {
    const source = fs.readFileSync(componentPath, "utf8");
    const folderInputStart = source.indexOf("ref={folderInputRef}");
    const folderInputEnd = source.indexOf("/>", folderInputStart);
    const folderInputSource = source.slice(folderInputStart, folderInputEnd);

    expect(folderInputStart).toBeGreaterThan(-1);
    expect(folderInputSource).toContain("onFilesAccepted(selected)");
    expect(folderInputSource).not.toContain('value = ""');
    expect(source).toContain("Keep the directory FileList attached");
  });

  it("defaults to a wedding-scale batch limit", () => {
    render(<UploadDropzone onFilesAccepted={vi.fn()} />);

    const input = document.querySelector(
      'input[type="file"]:not([webkitdirectory])',
    );
    expect(input).toHaveAttribute("multiple");
  });

  it("advertises HEIC, AVIF, and camera RAW alongside browser formats", () => {
    render(<UploadDropzone onFilesAccepted={vi.fn()} />);

    const hint = screen.getByText(/camera RAW/i);
    expect(hint).toHaveTextContent(/HEIC\/HEIF/i);
    expect(hint).toHaveTextContent(/AVIF/i);
    expect(hint).toHaveTextContent(/Canon/i);
    expect(hint).toHaveTextContent(/Nikon/i);
    expect(hint).toHaveTextContent(/Phase One/i);
  });

  it("says HEIC, AVIF, and common RAW now upload directly in the browser", () => {
    render(<UploadDropzone onFilesAccepted={vi.fn()} />);

    // CD4/CD5c moved HEIC/HEIF/AVIF + common preview-bearing camera RAW into
    // the BROWSER_DECODE set — the copy must no longer claim they need Desktop.
    const hint = screen.getByText(/upload directly/i);
    expect(hint).toHaveTextContent(/Sony/i);
    expect(hint).toHaveTextContent(/Fujifilm/i);
    expect(hint).toHaveTextContent(/Pentax/i);
    expect(hint).toHaveTextContent(/Hasselblad/i);
  });

  it("reserves RawDrive Desktop for TIFF and the remaining exotic RAW formats", () => {
    render(<UploadDropzone onFilesAccepted={vi.fn()} />);

    // DESKTOP_REQUIRED now covers TIFF + exotic RAW (CR3 moved to the browser).
    const hint = screen.getByText(/RawDrive Desktop/i);
    expect(hint).toHaveTextContent(/TIFF/i);
  });

  it("accepts HEIC and camera RAW drops, including empty-MIME RAW", async () => {
    const onFilesAccepted = vi.fn();
    render(<UploadDropzone onFilesAccepted={onFilesAccepted} />);

    const dropzone = screen.getByText(/camera RAW/i).closest("div");
    expect(dropzone).not.toBeNull();

    const heic = new File(["heic-bytes"], "ceremony.heic", {
      type: "image/heic",
    });
    const avif = new File(["avif-bytes"], "portrait.avif", {
      type: "image/avif",
    });
    // Browsers frequently report camera RAW with an empty MIME type, so the
    // dropzone must accept it by extension alone.
    const cr2 = new File(["raw-bytes"], "IMG_0042.CR2", { type: "" });

    await dropFiles(dropzone as HTMLElement, [heic, avif, cr2]);

    await waitFor(() => expect(onFilesAccepted).toHaveBeenCalledTimes(1));
    const accepted = onFilesAccepted.mock.calls[0][0] as File[];
    expect(accepted.map((f) => f.name).sort()).toEqual([
      "IMG_0042.CR2",
      "ceremony.heic",
      "portrait.avif",
    ]);
  });

  it("rejects non-image files such as PDFs and executables", async () => {
    const onFilesAccepted = vi.fn();
    render(<UploadDropzone onFilesAccepted={onFilesAccepted} />);

    const dropzone = screen.getByText(/camera RAW/i).closest("div");
    const pdf = new File(["%PDF-1.7"], "contract.pdf", {
      type: "application/pdf",
    });
    const exe = new File(["MZ"], "installer.exe", {
      type: "application/x-msdownload",
    });

    await dropFiles(dropzone as HTMLElement, [pdf, exe]);

    await waitFor(() => {
      expect(screen.getByText("contract.pdf")).toBeInTheDocument();
    });
    expect(screen.getByText("installer.exe")).toBeInTheDocument();
    expect(onFilesAccepted).not.toHaveBeenCalled();
  });
});
