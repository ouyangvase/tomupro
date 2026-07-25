import { supabase } from '@/integrations/supabase/client';

type RpcResult<T> = {
  data: T | null;
  error: Error | null;
};

type DynamicRpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<RpcResult<T>>;
};

export async function callSupabaseRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const client = supabase as unknown as DynamicRpcClient;
  const { data, error } = await client.rpc<T>(name, args);
  if (error) throw error;
  return data as T;
}
