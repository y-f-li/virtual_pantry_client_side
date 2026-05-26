/* eslint-disable @typescript-eslint/no-explicit-any */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import UsersPage from "@/users/page";

const pushMock = jest.fn();
const getMock = jest.fn();
const errorMock = jest.fn();
const apiMock = { get: getMock };

let mockHouseholds: any[] = [];
let mockSelectedHouseholdId: number | null = null;

jest.mock("antd", () => {
  const Card = ({ children, title }: any) => (
    <div>
      {title ? <div>{title}</div> : null}
      <div>{children}</div>
    </div>
  );

  const Button = ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  );

  const Spin = () => <div>loading</div>;
  const Typography = {
    Title: ({ children }: any) => <h1>{children}</h1>,
    Paragraph: ({ children }: any) => <p>{children}</p>,
    Text: ({ children }: any) => <span>{children}</span>,
  };
  const Tag = ({ children }: any) => <span>{children}</span>;
  const App = {
    useApp: () => ({ message: { error: errorMock } }),
  };

  return { App, Button, Card, Spin, Tag, Typography };
});

jest.mock("@ant-design/icons", () => ({
  AppstoreOutlined: () => <span />,
  HistoryOutlined: () => <span />,
  PlusOutlined: () => <span />,
  TeamOutlined: () => <span />,
}));

jest.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({ isAuthenticated: true }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("@/hooks/useApi", () => ({
  useApi: () => apiMock,
}));

jest.mock("@/components/VirtualPantryAppShell", () => ({
  VirtualPantryAppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="shell">{children}</div>
  ),
}));

jest.mock("@/hooks/useSessionStorage", () => ({
  __esModule: true,
  default: (key: string) => {
    if (key === "households") {
      return { value: mockHouseholds, set: jest.fn(), clear: jest.fn() };
    }
    if (key === "selectedHouseholdId") {
      return {
        value: mockSelectedHouseholdId,
        set: jest.fn(),
        clear: jest.fn(),
      };
    }
    if (key === "userId") {
      return { value: "5", set: jest.fn(), clear: jest.fn() };
    }
    return { value: "", set: jest.fn(), clear: jest.fn() };
  },
}));

type ApiFixtures = {
  pantry?: any;
  logs?: any;
  members?: any;
  pantryError?: Error;
};

function routeApi(fixtures: ApiFixtures) {
  getMock.mockImplementation((url: string) => {
    if (url.startsWith("/households/10/pantry")) {
      if (fixtures.pantryError) return Promise.reject(fixtures.pantryError);
      return Promise.resolve(fixtures.pantry ?? { items: [], totalCalories: 0 });
    }
    if (url.startsWith("/households/10/consumption-logs")) {
      return Promise.resolve(fixtures.logs ?? []);
    }
    if (url.startsWith("/households/10/members")) {
      return Promise.resolve(fixtures.members ?? []);
    }
    return Promise.resolve(undefined);
  });
}

describe("Users page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHouseholds = [
      { householdId: 10, name: "Team Kitchen", role: "owner" },
    ];
    mockSelectedHouseholdId = 10;
  });

  it("loads dashboard data and renders user, product and weekly stats", async () => {
    routeApi({
      pantry: {
        items: [
          { id: 1, name: "Oat Milk", count: 2 },
          { id: 2, name: "Bread", count: 8 },
        ],
        totalCalories: 240,
      },
      logs: [
        {
          logId: 1,
          consumedAt: new Date().toISOString(),
          productName: "Oat Milk",
          consumedQuantity: 2,
          consumedCalories: 200,
          pantryItemId: 1,
          userId: 5,
        },
      ],
      members: [
        { userId: 5, username: "tiffany", role: "owner", joinedAt: "2026-01-01T00:00:00Z" },
      ],
    });

    render(<UsersPage />);

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith("/households/10/pantry");
      expect(getMock).toHaveBeenCalledWith(
        expect.stringContaining("/households/10/consumption-logs?limit="),
      );
      expect(getMock).toHaveBeenCalledWith("/households/10/members");
    });

    await waitFor(() => {
      expect(screen.getByText("Pantry Overview")).toBeInTheDocument();
      expect(screen.getByText("Team Kitchen")).toBeInTheDocument();
      expect(screen.getByText("Most consumed")).toBeInTheDocument();
      expect(screen.getByText("Calories this week")).toBeInTheDocument();
      expect(screen.getByText("tiffany")).toBeInTheDocument();
      expect(screen.getAllByText("Oat Milk").length).toBeGreaterThan(0);
    });
  });

  it("skips removed items when computing most consumed", async () => {
    routeApi({
      pantry: { items: [{ id: 1, name: "Bread", count: 5 }], totalCalories: 0 },
      logs: [
        {
          logId: 1,
          consumedAt: new Date().toISOString(),
          productName: "Removed item",
          consumedQuantity: 3,
          consumedCalories: 150,
          pantryItemId: 99,
          userId: 5,
        },
      ],
      members: [],
    });

    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText("No data yet")).toBeInTheDocument();
    });
  });

  it("navigates to add product with household context", async () => {
    routeApi({});
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Add Product/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /Add Product/i }));
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining("/open-food-facts?householdId=10"),
    );
  });


  it("navigates to the current user nutrition reference", async () => {
    routeApi({});
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Nutrition Reference/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Nutrition Reference/i }));
    expect(pushMock).toHaveBeenCalledWith("/users/5/details/nutrition-reference");
  });

  it("shows fallback state when no households exist", async () => {
    mockHouseholds = [];

    render(<UsersPage />);
    expect(screen.getByText("No household selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Go to Households/i }));
    expect(pushMock).toHaveBeenCalledWith("/households");
  });

  it("shows message when dashboard request fails", async () => {
    routeApi({ pantryError: new Error("boom") });

    render(<UsersPage />);

    await waitFor(() => {
      expect(errorMock).toHaveBeenCalled();
    });
  });

  // Issue #95 — g/ml units must show as "100g" / "250ml", not "100×" / "250×"
  it("shows ml unit for consumed item in recent activity", async () => {
    routeApi({
      pantry: { items: [], totalCalories: 0 },
      logs: [
        {
          logId: 5,
          consumedAt: new Date().toISOString(),
          productName: "Oat Milk",
          consumedQuantity: 250,
          consumedUnit: "ml",
          consumedCalories: 130,
          pantryItemId: 1,
          userId: 5,
        },
      ],
      members: [{ userId: 5, username: "alice", role: "owner", joinedAt: "2026-01-01T00:00:00Z" }],
    });

    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText("250ml")).toBeInTheDocument();
    });
  });
});
