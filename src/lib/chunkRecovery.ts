import type { ComponentType } from "react";
import { lazy } from "react";

const RECOVERY_KEY = "tomupro_chunk_recovery_reload";
const CLEAN_RECOVERY_KEY = "tomupro_chunk_recovery_clean";
const RECOVERY_PARAM = "__chunk_recovery";
const RECOVERY_WINDOW_MS = 10_000;

export const isChunkLoadFailure = (value: unknown) => {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return /Loading chunk|ChunkLoadError|dynamically imported module|Failed to fetch|Importing a module script failed|Failed to load module script|Unable to preload CSS|CSS chunk|Unexpected token '<'/i.test(message);
};

const clearRecoveryParam = () => {
  if (!window.location.search.includes(`${RECOVERY_PARAM}=`)) return;

  const url = new URL(window.location.href);
  url.searchParams.delete(RECOVERY_PARAM);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
};

export const recoverFromChunkLoadFailure = () => {
  const now = Date.now();
  const lastReload = Number(sessionStorage.getItem(RECOVERY_KEY) || 0);

  if (now - lastReload <= RECOVERY_WINDOW_MS) {
    // A normal cache-busted reload can still be served alongside a stale
    // stylesheet/module cache on mobile browsers. Allow one clean retry, then
    // stop so a persistent application error cannot create a reload loop.
    if (sessionStorage.getItem(CLEAN_RECOVERY_KEY) === "1") return false;
    sessionStorage.setItem(CLEAN_RECOVERY_KEY, "1");
    void forceCleanReload();
    return true;
  }

  sessionStorage.removeItem(CLEAN_RECOVERY_KEY);
  sessionStorage.setItem(RECOVERY_KEY, String(now));
  const url = new URL(window.location.href);
  url.searchParams.set(RECOVERY_PARAM, String(now));
  window.location.replace(url.toString());
  return true;
};

export const forceReloadApp = () => {
  sessionStorage.removeItem(RECOVERY_KEY);
  const url = new URL(window.location.href);
  url.searchParams.set(RECOVERY_PARAM, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  window.location.replace(url.toString());
};

export const forceCleanReload = async () => {
  try {
    if ("caches" in window) {
      await Promise.all((await window.caches.keys()).map((key) => window.caches.delete(key)));
    }

    if ("serviceWorker" in navigator) {
      await Promise.all((await navigator.serviceWorker.getRegistrations()).map((registration) => registration.unregister()));
    }
  } finally {
    forceReloadApp();
  }
};

export const resetChunkRecovery = () => {
  forceReloadApp();
};

export const installChunkRecoveryParamCleanup = () => {
  clearRecoveryParam();
};

type LazyModule = { default: ComponentType<any> };

export const lazyWithChunkRecovery = <T extends LazyModule>(importFn: () => Promise<T>) =>
  lazy(() =>
    importFn().catch((error) => {
      if (!isChunkLoadFailure(error) || !recoverFromChunkLoadFailure()) {
        throw error;
      }

      // Navigation is already in progress. Keep Suspense pending until the
      // fresh entry file is loaded instead of surfacing a generic error page.
      return new Promise<T>(() => {});
    }),
  );
