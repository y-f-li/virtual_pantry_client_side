"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useSessionStorage from "@/hooks/useSessionStorage";
import type { AmountUnit, ConsumptionUnit, PantryItem } from "@/types/pantry";
import type { Product } from "@/types/product";
import type { HouseholdWithRole } from "@/types/household";
import {
  buildPantryItemPayload,
  detectAvailableUnits,
  getDefaultAmount,
  getKcalPer100g,
  getKcalPer100ml,
  getKcalPerServing,
  estimateKcalPerPackage,
  estimateKcalPerPackageFromQuantity,
  getProductCalorieBasisDisplay,
  getProductPackageQuantityUnit,
  hasUsableProductPackageQuantityInfo,
  PACKAGE_QUANTITY_UNAVAILABLE_NOTE,
  shouldShowProductPackageQuantityUnavailableNote,
} from "@/utils/pantry";
import { isStaleHouseholdError, getStaleHouseholdMessage } from "@/utils/householdStale";
import { App, Card, DatePicker, Image } from "antd";
import type { Dayjs } from "dayjs";
import styles from "@/styles/productResultCard.module.css";

type PantryContext = {
  householdId: number;
  householdName?: string;
};

function getPantryTargetLabel(pantryContext: PantryContext): string {
  return pantryContext.householdName?.trim() || `household ${pantryContext.householdId}`;
}

function readPantryContextFromUrl(): PantryContext | undefined {
  if (typeof globalThis.window === "undefined") {
    return undefined;
  }

  const params = new URLSearchParams(globalThis.location.search);
  const householdId = Number(params.get("householdId"));
  if (!Number.isFinite(householdId) || householdId <= 0) {
    return undefined;
  }

  const householdName = params.get("householdName")?.trim();
  return {
    householdId,
    householdName: householdName || undefined,
  };
}


type MicronutrientDescriptor = {
  displayName: string;
  baseKeys: string[];
};

type ReportedNutrient = {
  displayName: string;
  value: unknown;
  unit: string;
  basis: string;
  section: "Core nutrition" | "Micronutrients";
};

const MICRONUTRIENT_DESCRIPTORS: MicronutrientDescriptor[] = [
  { displayName: "Biotin", baseKeys: ["biotin"] },
  { displayName: "Calcium", baseKeys: ["calcium"] },
  { displayName: "Chloride", baseKeys: ["chloride"] },
  { displayName: "Choline", baseKeys: ["choline"] },
  { displayName: "Chromium", baseKeys: ["chromium"] },
  { displayName: "Copper", baseKeys: ["copper"] },
  { displayName: "Fluoride", baseKeys: ["fluoride"] },
  { displayName: "Folate", baseKeys: ["vitamin-b9", "folates"] },
  { displayName: "Iodine", baseKeys: ["iodine"] },
  { displayName: "Iron", baseKeys: ["iron"] },
  { displayName: "Magnesium", baseKeys: ["magnesium"] },
  { displayName: "Manganese", baseKeys: ["manganese"] },
  { displayName: "Molybdenum", baseKeys: ["molybdenum"] },
  { displayName: "Niacin", baseKeys: ["vitamin-pp"] },
  { displayName: "Pantothenic Acid", baseKeys: ["pantothenic-acid"] },
  { displayName: "Phosphorus", baseKeys: ["phosphorus"] },
  { displayName: "Potassium", baseKeys: ["potassium"] },
  { displayName: "Riboflavin", baseKeys: ["vitamin-b2"] },
  { displayName: "Selenium", baseKeys: ["selenium"] },
  { displayName: "Sodium", baseKeys: ["sodium"] },
  { displayName: "Thiamin", baseKeys: ["vitamin-b1"] },
  { displayName: "Vitamin A", baseKeys: ["vitamin-a"] },
  { displayName: "Vitamin B12", baseKeys: ["vitamin-b12"] },
  { displayName: "Vitamin B6", baseKeys: ["vitamin-b6"] },
  { displayName: "Vitamin C", baseKeys: ["vitamin-c"] },
  { displayName: "Vitamin D", baseKeys: ["vitamin-d"] },
  { displayName: "Vitamin E", baseKeys: ["vitamin-e"] },
  { displayName: "Vitamin K", baseKeys: ["vitamin-k", "phylloquinone"] },
  { displayName: "Zinc", baseKeys: ["zinc"] },
];

const NUTRIMENT_SUFFIXES = [
  { suffix: "_100g", basis: "per 100g" },
  { suffix: "_100ml", basis: "per 100ml" },
  { suffix: "_serving", basis: "per serving" },
  { suffix: "_value", basis: "reported value" },
  { suffix: "", basis: "reported value" },
];

const CORE_NUTRIENT_LABELS: Record<string, string> = {
  "energy-kcal": "Energy",
  energy: "Energy",
  protein: "Protein",
  carbohydrates: "Carbohydrates",
  sugars: "Sugars",
  fat: "Fat",
  "saturated-fat": "Saturated fat",
  fiber: "Fiber",
  salt: "Salt",
  sodium: "Sodium",
};

function hasNutrimentValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function trimTrailingFractionZeros(value: string): string {
  if (!value.includes(".")) {
    return value;
  }

  let endIndex = value.length;
  while (endIndex > 0 && value.charAt(endIndex - 1) === "0") {
    endIndex -= 1;
  }

  if (endIndex > 0 && value.charAt(endIndex - 1) === ".") {
    endIndex -= 1;
  }

  return value.slice(0, endIndex);
}

function formatNutrimentValue(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : trimTrailingFractionZeros(value.toPrecision(6));
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return String(value);
}

function readNutrimentUnit(nutriments: Record<string, unknown>, baseKey: string): string {
  const unit = nutriments[`${baseKey}_unit`];
  return typeof unit === "string" && unit.trim() ? unit.trim() : "";
}

function formatNutritionBasis(product: Product): string {
  const basisAmount = product.nutrition?.basisAmount;
  const basisUnit = product.nutrition?.basisUnit?.trim();

  if (typeof basisAmount === "number" && Number.isFinite(basisAmount) && basisUnit) {
    return `per ${formatNutrimentValue(basisAmount)}${basisUnit}`;
  }

  return "reported value";
}

function formatNutrientKey(key: string): string {
  return CORE_NUTRIENT_LABELS[key] ?? key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getLocalDatasetReportedNutrients(product: Product): ReportedNutrient[] {
  const nutrition = product.nutrition;
  if (!nutrition) {
    return [];
  }

  const basis = formatNutritionBasis(product);
  const coreNutrition = nutrition.coreNutrition ?? {};
  const micronutrients = nutrition.micronutrients ?? {};

  const coreRows = Object.entries(coreNutrition)
    .filter(([, nutrient]) => hasNutrimentValue(nutrient?.value))
    .map(([key, nutrient]) => ({
      displayName: formatNutrientKey(key),
      value: nutrient?.value,
      unit: nutrient?.unit?.trim() ?? "",
      basis,
      section: "Core nutrition" as const,
    }));

  const micronutrientRows = Object.entries(micronutrients)
    .filter(([, nutrient]) => hasNutrimentValue(nutrient?.value))
    .map(([key, nutrient]) => ({
      displayName: formatNutrientKey(key),
      value: nutrient?.value,
      unit: nutrient?.unit?.trim() ?? "",
      basis,
      section: "Micronutrients" as const,
    }));

  return [...coreRows, ...micronutrientRows];
}

function getLegacyReportedNutrients(product: Product): ReportedNutrient[] {
  const nutriments = product.nutriments;
  if (!nutriments) {
    return [];
  }

  return MICRONUTRIENT_DESCRIPTORS.flatMap((descriptor) => {
    for (const baseKey of descriptor.baseKeys) {
      for (const { suffix, basis } of NUTRIMENT_SUFFIXES) {
        const key = `${baseKey}${suffix}`;
        const value = nutriments[key];
        if (hasNutrimentValue(value)) {
          return [
            {
              displayName: descriptor.displayName,
              value,
              unit: readNutrimentUnit(nutriments, baseKey),
              basis,
              section: "Micronutrients" as const,
            },
          ];
        }
      }
    }

    return [];
  });
}

function getReportedNutrients(product: Product): ReportedNutrient[] {
  const localDatasetRows = getLocalDatasetReportedNutrients(product);
  return localDatasetRows.length > 0 ? localDatasetRows : getLegacyReportedNutrients(product);
}

export default function ProductResultCard({
  product,
  pantryContext,
}: {
  product: Product;
  label?: string;
  rawTitle: string;
  exportContext: string;
  pantryContext?: PantryContext;
}) {
  const api = useApi();
  const router = useRouter();
  const { message } = App.useApp();
  const { value: households, set: setHouseholds } = useSessionStorage<HouseholdWithRole[]>("households", []);
  const { value: selectedHouseholdId, clear: clearSelectedHouseholdId } = useSessionStorage<number | null>("selectedHouseholdId", null);
  const reportedNutrients = useMemo(() => getReportedNutrients(product), [product]);
  const [nutritionExpanded, setNutritionExpanded] = useState(false);
  const calorieBasisDisplay = useMemo(() => getProductCalorieBasisDisplay(product), [product]);
  const showPackageQuantityNote = useMemo(
    () => shouldShowProductPackageQuantityUnavailableNote(product),
    [product],
  );
  const isLocalDataset = product.dataSource === "local_dataset";
  const isLocalFallback = product.localFallback === true || product.dataSource === "local_csv_fallback" || isLocalDataset;
  const productPackageQuantityUnit = useMemo(() => getProductPackageQuantityUnit(product), [product]);
  const requiresPackageQuantityInput = isLocalDataset && !hasUsableProductPackageQuantityInfo(product);
  const effectivePantryContext = useMemo(
    () => pantryContext ?? readPantryContextFromUrl(),
    [pantryContext],
  );

  // Issue #114 — unit selector: detect which units are available from product data
  const availableUnits = useMemo(() => detectAvailableUnits(product), [product]);
  const VALID_UNITS: ConsumptionUnit[] = availableUnits;
  const [selectedUnit, setSelectedUnit] = useState<ConsumptionUnit>(() => availableUnits[0]);
  const [amount, setAmount] = useState<number>(() => getDefaultAmount(product, availableUnits[0]));
  const [manualKcalPerPackage, setManualKcalPerPackage] = useState<string>(
    () => estimateKcalPerPackage(product)?.toString() ?? "",
  );
  const [manualPackageQuantity, setManualPackageQuantity] = useState<string>("");
  const [manualPackageQuantityUnit, setManualPackageQuantityUnit] = useState<AmountUnit>(
    () => productPackageQuantityUnit ?? "g",
  );
  const [expirationDate, setExpirationDate] = useState<Dayjs | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const defaultUnit = availableUnits[0];
    setSelectedUnit(defaultUnit);
    setAmount(getDefaultAmount(product, defaultUnit));
    setManualKcalPerPackage(estimateKcalPerPackage(product)?.toString() ?? "");
    setManualPackageQuantity("");
    setManualPackageQuantityUnit(productPackageQuantityUnit ?? "g");
    setNutritionExpanded(false);
  }, [availableUnits, product, productPackageQuantityUnit]);

  const manualPackageQuantityValue = Number(manualPackageQuantity);
  const hasValidManualPackageQuantity =
    !requiresPackageQuantityInput ||
    (Number.isFinite(manualPackageQuantityValue) && manualPackageQuantityValue > 0);
  const manualPackageKcalEstimate = requiresPackageQuantityInput
    ? estimateKcalPerPackageFromQuantity(product, manualPackageQuantityValue, manualPackageQuantityUnit)
    : null;

  // Issue #114 — switching unit resets amount to the sensible default for that unit
  // Issue #114 — useCallback prevents unnecessary re-renders if parent memoizes ProductResultCard
  const handleUnitChange = useCallback((unit: ConsumptionUnit) => {
    setSelectedUnit(unit);
    setAmount(getDefaultAmount(product, unit));
    if (unit === "package") {
      setManualKcalPerPackage(estimateKcalPerPackage(product)?.toString() ?? "");
    }
  }, [product]);

  // Issue #114 — real-time calorie estimate shown as user adjusts amount and unit
  const liveKcal = useMemo(() => {
    if (selectedUnit === "package") {
      const perPackage = requiresPackageQuantityInput
        ? manualPackageKcalEstimate
        : parseFloat(manualKcalPerPackage);
      return Number.isFinite(perPackage) && Number(perPackage) > 0
        ? Number((Number(perPackage) * amount).toFixed(1))
        : null;
    }
    if (selectedUnit === "g") {
      const per100g = getKcalPer100g(product);
      return per100g !== null ? Number(((per100g * amount) / 100).toFixed(1)) : null;
    }
    if (selectedUnit === "ml") {
      const per100ml = getKcalPer100ml(product);
      return per100ml !== null ? Number(((per100ml * amount) / 100).toFixed(1)) : null;
    }
    if (selectedUnit === "serving") {
      const perServing = getKcalPerServing(product);
      return perServing !== null ? Number((perServing * amount).toFixed(1)) : null;
    }
    return null;
  }, [product, selectedUnit, amount, manualKcalPerPackage, manualPackageKcalEstimate, requiresPackageQuantityInput]);

  const handleAddToPantry = async (): Promise<void> => {
    if (!effectivePantryContext) {
      message.warning("No pantry target is selected.");
      return;
    }

    const barcode = product.barcode?.trim() ?? "";
    if (!barcode) {
      message.warning("This product does not have a usable barcode.");
      return;
    }

    const productName = product.name?.trim() ?? "";
    if (!productName) {
      message.warning("This product does not have a usable name.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      message.warning("Amount must be greater than zero.");
      return;
    }

    if (requiresPackageQuantityInput && !hasValidManualPackageQuantity) {
      message.warning("Enter how much one package contains before adding this product.");
      return;
    }

    if (requiresPackageQuantityInput
        && productPackageQuantityUnit
        && manualPackageQuantityUnit !== productPackageQuantityUnit) {
      message.warning(`Package quantity unit must match the nutrition basis (${productPackageQuantityUnit}).`);
      return;
    }

    setIsSubmitting(true);

    try {
      const basePayload = buildPantryItemPayload(product, amount, selectedUnit);
      const payload = {
        ...basePayload,
        kcalPerPackage: selectedUnit === "package"
          ? (requiresPackageQuantityInput
              ? manualPackageKcalEstimate
              : (parseFloat(manualKcalPerPackage) || basePayload.kcalPerPackage))
          : basePayload.kcalPerPackage,
        packageQuantity: requiresPackageQuantityInput
          ? manualPackageQuantityValue
          : basePayload.packageQuantity,
        packageQuantityUnit: requiresPackageQuantityInput
          ? manualPackageQuantityUnit
          : basePayload.packageQuantityUnit,
        expirationDate: expirationDate ? expirationDate.format("YYYY-MM-DD") : null,
      };
      await api.post<PantryItem>(
        `/households/${effectivePantryContext.householdId}/pantry`,
        payload,
      );
      message.success(`Item successfully added to ${getPantryTargetLabel(effectivePantryContext)}.`);
    } catch (error) {
      if (isStaleHouseholdError(error)) {
        setHouseholds(households.filter((h) => h.householdId !== effectivePantryContext.householdId));
        if (selectedHouseholdId === effectivePantryContext.householdId) clearSelectedHouseholdId();
        message.warning(getStaleHouseholdMessage(error));
        router.push("/households");
        return;
      }
      message.error(error instanceof Error ? error.message : "Failed to add the product to the pantry.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className={styles.resultCard} styles={{ body: { padding: 24 } }}>
      <div className={styles.resultBody}>
        <div className={styles.imagePanel}>
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name ?? "Product image"}
              preview={false}
              width={260}
              className={styles.image}
            />
          ) : (
            <div className={styles.noImagePlaceholder} aria-label="No product image available">
              No image
            </div>
          )}
        </div>

        <div className={styles.content}>
          <div className={styles.headerBlock}>
            <div className={styles.headerRow}>
              <div className={styles.eyebrow}>Top match</div>
              {isLocalFallback ? (
                <span className={styles.sourceBadge}>From Local Dataset</span>
              ) : (
                <span className={styles.sourceBadgeSecondary}>External product API</span>
              )}
            </div>
            <div className={styles.productName}>{product.name ?? "Unknown product"}</div>
          </div>

          <div className={styles.metaGrid}>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Brand</div>
              <div className={styles.metaValue}>{product.brand?.trim() || "—"}</div>
            </div>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Barcode</div>
              <div className={styles.metaValue}>{product.barcode?.trim() || "—"}</div>
            </div>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Energy basis</div>
              <div className={styles.metaValue}>
                {calorieBasisDisplay ? `${calorieBasisDisplay.value} ${calorieBasisDisplay.label}` : "—"}
              </div>
              {showPackageQuantityNote ? (
                <div className={styles.metaHint}>{PACKAGE_QUANTITY_UNAVAILABLE_NOTE}</div>
              ) : null}
            </div>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>Data source</div>
              <div className={styles.metaValue}>
                {isLocalDataset ? "Local dataset" : isLocalFallback ? "Local fallback" : "External product API"}
              </div>
            </div>
          </div>

          <section className={styles.micronutrientPanel} aria-label="Reported nutrition">
            <button
              type="button"
              className={styles.micronutrientToggle}
              onClick={() => {
                if (reportedNutrients.length > 0) {
                  setNutritionExpanded((current) => !current);
                }
              }}
              aria-expanded={reportedNutrients.length > 0 ? nutritionExpanded : undefined}
              disabled={reportedNutrients.length === 0}
            >
              <span>
                <span className={styles.micronutrientTitle}>Reported nutrition</span>
                <span className={styles.micronutrientSubtext}>
                  Values are shown when reported by the local dataset or the product data source.
                </span>
              </span>
              <span className={styles.micronutrientCount}>
                {reportedNutrients.length > 0
                  ? `${reportedNutrients.length} reported · ${nutritionExpanded ? "Hide details" : "Show details"}`
                  : "Not available"}
              </span>
            </button>

            {reportedNutrients.length === 0 ? (
              <div className={styles.nutritionUnavailable}>
                Nutrition information not available.
              </div>
            ) : nutritionExpanded ? (
              <div className={styles.micronutrientGrid}>
                {reportedNutrients.map((nutrient) => (
                  <div key={`${nutrient.section}-${nutrient.displayName}-${nutrient.basis}`} className={styles.micronutrientCard}>
                    <div className={styles.micronutrientName}>{nutrient.displayName}</div>
                    <div className={styles.micronutrientValue}>
                      {formatNutrimentValue(nutrient.value)}
                      {nutrient.unit ? ` ${nutrient.unit}` : ""}
                    </div>
                    <div className={styles.micronutrientBasis}>{nutrient.section} · {nutrient.basis}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <div className={styles.actionPanel}>
            <div className={styles.actionHeading}>Add this item to pantry</div>
            <div className={styles.actionSubtext}>
              Review the product details, choose an amount, then save the item to the current household pantry.
            </div>

            {/* Issue #114 — unit selector and amount input; unit options appear only when product has nutrition data for that unit */}
            <div className={styles.controls}>
              {availableUnits.length > 1 && (
                <label className={styles.quantityField}>
                  <span className={styles.quantityLabel}>Unit</span>
                  <select
                    value={selectedUnit}
                    onChange={(e) => {
                      const v = e.target.value;
                      if ((VALID_UNITS as string[]).includes(v)) {
                        handleUnitChange(v as ConsumptionUnit);
                      }
                    }}
                    aria-label="Unit"
                    className={styles.quantityInput}
                  >
                    {availableUnits.map((unit) => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </label>
              )}

              <label className={styles.quantityField}>
                <span className={styles.quantityLabel}>
                  Amount ({selectedUnit})
                </span>
                <input
                  aria-label={`Amount in ${selectedUnit}`}
                  type="number"
                  min={0.01}
                  step={0.1}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className={styles.quantityInput}
                />
              </label>

              {requiresPackageQuantityInput ? (
                <label className={styles.quantityField}>
                  <span className={styles.quantityLabel}>One package contains</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      aria-label="Package quantity"
                      type="number"
                      min={0.01}
                      step={0.1}
                      value={manualPackageQuantity}
                      onChange={(e) => setManualPackageQuantity(e.target.value)}
                      placeholder={manualPackageQuantityUnit === "ml" ? "e.g. 500" : "e.g. 400"}
                      className={styles.quantityInput}
                    />
                    <select
                      aria-label="Package quantity unit"
                      value={manualPackageQuantityUnit}
                      onChange={(e) => setManualPackageQuantityUnit(e.target.value as AmountUnit)}
                      className={styles.quantityInput}
                      disabled={Boolean(productPackageQuantityUnit)}
                      style={{ maxWidth: 96 }}
                    >
                      <option value="g">g</option>
                      <option value="ml">ml</option>
                    </select>
                  </div>
                  <span className={styles.metaHint}>
                    Required because the local dataset does not know the package size.
                  </span>
                </label>
              ) : null}

              {selectedUnit === "package" && !isLocalDataset && (
                <label className={styles.quantityField}>
                  <span className={styles.quantityLabel}>Kcal per package (optional)</span>
                  <input
                    aria-label="Kcal per package"
                    type="number"
                    min={0}
                    step={1}
                    value={manualKcalPerPackage}
                    onChange={(e) => setManualKcalPerPackage(e.target.value)}
                    placeholder="Unknown"
                    className={styles.quantityInput}
                  />
                </label>
              )}

              {liveKcal !== null && (
                <div className={styles.metaCard}>
                  <div className={styles.metaLabel}>Estimated kcal</div>
                  <div className={styles.metaValue}>{liveKcal}</div>
                </div>
              )}

              <label className={styles.quantityField}>
                <span className={styles.quantityLabel}>Expiration date (optional)</span>
                <DatePicker
                  value={expirationDate}
                  onChange={setExpirationDate}
                  format="YYYY-MM-DD"
                  placeholder="No expiration date"
                  style={{ width: "100%" }}
                />
              </label>

              <button
                type="button"
                onClick={() => void handleAddToPantry()}
                disabled={isSubmitting || !hasValidManualPackageQuantity}
                className={styles.addButton}
              >
                {isSubmitting ? "Adding..." : "Add to pantry"}
              </button>
            </div>

          </div>
        </div>
      </div>
    </Card>
  );
}
