const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.82;
const SKIP_BELOW_BYTES = 512_000;

const SHARE_MAX_LONG_EDGE = 1024;
const SHARE_JPEG_QUALITY = 0.75;

export async function fileToBlob(file: File): Promise<Blob> {
  // Small files need no compression — return as-is
  if (file.size < SKIP_BELOW_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file); // respects EXIF orientation

    let { width, height } = bitmap;
    const longEdge = Math.max(width, height);

    if (longEdge > MAX_LONG_EDGE) {
      const scale = MAX_LONG_EDGE / longEdge;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas context unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );

    // Release GPU memory
    canvas.width = 0;
    canvas.height = 0;

    if (!blob) throw new Error("canvas toBlob returned null");
    return blob;
  } catch (err) {
    console.warn("[FossilMap] photo compression failed, using original:", err);
    return file;
  }
}

export async function compressForShare(blob: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    let { width, height } = bitmap;
    const longEdge = Math.max(width, height);
    if (longEdge > SHARE_MAX_LONG_EDGE) {
      const scale = SHARE_MAX_LONG_EDGE / longEdge;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas context unavailable');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const result = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', SHARE_JPEG_QUALITY)
    );
    canvas.width = 0;
    canvas.height = 0;
    if (!result) throw new Error('canvas toBlob returned null');
    return result;
  } catch {
    return blob;
  }
}
