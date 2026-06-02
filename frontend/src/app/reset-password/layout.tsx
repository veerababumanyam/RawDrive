import type { Metadata } from "next";
import { createNoIndexMetadata } from "@/lib/seo";

export const metadata: Metadata = createNoIndexMetadata(
  "Reset password",
  "Choose a new password for your RawDrive account.",
  "/reset-password",
);

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
