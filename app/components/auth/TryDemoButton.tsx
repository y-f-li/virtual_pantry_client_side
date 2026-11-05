
"use client";

import { useState } from "react";
import { App, Button } from "antd";
import type { ButtonProps } from "antd";

import ConnectingOverlay from "@/components/ConnectingOverlay";
import { useStartGuestSession } from "@/utils/startGuestSession";

type TryDemoButtonProps = Pick<ButtonProps, "type" | "className">;

export default function TryDemoButton({
  type = "primary",
  className,
}: TryDemoButtonProps) {
  const [connecting, setConnecting] = useState(false);
  const startGuestSession = useStartGuestSession();
  const { message } = App.useApp();

  const handleDemo = async () => {
    if (connecting) return;

    setConnecting(true);

    try {
      await startGuestSession();
      // Keep overlay visible until navigation unmounts this component.
    } catch {
      setConnecting(false);
      message.error("Could not start the demo. Please try again.");
    }
  };

  return (
    <>
      <Button
        type={type}
        className={className}
        onClick={handleDemo}
        disabled={connecting}
      >
        Try Demo
      </Button>

      {connecting && <ConnectingOverlay />}
    </>
  );
}
