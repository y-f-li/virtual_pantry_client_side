"use client";

import React, { Suspense, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  ConfigProvider,
  Image,
  Row,
  Space,
  Tag,
  Typography,
  theme as antdTheme,
} from "antd";
import {
  ArrowLeftOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  EditOutlined,
  ScanOutlined,
  UploadOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useApi } from "@/hooks/useApi";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import useSessionStorage from "@/hooks/useSessionStorage";
import { usePantryWebSocket } from "@/hooks/usePantryWebSocket";
import { VirtualPantryAppShell } from "@/components/VirtualPantryAppShell";
import type { HouseholdWithRole } from "@/types/household";
import type { ConsumptionUnit, FoodRecognitionResponse, RecognizedFood } from "@/types/pantry";

const { Title, Paragraph, Text } = Typography;

type PantryTarget = {
  householdId: number;
  householdName?: string;
};

function isSupportedPrefillUnit(unit?: string | null): unit is ConsumptionUnit {
  return unit === "g" || unit === "ml" || unit === "package" || unit === "serving";
}

function buildCandidateFromName(name: string): RecognizedFood {
  return {
    name,
    unit: "g",
    suggestedAmount: 100,
  };
}

function getCandidateCalories(candidate: RecognizedFood): number | null {
  if (typeof candidate.kcalPer100g === "number" && candidate.kcalPer100g > 0) {
    return candidate.kcalPer100g;
  }
  if (typeof candidate.kcalPerServing === "number" && candidate.kcalPerServing > 0) {
    return candidate.kcalPerServing;
  }
  return null;
}

function getCandidateUnit(candidate: RecognizedFood): ConsumptionUnit {
  if (typeof candidate.kcalPer100g === "number" && candidate.kcalPer100g > 0) {
    if (isSupportedPrefillUnit(candidate.unit)) return candidate.unit;
    return "g";
  }
  if (candidate.kcalPerServing && candidate.kcalPerServing > 0) {
    return "serving";
  }
  if (isSupportedPrefillUnit(candidate.unit)) {
    return candidate.unit;
  }
  return "g";
}

function FoodRecognitionPageContent() {
  return (
    <ConfigProvider theme={{ algorithm: antdTheme.defaultAlgorithm, token: { colorText: "#182418", colorTextSecondary: "#566556", colorBgBase: "#ffffff" } }}>
      <FoodRecognitionPageInner />
    </ConfigProvider>
  );
}

function FoodRecognitionPageInner() {
  useAuthGuard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const api = useApi();
  const { message } = App.useApp();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { value: token } = useSessionStorage<string>("token", "");
  const { value: storedUserId } = useSessionStorage<string>("userId", "");
  const { value: cachedHouseholds, set: setHouseholds } = useSessionStorage<HouseholdWithRole[]>("households", []);
  const { clear: clearSelectedHouseholdId } = useSessionStorage<number | null>("selectedHouseholdId", null);
  const currentUserId = storedUserId ? Number(storedUserId) : null;

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognition, setRecognition] = useState<FoodRecognitionResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pantryTarget = useMemo<PantryTarget | null>(() => {
    const householdId = Number(searchParams.get("householdId"));
    if (!Number.isFinite(householdId) || householdId <= 0) {
      return null;
    }

    return {
      householdId,
      householdName: searchParams.get("householdName") ?? undefined,
    };
  }, [searchParams]);

  usePantryWebSocket({
    householdId: pantryTarget?.householdId ?? null,
    token,
    onMessage: (msg) => {
      if (msg.eventType === "HOUSEHOLD_DELETED" || (msg.eventType === "MEMBER_REMOVED" && msg.removedUserId === currentUserId)) {
        setHouseholds(cachedHouseholds.filter((h) => h.householdId !== pantryTarget?.householdId));
        clearSelectedHouseholdId();
        message.warning(msg.eventType === "HOUSEHOLD_DELETED" ? "This household has been deleted." : "You have been removed from this household.");
        router.push("/households");
      }
    },
  });

  const candidates = useMemo<RecognizedFood[]>(() => {
    if (!recognition) return [];
    const recognizedFoods = recognition.recognizedFoods ?? [];
    if (recognizedFoods.length > 0) {
      return recognizedFoods.filter((candidate) => candidate.name?.trim());
    }
    return recognition.detectedFoods.map(buildCandidateFromName);
  }, [recognition]);

  const updateSelectedFile = (file?: File) => {
    if (!file) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setRecognition(null);
      setErrorMessage(null);
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setRecognition(null);
    setErrorMessage(null);
  };

  const handleBackToPantry = () => {
    if (!pantryTarget) {
      router.push("/households");
      return;
    }

    router.push(`/households/${pantryTarget.householdId}/stats`);
  };

  const handleRecognizeFood = async () => {
    if (!pantryTarget) {
      setErrorMessage("Household ID is missing or invalid.");
      return;
    }
    if (!selectedFile) {
      setErrorMessage("Please select a meal photo first.");
      return;
    }

    setIsRecognizing(true);
    setRecognition(null);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);

      const response = await api.postFormData<FoodRecognitionResponse>(
        `/households/${pantryTarget.householdId}/pantry/recognize-food`,
        formData,
      );
      setRecognition({
        ...response,
        detectedFoods: response.detectedFoods ?? [],
        recognizedFoods: response.recognizedFoods ?? [],
      });

      if (response.status === "MANUAL_FALLBACK") {
        message.warning(response.message || "Food recognition failed. You can still add the item manually.");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Food recognition failed. You can still add the item manually.");
    } finally {
      setIsRecognizing(false);
    }
  };

  const continueToManualAdd = (candidate?: RecognizedFood) => {
    if (!pantryTarget) return;

    const params = new URLSearchParams({
      householdId: String(pantryTarget.householdId),
      householdName: pantryTarget.householdName ?? `Household ${pantryTarget.householdId}`,
    });

    if (candidate?.name?.trim()) {
      params.set("name", candidate.name.trim());
    }
    if (candidate) {
      const unit = getCandidateUnit(candidate);
      params.set("unit", unit);
      const amount = typeof candidate.suggestedAmount === "number" && candidate.suggestedAmount > 0
        ? candidate.suggestedAmount
        : unit === "package" || unit === "serving"
          ? 1
          : 100;
      params.set("amount", String(amount));

      const calories = getCandidateCalories(candidate);
      if (calories !== null) {
        params.set("calories", String(calories));
      }
    }

    router.push(`/pantry/add/manual?${params.toString()}`);
  };

  return (
    <VirtualPantryAppShell activeNav="pantry">
      <div style={{ paddingBottom: 24 }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <Space orientation="vertical" size="large" style={{ width: "100%", display: "flex" }}>
            <Space style={{ width: "100%", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
              <div>
                <Button size="middle" icon={<ArrowLeftOutlined />} onClick={handleBackToPantry} style={{ marginBottom: 18, borderRadius: 12, fontWeight: 600 }}>
                  Pantry
                </Button>
                <Tag color="green" style={{ marginBottom: 12, borderRadius: 999, paddingInline: 12, fontWeight: 600 }}>
                  OpenAI food recognition
                </Tag>
                <Title level={1} style={{ margin: 0, color: "#18351f", fontSize: 48, lineHeight: 1.05 }}>
                  Recognize food from photo
                </Title>
                <Paragraph style={{ marginTop: 12, marginBottom: 0, maxWidth: 760, fontSize: 20, lineHeight: 1.55, color: "#5f6e60" }}>
                  Upload a meal photo, review the recognized food and calorie estimate, then continue to manual add before saving anything to the pantry.
                </Paragraph>
                {pantryTarget ? (
                  <Paragraph style={{ marginTop: 12, marginBottom: 0 }}>
                    Pantry target: <strong>{pantryTarget.householdName ?? `Household ${pantryTarget.householdId}`}</strong>
                  </Paragraph>
                ) : null}
              </div>
              <Button size="middle" icon={<EditOutlined />} disabled={!pantryTarget} onClick={() => continueToManualAdd()}>
                Add manually instead
              </Button>
            </Space>

            <Row gutter={[16, 16]}>
              <Col xs={24} lg={14}>
                <Card title={<span style={{ fontSize: 24, fontWeight: 700, color: "#1f2d1f" }}>Choose a meal photo</span>}>
                  <Space orientation="vertical" size="large" style={{ width: "100%", display: "flex" }}>
                    <Space wrap size="middle">
                      <Button size="large" icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()}>
                        Choose meal image
                      </Button>
                      <Button size="large" icon={<CameraOutlined />} onClick={() => cameraInputRef.current?.click()}>
                        Use camera
                      </Button>
                      <input
                        ref={fileInputRef}
                        aria-label="Meal photo"
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(event) => updateSelectedFile(event.target.files?.[0])}
                      />
                      <input
                        ref={cameraInputRef}
                        aria-label="Meal photo camera"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: "none" }}
                        onChange={(event) => updateSelectedFile(event.target.files?.[0])}
                      />
                    </Space>

                    {selectedFile ? (
                      <Alert type="success" showIcon title="Meal image selected" description={selectedFile.name} />
                    ) : (
                      <Alert type="info" showIcon title="No meal image selected yet" description="Choose a file or take a photo to begin food recognition." />
                    )}

                    <Button type="primary" size="large" icon={<ScanOutlined />} disabled={!selectedFile || !pantryTarget} loading={isRecognizing} onClick={() => void handleRecognizeFood()}>
                      Recognize food from photo
                    </Button>
                  </Space>
                </Card>
              </Col>

              <Col xs={24} lg={10}>
                <Card title={<span style={{ fontSize: 24, fontWeight: 700, color: "#1f2d1f" }}>Preview</span>}>
                  {previewUrl ? (
                    <Space orientation="vertical" size="middle" style={{ width: "100%", display: "flex" }}>
                      <div style={{ background: "#f7f9f1", border: "1px solid #e1e8d6", borderRadius: 20, padding: 16, textAlign: "center" }}>
                        <Image src={previewUrl} alt="Selected meal image" width={320} style={{ objectFit: "contain", borderRadius: 12 }} />
                      </div>
                      <Alert type="success" showIcon icon={<CheckCircleOutlined />} title="Image ready" description="The selected meal image is ready for food recognition." />
                    </Space>
                  ) : (
                    <Alert type="warning" showIcon icon={<WarningOutlined />} title="No image selected yet" description="Choose a file or take a photo to preview it here." />
                  )}
                </Card>
              </Col>
            </Row>

            {errorMessage ? (
              <Alert type="warning" showIcon title="Food recognition unavailable" description={errorMessage} action={<Button size="small" icon={<EditOutlined />} onClick={() => continueToManualAdd()}>Add manually</Button>} />
            ) : null}

            {recognition ? (
              <Card title="Recognition result">
                <Space orientation="vertical" size="middle" style={{ width: "100%", display: "flex" }}>
                  <Alert
                    type={recognition.status === "RECOGNIZED" ? "success" : "warning"}
                    showIcon
                    title={recognition.status === "RECOGNIZED" ? "Food recognized" : "Manual fallback"}
                    description={recognition.message}
                  />
                  {candidates.length > 0 ? (
                    <Row gutter={[12, 12]}>
                      {candidates.map((candidate, index) => {
                        const calories = getCandidateCalories(candidate);
                        return (
                          <Col xs={24} md={12} lg={8} key={`${candidate.name}-${index}`}>
                            <Card size="small" title={candidate.name}>
                              <Space orientation="vertical" size="small" style={{ width: "100%" }}>
                                <Text type="secondary">
                                  {calories !== null ? `${calories} kcal ${candidate.kcalPer100g ? "/ 100g" : "/ serving"}` : "Calories need manual input"}
                                </Text>
                                <Text type="secondary">
                                  Suggested amount: {candidate.suggestedAmount ?? (getCandidateUnit(candidate) === "g" ? 100 : 1)} {getCandidateUnit(candidate)}
                                </Text>
                                {typeof candidate.confidence === "number" ? (
                                  <Tag color="green">Confidence {Math.round(candidate.confidence * 100)}%</Tag>
                                ) : null}
                                <Button type="primary" onClick={() => continueToManualAdd(candidate)}>
                                  Review and add
                                </Button>
                              </Space>
                            </Card>
                          </Col>
                        );
                      })}
                    </Row>
                  ) : (
                    <Alert type="info" showIcon title="No food candidates returned" description="You can still add the item manually." action={<Button size="small" onClick={() => continueToManualAdd()}>Add manually</Button>} />
                  )}
                </Space>
              </Card>
            ) : null}
          </Space>
        </div>
      </div>
    </VirtualPantryAppShell>
  );
}

export default function FoodRecognitionPage() {
  return (
    <Suspense>
      <FoodRecognitionPageContent />
    </Suspense>
  );
}
