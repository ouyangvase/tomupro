import { supabase } from '@/integrations/supabase/client';
import { extractStorageObjectPath } from '@/lib/storagePaths';

export { extractStorageObjectPath } from '@/lib/storagePaths';

const pendingSignedUrlRequests = new Map<string, Promise<string>>();

export async function getSignedStorageUrl(url: string, bucket: string, expiresIn = 3600): Promise<string> {
  const objectPath = extractStorageObjectPath(url, bucket);
  if (!objectPath) return url;

  const cacheKey = `${bucket}:${expiresIn}:${objectPath}`;
  const pendingRequest = pendingSignedUrlRequests.get(cacheKey);
  if (pendingRequest) return pendingRequest;

  const request = supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, expiresIn)
    .then(({ data, error }) => {
      if (error || !data?.signedUrl) {
        throw new Error(`Unable to load ${bucket} image${error?.message ? `: ${error.message}` : ''}`);
      }

      return data.signedUrl;
    });

  pendingSignedUrlRequests.set(cacheKey, request);

  try {
    return await request;
  } finally {
    if (pendingSignedUrlRequests.get(cacheKey) === request) {
      pendingSignedUrlRequests.delete(cacheKey);
    }
  }
}
