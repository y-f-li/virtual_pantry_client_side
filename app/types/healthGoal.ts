export type GoalType = "LOSE_WEIGHT" | "MAINTAIN" | "GAIN_MUSCLE";
export type Sex = "MALE" | "FEMALE" | "OTHER";
export type ActivityLevel = "SEDENTARY" | "LIGHT" | "MODERATE" | "ACTIVE" | "VERY_ACTIVE";

export interface HealthGoal {
  goalId: number;
  userId: number;
  goalType: GoalType;
  targetRate: number | null;
  // targetWeight and weeksToGoal are stored so the form can be restored on reload
  targetWeight: number | null;
  weeksToGoal: number | null;
  age: number;
  sex: Sex;
  height: number;
  weight: number;
  activityLevel: ActivityLevel;
  recommendedDailyCalories: number;
  updatedAt: string;
}

export interface HealthGoalPutRequest {
  goalType: GoalType;
  // targetWeight and weeksToGoal replace targetRate — the backend derives targetRate from them
  targetWeight?: number | null;
  weeksToGoal?: number | null;
  age: number;
  sex: Sex;
  height: number;
  weight: number;
  activityLevel: ActivityLevel;
}
