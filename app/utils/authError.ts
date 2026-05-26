import { ApplicationError } from "@/types/error";

export const isApplicationError = (error: unknown): error is ApplicationError => {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number" &&
    "message" in error
  );
};

export const getLoginErrorMessage = (error: unknown): string => {
  if (isApplicationError(error)) {
    if (error.status === 401) {
      return "Username or password is incorrect. Please try again.";
    }
    if (error.status >= 500) {
      return "Server is currently unavailable. Please try again later.";
    }
    return `Login failed:\n${error.message}`;
  }
  if (error instanceof Error) {
    return "Unable to connect. Please check your network and try again.";
  }
  return "An unknown error occurred during login.";
};

export const getRegisterErrorMessage = (error: unknown): string => {
  if (isApplicationError(error)) {
    const message = error.message.toLowerCase();
    if (error.status === 400 && message.includes("username")) {
      return "This username is already taken. Please choose another one.";
    }
    if (error.status >= 500) {
      return "Server is currently unavailable. Please try again later.";
    }
    return `Registration failed:\n${error.message}`;
  }
  if (error instanceof Error) {
    return "Unable to connect. Please check your network and try again.";
  }
  return "An unknown error occurred during registration.";
};
