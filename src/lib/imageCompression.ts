/**
 * Client-side image compression utility.
 * Proportionally resizes images and outputs WebP (with JPEG fallback).
 */

export interface CompressedImage {
  blob: Blob;
  extension: string; // 'webp' or 'jpeg'
}

export async function compressImage(
  file: File,
  opts?: { maxWidth?: number; quality?: number }
): Promise<CompressedImage> {
  const maxWidth = opts?.maxWidth ?? 1200;
  const quality = opts?.quality ?? 0.8;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Compute target dimensions preserving aspect ratio
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = Math.round(h * (maxWidth / w));
        w = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);

      // Try WebP first, fall back to JPEG
      canvas.toBlob(
        (webpBlob) => {
          if (webpBlob && webpBlob.size > 0) {
            resolve({ blob: webpBlob, extension: 'webp' });
          } else {
            // WebP not supported (older Safari), fall back to JPEG
            canvas.toBlob(
              (jpegBlob) => {
                if (jpegBlob) {
                  resolve({ blob: jpegBlob, extension: 'jpeg' });
                } else {
                  reject(new Error('Failed to compress image'));
                }
              },
              'image/jpeg',
              quality
            );
          }
        },
        'image/webp',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };

    img.src = objectUrl;
  });
}
