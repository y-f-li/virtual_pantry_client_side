"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, InputNumber, Space, Table, Typography, message } from "antd";
import type { TableProps } from "antd";
import { useApi } from "@/hooks/useApi";
import type { ApplicationError } from "@/types/error";
import type { PantryBudgetPutDTO, PantryItem, PantryStats } from "@/types/pantry";
import { getActiveToken, isGuestMode } from "@/utils/authStorage";
import { useLogout } from "@/hooks/useLogout";

const { Title, Text, Paragraph } = Typography;

function getStartOfCalendarWeek(): string {
  const currentDate = new Date();
  const localDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  const weekday = localDate.getDay();
  const daysSinceMonday = (weekday + 6) % 7;
  localDate.setDate(localDate.getDate() - daysSinceMonday);
  return localDate.toISOString().slice(0, 10);
}

export default function PantryPage() {
  const router = useRouter();
  const api = useApi();
  const logout = useLogout();

  const [guest, setGuest] = useState(false);
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [stats, setStats] = useState<PantryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(getStartOfCalendarWeek());
  const [fromDateTouched, setFromDateTouched] = useState(false);
  const [idealDraft, setIdealDraft] = useState<number | null>(null);

  const totalKcal = useMemo(
    () =>
      (items ?? []).reduce(
        (sum, item) => sum + ((item.kcalPerPackage ?? 0) * (item.count ?? 0)),
        0,
      ),
    [items],
  );

  const fetchPantry = async () => {
    try {
      setLoading(true);
      const pantryItems = await api.get<PantryItem[]>("/pantry");
      setItems(pantryItems);
    } catch (error) {
      const appError = error as Partial<ApplicationError>;
      message.error(appError.message ?? "Failed to load pantry items.");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async (startDate: string) => {
    try {
      const pantryStats = await api.get<PantryStats>(`/pantry/stats?from=${encodeURIComponent(startDate)}`);
      setStats(pantryStats);
      setIdealDraft(pantryStats.idealDailyKcal ?? null);
    } catch (error) {
      const appError = error as Partial<ApplicationError>;
      message.error(appError.message ?? "Failed to load pantry statistics.");
    }
  };

  useEffect(() => {
    setGuest(isGuestMode());
    const token = getActiveToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    fetchPantry();
    fetchStats(fromDate);
  }, [router]);

  useEffect(() => {
    const token = getActiveToken();
    if (!token) {
      return;
    }
    fetchStats(fromDate);
  }, [fromDate]);

  const consumeOne = async (itemId: number) => {
    try {
      await api.patch(`/pantry/${itemId}/consume`, {});
      await fetchPantry();
      await fetchStats(fromDate);
    } catch (error) {
      const appError = error as Partial<ApplicationError>;
      message.error(appError.message ?? "Failed to consume pantry item.");
    }
  };

  const removeItem = async (itemId: number) => {
    try {
      await api.delete(`/pantry/${itemId}`);
      message.success("Pantry item removed.");
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
        render: (_, record) =>
          record.kcalPerPackage == null ? "—" : Math.round(record.kcalPerPackage),
      },
      {
        title: "Total kcal",
        key: "totalKcal",
        render: (_, record) =>
          record.kcalPerPackage == null
            ? "—"
            : Math.round((record.kcalPerPackage ?? 0) * (record.count ?? 0)),
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
    <div className="app-page">
      <div className="app-shell">
        <Card className="hero-card" loading={!items}>
          <div className="page-toolbar">
            <div>
              <Title level={2} className="page-heading">
                Virtual Pantry
              </Title>
              <Paragraph className="page-subtitle">
                View your pantry stock, estimate calorie, and track consumption in one place
              </Paragraph>
              <div className="guidance-callout" style={{ marginTop: 16 }}>
                <Paragraph style={{ marginBottom: 0 }}>
                  <strong>Add items</strong> to see change in Estimated Calories owned. <strong>Consume 1</strong>{" "}
                  to see change in average Calorie consumption per day.
                </Paragraph>
              </div>
              {guest ? (
                <div className="soft-note" style={{ marginTop: 14 }}>
                  Guest demo mode is active. This pantry resets when the browser session ends.
                </div>
              ) : null}
            </div>
            <div className="page-toolbar-actions">
              {!guest ? (
                <>
                  <Button onClick={fetchPantry} loading={loading}>
                    Refresh
                  </Button>
                  <Button onClick={() => router.push("/users")}>Users</Button>
                  <Button onClick={() => router.push("/")}>Home</Button>
                </>
              ) : null}
              {guest ? <Button danger onClick={logout}>Exit demo</Button> : null}
            </div>
          </div>
        </Card>

        <div className="metric-grid">
          <div className="metric-card">
            <span className="metric-label">Estimated calories in your pantry now</span>
            <span className="metric-value">{Math.round(totalKcal)} kcal</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Average consumed / day</span>
            <span className="metric-value">
              {stats ? `${Math.round(stats.avgDailyCaloriesConsumed)} kcal` : "—"}
            </span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Ideal calorie budget per day</span>
            <span className="metric-value">
              {stats?.idealDailyKcal == null ? "Unset" : `${Math.round(stats.idealDailyKcal)} kcal`}
            </span>
          </div>
        </div>

        <Card className="section-card" title="Ideal calorie budget">
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <div className="page-toolbar">
              <Text>
                Average calories consumed since:{" "}
                {!fromDateTouched ? "(beginning from the calendar week by default)" : ""}
              </Text>
              <input
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFromDateTouched(true);
                  setFromDate(event.target.value);
                }}
              />
            </div>

            <Text>
              Avg/day: <strong>{stats ? Math.round(stats.avgDailyCaloriesConsumed) : "—"}</strong> kcal
              {stats && stats.unknownKcalEvents > 0 ? (
                <Text type="secondary"> (plus {stats.unknownKcalEvents} consumed items with unknown kcal)</Text>
              ) : null}
            </Text>

            <div className="page-toolbar">
              <Text>Ideal kcal/day:</Text>
              <Space>
                <InputNumber
                  min={1}
                  value={idealDraft}
                  onChange={(value) => setIdealDraft(value == null ? null : Number(value))}
                />
                <Button type="primary" onClick={saveIdealBudget}>Save</Button>
              </Space>
            </div>

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

        <Card className="section-card">
          <div className="panel-row pantry-cta-row">
            <Button type="primary" onClick={() => router.push("/lookup")}>
              Add items
            </Button>
            <div className="panel-copy">
              <Paragraph style={{ marginBottom: 0 }}>
                Add items to Pantry using barcode look up.
              </Paragraph>
            </div>
          </div>
        </Card>

        <Card className="section-card" title="Pantry items">
          <Table<PantryItem>
            columns={columns}
            dataSource={items ?? []}
            rowKey="id"
            pagination={{ pageSize: 10 }}
          />
        </Card>
      </div>
    </div>
  );
}
