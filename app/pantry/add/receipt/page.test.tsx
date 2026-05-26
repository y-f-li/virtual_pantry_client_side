/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PantryReceiptUploadPage from "@/pantry/add/receipt/page";

const pushMock = jest.fn();
const postFormDataMock = jest.fn();
const setReceiptUploadSessionMock = jest.fn();

let mockUploadFile = new File(["receipt-content"], "receipt.png", { type: "image/png" });

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
  default: () => ({ value: null, set: setReceiptUploadSessionMock, clear: jest.fn() }),
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
  const Progress = ({ percent, status }: any) => <div>{`progress:${percent}:${status}`}</div>;

  const Upload = ({ children, beforeUpload }: any) => (
    <div>
      <button type="button" onClick={() => beforeUpload(mockUploadFile)}>
        Mock receipt upload trigger
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
    Space,
    Alert,
    Image,
    Progress,
    Upload,
    Row,
    Col,
    Tag,
    Typography,
    ConfigProvider,
    App,
    theme: { defaultAlgorithm: {} },
  };
});

describe("PantryReceiptUploadPage", () => {
  const originalCreateObjectURL = URL.createObjectURL;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadFile = new File(["receipt-content"], "receipt.png", { type: "image/png" });
    window.history.pushState(
      {},
      "",
      "/pantry/add/receipt?householdId=7&householdName=Test%20Household",
    );
    URL.createObjectURL = jest.fn(() => "blob:receipt-preview");
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
    URL.createObjectURL = originalCreateObjectURL;
  });

  it("renders receipt upload page and pantry target", () => {
    render(<PantryReceiptUploadPage />);

    expect(screen.getByText("Upload receipt photo")).toBeInTheDocument();
    expect(screen.getByText("Test Household")).toBeInTheDocument();
    expect(screen.getByText("Choose receipt image")).toBeInTheDocument();
  });

  it("shows preview after selecting a valid receipt image", () => {
    render(<PantryReceiptUploadPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mock receipt upload trigger" }));

    expect(screen.getByAltText("Selected receipt image")).toBeInTheDocument();
    expect(screen.getByText("Receipt image selected")).toBeInTheDocument();
    expect(screen.getByText(/receipt.png/)).toBeInTheDocument();
  });

  it("rejects unsupported receipt file types", () => {
    mockUploadFile = new File(["receipt-content"], "receipt.gif", { type: "image/gif" });

    render(<PantryReceiptUploadPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mock receipt upload trigger" }));

    expect(screen.getByText("Receipt upload issue")).toBeInTheDocument();
    expect(screen.getByText("Please upload a JPG or PNG receipt image.")).toBeInTheDocument();
  });

  it("uploads a selected receipt image and stores the analysis result", async () => {
    postFormDataMock.mockResolvedValueOnce({
      status: "succeeded",
      merchantName: "Migros",
      items: [{ description: "Milk", matchStatus: "MATCHED_BY_DESCRIPTION" }],
      rawText: "Migros Milk",
    });

    render(<PantryReceiptUploadPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mock receipt upload trigger" }));
    fireEvent.click(screen.getByRole("button", { name: /Upload and analyze receipt/i }));

    await waitFor(() => {
      expect(postFormDataMock).toHaveBeenCalledWith(
        "/households/7/receipt/upload",
        expect.any(FormData),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Receipt uploaded and analyzed")).toBeInTheDocument();
      expect(screen.getByText("Extracted 1 item from Migros.")).toBeInTheDocument();
    });

    expect(setReceiptUploadSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        householdId: 7,
        householdName: "Test Household",
        result: expect.objectContaining({ merchantName: "Migros" }),
      }),
    );
  });

  it("shows upload errors from the API", async () => {
    postFormDataMock.mockRejectedValueOnce(new Error("Receipt scanning is currently unavailable."));

    render(<PantryReceiptUploadPage />);

    fireEvent.click(screen.getByRole("button", { name: "Mock receipt upload trigger" }));
    fireEvent.click(screen.getByRole("button", { name: /Upload and analyze receipt/i }));

    await waitFor(() => {
      expect(screen.getByText("Receipt upload issue")).toBeInTheDocument();
      expect(screen.getByText("Receipt scanning is currently unavailable. Please add items manually or try again later.")).toBeInTheDocument();
    });
  });

  it("navigates back to the pantry page", () => {
    render(<PantryReceiptUploadPage />);

    fireEvent.click(screen.getByRole("button", { name: /Pantry/i }));

    expect(pushMock).toHaveBeenCalledWith(
      "/households/7/stats",
    );
  });
});
