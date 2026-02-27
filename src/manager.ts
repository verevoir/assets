import type { Document, StorageAdapter } from '@nextlake/storage';
import type {
  Asset,
  AssetFormat,
  AssetManagerOptions,
  AssetType,
  BlobStore,
  DownloadResult,
  ListOptions,
  UploadInput,
} from './types.js';

const BLOCK_TYPE = 'asset';

interface AssetData {
  filename: string;
  contentType: string;
  size: number;
  blobKey: string;
  createdBy: string;
  type: AssetType;
  format: AssetFormat;
}

function documentToAsset(doc: Document): Asset {
  const data = doc.data as unknown as AssetData;
  return {
    id: doc.id,
    filename: data.filename,
    contentType: data.contentType,
    size: data.size,
    blobKey: data.blobKey,
    createdBy: data.createdBy,
    type: data.type,
    format: data.format,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Orchestrates StorageAdapter (metadata) and BlobStore (binary data) for asset management. */
export class AssetManager {
  private storage: StorageAdapter;
  private blobStore: BlobStore;

  constructor(options: AssetManagerOptions) {
    this.storage = options.storage;
    this.blobStore = options.blobStore;
  }

  /** Upload binary data and create an asset metadata record. */
  async upload(input: UploadInput): Promise<Asset> {
    if (!input.filename) {
      throw new Error('filename is required');
    }
    if (!input.contentType) {
      throw new Error('contentType is required');
    }
    if (!input.data || input.data.length === 0) {
      throw new Error('data must not be empty');
    }
    if (!input.createdBy) {
      throw new Error('createdBy is required');
    }

    const [mimePrefix] = input.contentType.split('/');
    if (mimePrefix !== 'image' && mimePrefix !== 'video') {
      throw new Error(
        `Unsupported contentType: ${input.contentType}. Must be image/* or video/*.`,
      );
    }

    const type: AssetType = mimePrefix;
    const format: AssetFormat =
      input.contentType === 'image/svg+xml' ? 'vector' : 'bitmap';

    const blobKey = crypto.randomUUID();

    await this.blobStore.put(blobKey, input.data, input.contentType);

    let doc: Document;
    try {
      doc = await this.storage.create(BLOCK_TYPE, {
        filename: input.filename,
        contentType: input.contentType,
        size: input.data.length,
        blobKey,
        createdBy: input.createdBy,
        type,
        format,
      });
    } catch (err) {
      await this.blobStore.delete(blobKey);
      throw err;
    }

    return documentToAsset(doc);
  }

  /** Retrieve asset metadata by ID, or null if not found. */
  async get(id: string): Promise<Asset | null> {
    const doc = await this.storage.get(id);
    if (!doc) return null;
    return documentToAsset(doc);
  }

  /** Download an asset's binary data along with its metadata, or null if not found. */
  async download(id: string): Promise<DownloadResult | null> {
    const doc = await this.storage.get(id);
    if (!doc) return null;

    const asset = documentToAsset(doc);
    const blob = await this.blobStore.get(asset.blobKey);
    if (!blob) return null;

    return { asset, data: blob.data };
  }

  /** Delete an asset's binary data and metadata record. */
  async delete(id: string): Promise<void> {
    const doc = await this.storage.get(id);
    if (!doc) {
      throw new Error(`Asset not found: ${id}`);
    }

    const assetData = doc.data as unknown as AssetData;
    await this.blobStore.delete(assetData.blobKey);
    await this.storage.delete(id);
  }

  /** List asset metadata records with optional filtering, sorting, and pagination. */
  async list(options?: ListOptions): Promise<Asset[]> {
    const docs = await this.storage.list(BLOCK_TYPE, options);
    return docs.map((doc) => documentToAsset(doc));
  }
}
