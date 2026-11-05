import { Spin } from "antd";

export default function ConnectingOverlay() {
  return (
    <div
        style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(255, 255, 255, 0.95)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            flexDirection: "column",
            gap: 32
        }}
    >
        <Spin size="large" />
        <p>Logging you in...</p>
    </div>
  );
}