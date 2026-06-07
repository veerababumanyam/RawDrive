import { describe, expect, it } from "vitest";
import {
  appendNoTransform,
  config,
  isDisabledRawDriveSubdomain,
} from "@/middleware";

describe("disabled RawDrive subdomain middleware routing", () => {
  it("fails closed for deprecated workspace and gallery subdomains", () => {
    expect(
      isDisabledRawDriveSubdomain("kaveri-stories-a1b2c3d4.rawdrive.in"),
    ).toBe(true);
    expect(
      isDisabledRawDriveSubdomain("legacy-studio-bf998927.rawdrive.in"),
    ).toBe(true);
    expect(isDisabledRawDriveSubdomain("wedding-veera.rawdrive.in")).toBe(true);
  });

  it("keeps apex and system subdomains out of the disabled workspace path", () => {
    expect(isDisabledRawDriveSubdomain("rawdrive.in")).toBe(false);
    expect(isDisabledRawDriveSubdomain("www.rawdrive.in")).toBe(false);
    expect(isDisabledRawDriveSubdomain("api.rawdrive.in")).toBe(false);
    expect(isDisabledRawDriveSubdomain("cdn.rawdrive.in")).toBe(false);
    expect(isDisabledRawDriveSubdomain("localhost")).toBe(false);
  });

  it("keeps public static assets out of the middleware matcher entirely", () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);

    expect(matcher.test("/theme-init.js")).toBe(false);
    expect(matcher.test("/manifest.json")).toBe(false);
    expect(matcher.test("/service-worker.js")).toBe(false);
    expect(matcher.test("/logo/favicon-32x32.png")).toBe(false);
    expect(matcher.test("/CoBolt/CoBolt_Name_Logo.png")).toBe(false);

    expect(matcher.test("/")).toBe(true);
    expect(matcher.test("/wedding-veera")).toBe(true);
    expect(matcher.test("/wedding-veera/photo/asset-123")).toBe(true);
  });

  it("adds no-transform without dropping existing cache directives", () => {
    expect(appendNoTransform(null)).toBe("no-transform");
    expect(appendNoTransform("private, max-age=0")).toBe(
      "private, max-age=0, no-transform",
    );
    expect(appendNoTransform("private, no-transform")).toBe(
      "private, no-transform",
    );
  });
});
