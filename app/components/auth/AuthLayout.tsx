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
  topContent?: ReactNode;
  bottomContent?: ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({
  title,
  subtitle,
  switchPrompt,
  switchActionLabel,
  onSwitchAction,
  children,
  topContent,
  bottomContent,
}) => {
  return (
    <>
      <div className={styles.authPage}>
        <section className={styles.leftPanel}>
          <p className={styles.brand}>The Better Cronometer</p>
          <h1 className={styles.heroTitle}>
            Simplify Your <span className={styles.heroTitleAccent}>Nutrition Tracking</span>{" "}
            Workflow
          </h1>
        </section>

        <section className={styles.rightPanel}>

          {topContent}
          
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

            {bottomContent}
            
          </div>
        </section>
      </div>
    </>
  );
};

export default AuthLayout;
