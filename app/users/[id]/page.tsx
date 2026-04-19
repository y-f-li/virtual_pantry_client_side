"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Button, Card, Space, Spin } from "antd";
import { useApi } from "@/hooks/useApi";
import { useLogout } from "@/hooks/useLogout";
import { User } from "@/types/user";
import type { ApplicationError } from "@/types/error";

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const api = useApi();

  const [user, setUser] = useState<User | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const logout = useLogout();
  const [isSelf, setIsSelf] = useState(false);

  useEffect(() => {
    const selfId = localStorage.getItem("userId");
    setIsSelf(!!selfId && String(id) === selfId);
  }, [id]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) router.replace("/login");
  }, [router]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const nextUser = await api.get<User>(`/users/${id}`);
        setUser(nextUser);
      } catch (e: unknown) {
        const appError = e as Partial<ApplicationError>;
        if (appError.status === 401) {
          router.replace("/login");
          return;
        }
        setErr(appError.message ?? "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, [api, id, router]);

  if (loading) {
    return <div style={{ display: "grid", placeItems: "center", minHeight: 300 }}><Spin /></div>;
  }
  if (err) return <Alert type="error" message={err} showIcon />;
  if (!user) return <Alert type="warning" message="User not found." showIcon />;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <Card
        title={`Profile: ${user.username ?? ""}`}
        extra={
          <Space wrap>
            <Button onClick={() => router.push("/pantry")}>Pantry</Button>
            <Button onClick={() => router.push("/lookup")}>Product lookup</Button>
            <Button onClick={() => router.push("/users")}>Users overview</Button>
            {isSelf && (
              <Button onClick={() => router.push(`/users/${id}/password`)}>
                Change password
              </Button>
            )}
            <Button onClick={logout} type="primary">
              Logout
            </Button>
          </Space>
        }
      >
        <p><b>ID:</b> {user.id}</p>
        <p><b>Status:</b> {user.status}</p>
        <p><b>Created:</b> {user.creation_date ? new Date(user.creation_date).toLocaleString() : "—"}</p>
        <p><b>Bio:</b> {user.bio ?? "—"}</p>
      </Card>
    </div>
  );
}
