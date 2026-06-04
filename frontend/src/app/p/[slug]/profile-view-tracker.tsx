"use client";

import { useEffect } from "react";
import { trackPublicProfileView } from "@/lib/api/photographer-profile";

export function ProfileViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    trackPublicProfileView(slug);
  }, [slug]);

  return null;
}
