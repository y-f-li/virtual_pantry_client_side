"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Space, Typography } from "antd";

const { Title, Paragraph, Text } = Typography;

export default function HomePage() {
  const router = useRouter();

  return (
    <div style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 16 }}>
      <Card style={{ width: 760, maxWidth: "100%" }}>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <div>
            <Title level={2} style={{ marginTop: 0, marginBottom: 8 }}>
              Pantry Prototype
            </Title>
            <Paragraph style={{ marginBottom: 0 }}>
              This deployed client is now centered around the pantry workflow: sign in,
              look up products through OpenFoodFacts, and manage the shared virtual pantry.
            </Paragraph>
          </div>

          <Space wrap>
            <Button type="primary" onClick={() => router.push("/login")}>
              Login
            </Button>
            <Button onClick={() => router.push("/register")}>Register</Button>
            <Button onClick={() => router.push("/lookup")}>Product lookup</Button>
            <Button onClick={() => router.push("/pantry")}>Virtual pantry</Button>
            <Button onClick={() => router.push("/users")}>Users</Button>
          </Space>

          <Card size="small" title="What you can do here">
            <Space direction="vertical" size="small">
              <Text>• Search by barcode or keyword and add products to the pantry.</Text>
              <Text>• Track package calories, pantry stock, and consumption over time.</Text>
              <Text>• Keep the existing deployed login, registration, profile, and password flow.</Text>
            </Space>
          </Card>
        </Space>
      </Card>
    </div>
  );
}
