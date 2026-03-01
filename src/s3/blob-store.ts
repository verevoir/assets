import type {
  S3Client,
  PutObjectCommandInput,
  GetObjectCommandInput,
  DeleteObjectCommandInput,
} from '@aws-sdk/client-s3';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { BlobStore, BlobData } from '../types.js';

/** Options for creating an S3BlobStore */
export interface S3BlobStoreOptions {
  /** Pre-configured S3Client instance */
  client: S3Client;
  /** S3 bucket name */
  bucket: string;
  /** Optional key prefix, e.g. 'assets/' */
  prefix?: string;
}

/** BlobStore backed by Amazon S3 (or any S3-compatible service) */
export class S3BlobStore implements BlobStore {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(options: S3BlobStoreOptions) {
    this.client = options.client;
    this.bucket = options.bucket;
    this.prefix = options.prefix ?? '';
  }

  private resolveKey(key: string): string {
    return this.prefix + key;
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    const input: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: this.resolveKey(key),
      Body: data,
      ContentType: contentType,
    };
    await this.client.send(new PutObjectCommand(input));
  }

  async get(key: string): Promise<BlobData | null> {
    try {
      const input: GetObjectCommandInput = {
        Bucket: this.bucket,
        Key: this.resolveKey(key),
      };
      const response = await this.client.send(new GetObjectCommand(input));
      const bytes = await response.Body!.transformToByteArray();
      return {
        data: new Uint8Array(bytes),
        contentType: response.ContentType ?? 'application/octet-stream',
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'NoSuchKey') {
        return null;
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const input: DeleteObjectCommandInput = {
      Bucket: this.bucket,
      Key: this.resolveKey(key),
    };
    await this.client.send(new DeleteObjectCommand(input));
  }
}
