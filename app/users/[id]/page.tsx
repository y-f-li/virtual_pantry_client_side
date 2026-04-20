"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Button, Card, Space, Spin, Typography, message } from "antd";
import { useApi } from "@/hooks/useApi";
import { useLogout } from "@/hooks/useLogout";
import { User } from "@/types/user";
import type { ApplicationError } from "@/types/error";
import { getActiveToken, isGuestMode } from "@/utils/authStorage";

const { Title, Text, Paragraph } = Typography;

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
    if (isGuestMode()) {
      message.info("Guest demo mode does not include the users directory.");
      router.replace("/pantry");
      return;
    }

    const selfId = localStorage.getItem("userId");
    setIsSelf(!!selfId && String(id) === selfId);
  }, [id, router]);

  useEffect(() => {
    const token = getActiveToken();
    if (!token || isGuestMode()) router.replace("/login");
  }, [router]);

  useEffect(() => {
    if (isGuestMode()) return;

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
    return <div className="app-page"><Spin /></div>;
  }
  if (err) return <div className="app-page"><div className="app-shell medium"><Alert type="error" message={err} showIcon /></div></div>;
  if (!user) return <div className="app-page"><div className="app-shell medium"><Alert type="warning" message="User not found." showIcon /></div></div>;

  return (
    <div className="app-page">
      <div className="app-shell medium">
        <Card className="hero-card">
          <div className="page-toolbar">
            <div>
              <Text className="page-kicker">User profile</Text>
              <Title level={2} className="page-heading">
                {user.username ?? "Profile"}
              </Title>
              <Paragraph className="page-subtitle">
                Profile details for the selected registered account.
              </Paragraph>
            </div>
            <div className="page-toolbar-actions">
              <Button type="primary" onClick={() => router.push("/pantry")}>Pantry</Button>
              <Button onClick={() => router.push("/lookup")}>Product lookup</Button>
              <Button onClick={() => router.push("/users")}>Users overview</Button>
              {isSelf ? (
                <Button onClick={() => router.push(`/users/${id}/password`)}>
                  Change password
                </Button>
              ) : null}
              <Button onClick={logout} type="primary">
                Logout
              </Button>
            </div>
          </div>
        </Card>

        <Card className="shell-card">
          <div className="profile-copy">
            <p><b>ID:</b> {user.id}</p>
            <p><b>Status:</b> {user.status}</p>
            <p><b>Created:</b> {user.creation_date ? new Date(user.creation_date).toLocaleString() : "—"}</p>
            <p><b>Bio:</b> {user.bio ?? "—"}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
