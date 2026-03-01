import { describe, it, expect, beforeEach } from 'vitest';
import { S3BlobStore } from '../src/s3/blob-store.js';

/** Minimal mock of S3Client that stores blobs in a Map */
function createMockS3Client() {
  const blobs = new Map<string, { data: Uint8Array; contentType: string }>();

  return {
    blobs,
    send: async (command: unknown) => {
      const cmd = command as {
        constructor: { name: string };
        input: {
          Bucket: string;
          Key: string;
          Body?: Uint8Array;
          ContentType?: string;
        };
      };
      const name = cmd.constructor.name;
      const key = `${cmd.input.Bucket}/${cmd.input.Key}`;

      if (name === 'PutObjectCommand') {
        blobs.set(key, {
          data: new Uint8Array(cmd.input.Body!),
          contentType: cmd.input.ContentType!,
        });
        return {};
      }

      if (name === 'GetObjectCommand') {
        const entry = blobs.get(key);
        if (!entry) {
          const err = new Error('NoSuchKey');
          err.name = 'NoSuchKey';
          throw err;
        }
        return {
          Body: {
            transformToByteArray: async () => new Uint8Array(entry.data),
          },
          ContentType: entry.contentType,
        };
      }

      if (name === 'DeleteObjectCommand') {
        blobs.delete(key);
        return {};
      }

      throw new Error(`Unknown command: ${name}`);
    },
  };
}

describe('S3BlobStore', () => {
  let store: S3BlobStore;
  let mock: ReturnType<typeof createMockS3Client>;

  beforeEach(() => {
    mock = createMockS3Client();
    store = new S3BlobStore({
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

    // The mock stores with bucket/prefix+key
    expect(mock.blobs.has('test-bucket/assets/file.bin')).toBe(true);
  });

  it('should work without prefix', async () => {
    const noPrefixStore = new S3BlobStore({
      client: mock as never,
      bucket: 'test-bucket',
    });

    await noPrefixStore.put('bare-key', new Uint8Array([9]), 'text/plain');
    expect(mock.blobs.has('test-bucket/bare-key')).toBe(true);

    const result = await noPrefixStore.get('bare-key');
    expect(result!.data).toEqual(new Uint8Array([9]));
  });

  it('should propagate non-NoSuchKey errors', async () => {
    const errorClient = {
      send: async () => {
        const err = new Error('AccessDenied');
        err.name = 'AccessDenied';
        throw err;
      },
    };

    const errorStore = new S3BlobStore({
      client: errorClient as never,
      bucket: 'test-bucket',
    });

    await expect(errorStore.get('any')).rejects.toThrow('AccessDenied');
  });
});
