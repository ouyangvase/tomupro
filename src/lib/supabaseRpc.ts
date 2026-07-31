import { supabase } from '@/integrations/supabase/client';

type RpcResult<T> = {
  data: T | null;
  error: Error | null;
};

type RpcFilterBuilder<T> = PromiseLike<RpcResult<T>> & {
  in(column: string, values: readonly string[]): RpcFilterBuilder<T>;
};

type DynamicRpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): RpcFilterBuilder<T>;
};

type RpcOptions = {
  in?: {
    column: string;
    values: readonly string[];
  };
};

export async function callSupabaseRpc<T>(
  name: string,
  args: Record<string, unknown>,
  options: RpcOptions = {},
): Promise<T> {
  const client = supabase as unknown as DynamicRpcClient;
  let request = client.rpc<T>(name, args);
  if (options.in?.values.length) {
    request = request.in(options.in.column, options.in.values);
  }

  const { data, error } = await request;
  if (error) throw error;
  return data as T;
}
