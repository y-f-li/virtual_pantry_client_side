"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { useLogout } from "@/hooks/useLogout";
import { User } from "@/types/user";
import { Button, Card, Space, Table, Typography, message } from "antd";
import type { TableProps } from "antd";
import type { ApplicationError } from "@/types/error";
import { getActiveToken, isGuestMode } from "@/utils/authStorage";

const { Title, Text, Paragraph } = Typography;

const columns: TableProps<User>["columns"] = [
  {
    title: "Username",
    dataIndex: "username",
    key: "username",
  },
  {
    title: "Status",
    dataIndex: "status",
    key: "status",
  },
  {
    title: "Id",
    dataIndex: "id",
    key: "id",
  },
];

const Dashboard: React.FC = () => {
  const router = useRouter();
  const apiService = useApi();
  const [users, setUsers] = useState<User[] | null>(null);
  const logout = useLogout();

  useEffect(() => {
    if (isGuestMode()) {
      message.info("The users directory is only available for registered accounts.");
      router.replace("/pantry");
      return;
    }

    const token = getActiveToken();
    if (!token) router.replace("/login");
  }, [router]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const nextUsers: User[] = await apiService.get<User[]>("/users");
        setUsers(nextUsers);
      } catch (error: unknown) {
        const err = error as Partial<ApplicationError>;

        if (err.status === 401) {
          router.replace("/login");
          return;
        }

        message.error(err.message ?? "Unknown error while fetching users.");
      }
    };

    if (!isGuestMode() && getActiveToken()) {
      fetchUsers();
    }
  }, [apiService, router]);

  return (
    <div className="app-page">
      <div className="app-shell medium">
        <Card className="hero-card">
          <div className="page-toolbar">
            <div>
              <Text className="page-kicker">Registered accounts</Text>
              <Title level={2} className="page-heading">
                Users
              </Title>
              <Paragraph className="page-subtitle">
                Browse the registered users list and open a profile to inspect the stored account
                details.
              </Paragraph>
            </div>
            <div className="page-toolbar-actions">
              <Button type="primary" onClick={() => router.push("/pantry")}>Pantry</Button>
              <Button onClick={() => router.push("/lookup")}>Product lookup</Button>
              <Button onClick={() => router.push("/")}>Home</Button>
            </div>
          </div>
        </Card>

        <Card className="dashboard-container" loading={!users}>
          {users && (
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Table<User>
                columns={columns}
                dataSource={users}
                rowKey="id"
                onRow={(row) => ({
                  onClick: () => router.push(`/users/${row.id}`),
                  style: { cursor: "pointer" },
                })}
              />
              <Button onClick={logout} type="primary">
                Logout
              </Button>
            </Space>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
