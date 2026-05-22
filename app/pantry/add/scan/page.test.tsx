/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PantryScanPage from "@/pantry/add/scan/page";

const pushMock = jest.fn();
const postFormDataMock = jest.fn();

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

jest.mock("antd", () => {
  const Button = ({ children, onClick, disabled, icon, loading, ...props }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-loading={loading ? "true" : "false"}
      {...props}
    >
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
  const Alert = ({ title, message, description }: any) => (
    <div>
      <div>{title ?? message}</div>
      <div>{description}</div>
    </div>
  );

  const Image = ({ alt, src }: any) => <img alt={alt} src={src} />;

  const Upload = ({ children, beforeUpload }: any) => (
    <div>
      <button
        type="button"
        onClick={() =>
          beforeUpload(
            new File(["image-content"], "product.png", { type: "image/png" }),
          )
        }
      >
        Mock upload trigger
      </button>
      {children}
    </div>
  );

  const Row = ({ children }: any) => <div>{children}</div>;
  const Col = ({ children }: any) => <div>{children}</div>;
  const Tag = ({ children }: any) => <span>{children}</span>;

  const Typography = {
    Title: ({ children }: any) => <h1>{children}</h1>,
    Paragraph: ({ children }: any) => <p>{children}</p>,
    Text: ({ children }: any) => <span>{children}</span>,
  };

  const ConfigProvider = ({ children }: any) => <>{children}</>;

  const App = Object.assign(
    ({ children }: any) => <>{children}</>,
    {
      useApp: () => ({
        message: { warning: jest.fn(), error: jest.fn(), success: jest.fn(), info: jest.fn() },
      }),
    },
  );

  return {
    Button,
    Card,
    ConfigProvider,
    App,
    Space,
    Alert,
    Image,
    Upload,
    Row,
    Col,
    Tag,
    Typography,
    theme: { defaultAlgorithm: {} },
  };
});

describe("PantryScanPage", () => {
  const originalCreateObjectURL = URL.createObjectURL;

  beforeEach(() => {
    jest.clearAllMocks();
    window.history.pushState(
      {},
      "",
      "/pantry/add/scan?householdId=7&householdName=Test%20Household",
    );
    URL.createObjectURL = jest.fn(() => "blob:test-preview");
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
    URL.createObjectURL = originalCreateObjectURL;
  });

  it("renders scan page and pantry target", () => {
    render(<PantryScanPage />);

    expect(screen.getByText("Scan package barcode")).toBeInTheDocument();
    expect(screen.getByText("Test Household")).toBeInTheDocument();
    expect(screen.getByText("Choose a package image")).toBeInTheDocument();
  });

  it("shows preview after selecting a file", () => {
    render(<PantryScanPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mock upload trigger" }));

    expect(screen.getByAltText("Selected package barcode image")).toBeInTheDocument();
    expect(screen.getByText("Image ready")).toBeInTheDocument();
  });

  it("navigates back to pantry", () => {
    render(<PantryScanPage />);

    fireEvent.click(screen.getByRole("button", { name: /Pantry/i }));

    expect(pushMock).toHaveBeenCalledWith(
      "/households/7/stats",
    );
  });

  it("navigates to manual barcode entry", () => {
    render(<PantryScanPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /Manual barcode/i })[0]);

    expect(pushMock).toHaveBeenCalledWith(
      "/open-food-facts?householdId=7&householdName=Test%20Household",
    );
  });

  it("detects barcode and redirects to open food facts with detected barcode", async () => {
    postFormDataMock.mockResolvedValueOnce({ barcode: "7610848492087" });

    render(<PantryScanPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mock upload trigger" }));
    fireEvent.click(screen.getByRole("button", { name: /Detect barcode from image/i }));

    await waitFor(() => {
      expect(postFormDataMock).toHaveBeenCalledWith(
        "/products/barcode/extract",
        expect.any(FormData),
      );
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        "/open-food-facts?barcode=7610848492087&householdId=7&householdName=Test%20Household",
      );
    });
  });

  it("shows fallback error when barcode detection fails", async () => {
    postFormDataMock.mockRejectedValueOnce(
      new Error("No barcode detected in uploaded image."),
    );

    render(<PantryScanPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mock upload trigger" }));
    fireEvent.click(screen.getByRole("button", { name: /Detect barcode from image/i }));

    await waitFor(() => {
      expect(screen.getByText("Barcode not detected")).toBeInTheDocument();
    });

    expect(
      screen.getByText("No barcode was detected. Please use a clear, well-lit photo where the whole barcode is visible, or enter the barcode manually."),
    ).toBeInTheDocument();
  });
});
