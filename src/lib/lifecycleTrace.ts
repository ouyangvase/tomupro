type LifecycleDetails = Record<
  string,
  string | number | boolean | null | undefined | string[]
>;

const enabled =
  import.meta.env.DEV ||
  import.meta.env.VITE_ENABLE_LIFECYCLE_TRACE === 'true';

const correlationId = (() => {
  const key = 'tomupro:lifecycle-correlation-id';
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
})();

export function lifecycleTrace(event: string, details: LifecycleDetails = {}) {
  if (!enabled) return;

  console.info('[Lifecycle]', {
    event,
    correlationId,
    timestamp: new Date().toISOString(),
    ...details,
  });
}
