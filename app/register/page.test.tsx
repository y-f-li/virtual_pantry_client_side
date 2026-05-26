/* eslint-disable @typescript-eslint/no-explicit-any, react/display-name */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Register from "@/register/page";

const pushMock = jest.fn();
const postMock = jest.fn();
const setTokenMock = jest.fn();
const messageMock = { warning: jest.fn(), error: jest.fn(), success: jest.fn() };

jest.mock("antd", () => {
  const Form = ({ children, onFinish }: any) => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onFinish?.({
          username: "tingting",
          email: "tingting@example.com",
          password: "password123",
          confirmPassword: "password123",
          acceptedTerms: true,
        });
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

  const App = { useApp: () => ({ message: messageMock }) };

  return { App, Button, Checkbox, Form, Input };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("@/hooks/useApi", () => ({
  useApi: () => ({ post: postMock }),
}));

jest.mock("@/hooks/useSessionStorage", () => ({
  __esModule: true,
  default: () => ({ set: setTokenMock, clear: jest.fn(), value: "" }),
}));

describe("Register page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.alert = jest.fn();
  });

  it("renders register form", () => {
    render(<Register />);
    expect(screen.getByRole("heading", { name: "Create Account" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")[0]).toBeInTheDocument();
  });

  it("submits register form and navigates on success", async () => {
    postMock.mockResolvedValueOnce({ token: "register-token" });

    const { container } = render(<Register />);

    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith("/users/register", {
        username: "tingting",
        password: "password123",
      });
      expect(setTokenMock).toHaveBeenCalledWith("register-token");
      expect(pushMock).toHaveBeenCalledWith("/households");
    });
  });

  it("shows duplicate username message", async () => {
    postMock.mockRejectedValueOnce({
      status: 400,
      message: "The username is already taken",
    });

    const { container } = render(<Register />);

    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(messageMock.error).toHaveBeenCalledWith(
        "This username is already taken. Please choose another one.",
      );
    });
  });
});
