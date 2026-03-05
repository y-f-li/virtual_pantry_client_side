"use client";

import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";

export function useLogout() {
  const api = useApi();
  const router = useRouter();

  return async () => {
    try {
      await api.post("/logout", {});
    } catch {
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("userId");
      router.push("/login");
    }
  };
}