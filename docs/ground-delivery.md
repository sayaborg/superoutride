# Current GroundMap delivery and residency

This document owns the implemented paged transport, immutable payload store and admission controls.
[Image assets](image-assets.md#current-ground-compilation) owns compilation/encoding;
[content and gameplay](content-and-gameplay.md#groundmap-loading-and-handoff) owns browser readiness and
simulation scheduling. The future [whole-course loading](content-and-gameplay.md#course-loading)
contract replaces this path only after its tested cutover. Current limits are operational controls,
not approved smartphone or whole-browser budgets.

## Manifest and publication

The versioned product manifest binds source identity, compiler/target identity, input digest, finite
domain, lattice/LOD descriptors, palettes and an ordered page-to-payload directory. A page identifies
level and row range. A payload identifies immutable encoded bytes, byte length and digest. Palette
interpretation belongs to each manifest even when indexed payload bytes are shared. Packages bind to
manifest digests and all references stay inside the selected immutable deployment build.

The implemented `ground-map-pages` manifest v1 wraps the compiler directory without changing its
lattice or canonical byte order. Directory offsets describe compiler layout, not HTTP ranges.
Manifest SHA-256 identifies the package; payload filenames use encoded-byte digests. Publication
checks lengths/hashes and writes the manifest after payload completion. `build:ground` writes a
versioned `catalog.json` mapping source IDs to manifest digests.

Payloads are separately addressable `.bin.gz` files named by the digest of their decompressed encoded
bytes. Gzip reduces transfer/storage without changing encoded pixels or the reader lattice. The loader
explicitly decompresses them, independent of server Content-Encoding. The monolithic v1 asset remains
a regression input, not a second product loading mode. The workflow verifies public responses after
publishing; archive compression alone is not delivery evidence.

## HTTP session

`GroundMapHttpSession` binds to the module's `/build/<commit>/` root or coherent `/dist/` development
and compatibility build. It rejects redirects, partial responses, foreign-session assets and mismatched
digests. Bound compressed input, stream decompressed bytes into exact payload-sized buffers, serialize
manifest reads and enforce deadlines. Content-Length is not decoded byte length.

Session disposal aborts transport and invalidates readers. Consumer cancellation releases that
consumer's interest while admitted shared loads may finish. Loopback tests exercise real gzip HTTP;
the deployment verifier checks source bindings, sampled payloads and response headers at the published
SHA. Metadata, fetch/decompression internals and renderer buffers are separately budgeted.

## Shared payload store

One application-owned immutable store shares bytes among readers, lap views and consumers. Render
demand determines residency; physical actors do not acquire images merely by occupying a stage.
Frame preparation uses the same terrain lines, selector and footprints as drawing to resolve demand,
loads missing payloads asynchronously and pins the full set through presentation. Sampling is
synchronous, with no acquisition, decoding allocation or filtering inside a read.

The loader owns fetched buffers exclusively. Transfer detaches aliases before validation/publication.
APIs accepting caller-owned mutable bytes retain defensive copies. Concurrent requests for one
payload share a load. Eviction releases only unpinned entries; stale course requests cannot install
a reader into a new session. Application payload arrays are not exposed as mutable aliases.

`GroundMapPayloadStore` admits the entire requested set before I/O, shares in-flight loads by digest,
and evicts unpinned completed entries in least-recently-used order. Accounting is:

- `reservedBytes`: all admitted payload capacity, including resident bytes.
- `residentBytes`: published payload bytes.
- `pinnedBytes`: required payloads counted once.
- `loadingBytes`: two payload lengths reserved per concurrent transport/hash validation.

The first three counters overlap and are not summed. The transport returns an exact-size ArrayBuffer.
Network/decompressor internals are transport-owned costs outside these counters. Eviction clears bytes
from released lease objects so an old lease cannot retain evicted payload buffers.

Pending-acquisition cancellation releases consumer pins and cannot return a stale ready reader.
Admitted loads finish into the bounded cache even if every consumer cancels; reservations remain until
they settle. Successful frame leases require explicit release after drawing. Digest/length/transport
failures discard the entry and allow retry. A failed multi-payload acquisition releases all its pins.

Validate manifest-specific palette indices before exposing a ready reader. Shared bytes do not imply
shared palette interpretation. Frame readers share an immutable directory; `BakedGroundMapAsset` owns
both monolithic-test and resident-page metric lookup/decoding. Reads outside the resident lease or
after release fail explicitly, without fetching or substituting another image.

## Admission and failure

Current controls are 64 MiB resident encoded payloads, 8 MiB concurrent load/validation reservations,
4 MiB per manifest/catalog, and a 30-second request deadline. Compressed input is limited to twice
decoded payload length, with at least 1 KiB allowed. Compiler-owned working buffers are separately
specified in [image compilation](image-assets.md#current-ground-compilation).

Count shared payloads once and include simultaneous old/new frame pins plus incoming data. Metadata,
network/decoder buffers and the rest of the application are separate costs. A demand set that cannot
fit fails capacity admission. Required pages, resolution and geometry stay unchanged. Host RSS and
gzip sizes do not establish target-device budgets.

Missing data is an explicit readiness result before presentation. The browser lifecycle retains a
complete frame and suspends simulation/input/audio until ready, with retry/exit on failure. It does
not substitute grass, procedural paint or hidden coarse LODs. The lifecycle and no-catch-up rule are
owned by [content and gameplay](content-and-gameplay.md#groundmap-loading-and-handoff).

## Completed frame reads

Renderer input `ground` is a complete scene-local final-color reader. Source offsets, local shoulders
and junction paint are resolved by compilation. Geometry supplies projected ground bounds.
`collectDrivingGroundSamples` uses the same terrain preparation/footprints as drawing. Page assets
resolve levels/rows with the reader's existing selector and endpoint rule. Scene inputs remain fixed
between collection and presentation.

A synchronous resident hit keeps the running scheduler. A miss enters the explicit readiness
transaction before another frame is shown. Circuit mapping shares a single lap directory and payload
store; virtual geometry copies do not multiply image bytes. [Development](development.md#groundmap-migration-gates)
owns complete build, HTTP-frame, replacement, failure and device evidence.
