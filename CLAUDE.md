# @nextlake/assets — Asset Management

Asset management for NextLake — BlobStore interface for binary data, AssetManager for orchestrating uploads/downloads with metadata persistence via StorageAdapter.

## What It Does

- **BlobStore** — pluggable interface for binary storage (put/get/delete). Ships with `MemoryBlobStore`; S3/R2 implementations follow later.
- **AssetManager** — orchestrates `StorageAdapter` (metadata) + `BlobStore` (binary data) for upload, download, get, delete, and list operations.
- **Asset type** — metadata record: id, filename, contentType, size, blobKey, createdAt, updatedAt.

## Design Principles

- **Blob before metadata** — orphaned blob (no metadata) is recoverable; orphaned metadata (no blob) is not
- **Immutable assets** — upload new, delete old. No update method in v1.
- **`Uint8Array` not `Buffer`** — more portable; `Buffer` extends `Uint8Array` so it still works
- **Defensive copies** — `MemoryBlobStore` copies data on put and get to prevent external mutation
- **Safe delete** — `BlobStore.delete()` is a no-op for missing keys (different from `StorageAdapter.delete()` which throws)

## Quick Example

```typescript
import { AssetManager, MemoryBlobStore } from '@nextlake/assets';
import { MemoryAdapter } from '@nextlake/storage';

const storage = new MemoryAdapter();
const blobStore = new MemoryBlobStore();

await storage.connect();

const manager = new AssetManager({ storage, blobStore });

// Upload
const asset = await manager.upload({
  data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  filename: 'logo.png',
  contentType: 'image/png',
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

- `src/types.ts` — Core interfaces: BlobStore, BlobData, Asset, AssetManagerOptions, UploadInput, DownloadResult. Re-exports ListOptions.
- `src/memory.ts` — `MemoryBlobStore` — Map-based in-memory blob storage with defensive copies.
- `src/manager.ts` — `AssetManager` — orchestrates StorageAdapter + BlobStore for asset CRUD.
- `src/index.ts` — Public API exports.

## Dependencies

- **Runtime:** `@nextlake/storage` v0.2.0 — for StorageAdapter, Document, ListOptions types
- **No** dependency on `@nextlake/schema`
