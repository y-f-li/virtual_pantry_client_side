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
import type { ConsumptionUnit, ManualMicronutrientKey, MicronutrientUnit, PantryItem, PantryItemCreateRequest } from "@/types/pantry";
import { Alert, App, Button, Card, DatePicker, Input, Space, Typography } from "antd";
import type { Dayjs } from "dayjs";
import { ArrowLeftOutlined } from "@ant-design/icons";

const { Title, Paragraph } = Typography;

type PantryTarget = {
  householdId: number;
  householdName: string;
};

type ManualMicronutrientDescriptor = {
  key: ManualMicronutrientKey;
  label: string;
  defaultUnit: MicronutrientUnit;
};

type ManualMicronutrientFieldState = {
  value: number | "";
  unit: MicronutrientUnit;
};

type ManualMicronutrientFormState = Record<ManualMicronutrientKey, ManualMicronutrientFieldState>;

const MANUAL_MICRONUTRIENTS: ManualMicronutrientDescriptor[] = [
  { key: "biotin", label: "Biotin", defaultUnit: "µg" },
  { key: "calcium", label: "Calcium", defaultUnit: "mg" },
  { key: "chloride", label: "Chloride", defaultUnit: "mg" },
  { key: "choline", label: "Choline", defaultUnit: "mg" },
  { key: "chromium", label: "Chromium", defaultUnit: "µg" },
  { key: "copper", label: "Copper", defaultUnit: "mg" },
  { key: "fluoride", label: "Fluoride", defaultUnit: "mg" },
  { key: "folate", label: "Folate", defaultUnit: "µg" },
  { key: "iodine", label: "Iodine", defaultUnit: "µg" },
  { key: "iron", label: "Iron", defaultUnit: "mg" },
  { key: "magnesium", label: "Magnesium", defaultUnit: "mg" },
  { key: "manganese", label: "Manganese", defaultUnit: "mg" },
  { key: "molybdenum", label: "Molybdenum", defaultUnit: "µg" },
  { key: "niacin", label: "Niacin", defaultUnit: "mg" },
  { key: "pantothenicAcid", label: "Pantothenic acid", defaultUnit: "mg" },
  { key: "phosphorus", label: "Phosphorus", defaultUnit: "mg" },
  { key: "potassium", label: "Potassium", defaultUnit: "mg" },
  { key: "riboflavin", label: "Riboflavin", defaultUnit: "mg" },
  { key: "selenium", label: "Selenium", defaultUnit: "µg" },
  { key: "sodium", label: "Sodium", defaultUnit: "mg" },
  { key: "thiamin", label: "Thiamin", defaultUnit: "mg" },
  { key: "vitaminA", label: "Vitamin A", defaultUnit: "µg" },
  { key: "vitaminB12", label: "Vitamin B12", defaultUnit: "µg" },
  { key: "vitaminB6", label: "Vitamin B6", defaultUnit: "mg" },
  { key: "vitaminC", label: "Vitamin C", defaultUnit: "mg" },
  { key: "vitaminD", label: "Vitamin D", defaultUnit: "µg" },
  { key: "vitaminE", label: "Vitamin E", defaultUnit: "mg" },
  { key: "vitaminK", label: "Vitamin K", defaultUnit: "µg" },
  { key: "zinc", label: "Zinc", defaultUnit: "mg" },
];

function createInitialMicronutrientState(): ManualMicronutrientFormState {
  return MANUAL_MICRONUTRIENTS.reduce((state, nutrient) => {
    state[nutrient.key] = { value: "", unit: nutrient.defaultUnit };
    return state;
  }, {} as ManualMicronutrientFormState);
}

function buildManualMicronutrientPayload(
  micronutrients: ManualMicronutrientFormState,
): PantryItemCreateRequest["micronutrients"] | undefined {
  const payload: NonNullable<PantryItemCreateRequest["micronutrients"]> = {};

  for (const nutrient of MANUAL_MICRONUTRIENTS) {
    const field = micronutrients[nutrient.key];
    if (typeof field.value === "number" && Number.isFinite(field.value) && field.value > 0) {
      payload[nutrient.key] = { value: field.value, unit: field.unit };
    }
  }

  return Object.keys(payload).length > 0 ? payload : undefined;
}

function getManualNutritionBasisLabel(unit: ConsumptionUnit): string {
  if (unit === "g") return "per 100g";
  if (unit === "ml") return "per 100ml";
  if (unit === "serving") return "per serving";
  return "per package";
}

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
  const [micronutrients, setMicronutrients] = useState<ManualMicronutrientFormState>(() => createInitialMicronutrientState());
  const [expirationDate, setExpirationDate] = useState<Dayjs | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const appliedPrefillRef = useRef(false);

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

  const micronutrientBasisLabel = useMemo(() => getManualNutritionBasisLabel(unit), [unit]);

  const updateMicronutrientValue = useCallback((key: ManualMicronutrientKey, value: string) => {
    setMicronutrients((current) => ({
      ...current,
      [key]: {
        ...current[key],
        value: value === "" ? "" : Number(value),
      },
    }));
  }, []);

  const updateMicronutrientUnit = useCallback((key: ManualMicronutrientKey, value: MicronutrientUnit) => {
    setMicronutrients((current) => ({
      ...current,
      [key]: {
        ...current[key],
        unit: value,
      },
    }));
  }, []);

  const clearForm = useCallback(() => {
    setName("");
    setBarcode("");
    setUnit("package");
    setAmount(1);
    setCalories("");
    setMicronutrients(createInitialMicronutrientState());
    setExpirationDate(null);
    setSuccessNotice(null);
  }, []);

  useEffect(() => {
    if (appliedPrefillRef.current) return;
    appliedPrefillRef.current = true;

    const prefillName = searchParams.get("name")?.trim();
    if (prefillName) {
      setName(prefillName.slice(0, 160));
    }

    const prefillUnit = searchParams.get("unit")?.trim().toLowerCase();
    if (prefillUnit === "g" || prefillUnit === "ml" || prefillUnit === "package" || prefillUnit === "serving") {
      setUnit(prefillUnit as ConsumptionUnit);
    }

    const prefillAmount = Number(searchParams.get("amount"));
    if (Number.isFinite(prefillAmount) && prefillAmount > 0) {
      setAmount(prefillAmount);
    }

    const prefillCalories = Number(searchParams.get("calories"));
    if (Number.isFinite(prefillCalories) && prefillCalories > 0) {
      setCalories(prefillCalories);
    }
  }, [searchParams]);

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

    const manualMicronutrientPayload = buildManualMicronutrientPayload(micronutrients);
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
    if (manualMicronutrientPayload) {
      payload.micronutrients = manualMicronutrientPayload;
    }
    setIsSubmitting(true);
    try {
      await api.post<PantryItem>(
        `/households/${validatedPantryTarget.householdId}/pantry`,
        payload,
      );
      const successText = `Item added to ${validatedPantryTarget.householdName}.`;
      message.success(successText);
      setSuccessNotice(successText);
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
  }, [api, amount, barcode, cachedHouseholds, calories, clearSelectedHouseholdId, expirationDate, message, micronutrients, name, router, setHouseholds, unit, validatedPantryTarget]);

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
          {successNotice ? (
            <Alert
              type="success"
              showIcon
              title={successNotice}
              description="The item stays in the pantry. Clear the fields when you want to enter another item."
            />
          ) : null}

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

          <details style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>
              Optional micronutrients
            </summary>
            <Paragraph style={{ marginTop: 12, marginBottom: 16 }}>
              Add micronutrients {micronutrientBasisLabel}. Leave unknown values empty.
            </Paragraph>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {MANUAL_MICRONUTRIENTS.map((nutrient) => (
                <label
                  key={nutrient.key}
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <span>{nutrient.label}</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 76px", gap: 6 }}>
                    <input
                      aria-label={`${nutrient.label} micronutrient amount`}
                      type="number"
                      min={0}
                      step="any"
                      value={micronutrients[nutrient.key].value}
                      onChange={(e) => updateMicronutrientValue(nutrient.key, e.target.value)}
                      placeholder="value"
                    />
                    <select
                      aria-label={`${nutrient.label} micronutrient unit`}
                      value={micronutrients[nutrient.key].unit}
                      onChange={(e) => updateMicronutrientUnit(nutrient.key, e.target.value as MicronutrientUnit)}
                    >
                      <option value="µg">µg</option>
                      <option value="mg">mg</option>
                      <option value="g">g</option>
                    </select>
                  </div>
                </label>
              ))}
            </div>
          </details>

          <Space>
            <Button
              type="primary"
              onClick={() => void handleSubmit()}
              loading={isSubmitting}
            >
              {isSubmitting ? "Adding..." : "Add to pantry"}
            </Button>
            <Button
              type="default"
              onClick={clearForm}
              disabled={isSubmitting}
            >
              Clear fields
            </Button>
          </Space>
        </Space>
      </Card>
    </VirtualPantryAppShell>
  );
}
