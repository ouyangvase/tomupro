export function getTelegramChatIdCandidates(value: string, options?: { group?: boolean }): string[] {
  const normalized = value.trim();
  if (!normalized) return [];

  if (options?.group && /^100\d+$/.test(normalized)) {
    return [`-${normalized}`];
  }

  return [normalized];
}
