"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import useSessionStorage from "@/hooks/useSessionStorage";
import { usePantryWebSocket } from "@/hooks/usePantryWebSocket";
import { VirtualPantryAppShell } from "@/components/VirtualPantryAppShell";
import { isStaleHouseholdError, getStaleHouseholdMessage } from "@/utils/householdStale";
import type { HouseholdWithRole } from "@/types/household";
import type { ConsumptionUnit, PantryItem, PantryItemCreateRequest } from "@/types/pantry";
import { App, Button, Card, DatePicker, Input, Space, Typography } from "antd";
import type { Dayjs } from "dayjs";
import { ArrowLeftOutlined } from "@ant-design/icons";

const { Title, Paragraph } = Typography;

type PantryTarget = {
  householdId: number;
  householdName: string;
};


function formatHouseholdValidationError(error: unknown): string {
  return getStaleHouseholdMessage(error);
}

export default function ManualAddPantryItemPage() {
  return (
    <Suspense fallback={null}>
      <ManualAddPantryItemContent />
    </Suspense>
  );
}

// Issue #114 — form for manually entering a pantry item when the product is not in Open Food Facts
function ManualAddPantryItemContent() {
  useAuthGuard();
  const api = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { message } = App.useApp();
  const { value: token } = useSessionStorage<string>("token", "");
  const { value: storedUserId } = useSessionStorage<string>("userId", "");
  const { value: cachedHouseholds, set: setHouseholds } = useSessionStorage<HouseholdWithRole[]>("households", []);
  const { clear: clearSelectedHouseholdId } = useSessionStorage<number | null>("selectedHouseholdId", null);
  const currentUserId = storedUserId ? Number(storedUserId) : null;

  const [validatedPantryTarget, setValidatedPantryTarget] = useState<PantryTarget | null>(null);
  const [validatingPantryTarget, setValidatingPantryTarget] = useState(true);

  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [unit, setUnit] = useState<ConsumptionUnit>("package");
  const [amount, setAmount] = useState<number>(1);
  const [calories, setCalories] = useState<number | "">("");
  const [expirationDate, setExpirationDate] = useState<Dayjs | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestedHouseholdId = useMemo(() => {
    const param = searchParams.get("householdId");
    if (!param) return null;
    const id = Number(param);
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [searchParams]);

  // Refs for stable callbacks — prevents the validation effect from re-running on
  // every render just because these hook results have new object identity each render.
  const apiRef = useRef(api);
  apiRef.current = api;
  const messageRef = useRef(message);
  messageRef.current = message;
  const routerRef = useRef(router);
  routerRef.current = router;
  const cachedHouseholdsRef = useRef(cachedHouseholds);
  cachedHouseholdsRef.current = cachedHouseholds;
  const setHouseholdsRef = useRef(setHouseholds);
  setHouseholdsRef.current = setHouseholds;
  const clearSelectedHouseholdIdRef = useRef(clearSelectedHouseholdId);
  clearSelectedHouseholdIdRef.current = clearSelectedHouseholdId;

  usePantryWebSocket({
    householdId: requestedHouseholdId,
    token,
    onMessage: (msg) => {
      if (
        msg.eventType === "HOUSEHOLD_DELETED" ||
        (msg.eventType === "MEMBER_REMOVED" && msg.removedUserId === currentUserId)
      ) {
        setHouseholds(cachedHouseholds.filter((h) => h.householdId !== requestedHouseholdId));
        clearSelectedHouseholdId();
        message.warning(
          msg.eventType === "HOUSEHOLD_DELETED"
            ? "This household has been deleted."
            : "You have been removed from this household.",
        );
        router.push("/households");
      }
    },
  });

  useEffect(() => {
    let cancelled = false;

    const reject = (text: string) => {
      if (cancelled) return;
      setValidatedPantryTarget(null);
      setValidatingPantryTarget(false);
      messageRef.current.error(text);
      if (requestedHouseholdId) {
        setHouseholdsRef.current(cachedHouseholdsRef.current.filter((h) => h.householdId !== requestedHouseholdId));
        clearSelectedHouseholdIdRef.current();
      }
      routerRef.current.replace("/households");
    };

    const validate = async () => {
      if (!requestedHouseholdId) {
        reject("Household ID is missing or invalid.");
        return;
      }

      setValidatingPantryTarget(true);
      try {
        const household = await apiRef.current.get<{ householdId: number; name: string }>(
          `/households/${requestedHouseholdId}`,
        );
        if (cancelled) return;
        setValidatedPantryTarget({ householdId: requestedHouseholdId, householdName: household.name });
        setValidatingPantryTarget(false);
      } catch (error) {
        reject(formatHouseholdValidationError(error));
      }
    };

    void validate();
    return () => {
      cancelled = true;
    };
  }, [requestedHouseholdId]);

  // Issue #114 — calorie label and the payload field it maps to change based on the chosen unit
  const caloriesLabel = useMemo(() => {
    if (unit === "g") return "Calories per 100g (kcal)";
    if (unit === "ml") return "Calories per 100ml (kcal)";
    if (unit === "serving") return "Calories per serving (kcal)";
    return "Calories per package (kcal)";
  }, [unit]);

  const handleSubmit = useCallback(async () => {
    if (!validatedPantryTarget) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      message.warning("Product name is required.");
      return;
    }
    if (typeof calories !== "number" || calories <= 0) {
      message.warning("Calories must be greater than zero.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      message.warning("Amount must be greater than zero.");
      return;
    }

    const payload: PantryItemCreateRequest = {
      barcode: barcode.trim(),
      name: trimmedName,
      amount,
      amountUnit: unit,
      kcalPerPackage: unit === "package" ? calories : null,
      kcalPer100g: unit === "g" ? calories : null,
      kcalPer100ml: unit === "ml" ? calories : null,
      kcalPerServing: unit === "serving" ? calories : null,
      manualEntry: true,
      expirationDate: expirationDate ? expirationDate.format("YYYY-MM-DD") : null,
    };
    setIsSubmitting(true);
    try {
      await api.post<PantryItem>(
        `/households/${validatedPantryTarget.householdId}/pantry`,
        payload,
      );
      message.success(`Item added to ${validatedPantryTarget.householdName}.`);
      setName("");
      setBarcode("");
      setUnit("package");
      setAmount(1);
      setCalories("");
      setExpirationDate(null);
      router.push(`/households/${validatedPantryTarget.householdId}/stats`);
    } catch (error) {
      if (isStaleHouseholdError(error)) {
        setHouseholds(cachedHouseholds.filter((h) => h.householdId !== validatedPantryTarget.householdId));
        clearSelectedHouseholdId();
        message.warning(getStaleHouseholdMessage(error));
        router.push("/households");
        return;
      }
      message.error(
        error instanceof Error ? error.message : "Failed to add the item to the pantry.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [api, amount, barcode, cachedHouseholds, calories, clearSelectedHouseholdId, expirationDate, message, name, router, setHouseholds, unit, validatedPantryTarget]);

  if (validatingPantryTarget || !validatedPantryTarget) {
    return null;
  }

  return (
    <VirtualPantryAppShell activeNav="pantry">
      <header style={{ marginBottom: 24 }}>
        <Button
          size="middle"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.back()}
          style={{ marginBottom: 18, borderRadius: 12, fontWeight: 600 }}
        >
          Back
        </Button>
        <Title level={1}>Add Item Manually</Title>
        <Paragraph>
          Add a product directly to {validatedPantryTarget.householdName}.
        </Paragraph>
      </header>

      <Card title="Product details">
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Product name *</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Whole Milk"
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Barcode (optional)</span>
            <Input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="e.g. 3017624010701"
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Unit</span>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as ConsumptionUnit)}
              aria-label="Unit"
            >
              <option value="package">package</option>
              <option value="g">g</option>
              <option value="ml">ml</option>
              <option value="serving">serving</option>
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Amount ({unit})</span>
            <input
              aria-label={`Amount in ${unit}`}
              type="number"
              min={0.01}
              step={unit === "package" ? 1 : 0.1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>{caloriesLabel} *</span>
            <input
              aria-label={caloriesLabel}
              type="number"
              min={0.01}
              step={0.1}
              value={calories}
              onChange={(e) =>
                setCalories(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="e.g. 250"
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Expiration date (optional)</span>
            <DatePicker
              value={expirationDate}
              onChange={setExpirationDate}
              format="YYYY-MM-DD"
              placeholder="No expiration date"
              style={{ width: "100%" }}
            />
          </label>

          <Space>
            <Button
              type="primary"
              onClick={() => void handleSubmit()}
              loading={isSubmitting}
            >
              {isSubmitting ? "Adding..." : "Add to pantry"}
            </Button>
          </Space>
        </Space>
      </Card>
    </VirtualPantryAppShell>
  );
}
