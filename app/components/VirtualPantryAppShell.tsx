"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { App, Avatar, ConfigProvider, theme as antdTheme } from "antd";
import {
  DashboardOutlined,
  HomeOutlined,
  InboxOutlined,
  LogoutOutlined,
  ReadOutlined,
} from "@ant-design/icons";
import useSessionStorage from "@/hooks/useSessionStorage";
import type { HouseholdWithRole } from "@/types/household";
import styles from "@/styles/households.module.css";

export type VirtualPantryNav = "dashboard" | "households" | "pantry" | "recipes";

interface VirtualPantryAppShellProps {
  activeNav: VirtualPantryNav;
  children: React.ReactNode;
}

export function VirtualPantryAppShell({ activeNav, children }: VirtualPantryAppShellProps) {
  const router = useRouter();
  const { message } = App.useApp();
  const { clear: clearToken } = useSessionStorage<string>("token", "");
  const { clear: clearUsername } = useSessionStorage<string>("username", "");
  const { value: households, clear: clearHouseholds } = useSessionStorage<HouseholdWithRole[]>("households", []);
  const { value: selectedHouseholdId, set: setSelectedHouseholdId, clear: clearSelectedHouseholdId } = useSessionStorage<
    number | null
  >("selectedHouseholdId", null);
  const { value: username } = useSessionStorage<string>("username", "");
  const { value: userId, clear: clearUserId } = useSessionStorage<string>("userId", "");

  const handleSidebarPantry = () => {
    if (households.length === 0) {
      message.info("Create or join a pantry first, then open Pantry.");
      return;
    }
    const id =
      selectedHouseholdId !== null &&
      households.some((h) => h.householdId === selectedHouseholdId)
        ? selectedHouseholdId
        : households[0].householdId;
    setSelectedHouseholdId(id);
    router.push(`/households/${id}/stats`);
  };

  const handleSidebarRecipes = () => {
    if (households.length === 0) {
      message.info("Create or join a pantry first, then open Recipes.");
      return;
    }
    const id =
      selectedHouseholdId !== null &&
      households.some((h) => h.householdId === selectedHouseholdId)
        ? selectedHouseholdId
        : households[0].householdId;
    const household = households.find((h) => h.householdId === id);
    const fallbackName = `Pantry ${id}`;
    const recipeHouseholdName = household?.name ?? fallbackName;
    setSelectedHouseholdId(id);
    router.push(
      `/recipes?householdId=${id}&name=${encodeURIComponent(recipeHouseholdName)}`,
    );
  };

  const handleLogout = () => {
    clearToken();
    clearUsername();
    clearUserId();
    clearHouseholds();
    clearSelectedHouseholdId();
    router.push("/login");
  };

  const userLabel = username?.trim() ? username.trim() : "@unknown";
  const userInitial = userLabel.charAt(0).toUpperCase();

  const navBtn = (nav: VirtualPantryNav) =>
    `${styles.menuItem} ${activeNav === nav ? styles.menuItemActive : ""}`;

  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: "#1f7a3f",
          colorText: "#182418",
          colorTextSecondary: "#566556",
          colorBgBase: "#f7f8ef",
          colorBgContainer: "#ffffff",
          colorBorder: "#dce4d0",
          borderRadius: 10,
        },
        components: {
          Input: {
            colorBgContainer: "#ffffff",
            colorText: "#1d2a1d",
            colorBorder: "#d8dfca",
          },
        },
      }}
    >
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div>
            <div className={styles.brand}>Virtual Pantry</div>
            <div className={styles.brandTagline}>The Organic Atelier</div>
          </div>
          <nav className={styles.menu}>
            <button
              type="button"
              className={navBtn("dashboard")}
              onClick={() => router.push("/users")}
            >
              <DashboardOutlined className={styles.menuIcon} />
              <span className={styles.menuText}>Dashboard</span>
            </button>
            <button type="button" className={navBtn("households")} onClick={() => router.push("/households")}>
              <HomeOutlined className={styles.menuIcon} />
              <span className={styles.menuText}>Manage</span>
            </button>
            <button type="button" className={navBtn("pantry")} onClick={handleSidebarPantry}>
              <InboxOutlined className={styles.menuIcon} />
              <span className={styles.menuText}>Pantry</span>
            </button>
            <button
              type="button"
              className={navBtn("recipes")}
              onClick={handleSidebarRecipes}
            >
              <ReadOutlined className={styles.menuIcon} />
              <span className={styles.menuText}>Recipes</span>
            </button>
          </nav>

          <div className={styles.sidebarFooter}>
            <button type="button" className={styles.logoutButton} onClick={handleLogout}>
              <LogoutOutlined className={styles.menuIcon} />
              <span className={styles.menuText}>Logout</span>
            </button>
          </div>
        </aside>

        <main className={styles.main}>
          <div className={styles.topUserBar}>
            <span className={styles.userName}>{userLabel}</span>
            <Avatar
              size={64}
              className={styles.userAvatar}
              style={{ cursor: userId ? "pointer" : "default" }}
              onClick={() => { if (userId) router.push(`/users/${userId}/health-goal`); }}
            >
              {userInitial}
            </Avatar>
          </div>
          {children}
        </main>
      </div>
    </ConfigProvider>
  );
}
