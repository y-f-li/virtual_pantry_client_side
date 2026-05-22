/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReceiptReviewPage from "@/pantry/add/receipt/review/page";

const pushMock = jest.fn();
const postMock = jest.fn();
const clearSessionMock = jest.fn();

let mockSession: any;

const receiptSession = {
  householdId: 7,
  householdName: "Test Household",
  uploadedAt: "2026-05-07T12:00:00.000Z",
  result: {
    status: "succeeded",
    merchantName: "Green Mart",
    items: [
      {
        description: "LG EGGS 12 CT",
        quantity: "1",
        price: "2.79",
        totalPrice: "2.79",
        productCode: null,
        rawItem: null,
        matchStatus: "MATCHED_BY_DESCRIPTION",
        matchSource: "openfoodfacts_search",
        matchConfidence: "HIGH",
        matchScore: 1,
        normalizedDescription: "large egg",
        matchedProduct: { barcode: "111", name: "Large Eggs 12 Count", brand: "Farm", quantity: "12 ct", caloriesPerPackage: 840 },
        suggestedPantryItem: {
          barcode: "111",
          name: "Large Eggs 12 Count",
          kcalPerPackage: 840,
          quantity: 1,
          packageQuantity: "12 ct",
          nutriments: null,
          readyForBulkAdd: true,
        },
        candidateProducts: [
          {
            product: { barcode: "111", name: "Large Eggs 12 Count", brand: "Farm", quantity: "12 ct", caloriesPerPackage: 840 },
            score: 1,
            confidence: "HIGH",
            matchSource: "openfoodfacts_search",
            suggestedPantryItem: {
              barcode: "111",
              name: "Large Eggs 12 Count",
              kcalPerPackage: 840,
              quantity: 1,
              packageQuantity: "12 ct",
              nutriments: null,
              readyForBulkAdd: true,
            },
          },
        ],
      },
    ],
    rawText: "Green Mart",
  },
};

jest.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({ isAuthenticated: true }),
}));

jest.mock("@/components/VirtualPantryAppShell", () => ({
  VirtualPantryAppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("@/hooks/useApi", () => ({
  useApi: () => ({ post: postMock }),
}));

jest.mock("@/hooks/useSessionStorage", () => ({
  __esModule: true,
  default: () => ({ value: mockSession, set: jest.fn(), clear: clearSessionMock }),
}));

jest.mock("antd", () => {
  const Button = ({ children, onClick, disabled, loading, icon, danger, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-loading={loading ? "true" : "false"} data-danger={danger ? "true" : "false"} {...props}>
      {icon}
      {children}
    </button>
  );
  const Card = ({ children }: any) => <div>{children}</div>;
  const Space = ({ children }: any) => <div>{children}</div>;
  const Row = ({ children }: any) => <div>{children}</div>;
  const Col = ({ children }: any) => <div>{children}</div>;
  const Divider = () => <hr />;
  const Empty = ({ description }: any) => <div>{description}</div>;
  const Tag = ({ children }: any) => <span>{children}</span>;
  const Alert = ({ title, description }: any) => (
    <div>
      <div>{title}</div>
      <div>{description}</div>
    </div>
  );
  const Checkbox = ({ children, checked, onChange }: any) => (
    <label>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event)} />
      {children}
    </label>
  );
  const Input = ({ value, onChange, ...props }: any) => (
    <input value={value} onChange={onChange} {...props} />
  );
  const InputNumber = ({ value, onChange, ...props }: any) => (
    <input value={value} onChange={(event) => onChange(Number(event.target.value))} {...props} />
  );
  const RadioButton = ({ children, value }: any) => <option value={value}>{children}</option>;
  const RadioGroup = ({ children }: any) => (
    <div>{children}</div>
  );
  const Radio = Object.assign(() => null, { Button: RadioButton, Group: RadioGroup });
  const Typography = {
    Title: ({ children }: any) => <h1>{children}</h1>,
    Paragraph: ({ children }: any) => <p>{children}</p>,
    Text: ({ children }: any) => <span>{children}</span>,
  };
  const ConfigProvider = ({ children }: any) => <>{children}</>;
  const App = Object.assign(({ children }: any) => <>{children}</>, {
    useApp: () => ({ message: { success: jest.fn(), warning: jest.fn() } }),
  });
  return {
    Alert,
    App,
    Button,
    Card,
    Checkbox,
    Col,
    ConfigProvider,
    Divider,
    Empty,
    Input,
    InputNumber,
    Radio,
    Row,
    Space,
    Tag,
    Typography,
    DatePicker: ({ placeholder, onChange }: any) => (
      <input type="date" placeholder={placeholder} onChange={(e) => onChange?.(e.target.value ? { format: () => e.target.value } : null)} />
    ),
    theme: { defaultAlgorithm: {} },
  };
});

describe("ReceiptReviewPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = receiptSession;
  });

  it("renders extracted receipt items and candidate matches", async () => {
    render(<ReceiptReviewPage />);

    expect(await screen.findByText("Review extracted items")).toBeInTheDocument();
    expect(screen.getByText("LG EGGS 12 CT")).toBeInTheDocument();
    expect(screen.getByText(/1\. Large Eggs 12 Count/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Large Eggs 12 Count")).toBeInTheDocument();
  });

  it("submits selected receipt items to bulk add", async () => {
    postMock.mockResolvedValueOnce([]);

    render(<ReceiptReviewPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Add selected items to pantry/i }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        "/households/7/pantry/bulk-add",
        {
          items: [
            expect.objectContaining({
              barcode: "111",
              name: "Large Eggs 12 Count",
              amount: 1,
              amountUnit: "package",
              kcalPerPackage: 840,
            }),
          ],
        },
      );
    });

    expect(clearSessionMock).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/households/7/stats");
  });

  it("prompts users to upload again when the review session is missing", async () => {
    mockSession = null;

    render(<ReceiptReviewPage />);

    expect(await screen.findByText("No receipt analysis found in this browser session.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Upload a receipt first/i }));

    expect(pushMock).toHaveBeenCalledWith("/pantry/add/receipt");
  });

  it("shows a validation error when selected items are incomplete", async () => {
    mockSession = {
      ...receiptSession,
      result: {
        ...receiptSession.result,
        items: [
          {
            ...receiptSession.result.items[0],
            suggestedPantryItem: {
              ...receiptSession.result.items[0].suggestedPantryItem,
              barcode: "",
              readyForBulkAdd: true,
            },
          },
        ],
      },
    };

    render(<ReceiptReviewPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Add selected items to pantry/i }));

    expect(await screen.findByText("Please make sure every selected item has a barcode, name, calories, and positive quantity.")).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("allows removing an extracted item before submit", async () => {
    render(<ReceiptReviewPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Remove from review/i }));

    expect(screen.queryByText("LG EGGS 12 CT")).not.toBeInTheDocument();
    expect(screen.getByText(/0 selected, 0 ready to add/i)).toBeInTheDocument();
  });
});
