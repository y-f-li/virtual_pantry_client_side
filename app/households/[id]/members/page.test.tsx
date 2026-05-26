/* eslint-disable @typescript-eslint/no-explicit-any */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HouseholdMembersPage from "@/households/[id]/members/page";

const pushMock = jest.fn();
const getMock = jest.fn();
const deleteMock = jest.fn();
const warningMock = jest.fn();
const successMock = jest.fn();
const setHouseholdsMock = jest.fn();
const clearSelectedHouseholdIdMock = jest.fn();

// Mutable so individual tests can set a different current user (client #118)
let currentUserIdMock = "1";

jest.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({ isAuthenticated: true }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ id: "10" }),
  useSearchParams: () => ({ get: (key: string) => (key === "name" ? "Test House" : null) }),
}));

jest.mock("@/hooks/useApi", () => ({
  useApi: () => ({ get: getMock, delete: deleteMock }),
}));

jest.mock("@/hooks/usePantryWebSocket", () => ({
  usePantryWebSocket: () => ({ connected: false, hasConnectedOnce: false }),
}));


jest.mock("@/hooks/useSessionStorage", () => ({
  __esModule: true,
  default: (key: string, defaultValue: unknown) => {
    if (key === "token") {
      return { value: "test-token", set: jest.fn(), clear: jest.fn() };
    }
    if (key === "households") {
      return {
        value: [
          { householdId: 10, name: "Test House", inviteCode: "ABC123", ownerId: 1, role: "owner" },
        ],
        set: setHouseholdsMock,
        clear: jest.fn(),
      };
    }
    if (key === "selectedHouseholdId") {
      return { value: null, set: jest.fn(), clear: clearSelectedHouseholdIdMock };
    }
    if (key === "userId") {
      return { value: currentUserIdMock, set: jest.fn(), clear: jest.fn() };
    }
    return { value: defaultValue, set: jest.fn(), clear: jest.fn() };
  },
}));

jest.mock("@/components/VirtualPantryAppShell", () => ({
  VirtualPantryAppShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("antd", () => {
  const App = {
    useApp: () => ({
      message: { warning: warningMock, error: jest.fn(), success: successMock, info: jest.fn() },
    }),
  };
  const Button = ({ children, onClick, loading }: any) => (
    <button type="button" onClick={onClick} disabled={!!loading}>{children}</button>
  );
  const Col = ({ children }: any) => <div>{children}</div>;
  const Row = ({ children }: any) => <div>{children}</div>;
  const Tag = ({ children }: any) => <span>{children}</span>;
  const Typography = {
    Title: ({ children }: any) => <h1>{children}</h1>,
    Paragraph: ({ children }: any) => <p>{children}</p>,
    Text: ({ children }: any) => <span>{children}</span>,
  };
  const Card = ({ children }: any) => <div>{children}</div>;
  const Popconfirm = ({ children, onConfirm }: any) => (
    <div>
      {children}
      <button type="button" data-testid="popconfirm-ok" onClick={onConfirm}>Confirm Remove</button>
    </div>
  );
  return { App, Button, Card, Col, Popconfirm, Row, Tag, Typography };
});

const sampleMembers = [
  { userId: 1, username: "alice", role: "owner", joinedAt: "2026-04-01T10:00:00Z" },
  { userId: 2, username: "bob", role: "member", joinedAt: "2026-04-05T12:00:00Z" },
];

describe("HouseholdMembersPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentUserIdMock = "1"; // reset to owner perspective for each test
  });

  it("renders household name and members on success", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "/households/10") return Promise.resolve({ householdId: 10, name: "Test House" });
      if (url === "/households/10/members") return Promise.resolve(sampleMembers);
      return Promise.reject(new Error("unexpected: " + url));
    });

    render(<HouseholdMembersPage />);

    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.getByText("OWNER")).toBeInTheDocument();
    expect(screen.getByText("MEMBER")).toBeInTheDocument();
  });

  it("shows Members (2) count after loading", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "/households/10") return Promise.resolve({ householdId: 10, name: "Test House" });
      if (url === "/households/10/members") return Promise.resolve(sampleMembers);
      return Promise.reject(new Error("unexpected: " + url));
    });

    render(<HouseholdMembersPage />);

    await waitFor(() => {
      expect(screen.getByText(/Members \(2\)/)).toBeInTheDocument();
    });
  });

  it("shows error message when API call fails", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "/households/10") return Promise.resolve({ householdId: 10, name: "Test House" });
      if (url === "/households/10/members") return Promise.reject(new Error("forbidden"));
      return Promise.reject(new Error("unexpected: " + url));
    });

    render(<HouseholdMembersPage />);

    await waitFor(() => {
      expect(screen.getByText("forbidden")).toBeInTheDocument();
    });
  });

  it("shows no members message when list is empty", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "/households/10") return Promise.resolve({ householdId: 10, name: "Test House" });
      if (url === "/households/10/members") return Promise.resolve([]);
      return Promise.reject(new Error("unexpected: " + url));
    });

    render(<HouseholdMembersPage />);

    await waitFor(() => {
      expect(screen.getByText("No members found.")).toBeInTheDocument();
    });
  });

  it("Back button navigates to /households", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "/households/10") return Promise.resolve({ householdId: 10, name: "Test House" });
      if (url === "/households/10/members") return Promise.resolve(sampleMembers);
      return Promise.reject(new Error("unexpected: " + url));
    });

    render(<HouseholdMembersPage />);

    await waitFor(() => {
      expect(screen.getByText("alice")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Back to households" }));
    expect(pushMock).toHaveBeenCalledWith("/households");
  });

  it("shows Remove button for non-owner members when current user is owner", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "/households/10") return Promise.resolve({ householdId: 10, name: "Test House" });
      if (url === "/households/10/members") return Promise.resolve(sampleMembers);
      return Promise.reject(new Error("unexpected: " + url));
    });

    render(<HouseholdMembersPage />);

    await waitFor(() => {
      expect(screen.getByText("bob")).toBeInTheDocument();
    });

    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
  });

  it("removes member from list after confirming", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "/households/10") return Promise.resolve({ householdId: 10, name: "Test House" });
      if (url === "/households/10/members") return Promise.resolve(sampleMembers);
      return Promise.reject(new Error("unexpected: " + url));
    });
    deleteMock.mockResolvedValueOnce(undefined);

    render(<HouseholdMembersPage />);

    await waitFor(() => {
      expect(screen.getByText("bob")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("popconfirm-ok"));

    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalledWith("/households/10/members/2");
      expect(screen.queryByText("bob")).not.toBeInTheDocument();
      expect(successMock).toHaveBeenCalledWith("Member removed.");
    });
  });

  it("redirects to /households and removes the household from cache when members returns 404", async () => {
    const notFoundError = Object.assign(new Error("Not found"), { status: 404, info: "" });
    getMock.mockImplementation((url: string) => {
      if (url === "/households/10") return Promise.resolve({ householdId: 10, name: "Test House" });
      if (url === "/households/10/members") return Promise.reject(notFoundError);
      return Promise.reject(new Error("unexpected: " + url));
    });

    render(<HouseholdMembersPage />);

    await waitFor(() => {
      expect(setHouseholdsMock).toHaveBeenCalledWith([]);
      expect(clearSelectedHouseholdIdMock).toHaveBeenCalled();
      expect(warningMock).toHaveBeenCalledWith("This household no longer exists.");
      expect(pushMock).toHaveBeenCalledWith("/households");
    });
  });

  // Leave button tests (client #118)
  it("shows Leave button for current user when they are a non-owner member", async () => {
    currentUserIdMock = "2"; // bob is the current user (non-owner)
    getMock.mockImplementation((url: string) => {
      if (url === "/households/10") return Promise.resolve({ householdId: 10, name: "Test House" });
      if (url === "/households/10/members") return Promise.resolve(sampleMembers);
      return Promise.reject(new Error("unexpected: " + url));
    });

    render(<HouseholdMembersPage />);

    await waitFor(() => {
      expect(screen.getByText("bob")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Leave" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("calls DELETE /households/10/members/2 and redirects to /households on leave confirm", async () => {
    currentUserIdMock = "2"; // bob leaves
    getMock.mockImplementation((url: string) => {
      if (url === "/households/10") return Promise.resolve({ householdId: 10, name: "Test House" });
      if (url === "/households/10/members") return Promise.resolve(sampleMembers);
      return Promise.reject(new Error("unexpected: " + url));
    });
    deleteMock.mockResolvedValueOnce(undefined);

    render(<HouseholdMembersPage />);

    await waitFor(() => {
      expect(screen.getByText("bob")).toBeInTheDocument();
    });

    // The Popconfirm mock renders a confirm button with data-testid="popconfirm-ok"
    // Only the Leave Popconfirm is in the DOM when current user is non-owner
    fireEvent.click(screen.getByTestId("popconfirm-ok"));

    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalledWith("/households/10/members/2");
      expect(pushMock).toHaveBeenCalledWith("/households");
    });
  });
});
