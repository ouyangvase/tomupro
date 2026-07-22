const isChunkLoadFailure = (value: unknown) => {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return /Loading chunk|ChunkLoadError|dynamically imported module|Failed to fetch/i.test(message);
};

const reloadOnce = () => {
  const key = "tomupro_chunk_recovery_reload";
  const lastReload = Number(sessionStorage.getItem(key) || 0);

  if (Date.now() - lastReload > 10_000) {
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
  }
};

export const installChunkRecovery = () => {
  window.addEventListener("error", (event) => {
    if (isChunkLoadFailure(event.error) || isChunkLoadFailure(event.message)) {
      reloadOnce();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadFailure(event.reason)) {
      reloadOnce();
    }
  });
};

