export const ADMIN_DOCUMENTS_SETTING = 'tomupro_documents';
export const DOCUMENT_DRIVE_URL_KEY = 'document_drive_url';

type SettingMetadata = Record<string, unknown>;

function getMetadata(metadata: unknown): SettingMetadata {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as SettingMetadata
    : {};
}

export function getDocumentDriveUrl(metadata: unknown): string | null {
  const url = getMetadata(metadata)[DOCUMENT_DRIVE_URL_KEY];
  return typeof url === 'string' && url.trim() ? url.trim() : null;
}

export function validateDocumentDriveUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter a document storage URL.';

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return 'Use a secure HTTPS URL.';
  } catch {
    return 'Enter a valid HTTPS URL.';
  }

  return null;
}
