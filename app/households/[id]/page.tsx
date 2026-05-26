"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useSessionStorage from "@/hooks/useSessionStorage";
import { usePantryWebSocket } from "@/hooks/usePantryWebSocket";
import { VirtualPantryAppShell } from "@/components/VirtualPantryAppShell";
import type { HouseholdWithRole } from "@/types/household";
import type { PantryItem, PantryOverview } from "@/types/pantry";
import {
  PACKAGE_QUANTITY_UNAVAILABLE_NOTE,
  formatAmountDisplay,
  getPantryItemCalorieBasisDisplay,
  shouldShowPackageQuantityUnavailableNote,
} from "@/utils/pantry";
import type { ApplicationError } from "@/types/error";
import {
  App,
  Button,
  Card,
  ConfigProvider,
  Empty,
  Space,
  Table,
  Typography,
  Alert,
  Row,
  Col,
  Tag,
} from "antd";
import type { TableProps } from "antd";
import {
  ArrowLeftOutlined,
  BarChartOutlined,
  ReloadOutlined,
  SearchOutlined,
  CameraOutlined,
  EditOutlined,
  FileImageOutlined,
  WarningOutlined,
  FireOutlined,
} from "@ant-design/icons";
import { useAuthGuard } from "@/hooks/useAuthGuard";

const { Title, Paragraph, Text } = Typography;

type HouseholdLookup = {
  householdId: number;
  name: string;
};

function routeBackToSafeHouseholdsPage(router: ReturnType<typeof useRouter>) {
  if (globalThis.window?.history.length > 1) {
    router.back();
    return;
  }

  router.replace("/households");
}


function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function formatCaloriesDisplay(value: number | null | undefined): string {
  if (!Number.isFinite(value) || Number(value) <= 0) {
    return "—";
  }

  return formatNumber(Number(value));
}

export default function HouseholdPantryPage() {
  const { isAuthenticated } = useAuthGuard();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const api = useApi();
  const { message } = App.useApp();
  const { value: username } = useSessionStorage<string>("username", "");
  const { value: token } = useSessionStorage<string>("token", "");
  const { value: storedUserId } = useSessionStorage<string>("userId", "");
  const { value: cachedHouseholds, set: setHouseholds } = useSessionStorage<HouseholdWithRole[]>("households", []);
  const { clear: clearSelectedHouseholdId } = useSessionStorage<number | null>("selectedHouseholdId", null);
  const currentUserId = storedUserId ? Number(storedUserId) : null;

  const householdId = Number(params.id);
  const [overview, setOverview] = useState<PantryOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasValidHouseholdRoute, setHasValidHouseholdRoute] = useState(false);

  const householdName = useMemo(() => {
    const queryName = searchParams.get("name");
    if (queryName?.trim()) {
      return queryName.trim();
    }

    return (
      cachedHouseholds.find((household) => household.householdId === householdId)
        ?.name ?? `Household ${householdId}`
    );
  }, [cachedHouseholds, householdId, searchParams]);

  useEffect(() => {
    let cancelled = false;

    const rejectInvalidHouseholdRoute = (text: string) => {
      if (cancelled) return;
      setHasValidHouseholdRoute(false);
      setIsLoading(false);
      message.error(text);
      routeBackToSafeHouseholdsPage(router);
    };

    const validateHouseholdRoute = async () => {
      setHasValidHouseholdRoute(false);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        rejectInvalidHouseholdRoute("Household ID is invalid.");
        return;
      }

      try {
        const household = await api.get<HouseholdLookup>(`/households/${householdId}`);
        if (cancelled) return;

        const requestedName = searchParams.get("name")?.trim();
        if (requestedName && requestedName !== household.name) {
          rejectInvalidHouseholdRoute("Household name does not exist for this household.");
          return;
        }

        setHasValidHouseholdRoute(true);
      } catch (error) {
        const status = (error as { status?: number })?.status;
        const notMember = status === 403 || (error instanceof Error && error.message.includes("User is not a member"));
        if (notMember) {
          setHouseholds(cachedHouseholds.filter((h) => h.householdId !== householdId));
          clearSelectedHouseholdId();
          rejectInvalidHouseholdRoute("You are not a member of this household.");
          return;
        }
        if (status === 404) {
          rejectInvalidHouseholdRoute("Household ID does not exist.");
          return;
        }
        rejectInvalidHouseholdRoute("Failed to load household. Please try again.");
      }
    };

    void validateHouseholdRoute();

    return () => {
      cancelled = true;
    };
  }, [api, householdId, message, router, searchParams]);

  const fetchPantry = useCallback(async () => {
    if (!Number.isFinite(householdId) || householdId <= 0) {
      setErrorMessage("Invalid household id.");
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    setErrorMessage(null);

    try {
      const pantryOverview = await api.get<PantryOverview>(
        `/households/${householdId}/pantry`,
      );
      setOverview(pantryOverview);
    } catch (error) {
      if ((error as ApplicationError).status === 404) {
        setHouseholds(cachedHouseholds.filter((h) => h.householdId !== householdId));
        clearSelectedHouseholdId();
        message.warning("This household no longer exists.");
        router.push("/households");
        return;
      }
      setOverview(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to load the household pantry.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, householdId]);

  useEffect(() => {
    if (!isAuthenticated || !hasValidHouseholdRoute) return;
    void fetchPantry();
  }, [fetchPantry, hasValidHouseholdRoute, isAuthenticated]);

  const { connected: wsConnected, hasConnectedOnce } = usePantryWebSocket({
    householdId: hasValidHouseholdRoute && Number.isFinite(householdId) && householdId > 0 ? householdId : null,
    token,
    onMessage: (msg) => {
      if (msg.eventType === "HOUSEHOLD_DELETED") {
        setHouseholds(cachedHouseholds.filter((h) => h.householdId !== householdId));
        clearSelectedHouseholdId();
        message.warning("This household has been deleted.");
        router.push("/households");
        return;
      }
      if (msg.eventType === "MEMBER_REMOVED" && msg.removedUserId === currentUserId) {
        setHouseholds(cachedHouseholds.filter((h) => h.householdId !== householdId));
        clearSelectedHouseholdId();
        message.warning("You have been removed from this household.");
        router.push("/households");
        return;
      }
      void fetchPantry();
    },
  });

  const expiringSoonCount = useMemo(() => {
    if (!overview) return 0;
    const now = Date.now();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    return overview.items.filter((item) => {
      if (!item.expirationDate) return false;
      const exp = new Date(item.expirationDate).getTime();
      return !Number.isNaN(exp) && exp <= now + threeDaysMs;
    }).length;
  }, [overview]);

  const uniqueProductsCount = overview?.items.length ?? 0;

  const columns: TableProps<PantryItem>["columns"] = [
    {
      title: "Product",
      dataIndex: "name",
      key: "name",
      render: (value: string) => (
        <Text strong style={{ color: "#243424", fontSize: 17 }}>
          {value || "Unnamed item"}
        </Text>
      ),
    },
    {
      title: "Barcode",
      dataIndex: "barcode",
      key: "barcode",
      render: (value: string | null) => (
        <Text style={{ color: "#314231" }}>{value || "—"}</Text>
      ),
    },
    {
      title: "Energy basis",
      key: "energyBasis",
      render: (_value: unknown, record) => {
        const energy = getPantryItemCalorieBasisDisplay(record);
        const showPackageNote = shouldShowPackageQuantityUnavailableNote(record);
        return (
          <Space orientation="vertical" size={0}>
            <Text style={{ color: "#314231" }}>
              {energy ? `${formatCaloriesDisplay(energy.value)} ${energy.label}` : "—"}
            </Text>
            {showPackageNote ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {PACKAGE_QUANTITY_UNAVAILABLE_NOTE}
              </Text>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (_value: number, record) => (
        <Text style={{ color: "#314231" }}>{formatAmountDisplay(Number(record.amount ?? 0))} {record.amountUnit}</Text>
      ),
    },
    {
      title: "Total kcal",
      key: "totalKcal",
      render: (_value, record) => {
        // Issue #114 — unit-aware calorie computation
        let totalCalories: number | null = null;
        const amount = Number(record.amount ?? 0);
        if (Number.isFinite(amount) && amount > 0) {
          if (record.amountUnit === "package") {
            const perPackage = Number(record.kcalPerPackage ?? 0);
            if (Number.isFinite(perPackage) && perPackage > 0) totalCalories = perPackage * amount;
          } else if (record.amountUnit === "g") {
            const per100g = Number(record.kcalPer100g ?? 0);
            if (Number.isFinite(per100g) && per100g > 0) totalCalories = (per100g * amount) / 100;
          } else if (record.amountUnit === "ml") {
            const per100ml = Number(record.kcalPer100ml ?? 0);
            if (Number.isFinite(per100ml) && per100ml > 0) totalCalories = (per100ml * amount) / 100;
          } else if (record.amountUnit === "serving") {
            const perServing = Number(record.kcalPerServing ?? 0);
            if (Number.isFinite(perServing) && perServing > 0) totalCalories = perServing * amount;
          }
        }

        return (
          <Text style={{ color: "#314231" }}>
            {formatCaloriesDisplay(totalCalories)}
          </Text>
        );
      },
    },
    {
      title: "Added",
      dataIndex: "addedAt",
      key: "addedAt",
      render: (value: string) => (
        <Text style={{ color: "#314231" }}>{formatDate(value)}</Text>
      ),
    },
  ];

  if (!hasValidHouseholdRoute) {
    return null;
  }

  return (
    <VirtualPantryAppShell activeNav="pantry">
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <Space
          orientation="vertical"
          size="large"
          style={{ width: "100%", display: "flex" }}
        >
              <div>
                <Button
                  size="middle"
                  icon={<ArrowLeftOutlined />}
                  onClick={() => router.push("/households")}
                  style={{ marginBottom: 18, borderRadius: 12, fontWeight: 600 }}
                >
                  Households
                </Button>
                <Tag
                  color="green"
                  style={{
                    marginBottom: 12,
                    borderRadius: 999,
                    paddingInline: 12,
                    fontWeight: 600,
                  }}
                >
                  Household pantry
                </Tag>
                <Title
                  level={1}
                  style={{
                    margin: 0,
                    color: "#18351f",
                    fontSize: 48,
                    lineHeight: 1.05,
                  }}
                >
                  {householdName}
                </Title>
                <Paragraph
                  style={{
                    marginTop: 12,
                    marginBottom: 0,
                    maxWidth: 760,
                    fontSize: 20,
                    lineHeight: 1.55,
                    color: "#5f6e60",
                  }}
                >
                  Pantry overview for {username?.trim() || "the current user"}.
                  Add products through Open Food Facts or use the barcode scan
                  flow for faster household inventory updates.
                </Paragraph>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 16,
                  flexWrap: "wrap",
                  paddingTop: 4,
                }}
              >
                <Space wrap size="small">
                  <Button
                    icon={<ReloadOutlined />}
                    loading={isRefreshing}
                    onClick={() => {
                      setIsRefreshing(true);
                      void fetchPantry();
                    }}
                  >
                    Refresh pantry
                  </Button>
                  <Button
                    icon={<BarChartOutlined />}
                    onClick={() => router.push(`/households/${householdId}/stats`)}
                  >
                    Pantry stats
                  </Button>
                </Space>
              </div>

              {errorMessage ? (
                <Alert
                  type="error"
                  showIcon
                  message={<span style={{ color: "#7a1f1f", fontWeight: 600 }}>Pantry data could not be loaded</span>}
                  description={<span style={{ color: "#6a2a2a" }}>{errorMessage}</span>}
                />
              ) : null}

              {hasConnectedOnce && !wsConnected && !isLoading ? (
                <Alert
                  type="warning"
                  showIcon
                  message={<span style={{ color: "#7a4b00", fontWeight: 600 }}>Real-time connection lost</span>}
                  description={
                    <span style={{ color: "#6a5632" }}>
                      Live pantry updates are paused. Reconnecting automatically — or refresh manually.
                    </span>
                  }
                />
              ) : null}

              <Row gutter={[16, 16]}>
                <Col xs={24} md={8}>
                  <Card
                    size="small"
                    style={{
                      borderRadius: 20,
                      borderColor: "#d9e2cf",
                      background: "#ffffff",
                      height: "100%",
                    }}
                  >
                    <Space orientation="vertical" size={8}>
                      <Text
                        style={{
                          color: expiringSoonCount > 0 ? "#b85c00" : "#1f7a3f",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}
                      >
                        <WarningOutlined /> Expiring soon
                      </Text>
                      <Title level={2} style={{ margin: 0, color: expiringSoonCount > 0 ? "#b85c00" : "#18351f" }}>
                        {expiringSoonCount}
                      </Title>
                      <Text type="secondary">
                        Items expiring within the next 3 days.
                      </Text>
                    </Space>
                  </Card>
                </Col>

                <Col xs={24} md={8}>
                  <Card
                    size="small"
                    style={{
                      borderRadius: 20,
                      borderColor: "#d9e2cf",
                      background: "#ffffff",
                      height: "100%",
                    }}
                  >
                    <Space orientation="vertical" size={8}>
                      <Text
                        style={{
                          color: "#1f7a3f",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}
                      >
                        <FireOutlined /> Total calories
                      </Text>
                      <Title level={2} style={{ margin: 0, color: "#18351f" }}>
                        {overview ? formatNumber(overview.totalCalories) : "0"} kcal
                      </Title>
                      <Text type="secondary">
                        Aggregate nutritional value across all pantry items.
                      </Text>
                    </Space>
                  </Card>
                </Col>

                <Col xs={24} md={8}>
                  <Card
                    size="small"
                    style={{
                      borderRadius: 20,
                      borderColor: "#d9e2cf",
                      background: "#ffffff",
                      height: "100%",
                    }}
                  >
                    <Space orientation="vertical" size={8}>
                      <Text
                        style={{
                          color: "#1f7a3f",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}
                      >
                        Distinct products
                      </Text>
                      <Title level={2} style={{ margin: 0, color: "#18351f" }}>
                        {formatNumber(uniqueProductsCount)}
                      </Title>
                      <Text type="secondary">
                        Unique product entries currently visible in the pantry.
                      </Text>
                    </Space>
                  </Card>
                </Col>
              </Row>

              <section
                style={{
                  paddingTop: 8,
                  paddingBottom: 8,
                }}
              >
                <Space
                  orientation="vertical"
                  size="small"
                  style={{ width: "100%", display: "flex" }}
                >
                  <Title level={3} style={{ margin: 0, color: "#18351f", fontSize: 24 }}>
                    Add products to pantry
                  </Title>
                  <Paragraph style={{ margin: 0, color: "#5f6e60", maxWidth: 980 }}>
                    Choose how you want to add the next item. Use Open Food Facts
                    for direct barcode or name lookup, scan a package image, or
                    upload a meal photo or receipt to extract items.
                  </Paragraph>

                  <Space wrap size="small" style={{ paddingTop: 8 }}>
                    <Button
                      type="primary"
                      size="middle"
                      icon={<SearchOutlined />}
                      onClick={() =>
                        router.push(
                          `/open-food-facts?householdId=${householdId}&householdName=${encodeURIComponent(
                            householdName,
                          )}`,
                        )
                      }
                    >
                      Add from Open Food Facts
                    </Button>

                    <Button
                      size="middle"
                      icon={<CameraOutlined />}
                      onClick={() =>
                        router.push(
                          `/pantry/add/scan?householdId=${householdId}&householdName=${encodeURIComponent(
                            householdName,
                          )}`,
                        )
                      }
                    >
                      Scan package barcode
                    </Button>

                    <Button
                      size="middle"
                      icon={<CameraOutlined />}
                      onClick={() =>
                        router.push(
                          `/pantry/add/recognize?householdId=${householdId}&householdName=${encodeURIComponent(
                            householdName,
                          )}`,
                        )
                      }
                    >
                      Recognize food from photo
                    </Button>

                    <Button
                      size="middle"
                      icon={<FileImageOutlined />}
                      onClick={() =>
                        router.push(
                          `/pantry/add/receipt?householdId=${householdId}&householdName=${encodeURIComponent(
                            householdName,
                          )}`,
                        )
                      }
                    >
                      Upload receipt
                    </Button>

                    {/* Issue #114 — manual add entry alongside scan/receipt/OFF flows */}
                    <Button
                      size="middle"
                      icon={<EditOutlined />}
                      onClick={() =>
                        router.push(
                          `/pantry/add/manual?householdId=${householdId}&householdName=${encodeURIComponent(
                            householdName,
                          )}`,
                        )
                      }
                    >
                      Add manually
                    </Button>
                  </Space>
                </Space>
              </section>

              <Card
                title={
                  <span style={{ fontSize: 28, fontWeight: 700, color: "#1f2d1f" }}>
                    Current inventory
                  </span>
                }
                style={{
                  borderRadius: 24,
                  borderColor: "#d9e2cf",
                  background: "#ffffff",
                }}
                styles={{
                  header: {
                    borderBottomColor: "#e5ecda",
                    paddingInline: 24,
                    paddingTop: 20,
                    paddingBottom: 16,
                  },
                  body: {
                    padding: 24,
                  },
                }}
              >
                {overview && overview.items.length > 0 ? (
                  <ConfigProvider
                    theme={{
                      components: {
                        Table: {
                          headerBg: "#f5f8ef",
                          headerColor: "#1f2d1f",
                          headerBorderRadius: 16,
                          rowHoverBg: "#f7faf1",
                          borderColor: "#dce6d0",
                          footerBg: "#ffffff",
                          colorBgContainer: "#ffffff",
                          colorText: "#223222",
                        },
                        Pagination: {
                          itemActiveBg: "#e5f3de",
                          itemBg: "#ffffff",
                          itemInputBg: "#ffffff",
                          itemLinkBg: "#ffffff",
                          itemSize: 40,
                          colorPrimary: "#1f7a3f",
                          colorPrimaryHover: "#2a8f4b",
                          colorText: "#405240",
                          colorTextDisabled: "#92a292",
                          colorBgTextHover: "#f1f7ea",
                          colorBorder: "#cdd9c1",
                        },
                      },
                    }}
                  >
                    <Table<PantryItem>
                      rowKey="id"
                      dataSource={overview.items}
                      columns={columns}
                      pagination={{ pageSize: 8 }}
                      scroll={{ x: 900 }}
                      style={{ background: "#ffffff", borderRadius: 18, overflow: "hidden" }}
                    />
                  </ConfigProvider>
                ) : (
                  <Empty description="No pantry items yet. Add products from Open Food Facts or use the scan flow." />
                )}
              </Card>
        </Space>
      </div>
    </VirtualPantryAppShell>
  );
}
