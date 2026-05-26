import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import HealthGoalPage from "@/users/[id]/health-goal/page";

const pushMock = jest.fn();
const backMock = jest.fn();
const getMock = jest.fn();
const putMock = jest.fn();
const messageMock = { error: jest.fn(), success: jest.fn() };

jest.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({ isAuthenticated: true }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: backMock, replace: jest.fn() }),
  useParams: () => ({ id: "1" }),
}));

jest.mock("@/components/VirtualPantryAppShell", () => ({
  VirtualPantryAppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));

jest.mock("@/hooks/useApi", () => ({
  useApi: () => ({ get: getMock, put: putMock }),
}));

jest.mock("@/hooks/useSessionStorage", () => ({
  __esModule: true,
  default: (key: string) => {
    if (key === "userId") return { value: "1", set: jest.fn(), clear: jest.fn() };
    return { value: "", set: jest.fn(), clear: jest.fn() };
  },
}));

jest.mock("antd", () => {
  const actual = jest.requireActual("antd");
  return {
    ...actual,
    App: {
      useApp: () => ({ message: messageMock }),
    },
  };
});

describe("HealthGoalPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows form when no goal exists (404)", async () => {
    getMock.mockRejectedValueOnce({ status: 404 });
    render(<HealthGoalPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save health goal/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/kcal/i)).not.toBeInTheDocument();
  });

  it("shows recommendation when goal already exists", async () => {
    getMock.mockResolvedValueOnce({
      goalId: 1,
      userId: 1,
      goalType: "MAINTAIN",
      targetRate: null,
      targetWeight: null,   // new fields now returned by backend
      weeksToGoal: null,
      age: 28,
      sex: "FEMALE",
      height: 165,
      weight: 62,
      activityLevel: "MODERATE",
      recommendedDailyCalories: 2092,
      updatedAt: "2026-04-27T10:00:00Z",
    });
    render(<HealthGoalPage />);
    await waitFor(() => {
      expect(screen.getByText(/2[,\s]?092/)).toBeInTheDocument();
    });
  });

  it("does not show success message before form is submitted", async () => {
    getMock.mockRejectedValueOnce({ status: 404 });
    render(<HealthGoalPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save health goal/i })).toBeInTheDocument();
    });
    expect(messageMock.success).not.toHaveBeenCalled();
  });

  it("shows reset button", async () => {
    getMock.mockRejectedValueOnce({ status: 404 });
    render(<HealthGoalPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /reset/i })).toBeInTheDocument();
    });
  });

  it("shows target weight and weeks fields when lose weight is selected", async () => {
    getMock.mockResolvedValueOnce({
      goalId: 1,
      userId: 1,
      goalType: "LOSE_WEIGHT",
      targetRate: 0.5,
      targetWeight: 75.0,   // new fields now returned by backend
      weeksToGoal: 20,
      age: 30,
      sex: "MALE",
      height: 175,
      weight: 85,
      activityLevel: "LIGHT",
      recommendedDailyCalories: 1900,
      updatedAt: "2026-04-27T10:00:00Z",
    });
    render(<HealthGoalPage />);
    await waitFor(() => {
      expect(screen.getByText(/target weight/i)).toBeInTheDocument();
      expect(screen.getByText(/weeks to goal/i)).toBeInTheDocument();
    });
  });
});
