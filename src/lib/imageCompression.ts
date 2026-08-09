/**
 * Client-side image compression utility.
 * Proportionally resizes images and outputs WebP (with JPEG fallback).
 */

export interface CompressedImage {
  blob: Blob;
  extension: string; // 'webp' or 'jpeg'
}

type DrawableImage = ImageBitmap | HTMLImageElement;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

async function loadDrawableImage(file: File): Promise<DrawableImage> {
  // Chromium on Android can decode camera images off the main thread with
  // createImageBitmap. Keep the Image fallback for older Safari and formats
  // that the bitmap decoder does not support.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        // Fall through to the browser Image decoder.
      }
    }
  }

  const image = new Image();
  const objectUrl = URL.createObjectURL(file);

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load image'));
      image.src = objectUrl;
    });
    if (typeof image.decode === 'function') {
      await image.decode().catch(() => undefined);
    }
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getSourceDimensions(source: DrawableImage) {
  if ('close' in source) {
    return { width: source.width, height: source.height };
  }
  return { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImage(
  file: File,
  opts?: { maxWidth?: number; quality?: number }
): Promise<CompressedImage> {
  const maxWidth = opts?.maxWidth ?? 1200;
  const quality = opts?.quality ?? 0.8;
  // Let the pending/uploading state paint before decoding a potentially
  // multi-megapixel Android camera image.
  await yieldToBrowser();
  const source = await loadDrawableImage(file);

  try {
    // Give React/browser rendering a chance to show the loading state before
    // the canvas work starts. This is important for large Android camera files.
    await yieldToBrowser();

    const { width: sourceWidth, height: sourceHeight } = getSourceDimensions(source);
    if (!sourceWidth || !sourceHeight) throw new Error('Failed to read image dimensions');

    let width = sourceWidth;
    let height = sourceHeight;
    if (width > maxWidth) {
      height = Math.round(height * (maxWidth / width));
      width = maxWidth;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas not supported');

    context.drawImage(source, 0, 0, width, height);
    await yieldToBrowser();

    // Try WebP first, fall back to JPEG for older browsers.
    const webpBlob = await canvasToBlob(canvas, 'image/webp', quality);
    if (webpBlob && webpBlob.size > 0) {
      return { blob: webpBlob, extension: 'webp' };
    }

    const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (!jpegBlob || jpegBlob.size === 0) throw new Error('Failed to compress image');
    return { blob: jpegBlob, extension: 'jpeg' };
  } finally {
    if ('close' in source && typeof source.close === 'function') source.close();
  }
}
