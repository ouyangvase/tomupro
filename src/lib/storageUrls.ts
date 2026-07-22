import { supabase } from '@/integrations/supabase/client';

export function extractStorageObjectPath(url: string, bucket: string): string | null {
  const marker = `/${bucket}/`;
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return null;

  const pathWithQuery = url.slice(markerIndex + marker.length);
  const path = pathWithQuery.split('?')[0];
  return path ? decodeURIComponent(path) : null;
}

export async function getSignedStorageUrl(url: string, bucket: string, expiresIn = 3600): Promise<string> {
  const objectPath = extractStorageObjectPath(url, bucket);
  if (!objectPath) return url;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, expiresIn);

  if (error || !data?.signedUrl) return url;
  return data.signedUrl;
}
