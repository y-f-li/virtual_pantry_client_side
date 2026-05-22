/* eslint-disable @typescript-eslint/no-explicit-any */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import StatsPage from "@/households/[id]/stats/page";

const pushMock = jest.fn();
const backMock = jest.fn();
const replaceMock = jest.fn();
const getMock = jest.fn();
const putMock = jest.fn();
const postMock = jest.fn();
const mockSearchParams = new URLSearchParams("");
const postFormDataMock = jest.fn();
const mockApi = { get: getMock, put: putMock, post: postMock, postFormData: postFormDataMock };
const mockRouter = { push: pushMock, back: backMock, replace: replaceMock };
let mockPantryItems: any[] = [];
const messageMock = {
  warning: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
};

jest.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({ isAuthenticated: true }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useParams: () => ({ id: "1" }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/components/VirtualPantryAppShell", () => ({
  VirtualPantryAppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));

jest.mock("@/hooks/useApi", () => ({
  useApi: () => mockApi,
}));

jest.mock("@/hooks/useSessionStorage", () => ({
  __esModule: true,
  default: (key: string) => {
    if (key === "households") {
      return {
        value: [
          {
            householdId: 1,
            name: "Test Home",
            inviteCode: "abc",
            ownerId: 99,
            role: "owner",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
        set: jest.fn(),
        clear: jest.fn(),
      };
    }
    if (key === "userId") return { value: "", set: jest.fn(), clear: jest.fn() };
    return { value: "test-token", set: jest.fn(), clear: jest.fn() };
  },
}));

jest.mock("@/hooks/usePantryWebSocket", () => ({
  usePantryWebSocket: () => ({ connected: true, hasConnectedOnce: true }),
}));

jest.mock("@/hooks/useLocalStorage", () => ({
  __esModule: true,
  default: () => ({ value: null, set: jest.fn(), clear: jest.fn() }),
}));

jest.mock("@ant-design/icons", () => ({
  ArrowLeftOutlined: () => <span data-testid="arrow-left-icon" />,
  BarcodeOutlined: () => <span data-testid="barcode-icon" />,
  EditOutlined: () => <span data-testid="edit-icon" />,
  WarningOutlined: () => <span data-testid="warn-icon" />,
  RestOutlined: () => <span data-testid="rest-icon" />,
  MinusCircleOutlined: () => <span data-testid="minus-icon" />,
  PlusCircleOutlined: () => <span data-testid="plus-icon" />,
}));

jest.mock("antd", () => {
  const Button = ({ children, onClick, loading, type, icon }: any) => (
    <button type="button" onClick={onClick} data-loading={loading ? "true" : "false"} data-btn-type={type}>
      {icon}
      {children}
    </button>
  );
  const Card = ({ children, title, extra }: any) => (
    <div>
      <div>{title}</div>
      {extra ? <div data-testid="card-extra">{extra}</div> : null}
      <div>{children}</div>
    </div>
  );
  const Space = Object.assign(
    ({ children }: any) => <div>{children}</div>,
    { Compact: ({ children }: any) => <div>{children}</div> },
  );
  const Spin = () => <div>Loading...</div>;
  const Empty = ({ description, children }: any) => <div>{description}{children}</div>;
  Empty.PRESENTED_IMAGE_SIMPLE = "simple";
  const Tag = ({ children }: any) => <span>{children}</span>;
  const Table = ({ dataSource, rowKey, columns }: any) => {
    const actionColumn = columns?.find((column: any) => column.key === "action");
    return (
      <table>
        <tbody>
          {dataSource?.map((row: any, i: number) => (
            <tr key={row[rowKey] ?? row.date ?? i}>
              <td>{row.date ?? row.name ?? ""}</td>
              {actionColumn ? <td>{actionColumn.render(undefined, row, i)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };
  const Select = () => <div data-testid="select" />;
  const DatePicker = ({ onChange }: any) => (
    <input
      aria-label="start-date"
      data-testid="start-date"
      onChange={() => onChange({ format: () => "2026-04-07" })}
    />
  );
  const Row = ({ children }: any) => <div>{children}</div>;
  const Col = ({ children }: any) => <div>{children}</div>;
  const Progress = ({ format }: any) => <div>{format ? format(80) : "progress"}</div>;
  const Modal = ({ children, open, title, onOk, okText }: any) => {
    const testId =
      title === "Daily calorie target" ? "budget-modal"
        : title === "How much to consume?" ? "portion-modal"
          : "missing-calorie-modal";
    return open ? (
      <div data-testid={testId}>
        <div>{title}</div>
        {children}
        {onOk ? <button type="button" onClick={onOk}>{okText ?? "OK"}</button> : null}
      </div>
    ) : null;
  };
  const FormItem = ({ children, label }: any) => (
    <div>
      {label ? <label>{label}</label> : null}
      {children}
    </div>
  );
  const Form = Object.assign(
    ({ children }: any) => <form>{children}</form>,
    {
      useForm: () => [
        {
          setFieldsValue: jest.fn(),
          validateFields: async () => ({ dailyCalorieTarget: 2000 }),
        },
      ],
      useWatch: () => undefined,
      Item: FormItem,
    },
  );
  const InputNumber = ({ value, onChange, "aria-label": ariaLabel }: any) => (
    <input
      aria-label={ariaLabel ?? "daily-calorie-target"}
      type="number"
      value={value ?? ""}
      onChange={(event) => onChange?.(Number(event.target.value))}
    />
  );
  const RadioOption = ({ children, value, disabled }: any) => (
    <label>
      <input type="radio" value={value} disabled={disabled} />
      {children}
    </label>
  );
  const RadioGroup = ({ children, onChange }: any) => <div onChange={onChange}>{children}</div>;
  const Radio = Object.assign(RadioOption, { Group: RadioGroup });
  const Typography = {
    Title: ({ children }: any) => <h1>{children}</h1>,
    Paragraph: ({ children }: any) => <p>{children}</p>,
    Text: ({ children }: any) => <span>{children}</span>,
  };
  const App = {
    useApp: () => ({ message: messageMock }),
  };
  // Issue #124 — Divider added to antd imports in stats page
  const Divider = () => <hr />;

  return {
    Button,
    Card,
    Space,
    Spin,
    Empty,
    Tag,
    Table,
    Select,
    DatePicker,
    Typography,
    App,
    Row,
    Col,
    Progress,
    Modal,
    Form,
    InputNumber,
    Radio,
    Divider,
  };
});

// Issue #124 — mock recharts so chart components render as no-ops in jsdom
jest.mock("recharts", () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ReferenceLine: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  Cell: () => null,
}));

describe("StatsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPantryItems = [
      { id: 1, householdId: 1, barcode: "111", name: "Milk", amount: 3, amountUnit: "package", kcalPerPackage: 120, addedAt: "2026-04-01T00:00:00Z" },
      { id: 2, householdId: 1, barcode: "222", name: "Rice", amount: 5, amountUnit: "package", kcalPerPackage: 300, addedAt: "2026-04-01T00:00:00Z" },
    ];
    postFormDataMock.mockResolvedValue({
      suggestedMinAmount: 2,
      suggestedMaxAmount: 2.5,
      estimatedRange: "2–2.5 package",
      message: "Suggested portion loaded. Please confirm or edit the amount before saving.",
    });
    postMock.mockResolvedValue({ itemId: 1, remainingCount: 2, consumedCalories: 120, removed: false });
    getMock.mockImplementation((url: string) => {
      if (url === "/households/1") return Promise.resolve({ householdId: 1, name: "Test Home" });
      const today = new Date().toISOString().slice(0, 10);
      if (url.includes("/pantry")) {
        return Promise.resolve({
          items: mockPantryItems,
          totalCalories: 142500,
        });
      }
      if (url.includes("/stats")) {
        return Promise.resolve({
          startDate: "2026-04-07",
          endDate: today,
          dailyCalorieTarget: 2200,
          averageDailyCalories: 2450,
          totalCaloriesConsumed: 10000,
          dailyBreakdown: [{ date: today, caloriesConsumed: 2580 }],
          comparisonToBudget: {
            status: "OVER_BUDGET",
            differenceFromTarget: 250,
            percentageOfTarget: 111,
          },
          memberBreakdown: [                                              // Issue #121
            { userId: 99, username: "alice", totalCalories: 7000, averageDailyCalories: 1000 },
            { userId: 77, username: "bob",   totalCalories: 3000, averageDailyCalories: 428.6 },
          ],
        });
      }
      if (url.includes("/members")) {                                    // Issue #121
        return Promise.resolve([
          { userId: 99, username: "alice", role: "owner", joinedAt: "2026-01-01T00:00:00Z" },
          { userId: 77, username: "bob",   role: "member", joinedAt: "2026-01-01T00:00:00Z" },
        ]);
      }
      if (url.includes("/budget")) {
        return Promise.resolve({
          budgetId: 10,
          householdId: 1,
          dailyCalorieTarget: 2200,
        });
      }
      if (url.includes("/consumption-logs")) {
        return Promise.resolve([
          {
            logId: 9,
            consumedAt: "2026-04-02T00:00:00Z",
            pantryItemId: 1,
            productName: "Milk",
            consumedQuantity: 1,
            consumedCalories: 120,
            userId: 99,
          },
        ]);
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
  });

  it("loads pantry, stats, and budget and shows dashboard cards", async () => {
    render(<StatsPage />);

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith("/households/1/pantry");
      expect(getMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/households\/1\/stats\?startDate=\d{4}-\d{2}-\d{2}&endDate=\d{4}-\d{2}-\d{2}$/),
      );
      expect(getMock).toHaveBeenCalledWith("/households/1/budget");
      expect(getMock).toHaveBeenCalledWith("/households/1/consumption-logs?limit=30");
    });

    await waitFor(() => {
      expect(screen.getByText(/Test Home/i)).toBeInTheDocument();
      expect(screen.getByText(/1[, ]860 kcal/i)).toBeInTheDocument();
      expect(screen.getByText(/2[, ]450 kcal \/ day/i)).toBeInTheDocument();
    });
  });

  it("shows Add from Open Food Facts button", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "/households/1") return Promise.resolve({ householdId: 1, name: "Test Home" });
      if (url.includes("/pantry")) return Promise.resolve({ items: [], totalCalories: 0 });
      if (url.includes("/stats")) return Promise.resolve({ startDate: "2026-04-07", endDate: "2026-04-19", dailyCalorieTarget: null, averageDailyCalories: 0, totalCaloriesConsumed: 0, dailyBreakdown: [], comparisonToBudget: null });
      if (url.includes("/budget")) return Promise.reject({ status: 404 });
      if (url.includes("/consumption-logs")) return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<StatsPage />);

    expect(await screen.findByRole("button", { name: /Add from Open Food Facts/i })).toBeInTheDocument();
  });

  it("navigates to OFF portal with household context when add button clicked", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "/households/1") return Promise.resolve({ householdId: 1, name: "Test Home" });
      if (url.includes("/pantry")) return Promise.resolve({ items: [], totalCalories: 0 });
      if (url.includes("/stats")) return Promise.resolve({ startDate: "2026-04-07", endDate: "2026-04-19", dailyCalorieTarget: null, averageDailyCalories: 0, totalCaloriesConsumed: 0, dailyBreakdown: [], comparisonToBudget: null });
      if (url.includes("/budget")) return Promise.reject({ status: 404 });
      if (url.includes("/consumption-logs")) return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<StatsPage />);

    const addBtn = await screen.findByRole("button", { name: /Add from Open Food Facts/i });
    fireEvent.click(addBtn);

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining("/open-food-facts?householdId=1"),
    );
  });

  it("navigates to scan product page with household context when scan button clicked", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "/households/1") return Promise.resolve({ householdId: 1, name: "Test Home" });
      if (url.includes("/pantry")) return Promise.resolve({ items: [], totalCalories: 0 });
      if (url.includes("/stats")) return Promise.resolve({ startDate: "2026-04-07", endDate: "2026-04-19", dailyCalorieTarget: null, averageDailyCalories: 0, totalCaloriesConsumed: 0, dailyBreakdown: [], comparisonToBudget: null });
      if (url.includes("/budget")) return Promise.reject(new Error("no budget"));
      if (url.includes("/consumption-logs")) return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<StatsPage />);

    const scanBtn = await screen.findByRole("button", { name: /Scan package barcode/i });
    fireEvent.click(scanBtn);

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining("/pantry/add/scan?householdId=1"),
    );
  });

  it("opens budget modal when owner clicks Edit", async () => {
    render(<StatsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Edit/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));

    await waitFor(() => {
      expect(screen.getByTestId("budget-modal")).toBeInTheDocument();
    });
  });


  it("shows added and consumed rows in recent activity", async () => {
    render(<StatsPage />);

    expect(await screen.findByText(/Added 3× Milk/i)).toBeInTheDocument();
    expect(await screen.findByText(/Consumed 1× Milk/i)).toBeInTheDocument();
  });

  // Issue #95 — g/ml units must show as "100g" / "250ml", not "100×" / "250×"
  it("shows gram unit for added item in recent activity", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "/households/1") return Promise.resolve({ householdId: 1, name: "Test Home" });
      if (url.includes("/pantry")) return Promise.resolve({
        items: [{ id: 3, householdId: 1, barcode: "333", name: "Flour", amount: 500, amountUnit: "g", kcalPer100g: 364, addedAt: "2026-04-01T00:00:00Z" }],
        totalCalories: 0,
      });
      if (url.includes("/stats")) return Promise.resolve({ startDate: "2026-04-07", endDate: "2026-04-19", dailyCalorieTarget: null, averageDailyCalories: 0, totalCaloriesConsumed: 0, dailyBreakdown: [], comparisonToBudget: null });
      if (url.includes("/budget")) return Promise.reject({ status: 404 });
      if (url.includes("/consumption-logs")) return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<StatsPage />);

    expect(await screen.findByText(/Added 500g Flour/i)).toBeInTheDocument();
  });

  // Issue #95 — consumedUnit field from API must be used for display
  it("shows gram unit for consumed item in recent activity", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "/households/1") return Promise.resolve({ householdId: 1, name: "Test Home" });
      if (url.includes("/pantry")) return Promise.resolve({ items: [], totalCalories: 0 });
      if (url.includes("/stats")) return Promise.resolve({ startDate: "2026-04-07", endDate: "2026-04-19", dailyCalorieTarget: null, averageDailyCalories: 0, totalCaloriesConsumed: 0, dailyBreakdown: [], comparisonToBudget: null });
      if (url.includes("/budget")) return Promise.reject({ status: 404 });
      if (url.includes("/consumption-logs")) return Promise.resolve([
        { logId: 10, consumedAt: "2026-04-02T00:00:00Z", pantryItemId: 3, productName: "Flour", consumedQuantity: 200, consumedUnit: "g", consumedCalories: 728, userId: 99 },
      ]);
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<StatsPage />);

    expect(await screen.findByText(/Consumed 200g Flour/i)).toBeInTheDocument();
  });

  it("consumes one unit from the selected inventory row", async () => {
    render(<StatsPage />);

    // Issue #95 — clicking Consume now opens portion modal first
    const consumeButtons = await screen.findAllByRole("button", { name: /^Consume$/i });
    fireEvent.click(consumeButtons[0]);

    // Portion modal appears; click its "Consume" OK button
    const portionModal = await screen.findByTestId("portion-modal");
    expect(portionModal).toBeInTheDocument();
    fireEvent.click(within(portionModal).getByRole("button", { name: /^Consume$/i }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith("/households/1/pantry/1/consume", {
        amount: 1,
        amountUnit: "package",
        kcalPerPackage: null,
        skipCalorieLogging: false,
      });
    });

    expect(messageMock.success).toHaveBeenCalledWith("Consumption recorded.");
  });

  it("removes one unit from the selected inventory row without recording consumption", async () => {
    render(<StatsPage />);

    const removeButtons = await screen.findAllByRole("button", { name: /Remove/i });
    fireEvent.click(removeButtons[0]);

    // Issue #133 — remove sends full item.amount (3) instead of hardcoded quantity 1
    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith("/households/1/pantry/1/remove", { amount: 3 });
    });

    expect(postMock).not.toHaveBeenCalledWith("/households/1/pantry/1/consume", expect.anything());
    expect(messageMock.success).toHaveBeenCalledWith("Item partially removed from pantry.");
  });

  it("uses suggested calories before consuming an unknown pantry item", async () => {
    mockPantryItems = [
      {
        id: 7,
        householdId: 1,
        barcode: "receipt-generic:rice",
        name: "Basmati Rice",
        amount: 1,
        amountUnit: "package",
        kcalPerPackage: null,
        addedAt: "2026-04-01T00:00:00Z",
      },
    ];

    render(<StatsPage />);

    // Issue #95 — portion modal opens first; confirm amount to proceed to calorie modal
    fireEvent.click(await screen.findByRole("button", { name: /^Consume$/i }));
    const portionModal = await screen.findByTestId("portion-modal");
    fireEvent.click(within(portionModal).getByRole("button", { name: /^Consume$/i }));

    expect(await screen.findByTestId("missing-calorie-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save and consume/i }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith("/households/1/pantry/7/consume", {
        amount: 1,
        amountUnit: "package",
        kcalPerPackage: 1800,
        skipCalorieLogging: false,
      });
    });
  });

  it("allows manual calories before consuming an unknown pantry item without a suggestion", async () => {
    mockPantryItems = [
      {
        id: 8,
        householdId: 1,
        barcode: "444",
        name: "Mystery Product",
        amount: 1,
        amountUnit: "package",
        kcalPerPackage: 0,
        addedAt: "2026-04-01T00:00:00Z",
      },
    ];

    render(<StatsPage />);

    // Issue #95 — click Consume → portion modal → confirm → calorie modal
    fireEvent.click(await screen.findByRole("button", { name: /^Consume$/i }));
    const portionModal = await screen.findByTestId("portion-modal");
    fireEvent.click(within(portionModal).getByRole("button", { name: /^Consume$/i }));

    // Calorie-unknown modal: change manual calorie input, then confirm
    const calorieModal = await screen.findByTestId("missing-calorie-modal");
    fireEvent.change(within(calorieModal).getByRole("spinbutton"), { target: { value: "77" } });
    fireEvent.click(within(calorieModal).getByRole("button", { name: /Save and consume/i }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith("/households/1/pantry/8/consume", {
        amount: 1,
        amountUnit: "package",
        kcalPerPackage: 77,
        skipCalorieLogging: false,
      });
    });
  });
    it("uploads a meal photo and applies the suggested portion before consume", async () => {
    render(<StatsPage />);

    const consumeButtons = await screen.findAllByRole("button", { name: /^Consume$/i });
    fireEvent.click(consumeButtons[0]);

    const portionModal = await screen.findByTestId("portion-modal");
    const file = new File(["fake-image"], "meal.png", { type: "image/png" });

    fireEvent.change(within(portionModal).getByLabelText("Meal photo"), {
      target: { files: [file] },
    });

    fireEvent.click(
      within(portionModal).getByRole("button", { name: /Estimate portion from photo/i }),
    );

    await waitFor(() => {
      expect(postFormDataMock).toHaveBeenCalledWith(
        "/households/1/pantry/1/consume/portion-estimate",
        expect.any(FormData),
      );
    });

    expect(await within(portionModal).findByText("Suggested range: 2–2.5 package")).toBeInTheDocument();

    fireEvent.click(within(portionModal).getByRole("button", { name: /^Consume$/i }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith("/households/1/pantry/1/consume", {
        amount: 2,
        amountUnit: "package",
        kcalPerPackage: null,
        skipCalorieLogging: false,
      });
    });
  });

  // Issue #121 — member picker appears in portion modal when household has multiple members
  it("fetches members and shows member picker when consume is opened", async () => {
    render(<StatsPage />);

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith("/households/1/members");
    });

    const consumeButtons = await screen.findAllByRole("button", { name: /^Consume$/i });
    fireEvent.click(consumeButtons[0]);

    const portionModal = await screen.findByTestId("portion-modal");
    expect(within(portionModal).getByText("Who consumed?")).toBeInTheDocument();
  });
});
