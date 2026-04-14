import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/streams/InviteGenerator", () => ({
  InviteGenerator: ({ streamId }: { streamId: string }) => (
    <div data-testid="invite-generator-mock">{streamId}</div>
  ),
}));

import Page from "../page";

describe("streams/[id]/invite page", () => {
  it("renders InviteGenerator with the resolved streamId", async () => {
    const el = await Page({ params: Promise.resolve({ id: "stream-abc" }) });
    render(el);
    expect(screen.getByTestId("invite-generator-mock").textContent).toBe("stream-abc");
  });
});
