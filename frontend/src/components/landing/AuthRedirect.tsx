"use client";

/**
 * AuthRedirect — checks if user is logged in and redirects to their dashboard.
 *
 * Fixes Issue #5: navigating to "/" while logged in shows landing page
 * instead of redirecting to the app.
 *
 * Renders nothing — purely a side-effect component placed at the top of
 * the landing page. If the user has a valid access token (or can refresh
 * one), they're redirected to getPostLoginPath(). Otherwise, the landing
 * page renders normally.
 */

import { useEffect } from "react";
import {
  getStoredAccessToken,
  getPostLoginPath,
  refreshAuthSession,
} from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export function AuthRedirect() {
  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      let token = getStoredAccessToken();
      if (!token) {
        token = await refreshAuthSession(API_BASE);
      }
      if (cancelled || !token) {
        return; // not logged in — show landing page
      }
      window.location.replace(getPostLoginPath());
    }

    void checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
