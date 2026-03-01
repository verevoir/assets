import type { Storage } from '@google-cloud/storage';
import type { BlobStore, BlobData } from '../types.js';

/** Options for creating a GcsBlobStore */
export interface GcsBlobStoreOptions {
  /** Pre-configured Google Cloud Storage client */
  client: Storage;
  /** GCS bucket name */
  bucket: string;
  /** Optional key prefix, e.g. 'assets/' */
  prefix?: string;
}

/** BlobStore backed by Google Cloud Storage */
export class GcsBlobStore implements BlobStore {
  private client: Storage;
  private bucket: string;
  private prefix: string;

  constructor(options: GcsBlobStoreOptions) {
    this.client = options.client;
    this.bucket = options.bucket;
    this.prefix = options.prefix ?? '';
  }

  private resolveKey(key: string): string {
    return this.prefix + key;
  }

  private file(key: string) {
    return this.client.bucket(this.bucket).file(this.resolveKey(key));
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    await this.file(key).save(Buffer.from(data), {
      contentType,
      resumable: false,
    });
  }

  async get(key: string): Promise<BlobData | null> {
    try {
      const f = this.file(key);
      const [metadata] = await f.getMetadata();
      const [contents] = await f.download();
      return {
        data: new Uint8Array(contents),
        contentType:
          (metadata.contentType as string) ?? 'application/octet-stream',
      };
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: number }).code === 404
      ) {
        return null;
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.file(key).delete();
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: number }).code === 404
      ) {
        return;
      }
      throw err;
    }
  }
}
