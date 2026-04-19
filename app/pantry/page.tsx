"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import type { PantryBudgetPutDTO, PantryItem, PantryStats } from "@/types/pantry";
import { Button, Card, InputNumber, Space, Table, Typography, message } from "antd";
import type { TableProps } from "antd";
import type { ApplicationError } from "@/types/error";

const { Title, Text } = Typography;

export default function PantryPage() {
  const router = useRouter();
  const api = useApi();

  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [stats, setStats] = useState<PantryStats | null>(null);
  const [idealDraft, setIdealDraft] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) router.replace("/login");
  }, [router]);

  const fetchPantry = async () => {
    setLoading(true);
    try {
      const data = await api.get<PantryItem[]>("/pantry");
      setItems(data);
    } catch (error) {
      const appError = error as Partial<ApplicationError>;
      if (appError.status === 401) {
        router.replace("/login");
        return;
      }
      message.error(appError.message ?? "Failed to load pantry.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async (dateStr: string) => {
    try {
      const data = await api.get<PantryStats>(`/pantry/stats?from=${encodeURIComponent(dateStr)}`);
      setStats(data);
      if (idealDraft == null && data.idealDailyKcal != null) {
        setIdealDraft(data.idealDailyKcal);
      }
    } catch (error) {
      const appError = error as Partial<ApplicationError>;
      if (appError.status === 401) {
        router.replace("/login");
        return;
      }
      message.error(appError.message ?? "Failed to load pantry statistics.");
      setStats(null);
    }
  };

  useEffect(() => {
    fetchPantry();
    fetchStats(fromDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchStats(fromDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate]);

  const totalKcal = useMemo(() => {
    if (!items) return 0;
    return items.reduce((sum, item) => sum + (item.kcalPerPackage ?? 0) * (item.count ?? 0), 0);
  }, [items]);

  const consumeOne = async (id: number) => {
    try {
      await api.patch(`/pantry/${id}/consume`);
      await fetchPantry();
      await fetchStats(fromDate);
    } catch (error) {
      const appError = error as Partial<ApplicationError>;
      message.error(appError.message ?? "Failed to consume pantry item.");
    }
  };

  const removeItem = async (id: number) => {
    try {
      await api.delete(`/pantry/${id}`);
      await fetchPantry();
      await fetchStats(fromDate);
    } catch (error) {
      const appError = error as Partial<ApplicationError>;
      message.error(appError.message ?? "Failed to remove pantry item.");
    }
  };

  const saveIdealBudget = async () => {
    if (idealDraft == null) {
      message.warning("Please enter an ideal daily calorie budget.");
      return;
    }
    try {
      await api.put<PantryBudgetPutDTO>("/pantry/budget", { idealDailyKcal: idealDraft });
      await fetchStats(fromDate);
      message.success("Ideal calorie budget saved.");
    } catch (error) {
      const appError = error as Partial<ApplicationError>;
      message.error(appError.message ?? "Failed to save calorie budget.");
    }
  };

  const columns: TableProps<PantryItem>["columns"] = useMemo(
    () => [
      { title: "Name", dataIndex: "name", key: "name" },
      { title: "Brand", dataIndex: "brand", key: "brand" },
      { title: "Count", dataIndex: "count", key: "count" },
      {
        title: "kcal / pkg",
        key: "kcalPerPackage",
        render: (_, record) => (record.kcalPerPackage == null ? "—" : Math.round(record.kcalPerPackage)),
      },
      {
        title: "Total kcal",
        key: "totalKcal",
        render: (_, record) =>
          record.kcalPerPackage == null ? "—" : Math.round((record.kcalPerPackage ?? 0) * (record.count ?? 0)),
      },
      {
        title: "Added",
        key: "createdAt",
        render: (_, record) => (record.createdAt ? String(record.createdAt).slice(0, 10) : "—"),
      },
      {
        title: "Actions",
        key: "actions",
        render: (_, record) => (
          <Space>
            <Button onClick={() => consumeOne(record.id)} disabled={loading}>
              Consume 1
            </Button>
            <Button danger onClick={() => removeItem(record.id)} disabled={loading}>
              Remove
            </Button>
          </Space>
        ),
      },
    ],
    [loading],
  );

  return (
    <div className="card-container">
      <Card style={{ width: 1000 }} loading={!items}>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Title level={3} style={{ margin: 0 }}>
              Virtual Pantry
            </Title>
            <Space wrap>
              <Button type="primary" onClick={() => router.push("/lookup")}>
                Add items
              </Button>
              <Button onClick={fetchPantry} loading={loading}>
                Refresh
              </Button>
              <Button onClick={() => router.push("/users")}>Users</Button>
              <Button onClick={() => router.push("/")}>Home</Button>
            </Space>
          </Space>

          <Text>
            Total calories owned (estimate): <strong>{Math.round(totalKcal)}</strong> kcal
          </Text>

          <Card size="small">
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Space style={{ justifyContent: "space-between", width: "100%" }}>
                <Text>Average calories consumed since:</Text>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              </Space>

              <Text>
                Avg/day: <strong>{stats ? Math.round(stats.avgDailyCaloriesConsumed) : "—"}</strong> kcal
                {stats && stats.unknownKcalEvents > 0 ? (
                  <Text type="secondary"> (plus {stats.unknownKcalEvents} consumed items with unknown kcal)</Text>
                ) : null}
              </Text>

              <Space style={{ justifyContent: "space-between", width: "100%" }}>
                <Text>Ideal household kcal/day:</Text>
                <Space>
                  <InputNumber
                    min={1}
                    value={idealDraft}
                    onChange={(value) => setIdealDraft(value == null ? null : Number(value))}
                  />
                  <Button onClick={saveIdealBudget}>Save</Button>
                </Space>
              </Space>

              <Text>
                {stats?.idealDailyKcal == null || stats?.avgMinusIdeal == null ? (
                  <Text type="secondary">Set an ideal budget to compare.</Text>
                ) : (
                  <>
                    Difference vs ideal: <strong>{Math.round(Math.abs(stats.avgMinusIdeal))}</strong> kcal/day
                    {stats.avgMinusIdeal > 0 ? " above" : " below"} ideal
                  </>
                )}
              </Text>
            </Space>
          </Card>

          <Table<PantryItem>
            columns={columns}
            dataSource={items ?? []}
            rowKey="id"
            pagination={{ pageSize: 10 }}
          />
        </Space>
      </Card>
    </div>
  );
}
