import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryAdapter } from '@nextlake/storage';
import { AssetManager } from '../src/manager.js';
import { MemoryBlobStore } from '../src/memory.js';

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
      });

      expect(asset.id).toBeDefined();
      expect(asset.filename).toBe('logo.png');
      expect(asset.contentType).toBe('image/png');
      expect(asset.size).toBe(4);
      expect(asset.blobKey).toBeDefined();
      expect(asset.createdAt).toBeInstanceOf(Date);
      expect(asset.updatedAt).toBeInstanceOf(Date);
    });

    it('should store the blob in the BlobStore', async () => {
      const data = new Uint8Array([1, 2, 3]);
      const asset = await manager.upload({
        data,
        filename: 'test.bin',
        contentType: 'application/octet-stream',
      });

      const blob = await blobStore.get(asset.blobKey);
      expect(blob).not.toBeNull();
      expect(blob!.data).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('should reject empty filename', async () => {
      await expect(
        manager.upload({
          data: new Uint8Array([1]),
          filename: '',
          contentType: 'text/plain',
        }),
      ).rejects.toThrow('filename is required');
    });

    it('should reject empty contentType', async () => {
      await expect(
        manager.upload({
          data: new Uint8Array([1]),
          filename: 'test.txt',
          contentType: '',
        }),
      ).rejects.toThrow('contentType is required');
    });

    it('should reject empty data', async () => {
      await expect(
        manager.upload({
          data: new Uint8Array([]),
          filename: 'test.txt',
          contentType: 'text/plain',
        }),
      ).rejects.toThrow('data must not be empty');
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
          filename: 'test.txt',
          contentType: 'text/plain',
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
        filename: 'test.txt',
        contentType: 'text/plain',
      });

      const asset = await manager.get(uploaded.id);
      expect(asset).not.toBeNull();
      expect(asset!.id).toBe(uploaded.id);
      expect(asset!.filename).toBe('test.txt');
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
        filename: 'data.bin',
        contentType: 'application/octet-stream',
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
        filename: 'test.txt',
        contentType: 'text/plain',
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
        filename: 'test.txt',
        contentType: 'text/plain',
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
        filename: 'a.txt',
        contentType: 'text/plain',
      });
      await manager.upload({
        data: new Uint8Array([2]),
        filename: 'b.txt',
        contentType: 'text/plain',
      });

      const assets = await manager.list();
      expect(assets).toHaveLength(2);
      expect(assets.map((a) => a.filename).sort()).toEqual(['a.txt', 'b.txt']);
    });

    it('should support limit option', async () => {
      await manager.upload({
        data: new Uint8Array([1]),
        filename: 'a.txt',
        contentType: 'text/plain',
      });
      await manager.upload({
        data: new Uint8Array([2]),
        filename: 'b.txt',
        contentType: 'text/plain',
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
      });
      await manager.upload({
        data: new Uint8Array([2]),
        filename: 'doc.txt',
        contentType: 'text/plain',
      });

      const images = await manager.list({
        where: { contentType: 'image/png' },
      });
      expect(images).toHaveLength(1);
      expect(images[0].filename).toBe('photo.png');
    });
  });
});
