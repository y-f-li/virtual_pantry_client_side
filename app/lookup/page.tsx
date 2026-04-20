"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import type { Product } from "@/types/product";
import { Button, Card, Form, Input, InputNumber, Space, Typography, message } from "antd";
import type { ApplicationError } from "@/types/error";
import { getActiveToken, isGuestMode } from "@/utils/authStorage";
import { useLogout } from "@/hooks/useLogout";

const { Title, Text, Paragraph } = Typography;

const DEMO_BARCODE_EXAMPLES = [
  { barcode: "5000168198514", name: "Sablés chocolat – McVitie's" },
  { barcode: "7613404535318", name: "Lait UHT" },
  { barcode: "7613404249895", name: "Vollkorn Complet Integrale" },
] as const;

interface OpenFoodFactsImageResponse {
  product?: {
    image_front_url?: string;
    image_url?: string;
    selected_images?: unknown;
  };
}

function isLikelyImageUrl(value: string): boolean {
  return /^https?:\/\/[^\s]+\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(value);
}

function findImageUrl(value: unknown): string | null {
  if (typeof value === "string") {
    return isLikelyImageUrl(value) ? value : null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nestedMatch = findImageUrl(entry);
      if (nestedMatch) {
        return nestedMatch;
      }
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value)) {
      const nestedMatch = findImageUrl(nestedValue);
      if (nestedMatch) {
        return nestedMatch;
      }
    }
  }

  return null;
}

async function fetchProductImageUrl(barcode: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.net/api/v2/product/${encodeURIComponent(barcode)}?fields=image_front_url,image_url,selected_images`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as OpenFoodFactsImageResponse;
    return (
      data.product?.image_front_url ??
      findImageUrl(data.product?.selected_images) ??
      data.product?.image_url ??
      null
    );
  } catch {
    return null;
  }
}

export default function LookupPage() {
  const router = useRouter();
  const api = useApi();
  const logout = useLogout();
  const [guest, setGuest] = useState(false);

  const [barcode, setBarcode] = useState("");
  const [barcodeResult, setBarcodeResult] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setGuest(isGuestMode());
    const token = getActiveToken();
    if (!token) router.replace("/login");
  }, [router]);

  const addToPantry = async (product: Product, count: number) => {
    try {
      setAdding(true);
      await api.post("/pantry", {
        barcode: product.barcode,
        name: product.name,
        kcalPerPackage: product.kcalPerPackage,
        count,
      });
      message.success(`${count} ${count === 1 ? "item" : "items"} added to pantry.`);
      router.push("/pantry");
    } catch (error) {
      const appError = error as Partial<ApplicationError>;
      message.error(appError.message ?? "Failed to add product to pantry.");
    } finally {
      setAdding(false);
    }
  };

  const lookupBarcodeValue = async (barcodeValue: string) => {
    try {
      setLoading(true);
      setBarcodeResult(null);
      setQuantity(1);
      const result = await api.get<Product>(
        `/products/lookup?barcode=${encodeURIComponent(barcodeValue)}`,
      );
      const imageUrl = result.barcode ? await fetchProductImageUrl(result.barcode) : null;
      setBarcodeResult({ ...result, imageUrl });
    } catch (error) {
      const appError = error as Partial<ApplicationError>;
      setBarcodeResult(null);
      message.error(appError.message ?? "Barcode lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  const onLookupBarcode = async () => {
    const trimmedBarcode = barcode.trim();
    if (!trimmedBarcode) {
      message.warning("Please enter a barcode.");
      return;
    }

    await lookupBarcodeValue(trimmedBarcode);
  };

  const onUseDemoBarcode = async (barcodeValue: string, itemName: string) => {
    setBarcode(barcodeValue);
    message.success(`Loaded example barcode for ${itemName}.`);
    await lookupBarcodeValue(barcodeValue);
  };

  return (
    <div className="app-page">
      <div className="app-shell">
        <Card className="hero-card">
          <div className="page-toolbar">
            <div>
              <Title level={2} className="page-heading">
                Product Lookup
              </Title>
              <Paragraph className="page-subtitle">via OpenFoodFacts API</Paragraph>
              <Paragraph style={{ marginTop: 12, marginBottom: 0, color: "var(--text-soft)" }}>
                Look up an item, then add to pantry.
              </Paragraph>
              {guest ? (
                <div className="soft-note" style={{ marginTop: 14 }}>
                  You are currently in guest demo mode.
                </div>
              ) : null}
            </div>
            <div className="page-toolbar-actions">
              <Button type="primary" onClick={() => router.push("/pantry")}>Pantry</Button>
              {!guest ? <Button onClick={() => router.push("/users")}>Users</Button> : null}
              <Button onClick={() => router.push("/")}>Home</Button>
              {guest ? <Button danger onClick={logout}>Exit demo</Button> : null}
            </div>
          </div>
        </Card>

        <Card className="section-card" title="Barcode lookup">
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Form layout="vertical">
              <Form.Item label="Barcode">
                <Input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="e.g. 3017620422003"
                />
              </Form.Item>
              <Button type="primary" loading={loading} onClick={onLookupBarcode}>
                Lookup
              </Button>
            </Form>

            {guest ? (
              <div className="demo-helper-panel">
                <div>
                  <Text strong className="demo-helper-title">
                    Example barcodes for demo
                  </Text>
                  <Paragraph className="demo-helper-copy">
                    Tap any example below to load a barcode into the search and try the pantry flow right away.
                  </Paragraph>
                </div>
                <Space direction="vertical" size="small" style={{ width: "100%" }}>
                  {DEMO_BARCODE_EXAMPLES.map((example) => (
                    <Button
                      key={example.barcode}
                      className="demo-example-button"
                      onClick={() => onUseDemoBarcode(example.barcode, example.name)}
                    >
                      <span className="demo-example-barcode">{example.barcode}</span>
                      <span className="demo-example-name">{example.name}</span>
                    </Button>
                  ))}
                </Space>
              </div>
            ) : null}

            {barcodeResult ? (
              <Card className="lookup-result-card">
                <div className="lookup-result-layout">
                  <div className="lookup-result-image-wrap">
                    {barcodeResult.imageUrl ? (
                      <img
                        src={barcodeResult.imageUrl}
                        alt={barcodeResult.name ?? "Product image"}
                        className="lookup-result-image"
                      />
                    ) : (
                      <div className="lookup-result-image-fallback">No image</div>
                    )}
                  </div>

                  <div className="lookup-result-copy">
                    <Text strong className="lookup-result-title">
                      {barcodeResult.name ?? "(unknown)"}
                    </Text>
                    <Text>Brand: {barcodeResult.brand ?? "—"}</Text>
                    <Text>Barcode: {barcodeResult.barcode ?? "—"}</Text>
                    <Text>
                      kcal / package (est.):{" "}
                      {barcodeResult.kcalPerPackage == null
                        ? "—"
                        : Math.round(barcodeResult.kcalPerPackage)}
                    </Text>

                    <div className="lookup-result-actions">
                      <Space wrap>
                        <Text>Quantity to add:</Text>
                        <InputNumber
                          min={1}
                          value={quantity}
                          onChange={(value) => setQuantity(Number(value ?? 1))}
                        />
                        <Button
                          type="primary"
                          onClick={() => addToPantry(barcodeResult, quantity)}
                          loading={adding}
                        >
                          Add to pantry
                        </Button>
                      </Space>
                    </div>
                  </div>
                </div>
              </Card>
            ) : null}
          </Space>
        </Card>
      </div>
    </div>
  );
}
