"use client";

import React, { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  ConfigProvider,
  Image,
  Progress,
  Row,
  Space,
  Tag,
  Typography,
  Upload,
  theme as antdTheme,
} from "antd";
import type { UploadFile, UploadProps } from "antd";
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  InboxOutlined,
  OrderedListOutlined,
  UploadOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useApi } from "@/hooks/useApi";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import useSessionStorage from "@/hooks/useSessionStorage";
import { usePantryWebSocket } from "@/hooks/usePantryWebSocket";
import { VirtualPantryAppShell } from "@/components/VirtualPantryAppShell";
import type {
  ReceiptAnalysisResult,
  ReceiptUploadSession,
} from "@/types/receipt";
import type { HouseholdWithRole } from "@/types/household";
import {
  isStaleHouseholdError,
  getStaleHouseholdMessage,
} from "@/utils/householdStale";

const { Title, Paragraph, Text } = Typography;

const MAX_RECEIPT_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_RECEIPT_TYPES = new Set(["image/jpeg", "image/png"]);
const baseCardStyle = {
  background: "#ffffff",
  borderColor: "#d9e2cf",
};
const sectionCardStyle = {
  ...baseCardStyle,
  borderRadius: 24,
  height: "100%",
};
const sectionCardStyles = {
  header: {
    background: "#ffffff",
    borderBottomColor: "#e5ecda",
    paddingInline: 24,
    paddingTop: 20,
    paddingBottom: 16,
  },
  body: {
    background: "#ffffff",
    padding: 24,
  },
};
const stepCardStyle = {
  ...baseCardStyle,
  borderRadius: 20,
  height: "100%",
};
const stepCardStyles = {
  body: {
    background: "#ffffff",
  },
};

type PantryTarget = {
  householdId: number;
  householdName?: string;
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function isSupportedReceiptImage(file: File): boolean {
  return ACCEPTED_RECEIPT_TYPES.has(file.type);
}

function getReceiptUploadErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Receipt upload failed. Please try another image.";
  }

  if (error.message.includes("Failed to fetch")) {
    return "Could not reach the backend. Please make sure the server is running on http://localhost:8080, then try again.";
  }

  if (error.message.includes("413")) {
    return "The receipt image is too large. Please upload a JPG or PNG up to 5 MB.";
  }

  if (
    error.message.includes("503") ||
    error.message.includes("Receipt scanning is currently unavailable")
  ) {
    return "Receipt scanning is currently unavailable. Please add items manually or try again later.";
  }

  return error.message;
}

function PantryReceiptUploadPageContent() {
  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.defaultAlgorithm,
        token: {
          colorText: "#182418",
          colorTextSecondary: "#566556",
          colorBgBase: "#ffffff",
        },
      }}
    >
      <PantryReceiptUploadPageInner />
    </ConfigProvider>
  );
}

function PantryReceiptUploadPageInner() {
  useAuthGuard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const api = useApi();
  const { message } = App.useApp();
  const { set: setReceiptUploadSession } =
    useSessionStorage<ReceiptUploadSession | null>(
      "receiptUploadSession",
      null,
    );
  const { value: token } = useSessionStorage<string>("token", "");
  const { value: storedUserId } = useSessionStorage<string>("userId", "");
  const { value: cachedHouseholds, set: setHouseholds } = useSessionStorage<
    HouseholdWithRole[]
  >("households", []);
  const { clear: clearSelectedHouseholdId } = useSessionStorage<number | null>(
    "selectedHouseholdId",
    null,
  );
  const currentUserId = storedUserId ? Number(storedUserId) : null;

  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [receiptResult, setReceiptResult] =
    useState<ReceiptAnalysisResult | null>(null);
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
      if (
        msg.eventType === "HOUSEHOLD_DELETED" ||
        (msg.eventType === "MEMBER_REMOVED" &&
          msg.removedUserId === currentUserId)
      ) {
        setHouseholds(
          cachedHouseholds.filter(
            (h) => h.householdId !== pantryTarget?.householdId,
          ),
        );
        clearSelectedHouseholdId();
        message.warning(
          msg.eventType === "HOUSEHOLD_DELETED"
            ? "This household has been deleted."
            : "You have been removed from this household.",
        );
        router.push("/households");
      }
    },
  });

  const clearSelection = () => {
    setSelectedFile(null);
    setFileList([]);
    setPreviewUrl(null);
    setUploadProgress(0);
    setReceiptResult(null);
    setErrorMessage(null);
  };

  const validateFile = (file: File): string | null => {
    if (!isSupportedReceiptImage(file)) {
      return "Please upload a JPG or PNG receipt image.";
    }
    if (file.size > MAX_RECEIPT_IMAGE_BYTES) {
      return "Receipt image must not exceed 5 MB.";
    }
    return null;
  };

  const updateSelectedFile = (file?: File) => {
    if (!file) {
      clearSelection();
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      clearSelection();
      setErrorMessage(validationError);
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
    setReceiptResult(null);
    setUploadProgress(100);
    setErrorMessage(null);
  };

  const uploadProps: UploadProps = {
    multiple: false,
    maxCount: 1,
    accept: ".jpg,.jpeg,.png,image/jpeg,image/png",
    fileList,
    beforeUpload: (file) => {
      updateSelectedFile(file);
      return false;
    },
    onRemove: () => {
      clearSelection();
    },
  };

  const handleBackToPantry = () => {
    if (!pantryTarget) {
      router.push("/households");
      return;
    }

    router.push(`/households/${pantryTarget.householdId}/stats`);
  };

  const handleUploadReceipt = async () => {
    if (!pantryTarget) {
      setErrorMessage(
        "A valid household target is required before uploading a receipt.",
      );
      return;
    }
    if (!selectedFile) {
      setErrorMessage("Please select a JPG or PNG receipt image first.");
      return;
    }

    setIsUploading(true);
    setReceiptResult(null);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);

      const result = await api.postFormData<ReceiptAnalysisResult>(
        `/households/${pantryTarget.householdId}/receipt/upload`,
        formData,
      );

      const uploadSession: ReceiptUploadSession = {
        householdId: pantryTarget.householdId,
        householdName: pantryTarget.householdName,
        uploadedAt: new Date().toISOString(),
        result,
      };

      setReceiptResult(result);
      setReceiptUploadSession(uploadSession);
      setUploadProgress(100);
      message.success(
        "Receipt analyzed. Review the extracted product candidates next.",
      );
      router.push(
        `/open-food-facts?householdId=${pantryTarget.householdId}&householdName=${encodeURIComponent(
          pantryTarget.householdName ?? `Household ${pantryTarget.householdId}`,
        )}&receipt=1`,
      );
    } catch (error) {
      if (isStaleHouseholdError(error)) {
        setHouseholds(
          cachedHouseholds.filter(
            (h) => h.householdId !== pantryTarget.householdId,
          ),
        );
        clearSelectedHouseholdId();
        message.warning(getStaleHouseholdMessage(error));
        router.push("/households");
        return;
      }
      setErrorMessage(getReceiptUploadErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  };

  const extractedItemCount = receiptResult?.items?.length ?? 0;
  const handleReviewItems = () => {
    if (!pantryTarget) {
      return;
    }

    router.push(
      `/open-food-facts?householdId=${pantryTarget.householdId}&householdName=${encodeURIComponent(
        pantryTarget.householdName ?? `Household ${pantryTarget.householdId}`,
      )}&receipt=1`,
    );
  };

  return (
    <VirtualPantryAppShell activeNav="pantry">
      <div style={{ paddingBottom: 24 }}>
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
                  style={{
                    marginBottom: 18,
                    borderRadius: 12,
                    fontWeight: 600,
                  }}
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
                  Receipt upload
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
                  Upload receipt photo
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
                  Choose a clear JPG or PNG receipt image, upload it for OCR
                  parsing, then review local product candidates in the product
                  lookup portal.
                </Paragraph>
                {pantryTarget ? (
                  <Paragraph style={{ marginTop: 12, marginBottom: 0 }}>
                    Pantry target:{" "}
                    <strong>
                      {pantryTarget.householdName ??
                        `Household ${pantryTarget.householdId}`}
                    </strong>
                  </Paragraph>
                ) : (
                  <Paragraph
                    style={{ marginTop: 12, marginBottom: 0, color: "#a15c15" }}
                  >
                    No valid household target was provided.
                  </Paragraph>
                )}
              </div>
            </Space>

            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Card
                  size="small"
                  style={stepCardStyle}
                  styles={stepCardStyles}
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
                      1. Select image
                    </Text>
                    <Title level={4} style={{ margin: 0, color: "#18351f" }}>
                      JPG or PNG
                    </Title>
                    <Text type="secondary">Maximum file size is 5 MB.</Text>
                  </Space>
                </Card>
              </Col>

              <Col xs={24} md={8}>
                <Card
                  size="small"
                  style={stepCardStyle}
                  styles={stepCardStyles}
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
                      2. Upload
                    </Text>
                    <Title level={4} style={{ margin: 0, color: "#18351f" }}>
                      OCR parsing
                    </Title>
                    <Text type="secondary">
                      The backend extracts receipt line items.
                    </Text>
                  </Space>
                </Card>
              </Col>

              <Col xs={24} md={8}>
                <Card
                  size="small"
                  style={stepCardStyle}
                  styles={stepCardStyles}
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
                      3. Review next
                    </Text>
                    <Title level={4} style={{ margin: 0, color: "#18351f" }}>
                      Choose candidates
                    </Title>
                    <Text type="secondary">
                      Pick the right local dataset product for each line.
                    </Text>
                  </Space>
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} lg={14}>
                <Card
                  title={
                    <span
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color: "#1f2d1f",
                      }}
                    >
                      Choose receipt image
                    </span>
                  }
                  style={sectionCardStyle}
                  styles={sectionCardStyles}
                >
                  <Space
                    orientation="vertical"
                    size="large"
                    style={{ width: "100%", display: "flex" }}
                  >
                    <Space wrap size="middle">
                      <Upload {...uploadProps}>
                        <Button size="large" icon={<UploadOutlined />}>
                          Choose receipt file
                        </Button>
                      </Upload>
                    </Space>

                    <Text type="secondary">
                      A full, well-lit receipt photo improves OCR accuracy.
                      Supported formats: JPG and PNG, up to 5 MB.
                    </Text>

                    {selectedFile ? (
                      <Alert
                        type="success"
                        showIcon
                        title="Receipt image selected"
                        description={`${selectedFile.name} · ${formatBytes(selectedFile.size)}`}
                      />
                    ) : (
                      <Alert
                        type="info"
                        showIcon
                        title="No receipt selected yet"
                        description="Choose a receipt image to prepare it for OCR analysis."
                      />
                    )}
                  </Space>
                </Card>
              </Col>

              <Col xs={24} lg={10}>
                <Card
                  title={
                    <span
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color: "#1f2d1f",
                      }}
                    >
                      Preview and status
                    </span>
                  }
                  style={sectionCardStyle}
                  styles={sectionCardStyles}
                >
                  <Space
                    orientation="vertical"
                    size="middle"
                    style={{ width: "100%", display: "flex" }}
                  >
                    {previewUrl ? (
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
                          alt="Selected receipt image"
                          width={320}
                          style={{ objectFit: "contain", borderRadius: 12 }}
                        />
                      </div>
                    ) : (
                      <Alert
                        type="warning"
                        showIcon
                        icon={<WarningOutlined />}
                        title="No image selected"
                        description="The receipt preview will appear here."
                      />
                    )}

                    <Progress
                      percent={uploadProgress}
                      status={
                        errorMessage
                          ? "exception"
                          : selectedFile
                            ? "success"
                            : "normal"
                      }
                    />
                  </Space>
                </Card>
              </Col>
            </Row>

            {errorMessage ? (
              <Alert
                type="error"
                showIcon
                title="Receipt upload issue"
                description={errorMessage}
              />
            ) : null}

            {receiptResult ? (
              <Alert
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                title="Receipt uploaded and analyzed"
                description={`Extracted ${extractedItemCount} item${extractedItemCount === 1 ? "" : "s"}${receiptResult.merchantName ? ` from ${receiptResult.merchantName}` : ""}.`}
                action={
                  <Button
                    type="primary"
                    icon={<OrderedListOutlined />}
                    onClick={handleReviewItems}
                  >
                    Review product candidates
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
                  Upload receipt
                </Title>
                <Paragraph style={{ margin: 0, color: "#5f6e60" }}>
                  The backend will validate the image, run OCR, and search the
                  local product dataset for candidates for each extracted line
                  item.
                </Paragraph>

                <Space wrap size="middle">
                  <Button
                    type="primary"
                    size="large"
                    icon={<CloudUploadOutlined />}
                    disabled={!selectedFile || !pantryTarget}
                    loading={isUploading}
                    onClick={() => void handleUploadReceipt()}
                  >
                    {isUploading
                      ? "Analyzing receipt..."
                      : "Upload and analyze receipt"}
                  </Button>

                  <Button
                    size="large"
                    icon={<InboxOutlined />}
                    onClick={clearSelection}
                  >
                    Clear selection
                  </Button>
                </Space>

                <Text type="secondary">
                  After upload, the result is kept in this browser session and
                  opened in the product lookup portal for candidate review.
                </Text>
              </Space>
            </section>
          </Space>
        </div>
      </div>
    </VirtualPantryAppShell>
  );
}

export default function PantryReceiptUploadPage() {
  return (
    <Suspense>
      <PantryReceiptUploadPageContent />
    </Suspense>
  );
}
