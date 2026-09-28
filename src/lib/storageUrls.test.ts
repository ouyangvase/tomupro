import { describe, expect, it } from 'vitest';
import { extractStorageObjectPath } from '@/lib/storagePaths';

describe('storage URL handling', () => {
  it('extracts an object path from a public Storage URL', () => {
    expect(extractStorageObjectPath(
      'https://example.supabase.co/storage/v1/object/public/delivery-photos/user-1/proof.webp',
      'delivery-photos',
    )).toBe('user-1/proof.webp');
  });

  it('extracts an object path from a signed Storage URL', () => {
    expect(extractStorageObjectPath(
      'https://example.supabase.co/storage/v1/object/sign/delivery-photos/user-1/proof.webp?token=abc',
      'delivery-photos',
    )).toBe('user-1/proof.webp');
  });

  it('supports legacy rows that store only the object path', () => {
    expect(extractStorageObjectPath('user-1/proof.webp', 'delivery-photos'))
      .toBe('user-1/proof.webp');
    expect(extractStorageObjectPath('delivery-photos/user-1/proof.webp', 'delivery-photos'))
      .toBe('user-1/proof.webp');
  });

  it('decodes encoded path segments and removes query strings', () => {
    expect(extractStorageObjectPath(
      'https://example.supabase.co/storage/v1/object/public/delivery-photos/user%2F1/proof%20one.webp?download=1',
      'delivery-photos',
    )).toBe('user/1/proof one.webp');
  });

  it('leaves unrelated absolute URLs untouched for the caller', () => {
    expect(extractStorageObjectPath('https://cdn.example.com/proof.webp', 'delivery-photos'))
      .toBeNull();
    expect(extractStorageObjectPath('blob:https://example.com/proof', 'delivery-photos'))
      .toBeNull();
  });
});
