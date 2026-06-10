import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UploadProgress, type UploadItem } from "../upload-progress";

function uploadItem(overrides: Partial<UploadItem>): UploadItem {
  return {
    id: "upload-1",
    file: new File(["photo-bytes"], "ceremony.jpg", { type: "image/jpeg" }),
    progress: 0,
    status: "pending",
    ...overrides,
  };
}

describe("UploadProgress", () => {
  it("shows retryable upload error messages beside failed rows", () => {
    render(
      <UploadProgress
        items={[
          uploadItem({
            status: "error",
            error:
              "You must accept the Terms of Service before uploading.",
          }),
        ]}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/You must accept the Terms of Service/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
