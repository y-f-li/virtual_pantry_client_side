"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Button, Card, Empty, Progress, Space, Spin, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";

import { VirtualPantryAppShell } from "@/components/VirtualPantryAppShell";
import { useApi } from "@/hooks/useApi";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import type { ApplicationError } from "@/types/error";
import statsStyles from "@/styles/stats.module.css";

const { Title, Paragraph, Text } = Typography;

type LifeStageGroup = "CHILD" | "MALE" | "FEMALE" | "PREGNANT" | "BREASTFEEDING";
type NumericValue = number | string | null | undefined;

interface UserPersonalProfileGetDTO {
  id: number;
  userId: number;
  birthDate: string;
  lifeStageGroup: LifeStageGroup | null;
}

interface MicronutrientRequirementGetDTO {
  displayName: string;
  unit: string | null;
  rdaValue: NumericValue;
  aiValue: NumericValue;
  ulValue?: NumericValue;
  upperLimitValue?: NumericValue;
}

interface DailyNutrientIntakeGetDTO {
  id?: number | null;
  userId?: number | null;
  intakeDate?: string | null;
  biotin?: NumericValue;
  calcium?: NumericValue;
  chloride?: NumericValue;
  choline?: NumericValue;
  chromium?: NumericValue;
  copper?: NumericValue;
  fluoride?: NumericValue;
  folate?: NumericValue;
  iodine?: NumericValue;
  iron?: NumericValue;
  magnesium?: NumericValue;
  manganese?: NumericValue;
  molybdenum?: NumericValue;
  niacin?: NumericValue;
  pantothenicAcid?: NumericValue;
  phosphorus?: NumericValue;
  potassium?: NumericValue;
  riboflavin?: NumericValue;
  selenium?: NumericValue;
  sodium?: NumericValue;
  thiamin?: NumericValue;
  vitaminA?: NumericValue;
  vitaminB12?: NumericValue;
  vitaminB6?: NumericValue;
  vitaminC?: NumericValue;
  vitaminD?: NumericValue;
  vitaminE?: NumericValue;
  vitaminK?: NumericValue;
  zinc?: NumericValue;
}

const NUTRIENT_INTAKE_FIELD_BY_DISPLAY_NAME: Record<string, keyof DailyNutrientIntakeGetDTO> = {
  Biotin: "biotin",
  Calcium: "calcium",
  Chloride: "chloride",
  Choline: "choline",
  Chromium: "chromium",
  Copper: "copper",
  Fluoride: "fluoride",
  Folate: "folate",
  Iodine: "iodine",
  Iron: "iron",
  Magnesium: "magnesium",
  Manganese: "manganese",
  Molybdenum: "molybdenum",
  Niacin: "niacin",
  "Pantothenic Acid": "pantothenicAcid",
  Phosphorus: "phosphorus",
  Potassium: "potassium",
  Riboflavin: "riboflavin",
  Selenium: "selenium",
  Sodium: "sodium",
  Thiamin: "thiamin",
  "Vitamin A": "vitaminA",
  "Vitamin B12": "vitaminB12",
  "Vitamin B6": "vitaminB6",
  "Vitamin C": "vitaminC",
  "Vitamin D": "vitaminD",
  "Vitamin E": "vitaminE",
  "Vitamin K": "vitaminK",
  Zinc: "zinc",
};

function getLifeStageLabel(lifeStageGroup: LifeStageGroup): string {
  switch (lifeStageGroup) {
    case "CHILD":
      return "Child";
    case "MALE":
      return "Male";
    case "FEMALE":
      return "Female";
    case "PREGNANT":
      return "Pregnant";
    case "BREASTFEEDING":
      return "Breastfeeding";
  }
}

function toNumber(value: NumericValue): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatNullableValue(value: NumericValue): string {
  const numericValue = toNumber(value);

  if (numericValue !== null) {
    return numericValue.toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  }

  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  return "—";
}

function getRequirementTarget(requirement: MicronutrientRequirementGetDTO): {
  value: number | null;
  referenceType: "RDA" | "AI" | null;
} {
  const rdaValue = toNumber(requirement.rdaValue);
  if (rdaValue !== null && rdaValue > 0) {
    return { value: rdaValue, referenceType: "RDA" };
  }

  const aiValue = toNumber(requirement.aiValue);
  if (aiValue !== null && aiValue > 0) {
    return { value: aiValue, referenceType: "AI" };
  }

  return { value: null, referenceType: null };
}

function getUpperLimitValue(requirement: MicronutrientRequirementGetDTO): number | null {
  const upperLimitValue = toNumber(requirement.upperLimitValue);
  if (upperLimitValue !== null && upperLimitValue > 0) {
    return upperLimitValue;
  }

  const ulValue = toNumber(requirement.ulValue);
  if (ulValue !== null && ulValue > 0) {
    return ulValue;
  }

  return null;
}

type ProgressTone = "active" | "success" | "exception" | "normal";

function calculateProgressState(
  consumedValue: number,
  targetValue: number | null,
  upperLimitValue: number | null,
): {
  targetPercentage: number | null;
  cappedPercentage: number;
  status: ProgressTone;
  stateLabel: string;
} {
  if (!targetValue) {
    return {
      targetPercentage: null,
      cappedPercentage: 0,
      status: "normal",
      stateLabel: "No RDA or AI target",
    };
  }

  const targetPercentage = (consumedValue / targetValue) * 100;

  if (upperLimitValue !== null && upperLimitValue > targetValue) {
    if (consumedValue <= targetValue) {
      const barPercentage = (consumedValue / targetValue) * 75;
      return {
        targetPercentage,
        cappedPercentage: Math.min(Math.max(barPercentage, 0), 75),
        status: "active",
        stateLabel: "Below sufficient intake",
      };
    }

    if (consumedValue <= upperLimitValue) {
      const barPercentage = 75 + ((consumedValue - targetValue) / (upperLimitValue - targetValue)) * 25;
      return {
        targetPercentage,
        cappedPercentage: Math.min(Math.max(barPercentage, 75), 100),
        status: "success",
        stateLabel: "Sufficient intake reached",
      };
    }

    return {
      targetPercentage,
      cappedPercentage: 100,
      status: "exception",
      stateLabel: "Above upper limit",
    };
  }

  const barPercentage = (consumedValue / targetValue) * 75;
  return {
    targetPercentage,
    cappedPercentage: Math.min(Math.max(barPercentage, 0), 100),
    status: consumedValue >= targetValue ? "success" : "active",
    stateLabel: consumedValue >= targetValue ? "Sufficient intake reached" : "Below sufficient intake",
  };
}

const NutritionReferencePage: React.FC = () => {
  const { isAuthenticated } = useAuthGuard();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const api = useApi();

  const userId = params.id;

  const [loading, setLoading] = useState(false);
  const [profileMissing, setProfileMissing] = useState(false);
  const [profile, setProfile] = useState<UserPersonalProfileGetDTO | null>(null);
  const [requirements, setRequirements] = useState<MicronutrientRequirementGetDTO[]>([]);
  const [dailyIntake, setDailyIntake] = useState<DailyNutrientIntakeGetDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      return;
    }

    let cancelled = false;

    const loadNutritionProgress = async () => {
      setLoading(true);
      setError(null);
      setProfileMissing(false);
      setRequirements([]);
      setDailyIntake(null);

      try {
        const loadedProfile = await api.get<UserPersonalProfileGetDTO>(
          `/users/${userId}/personal-profile`,
        );

        if (cancelled) {
          return;
        }

        setProfile(loadedProfile);

        if (!loadedProfile.lifeStageGroup) {
          return;
        }

        const [loadedRequirements, loadedDailyIntake] = await Promise.all([
          api.get<MicronutrientRequirementGetDTO[]>(
            `/users/${userId}/micronutrient-requirements`,
          ),
          api.get<DailyNutrientIntakeGetDTO>(`/users/${userId}/daily-nutrient-intake`),
        ]);

        if (cancelled) {
          return;
        }

        setRequirements(Array.isArray(loadedRequirements) ? loadedRequirements : []);
        setDailyIntake(loadedDailyIntake ?? null);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        const status = (loadError as ApplicationError).status;

        if (status === 404) {
          setProfile(null);
          setProfileMissing(true);
          setRequirements([]);
          setDailyIntake(null);
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load micronutrient progress.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadNutritionProgress();

    return () => {
      cancelled = true;
    };
  }, [api, isAuthenticated, userId]);

  const progressRows = useMemo(
    () =>
      requirements.map((requirement) => {
        const intakeField = NUTRIENT_INTAKE_FIELD_BY_DISPLAY_NAME[requirement.displayName];
        const consumedValue = intakeField && dailyIntake ? toNumber(dailyIntake[intakeField]) ?? 0 : 0;
        const target = getRequirementTarget(requirement);
        const rawUpperLimitValue = getUpperLimitValue(requirement);
        const upperLimitValue =
          target.value !== null && rawUpperLimitValue !== null && rawUpperLimitValue > target.value
            ? rawUpperLimitValue
            : null;
        const progressState = calculateProgressState(consumedValue, target.value, upperLimitValue);

        return {
          requirement,
          consumedValue,
          targetValue: target.value,
          referenceType: target.referenceType,
          upperLimitValue,
          progressState,
        };
      }),
    [dailyIntake, requirements],
  );

  const emptyDescription = profileMissing
    ? "No personal profile found. Save birth date and life stage details before viewing micronutrient progress."
    : "No micronutrient progress is available for this profile yet.";

  return (
    <VirtualPantryAppShell activeNav="dashboard">
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()}>
            Back
          </Button>
          <Button onClick={() => router.push(`/users/${userId}/details/edit`)}>
            Edit personal profile
          </Button>
        </Space>

        <div className={statsStyles.pageHeader}>
          <Title level={2} className={statsStyles.pageTitle}>
            Daily Micronutrient Progress
          </Title>
          <Paragraph className={statsStyles.pageSubtitle}>
            Today&apos;s consumed micronutrients compared with the user&apos;s RDA/AI sufficiency target and upper limit where available.
          </Paragraph>
        </div>

        <Card
          className={statsStyles.panelCard}
          title="Micronutrient intake progress"
          variant="borderless"
        >
          {loading ? (
            <Spin />
          ) : (
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              {error && <Alert type="error" message={error} showIcon />}

              {profile?.lifeStageGroup && (
                <Text type="secondary">
                  Showing daily progress for {getLifeStageLabel(profile.lifeStageGroup)}
                  {dailyIntake?.intakeDate ? ` on ${dailyIntake.intakeDate}` : " today"}.
                </Text>
              )}

              {progressRows.length > 0 && (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Progress bars: sufficient intake is marked at 75%; when a valid upper limit exists, it is marked at 100%.
                </Text>
              )}

              {progressRows.length > 0 ? (
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  {progressRows.map(({
                    requirement,
                    consumedValue,
                    targetValue,
                    referenceType,
                    upperLimitValue,
                    progressState,
                  }) => {
                    const unit = requirement.unit ?? "µg";

                    return (
                      <Card
                        key={requirement.displayName}
                        size="small"
                        variant="borderless"
                        style={{ background: "rgba(15, 23, 42, 0.03)" }}
                      >
                        <Space direction="vertical" size="small" style={{ width: "100%" }}>
                          <Space
                            align="baseline"
                            style={{ width: "100%", justifyContent: "space-between" }}
                          >
                            <Text strong>{requirement.displayName}</Text>
                            <Text type="secondary">
                              {progressState.targetPercentage === null
                                ? "No target"
                                : `${progressState.targetPercentage.toFixed(1)}% of ${referenceType ?? "target"}`}
                            </Text>
                          </Space>

                          <div style={{ position: "relative", paddingBottom: 24 }}>
                            <Progress
                              percent={progressState.cappedPercentage}
                              showInfo={false}
                              status={progressState.status}
                            />

                            {targetValue && (
                              <>
                                <span
                                  aria-hidden="true"
                                  style={{
                                    position: "absolute",
                                    left: "75%",
                                    top: 3,
                                    width: 2,
                                    height: 22,
                                    background: "rgba(15, 23, 42, 0.55)",
                                    transform: "translateX(-1px)",
                                  }}
                                />
                                <Text
                                  type="secondary"
                                  style={{
                                    position: "absolute",
                                    left: "75%",
                                    bottom: 0,
                                    transform: "translateX(-50%)",
                                    fontSize: 12,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Sufficient
                                </Text>
                                {upperLimitValue && (
                                  <Text
                                    type="secondary"
                                    style={{
                                      position: "absolute",
                                      right: 0,
                                      bottom: 0,
                                      fontSize: 12,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    Upper limit
                                  </Text>
                                )}
                              </>
                            )}
                          </div>

                          <Space direction="vertical" size={0}>
                            <Text type="secondary">
                              {formatNullableValue(consumedValue)} {unit} consumed
                              {targetValue
                                ? ` / ${formatNullableValue(targetValue)} ${unit} ${referenceType ?? "target"} sufficiency target`
                                : " / no RDA or AI target available"}
                            </Text>
                            <Text type="secondary">
                              Upper limit: {upperLimitValue ? `${formatNullableValue(upperLimitValue)} ${unit}` : "not specified"}
                            </Text>
                            <Text type={progressState.status === "exception" ? "danger" : "secondary"}>
                              {progressState.stateLabel}
                            </Text>
                          </Space>
                        </Space>
                      </Card>
                    );
                  })}
                </Space>
              ) : (
                <Empty description={emptyDescription} />
              )}
            </Space>
          )}
        </Card>
      </Space>
    </VirtualPantryAppShell>
  );
};

export default NutritionReferencePage;
