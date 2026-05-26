export interface Household {
  householdId: number;
  name: string;
  inviteCode: string;
  ownerId: number;
  createdAt?: string;
  inviteCodeExpiresAt?: string | null;
}

export interface HouseholdWithRole extends Household {
  role: "owner" | "member";
}

export interface HouseholdInviteCodeResponse {
  householdId: number;
  inviteCode: string;
  expiresAt?: string | null;
}

// Issue #121 — member entry returned by GET /households/{id}/members
export interface HouseholdMember {
  userId: number;
  username: string;
  role: "owner" | "member";
  joinedAt: string;
}
