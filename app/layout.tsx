import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { App as AntdApp, ConfigProvider, theme } from "antd";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import "@/styles/globals.css";
import GuestSessionBoundary from "@/components/GuestSessionBoundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pantry Prototype",
  description: "Deployed SoPra pantry prototype client",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ConfigProvider
          theme={{
            algorithm: theme.defaultAlgorithm,
            token: {
              colorPrimary: "#A75A29",
              colorInfo: "#A75A29",
              colorSuccess: "#806D4A",
              colorWarning: "#CEAE7A",
              colorError: "#A75A29",
              colorText: "#1F1A14",
              colorTextSecondary: "#534426",
              colorBgBase: "#F0E7DB",
              colorBgLayout: "#F0E7DB",
              colorBgContainer: "#FFFFFF",
              colorBorder: "#CEAE7A",
              colorSplit: "#E7D8C3",
              borderRadius: 14,
              borderRadiusLG: 22,
              fontSize: 16,
              fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif",
              boxShadowSecondary: "0 18px 45px rgba(83, 68, 38, 0.12)",
            },
            components: {
              Layout: {
                bodyBg: "#F0E7DB",
                headerBg: "#F0E7DB",
                footerBg: "#F0E7DB",
              },
              Button: {
                controlHeight: 42,
                paddingInline: 18,
                borderRadius: 999,
                defaultBorderColor: "#CEAE7A",
                defaultColor: "#1F1A14",
                defaultBg: "#FFFFFF",
                colorPrimary: "#A75A29",
                colorPrimaryHover: "#8F4B21",
                colorPrimaryActive: "#7A3F1A",
                primaryColor: "#FFFFFF",
              },
              Card: {
                borderRadiusLG: 24,
                headerBg: "rgba(255, 255, 255, 0.92)",
                colorBorderSecondary: "#E7D8C3",
              },
              Input: {
                activeBorderColor: "#A75A29",
                hoverBorderColor: "#806D4A",
                colorTextPlaceholder: "#806D4A",
              },
              InputNumber: {
                activeBorderColor: "#A75A29",
                hoverBorderColor: "#806D4A",
              },
              Form: {
                labelColor: "#1F1A14",
              },
              Table: {
                headerBg: "#F7F0E7",
                headerColor: "#1F1A14",
                colorBgContainer: "rgba(255, 255, 255, 0.9)",
                borderColor: "#E7D8C3",
                rowHoverBg: "#F8F2EA",
              },
              Typography: {
                colorText: "#1F1A14",
                colorTextSecondary: "#534426",
              },
              Message: {
                contentBg: "#FFFDF9",
              },
            },
          }}
        >
          <AntdRegistry>
            <AntdApp>
              <GuestSessionBoundary />
              {children}
            </AntdApp>
          </AntdRegistry>
        </ConfigProvider>
      </body>
    </html>
  );
}
