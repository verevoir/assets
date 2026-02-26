import type { BlobStore, BlobData } from './types.js';

/** In-memory BlobStore backed by a Map. Stores defensive copies. */
export class MemoryBlobStore implements BlobStore {
  private blobs = new Map<string, BlobData>();

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    this.blobs.set(key, {
      data: new Uint8Array(data),
      contentType,
    });
  }

  async get(key: string): Promise<BlobData | null> {
    const entry = this.blobs.get(key);
    if (!entry) return null;
    return {
      data: new Uint8Array(entry.data),
      contentType: entry.contentType,
    };
  }

  async delete(key: string): Promise<void> {
    this.blobs.delete(key);
  }
}
