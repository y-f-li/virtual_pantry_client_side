"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSessionStorage from "@/hooks/useSessionStorage";
import type {
  Household,
  HouseholdInviteCodeResponse,
  HouseholdWithRole,
} from "@/types/household";
import { getApiDomain } from "@/utils/domain";
import styles from "@/styles/households.module.css";
import { VirtualPantryAppShell } from "@/components/VirtualPantryAppShell";
import {
  App,
  Button,
  Card,
  Col,
  Input,
  Row,
  Space,
  Tag,
  Table,
  Typography,
} from "antd";
import {
  DeleteOutlined,
  PlusCircleOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { useAuthGuard } from "@/hooks/useAuthGuard";

const { Title, Paragraph } = Typography;

export default function HouseholdsPage() {
  useAuthGuard();
  const router = useRouter();
  const { message } = App.useApp();

  const { value: token } = useSessionStorage<string>("token", "");
  const { value: households, set: setHouseholds } = useSessionStorage<HouseholdWithRole[]>("households", []);
  const {
    value: selectedHouseholdId,
    set: setSelectedHouseholdId,
    clear: clearSelectedHouseholdId,
  } = useSessionStorage<number | null>("selectedHouseholdId", null);

  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [lastGeneratedCode, setLastGeneratedCode] = useState<string | null>(null);

  const ownedHouseholds = useMemo(
    () => households.filter((household) => household.role === "owner"),
    [households],
  );

  const authPost = async <T,>(endpoint: string, payload?: unknown): Promise<T> => {
    const response = await fetch(`${getApiDomain()}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });

    if (!response.ok) {
      let reason = response.statusText;
      try {
        const body = await response.json();
        reason = body.detail ?? body.message ?? JSON.stringify(body);
      } catch {
        // Use status text fallback when body cannot be parsed.
      }
      throw new Error(`${response.status}: ${reason}`);
    }

    return response.json() as Promise<T>;
  };

  const authDelete = async (endpoint: string): Promise<void> => {
    const response = await fetch(`${getApiDomain()}${endpoint}`, {
      method: "DELETE",
      headers: { Authorization: token },
    });

    if (!response.ok) {
      let reason = response.statusText;
      try {
        const body = await response.json();
        reason = body.detail ?? body.message ?? JSON.stringify(body);
      } catch {
        // Use status text fallback when body cannot be parsed.
      }
      throw new Error(`${response.status}: ${reason}`);
    }
  };

  const updateHouseholds = (
    updater: (currentHouseholds: HouseholdWithRole[]) => HouseholdWithRole[],
  ) => {
    setHouseholds(updater(households));
  };

  const handleDeletePantry = async (householdId: number) => {
    setDeletingId(householdId);
    try {
      await authDelete(`/households/${householdId}`);
      updateHouseholds((current) => current.filter((h) => h.householdId !== householdId));
      if (selectedHouseholdId === householdId) {
        clearSelectedHouseholdId();
      }
      message.success("Pantry deleted.");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Failed to delete pantry.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateHousehold = async () => {
    if (!createName.trim()) {
      message.warning("Please enter a pantry name.");
      return;
    }

    setCreating(true);
    try {
      const created = await authPost<Household>("/households", { name: createName.trim() });
      updateHouseholds((currentHouseholds) => [
        { ...created, role: "owner" },
        ...currentHouseholds.filter((item) => item.householdId !== created.householdId),
      ]);
      setSelectedHouseholdId(created.householdId);
      setLastGeneratedCode(created.inviteCode);
      setCreateName("");
      message.success("Pantry created successfully.");
      router.push(
        `/households/${created.householdId}/stats`,
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Failed to create pantry.");
    } finally {
      setCreating(false);
    }
  };

  const handleRegenerateInviteCode = async (householdId: number) => {
    setRegeneratingId(householdId);
    try {
      const updated = await authPost<HouseholdInviteCodeResponse>(
        `/households/${householdId}/invite-code`,
      );
      updateHouseholds((currentHouseholds) =>
        currentHouseholds.map((household) =>
          household.householdId === updated.householdId
            ? { ...household, inviteCode: updated.inviteCode, inviteCodeExpiresAt: updated.expiresAt }
            : household,
        ),
      );
      setLastGeneratedCode(updated.inviteCode);
      message.success("Invite code regenerated.");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Failed to regenerate invite code.");
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleJoinHousehold = async () => {
    if (!joinCode.trim()) {
      message.warning("Please enter an invite code.");
      return;
    }

    setJoining(true);
    try {
      const joined = await authPost<Household>("/households/join", {
        inviteCode: joinCode.trim(),
      });
      updateHouseholds((currentHouseholds) => {
        if (currentHouseholds.some((household) => household.householdId === joined.householdId)) {
          return currentHouseholds;
        }
        return [...currentHouseholds, { ...joined, role: "member" }];
      });
      setSelectedHouseholdId(joined.householdId);
      setJoinCode("");
      message.success("Joined pantry successfully.");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Failed to join pantry.");
    } finally {
      setJoining(false);
    }
  };

  const handleOpenPantry = (household: HouseholdWithRole) => {
    setSelectedHouseholdId(household.householdId);
    router.push(
      `/households/${household.householdId}/stats`,
    );
  };

  const activeInvites = households.filter((household) => household.role === "owner").length;

  const invitationRows = ownedHouseholds.slice(0, 2).map((household) => {
    const expiresAt = household.inviteCodeExpiresAt ? new Date(household.inviteCodeExpiresAt) : null;
    const createdAt = expiresAt ? new Date(expiresAt.getTime() - 7 * 24 * 60 * 60 * 1000) : null;
    const daysLeft = expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
    return {
      key: household.householdId,
      household: household.name,
      inviteCode: household.inviteCode,
      created: createdAt ? createdAt.toLocaleDateString() : "—",
      expires: daysLeft === null ? "—" : daysLeft <= 0 ? "Expired" : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    };
  });

  return (
    <VirtualPantryAppShell activeNav="households">
      <div className={styles.header}>
        <div>
          <Title level={1} className={styles.title}>
            Pantry Management
          </Title>
          <Paragraph className={styles.subtitle}>
            Organize and curate your shared pantry ecosystems.
          </Paragraph>
        </div>
      </div>

      <section className={styles.section}>
        <Title level={3} className={styles.sectionTitle}>
          Create Pantry
        </Title>
        <Card className={styles.joinCard}>
          <Space orientation="vertical" style={{ width: "100%" }} size="middle">
            <Input
              placeholder="Enter pantry name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              onPressEnter={() => void handleCreateHousehold()}
            />
            <Button
              type="primary"
              icon={<PlusCircleOutlined />}
              onClick={handleCreateHousehold}
              loading={creating}
            >
              Create Pantry
            </Button>
          </Space>
        </Card>
      </section>

      <Row gutter={[16, 16]} className={styles.stats}>
        <Col xs={24} sm={12} lg={6}>
          <Card className={styles.statCard}>
            <div className={styles.statLabel}>Active pantries</div>
            <div className={styles.statValue}>{households.length}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className={styles.statCard}>
            <div className={styles.statLabel}>Owned pantries</div>
            <div className={styles.statValue}>{ownedHouseholds.length}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className={styles.statCard}>
            <div className={styles.statLabel}>Pantry routes ready</div>
            <div className={styles.statValue}>{households.length}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className={styles.statCard}>
            <div className={styles.statLabel}>Active invites</div>
            <div className={styles.statValue}>{activeInvites}</div>
          </Card>
        </Col>
      </Row>

      <section className={styles.section}>
        <Title level={3} className={styles.sectionTitle}>
          My Pantries
        </Title>
        <Card className={styles.joinCard}>
          {households.length === 0 ? (
            <Paragraph type="secondary" style={{ margin: 0 }}>
              No pantries yet. Create one below or join with an invite code.
            </Paragraph>
          ) : (
            <Row gutter={[16, 16]}>
              {households.map((household) => (
                <Col xs={24} md={12} xl={8} key={household.householdId}>
                  <Card className={styles.householdCard}>
                    <div className={styles.householdTopRow}>
                      <Tag
                        className={styles.roleTag}
                        color={household.role === "owner" ? "green" : "blue"}
                      >
                        {household.role.toUpperCase()}
                      </Tag>
                      <span className={styles.timeHint}>recently</span>
                    </div>
                    <Title level={4} style={{ marginBottom: 8 }}>
                      {household.name}
                    </Title>
                    {household.role === "owner" && (
                      <p className={styles.householdMeta}>Invite code: {household.inviteCode}</p>
                    )}
                    <div className={styles.cardButtons}>
                      <Button block className={styles.outlineButton} onClick={() => handleOpenPantry(household)}>
                        View Pantry
                      </Button>
                      <Button
                        block
                        onClick={() =>
                          router.push(
                            `/households/${household.householdId}/members?name=${encodeURIComponent(household.name)}`,
                          )
                        }
                      >
                        View Members
                      </Button>
                      {household.role === "owner" && (
                        <>
                          <Button
                            icon={<SyncOutlined />}
                            block
                            loading={regeneratingId === household.householdId}
                            onClick={() => void handleRegenerateInviteCode(household.householdId)}
                          >
                            Regenerate Code
                          </Button>
                          <Button
                            danger
                            icon={<DeleteOutlined />}
                            block
                            loading={deletingId === household.householdId}
                            onClick={() => void handleDeletePantry(household.householdId)}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </Card>
      </section>

      <section className={styles.section}>
        <Title level={3} className={styles.sectionTitle}>
          Join a Pantry
        </Title>
        <Card className={styles.joinCard}>
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <div className={styles.joinHeading}>Redeem Invite Code</div>
            <p className={styles.joinDescription}>
              Have an invite code from a friend or colleague? Enter it below to gain instant access to
              their curated pantry and start collaborating.
            </p>
            <div className={styles.joinRow}>
              <Input
                placeholder="Enter invite code (e.g. AB-12345)"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                onPressEnter={() => void handleJoinHousehold()}
              />
              <Button type="primary" onClick={handleJoinHousehold} loading={joining}>
                Join Pantry
              </Button>
            </div>
            <div className={styles.joinInfoBox}>
              Codes are unique, case-sensitive, and typically expire within 7 days. If you are having
              trouble joining, contact the pantry owner for a new code.
            </div>
            {lastGeneratedCode && (
              <div className={styles.inviteBox}>Latest generated invite code: {lastGeneratedCode}</div>
            )}
          </Space>
        </Card>
      </section>

      <section className={styles.section}>
        <Title level={3} className={styles.sectionTitle}>
          Manage Pending Invitations
        </Title>
        <Card className={styles.joinCard}>
          <Table
            pagination={false}
            rowKey="key"
            locale={{ emptyText: "No pending invitations currently." }}
            dataSource={invitationRows}
            columns={[
              { title: "Pantry", dataIndex: "household", key: "household" },
              { title: "Invite Code", dataIndex: "inviteCode", key: "inviteCode" },
              { title: "Created", dataIndex: "created", key: "created" },
              { title: "Expires", dataIndex: "expires", key: "expires" },
              {
                title: "Actions",
                key: "actions",
                render: (_: unknown, record: { key: number }) => (
                  <Button
                    size="small"
                    className={styles.outlineButton}
                    loading={regeneratingId === record.key}
                    onClick={() => void handleRegenerateInviteCode(record.key)}
                  >
                    Revoke
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      </section>
    </VirtualPantryAppShell>
  );
}
