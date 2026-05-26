"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useSessionStorage from "@/hooks/useSessionStorage";
import AuthLayout from "@/components/auth/AuthLayout";
import { getLoginErrorMessage } from "@/utils/authError";
import { User } from "@/types/user";
import type { HouseholdWithRole } from "@/types/household";
import { App, Button, Form, Input } from "antd";
import styles from "@/styles/auth.module.css";

interface LoginFormValues {
  username: string;
  password: string;
}

const Login: React.FC = () => {
  const router = useRouter();
  const { message } = App.useApp();
  const apiService = useApi();
  const [form] = Form.useForm<LoginFormValues>();
  const { set: setToken, clear: clearToken } = useSessionStorage<string>("token", "");
  const { set: setUsername, clear: clearUsername } = useSessionStorage<string>("username", "");
  const { set: setUserId, clear: clearUserId } = useSessionStorage<string>("userId", "");
  const { set: setHouseholds } = useSessionStorage<HouseholdWithRole[]>("households", []);

  useEffect(() => {
    let token: string | null = null;
    try {
      token = JSON.parse(sessionStorage.getItem("token") ?? "null") as string | null;
    } catch {
      // malformed token
    }
    if (!token) return;

    apiService.get("/users/me")
      .then(() => router.replace("/households"))
      .catch((error: unknown) => {
        if ((error as { status?: number })?.status === 401) {
          clearToken();
          clearUsername();
          clearUserId();
        }
      });
  }, [apiService, router, clearToken, clearUsername, clearUserId]);

  const handleLogin = async (values: LoginFormValues): Promise<void> => {
    try {
      const response = await apiService.post<User>("/users/login", {
        username: values.username.trim(),
        password: values.password,
      });

      if (response.token) {
        setToken(response.token);
      }
      if (response.id) {
        setUserId(String(response.id));
      }
      setUsername(response.username?.trim() || values.username.trim());

      try {
        const households = await apiService.get<HouseholdWithRole[]>("/households");
        setHouseholds(households);
      } catch {
        setHouseholds([]);
      }

      router.push("/households");
    } catch (error) {
      message.error(getLoginErrorMessage(error));
    }
  };

  return (
    <AuthLayout
      title="Welcome Back"
      subtitle="Sign in to continue to your pantry."
      switchPrompt="Don't have an account?"
      switchActionLabel="Create account"
      onSwitchAction={() => router.push("/register")}
    >
      <Form<LoginFormValues>
        form={form}
        name="login"
        size="large"
        variant="outlined"
        onFinish={handleLogin}
        layout="vertical"
        autoComplete="off"
      >
        <Form.Item
          name="username"
          label="Username"
          rules={[{ required: true, message: "Please input your username." }]}
        >
          <Input placeholder="Your username" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, message: "Please input your password." }]}
        >
          <Input.Password placeholder="••••••••" />
        </Form.Item>
        {/* <Form.Item name="rememberMe" valuePropName="checked">
          <Checkbox className={styles.inlineAgreement}>Remember me</Checkbox>
        </Form.Item> */}
        <Form.Item>
          <Button type="primary" htmlType="submit" className={styles.submitButton}>
            Sign In
          </Button>
        </Form.Item>
      </Form>
    </AuthLayout>
  );
};

export default Login;
