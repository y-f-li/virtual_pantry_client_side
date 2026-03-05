"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Typography } from "antd";

const { Title } = Typography;

export default function HomePage() {
  const router = useRouter();

  return (
    <div style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 16 }}>
      <Card style={{ width: 520, textAlign: "center" }}>
        <Title level={2} style={{ marginTop: 0 }}>
          Individual Project
        </Title>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24 }}>
          <Button type="primary" onClick={() => router.push("/login")}>
            Login
          </Button>
          <Button onClick={() => router.push("/register")}>
            Register
          </Button>
        </div>
      </Card>
    </div>
  );
}