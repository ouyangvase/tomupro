import { describe, expect, it } from 'vitest';
import {
  matchInboundProduct,
  matchInboundUser,
  normalizeMatchValue,
  prepareInboundRows,
  similarityScore,
} from '@/lib/inboundExcelImport';

const users = [
  { id: 'user-sarah', display_name: 'Sarah', email: 'sarah@example.com' },
  { id: 'user-joseph', display_name: 'Joseph Lim', email: 'joe@example.com' },
];

const products = [
  { id: 'product-1', owner_user_id: 'user-sarah', sku_code: 'AKOG01', sku_name: 'Bosster Oil' },
  { id: 'product-2', owner_user_id: 'user-joseph', sku_code: 'EX298', sku_name: 'Soil Activator' },
];

describe('inbound Excel matching', () => {
  it('normalizes punctuation and case for exact identifiers', () => {
    expect(normalizeMatchValue(' Sarah.Example ')).toBe('sarahexample');
    expect(similarityScore('AKOG-01', 'akog 01')).toBe(100);
  });

  it('matches users by display name, full email, and email prefix', () => {
    expect(matchInboundUser('SARAH', users)).toMatchObject({
      matchedId: 'user-sarah',
      state: 'Exact',
      score: 100,
    });
    expect(matchInboundUser('joe', users)).toMatchObject({
      matchedId: 'user-joseph',
      state: 'Exact',
      score: 100,
    });
  });

  it('does not silently select low-confidence user matches', () => {
    expect(matchInboundUser('unknown person', users)).toMatchObject({
      matchedId: null,
      suggestedId: null,
      state: 'No Match',
    });
  });

  it('matches products only inside the selected owner catalog', () => {
    expect(matchInboundProduct('AKOG01', products.filter((product) => product.owner_user_id === 'user-sarah')))
      .toMatchObject({ matchedId: 'product-1', state: 'Exact' });
    expect(matchInboundProduct('AKOG01', products.filter((product) => product.owner_user_id === 'user-joseph')))
      .toMatchObject({ matchedId: null, state: 'No Match' });
  });

  it('prepares exact user and SKU matches together', () => {
    const [row] = prepareInboundRows([{
      row_number: 2,
      username_raw: 'sarah@example.com',
      sku_raw: 'AKOG01',
      quantity_raw: '4',
      inbound_date_raw: '2026-07-30',
      reference_number: 'REF-1',
      remark: '',
    }], users, products);

    expect(row).toMatchObject({
      matched_user_id: 'user-sarah',
      matched_product_id: 'product-1',
      user_match_state: 'Exact',
      product_match_state: 'Exact',
    });
  });
});
