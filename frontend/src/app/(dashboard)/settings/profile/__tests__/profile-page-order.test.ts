import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("ProfileSettingsPage layout order", () => {
  const source = readFileSync(join(__dirname, "..", "page.tsx"), "utf8");
  const editFormSource = readFileSync(
    join(__dirname, "..", "_components", "edit-form.tsx"),
    "utf8",
  );

  it("places the avatar card above the profile edit form", () => {
    expect(source.indexOf("<AvatarCrop")).toBeGreaterThan(-1);
    expect(source.indexOf("<EditForm")).toBeGreaterThan(-1);
    expect(source.indexOf("<AvatarCrop")).toBeLessThan(
      source.indexOf("<EditForm"),
    );
    expect(source).not.toContain("<PublicProfilePanel");
  });

  it("keeps public profile visibility merged into the identity form", () => {
    expect(source).toContain("publicProfile={{");
    expect(editFormSource).toContain('from "@/components/ui/toggle-switch"');
    expect(editFormSource).toContain("<IdentityPublishCard");
    expect(editFormSource).toContain('label="Public profile visibility"');
  });
});
