"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  InputNumber,
  Select,
  Space,
  Spin,
  Typography,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useParams, useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useSessionStorage from "@/hooks/useSessionStorage";
import { VirtualPantryAppShell } from "@/components/VirtualPantryAppShell";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import type { HealthGoal, HealthGoalPutRequest } from "@/types/healthGoal";
import type { ApplicationError } from "@/types/error";

const { Title, Text } = Typography;
const { Option } = Select;

const FOREST = "#1b5e20";

function ageMaxRate(age: number | undefined): number {
  if (age == null) return 0.75;
  if (age < 13) return 0.25;
  if (age < 18) return 0.5;
  if (age < 65) return 0.75;
  return 0.5;
}

interface FormValues {
  age: number;
  sex: string;
  height: number;
  weight: number;
  activityLevel: string;
  goalType: string;
  targetWeight?: number;
  weeksToGoal?: number;
}

export default function HealthGoalPage() {
  useAuthGuard();
  const api = useApi();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();

  const { value: storedUserId } = useSessionStorage<string>("userId", "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recommendation, setRecommendation] = useState<number | null>(null);
  const [goalType, setGoalType] = useState<string>("MAINTAIN");

  const watchedWeight = Form.useWatch("weight", form) as number | undefined;
  const watchedTargetWeight = Form.useWatch("targetWeight", form) as number | undefined;
  const watchedWeeks = Form.useWatch("weeksToGoal", form) as number | undefined;
  const watchedAge = Form.useWatch("age", form) as number | undefined;

  const computedRate =
    goalType === "LOSE_WEIGHT" &&
    watchedWeight != null &&
    watchedTargetWeight != null &&
    watchedWeeks != null &&
    watchedWeeks > 0
      ? (watchedWeight - watchedTargetWeight) / watchedWeeks
      : null;

  const urlId = params.id;

  useEffect(() => {
    if (storedUserId && storedUserId !== urlId) {
      router.replace("/login");
    }
  }, [storedUserId, urlId, router]);

  useEffect(() => {
    const load = async () => {
      try {
        const goal = await api.get<HealthGoal>(`/users/${urlId}/health-goal`);
        form.setFieldsValue({
          age: goal.age,
          sex: goal.sex,
          height: goal.height,
          weight: goal.weight,
          activityLevel: goal.activityLevel,
          goalType: goal.goalType,
          // Restore loss-specific fields now that they are persisted on the backend
          targetWeight: goal.targetWeight ?? undefined,
          weeksToGoal: goal.weeksToGoal ?? undefined,
        });
        setGoalType(goal.goalType);
        setRecommendation(goal.recommendedDailyCalories);
      } catch (error) {
        if ((error as ApplicationError).status !== 404) {
          message.error(error instanceof Error ? error.message : "Failed to load health goal.");
        }
      } finally {
        setLoading(false);
      }
    };
    if (urlId) void load();
  }, [api, urlId, form]);

  const handleReset = () => {
    form.resetFields();
    setGoalType("MAINTAIN");
    setRecommendation(null);
  };

  const handleSave = async (values: FormValues) => {
    setSaving(true);
    try {
      // Send targetWeight and weeksToGoal directly — backend derives targetRate
      const body: HealthGoalPutRequest = {
        goalType: values.goalType as HealthGoalPutRequest["goalType"],
        age: values.age,
        sex: values.sex as HealthGoalPutRequest["sex"],
        height: values.height,
        weight: values.weight,
        activityLevel: values.activityLevel as HealthGoalPutRequest["activityLevel"],
        targetWeight: values.goalType === "LOSE_WEIGHT" ? (values.targetWeight ?? null) : null,
        weeksToGoal: values.goalType === "LOSE_WEIGHT" ? (values.weeksToGoal ?? null) : null,
      };
      const saved = await api.put<HealthGoal>(`/users/${urlId}/health-goal`, body);
      setRecommendation(saved.recommendedDailyCalories);
      message.success("Health goal saved.");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Could not save health goal.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <VirtualPantryAppShell activeNav="dashboard">
        <Spin size="large" style={{ display: "block", marginTop: 80 }} />
      </VirtualPantryAppShell>
    );
  }

  return (
    <VirtualPantryAppShell activeNav="dashboard">
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()}>
          Back
        </Button>
      </Space>
      <Title level={2} style={{ color: "#182418" }}>
        Health Goal
      </Title>

      <Card variant="borderless" style={{ maxWidth: 520 }}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Form.Item
              name="age"
              label="Age"
              rules={[{ required: true, message: "Required" }]}
            >
              <InputNumber max={120} style={{ width: "100%" }} suffix="yrs" />
            </Form.Item>
            <Form.Item
              name="sex"
              label="Sex"
              rules={[{ required: true, message: "Required" }]}
            >
              <Select placeholder="Select">
                <Option value="FEMALE">Female</Option>
                <Option value="MALE">Male</Option>
                <Option value="OTHER">Other</Option>
              </Select>
            </Form.Item>
            <Form.Item
              name="height"
              label="Height (cm)"
              rules={[{ required: true, message: "Required" }]}
            >
              <InputNumber min={50} max={300} style={{ width: "100%" }} suffix="cm" />
            </Form.Item>
            <Form.Item
              name="weight"
              label="Weight (kg)"
              rules={[{ required: true, message: "Required" }]}
            >
              <InputNumber min={20} max={500} style={{ width: "100%" }} suffix="kg" />
            </Form.Item>
          </div>

          <Form.Item
            name="activityLevel"
            label="Activity Level"
            rules={[{ required: true, message: "Required" }]}
          >
            <Select placeholder="Select activity level">
              <Option value="SEDENTARY">Sedentary (little or no exercise)</Option>
              <Option value="LIGHT">Lightly active (1–3 days/week)</Option>
              <Option value="MODERATE">Moderately active (3–5 days/week)</Option>
              <Option value="ACTIVE">Active (6–7 days/week)</Option>
              <Option value="VERY_ACTIVE">Very active (hard exercise daily)</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="goalType"
            label="Goal"
            rules={[{ required: true, message: "Required" }]}
          >
            <Select placeholder="Select goal" onChange={(v: string) => setGoalType(v)}>
              <Option value="LOSE_WEIGHT">Lose weight</Option>
              <Option value="MAINTAIN">Maintain weight</Option>
              <Option value="GAIN_MUSCLE">Gain muscle</Option>
            </Select>
          </Form.Item>

          {goalType === "LOSE_WEIGHT" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                <Form.Item
                  name="targetWeight"
                  label="Target weight (kg)"
                  dependencies={["weight"]}
                  rules={[
                    { required: true, message: "Required" },
                    ({ getFieldValue }) => ({
                      validator(_, value: number | null | undefined) {
                        const current = getFieldValue("weight") as number | undefined;
                        if (value == null || current == null) return Promise.resolve();
                        if (value >= current) {
                          return Promise.reject(new Error("Must be less than current weight"));
                        }
                        return Promise.resolve();
                      },
                    }),
                  ]}
                >
                  <InputNumber min={20} max={499} style={{ width: "100%" }} suffix="kg" />
                </Form.Item>
                <Form.Item
                  name="weeksToGoal"
                  label="Weeks to goal"
                  rules={[{ required: true, message: "Required" }]}
                >
                  <InputNumber min={1} max={104} style={{ width: "100%" }} suffix="wks" />
                </Form.Item>
              </div>

              {watchedAge != null && watchedAge < 13 && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  description="Children should only follow a weight-loss plan under medical supervision. Please consult a doctor before proceeding."
                />
              )}
              {computedRate !== null && computedRate > ageMaxRate(watchedAge) && watchedWeight != null && watchedTargetWeight != null && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  description={`For your age group, we recommend losing no more than ${ageMaxRate(watchedAge)} kg per week. Your target will be automatically adjusted to a safe range. Try at least ${Math.ceil((watchedWeight - watchedTargetWeight) / ageMaxRate(watchedAge))} weeks to stay on track.`}
                />
              )}
            </>
          )}

          {recommendation !== null && (
            <div
              style={{
                background: "#e8f5e9",
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 16,
                textAlign: "center",
              }}
            >
              <Text style={{ color: FOREST, display: "block", marginBottom: 4 }}>
                Recommended daily calories
              </Text>
              <Text strong style={{ fontSize: 28, color: "#1b5e20" }}>
                {Math.round(recommendation).toLocaleString()} kcal
              </Text>
            </div>
          )}

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving} style={{ width: "100%", marginBottom: 8 }}>
              Save Health Goal
            </Button>
            <Button style={{ width: "100%" }} onClick={handleReset}>
              Reset
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </VirtualPantryAppShell>
  );
}
