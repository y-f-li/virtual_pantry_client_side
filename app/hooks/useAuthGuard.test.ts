import { renderHook } from "@testing-library/react";
import { useAuthGuard } from "@/hooks/useAuthGuard";

const replaceMock = jest.fn();
const warningMock = jest.fn().mockResolvedValue(undefined);

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

jest.mock("antd", () => ({
  App: {
    useApp: () => ({ message: { warning: warningMock } }),
  },
}));

describe("useAuthGuard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  it("shows warning and redirects to /login when no token is stored", () => {
    renderHook(() => useAuthGuard());
    expect(warningMock).toHaveBeenCalledWith("Please log in to continue.", 2);
    expect(replaceMock).toHaveBeenCalledWith("/login");
  });

  it("shows warning and redirects to /login when token is null", () => {
    sessionStorage.setItem("token", "null");
    renderHook(() => useAuthGuard());
    expect(warningMock).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith("/login");
  });

  it("shows warning and redirects to /login when token is an empty string", () => {
    sessionStorage.setItem("token", JSON.stringify(""));
    renderHook(() => useAuthGuard());
    expect(warningMock).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when token is malformed JSON", () => {
    sessionStorage.setItem("token", "not-json");
    renderHook(() => useAuthGuard());
    expect(warningMock).toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith("/login");
  });

  it("does not redirect when a valid token is stored", () => {
    sessionStorage.setItem("token", JSON.stringify("abc123"));
    renderHook(() => useAuthGuard());
    expect(warningMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
