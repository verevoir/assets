import { describe, it, expect, beforeEach } from 'vitest';
import { GcsBlobStore } from '../src/gcs/blob-store.js';

/** Minimal mock of GCS Storage that stores blobs in a Map */
function createMockGcsClient() {
  const blobs = new Map<string, { data: Uint8Array; contentType: string }>();

  const makeFile = (bucketName: string, fileName: string) => ({
    save: async (
      buffer: Buffer,
      options: { contentType: string; resumable: boolean },
    ) => {
      blobs.set(`${bucketName}/${fileName}`, {
        data: new Uint8Array(buffer),
        contentType: options.contentType,
      });
    },
    getMetadata: async () => {
      const entry = blobs.get(`${bucketName}/${fileName}`);
      if (!entry) {
        throw Object.assign(new Error('Not Found'), { code: 404 });
      }
      return [{ contentType: entry.contentType }];
    },
    download: async () => {
      const entry = blobs.get(`${bucketName}/${fileName}`);
      if (!entry) {
        throw Object.assign(new Error('Not Found'), { code: 404 });
      }
      return [Buffer.from(entry.data)];
    },
    delete: async () => {
      if (!blobs.has(`${bucketName}/${fileName}`)) {
        throw Object.assign(new Error('Not Found'), { code: 404 });
      }
      blobs.delete(`${bucketName}/${fileName}`);
    },
  });

  return {
    blobs,
    bucket: (name: string) => ({
      file: (fileName: string) => makeFile(name, fileName),
    }),
  };
}

describe('GcsBlobStore', () => {
  let store: GcsBlobStore;
  let mock: ReturnType<typeof createMockGcsClient>;

  beforeEach(() => {
    mock = createMockGcsClient();
    store = new GcsBlobStore({
      client: mock as never,
      bucket: 'test-bucket',
      prefix: 'assets/',
    });
  });

  it('should put and get a blob', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    await store.put('key1', data, 'application/octet-stream');

    const result = await store.get('key1');
    expect(result).not.toBeNull();
    expect(result!.data).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(result!.contentType).toBe('application/octet-stream');
  });

  it('should return null for missing key', async () => {
    const result = await store.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should delete a blob', async () => {
    await store.put('key1', new Uint8Array([1]), 'text/plain');
    await store.delete('key1');

    const result = await store.get('key1');
    expect(result).toBeNull();
  });

  it('should no-op when deleting a missing key', async () => {
    await expect(store.delete('nonexistent')).resolves.toBeUndefined();
  });

  it('should overwrite an existing blob', async () => {
    await store.put('key1', new Uint8Array([1, 2]), 'text/plain');
    await store.put('key1', new Uint8Array([3, 4, 5]), 'image/png');

    const result = await store.get('key1');
    expect(result!.data).toEqual(new Uint8Array([3, 4, 5]));
    expect(result!.contentType).toBe('image/png');
  });

  it('should round-trip binary data (256-byte sequence)', async () => {
    const data = new Uint8Array(256);
    for (let i = 0; i < 256; i++) data[i] = i;

    await store.put('binary', data, 'application/octet-stream');

    const result = await store.get('binary');
    expect(result!.data).toEqual(data);
  });

  it('should preserve contentType', async () => {
    await store.put('img', new Uint8Array([0xff]), 'image/jpeg');

    const result = await store.get('img');
    expect(result!.contentType).toBe('image/jpeg');
  });

  it('should apply key prefix', async () => {
    await store.put(
      'file.bin',
      new Uint8Array([1]),
      'application/octet-stream',
    );

    expect(mock.blobs.has('test-bucket/assets/file.bin')).toBe(true);
  });

  it('should work without prefix', async () => {
    const noPrefixStore = new GcsBlobStore({
      client: mock as never,
      bucket: 'test-bucket',
    });

    await noPrefixStore.put('bare-key', new Uint8Array([9]), 'text/plain');
    expect(mock.blobs.has('test-bucket/bare-key')).toBe(true);

    const result = await noPrefixStore.get('bare-key');
    expect(result!.data).toEqual(new Uint8Array([9]));
  });

  it('should propagate non-404 errors', async () => {
    const errorClient = {
      bucket: () => ({
        file: () => ({
          getMetadata: async () => {
            throw Object.assign(new Error('Permission denied'), { code: 403 });
          },
          download: async () => {
            throw Object.assign(new Error('Permission denied'), { code: 403 });
          },
          delete: async () => {
            throw Object.assign(new Error('Permission denied'), { code: 403 });
          },
        }),
      }),
    };

    const errorStore = new GcsBlobStore({
      client: errorClient as never,
      bucket: 'test-bucket',
    });

    await expect(errorStore.get('any')).rejects.toThrow('Permission denied');
    await expect(errorStore.delete('any')).rejects.toThrow('Permission denied');
  });
});
