import { redirect } from "next/navigation";

// QA T-068 (RawDrive_Testing.xlsx Admin sheet): the user-menu link in
// the dashboard header points to `/settings`, but no root settings page
// existed — only the nested children (/settings/profile, /business,
// /security, /storage, /packages). Clicking the menu item rendered the
// Next.js 404. Redirecting the root segment to /settings/profile (the
// most common landing) keeps the menu link functional without forcing
// an opinionated index page through QA review.
export default function SettingsRootPage() {
  redirect("/settings/profile");
}
