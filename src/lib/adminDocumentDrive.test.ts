import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDocumentDriveUrl, validateDocumentDriveUrl } from '@/lib/adminDocumentDrive';

const repoRoot = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(repoRoot, file), 'utf8');

describe('admin document drive settings', () => {
  it('accepts only trimmed HTTPS URLs', () => {
    expect(validateDocumentDriveUrl(' https://example.com/docs ')).toBeNull();
    expect(validateDocumentDriveUrl('javascript:alert(1)')).toBe('Use a secure HTTPS URL.');
    expect(validateDocumentDriveUrl('data:text/html,unsafe')).toBe('Use a secure HTTPS URL.');
    expect(validateDocumentDriveUrl('not a url')).toBe('Enter a valid HTTPS URL.');
  });

  it('reads only the saved document URL from setting metadata', () => {
    expect(getDocumentDriveUrl({ document_drive_url: ' https://drive.google.com/folders/test ' })).toBe('https://drive.google.com/folders/test');
    expect(getDocumentDriveUrl({ document_drive_url: '' })).toBeNull();
    expect(getDocumentDriveUrl(null)).toBeNull();
  });

  it('seeds the setting without changing the existing admin-only RLS policy', () => {
    const migration = read('supabase/migrations/20260812175151_admin_document_drive_link.sql');
    const rlsMigration = read('supabase/migrations/20260319085059_8687a949-9a9d-47b2-b954-7d0c37f3880d.sql');

    expect(migration).toContain("'tomupro_documents'");
    expect(migration).toContain("'document_drive_url'");
    expect(migration).toContain('https://drive.google.com/drive/folders/13Y3Gs7fNK6vjUcaIRVgJdah6E3sHXqTZ');
    expect(migration).toContain('validate_tomupro_document_drive_setting');
    expect(migration).toContain("v_url !~ '^https://[^[:space:]]+$'");
    expect(rlsMigration).toContain('CREATE POLICY "Admins can manage integration_settings"');
    expect(rlsMigration).toContain("public.has_role(auth.uid(), 'admin')");
  });
});
