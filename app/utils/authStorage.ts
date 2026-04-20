export function getActiveToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("guestToken") || localStorage.getItem("token");
}

export function isGuestMode(): boolean {
  if (typeof window === "undefined") return false;
  return !!sessionStorage.getItem("guestToken");
}

export function storeGuestSession(token: string, username?: string | null): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem("guestToken", token);
  if (username) {
    sessionStorage.setItem("guestUsername", username);
  } else {
    sessionStorage.removeItem("guestUsername");
  }
}

export function clearGuestSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("guestToken");
  sessionStorage.removeItem("guestUsername");
}

export function storeUserSession(token: string, userId?: number | string | null): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("token", token);
  if (userId != null) {
    localStorage.setItem("userId", String(userId));
  }
}

export function clearUserSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  localStorage.removeItem("userId");
}
