import { describe, expect, it } from "vitest";
import {
  CONTACT_TYPE_OPTIONS,
  CALENDAR_EVENT_TYPE_OPTIONS,
  PROJECT_STATUSES,
  getProjectStatusLabel,
  isBookedOrDeliveredDealStage,
  getDealStageLabel,
} from "@/lib/crm-taxonomy";

describe("CRM taxonomy", () => {
  it("keeps contact type options aligned to the database constraint", () => {
    expect(CONTACT_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      "client",
      "vendor",
      "collaborator",
    ]);
    expect(CONTACT_TYPE_OPTIONS.map((option) => option.value)).not.toContain(
      "lead",
    );
  });

  it("keeps calendar event types aligned to the database constraint", () => {
    expect(CALENDAR_EVENT_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      "shoot",
      "meeting",
      "editing",
      "personal",
      "travel",
      "blocked",
      "other",
    ]);
  });

  it("maps backend deal stages into photographer-facing project labels", () => {
    expect(getDealStageLabel("confirmed")).toBe("Booked");
    expect(getDealStageLabel("completed")).toBe("Delivered");
    expect(isBookedOrDeliveredDealStage("confirmed")).toBe(true);
    expect(isBookedOrDeliveredDealStage("completed")).toBe(true);
    expect(isBookedOrDeliveredDealStage("proposal")).toBe(false);
  });

  it("keeps Studio Project statuses aligned to the M26 database constraint", () => {
    expect(PROJECT_STATUSES).toEqual([
      "inquiry",
      "quoted",
      "reserved",
      "booked",
      "shooting",
      "editing",
      "proofing",
      "delivered",
      "archived",
      "cancelled",
      "lost",
    ]);
    expect(getProjectStatusLabel("booked")).toBe("Booked");
    expect(getProjectStatusLabel("proofing")).toBe("Proofing");
  });
});
