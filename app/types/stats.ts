export interface DailyBreakdownEntry {
  date: string;
  caloriesConsumed: number;
}

export interface BudgetComparison {
  status: "OVER_BUDGET" | "UNDER_BUDGET" | "ON_TARGET";
  differenceFromTarget: number;
  percentageOfTarget: number;
}

// Issue #121 — per-member calorie summary within the stats response
export interface MemberCalorieEntry {
  userId: number;
  username: string;
  totalCalories: number;
  averageDailyCalories: number;
}

export interface HouseholdStats {
  startDate: string;
  endDate: string;
  dailyCalorieTarget: number | null;
  averageDailyCalories: number;
  totalCaloriesConsumed: number;
  dailyBreakdown: DailyBreakdownEntry[];
  comparisonToBudget: BudgetComparison | null;
  memberBreakdown?: MemberCalorieEntry[];  // Issue #121
  myDailyBreakdown?: DailyBreakdownEntry[];  // Issue #124 — requesting user's per-day data
}