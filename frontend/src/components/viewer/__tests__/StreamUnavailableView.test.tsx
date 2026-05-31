import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { StreamUnavailableView } from "../StreamUnavailableView";

describe("StreamUnavailableView", () => {
  it("renders the branded unavailable state with calm copy", () => {
    render(<StreamUnavailableView />);

    expect(screen.getByTestId("viewer-unavailable")).toBeTruthy();
    expect(screen.getByText("Stream unavailable")).toBeTruthy();
    expect(screen.getByText(/couldn't load this stream/i)).toBeTruthy();
  });
});
