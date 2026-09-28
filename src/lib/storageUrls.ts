import { supabase } from '@/integrations/supabase/client';
import { extractStorageObjectPath } from '@/lib/storagePaths';

export { extractStorageObjectPath } from '@/lib/storagePaths';

export async function getSignedStorageUrl(url: string, bucket: string, expiresIn = 3600): Promise<string> {
  const objectPath = extractStorageObjectPath(url, bucket);
  if (!objectPath) return url;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(`Unable to load ${bucket} image${error?.message ? `: ${error.message}` : ''}`);
  }

  return data.signedUrl;
}
