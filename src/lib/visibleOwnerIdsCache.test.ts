import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: rpcMock,
  },
}));

vi.mock('@/lib/lifecycleTrace', () => ({
  lifecycleTrace: vi.fn(),
}));

import {
  clearVisibleOwnerIdsCache,
  getVisibleOwnerIdsCached,
} from '@/lib/visibleOwnerIdsCache';

describe('visibleOwnerIdsCache', () => {
  beforeEach(() => {
    clearVisibleOwnerIdsCache();
    rpcMock.mockReset();
  });

  it('deduplicates concurrent scope requests for the same user', async () => {
    rpcMock.mockResolvedValue({ data: ['owner-1'], error: null });

    const [first, second] = await Promise.all([
      getVisibleOwnerIdsCached('user-1'),
      getVisibleOwnerIdsCached('user-1'),
    ]);

    expect(first).toEqual(['owner-1']);
    expect(second).toEqual(['owner-1']);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('never reuses another user scope', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: ['owner-a'], error: null })
      .mockResolvedValueOnce({ data: ['owner-b'], error: null });

    await expect(getVisibleOwnerIdsCached('user-a')).resolves.toEqual(['owner-a']);
    await expect(getVisibleOwnerIdsCached('user-b')).resolves.toEqual(['owner-b']);
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces the first scope failure instead of treating it as unrestricted access', async () => {
    const error = { code: 'PGRST301', message: 'scope unavailable' };
    rpcMock.mockResolvedValue({ data: null, error });

    await expect(getVisibleOwnerIdsCached('user-1')).rejects.toEqual(error);
  });
});
