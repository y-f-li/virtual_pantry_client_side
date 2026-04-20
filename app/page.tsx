"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Space, Typography, message } from "antd";
import { useApi } from "@/hooks/useApi";
import type { GuestSession } from "@/types/guest";
import { clearGuestSession, storeGuestSession } from "@/utils/authStorage";

const { Title, Paragraph } = Typography;

export default function HomePage() {
  const router = useRouter();
  const api = useApi();
  const [guestLoading, setGuestLoading] = useState(false);

  const enterGuestMode = async () => {
    try {
      setGuestLoading(true);
      clearGuestSession();
      const session = await api.post<GuestSession>("/guest-session", {});
      storeGuestSession(session.token, session.username);
      message.success("Demo account ready. Nothing from this session will be kept.");
      router.push("/pantry");
    } catch {
      message.error("Could not start the guest demo session.");
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <div className="app-page">
      <div className="app-shell">
        <Card className="hero-card">
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <div>
              <Title level={1} className="page-heading">
                Virtual Pantry Calorie Counter
              </Title>
              <Paragraph className="page-subtitle" style={{ maxWidth: 780, marginBottom: 0 }}>
                <strong>Add items</strong> to Pantry using barcode look up. <strong>Consume</strong>{" "}
                to count how many calories you&apos;ve consumed this week.
              </Paragraph>
            </div>
          </Space>
        </Card>

        <Card className="section-card" title="Try it instantly">
          <div className="panel-row">
            <Button type="primary" onClick={enterGuestMode} loading={guestLoading}>
              Guest
            </Button>
            <div className="panel-copy">
              <Paragraph style={{ marginBottom: 0 }}>
                Check out the functionality without needing to register or login. You get a demo
                pantry that starts clean each time and disappears when the session ends.
              </Paragraph>
            </div>
          </div>
        </Card>

        <Card className="section-card" title="Registered account">
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Paragraph style={{ marginBottom: 0 }}>
              Create an account for the persistent flow.
            </Paragraph>
            <div className="action-wrap">
              <Button type="primary" onClick={() => router.push("/login")}>
                Login
              </Button>
              <Button onClick={() => router.push("/register")}>Register</Button>
            </div>
          </Space>
        </Card>
      </div>
    </div>
  );
}
