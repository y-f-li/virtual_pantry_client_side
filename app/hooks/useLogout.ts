"use client";

import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { clearGuestSession, clearUserSession, getActiveToken, isGuestMode } from "@/utils/authStorage";

export function useLogout() {
  const api = useApi();
  const router = useRouter();

  return async () => {
    const token = getActiveToken();
    const guest = isGuestMode();

    try {
      if (token) {
        if (guest) {
          await api.delete("/guest-session");
        } else {
          await api.post("/logout", {});
        }
      }
    } catch {
    } finally {
      clearGuestSession();
      clearUserSession();
      router.push("/");
    }
  };
}
