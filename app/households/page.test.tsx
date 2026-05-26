/* eslint-disable @typescript-eslint/no-explicit-any */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HouseholdsPage from "@/households/page";

const pushMock = jest.fn();
const clearTokenMock = jest.fn();
const clearUsernameMock = jest.fn();
const successMock = jest.fn();
const errorMock = jest.fn();
const warningMock = jest.fn();
const infoMock = jest.fn();
const setHouseholdsMock = jest.fn();
const setSelectedHouseholdIdMock = jest.fn();
const clearSelectedHouseholdIdMock = jest.fn();
let mockStoredHouseholds: any[] = [];
let mockSelectedHouseholdId: number | null = null;

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

jest.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({ isAuthenticated: true }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("@/utils/domain", () => ({
  getApiDomain: () => "http://localhost:8080",
}));

jest.mock("@/hooks/useLocalStorage", () => ({
  __esModule: true,
  default: () => ({ value: null, set: jest.fn(), clear: jest.fn() }),
}));

jest.mock("@/hooks/useSessionStorage", () => ({
  __esModule: true,
  default: (key: string) => {
    if (key === "token") {
      return { value: "stored-token", set: jest.fn(), clear: clearTokenMock };
    }
    if (key === "username") {
      return { value: "tingting-xu824", set: jest.fn(), clear: clearUsernameMock };
    }
    if (key === "households") {
      return { value: mockStoredHouseholds, set: setHouseholdsMock, clear: jest.fn() };
    }
    if (key === "selectedHouseholdId") {
      return {
        value: mockSelectedHouseholdId,
        set: setSelectedHouseholdIdMock,
        clear: clearSelectedHouseholdIdMock,
      };
    }
    return { value: "", set: jest.fn(), clear: jest.fn() };
  },
}));

jest.mock("antd", () => {
  const App = {
    useApp: () => ({
      message: { success: successMock, error: errorMock, warning: warningMock, info: infoMock },
    }),
  };

  const ConfigProvider = ({ children }: any) => <>{children}</>;
  const Avatar = ({ children }: any) => <span>{children}</span>;
  const Space = ({ children }: any) => <div>{children}</div>;
  const Row = ({ children }: any) => <div>{children}</div>;
  const Col = ({ children }: any) => <div>{children}</div>;
  const Card = ({ children }: any) => <div>{children}</div>;
  const Tag = ({ children }: any) => <span>{children}</span>;
  const Table = ({ dataSource, columns }: any) => (
    <div>
      <span>rows:{dataSource?.length ?? 0}</span>
      {dataSource?.map((row: any, i: number) => {
        const actionCol = columns?.find((c: any) => c.key === "actions");
        return (
          <div key={row.key ?? i}>
            {row.created !== undefined && <span data-testid="col-created">{row.created}</span>}
            {row.expires !== undefined && <span data-testid="col-expires">{row.expires}</span>}
            {actionCol ? actionCol.render(undefined, row) : null}
          </div>
        );
      })}
    </div>
  );

  const Input = ({ value, onChange, placeholder, onPressEnter }: any) => (
    <input
      aria-label={placeholder}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={onChange}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onPressEnter) {
          onPressEnter(e);
        }
      }}
    />
  );

  const Button = ({ children, onClick, loading, icon, type, ...props }: any) => (
    <button onClick={onClick} data-loading={loading ? "true" : undefined} data-variant={type} {...props}>
      {icon}
      {children}
    </button>
  );

  const Typography = {
    Title: ({ children }: any) => <h1>{children}</h1>,
    Paragraph: ({ children }: any) => <p>{children}</p>,
  };

  return {
    App,
    Avatar,
    Button,
    Card,
    Col,
    ConfigProvider,
    Input,
    Row,
    Space,
    Table,
    Tag,
    Typography,
    theme: { defaultAlgorithm: {} },
  };
});

jest.mock("@ant-design/icons", () => ({
  DashboardOutlined: () => <span>icon</span>,
  DeleteOutlined: () => <span>icon</span>,
  HomeOutlined: () => <span>icon</span>,
  InboxOutlined: () => <span>icon</span>,
  LogoutOutlined: () => <span>icon</span>,
  PlusCircleOutlined: () => <span>icon</span>,
  ReadOutlined: () => <span>icon</span>,
  SyncOutlined: () => <span>icon</span>,
  TeamOutlined: () => <span>icon</span>,
}));

const mockJsonResponse = (ok: boolean, body: unknown, status = 200, statusText = "OK") =>
  Promise.resolve({
    ok,
    status,
    statusText,
    json: async () => body,
  } as Response);

describe("Households page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    mockStoredHouseholds = [];
    mockSelectedHouseholdId = null;
  });

  it("redirects to the pantry stats screen after successful creation", async () => {
  mockFetch.mockImplementationOnce(() =>
    mockJsonResponse(true, {
      householdId: 10,
      name: "Test House",
      inviteCode: "ABC123",
      ownerId: 1,
    }),
  );

  render(<HouseholdsPage />);

  fireEvent.change(screen.getByPlaceholderText("Enter pantry name"), {
    target: { value: "Test House" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Create Pantry/i }));

  await waitFor(() => {
    expect(pushMock).toHaveBeenCalledWith("/households/10/stats");
  });
  });

  it("shows an error when joining with an invalid invite code fails", async () => {
  mockFetch.mockImplementationOnce(() =>
    mockJsonResponse(false, { message: "Invite code is invalid." }, 404, "Not Found"),
  );

  render(<HouseholdsPage />);

  fireEvent.change(screen.getByPlaceholderText("Enter invite code (e.g. AB-12345)"), {
    target: { value: "INVALID" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Join Pantry/i }));

  await waitFor(() => {
    expect(errorMock).toHaveBeenCalledWith("404: Invite code is invalid.");
  });
  });

  it("shows an error when joining with an expired invite code fails", async () => {
  mockFetch.mockImplementationOnce(() =>
    mockJsonResponse(
      false,
      { message: "Invite code has expired. Please request a new code." },
      410,
      "Gone",
    ),
  );

  render(<HouseholdsPage />);

  fireEvent.change(screen.getByPlaceholderText("Enter invite code (e.g. AB-12345)"), {
    target: { value: "EXPIRED" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Join Pantry/i }));

  await waitFor(() => {
    expect(errorMock).toHaveBeenCalledWith(
      "410: Invite code has expired. Please request a new code.",
    );
  });
  });


  it("renders navigation and household management", () => {
    render(<HouseholdsPage />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Manage")).toBeInTheDocument();
    expect(screen.getByText("Pantry")).toBeInTheDocument();
    expect(screen.getByText("Recipes")).toBeInTheDocument();
    expect(screen.getByText("tingting-xu824")).toBeInTheDocument();
    expect(screen.getByText("Pantry Management")).toBeInTheDocument();
  });

  it("sidebar Pantry shows info when there is no household", () => {
    render(<HouseholdsPage />);
    fireEvent.click(screen.getByText("Pantry").closest("button") as HTMLButtonElement);
    expect(infoMock).toHaveBeenCalledWith(
      "Create or join a pantry first, then open Pantry.",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("sidebar Pantry navigates to the selected household pantry when a household exists", () => {
    mockStoredHouseholds = [
      { householdId: 7, name: "Home", inviteCode: "ABC", ownerId: 1, role: "owner" },
    ];
    render(<HouseholdsPage />);
    fireEvent.click(screen.getByText("Pantry").closest("button") as HTMLButtonElement);
    expect(setSelectedHouseholdIdMock).toHaveBeenCalledWith(7);
    expect(pushMock).toHaveBeenCalledWith("/households/7/stats");
  });

  it("creates a household and stores it in local storage", async () => {
    mockFetch.mockImplementationOnce(() =>
      mockJsonResponse(true, {
        householdId: 10,
        name: "Test House",
        inviteCode: "ABC123",
        ownerId: 1,
      }),
    );

    render(<HouseholdsPage />);

    fireEvent.change(screen.getByPlaceholderText("Enter pantry name"), {
      target: { value: "Test House" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create Pantry/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/households",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "stored-token" }),
        }),
      );
      expect(successMock).toHaveBeenCalledWith("Pantry created successfully.");
      expect(setHouseholdsMock).toHaveBeenCalledWith([
        {
          householdId: 10,
          name: "Test House",
          inviteCode: "ABC123",
          ownerId: 1,
          role: "owner",
        },
      ]);
    });
  });

  it("joins a household by invite code", async () => {
    mockFetch.mockImplementationOnce(() =>
      mockJsonResponse(true, {
        householdId: 22,
        name: "Joined House",
        inviteCode: "JOIN22",
        ownerId: 1,
      }),
    );

    render(<HouseholdsPage />);

    fireEvent.change(screen.getByPlaceholderText("Enter invite code (e.g. AB-12345)"), {
      target: { value: "JOIN22" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Join Pantry/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/households/join",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "stored-token" }),
        }),
      );
      expect(successMock).toHaveBeenCalledWith("Joined pantry successfully.");
      expect(setHouseholdsMock).toHaveBeenCalledWith([
        {
          householdId: 22,
          name: "Joined House",
          inviteCode: "JOIN22",
          ownerId: 1,
          role: "member",
        },
      ]);
    });
  });

  it("View Pantry opens the stats page for a stored pantry", () => {
    mockStoredHouseholds = [
      {
        householdId: 10,
        name: "Test House",
        inviteCode: "ABC123",
        ownerId: 1,
        role: "owner",
      },
    ];

    render(<HouseholdsPage />);

    fireEvent.click(screen.getByRole("button", { name: /View Pantry/i }));
    expect(setSelectedHouseholdIdMock).toHaveBeenCalledWith(10);
    expect(pushMock).toHaveBeenCalledWith("/households/10/stats");
  });

  it("shows warning for empty inputs", () => {
    render(<HouseholdsPage />);
    fireEvent.click(screen.getByRole("button", { name: /Create Pantry/i }));
    fireEvent.click(screen.getByRole("button", { name: /Join Pantry/i }));
    expect(warningMock).toHaveBeenCalledWith("Please enter a pantry name.");
    expect(warningMock).toHaveBeenCalledWith("Please enter an invite code.");
  });

  it("Revoke calls the regenerate invite-code endpoint and shows success", async () => {
    const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    mockStoredHouseholds = [
      {
        householdId: 10,
        name: "Test House",
        inviteCode: "OLD123",
        ownerId: 1,
        role: "owner",
        inviteCodeExpiresAt: expiresAt,
      },
    ];

    mockFetch.mockImplementationOnce(() =>
      mockJsonResponse(true, {
        householdId: 10,
        inviteCode: "NEW456",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    );

    render(<HouseholdsPage />);

    fireEvent.click(screen.getByRole("button", { name: /Revoke/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/households/10/invite-code",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "stored-token" }),
        }),
      );
      expect(successMock).toHaveBeenCalledWith("Invite code regenerated.");
    });
  });

  it("shows real Expires countdown and Created date from inviteCodeExpiresAt", () => {
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000).toISOString();
    mockStoredHouseholds = [
      {
        householdId: 10,
        name: "Test House",
        inviteCode: "ABC123",
        ownerId: 1,
        role: "owner",
        inviteCodeExpiresAt: expiresAt,
      },
    ];

    render(<HouseholdsPage />);

    expect(screen.getByTestId("col-expires")).toHaveTextContent("3 days");
    expect(screen.getByTestId("col-created")).not.toHaveTextContent("Today");
  });

  it("View Members navigates to the members page with encoded household name", () => {
    mockStoredHouseholds = [
      {
        householdId: 10,
        name: "Test House",
        inviteCode: "ABC123",
        ownerId: 1,
        role: "owner",
      },
    ];

    render(<HouseholdsPage />);

    fireEvent.click(screen.getByRole("button", { name: /View Members/i }));
    expect(pushMock).toHaveBeenCalledWith(
      "/households/10/members?name=Test%20House",
    );
  });

  it("Delete button is only visible to pantry owners", () => {
    mockStoredHouseholds = [
      { householdId: 10, name: "Owned House", inviteCode: "OWN", ownerId: 1, role: "owner" },
      { householdId: 11, name: "Joined House", inviteCode: "JON", ownerId: 2, role: "member" },
    ];

    render(<HouseholdsPage />);

    expect(screen.getByRole("button", { name: /Delete/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regenerate Code/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /View Pantry/i })).toHaveLength(2);
  });

  it("deletes a household and removes it from the list", async () => {
    mockStoredHouseholds = [
      { householdId: 10, name: "Test House", inviteCode: "ABC123", ownerId: 1, role: "owner" },
    ];

    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: 204, json: async () => ({}) } as Response),
    );

    render(<HouseholdsPage />);

    fireEvent.click(screen.getByRole("button", { name: /Delete/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/households/10",
        expect.objectContaining({ method: "DELETE", headers: expect.objectContaining({ Authorization: "stored-token" }) }),
      );
      expect(setHouseholdsMock).toHaveBeenCalledWith([]);
      expect(successMock).toHaveBeenCalledWith("Pantry deleted.");
    });
  });

  it("clears selectedHouseholdId when the currently selected household is deleted", async () => {
    mockStoredHouseholds = [
      { householdId: 10, name: "Test House", inviteCode: "ABC123", ownerId: 1, role: "owner" },
    ];
    mockSelectedHouseholdId = 10;

    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: 204, json: async () => ({}) } as Response),
    );

    render(<HouseholdsPage />);

    fireEvent.click(screen.getByRole("button", { name: /Delete/i }));

    await waitFor(() => {
      expect(clearSelectedHouseholdIdMock).toHaveBeenCalled();
    });
  });

  it("shows an error when deleting a household fails", async () => {
    mockStoredHouseholds = [
      { householdId: 10, name: "Test House", inviteCode: "ABC123", ownerId: 1, role: "owner" },
    ];

    mockFetch.mockImplementationOnce(() =>
      mockJsonResponse(false, { message: "Not authorized" }, 403, "Forbidden"),
    );

    render(<HouseholdsPage />);

    fireEvent.click(screen.getByRole("button", { name: /Delete/i }));

    await waitFor(() => {
      expect(errorMock).toHaveBeenCalledWith(expect.stringContaining("Not authorized"));
    });
  });
});
