import type { AmountUnit, ConsumptionUnit, PantryItem, PantryItemCreateRequest } from "@/types/pantry";
import type { LocalDatasetNutrientAmount, Product } from "@/types/product";

type QuantityUnit = "kg" | "g" | "l" | "ml";

type ParsedPackageAmount = {
  amount: number;
  basis: "100g" | "100ml";
};

type ParsedUnitAmount = {
  amount: number;
  unit: QuantityUnit;
};

const UNIT_SUFFIXES: QuantityUnit[] = ["kg", "ml", "g", "l"];

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalizedValue = value.replaceAll(",", ".").trim();
    if (!normalizedValue) {
      return null;
    }

    const parsedValue = Number(normalizedValue);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

function parseUnitAmount(value: string): ParsedUnitAmount | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const detectedUnit = UNIT_SUFFIXES.find((unit) => trimmedValue.endsWith(unit));
  if (!detectedUnit) {
    return null;
  }

  const numericText = trimmedValue.slice(0, -detectedUnit.length).trim();
  const amount = parseNumber(numericText);
  if (amount === null) {
    return null;
  }

  return {
    amount,
    unit: detectedUnit,
  };
}

function normalizeUnit(unit: string | null | undefined): string | null {
  const normalized = unit?.trim().toLowerCase();
  return normalized || null;
}

function toAmountBasis(amount: number, unit: QuantityUnit): ParsedPackageAmount {
  switch (unit) {
    case "kg":
      return { amount: amount * 1000, basis: "100g" };
    case "g":
      return { amount, basis: "100g" };
    case "l":
      return { amount: amount * 1000, basis: "100ml" };
    case "ml":
      return { amount, basis: "100ml" };
  }
}

function parsePackageAmount(quantity: string | null | undefined): ParsedPackageAmount | null {
  if (!quantity) {
    return null;
  }

  const normalizedQuantity = quantity.toLowerCase().replaceAll(",", ".").trim();
  const multiSeparatorIndex = Math.max(
    normalizedQuantity.indexOf("x"),
    normalizedQuantity.indexOf("×"),
  );

  if (multiSeparatorIndex > 0) {
    const packageCountText = normalizedQuantity.slice(0, multiSeparatorIndex).trim();
    const remainingText = normalizedQuantity.slice(multiSeparatorIndex + 1).trim();
    const packageCount = parseNumber(packageCountText);
    const unitAmount = parseUnitAmount(remainingText);

    if (packageCount !== null && unitAmount) {
      return toAmountBasis(packageCount * unitAmount.amount, unitAmount.unit);
    }
  }

  const singleAmount = parseUnitAmount(normalizedQuantity);
  return singleAmount ? toAmountBasis(singleAmount.amount, singleAmount.unit) : null;
}

function packageAmountFromLocalDataset(product: Product): ParsedPackageAmount | null {
  const packageQuantity = parseNumber(product.packageQuantity);
  const packageUnit = normalizeUnit(product.packageQuantityUnit);

  if (packageQuantity !== null && packageQuantity > 0) {
    if (packageUnit === "g" || packageUnit === "kg" || packageUnit === "ml" || packageUnit === "l") {
      return toAmountBasis(packageQuantity, packageUnit);
    }
  }

  return parsePackageAmount(product.productQuantity ?? product.quantity);
}

function isMassUnit(unit: string | null): boolean {
  return unit === "g" || unit === "kg";
}

function isVolumeUnit(unit: string | null): boolean {
  return unit === "ml" || unit === "l";
}

function scaleBasisValueToPer100(value: number, basisAmount: number | null | undefined): number | null {
  const basis = parseNumber(basisAmount ?? 100);
  if (basis === null || basis <= 0) {
    return null;
  }

  return value * (100 / basis);
}

function getLocalCoreNutrient(product: Product, key: string): LocalDatasetNutrientAmount | null {
  return product.nutrition?.coreNutrition?.[key] ?? null;
}

function getLocalCoreNutrientPer100(product: Product, key: string, expectedBasis: "100g" | "100ml"): number | null {
  const nutrient = getLocalCoreNutrient(product, key);
  const value = parseNumber(nutrient?.value);
  if (value === null) {
    return null;
  }

  const basisUnit = normalizeUnit(product.nutrition?.basisUnit);
  const matchesBasis = expectedBasis === "100g" ? isMassUnit(basisUnit) : isVolumeUnit(basisUnit);
  if (!matchesBasis) {
    return null;
  }

  const scaledValue = scaleBasisValueToPer100(value, product.nutrition?.basisAmount);
  return scaledValue !== null ? Number(scaledValue.toFixed(6)) : null;
}

export function estimateKcalPerPackage(product: Product): number | null {
  const localAmountInfo = packageAmountFromLocalDataset(product);

  if (localAmountInfo) {
    const localBaseValue =
      localAmountInfo.basis === "100g"
        ? getLocalCoreNutrientPer100(product, "energy-kcal", "100g")
        : getLocalCoreNutrientPer100(product, "energy-kcal", "100ml");

    if (localBaseValue !== null) {
      const estimatedCalories = (localBaseValue * localAmountInfo.amount) / 100;
      return Number(estimatedCalories.toFixed(2));
    }
  }

  const directCaloriesPerPackage = parseNumber(product.caloriesPerPackage);
  if (directCaloriesPerPackage !== null) {
    return Number(directCaloriesPerPackage.toFixed(2));
  }

  const nutriments = product.nutriments ?? {};
  const legacyAmountInfo = parsePackageAmount(product.quantity);

  if (legacyAmountInfo) {
    const baseValue =
      legacyAmountInfo.basis === "100g"
        ? parseNumber(nutriments["energy-kcal_100g"])
        : parseNumber(nutriments["energy-kcal_100ml"]);

    if (baseValue !== null) {
      const estimatedCalories = (baseValue * legacyAmountInfo.amount) / 100;
      return Number(estimatedCalories.toFixed(2));
    }
  }

  return null;
}


export type CalorieBasisDisplay = {
  value: number;
  basis: "package" | "100g" | "100ml" | "serving";
  label: string;
};

export function formatAmountDisplay(value: number | null | undefined, maximumFractionDigits = 3): string {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) {
    return "0";
  }

  return numericValue.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}


export function getProductPackageQuantityUnit(product: Product): AmountUnit | null {
  const basisUnit = normalizeUnit(product.nutrition?.basisUnit);
  return basisUnit === "g" || basisUnit === "ml" ? basisUnit : null;
}

export function hasUsableProductPackageQuantityInfo(product: Product): boolean {
  const packageQuantity = parseNumber(product.packageQuantity);
  const packageUnit = normalizeUnit(product.packageQuantityUnit);
  const basisUnit = getProductPackageQuantityUnit(product);

  return packageQuantity !== null
    && packageQuantity > 0
    && basisUnit !== null
    && packageUnit === basisUnit;
}

export function estimateKcalPerPackageFromQuantity(
  product: Product,
  packageQuantity: number,
  packageQuantityUnit: AmountUnit | null | undefined,
): number | null {
  if (!Number.isFinite(packageQuantity) || packageQuantity <= 0) {
    return null;
  }

  if (packageQuantityUnit === "g") {
    const per100g = getKcalPer100g(product);
    return per100g !== null ? Number(((per100g * packageQuantity) / 100).toFixed(2)) : null;
  }

  if (packageQuantityUnit === "ml") {
    const per100ml = getKcalPer100ml(product);
    return per100ml !== null ? Number(((per100ml * packageQuantity) / 100).toFixed(2)) : null;
  }

  return null;
}

export function hasUsablePackageQuantityInfo(item: Pick<PantryItem, "packageQuantity" | "packageQuantityUnit">): boolean {
  const packageQuantity = parseNumber(item.packageQuantity);
  const packageUnit = normalizeUnit(item.packageQuantityUnit);
  return packageQuantity !== null
    && packageQuantity > 0
    && (packageUnit === "g" || packageUnit === "kg" || packageUnit === "ml" || packageUnit === "l");
}

export function shouldShowProductPackageQuantityUnavailableNote(product: Product): boolean {
  const basis = getProductCalorieBasisDisplay(product);
  return Boolean(basis) && basis?.basis !== "package";
}

export function shouldShowPackageQuantityUnavailableNote(item: PantryItem): boolean {
  const basis = getPantryItemCalorieBasisDisplay(item);
  return item.amountUnit === "package" && Boolean(basis) && basis?.basis !== "package";
}

export const PACKAGE_QUANTITY_UNAVAILABLE_NOTE =
  "Package quantity unavailable; showing the standardized nutrition basis instead of a package total.";

function positiveDisplayNumber(value: unknown): number | null {
  const parsedValue = parseNumber(value);
  return parsedValue !== null && parsedValue > 0 ? Number(parsedValue.toFixed(2)) : null;
}

export function getProductCalorieBasisDisplay(product: Product): CalorieBasisDisplay | null {
  const perPackage = positiveDisplayNumber(estimateKcalPerPackage(product));
  if (perPackage !== null) {
    return { value: perPackage, basis: "package", label: "kcal / package" };
  }

  const per100g = positiveDisplayNumber(getKcalPer100g(product));
  if (per100g !== null) {
    return { value: per100g, basis: "100g", label: "kcal / 100g" };
  }

  const per100ml = positiveDisplayNumber(getKcalPer100ml(product));
  if (per100ml !== null) {
    return { value: per100ml, basis: "100ml", label: "kcal / 100ml" };
  }

  return null;
}

export function getPantryItemCalorieBasisDisplay(item: PantryItem): CalorieBasisDisplay | null {
  const perPackage = positiveDisplayNumber(item.kcalPerPackage);
  if (perPackage !== null) {
    return { value: perPackage, basis: "package", label: "kcal / package" };
  }

  const per100g = positiveDisplayNumber(item.kcalPer100g);
  if (per100g !== null) {
    return { value: per100g, basis: "100g", label: "kcal / 100g" };
  }

  const per100ml = positiveDisplayNumber(item.kcalPer100ml);
  if (per100ml !== null) {
    return { value: per100ml, basis: "100ml", label: "kcal / 100ml" };
  }

  const perServing = positiveDisplayNumber(item.kcalPerServing);
  if (perServing !== null) {
    return { value: perServing, basis: "serving", label: "kcal / serving" };
  }

  return null;
}

// Issue #95 — "package" or unknown keeps × suffix; g/ml use the unit as suffix
export function formatQuantity(quantity: number, unit: ConsumptionUnit | undefined): string {
  const displayedQuantity = formatAmountDisplay(quantity);
  if (unit === "g" || unit === "ml") return `${displayedQuantity}${unit}`;
  if (unit === "serving") return `${displayedQuantity} serving${quantity === 1 ? "" : "s"}`;
  return `${displayedQuantity}×`;
}

function isLocalDatasetProduct(product: Product): boolean {
  return product.dataSource === "local_dataset";
}

// returns only units that have usable nutrition data for this product; package is always included as fallback
export function detectAvailableUnits(product: Product): ConsumptionUnit[] {
  if (isLocalDatasetProduct(product)) {
    return ["package"];
  }

  const units: ConsumptionUnit[] = ["package"];
  const amountInfo = parsePackageAmount(product.quantity);
  const nutriments = product.nutriments ?? {};

  const has100g = parseNumber(nutriments["energy-kcal_100g"]) !== null;
  const has100ml = parseNumber(nutriments["energy-kcal_100ml"]) !== null;

  // Add serving before g/ml so that g/ml can be unshifted into the first (default) position
  if (getKcalPerServing(product) !== null) {
    units.unshift("serving");
  }

  // Add g when quantity basis is known to be mass, or when no quantity info but 100g data is present
  if ((amountInfo?.basis === "100g" || (amountInfo === null && has100g)) && has100g) {
    units.unshift("g");
  }
  // Add ml when quantity basis is known to be volume, or when no quantity info but 100ml data is present
  if ((amountInfo?.basis === "100ml" || (amountInfo === null && has100ml)) && has100ml) {
    units.unshift("ml");
  }

  return units;
}

// package/serving → 1; g/ml → the parsed package weight/volume so user doesn't have to type it
export function getDefaultAmount(product: Product, unit: ConsumptionUnit): number {
  if (unit === "package" || unit === "serving") return 1;
  const amountInfo = packageAmountFromLocalDataset(product);
  return amountInfo?.amount ?? 1;
}

// Issue #114 — extract per-100g kcal value from either LocalDatasetProductDTO nutrition or legacy nutriments
export function getKcalPer100g(product: Product): number | null {
  return getLocalCoreNutrientPer100(product, "energy-kcal", "100g")
    ?? parseNumber((product.nutriments ?? {})["energy-kcal_100g"]);
}

// Issue #114 — extract per-100ml kcal value from either LocalDatasetProductDTO nutrition or legacy nutriments
export function getKcalPer100ml(product: Product): number | null {
  return getLocalCoreNutrientPer100(product, "energy-kcal", "100ml")
    ?? parseNumber((product.nutriments ?? {})["energy-kcal_100ml"]);
}

export function getKcalPerServing(product: Product): number | null {
  const direct = positiveDisplayNumber(product.caloriesPerServing);
  if (direct !== null) return direct;
  const fromNutriments = parseNumber((product.nutriments ?? {})["energy-kcal_serving"]);
  return fromNutriments !== null && fromNutriments > 0 ? Number(fromNutriments.toFixed(2)) : null;
}

export function buildPantryItemPayload(
  product: Product,
  amount: number,
  unit: ConsumptionUnit,
): PantryItemCreateRequest {
  return {
    productIndex: product.productIndex ?? null,
    barcode: (product.barcode ?? "").trim(),
    name: (product.name ?? "").trim(),
    amount,
    amountUnit: unit,
    kcalPerPackage: estimateKcalPerPackage(product),
    kcalPer100g: getKcalPer100g(product),
    kcalPer100ml: getKcalPer100ml(product),
    kcalPerServing: getKcalPerServing(product),
    packageQuantity: product.packageQuantity ?? null,
    packageQuantityUnit: getProductPackageQuantityUnit(product),
  };
}
