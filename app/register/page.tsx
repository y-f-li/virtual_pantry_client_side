"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Form, Input, Space, Typography, message } from "antd";
import { useApi } from "@/hooks/useApi";
import type { ApplicationError } from "@/types/error";
import type { User } from "@/types/user";
import { clearGuestSession, storeUserSession } from "@/utils/authStorage";

const { Title, Text, Paragraph } = Typography;

function extractReasonFromMessage(msg: string): string {
  const match = msg.match(/\(\d+:\s*(.*)\)$/);
  return match?.[1] ?? msg;
}

export default function RegisterPage() {
  const router = useRouter();
  const api = useApi();

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [form] = Form.useForm();

  const onFinish = async (values: { username: string; password: string }) => {
    try {
      setLoading(true);
      setServerError(null);

      const created = await api.post<User>("/users", {
        username: values.username,
        password: values.password,
        bio: "",
      });

      clearGuestSession();
      if (created?.token) storeUserSession(created.token, created.id);
      router.push("/pantry");
    } catch (e: unknown) {
      const err = e as Partial<ApplicationError>;
      const rawMsg = err.message ?? "Registration failed";
      const cleanMsg = extractReasonFromMessage(rawMsg);
      setServerError(cleanMsg);
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
              <Text className="page-kicker">Create a persistent account</Text>
              <Title level={2} className="page-heading">
                Register
              </Title>
              <Paragraph className="page-subtitle">
                Set up an account and head straight into the pantry. Guest sessions are temporary,
                but registered accounts keep your pantry state around.
              </Paragraph>
            </div>

            <Form form={form} layout="vertical" onFinish={onFinish} className="form-stack">
              <Form.Item
                label="Username"
                name="username"
                validateStatus={serverError ? "error" : ""}
                help={serverError ?? ""}
                rules={[{ required: true, message: "Please enter a username" }]}
              >
                <Input placeholder="Choose a username" />
              </Form.Item>

              <Form.Item
                label="Password"
                name="password"
                rules={[{ required: true, message: "Please enter a password" }]}
              >
                <Input.Password placeholder="Choose a password" />
              </Form.Item>

              <Button type="primary" htmlType="submit" loading={loading} block>
                Create account
              </Button>

              <Button type="default" onClick={() => router.push("/login")} block>
                Already registered? Go to login
              </Button>
              <Button onClick={() => router.push("/")} block>
                Back home
              </Button>
            </Form>

            <Text type="secondary">Everything stays on the same light visual language as the pantry pages.</Text>
          </Space>
        </Card>
      </div>
    </div>
  );
}
