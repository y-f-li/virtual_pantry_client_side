import type { ConsumptionUnit } from "@/types/pantry";

/** GET /households/{householdId}/consumption-logs */
export interface ConsumptionLogEntry {
  logId: number;
  consumedAt: string;
  pantryItemId: number;
  productName: string;
  consumedQuantity: number;
  /** Issue #95 — unit stored alongside quantity so activity feed can display "200g" instead of "200×" */
  consumedUnit?: ConsumptionUnit;
  consumedCalories: number | null;
  userId: number;
  /** Added in the `feature/consumption-log-include-username` server change. Optional for backwards-compat. */
  username?: string;
}
