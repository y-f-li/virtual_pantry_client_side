export interface PantryItem {
  id: number;
  barcode: string | null;
  name: string;
  brand: string | null;
  kcalPer100: number | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  kcalPerPackage: number | null;
  count: number;
  createdAt: string;

  consumedAt?: string | null;
  lastConsumedAt?: string | null;
}

export interface PantryStats {
  fromDate: string;
  days: number;
  totalCaloriesOwned: number;
  totalCaloriesConsumed: number;
  avgDailyCaloriesConsumed: number;
  idealDailyKcal: number | null;
  avgMinusIdeal: number | null;
  unknownKcalEvents: number;
}

export interface PantryBudgetPutDTO {
  idealDailyKcal: number;
}
