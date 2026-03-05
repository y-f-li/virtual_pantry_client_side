"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Form, Input, Typography, message } from "antd";
import { useApi } from "@/hooks/useApi";
import useLocalStorage from "@/hooks/useLocalStorage";
import type { User } from "@/types/user";

const { Title, Text } = Typography;

function extractReasonFromMessage(msg: string): string {
  // msg often looks like: "An error occurred ... (401: invalid credentials)"
  const match = msg.match(/\(\d+:\s*(.*)\)$/);
  return match?.[1] ?? msg;
}

export default function LoginPage() {
  const router = useRouter();
  const api = useApi();
  const [loading, setLoading] = useState(false);

  const { set: setToken } = useLocalStorage<string>("token", "");
  const [form] = Form.useForm();

  const onFinish = async (values: { username: string; password: string }) => {
    try {
      setLoading(true);

      // ✅ REAL login (registered users only)
      const response = await api.post<User>("/login", {
        username: values.username,
        password: values.password,
      });

      if (response?.token) setToken(response.token);
      if (response?.id != null) localStorage.setItem("userId", String(response.id));

      // Go to profile (or /users if you prefer)
      router.push(`/users/${response.id}`);
    } catch (e: any) {
      const rawMsg = e?.message ?? "Login failed";
      const cleanMsg = extractReasonFromMessage(rawMsg);
      message.error(cleanMsg);

      // Optional: clear password after failed login
      form.setFieldsValue({ password: "" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
      <Card>
        <Title level={3} style={{ marginTop: 0 }}>Login</Title>
        <Text type="secondary">Use your registered username and password.</Text>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          style={{ marginTop: 16 }}
        >
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

          <Button type="link" onClick={() => router.push("/register")} block>
            No account? Register
          </Button>
        </Form>
      </Card>
    </div>
  );
}