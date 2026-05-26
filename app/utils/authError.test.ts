import { getLoginErrorMessage, getRegisterErrorMessage } from "@/utils/authError";

describe("authError helpers", () => {
  it("maps login unauthorized errors to user-friendly message", () => {
    const message = getLoginErrorMessage({
      status: 401,
      message: "Invalid credentials",
    });
    expect(message).toBe("Username or password is incorrect. Please try again.");
  });

  it("maps register duplicate username errors to user-friendly message", () => {
    const message = getRegisterErrorMessage({
      status: 400,
      message: "The username is already taken",
    });
    expect(message).toBe("This username is already taken. Please choose another one.");
  });

  it("maps non-application errors to network message", () => {
    const message = getLoginErrorMessage(new Error("NetworkError"));
    expect(message).toBe("Unable to connect. Please check your network and try again.");
  });

  it("maps login server errors to fallback server message", () => {
    const message = getLoginErrorMessage({
      status: 500,
      message: "Internal error",
    });
    expect(message).toBe("Server is currently unavailable. Please try again later.");
  });

  it("keeps login detail for other application errors", () => {
    const message = getLoginErrorMessage({
      status: 400,
      message: "Validation error",
    });
    expect(message).toBe("Login failed:\nValidation error");
  });

  it("maps register server errors to fallback server message", () => {
    const message = getRegisterErrorMessage({
      status: 503,
      message: "Temporarily unavailable",
    });
    expect(message).toBe("Server is currently unavailable. Please try again later.");
  });

  it("keeps register detail for other application errors", () => {
    const message = getRegisterErrorMessage({
      status: 422,
      message: "Payload invalid",
    });
    expect(message).toBe("Registration failed:\nPayload invalid");
  });

  it("maps unknown values to generic register message", () => {
    const message = getRegisterErrorMessage("unexpected");
    expect(message).toBe("An unknown error occurred during registration.");
  });
});
