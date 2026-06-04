export type TaxonomyOption = {
  value: string;
  label: string;
};

export const CONTACT_TYPE_OPTIONS: TaxonomyOption[] = [
  { value: "client", label: "Client" },
  { value: "vendor", label: "Vendor" },
  { value: "collaborator", label: "Collaborator" },
];

export const CALENDAR_EVENT_TYPE_OPTIONS: TaxonomyOption[] = [
  { value: "shoot", label: "Photography shoot" },
  { value: "meeting", label: "Meeting / consultation" },
  { value: "editing", label: "Editing session" },
  { value: "personal", label: "Personal" },
  { value: "travel", label: "Travel / transit" },
  { value: "blocked", label: "Blocked time" },
  { value: "other", label: "Other" },
];

export const DEAL_STAGES = [
  "proposal",
  "negotiation",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export const DEAL_STAGE_LABEL: Record<string, string> = {
  proposal: "Proposal",
  negotiation: "Negotiation",
  confirmed: "Booked",
  in_progress: "In progress",
  completed: "Delivered",
  cancelled: "Cancelled",
};

export const DEAL_STAGE_CLASS: Record<string, string> = {
  proposal: "status-badge status-badge--info",
  negotiation: "status-badge status-badge--warning",
  confirmed: "status-badge status-badge--success",
  in_progress: "status-badge status-badge--accent",
  completed: "status-badge status-badge--accent",
  cancelled: "status-badge status-badge--danger",
};

export const DEFAULT_PHOTOGRAPHY_SAC = "998386";

export const PROJECT_STATUSES = [
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
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  inquiry: "Inquiry",
  quoted: "Quoted",
  reserved: "Reserved",
  booked: "Booked",
  shooting: "Shooting",
  editing: "Editing",
  proofing: "Proofing",
  delivered: "Delivered",
  archived: "Archived",
  cancelled: "Cancelled",
  lost: "Lost",
};

export const PROJECT_STATUS_CLASS: Record<string, string> = {
  inquiry: "status-badge status-badge--neutral",
  quoted: "status-badge status-badge--info",
  reserved: "status-badge status-badge--warning",
  booked: "status-badge status-badge--success",
  shooting: "status-badge status-badge--accent",
  editing: "status-badge status-badge--accent",
  proofing: "status-badge status-badge--info",
  delivered: "status-badge status-badge--success",
  archived: "status-badge status-badge--neutral",
  cancelled: "status-badge status-badge--danger",
  lost: "status-badge status-badge--danger",
};

export function getProjectStatusLabel(status: string): string {
  return PROJECT_STATUS_LABEL[status] ?? status;
}

export function getDealStageLabel(stage: string): string {
  return DEAL_STAGE_LABEL[stage] ?? stage;
}

export function isBookedOrDeliveredDealStage(stage: string): boolean {
  return stage === "confirmed" || stage === "completed";
}
