/* eslint-disable @typescript-eslint/no-explicit-any, react/display-name */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Login from "@/login/page";

const pushMock = jest.fn();
const replaceMock = jest.fn();
const postMock = jest.fn();
const getMock = jest.fn();
const setTokenMock = jest.fn();
const clearTokenMock = jest.fn(() => sessionStorage.removeItem("token"));
const clearUsernameMock = jest.fn(() => sessionStorage.removeItem("username"));
const messageMock = { warning: jest.fn(), error: jest.fn(), success: jest.fn() };

jest.mock("antd", () => {
  const Form = ({ children, onFinish }: any) => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onFinish?.({ username: "tingting", password: "password123" });
      }}
    >
      {children}
    </form>
  );

  Form.useForm = () => [{}];
  Form.Item = ({ children, label }: any) => (
    <label>
      {label}
      {children}
    </label>
  );

  const Input = (props: any) => <input {...props} />;
  Input.Password = (props: any) => <input {...props} />;

  const Checkbox = ({ children, ...props }: any) => (
    <label>
      <input type="checkbox" {...props} />
      {children}
    </label>
  );

  const Button = ({ children, htmlType, type, ...props }: any) => {
    void type;
    return (
      <button type={htmlType ?? "button"} {...props}>
        {children}
      </button>
    );
  };

  const App = {
    useApp: () => ({ message: messageMock }),
  };

  return { App, Button, Checkbox, Form, Input };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => ({ get: () => null }),
}));

jest.mock("@/hooks/useApi", () => ({
  useApi: () => ({ post: postMock, get: getMock }),
}));

jest.mock("@/hooks/useSessionStorage", () => ({
  __esModule: true,
  default: (key: string) => {
    if (key === "token") return { set: setTokenMock, clear: clearTokenMock, value: "" };
    if (key === "username") return { set: jest.fn(), clear: clearUsernameMock, value: "" };
    return { set: jest.fn(), clear: jest.fn(), value: "" };
  },
}));

jest.mock("@/hooks/useLocalStorage", () => ({
  __esModule: true,
  default: () => ({ set: jest.fn(), clear: jest.fn(), value: [] }),
}));

describe("Login page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    getMock.mockResolvedValue([]);
    globalThis.alert = jest.fn();
  });

  it("renders login form", () => {
    render(<Login />);
    expect(screen.getByRole("heading", { name: "Welcome Back" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")[0]).toBeInTheDocument();
  });

  it("redirects to households when existing token is valid", async () => {
    sessionStorage.setItem("token", JSON.stringify("valid-token"));
    getMock.mockResolvedValueOnce([]);

    render(<Login />);

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith("/users/me");
      expect(replaceMock).toHaveBeenCalledWith("/households");
    });
  });

  it("clears token and stays on login when existing token returns 401", async () => {
    sessionStorage.setItem("token", JSON.stringify("expired-token"));
    getMock.mockRejectedValueOnce({ status: 401 });

    render(<Login />);

    await waitFor(() => {
      expect(sessionStorage.getItem("token")).toBeNull();
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it("keeps token and stays on login when server error occurs", async () => {
    sessionStorage.setItem("token", JSON.stringify("valid-token"));
    getMock.mockRejectedValueOnce({ status: 500 });

    render(<Login />);

    await waitFor(() => {
      expect(sessionStorage.getItem("token")).not.toBeNull();
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it("submits credentials and navigates on success", async () => {
    postMock.mockResolvedValueOnce({ token: "abc-token" });

    const { container } = render(<Login />);

    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith("/users/login", {
        username: "tingting",
        password: "password123",
      });
      expect(setTokenMock).toHaveBeenCalledWith("abc-token");
      expect(pushMock).toHaveBeenCalledWith("/households");
    });
  });

  it("shows friendly message on unauthorized login", async () => {
    postMock.mockRejectedValueOnce({
      status: 401,
      message: "Invalid username or password",
    });

    const { container } = render(<Login />);

    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(messageMock.error).toHaveBeenCalledWith(
        "Username or password is incorrect. Please try again.",
      );
    });
  });
});
