# @nextlake/assets — Asset Management

Asset management for NextLake — BlobStore interface for binary data, AssetManager for orchestrating uploads/downloads with metadata persistence via StorageAdapter, and automatic dimension extraction via Sharp.

## What It Does

- **BlobStore** — pluggable interface for binary storage (put/get/delete). Ships with `MemoryBlobStore`, `S3BlobStore` (via `@nextlake/assets/s3`), and `GcsBlobStore` (via `@nextlake/assets/gcs`).
- **AssetManager** — orchestrates `StorageAdapter` (metadata) + `BlobStore` (binary data) for upload, download, get, delete, list, and updateMetadata operations.
- **Metadata Extraction** — `extractMetadata()` reads pixel dimensions from bitmap images via Sharp on upload. SVG and video get null dimensions.
- **Asset type** — metadata record: id, filename, contentType, size, blobKey, createdBy, type, format, width, height, hotspot, createdAt, updatedAt.

## Design Principles

- **Blob before metadata** — orphaned blob (no metadata) is recoverable; orphaned metadata (no blob) is not
- **Blob-immutable, metadata-mutable** — binary data never changes after upload. Mutable fields (hotspot, filename) can be updated via `updateMetadata()`. Blob-derived fields (size, contentType, width, height, type, format, createdBy) are immutable.
- **`Uint8Array` not `Buffer`** — more portable; `Buffer` extends `Uint8Array` so it still works
- **Defensive copies** — `MemoryBlobStore` copies data on put and get to prevent external mutation
- **Safe delete** — `BlobStore.delete()` is a no-op for missing keys (different from `StorageAdapter.delete()` which throws)
- **Sharp for extraction only** — Sharp reads dimensions on upload; it is never used for runtime resizing. imgproxy handles resizing at serve time.
- **Null dimensions for video and SVG** — Video would need ffprobe (out of scope). SVG is vector and has no inherent pixel dimensions.

## Quick Example

```typescript
import { AssetManager, MemoryBlobStore } from '@nextlake/assets';
import { MemoryAdapter } from '@nextlake/storage';

const storage = new MemoryAdapter();
const blobStore = new MemoryBlobStore();

await storage.connect();

const manager = new AssetManager({ storage, blobStore });

// Upload — dimensions extracted automatically
const asset = await manager.upload({
  data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  filename: 'logo.png',
  contentType: 'image/png',
  createdBy: 'user-1',
});
// asset.width, asset.height populated for bitmap images

// Set hotspot
const updated = await manager.updateMetadata(asset.id, {
  hotspot: { x: 0.5, y: 0.3 },
});

// Download
const result = await manager.download(asset.id);
// result.asset — metadata
// result.data — Uint8Array

// List
const assets = await manager.list({ limit: 10 });

// Delete
await manager.delete(asset.id);
```

## Setup

```bash
npm install
```

## Commands

```bash
make build   # Compile TypeScript
make test    # Run test suite
make lint    # Lint and check formatting
make run     # No-op (library, not a service)
```

## Architecture

- `src/types.ts` — Core interfaces: BlobStore, BlobData, Asset, Hotspot, AssetMetadataUpdate, AssetManagerOptions, UploadInput, DownloadResult. Re-exports ListOptions.
- `src/metadata.ts` — `extractMetadata()` — Sharp-based dimension extraction for bitmap images. Dynamic import keeps Sharp server-side only.
- `src/memory.ts` — `MemoryBlobStore` — Map-based in-memory blob storage with defensive copies.
- `src/s3/blob-store.ts` — `S3BlobStore` — BlobStore backed by Amazon S3 (or S3-compatible). Accepts pre-configured `S3Client`, bucket, optional prefix.
- `src/gcs/blob-store.ts` — `GcsBlobStore` — BlobStore backed by Google Cloud Storage. Accepts pre-configured `Storage` client, bucket, optional prefix.
- `src/manager.ts` — `AssetManager` — orchestrates StorageAdapter + BlobStore for asset CRUD + updateMetadata.
- `src/index.ts` — Public API exports.
- `src/s3.ts` — Subpath entry point (`@nextlake/assets/s3`).
- `src/gcs.ts` — Subpath entry point (`@nextlake/assets/gcs`).

## Dependencies

- **Runtime:** `@nextlake/storage` v0.2.0 — for StorageAdapter, Document, ListOptions types
- **Runtime:** `sharp` ^0.33.0 — image metadata extraction (dimensions)
- **Optional peer:** `@aws-sdk/client-s3` ^3.0.0 — required only when using `S3BlobStore`
- **Optional peer:** `@google-cloud/storage` ^7.0.0 — required only when using `GcsBlobStore`
- **No** dependency on `@nextlake/schema`
