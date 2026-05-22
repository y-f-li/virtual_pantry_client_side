"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  ConfigProvider,
  DatePicker,
  Divider,
  Empty,
  Input,
  InputNumber,
  Radio,
  Row,
  Space,
  Tag,
  Typography,
  theme as antdTheme,
} from "antd";
import type { Dayjs } from "dayjs";
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";
import { useApi } from "@/hooks/useApi";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import useSessionStorage from "@/hooks/useSessionStorage";
import { VirtualPantryAppShell } from "@/components/VirtualPantryAppShell";
import type {
  ReceiptMatchedItem,
  ReceiptPantryItemSuggestion,
  ReceiptProductCandidate,
  ReceiptUploadSession,
} from "@/types/receipt";
import type { AmountUnit } from "@/types/pantry";

const { Title, Paragraph, Text } = Typography;

const cardBorder = "#d9e2cf";
const textPrimary = "#182418";
const textSecondary = "#566556";
const green = "#1f7a3f";
const headingGreen = "#18351f";
const cardStyle = {
  borderRadius: 24,
  borderColor: cardBorder,
  background: "#ffffff",
  boxShadow: "0 8px 24px rgba(24, 36, 24, 0.06)",
};
const cardBodyStyle = { background: "#ffffff", padding: 24 };
const fieldStyle = {
  background: "#ffffff",
  color: textPrimary,
  borderColor: "#cbd8c0",
};

type EditableReviewItem = {
  id: string;
  selected: boolean;
  source: ReceiptMatchedItem;
  selectedCandidateIndex: number;
  barcode: string;
  name: string;
  kcalPerPackage: number;
  quantity: number;
  packageQuantity: string;
  nutriments: Record<string, unknown> | null;
  expirationDate: Dayjs | null;
};

type PantryBulkAddItem = {
  barcode: string;
  name: string;
  amount: number;
  amountUnit: AmountUnit;
  kcalPerPackage: number;
  packageQuantity?: string | null;
  nutriments?: Record<string, unknown> | null;
  expirationDate?: string | null;
};

function isMatchedItem(item: unknown): item is ReceiptMatchedItem {
  return Boolean(item && typeof item === "object" && "matchStatus" in item);
}

function confidenceColor(confidence?: string | null): string {
  if (confidence === "HIGH") return "green";
  if (confidence === "MEDIUM") return "gold";
  return "orange";
}

function candidateLabel(candidate: ReceiptProductCandidate, index: number): string {
  const product = candidate.product;
  const name = product?.name ?? "Unnamed product";
  const brand = product?.brand ? ` · ${product.brand}` : "";
  const score = typeof candidate.score === "number" ? ` · ${Math.round(candidate.score * 100)}%` : "";
  return `${index + 1}. ${name}${brand}${score}`;
}

function fallbackSuggestion(item: ReceiptMatchedItem): ReceiptPantryItemSuggestion {
  return {
    barcode: item.productCode,
    name: item.normalizedDescription ?? item.description ?? "Receipt item",
    kcalPerPackage: 0,
    quantity: Number.parseInt(item.quantity ?? "1", 10) || 1,
    packageQuantity: null,
    nutriments: null,
    readyForBulkAdd: Boolean(item.productCode),
  };
}

function itemFromSuggestion(
  item: ReceiptMatchedItem,
  index: number,
  suggestion: ReceiptPantryItemSuggestion,
): EditableReviewItem {
  return {
    id: `${index}-${item.description ?? "receipt-item"}`,
    selected: Boolean(suggestion.readyForBulkAdd),
    source: item,
    selectedCandidateIndex: 0,
    barcode: suggestion.barcode ?? "",
    name: suggestion.name ?? item.description ?? "Receipt item",
    kcalPerPackage: suggestion.kcalPerPackage ?? 0,
    quantity: suggestion.quantity ?? 1,
    packageQuantity: suggestion.packageQuantity ?? "",
    nutriments: suggestion.nutriments ?? null,
    expirationDate: null,
  };
}

function buildInitialItems(session: ReceiptUploadSession | null): EditableReviewItem[] {
  const rawItems = session?.result.items ?? [];
  return rawItems.filter(isMatchedItem).map((item, index) => {
    const suggestion = item.suggestedPantryItem ?? item.candidateProducts?.[0]?.suggestedPantryItem ?? fallbackSuggestion(item);
    return itemFromSuggestion(item, index, suggestion);
  });
}

function ReceiptReviewPageInner() {
  useAuthGuard();
  const router = useRouter();
  const api = useApi();
  const { message } = App.useApp();
  const { value: session, clear: clearSession } = useSessionStorage<ReceiptUploadSession | null>(
    "receiptUploadSession",
    null,
  );
  const [reviewItems, setReviewItems] = useState<EditableReviewItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setReviewItems(buildInitialItems(session));
  }, [session]);

  const selectedCount = useMemo(() => reviewItems.filter((item) => item.selected).length, [reviewItems]);
  const readySelectedCount = useMemo(
    () => reviewItems.filter((item) => item.selected && item.barcode.trim() && item.name.trim()).length,
    [reviewItems],
  );

  const updateItem = (id: string, patch: Partial<EditableReviewItem>) => {
    setReviewItems((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    setReviewItems((items) => items.filter((item) => item.id !== id));
  };

  const applyCandidate = (item: EditableReviewItem, candidateIndex: number) => {
    const suggestion = item.source.candidateProducts?.[candidateIndex]?.suggestedPantryItem;
    if (!suggestion) {
      updateItem(item.id, { selectedCandidateIndex: candidateIndex });
      return;
    }

    updateItem(item.id, {
      selectedCandidateIndex: candidateIndex,
      selected: Boolean(suggestion.readyForBulkAdd),
      barcode: suggestion.barcode ?? "",
      name: suggestion.name ?? item.name,
      kcalPerPackage: suggestion.kcalPerPackage ?? 0,
      quantity: suggestion.quantity ?? item.quantity,
      packageQuantity: suggestion.packageQuantity ?? "",
      nutriments: suggestion.nutriments ?? null,
    });
  };

  const handleSubmit = async () => {
    if (!session) {
      setErrorMessage("Receipt review session was not found. Please upload a receipt again.");
      return;
    }

    const items: PantryBulkAddItem[] = reviewItems
      .filter((item) => item.selected)
      .map((item) => ({
        barcode: item.barcode.trim(),
        name: item.name.trim(),
        amount: item.quantity,
        amountUnit: "package",
        kcalPerPackage: item.kcalPerPackage,
        packageQuantity: item.packageQuantity || null,
        nutriments: item.nutriments,
        expirationDate: item.expirationDate ? item.expirationDate.format("YYYY-MM-DD") : null,
      }));

    if (items.length === 0) {
      setErrorMessage("Please select at least one item to add to the pantry.");
      return;
    }
    if (items.some((item) => !item.barcode || !item.name || item.amount <= 0 || item.kcalPerPackage < 0)) {
      setErrorMessage("Please make sure every selected item has a barcode, name, calories, and positive quantity.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await api.post(`/households/${session.householdId}/pantry/bulk-add`, { items });
      clearSession();
      message.success(`${items.length} receipt item${items.length === 1 ? "" : "s"} added to pantry.`);
      router.push(`/households/${session.householdId}/stats`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not add selected receipt items to pantry.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!session) {
    return (
      <VirtualPantryAppShell activeNav="pantry">
        <Card style={{ ...cardStyle, maxWidth: 860, margin: "0 auto" }} styles={{ body: cardBodyStyle }}>
          <Empty description="No receipt analysis found in this browser session." />
          <Button type="primary" onClick={() => router.push("/pantry/add/receipt")} style={{ marginTop: 16 }}>
            Upload a receipt first
          </Button>
        </Card>
      </VirtualPantryAppShell>
    );
  }

  return (
    <VirtualPantryAppShell activeNav="pantry">
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <Space orientation="vertical" size="large" style={{ width: "100%", display: "flex" }}>
          <header>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => router.push("/pantry/add/receipt")}
              style={{ marginBottom: 18, borderRadius: 12, fontWeight: 600 }}
            >
              Back to upload
            </Button>
            <div>
              <Tag color="green" style={{ borderRadius: 999, paddingInline: 12, fontWeight: 600 }}>
                Receipt review
              </Tag>
              <Title level={1} style={{ margin: "12px 0 0", color: headingGreen }}>
                Review extracted items
              </Title>
              <Paragraph style={{ maxWidth: 760, marginBottom: 0, color: textSecondary, fontSize: 18 }}>
                Confirm the best product match for each receipt line, edit anything that looks off,
                then add selected items to your pantry in one bulk action.
              </Paragraph>
            </div>
          </header>

          {errorMessage ? <Alert type="error" showIcon title="Review issue" description={errorMessage} /> : null}

          <Alert
            type="info"
            showIcon
            title={`${selectedCount} selected, ${readySelectedCount} ready to add`}
            description={`Receipt source: ${session.result.merchantName ?? "Unknown merchant"} · ${reviewItems.length} extracted line item${reviewItems.length === 1 ? "" : "s"}.`}
          />

          {reviewItems.map((item, index) => {
            const candidates = item.source.candidateProducts ?? [];
            return (
              <Card key={item.id} style={cardStyle} styles={{ body: cardBodyStyle }}>
                <Row gutter={[24, 24]}>
                  <Col xs={24} lg={8}>
                    <Space orientation="vertical" size="middle" style={{ width: "100%", display: "flex" }}>
                      <Checkbox checked={item.selected} onChange={(event) => updateItem(item.id, { selected: event.target.checked })}>
                        <span style={{ color: textPrimary, fontWeight: 600 }}>Select item #{index + 1}</span>
                      </Checkbox>
                      <div>
                        <Text type="secondary">OCR text</Text>
                        <Title level={4} style={{ margin: "4px 0 0", color: headingGreen }}>{item.source.description ?? "Untitled receipt line"}</Title>
                      </div>
                      <Space wrap>
                        <Tag color={confidenceColor(item.source.matchConfidence)}>
                          {item.source.matchConfidence ?? "REVIEW"}
                        </Tag>
                        <Tag>{item.source.matchStatus ?? "UNKNOWN_MATCH"}</Tag>
                        {typeof item.source.matchScore === "number" ? <Tag>{Math.round(item.source.matchScore * 100)}% match</Tag> : null}
                      </Space>
                      {item.source.normalizedDescription ? (
                        <Text type="secondary">Normalized: {item.source.normalizedDescription}</Text>
                      ) : null}
                      <Button danger icon={<DeleteOutlined />} onClick={() => removeItem(item.id)}>
                        Remove from review
                      </Button>
                    </Space>
                  </Col>

                  <Col xs={24} lg={8}>
                    <Text strong style={{ color: headingGreen }}>Suggested matches</Text>
                    {candidates.length > 0 ? (
                      <Radio.Group
                        value={item.selectedCandidateIndex}
                        onChange={(event) => applyCandidate(item, Number(event.target.value))}
                        style={{ width: "100%", marginTop: 12 }}
                      >
                        <Space orientation="vertical" style={{ width: "100%", display: "flex" }}>
                          {candidates.map((candidate, candidateIndex) => (
                            <Radio.Button
                              key={`${item.id}-${candidateIndex}`}
                              value={candidateIndex}
                              style={{
                                height: "auto",
                                padding: 12,
                                whiteSpace: "normal",
                                background: candidateIndex === item.selectedCandidateIndex ? "#eef8e8" : "#ffffff",
                                borderColor: candidateIndex === item.selectedCandidateIndex ? green : "#cbd8c0",
                                color: textPrimary,
                                borderRadius: 12,
                              }}
                            >
                              {candidateLabel(candidate, candidateIndex)}
                            </Radio.Button>
                          ))}
                        </Space>
                      </Radio.Group>
                    ) : (
                      <Alert type="warning" showIcon title="No reliable match" description="Edit the pantry item fields manually before adding." style={{ marginTop: 12 }} />
                    )}
                  </Col>

                  <Col xs={24} lg={8}>
                    <Text strong style={{ color: headingGreen }}>Pantry item to add</Text>
                    <Space orientation="vertical" size="small" style={{ width: "100%", display: "flex", marginTop: 12 }}>
                      <Input aria-label={`Barcode for item ${index + 1}`} placeholder="Barcode" value={item.barcode} onChange={(event) => updateItem(item.id, { barcode: event.target.value })} style={fieldStyle} />
                      <Input aria-label={`Name for item ${index + 1}`} placeholder="Product name" value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} style={fieldStyle} />
                      <InputNumber aria-label={`Quantity for item ${index + 1}`} min={1} value={item.quantity} onChange={(value) => updateItem(item.id, { quantity: Number(value ?? 1) })} style={{ ...fieldStyle, width: "100%" }} />
                      <InputNumber aria-label={`Calories for item ${index + 1}`} min={0} value={item.kcalPerPackage} onChange={(value) => updateItem(item.id, { kcalPerPackage: Number(value ?? 0) })} style={{ ...fieldStyle, width: "100%" }} />
                      <Input aria-label={`Package quantity for item ${index + 1}`} placeholder="Package quantity, e.g. 500g" value={item.packageQuantity} onChange={(event) => updateItem(item.id, { packageQuantity: event.target.value })} style={fieldStyle} />
                      <DatePicker
                        aria-label={`Expiration date for item ${index + 1}`}
                        placeholder="Expiration date (optional)"
                        value={item.expirationDate}
                        onChange={(date) => updateItem(item.id, { expirationDate: date })}
                        format="YYYY-MM-DD"
                        style={{ ...fieldStyle, width: "100%" }}
                      />
                    </Space>
                  </Col>
                </Row>
              </Card>
            );
          })}

          <Card style={cardStyle} styles={{ body: cardBodyStyle }}>
            <Space style={{ width: "100%", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div>
                <Title level={3} style={{ margin: 0, color: headingGreen }}>Add selected items</Title>
                <Paragraph style={{ marginBottom: 0, color: textSecondary }}>
                  This calls the pantry bulk-add endpoint and broadcasts the pantry update in real time.
                </Paragraph>
              </div>
              <Button
                type="primary"
                size="large"
                icon={<ShoppingCartOutlined />}
                loading={isSubmitting}
                disabled={selectedCount === 0}
                onClick={() => void handleSubmit()}
              >
                Add selected items to pantry
              </Button>
            </Space>
            <Divider />
            <Space>
              <CheckCircleOutlined style={{ color: green }} />
              <Text type="secondary">You can still edit every selected field before confirming.</Text>
            </Space>
          </Card>
        </Space>
      </div>
    </VirtualPantryAppShell>
  );
}

function ReceiptReviewPageContent() {
  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.defaultAlgorithm,
        token: {
          colorText: "#182418",
          colorTextSecondary: "#566556",
          colorBgBase: "#ffffff",
          colorBgContainer: "#ffffff",
          colorBorder: "#cbd8c0",
          colorPrimary: "#1f7a3f",
          colorPrimaryHover: "#2a8f4b",
        },
      }}
    >
      <ReceiptReviewPageInner />
    </ConfigProvider>
  );
}

export default function ReceiptReviewPage() {
  return (
    <Suspense>
      <ReceiptReviewPageContent />
    </Suspense>
  );
}
