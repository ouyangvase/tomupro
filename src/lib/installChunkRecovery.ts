import { isChunkLoadFailure, recoverFromChunkLoadFailure, installChunkRecoveryParamCleanup } from "@/lib/chunkRecovery";

export const installChunkRecovery = () => {
  installChunkRecoveryParamCleanup();

  window.addEventListener("error", (event) => {
    if (isChunkLoadFailure(event.error) || isChunkLoadFailure(event.message)) {
      recoverFromChunkLoadFailure();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadFailure(event.reason)) {
      recoverFromChunkLoadFailure();
    }
  });
};
