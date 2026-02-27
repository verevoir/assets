import type { StorageAdapter, ListOptions } from '@nextlake/storage';

export type { ListOptions };

/** Media category derived from contentType MIME prefix */
export type AssetType = 'image' | 'video';

/** Whether the asset is bitmap or vector, derived from contentType */
export type AssetFormat = 'bitmap' | 'vector';

/** Binary data returned from a BlobStore */
export interface BlobData {
  data: Uint8Array;
  contentType: string;
}

/** Pluggable interface for binary storage */
export interface BlobStore {
  /** Store binary data under the given key */
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;

  /** Retrieve binary data by key, or null if not found */
  get(key: string): Promise<BlobData | null>;

  /** Delete binary data by key. No-op if the key does not exist. */
  delete(key: string): Promise<void>;
}

/** Asset metadata record */
export interface Asset {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  blobKey: string;
  createdBy: string;
  type: AssetType;
  format: AssetFormat;
  createdAt: Date;
  updatedAt: Date;
}

/** Options for constructing an AssetManager */
export interface AssetManagerOptions {
  storage: StorageAdapter;
  blobStore: BlobStore;
}

/** Input for uploading an asset */
export interface UploadInput {
  data: Uint8Array;
  filename: string;
  contentType: string;
  createdBy: string;
}

/** Result of downloading an asset */
export interface DownloadResult {
  asset: Asset;
  data: Uint8Array;
}
