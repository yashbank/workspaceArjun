/**
 * Pure, client-safe check for which raster image extensions the optimized
 * thumbnail endpoint can resize. Kept separate from `server/files/thumbnail.ts`
 * (which dynamically imports the native `sharp` package) so client components
 * can reuse the format list without pulling sharp into the browser bundle.
 *
 * Excludes svg (rasterizing is risky) and heic/heif (sharp build lacks libheif);
 * those keep their existing preview / premium-card fallbacks.
 */
export const THUMBNAILABLE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff']);

export function isThumbnailable(ext: string): boolean {
  return THUMBNAILABLE_EXTS.has(ext.trim().toLowerCase());
}
