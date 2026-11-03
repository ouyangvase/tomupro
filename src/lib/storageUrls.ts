import { supabase } from '@/integrations/supabase/client';
import { extractStorageObjectPath } from '@/lib/storagePaths';

export { extractStorageObjectPath } from '@/lib/storagePaths';

export async function getSignedStorageUrl(url: string, bucket: string, expiresIn = 3600): Promise<string> {
  // The result is rendered as a link and image source, so only a signed
  // Storage URL is returned, never the stored value (e.g. a javascript: url).
  const objectPath = extractStorageObjectPath(url, bucket);
  if (!objectPath) throw new Error(`Unable to load ${bucket} image`);

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(`Unable to load ${bucket} image${error?.message ? `: ${error.message}` : ''}`);
  }

  return data.signedUrl;
}
