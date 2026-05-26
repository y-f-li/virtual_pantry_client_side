export interface HouseholdBudget {
  budgetId: number;
  householdId: number;
  dailyCalorieTarget: number;
  updatedAt?: string | null;
}
