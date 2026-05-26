/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, renderHook } from "@testing-library/react";
import { usePantryWebSocket } from "@/hooks/usePantryWebSocket";

const subscribeMock = jest.fn();
const activateMock = jest.fn();
const deactivateMock = jest.fn().mockResolvedValue(undefined);

let capturedOnConnect: (() => void) | null = null;
let capturedOnDisconnect: (() => void) | null = null;
let capturedOnStompError: (() => void) | null = null;
let capturedOnWebSocketError: (() => void) | null = null;
let capturedOnWebSocketClose: (() => void) | null = null;
let capturedFrameCallback: ((frame: { body: string }) => void) | null = null;

jest.mock("@stomp/stompjs", () => ({
  Client: jest.fn().mockImplementation((config: any) => {
    capturedOnConnect = config.onConnect;
    capturedOnDisconnect = config.onDisconnect;
    capturedOnStompError = config.onStompError;
    capturedOnWebSocketError = config.onWebSocketError;
    capturedOnWebSocketClose = config.onWebSocketClose;
    return {
      subscribe: (topic: string, cb: (frame: { body: string }) => void) => {
        capturedFrameCallback = cb;
        subscribeMock(topic, cb);
      },
      activate: activateMock,
      deactivate: deactivateMock,
    };
  }),
}));

jest.mock("sockjs-client", () => jest.fn().mockImplementation(() => ({})));

jest.mock("@/utils/domain", () => ({
  getApiDomain: () => "http://localhost:8080",
}));

describe("usePantryWebSocket", () => {
  const onMessage = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnConnect = null;
    capturedOnDisconnect = null;
    capturedOnStompError = null;
    capturedOnWebSocketError = null;
    capturedOnWebSocketClose = null;
    capturedFrameCallback = null;
  });

  it("starts disconnected and activates the STOMP client", () => {
    const { result } = renderHook(() =>
      usePantryWebSocket({ householdId: 10, token: "test-token", onMessage }),
    );

    expect(activateMock).toHaveBeenCalledTimes(1);
    expect(result.current.connected).toBe(false);
  });

  it("sets connected to true and hasConnectedOnce after onConnect fires", () => {
    const { result } = renderHook(() =>
      usePantryWebSocket({ householdId: 10, token: "test-token", onMessage }),
    );

    expect(result.current.hasConnectedOnce).toBe(false);

    act(() => { capturedOnConnect?.(); });

    expect(result.current.connected).toBe(true);
    expect(result.current.hasConnectedOnce).toBe(true);
    expect(subscribeMock).toHaveBeenCalledWith(
      "/topic/household/10/pantry",
      expect.any(Function),
    );
  });

  it("calls onMessage with parsed payload when a frame arrives", () => {
    renderHook(() =>
      usePantryWebSocket({ householdId: 10, token: "test-token", onMessage }),
    );

    act(() => { capturedOnConnect?.(); });

    const payload = { eventType: "ITEM_ADDED", householdId: 10 };
    act(() => { capturedFrameCallback?.({ body: JSON.stringify(payload) }); });

    expect(onMessage).toHaveBeenCalledWith(payload);
  });

  it("sets connected to false on disconnect", () => {
    const { result } = renderHook(() =>
      usePantryWebSocket({ householdId: 10, token: "test-token", onMessage }),
    );

    act(() => { capturedOnConnect?.(); });
    expect(result.current.connected).toBe(true);

    act(() => { capturedOnDisconnect?.(); });
    expect(result.current.connected).toBe(false);
  });

  it("sets connected to false on STOMP error", () => {
    const { result } = renderHook(() =>
      usePantryWebSocket({ householdId: 10, token: "test-token", onMessage }),
    );

    act(() => { capturedOnConnect?.(); });
    act(() => { capturedOnStompError?.(); });

    expect(result.current.connected).toBe(false);
  });

  it("sets connected to false on WebSocket error", () => {
    const { result } = renderHook(() =>
      usePantryWebSocket({ householdId: 10, token: "test-token", onMessage }),
    );

    act(() => { capturedOnConnect?.(); });
    act(() => { capturedOnWebSocketError?.(); });

    expect(result.current.connected).toBe(false);
  });

  it("sets connected to false on WebSocket close", () => {
    const { result } = renderHook(() =>
      usePantryWebSocket({ householdId: 10, token: "test-token", onMessage }),
    );

    act(() => { capturedOnConnect?.(); });
    act(() => { capturedOnWebSocketClose?.(); });

    expect(result.current.connected).toBe(false);
  });

  it("does not activate when householdId is null", () => {
    renderHook(() =>
      usePantryWebSocket({ householdId: null, token: "test-token", onMessage }),
    );

    expect(activateMock).not.toHaveBeenCalled();
  });

  it("does not activate when token is empty", () => {
    renderHook(() =>
      usePantryWebSocket({ householdId: 10, token: "", onMessage }),
    );

    expect(activateMock).not.toHaveBeenCalled();
  });

  it("deactivates client on unmount", () => {
    const { unmount } = renderHook(() =>
      usePantryWebSocket({ householdId: 10, token: "test-token", onMessage }),
    );

    unmount();

    expect(deactivateMock).toHaveBeenCalledTimes(1);
  });

  it("silently ignores malformed JSON frames", () => {
    renderHook(() =>
      usePantryWebSocket({ householdId: 10, token: "test-token", onMessage }),
    );

    act(() => { capturedOnConnect?.(); });
    act(() => { capturedFrameCallback?.({ body: "not-json" }); });

    expect(onMessage).not.toHaveBeenCalled();
  });
});
