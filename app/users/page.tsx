"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { useLogout } from "@/hooks/useLogout";
import { User } from "@/types/user";
import { Button, Card, Space, Table } from "antd";
import type { TableProps } from "antd";
import type { ApplicationError } from "@/types/error";

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
    const token = localStorage.getItem("token");
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

        alert(`Something went wrong while fetching users:\n${err.message ?? "Unknown error"}`);
      }
    };

    fetchUsers();
  }, [apiService, router]);

  return (
    <div className="card-container">
      <Card
        title="Registered users"
        loading={!users}
        className="dashboard-container"
        extra={
          <Space wrap>
            <Button onClick={() => router.push("/pantry")}>Pantry</Button>
            <Button onClick={() => router.push("/lookup")}>Product lookup</Button>
            <Button onClick={() => router.push("/")}>Home</Button>
          </Space>
        }
      >
        {users && (
          <>
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
          </>
        )}
      </Card>
    </div>
  );
};

export default Dashboard;
