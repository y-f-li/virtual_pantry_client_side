"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  App,
  Alert,
  Button,
  Card,
  Empty,
  Modal,
  Skeleton,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  FireOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useApi } from "@/hooks/useApi";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import useSessionStorage from "@/hooks/useSessionStorage";
import { VirtualPantryAppShell } from "@/components/VirtualPantryAppShell";
import type { HouseholdWithRole } from "@/types/household";
import type { RecipeIngredient, RecipeRecommendation, RecipeCookResponse } from "@/types/recipe";
import styles from "@/styles/recipes.module.css";

const { Title, Paragraph, Text } = Typography;

function formatAmount(value: number, unit: string): string {
  const rounded = Number.isInteger(value) ? value.toString() : Number(value.toFixed(2)).toString();
  return `${rounded} ${unit}`;
}

function formatMacro(value: number): string {
  return `${Math.round(value)}g`;
}

function displayRecipeToken(token: string): string {
  return token
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase() || "RP";
}

function recipeSourceLabel(source?: string): string {
  if (source === "DYNAMIC_PANTRY") return "Pantry generated";
  return "Local recipe";
}

function recipeSourceClass(source?: string): string {
  return source === "DYNAMIC_PANTRY" ? styles.sourceDynamic : styles.sourceLocal;
}

function ingredientStatus(ingredient: RecipeIngredient): "success" | "warning" | "error" {
  if (ingredient.matched && ingredient.enoughAvailable) return "success";
  if (ingredient.matched) return "warning";
  return "error";
}

function ingredientAvailabilityLabel(ingredient: RecipeIngredient): string {
  if (ingredient.matched && ingredient.enoughAvailable) return "available";
  if (ingredient.matched) return "not enough";
  return "missing";
}

function RecipesPageContent() {
  const { isAuthenticated } = useAuthGuard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const api = useApi();
  const { message } = App.useApp();
  const { value: households } = useSessionStorage<HouseholdWithRole[]>("households", []);
  const {
    value: selectedHouseholdId,
    set: setSelectedHouseholdId,
  } = useSessionStorage<number | null>("selectedHouseholdId", null);

  const requestedHouseholdId = Number(searchParams.get("householdId"));
  const activeHousehold = useMemo(() => {
    if (!households.length) return null;
    if (Number.isInteger(requestedHouseholdId) && requestedHouseholdId > 0) {
      return households.find((household) => household.householdId === requestedHouseholdId) ?? null;
    }
    if (selectedHouseholdId !== null) {
      return households.find((household) => household.householdId === selectedHouseholdId) ?? households[0];
    }
    return households[0];
  }, [households, requestedHouseholdId, selectedHouseholdId]);

  const householdName = searchParams.get("name")?.trim() || activeHousehold?.name || "your household";
  const [recipes, setRecipes] = useState<RecipeRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeRecommendation | null>(null);
  const [recipeModalMode, setRecipeModalMode] = useState<"view" | "cook">("view");
  const [cookingRecipeId, setCookingRecipeId] = useState<string | null>(null);
  const [hiddenRecipeIds, setHiddenRecipeIds] = useState<string[]>([]);

  useEffect(() => {
    if (!activeHousehold) return;
    if (selectedHouseholdId === activeHousehold.householdId) return;
    setSelectedHouseholdId(activeHousehold.householdId);
  }, [activeHousehold, selectedHouseholdId, setSelectedHouseholdId]);

  useEffect(() => {
    if (!activeHousehold || typeof window === "undefined") {
      setHiddenRecipeIds([]);
      return;
    }
    try {
      const stored = window.sessionStorage.getItem(`cookedRecipeIds:${activeHousehold.householdId}`);
      setHiddenRecipeIds(stored ? JSON.parse(stored) : []);
    } catch {
      setHiddenRecipeIds([]);
    }
  }, [activeHousehold]);

  const loadRecipes = useCallback(async () => {
    if (!activeHousehold) {
      setLoading(false);
      return;
    }

    setErrorMessage(null);
    try {
      const response = await api.get<RecipeRecommendation[]>(
        `/households/${activeHousehold.householdId}/recipes/recommendations`,
      );
      setRecipes(Array.isArray(response) ? response : []);
    } catch (error) {
      setRecipes([]);
      setErrorMessage(error instanceof Error ? error.message : "Could not load recipe recommendations.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeHousehold, api]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadRecipes();
  }, [isAuthenticated, loadRecipes]);

  const visibleRecipes = useMemo(
    () => recipes.filter((recipe) => !hiddenRecipeIds.includes(recipe.id)),
    [hiddenRecipeIds, recipes],
  );

  const readyCount = visibleRecipes.filter((recipe) => recipe.readyToCook).length;
  const topRecipe = visibleRecipes[0];

  const handleRefresh = () => {
    setRefreshing(true);
    void loadRecipes();
  };

  const openRecipeModal = (recipe: RecipeRecommendation, mode: "view" | "cook") => {
    setRecipeModalMode(mode);
    setSelectedRecipe(recipe);
  };

  const hideCookedRecipe = (recipeId: string) => {
    if (!activeHousehold) return;
    setHiddenRecipeIds((current) => {
      const next = current.includes(recipeId) ? current : [...current, recipeId];
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(`cookedRecipeIds:${activeHousehold.householdId}`, JSON.stringify(next));
      }
      return next;
    });
  };

  const handleCookRecipe = async (recipe: RecipeRecommendation) => {
    if (!activeHousehold) return;
    setCookingRecipeId(recipe.id);
    try {
      const response = await api.post<RecipeCookResponse>(
        `/households/${activeHousehold.householdId}/recipes/${recipe.id}/cook`,
        { servings: recipe.servings },
      );
      message.success(`${response.title} cooked. Pantry updated.`);
      hideCookedRecipe(recipe.id);
      setSelectedRecipe(null);
      setRefreshing(true);
      await loadRecipes();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Could not cook this recipe.");
    } finally {
      setCookingRecipeId(null);
    }
  };

  if (!activeHousehold) {
    return (
      <VirtualPantryAppShell activeNav="recipes">
        <Card className={styles.emptyCard}>
          <Empty
            description="Create or join a household before opening recipe recommendations."
          />
          <Button type="primary" onClick={() => router.push("/households")}>
            Go to Households
          </Button>
        </Card>
      </VirtualPantryAppShell>
    );
  }

  return (
    <VirtualPantryAppShell activeNav="recipes">
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.eyebrow}>Goal-aware cooking</div>
          <Title level={2} className={styles.title}>
            Recipes for {householdName}
          </Title>
          <Paragraph className={styles.subtitle}>
            Recommendations use pantry availability and household health goals to suggest meals,
            explain why they fit, and safely update pantry inventory after cooking.
          </Paragraph>
          <div className={styles.heroStats}>
            <span className={styles.statPill}>
              <ThunderboltOutlined /> {visibleRecipes.length} recommendations
            </span>
            <span className={styles.statPill}>
              <CheckCircleOutlined /> {readyCount} ready to cook
            </span>
            <span className={styles.statPill}>
              <FireOutlined /> {topRecipe ? `${Math.round(topRecipe.caloriesPerServing)} kcal top pick` : "Nutrition aware"}
            </span>
          </div>
        </div>
      </section>

      <div className={styles.toolbar}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Pantry-powered suggestions
          </Title>
          <Text type="secondary">
            Missing ingredients stay visible so you know what needs attention before cooking.
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefresh}>
          Refresh
        </Button>
      </div>

      {errorMessage ? (
        <Alert
          type="error"
          showIcon
          title="Could not load recipes"
          description={errorMessage}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {loading ? (
        <div className={styles.recipeGrid}>
          <Skeleton active />
          <Skeleton active />
        </div>
      ) : visibleRecipes.length === 0 ? (
        <Card className={styles.emptyCard}>
          <Empty description="No recipes are available right now. Add pantry items, or refresh after cooking to discover new suggestions." />
        </Card>
      ) : (
        <div className={styles.recipeGrid}>
          {visibleRecipes.map((recipe) => (
            <Card key={recipe.id} className={styles.recipeCard}>
              <div className={styles.cardTop}>
                <div>
                  <Tag color={recipe.readyToCook ? "green" : "gold"}>
                    {recipe.readyToCook ? "Ready to cook" : `${recipe.missingIngredientCount} missing`}
                  </Tag>
                  <Tag className={recipeSourceClass(recipe.source)}>
                    {recipeSourceLabel(recipe.source)}
                  </Tag>
                  <Title level={4} className={styles.recipeTitle}>
                    {recipe.title}
                  </Title>
                </div>
                <div className={styles.recipeIcon}>{displayRecipeToken(recipe.imageEmoji)}</div>
              </div>

              <Paragraph className={styles.summary}>{recipe.summary}</Paragraph>
              <Text strong>{recipe.healthGoalFit}</Text>

              <div className={styles.metricRow}>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Score</span>
                  <span className={styles.metricValue}>{recipe.matchScore}</span>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Kcal</span>
                  <span className={styles.metricValue}>{Math.round(recipe.caloriesPerServing)}</span>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Protein</span>
                  <span className={styles.metricValue}>{formatMacro(recipe.proteinGrams)}</span>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Serves</span>
                  <span className={styles.metricValue}>{recipe.servings}</span>
                </div>
              </div>

              <div className={styles.matchLine}>
                {recipe.matchedIngredientCount} of {recipe.ingredients.length} ingredients matched from pantry.
              </div>

              <Space size={[6, 6]} wrap>
                {recipe.tags.map((tag) => (
                  <Tag key={tag}>{tag.replaceAll("_", " ")}</Tag>
                ))}
              </Space>

              <div className={styles.actions}>
                <Button onClick={() => openRecipeModal(recipe, "view")}>View recipe</Button>
                <Button
                  type="primary"
                  loading={cookingRecipeId === recipe.id}
                  onClick={() => openRecipeModal(recipe, "cook")}
                >
                  Review & cook
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        title={selectedRecipe?.title}
        open={selectedRecipe !== null}
        onCancel={() => setSelectedRecipe(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedRecipe(null)}>
            Close
          </Button>,
          recipeModalMode === "cook" ? (
            <Button
              key="cook"
              type="primary"
              disabled={!selectedRecipe?.readyToCook}
              loading={selectedRecipe ? cookingRecipeId === selectedRecipe.id : false}
              onClick={() => selectedRecipe && handleCookRecipe(selectedRecipe)}
            >
              Cook this recipe
            </Button>
          ) : null,
        ]}
      >
        {selectedRecipe ? (
          <>
            <Tag className={recipeSourceClass(selectedRecipe.source)}>
              {recipeSourceLabel(selectedRecipe.source)}
            </Tag>
            <Paragraph>{selectedRecipe.recommendationReason}</Paragraph>
            {recipeModalMode === "cook" && !selectedRecipe.readyToCook ? (
              <Alert
                type="warning"
                showIcon
                title="Not ready to cook yet"
                description="Review is still available, but cooking is disabled until all required ingredients are available in the pantry."
                style={{ marginBottom: 16 }}
              />
            ) : null}
            <div className={styles.metricRow}>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Calories</span>
                <span className={styles.metricValue}>{Math.round(selectedRecipe.caloriesPerServing)}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Protein</span>
                <span className={styles.metricValue}>{formatMacro(selectedRecipe.proteinGrams)}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Carbs</span>
                <span className={styles.metricValue}>{formatMacro(selectedRecipe.carbsGrams)}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Fat</span>
                <span className={styles.metricValue}>{formatMacro(selectedRecipe.fatGrams)}</span>
              </div>
            </div>

            {recipeModalMode === "cook" ? (
              <div className={styles.modalSection}>
                <Text strong>Pantry impact</Text>
                <div className={styles.ingredientList}>
                  {selectedRecipe.ingredients.map((ingredient) => (
                    <div key={`${ingredient.name}-${ingredient.unit}`} className={styles.ingredientRow}>
                      <div>
                        <Text>{ingredient.name}</Text>
                        <div className={styles.ingredientMeta}>
                          Needs {formatAmount(ingredient.amount, ingredient.unit)}
                          {ingredient.pantryItemName ? ` from ${ingredient.pantryItemName}` : ""}
                        </div>
                      </div>
                      <Tag color={ingredientStatus(ingredient)}>
                        {ingredientAvailabilityLabel(ingredient)}
                      </Tag>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className={styles.modalSection}>
              <Text strong>Instructions</Text>
              <div className={styles.instructionTimeline}>
                {selectedRecipe.instructions.map((step, index) => (
                  <div key={step} className={styles.instructionStep}>
                    <span className={styles.stepNumber}>{index + 1}</span>
                    <span className={styles.stepText}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </Modal>
    </VirtualPantryAppShell>
  );
}

export default function RecipesPage() {
  return (
    <Suspense fallback={<Skeleton active />}>
      <RecipesPageContent />
    </Suspense>
  );
}
