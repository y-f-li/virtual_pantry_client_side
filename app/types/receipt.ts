import type { Product, ProductSearchResponse } from "@/types/product";

export interface ReceiptLineItem {
  description: string | null;
  quantity: string | null;
  price: string | null;
  totalPrice: string | null;
  productCode: string | null;
  rawItem: Record<string, unknown> | null;
}

export interface ReceiptMatchedItem extends ReceiptLineItem {
  matchStatus: string | null;
  matchSource: string | null;
  matchConfidence?: string | null;
  matchScore?: number | null;
  normalizedDescription?: string | null;
  matchedProduct: Product | null;
  candidateProducts?: ReceiptProductCandidate[] | null;
  productSearch?: ProductSearchResponse | null;
  suggestedPantryItem?: ReceiptPantryItemSuggestion | null;
}

export interface ReceiptPantryItemSuggestion {
  barcode: string | null;
  name: string | null;
  kcalPerPackage: number | null;
  quantity: number | null;
  packageQuantity: string | null;
  nutriments: Record<string, unknown> | null;
  readyForBulkAdd?: boolean | null;
}

export interface ReceiptProductCandidate {
  product: Product | null;
  score: number | null;
  confidence: string | null;
  matchSource: string | null;
  suggestedPantryItem: ReceiptPantryItemSuggestion | null;
}

export interface ReceiptAnalysisResult {
  householdId?: number;
  status: string | null;
  merchantName: string | null;
  merchantPhoneNumber: string | null;
  merchantAddress: string | null;
  transactionDate: string | null;
  transactionTime: string | null;
  subtotal: string | null;
  tax: string | null;
  total: string | null;
  tip: string | null;
  receiptType: string | null;
  currencyCode: string | null;
  countryRegion: string | null;
  rawText: string | null;
  items: ReceiptMatchedItem[] | ReceiptLineItem[] | null;
  extractedFields: Record<string, unknown> | null;
  rawResult: Record<string, unknown> | null;
}

export interface ReceiptUploadSession {
  householdId: number;
  householdName?: string;
  uploadedAt: string;
  result: ReceiptAnalysisResult;
}
