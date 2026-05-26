export type PantryEventType = "ITEM_ADDED" | "ITEM_CONSUMED" | "ITEM_REMOVED" | "BULK_ITEMS_ADDED" | "BUDGET_UPDATED" | "HOUSEHOLD_DELETED" | "MEMBER_REMOVED";

export interface PantryItemPayload {
  itemId: number;
  productName: string;
  barcode: string;
  quantity: number;
  unit: string;
  caloriesPerUnit: number;
  addedByUserId: number;
  addedAt: string;
}

export interface PantryUpdateMessage {
  eventType: PantryEventType;
  householdId: number;
  triggeredByUserId: number;
  triggeredByUsername: string;
  timestamp: string;
  item: PantryItemPayload;
  newTotalCalories: number;
  removedUserId?: number;
}
