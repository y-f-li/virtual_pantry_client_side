"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Button, Card, Form, Input, Typography, message } from "antd";
import { useApi } from "@/hooks/useApi";
import type { ApplicationError } from "@/types/error";

const { Title, Text } = Typography;

function extractReasonFromMessage(msg: string): string {
  const match = msg.match(/\(\d+:\s*(.*)\)$/);
  return match?.[1] ?? msg;
}

export default function ChangePasswordPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const api = useApi();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form] = Form.useForm();

  // Guard: must be logged in AND must be self
  useEffect(() => {
    const token = localStorage.getItem("token");
    const selfId = localStorage.getItem("userId");
    if (!token) {
      router.replace("/login");
      return;
    }
    if (!selfId || selfId !== String(id)) {
      setErr("You can only change your own password.");
    }
  }, [id, router]);

  const onFinish = async (values: { oldPassword: string; newPassword: string }) => {
    try {
      setLoading(true);
      setErr(null);

      await api.put<void>(`/users/${id}`, {
        oldPassword: values.oldPassword,
        password: values.newPassword,
      });

      // Backend invalidated token; clear client too
      localStorage.removeItem("token");
      localStorage.removeItem("userId");

      message.success("Password updated. Please log in again.");
      router.push("/login");
    } catch (e: unknown) {
      const err = e as Partial<ApplicationError>;
      const raw = err.message ?? "Failed to update password";
      const clean = extractReasonFromMessage(raw);
      setErr(clean);
      message.error(clean);
      form.setFieldsValue({ oldPassword: "", newPassword: "" });
    } finally {
      setLoading(false);
    }
  };

  if (err && err === "You can only change your own password.") {
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
        <Alert type="error" message={err} showIcon />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
      <Card>
        <Title level={3} style={{ marginTop: 0 }}>Change password</Title>
        <Text type="secondary">You’ll be logged out after saving.</Text>

        {err && <Alert style={{ marginTop: 12 }} type="error" message={err} showIcon />}

        <Form form={form} layout="vertical" onFinish={onFinish} style={{ marginTop: 16 }}>
          <Form.Item
            label="Current password"
            name="oldPassword"
            rules={[{ required: true, message: "Please enter your current password" }]}
          >
            <Input.Password />
          </Form.Item>

          <Form.Item
            label="New password"
            name="newPassword"
            rules={[{ required: true, message: "Please enter a new password" }]}
          >
            <Input.Password />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={loading} block>
            Save new password
          </Button>

          <Button onClick={() => router.push(`/users/${id}`)} block style={{ marginTop: 8 }}>
            Cancel
          </Button>
        </Form>
      </Card>
    </div>
  );
}