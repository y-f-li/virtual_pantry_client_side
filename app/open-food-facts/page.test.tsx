/* eslint-disable @typescript-eslint/no-explicit-any, react/display-name */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OpenFoodFactsPage from "./page";

jest.mock("@/components/VirtualPantryAppShell", () => ({
  VirtualPantryAppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));

const getMock = jest.fn();
const pushMock = jest.fn();
const messageMock = { error: jest.fn(), warning: jest.fn(), success: jest.fn() };
const mockApi = { get: getMock };

jest.mock("@/components/products/ProductResultCard", () => (props: any) => (
  <div data-testid={`product-card-${props.exportContext}`}>
    <div>{props.product.name}</div>
    <div>{props.product.barcode}</div>
    <div>{props.pantryContext ? `pantry:${props.pantryContext.householdId}:${props.pantryContext.householdName}` : "no-pantry"}</div>
  </div>
));

jest.mock("antd", () => {
  const Card = ({ children }: any) => <div>{children}</div>;
  const Space = ({ children }: any) => <div>{children}</div>;
  const Empty = ({ description }: any) => <div>{description}</div>;
  const Button = ({ children, onClick, disabled, "aria-label": ariaLabel }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel}>{children}</button>
  );
  const Image = ({ alt, src }: any) => <img alt={alt} src={src} />;
  const Input = ({ value, onChange, onPressEnter, placeholder }: any) => (
    <input
      aria-label={placeholder}
      value={value}
      onChange={onChange}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onPressEnter?.(event);
        }
      }}
      placeholder={placeholder}
    />
  );

  const Typography = {
    Title: ({ children }: any) => <h1>{children}</h1>,
    Paragraph: ({ children }: any) => <p>{children}</p>,
  };

  const App = {
    useApp: () => ({ message: messageMock }),
  };

  return { App, Button, Card, Empty, Image, Input, Space, Typography };
});

jest.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({ isAuthenticated: true }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

jest.mock("@/hooks/useApi", () => ({
  useApi: () => mockApi,
}));

jest.mock("@/hooks/usePantryWebSocket", () => ({
  usePantryWebSocket: () => ({ connected: false, hasConnectedOnce: false }),
}));

jest.mock("@/hooks/useSessionStorage", () => ({
  __esModule: true,
  default: (key: string) => {
    if (key === "households") return { value: [], set: jest.fn(), clear: jest.fn() };
    if (key === "receiptUploadSession") return { value: null, set: jest.fn(), clear: jest.fn() };
    return { value: "", set: jest.fn(), clear: jest.fn() };
  },
}));

describe("Open Food Facts page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.alert = jest.fn();
    window.history.pushState({}, "", "/open-food-facts");
    sessionStorage.clear();
  });

  it("looks up a barcode and renders the returned product card", async () => {
    getMock.mockResolvedValue({ name: "Fanta Zero", barcode: "90331701" });

    render(<OpenFoodFactsPage />);

    expect(screen.getByRole("button", { name: "Scan package barcode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recognize food from photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload receipt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add manually" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("e.g. 3017624010701"), {
      target: { value: "90331701" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Look up barcode" }));

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith("/products/lookup?barcode=90331701");
    });

    expect(screen.getByText("Fanta Zero")).toBeInTheDocument();
  });



  it("searches by product name, loads top compact products, and selects one by product index", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "/products/search?q=TIK%20UDON%20Noodles&limit=10") {
        return Promise.resolve({
          query: "TIK UDON Noodles",
          normalizedQuery: "tik udon noodles",
          status: "OK",
          message: "Choose one of the matching local dataset products.",
          totalCandidateCount: 2,
          anchorTokens: ["udon", "noodles"],
          auxiliaryTokens: ["tik"],
          candidates: [
            {
              productIndex: 3207438,
              barcode: null,
              name: "Nouilles Udon",
              brand: "Tiger Kitchen",
              quantity: "200 g",
              score: 556.327,
            },
          ],
        });
      }

      if (url === "/products/index/3207438") {
        return Promise.resolve({
          productIndex: 3207438,
          barcode: "7613312434086",
          name: "Nouilles Udon",
          brand: "Tiger Kitchen",
          imageUrl: "https://example.test/udon.jpg",
        });
      }

      return Promise.reject(new Error("unexpected: " + url));
    });

    render(<OpenFoodFactsPage />);

    fireEvent.change(screen.getByLabelText("e.g. TIK UDON Noodles"), {
      target: { value: "TIK UDON Noodles" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search by name" }));

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith("/products/search?q=TIK%20UDON%20Noodles&limit=10");
      expect(getMock).toHaveBeenCalledWith("/products/index/3207438");
    });

    expect(await screen.findByRole("button", { name: "Select Nouilles Udon" })).toBeInTheDocument();
    expect(screen.getByText("Tiger Kitchen")).toBeInTheDocument();
    expect(screen.getByText("7613312434086")).toBeInTheDocument();
    expect(screen.queryByText(/Index 3207438/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Anchors:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Auxiliary:/)).not.toBeInTheDocument();
    expect(screen.queryByText("Choose one of the matching local dataset products.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select Nouilles Udon" }));

    expect(screen.getByText("Selected product")).toBeInTheDocument();
    expect(screen.getByTestId("product-card-Product name lookup")).toBeInTheDocument();
  });

  it("triggers lookup when Enter is pressed in the barcode field", async () => {
    getMock.mockResolvedValue({ name: "Enter Product", barcode: "5000168198514" });

    render(<OpenFoodFactsPage />);

    fireEvent.change(screen.getByLabelText("e.g. 3017624010701"), {
      target: { value: "5000168198514" },
    });
    fireEvent.keyDown(screen.getByLabelText("e.g. 3017624010701"), { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith("/products/lookup?barcode=5000168198514");
    });
  });

  it("AUTO lookup when barcode is passed via query params", async () => {
    window.history.pushState(
      {},
      "",
      "/open-food-facts?barcode=9999&householdId=5&householdName=Test",
    );

    getMock.mockImplementation((url: string) => {
      if (url === "/households/5") return Promise.resolve({ householdId: 5, name: "Test" });
      if (url.includes("/products/lookup")) return Promise.resolve({ name: "Auto Product", barcode: "9999" });
      return Promise.reject(new Error("unexpected: " + url));
    });

    render(<OpenFoodFactsPage />);

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith("/products/lookup?barcode=9999");
    });

    expect(screen.getByText("Auto Product")).toBeInTheDocument();
    expect(screen.getByText("pantry:5:Test")).toBeInTheDocument();
  });

  it("shows an inline message when the barcode lookup fails", async () => {
    getMock.mockRejectedValue(new Error("lookup failed"));

    render(<OpenFoodFactsPage />);

    fireEvent.change(screen.getByLabelText("e.g. 3017624010701"), {
      target: { value: "0000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Look up barcode" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot find the item using the barcode.",
    );
    expect(globalThis.alert).not.toHaveBeenCalledWith("lookup failed");
    expect(screen.queryByText("No product loaded yet.")).not.toBeInTheDocument();
  });

  it("navigates back to the household page", async () => {
    render(<OpenFoodFactsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Manage" }));

    expect(pushMock).toHaveBeenCalledWith("/households");
  });
});
