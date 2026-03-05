"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Form, Input, Typography, message } from "antd";
import { useApi } from "@/hooks/useApi";
import type { ApplicationError } from "@/types/error";
import type { User } from "@/types/user";

const { Title, Text } = Typography;

function extractReasonFromMessage(msg: string): string {
  // msg often looks like: "An error occurred ... (409: username already exists)"
  const match = msg.match(/\(\d+:\s*(.*)\)$/);
  return match?.[1] ?? msg;
}

export default function RegisterPage() {
  const router = useRouter();
  const api = useApi();

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [form] = Form.useForm();

  const onFinish = async (values: { username: string; password: string; bio: string }) => {
    try {
      setLoading(true);
      setServerError(null);

      const created = await api.post<User>("/users", {
        username: values.username,
        password: values.password,
        bio: values.bio,
      });
      if (created?.token) localStorage.setItem("token", created.token);
      if (created?.id != null) localStorage.setItem("userId", String(created.id));

      router.push(`/users/${created.id}`);
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
    <div style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
      <Card>
        <Title level={3} style={{ marginTop: 0 }}>Register</Title>
        <Text type="secondary">Create an account, then you’ll be redirected to your profile.</Text>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            label="Username"
            name="username"
            validateStatus={serverError ? "error" : ""}
            help={serverError ?? ""}
            rules={[{ required: true, message: "Please enter a username" }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: "Please enter a password" }]}
          >
            <Input.Password />
          </Form.Item>

          <Form.Item
            label="Bio"
            name="bio"
            rules={[
              { required: false, message: "Please enter a short bio (optional)" },
            ]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={loading} block>
            Create account
          </Button>

          <Button type="link" onClick={() => router.push("/login")} block>
            Already registered? Go to login
          </Button>
        </Form>
      </Card>
    </div>
  );
}