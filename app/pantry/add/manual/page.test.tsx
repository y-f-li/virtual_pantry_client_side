/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ManualAddPantryItemPage from "./page";

jest.mock("@/components/VirtualPantryAppShell", () => ({
  VirtualPantryAppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));

const getMock = jest.fn();
const postMock = jest.fn();
const pushMock = jest.fn();
const backMock = jest.fn();
const replaceMock = jest.fn();
const warningMock = jest.fn();
const errorMock = jest.fn();
const successMock = jest.fn();

jest.mock("@/hooks/useApi", () => ({
  useApi: () => ({ get: getMock, post: postMock }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: backMock, replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

jest.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({ isAuthenticated: true }),
}));

jest.mock("@/hooks/usePantryWebSocket", () => ({
  usePantryWebSocket: () => ({ connected: false, hasConnectedOnce: false }),
}));

jest.mock("@/hooks/useSessionStorage", () => ({
  __esModule: true,
  default: (key: string) => {
    if (key === "households") return { value: [], set: jest.fn(), clear: jest.fn() };
    return { value: "", set: jest.fn(), clear: jest.fn() };
  },
}));

jest.mock("antd", () => {
  const Card = ({ children, title }: any) => <div><div>{title}</div>{children}</div>;
  const Space = ({ children }: any) => <div>{children}</div>;
  const Button = ({ children, onClick, loading }: any) => (
    <button type="button" onClick={onClick} disabled={!!loading}>{children}</button>
  );
  const Input = ({ value, onChange, placeholder }: any) => (
    <input aria-label={placeholder} value={value} onChange={onChange} placeholder={placeholder} />
  );
  const Typography = {
    Title: ({ children }: any) => <h1>{children}</h1>,
    Paragraph: ({ children }: any) => <p>{children}</p>,
  };
  const App = {
    useApp: () => ({ message: { error: errorMock, warning: warningMock, success: successMock } }),
  };
  const DatePicker = ({ placeholder, onChange }: any) => (
    <input type="date" placeholder={placeholder} onChange={(e) => onChange?.(e.target.value ? { format: () => e.target.value } : null)} />
  );
  return { App, Button, Card, DatePicker, Input, Space, Typography };
});

describe("ManualAddPantryItemPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.pushState({}, "", "/pantry/add/manual?householdId=7&householdName=Test%20Home");
    getMock.mockResolvedValue({ householdId: 7, name: "Test Home" });
  });

  it("renders form after household validation", async () => {
    render(<ManualAddPantryItemPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("e.g. Whole Milk")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("e.g. 3017624010701")).toBeInTheDocument();
    expect(screen.getByLabelText("Unit")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount in package")).toBeInTheDocument();
    expect(screen.getByLabelText("Calories per package (kcal)")).toBeInTheDocument();
    expect(screen.getByText("Optional micronutrients")).toBeInTheDocument();
  });

  it("shows 'Calories per 100g (kcal)' label when unit is g", async () => {
    render(<ManualAddPantryItemPage />);
    await waitFor(() => expect(screen.getByLabelText("Unit")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "g" } });

    expect(screen.getByLabelText("Calories per 100g (kcal)")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount in g")).toBeInTheDocument();
  });

  it("shows 'Calories per 100ml (kcal)' label when unit is ml", async () => {
    render(<ManualAddPantryItemPage />);
    await waitFor(() => expect(screen.getByLabelText("Unit")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "ml" } });

    expect(screen.getByLabelText("Calories per 100ml (kcal)")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount in ml")).toBeInTheDocument();
  });

  it("shows warning and does not submit when name is empty", async () => {
    render(<ManualAddPantryItemPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add to pantry" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Add to pantry" }));

    expect(postMock).not.toHaveBeenCalled();
    expect(warningMock).toHaveBeenCalledWith("Product name is required.");
  });

  it("shows warning and does not submit when calories is zero", async () => {
    render(<ManualAddPantryItemPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add to pantry" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("e.g. Whole Milk"), { target: { value: "Milk" } });
    fireEvent.change(screen.getByLabelText("Calories per package (kcal)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to pantry" }));

    expect(postMock).not.toHaveBeenCalled();
    expect(warningMock).toHaveBeenCalledWith("Calories must be greater than zero.");
  });

  it("posts correct payload and shows success message", async () => {
    postMock.mockResolvedValueOnce({ id: 1 });
    render(<ManualAddPantryItemPage />);
    await waitFor(() => expect(screen.getByLabelText("e.g. Whole Milk")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("e.g. Whole Milk"), { target: { value: "Milk" } });
    fireEvent.change(screen.getByLabelText("Calories per package (kcal)"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Amount in package"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to pantry" }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith("/households/7/pantry", {
        barcode: "",
        name: "Milk",
        amount: 2,
        amountUnit: "package",
        kcalPerPackage: 250,
        kcalPer100g: null,
        kcalPer100ml: null,
        kcalPerServing: null,
        manualEntry: true,
        expirationDate: null,
      });
    });
    expect(successMock).toHaveBeenCalledWith("Item added to Test Home.");
    expect(pushMock).toHaveBeenCalledWith("/households/7/stats");
  });


  it("posts optional micronutrients when manually entered", async () => {
    postMock.mockResolvedValueOnce({ id: 3 });
    render(<ManualAddPantryItemPage />);
    await waitFor(() => expect(screen.getByLabelText("e.g. Whole Milk")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("e.g. Whole Milk"), { target: { value: "Milk" } });
    fireEvent.change(screen.getByLabelText("Calories per package (kcal)"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Calcium micronutrient amount"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Calcium micronutrient unit"), { target: { value: "mg" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to pantry" }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith("/households/7/pantry", expect.objectContaining({
        manualEntry: true,
        micronutrients: {
          calcium: { value: 120, unit: "mg" },
        },
      }));
    });
  });

  it("posts kcalPer100g when unit is g", async () => {
    postMock.mockResolvedValueOnce({ id: 2 });
    render(<ManualAddPantryItemPage />);
    await waitFor(() => expect(screen.getByLabelText("Unit")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "g" } });
    fireEvent.change(screen.getByLabelText("e.g. Whole Milk"), { target: { value: "Oat Flakes" } });
    fireEvent.change(screen.getByLabelText("Calories per 100g (kcal)"), { target: { value: "380" } });
    fireEvent.change(screen.getByLabelText("Amount in g"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to pantry" }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith("/households/7/pantry", {
        barcode: "",
        name: "Oat Flakes",
        amount: 100,
        amountUnit: "g",
        kcalPerPackage: null,
        kcalPer100g: 380,
        kcalPer100ml: null,
        kcalPerServing: null,
        manualEntry: true,
        expirationDate: null,
      });
    });
  });

  it("shows API error message on failed submit", async () => {
    postMock.mockRejectedValueOnce(new Error("server error"));
    render(<ManualAddPantryItemPage />);
    await waitFor(() => expect(screen.getByLabelText("e.g. Whole Milk")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("e.g. Whole Milk"), { target: { value: "Milk" } });
    fireEvent.change(screen.getByLabelText("Calories per package (kcal)"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to pantry" }));

    await waitFor(() => {
      expect(errorMock).toHaveBeenCalledWith("server error");
    });
  });

  it("shows error and redirects when householdId is missing", async () => {
    window.history.pushState({}, "", "/pantry/add/manual");

    render(<ManualAddPantryItemPage />);

    await waitFor(() => {
      expect(errorMock).toHaveBeenCalledWith("Household ID is missing or invalid.");
    });
  });
});
