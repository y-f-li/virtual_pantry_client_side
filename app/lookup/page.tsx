"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import type { Product } from "@/types/product";
import { Button, Card, Form, Input, Space, Table, Typography, message } from "antd";
import type { TableProps } from "antd";
import type { ApplicationError } from "@/types/error";

const { Title, Text } = Typography;

export default function LookupPage() {
  const router = useRouter();
  const api = useApi();

  const [barcode, setBarcode] = useState("");
  const [query, setQuery] = useState("");
  const [barcodeResult, setBarcodeResult] = useState<Product | null>(null);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) router.replace("/login");
  }, [router]);

  const addToPantry = async (product: Product) => {
    try {
      await api.post("/pantry", {
        barcode: product.barcode,
        name: product.name,
        kcalPerPackage: product.kcalPerPackage,
        count: 1,
      });
      message.success(`${product.name ?? "Product"} added to pantry.`);
      router.push("/pantry");
    } catch (error) {
      const appError = error as Partial<ApplicationError>;
      message.error(appError.message ?? "Failed to add product to pantry.");
    }
  };

  const onLookupBarcode = async () => {
    if (!barcode.trim()) {
      message.warning("Please enter a barcode.");
      return;
    }

    try {
      setLoading(true);
      const result = await api.get<Product>(`/products/lookup?barcode=${encodeURIComponent(barcode.trim())}`);
      setBarcodeResult(result);
    } catch (error) {
      const appError = error as Partial<ApplicationError>;
      setBarcodeResult(null);
      message.error(appError.message ?? "Barcode lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  const onSearch = async () => {
    if (!query.trim()) {
      message.warning("Please enter a search term.");
      return;
    }

    try {
      setLoading(true);
      const results = await api.get<Product[]>(`/products/search?q=${encodeURIComponent(query.trim())}`);
      setSearchResults(results);
    } catch (error) {
      const appError = error as Partial<ApplicationError>;
      setSearchResults([]);
      message.error(appError.message ?? "Search failed.");
    } finally {
      setLoading(false);
    }
  };

  const columns: TableProps<Product>["columns"] = useMemo(
    () => [
      {
        title: "Name",
        dataIndex: "name",
        key: "name",
      },
      {
        title: "Brand",
        dataIndex: "brand",
        key: "brand",
      },
      {
        title: "Barcode",
        dataIndex: "barcode",
        key: "barcode",
      },
      {
        title: "kcal / package",
        key: "kcalPerPackage",
        render: (_, record) =>
          record.kcalPerPackage == null ? "—" : Math.round(record.kcalPerPackage),
      },
      {
        title: "Action",
        key: "action",
        render: (_, record) => (
          <Button
            type="primary"
            onClick={() => addToPantry(record)}
            disabled={!record.barcode && !record.name}
          >
            Add to pantry
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="card-container">
      <Card style={{ width: 1000 }}>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <div>
              <Title level={3} style={{ margin: 0 }}>
                Product Lookup
              </Title>
              <Text type="secondary">
                Search OpenFoodFacts and send selected products into the shared pantry.
              </Text>
            </div>
            <Space wrap>
              <Button onClick={() => router.push("/pantry")}>Pantry</Button>
              <Button onClick={() => router.push("/users")}>Users</Button>
              <Button onClick={() => router.push("/")}>Home</Button>
            </Space>
          </Space>

          <Card size="small" title="Barcode lookup">
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

              {barcodeResult && (
                <Card type="inner" title={barcodeResult.name ?? "(unknown)"}>
                  <Space direction="vertical">
                    <Text>Brand: {barcodeResult.brand ?? "—"}</Text>
                    <Text>Barcode: {barcodeResult.barcode ?? "—"}</Text>
                    <Text>
                      kcal / package (est.):{" "}
                      {barcodeResult.kcalPerPackage == null
                        ? "—"
                        : Math.round(barcodeResult.kcalPerPackage)}
                    </Text>
                    <Button type="primary" onClick={() => addToPantry(barcodeResult)}>
                      Add to pantry
                    </Button>
                  </Space>
                </Card>
              )}
            </Space>
          </Card>

          <Card size="small" title="Keyword search">
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              <Form layout="vertical">
                <Form.Item label="Search term">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. milk"
                  />
                </Form.Item>
                <Button type="primary" loading={loading} onClick={onSearch}>
                  Search
                </Button>
              </Form>

              <Table<Product>
                columns={columns}
                dataSource={searchResults}
                rowKey={(record, index) => record.barcode ?? `${record.name ?? "product"}-${index}`}
                pagination={{ pageSize: 10 }}
              />
            </Space>
          </Card>
        </Space>
      </Card>
    </div>
  );
}
