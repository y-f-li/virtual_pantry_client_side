"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Button, Card, Form, Input, Space, Typography, message } from "antd";
import { useApi } from "@/hooks/useApi";
import type { ApplicationError } from "@/types/error";

const { Title, Text, Paragraph } = Typography;

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
      <div className="app-page">
        <div className="app-shell narrow">
          <Alert type="error" message={err} showIcon />
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="app-shell narrow">
        <Card className="shell-card">
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <div>
              <Text className="page-kicker">Account security</Text>
              <Title level={2} className="page-heading">
                Change password
              </Title>
              <Paragraph className="page-subtitle">
                After saving, the current session is cleared and you will need to log in again.
              </Paragraph>
            </div>

            {err && <Alert type="error" message={err} showIcon />}

            <Form form={form} layout="vertical" onFinish={onFinish} className="form-stack">
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

              <Button onClick={() => router.push(`/users/${id}`)} block>
                Cancel
              </Button>
            </Form>
          </Space>
        </Card>
      </div>
    </div>
  );
}
