import type { ComponentType } from "react";
import { lazy } from "react";

const RECOVERY_KEY = "tomupro_chunk_recovery_reload";
const RECOVERY_PARAM = "__chunk_recovery";
const RECOVERY_WINDOW_MS = 10_000;

export const isChunkLoadFailure = (value: unknown) => {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return /Loading chunk|ChunkLoadError|dynamically imported module|Failed to fetch/i.test(message);
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

  if (now - lastReload <= RECOVERY_WINDOW_MS) return false;

  sessionStorage.setItem(RECOVERY_KEY, String(now));
  const url = new URL(window.location.href);
  url.searchParams.set(RECOVERY_PARAM, String(now));
  window.location.replace(url.toString());
  return true;
};

export const resetChunkRecovery = () => {
  sessionStorage.removeItem(RECOVERY_KEY);
  recoverFromChunkLoadFailure();
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
