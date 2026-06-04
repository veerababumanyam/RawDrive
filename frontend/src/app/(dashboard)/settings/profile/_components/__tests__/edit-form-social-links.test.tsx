import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { emptyPhotographerProfile } from "@/lib/api/photographer-profile";
import { EditForm } from "../edit-form";

const linkedBusinessProfile = {
  name: "Kaveri Stories",
  address: "Road No. 12\nHyderabad, Telangana\n500034",
  href: "/settings/business",
};

const linkedPricingProfile = {
  startingPrice: 50000,
  maxPrice: 150000,
  paymentTerms: "50% advance confirms the booking.",
  packageCount: 3,
  href: "/settings/packages",
  termsHref: "/settings/business",
};

function defaultPublicProfile(overrides = {}) {
  return {
    enabled: false,
    ready: true,
    requirements: [],
    onToggle: vi.fn(),
    ...overrides,
  };
}

describe("EditForm social links", () => {
  it("renders social profiles as functional link cards", () => {
    const onChange = vi.fn();
    const profile = {
      ...emptyPhotographerProfile(),
      social_instagram: "rawdrive",
      social_facebook: "facebook.com/rawdrive",
    };

    render(
      <EditForm
        profile={profile}
        linkedBusinessProfile={linkedBusinessProfile}
        linkedPricingProfile={linkedPricingProfile}
        publicProfile={defaultPublicProfile()}
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Open Instagram profile" }),
    ).toHaveAttribute("href", "https://instagram.com/rawdrive");
    expect(
      screen.getByRole("link", { name: "Open Facebook profile" }),
    ).toHaveAttribute("href", "https://facebook.com/rawdrive");
    expect(screen.getByLabelText("Instagram")).toHaveAttribute(
      "placeholder",
      "https://instagram.com/studio",
    );
    expect(
      screen.queryByText(/Add this to show a tappable social button/),
    ).not.toBeInTheDocument();
  });

  it("updates the matching social profile field when edited", () => {
    const onChange = vi.fn();
    const profile = emptyPhotographerProfile();

    render(
      <EditForm
        profile={profile}
        linkedBusinessProfile={linkedBusinessProfile}
        linkedPricingProfile={linkedPricingProfile}
        publicProfile={defaultPublicProfile()}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("LinkedIn"), {
      target: { value: "studio-name" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ social_linkedin: "studio-name" }),
    );
  });

  it("shows pricing as linked read-only data from service packages", () => {
    const onChange = vi.fn();
    const profile = emptyPhotographerProfile();

    render(
      <EditForm
        profile={profile}
        linkedBusinessProfile={linkedBusinessProfile}
        linkedPricingProfile={linkedPricingProfile}
        publicProfile={defaultPublicProfile()}
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Pricing source" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 active packages")).toBeInTheDocument();
    expect(
      screen.getByText("50% advance confirms the booking."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Edit service packages" }),
    ).toHaveAttribute("href", "/settings/packages");
    expect(
      screen.getByRole("link", {
        name: "Edit payment terms in Business Profile",
      }),
    ).toHaveAttribute("href", "/settings/business");
    expect(
      screen.queryByLabelText("Starting price INR"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Payment terms")).not.toBeInTheDocument();
  });

  it("shows business identity as linked read-only data from Business settings", () => {
    const onChange = vi.fn();
    const profile = emptyPhotographerProfile();

    render(
      <EditForm
        profile={profile}
        linkedBusinessProfile={linkedBusinessProfile}
        linkedPricingProfile={linkedPricingProfile}
        publicProfile={defaultPublicProfile()}
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Business source" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Kaveri Stories")).toBeInTheDocument();
    expect(screen.getByText(/Road No. 12/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Edit business profile settings" }),
    ).toHaveAttribute("href", "/settings/business");
    expect(screen.queryByLabelText("Business address")).not.toBeInTheDocument();
  });

  it("keeps public publishing controls in Identity and maps slug edits", () => {
    const onChange = vi.fn();
    const onToggle = vi.fn();
    const profile = emptyPhotographerProfile();

    const { container } = render(
      <EditForm
        profile={profile}
        linkedBusinessProfile={linkedBusinessProfile}
        linkedPricingProfile={linkedPricingProfile}
        publicProfile={defaultPublicProfile({
          ready: false,
          requirements: [
            { key: "last_name", label: "Last name", ok: true },
            { key: "url_slug", label: "Public slug", ok: false },
          ],
          onToggle,
        })}
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Identity" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Public profile" }),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll(".profile-publish-card__missing-item"),
    ).toHaveLength(1);

    fireEvent.click(
      screen.getByRole("switch", {
        name: "Public profile visibility: Private",
      }),
    );
    expect(onToggle).toHaveBeenCalledWith(true);

    fireEvent.change(screen.getByLabelText("Public slug"), {
      target: { value: "germany-manyam" },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ url_slug: "germany-manyam" }),
    );
  });

  it("adds and edits functional custom links", () => {
    const onChange = vi.fn();
    const profile = emptyPhotographerProfile();

    render(
      <EditForm
        profile={profile}
        linkedBusinessProfile={linkedBusinessProfile}
        linkedPricingProfile={linkedPricingProfile}
        publicProfile={defaultPublicProfile()}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_links: [{ label: "", url: "" }],
      }),
    );
  });

  it("normalizes custom link URLs and exposes an open action", () => {
    const onChange = vi.fn();
    const profile = {
      ...emptyPhotographerProfile(),
      custom_links: [{ label: "Booking form", url: "rawdrive.in/book" }],
    };

    render(
      <EditForm
        profile={profile}
        linkedBusinessProfile={linkedBusinessProfile}
        linkedPricingProfile={linkedPricingProfile}
        publicProfile={defaultPublicProfile()}
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Open custom link 1" }),
    ).toHaveAttribute("href", "https://rawdrive.in/book");

    fireEvent.blur(screen.getByLabelText("Custom link 1 URL"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_links: [
          { label: "Booking form", url: "https://rawdrive.in/book" },
        ],
      }),
    );
  });
});
