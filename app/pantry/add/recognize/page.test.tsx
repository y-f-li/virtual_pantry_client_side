/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FoodRecognitionPage from "@/pantry/add/recognize/page";

const pushMock = jest.fn();
const postFormDataMock = jest.fn();
const warningMock = jest.fn();

jest.mock("@/components/VirtualPantryAppShell", () => ({
  VirtualPantryAppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));

jest.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({ isAuthenticated: true }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

jest.mock("@/hooks/useApi", () => ({
  useApi: () => ({ postFormData: postFormDataMock }),
}));

jest.mock("@/hooks/useSessionStorage", () => ({
  __esModule: true,
  default: (key: string) => {
    if (key === "token") return { value: "token", set: jest.fn(), clear: jest.fn() };
    if (key === "userId") return { value: "99", set: jest.fn(), clear: jest.fn() };
    if (key === "households") return { value: [], set: jest.fn(), clear: jest.fn() };
    return { value: null, set: jest.fn(), clear: jest.fn() };
  },
}));

jest.mock("@/hooks/usePantryWebSocket", () => ({
  usePantryWebSocket: jest.fn(),
}));

jest.mock("antd", () => {
  const Button = ({ children, onClick, disabled, icon, loading, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-loading={loading ? "true" : "false"} {...props}>
      {icon}
      {children}
    </button>
  );
  const Card = ({ children, title }: any) => (
    <div>
      {title ? <div>{title}</div> : null}
      <div>{children}</div>
    </div>
  );
  const Space = ({ children }: any) => <div>{children}</div>;
  const Alert = ({ title, message, description, action }: any) => (
    <div>
      <div>{title ?? message}</div>
      <div>{description}</div>
      {action}
    </div>
  );
  const Image = ({ alt, src }: any) => <img alt={alt} src={src} />;
  const Row = ({ children }: any) => <div>{children}</div>;
  const Col = ({ children }: any) => <div>{children}</div>;
  const Tag = ({ children }: any) => <span>{children}</span>;
  const Typography = {
    Title: ({ children }: any) => <h1>{children}</h1>,
    Paragraph: ({ children }: any) => <p>{children}</p>,
    Text: ({ children }: any) => <span>{children}</span>,
  };
  const ConfigProvider = ({ children }: any) => <>{children}</>;
  const App = Object.assign(({ children }: any) => <>{children}</>, {
    useApp: () => ({
      message: { warning: warningMock, error: jest.fn(), success: jest.fn(), info: jest.fn() },
    }),
  });

  return {
    Alert,
    App,
    Button,
    Card,
    Col,
    ConfigProvider,
    Image,
    Row,
    Space,
    Tag,
    Typography,
    theme: { defaultAlgorithm: {} },
  };
});

describe("FoodRecognitionPage", () => {
  const originalCreateObjectURL = URL.createObjectURL;

  beforeEach(() => {
    jest.clearAllMocks();
    window.history.pushState(
      {},
      "",
      "/pantry/add/recognize?householdId=7&householdName=Test%20Household",
    );
    URL.createObjectURL = jest.fn(() => "blob:test-preview");
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
    URL.createObjectURL = originalCreateObjectURL;
  });

  it("recognizes food and navigates to manual add with prefilled fields", async () => {
    postFormDataMock.mockResolvedValueOnce({
      status: "RECOGNIZED",
      detectedFoods: ["rice"],
      recognizedFoods: [
        {
          name: "Rice",
          kcalPer100g: 130,
          suggestedAmount: 150,
          unit: "g",
          confidence: 0.8,
        },
      ],
      message: "Detected rice.",
    });

    render(<FoodRecognitionPage />);

    const file = new File(["fake-image"], "meal.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Meal photo"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Recognize food from photo/i }));

    await waitFor(() => {
      expect(postFormDataMock).toHaveBeenCalledWith(
        "/households/7/pantry/recognize-food",
        expect.any(FormData),
      );
    });

    expect(await screen.findByText("Rice")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review and add" }));

    expect(pushMock).toHaveBeenCalledWith(
      "/pantry/add/manual?householdId=7&householdName=Test+Household&name=Rice&unit=g&amount=150&calories=130",
    );
  });

  it("shows manual fallback without blocking manual add", async () => {
    postFormDataMock.mockResolvedValueOnce({
      status: "MANUAL_FALLBACK",
      detectedFoods: [],
      recognizedFoods: [],
      message: "Automatic food recognition failed. Please enter the food manually.",
    });

    render(<FoodRecognitionPage />);

    const file = new File(["fake-image"], "meal.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Meal photo"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Recognize food from photo/i }));

    expect(await screen.findByText("Manual fallback")).toBeInTheDocument();
    expect(warningMock).toHaveBeenCalledWith("Automatic food recognition failed. Please enter the food manually.");
    fireEvent.click(screen.getByRole("button", { name: "Add manually" }));

    expect(pushMock).toHaveBeenCalledWith(
      "/pantry/add/manual?householdId=7&householdName=Test+Household",
    );
  });
});
