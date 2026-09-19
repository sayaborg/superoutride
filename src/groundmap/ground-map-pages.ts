import { selectGroundMapLevel } from './ground-map-lod.js';
import {
  BakedGroundMapAsset,
  BakedGroundMapLayout,
  bakedGroundMapRowIndex,
  type BakedGroundMapMetadata,
} from './baked-ground-map.js';
import { contentDigest } from '../core/content-digest.js';
import type { GroundMapPayloadLease, GroundMapPayloadStore } from './ground-map-payload-store.js';

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
  if ((await contentDigest(owned)) !== expectedSha256) throw new Error('GroundMap manifest digest mismatch');
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

  /** Feed the same chainage/footprint samples used for painting; entire lateral rows are stored together. */
  rowDemand(samples: Iterable<{ readonly s: number; readonly deltaSEffective: number }>): GroundMapRowDemand[] {
    const metadata = this.#layout.metadata;
    const levels = new Map<number, Set<number>>();
    for (const sample of samples) {
      const level = selectGroundMapLevel(sample.deltaSEffective, metadata.qSAuthority, metadata.kMax);
      const row = bakedGroundMapRowIndex(metadata, level, sample.s);
      if (!levels.has(level)) levels.set(level, new Set());
      levels.get(level)!.add(row);
    }
    const demand: GroundMapRowDemand[] = [];
    for (const [level, rows] of [...levels].sort((a, b) => a[0] - b[0])) {
      let first = -1;
      let last = -1;
      for (const row of [...rows].sort((a, b) => a - b)) {
        if (row === last + 1 && first >= 0) {
          last = row;
          continue;
        }
        if (first >= 0) demand.push({ level, rowStart: first, rowCount: last - first + 1 });
        first = last = row;
      }
      if (first >= 0) demand.push({ level, rowStart: first, rowCount: last - first + 1 });
    }
    return demand;
  }

  #payloadIds(demand: readonly GroundMapRowDemand[]) {
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
    return ids;
  }

  /** Adjacent storage chunks are an optional lookahead, never a predicted route or changed LOD. */
  adjacentDemand(demand: readonly GroundMapRowDemand[]): GroundMapRowDemand[] {
    this.#payloadIds(demand); // Apply the same finite-domain validation as required frame demand.
    const required = new Map<number, Set<number>>();
    for (const range of demand) {
      const indices = required.get(range.level) ?? new Set<number>();
      required.set(range.level, indices);
      const chunks = this.#layout.metadata.levels[range.level]!.chunks;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        if (chunk.rowStart >= range.rowStart + range.rowCount) break;
        if (chunk.rowStart + chunk.rowCount > range.rowStart) indices.add(i);
      }
    }
    const result: GroundMapRowDemand[] = [];
    for (const [level, indices] of required) {
      const chunks = this.#layout.metadata.levels[level]!.chunks;
      const adjacent = new Set<number>();
      for (const index of indices)
        for (const neighbor of [index - 1, index + 1]) {
          if (chunks[neighbor] && !indices.has(neighbor)) adjacent.add(neighbor);
        }
      for (const index of [...adjacent].sort((a, b) => a - b)) {
        const { rowStart, rowCount } = chunks[index]!;
        result.push({ level, rowStart, rowCount });
      }
    }
    return result;
  }

  async acquire(store: GroundMapPayloadStore, demand: readonly GroundMapRowDemand[], signal?: AbortSignal) {
    const ids = this.#payloadIds(demand);
    const lease = await store.acquire(
      [...ids].map((id) => this.#layout.metadata.payloads[id]!),
      signal,
    );
    return this.#frame(ids, lease);
  }

  tryAcquire(store: GroundMapPayloadStore, demand: readonly GroundMapRowDemand[]) {
    const ids = this.#payloadIds(demand);
    const lease = store.tryAcquire([...ids].map((id) => this.#layout.metadata.payloads[id]!));
    return lease ? this.#frame(ids, lease) : null;
  }

  #frame(ids: Set<number>, lease: GroundMapPayloadLease) {
    const metadata = this.#layout.metadata;
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
