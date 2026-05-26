"use client";

import { Button } from "antd";
import { ReactNode } from "react";
import styles from "@/styles/auth.module.css";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  switchPrompt: string;
  switchActionLabel: string;
  onSwitchAction: () => void;
  children: ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({
  title,
  subtitle,
  switchPrompt,
  switchActionLabel,
  onSwitchAction,
  children,
}) => {
  return (
    <>
      <div className={styles.authPage}>
        <section className={styles.leftPanel}>
          <p className={styles.brand}>Virtual Pantry</p>
          <h1 className={styles.heroTitle}>
            Manage Your <span className={styles.heroTitleAccent}>Pantry</span>{" "}
            Like Never Before
          </h1>
          <div className={styles.featureList}>
            <article className={styles.featureCard}>
              <p className={styles.featureTitle}>Household Collaboration</p>
              <p className={styles.featureText}>
                Share access with family members and sync your pantry in real time.
              </p>
            </article>
            <article className={styles.featureCard}>
              <p className={styles.featureTitle}>Smart Notifications</p>
              <p className={styles.featureText}>
                Get gentle reminders before ingredients expire to reduce food waste.
              </p>
            </article>
            <article className={styles.featureCard}>
              <p className={styles.featureTitle}>Usage Analytics</p>
              <p className={styles.featureText}>
                Track consumption patterns and optimize your grocery budget.
              </p>
            </article>
          </div>
          <p className={styles.leftFooter}>THE DIGITAL CONSERVATORY © 2026</p>
        </section>

        <section className={styles.rightPanel}>
          <div className={styles.authCard}>
            <h2 className={styles.authTitle}>{title}</h2>
            <p className={styles.authSubtitle}>{subtitle}</p>

            {children}

            <p className={styles.switchRow}>
              {switchPrompt}{" "}
              <Button
                type="link"
                className={styles.switchLink}
                onClick={onSwitchAction}
              >
                {switchActionLabel}
              </Button>
            </p>
          </div>
        </section>
      </div>

      <footer className={styles.authFooter}>
        <a href="#privacy">PRIVACY POLICY</a>
        <a href="#terms">TERMS OF SERVICE</a>
        <a href="#support">CONTACT SUPPORT</a>
      </footer>
    </>
  );
};

export default AuthLayout;
