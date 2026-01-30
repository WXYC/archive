"use client";

import { useEffect } from "react";
import { usePostHog } from "posthog-js/react";
import { useAuth } from "@/lib/auth";

export function PostHogAuthSync() {
  const { isAuthenticated, isLoading } = useAuth();
  const posthog = usePostHog();

  useEffect(() => {
    if (!isLoading) {
      posthog?.register({ is_logged_in: isAuthenticated });
    }
  }, [isAuthenticated, isLoading, posthog]);

  return null;
}
