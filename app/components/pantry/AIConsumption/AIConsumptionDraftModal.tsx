"use client";

import { Button, Card, Col, Empty, InputNumber, Modal, Row, Select, Space, Typography } from "antd";
import type { PantryItem, ConsumptionUnit } from "@/types/pantry";

const { Text } = Typography;

export type DraftItem = {
  pantryItemId: number | null;
  sourcePhrase: string;
  amount: number | null;
  amountUnit: string | null;
};

export type EditableDraftItem = DraftItem & { rowId: number };

type Props = {
  open: boolean;
  items: EditableDraftItem[];
  pantryItems: PantryItem[];
  submitting: boolean;
  canConfirm: boolean;
  onChange: (items: EditableDraftItem[]) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

const UNIT_OPTIONS: ConsumptionUnit[] = ["g", "ml", "package", "serving"];

export function AIConsumptionDraftModal({
  open,
  items,
  pantryItems,
  submitting,
  canConfirm,
  onChange,
  onCancel,
  onConfirm,
}: Props) {
  const updateItem = (rowId: number, patch: Partial<EditableDraftItem>) => {
    onChange(items.map((item) => (item.rowId === rowId ? { ...item, ...patch } : item)));
  };

  const changePantryItem = (item: EditableDraftItem, pantryItemId: number | null) => {
    const matched = pantryItems.find((p) => p.id === pantryItemId);
    const allowed = matched?.availableConsumptionUnits?.length
      ? matched.availableConsumptionUnits
      : matched ? [matched.amountUnit] : [];

    updateItem(item.rowId, {
      pantryItemId,
      amountUnit: matched
        ? allowed.includes(item.amountUnit as ConsumptionUnit)
          ? item.amountUnit
          : matched.amountUnit
        : item.amountUnit,
    });
  };

  return (
    <Modal
      title="Review AI consumption draft"
      open={open}
      width={760}
      closable={!submitting}
      maskClosable={!submitting}
      keyboard={!submitting}
      onCancel={() => { if (!submitting) onCancel(); }}
      footer={
        <Space>
          <Button disabled={submitting} onClick={onCancel}>Discard draft</Button>
          <Button type="primary" loading={submitting} disabled={!canConfirm} onClick={onConfirm}>
            Confirm consumption
          </Button>
        </Space>
      }
    >
      <Space orientation="vertical" size="middle" style={{ width: "100%", maxHeight: "65vh", overflowY: "auto" }}>
        <Text type="secondary">Review carefully. Inventory and nutrient intake update only after confirmation.</Text>
        {items.length === 0 && <Empty description="No foods identified" />}

        {items.map((item) => {
          const matched = pantryItems.find((p) => p.id === item.pantryItemId);
          const availableUnits = matched?.availableConsumptionUnits?.length
            ? matched.availableConsumptionUnits
            : matched ? [matched.amountUnit] : UNIT_OPTIONS;
          const units = item.amountUnit && !availableUnits.includes(item.amountUnit as ConsumptionUnit)
            ? [item.amountUnit, ...availableUnits]
            : availableUnits;

          return (
            <Card size="small" key={item.rowId}>
              <Space orientation="vertical" size="small" style={{ width: "100%" }}>
                <Text type="secondary">From: {item.sourcePhrase}</Text>
                <Row gutter={[12, 12]}>
                  <Col xs={24} sm={12}>
                    <Text>Pantry item</Text>
                    <Select<number>
                      value={item.pantryItemId ?? undefined}
                      placeholder="Select pantry item"
                      allowClear
                      showSearch
                      disabled={submitting}
                      optionFilterProp="label"
                      style={{ width: "100%" }}
                      options={pantryItems.map((p) => ({ value: p.id, label: p.name }))}
                      onChange={(value) => changePantryItem(item, value ?? null)}
                    />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Text>Amount</Text>
                    <InputNumber
                      value={item.amount}
                      min={0.01}
                      step={0.1}
                      disabled={submitting}
                      style={{ width: "100%" }}
                      onChange={(value) => updateItem(item.rowId, { amount: value })}
                    />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Text>Unit</Text>
                    <Select<string>
                      value={item.amountUnit ?? undefined}
                      placeholder="Select unit"
                      allowClear
                      disabled={submitting}
                      style={{ width: "100%" }}
                      options={units.map((unit) => ({ value: unit, label: unit }))}
                      onChange={(value) => updateItem(item.rowId, { amountUnit: value ?? null })}
                    />
                  </Col>
                </Row>
                <Button
                  type="link"
                  danger
                  size="small"
                  disabled={submitting}
                  style={{ alignSelf: "flex-start", padding: 0 }}
                  onClick={() => onChange(items.filter((row) => row.rowId !== item.rowId))}
                >
                  Remove entry
                </Button>
              </Space>
            </Card>
          );
        })}
        <Text type="secondary">
          {canConfirm
            ? "Confirm uses your edited items and quantities, not the original AI suggestions."
            : "Select a current pantry item, a positive amount, and an available unit for every entry."}
        </Text>
      </Space>
    </Modal>
  );
}
