"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Empty,
  Form,
  InputNumber,
  Modal,
  Progress,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Radio,
  Select,   // Issue #121
} from "antd";
import type { TableProps } from "antd";
// Issue #124 — recharts for calorie charts
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import {
  ArrowLeftOutlined,
  EditOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
  RestOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useSessionStorage from "@/hooks/useSessionStorage";
import { usePantryWebSocket } from "@/hooks/usePantryWebSocket";
import { VirtualPantryAppShell } from "@/components/VirtualPantryAppShell";
import type { ApplicationError } from "@/types/error";
import type { HouseholdBudget } from "@/types/budget";
import type { HouseholdWithRole, HouseholdMember } from "@/types/household";  // Issue #121
import type { ConsumptionLogEntry } from "@/types/consumption";
import {
  PACKAGE_QUANTITY_UNAVAILABLE_NOTE,
  formatAmountDisplay,
  formatQuantity,
  getPantryItemCalorieBasisDisplay,
  hasUsablePackageQuantityInfo,
  shouldShowPackageQuantityUnavailableNote,
} from "@/utils/pantry";
import type { HouseholdStats } from "@/types/stats";
import type { HealthGoal } from "@/types/healthGoal";
import statsStyles from "@/styles/stats.module.css";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import type {
  ConsumptionUnit,
  ConsumePantryItemResponse,
  PantryItem,
  PantryOverview,
  PortionEstimateResponse,
} from "@/types/pantry";

const { Title, Paragraph, Text } = Typography;

const FOREST = "#1b5e20";
const DANGER = "#c62828";
const MUTED = "#5d6a5d";

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

type ActivityEntry = {
  id: string;
  at: string;
  productName: string;
  deltaKcal: number | null;
  quantity: number;
  // Issue #95 — unit stored so display can show "200g" instead of "200×" for g/ml items
  unit?: ConsumptionUnit;
  type: "ADDED" | "CONSUMED";
};

function logsToActivity(logs: ConsumptionLogEntry[]): ActivityEntry[] {
  return logs.map((log) => ({
    id: `consume-${log.logId}`,
    at: log.consumedAt,
    productName: log.productName,
    deltaKcal: log.consumedCalories ?? null,
    quantity: log.consumedQuantity,
    unit: log.consumedUnit,
    type: "CONSUMED",
  }));
}

function computeItemKcalForAmount(item: PantryItem, amount: number): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (item.amountUnit === "package") {
    const per = Number(item.kcalPerPackage ?? 0);
    return Number.isFinite(per) && per > 0 ? per * amount : null;
  }
  if (item.amountUnit === "g") {
    const per = Number(item.kcalPer100g ?? 0);
    return Number.isFinite(per) && per > 0 ? (per * amount) / 100 : null;
  }
  if (item.amountUnit === "ml") {
    const per = Number(item.kcalPer100ml ?? 0);
    return Number.isFinite(per) && per > 0 ? (per * amount) / 100 : null;
  }
  return null;
}

// Activity feed: kcal at add time (uses initialAmount)
function computeItemKcal(item: PantryItem): number | null {
  return computeItemKcalForAmount(item, Number(item.initialAmount ?? item.amount ?? 0));
}

// Inventory table + energy reservoir: kcal currently remaining
function computeRemainingKcal(item: PantryItem): number | null {
  return computeItemKcalForAmount(item, Number(item.amount ?? 0));
}

function pantryItemsToActivity(items: PantryItem[]): ActivityEntry[] {
  return items
    .filter((item) => Boolean(item.addedAt))
    .map((item) => ({
      id: `add-${item.id}`,
      at: item.addedAt,
      productName: item.name,
      deltaKcal: computeItemKcal(item),
      quantity: item.initialAmount ?? item.amount,
      unit: item.amountUnit,
      type: "ADDED",
    }));
}

function buildRecentActivity(items: PantryItem[], logs: ConsumptionLogEntry[]): ActivityEntry[] {
  return [...pantryItemsToActivity(items), ...logsToActivity(logs)]
    .sort((a, b) => dayjs(b.at).valueOf() - dayjs(a.at).valueOf())
    .slice(0, 30);
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as ApplicationError).status === 404
  );
}

function formatKcal(value: number): string {
  return `${Math.round(value).toLocaleString()} kcal`;
}

function isKnownCalories(value: number | null | undefined): value is number {
  return Number.isFinite(value) && Number(value) > 0;
}

function formatKcalDisplay(value: number | null | undefined): string {
  return isKnownCalories(value) ? formatKcal(Number(value)) : "—";
}

function formatAmountWithUnit(value: number | null | undefined, unit: string | null | undefined): string {
  return `${formatAmountDisplay(value)} ${unit ?? ""}`.trim();
}

function getPackageQuantityConversionNote(item: PantryItem, unit: ConsumptionUnit): string | null {
  if (item.amountUnit !== "package" || unit === "package") {
    return null;
  }

  if (hasUsablePackageQuantityInfo(item)) {
    return null;
  }

  return "Package quantity unavailable; the app cannot convert this portion into packages left.";
}

function comparisonTagColor(status: string): string {
  switch (status) {
    case "OVER_BUDGET":
      return "red";
    case "UNDER_BUDGET":
      return "blue";
    case "ON_TARGET":
      return "green";
    default:
      return "default";
  }
}

const DAIRY_CATEGORY_KEYWORDS = ["milk", "cheese", "yogurt", "cream", "butter", "dairy"];
const PRODUCE_CATEGORY_KEYWORDS = ["fruit", "berry", "vegetable", "lettuce", "tomato", "produce", "apple", "orange"];

function includesCategoryKeyword(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function inferCategory(name: string): { label: string; color: string } {
  const n = name.trim().toLowerCase();
  if (includesCategoryKeyword(n, DAIRY_CATEGORY_KEYWORDS)) {
    return { label: "DAIRY", color: "gold" };
  }
  if (includesCategoryKeyword(n, PRODUCE_CATEGORY_KEYWORDS)) {
    return { label: "PRODUCE", color: "green" };
  }
  return { label: "PANTRY", color: "cyan" };
}

type UnknownConsumeMode = "suggested" | "manual" | "skip";

type UnknownConsumeState = {
  item: PantryItem;
  // Issue #95 — amount chosen in portion modal, carried into calorie-unknown flow
  amount: number;
  amountUnit: ConsumptionUnit;
  suggestedCalories: number | null;
  mode: UnknownConsumeMode;
  manualCalories: number | null;
};

// Issue #95 — portion modal state: user specifies how much to consume before confirming
type PortionConsumeState = {
  item: PantryItem;
  amount: number;
  amountUnit: ConsumptionUnit;
  mealPhoto: File | null;
  estimateMessage: string | null;
  estimatedRange: string | null;
  isEstimating: boolean;
};

const CALORIE_SUGGESTIONS: Array<{ keywords: string[]; kcal: number }> = [
  { keywords: ["milk"], kcal: 640 },
  { keywords: ["egg"], kcal: 700 },
  { keywords: ["apple juice"], kcal: 460 },
  { keywords: ["orange juice"], kcal: 450 },
  { keywords: ["basmati rice", "rice"], kcal: 1800 },
  { keywords: ["oats"], kcal: 1850 },
  { keywords: ["granola"], kcal: 2250 },
  { keywords: ["muesli", "cereal"], kcal: 1900 },
  { keywords: ["spaghetti", "penne", "pasta"], kcal: 1800 },
  { keywords: ["olive oil"], kcal: 4100 },
  { keywords: ["coffee"], kcal: 5 },
  { keywords: ["cheddar"], kcal: 800 },
  { keywords: ["feta"], kcal: 530 },
  { keywords: ["gouda"], kcal: 712 },
  { keywords: ["parmesan"], kcal: 860 },
  { keywords: ["cheese"], kcal: 700 },
  { keywords: ["yogurt"], kcal: 150 },
  { keywords: ["bread"], kcal: 1800 },
  { keywords: ["banana"], kcal: 135 },
  { keywords: ["chicken breast"], kcal: 600 },
  { keywords: ["tomato sauce"], kcal: 175 },
  { keywords: ["tomato"], kcal: 45 },
  { keywords: ["spinach"], kcal: 46 },
  { keywords: ["cucumber"], kcal: 50 },
  { keywords: ["potato"], kcal: 1540 },
];

function formatConsumptionUnitLabel(unit: ConsumptionUnit): string {
  if (unit === "package") return "package";
  if (unit === "serving") return "serving";
  return unit;
}

function isConsumptionUnit(unit: unknown): unit is ConsumptionUnit {
  return unit === "package" || unit === "serving" || unit === "g" || unit === "ml";
}

function getAvailableConsumptionUnits(item: PantryItem): ConsumptionUnit[] {
  const fromBackend = item.availableConsumptionUnits?.filter((unit): unit is ConsumptionUnit =>
    unit === "package" || unit === "serving" || unit === "g" || unit === "ml",
  );
  if (fromBackend && fromBackend.length > 0) {
    return fromBackend;
  }
  return [item.amountUnit];
}

function getDefaultConsumptionUnit(item: PantryItem): ConsumptionUnit {
  const units = getAvailableConsumptionUnits(item);
  if (units.includes("package")) return "package";
  return units[0] ?? item.amountUnit;
}

function getDefaultConsumptionAmount(item: PantryItem, unit: ConsumptionUnit): number {
  if (unit === "package") return Math.round(Math.min(1, item.amount) * 100) / 100;
  if (unit === "serving") return 1;
  return 100;
}

function getMaxConsumptionAmount(item: PantryItem, unit: ConsumptionUnit): number | undefined {
  if (unit === item.amountUnit) return item.amount;

  const packageQuantity = Number(item.packageQuantity ?? 0);
  if (item.amountUnit === "package" && Number.isFinite(packageQuantity) && packageQuantity > 0) {
    if ((unit === "g" || unit === "ml") && item.packageQuantityUnit === unit) {
      return item.amount * packageQuantity;
    }
    const servingQuantity = Number(item.servingQuantity ?? 0);
    if (unit === "serving"
        && Number.isFinite(servingQuantity)
        && servingQuantity > 0
        && item.servingQuantityUnit === item.packageQuantityUnit) {
      return (item.amount * packageQuantity) / servingQuantity;
    }
  }

  return undefined;
}

function getConsumptionStep(_unit: ConsumptionUnit): number {
  return 0.1;
}

function estimateSuggestedCalories(item: PantryItem): number | null {
  const name = item.name.trim().toLowerCase();
  const barcode = (item.barcode ?? "").toLowerCase();

  const suggestion = CALORIE_SUGGESTIONS.find(({ keywords }) =>
    keywords.some((keyword) => name.includes(keyword))
  );
  if (suggestion) return Math.round(suggestion.kcal);
  if (name.includes("water")) return null;
  if (barcode.startsWith("receipt-generic:")) return 200;

  return null;
}

export default function StatsPage() {
  const { isAuthenticated } = useAuthGuard();
  const api = useApi();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { message } = App.useApp();

  const householdId = Number(params.id);

  const { value: token } = useSessionStorage<string>("token", "");
  const { value: cachedHouseholds, set: setHouseholds } = useSessionStorage<HouseholdWithRole[]>("households", []);
  const { clear: clearSelectedHouseholdId } = useSessionStorage<number | null>("selectedHouseholdId", null);
  const { value: userId } = useSessionStorage<string>("userId", "");

  // Issue #121 — numeric form of userId for member picker default
  const numericUserId = useMemo(() => (userId ? Number(userId) : null), [userId]);

  const householdName = useMemo(
    () =>
      cachedHouseholds.find((h) => h.householdId === householdId)?.name ??
      `Household ${householdId}`,
    [cachedHouseholds, householdId],
  );

  const currentHousehold = useMemo(
    () => cachedHouseholds.find((h) => h.householdId === householdId) ?? null,
    [cachedHouseholds, householdId],
  );

  const householdRole = currentHousehold?.role ?? null;
  const isOwner = householdRole === "owner";

  const householdCreatedAt = useMemo(() => {
    if (!currentHousehold?.createdAt) return null;

    const created = dayjs(currentHousehold.createdAt);
    return created.isValid() ? created.startOf("day") : null;
  }, [currentHousehold]);

  const [startDate, setStartDate] = useState<Dayjs | null>(null);
  const initializedForHousehold = useRef<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [pantry, setPantry] = useState<PantryOverview | null>(null);
  const [stats, setStats] = useState<HouseholdStats | null>(null);
  const [budgetRecord, setBudgetRecord] = useState<HouseholdBudget | null>(null);
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetForm] = Form.useForm<{ dailyCalorieTarget: number }>();

  const [personalGoal, setPersonalGoal] = useState<HealthGoal | null>(null);
  // Issue #121 — household members for the consume-on-behalf picker
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [selectedConsumerId, setSelectedConsumerId] = useState<number | null>(null);
  const [consumingItemId, setConsumingItemId] = useState<number | null>(null);
  const [removingItemId, setRemovingItemId] = useState<number | null>(null);
  const [unknownConsumeState, setUnknownConsumeState] = useState<UnknownConsumeState | null>(null);
  // Issue #95 — portion consume: user specifies how much to consume before confirming
  const [portionConsumeState, setPortionConsumeState] = useState<PortionConsumeState | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [hasValidHouseholdRoute, setHasValidHouseholdRoute] = useState(false);

  const pantryKnownCalories = useMemo(() => {
    return (pantry?.items ?? []).reduce((sum, item) => {
      const kcal = computeRemainingKcal(item);
      return kcal !== null ? sum + kcal : sum;
    }, 0);
  }, [pantry?.items]);

  const pantryUnknownCaloriesCount = useMemo(() => {
    return (pantry?.items ?? []).filter((item) => !isKnownCalories(item.kcalPerPackage)).length;
  }, [pantry?.items]);

  const loadDashboard = useCallback(async () => {
    if (!hasValidHouseholdRoute || !householdId || !startDate) {
      return;
    }

    const endStr = dayjs().format("YYYY-MM-DD");
    const startStr = startDate.format("YYYY-MM-DD");

    setLoading(true);
    try {
      const [pantryRes, statsRes, logsRes, membersRes] = await Promise.all([
        api.get<PantryOverview>(`/households/${householdId}/pantry`),
        api.get<HouseholdStats>(
          `/households/${householdId}/stats?startDate=${startStr}&endDate=${endStr}`,
        ),
        api.get<ConsumptionLogEntry[]>(
          `/households/${householdId}/consumption-logs?limit=30`,
        ),
        api.get<HouseholdMember[]>(`/households/${householdId}/members`).catch(() => [] as HouseholdMember[]),  // Issue #121
      ]);
      setPantry(pantryRes);
      setStats(statsRes);
      setActivity(buildRecentActivity(pantryRes.items, logsRes));
      // Issue #121
      setMembers(membersRes);
      setSelectedConsumerId((prev) => prev ?? numericUserId);

      await Promise.all([
        api.get<HouseholdBudget>(`/households/${householdId}/budget`)
          .then(setBudgetRecord)
          .catch((error) => { if (isNotFound(error)) setBudgetRecord(null); else throw error; }),
        userId
          ? api.get<HealthGoal>(`/users/${userId}/health-goal`)
              .then(setPersonalGoal)
              .catch((error) => {
            if (isNotFound(error)) setPersonalGoal(null);
            else message.warning(error instanceof Error ? error.message : "Failed to load health goal.");
          })
          : Promise.resolve(),
      ]);
    } catch (error) {
      setPantry(null);
      setStats(null);
      setBudgetRecord(null);
      setActivity([]);
      message.error(error instanceof Error ? error.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [api, message, householdId, startDate, hasValidHouseholdRoute, userId, numericUserId]);

  useEffect(() => {
    let cancelled = false;

    const rejectInvalidHouseholdRoute = (text: string) => {
      if (cancelled) return;
      setHasValidHouseholdRoute(false);
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
        const notMember = error instanceof Error && error.message.includes("User is not a member");
        if (notMember) {
          setHouseholds(cachedHouseholds.filter((h) => h.householdId !== householdId));
          clearSelectedHouseholdId();
        }
        rejectInvalidHouseholdRoute(notMember ? "You are not a member of this household." : "Household ID does not exist.");
      }
    };

    void validateHouseholdRoute();

    return () => {
      cancelled = true;
    };
  }, [api, householdId, message, router, searchParams]);

  useEffect(() => {
    if (!hasValidHouseholdRoute || !householdId || !cachedHouseholds.length) return;
    if (initializedForHousehold.current === householdId) return;
    initializedForHousehold.current = householdId;

    const sevenDaysAgo = dayjs().subtract(7, "day").startOf("day");
    setStartDate(
      householdCreatedAt && householdCreatedAt.isAfter(sevenDaysAgo)
        ? householdCreatedAt
        : sevenDaysAgo,
    );
  }, [householdId, cachedHouseholds, hasValidHouseholdRoute, householdCreatedAt]);

  const disableConsumptionStartDate = useCallback(
    (current: Dayjs) => {
      const selected = current.startOf("day");
      const today = dayjs().startOf("day");

      return (householdCreatedAt !== null && selected.isBefore(householdCreatedAt)) || selected.isAfter(today);
    },
    [householdCreatedAt],
  );

  const setConsumptionStartDate = useCallback(
    (value: Dayjs | null) => {
      if (!value) return;

      const today = dayjs().startOf("day");
      let next = value.startOf("day");

      if (next.isAfter(today)) {
        next = today;
      }

      if (householdCreatedAt !== null && next.isBefore(householdCreatedAt)) {
        next = householdCreatedAt;
      }

      setStartDate(next);
    },
    [householdCreatedAt],
  );

  useEffect(() => {
    if (isAuthenticated && hasValidHouseholdRoute && householdId && startDate) {
      void loadDashboard();
    }
  }, [isAuthenticated, loadDashboard, householdId, startDate, hasValidHouseholdRoute]);

  usePantryWebSocket({
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
      if (msg.eventType === "MEMBER_REMOVED" && msg.removedUserId === Number(userId)) {
        setHouseholds(cachedHouseholds.filter((h) => h.householdId !== householdId));
        clearSelectedHouseholdId();
        message.warning("You have been removed from this household.");
        router.push("/households");
        return;
      }
      void loadDashboard();
    },
  });

  const todayStr = dayjs().format("YYYY-MM-DD");
  const dailyGoal = stats?.dailyCalorieTarget ?? budgetRecord?.dailyCalorieTarget ?? null;
  const actualToday = useMemo(() => {
    if (!stats?.dailyBreakdown?.length) return 0;
    const row = stats.dailyBreakdown.find((d) => d.date === todayStr);
    return row?.caloriesConsumed ?? 0;
  }, [stats, todayStr]);

  const todayVsGoalPercent = useMemo(() => {
    if (dailyGoal === null || dailyGoal <= 0) return 0;
    return (actualToday / dailyGoal) * 100;
  }, [actualToday, dailyGoal]);

  const todayOverLabel = useMemo(() => {
    if (dailyGoal === null || dailyGoal <= 0) return null;
    if (actualToday <= dailyGoal) return null;
    const pct = ((actualToday / dailyGoal) * 100 - 100).toFixed(0);
    return `+${pct}% OVER BUDGET (today)`;
  }, [actualToday, dailyGoal]);

  // Issue #124 — null when the field is absent (old API), 0 when present but nothing consumed today
  const myActualToday = useMemo(() => {
    if (!stats?.myDailyBreakdown) return null;
    const row = stats.myDailyBreakdown.find((d) => d.date === todayStr);
    return row?.caloriesConsumed ?? 0;
  }, [stats, todayStr]);

  const myPersonalGoal = personalGoal?.recommendedDailyCalories ?? null;
  // Issue #124 — fixed 7-day slices for the two daily charts
  const myLast7Days = useMemo(() => (stats?.myDailyBreakdown ?? []).slice(-7), [stats]);
  const householdLast7Days = useMemo(() => (stats?.dailyBreakdown ?? []).slice(-7), [stats]);

  const myTodayVsGoalPercent = useMemo(() => {
    if (myActualToday === null || !myPersonalGoal || myPersonalGoal <= 0) return 0;
    return (myActualToday / myPersonalGoal) * 100;
  }, [myActualToday, myPersonalGoal]);

  const myTodayOverLabel = useMemo(() => {
    if (myActualToday === null || !myPersonalGoal || myPersonalGoal <= 0) return null;
    if (myActualToday <= myPersonalGoal) return null;
    const pct = ((myActualToday / myPersonalGoal) * 100 - 100).toFixed(0);
    return `+${pct}% over your personal goal (today)`;
  }, [myActualToday, myPersonalGoal]);

  const openBudgetModal = () => {
    const initial = dailyGoal ?? 2200;
    budgetForm.setFieldsValue({ dailyCalorieTarget: initial });
    setBudgetModalOpen(true);
  };

  const submitBudget = async () => {
    const values = await budgetForm.validateFields();
    setSavingBudget(true);
    try {
      const updated = await api.put<HouseholdBudget>(`/households/${householdId}/budget`, {
        dailyCalorieTarget: values.dailyCalorieTarget,
      });
      setBudgetRecord(updated);
      message.success("Daily calorie target saved.");
      setBudgetModalOpen(false);
      await loadDashboard();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Could not save daily calorie target.");
    } finally {
      setSavingBudget(false);
    }
  };

  // Issue #95 — amount is user-chosen portion; options carries kcal override for package items
  const executeConsume = useCallback(
    async (item: PantryItem, amount: number, options?: { amountUnit?: ConsumptionUnit; kcalPerPackage?: number | null; skipCalorieLogging?: boolean; consumedForUserId?: number }) => {
      setConsumingItemId(item.id);
      try {
        const res = await api.post<ConsumePantryItemResponse>(
          `/households/${householdId}/pantry/${item.id}/consume`,
          {
            amount: Math.round(amount * 100) / 100,
            amountUnit: options?.amountUnit ?? item.amountUnit,
            kcalPerPackage: options?.kcalPerPackage ?? null,
            skipCalorieLogging: options?.skipCalorieLogging ?? false,
            ...(options?.consumedForUserId !== undefined
              ? { consumedForUserId: options.consumedForUserId }  // Issue #121
              : {}),
          },
        );
        message.success(
          res.removed
            ? "Item fully consumed and removed from pantry."
            : "Consumption recorded.",
        );
        setUnknownConsumeState(null);
        setPortionConsumeState(null);
        await loadDashboard();
      } catch (error) {
        message.error(error instanceof Error ? error.message : "Could not record consumption.");
      } finally {
        setConsumingItemId(null);
      }
    },
    [api, householdId, loadDashboard, message],
  );

  const estimatePortionFromPhoto = useCallback(async () => {
    if (!portionConsumeState?.mealPhoto) {
      message.error("Please select a meal photo first.");
      return;
    }

    const { item, mealPhoto } = portionConsumeState;

    setPortionConsumeState((current) =>
      current ? { ...current, isEstimating: true, estimateMessage: null, estimatedRange: null } : current,
    );

    try {
      const formData = new FormData();
      formData.append("image", mealPhoto);

      const estimate = await api.postFormData<PortionEstimateResponse>(
        `/households/${householdId}/pantry/${item.id}/consume/portion-estimate`,
        formData,
      );

      const availableUnits = getAvailableConsumptionUnits(item);
      const suggestedUnit = isConsumptionUnit(estimate.unit) && availableUnits.includes(estimate.unit)
        ? estimate.unit
        : portionConsumeState.amountUnit;
      const suggestedAmount =
        typeof estimate.suggestedMinAmount === "number" && Number.isFinite(estimate.suggestedMinAmount)
          ? estimate.suggestedMinAmount
          : null;
      const maxAmount = getMaxConsumptionAmount(item, suggestedUnit);
      const estimatedRange =
        estimate.estimatedRange ??
        (
          typeof estimate.suggestedMinAmount === "number" &&
          typeof estimate.suggestedMaxAmount === "number" &&
          Number.isFinite(estimate.suggestedMinAmount) &&
          Number.isFinite(estimate.suggestedMaxAmount)
            ? `${formatAmountDisplay(estimate.suggestedMinAmount)}–${formatAmountDisplay(estimate.suggestedMaxAmount)} ${suggestedUnit}`
            : null
        );

      setPortionConsumeState((current) =>
        current
          ? {
              ...current,
              amountUnit: suggestedUnit,
              amount:
                suggestedAmount !== null
                  ? Math.min(Math.max(suggestedAmount, 0.01), maxAmount ?? suggestedAmount)
                  : current.amount,
              estimatedRange,
              estimateMessage:
                estimate.message ??
                "Suggested portion loaded. Please confirm or edit the amount before saving.",
              isEstimating: false,
            }
          : current,
      );
    } catch (error) {
      setPortionConsumeState((current) =>
        current
          ? {
              ...current,
              estimateMessage:
                error instanceof Error
                  ? `${error.message}. You can still enter the portion manually.`
                  : "Could not estimate the portion. You can still enter it manually.",
              estimatedRange: null,
              isEstimating: false,
            }
          : current,
      );
    }
  }, [api, householdId, message, portionConsumeState]);


  // Issue #95 — open portion input modal; calorie-unknown check runs after amount is chosen
  const consumeInventoryItem = useCallback(
    (item: PantryItem) => {
      if (!item.id) {
        message.error("Selected item is missing an item ID.");
        return;
      }
      if (!item.amount || item.amount <= 0) {
        message.error("This item is no longer available in the pantry.");
        return;
      }

      const defaultUnit = getDefaultConsumptionUnit(item);
      const defaultAmount = getDefaultConsumptionAmount(item, defaultUnit);
      setPortionConsumeState({
      item,
      amount: defaultAmount,
      amountUnit: defaultUnit,
      mealPhoto: null,
      estimateMessage: null,
      estimatedRange: null,
      isEstimating: false,
    });
    },
    [message],
  );


  const removeInventoryItem = useCallback(
    async (item: PantryItem) => {
      if (!item.id) {
        message.error("Selected item is missing an item ID.");
        return;
      }
      if (!item.amount || item.amount <= 0) {
        message.error("This item is no longer available in the pantry.");
        return;
      }

      setRemovingItemId(item.id);
      try {
        const res = await api.post<ConsumePantryItemResponse>(
          `/households/${householdId}/pantry/${item.id}/remove`,
          { amount: item.amount },
        );
        message.success(
          res.removed
            ? "Item removed from pantry."
            : "Item partially removed from pantry.",
        );
        await loadDashboard();
      } catch (error) {
        message.error(error instanceof Error ? error.message : "Could not remove item from pantry.");
      } finally {
        setRemovingItemId(null);
      }
    },
    [api, householdId, loadDashboard, message],
  );

  const inventoryColumns: TableProps<PantryItem>["columns"] = useMemo(
    () => [
      {
        title: "Product",
        dataIndex: "name",
        key: "name",
        render: (name: string) => (
          <Text strong style={{ color: "#1b2a1b" }}>
            {name}
          </Text>
        ),
      },
      {
        title: "Category",
        key: "category",
        width: 120,
        render: (_: unknown, record: PantryItem) => {
          const { label, color } = inferCategory(record.name);
          return (
            <Tag className={statsStyles.categoryTag} color={color}>
              {label}
            </Tag>
          );
        },
      },
      {
        title: "Amount",
        key: "amount",
        width: 110,
        render: (_: unknown, record: PantryItem) => (
          <span>
            {formatAmountWithUnit(record.amount, record.amountUnit)}
          </span>
        ),
      },
      {
        title: "Remaining kcal",
        key: "cals",
        width: 160,
        render: (_: unknown, record: PantryItem) => {
          // Issue #114 — unit-aware calorie computation. If package-size conversion is unknown,
          // still show the standardized kcal basis so the row does not look calorie-empty.
          const totalCalories = computeRemainingKcal(record);
          if (totalCalories !== null) {
            return (
              <Space direction="vertical" size={0}>
                <Text strong>{formatKcal(totalCalories)}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>inventory total</Text>
              </Space>
            );
          }

          const basis = getPantryItemCalorieBasisDisplay(record);
          return basis ? (
            <Space direction="vertical" size={0}>
              <Text strong>{`${basis.value.toLocaleString()} ${basis.label}`}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {shouldShowPackageQuantityUnavailableNote(record)
                  ? PACKAGE_QUANTITY_UNAVAILABLE_NOTE
                  : "standardized basis"}
              </Text>
            </Space>
          ) : (
            <Text strong>{formatKcalDisplay(null)}</Text>
          );
        },
      },
      {
        title: "Expires",
        key: "expiry",
        width: 130,
        render: (_: unknown, record: PantryItem) => {
          if (!record.expirationDate) return null;
          const exp = dayjs(record.expirationDate);
          const daysLeft = exp.startOf("day").diff(dayjs().startOf("day"), "day");
          if (daysLeft < 0) return <Tag color="error">Expired</Tag>;
          if (daysLeft === 0) return <Tag color="error">Expires today</Tag>;
          if (daysLeft <= 3) return <Tag color="warning">Expires in {daysLeft}d</Tag>;
          return <Tag>{exp.format("MMM D")}</Tag>;
        },
      },
      {
        title: "Status",
        key: "status",
        width: 120,
        render: (_: unknown, record: PantryItem) =>
          record.amount <= 2 ? (
            <Tag color="orange">Low stock</Tag>
          ) : (
            <Tag color="success">In stock</Tag>
          ),
      },
      {
        title: "Action",
        key: "action",
        width: 220,
        render: (_: unknown, record: PantryItem) => (
          <Space size="small" wrap>
            <Button
              type="primary"
              size="small"
              icon={<RestOutlined />}
              loading={consumingItemId === record.id}
              disabled={Boolean(consumingItemId) || Boolean(removingItemId) || record.amount <= 0}
              onClick={() => void consumeInventoryItem(record)}
            >
              Consume
            </Button>
            <Button
              size="small"
              danger
              loading={removingItemId === record.id}
              disabled={Boolean(consumingItemId) || Boolean(removingItemId) || record.amount <= 0}
              onClick={() => void removeInventoryItem(record)}
            >
              Remove
            </Button>
          </Space>
        ),
      },
    ],
    [consumeInventoryItem, consumingItemId, removeInventoryItem, removingItemId],
  );

  if (!hasValidHouseholdRoute) {
    return null;
  }

  return (
    <VirtualPantryAppShell activeNav="pantry">
      <div className={statsStyles.pageHeader}>
        <Button
          size="middle"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push("/households")}
          style={{ marginBottom: 18, borderRadius: 12, fontWeight: 600 }}
        >
          Manage
        </Button>
        <Title level={2} className={statsStyles.pageTitle}>
          {householdName}
        </Title>
        <Paragraph className={statsStyles.pageSubtitle}>
          Energy reservoir, consumption flow, and daily calorie target — with current inventory and a record of
          what you use from the pantry.
        </Paragraph>
      </div>

      <Space orientation="vertical" size="large" style={{ width: "100%" }}>
        {loading && !stats ? (
          <Card className={statsStyles.spinCard}>
            <Spin size="large" />
          </Card>
        ) : (
          <>
            <Row gutter={[20, 20]} className={statsStyles.metricGrid}>
              <Col xs={24} md={8}>
                <Card
                  className={statsStyles.metricCard}
                  title={<span className={statsStyles.cardTitle}>Energy reservoir</span>}
                  variant="borderless"
                >
                  <Space orientation="vertical" size="small" style={{ width: "100%" }}>
                    <div className={statsStyles.metricLead}>Total nutritional value in your pantry</div>
                    <Title level={3} className={statsStyles.metricValue}>
                      {pantry ? formatKcalDisplay(pantryKnownCalories) : "—"}
                    </Title>
                    <Text className={statsStyles.metricFootnote}>
                      {pantry
                        ? `${pantry.items.length} item(s) currently in your digital atelier.`
                        : ""}
                    </Text>
                    {pantryUnknownCaloriesCount > 0 ? (
                      <Text className={statsStyles.metricFootnote}>
                        {pantryUnknownCaloriesCount} item{pantryUnknownCaloriesCount === 1 ? "" : "s"} excluded from the
                        total because calorie data is unknown.
                      </Text>
                    ) : null}
                  </Space>
                </Card>
              </Col>

              <Col xs={24} md={8}>
                <Card
                  className={statsStyles.metricCard}
                  title={<span className={statsStyles.cardTitle}>Consumption flow</span>}
                  extra={
                    <DatePicker
                      value={startDate}
                      onChange={setConsumptionStartDate}
                      disabledDate={disableConsumptionStartDate}
                      allowClear={false}
                      size="small"
                    />
                  }
                  variant="borderless"
                >
                  <Space orientation="vertical" size="small" style={{ width: "100%" }}>
                    <div className={statsStyles.metricLead}>Daily average since start date</div>
                    <Title level={3} className={statsStyles.metricValue}>
                      {stats
                        ? `${Math.round(stats.averageDailyCalories).toLocaleString()} kcal / day`
                        : "—"}
                    </Title>
                    {stats && startDate ? (
                      <Text className={statsStyles.metricFootnote}>
                        From {startDate.format("MMM D, YYYY")} to {dayjs(stats.endDate).format("MMM D, YYYY")}
                      </Text>
                    ) : null}
                  </Space>
                </Card>
              </Col>

              <Col xs={24} md={8}>
                <Card
                  className={statsStyles.metricCard}
                  title={<span className={statsStyles.cardTitle}>Daily calorie target</span>}
                  extra={
                    isOwner ? (
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={openBudgetModal}
                        aria-label="Edit daily calorie target"
                        style={{ color: FOREST, fontWeight: 600 }}
                      >
                        Edit
                      </Button>
                    ) : null
                  }
                  variant="borderless"
                >
                  {/* Issue #124 — two clearly labelled progress rows so users know what each one measures */}
                  <Space orientation="vertical" size="middle" style={{ width: "100%" }}>

                    {/* Row 1: household total today vs household daily target (set by admin) */}
                    <div>
                      <Text style={{ color: MUTED, fontSize: 12 }}>
                        🏠 Household total today
                        <Text style={{ color: MUTED, fontSize: 11, fontWeight: 400 }}> — all members combined, vs the household daily target set by admin</Text>
                      </Text>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "4px 0" }}>
                        <Text strong style={{ fontSize: 15, color: todayVsGoalPercent > 100 ? DANGER : FOREST }}>
                          {stats ? formatKcal(actualToday) : "—"}
                        </Text>
                        {dailyGoal !== null && (
                          <Text style={{ color: MUTED, fontSize: 12 }}>/ {formatKcal(dailyGoal)} target</Text>
                        )}
                      </div>
                      {dailyGoal !== null && dailyGoal > 0 ? (
                        <>
                          <Progress
                            percent={Math.min(Math.round(todayVsGoalPercent), 100)}
                            status={todayVsGoalPercent > 100 ? "exception" : "active"}
                            strokeColor={todayVsGoalPercent > 100 ? DANGER : FOREST}
                            railColor="#e8efe4"
                            showInfo
                            format={(p) => `${p ?? 0}%`}
                          />
                          {todayOverLabel && (
                            <Tag color="error" icon={<WarningOutlined />} style={{ marginTop: 4 }}>
                              {todayOverLabel}
                            </Tag>
                          )}
                        </>
                      ) : (
                        <Text style={{ color: MUTED, fontSize: 12 }}>
                          No household target set
                          {/* Issue #124 — only owners can set the household target */}
                          {isOwner && (
                            <> —{" "}
                              <Button type="link" onClick={openBudgetModal} style={{ color: FOREST, padding: 0, height: "auto", fontSize: 12 }}>
                                Set target →
                              </Button>
                            </>
                          )}
                        </Text>
                      )}
                    </div>

                    <Divider style={{ margin: "4px 0" }} />

                    {/* Row 2: my personal intake today vs my personal health goal */}
                    <div>
                      <Text style={{ color: MUTED, fontSize: 12 }}>
                        👤 Your intake today
                        <Text style={{ color: MUTED, fontSize: 11, fontWeight: 400 }}> — your consumption only, vs your personal health goal</Text>
                      </Text>
                      {myPersonalGoal ? (
                        <>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "4px 0" }}>
                            <Text strong style={{ fontSize: 15, color: myTodayVsGoalPercent > 100 ? DANGER : FOREST }}>
                              {stats && myActualToday !== null ? formatKcal(myActualToday) : "—"}
                            </Text>
                            <Text style={{ color: MUTED, fontSize: 12 }}>/ {formatKcal(myPersonalGoal)} personal goal</Text>
                          </div>
                          <Progress
                            percent={Math.min(Math.round(myTodayVsGoalPercent), 100)}
                            status={myTodayVsGoalPercent > 100 ? "exception" : "active"}
                            strokeColor={myTodayVsGoalPercent > 100 ? DANGER : FOREST}
                            railColor="#e8efe4"
                            showInfo
                            format={(p) => `${p ?? 0}%`}
                          />
                          {myTodayOverLabel && (
                            <Tag color="error" icon={<WarningOutlined />} style={{ marginTop: 4 }}>
                              {myTodayOverLabel}
                            </Tag>
                          )}
                        </>
                      ) : (
                        <Text style={{ color: MUTED, fontSize: 12 }}>
                          No personal health goal set —{" "}
                          {userId && (
                            <Button
                              type="link"
                              onClick={() => router.push(`/users/${userId}/health-goal`)}
                              style={{ color: FOREST, padding: 0, height: "auto", fontSize: 12 }}
                            >
                              Set goal →
                            </Button>
                          )}
                        </Text>
                      )}
                    </div>

                    {stats?.comparisonToBudget ? (
                      <>
                        <Divider style={{ margin: "4px 0" }} />
                        <div>
                        <Text style={{ fontSize: 12, color: MUTED }}>🏠 Household period average vs daily target:</Text>
                        <div style={{ marginTop: 6 }}>
                          <Tag color={comparisonTagColor(stats.comparisonToBudget.status)}>
                            {stats.comparisonToBudget.status.split("_").join(" ")}
                          </Tag>
                          <Text style={{ marginLeft: 8, color: "#3d4f3d" }}>
                            Household avg {stats.averageDailyCalories.toFixed(0)} kcal/day vs target{" "}
                            {stats.dailyCalorieTarget?.toFixed(0) ?? "—"} kcal/day
                          </Text>
                        </div>
                        </div>
                      </>
                    ) : null}
                  </Space>
                </Card>
              </Col>
            </Row>

            <Row gutter={[20, 20]} className={statsStyles.lowerSection}>
              <Col xs={24}>
                <Space orientation="vertical" size="large" style={{ width: "100%" }}>
                  <Card
                    className={statsStyles.panelCard}
                    title="Current inventory"
                    extra={
                      <Space size="small" wrap>
                        <Button
                          type="primary"
                          size="small"
                          onClick={() =>
                            router.push(
                              `/open-food-facts?householdId=${householdId}&householdName=${encodeURIComponent(householdName)}`,
                            )
                          }
                        >
                          Add from Open Food Facts
                        </Button>
                        <Button
                          size="small"
                          onClick={() =>
                            router.push(
                              `/pantry/add/scan?householdId=${householdId}&householdName=${encodeURIComponent(householdName)}`,
                            )
                          }
                        >
                          Scan package barcode
                        </Button>
                        <Button
                          size="small"
                          onClick={() =>
                            router.push(
                              `/pantry/add/recognize?householdId=${householdId}&householdName=${encodeURIComponent(householdName)}`,
                            )
                          }
                        >
                          Recognize food from photo
                        </Button>
                        <Button
                          size="small"
                          onClick={() =>
                            router.push(
                              `/pantry/add/receipt?householdId=${householdId}&householdName=${encodeURIComponent(householdName)}`,
                            )
                          }
                        >
                          Upload receipt
                        </Button>
                        <Button
                          size="small"
                          onClick={() =>
                            router.push(
                              `/pantry/add/manual?householdId=${householdId}&householdName=${encodeURIComponent(householdName)}`,
                            )
                          }
                        >
                          Add manually
                        </Button>
                      </Space>
                    }
                    variant="borderless"
                  >
                    {pantry && pantry.items.length > 0 ? (
                      <Table<PantryItem>
                        rowKey="id"
                        pagination={{ pageSize: 8, showSizeChanger: false }}
                        size="small"
                        dataSource={pantry.items}
                        columns={inventoryColumns}
                      />
                    ) : (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="No pantry items yet."
                      />
                    )}
                  </Card>

                  <Card className={`${statsStyles.panelCard} ${statsStyles.activityCard}`} title="Recent activity" variant="borderless">
                    {activity.length === 0 ? (
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        No pantry activity recorded yet, or logs are still loading.
                      </Text>
                    ) : (
                      <div className={statsStyles.activityList}>
                        {activity.map((a) => {
                          const isAdded = a.type === "ADDED";
                          return (
                            <div key={a.id} className={statsStyles.activityItem}>
                              <div>
                                <Space size={8}>
                                  {isAdded ? (
                                    <PlusCircleOutlined style={{ color: FOREST }} />
                                  ) : (
                                    <MinusCircleOutlined style={{ color: DANGER }} />
                                  )}
                                  <Text strong style={{ color: "#1b2a1b" }}>
                                    {isAdded ? "Added" : "Consumed"} {a.productName}
                                  </Text>
                                </Space>
                                <div className={statsStyles.activityMeta}>
                                  {dayjs(a.at).format("MMM D, YYYY · HH:mm")}
                                </div>
                              </div>
                              <span className={`${statsStyles.activityDelta} ${isAdded ? statsStyles.deltaPos : statsStyles.deltaNeg}`}>
                                {isKnownCalories(a.deltaKcal)
                                  ? `${isAdded ? "+" : "-"}${Math.round(a.deltaKcal).toLocaleString()} kcal`
                                  : "—"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                </Space>
              </Col>
            </Row>

            {/* Issue #124 — Chart 1: my personal daily calorie intake, last 7 days.
                Always shown; goal line and color coding only appear when personal goal is set. */}
            <Card
              title={<span style={{ fontSize: 16, fontWeight: 700, color: "#1f2d1f" }}>My daily calorie intake</span>}
              style={{ borderRadius: 16, borderColor: "#d9e2cf" }}
            >
              {myLast7Days.some((d) => d.caloriesConsumed > 0) ? (
                <>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Your personal consumption · last 7 days
                  </Typography.Text>
                  {myPersonalGoal ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "6px 0 12px" }}>
                      <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke={FOREST} strokeWidth="2" strokeDasharray="5 3" /></svg>
                      <Typography.Text style={{ fontSize: 11, color: MUTED }}>
                        Your personal health goal · {Math.round(myPersonalGoal).toLocaleString()} kcal/day (set in your profile)
                      </Typography.Text>
                    </div>
                  ) : (
                    <div style={{ margin: "6px 0 12px" }}>
                      <Typography.Text style={{ fontSize: 11, color: MUTED }}>
                        No personal goal set —{" "}
                        {userId && (
                          <Button type="link" onClick={() => router.push(`/users/${userId}/health-goal`)} style={{ color: FOREST, padding: 0, height: "auto", fontSize: 11 }}>
                            Set goal to enable comparison →
                          </Button>
                        )}
                      </Typography.Text>
                    </div>
                  )}
                  <div style={{ overflowX: "auto" }}>
                    <BarChart
                      width={Math.max(myLast7Days.length * 100 + 64, 300)}
                      height={220}
                      data={myLast7Days}
                      margin={{ top: 10, right: 40, left: 0, bottom: 0 }}
                      barCategoryGap="35%"
                    >
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}`} width={48} />
                      <Tooltip formatter={(v: unknown) => `${Math.round(Number(v))} kcal`} labelFormatter={(l: unknown) => `Date: ${String(l)}`} />
                      {myPersonalGoal && (
                        <ReferenceLine y={myPersonalGoal} stroke={FOREST} strokeDasharray="5 3" strokeWidth={2} label={{ value: "goal", position: "insideTopRight", fontSize: 10, fill: FOREST }} />
                      )}
                      <Bar dataKey="caloriesConsumed" maxBarSize={56} radius={[4, 4, 0, 0]}>
                        {myLast7Days.map((entry) => (
                          <Cell key={entry.date} fill={myPersonalGoal && entry.caloriesConsumed > myPersonalGoal ? DANGER : "#7cb87e"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </div>
                  {myPersonalGoal && (
                    <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: MUTED }}>
                      <span><span style={{ color: DANGER }}>■</span> Exceeds your personal goal</span>
                      <span><span style={{ color: "#7cb87e" }}>■</span> Within your personal goal</span>
                    </div>
                  )}
                </>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={<Typography.Text type="secondary" style={{ fontSize: 13 }}>No consumption recorded in the last 7 days</Typography.Text>}
                />
              )}
            </Card>

            {/* Issue #124 — Chart 3: household daily total, last 7 days with target reference line */}
            <Card
              title={<span style={{ fontSize: 16, fontWeight: 700, color: "#1f2d1f" }}>Household daily calorie consumption</span>}
              style={{ borderRadius: 16, borderColor: "#d9e2cf" }}
            >
              {householdLast7Days.some((d) => d.caloriesConsumed > 0) ? (
                <>
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: dailyGoal ? 4 : 12 }}>
                    Total kcal consumed by all members combined · last 7 days
                  </Typography.Text>
                  {dailyGoal && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                      <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke={DANGER} strokeWidth="2" strokeDasharray="5 3" /></svg>
                      <Typography.Text style={{ fontSize: 11, color: MUTED }}>
                        Household daily target · {Math.round(dailyGoal).toLocaleString()} kcal/day (set by admin)
                      </Typography.Text>
                    </div>
                  )}
                  <div style={{ overflowX: "auto" }}>
                    <BarChart
                      width={Math.max(householdLast7Days.length * 100 + 64, 300)}
                      height={220}
                      data={householdLast7Days}
                      margin={{ top: 10, right: 40, left: 0, bottom: 0 }}
                      barCategoryGap="35%"
                    >
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}`} width={48} />
                      <Tooltip formatter={(v: unknown) => `${Math.round(Number(v))} kcal`} labelFormatter={(l: unknown) => `Date: ${String(l)}`} />
                      {dailyGoal && (
                        <ReferenceLine y={dailyGoal} stroke={DANGER} strokeDasharray="5 3" strokeWidth={2} label={{ value: "target", position: "insideTopRight", fontSize: 10, fill: DANGER }} />
                      )}
                      <Bar dataKey="caloriesConsumed" maxBarSize={56} radius={[4, 4, 0, 0]}>
                        {householdLast7Days.map((entry) => (
                          <Cell key={entry.date} fill={dailyGoal && entry.caloriesConsumed > dailyGoal ? DANGER : FOREST} />
                        ))}
                      </Bar>
                    </BarChart>
                  </div>
                  {dailyGoal && (
                    <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: MUTED }}>
                      <span><span style={{ color: DANGER }}>■</span> Exceeds household target</span>
                      <span><span style={{ color: FOREST }}>■</span> Within target</span>
                    </div>
                  )}
                </>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={<Typography.Text type="secondary" style={{ fontSize: 13 }}>No consumption recorded in the last 7 days</Typography.Text>}
                />
              )}
            </Card>

            {/* Issue #124 — Chart 2: member average daily intake, placed last; horizontal scroll for large households */}
            {stats?.memberBreakdown && stats.memberBreakdown.length > 0 && (
              <Card
                title={<span style={{ fontSize: 16, fontWeight: 700, color: "#1f2d1f" }}>Average daily intake per member</span>}
                style={{ borderRadius: 16, borderColor: "#d9e2cf" }}
              >
                <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                  Each member&apos;s average kcal consumed per day during the selected period
                </Typography.Text>
                <div style={{ overflowX: "auto" }}>
                  <BarChart
                    width={Math.max(stats.memberBreakdown.length * 120, 400)}
                    height={220}
                    data={stats.memberBreakdown.map((m) => ({
                      ...m,
                      label: String(m.userId) === userId ? "You" : m.username,
                    }))}
                    margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                    barCategoryGap="35%"
                  >
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}`} width={48} />
                    <Tooltip formatter={(v: unknown) => `${Math.round(Number(v))} kcal/day`} />
                    <Bar dataKey="averageDailyCalories" fill={FOREST} maxBarSize={56} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </div>
                <Typography.Text style={{ fontSize: 11, color: MUTED }}>kcal / day average</Typography.Text>
              </Card>
            )}
          </>
        )}
      </Space>

      {/* Issue #95 — portion consume modal: user picks how much to consume */}
      <Modal
        title="How much to consume?"
        open={Boolean(portionConsumeState)}
        onCancel={() => setPortionConsumeState(null)}
        onOk={() => {
          if (!portionConsumeState) return;
          const { item, amount, amountUnit } = portionConsumeState;
          if (!Number.isFinite(amount) || amount <= 0) {
            message.error("Amount must be greater than zero.");
            return;
          }
          const maxAmount = getMaxConsumptionAmount(item, amountUnit);
          if (maxAmount !== undefined && amount > maxAmount) {
            message.error(`Amount cannot exceed available quantity (${formatAmountDisplay(maxAmount)} ${amountUnit}).`);
            return;
          }
          // Issue #121
          const consumedForUserId =
            selectedConsumerId !== null && selectedConsumerId !== numericUserId
              ? selectedConsumerId
              : undefined;
          // For items without calorie data for the stored unit, open the calorie-unknown flow
          const kcalMissing =
            (amountUnit === "package" && !isKnownCalories(item.kcalPerPackage)) ||
            (amountUnit === "g" && !isKnownCalories(item.kcalPer100g)) ||
            (amountUnit === "ml" && !isKnownCalories(item.kcalPer100ml)) ||
            (amountUnit === "serving" && !isKnownCalories(item.kcalPerServing));
          if (kcalMissing) {
            const suggestedCalories = estimateSuggestedCalories(item);
            setPortionConsumeState(null);
            setUnknownConsumeState({
              item,
              amount,
              amountUnit,
              suggestedCalories,
              mode: suggestedCalories !== null ? "suggested" : "manual",
              manualCalories: suggestedCalories,
            });
            return;
          }
          void executeConsume(item, amount, { amountUnit, consumedForUserId });
        }}
        confirmLoading={portionConsumeState ? consumingItemId === portionConsumeState.item.id : false}
        okText="Consume"
      >
        {portionConsumeState ? (
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <Text strong style={{ color: "#1b2a1b" }}>
              {portionConsumeState.item.name}
            </Text>
            <div>
              <Text style={{ display: "block", marginBottom: 4 }}>Consume by</Text>
              <Select
                style={{ width: "100%" }}
                value={portionConsumeState.amountUnit}
                options={getAvailableConsumptionUnits(portionConsumeState.item).map((unit) => ({
                  value: unit,
                  label: formatConsumptionUnitLabel(unit),
                }))}
                onChange={(unit: ConsumptionUnit) =>
                  setPortionConsumeState((cur) =>
                    cur
                      ? {
                          ...cur,
                          amountUnit: unit,
                          amount: getDefaultConsumptionAmount(cur.item, unit),
                        }
                      : cur,
                  )
                }
              />
            </div>
            <div>
              <Text style={{ display: "block", marginBottom: 4 }}>
                Amount ({formatConsumptionUnitLabel(portionConsumeState.amountUnit)})
              </Text>
              <InputNumber
                min={0.01}
                max={getMaxConsumptionAmount(portionConsumeState.item, portionConsumeState.amountUnit)}
                step={getConsumptionStep(portionConsumeState.amountUnit)}
                precision={2}
                value={portionConsumeState.amount}
                onChange={(value) =>
                  setPortionConsumeState((cur) =>
                    cur && typeof value === "number" && Number.isFinite(value)
                      ? { ...cur, amount: value }
                      : cur,
                  )
                }
                style={{ width: "100%" }}
                suffix={portionConsumeState.amountUnit}
              />
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Inventory: {formatAmountWithUnit(portionConsumeState.item.amount, portionConsumeState.item.amountUnit)}
              {getPackageQuantityConversionNote(portionConsumeState.item, portionConsumeState.amountUnit)
                ? ` · ${getPackageQuantityConversionNote(portionConsumeState.item, portionConsumeState.amountUnit)}`
                : getMaxConsumptionAmount(portionConsumeState.item, portionConsumeState.amountUnit) === undefined
                  ? " · nutrition can be logged, but package inventory may not change for this unit"
                  : ""}
            </Text>
            {/* Issue #121 — attribute consumption to a specific member */}
            {members.length > 1 && (
              <div>
                <Text style={{ display: "block", marginBottom: 4 }}>Who consumed?</Text>
                <Select
                  style={{ width: "100%" }}
                  value={selectedConsumerId ?? numericUserId ?? undefined}
                  onChange={(val: number) => setSelectedConsumerId(val)}
                  options={members.map((m) => ({ value: m.userId, label: m.username }))}
                />
              </div>
            )}
            <div>
              <Text style={{ display: "block", marginBottom: 4 }}>
                Optional meal photo for portion suggestion
              </Text>
              <input
                aria-label="Meal photo"
                type="file"
                accept="image/jpeg,image/png"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setPortionConsumeState((current) =>
                    current
                      ? {
                          ...current,
                          mealPhoto: file,
                          estimateMessage: null,
                          estimatedRange: null,
                        }
                      : current,
                  );
                }}
              />
            </div>

            <Button
              onClick={() => void estimatePortionFromPhoto()}
              loading={portionConsumeState.isEstimating}
              disabled={!portionConsumeState.mealPhoto || portionConsumeState.isEstimating}
            >
              Estimate portion from photo
            </Button>

            {portionConsumeState.estimatedRange ? (
              <Text strong>
                Suggested range: {portionConsumeState.estimatedRange}
              </Text>
            ) : null}

            {portionConsumeState.estimateMessage ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {portionConsumeState.estimateMessage}
              </Text>
            ) : null}
          </Space>
        ) : null}
      </Modal>

      <Modal
        title="Missing calorie data"
        open={Boolean(unknownConsumeState)}
        onCancel={() => setUnknownConsumeState(null)}
        onOk={() => {
          if (!unknownConsumeState) return;

          // Issue #121
          const consumedForUserId =
            selectedConsumerId !== null && selectedConsumerId !== numericUserId
              ? selectedConsumerId
              : undefined;

          if (unknownConsumeState.mode === "suggested") {
            void executeConsume(unknownConsumeState.item, unknownConsumeState.amount, {
              amountUnit: unknownConsumeState.amountUnit,
              kcalPerPackage: unknownConsumeState.suggestedCalories,
              consumedForUserId,
            });
            return;
          }

          if (unknownConsumeState.mode === "manual") {
            const manualCalories = unknownConsumeState.manualCalories;
            if (!isKnownCalories(manualCalories)) {
              message.error("Please enter a calorie value greater than 0.");
              return;
            }
            void executeConsume(unknownConsumeState.item, unknownConsumeState.amount, {
              amountUnit: unknownConsumeState.amountUnit,
              kcalPerPackage: manualCalories,
              consumedForUserId,
            });
            return;
          }

          void executeConsume(unknownConsumeState.item, unknownConsumeState.amount, {
            amountUnit: unknownConsumeState.amountUnit,
            skipCalorieLogging: true,
            consumedForUserId,
          });
        }}
        confirmLoading={unknownConsumeState ? consumingItemId === unknownConsumeState.item.id : false}
        okText={
          unknownConsumeState?.mode === "skip"
            ? "Consume without calories"
            : "Save and consume"
        }
      >
        <Paragraph type="secondary">
          This item has no calorie data yet. Please confirm or enter calories before logging consumption.
        </Paragraph>
        {unknownConsumeState ? (
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <Text strong style={{ color: "#1b2a1b" }}>
              {unknownConsumeState.item.name}
            </Text>
            <Radio.Group
              value={unknownConsumeState.mode}
              onChange={(event) =>
                setUnknownConsumeState((current) =>
                  current
                    ? { ...current, mode: event.target.value as UnknownConsumeMode }
                    : current,
                )
              }
            >
              <Space orientation="vertical" size="middle">
                <Radio value="suggested" disabled={!isKnownCalories(unknownConsumeState.suggestedCalories)}>
                  Use system suggestion
                  {isKnownCalories(unknownConsumeState.suggestedCalories)
                    ? ` (${Math.round(unknownConsumeState.suggestedCalories).toLocaleString()} kcal / package)`
                    : " (not available)"}
                </Radio>
                <Radio value="manual">Enter calories manually</Radio>
                <Radio value="skip">Skip calorie logging for this consumption</Radio>
              </Space>
            </Radio.Group>
            {unknownConsumeState.mode === "manual" ? (
              <InputNumber
                min={1}
                value={unknownConsumeState.manualCalories ?? undefined}
                onChange={(value) =>
                  setUnknownConsumeState((current) =>
                    current
                      ? {
                          ...current,
                          manualCalories:
                            typeof value === "number" && Number.isFinite(value) ? value : null,
                        }
                      : current,
                  )
                }
                style={{ width: "100%" }}
                suffix="kcal / package"
              />
            ) : null}
            {unknownConsumeState.mode === "skip" ? (
              <Text type="secondary">
                The quantity will be consumed, but this event will not contribute to calorie totals.
              </Text>
            ) : null}
          </Space>
        ) : null}
      </Modal>

      <Modal
        title="Daily calorie target"
        open={budgetModalOpen}
        onCancel={() => setBudgetModalOpen(false)}
        onOk={() => void submitBudget()}
        confirmLoading={savingBudget}
        okText="Save"
      >
        <Paragraph type="secondary">
          Set the ideal total calories your household aims to consume per day. Only the household owner can
          change this.
        </Paragraph>
        <Form form={budgetForm} layout="vertical">
          <Form.Item
            label="Daily calorie target"
            name="dailyCalorieTarget"
            rules={[
              { required: true, message: "Enter a calorie target" },
              {
                type: "number",
                max: 50000,
                message: "Enter a value up to 50000",
              },
              {
                validator: (_, value: number | null | undefined) => {
                  if (value === null || value === undefined) {
                    return Promise.resolve();
                  }

                  if (value <= 0) {
                    return Promise.reject(
                      new Error("Daily calorie target can't be less than or equal to 0"),
                    );
                  }

                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber max={50000} style={{ width: "100%" }} suffix="kcal / day" />
          </Form.Item>
        </Form>
      </Modal>

    </VirtualPantryAppShell>
  );
}
