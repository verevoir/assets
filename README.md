# @nextlake/assets

Asset management for NextLake — a pluggable BlobStore interface for binary data, metadata persistence via StorageAdapter, and automatic dimension extraction via Sharp.

## What It Does

- **BlobStore** — pluggable interface for binary storage (put/get/delete). Ships with `MemoryBlobStore`; S3/R2 implementations follow later.
- **AssetManager** — orchestrates `StorageAdapter` (metadata) + `BlobStore` (binary data) for upload, download, get, delete, list, and updateMetadata operations.
- **Metadata Extraction** — reads pixel dimensions from bitmap images via Sharp on upload. SVG and video get null dimensions.
- **Hotspot** — mutable focal point (0–1 range) for smart cropping. Set via `updateMetadata()`.

## Install

```bash
npm install @nextlake/assets
```

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
  data: imageBuffer,
  filename: 'hero.jpg',
  contentType: 'image/jpeg',
  createdBy: 'user-1',
});
// asset.width → 1920, asset.height → 1080

// Set a hotspot
await manager.updateMetadata(asset.id, {
  hotspot: { x: 0.5, y: 0.3 },
});

// Download
const result = await manager.download(asset.id);
// result.asset — metadata, result.data — Uint8Array

// List
const assets = await manager.list({ limit: 10 });

// Delete
await manager.delete(asset.id);
```

## API

### AssetManager

| Method | Description |
|--------|-------------|
| `upload(input)` | Store binary data + create metadata. Extracts dimensions for bitmap images. |
| `get(id)` | Retrieve asset metadata by ID, or `null`. |
| `download(id)` | Retrieve metadata + binary data, or `null`. |
| `delete(id)` | Delete both blob and metadata. Throws if not found. |
| `list(options?)` | List assets with optional filtering, sorting, pagination. |
| `updateMetadata(id, update)` | Update mutable fields (hotspot, filename). Throws if not found. |

### Asset Record

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier |
| `filename` | `string` | Original filename (mutable via updateMetadata) |
| `contentType` | `string` | MIME type |
| `size` | `number` | Byte size |
| `blobKey` | `string` | Key in the BlobStore |
| `createdBy` | `string` | Uploader identity |
| `type` | `'image' \| 'video'` | Derived from MIME prefix |
| `format` | `'bitmap' \| 'vector'` | SVG → vector, everything else → bitmap |
| `width` | `number \| null` | Pixel width (null for SVG/video) |
| `height` | `number \| null` | Pixel height (null for SVG/video) |
| `hotspot` | `Hotspot \| null` | Focal point `{ x: 0–1, y: 0–1 }` |
| `createdAt` | `Date` | Creation timestamp |
| `updatedAt` | `Date` | Last update timestamp |

## Architecture

| File | Responsibility |
|------|---------------|
| `src/types.ts` | Core interfaces: BlobStore, Asset, Hotspot, AssetMetadataUpdate, UploadInput, DownloadResult |
| `src/metadata.ts` | `extractMetadata()` — Sharp-based dimension extraction for bitmap images |
| `src/memory.ts` | `MemoryBlobStore` — Map-based in-memory blob storage with defensive copies |
| `src/manager.ts` | `AssetManager` — orchestrates StorageAdapter + BlobStore for asset CRUD |
| `src/index.ts` | Public API exports |

## Design Decisions

- **Blob before metadata** — orphaned blob is recoverable; orphaned metadata is not.
- **Blob-immutable, metadata-mutable** — binary data never changes. Hotspot and filename can be updated.
- **Sharp for extraction only** — reads dimensions on upload; never used for runtime resizing.
- **Null dimensions for video and SVG** — video would need ffprobe; SVG has no inherent pixel size.
- **`Uint8Array` not `Buffer`** — more portable across environments.

## Development

```bash
npm install    # Install dependencies
make build     # Compile TypeScript
make test      # Run test suite
make lint      # Check formatting
```
