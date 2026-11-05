"use client";

import { useRef, useState } from "react";
import { App, Button, Card, Input, Space } from "antd";
import { useApi } from "@/hooks/useApi";
import type { ConsumptionUnit, ConsumePantryItemResponse, PantryItem } from "@/types/pantry";
import styles from "@/styles/stats.module.css";
import {
  AIConsumptionDraftModal,
  type DraftItem,
  type EditableDraftItem,
} from "./AIConsumptionDraftModal";

type DraftResponse = { items: DraftItem[] };

type Props = {
  householdId: number;
  pantryItems: PantryItem[];
  onConsumptionRecorded: () => void | Promise<void>;
};

export function AIConsumptionSection({ householdId, pantryItems, onConsumptionRecorded }: Props) {
  const api = useApi();
  const { message } = App.useApp();
  const [description, setDescription] = useState("");
  const [draftItems, setDraftItems] = useState<EditableDraftItem[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const generateDraft = async () => {
    if (!description.trim() || isGenerating || submittingRef.current) return;
    setIsGenerating(true);
    setDraftItems(null);
    try {
      const response = await api.post<DraftResponse>(
        `/households/${householdId}/pantry/consume-with-ai`,
        { description: description.trim() }
      );
      setDraftItems(response.items.map((item, index) => ({ ...item, rowId: index })));
    } catch {
      message.error("Could not generate consumption draft.");
    } finally {
      setIsGenerating(false);
    }
  };

  const canConfirm = draftItems !== null && draftItems.length > 0 && draftItems.every((item) => {
    const matched = pantryItems.find((p) => p.id === item.pantryItemId);
    if (!matched || item.amount === null || !Number.isFinite(item.amount) || item.amount <= 0 || !item.amountUnit) {
      return false;
    }
    const allowedUnits = matched.availableConsumptionUnits?.length
      ? matched.availableConsumptionUnits
      : [matched.amountUnit];
    return allowedUnits.includes(item.amountUnit as ConsumptionUnit);
  });

  const confirmDraft = async () => {
    if (submittingRef.current || !draftItems || !canConfirm) return;

    // The ref closes the gap before React rerenders the disabled button.
    submittingRef.current = true;
    setIsSubmitting(true);
    const submittedItems = draftItems;
    let recordedCount = 0;
    let failure: unknown = null;

    try {
      for (const item of submittedItems) {
        try {
          await api.post<ConsumePantryItemResponse>(
            `/households/${householdId}/pantry/${item.pantryItemId}/consume`,
            {
              amount: item.amount,
              amountUnit: item.amountUnit,
              kcalPerPackage: null,
              skipCalorieLogging: false,
            }
          );
          recordedCount++;
        } catch (error) {
          failure = error;
          break; // Never submit later rows after an earlier failure.
        }
      }

      if (recordedCount > 0) {
        // The already-recorded entries cannot be resubmitted from this draft.
        const remaining = submittedItems.slice(recordedCount);
        setDraftItems(remaining.length ? remaining : null);
        try {
          await onConsumptionRecorded();
        } catch {
          message.warning("Consumption was recorded, but the dashboard did not refresh. Reload the page.");
        }
      }

      if (failure) {
        const detail = failure instanceof Error ? failure.message.slice(0, 160) : "Request failed";
        message.error(
          `Recorded ${recordedCount} of ${submittedItems.length}. Remaining entries were not confirmed. Check inventory before retrying. ${detail}`,
          8
        );
      } else {
        setDescription("");
        message.success(`Recorded ${recordedCount} consumption entr${recordedCount === 1 ? "y" : "ies"}.`);
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Card className={styles.panelCard} title="AI Consumption Logging" variant="borderless">
        <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
          <Input.TextArea
            rows={3}
            placeholder="e.g. I ate 150 g of yogurt"
            value={description}
            disabled={isGenerating || isSubmitting}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Button
            type="primary"
            loading={isGenerating}
            disabled={!description.trim() || isSubmitting}
            onClick={() => void generateDraft()}
          >
            Generate draft
          </Button>
        </Space>
      </Card>

      <AIConsumptionDraftModal
        open={draftItems !== null}
        items={draftItems ?? []}
        pantryItems={pantryItems}
        submitting={isSubmitting}
        canConfirm={canConfirm}
        onChange={setDraftItems}
        onCancel={() => { if (!submittingRef.current) setDraftItems(null); }}
        onConfirm={() => void confirmDraft()}
      />
    </>
  );
}
