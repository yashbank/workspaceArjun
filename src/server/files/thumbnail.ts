/**
 * Server-side thumbnail generation for the optimized thumbnail route.
 *
 * `isThumbnailable` is a pure check (no sharp import) so it can be unit-tested
 * cheaply. `generateThumbnail` lazily imports sharp so the native binary is only
 * loaded when a thumbnail is actually produced (keeps cold start / tests light).
 */

/** Raster image extensions sharp can safely resize for a thumbnail. */
const THUMBNAILABLE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff']);

/** Hard cap on source bytes — refuse to thumbnail very large originals (memory). */
export const MAX_THUMBNAIL_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB

/** Decompression-bomb guard: max pixels sharp will decode (~50 MP). */
const MAX_THUMBNAIL_INPUT_PIXELS = 50_000_000;

/** WebP output quality — small files, still visually clean for thumbnails. */
const THUMBNAIL_QUALITY = 70;

/**
 * Whether a file extension is a raster image we can thumbnail. Explicitly
 * excludes svg/heic/heif (rasterizing is risky or unsupported) and all
 * non-image types (mp4, mov, pdf, cdr, xlsx, ai, psd, eps, …), which keep their
 * existing video/preview/premium-card fallbacks.
 */
export function isThumbnailable(ext: string): boolean {
  return THUMBNAILABLE_EXTS.has(ext.trim().toLowerCase());
}

/**
 * Resizes raster image bytes to a WebP thumbnail of the given width.
 * - `rotate()` applies EXIF orientation (phone photos come out upright)
 * - `withoutEnlargement` never upscales small images
 * - `limitInputPixels` guards against decompression bombs
 * Throws if the input can't be decoded; callers should fall back gracefully.
 */
export async function generateThumbnail(input: Uint8Array, width: number): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  return sharp(Buffer.from(input), {
    limitInputPixels: MAX_THUMBNAIL_INPUT_PIXELS,
    failOn: 'none',
  })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: THUMBNAIL_QUALITY })
    .toBuffer();
}
