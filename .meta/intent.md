# Intent — @nextlake/assets

## Purpose

Manage binary assets (images, videos, documents) alongside structured content. Assets need different handling from content — binary storage, metadata extraction, immutability rules — so they get their own package rather than being bolted onto the storage adapter.

## Goals

- Pluggable binary storage via the BlobStore interface — swap between memory, S3, R2, or local disk
- Orchestrate the two-part nature of assets: binary data (blob) + metadata (document)
- Extract useful metadata (dimensions, format) automatically on upload
- Keep the API surface small: upload, get, download, delete, list, updateMetadata

## Non-goals

- Resize or transform images at runtime — that is imgproxy's job (via the media package)
- Display assets — that is the media package's concern
- Provide a CDN or blob server — the developer runs their own
- Support every image library — Sharp is the extraction tool; it is not used for processing

## Key design decisions

- **BlobStore as an interface.** Binary storage varies wildly (memory, filesystem, S3, R2). An interface lets the developer plug in whatever they use. MemoryBlobStore ships for development and testing.
- **Blob-immutable, metadata-mutable.** Binary data never changes after upload — this simplifies caching, CDN invalidation, and integrity. Mutable fields (hotspot, filename) live in metadata and can be updated without touching the blob.
- **Blob before metadata.** On upload, the blob is stored first, then metadata is created. An orphaned blob (no metadata) is recoverable; an orphaned metadata record (no blob) is not. If metadata creation fails, the blob is cleaned up.
- **Sharp for extraction only.** Sharp reads dimensions on upload so the media package can build correct resize URLs. It is never used for runtime image processing — that would couple the server to Sharp's native dependencies.
- **`Uint8Array` over `Buffer`.** More portable across environments. `Buffer` extends `Uint8Array` so Node callers still work transparently.

## Constraints

- Depends on `@nextlake/storage` for metadata persistence (assets are stored as documents with `blockType='asset'`)
- Depends on `sharp` for dimension extraction (dynamic import, graceful failure if unavailable)
- No dependency on `@nextlake/schema` — asset metadata shape is internal, not defined via the schema engine
