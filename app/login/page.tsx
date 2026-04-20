"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Form, Input, Space, Typography, message } from "antd";
import { useApi } from "@/hooks/useApi";
import type { GuestSession } from "@/types/guest";
import type { User } from "@/types/user";
import type { ApplicationError } from "@/types/error";
import { clearGuestSession, storeGuestSession, storeUserSession } from "@/utils/authStorage";

const { Title, Text, Paragraph } = Typography;

function extractReasonFromMessage(msg: string): string {
  const match = msg.match(/\(\d+:\s*(.*)\)$/);
  return match?.[1] ?? msg;
}

export default function LoginPage() {
  const router = useRouter();
  const api = useApi();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();


  const enterGuestMode = async () => {
    try {
      setLoading(true);
      clearGuestSession();
      const session = await api.post<GuestSession>("/guest-session", {});
      storeGuestSession(session.token, session.username);
      message.success("Demo account ready. Nothing from this session will be kept.");
      router.push("/pantry");
    } catch {
      message.error("Could not start the guest demo session.");
    } finally {
      setLoading(false);
    }
  };


  const onFinish = async (values: { username: string; password: string }) => {
    try {
      setLoading(true);

      const response = await api.post<User>("/login", {
        username: values.username,
        password: values.password,
      });

      clearGuestSession();
      if (response?.token) storeUserSession(response.token, response.id);
      router.push("/pantry");
    } catch (e: unknown) {
      const err = e as Partial<ApplicationError>;
      const rawMsg = err.message ?? "Login failed";
      const cleanMsg = extractReasonFromMessage(rawMsg);
      message.error(cleanMsg);
      form.setFieldsValue({ password: "" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-page">
      <div className="app-shell narrow">
        <Card className="shell-card">
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <div>
              <Text className="page-kicker">Account access</Text>
              <Title level={2} className="page-heading">
                Login
              </Title>
              <Paragraph className="page-subtitle">
                Sign in to use the persistent pantry experience. Guest demo mode is also available here if you just want a quick look around.
              </Paragraph>
            </div>

            <Form form={form} layout="vertical" onFinish={onFinish} className="form-stack">
              <Form.Item
                name="username"
                label="Username"
                rules={[{ required: true, message: "Please enter your username" }]}
              >
                <Input placeholder="Enter username" />
              </Form.Item>

              <Form.Item
                name="password"
                label="Password"
                rules={[{ required: true, message: "Please enter your password" }]}
              >
                <Input.Password placeholder="Enter password" />
              </Form.Item>

              <Button type="primary" htmlType="submit" loading={loading} block>
                Login
              </Button>

              <Button type="default" onClick={() => router.push("/register")} block>
                No account? Register
              </Button>
              <Button type="primary" onClick={enterGuestMode} loading={loading} block>
                Continue in demo mode
              </Button>
              <Button onClick={() => router.push("/")} block>
                Back home
              </Button>
            </Form>

            <Text type="secondary">Use the same deployed backend endpoints, just with a lighter UI.</Text>
          </Space>
        </Card>
      </div>
    </div>
  );
}
