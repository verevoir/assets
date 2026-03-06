import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryAdapter } from '@verevoir/storage';
import sharp from 'sharp';
import { AssetManager } from '../src/manager.js';
import { MemoryBlobStore } from '../src/memory.js';
import type { AssetAnalyzer } from '../src/types.js';

async function makePng(width: number, height: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: '#ff0000' },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buf);
}

describe('AssetManager', () => {
  let storage: MemoryAdapter;
  let blobStore: MemoryBlobStore;
  let manager: AssetManager;

  beforeEach(async () => {
    storage = new MemoryAdapter();
    blobStore = new MemoryBlobStore();
    await storage.connect();
    manager = new AssetManager({ storage, blobStore });
  });

  describe('upload', () => {
    it('should upload and return asset metadata', async () => {
      const asset = await manager.upload({
        data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        filename: 'logo.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      expect(asset.id).toBeDefined();
      expect(asset.filename).toBe('logo.png');
      expect(asset.contentType).toBe('image/png');
      expect(asset.size).toBe(4);
      expect(asset.blobKey).toBeDefined();
      expect(asset.createdBy).toBe('user-1');
      expect(asset.type).toBe('image');
      expect(asset.format).toBe('bitmap');
      expect(asset.createdAt).toBeInstanceOf(Date);
      expect(asset.updatedAt).toBeInstanceOf(Date);
    });

    it('should store the blob in the BlobStore', async () => {
      const data = new Uint8Array([1, 2, 3]);
      const asset = await manager.upload({
        data,
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        createdBy: 'user-1',
      });

      const blob = await blobStore.get(asset.blobKey);
      expect(blob).not.toBeNull();
      expect(blob!.data).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('should derive type: image and format: bitmap for image/png', async () => {
      const asset = await manager.upload({
        data: new Uint8Array([1]),
        filename: 'photo.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      expect(asset.type).toBe('image');
      expect(asset.format).toBe('bitmap');
    });

    it('should derive type: image and format: vector for image/svg+xml', async () => {
      const asset = await manager.upload({
        data: new Uint8Array([1]),
        filename: 'icon.svg',
        contentType: 'image/svg+xml',
        createdBy: 'user-1',
      });

      expect(asset.type).toBe('image');
      expect(asset.format).toBe('vector');
    });

    it('should derive type: video and format: bitmap for video/mp4', async () => {
      const asset = await manager.upload({
        data: new Uint8Array([1]),
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        createdBy: 'user-1',
      });

      expect(asset.type).toBe('video');
      expect(asset.format).toBe('bitmap');
    });

    it('should reject unsupported contentType', async () => {
      await expect(
        manager.upload({
          data: new Uint8Array([1]),
          filename: 'doc.pdf',
          contentType: 'application/pdf',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow(
        'Unsupported contentType: application/pdf. Must be image/* or video/*.',
      );
    });

    it('should reject empty filename', async () => {
      await expect(
        manager.upload({
          data: new Uint8Array([1]),
          filename: '',
          contentType: 'image/png',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('filename is required');
    });

    it('should reject empty contentType', async () => {
      await expect(
        manager.upload({
          data: new Uint8Array([1]),
          filename: 'test.txt',
          contentType: '',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('contentType is required');
    });

    it('should reject empty data', async () => {
      await expect(
        manager.upload({
          data: new Uint8Array([]),
          filename: 'test.png',
          contentType: 'image/png',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('data must not be empty');
    });

    it('should reject empty createdBy', async () => {
      await expect(
        manager.upload({
          data: new Uint8Array([1]),
          filename: 'test.png',
          contentType: 'image/png',
          createdBy: '',
        }),
      ).rejects.toThrow('createdBy is required');
    });

    it('should clean up blob if metadata creation fails', async () => {
      const failingStorage = new MemoryAdapter();
      await failingStorage.connect();

      // Spy on blobStore to track put and delete
      const putSpy = vi.spyOn(blobStore, 'put');
      const deleteSpy = vi.spyOn(blobStore, 'delete');

      // Make storage.create fail
      vi.spyOn(failingStorage, 'create').mockRejectedValueOnce(
        new Error('DB error'),
      );

      const failingManager = new AssetManager({
        storage: failingStorage,
        blobStore,
      });

      await expect(
        failingManager.upload({
          data: new Uint8Array([1, 2, 3]),
          filename: 'test.png',
          contentType: 'image/png',
          createdBy: 'user-1',
        }),
      ).rejects.toThrow('DB error');

      // Blob was put then cleaned up
      expect(putSpy).toHaveBeenCalledOnce();
      expect(deleteSpy).toHaveBeenCalledOnce();

      // The blob key passed to delete should match what was passed to put
      const putKey = putSpy.mock.calls[0][0];
      const deleteKey = deleteSpy.mock.calls[0][0];
      expect(deleteKey).toBe(putKey);
    });
  });

  describe('get', () => {
    it('should return asset metadata by ID', async () => {
      const uploaded = await manager.upload({
        data: new Uint8Array([1]),
        filename: 'test.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      const asset = await manager.get(uploaded.id);
      expect(asset).not.toBeNull();
      expect(asset!.id).toBe(uploaded.id);
      expect(asset!.filename).toBe('test.png');
      expect(asset!.createdBy).toBe('user-1');
      expect(asset!.type).toBe('image');
      expect(asset!.format).toBe('bitmap');
    });

    it('should return null for missing ID', async () => {
      const asset = await manager.get('nonexistent');
      expect(asset).toBeNull();
    });
  });

  describe('download', () => {
    it('should return asset metadata and binary data', async () => {
      const data = new Uint8Array([10, 20, 30]);
      const uploaded = await manager.upload({
        data,
        filename: 'data.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      const result = await manager.download(uploaded.id);
      expect(result).not.toBeNull();
      expect(result!.asset.id).toBe(uploaded.id);
      expect(result!.data).toEqual(new Uint8Array([10, 20, 30]));
    });

    it('should return null for missing ID', async () => {
      const result = await manager.download('nonexistent');
      expect(result).toBeNull();
    });

    it('should return null if blob is missing', async () => {
      const uploaded = await manager.upload({
        data: new Uint8Array([1]),
        filename: 'test.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      // Manually delete the blob
      await blobStore.delete(uploaded.blobKey);

      const result = await manager.download(uploaded.id);
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete both blob and metadata', async () => {
      const uploaded = await manager.upload({
        data: new Uint8Array([1, 2, 3]),
        filename: 'test.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      await manager.delete(uploaded.id);

      expect(await manager.get(uploaded.id)).toBeNull();
      expect(await blobStore.get(uploaded.blobKey)).toBeNull();
    });

    it('should throw for missing ID', async () => {
      await expect(manager.delete('nonexistent')).rejects.toThrow(
        'Asset not found: nonexistent',
      );
    });
  });

  describe('list', () => {
    it('should list all assets', async () => {
      await manager.upload({
        data: new Uint8Array([1]),
        filename: 'a.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });
      await manager.upload({
        data: new Uint8Array([2]),
        filename: 'b.jpg',
        contentType: 'image/jpeg',
        createdBy: 'user-2',
      });

      const assets = await manager.list();
      expect(assets).toHaveLength(2);
      expect(assets.map((a) => a.filename).sort()).toEqual(['a.png', 'b.jpg']);
    });

    it('should support limit option', async () => {
      await manager.upload({
        data: new Uint8Array([1]),
        filename: 'a.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });
      await manager.upload({
        data: new Uint8Array([2]),
        filename: 'b.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      const assets = await manager.list({ limit: 1 });
      expect(assets).toHaveLength(1);
    });

    it('should return empty array when no assets exist', async () => {
      const assets = await manager.list();
      expect(assets).toEqual([]);
    });

    it('should support filtering by contentType', async () => {
      await manager.upload({
        data: new Uint8Array([1]),
        filename: 'photo.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });
      await manager.upload({
        data: new Uint8Array([2]),
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        createdBy: 'user-1',
      });

      const images = await manager.list({
        where: { contentType: 'image/png' },
      });
      expect(images).toHaveLength(1);
      expect(images[0].filename).toBe('photo.png');
    });
  });

  describe('metadata extraction', () => {
    it('should extract width and height from a bitmap image', async () => {
      const pngData = await makePng(200, 150);
      const asset = await manager.upload({
        data: pngData,
        filename: 'photo.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      expect(asset.width).toBe(200);
      expect(asset.height).toBe(150);
      expect(asset.hotspot).toBeNull();
      expect(asset.tags).toEqual([]);
    });

    it('should return null dimensions for video', async () => {
      const asset = await manager.upload({
        data: new Uint8Array([1, 2, 3]),
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        createdBy: 'user-1',
      });

      expect(asset.width).toBeNull();
      expect(asset.height).toBeNull();
    });

    it('should return null dimensions for SVG', async () => {
      const svgData = new Uint8Array(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>',
        ),
      );
      const asset = await manager.upload({
        data: svgData,
        filename: 'icon.svg',
        contentType: 'image/svg+xml',
        createdBy: 'user-1',
      });

      expect(asset.width).toBeNull();
      expect(asset.height).toBeNull();
    });
  });

  describe('updateMetadata', () => {
    it('should set hotspot without changing other fields', async () => {
      const pngData = await makePng(100, 100);
      const uploaded = await manager.upload({
        data: pngData,
        filename: 'photo.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      const updated = await manager.updateMetadata(uploaded.id, {
        hotspot: { x: 0.5, y: 0.3 },
      });

      expect(updated.hotspot).toEqual({ x: 0.5, y: 0.3 });
      expect(updated.filename).toBe('photo.png');
      expect(updated.width).toBe(100);
      expect(updated.height).toBe(100);
      expect(updated.size).toBe(uploaded.size);
      expect(updated.blobKey).toBe(uploaded.blobKey);
    });

    it('should clear hotspot when set to null', async () => {
      const pngData = await makePng(100, 100);
      const uploaded = await manager.upload({
        data: pngData,
        filename: 'photo.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      await manager.updateMetadata(uploaded.id, {
        hotspot: { x: 0.5, y: 0.5 },
      });
      const cleared = await manager.updateMetadata(uploaded.id, {
        hotspot: null,
      });

      expect(cleared.hotspot).toBeNull();
    });

    it('should update filename without changing blob', async () => {
      const pngData = await makePng(100, 100);
      const uploaded = await manager.upload({
        data: pngData,
        filename: 'old-name.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      const updated = await manager.updateMetadata(uploaded.id, {
        filename: 'new-name.png',
      });

      expect(updated.filename).toBe('new-name.png');
      expect(updated.blobKey).toBe(uploaded.blobKey);
      expect(updated.size).toBe(uploaded.size);
    });

    it('should throw for missing asset ID', async () => {
      await expect(
        manager.updateMetadata('nonexistent', { hotspot: { x: 0.5, y: 0.5 } }),
      ).rejects.toThrow('Asset not found: nonexistent');
    });

    it('should reject hotspot x out of range', async () => {
      const pngData = await makePng(100, 100);
      const uploaded = await manager.upload({
        data: pngData,
        filename: 'photo.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      await expect(
        manager.updateMetadata(uploaded.id, { hotspot: { x: 1.5, y: 0.5 } }),
      ).rejects.toThrow('Hotspot x and y must be between 0 and 1');
    });

    it('should reject hotspot y out of range', async () => {
      const pngData = await makePng(100, 100);
      const uploaded = await manager.upload({
        data: pngData,
        filename: 'photo.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      await expect(
        manager.updateMetadata(uploaded.id, { hotspot: { x: 0.5, y: -0.1 } }),
      ).rejects.toThrow('Hotspot x and y must be between 0 and 1');
    });

    it('should reject empty filename', async () => {
      const pngData = await makePng(100, 100);
      const uploaded = await manager.upload({
        data: pngData,
        filename: 'photo.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      await expect(
        manager.updateMetadata(uploaded.id, { filename: '' }),
      ).rejects.toThrow('filename must not be empty');
    });

    it('should set tags', async () => {
      const pngData = await makePng(100, 100);
      const uploaded = await manager.upload({
        data: pngData,
        filename: 'photo.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      expect(uploaded.tags).toEqual([]);

      const updated = await manager.updateMetadata(uploaded.id, {
        tags: ['hero', 'banner'],
      });

      expect(updated.tags).toEqual(['hero', 'banner']);
      expect(updated.filename).toBe('photo.png');
    });

    it('should replace tags entirely', async () => {
      const pngData = await makePng(100, 100);
      const uploaded = await manager.upload({
        data: pngData,
        filename: 'photo.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      await manager.updateMetadata(uploaded.id, { tags: ['a', 'b'] });
      const updated = await manager.updateMetadata(uploaded.id, {
        tags: ['c'],
      });

      expect(updated.tags).toEqual(['c']);
    });

    it('should clear tags with empty array', async () => {
      const pngData = await makePng(100, 100);
      const uploaded = await manager.upload({
        data: pngData,
        filename: 'photo.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      await manager.updateMetadata(uploaded.id, { tags: ['x'] });
      const updated = await manager.updateMetadata(uploaded.id, { tags: [] });

      expect(updated.tags).toEqual([]);
    });

    it('should set and clear alt', async () => {
      const pngData = await makePng(100, 100);
      const uploaded = await manager.upload({
        data: pngData,
        filename: 'photo.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      expect(uploaded.alt).toBeNull();

      const updated = await manager.updateMetadata(uploaded.id, {
        alt: 'A red square',
      });
      expect(updated.alt).toBe('A red square');

      const cleared = await manager.updateMetadata(uploaded.id, {
        alt: null,
      });
      expect(cleared.alt).toBeNull();
    });

    it('should set and clear attribution', async () => {
      const pngData = await makePng(100, 100);
      const uploaded = await manager.upload({
        data: pngData,
        filename: 'photo.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      expect(uploaded.attribution).toBeNull();

      const updated = await manager.updateMetadata(uploaded.id, {
        attribution: 'Photo by Jane Doe',
      });
      expect(updated.attribution).toBe('Photo by Jane Doe');

      const cleared = await manager.updateMetadata(uploaded.id, {
        attribution: null,
      });
      expect(cleared.attribution).toBeNull();
    });
  });

  describe('analyzer integration', () => {
    it('should auto-populate alt and tags when analyzer is provided', async () => {
      const analyzer: AssetAnalyzer = {
        analyze: vi.fn().mockResolvedValue({
          alt: 'A conference speaker on stage',
          tags: ['speaker', 'stage', 'conference'],
        }),
      };

      const analyzerManager = new AssetManager({
        storage,
        blobStore,
        analyzer,
      });

      const asset = await analyzerManager.upload({
        data: new Uint8Array([1, 2, 3]),
        filename: 'speaker.jpg',
        contentType: 'image/jpeg',
        createdBy: 'user-1',
      });

      expect(asset.alt).toBe('A conference speaker on stage');
      expect(asset.tags).toEqual(['speaker', 'stage', 'conference']);
      expect(analyzer.analyze).toHaveBeenCalledOnce();
    });

    it('should pass existing tags to the analyzer', async () => {
      const analyzer: AssetAnalyzer = {
        analyze: vi.fn().mockResolvedValue({ alt: 'test', tags: ['new-tag'] }),
      };

      const analyzerManager = new AssetManager({
        storage,
        blobStore,
        analyzer,
      });

      // Upload first asset with manual tags
      const first = await analyzerManager.upload({
        data: new Uint8Array([1]),
        filename: 'first.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });
      await analyzerManager.updateMetadata(first.id, {
        tags: ['hero', 'banner'],
      });

      // Upload second asset — analyzer should receive existing tags
      await analyzerManager.upload({
        data: new Uint8Array([2]),
        filename: 'second.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      const lastCall = (analyzer.analyze as ReturnType<typeof vi.fn>).mock
        .calls[1];
      expect(lastCall[0].existingTags).toContain('hero');
      expect(lastCall[0].existingTags).toContain('banner');
    });

    it('should proceed with empty alt/tags if analyzer fails', async () => {
      const analyzer: AssetAnalyzer = {
        analyze: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
      };

      const analyzerManager = new AssetManager({
        storage,
        blobStore,
        analyzer,
      });

      const asset = await analyzerManager.upload({
        data: new Uint8Array([1, 2, 3]),
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        createdBy: 'user-1',
      });

      expect(asset.alt).toBeNull();
      expect(asset.tags).toEqual([]);
    });

    it('should work without analyzer (default behaviour)', async () => {
      const asset = await manager.upload({
        data: new Uint8Array([1]),
        filename: 'photo.png',
        contentType: 'image/png',
        createdBy: 'user-1',
      });

      expect(asset.alt).toBeNull();
      expect(asset.tags).toEqual([]);
    });
  });
});
