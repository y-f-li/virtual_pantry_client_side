"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import type { IMessage, StompSubscription } from "@stomp/stompjs";
import { getApiDomain } from "@/utils/domain";

interface WebSocketContextValue {
  subscribe: (
    topic: string,
    callback: (msg: IMessage) => void,
  ) => StompSubscription | null;
  connected: boolean;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  subscribe: () => null,
  connected: false,
});

export function useWebSocketContext(): WebSocketContextValue {
  return useContext(WebSocketContext);
}

export function WebSocketProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<Client | null>(null);
  const [token, setToken] = useState<string>("");

  // Read token from sessionStorage on mount; re-sync when login/logout fires
  // the same custom event used by useSessionStorage throughout the app.
  useEffect(() => {
    const readToken = (): string => {
      try {
        const raw = globalThis.sessionStorage?.getItem("token");
        return raw ? (JSON.parse(raw) as string) ?? "" : "";
      } catch {
        return "";
      }
    };

    setToken(readToken());

    const handleSync = (event: Event) => {
      const { key, value } = (
        event as CustomEvent<{ key: string; value: string | null }>
      ).detail;
      if (key !== "token") return;
      try {
        setToken(value !== null ? (JSON.parse(value) as string) ?? "" : "");
      } catch {
        setToken("");
      }
    };

    window.addEventListener("sessionstorage-sync", handleSync);
    return () => window.removeEventListener("sessionstorage-sync", handleSync);
  }, []);

  // One STOMP client for the entire app session.
  // Recreated only when the token changes (login / logout).
  useEffect(() => {
    if (!token) {
      if (clientRef.current) {
        void clientRef.current.deactivate();
        clientRef.current = null;
        setConnected(false);
      }
      return;
    }

    const client = new Client({
      webSocketFactory: () => new SockJS(`${getApiDomain()}/ws`),
      connectHeaders: { token },
      reconnectDelay: 5000,
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
      onStompError: () => setConnected(false),
      onWebSocketError: () => setConnected(false),
      onWebSocketClose: () => setConnected(false),
    });

    clientRef.current = client;
    client.activate();

    return () => {
      void client.deactivate();
      clientRef.current = null;
      setConnected(false);
    };
  }, [token]);

  const subscribe = useCallback(
    (
      topic: string,
      callback: (msg: IMessage) => void,
    ): StompSubscription | null => {
      const client = clientRef.current;
      if (!client?.connected) return null;
      return client.subscribe(topic, callback);
    },
    [],
  );

  return (
    <WebSocketContext.Provider value={{ subscribe, connected }}>
      {children}
    </WebSocketContext.Provider>
  );
}
