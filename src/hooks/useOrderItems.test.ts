import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { calculateOrderTotals } from './useOrderItems';
import type { OrderItem } from '@/types/database';

describe('native order totals', () => {
  it('preserves SKU line price semantics: quantity 2 and line amount 42 stays 42', () => {
    expect(calculateOrderTotals([{ qty: 2, price: 42, line_total: 42 }, { qty: 1, price: 30, line_total: 30 }] as OrderItem[]))
      .toEqual({ total_qty: 3, total_amount: 72 });
  });
  it('sums BND amounts in cents without float residue sent to PostgreSQL', () => {
    expect(calculateOrderTotals([{ qty: 1, price: 0.1 }, { qty: 1, price: 0.2 }] as OrderItem[]).total_amount).toBe(0.3);
  });
});
