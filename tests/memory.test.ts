import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryBlobStore } from '../src/memory.js';

describe('MemoryBlobStore', () => {
  let store: MemoryBlobStore;

  beforeEach(() => {
    store = new MemoryBlobStore();
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

  it('should store a defensive copy on put', async () => {
    const data = new Uint8Array([1, 2, 3]);
    await store.put('key1', data, 'text/plain');

    // Mutate the original
    data[0] = 99;

    const result = await store.get('key1');
    expect(result!.data[0]).toBe(1);
  });

  it('should return a defensive copy on get', async () => {
    await store.put('key1', new Uint8Array([1, 2, 3]), 'text/plain');

    const result1 = await store.get('key1');
    result1!.data[0] = 99;

    const result2 = await store.get('key1');
    expect(result2!.data[0]).toBe(1);
  });

  it('should round-trip binary data correctly', async () => {
    const data = new Uint8Array(256);
    for (let i = 0; i < 256; i++) data[i] = i;

    await store.put('binary', data, 'application/octet-stream');

    const result = await store.get('binary');
    expect(result!.data).toEqual(data);
  });
});
