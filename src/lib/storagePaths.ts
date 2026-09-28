function decodeStoragePath(path: string) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function extractStorageObjectPath(url: string, bucket: string): string | null {
  const value = url.trim();
  if (!value) return null;

  const marker = `/${bucket}/`;
  const markerIndex = value.indexOf(marker);
  if (markerIndex !== -1) {
    const pathWithQuery = value.slice(markerIndex + marker.length);
    const path = pathWithQuery.split(/[?#]/, 1)[0];
    return path ? decodeStoragePath(path) : null;
  }

  // New uploads normally store a full public Storage URL, while older rows
  // may contain only the object path. Sign both forms before rendering a
  // private bucket image.
  if (!/^[a-z][a-z\d+.-]*:/i.test(value) && !value.startsWith('//')) {
    const rawPath = value.replace(/^\/+/, '').split(/[?#]/, 1)[0];
    const bucketPrefix = `${bucket}/`;
    const objectPath = rawPath.startsWith(bucketPrefix)
      ? rawPath.slice(bucketPrefix.length)
      : rawPath;
    return objectPath ? decodeStoragePath(objectPath) : null;
  }

  return null;
}
