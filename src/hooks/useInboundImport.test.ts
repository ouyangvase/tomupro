import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from },
}));

import { fetchInboundImportProducts } from './useInboundImport';

function createPage(data: Array<{ id: string; owner_user_id: string; sku_code: string; sku_name: string }>) {
  const builder = {
    select: vi.fn(() => builder),
    in: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(async () => ({ data, error: null })),
  };
  return builder;
}

describe('inbound import product loading', () => {
  beforeEach(() => mocks.from.mockReset());

  it('loads every product page so SKUs beyond the API row limit remain selectable', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: `product-${index}`,
      owner_user_id: 'owner-1',
      sku_code: `SKU${index}`,
      sku_name: `Product ${index}`,
    }));
    const secondPage = [{
      id: 'product-1000',
      owner_user_id: 'owner-1',
      sku_code: 'VR002G',
      sku_name: 'ISLAMIC AYATUL KURSI NECKLACE GOLD',
    }];
    const firstBuilder = createPage(firstPage);
    const secondBuilder = createPage(secondPage);
    mocks.from.mockReturnValueOnce(firstBuilder).mockReturnValueOnce(secondBuilder);

    const products = await fetchInboundImportProducts(['owner-1']);

    expect(products).toHaveLength(1001);
    expect(products.at(-1)?.sku_code).toBe('VR002G');
    expect(firstBuilder.range).toHaveBeenCalledWith(0, 999);
    expect(secondBuilder.range).toHaveBeenCalledWith(1000, 1999);
  });
});
