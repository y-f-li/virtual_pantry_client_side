"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { App } from "antd";

export function useAuthGuard(): { isAuthenticated: boolean } {
  const router = useRouter();
  const { message } = App.useApp();
  const apiService = useApi();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let token: string | null = null;
    try {
      token = JSON.parse(sessionStorage.getItem("token") ?? "null") as string | null;
    } catch {
      token = null;
    }

    if (!token) {
      message.warning("Please log in to continue.", 2);
      router.replace("/login");
      return;
    }

    apiService.get("/users/me")
      .then(() => { if (!cancelled) setIsAuthenticated(true); })
      .catch((error: unknown) => {
        if (cancelled) return;
        if ((error as { status?: number })?.status === 401) {
          sessionStorage.removeItem("token");
          sessionStorage.removeItem("username");
          message.warning("Your session has expired. Please log in again.", 2);
          router.replace("/login");
        } else {
          setIsAuthenticated(true);
        }
      });

    return () => { cancelled = true; };
  }, [router, message, apiService]);

  return { isAuthenticated };
}
