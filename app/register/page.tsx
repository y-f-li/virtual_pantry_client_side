"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useSessionStorage from "@/hooks/useSessionStorage";
import type { HouseholdWithRole } from "@/types/household";
import AuthLayout from "@/components/auth/AuthLayout";
import { getRegisterErrorMessage } from "@/utils/authError";
import { User } from "@/types/user";
import { App, Button, Checkbox, Form, Input } from "antd";
import styles from "@/styles/auth.module.css";

interface RegisterFormValues {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
}

const Register: React.FC = () => {
  const router = useRouter();
  const { message } = App.useApp();
  const apiService = useApi();

  useEffect(() => {
    try {
      const token = JSON.parse(sessionStorage.getItem("token") ?? "null") as string | null;
      if (token) router.replace("/households");
    } catch {
      // malformed token, stay on register
    }
  }, [router]);
  const [form] = Form.useForm<RegisterFormValues>();
  const { set: setToken } = useSessionStorage<string>("token", "");
  const { set: setUsername } = useSessionStorage<string>("username", "");
  const { set: setUserId } = useSessionStorage<string>("userId", "");
  const { set: setHouseholds } = useSessionStorage<HouseholdWithRole[]>("households", []);

  const handleRegister = async (values: RegisterFormValues): Promise<void> => {
    try {
      const response = await apiService.post<User>("/users/register", {
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
      message.error(getRegisterErrorMessage(error));
    }
  };

  return (
    <AuthLayout
      title="Create Account"
      subtitle="Join our community of mindful curators."
      switchPrompt="Already have an account?"
      switchActionLabel="Sign in"
      onSwitchAction={() => router.push("/login")}
    >
      <Form<RegisterFormValues>
        form={form}
        name="register"
        size="large"
        variant="outlined"
        onFinish={handleRegister}
        layout="vertical"
        autoComplete="off"
      >
        <Form.Item
          name="username"
          label="Username"
          rules={[{ required: true, message: "Please input your username." }]}
        >
          <Input placeholder="Your name" />
        </Form.Item>
        <Form.Item
          name="email"
          label="Email Address"
          rules={[
            { required: true, message: "Please input your email." },
            { type: "email", message: "Please enter a valid email address." },
          ]}
        >
          <Input placeholder="your.email@example.com" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Password"
          rules={[
            { required: true, message: "Please input your password." },
            { min: 6, message: "Password must have at least 6 characters." },
          ]}
        >
          <Input.Password placeholder="••••••••" />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label="Confirm Password"
          dependencies={["password"]}
          rules={[
            { required: true, message: "Please confirm your password." },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue("password") === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error("Passwords do not match."));
              },
            }),
          ]}
        >
          <Input.Password placeholder="••••••••" />
        </Form.Item>
        <Form.Item
          name="acceptedTerms"
          valuePropName="checked"
          rules={[
            {
              validator: (_, value) =>
                value
                  ? Promise.resolve()
                  : Promise.reject(new Error("Please agree to the terms to continue.")),
            },
          ]}
        >
          <Checkbox className={styles.inlineAgreement}>
            <span className={styles.requiredSign}>*</span> I agree to the{" "}
            <a href="#terms">Terms of Service</a> and{" "}
            <a href="#privacy">Privacy Policy</a>.
          </Checkbox>
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" className={styles.submitButton}>
            Create Account
          </Button>
        </Form.Item>
      </Form>
    </AuthLayout>
  );
};

export default Register;
