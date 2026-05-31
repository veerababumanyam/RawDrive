import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UploadDropzone } from "../upload-dropzone";

describe("UploadDropzone", () => {
  it("offers folder selection for large recursive photo batches", () => {
    render(<UploadDropzone onFilesAccepted={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Select folder" })).toBeInTheDocument();
    const directoryInput = document.querySelector('input[webkitdirectory=""]');
    expect(directoryInput).toBeInstanceOf(HTMLInputElement);
  });

  it("defaults to a wedding-scale batch limit", () => {
    render(<UploadDropzone onFilesAccepted={vi.fn()} />);

    const input = document.querySelector('input[type="file"]:not([webkitdirectory])');
    expect(input).toHaveAttribute("multiple");
  });
});
