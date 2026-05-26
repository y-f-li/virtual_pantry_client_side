"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import type {
  Product,
  ProductSearchCandidate,
  ProductSearchResponse,
} from "@/types/product";
import type { ReceiptLineItem, ReceiptMatchedItem, ReceiptUploadSession } from "@/types/receipt";
import ProductResultCard from "@/components/products/ProductResultCard";
import {
  Alert,
  App,
  Button,
  Card,
  Image,
  Input,
  Space,
  Tag,
  Typography,
} from "antd";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import useSessionStorage from "@/hooks/useSessionStorage";
import { usePantryWebSocket } from "@/hooks/usePantryWebSocket";
import { VirtualPantryAppShell } from "@/components/VirtualPantryAppShell";
import type { HouseholdWithRole } from "@/types/household";
import styles from "@/styles/openFoodFacts.module.css";
import {
  ArrowLeftOutlined,
  CameraOutlined,
  EditOutlined,
  FileImageOutlined,
} from "@ant-design/icons";

const { Title, Paragraph } = Typography;

const PRODUCT_CANDIDATE_LIMIT = 10;

type PantryTarget = {
  householdId: number;
  householdName?: string;
};

function formatHouseholdValidationError(error: unknown): string {
  if (
    error instanceof Error &&
    error.message.includes("User is not a member")
  ) {
    return "You are not a member of this household.";
  }

  return "Household ID does not exist.";
}

type HouseholdLookup = {
  householdId: number;
  name: string;
};

type NameProductCardState = {
  candidate: ProductSearchCandidate;
  productIndex: number | null;
  status: "loading" | "loaded" | "error";
  product?: Product;
  errorMessage?: string;
};

function getProductImageUrl(product?: Product): string | null {
  return product?.imageUrl?.trim() || null;
}

function getProductDisplayName(
  product?: Product,
  candidate?: ProductSearchCandidate,
): string {
  return product?.name?.trim() || candidate?.name?.trim() || "Unnamed product";
}

function getProductBrand(
  product?: Product,
  candidate?: ProductSearchCandidate,
): string {
  return product?.brand?.trim() || candidate?.brand?.trim() || "Unknown brand";
}

function getProductBarcode(product?: Product): string {
  return product?.barcode?.trim() || "Barcode unavailable";
}

function isReceiptMatchedItem(item: unknown): item is ReceiptMatchedItem {
  return Boolean(item && typeof item === "object" && "matchStatus" in item);
}

function getReceiptItemKey(item: ReceiptMatchedItem, index: number): string {
  return `${index}-${item.description ?? "receipt-line"}`;
}

function getReceiptItemTitle(item: ReceiptMatchedItem): string {
  return (
    item.description?.trim() ||
    item.normalizedDescription?.trim() ||
    "Untitled receipt line"
  );
}

function getReceiptSearchQuery(item: ReceiptMatchedItem): string {
  return (
    item.productSearch?.normalizedQuery?.trim() ||
    item.normalizedDescription?.trim() ||
    item.description?.trim() ||
    ""
  );
}


function hasSearchNotice(response?: ProductSearchResponse | null): boolean {
  return Boolean(response?.message && response.status !== "OK");
}

function getSearchNoticeType(
  response?: ProductSearchResponse | null,
): "info" | "warning" {
  return response?.status === "TOO_MANY_MATCHES" || response?.status === "TOO_BROAD"
    ? "warning"
    : "info";
}

export default function OpenFoodFactsPortalPage() {
  return (
    <Suspense fallback={null}>
      <OpenFoodFactsPortalContent />
    </Suspense>
  );
}

function OpenFoodFactsPortalContent() {
  useAuthGuard();
  const api = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { message } = App.useApp();
  const { value: token } = useSessionStorage<string>("token", "");
  const { value: storedUserId } = useSessionStorage<string>("userId", "");
  const { value: cachedHouseholds, set: setHouseholds } = useSessionStorage<
    HouseholdWithRole[]
  >("households", []);
  const { clear: clearSelectedHouseholdId } = useSessionStorage<number | null>(
    "selectedHouseholdId",
    null,
  );
  const { value: receiptUploadSession, clear: clearReceiptUploadSession } =
    useSessionStorage<ReceiptUploadSession | null>(
      "receiptUploadSession",
      null,
    );
  const currentUserId = storedUserId ? Number(storedUserId) : null;
  const [barcode, setBarcode] = useState("");
  const [loading, setLoading] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<Product | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [nameSearchLoading, setNameSearchLoading] = useState(false);
  const [nameSearchResponse, setNameSearchResponse] =
    useState<ProductSearchResponse | null>(null);
  const [nameProductCards, setNameProductCards] = useState<
    NameProductCardState[]
  >([]);
  const [nameSelectedProduct, setNameSelectedProduct] =
    useState<Product | null>(null);
  const [receiptProductCards, setReceiptProductCards] = useState<
    Record<string, NameProductCardState[]>
  >({});
  const [receiptSelectedProducts, setReceiptSelectedProducts] = useState<
    Record<string, Product | null>
  >({});
  const nameResultsScrollRef = useRef<HTMLDivElement | null>(null);
  const receiptResultsRef = useRef<HTMLDivElement | null>(null);
  const barcodeLookupRef = useRef<HTMLDivElement | null>(null);
  const nameLookupRef = useRef<HTMLDivElement | null>(null);
  const [lookupMessage, setLookupMessage] = useState("");
  const [hasAutoLookedUp, setHasAutoLookedUp] = useState(false);
  const [validatedPantryTarget, setValidatedPantryTarget] =
    useState<PantryTarget | null>(null);
  const [validatingPantryTarget, setValidatingPantryTarget] = useState(true);

  const requestedPantryTarget = useMemo<PantryTarget | null>(() => {
    const householdIdParam = searchParams.get("householdId");
    if (householdIdParam === null) {
      return null;
    }

    const householdId = Number(householdIdParam);
    if (!Number.isInteger(householdId) || householdId <= 0) {
      return null;
    }

    return {
      householdId,
      householdName: searchParams.get("householdName") ?? undefined,
    };
  }, [searchParams]);

  const invalidPantryTargetMessage = useMemo(() => {
    const householdIdParam = searchParams.get("householdId");
    const householdNameParam = searchParams.get("householdName");

    if (householdIdParam === null) {
      return householdNameParam
        ? "Household ID is required when a household name is provided."
        : "";
    }

    const householdId = Number(householdIdParam);
    return Number.isInteger(householdId) && householdId > 0
      ? ""
      : "Household ID is invalid.";
  }, [searchParams]);

  const pantryTarget = validatedPantryTarget;

  const receiptItems = useMemo<ReceiptMatchedItem[]>(() => {
    if (!receiptUploadSession?.result.items) {
      return [];
    }

    if (
      pantryTarget &&
      receiptUploadSession.householdId !== pantryTarget.householdId
    ) {
      return [];
    }

    return (receiptUploadSession.result.items as (ReceiptLineItem | ReceiptMatchedItem)[]).filter(isReceiptMatchedItem);
  }, [pantryTarget, receiptUploadSession]);

  const hasReceiptResults = receiptItems.length > 0;

  usePantryWebSocket({
    householdId: requestedPantryTarget?.householdId ?? null,
    token,
    onMessage: (msg) => {
      if (
        msg.eventType === "HOUSEHOLD_DELETED" ||
        (msg.eventType === "MEMBER_REMOVED" &&
          msg.removedUserId === currentUserId)
      ) {
        setHouseholds(
          cachedHouseholds.filter(
            (h) => h.householdId !== requestedPantryTarget?.householdId,
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

  useEffect(() => {
    let cancelled = false;

    const rejectInvalidTarget = (text: string) => {
      if (cancelled) {
        return;
      }

      setValidatedPantryTarget(null);
      setValidatingPantryTarget(false);
      message.error(text);

      if (globalThis.window.history.length > 1) {
        router.back();
      } else {
        router.replace("/households");
      }
    };

    const validatePantryTarget = async () => {
      if (invalidPantryTargetMessage) {
        rejectInvalidTarget(invalidPantryTargetMessage);
        return;
      }

      if (!requestedPantryTarget) {
        setValidatedPantryTarget(null);
        setValidatingPantryTarget(false);
        return;
      }

      setValidatingPantryTarget(true);
      try {
        const household = await api.get<HouseholdLookup>(
          `/households/${requestedPantryTarget.householdId}`,
        );

        if (cancelled) {
          return;
        }

        const requestedName = requestedPantryTarget.householdName?.trim();
        if (requestedName && requestedName !== household.name) {
          rejectInvalidTarget(
            "Household name does not exist for this household.",
          );
          return;
        }

        setValidatedPantryTarget({
          householdId: requestedPantryTarget.householdId,
          householdName: household.name,
        });
        setValidatingPantryTarget(false);
      } catch (error) {
        rejectInvalidTarget(formatHouseholdValidationError(error));
      }
    };

    void validatePantryTarget();

    return () => {
      cancelled = true;
    };
  }, [api, invalidPantryTargetMessage, message, requestedPantryTarget, router]);

  const backToPantryStats = useCallback(() => {
    const householdId = Number(searchParams.get("householdId"));
    if (Number.isFinite(householdId) && householdId > 0) {
      router.push(`/households/${householdId}/stats`);
      return;
    }

    router.push("/households");
  }, [router, searchParams]);

  const buildPantryActionUrl = useCallback(
    (path: string) => {
      if (!pantryTarget) {
        return path;
      }

      return `${path}?householdId=${pantryTarget.householdId}&householdName=${encodeURIComponent(
        pantryTarget.householdName ?? `Household ${pantryTarget.householdId}`,
      )}`;
    },
    [pantryTarget],
  );

  const lookupBarcode = useCallback(
    async (barcodeValue: string) => {
      const barcodeToLookup = barcodeValue.trim();
      if (!barcodeToLookup) {
        alert("Please enter a barcode first.");
        return;
      }

      setLookupMessage("");
      setLoading(true);
      try {
        const result = await api.get<Product>(
          `/products/lookup?barcode=${encodeURIComponent(barcodeToLookup)}`,
        );
        setBarcodeResult(result);
        setBarcode(barcodeToLookup);
        setLookupMessage("");
      } catch {
        setBarcodeResult(null);
        setLookupMessage("Cannot find the item using the barcode.");
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  const searchByName = useCallback(async () => {
    const query = nameQuery.trim();
    if (!query) {
      message.warning("Please enter a product name first.");
      return;
    }

    setNameSelectedProduct(null);
    setNameProductCards([]);
    setNameSearchLoading(true);
    try {
      const result = await api.get<ProductSearchResponse>(
        `/products/search?q=${encodeURIComponent(query)}&limit=${PRODUCT_CANDIDATE_LIMIT}`,
      );
      setNameSearchResponse(result);

      const candidates = (result.candidates ?? []).slice(0, PRODUCT_CANDIDATE_LIMIT);
      const initialCards: NameProductCardState[] = candidates.map(
        (candidate) => ({
          candidate,
          productIndex: candidate.productIndex,
          status: candidate.productIndex ? "loading" : "error",
          errorMessage: candidate.productIndex
            ? undefined
            : "Cannot find this product",
        }),
      );

      setNameProductCards(initialCards);

      if (candidates.length === 0) {
        return;
      }

      const loadedCards = await Promise.all(
        candidates.map(async (candidate): Promise<NameProductCardState> => {
          if (!candidate.productIndex) {
            return {
              candidate,
              productIndex: null,
              status: "error",
              errorMessage: "Cannot find this product",
            };
          }

          try {
            const product = await api.get<Product>(
              `/products/index/${encodeURIComponent(String(candidate.productIndex))}`,
            );

            return {
              candidate,
              productIndex: candidate.productIndex,
              status: "loaded",
              product,
            };
          } catch {
            return {
              candidate,
              productIndex: candidate.productIndex,
              status: "error",
              errorMessage: "Cannot find this product",
            };
          }
        }),
      );

      setNameProductCards(loadedCards);
    } catch {
      setNameSearchResponse({
        query,
        normalizedQuery: query,
        status: "ERROR",
        message: "Product name search is currently unavailable.",
        totalCandidateCount: 0,
        anchorTokens: [],
        auxiliaryTokens: [],
        candidates: [],
      });
      setNameProductCards([]);
    } finally {
      setNameSearchLoading(false);
    }
  }, [api, message, nameQuery]);

  useEffect(() => {
    let cancelled = false;

    const loadReceiptProductCards = async () => {
      const initialCards: Record<string, NameProductCardState[]> = {};

      for (let index = 0; index < receiptItems.length; index += 1) {
        const item = receiptItems[index];
        const candidates = (item.productSearch?.candidates ?? []).slice(0, PRODUCT_CANDIDATE_LIMIT);
        initialCards[getReceiptItemKey(item, index)] = candidates.map(
          (candidate) => ({
            candidate,
            productIndex: candidate.productIndex,
            status: candidate.productIndex ? "loading" : "error",
            errorMessage: candidate.productIndex
              ? undefined
              : "Cannot find this product",
          }),
        );
      }

      setReceiptProductCards(initialCards);
      setReceiptSelectedProducts({});

      const loadedEntries = await Promise.all(
        receiptItems.map(
          async (item, index): Promise<[string, NameProductCardState[]]> => {
            const itemKey = getReceiptItemKey(item, index);
            const candidates = (item.productSearch?.candidates ?? []).slice(
              0,
              PRODUCT_CANDIDATE_LIMIT,
            );
            const loadedCards = await Promise.all(
              candidates.map(
                async (candidate): Promise<NameProductCardState> => {
                  if (!candidate.productIndex) {
                    return {
                      candidate,
                      productIndex: null,
                      status: "error",
                      errorMessage: "Cannot find this product",
                    };
                  }

                  try {
                    const product = await api.get<Product>(
                      `/products/index/${encodeURIComponent(String(candidate.productIndex))}`,
                    );

                    return {
                      candidate,
                      productIndex: candidate.productIndex,
                      status: "loaded",
                      product,
                    };
                  } catch {
                    return {
                      candidate,
                      productIndex: candidate.productIndex,
                      status: "error",
                      errorMessage: "Cannot find this product",
                    };
                  }
                },
              ),
            );

            return [itemKey, loadedCards];
          },
        ),
      );

      if (!cancelled) {
        setReceiptProductCards(Object.fromEntries(loadedEntries));
      }
    };

    if (receiptItems.length === 0) {
      setReceiptProductCards({});
      setReceiptSelectedProducts({});
      return undefined;
    }

    void loadReceiptProductCards();

    return () => {
      cancelled = true;
    };
  }, [api, receiptItems]);

  const selectNameProductCard = useCallback((card: NameProductCardState) => {
    if (card.status !== "loaded" || !card.product) {
      return;
    }

    setNameSelectedProduct(card.product);
  }, []);

  const selectReceiptProductCard = useCallback(
    (itemKey: string, card: NameProductCardState) => {
      if (card.status !== "loaded" || !card.product) {
        return;
      }

      setReceiptSelectedProducts((current) => ({
        ...current,
        [itemKey]: card.product ?? null,
      }));
    },
    [],
  );

  const focusNameSearchForReceipt = useCallback(() => {
    nameLookupRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const focusBarcodeLookupForReceipt = useCallback(() => {
    barcodeLookupRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const clearReceiptResults = useCallback(() => {
    clearReceiptUploadSession();
    setReceiptProductCards({});
    setReceiptSelectedProducts({});
  }, [clearReceiptUploadSession]);

  useEffect(() => {
    if (!hasReceiptResults) {
      return undefined;
    }

    let retryTimeoutId: number | undefined;

    const scrollToReceiptResults = () => {
      const receiptResultsElement = receiptResultsRef.current;
      if (!receiptResultsElement) {
        return;
      }

      receiptResultsElement.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      const targetTop =
        receiptResultsElement.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({
        top: Math.max(targetTop, 0),
        behavior: "smooth",
      });
    };

    const animationFrameId = window.requestAnimationFrame(() => {
      scrollToReceiptResults();
      retryTimeoutId = window.setTimeout(scrollToReceiptResults, 250);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      if (retryTimeoutId !== undefined) {
        window.clearTimeout(retryTimeoutId);
      }
    };
  }, [hasReceiptResults, receiptProductCards]);

  const scrollNameResults = useCallback((direction: "left" | "right") => {
    nameResultsScrollRef.current?.scrollBy({
      left: direction === "left" ? -520 : 520,
      behavior: "smooth",
    });
  }, []);

  // This useEffect is used by pantry/add/scan. Wait until the household target is validated
  // so an invalid household URL cannot render product results or create an add-to-pantry flow.
  useEffect(() => {
    if (validatingPantryTarget || hasAutoLookedUp) {
      return;
    }

    if (requestedPantryTarget && !validatedPantryTarget) {
      return;
    }

    const barcodeFromQuery = searchParams.get("barcode")?.trim();

    if (!barcodeFromQuery) {
      return;
    }

    setHasAutoLookedUp(true);
    setBarcode(barcodeFromQuery);
    void lookupBarcode(barcodeFromQuery);
  }, [
    hasAutoLookedUp,
    lookupBarcode,
    requestedPantryTarget,
    searchParams,
    validatedPantryTarget,
    validatingPantryTarget,
  ]);

  if (
    validatingPantryTarget ||
    (requestedPantryTarget && !validatedPantryTarget)
  ) {
    return null;
  }

  return (
    <VirtualPantryAppShell activeNav="pantry">
      <header className={styles.pageHeader}>
        <Button
          size="middle"
          icon={<ArrowLeftOutlined />}
          onClick={backToPantryStats}
          style={{ marginBottom: 18, borderRadius: 12, fontWeight: 600 }}
        >
          {pantryTarget ? "Pantry stats" : "Manage"}
        </Button>
        <Title level={1} className={styles.pageTitle}>
          Product Lookup Portal
        </Title>
        <Paragraph className={styles.pageSubtitle}>
          Search the local product dataset by barcode or product name and add
          matching products straight into your pantry flow.
        </Paragraph>
      </header>

      <Card className={styles.contextCard}>
        <div className={styles.contextLabel}>Current flow</div>
        <div className={styles.contextValue}>
          {pantryTarget?.householdName?.trim() || "Direct product lookup"}
        </div>
        <p className={styles.contextNote}>
          {pantryTarget
            ? `Products found here can be added directly to household ${pantryTarget.householdId}.`
            : "Look up a barcode first, then review the returned product details below."}
        </p>
      </Card>

      <Card className={styles.actionCard}>
        <div className={styles.actionCardHeader}>
          <div>
            <div className={styles.contextLabel}>Other add flows</div>
            <div className={styles.actionTitle}>Continue with another input method</div>
          </div>
          <Space wrap>
            <Button
              icon={<CameraOutlined />}
              onClick={() => router.push(buildPantryActionUrl("/pantry/add/scan"))}
            >
              Scan package barcode
            </Button>
            <Button
              icon={<CameraOutlined />}
              onClick={() => router.push(buildPantryActionUrl("/pantry/add/recognize"))}
              disabled={!pantryTarget}
            >
              Recognize food from photo
            </Button>
            <Button
              icon={<FileImageOutlined />}
              onClick={() => router.push(buildPantryActionUrl("/pantry/add/receipt"))}
              disabled={!pantryTarget}
            >
              Upload receipt
            </Button>
            <Button
              icon={<EditOutlined />}
              onClick={() => router.push(buildPantryActionUrl("/pantry/add/manual"))}
              disabled={!pantryTarget}
            >
              Add manually
            </Button>
          </Space>
        </div>
      </Card>

      <div ref={barcodeLookupRef}>
        <Card title="Barcode lookup" className={styles.sectionCard}>
          <Space orientation="vertical" size="large" style={{ width: "100%" }}>
            <p className={styles.sectionIntro}>
              Use this when you know the barcode. Its result stays in this
              section and will not overwrite name-search or receipt results.
            </p>

            <div className={styles.lookupStack}>
              <label className={styles.lookupLabel}>
                <span>Barcode</span>
                <Input
                  value={barcode}
                  onChange={(event) => {
                    setBarcode(event.target.value);
                    setBarcodeResult(null);
                    if (lookupMessage) {
                      setLookupMessage("");
                    }
                  }}
                  onPressEnter={() => void lookupBarcode(barcode)}
                  placeholder="e.g. 3017624010701"
                />
              </label>

              <div className={styles.lookupActions}>
                <Button
                  type="primary"
                  className={styles.primaryBtn}
                  onClick={() => void lookupBarcode(barcode)}
                  loading={loading}
                >
                  {loading ? "Looking up..." : "Look up barcode"}
                </Button>
              </div>
            </div>

            {lookupMessage ? (
              <div role="alert" className={styles.inlineError}>
                {lookupMessage}
              </div>
            ) : null}

            {barcodeResult ? (
              <div className={styles.lookupResultPanel}>
                <div className={styles.lookupResultLabel}>
                  Barcode lookup result
                </div>
                <ProductResultCard
                  product={barcodeResult}
                  rawTitle=""
                  exportContext="Product lookup"
                  pantryContext={pantryTarget ?? undefined}
                />
              </div>
            ) : null}
          </Space>
        </Card>
      </div>

      <div ref={nameLookupRef}>
        <Card
          title="Search by product name"
          className={styles.sectionCard}
          style={{ marginTop: 24 }}
        >
          <Space orientation="vertical" size="large" style={{ width: "100%" }}>
            <p className={styles.sectionIntro}>
              Search the local dataset by product name. Selecting a candidate
              shows the full product card here without changing the barcode lookup.
            </p>

            <div className={styles.lookupStack}>
              <label className={styles.lookupLabel}>
                <span>Product name</span>
                <Input
                  value={nameQuery}
                  onChange={(event) => {
                    setNameQuery(event.target.value);
                    setNameSearchResponse(null);
                    setNameProductCards([]);
                    setNameSelectedProduct(null);
                  }}
                  onPressEnter={() => void searchByName()}
                  placeholder="e.g. TIK UDON Noodles"
                />
              </label>

              <div className={styles.lookupActions}>
                <Button
                  type="primary"
                  className={styles.primaryBtn}
                  onClick={() => void searchByName()}
                  loading={nameSearchLoading}
                >
                  {nameSearchLoading ? "Searching..." : "Search by name"}
                </Button>
              </div>
            </div>

            {nameSelectedProduct ? (
              <div className={styles.nameSelectedResult}>
                <div className={styles.nameSelectedLabel}>Selected product</div>
                <ProductResultCard
                  product={nameSelectedProduct}
                  rawTitle=""
                  exportContext="Product name lookup"
                  pantryContext={pantryTarget ?? undefined}
                />
              </div>
            ) : null}

            {hasSearchNotice(nameSearchResponse) ? (
              <Alert
                type={getSearchNoticeType(nameSearchResponse)}
                showIcon
                title={nameSearchResponse?.message}
              />
            ) : null}

            {nameSearchResponse ? (
              <div className={styles.nameSearchResultBox}>
                {nameProductCards.length ? (
                  <div className={styles.nameCarouselShell}>
                    <Button
                      htmlType="button"
                      aria-label="Scroll name search results left"
                      className={styles.nameCarouselNav}
                      onClick={() => scrollNameResults("left")}
                    >
                      ‹
                    </Button>

                    <div
                      ref={nameResultsScrollRef}
                      className={styles.nameProductTrack}
                      aria-label="Matching local dataset products"
                    >
                      {nameProductCards.map((card) => {
                        const productName = getProductDisplayName(
                          card.product,
                          card.candidate,
                        );
                        const brand = getProductBrand(
                          card.product,
                          card.candidate,
                        );
                        const barcodeText = getProductBarcode(card.product);
                        const imageUrl = getProductImageUrl(card.product);
                        const isLoaded =
                          card.status === "loaded" && card.product;

                        return (
                          <button
                            key={`${card.productIndex ?? card.candidate.name ?? productName}`}
                            type="button"
                            className={`${styles.nameProductCard} ${isLoaded ? "" : styles.nameProductCardDisabled}`}
                            onClick={() => selectNameProductCard(card)}
                            disabled={!isLoaded}
                            aria-label={
                              isLoaded
                                ? `Select ${productName}`
                                : `Cannot find ${productName}`
                            }
                          >
                            <div className={styles.nameProductImageFrame}>
                              {card.status === "loading" ? (
                                <div className={styles.nameProductPlaceholder}>
                                  Loading...
                                </div>
                              ) : imageUrl ? (
                                <Image
                                  src={imageUrl}
                                  alt={productName}
                                  className={styles.nameProductImage}
                                  preview={false}
                                />
                              ) : card.status === "error" ? (
                                <div className={styles.nameProductError}>
                                  Cannot find this product
                                </div>
                              ) : (
                                <div className={styles.nameProductPlaceholder}>
                                  No image
                                </div>
                              )}
                            </div>

                            <span className={styles.nameProductName}>
                              {productName}
                            </span>
                            <span className={styles.nameProductDetail}>
                              {brand}
                            </span>
                            <span className={styles.nameProductBarcode}>
                              {barcodeText}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <Button
                      htmlType="button"
                      aria-label="Scroll name search results right"
                      className={styles.nameCarouselNav}
                      onClick={() => scrollNameResults("right")}
                    >
                      ›
                    </Button>
                  </div>
                ) : (
                  <div className={styles.nameSearchEmpty}>
                    Sorry, we can&apos;t find any relevant product.
                  </div>
                )}
              </div>
            ) : null}
          </Space>
        </Card>
      </div>

      {hasReceiptResults ? (
        <div ref={receiptResultsRef}>
          <Card
            title="Receipt lookup results"
            className={styles.sectionCard}
            style={{ marginTop: 24 }}
          >
            <Space orientation="vertical" size="large" style={{ width: "100%" }}>
            <Alert
              type="success"
              showIcon
              title={`Receipt scanned: ${receiptUploadSession?.result.merchantName ?? "Unknown merchant"}`}
              description={`${receiptItems.length} extracted receipt line${receiptItems.length === 1 ? "" : "s"}. Choose a product candidate, or jump back to barcode/name lookup if none of the candidates are right.`}
              action={
                <Button onClick={clearReceiptResults}>
                  Clear receipt results
                </Button>
              }
            />

            {receiptItems.map((item, index) => {
              const itemKey = getReceiptItemKey(item, index);
              const cards = receiptProductCards[itemKey] ?? [];
              const selectedProduct = receiptSelectedProducts[itemKey];
              const searchQuery = getReceiptSearchQuery(item);

              return (
                <div key={itemKey} className={styles.receiptLineBlock}>
                  <div className={styles.receiptLineHeader}>
                    <div>
                      <div className={styles.receiptLineEyebrow}>
                        Receipt item #{index + 1}
                      </div>
                      <h3 className={styles.receiptLineTitle}>
                        {getReceiptItemTitle(item)}
                      </h3>
                      <div className={styles.receiptLineMeta}>
                        {searchQuery
                          ? `Searched local dataset for: ${searchQuery}`
                          : "No searchable product name was extracted."}
                      </div>
                    </div>
                    <Space wrap>
                      {item.quantity ? <Tag>Qty {item.quantity}</Tag> : null}
                      {item.totalPrice ? (
                        <Tag>Total {item.totalPrice}</Tag>
                      ) : null}
                      {item.productSearch?.status ? (
                        <Tag>{item.productSearch.status}</Tag>
                      ) : null}
                    </Space>
                  </div>

                  {hasSearchNotice(item.productSearch) ? (
                    <Alert
                      type={getSearchNoticeType(item.productSearch)}
                      showIcon
                      title={item.productSearch?.message}
                      className={styles.receiptSearchNotice}
                    />
                  ) : null}

                  {selectedProduct ? (
                    <div className={styles.receiptSelectedResult}>
                      <div className={styles.nameSelectedLabel}>
                        Selected for this receipt line
                      </div>
                      <ProductResultCard
                        product={selectedProduct}
                        rawTitle=""
                        exportContext="Receipt product candidate"
                        pantryContext={pantryTarget ?? undefined}
                      />
                    </div>
                  ) : null}

                  {cards.length ? (
                    <div
                      className={styles.receiptProductTrack}
                      aria-label={`Candidate products for ${getReceiptItemTitle(item)}`}
                    >
                      {cards.map((card) => {
                        const productName = getProductDisplayName(
                          card.product,
                          card.candidate,
                        );
                        const brand = getProductBrand(
                          card.product,
                          card.candidate,
                        );
                        const barcodeText = getProductBarcode(card.product);
                        const imageUrl = getProductImageUrl(card.product);
                        const isLoaded =
                          card.status === "loaded" && card.product;

                        return (
                          <button
                            key={`${itemKey}-${card.productIndex ?? card.candidate.name ?? productName}`}
                            type="button"
                            className={`${styles.nameProductCard} ${isLoaded ? "" : styles.nameProductCardDisabled}`}
                            onClick={() =>
                              selectReceiptProductCard(itemKey, card)
                            }
                            disabled={!isLoaded}
                            aria-label={
                              isLoaded
                                ? `Select ${productName}`
                                : `Cannot find ${productName}`
                            }
                          >
                            <div className={styles.nameProductImageFrame}>
                              {card.status === "loading" ? (
                                <div className={styles.nameProductPlaceholder}>
                                  Loading...
                                </div>
                              ) : imageUrl ? (
                                <Image
                                  src={imageUrl}
                                  alt={productName}
                                  className={styles.nameProductImage}
                                  preview={false}
                                />
                              ) : card.status === "error" ? (
                                <div className={styles.nameProductError}>
                                  Cannot find this product
                                </div>
                              ) : (
                                <div className={styles.nameProductPlaceholder}>
                                  No image
                                </div>
                              )}
                            </div>

                            <span className={styles.nameProductName}>
                              {productName}
                            </span>
                            <span className={styles.nameProductDetail}>
                              {brand}
                            </span>
                            <span className={styles.nameProductBarcode}>
                              {barcodeText}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={styles.nameSearchEmpty}>
                      Sorry, we can&apos;t find any relevant product for this
                      receipt line.
                    </div>
                  )}

                  <div className={styles.receiptManualActions}>
                    <Button onClick={focusNameSearchForReceipt}>
                      Search by name manually
                    </Button>
                    <Button onClick={focusBarcodeLookupForReceipt}>
                      Look up barcode manually
                    </Button>
                  </div>
                </div>
              );
            })}
            </Space>
          </Card>
        </div>
      ) : null}

    </VirtualPantryAppShell>
  );
}
