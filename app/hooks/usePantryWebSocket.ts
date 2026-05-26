import { useEffect, useRef, useState } from "react";
import { useWebSocketContext } from "@/contexts/WebSocketContext";
import type { PantryUpdateMessage } from "@/types/websocket";

interface UsePantryWebSocketOptions {
  householdId: number | null;
  token: string;
  onMessage: (msg: PantryUpdateMessage) => void;
}

interface UsePantryWebSocketResult {
  connected: boolean;
  hasConnectedOnce: boolean;
}

export function usePantryWebSocket({
  householdId,
  onMessage,
}: UsePantryWebSocketOptions): UsePantryWebSocketResult {
  const { connected, subscribe } = useWebSocketContext();
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!connected || !householdId) return;

    setHasConnectedOnce(true);

    const sub = subscribe(
      `/topic/household/${householdId}/pantry`,
      (frame) => {
        try {
          const msg = JSON.parse(frame.body) as PantryUpdateMessage;
          onMessageRef.current(msg);
        } catch {
          // Ignore malformed messages.
        }
      },
    );

    return () => {
      sub?.unsubscribe();
    };
  }, [connected, householdId, subscribe]);

  return { connected, hasConnectedOnce };
}
