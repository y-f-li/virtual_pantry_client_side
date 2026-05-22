import type { AmountUnit } from "@/types/pantry";

export interface RecipeIngredient {
  name: string;
  amount: number;
  unit: AmountUnit;
  matched: boolean;
  pantryItemId: number | null;
  pantryItemName: string | null;
  availableAmount: number | null;
  pantryUnit: AmountUnit | null;
  enoughAvailable: boolean;
}

export interface RecipeRecommendation {
  id: string;
  title: string;
  summary: string;
  imageEmoji: string;
  source?: "LOCAL_CATALOG" | "DYNAMIC_PANTRY" | string;
  servings: number;
  readyToCook: boolean;
  matchScore: number;
  matchedIngredientCount: number;
  missingIngredientCount: number;
  healthGoalFit: string;
  recommendationReason: string;
  caloriesPerServing: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  tags: string[];
  instructions: string[];
  ingredients: RecipeIngredient[];
  missingIngredients: string[];
}

export interface RecipeCookResponse {
  recipeId: string;
  title: string;
  servingsCooked: number;
  consumedCalories: number;
  consumedIngredients: RecipeIngredient[];
}
