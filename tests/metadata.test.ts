import { describe, it, expect } from 'vitest';
import { extractMetadata } from '../src/metadata.js';
import sharp from 'sharp';

describe('extractMetadata', () => {
  it('should extract width and height from a bitmap image', async () => {
    const png = await sharp({
      create: { width: 100, height: 50, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer();

    const result = await extractMetadata(
      new Uint8Array(png),
      'image',
      'bitmap',
    );

    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
  });

  it('should return null dimensions for SVG (vector format)', async () => {
    const svgData = new Uint8Array(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>',
      ),
    );

    const result = await extractMetadata(svgData, 'image', 'vector');

    expect(result.width).toBeNull();
    expect(result.height).toBeNull();
  });

  it('should return null dimensions for video', async () => {
    const result = await extractMetadata(
      new Uint8Array([0, 0, 0]),
      'video',
      'bitmap',
    );

    expect(result.width).toBeNull();
    expect(result.height).toBeNull();
  });

  it('should return null dimensions for unparseable bitmap data', async () => {
    const result = await extractMetadata(
      new Uint8Array([1, 2, 3]),
      'image',
      'bitmap',
    );

    expect(result.width).toBeNull();
    expect(result.height).toBeNull();
  });
});
