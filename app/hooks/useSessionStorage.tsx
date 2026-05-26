import { useCallback, useEffect, useRef, useState } from "react";

const SYNC_EVENT = "sessionstorage-sync";

interface SessionStorageValue<T> {
  value: T;
  set: (newVal: T) => void;
  clear: () => void;
}

export default function useSessionStorage<T>(
  key: string,
  defaultValue: T,
): SessionStorageValue<T> {
  const [value, setValue] = useState<T>(defaultValue);
  const defaultValueRef = useRef(defaultValue);
  defaultValueRef.current = defaultValue;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = globalThis.sessionStorage.getItem(key);
      if (stored) {
        setValue(JSON.parse(stored) as T);
      }
    } catch (error) {
      console.error(`Error reading sessionStorage key "${key}":`, error);
    }
  }, [key]);

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

    window.addEventListener(SYNC_EVENT, handleSync);
    return () => {
      window.removeEventListener(SYNC_EVENT, handleSync);
    };
  }, [key]);

  const set = useCallback((newVal: T) => {
    setValue(newVal);
    if (typeof window !== "undefined") {
      const serialized = JSON.stringify(newVal);
      globalThis.sessionStorage.setItem(key, serialized);
      window.dispatchEvent(
        new CustomEvent(SYNC_EVENT, { detail: { key, value: serialized } }),
      );
    }
  }, [key]);

  const clear = useCallback(() => {
    setValue(defaultValueRef.current);
    if (typeof window !== "undefined") {
      globalThis.sessionStorage.removeItem(key);
      window.dispatchEvent(
        new CustomEvent(SYNC_EVENT, { detail: { key, value: null } }),
      );
    }
  }, [key]);

  return { value, set, clear };
}
