"use client";

import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useSessionStorage from "@/hooks/useSessionStorage";
import type { User } from "@/types/user";
import type { HouseholdWithRole } from "@/types/household";

export function useStartGuestSession() {
  const router = useRouter();
  const apiService = useApi();

  const { set: setToken } =
    useSessionStorage<string>("token", "");

  const { set: setUserId } =
    useSessionStorage<string>("userId", "");

  const { set: setUsername } =
    useSessionStorage<string>("username", "");

  const { set: setHouseholds } =
    useSessionStorage<HouseholdWithRole[]>("households", []);

  const { set: setSelectedHouseholdId } =
    useSessionStorage<number | null>("selectedHouseholdId", null);

  const startGuestSession = async (): Promise<void> => {
    const guest = await apiService.post<User>("/users/demo", {});

    if (!guest.token || !guest.id || !guest.username) {
      throw new Error("Invalid guest response");
    }

    setToken(guest.token);
    setUserId(String(guest.id));
    setUsername(guest.username);

    try {
        const households =
            await apiService.get<HouseholdWithRole[]>("/households");

        setHouseholds(households);

        if (households.length === 1) {
            const id = households[0].householdId;

            setSelectedHouseholdId(id);
            router.push(`/households/${id}/stats`);
            return;
        }

    } catch {
        setHouseholds([]);
    }

    router.push("/households");
  };

  return startGuestSession;
}
