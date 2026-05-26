import { useEffect, useRef, useState } from "react";

const SYNC_EVENT = "localstorage-sync";

interface LocalStorage<T> {
  value: T;
  set: (newVal: T) => void;
  clear: () => void;
}

/**
 * This custom function/hook safely handles SSR by checking
 * for the window before accessing browser localStorage.
 * IMPORTANT: It has a local react state AND a localStorage state.
 * When initializing the state with a default value,
 * clearing will revert to this default value for the state and
 * the corresponding token gets deleted in the localStorage.
 *
 * All instances with the same key are kept in sync within the same tab
 * via a custom "localstorage-sync" event.
 *
 * @param key - The key from localStorage, generic type T.
 * @param defaultValue - The default value if nothing is in localStorage yet.
 * @returns An object containing:
 *  - value: The current value (synced with localStorage).
 *  - set: Updates both react state & localStorage.
 *  - clear: Resets state to defaultValue and deletes localStorage key.
 */
export default function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): LocalStorage<T> {
  const [value, setValue] = useState<T>(defaultValue);
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  // On mount, try to read the stored value
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = globalThis.localStorage.getItem(key);
      if (stored) {
        setValue(JSON.parse(stored) as T);
      }
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
    }
  }, [key]);

  // Listen for same-tab and cross-tab sync events
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSync = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; value: string | null }>).detail;
      if (detail.key !== key) return;
      try {
        setValue(detail.value !== null ? (JSON.parse(detail.value) as T) : defaultValueRef.current);
      } catch {
        setValue(defaultValueRef.current);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      try {
        setValue(event.newValue !== null ? (JSON.parse(event.newValue) as T) : defaultValueRef.current);
      } catch {
        setValue(defaultValueRef.current);
      }
    };

    window.addEventListener(SYNC_EVENT, handleSync);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(SYNC_EVENT, handleSync);
      window.removeEventListener("storage", handleStorage);
    };
  }, [key]);

  // Simple setter that updates both state and localStorage, then notifies other instances
  const set = (newVal: T) => {
    setValue(newVal);
    if (typeof window !== "undefined") {
      const serialized = JSON.stringify(newVal);
      globalThis.localStorage.setItem(key, serialized);
      window.dispatchEvent(
        new CustomEvent(SYNC_EVENT, { detail: { key, value: serialized } }),
      );
    }
  };

  // Removes the key from localStorage and resets the state
  const clear = () => {
    setValue(defaultValueRef.current);
    if (typeof window !== "undefined") {
      globalThis.localStorage.removeItem(key);
      window.dispatchEvent(
        new CustomEvent(SYNC_EVENT, { detail: { key, value: null } }),
      );
    }
  };

  return { value, set, clear };
}
