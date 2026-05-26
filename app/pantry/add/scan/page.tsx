"use client";

import React, { Suspense, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi } from "@/hooks/useApi";
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
  Typography,
  Upload,
  Tag,
  theme as antdTheme,
} from "antd";
import type { UploadFile, UploadProps } from "antd";
import {
  ArrowLeftOutlined,
  BarcodeOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  ScanOutlined,
  UploadOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import useSessionStorage from "@/hooks/useSessionStorage";
import { usePantryWebSocket } from "@/hooks/usePantryWebSocket";
import { VirtualPantryAppShell } from "@/components/VirtualPantryAppShell";
import type { HouseholdWithRole } from "@/types/household";

const { Title, Paragraph, Text } = Typography;

type PantryTarget = {
  householdId: number;
  householdName?: string;
};

type BarcodeExtractionResponse = {
  barcode: string;
};

function getBarcodeUploadErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Barcode detection failed. Please enter the barcode manually.";
  }
  if (error.message.includes("422") || error.message.includes("No barcode detected")) {
    return "No barcode was detected. Please use a clear, well-lit photo where the whole barcode is visible, or enter the barcode manually.";
  }
  if (error.message.includes("Failed to fetch")) {
    return "Could not reach the backend. Please make sure the server is running, then try again or enter the barcode manually.";
  }
  return error.message;
}

function PantryScanPageContent() {
  return (
    <ConfigProvider theme={{ algorithm: antdTheme.defaultAlgorithm, token: { colorText: "#182418", colorTextSecondary: "#566556", colorBgBase: "#ffffff" } }}>
      <PantryScanPageInner />
    </ConfigProvider>
  );
}

function PantryScanPageInner() {
  useAuthGuard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const api = useApi();
  const { message } = App.useApp();
  const { value: token } = useSessionStorage<string>("token", "");
  const { value: storedUserId } = useSessionStorage<string>("userId", "");
  const { value: cachedHouseholds, set: setHouseholds } = useSessionStorage<HouseholdWithRole[]>("households", []);
  const { clear: clearSelectedHouseholdId } = useSessionStorage<number | null>("selectedHouseholdId", null);
  const currentUserId = storedUserId ? Number(storedUserId) : null;
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedBarcode, setDetectedBarcode] = useState<string | null>(null);
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

  const updateSelectedFile = (file?: File) => {
    if (!file) {
      setSelectedFile(null);
      setFileList([]);
      setPreviewUrl(null);
      setDetectedBarcode(null);
      setErrorMessage(null);
      return;
    }

    const uploadFile: UploadFile = {
      uid: `${Date.now()}`,
      name: file.name,
      status: "done",
    };

    setSelectedFile(file);
    setFileList([uploadFile]);
    setPreviewUrl(URL.createObjectURL(file));
    setDetectedBarcode(null);
    setErrorMessage(null);
  };

  const uploadProps: UploadProps = {
    multiple: false,
    maxCount: 1,
    accept: "image/*",
    fileList,
    beforeUpload: (file) => {
      updateSelectedFile(file);
      return false;
    },
    onRemove: () => {
      updateSelectedFile(undefined);
    },
  };

  const handleOpenCamera = () => {
    cameraInputRef.current?.click();
  };

  const handleBackToPantry = () => {
    if (!pantryTarget) {
      router.push("/households");
      return;
    }

    router.push(`/households/${pantryTarget.householdId}/stats`);
  };

  const handleManualBarcode = () => {
    const barcodeQuery = detectedBarcode
      ? `&barcode=${encodeURIComponent(detectedBarcode)}`
      : "";

    if (!pantryTarget) {
      router.push(`/open-food-facts${barcodeQuery ? `?${barcodeQuery.slice(1)}` : ""}`);
      return;
    }

    router.push(
      `/open-food-facts?householdId=${pantryTarget.householdId}&householdName=${encodeURIComponent(
        pantryTarget.householdName ?? `Household ${pantryTarget.householdId}`,
      )}${barcodeQuery}`,
    );
  };

  const handleDetectBarcode = async () => {
    if (!selectedFile) {
      setErrorMessage("Please select an image first.");
      return;
    }

    setIsDetecting(true);
    setErrorMessage(null);
    setDetectedBarcode(null);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);

      const response = await api.postFormData<BarcodeExtractionResponse>(
        "/products/barcode/extract",
        formData,
      );

      setDetectedBarcode(response.barcode);

      const barcodeQuery = `barcode=${encodeURIComponent(response.barcode)}`;
      const pantryQuery = pantryTarget
        ? `&householdId=${pantryTarget.householdId}&householdName=${encodeURIComponent(
            pantryTarget.householdName ?? `Household ${pantryTarget.householdId}`,
          )}`
        : "";

      router.push(`/open-food-facts?${barcodeQuery}${pantryQuery}`);
    } catch (error) {
      setErrorMessage(getBarcodeUploadErrorMessage(error));
    } finally {
      setIsDetecting(false);
    }
  };

  return (
    <VirtualPantryAppShell activeNav="pantry">
    <div
      style={{
        paddingBottom: 24,
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <Space
            orientation="vertical"
            size="large"
            style={{ width: "100%", display: "flex" }}
          >
            <Space
              style={{
                width: "100%",
                justifyContent: "space-between",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: 16,
              }}
            >
              <div>
                <Button
                  size="middle"
                  icon={<ArrowLeftOutlined />}
                  onClick={handleBackToPantry}
                  style={{ marginBottom: 18, borderRadius: 12, fontWeight: 600 }}
                >
                  Pantry
                </Button>
                <Tag
                  color="green"
                  style={{
                    marginBottom: 12,
                    borderRadius: 999,
                    paddingInline: 12,
                    fontWeight: 600,
                  }}
                >
                  Image barcode scan
                </Tag>
                <Title
                  level={1}
                  style={{
                    margin: 0,
                    color: "#18351f",
                    fontSize: 48,
                    lineHeight: 1.05,
                  }}
                >
                  Scan package barcode
                </Title>
                <Paragraph
                  style={{
                    marginTop: 12,
                    marginBottom: 0,
                    maxWidth: 760,
                    fontSize: 20,
                    lineHeight: 1.55,
                    color: "#5f6e60",
                  }}
                >
                  Upload a product package photo from your device or use your
                  camera to detect a barcode automatically, then continue to the
                  Open Food Facts flow.
                </Paragraph>
                {pantryTarget ? (
                  <Paragraph style={{ marginTop: 12, marginBottom: 0 }}>
                    Pantry target:{" "}
                    <strong>
                      {pantryTarget.householdName ??
                        `Household ${pantryTarget.householdId}`}
                    </strong>
                  </Paragraph>
                ) : null}
              </div>

              <Space wrap size="middle">
                <Button
                  size="middle"
                  icon={<BarcodeOutlined />}
                  onClick={handleManualBarcode}
                >
                  Manual barcode
                </Button>
              </Space>
            </Space>

            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Card
                  size="small"
                  style={{
                    borderRadius: 20,
                    borderColor: "#d9e2cf",
                    background: "#ffffff",
                    height: "100%",
                  }}
                >
                  <Space orientation="vertical" size={8}>
                    <Text
                      style={{
                        color: "#1f7a3f",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      1. Choose source
                    </Text>
                    <Title level={4} style={{ margin: 0, color: "#18351f" }}>
                      File or camera
                    </Title>
                    <Text type="secondary">
                      Select an image from your device or capture one directly.
                    </Text>
                  </Space>
                </Card>
              </Col>

              <Col xs={24} md={8}>
                <Card
                  size="small"
                  style={{
                    borderRadius: 20,
                    borderColor: "#d9e2cf",
                    background: "#ffffff",
                    height: "100%",
                  }}
                >
                  <Space orientation="vertical" size={8}>
                    <Text
                      style={{
                        color: "#1f7a3f",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      2. Preview
                    </Text>
                    <Title level={4} style={{ margin: 0, color: "#18351f" }}>
                      Verify image quality
                    </Title>
                    <Text type="secondary">
                      Make sure the barcode area is visible before detection.
                    </Text>
                  </Space>
                </Card>
              </Col>

              <Col xs={24} md={8}>
                <Card
                  size="small"
                  style={{
                    borderRadius: 20,
                    borderColor: "#d9e2cf",
                    background: "#ffffff",
                    height: "100%",
                  }}
                >
                  <Space orientation="vertical" size={8}>
                    <Text
                      style={{
                        color: "#1f7a3f",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      3. Detect barcode
                    </Text>
                    <Title level={4} style={{ margin: 0, color: "#18351f" }}>
                      Continue add flow
                    </Title>
                    <Text type="secondary">
                      On success, the app redirects to product lookup automatically.
                    </Text>
                  </Space>
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} lg={14}>
                <Card
                  title={
                    <span style={{ fontSize: 24, fontWeight: 700, color: "#1f2d1f" }}>
                      Choose a package image
                    </span>
                  }
                  style={{
                    borderRadius: 24,
                    borderColor: "#d9e2cf",
                    background: "#ffffff",
                    height: "100%",
                  }}
                  styles={{
                    header: {
                      borderBottomColor: "#e5ecda",
                      paddingInline: 24,
                      paddingTop: 20,
                      paddingBottom: 16,
                    },
                    body: {
                      padding: 24,
                    },
                  }}
                >
                  <Space
                    orientation="vertical"
                    size="large"
                    style={{ width: "100%", display: "flex" }}
                  >
                    <Space wrap size="middle">
                      <Upload {...uploadProps}>
                        <Button size="large" icon={<UploadOutlined />}>
                          Choose image file
                        </Button>
                      </Upload>

                      <Button
                        size="large"
                        icon={<CameraOutlined />}
                        onClick={handleOpenCamera}
                      >
                        Use camera
                      </Button>

                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: "none" }}
                        onChange={(event) =>
                          updateSelectedFile(event.target.files?.[0])
                        }
                      />
                    </Space>

                    <Text type="secondary">
                      Supported input: product package photos from gallery or
                      camera. Clear, well-lit images work best for barcode
                      extraction.
                    </Text>

                    {selectedFile ? (
                      <Alert
                        type="success"
                        showIcon
                        title="Image selected"
                        description={selectedFile.name}
                      />
                    ) : (
                      <Alert
                        type="info"
                        showIcon
                        title="No image selected yet"
                        description="Choose a file or take a photo to begin the scan flow."
                      />
                    )}
                  </Space>
                </Card>
              </Col>

              <Col xs={24} lg={10}>
                <Card
                  title={
                    <span style={{ fontSize: 24, fontWeight: 700, color: "#1f2d1f" }}>
                      Preview
                    </span>
                  }
                  style={{
                    borderRadius: 24,
                    borderColor: "#d9e2cf",
                    background: "#ffffff",
                    height: "100%",
                  }}
                  styles={{
                    header: {
                      borderBottomColor: "#e5ecda",
                      paddingInline: 24,
                      paddingTop: 20,
                      paddingBottom: 16,
                    },
                    body: {
                      padding: 24,
                    },
                  }}
                >
                  {previewUrl ? (
                    <Space
                      orientation="vertical"
                      size="middle"
                      style={{ width: "100%", display: "flex" }}
                    >
                      <div
                        style={{
                          background: "#f7f9f1",
                          border: "1px solid #e1e8d6",
                          borderRadius: 20,
                          padding: 16,
                          textAlign: "center",
                        }}
                      >
                        <Image
                          src={previewUrl}
                          alt="Selected package barcode image"
                          width={320}
                          style={{
                            objectFit: "contain",
                            borderRadius: 12,
                          }}
                        />
                      </div>

                      <Alert
                        type="success"
                        showIcon
                        icon={<CheckCircleOutlined />}
                        title="Image ready"
                        description="The selected image is ready for barcode extraction."
                      />
                    </Space>
                  ) : (
                    <Alert
                      type="warning"
                      showIcon
                      icon={<WarningOutlined />}
                      title="No image selected yet"
                      description="Choose a file or take a photo to preview it here."
                    />
                  )}
                </Card>
              </Col>
            </Row>

            {detectedBarcode ? (
              <Alert
                type="success"
                showIcon
                title="Barcode detected"
                description={`Detected barcode: ${detectedBarcode}`}
              />
            ) : null}

            {errorMessage ? (
              <Alert
                type="warning"
                showIcon
                title="Barcode not detected"
                description={errorMessage}
                action={
                  <Button size="small" icon={<BarcodeOutlined />} onClick={handleManualBarcode}>
                    Enter manually
                  </Button>
                }
              />
            ) : null}

            <section style={{ paddingTop: 4 }}>
              <Space
                orientation="vertical"
                size="middle"
                style={{ width: "100%", display: "flex" }}
              >
                <Title level={3} style={{ margin: 0, color: "#18351f" }}>
                  Next step
                </Title>
                <Paragraph style={{ margin: 0, color: "#5f6e60" }}>
                  Run automatic barcode detection from the selected image. If no
                  barcode is found, continue with manual barcode entry instead.
                </Paragraph>

                <Space wrap size="middle">
                  <Button
                    type="primary"
                    size="large"
                    icon={<ScanOutlined />}
                    disabled={!previewUrl}
                    loading={isDetecting}
                    onClick={() => void handleDetectBarcode()}
                  >
                    Detect barcode from image
                  </Button>

                  <Button
                    size="large"
                    icon={<BarcodeOutlined />}
                    onClick={handleManualBarcode}
                  >
                    Fallback to manual barcode entry
                  </Button>
                </Space>
              </Space>
            </section>
          </Space>
      </div>
    </div>
    </VirtualPantryAppShell>
  );
}

export default function PantryScanPage() {
  return (
    <Suspense>
      <PantryScanPageContent />
    </Suspense>
  );
}
