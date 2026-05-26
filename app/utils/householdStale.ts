import type { ApplicationError } from "@/types/error";

export function isStaleHouseholdError(error: unknown): boolean {
  const status = (error as Partial<ApplicationError> | undefined)?.status;
  if (status === 404) return true;

  const message = error instanceof Error ? error.message : "";
  return (
    status === 403 &&
    (message.includes("User is not a member") ||
      message.includes("not a member of this household") ||
      message.includes("Household not available"))
  );
}

export function getStaleHouseholdMessage(error: unknown): string {
  const status = (error as Partial<ApplicationError> | undefined)?.status;
  if (status === 404) {
    return "This household is no longer available.";
  }
  return "You no longer have access to this household.";
}
