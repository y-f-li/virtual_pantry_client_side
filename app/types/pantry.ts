// Issue #114 — amount unit chosen by the user when adding an item to the pantry
export type AmountUnit = "g" | "ml" | "package";
export type ConsumptionUnit = AmountUnit | "serving";
export type MicronutrientUnit = "µg" | "mg" | "g";

export type ManualMicronutrientKey =
  | "biotin"
  | "calcium"
  | "chloride"
  | "choline"
  | "chromium"
  | "copper"
  | "fluoride"
  | "folate"
  | "iodine"
  | "iron"
  | "magnesium"
  | "manganese"
  | "molybdenum"
  | "niacin"
  | "pantothenicAcid"
  | "phosphorus"
  | "potassium"
  | "riboflavin"
  | "selenium"
  | "sodium"
  | "thiamin"
  | "vitaminA"
  | "vitaminB12"
  | "vitaminB6"
  | "vitaminC"
  | "vitaminD"
  | "vitaminE"
  | "vitaminK"
  | "zinc";

export interface PantryItemMicronutrientCreateRequest {
  value: number;
  unit: MicronutrientUnit;
}

export interface PantryItemCreateRequest {
  productIndex?: number | null;
  barcode: string;
  name: string;
  amount: number;
  amountUnit: ConsumptionUnit;
  kcalPerPackage?: number | null;
  kcalPer100g?: number | null;
  kcalPer100ml?: number | null;
  kcalPerServing?: number | null;
  packageQuantity?: number | string | null;
  packageQuantityUnit?: AmountUnit | null;
  manualEntry?: boolean;
  expirationDate?: string | null;
  micronutrients?: Partial<Record<ManualMicronutrientKey, PantryItemMicronutrientCreateRequest>>;
}

export interface PantryItem {
  id: number;
  householdId: number;
  barcode: string | null;
  name: string;
  amount: number;
  initialAmount?: number;
  amountUnit: ConsumptionUnit;
  kcalPerPackage?: number | null;
  kcalPer100g?: number | null;
  kcalPer100ml?: number | null;
  kcalPerServing?: number | null;
  nutritionBasisAmount?: number | null;
  nutritionBasisUnit?: AmountUnit | null;
  packageQuantity?: number | null;
  packageQuantityUnit?: AmountUnit | null;
  servingQuantity?: number | null;
  servingQuantityUnit?: AmountUnit | null;
  availableConsumptionUnits?: ConsumptionUnit[] | null;
  expirationDate?: string | null;
  addedAt: string;
}

export interface PantryOverview {
  items: PantryItem[];
  totalCalories: number;
}

export interface ConsumePantryItemResponse {
  itemId: number;
  // Issue #133 — remainingAmount (Double) replaces remainingCount (Integer)
  remainingAmount: number;
  consumedCalories: number | null;
  removed: boolean;
}

export interface PortionEstimateResponse {
  status: "ESTIMATED" | "MANUAL_FALLBACK";
  message: string;
  suggestedMinAmount: number | null;
  suggestedMaxAmount: number | null;
  suggestedAmount?: number | null;
  estimatedRange?: string | null;
  unit: AmountUnit | null;
}

export interface RecognizedFood {
  name: string;
  kcalPer100g?: number | null;
  kcalPerServing?: number | null;
  suggestedAmount?: number | null;
  unit?: ConsumptionUnit | null;
  confidence?: number | null;
}

export interface FoodRecognitionResponse {
  status: "RECOGNIZED" | "MANUAL_FALLBACK";
  detectedFoods: string[];
  recognizedFoods?: RecognizedFood[];
  message: string;
}
