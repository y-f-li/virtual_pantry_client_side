export type LocalDatasetNutrientAmount = {
  value: number | null;
  unit: string | null;
};

export type LocalDatasetNutrition = {
  basisAmount: number | null;
  basisUnit: string | null;
  coreNutrition: Record<string, LocalDatasetNutrientAmount> | null;
  micronutrients: Record<string, LocalDatasetNutrientAmount> | null;
};

export type LocalDatasetConsumptionOption = {
  type: string | null;
  label: string | null;
  unit: string | null;
};

export interface Product {
  barcode: string | null;
  name: string | null;
  brand: string | null;

  // Legacy Open Food Facts/ProductDTO fields. These remain optional so older flows
  // and receipt matching can still render while barcode lookup returns LocalDatasetProductDTO.
  quantity?: string | null;
  servingSize?: string | null;
  productUrl?: string | null;
  nutriScore?: string | null;
  localFallback?: boolean | null;
  caloriesPerPackage?: number | null;
  caloriesPerServing?: number | null;
  stores?: string[] | null;
  storeTags?: string[] | null;
  purchasePlaces?: string[] | null;
  nutriments?: Record<string, unknown> | null;
  nutriScoreData?: Record<string, unknown> | null;
  rawProduct?: Record<string, unknown> | null;

  // LocalDatasetProductDTO fields returned by the backend's local lookup route.
  productIndex?: number | null;
  imageUrl?: string | null;
  productQuantity?: string | null;
  productQuantityUnit?: string | null;
  packageQuantity?: number | null;
  packageQuantityUnit?: string | null;
  servingQuantity?: number | null;
  servingQuantityUnit?: string | null;
  nutrition?: LocalDatasetNutrition | null;
  consumptionOptions?: LocalDatasetConsumptionOption[] | null;
  dataSource?: string | null;
}


export type ProductSearchCandidate = {
  productIndex: number | null;
  barcode: string | null;
  name: string | null;
  brand: string | null;
  quantity: string | null;
  score: number | null;
};

export type ProductSearchResponse = {
  query: string | null;
  normalizedQuery: string | null;
  status: "OK" | "TOO_MANY_MATCHES" | "TOO_BROAD" | "NO_MATCH" | "NOT_ENOUGH_INFORMATION" | string | null;
  message: string | null;
  totalCandidateCount: number | null;
  anchorTokens: string[] | null;
  auxiliaryTokens: string[] | null;
  candidates: ProductSearchCandidate[] | null;
};
