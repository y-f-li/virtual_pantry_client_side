"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { VirtualPantryAppShell } from "@/components/VirtualPantryAppShell";
import useSessionStorage from "@/hooks/useSessionStorage";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import type { ConsumptionUnit, PantryOverview } from "@/types/pantry";
import type { HouseholdWithRole } from "@/types/household";
import type { ConsumptionLogEntry } from "@/types/consumption";
import { formatQuantity } from "@/utils/pantry";
import { App, Button, Card, Spin, Tag, Typography } from "antd";
import {
  AppstoreOutlined,
  HistoryOutlined,
  PlusOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import dashboardStyles from "@/styles/dashboard.module.css";

const { Title, Paragraph, Text } = Typography;

const REMOVED_ITEM_LABEL = "Removed item";
const ACTIVITY_HISTORY_LIMIT = 30;

interface HouseholdMember {
  userId: number;
  username: string;
  role: "owner" | "member";
  joinedAt: string;
}

type InventoryRow = {
  id: number;
  product: string;
  quantity: string;
  category: string;
  status: string;
  statusTone: "danger" | "ok";
};

const DAIRY_KEYWORDS = ["milk", "cheese", "yogurt", "cream", "butter", "dairy"];
const PRODUCE_KEYWORDS = ["fruit", "berry", "vegetable", "lettuce", "tomato", "produce", "apple", "orange"];
const BAKERY_KEYWORDS = ["bread", "bun", "bagel", "bakery", "toast", "croissant"];

function includesAnyKeyword(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function inferCategory(name: string): string {
  const n = name.trim().toLowerCase();
  if (includesAnyKeyword(n, DAIRY_KEYWORDS)) return "Dairy";
  if (includesAnyKeyword(n, PRODUCE_KEYWORDS)) return "Produce";
  if (includesAnyKeyword(n, BAKERY_KEYWORDS)) return "Bakery";
  return "Pantry";
}

function formatAgo(iso: string): string {
  const mins = Math.max(0, dayjs().diff(dayjs(iso), "minute"));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function initialsOf(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(" ").filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

const DashboardPage: React.FC = () => {
  const { isAuthenticated } = useAuthGuard();
  const router = useRouter();
  const api = useApi();
  const { message } = App.useApp();
  const { value: households } = useSessionStorage<HouseholdWithRole[]>("households", []);
  const { value: userId } = useSessionStorage<string>("userId", "");
  const {
    value: selectedHouseholdId,
    set: setSelectedHouseholdId,
  } = useSessionStorage<number | null>("selectedHouseholdId", null);

  const [loading, setLoading] = useState(false);
  const [pantry, setPantry] = useState<PantryOverview | null>(null);
  const [activity, setActivity] = useState<ConsumptionLogEntry[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);

  const activeHousehold = useMemo(() => {
    if (!households.length) return null;
    if (selectedHouseholdId !== null) {
      const matched = households.find((h) => h.householdId === selectedHouseholdId);
      if (matched) return matched;
    }
    return households[0];
  }, [households, selectedHouseholdId]);

  useEffect(() => {
    if (!activeHousehold) return;
    if (selectedHouseholdId === activeHousehold.householdId) return;
    setSelectedHouseholdId(activeHousehold.householdId);
  }, [activeHousehold, selectedHouseholdId, setSelectedHouseholdId]);

  useEffect(() => {
    if (!isAuthenticated || !activeHousehold) return;

    const loadDashboard = async () => {
      setLoading(true);
      try {
        const [pantryRes, logsRes, membersRes] = await Promise.all([
          api.get<PantryOverview>(`/households/${activeHousehold.householdId}/pantry`),
          api.get<ConsumptionLogEntry[]>(
            `/households/${activeHousehold.householdId}/consumption-logs?limit=${ACTIVITY_HISTORY_LIMIT}`,
          ),
          api
            .get<HouseholdMember[]>(`/households/${activeHousehold.householdId}/members`)
            .catch(() => [] as HouseholdMember[]),
        ]);
        setPantry(pantryRes && Array.isArray(pantryRes.items) ? pantryRes : { items: [], totalCalories: 0 });
        setActivity(Array.isArray(logsRes) ? logsRes : []);
        setMembers(Array.isArray(membersRes) ? membersRes : []);
      } catch (error) {
        message.error(error instanceof Error ? error.message : "Could not load dashboard data.");
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, [activeHousehold, api, isAuthenticated, message]);

  const memberNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of members) {
      map.set(m.userId, m.username);
    }
    return map;
  }, [members]);

  const lowStockCount = useMemo(() => {
    return (pantry?.items ?? []).filter((item) => item.amount <= 2).length;
  }, [pantry?.items]);

  const distinctProductCount = pantry?.items?.length ?? 0;

  const oneWeekAgo = useMemo(() => dayjs().subtract(7, "day"), []);

  const weeklyLogs = useMemo(() => {
    return activity.filter((log) => !dayjs(log.consumedAt).isBefore(oneWeekAgo));
  }, [activity, oneWeekAgo]);

  const mostConsumed = useMemo(() => {
    if (!weeklyLogs.length) return null;
    const totals = new Map<string, { qty: number; unit: string }>();
    for (const log of weeklyLogs) {
      if (!log.productName || log.productName === REMOVED_ITEM_LABEL) continue;
      const existing = totals.get(log.productName);
      totals.set(log.productName, {
        qty: (existing?.qty ?? 0) + log.consumedQuantity,
        unit: existing?.unit ?? log.consumedUnit ?? "units",
      });
    }
    let topName: string | null = null;
    let topQty = 0;
    let topUnit = "units";
    for (const [name, { qty, unit }] of totals.entries()) {
      if (qty > topQty) {
        topName = name;
        topQty = qty;
        topUnit = unit;
      }
    }
    return topName ? { name: topName, qty: topQty, unit: topUnit } : null;
  }, [weeklyLogs]);

  const weeklyCalories = useMemo(() => {
    return weeklyLogs.reduce((sum, log) => sum + (log.consumedCalories ?? 0), 0);
  }, [weeklyLogs]);

  const inventoryRows = useMemo<InventoryRow[]>(() => {
    return (pantry?.items ?? [])
      .slice()
      .sort((a, b) => a.amount - b.amount)
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        product: item.name,
        quantity: `${item.amount} ${item.amountUnit}`,
        category: inferCategory(item.name),
        status: item.amount <= 2 ? "LOW STOCK" : "FRESH",
        statusTone: item.amount <= 2 ? "danger" : "ok",
      }));
  }, [pantry?.items]);

  const contextualTip = useMemo(() => {
    if (lowStockCount > 0) {
      return {
        label: "Restock reminder",
        text: `${lowStockCount} item${lowStockCount > 1 ? "s are" : " is"} running low (≤2 units). Consider refilling before your next cook.`,
      };
    }
    if (!pantry?.items?.length) {
      return {
        label: "Get started",
        text: "Your pantry is empty. Add your first product to start tracking what you eat.",
      };
    }
    if (!activity.length) {
      return {
        label: "Log consumption",
        text: "Record what you consume to unlock weekly stats, trends and smart suggestions.",
      };
    }
    return {
      label: "Kitchen tip",
      text: "Keep herbs fresh for weeks by storing them upright in water, inside the fridge.",
    };
  }, [lowStockCount, pantry?.items, activity.length]);

  if (!activeHousehold) {
    return (
      <VirtualPantryAppShell activeNav="dashboard">
        <Card className={dashboardStyles.emptyCard}>
          <Title level={3}>No household selected</Title>
          <Paragraph type="secondary">
            Create or join a household to unlock dashboard insights.
          </Paragraph>
          <Button type="primary" onClick={() => router.push("/households")}>
            Go to Households
          </Button>
        </Card>
      </VirtualPantryAppShell>
    );
  }

  return (
    <VirtualPantryAppShell activeNav="dashboard">
      <div className={dashboardStyles.header}>
        <div>
          <Title level={2} className={dashboardStyles.title}>Pantry Overview</Title>
          <Paragraph className={dashboardStyles.subtitle}>
            Curating your kitchen&apos;s essentials with intent.
          </Paragraph>
          <div className={dashboardStyles.headerMeta}>
            <Text className={dashboardStyles.householdName}>{activeHousehold.name}</Text>
            <Tag color={activeHousehold.role === "owner" ? "green" : "blue"} style={{ margin: 0 }}>
              {activeHousehold.role.toUpperCase()}
            </Tag>
            {members.length > 0 && (
              <span className={dashboardStyles.headerMetaItem}>
                <TeamOutlined /> {members.length} member{members.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button
            onClick={() => router.push(`/users/${userId}/details/nutrition-reference`)}
            disabled={!userId}
          >
            Nutrition Reference
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push(`/open-food-facts?householdId=${activeHousehold.householdId}&householdName=${encodeURIComponent(activeHousehold.name)}`)}
          >
            Add Product
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className={dashboardStyles.emptyCard}><Spin /></Card>
      ) : (
        <div className={dashboardStyles.grid}>
          <div className={dashboardStyles.leftColumn}>
            <Card className={dashboardStyles.alertCard}>
              <div className={dashboardStyles.alertTopRow}>
                <div className={dashboardStyles.alertLabel}>Low stock</div>
                <div className={dashboardStyles.alertIcon}>!</div>
              </div>
              <div className={dashboardStyles.alertContent}>
                <span className={dashboardStyles.alertValue}>{lowStockCount}</span>
                <span className={dashboardStyles.alertUnit}>Item{lowStockCount === 1 ? "" : "s"}</span>
              </div>
              <div className={dashboardStyles.alertFootnote}>
                {lowStockCount === 0
                  ? "All tracked products are comfortably stocked."
                  : "Products at ≤2 units. Consider restocking soon."}
              </div>
            </Card>

            <div className={dashboardStyles.kpiRow}>
              <Card className={dashboardStyles.kpiCard}>
                <div className={dashboardStyles.kpiLabel}>Distinct products</div>
                <div className={dashboardStyles.kpiValue}>{distinctProductCount}</div>
                <div className={dashboardStyles.kpiSub}>
                  unique product{distinctProductCount === 1 ? "" : "s"} currently stocked
                </div>
              </Card>
              <Card className={dashboardStyles.kpiCardOutline}>
                <div className={dashboardStyles.kpiLabel}>Calories this week</div>
                <div className={dashboardStyles.kpiValue}>{Math.round(weeklyCalories)}</div>
                <div className={dashboardStyles.kpiSub}>
                  {weeklyLogs.length === 0
                    ? "No consumption logged yet"
                    : `${weeklyLogs.length} log${weeklyLogs.length > 1 ? "s" : ""} in last 7 days`}
                </div>
              </Card>
              <Card className={dashboardStyles.kpiCardGreen}>
                <div className={dashboardStyles.kpiLabel}>Most consumed</div>
                <div className={dashboardStyles.kpiTitle} title={mostConsumed?.name}>
                  {mostConsumed ? mostConsumed.name : "No data yet"}
                </div>
                <div className={dashboardStyles.kpiSub}>
                  {mostConsumed ? `${formatQuantity(mostConsumed.qty, mostConsumed.unit as ConsumptionUnit)} / week` : "Record consumption to see trends"}
                </div>
              </Card>
            </div>

            <Card
              className={dashboardStyles.inventoryCard}
              title={
                <div className={dashboardStyles.sectionTitleRow}>
                  <span>Current Inventory</span>
                  <Button
                    type="link"
                    size="small"
                    icon={<AppstoreOutlined />}
                    onClick={() =>
                      router.push(
                        `/households/${activeHousehold.householdId}/stats`,
                      )
                    }
                  >
                    View all
                  </Button>
                </div>
              }
            >
              {inventoryRows.length === 0 ? (
                <Text type="secondary">No products in pantry yet.</Text>
              ) : (
                <div className={dashboardStyles.inventoryTable}>
                  <div className={dashboardStyles.inventoryHead}>
                    <span>Product</span>
                    <span>Quantity</span>
                    <span>Category</span>
                    <span>Status</span>
                  </div>
                  {inventoryRows.map((row) => (
                    <div key={row.id} className={dashboardStyles.inventoryRow}>
                      <span className={dashboardStyles.productCell} title={row.product}>{row.product}</span>
                      <span>{row.quantity}</span>
                      <span className={dashboardStyles.categoryPill}>{row.category}</span>
                      <span className={row.statusTone === "danger" ? dashboardStyles.statusDanger : dashboardStyles.statusOk}>
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className={dashboardStyles.rightColumn}>
            <Card
              className={dashboardStyles.activityCard}
              title={
                <div className={dashboardStyles.sectionTitleRow}>
                  <span>Recent Activity</span>
                  <Button
                    type="link"
                    size="small"
                    icon={<HistoryOutlined />}
                    onClick={() =>
                      router.push(
                        `/households/${activeHousehold.householdId}/stats`,
                      )
                    }
                  >
                    Full history
                  </Button>
                </div>
              }
            >
              {activity.length === 0 ? (
                <Text type="secondary">No recent activity yet.</Text>
              ) : (
                <div className={dashboardStyles.activityList}>
                  {activity.slice(0, 5).map((entry, index) => {
                    const actor =
                      (entry.username && entry.username !== "Unknown user" ? entry.username : null) ??
                      memberNameById.get(entry.userId) ??
                      `User #${entry.userId}`;
                    const isRemoved = entry.productName === REMOVED_ITEM_LABEL;
                    const avatarText = isRemoved ? "·" : initialsOf(actor);
                    const avatarTone = isRemoved
                      ? dashboardStyles.avatarToneMuted
                      : dashboardStyles[`avatarTone${(index % 4) + 1}` as const];
                    return (
                      <div key={entry.logId} className={dashboardStyles.activityItem}>
                        <div className={`${dashboardStyles.activityAvatar} ${avatarTone}`}>
                          {avatarText}
                        </div>
                        <div className={dashboardStyles.activityBody}>
                          <div className={dashboardStyles.activityText}>
                            <span className={dashboardStyles.activityActor}>{actor}</span>
                            <span className={dashboardStyles.activityVerb}> consumed </span>
                            <span className={dashboardStyles.activityAmount}>{formatQuantity(entry.consumedQuantity, entry.consumedUnit)}</span>{" "}
                            {isRemoved ? (
                              <span className={dashboardStyles.activityRemoved}>an item no longer in pantry</span>
                            ) : (
                              <span className={dashboardStyles.activityProduct}>{entry.productName}</span>
                            )}
                          </div>
                          <div className={dashboardStyles.activityTime}>
                            {formatAgo(entry.consumedAt)}
                            {entry.consumedCalories
                              ? ` · ${Math.round(entry.consumedCalories)} kcal`
                              : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className={dashboardStyles.tipCard}>
              <div className={dashboardStyles.tipLabel}>{contextualTip.label}</div>
              <div className={dashboardStyles.tipText}>{contextualTip.text}</div>
            </Card>
          </div>
        </div>
      )}
    </VirtualPantryAppShell>
  );
};

export default DashboardPage;
