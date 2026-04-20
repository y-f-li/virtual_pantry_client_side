"use client";

import { useEffect } from "react";
import { getApiDomain } from "@/utils/domain";
import { clearGuestSession } from "@/utils/authStorage";

export default function GuestSessionBoundary() {
  useEffect(() => {
    const handlePageHide = () => {
      const token = sessionStorage.getItem("guestToken");
      if (!token) {
        return;
      }

      fetch(`${getApiDomain()}/guest-session`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        keepalive: true,
      }).catch(() => undefined);

      clearGuestSession();
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, []);

  return null;
}
