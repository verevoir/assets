import type { AssetFormat, AssetType } from './types.js';

interface ExtractedMetadata {
  width: number | null;
  height: number | null;
}

/**
 * Extract pixel dimensions from binary asset data.
 *
 * Only bitmap images are processed (via Sharp). SVG and video assets
 * return null dimensions — SVG has no inherent pixel size, and video
 * would require ffprobe which is out of scope.
 */
export async function extractMetadata(
  data: Uint8Array,
  type: AssetType,
  format: AssetFormat,
): Promise<ExtractedMetadata> {
  if (type !== 'image' || format !== 'bitmap') {
    return { width: null, height: null };
  }

  try {
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(data).metadata();

    return {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
    };
  } catch {
    // If Sharp cannot parse the buffer, fall back to null dimensions
    return { width: null, height: null };
  }
}
