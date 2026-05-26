"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import useSessionStorage from "@/hooks/useSessionStorage";
import { usePantryWebSocket } from "@/hooks/usePantryWebSocket";
import type { HouseholdWithRole } from "@/types/household";
import { VirtualPantryAppShell } from "@/components/VirtualPantryAppShell";
import type { ApplicationError } from "@/types/error";
import { App, Button, Col, Popconfirm, Row, Tag, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import styles from "@/styles/households.module.css";
import { useAuthGuard } from "@/hooks/useAuthGuard";

const { Title, Paragraph } = Typography;

type HouseholdLookup = {
  householdId: number;
  name: string;
};

function routeBackToSafeHouseholdsPage(router: ReturnType<typeof useRouter>) {
  if (globalThis.window?.history.length > 1) {
    router.back();
    return;
  }

  router.replace("/households");
}

interface HouseholdMember {
  userId: number;
  username: string;
  role: "owner" | "member";
  joinedAt: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export default function HouseholdMembersPage() {
  const { isAuthenticated } = useAuthGuard();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const api = useApi();
  const { message } = App.useApp();
  const { value: token } = useSessionStorage<string>("token", "");
  const { value: storedUserId } = useSessionStorage<string>("userId", "");
  const { value: cachedHouseholds, set: setHouseholds } = useSessionStorage<HouseholdWithRole[]>("households", []);
  const { clear: clearSelectedHouseholdId } = useSessionStorage<number | null>("selectedHouseholdId", null);
  const householdId = Number(params.id);
  const currentUserId = storedUserId ? Number(storedUserId) : null;

  const householdName = useMemo(() => {
    const queryName = searchParams.get("name");
    if (queryName?.trim()) return queryName.trim();
    return cachedHouseholds.find((h) => h.householdId === householdId)?.name ?? `Household ${householdId}`;
  }, [searchParams, cachedHouseholds, householdId]);

  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasValidHouseholdRoute, setHasValidHouseholdRoute] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null);
  const [isLeavingHousehold, setIsLeavingHousehold] = useState(false);

  const isOwner = members.some((m) => m.userId === currentUserId && m.role === "owner");

  const handleRemove = async (targetUserId: number) => {
    setRemovingMemberId(targetUserId);
    try {
      await api.delete(`/households/${householdId}/members/${targetUserId}`);
      setMembers((prev) => prev.filter((m) => m.userId !== targetUserId));
      message.success("Member removed.");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Failed to remove member.");
    } finally {
      setRemovingMemberId(null);
    }
  };

  // Allows the current non-owner member to voluntarily leave this household (client #118)
  const handleLeave = async () => {
    if (currentUserId === null) return;
    setIsLeavingHousehold(true);
    try {
      await api.delete(`/households/${householdId}/members/${currentUserId}`);
      setHouseholds(cachedHouseholds.filter((h) => h.householdId !== householdId));
      clearSelectedHouseholdId();
      router.push("/households");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Failed to leave household.");
    } finally {
      setIsLeavingHousehold(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const rejectInvalidHouseholdRoute = (text: string) => {
      if (cancelled) return;
      setHasValidHouseholdRoute(false);
      setIsLoading(false);
      message.error(text);
      routeBackToSafeHouseholdsPage(router);
    };

    const validateHouseholdRoute = async () => {
      setHasValidHouseholdRoute(false);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        rejectInvalidHouseholdRoute("Household ID is invalid.");
        return;
      }

      try {
        const household = await api.get<HouseholdLookup>(`/households/${householdId}`);
        if (cancelled) return;

        const requestedName = searchParams.get("name")?.trim();
        if (requestedName && requestedName !== household.name) {
          rejectInvalidHouseholdRoute("Household name does not exist for this household.");
          return;
        }

        setHasValidHouseholdRoute(true);
      } catch (error) {
        const notMember = error instanceof Error && error.message.includes("User is not a member");
        if (notMember) {
          setHouseholds(cachedHouseholds.filter((h) => h.householdId !== householdId));
          clearSelectedHouseholdId();
        }
        rejectInvalidHouseholdRoute(notMember ? "You are not a member of this household." : "Household ID does not exist.");
      }
    };

    void validateHouseholdRoute();

    return () => {
      cancelled = true;
    };
  }, [api, householdId, message, router, searchParams]);

  useEffect(() => {
    if (!isAuthenticated || !hasValidHouseholdRoute) return;
    if (!Number.isFinite(householdId) || householdId <= 0) {
      setErrorMessage("Invalid household ID.");
      setIsLoading(false);
      return;
    }

    const fetchMembers = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await api.get<HouseholdMember[]>(`/households/${householdId}/members`);
        setMembers(data);
      } catch (error) {
        if ((error as ApplicationError).status === 404) {
          setHouseholds(cachedHouseholds.filter((h) => h.householdId !== householdId));
          clearSelectedHouseholdId();
          message.warning("This household no longer exists.");
          router.push("/households");
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "Failed to load members.");
      } finally {
        setIsLoading(false);
      }
    };
    void fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, isAuthenticated, hasValidHouseholdRoute]);

  usePantryWebSocket({
    householdId: Number.isFinite(householdId) && householdId > 0 ? householdId : null,
    token,
    onMessage: (msg) => {
      if (msg.eventType === "HOUSEHOLD_DELETED") {
        setHouseholds(cachedHouseholds.filter((h) => h.householdId !== householdId));
        clearSelectedHouseholdId();
        message.warning("This household has been deleted.");
        router.push("/households");
        return;
      }
      if (msg.eventType === "MEMBER_REMOVED" && msg.removedUserId === currentUserId) {
        setHouseholds(cachedHouseholds.filter((h) => h.householdId !== householdId));
        clearSelectedHouseholdId();
        message.warning("You have been removed from this household.");
        router.push("/households");
        return;
      }
    },
  });

  if (!hasValidHouseholdRoute) {
    return null;
  }

  return (
    <VirtualPantryAppShell activeNav="households">
      <div className={styles.header}>
        <div>
          <Button
            size="middle"
            icon={<ArrowLeftOutlined />}
            onClick={() => router.push("/households")}
            style={{ marginBottom: 18, borderRadius: 12, fontWeight: 600 }}
          >
            Back to households
          </Button>
          <Title level={1} className={styles.title}>{householdName}</Title>
          <Paragraph className={styles.subtitle}>Members of this household</Paragraph>
        </div>
      </div>

      <section className={styles.section}>
        <Title level={3} className={styles.sectionTitle}>
          Members ({isLoading ? "…" : members.length})
        </Title>

        {errorMessage && (
          <div className={styles.joinInfoBox} style={{ borderColor: "#f5c6cb", background: "#fff5f5", color: "#c0392b" }}>
            {errorMessage}
          </div>
        )}

        {!isLoading && members.length === 0 && !errorMessage && (
          <Paragraph type="secondary">No members found.</Paragraph>
        )}

        <Row gutter={[12, 12]}>
          {members.map((member) => (
            <Col xs={24} sm={12} md={8} lg={6} key={member.userId}>
              <div className={styles.householdCard} style={{ padding: 12, minHeight: "auto" }}>
                <Tag
                  color={member.role === "owner" ? "green" : "blue"}
                  style={{ marginBottom: 6 }}
                >
                  {member.role.toUpperCase()}
                </Tag>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{member.username}</div>
                <p className={styles.householdMeta} style={{ marginBottom: 4, marginTop: 4 }}>
                  Joined: {formatDate(member.joinedAt)}
                </p>
                {isOwner && member.userId !== currentUserId && (
                  <Popconfirm
                    title={`Remove ${member.username} from this household?`}
                    onConfirm={() => void handleRemove(member.userId)}
                    okText="Remove"
                    cancelText="Cancel"
                  >
                    <Button
                      size="small"
                      danger
                      loading={removingMemberId === member.userId}
                    >
                      Remove
                    </Button>
                  </Popconfirm>
                )}
                {/* Leave button for current non-owner member (client #118) */}
                {!isOwner && member.userId === currentUserId && (
                  <Popconfirm
                    title="Leave this household?"
                    onConfirm={() => void handleLeave()}
                    okText="Leave"
                    cancelText="Cancel"
                  >
                    <Button
                      size="small"
                      danger
                      loading={isLeavingHousehold}
                    >
                      Leave
                    </Button>
                  </Popconfirm>
                )}
              </div>
            </Col>
          ))}
        </Row>
      </section>
    </VirtualPantryAppShell>
  );
}
