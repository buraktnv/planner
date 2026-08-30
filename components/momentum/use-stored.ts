"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Read a `localStorage` value in a way that survives server rendering.
 *
 * The obvious version — `useState` plus a `useEffect` that reads storage — is
 * a lint error here and a correctness trap besides: it renders once with the
 * wrong value on purpose. `useSyncExternalStore` has a server snapshot built
 * in, so the server and the first client render agree, and subscribing to
 * `storage` keeps two tabs of the app in step for free.
 */
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private window, or the browser is set to block site data.
    return null;
  }
}

/** Writes and notifies this tab; the `storage` event only fires in others. */
export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* nothing persists, but the in-memory value below still updates */
  }
  emit();
}

export function useStored(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => readStored(key), [key]),
    () => null,
  );
}
