import { BakedGroundMapAsset, BakedGroundMapLayout, type BakedGroundMapMetadata } from './baked-ground-map.js';
import { groundMapDigest } from './ground-map-digest.js';
import type { GroundMapPayloadStore } from './ground-map-payload-store.js';

interface GroundMapBuildIdentity {
  readonly sourceId: string;
  readonly compilerId: string;
  readonly targetId: string;
  readonly inputSha256: string;
}

interface GroundMapPageManifest {
  readonly kind: 'ground-map-pages';
  readonly version: 1;
  readonly identity: GroundMapBuildIdentity;
  /** Compiler directory. Offsets describe canonical output ordering, not HTTP byte ranges. */
  readonly layout: BakedGroundMapMetadata;
}

interface GroundMapRowDemand {
  readonly level: number;
  readonly rowStart: number;
  readonly rowCount: number;
}

/** Transport version and compiler lattice version are independent; there is one metric directory. */
export function createGroundMapPageManifest(
  identity: GroundMapBuildIdentity,
  metadata: BakedGroundMapMetadata,
): GroundMapPageManifest {
  for (const id of [identity.sourceId, identity.compilerId, identity.targetId])
    if (typeof id !== 'string' || !id.trim()) throw new Error('GroundMap build identity is required');
  if (!/^[0-9a-f]{64}$/.test(identity.inputSha256)) throw new Error('GroundMap input digest is required');
  const layout = new BakedGroundMapLayout(metadata).metadata;
  for (const payload of layout.payloads)
    if (!/^[0-9a-f]{64}$/.test(payload.sha256)) throw new Error('invalid GroundMap payload digest');
  return Object.freeze({ kind: 'ground-map-pages', version: 1, identity: Object.freeze({ ...identity }), layout });
}

/** Decode only the manifest bound by the caller's immutable package digest. */
export async function decodeGroundMapPageManifest(
  bytes: Uint8Array<ArrayBuffer>,
  expectedSha256: string,
): Promise<GroundMapPageManifest> {
  // Caller-owned manifest input may change while digesting; validate and parse the same snapshot.
  const owned = Uint8Array.from(bytes);
  if ((await groundMapDigest(owned)) !== expectedSha256) throw new Error('GroundMap manifest digest mismatch');
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(owned)) as GroundMapPageManifest;
  if (manifest.kind !== 'ground-map-pages' || manifest.version !== 1)
    throw new Error('unsupported GroundMap page manifest');
  return createGroundMapPageManifest(manifest.identity, manifest.layout);
}

/** A page asset owns its interpretation; the application store owns shared encoded bytes. */
export class GroundMapPageAsset {
  readonly manifest: GroundMapPageManifest;
  readonly #layout: BakedGroundMapLayout;
  readonly #validatedPalettes = new Set<string>();

  constructor(manifest: GroundMapPageManifest) {
    if (manifest.kind !== 'ground-map-pages' || manifest.version !== 1)
      throw new Error('unsupported GroundMap page manifest');
    const validated = createGroundMapPageManifest(manifest.identity, manifest.layout);
    this.#layout = new BakedGroundMapLayout(validated.layout);
    this.manifest = Object.freeze({ ...validated, layout: this.#layout.metadata });
  }

  async acquire(store: GroundMapPayloadStore, demand: readonly GroundMapRowDemand[], signal?: AbortSignal) {
    const metadata = this.#layout.metadata;
    const ids = new Set<number>();
    for (const range of demand) {
      const level = metadata.levels[range.level];
      if (
        !Number.isInteger(range.level) ||
        !level ||
        !Number.isSafeInteger(range.rowStart) ||
        !Number.isSafeInteger(range.rowCount) ||
        range.rowStart < 0 ||
        range.rowCount <= 0 ||
        range.rowStart + range.rowCount > level.chainageTexels
      )
        throw new RangeError('GroundMap row demand outside level');
      const end = range.rowStart + range.rowCount;
      for (const chunk of level.chunks) {
        if (chunk.rowStart >= end) break;
        if (chunk.rowStart + chunk.rowCount > range.rowStart) ids.add(chunk.payloadId);
      }
    }
    const lease = await store.acquire(
      [...ids].map((id) => metadata.payloads[id]!),
      signal,
    );
    try {
      for (const id of ids) {
        const payload = metadata.payloads[id]!;
        if (payload.format !== 'palette8' || this.#validatedPalettes.has(payload.sha256)) continue;
        for (let offset = 0; offset < payload.byteLength; offset++)
          if (lease.readByte(payload.sha256, offset) >= metadata.paletteRgba.length)
            throw new Error('GroundMap payload index outside manifest palette');
        this.#validatedPalettes.add(payload.sha256);
      }
      return Object.freeze({
        reader: new BakedGroundMapAsset(this.#layout, {
          readByte: (id, offset) => lease.readByte(metadata.payloads[id]!.sha256, offset),
        }),
        release: () => lease.release(),
      });
    } catch (error) {
      lease.release();
      throw error;
    }
  }
}
